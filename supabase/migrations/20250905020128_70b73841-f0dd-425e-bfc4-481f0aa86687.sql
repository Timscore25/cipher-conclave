-- Create atomic room creation function with membership
CREATE OR REPLACE FUNCTION public.create_room_with_membership(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid := gen_random_uuid();
  v_device_id uuid;
BEGIN
  -- Validate input
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Room name cannot be empty';
  END IF;

  -- Get user's primary device
  SELECT id INTO v_device_id 
  FROM devices 
  WHERE user_id = auth.uid() 
  ORDER BY created_at DESC 
  LIMIT 1;
  
  IF v_device_id IS NULL THEN
    RAISE EXCEPTION 'No device found for user. Please create a device first.';
  END IF;
  
  -- Create room
  INSERT INTO rooms (id, name, owner_user_id)
  VALUES (v_room_id, trim(p_name), auth.uid());

  -- Add creator as admin member
  INSERT INTO room_members (room_id, device_id, role)
  VALUES (v_room_id, v_device_id, 'admin');

  RETURN v_room_id;
END;
$$;

-- Update RLS policies for rooms table
DROP POLICY IF EXISTS "rooms_select_members" ON public.rooms;
CREATE POLICY "rooms_select_members"
ON public.rooms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM room_members rm
    JOIN devices d ON d.id = rm.device_id
    WHERE rm.room_id = rooms.id AND d.user_id = auth.uid()
  )
);

-- Block direct inserts to rooms (use function instead)
DROP POLICY IF EXISTS "rooms_insert_owners" ON public.rooms;
DROP POLICY IF EXISTS "Users can create rooms" ON public.rooms;
CREATE POLICY "rooms_no_direct_insert"
ON public.rooms FOR INSERT
WITH CHECK (false);

-- Update RLS policies for room_members table
DROP POLICY IF EXISTS "room_members_select_self" ON public.room_members;
CREATE POLICY "room_members_select_self"
ON public.room_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM devices d 
    WHERE d.id = room_members.device_id AND d.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM room_members rm2
    JOIN devices d ON d.id = rm2.device_id
    WHERE rm2.room_id = room_members.room_id AND d.user_id = auth.uid()
  )
);

-- Block direct inserts to room_members (use function or specific operations)
DROP POLICY IF EXISTS "room_members_insert_none" ON public.room_members;
CREATE POLICY "room_members_no_direct_insert"
ON public.room_members FOR INSERT
WITH CHECK (false);

-- Allow admins to manage room members through specific operations
CREATE POLICY "room_admins_can_add_members"
ON public.room_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM room_members rm
    JOIN devices d ON d.id = rm.device_id
    WHERE rm.room_id = room_members.room_id 
    AND rm.role = 'admin'
    AND d.user_id = auth.uid()
  )
);

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.create_room_with_membership(text) TO authenticated;