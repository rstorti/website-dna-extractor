CREATE TABLE IF NOT EXISTS public.extraction_history (
    id text primary key,
    url text,
    target_url text,
    youtube_url text,
    profile_url text,
    timestamp timestamptz,
    success boolean,
    name text,
    "screenshotUrl" text,
    payload jsonb
);

ALTER TABLE public.extraction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon everything" ON public.extraction_history;
CREATE POLICY "Allow anon everything" ON public.extraction_history FOR ALL TO anon USING (true);
