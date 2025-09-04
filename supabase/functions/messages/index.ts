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
      case 'POST:send':
        return await handleSendMessage(req, supabase, user.id);
      case 'GET:list':
        return await handleListMessages(req, supabase, user.id);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Messages function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleSendMessage(req: Request, supabase: any, userId: string) {
  const { room_id, envelope, ciphertext, signer_fpr, content_type = 'text' } = await req.json();
  
  if (!room_id || !envelope || !ciphertext || !signer_fpr) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verify user has a device in this room
  const { data: membership } = await supabase
    .from('room_members')
    .select('device_id, devices!inner(fingerprint, user_id)')
    .eq('room_id', room_id)
    .eq('devices.user_id', userId)
    .eq('devices.fingerprint', signer_fpr)
    .single();

  if (!membership) {
    return new Response(JSON.stringify({ error: 'Not authorized to send messages in this room' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Convert ciphertext from base64 to bytea if needed
  const ciphertextBuffer = typeof ciphertext === 'string' 
    ? new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)))
    : ciphertext;

  // Insert message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      room_id,
      author_device_id: membership.device_id,
      envelope: typeof envelope === 'string' ? JSON.parse(envelope) : envelope,
      ciphertext: ciphertextBuffer,
      signer_fpr,
      content_type
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting message:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ message_id: message.id, message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleListMessages(req: Request, supabase: any, userId: string) {
  const url = new URL(req.url);
  const room_id = url.searchParams.get('room_id');
  const since = url.searchParams.get('since');
  
  if (!room_id) {
    return new Response(JSON.stringify({ error: 'room_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

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
    return new Response(JSON.stringify({ error: 'Not authorized to view messages in this room' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Fetch messages
  let query = supabase
    .from('messages')
    .select(`
      id,
      envelope,
      ciphertext,
      signer_fpr,
      content_type,
      created_at,
      author_device_id,
      devices!messages_author_device_id_fkey(fingerprint, label, user_id),
      attachments(id, storage_path, size, mime_type, sha256)
    `)
    .eq('room_id', room_id)
    .order('created_at', { ascending: true });

  if (since) {
    query = query.gt('created_at', since);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error('Error fetching messages:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ messages }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}