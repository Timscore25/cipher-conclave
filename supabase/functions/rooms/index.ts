import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
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
      case 'POST:create':
        return await handleCreateRoom(req, supabase, user.id);
      case 'POST:join':
        return await handleJoinRoom(req, supabase, user.id);
      case 'POST:leave':
        return await handleLeaveRoom(req, supabase, user.id);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Rooms function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleCreateRoom(req: Request, supabase: any, userId: string) {
  const { name } = await req.json();
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Room name is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Create room
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name: name.trim(), owner_user_id: userId })
    .select()
    .single();

  if (roomError) {
    console.error('Error creating room:', roomError);
    return new Response(JSON.stringify({ error: 'Failed to create room' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get user's devices to add them as room members
  const { data: devices } = await supabase
    .from('devices')
    .select('id')
    .eq('user_id', userId);

  if (devices && devices.length > 0) {
    // Add user's devices as room admins
    const memberInserts = devices.map((device: any) => ({
      room_id: room.id,
      device_id: device.id,
      role: 'admin'
    }));

    await supabase.from('room_members').insert(memberInserts);
  }

  return new Response(JSON.stringify({ room_id: room.id, room }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleJoinRoom(req: Request, supabase: any, userId: string) {
  const { room_id, device_fpr } = await req.json();
  
  if (!room_id || !device_fpr) {
    return new Response(JSON.stringify({ error: 'room_id and device_fpr required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Verify room exists
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', room_id)
    .single();

  if (!room) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Find device by fingerprint and verify ownership
  const { data: device } = await supabase
    .from('devices')
    .select('id, user_id')
    .eq('fingerprint', device_fpr)
    .eq('user_id', userId)
    .single();

  if (!device) {
    return new Response(JSON.stringify({ error: 'Device not found or not owned by user' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Add device to room
  const { error } = await supabase
    .from('room_members')
    .insert({
      room_id,
      device_id: device.id,
      role: 'member'
    });

  if (error && !error.message.includes('duplicate')) {
    console.error('Error joining room:', error);
    return new Response(JSON.stringify({ error: 'Failed to join room' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleLeaveRoom(req: Request, supabase: any, userId: string) {
  const { room_id } = await req.json();
  
  if (!room_id) {
    return new Response(JSON.stringify({ error: 'room_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Remove user's devices from room
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', room_id)
    .in('device_id', 
      supabase.from('devices').select('id').eq('user_id', userId)
    );

  if (error) {
    console.error('Error leaving room:', error);
    return new Response(JSON.stringify({ error: 'Failed to leave room' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}