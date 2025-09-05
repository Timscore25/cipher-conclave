-- Fix security warnings by setting search_path for all functions

-- Update cleanup_expired_invites function
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.room_invites 
  WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$;

-- Update generate_invite_token function
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Update create_room_invite function
CREATE OR REPLACE FUNCTION public.create_room_invite(
  p_room_id UUID,
  p_expires_at TIMESTAMP WITH TIME ZONE,
  p_max_uses INTEGER DEFAULT 1
)
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_token TEXT;
  device_id_val UUID;
BEGIN
  -- Get user's device ID
  SELECT id INTO device_id_val 
  FROM devices 
  WHERE user_id = auth.uid() 
  ORDER BY created_at DESC 
  LIMIT 1;
  
  IF device_id_val IS NULL THEN
    RAISE EXCEPTION 'No device found for user';
  END IF;
  
  -- Generate secure token
  invite_token := generate_invite_token();
  
  -- Create invite
  INSERT INTO room_invites (room_id, inviter_device_id, token, expires_at, max_uses)
  VALUES (p_room_id, device_id_val, invite_token, p_expires_at, p_max_uses);
  
  RETURN invite_token;
END;
$$;

-- Update get_invite_info function
CREATE OR REPLACE FUNCTION public.get_invite_info(p_token TEXT)
RETURNS JSON 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'room_name', r.name,
    'room_id', r.id,
    'inviter_name', 'User', -- Keep anonymous for privacy
    'expires_at', ri.expires_at,
    'uses_left', (ri.max_uses - ri.uses_count)
  ) INTO result
  FROM room_invites ri
  JOIN rooms r ON r.id = ri.room_id
  WHERE ri.token = p_token
    AND ri.expires_at > now()
    AND ri.redeemed_at IS NULL
    AND ri.uses_count < ri.max_uses;
    
  RETURN result;
END;
$$;

-- Update accept_invite function
CREATE OR REPLACE FUNCTION public.accept_invite(
  p_token TEXT,
  p_device_fingerprint TEXT
)
RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_id_result UUID;
  device_id_val UUID;
  invite_record RECORD;
BEGIN
  -- Get invite details
  SELECT * INTO invite_record
  FROM room_invites
  WHERE token = p_token
    AND expires_at > now()
    AND redeemed_at IS NULL
    AND uses_count < max_uses;
    
  IF invite_record IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;
  
  room_id_result := invite_record.room_id;
  
  -- Get device ID
  SELECT id INTO device_id_val
  FROM devices
  WHERE fingerprint = p_device_fingerprint
    AND user_id = auth.uid();
    
  IF device_id_val IS NULL THEN
    RAISE EXCEPTION 'Device not found or not owned by user';
  END IF;
  
  -- Check if already a member
  IF NOT EXISTS (
    SELECT 1 FROM room_members 
    WHERE room_id = room_id_result AND device_id = device_id_val
  ) THEN
    -- Join room
    INSERT INTO room_members (room_id, device_id, role)
    VALUES (room_id_result, device_id_val, 'member');
  END IF;
  
  -- Update invite usage
  UPDATE room_invites 
  SET uses_count = uses_count + 1,
      redeemed_at = CASE WHEN uses_count + 1 >= max_uses THEN now() ELSE redeemed_at END
  WHERE id = invite_record.id;
  
  RETURN room_id_result;
END;
$$;