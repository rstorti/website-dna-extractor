-- Run this in the Supabase SQL Editor

-- 1. Create the 'history' table
CREATE TABLE IF NOT EXISTS public.history (
    id TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT true,
    payload JSONB NOT NULL
);

-- Turn off Row Level Security (RLS) for simplicity during internal use
ALTER TABLE public.history DISABLE ROW LEVEL SECURITY;

-- 2. Create the 'outputs' storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('outputs', 'outputs', true)
ON CONFLICT (id) DO NOTHING;

-- Create an open policy to allow anonymous uploads and reads (for internal use)
CREATE POLICY "Public Access" 
ON storage.objects FOR ALL 
USING (bucket_id = 'outputs');
