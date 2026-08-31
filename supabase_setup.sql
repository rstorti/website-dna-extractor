-- Run this in the Supabase SQL Editor to set up tables and storage buckets.

-- 1. Create the 'extraction_history' table
CREATE TABLE IF NOT EXISTS public.extraction_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    url TEXT,
    target_url TEXT,
    youtube_url TEXT,
    profile_url TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    success BOOLEAN,
    name TEXT,
    "screenshotUrl" TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS extraction_history_tenant_timestamp_idx
    ON public.extraction_history (tenant_id, "timestamp" desc);

-- 2. Create the 'extraction_jobs' table
CREATE TABLE IF NOT EXISTS public.extraction_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL DEFAULT 'web',
    tenant_id TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'init',
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    result JSONB,
    error TEXT,
    hint TEXT,
    elapsed INTEGER,
    cancel_requested BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()) + interval '30 minutes',
    CONSTRAINT extraction_jobs_status_check CHECK (status IN ('pending', 'running', 'cancelling', 'cancelled', 'complete', 'failed'))
);

CREATE INDEX IF NOT EXISTS extraction_jobs_tenant_status_idx
    ON public.extraction_jobs (tenant_id, status, updated_at desc);

CREATE INDEX IF NOT EXISTS extraction_jobs_expires_idx
    ON public.extraction_jobs (expires_at);

-- Enable RLS
ALTER TABLE public.extraction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

-- Add policies
DROP POLICY IF EXISTS "service role manages history" ON public.extraction_history;
CREATE POLICY "service role manages history"
    ON public.extraction_history FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role manages jobs" ON public.extraction_jobs;
CREATE POLICY "service role manages jobs"
    ON public.extraction_jobs FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 3. Create the 'outputs' storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('outputs', 'outputs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow anon everything on outputs" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Allow anon/everyone to upload/read/update/delete in 'outputs' bucket (for internal use)
CREATE POLICY "Allow anon everything on outputs"
ON storage.objects FOR ALL
USING (bucket_id = 'outputs')
WITH CHECK (bucket_id = 'outputs');

-- ── Campaign Sessions Table ──
CREATE TABLE IF NOT EXISTS public.campaign_sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    brand_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
    style_guide_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
    campaign_output jsonb,
    idempotency_key text UNIQUE,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT campaign_sessions_status_check CHECK (status IN ('draft', 'imported', 'failed'))
);

CREATE INDEX IF NOT EXISTS campaign_sessions_tenant_idx
    ON public.campaign_sessions (tenant_id, updated_at DESC);

ALTER TABLE public.campaign_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages sessions" ON public.campaign_sessions;
CREATE POLICY "service role manages sessions"
    ON public.campaign_sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
