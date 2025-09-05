-- MLS Phase 2: Complete MLS infrastructure for PGPRooms (Fixed)

-- Add crypto_mode to rooms table
ALTER TABLE public.rooms ADD COLUMN crypto_mode TEXT NOT NULL DEFAULT 'pgp' CHECK (crypto_mode IN ('pgp', 'mls'));

-- Create MLS groups table
CREATE TABLE public.mls_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE UNIQUE,
  group_id BYTEA NOT NULL UNIQUE,
  group_state BYTEA NOT NULL, -- Encrypted group state
  current_epoch BIGINT NOT NULL DEFAULT 0,
  created_by_device_id UUID NOT NULL REFERENCES public.devices(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  state_checksum TEXT NOT NULL -- For corruption detection
);

-- Create MLS handshake messages table
CREATE TABLE public.mls_handshake_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id BYTEA NOT NULL,
  epoch BIGINT NOT NULL,
  sender_device_id UUID NOT NULL REFERENCES public.devices(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('welcome', 'group_info', 'key_package', 'proposal', 'commit')),
  message_data BYTEA NOT NULL,
  seq BIGINT NOT NULL, -- Server-assigned sequence number for ordering
  local_seq_id TEXT, -- Client-provided idempotency key
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(group_id, epoch, sender_device_id, local_seq_id)
);

-- Create MLS application messages table
CREATE TABLE public.mls_app_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id BYTEA NOT NULL,
  epoch BIGINT NOT NULL,
  sender_device_id UUID NOT NULL REFERENCES public.devices(id),
  ciphertext BYTEA NOT NULL,
  authenticated_data BYTEA,
  seq BIGINT NOT NULL, -- Server-assigned sequence number
  local_seq_id TEXT, -- Client-provided idempotency key
  content_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(group_id, epoch, sender_device_id, local_seq_id)
);

-- Create MLS key packages table (for adding new members)
CREATE TABLE public.mls_key_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id),
  key_package BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Create sequence counters for ordering
CREATE SEQUENCE mls_handshake_seq;
CREATE SEQUENCE mls_app_seq;

-- Add indexes for performance
CREATE INDEX idx_mls_groups_room_id ON public.mls_groups(room_id);
CREATE INDEX idx_mls_handshake_group_epoch ON public.mls_handshake_messages(group_id, epoch, seq);
CREATE INDEX idx_mls_app_group_epoch ON public.mls_app_messages(group_id, epoch, seq);
CREATE INDEX idx_mls_key_packages_device ON public.mls_key_packages(device_id, expires_at) WHERE used_at IS NULL;

-- Enable RLS on all MLS tables
ALTER TABLE public.mls_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mls_handshake_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mls_app_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mls_key_packages ENABLE ROW LEVEL SECURITY;