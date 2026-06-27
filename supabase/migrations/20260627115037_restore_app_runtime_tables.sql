begin;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  action_type text,
  action_config jsonb not null default '{}'::jsonb,
  delay_hours integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_followups (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'failed')),
  scheduled_at timestamptz not null default now(),
  trigger_context jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_job_scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  fit_score integer not null check (fit_score >= 0 and fit_score <= 100),
  fit_breakdown jsonb not null default '{}'::jsonb,
  scored_by_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index if not exists idx_automation_rules_trigger_active
  on public.automation_rules (trigger_type, is_active, sort_order);

create index if not exists idx_candidate_followups_candidate_status
  on public.candidate_followups (candidate_id, status);

create index if not exists idx_candidate_followups_pending_schedule
  on public.candidate_followups (scheduled_at)
  where status = 'pending';

create index if not exists idx_candidate_job_scores_candidate
  on public.candidate_job_scores (candidate_id);

create index if not exists idx_candidate_job_scores_job
  on public.candidate_job_scores (job_id);

alter table public.automation_rules enable row level security;
alter table public.candidate_followups enable row level security;
alter table public.candidate_job_scores enable row level security;

revoke all on public.automation_rules from anon, authenticated;
revoke all on public.candidate_followups from anon, authenticated;
revoke all on public.candidate_job_scores from anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.automation_rules to authenticated;
grant select on public.candidate_followups to authenticated;
grant select on public.candidate_job_scores to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_rules'
      and policyname = 'Authenticated users can read automation rules'
  ) then
    create policy "Authenticated users can read automation rules"
      on public.automation_rules
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'candidate_followups'
      and policyname = 'Authenticated users can read candidate followups'
  ) then
    create policy "Authenticated users can read candidate followups"
      on public.candidate_followups
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'candidate_job_scores'
      and policyname = 'Authenticated users can read candidate job scores'
  ) then
    create policy "Authenticated users can read candidate job scores"
      on public.candidate_job_scores
      for select
      to authenticated
      using (true);
  end if;
end $$;

commit;
