-- Create bucket if it doesn't exist (Supabase specific function)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('outputs', 'outputs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow anon everything on outputs" ON storage.objects;

-- Allow anon to upload/read/update/delete in 'outputs' bucket
CREATE POLICY "Allow anon everything on outputs"
ON storage.objects FOR ALL TO anon
USING (bucket_id = 'outputs')
WITH CHECK (bucket_id = 'outputs');
