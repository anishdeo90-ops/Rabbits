-- Drizzle-derived feature tables for the newer HireRabbits app.
-- This migration is additive and is intended to run on top of the existing
-- Supabase schema_v3/base schema without dropping or rewriting current data.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp" with schema extensions;

alter table if exists public.candidates
  add column if not exists referred_by text;

alter table if exists public.job_recruiters
  add column if not exists assigned_from date not null default current_date,
  add column if not exists assigned_until date;

alter table if exists public.candidate_offers
  add column if not exists ctc_confirm_method text,
  add column if not exists offer_confirm_notes text;

do $$
begin
  if to_regclass('public.candidate_offers') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'candidate_offers_ctc_confirm_method_check'
         and conrelid = 'public.candidate_offers'::regclass
     ) then
    alter table public.candidate_offers
      add constraint candidate_offers_ctc_confirm_method_check
      check (ctc_confirm_method is null or ctc_confirm_method in ('physical_sign','email','whatsapp','verbal'));
  end if;
end $$;

create table if not exists public.recruitment_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  form_type text not null default 'google_form',
  url text,
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  description text,
  send_to_candidate boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.screening_questions (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid references public.masters(id) on delete cascade,
  question text not null,
  question_type text not null default 'text',
  is_mandatory boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.candidate_forwards (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  unlocked_tabs text[] not null,
  note text,
  status text not null default 'pending',
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'candidate_forwards_status_check'
      and conrelid = 'public.candidate_forwards'::regclass
  ) then
    alter table public.candidate_forwards
      add constraint candidate_forwards_status_check
      check (status in ('pending','completed','cancelled'));
  end if;
end $$;

create table if not exists public.job_creation_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  title text not null,
  job_type text default 'internal',
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  headcount integer default 1,
  priority text default 'normal',
  min_salary numeric,
  max_salary numeric,
  opened_at date,
  target_doj date,
  client_name text,
  placement_fee_pct numeric,
  description text,
  recruiter_ids text[],
  note text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_creation_requests_status_check'
      and conrelid = 'public.job_creation_requests'::regclass
  ) then
    alter table public.job_creation_requests
      add constraint job_creation_requests_status_check
      check (status in ('pending','approved','rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'job_creation_requests_priority_check'
      and conrelid = 'public.job_creation_requests'::regclass
  ) then
    alter table public.job_creation_requests
      add constraint job_creation_requests_priority_check
      check (priority is null or priority in ('low','normal','high','urgent'));
  end if;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  candidate_id uuid references public.candidates(id) on delete cascade,
  forward_id uuid references public.candidate_forwards(id) on delete cascade,
  job_request_id uuid references public.job_creation_requests(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_candidate_forwards_candidate
  on public.candidate_forwards(candidate_id);
create index if not exists idx_candidate_forwards_to_user_status
  on public.candidate_forwards(to_user_id, status);
create index if not exists idx_job_creation_requests_to_user_status
  on public.job_creation_requests(to_user_id, status);
create index if not exists idx_notifications_user_read_created
  on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_recruitment_forms_designation_site
  on public.recruitment_forms(designation_id, site_id);
create index if not exists idx_screening_questions_designation
  on public.screening_questions(designation_id, sort_order);

alter table public.recruitment_forms enable row level security;
alter table public.screening_questions enable row level security;
alter table public.candidate_forwards enable row level security;
alter table public.job_creation_requests enable row level security;
alter table public.notifications enable row level security;

grant select, insert, update, delete on public.recruitment_forms to authenticated;
grant select, insert, update, delete on public.screening_questions to authenticated;
grant select, insert, update, delete on public.candidate_forwards to authenticated;
grant select, insert, update, delete on public.job_creation_requests to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recruitment_forms' and policyname = 'recruitment_forms_read_authenticated') then
    create policy recruitment_forms_read_authenticated
      on public.recruitment_forms for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recruitment_forms' and policyname = 'recruitment_forms_manage_hr') then
    create policy recruitment_forms_manage_hr
      on public.recruitment_forms for all
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'screening_questions' and policyname = 'screening_questions_read_authenticated') then
    create policy screening_questions_read_authenticated
      on public.screening_questions for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'screening_questions' and policyname = 'screening_questions_manage_hr') then
    create policy screening_questions_manage_hr
      on public.screening_questions for all
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'candidate_forwards' and policyname = 'candidate_forwards_read_participants') then
    create policy candidate_forwards_read_participants
      on public.candidate_forwards for select
      to authenticated
      using (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'candidate_forwards' and policyname = 'candidate_forwards_insert_authenticated') then
    create policy candidate_forwards_insert_authenticated
      on public.candidate_forwards for insert
      to authenticated
      with check (from_user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'candidate_forwards' and policyname = 'candidate_forwards_update_participants') then
    create policy candidate_forwards_update_participants
      on public.candidate_forwards for update
      to authenticated
      using (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      )
      with check (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_creation_requests' and policyname = 'job_creation_requests_read_participants') then
    create policy job_creation_requests_read_participants
      on public.job_creation_requests for select
      to authenticated
      using (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_creation_requests' and policyname = 'job_creation_requests_insert_authenticated') then
    create policy job_creation_requests_insert_authenticated
      on public.job_creation_requests for insert
      to authenticated
      with check (from_user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_creation_requests' and policyname = 'job_creation_requests_update_recipient_or_hr') then
    create policy job_creation_requests_update_recipient_or_hr
      on public.job_creation_requests for update
      to authenticated
      using (
        to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      )
      with check (
        to_user_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role in ('admin','hr_manager')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_read_own') then
    create policy notifications_read_own
      on public.notifications for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert_authenticated') then
    create policy notifications_insert_authenticated
      on public.notifications for insert
      to authenticated
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_update_own') then
    create policy notifications_update_own
      on public.notifications for update
      to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_delete_own') then
    create policy notifications_delete_own
      on public.notifications for delete
      to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;
