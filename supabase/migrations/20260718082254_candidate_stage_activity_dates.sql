-- Track when candidate pipeline work actually happened, not only whether it ever happened.
-- Business-day reporting is based on Asia/Kolkata.

alter table public.candidates
  add column if not exists naukri_link text,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists custom_data jsonb not null default '{}'::jsonb,
  add column if not exists parsed_keywords jsonb not null default '{}'::jsonb,
  add column if not exists kw_years_experience numeric,
  add column if not exists google_form_sent_date date,
  add column if not exists google_form_received_date date,
  add column if not exists processed_by_hr_date date,
  add column if not exists shortlist_by_hr_date date,
  add column if not exists shortlisted_for_pi_date date,
  add column if not exists shortlisted_by_mgmt_date date,
  add column if not exists offered_date date,
  add column if not exists offered_not_joined_date date,
  add column if not exists final_status_date date;

create or replace function public.candidate_stage_value_is_positive(value text)
returns boolean
language sql
immutable
as $$
  select coalesce(nullif(trim(lower(value)), ''), '') not in ('', 'n', 'no', 'na', 'n/a', 'false', '0')
$$;

create or replace function public.set_candidate_stage_activity_dates()
returns trigger
language plpgsql
as $$
declare
  business_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if new.application_date is null then
    new.application_date := business_today;
  end if;

  if tg_op = 'INSERT' then
    if new.google_form_sent_date is null and public.candidate_stage_value_is_positive(new.google_form_sent) then
      new.google_form_sent_date := business_today;
    end if;
    if new.google_form_received_date is null and public.candidate_stage_value_is_positive(new.google_form_received) then
      new.google_form_received_date := business_today;
    end if;
    if new.processed_by_hr_date is null and public.candidate_stage_value_is_positive(new.processed_by_hr) then
      new.processed_by_hr_date := business_today;
    end if;
    if new.shortlist_by_hr_date is null and public.candidate_stage_value_is_positive(new.shortlist_by_hr) then
      new.shortlist_by_hr_date := business_today;
    end if;
    if new.shortlisted_for_pi_date is null and public.candidate_stage_value_is_positive(new.shortlisted_for_pi) then
      new.shortlisted_for_pi_date := business_today;
    end if;
    if new.shortlisted_by_mgmt_date is null and public.candidate_stage_value_is_positive(new.shortlisted_by_mgmt) then
      new.shortlisted_by_mgmt_date := business_today;
    end if;
  else
    if new.google_form_sent is distinct from old.google_form_sent then
      if public.candidate_stage_value_is_positive(new.google_form_sent) and new.google_form_sent_date is null then
        new.google_form_sent_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.google_form_sent) then
        new.google_form_sent_date := null;
      end if;
    end if;

    if new.google_form_received is distinct from old.google_form_received then
      if public.candidate_stage_value_is_positive(new.google_form_received) and new.google_form_received_date is null then
        new.google_form_received_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.google_form_received) then
        new.google_form_received_date := null;
      end if;
    end if;

    if new.processed_by_hr is distinct from old.processed_by_hr then
      if public.candidate_stage_value_is_positive(new.processed_by_hr) and new.processed_by_hr_date is null then
        new.processed_by_hr_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.processed_by_hr) then
        new.processed_by_hr_date := null;
      end if;
    end if;

    if new.shortlist_by_hr is distinct from old.shortlist_by_hr then
      if public.candidate_stage_value_is_positive(new.shortlist_by_hr) and new.shortlist_by_hr_date is null then
        new.shortlist_by_hr_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.shortlist_by_hr) then
        new.shortlist_by_hr_date := null;
      end if;
    end if;

    if new.shortlisted_for_pi is distinct from old.shortlisted_for_pi then
      if public.candidate_stage_value_is_positive(new.shortlisted_for_pi) and new.shortlisted_for_pi_date is null then
        new.shortlisted_for_pi_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.shortlisted_for_pi) then
        new.shortlisted_for_pi_date := null;
      end if;
    end if;

    if new.shortlisted_by_mgmt is distinct from old.shortlisted_by_mgmt then
      if public.candidate_stage_value_is_positive(new.shortlisted_by_mgmt) and new.shortlisted_by_mgmt_date is null then
        new.shortlisted_by_mgmt_date := business_today;
      elsif not public.candidate_stage_value_is_positive(new.shortlisted_by_mgmt) then
        new.shortlisted_by_mgmt_date := null;
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.final_status is distinct from old.final_status then
    new.final_status_date := business_today;
  elsif tg_op = 'INSERT' and new.final_status_date is null and nullif(trim(coalesce(new.final_status, '')), '') is not null then
    new.final_status_date := business_today;
  end if;

  if lower(coalesce(new.final_status, '')) in ('offered', 'appointed', 'appointed/offered') and new.offered_date is null then
    new.offered_date := business_today;
  end if;

  if lower(coalesce(new.final_status, '')) in ('offered but did not join', 'offered but not joined') and new.offered_not_joined_date is null then
    new.offered_not_joined_date := business_today;
  end if;

  if lower(coalesce(new.final_status, '')) in ('joined', 'active employee') and new.doj_actual is null then
    new.doj_actual := business_today;
  end if;

  return new;
