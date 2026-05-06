-- Resume keyword intelligence

alter table candidates
  add column if not exists parsed_keywords jsonb default '{}';

create index if not exists idx_candidates_parsed_keywords
  on candidates using gin (parsed_keywords);

create index if not exists idx_candidates_keywords_fts
  on candidates using gin (to_tsvector('english', coalesce(parsed_keywords->>'summary_tags', '')));

create table if not exists candidate_job_scores (
  id uuid default uuid_generate_v4() primary key,
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  fit_score smallint not null check (fit_score between 0 and 100),
  fit_breakdown jsonb default '{}',
  scored_at timestamptz default now(),
  scored_by_model text,
  unique (candidate_id, job_id)
);

create index if not exists idx_cjs_job_id on candidate_job_scores (job_id, fit_score desc);
create index if not exists idx_cjs_candidate_id on candidate_job_scores (candidate_id);

alter table candidate_job_scores enable row level security;

drop policy if exists "cjs_select_auth" on candidate_job_scores;
create policy "cjs_select_auth" on candidate_job_scores
  for select using (auth.role() = 'authenticated');

drop policy if exists "cjs_write_admin" on candidate_job_scores;
create policy "cjs_write_admin" on candidate_job_scores
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin','hr_manager','recruiter')
    )
  );

-- Keep the existing v_pipeline_funnel column order stable and append keyword fields.
create or replace view v_pipeline_funnel as
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
    from co_sourcers cs2
    join profiles pr on pr.id = cs2.recruiter_id
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
  case when c.final_status = 'Offered But Not Joined' then 1 else 0 end as offered_not_joined,
  c.parsed_keywords,
  (c.parsed_keywords->>'years_experience')::integer as kw_years_experience,
  c.parsed_keywords->'skills' as kw_skills,
  c.parsed_keywords->'summary_tags' as kw_summary_tags
from candidates c
left join profiles p on p.id = c.hr_id
left join masters ms on ms.id = c.site_id
left join masters md on md.id = c.designation_id
left join masters msrc on msrc.id = c.source_id
where c.is_deleted = false;
