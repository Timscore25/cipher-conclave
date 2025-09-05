-- Add RLS policies for MLS tables

-- RLS policies for mls_groups
CREATE POLICY "Room members can view MLS groups" ON public.mls_groups
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = mls_groups.room_id
    )
  );

CREATE POLICY "Room members can update MLS groups" ON public.mls_groups
  FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = mls_groups.room_id
    )
  );

CREATE POLICY "Room admins can create MLS groups" ON public.mls_groups
  FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE rm.room_id = mls_groups.room_id 
      AND rm.role = 'admin'
    )
  );

-- RLS policies for handshake messages
CREATE POLICY "Group members can view handshake messages" ON public.mls_handshake_messages
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM mls_groups mg 
      JOIN room_members rm ON rm.room_id = mg.room_id 
      JOIN devices d ON d.id = rm.device_id 
      JOIN users u ON u.id = d.user_id 
      WHERE mg.group_id = mls_handshake_messages.group_id 
      AND u.id = auth.uid()
    )
  );

CREATE POLICY "Group members can send handshake messages" ON public.mls_handshake_messages
  FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = mls_handshake_messages.sender_device_id
    )
    AND 
    EXISTS (
      SELECT 1 FROM mls_groups mg 
      JOIN room_members rm ON rm.room_id = mg.room_id 
      JOIN devices d ON d.id = rm.device_id 
      JOIN users u ON u.id = d.user_id 
      WHERE mg.group_id = mls_handshake_messages.group_id 
      AND u.id = auth.uid()
    )
  );

-- RLS policies for app messages  
CREATE POLICY "Group members can view app messages" ON public.mls_app_messages
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM mls_groups mg 
      JOIN room_members rm ON rm.room_id = mg.room_id 
      JOIN devices d ON d.id = rm.device_id 
      JOIN users u ON u.id = d.user_id 
      WHERE mg.group_id = mls_app_messages.group_id 
      AND u.id = auth.uid()
    )
  );

CREATE POLICY "Group members can send app messages" ON public.mls_app_messages
  FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = mls_app_messages.sender_device_id
    )
    AND 
    EXISTS (
      SELECT 1 FROM mls_groups mg 
      JOIN room_members rm ON rm.room_id = mg.room_id 
      JOIN devices d ON d.id = rm.device_id 
      JOIN users u ON u.id = d.user_id 
      WHERE mg.group_id = mls_app_messages.group_id 
      AND u.id = auth.uid()
    )
  );

-- RLS policies for key packages
CREATE POLICY "Users can manage own key packages" ON public.mls_key_packages
  FOR ALL 
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      JOIN devices d ON d.user_id = u.id 
      WHERE d.id = mls_key_packages.device_id
    )
  );

CREATE POLICY "Group members can view key packages for adding" ON public.mls_key_packages
  FOR SELECT 
  USING (
    used_at IS NULL 
    AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM devices d 
      JOIN room_members rm ON rm.device_id = d.id 
      WHERE d.id = mls_key_packages.device_id
    )
  );

-- Functions for atomic sequence assignment
CREATE OR REPLACE FUNCTION assign_handshake_seq()
RETURNS TRIGGER AS $$
BEGIN
  NEW.seq = nextval('mls_handshake_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION assign_app_seq()
RETURNS TRIGGER AS $$
BEGIN
  NEW.seq = nextval('mls_app_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for sequence assignment
CREATE TRIGGER assign_handshake_seq_trigger
  BEFORE INSERT ON public.mls_handshake_messages
  FOR EACH ROW EXECUTE FUNCTION assign_handshake_seq();

CREATE TRIGGER assign_app_seq_trigger
  BEFORE INSERT ON public.mls_app_messages
  FOR EACH ROW EXECUTE FUNCTION assign_app_seq();

-- Function to update mls_groups timestamp
CREATE OR REPLACE FUNCTION update_mls_group_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_mls_groups_updated_at
  BEFORE UPDATE ON public.mls_groups
  FOR EACH ROW EXECUTE FUNCTION update_mls_group_timestamp();

-- Function to clean up expired key packages
CREATE OR REPLACE FUNCTION cleanup_expired_key_packages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.mls_key_packages 
  WHERE expires_at < now() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;