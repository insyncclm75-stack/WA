
-- Create template-media storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('template-media', 'template-media', true);

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload template media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own template media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read for template media (needed for Exotel API to fetch the media)
CREATE POLICY "Public can read template media"
ON storage.objects FOR SELECT
USING (bucket_id = 'template-media');

-- Allow users to delete their own template media
CREATE POLICY "Users can delete own template media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
