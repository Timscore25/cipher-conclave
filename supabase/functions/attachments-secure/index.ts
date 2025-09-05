import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (req.method === 'POST' && action === 'signUrl') {
      return await handleSignUrl(req, supabase, user.id);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('Function error:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
});

async function handleSignUrl(req: Request, supabase: any, userId: string) {
  try {
    const { storage_path } = await req.json();

    if (!storage_path || typeof storage_path !== 'string') {
      return new Response('Invalid storage_path', { status: 400, headers: corsHeaders });
    }

    // Extract room_id from storage path format: roomId/messageId/filename.bin
    const pathParts = storage_path.split('/');
    if (pathParts.length < 2) {
      return new Response('Invalid storage path format', { status: 400, headers: corsHeaders });
    }

    const roomId = pathParts[0];
    const messageId = pathParts[1];

    // Verify user has access to this room through their devices
    const { data: membership, error: membershipError } = await supabase
      .from('room_members')
      .select(`
        room_id,
        devices!inner(
          user_id
        )
      `)
      .eq('room_id', roomId)
      .eq('devices.user_id', userId)
      .single();

    if (membershipError || !membership) {
      console.log('Access denied - not a room member:', { userId, roomId, error: membershipError });
      return new Response('Access denied - not a room member', { status: 403, headers: corsHeaders });
    }

    // Additional verification: check if the message exists and is in this room
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, room_id')
      .eq('id', messageId)
      .eq('room_id', roomId)
      .single();

    if (messageError || !message) {
      console.log('Message not found or access denied:', { messageId, roomId, error: messageError });
      return new Response('Message not found or access denied', { status: 404, headers: corsHeaders });
    }

    // Generate short-lived signed URL (60 seconds for security)
    const { data: signedUrl, error: signError } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storage_path, 60);

    if (signError) {
      console.error('Failed to create signed URL:', signError);
      return new Response('Failed to create signed URL', { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ signedUrl: signedUrl.signedUrl }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('handleSignUrl error:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}