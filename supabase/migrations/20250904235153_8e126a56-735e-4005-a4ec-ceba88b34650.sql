-- Create room invitations table
CREATE TABLE public.room_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  uses_remaining INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for room_invitations
CREATE POLICY "Room members can create invitations" ON public.room_invitations
FOR INSERT WITH CHECK (
  auth.uid() IN (
    SELECT u.id FROM users u
    JOIN devices d ON d.user_id = u.id
    JOIN room_members rm ON rm.device_id = d.id
    WHERE rm.room_id = room_invitations.room_id
  )
);

CREATE POLICY "Anyone can view valid invitations" ON public.room_invitations
FOR SELECT USING (
  expires_at > now() AND uses_remaining > 0
);

CREATE POLICY "Creators can update their invitations" ON public.room_invitations
FOR UPDATE USING (auth.uid() = created_by);

-- Add index for performance
CREATE INDEX idx_room_invitations_expires_uses ON public.room_invitations(expires_at, uses_remaining);
CREATE INDEX idx_room_invitations_room_id ON public.room_invitations(room_id);