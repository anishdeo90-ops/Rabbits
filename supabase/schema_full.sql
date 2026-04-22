-- HireRabbits ATS full Supabase setup
-- Paste this whole file into Supabase SQL Editor for a fresh project.
-- It is idempotent enough for early setup, but run it on a clean project when possible.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'recruiter'
    check (role in ('admin','hr_manager','recruiter','hod','candidate')),
  department text,
  is_active boolean not null default true,
  avatar_url text,
  google_account_email text,
  google_access_token text,
  google_refresh_token text,
  google_sheet_id text,
  google_drive_folder text,
  ai_api_key_enc text,
  ai_provider text default 'openai',
  is_external_recruiter boolean default false,
  external_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role text;
begin
  desired_role := coalesce(new.raw_user_meta_data->>'role', 'recruiter');
  if desired_role not in ('admin','hr_manager','recruiter','hod','candidate') then
    desired_role := 'recruiter';
  end if;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'User'),
    coalesce(new.email, ''),
    case
      when not exists (select 1 from public.profiles) then 'admin'
      else desired_role
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.masters (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  name text not null,
  code text,
  color text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (type, name)
);

create table if not exists public.jd_library (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  designation_id uuid references public.masters(id) on delete set null,
  content text,
  drive_url text,
  file_name text,
  version integer default 1,
  tags text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  job_type text not null default 'internal' check (job_type in ('internal','client')),
  status text not null default 'open' check (status in ('open','on_hold','closed','filled')),
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  department text,
  headcount integer default 1,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  description text,
  requirements text,
  min_salary numeric,
  max_salary numeric,
  client_name text,
  client_contact text,
  placement_fee_pct numeric,
  placement_fee_flat numeric,
  jd_id uuid references public.jd_library(id) on delete set null,
  opened_at date,
  closed_at date,
  filled_at date,
  target_doj date,
  hod_id uuid references public.profiles(id) on delete set null,
  candidates_pipeline integer not null default 0,
  candidates_shortlisted integer not null default 0,
  candidates_appointed integer not null default 0,
  candidates_joined integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  is_deleted boolean default false
);

create sequence if not exists public.candidates_sr_no_seq;