end;
$$;

drop trigger if exists candidates_stage_activity_dates on public.candidates;
create trigger candidates_stage_activity_dates
  before insert or update on public.candidates
  for each row
  execute function public.set_candidate_stage_activity_dates();

update public.candidates
set
  google_form_sent_date = case
    when google_form_sent_date is null and public.candidate_stage_value_is_positive(google_form_sent)
      then coalesce(updated_at, created_at, now())::date
    else google_form_sent_date
  end,
  google_form_received_date = case
    when google_form_received_date is null and public.candidate_stage_value_is_positive(google_form_received)
      then coalesce(updated_at, created_at, now())::date
    else google_form_received_date
  end,
  processed_by_hr_date = case
    when processed_by_hr_date is null and public.candidate_stage_value_is_positive(processed_by_hr)
      then coalesce(updated_at, created_at, now())::date
    else processed_by_hr_date
  end,
  shortlist_by_hr_date = case
    when shortlist_by_hr_date is null and public.candidate_stage_value_is_positive(shortlist_by_hr)
      then coalesce(updated_at, created_at, now())::date
    else shortlist_by_hr_date
  end,
  shortlisted_for_pi_date = case
    when shortlisted_for_pi_date is null and public.candidate_stage_value_is_positive(shortlisted_for_pi)
      then coalesce(updated_at, created_at, now())::date
    else shortlisted_for_pi_date
  end,
  shortlisted_by_mgmt_date = case
    when shortlisted_by_mgmt_date is null and public.candidate_stage_value_is_positive(shortlisted_by_mgmt)
      then coalesce(updated_at, created_at, now())::date
    else shortlisted_by_mgmt_date
  end,
  offered_date = case
    when offered_date is null and lower(coalesce(final_status, '')) in ('offered', 'appointed', 'appointed/offered')
      then coalesce(updated_at, created_at, now())::date
    else offered_date
  end,
  offered_not_joined_date = case
    when offered_not_joined_date is null and lower(coalesce(final_status, '')) in ('offered but did not join', 'offered but not joined')
      then coalesce(updated_at, created_at, now())::date
    else offered_not_joined_date
  end,
  final_status_date = case
    when final_status_date is null and nullif(trim(coalesce(final_status, '')), '') is not null
      then coalesce(updated_at, created_at, now())::date
    else final_status_date
  end
where is_deleted = false;

create index if not exists idx_candidates_activity_application_date on public.candidates (application_date) where is_deleted = false;
create index if not exists idx_candidates_activity_tel_int_date on public.candidates (tel_int_date) where is_deleted = false;
create index if not exists idx_candidates_activity_google_form_sent_date on public.candidates (google_form_sent_date) where is_deleted = false;
create index if not exists idx_candidates_activity_google_form_received_date on public.candidates (google_form_received_date) where is_deleted = false;
create index if not exists idx_candidates_activity_shortlist_by_hr_date on public.candidates (shortlist_by_hr_date) where is_deleted = false;
create index if not exists idx_candidates_activity_pi1_date on public.candidates (pi1_date) where is_deleted = false;
create index if not exists idx_candidates_activity_pi2_date on public.candidates (pi2_date) where is_deleted = false;
create index if not exists idx_candidates_activity_pi3_date on public.candidates (pi3_date) where is_deleted = false;
create index if not exists idx_candidates_activity_shortlisted_by_mgmt_date on public.candidates (shortlisted_by_mgmt_date) where is_deleted = false;
create index if not exists idx_candidates_activity_gf_issue_date on public.candidates (gf_issue_date) where is_deleted = false;
create index if not exists idx_candidates_activity_gf_received_date on public.candidates (gf_received_date) where is_deleted = false;
create index if not exists idx_candidates_activity_offered_date on public.candidates (offered_date) where is_deleted = false;
create index if not exists idx_candidates_activity_offered_not_joined_date on public.candidates (offered_not_joined_date) where is_deleted = false;
create index if not exists idx_candidates_activity_doj_actual on public.candidates (doj_actual) where is_deleted = false;

