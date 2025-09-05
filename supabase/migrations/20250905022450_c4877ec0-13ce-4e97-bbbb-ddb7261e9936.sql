-- Fix infinite recursion in room_members RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Room admins can manage members" ON public.room_members;
DROP POLICY IF EXISTS "Room members can view membership" ON public.room_members;
DROP POLICY IF EXISTS "room_admins_can_add_members" ON public.room_members;
DROP POLICY IF EXISTS "room_members_no_direct_insert" ON public.room_members;
DROP POLICY IF EXISTS "room_members_select_self" ON public.room_members;

-- Create security definer functions to check room membership without recursion
CREATE OR REPLACE FUNCTION public.user_is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.room_members rm
    JOIN public.devices d ON d.id = rm.device_id
    WHERE d.user_id = _user_id AND rm.room_id = _room_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_room_admin(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.room_members rm
    JOIN public.devices d ON d.id = rm.device_id
    WHERE d.user_id = _user_id AND rm.room_id = _room_id AND rm.role = 'admin'
  );
$$;

-- Create new RLS policies using the security definer functions
CREATE POLICY "Users can view memberships in their rooms"
ON public.room_members FOR SELECT
USING (
  auth.uid() IN (
    SELECT d.user_id FROM public.devices d WHERE d.id = room_members.device_id
  ) OR
  public.user_is_room_member(auth.uid(), room_members.room_id)
);

CREATE POLICY "Room admins can manage all memberships"
ON public.room_members FOR ALL
USING (public.user_is_room_admin(auth.uid(), room_members.room_id))
WITH CHECK (public.user_is_room_admin(auth.uid(), room_members.room_id));

CREATE POLICY "Block direct inserts - use functions only"
ON public.room_members FOR INSERT
WITH CHECK (false);