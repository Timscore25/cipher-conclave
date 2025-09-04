-- Create enum types
CREATE TYPE public.room_member_role AS ENUM ('admin', 'member');
CREATE TYPE public.message_content_type AS ENUM ('text', 'file', 'system');
CREATE TYPE public.verification_method AS ENUM ('qr', 'sas');

-- Users table
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Devices table - each user can have multiple devices
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  public_key_armored TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Rooms table
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Room members - links devices to rooms
CREATE TABLE public.room_members (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  role room_member_role NOT NULL DEFAULT 'member',
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, device_id)
);

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- Messages table - stores encrypted messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  author_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  envelope JSONB NOT NULL, -- Per-recipient key packets + metadata
  ciphertext BYTEA NOT NULL, -- Encrypted message content
  signer_fpr TEXT NOT NULL, -- Fingerprint of signing key
  content_type message_content_type NOT NULL DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Attachments table
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Key verifications table
CREATE TABLE public.key_verifications (
  verifier_device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  target_fpr TEXT NOT NULL,
  method verification_method NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (verifier_device_id, target_fpr)
);

ALTER TABLE public.key_verifications ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_devices_user_id ON public.devices(user_id);
CREATE INDEX idx_devices_fingerprint ON public.devices(fingerprint);
CREATE INDEX idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX idx_room_members_device_id ON public.room_members(device_id);
CREATE INDEX idx_messages_room_id ON public.messages(room_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_attachments_message_id ON public.attachments(message_id);

-- RLS Policies

-- Users can view all users (for finding contacts)
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Devices policies
CREATE POLICY "Users can view all devices" ON public.devices
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own devices" ON public.devices
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.users WHERE id = devices.user_id));

-- Rooms policies  
CREATE POLICY "Room members can view rooms" ON public.rooms
  FOR SELECT USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      WHERE rm.room_id = rooms.id
    )
  );

CREATE POLICY "Users can create rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Room owners can update rooms" ON public.rooms
  FOR UPDATE USING (auth.uid() = owner_user_id);

-- Room members policies
CREATE POLICY "Room members can view membership" ON public.room_members
  FOR SELECT USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      WHERE d.id = room_members.device_id
    ) OR
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      WHERE rm.room_id = room_members.room_id
    )
  );

CREATE POLICY "Room admins can manage members" ON public.room_members
  FOR ALL USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      WHERE rm.room_id = room_members.room_id AND rm.role = 'admin'
    )
  );

-- Messages policies
CREATE POLICY "Room members can view messages" ON public.messages
  FOR SELECT USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      WHERE rm.room_id = messages.room_id
    )
  );

CREATE POLICY "Room members can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      WHERE d.id = messages.author_device_id
    ) AND
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      WHERE rm.room_id = messages.room_id
    )
  );

-- Attachments policies
CREATE POLICY "Room members can view attachments" ON public.attachments
  FOR SELECT USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.room_members rm ON rm.device_id = d.id
      JOIN public.messages m ON m.room_id = rm.room_id
      WHERE m.id = attachments.message_id
    )
  );

CREATE POLICY "Message authors can create attachments" ON public.attachments
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      JOIN public.messages m ON m.author_device_id = d.id
      WHERE m.id = attachments.message_id
    )
  );

-- Key verifications policies
CREATE POLICY "Users can view verifications" ON public.key_verifications
  FOR SELECT USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      WHERE d.id = key_verifications.verifier_device_id
    )
  );

CREATE POLICY "Users can create verifications" ON public.key_verifications
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      JOIN public.devices d ON d.user_id = u.id
      WHERE d.id = key_verifications.verifier_device_id
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;