-- Fix template-media storage policies: upload path is org_id/user_id/timestamp.ext
-- but the old policy checked foldername[1] (org_id) against auth.uid(), which never matches.
-- This caused uploads to be silently rejected, resulting in 404s when WhatsApp/Exotel
-- tried to fetch the media URL (error 131053: Media upload error).

-- Drop the broken policies
DROP POLICY IF EXISTS "Users can upload template media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own template media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own template media" ON storage.objects;

-- Recreate with correct path check: foldername[2] = user_id
CREATE POLICY "Users can upload template media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can read own template media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can delete own template media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'template-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[2] = auth.uid()::text
);
