-- Follow-up Automation module
-- Idempotent migration intended to run after schema_v3/schema_full.

do $$ begin
  create type automation_channel as enum ('whatsapp', 'email', 'sms', 'in_app');
exception when duplicate_object then null; end $$;

do $$ begin
  create type automation_trigger as enum (
    'stage_change','no_recruiter_contact','interview_scheduled','interview_upcoming',
    'interview_done_no_feedback','offer_sent_no_response','candidate_no_show','job_stale',
    'candidate_joined','schedule_daily_digest','schedule_weekly_summary','gf_no_return',
    'offer_not_joined'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type automation_action as enum (
    'send_candidate_message','notify_recruiter','notify_hr_manager',
    'notify_interviewer','stop_all_followups'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type followup_status as enum ('pending', 'sent', 'skipped', 'cancelled', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status as enum ('success', 'failed', 'skipped', 'dry_run');
exception when duplicate_object then null; end $$;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel automation_channel not null,
  subject text,
  body text not null,
  variables text[] not null default '{}',
  category text not null default 'general'
    check (category in ('intro','interview_reminder','offer_followup','recruiter_alert','digest','welcome','stale_alert','custom')),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  trigger_type automation_trigger not null,
  conditions jsonb not null default '{}'::jsonb,
  action_type automation_action not null,
  template_id uuid references public.message_templates(id) on delete set null,
  action_config jsonb not null default '{}'::jsonb,
  delay_hours integer not null default 0,
  max_per_candidate integer not null default 5,
  cooldown_hours integer not null default 48,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_followups (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  status followup_status not null default 'pending',
  scheduled_at timestamptz not null,
  executed_at timestamptz,
  trigger_context jsonb not null default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  followup_id uuid references public.candidate_followups(id) on delete set null,
  rule_id uuid references public.automation_rules(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete cascade,
  channel automation_channel,
  recipient_type text check (recipient_type in ('candidate','recruiter','hr_manager','interviewer')),
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_phone text,
  recipient_email text,
  subject text,
  body text,
  status run_status not null,
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null default 'live' check (mode in ('live','dry_run')),
  followups_evaluated integer not null default 0,
  followups_sent integer not null default 0,
  followups_skipped integer not null default 0,
  followups_failed integer not null default 0,
  error_message text
);

create table if not exists public.automation_settings (
  id uuid primary key default gen_random_uuid(),
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_whatsapp_from text,
  resend_api_key text,
  resend_from_email text,
  resend_from_name text,
  is_live boolean not null default false,
  company_name text not null default 'HireRabbits',
  daily_digest_time text not null default '09:00',
  weekly_digest_day text not null default 'monday',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_followups_pending on public.candidate_followups (status, scheduled_at) where status = 'pending';
create index if not exists idx_followups_candidate on public.candidate_followups (candidate_id, status);
create index if not exists idx_comm_logs_candidate on public.communication_logs (candidate_id);
create index if not exists idx_comm_logs_rule on public.communication_logs (rule_id);

create or replace function public.set_automation_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at before update on public.message_templates
for each row execute function public.set_automation_updated_at();

drop trigger if exists trg_automation_rules_updated_at on public.automation_rules;
create trigger trg_automation_rules_updated_at before update on public.automation_rules
for each row execute function public.set_automation_updated_at();

drop trigger if exists trg_candidate_followups_updated_at on public.candidate_followups;
create trigger trg_candidate_followups_updated_at before update on public.candidate_followups
for each row execute function public.set_automation_updated_at();

drop trigger if exists trg_automation_settings_updated_at on public.automation_settings;
create trigger trg_automation_settings_updated_at before update on public.automation_settings
for each row execute function public.set_automation_updated_at();

insert into public.automation_settings (is_live)
select false
where not exists (select 1 from public.automation_settings);

insert into public.message_templates (name, channel, subject, body, variables, category, is_system)
values
('Intro on New Candidate','whatsapp',null,'Hi {{candidate_name}}, thanks for your interest in {{company_name}}. We have received your profile for {{job_title}} at {{site}}. {{recruiter_name}} will guide you through next steps.','{candidate_name,company_name,job_title,site,recruiter_name}','intro',true),
('Interview Scheduled Confirmation','whatsapp',null,'Hi {{candidate_name}}, your {{interview_round}} interview is scheduled on {{interview_date}} at {{interview_time}}. Link/location: {{interview_link}}. Regards, {{company_name}}.','{candidate_name,interview_round,interview_date,interview_time,interview_link,company_name}','interview_reminder',true),
('Interview Tomorrow Reminder','whatsapp',null,'Reminder: Hi {{candidate_name}}, your interview for {{job_title}} is tomorrow at {{interview_time}}. Please be available on {{interview_link}}.','{candidate_name,job_title,interview_time,interview_link}','interview_reminder',true),
('Interview 2-Hour Reminder','whatsapp',null,'Hi {{candidate_name}}, your interview starts in about 2 hours at {{interview_time}}. Join using {{interview_link}}.','{candidate_name,interview_time,interview_link}','interview_reminder',true),
('Offer Follow-up WhatsApp','whatsapp',null,'Hi {{candidate_name}}, we shared your offer for {{designation}}. Please confirm acceptance or contact {{recruiter_name}} for any clarification.','{candidate_name,designation,recruiter_name}','offer_followup',true),
('Offer Follow-up Email','email','Offer Follow-up - {{company_name}}','Dear {{candidate_name}},\n\nWe are following up on your offer for {{designation}} with CTC {{offered_ctc}} and DOJ {{doj}}. Please reply with your confirmation.\n\nRegards,\n{{company_name}}','{candidate_name,designation,offered_ctc,doj,company_name}','offer_followup',true),
('GF Return Follow-up','whatsapp',null,'Hi {{candidate_name}}, we are yet to receive your completed joining form. Please return it so we can proceed with joining formalities.','{candidate_name}','offer_followup',true),
('Welcome on Join','whatsapp',null,'Welcome aboard, {{candidate_name}}. We are glad to have you at {{company_name}}.','{candidate_name,company_name}','welcome',true),
('Recruiter No Contact Alert','email','Candidate follow-up pending: {{candidate_name}}','Hi {{recruiter_name}},\n\n{{candidate_name}} is at {{stage}} and needs follow-up. Please update the candidate record after contact.\n\n- HireRabbits Automation','{recruiter_name,candidate_name,stage}','recruiter_alert',true),
('Recruiter Interview Feedback Alert','email','Feedback pending: {{candidate_name}}','Hi {{recruiter_name}},\n\nInterview feedback is pending for {{candidate_name}}. Please coordinate and update the interview outcome.\n\n- HireRabbits Automation','{recruiter_name,candidate_name}','recruiter_alert',true),
('HR Job Stale Alert','email','Stale job alert: {{job_title}}','Hi {{hr_manager_name}},\n\nThe job {{job_title}} has low candidate movement. Please review pipeline coverage.\n\n- HireRabbits Automation','{hr_manager_name,job_title}','stale_alert',true),
('Recruiter Offer Not Joined Alert','email','Offer not joined: {{candidate_name}}','Hi {{recruiter_name}},\n\n{{candidate_name}} is marked Offered But Not Joined. Please follow up and update remarks.\n\n- HireRabbits Automation','{recruiter_name,candidate_name}','recruiter_alert',true),
('Daily Recruiter Digest','email','Daily Follow-up Digest - {{interview_date}}','Hi {{recruiter_name}},\n\nHere is your daily follow-up digest. Log in to HireRabbits for details.\n\n- HireRabbits Automation','{recruiter_name,interview_date}','digest',true),
('Weekly HR Summary','email','Weekly Pipeline Summary - Week of {{interview_date}}','Hi {{hr_manager_name}},\n\nHere is your weekly recruitment summary. Log in to HireRabbits for full pipeline details.\n\n- HireRabbits Automation','{hr_manager_name,interview_date}','digest',true)
on conflict do nothing;

with t as (select id, name from public.message_templates)
insert into public.automation_rules
(name, description, trigger_type, conditions, action_type, template_id, action_config, delay_hours, max_per_candidate, cooldown_hours, sort_order)
values
('Intro on New Candidate','Send intro after sourcing','stage_change','{"stage":"Sourced"}','send_candidate_message',(select id from t where name='Intro on New Candidate'),'{"channel":"whatsapp"}',2,1,168,1),
('Interview Scheduled Confirmation','Confirm new interview','interview_scheduled','{}','send_candidate_message',(select id from t where name='Interview Scheduled Confirmation'),'{"channel":"whatsapp"}',0,5,1,2),
('Interview Tomorrow Reminder','24-hour interview reminder','interview_upcoming','{"hours_before":24}','send_candidate_message',(select id from t where name='Interview Tomorrow Reminder'),'{"channel":"whatsapp"}',0,5,1,3),
('Interview 2-Hour Reminder','2-hour interview reminder','interview_upcoming','{"hours_before":2}','send_candidate_message',(select id from t where name='Interview 2-Hour Reminder'),'{"channel":"whatsapp"}',0,5,1,4),
('Offer Follow-up (48h)','WhatsApp offer follow-up','offer_sent_no_response','{"hours":48}','send_candidate_message',(select id from t where name='Offer Follow-up WhatsApp'),'{"channel":"whatsapp"}',0,3,24,5),
('Offer Follow-up (72h)','Email offer follow-up','offer_sent_no_response','{"hours":72}','send_candidate_message',(select id from t where name='Offer Follow-up Email'),'{"channel":"email"}',0,3,24,6),
('GF Return Follow-up','GF return reminder','gf_no_return','{"hours":120}','send_candidate_message',(select id from t where name='GF Return Follow-up'),'{"channel":"whatsapp"}',0,3,48,7),
('Welcome on Join','Welcome candidate after joining','candidate_joined','{}','send_candidate_message',(select id from t where name='Welcome on Join'),'{"channel":"whatsapp"}',1,1,168,8),
('Stop on Join','Cancel pending follow-ups on join','candidate_joined','{}','stop_all_followups',null,'{}',0,1,0,9),
('Stop on Rejected','Cancel pending follow-ups on rejection','stage_change','{"stage":"Rejected/Dropped"}','stop_all_followups',null,'{}',0,1,0,10),
('No Contact After Sourcing','Recruiter alert after 24h','no_recruiter_contact','{"stage":"Sourced","hours":24}','notify_recruiter',(select id from t where name='Recruiter No Contact Alert'),'{"channel":"email"}',0,5,24,11),
('No Next Step After Tel Int','Recruiter alert after tel interview','no_recruiter_contact','{"stage":"Tel Int Done","hours":48}','notify_recruiter',(select id from t where name='Recruiter No Contact Alert'),'{"channel":"email"}',0,5,24,12),
('No Feedback After PI','Interview feedback alert','interview_done_no_feedback','{"rounds":["pi1","pi2","pi3"],"hours":24}','notify_recruiter',(select id from t where name='Recruiter Interview Feedback Alert'),'{"channel":"email"}',0,5,24,13),
('No Feedback After Final','Final feedback alert','interview_done_no_feedback','{"rounds":["final"],"hours":24}','notify_recruiter',(select id from t where name='Recruiter Interview Feedback Alert'),'{"channel":"email"}',0,5,24,14),
('Candidate No Show Alert','No-show recruiter alert','candidate_no_show','{}','notify_recruiter',(select id from t where name='Recruiter Interview Feedback Alert'),'{"channel":"email"}',0,5,24,15),
('Stale Job Alert (7d)','Low pipeline job alert','job_stale','{"days":7,"min_candidates":3}','notify_hr_manager',(select id from t where name='HR Job Stale Alert'),'{"channel":"email"}',0,5,168,16),
('Stale Job Alert (14d)','Low pipeline job escalation','job_stale','{"days":14,"min_candidates":5}','notify_hr_manager',(select id from t where name='HR Job Stale Alert'),'{"channel":"email"}',0,5,168,17),
('Daily Recruiter Digest','Daily digest email','schedule_daily_digest','{}','notify_recruiter',(select id from t where name='Daily Recruiter Digest'),'{"channel":"email"}',0,365,12,18),
('Weekly HR Summary','Weekly digest email','schedule_weekly_summary','{}','notify_hr_manager',(select id from t where name='Weekly HR Summary'),'{"channel":"email"}',0,52,144,19),
('Offer Not Joined Alert','Recruiter alert for stale not-joined offers','offer_not_joined','{"days":14}','notify_recruiter',(select id from t where name='Recruiter Offer Not Joined Alert'),'{"channel":"email"}',0,5,168,20),
('GF Sent No Return (72h)','Early GF reminder','gf_no_return','{"hours":72}','send_candidate_message',(select id from t where name='GF Return Follow-up'),'{"channel":"whatsapp"}',0,3,48,21),
('Offer Follow-up Recruiter Alert','Alert recruiter after offer delay','offer_sent_no_response','{"hours":96}','notify_recruiter',(select id from t where name='Recruiter Offer Not Joined Alert'),'{"channel":"email"}',0,3,48,22),
('Interview Upcoming Recruiter Check','Alert recruiter before interview','interview_upcoming','{"hours_before":4}','notify_recruiter',(select id from t where name='Recruiter Interview Feedback Alert'),'{"channel":"email"}',0,5,1,23),
('Onboarding DOJ Reminder','Candidate DOJ reminder','stage_change','{"stage":"Appointed/Offered"}','send_candidate_message',(select id from t where name='Offer Follow-up WhatsApp'),'{"channel":"whatsapp"}',72,2,72,24)
on conflict (name) do nothing;

alter table public.message_templates enable row level security;
alter table public.automation_rules enable row level security;
alter table public.candidate_followups enable row level security;
alter table public.communication_logs enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_settings enable row level security;

do $$ begin
  create policy templates_read on public.message_templates for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy templates_write on public.message_templates for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy rules_read on public.automation_rules for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy rules_write on public.automation_rules for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy followups_read on public.candidate_followups for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager'))
    or exists (select 1 from public.candidates c where c.id = candidate_id and (c.created_by = auth.uid() or c.hr_id = auth.uid()))
    or exists (select 1 from public.co_sourcers cs where cs.candidate_id = candidate_id and cs.recruiter_id = auth.uid())
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy followups_update on public.candidate_followups for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager'))
    or exists (select 1 from public.candidates c where c.id = candidate_id and (c.created_by = auth.uid() or c.hr_id = auth.uid()))
    or exists (select 1 from public.co_sourcers cs where cs.candidate_id = candidate_id and cs.recruiter_id = auth.uid())
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy comm_logs_read on public.communication_logs for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy runs_read on public.automation_runs for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','hr_manager')));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy settings_read on public.automation_settings for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy settings_write on public.automation_settings for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
exception when duplicate_object then null; end $$;
