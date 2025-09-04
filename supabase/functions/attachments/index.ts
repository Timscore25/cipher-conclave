import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    switch (`${req.method}:${action}`) {
      case 'POST:signUrl':
        return await handleSignUrl(req, supabase, user.id);
      case 'POST:create':
        return await handleCreateAttachment(req, supabase, user.id);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Attachments function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleSignUrl(req: Request, supabase: any, userId: string) {
  const { storage_path, action = 'download' } = await req.json();
  
  if (!storage_path) {
    return new Response(JSON.stringify({ error: 'storage_path required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Extract room_id from storage path (format: roomId/messageId/filename.bin)
  const pathParts = storage_path.split('/');
  if (pathParts.length < 2) {
    return new Response(JSON.stringify({ error: 'Invalid storage path' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const room_id = pathParts[0];

  // Verify user is member of room
  const { data: membership } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('room_id', room_id)
    .in('device_id', 
      supabase.from('devices').select('id').eq('user_id', userId)
    )
    .limit(1)
    .single();

  if (!membership) {
    return new Response(JSON.stringify({ error: 'Not authorized to access attachment' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Create signed URL
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(storage_path, 3600); // 1 hour expiry

  if (error) {
    console.error('Error creating signed URL:', error);
    return new Response(JSON.stringify({ error: 'Failed to create signed URL' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ signed_url: data.signedUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleCreateAttachment(req: Request, supabase: any, userId: string) {
  const { message_id, storage_path, size, mime_type, sha256 } = await req.json();
  
  if (!message_id || !storage_path || !size || !mime_type || !sha256) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verify message exists and user authored it
  const { data: message } = await supabase
    .from('messages')
    .select(`
      id,
      room_id,
      devices!messages_author_device_id_fkey(user_id)
    `)
    .eq('id', message_id)
    .eq('devices.user_id', userId)
    .single();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message not found or not authorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Insert attachment record
  const { data: attachment, error } = await supabase
    .from('attachments')
    .insert({
      message_id,
      storage_path,
      size,
      mime_type,
      sha256
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating attachment:', error);
    return new Response(JSON.stringify({ error: 'Failed to create attachment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ attachment }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}