create table if not exists public.candidates (
  id uuid primary key default uuid_generate_v4(),
  sr_no integer not null default nextval('public.candidates_sr_no_seq'),
  hr_id uuid references public.profiles(id) on delete set null,
  month text,
  application_date date,
  naukri_link text,
  naukri_profile_url text,
  name text not null,
  current_designation text,
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  mobile text,
  email text,
  suitable_other_position text,
  current_location text,
  source_id uuid references public.masters(id) on delete set null,
  present_salary numeric,
  expected_salary numeric,
  offered_salary numeric,
  notice_period_days integer,
  google_form_sent text,
  google_form_received text,
  processed_by_hr text,
  shortlist_by_hr text,
  tel_int_date date,
  tel_int_remarks text,
  hr_manager_remarks text,
  remarks_before_pi text,
  mgmt_remarks_before_pi text,
  shortlisted_for_pi text,
  pi1_date date,
  pi1_taken_by text,
  pi1_remarks text,
  pi2_date date,
  pi2_taken_by text,
  pi2_remarks text,
  pi3_date date,
  pi3_taken_by text,
  pi3_remarks text,
  gf_issued text,
  shortlisted_by_mgmt text,
  gf_issue_date date,
  gf_received_date date,
  gf_verified text,
  gf_verification_report text,
  addr_verification_shared date,
  addr_verification_received date,
  remarks text,
  final_status text,
  final_action text,
  file_no text,
  doj date,
  doj_potential date,
  doj_actual date,
  hard_copy text,
  staffingo_emp_id text,
  ai_score smallint check (ai_score between 0 and 100),
  ai_summary text,
  cv_drive_url text,
  cv_filename text,
  portal_token text unique,
  job_id uuid references public.jobs(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.custom_columns (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  field_key text not null unique,
  col_type text not null default 'text'
    check (col_type in ('text','number','date','dropdown','boolean','url')),
  dropdown_type text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.job_recruiters (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  recruiter_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  unique (job_id, recruiter_id)
);

create table if not exists public.co_sourcers (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  recruiter_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'co_sourcer' check (role in ('primary','co_sourcer')),
  linked_at timestamptz default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  notes text,
  unique (candidate_id, recruiter_id)
);

create table if not exists public.candidate_communications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  type text not null check (type in ('email','whatsapp','call','note','other')),
  direction text not null default 'logged' check (direction in ('sent','received','logged')),
  subject text,
  content text,
  template_used text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  communicated_at timestamptz not null default now()
);

create table if not exists public.candidate_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_category text default 'other'
    check (file_category in ('cv','certificate','onboarding','form_response','other')),
  file_size integer,
  mime_type text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.ctc_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  name text not null,
  description text,
  components jsonb not null default '[]'::jsonb,
  is_system boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz default now()
);

create table if not exists public.candidate_offers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  ctc_template_id uuid references public.ctc_templates(id) on delete set null,
  annual_ctc numeric,
  ctc_data jsonb,
  ctc_notes text,
  ctc_sent_at timestamptz,
  ctc_confirmed_at timestamptz,
  offer_letter_html text,
  offer_sent_at timestamptz,
  offer_confirmed_at timestamptz,
  joining_date date,
  joined_at date,
  designation text,
  site text,
  reporting_to text,
  probation_months integer default 6,
  status text default 'draft'
    check (status in ('draft','ctc_sent','ctc_confirmed','offer_sent','offer_confirmed','joined','withdrawn')),
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  notes text,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.activity_log (
  id uuid primary key default uuid_generate_v4(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  scope text not null default 'personal' check (scope in ('personal','org')),
  provider text not null check (provider in ('anthropic','openai','gemini')),
  api_key text not null,
  model text,
  label text,
  is_active boolean default true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint ai_settings_personal_user_required check (
    (scope = 'personal' and user_id is not null) or (scope = 'org')
  )
);

create unique index if not exists ai_settings_one_personal_active
  on public.ai_settings (user_id)
  where scope = 'personal' and is_active = true;

create unique index if not exists ai_settings_one_org_active
  on public.ai_settings ((scope))
  where scope = 'org' and is_active = true;

create table if not exists public.assessments (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  form_url text,
  description text,
  duration_mins integer,
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.assessment_jobs (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  primary key (assessment_id, job_id)
);

create table if not exists public.deletion_requests (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz default now()
);

create table if not exists public.email_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  subject text not null,
  body text not null,
  template_type text not null default 'general'
    check (template_type in ('general','offer','rejection','interview','joining','custom')),
  variables text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.email_template_jobs (
  template_id uuid not null references public.email_templates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  primary key (template_id, job_id)
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('application','screening','interview_prep','assessment','onboarding')),
  description text,
  fields jsonb not null default '[]'::jsonb,
  is_active boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.form_job_links (
  form_id uuid not null references public.forms(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  primary key (form_id, job_id)
);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  responses jsonb not null default '{}'::jsonb,
  respondent_name text,
  respondent_email text,
  submitted_at timestamptz default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists public.google_drive_settings (
  id uuid primary key default gen_random_uuid(),
  service_account_json text not null,
  folder_id text not null,
  folder_name text,
  is_active boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.hiring_requests (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  headcount integer not null default 1,
  urgency text not null default 'normal' check (urgency in ('low','normal','high','urgent')),
  description text,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','converted')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  converted_job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  round text not null default 'telephonic'
    check (round in ('telephonic','pi1','pi2','pi3','hr_discussion','final')),
  scheduled_at timestamptz not null,
  duration_mins integer default 60,
  interviewer_id uuid references public.profiles(id) on delete set null,
  interviewer_name text,
  location text,
  meet_link text,
  calendar_event_id text,
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','done','rescheduled','cancelled','no_show')),
  outcome text,
  notes text,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz default now()
);

create table if not exists public.recruitment_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  form_type text not null default 'google_form'
    check (form_type in ('google_form','assessment','document','other')),
  url text,
  designation_id uuid references public.masters(id) on delete set null,
  site_id uuid references public.masters(id) on delete set null,
  description text,
  send_to_candidate boolean default false,
  is_active boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.screening_questions (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid references public.masters(id) on delete set null,
  question text not null,
  question_type text not null default 'text'
    check (question_type in ('text','yesno','number','rating','dropdown')),
  options jsonb not null default '[]'::jsonb,
  is_mandatory boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sync_configs (
  id uuid primary key default uuid_generate_v4(),
  recruiter_id uuid not null unique references public.profiles(id) on delete cascade,
  sheet_id text,
  sheet_name text default 'Master',
  sync_direction text default 'both' check (sync_direction in ('push','pull','both','to_sheet','from_sheet')),
  auto_sync boolean default false,
  sync_frequency text default 'manual' check (sync_frequency in ('manual','hourly','daily')),
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_rows integer,
  last_sync_count integer,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sync_conflicts (
  id uuid primary key default uuid_generate_v4(),
  recruiter_id uuid references public.profiles(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete cascade,
  field_name text,
  db_value text,
  sheet_value text,
  conflict_type text default 'value_mismatch'
    check (conflict_type in ('value_mismatch','deleted_in_db','deleted_in_sheet','new_in_sheet','protected_field')),
  resolution text default 'pending' check (resolution in ('keep_db','keep_sheet','manual','pending')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.backup_log (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid references public.profiles(id) on delete set null,
  triggered_by uuid references public.profiles(id) on delete set null,
  trigger_type text default 'manual' check (trigger_type in ('manual','scheduled','import')),
  status text default 'success' check (status in ('pending','running','success','done','failed')),
  row_count integer,
  rows_backed_up integer,
  filename text,
  drive_file_id text,
  drive_file_name text,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz default now(),
  finished_at timestamptz
);

create or replace function public.assign_primary_sourcer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.co_sourcers (candidate_id, recruiter_id, role, linked_by)
    values (new.id, new.created_by, 'primary', new.created_by)
    on conflict (candidate_id, recruiter_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_assign_primary_sourcer on public.candidates;
create trigger candidates_assign_primary_sourcer
  after insert on public.candidates
  for each row execute function public.assign_primary_sourcer();

create or replace function public.log_candidate_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (table_name, record_id, action, changed_by, new_data)
    values (tg_table_name, new.id, 'INSERT', new.created_by, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log (table_name, record_id, action, changed_by, old_data, new_data)
    values (tg_table_name, new.id, 'UPDATE', coalesce(new.updated_by, auth.uid()), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.activity_log (table_name, record_id, action, changed_by, old_data)
    values (tg_table_name, old.id, 'DELETE', auth.uid(), to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists candidates_activity_log on public.candidates;
create trigger candidates_activity_log
  after insert or update or delete on public.candidates
  for each row execute function public.log_candidate_activity();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs for each row execute function public.touch_updated_at();
drop trigger if exists jd_library_updated_at on public.jd_library;
create trigger jd_library_updated_at before update on public.jd_library for each row execute function public.touch_updated_at();
drop trigger if exists candidates_updated_at on public.candidates;
create trigger candidates_updated_at before update on public.candidates for each row execute function public.touch_updated_at();
drop trigger if exists ctc_templates_updated_at on public.ctc_templates;
create trigger ctc_templates_updated_at before update on public.ctc_templates for each row execute function public.touch_updated_at();
drop trigger if exists candidate_offers_updated_at on public.candidate_offers;
create trigger candidate_offers_updated_at before update on public.candidate_offers for each row execute function public.touch_updated_at();
drop trigger if exists forms_updated_at on public.forms;
create trigger forms_updated_at before update on public.forms for each row execute function public.touch_updated_at();
drop trigger if exists google_drive_settings_updated_at on public.google_drive_settings;
create trigger google_drive_settings_updated_at before update on public.google_drive_settings for each row execute function public.touch_updated_at();
drop trigger if exists hiring_requests_updated_at on public.hiring_requests;
create trigger hiring_requests_updated_at before update on public.hiring_requests for each row execute function public.touch_updated_at();
drop trigger if exists interviews_updated_at on public.interviews;
create trigger interviews_updated_at before update on public.interviews for each row execute function public.touch_updated_at();
drop trigger if exists recruitment_forms_updated_at on public.recruitment_forms;
create trigger recruitment_forms_updated_at before update on public.recruitment_forms for each row execute function public.touch_updated_at();
drop trigger if exists screening_questions_updated_at on public.screening_questions;
create trigger screening_questions_updated_at before update on public.screening_questions for each row execute function public.touch_updated_at();
drop trigger if exists sync_configs_updated_at on public.sync_configs;
create trigger sync_configs_updated_at before update on public.sync_configs for each row execute function public.touch_updated_at();
drop trigger if exists ai_settings_updated_at on public.ai_settings;
create trigger ai_settings_updated_at before update on public.ai_settings for each row execute function public.touch_updated_at();

create or replace view public.v_pipeline_funnel as
select
  c.id,
  c.sr_no,
  c.hr_id,
  c.month,
  c.application_date,
  c.naukri_link,
  c.naukri_profile_url,
  c.name,
  c.current_designation,
  c.designation_id,
  c.site_id,
  c.mobile,
  c.email,
  c.suitable_other_position,
  c.current_location,
  c.source_id,
  c.present_salary,
  c.expected_salary,
  c.offered_salary,
  c.notice_period_days,
  c.google_form_sent,
  c.google_form_received,
  c.processed_by_hr,
  c.shortlist_by_hr,
  c.tel_int_date,
  c.tel_int_remarks,
  c.hr_manager_remarks,
  c.remarks_before_pi,
  c.mgmt_remarks_before_pi,
  c.shortlisted_for_pi,
  c.pi1_date,
  c.pi1_taken_by,
  c.pi1_remarks,
  c.pi2_date,
  c.pi2_taken_by,
  c.pi2_remarks,
  c.pi3_date,
  c.pi3_taken_by,
  c.pi3_remarks,
  c.gf_issued,
  c.shortlisted_by_mgmt,
  c.gf_issue_date,
  c.gf_received_date,
  c.gf_verified,
  c.gf_verification_report,
  c.addr_verification_shared,
  c.addr_verification_received,
  c.remarks,
  c.final_status,
  c.final_action,
  c.file_no,
  c.doj,
  c.doj_potential,
  c.doj_actual,
  c.hard_copy,
  c.staffingo_emp_id,
  c.ai_score,
  c.ai_summary,
  c.cv_drive_url,
  c.cv_filename,
  c.portal_token,
  c.job_id,
  c.custom_data,
  c.created_at,
  c.updated_at,
  c.created_by,
  c.updated_by,
  c.is_deleted,
  p.name as hr_name,
  ms.name as site_name,
  md.name as designation_name,
  msrc.name as source_name,
  (
    select string_agg(pr.name, ', ' order by pr.name)
    from public.co_sourcers cs2
    join public.profiles pr on pr.id = cs2.recruiter_id
    where cs2.candidate_id = c.id and cs2.role = 'co_sourcer'
  ) as co_sourcer_names,
  case when c.tel_int_date is not null then 1 else 0 end as tel_int_done,
  case when coalesce(c.google_form_sent, '') <> '' then 1 else 0 end as gf_sent,
  case when coalesce(c.google_form_received, '') <> '' then 1 else 0 end as gf_received,
  case when coalesce(c.shortlist_by_hr, '') <> '' then 1 else 0 end as shortlisted_hr,
  case when c.pi1_date is not null then 1 else 0 end as pi_done,
  case when c.pi2_date is not null then 1 else 0 end as pi2_done,
  case when c.pi3_date is not null then 1 else 0 end as pi3_done,
  case when coalesce(c.shortlisted_by_mgmt, '') <> '' then 1 else 0 end as shortlisted_mgmt,
  case when c.gf_issue_date is not null then 1 else 0 end as gf_issued_flag,
  case when c.gf_received_date is not null then 1 else 0 end as gf_recv,
  case when c.final_status = 'Appointed/Offered' then 1 else 0 end as appointed,
  case when c.doj_actual is not null or c.doj is not null then 1 else 0 end as joined,
  case when c.final_status = 'Offered But Not Joined' then 1 else 0 end as offered_not_joined
from public.candidates c
left join public.profiles p on p.id = c.hr_id
left join public.masters ms on ms.id = c.site_id
left join public.masters md on md.id = c.designation_id
left join public.masters msrc on msrc.id = c.source_id
where c.is_deleted = false;

create index if not exists idx_candidates_hr_id on public.candidates (hr_id);
create index if not exists idx_candidates_site_id on public.candidates (site_id);
create index if not exists idx_candidates_mobile on public.candidates (mobile);
create index if not exists idx_candidates_email on public.candidates (email);
create index if not exists idx_candidates_status on public.candidates (final_status);
create index if not exists idx_candidates_job_id on public.candidates (job_id);
create index if not exists idx_candidates_doj_actual on public.candidates (doj_actual);
create index if not exists idx_interviews_candidate on public.interviews (candidate_id);
create index if not exists idx_interviews_scheduled on public.interviews (scheduled_at);
create index if not exists idx_co_sourcers_candidate on public.co_sourcers (candidate_id);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_sync_conflicts_rec on public.sync_conflicts (recruiter_id, resolution);
create index if not exists idx_activity_log_record on public.activity_log (table_name, record_id, changed_at desc);

create or replace function public.is_admin_or_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin','hr_manager')
      and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','masters','jd_library','jobs','candidates','custom_columns','job_recruiters',
    'co_sourcers','candidate_communications','candidate_files','ctc_templates','candidate_offers',
    'activity_log','ai_settings','assessments','assessment_jobs','deletion_requests',
    'email_templates','email_template_jobs','forms','form_job_links','form_responses',
    'google_drive_settings','hiring_requests','interviews','recruitment_forms',
    'screening_questions','sync_configs','sync_conflicts','backup_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists candidates_select_auth on public.candidates;
create policy candidates_select_auth on public.candidates for select to authenticated using (
  public.is_admin_or_hr()
  or hr_id = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.job_recruiters jr where jr.job_id = candidates.job_id and jr.recruiter_id = auth.uid())
);
drop policy if exists candidates_insert_auth on public.candidates;
create policy candidates_insert_auth on public.candidates for insert to authenticated with check (true);
drop policy if exists candidates_update_owner_admin on public.candidates;
create policy candidates_update_owner_admin on public.candidates for update to authenticated using (
  public.is_admin_or_hr() or hr_id = auth.uid() or created_by = auth.uid()
) with check (
  public.is_admin_or_hr() or hr_id = auth.uid() or created_by = auth.uid()
);
drop policy if exists candidates_delete_admin on public.candidates;
create policy candidates_delete_admin on public.candidates for delete to authenticated using (public.is_admin_or_hr());

do $$
declare
  t text;
begin
  foreach t in array array[
    'masters','jd_library','jobs','custom_columns','job_recruiters','co_sourcers',
    'candidate_communications','candidate_files','ctc_templates','candidate_offers',
    'activity_log','ai_settings','assessments','assessment_jobs','deletion_requests',
    'email_templates','email_template_jobs','forms','form_job_links','form_responses',
    'google_drive_settings','hiring_requests','interviews','recruitment_forms',
    'screening_questions','sync_configs','sync_conflicts','backup_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_auth', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_auth', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_auth', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete_auth', t);
  end loop;
end;
$$;

insert into public.masters (type, name, code, color, sort_order) values
  ('status', 'Sourced', 'SOURCED', '#6b7280', 10),
  ('status', 'Recruiter Screening Done', 'REC_SCREEN_DONE', '#0ea5e9', 20),
  ('status', 'Tel Int Scheduled', 'TEL_SCHEDULED', '#a78bfa', 30),
  ('status', 'Tel Int Done', 'TEL_DONE', '#8b5cf6', 40),
  ('status', 'Google Form Sent', 'GF_SENT', '#34d399', 50),
  ('status', 'Shortlisted by HR', 'SHORTLISTED_HR', '#10b981', 60),
  ('status', 'PI Scheduled', 'PI_SCHEDULED', '#818cf8', 70),
  ('status', 'PI Done', 'PI_DONE', '#6366f1', 80),
  ('status', 'Shortlisted by Mgmt', 'SHORTLISTED_MGMT', '#84cc16', 90),
  ('status', 'GF Issued', 'GF_ISSUED', '#fbbf24', 100),
  ('status', 'GF Received', 'GF_RECEIVED', '#f59e0b', 110),
  ('status', 'Appointed/Offered', 'APPOINTED', '#FF2D87', 120),
  ('status', 'Joined', 'JOINED', '#16a34a', 130),
  ('status', 'On Hold', 'ON_HOLD', '#d97706', 140),
  ('status', 'Rejected/Dropped', 'REJECTED', '#ef4444', 150),
  ('status', 'Offered But Not Joined', 'OFFERED_NOT_JOINED', '#dc2626', 160),
  ('site', 'Default Site', 'DEFAULT_SITE', null, 10),
  ('designation', 'General Role', 'GENERAL_ROLE', null, 10),
  ('source', 'Direct', 'DIRECT', null, 10),
  ('source', 'Naukri', 'NAUKRI', null, 20),
  ('department', 'HR', 'HR', null, 10)
on conflict (type, name) do nothing;

insert into public.email_templates (name, subject, body, template_type, variables) values
  (
    'Offer Letter - Standard',
    'Offer of Employment - {{designation}} at {{company}}',
    'Dear {{candidate_name}},' || chr(10) || chr(10) ||
    'We are pleased to offer you the position of {{designation}} at {{site}}.' || chr(10) || chr(10) ||
    'Your joining date is {{doj}}. Please confirm your acceptance by replying to this email.' || chr(10) || chr(10) ||
    'Regards,' || chr(10) || '{{hr_name}}',
    'offer',
    array['{{candidate_name}}','{{designation}}','{{company}}','{{site}}','{{doj}}','{{hr_name}}']
  ),
  (
    'Interview Invitation',
    'Interview Invitation - {{designation}} role',
    'Dear {{candidate_name}},' || chr(10) || chr(10) ||
    'We would like to invite you for a {{round}} interview for the {{designation}} position.' || chr(10) || chr(10) ||
    'Date: {{interview_date}}' || chr(10) ||
    'Time: {{interview_time}}' || chr(10) ||
    'Mode: {{interview_mode}}' || chr(10) ||
    '{{meet_link}}' || chr(10) || chr(10) ||
    'Regards,' || chr(10) || '{{hr_name}}',
    'interview',
    array['{{candidate_name}}','{{designation}}','{{round}}','{{interview_date}}','{{interview_time}}','{{interview_mode}}','{{meet_link}}','{{hr_name}}']
  ),
  (
    'Rejection - Post PI',
    'Regarding your application for {{designation}}',
    'Dear {{candidate_name}},' || chr(10) || chr(10) ||
    'Thank you for taking the time to interview with us for the {{designation}} position.' || chr(10) || chr(10) ||
    'After careful consideration, we have decided to move forward with other candidates at this time.' || chr(10) || chr(10) ||
    'Best regards,' || chr(10) || '{{hr_name}}',
    'rejection',
    array['{{candidate_name}}','{{designation}}','{{hr_name}}']
  )
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('candidate-files', 'candidate-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists candidate_files_storage_select on storage.objects;
create policy candidate_files_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'candidate-files');

drop policy if exists candidate_files_storage_insert on storage.objects;
create policy candidate_files_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'candidate-files');

drop policy if exists candidate_files_storage_update on storage.objects;
create policy candidate_files_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'candidate-files')
  with check (bucket_id = 'candidate-files');

drop policy if exists candidate_files_storage_delete on storage.objects;
create policy candidate_files_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'candidate-files');

commit;
