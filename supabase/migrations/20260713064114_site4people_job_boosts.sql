begin;

alter table public.jobs
  add column if not exists external_source text,
  add column if not exists external_job_uid text,
  add column if not exists external_job_id text,
  add column if not exists external_received_at timestamptz,
  add column if not exists external_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_external_source_uid_key'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_external_source_uid_key
      unique (external_source, external_job_uid);
  end if;
end $$;

create index if not exists idx_jobs_external_source
  on public.jobs (external_source, external_job_id);

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  platform text not null,
  status text not null default 'pending'
    check (status in ('pending', 'posting', 'posted', 'failed', 'cancelled')),
  external_post_url text,
  external_post_id text,
  error_message text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, platform)
);

create index if not exists idx_job_postings_status_created
  on public.job_postings (status, created_at);

create index if not exists idx_job_postings_job
  on public.job_postings (job_id);

alter table public.job_postings enable row level security;

revoke all on public.job_postings from anon, authenticated;
grant select on public.job_postings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_postings'
      and policyname = 'job_postings_read_hr'
  ) then
    create policy job_postings_read_hr
      on public.job_postings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin', 'hr_manager')
        )
      );
  end if;
end $$;

commit;
