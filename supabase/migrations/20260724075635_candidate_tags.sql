create table if not exists public.candidate_tags (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tag_id uuid not null references public.masters(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (candidate_id, tag_id)
);

create index if not exists idx_candidate_tags_tag_id on public.candidate_tags (tag_id);
create index if not exists idx_candidate_tags_candidate_id on public.candidate_tags (candidate_id);

alter table public.candidate_tags enable row level security;

grant select, insert, update, delete on public.candidate_tags to authenticated;

drop policy if exists candidate_tags_select_participants on public.candidate_tags;
create policy candidate_tags_select_participants
  on public.candidate_tags
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'hr_manager')
    )
    or exists (
      select 1
      from public.candidates c
      where c.id = candidate_tags.candidate_id
        and c.hr_id = (select auth.uid())
        and c.is_deleted = false
    )
    or exists (
      select 1
      from public.candidate_forwards cf
      where cf.candidate_id = candidate_tags.candidate_id
        and cf.to_user_id = (select auth.uid())
    )
  );

drop policy if exists candidate_tags_insert_hr_or_owner on public.candidate_tags;
create policy candidate_tags_insert_hr_or_owner
  on public.candidate_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'hr_manager')
    )
    or exists (
      select 1
      from public.candidates c
      where c.id = candidate_tags.candidate_id
        and c.hr_id = (select auth.uid())
        and c.is_deleted = false
    )
  );

drop policy if exists candidate_tags_update_hr_or_owner on public.candidate_tags;
create policy candidate_tags_update_hr_or_owner
  on public.candidate_tags
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'hr_manager')
    )
    or exists (
      select 1
      from public.candidates c
      where c.id = candidate_tags.candidate_id
        and c.hr_id = (select auth.uid())
        and c.is_deleted = false
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'hr_manager')
    )
    or exists (
      select 1
      from public.candidates c
      where c.id = candidate_tags.candidate_id
        and c.hr_id = (select auth.uid())
        and c.is_deleted = false
    )
  );

drop policy if exists candidate_tags_delete_hr_or_owner on public.candidate_tags;
create policy candidate_tags_delete_hr_or_owner
  on public.candidate_tags
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin', 'hr_manager')
    )
    or exists (
      select 1
      from public.candidates c
      where c.id = candidate_tags.candidate_id
        and c.hr_id = (select auth.uid())
        and c.is_deleted = false
    )
  );

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
  coalesce((
    select array_agg(mt.id::text order by lower(mt.name), mt.id::text)
    from public.candidate_tags ct
    join public.masters mt on mt.id = ct.tag_id
    where ct.candidate_id = c.id
      and mt.type = 'tag'
      and mt.is_active = true
  ), array[]::text[]) as tag_ids,
  coalesce((
    select array_agg(mt.name order by lower(mt.name), mt.id::text)
    from public.candidate_tags ct
    join public.masters mt on mt.id = ct.tag_id
    where ct.candidate_id = c.id
      and mt.type = 'tag'
      and mt.is_active = true
  ), array[]::text[]) as tag_names,
  coalesce((
    select array_agg(coalesce(mt.color, '') order by lower(mt.name), mt.id::text)
    from public.candidate_tags ct
    join public.masters mt on mt.id = ct.tag_id
    where ct.candidate_id = c.id
      and mt.type = 'tag'
      and mt.is_active = true
  ), array[]::text[]) as tag_colors,
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
