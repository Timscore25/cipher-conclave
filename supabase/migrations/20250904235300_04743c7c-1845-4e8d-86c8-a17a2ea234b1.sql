-- Fix security warnings by setting search_path for functions

-- Drop and recreate functions with proper search_path
DROP FUNCTION IF EXISTS create_room_invitation(UUID, TIMESTAMP WITH TIME ZONE, INTEGER);
DROP FUNCTION IF EXISTS get_invitation_info(UUID);
DROP FUNCTION IF EXISTS accept_invitation(UUID, TEXT);

-- Function to create room invitation
CREATE OR REPLACE FUNCTION create_room_invitation(
  p_room_id UUID,
  p_expires_at TIMESTAMP WITH TIME ZONE,
  p_uses_remaining INTEGER DEFAULT 10
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_id UUID;
BEGIN
  INSERT INTO room_invitations (room_id, created_by, expires_at, uses_remaining)
  VALUES (p_room_id, auth.uid(), p_expires_at, p_uses_remaining)
  RETURNING id INTO invitation_id;
  
  RETURN invitation_id;
END;
$$;

-- Function to get invitation info  
CREATE OR REPLACE FUNCTION get_invitation_info(p_invitation_id UUID)
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
    'inviter_name', u.display_name,
    'expires_at', ri.expires_at,
    'member_count', (
      SELECT COUNT(*) FROM room_members 
      WHERE room_id = ri.room_id
    )
  ) INTO result
  FROM room_invitations ri
  JOIN rooms r ON r.id = ri.room_id
  JOIN users u ON u.id = ri.created_by
  WHERE ri.id = p_invitation_id
    AND ri.expires_at > now()
    AND ri.uses_remaining > 0;
    
  RETURN result;
END;
$$;

-- Function to accept invitation
CREATE OR REPLACE FUNCTION accept_invitation(
  p_invitation_id UUID,
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
  uses_left INTEGER;
BEGIN
  -- Get invitation details and validate
  SELECT room_id, uses_remaining INTO room_id_result, uses_left
  FROM room_invitations
  WHERE id = p_invitation_id
    AND expires_at > now()
    AND uses_remaining > 0;
    
  IF room_id_result IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;
  
  -- Get device ID
  SELECT id INTO device_id_val
  FROM devices
  WHERE fingerprint = p_device_fingerprint
    AND user_id = auth.uid();
    
  IF device_id_val IS NULL THEN
    RAISE EXCEPTION 'Device not found';
  END IF;
  
  -- Check if already a member (ignore if already member)
  IF NOT EXISTS (
    SELECT 1 FROM room_members 
    WHERE room_id = room_id_result AND device_id = device_id_val
  ) THEN
    -- Join room
    INSERT INTO room_members (room_id, device_id, role)
    VALUES (room_id_result, device_id_val, 'member');
  END IF;
  
  -- Decrement invitation uses
  UPDATE room_invitations 
  SET uses_remaining = uses_remaining - 1
  WHERE id = p_invitation_id;
  
  RETURN room_id_result;
END;
$$;