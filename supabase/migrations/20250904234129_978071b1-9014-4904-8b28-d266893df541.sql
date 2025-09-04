-- Create storage buckets for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('attachments', 'attachments', false, 52428800, ARRAY['image/*', 'application/*', 'text/*', 'video/*', 'audio/*']);

-- Storage policies for attachments
CREATE POLICY "Users can view attachments in their rooms" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT room_id::text FROM room_members rm
    JOIN devices d ON d.id = rm.device_id
    WHERE d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload attachments to their rooms" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'attachments' AND
  (storage.foldername(name))[1] IN (
    SELECT room_id::text FROM room_members rm
    JOIN devices d ON d.id = rm.device_id
    WHERE d.user_id = auth.uid()
  )
);

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;