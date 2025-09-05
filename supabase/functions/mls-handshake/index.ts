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
      console.error('Auth error:', authError);
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (req.method === 'POST' && action === 'send') {
      return await handleSendHandshake(req, supabase, user.id);
    } else if (req.method === 'GET' && action === 'list') {
      return await handleListHandshakes(req, supabase, user.id);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('Function error:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
});

async function handleSendHandshake(req: Request, supabase: any, userId: string) {
  try {
    const {
      group_id,
      epoch,
      message_type,
      message_data,
      local_seq_id
    } = await req.json();

    // Validate required fields
    if (!group_id || epoch === undefined || !message_type || !message_data) {
      return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }

    // Get sender device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (deviceError || !device) {
      console.error('Device lookup error:', deviceError);
      return new Response('Device not found', { status: 404, headers: corsHeaders });
    }

    // Convert base64 strings to bytea format for PostgreSQL
    const groupIdBytes = `\\x${Buffer.from(group_id, 'base64').toString('hex')}`;
    const messageDataBytes = `\\x${Buffer.from(message_data, 'base64').toString('hex')}`;

    // Insert handshake message with idempotency check
    const { data: message, error: insertError } = await supabase
      .from('mls_handshake_messages')
      .insert({
        group_id: groupIdBytes,
        epoch,
        sender_device_id: device.id,
        message_type,
        message_data: messageDataBytes,
        local_seq_id,
      })
      .select('*')
      .single();

    if (insertError) {
      // Check if it's a duplicate (idempotency)
      if (insertError.code === '23505') { // unique_violation
        console.log('Duplicate handshake message, returning success');
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.error('Insert error:', insertError);
      return new Response('Failed to send handshake', { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: message.id,
      seq: message.seq,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('handleSendHandshake error:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}

async function handleListHandshakes(req: Request, supabase: any, userId: string) {
  try {
    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id');
    const sinceSeq = url.searchParams.get('since_seq');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);

    if (!groupId) {
      return new Response('Missing group_id parameter', { status: 400, headers: corsHeaders });
    }

    // Verify user has access to this group
    const groupIdBytes = `\\x${Buffer.from(groupId, 'base64').toString('hex')}`;
    
    const { data: groupAccess, error: accessError } = await supabase
      .from('mls_groups')
      .select(`
        room_id,
        rooms!inner(
          room_members!inner(
            device_id,
            devices!inner(
              user_id
            )
          )
        )
      `)
      .eq('group_id', groupIdBytes)
      .eq('rooms.room_members.devices.user_id', userId)
      .limit(1);

    if (accessError || !groupAccess || groupAccess.length === 0) {
      console.error('Access check failed:', accessError);
      return new Response('Access denied', { status: 403, headers: corsHeaders });
    }

    // Build query
    let query = supabase
      .from('mls_handshake_messages')
      .select(`
        id,
        group_id,
        epoch,
        message_type,
        message_data,
        seq,
        created_at,
        sender_device_id,
        devices!inner(
          fingerprint,
          label
        )
      `)
      .eq('group_id', groupIdBytes)
      .order('seq', { ascending: true })
      .limit(limit);

    if (sinceSeq) {
      query = query.gt('seq', parseInt(sinceSeq));
    }

    const { data: messages, error: fetchError } = await query;

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response('Failed to fetch handshakes', { status: 500, headers: corsHeaders });
    }

    // Convert bytea back to base64 for client
    const processedMessages = messages.map(msg => ({
      ...msg,
      group_id: Buffer.from(msg.group_id.slice(2), 'hex').toString('base64'),
      message_data: Buffer.from(msg.message_data.slice(2), 'hex').toString('base64'),
    }));

    return new Response(JSON.stringify({
      messages: processedMessages,
      has_more: messages.length === limit,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('handleListHandshakes error:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}