drop view if exists public.v_pipeline_funnel;

create view public.v_pipeline_funnel
with (security_invoker = true)
as
select
  c.id,
  c.sr_no,
  c.name,
  c.month,
  c.application_date,
  c.google_form_sent_date,
  c.google_form_received_date,
  c.processed_by_hr_date,
  c.shortlist_by_hr_date,
  c.tel_int_date,
  c.shortlisted_for_pi_date,
  c.pi1_date,
  c.pi2_date,
  c.pi3_date,
  c.shortlisted_by_mgmt_date,
  c.gf_issue_date,
  c.gf_received_date,
  c.offered_date,
  c.offered_not_joined_date,
  c.final_status_date,
  c.doj,
  c.doj_potential,
  c.doj_actual,
  c.final_status,
  c.present_salary,
  c.expected_salary,
  c.offered_salary,
  c.mobile,
  c.email,
  c.current_location,
  c.current_designation,
  c.naukri_link,
  c.naukri_profile_url,
  c.ai_score,
  c.ai_summary,
  c.parsed_keywords,
  c.kw_years_experience,
  c.cv_drive_url,
  c.cv_filename,
  c.notice_period_days,
  c.staffingo_emp_id,
  c.job_id,
  c.custom_data,
  c.referred_by,
  c.is_deleted,
  c.portal_token,
  c.created_at,
  c.updated_at,
  p.name as hr_name,
  p.id as hr_id,
  ms.name as site_name,
  ms.id as site_id,
  md.name as designation_name,
  md.id as designation_id,
  msrc.name as source_name,
  msrc.id as source_id,
  (
    select string_agg(pr.name, ', ')
    from public.co_sourcers cs2
    join public.profiles pr on pr.id = cs2.recruiter_id
    where cs2.candidate_id = c.id and cs2.role = 'co_sourcer'
  ) as co_sourcer_names,
  case when c.tel_int_date is not null then 1 else 0 end as tel_int_done,
  case when public.candidate_stage_value_is_positive(c.google_form_sent) then 1 else 0 end as gf_sent,
  case when public.candidate_stage_value_is_positive(c.google_form_received) then 1 else 0 end as gf_received,
  case when public.candidate_stage_value_is_positive(c.shortlist_by_hr) then 1 else 0 end as shortlisted_hr,
  case when c.pi1_date is not null or c.pi2_date is not null or c.pi3_date is not null then 1 else 0 end as pi_done,
  case when c.pi2_date is not null then 1 else 0 end as pi2_done,
  case when c.pi3_date is not null then 1 else 0 end as pi3_done,
  case when public.candidate_stage_value_is_positive(c.shortlisted_by_mgmt) then 1 else 0 end as shortlisted_mgmt,
  case when c.gf_issue_date is not null then 1 else 0 end as gf_issued,
  case when c.gf_issue_date is not null then 1 else 0 end as gf_issued_flag,
  case when c.gf_received_date is not null then 1 else 0 end as gf_recv,
  case when lower(coalesce(c.final_status, '')) in ('offered', 'appointed', 'appointed/offered') then 1 else 0 end as appointed,
  case when c.doj_actual is not null or c.doj is not null then 1 else 0 end as joined,
  case when lower(coalesce(c.final_status, '')) in ('offered but did not join', 'offered but not joined') then 1 else 0 end as offered_not_joined
from public.candidates c
left join public.profiles p on p.id = c.hr_id
left join public.masters ms on ms.id = c.site_id
left join public.masters md on md.id = c.designation_id
left join public.masters msrc on msrc.id = c.source_id
where c.is_deleted = false;

grant select on public.v_pipeline_funnel to authenticated;

-- Verification after applying:
-- select
--   count(*) filter (where google_form_sent_date is not null) as google_form_sent_dates,
--   count(*) filter (where google_form_received_date is not null) as google_form_received_dates,
--   count(*) filter (where shortlist_by_hr_date is not null) as shortlist_by_hr_dates,
--   count(*) filter (where shortlisted_for_pi_date is not null) as shortlisted_for_pi_dates,
--   count(*) filter (where shortlisted_by_mgmt_date is not null) as shortlisted_by_mgmt_dates,
--   count(*) filter (where offered_date is not null) as offered_dates,
--   count(*) filter (where offered_not_joined_date is not null) as offered_not_joined_dates,
--   count(*) filter (where final_status_date is not null) as final_status_dates
-- from public.candidates
-- where is_deleted = false;
