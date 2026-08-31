create extension if not exists pgcrypto;

create table if not exists public.extraction_history (
    id text primary key,
    tenant_id text not null default 'default',
    url text,
    target_url text,
    youtube_url text,
    profile_url text,
    "timestamp" timestamptz not null default timezone('utc', now()),
    success boolean,
    name text,
    "screenshotUrl" text,
    payload jsonb not null default '{}'::jsonb
);

alter table public.extraction_history
    add column if not exists tenant_id text not null default 'default',
    add column if not exists url text,
    add column if not exists target_url text,
    add column if not exists youtube_url text,
    add column if not exists profile_url text,
    add column if not exists "timestamp" timestamptz not null default timezone('utc', now()),
    add column if not exists success boolean,
    add column if not exists name text,
    add column if not exists "screenshotUrl" text,
    add column if not exists payload jsonb not null default '{}'::jsonb;

update public.extraction_history
set tenant_id = 'default'
where tenant_id is null or tenant_id = '';

create index if not exists extraction_history_tenant_timestamp_idx
    on public.extraction_history (tenant_id, "timestamp" desc);

create table if not exists public.extraction_jobs (
    job_id uuid primary key default gen_random_uuid(),
    job_type text not null default 'web',
    tenant_id text not null default 'default',
    status text not null,
    stage text not null default 'init',
    steps jsonb not null default '[]'::jsonb,
    result jsonb,
    error text,
    hint text,
    elapsed integer,
    cancel_requested boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    expires_at timestamptz not null default timezone('utc', now()) + interval '30 minutes',
    constraint extraction_jobs_status_check check (status in ('pending', 'running', 'cancelling', 'cancelled', 'complete', 'failed'))
);

create index if not exists extraction_jobs_tenant_status_idx
    on public.extraction_jobs (tenant_id, status, updated_at desc);

create index if not exists extraction_jobs_expires_idx
    on public.extraction_jobs (expires_at);

alter table public.extraction_history enable row level security;
alter table public.extraction_jobs enable row level security;

drop policy if exists "Allow anon everything" on public.extraction_history;
drop policy if exists "service role manages history" on public.extraction_history;
create policy "service role manages history"
    on public.extraction_history
    for all
    to service_role
    using (true)
    with check (true);

drop policy if exists "service role manages jobs" on public.extraction_jobs;
create policy "service role manages jobs"
    on public.extraction_jobs
    for all
    to service_role
    using (true)
    with check (true);

-- ── Campaign Sessions Table ──
create table if not exists public.campaign_sessions (
    session_id uuid primary key default gen_random_uuid(),
    tenant_id text not null,
    brand_dna jsonb not null default '{}'::jsonb,
    style_guide_rules jsonb not null default '[]'::jsonb,
    campaign_output jsonb,
    idempotency_key text unique,
    status text not null default 'draft',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint campaign_sessions_status_check check (status in ('draft', 'imported', 'failed'))
);

create index if not exists campaign_sessions_tenant_idx
    on public.campaign_sessions (tenant_id, updated_at desc);

alter table public.campaign_sessions enable row level security;

drop policy if exists "service role manages sessions" on public.campaign_sessions;
create policy "service role manages sessions"
    on public.campaign_sessions
    for all
    to service_role
    using (true)
    with check (true);
