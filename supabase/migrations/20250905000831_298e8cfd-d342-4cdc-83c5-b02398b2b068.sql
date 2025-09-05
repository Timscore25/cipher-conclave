-- Tighten RLS policies and add missing security measures

-- Create room invitations table for secure invitation management
CREATE TABLE IF NOT EXISTS public.room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  inviter_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on room_invites
ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;

-- RLS policies for room_invites
CREATE POLICY "Members can create invites" ON public.room_invites
  FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = room_invites.room_id 
      AND d.id = room_invites.inviter_device_id
    )
  );

CREATE POLICY "Anyone can view valid invites by token" ON public.room_invites
  FOR SELECT 
  USING (
    expires_at > now() 
    AND redeemed_at IS NULL 
    AND uses_count < max_uses
  );

CREATE POLICY "Inviters can update their invites" ON public.room_invites
  FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = room_invites.inviter_device_id
    )
  );

-- Add indexes for performance
CREATE INDEX idx_room_invites_token ON public.room_invites(token);
CREATE INDEX idx_room_invites_room_expires ON public.room_invites(room_id, expires_at);

-- Update messages table to add pagination support and prevent data scraping
-- Add index for created_at range queries
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON public.messages(room_id, created_at DESC);

-- Update messages RLS to include time-based pagination restrictions
DROP POLICY IF EXISTS "Room members can view messages" ON public.messages;
CREATE POLICY "Room members can view messages" ON public.messages
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = messages.room_id
    )
    -- Add time restriction to prevent historical data scraping
    AND created_at > (now() - INTERVAL '30 days')
  );

-- Tighten room_members policies
DROP POLICY IF EXISTS "Room members can view membership" ON public.room_members;
CREATE POLICY "Room members can view membership" ON public.room_members
  FOR SELECT 
  USING (
    -- Can see own membership
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = room_members.device_id
    )
    OR 
    -- Can see other members only if in same room
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = room_members.room_id
    )
  );

-- Add policy to prevent UPDATE/DELETE on messages (immutable)
CREATE POLICY "Messages are immutable" ON public.messages
  FOR UPDATE USING (false);

CREATE POLICY "Messages are immutable delete" ON public.messages
  FOR DELETE USING (false);

-- Tighten key_verifications to require common room membership
DROP POLICY IF EXISTS "Users can create verifications" ON public.key_verifications;
CREATE POLICY "Users can create verifications" ON public.key_verifications
  FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = key_verifications.verifier_device_id
    )
    AND 
    -- Ensure verifier and target have at least one room in common
    EXISTS (
      SELECT 1 FROM room_members rm1 
      JOIN room_members rm2 ON rm1.room_id = rm2.room_id 
      JOIN devices d1 ON d1.id = rm1.device_id 
      JOIN devices d2 ON d2.fingerprint = key_verifications.target_fpr 
      WHERE rm1.device_id = key_verifications.verifier_device_id 
      AND rm2.device_id = d2.id
    )
  );

-- Add function to clean up expired invites
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS $$
BEGIN
  DELETE FROM public.room_invites 
  WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for secure invite token generation
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update room_invitations functions to use new table
DROP FUNCTION IF EXISTS public.create_room_invitation(uuid, timestamp with time zone, integer);
DROP FUNCTION IF EXISTS public.get_invitation_info(uuid);
DROP FUNCTION IF EXISTS public.accept_invitation(uuid, text);

CREATE OR REPLACE FUNCTION public.create_room_invite(
  p_room_id UUID,
  p_expires_at TIMESTAMP WITH TIME ZONE,
  p_max_uses INTEGER DEFAULT 1
)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_invite_info(p_token TEXT)
RETURNS JSON AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.accept_invite(
  p_token TEXT,
  p_device_fingerprint TEXT
)
RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;