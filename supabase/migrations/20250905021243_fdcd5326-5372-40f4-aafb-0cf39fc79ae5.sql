-- Enable RLS on devices table
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can select their own devices
CREATE POLICY "devices_select_own"
ON public.devices FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert devices for themselves
CREATE POLICY "devices_insert_own"
ON public.devices FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own device labels
CREATE POLICY "devices_update_own"
ON public.devices FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());