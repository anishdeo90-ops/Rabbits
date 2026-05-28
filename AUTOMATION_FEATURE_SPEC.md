# Follow-up Automation Module — Full Engineering Spec for Codex
**HireRabbits ATS · Next.js 14 + Supabase**

---

## 0. Context: Existing Codebase Conventions

Before building, internalize these patterns already in use:

- **Supabase clients**: `lib/supabase/server.ts` exports `createClient()` (cookie-auth) and `createAdminClient()` (service role). Always use `createAdminClient()` in cron/background routes.
- **API routes**: All under `app/api/`. Fetch user from `profiles` table after `supabase.auth.getUser()`. Role stored as `profile.role` — values: `"admin" | "hr_manager" | "recruiter" | "hod"`.
- **Frontend data fetching**: `fetch()` inside `useEffect` / `useCallback`. No SWR. Manual loading + error state.
- **Modals**: Fixed overlay `.fixed .inset-0 .z-50` + centred `.rounded-2xl .shadow-2xl` card. Click backdrop to close.
- **Candidate search autocomplete**: debounce 250ms → `GET /api/candidates?search=q&limit=8`.
- **Tailwind + clsx**: use `cn()` from `lib/utils.ts` for conditional classes.
- **No existing cron system** — must build from scratch using Vercel Cron Jobs.
- **Existing comms table**: `candidate_communications` stores all human-logged comms. Automation-sent messages must ALSO be written here so they appear in the existing communication tracker.

---

## 1. Feature Overview

Build a **Follow-up Automation** module that:

1. Lets admins/HR managers define **automation rules** (trigger condition → delay → action).
2. Maintains a **scheduled queue** (`candidate_followups`) of pending actions per candidate.
3. Runs a **background evaluator** every 15 minutes (Vercel Cron) that processes the queue.
4. **Delivers messages** via WhatsApp (Twilio) and Email (Resend) — provider configured in Settings.
5. Provides a **UI** at `/automation` for managing templates, rules, and viewing run history.
6. Automatically **stops follow-ups** when candidates reach terminal stages (Joined, Rejected/Dropped).
7. **Logs every sent message** into `candidate_communications` so it appears in the existing comm tracker.

---

## 2. Database Schema

Run this SQL in Supabase SQL Editor after the existing `schema_v3.sql`.

```sql
-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────

CREATE TYPE automation_channel AS ENUM ('whatsapp', 'email', 'sms', 'in_app');
CREATE TYPE automation_trigger AS ENUM (
  'stage_change',
  'no_recruiter_contact',
  'interview_scheduled',
  'interview_upcoming',
  'interview_done_no_feedback',
  'offer_sent_no_response',
  'candidate_no_show',
  'job_stale',
  'candidate_joined',
  'schedule_daily_digest',
  'schedule_weekly_summary',
  'gf_no_return',
  'offer_not_joined'
);
CREATE TYPE automation_action AS ENUM (
  'send_candidate_message',
  'notify_recruiter',
  'notify_hr_manager',
  'notify_interviewer',
  'stop_all_followups'
);
CREATE TYPE followup_status AS ENUM ('pending', 'sent', 'skipped', 'cancelled', 'failed');
CREATE TYPE run_status AS ENUM ('success', 'failed', 'skipped', 'dry_run');

-- ─────────────────────────────────────────────
-- TABLE 1: message_templates
-- ─────────────────────────────────────────────
CREATE TABLE message_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  channel         automation_channel NOT NULL,
  subject         TEXT,                      -- email only; ignored for WhatsApp/SMS
  body            TEXT NOT NULL,             -- plain text; use {{variable_name}} placeholders
  variables       TEXT[] NOT NULL DEFAULT '{}',
  -- Variables available: candidate_name, recruiter_name, hr_manager_name,
  --   job_title, designation, site, interview_date, interview_time,
  --   interview_link, interview_round, offered_ctc, doj, company_name
  category        TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('intro','interview_reminder','offer_followup',
                        'recruiter_alert','digest','welcome','stale_alert','custom')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,  -- seeded templates; cannot be deleted
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- TABLE 2: automation_rules
-- ─────────────────────────────────────────────
CREATE TABLE automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  trigger_type    automation_trigger NOT NULL,

  -- Flexible trigger parameters (JSONB — see Section 3 for exact shapes per trigger)
  conditions      JSONB NOT NULL DEFAULT '{}',

  action_type     automation_action NOT NULL,

  -- Action parameters
  template_id     UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  action_config   JSONB NOT NULL DEFAULT '{}',
  -- For send_candidate_message: { "channel": "whatsapp" }
  -- For notify_recruiter:       { "channel": "email", "fallback_in_app": true }
  -- For notify_hr_manager:      { "channel": "email" }
  -- For notify_interviewer:     { "channel": "email" }
  -- For stop_all_followups:     {}

  delay_hours     INTEGER NOT NULL DEFAULT 0,        -- wait N hours after trigger fires
  max_per_candidate INTEGER NOT NULL DEFAULT 5,      -- safety cap: max times rule fires per candidate
  cooldown_hours  INTEGER NOT NULL DEFAULT 48,       -- min gap between repeat fires for same candidate

  sort_order      INTEGER NOT NULL DEFAULT 0,        -- display ordering in UI
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- TABLE 3: candidate_followups
-- Scheduled/pending execution queue per candidate
-- ─────────────────────────────────────────────
CREATE TABLE candidate_followups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,

  status          followup_status NOT NULL DEFAULT 'pending',

  scheduled_at    TIMESTAMPTZ NOT NULL,
  executed_at     TIMESTAMPTZ,

  -- Context captured when the followup was queued
  trigger_context JSONB NOT NULL DEFAULT '{}',
  -- e.g. { "stage": "Tel Int Done", "interview_id": "uuid", "triggered_at": "iso8601" }

  result          JSONB DEFAULT '{}',
  -- e.g. { "provider_message_id": "SM...", "channel": "whatsapp", "to": "+919..." }

  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_followups_pending ON candidate_followups (status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_followups_candidate ON candidate_followups (candidate_id, status);

-- ─────────────────────────────────────────────
-- TABLE 4: communication_logs (automation-specific view helper)
-- NOTE: actual delivery records also written to candidate_communications
-- This table is the raw automation delivery log (all attempts, including failures)
-- ─────────────────────────────────────────────
CREATE TABLE communication_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id     UUID REFERENCES candidate_followups(id) ON DELETE SET NULL,
  rule_id         UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  candidate_id    UUID REFERENCES candidates(id) ON DELETE CASCADE,

  channel         automation_channel,
  recipient_type  TEXT CHECK (recipient_type IN ('candidate','recruiter','hr_manager','interviewer')),
  recipient_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- null when recipient is candidate
  recipient_phone TEXT,
  recipient_email TEXT,

  subject         TEXT,
  body            TEXT,                    -- resolved body after variable substitution

  status          run_status NOT NULL,
  provider_message_id TEXT,               -- Twilio SID, Resend message ID, etc.
  provider_response   JSONB,

  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comm_logs_candidate ON communication_logs (candidate_id);
CREATE INDEX idx_comm_logs_rule ON communication_logs (rule_id);

-- ─────────────────────────────────────────────
-- TABLE 5: automation_runs
-- Per-cron-cycle execution audit (one row per evaluator run)
-- ─────────────────────────────────────────────
CREATE TABLE automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  mode            TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','dry_run')),
  followups_evaluated INTEGER NOT NULL DEFAULT 0,
  followups_sent  INTEGER NOT NULL DEFAULT 0,
  followups_skipped INTEGER NOT NULL DEFAULT 0,
  followups_failed INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT
);

-- ─────────────────────────────────────────────
-- TABLE 6: automation_settings
-- Provider credentials stored in DB (not env) — consistent with existing pattern
-- ─────────────────────────────────────────────
CREATE TABLE automation_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WhatsApp (Twilio)
  twilio_account_sid    TEXT,
  twilio_auth_token     TEXT,
  twilio_whatsapp_from  TEXT,  -- e.g. "whatsapp:+14155238886"
  -- Email (Resend)
  resend_api_key        TEXT,
  resend_from_email     TEXT,  -- e.g. "noreply@hirerabbits.com"
  resend_from_name      TEXT,  -- e.g. "HireRabbits ATS"
  -- Global flags
  is_live               BOOLEAN NOT NULL DEFAULT false,  -- false = dry run mode; true = actually send
  company_name          TEXT NOT NULL DEFAULT 'HireRabbits',
  -- Digest schedule (cron expression stored for reference)
  daily_digest_time     TEXT NOT NULL DEFAULT '09:00',   -- HH:MM in IST
  weekly_digest_day     TEXT NOT NULL DEFAULT 'monday',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES profiles(id)
);

-- Seed one row
INSERT INTO automation_settings (id, is_live) VALUES (gen_random_uuid(), false);

-- ─────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────
ALTER TABLE message_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_followups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings  ENABLE ROW LEVEL SECURITY;

-- Templates: all authenticated can read; admin/hr_manager can write
CREATE POLICY "templates_read"  ON message_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "templates_write" ON message_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));

-- Rules: all authenticated can read; admin/hr_manager can write
CREATE POLICY "rules_read"  ON automation_rules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rules_write" ON automation_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));

-- Followups: recruiters see their own candidates'; admin/hr see all
CREATE POLICY "followups_read" ON candidate_followups FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
    OR EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_id AND c.created_by = auth.uid())
  );

-- Logs/runs/settings: admin/hr only
CREATE POLICY "comm_logs_read"    ON communication_logs    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));
CREATE POLICY "runs_read"         ON automation_runs        FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));
CREATE POLICY "settings_read"     ON automation_settings    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "settings_write"    ON automation_settings    FOR ALL    USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
```

---

## 3. Automation Rules — Complete Catalogue

Seed ALL of these rules in the initial migration. Each rule is pre-built and toggleable.

### 3.1 Candidate Engagement (outbound to candidate)

| # | Rule Name | Trigger | Conditions | Delay | Action | Template Category | Channel |
|---|-----------|---------|------------|-------|--------|-------------------|---------|
| R01 | Intro on New Candidate | `stage_change` | `{ "stage": "Sourced" }` | 2h | `send_candidate_message` | intro | WhatsApp |
| R02 | Interview Scheduled Confirmation | `interview_scheduled` | `{}` | 0h | `send_candidate_message` | interview_reminder | WhatsApp |
| R03 | Interview Tomorrow Reminder | `interview_upcoming` | `{ "hours_before": 24 }` | 0h | `send_candidate_message` | interview_reminder | WhatsApp |
| R04 | Interview 2-Hour Reminder | `interview_upcoming` | `{ "hours_before": 2 }` | 0h | `send_candidate_message` | interview_reminder | WhatsApp |
| R05 | Offer Follow-up (48h) | `offer_sent_no_response` | `{ "hours": 48 }` | 0h | `send_candidate_message` | offer_followup | WhatsApp |
| R06 | Offer Follow-up (72h) | `offer_sent_no_response` | `{ "hours": 72 }` | 0h | `send_candidate_message` | offer_followup | Email |
| R07 | GF Return Follow-up | `gf_no_return` | `{ "hours": 120 }` | 0h | `send_candidate_message` | offer_followup | WhatsApp |
| R08 | Welcome on Join | `candidate_joined` | `{}` | 1h | `send_candidate_message` | welcome | WhatsApp |
| R09 | Stop on Join | `candidate_joined` | `{}` | 0h | `stop_all_followups` | — | — |
| R10 | Stop on Rejected | `stage_change` | `{ "stage": "Rejected/Dropped" }` | 0h | `stop_all_followups` | — | — |

### 3.2 Recruiter Alerts (internal reminders)

| # | Rule Name | Trigger | Conditions | Delay | Action | Template Category | Channel |
|---|-----------|---------|------------|-------|--------|-------------------|---------|
| R11 | No Contact After Sourcing | `no_recruiter_contact` | `{ "stage": "Sourced", "hours": 24 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R12 | No Next Step After Tel Int | `no_recruiter_contact` | `{ "stage": "Tel Int Done", "hours": 48 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R13 | No Feedback After PI | `interview_done_no_feedback` | `{ "rounds": ["pi1","pi2","pi3"], "hours": 24 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R14 | No Next Step After PI Done | `no_recruiter_contact` | `{ "stage": "PI Done", "hours": 72 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R15 | No GF Issued After Shortlisted Mgmt | `no_recruiter_contact` | `{ "stage": "Shortlisted by Mgmt", "hours": 72 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R16 | Candidate No-Show Alert | `candidate_no_show` | `{}` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R17 | Stale Candidate (7 days no activity) | `no_recruiter_contact` | `{ "hours": 168, "exclude_stages": ["Joined","Rejected/Dropped","On Hold"] }` | 0h | `notify_recruiter` | stale_alert | Email |
| R18 | "Offered But Not Joined" 14-day Escalation | `offer_not_joined` | `{ "days": 14 }` | 0h | `notify_recruiter` | recruiter_alert | Email |
| R19 | Daily Morning Digest | `schedule_daily_digest` | `{ "time": "09:00", "timezone": "Asia/Kolkata" }` | 0h | `notify_recruiter` | digest | Email |

### 3.3 HR Manager / Admin Alerts

| # | Rule Name | Trigger | Conditions | Delay | Action | Template | Channel |
|---|-----------|---------|------------|-------|--------|----------|---------|
| R20 | Interviewer Notified on Interview Scheduled | `interview_scheduled` | `{}` | 0h | `notify_interviewer` | interview_reminder | Email |
| R21 | Interviewer Reminder Day Before | `interview_upcoming` | `{ "hours_before": 24 }` | 0h | `notify_interviewer` | interview_reminder | Email |
| R22 | Job Stale (30 days, < 3 candidates) | `job_stale` | `{ "days": 30, "min_candidates": 3 }` | 0h | `notify_hr_manager` | stale_alert | Email |
| R23 | Target DOJ Approaching (7 days) | `no_recruiter_contact` | `{ "doj_days_out": 7, "stage": "Appointed/Offered" }` | 0h | `notify_hr_manager` | recruiter_alert | Email |
| R24 | Weekly Pipeline Summary | `schedule_weekly_summary` | `{ "day": "monday", "time": "09:00", "timezone": "Asia/Kolkata" }` | 0h | `notify_hr_manager` | digest | Email |

---

## 4. Message Templates — Seed Data

Seed these system templates. Variables use `{{double_braces}}`.

### Available Variables (resolved by template engine)
```
{{candidate_name}}     — candidate.name
{{recruiter_name}}     — profiles.name of candidate.created_by
{{hr_manager_name}}    — profiles.name of the notified HR manager
{{interviewer_name}}   — interview.interviewer_name or profiles.name of interviewer_id
{{job_title}}          — jobs.title linked to candidate.job_id
{{designation}}        — masters.name for candidate.designation_id
{{site}}               — masters.name for candidate.site_id
{{interview_date}}     — formatted scheduled_at date (e.g. "Tuesday, 7 May 2026")
{{interview_time}}     — formatted scheduled_at time in IST (e.g. "10:30 AM")
{{interview_round}}    — humanised round (e.g. "Telephonic", "Panel Interview 1")
{{interview_link}}     — interviews.meet_link
{{offered_ctc}}        — formatted candidate_offers.annual_ctc
{{doj}}                — formatted candidate.doj_potential or candidate_offers.joining_date
{{company_name}}       — automation_settings.company_name
{{current_stage}}      — candidate.final_status
{{days_inactive}}      — computed days since last communication
{{today_interview_count}} — count of today's interviews for this recruiter
{{pending_action_count}}  — count of candidates needing action for this recruiter
```

### Template Definitions (abbreviated — implement all)

**T01** — WhatsApp Intro (R01)
```
Hi {{candidate_name}}, this is {{recruiter_name}} from {{company_name}}.

We have reviewed your profile and would like to discuss an opportunity for {{designation}} at our {{site}} location.

Could you please confirm your interest and availability for a brief telephonic discussion?

Thank you!
```

**T02** — WhatsApp Interview Confirmation (R02)
```
Hi {{candidate_name}}, your {{interview_round}} interview has been scheduled.

📅 Date: {{interview_date}}
🕐 Time: {{interview_time}}
🔗 Link: {{interview_link}}

Please confirm your attendance by replying YES. Contact {{recruiter_name}} for any changes.

Best wishes,
{{company_name}}
```

**T03** — WhatsApp Interview Reminder 24h (R03)
```
Hi {{candidate_name}}, friendly reminder that your {{interview_round}} interview is TOMORROW.

📅 {{interview_date}} at {{interview_time}}
🔗 {{interview_link}}

Please be ready 5 minutes early. Reply if you need to reschedule.

— {{company_name}}
```

**T04** — WhatsApp Interview Reminder 2h (R04)
```
Hi {{candidate_name}}, your {{interview_round}} interview starts in 2 hours.

🕐 {{interview_time}} today
🔗 {{interview_link}}

Good luck! — {{company_name}}
```

**T05** — WhatsApp Offer Follow-up 48h (R05)
```
Hi {{candidate_name}}, we extended an offer for the {{designation}} role at {{site}}.

We haven't received your response yet. Please let us know your decision at your earliest convenience.

Feel free to reach out to {{recruiter_name}} for any queries.

— {{company_name}}
```

**T06** — Email Offer Follow-up 72h (R06) — subject: "Following up on your offer — {{designation}} at {{company_name}}"
```
Dear {{candidate_name}},

We hope you have had the opportunity to review the offer for the {{designation}} position at our {{site}} location.

We would appreciate your response by end of day. Please contact {{recruiter_name}} if you have any questions or need clarification on any aspect of the offer.

We look forward to welcoming you to the team.

Warm regards,
{{hr_manager_name}}
{{company_name}}
```

**T07** — WhatsApp Welcome on Join (R08)
```
Welcome to {{company_name}}, {{candidate_name}}! 🎉

We're thrilled to have you on board. Your joining date is {{doj}}.

Please reach out to {{recruiter_name}} if you have any questions before your first day.

Looking forward to working with you!
— HR Team, {{company_name}}
```

**T08** — Email Recruiter: No Contact 24h (R11) — subject: "Action needed: {{candidate_name}} has not been contacted"
```
Hi {{recruiter_name}},

{{candidate_name}} was added to the pipeline {{days_inactive}} hours ago and has not yet been contacted.

Candidate: {{candidate_name}}
Stage: {{current_stage}}
Designation: {{designation}}

Please reach out or update the candidate's status in HireRabbits.

— HireRabbits Automation
```

**T09** — Email Recruiter: No Next Step After Tel Int (R12) — subject: "Follow-up needed: {{candidate_name}} — Tel Int Done"
```
Hi {{recruiter_name}},

It has been 48 hours since {{candidate_name}} completed the telephonic interview. No further action has been recorded.

Please either:
• Schedule the next interview round
• Move the candidate to Shortlisted or Rejected
• Add a note with the next step

Candidate profile: HireRabbits → Candidates → {{candidate_name}}

— HireRabbits Automation
```

**T10** — Email Recruiter: No PI Feedback (R13) — subject: "Feedback needed: {{candidate_name}} — Interview Done"
```
Hi {{recruiter_name}},

The interview for {{candidate_name}} was completed over 24 hours ago but no feedback has been logged.

Please log the interview outcome in HireRabbits to keep the pipeline moving.

— HireRabbits Automation
```

**T11** — Email Recruiter: Daily Digest (R19) — subject: "Your HireRabbits Digest — {{interview_date}}"
```
Good morning {{recruiter_name}},

Here is your summary for today:

📅 Interviews today: {{today_interview_count}}
⚠️  Candidates needing action: {{pending_action_count}}

Log in to HireRabbits to review your pipeline.

— HireRabbits Automation
```

**T12** — Email Interviewer: Interview Scheduled (R20) — subject: "Interview Scheduled: {{candidate_name}} — {{interview_round}}"
```
Hi {{interviewer_name}},

An interview has been scheduled for you to conduct.

Candidate: {{candidate_name}}
Round: {{interview_round}}
Date: {{interview_date}}
Time: {{interview_time}}
Link: {{interview_link}}

Please let {{recruiter_name}} know if you need to reschedule.

— HireRabbits
```

**T13** — WhatsApp GF Follow-up (R07)
```
Hi {{candidate_name}}, we sent you a joining form (GF) a few days ago and are yet to receive it back.

Please return the completed form at your earliest convenience so we can proceed with your joining formalities.

Contact {{recruiter_name}} if you need a copy or have any questions.

— {{company_name}}
```

**T14** — Email HR Manager: Weekly Summary (R24) — subject: "Weekly Pipeline Summary — Week of {{interview_date}}"
```
Hi {{hr_manager_name}},

Here is your weekly recruitment summary:

This is an automated digest. Log in to HireRabbits for full pipeline details.

— HireRabbits Automation
```

---

## 5. API Routes

### 5.1 Templates CRUD

```
GET    /api/automation/templates        — list all (filter: ?channel=whatsapp, ?category=intro, ?is_active=true)
POST   /api/automation/templates        — create template (admin/hr_manager only)
PATCH  /api/automation/templates/[id]  — update template (cannot update is_system=true name/body via UI — only admin can)
DELETE /api/automation/templates/[id]  — soft-delete (set is_active=false); reject if is_system=true
```

Request body for POST/PATCH:
```json
{
  "name": "string",
  "channel": "whatsapp | email | sms | in_app",
  "subject": "string | null",
  "body": "string",
  "variables": ["candidate_name", "interview_date"],
  "category": "intro | interview_reminder | ...",
  "is_active": true
}
```

### 5.2 Rules CRUD

```
GET    /api/automation/rules           — list all rules ordered by sort_order
POST   /api/automation/rules           — create rule (admin/hr_manager only)
PATCH  /api/automation/rules/[id]      — update rule (toggle is_active, update delay, template, etc.)
DELETE /api/automation/rules/[id]      — delete rule (also cancels all pending followups for this rule)
POST   /api/automation/rules/[id]/test — dry-run the rule against a candidate (returns resolved message, no send)
```

Request body for POST/PATCH:
```json
{
  "name": "string",
  "description": "string",
  "is_active": true,
  "trigger_type": "stage_change",
  "conditions": { "stage": "Tel Int Done" },
  "action_type": "notify_recruiter",
  "template_id": "uuid",
  "action_config": { "channel": "email" },
  "delay_hours": 48,
  "max_per_candidate": 3,
  "cooldown_hours": 24,
  "sort_order": 10
}
```

### 5.3 Followups

```
GET    /api/automation/followups       — list followups (filter: ?candidate_id=, ?status=pending, ?rule_id=)
                                         admin/hr see all; recruiters see own candidates only
PATCH  /api/automation/followups/[id]  — cancel a followup (set status='cancelled')
```

### 5.4 Run History

```
GET  /api/automation/runs              — list automation_runs (latest first, limit 50)
GET  /api/automation/logs              — list communication_logs (filter: ?candidate_id=, ?status=, ?channel=)
```

### 5.5 Settings

```
GET   /api/automation/settings         — return settings (mask auth tokens: show only first 8 chars + "...")
PATCH /api/automation/settings         — update settings (admin only)
POST  /api/automation/settings/test    — test provider credentials:
                                         send a test WhatsApp to a number, or test email to an address
```

### 5.6 Cron Evaluator (internal — secured with CRON_SECRET header)

```
POST  /api/automation/run              — called by Vercel Cron every 15 minutes
                                         validates header: Authorization: Bearer ${CRON_SECRET}
                                         processes all pending followups whose scheduled_at <= now()
                                         also evaluates stage-based + no-contact triggers
                                         returns: { evaluated, sent, skipped, failed }
```

### 5.7 Event Hooks (called by existing API routes)

These are internal functions called within existing routes — not new HTTP endpoints:

- In `PATCH /api/candidates/[id]` — when `final_status` changes → call `enqueueStageChangeTriggers(candidateId, newStage)`
- In `POST /api/interviews` — when interview created → call `enqueueInterviewTriggers(interview)`
- In `PATCH /api/candidates/[id]/offers` — when `status` changes to `offer_sent` → call `enqueueOfferTriggers(candidateId)`

---

## 6. Background Job — Evaluator Logic

### 6.1 Vercel Cron Configuration

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/automation/run",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Add to `.env.local` and `.env.local.example`:
```
CRON_SECRET=your-random-secret-here
```

### 6.2 Evaluator Algorithm (`/api/automation/run`)

```
1. Validate Authorization: Bearer ${CRON_SECRET} header. Return 401 if missing/wrong.
2. Create automation_runs row with status pending.
3. STEP A — Process pending queue:
   a. Fetch all candidate_followups WHERE status='pending' AND scheduled_at <= now()
   b. For each followup:
      - Load rule, candidate, recruiter profile, relevant interview/offer data
      - Skip if candidate is in terminal stage (Joined, Rejected/Dropped) and rule.action_type != 'stop_all_followups'
      - Check cooldown: if rule fired for this candidate within cooldown_hours → set status='skipped'
      - Check max_per_candidate: count previous sent runs for this rule+candidate → skip if at cap
      - Resolve template variables (see Section 7)
      - If automation_settings.is_live = false → log as 'dry_run', do NOT call provider APIs
      - If is_live = true → call provider (Twilio for WhatsApp, Resend for email)
      - Insert into communication_logs (status = success | failed)
      - If success and action was send_candidate_message or notify_*:
          INSERT into candidate_communications (type='whatsapp'|'email', direction='sent',
            content=resolvedBody, template_used=rule.name, created_by=null)
          so it appears in the existing comm tracker
      - Update candidate_followups status and executed_at
4. STEP B — Evaluate no_recruiter_contact triggers:
   a. For each active rule with trigger_type = 'no_recruiter_contact':
      - Query candidates matching conditions.stage (or all non-terminal if no stage)
      - For each candidate, find last communication in candidate_communications
      - If (now - last_comm_at) >= conditions.hours → queue a new followup if none pending for this rule+candidate
5. STEP C — Evaluate interview_upcoming triggers:
   a. Find all interviews WHERE status IN ('scheduled','confirmed') AND scheduled_at > now()
   b. For each rule with trigger_type='interview_upcoming':
      - Compute fire_at = scheduled_at - conditions.hours_before * 1 hour
      - If fire_at is in the past (already missed) → skip
      - If no followup already queued for this interview+rule → insert candidate_followups
6. STEP D — Evaluate job_stale triggers:
   a. Find jobs WHERE status='open' AND opened_at < now() - interval 'N days'
   b. Count candidates linked to each job
   c. If count < conditions.min_candidates → notify HR Manager (insert communication_log + send)
7. STEP E — Evaluate schedule_daily_digest / schedule_weekly_summary:
   a. Check current time in Asia/Kolkata vs settings.daily_digest_time
   b. If within the 15-minute evaluation window → generate and send digest emails to all active recruiters (daily) or HR managers (weekly)
   c. Check automation_runs to ensure digest wasn't already sent in the last 12h (daily) / 6 days (weekly)
8. STEP F — offer_not_joined:
   a. Find candidates WHERE final_status='Offered But Not Joined' AND updated_at < now() - 14 days
   b. Queue recruiter alert if not already queued in last 7 days
9. Update automation_runs row with counts and finished_at.
10. Return { evaluated, sent, skipped, failed }.
```

### 6.3 Template Variable Resolution

```typescript
// lib/automation/resolve-template.ts
async function resolveTemplate(
  body: string,
  context: {
    candidate: Candidate,
    recruiter: Profile,
    hrManager?: Profile,
    interviewer?: Profile,
    interview?: Interview,
    offer?: CandidateOffer,
    settings: AutomationSettings,
    designationName: string,
    siteName: string,
    jobTitle?: string,
  }
): Promise<string>
```

- Replace all `{{variable_name}}` tokens.
- Unknown variables → replace with empty string (don't crash).
- Dates formatted as `"Tuesday, 7 May 2026"` for `interview_date`.
- Times formatted in `"Asia/Kolkata"` timezone, 12h format: `"10:30 AM"`.
- Currency formatted as `"₹12,50,000 per annum"` for `offered_ctc`.

---

## 7. UI — Pages and Components

### 7.1 Main Route: `/automation`

Tab layout with 4 tabs:
1. **Rules** (default)
2. **Templates**
3. **Run History**
4. **Settings**

Access: Admin and HR Manager only. Redirect recruiters to `/` with a toast "Access denied".

---

### 7.2 Rules Tab

**Layout**: Card list. Each card shows:
- Rule name + description
- Trigger badge (colour-coded by trigger type)
- Action badge
- Delay chip ("After 48h")
- Channel icon (WhatsApp leaf / email envelope)
- Is-active toggle switch (PATCH in-place)
- Edit button → opens RuleModal
- Delete button (with confirmation dialog) → disabled if is_system

**Top of page**:
- `+ New Rule` button → opens RuleModal in create mode
- `Run Now (Dry Run)` button → POST `/api/automation/run` with `mode=dry_run` → shows result toast

**RuleModal** (create/edit):
Fields:
1. Name (text, required)
2. Description (textarea, optional)
3. Trigger Type (select dropdown — show human labels, not enum values)
4. Conditions (dynamic based on trigger type):
   - `stage_change` → Stage selector (dropdown of KANBAN_STAGES)
   - `no_recruiter_contact` → Stage selector + Hours input + "Exclude stages" multi-select
   - `interview_upcoming` → Hours before (number: 2 or 24 or custom)
   - `offer_sent_no_response` → Hours (48 or 72 or custom)
   - `schedule_*` → info text only ("Fires at daily_digest_time in Settings")
   - `job_stale` → Days (number) + Minimum candidates (number)
   - `gf_no_return` → Hours (number)
   - `offer_not_joined` → Days (number)
5. Action Type (select dropdown)
6. Template (select — filtered by channel if action needs it; shows preview of template body inline below)
7. Channel (select: WhatsApp / Email — shown when action sends a message)
8. Delay hours (number input)
9. Max executions per candidate (number)
10. Cooldown hours (number)

Save → POST or PATCH. Close on success.

---

### 7.3 Templates Tab

**Layout**: Grid of cards (3 columns on desktop, 1 on mobile). Each card:
- Template name + category badge
- Channel icon + label
- First 100 chars of body (truncated)
- Variables used (listed as grey chips)
- Edit button → TemplateModal
- Delete button (disabled if is_system=true; show lock icon)

**Top**: `+ New Template` button.

**TemplateModal** (create/edit):
Fields:
1. Name (text)
2. Channel (select: WhatsApp / Email)
3. Category (select)
4. Subject (text — shown only when channel=email)
5. Body (textarea, monospace font, resizable)
6. Below body: **Variable Picker** — list of all available variables as clickable chips; clicking inserts `{{variable}}` at cursor position
7. Live preview panel on the right (or below on mobile): renders the body with sample values substituted

---

### 7.4 Run History Tab

**Layout**: Two sub-sections.

**Top section — Automation Runs** (cron cycle summary):
Table: Started At | Mode | Evaluated | Sent | Skipped | Failed | Duration

**Bottom section — Communication Logs** (per-message detail):
Table: Sent At | Candidate | Rule | Channel | Recipient | Status | Preview (first 60 chars of body)

Filters: Channel dropdown, Status dropdown, Date range picker.
Click a row → expand inline to show full body + provider response JSON.

Pagination: 50 per page.

---

### 7.5 Settings Tab

Form sections:

**WhatsApp (Twilio)**
- Account SID (text, masked)
- Auth Token (password input, masked)
- WhatsApp From number (text, e.g. `whatsapp:+14155238886`)
- `Test WhatsApp` button → input field for test number → POST `/api/automation/settings/test`

**Email (Resend)**
- API Key (password input, masked)
- From Email (text)
- From Name (text)
- `Test Email` button → input field for test email address → POST `/api/automation/settings/test`

**General**
- Company Name (text)
- Live Mode toggle (boolean) — when OFF, shows yellow "DRY RUN MODE — no messages will be sent" banner at top of the page
- Daily Digest Time (time picker, IST)
- Weekly Digest Day (select: Monday–Sunday)

Save button → PATCH `/api/automation/settings`. Mask tokens in GET response (show only `"SK_test_••••••••"`).

---

### 7.6 Candidate Detail Panel Enhancement

In the existing candidate detail panel (slide-out on `/candidates`):

Add a new **"Automations"** section below the communications timeline:
- List of `candidate_followups` for this candidate (status, rule name, scheduled_at, executed_at)
- Pending followups shown with a countdown ("fires in 3h 40m")
- Cancel button on pending followups
- Completed/failed ones shown as read-only history

Fetch: `GET /api/automation/followups?candidate_id={id}`

---

## 8. Event Hook Integration (Changes to Existing Routes)

### 8.1 `app/api/candidates/[id]/route.ts` — PATCH handler

After successfully updating `final_status`, call:

```typescript
import { enqueueStageChangeTriggers } from '@/lib/automation/triggers'

// After successful DB update:
if (body.final_status && body.final_status !== existingCandidate.final_status) {
  await enqueueStageChangeTriggers(id, body.final_status, existingCandidate)
}
```

### 8.2 `app/api/interviews/route.ts` — POST handler

After successfully inserting interview:

```typescript
import { enqueueInterviewTriggers } from '@/lib/automation/triggers'

// After successful insert:
await enqueueInterviewTriggers(newInterview)
```

### 8.3 `app/api/candidates/[id]/offers/route.ts` — PATCH handler

After successfully updating offer status:

```typescript
import { enqueueOfferTriggers } from '@/lib/automation/triggers'

// When status changes to 'offer_sent':
if (body.status === 'offer_sent') {
  await enqueueOfferTriggers(candidateId)
}
```

---

## 9. `lib/automation/` — New Module Structure

```
lib/automation/
├── triggers.ts          — enqueueStageChangeTriggers(), enqueueInterviewTriggers(), enqueueOfferTriggers()
│                           Each function: load active rules matching the event, create candidate_followups rows
├── evaluator.ts         — runEvaluator(mode: 'live'|'dry_run') — main cron logic (Step A–F from Section 6.2)
├── resolve-template.ts  — resolveTemplate(body, context) — variable substitution
├── providers/
│   ├── whatsapp.ts      — sendWhatsApp(to, body): calls Twilio API; returns { messageId } or throws
│   └── email.ts         — sendEmail(to, subject, body, fromName, fromEmail): calls Resend API; returns { messageId } or throws
└── digests.ts           — buildDailyDigest(recruiter), buildWeeklySummary(hrManager) — compile digest content
```

---

## 10. Environment Variables

Add to `.env.local` and `.env.local.example`:

```bash
# Automation
CRON_SECRET=replace-with-long-random-string

# NOTE: Twilio and Resend keys are stored in automation_settings table (like Google Drive keys)
# so they do NOT need env vars — they're configured via the Settings UI
```

---

## 11. Navigation & Sidebar

Add to the existing sidebar navigation (wherever the nav links are defined):

```typescript
{ href: '/automation', label: 'Automation', icon: ZapIcon, roles: ['admin', 'hr_manager'] }
```

Place it between `/my-activity` and `/dashboard` in sort order.

---

## 12. Terminal Stages — Stop Logic

When `stop_all_followups` action fires OR when a candidate enters a terminal stage:

```sql
UPDATE candidate_followups
SET status = 'cancelled', updated_at = now()
WHERE candidate_id = $1 AND status = 'pending';
```

Terminal stages that trigger auto-stop:
- `"Joined"`
- `"Rejected/Dropped"`

Pause (do not cancel, just skip while in stage) for:
- `"On Hold"` — followups remain pending but evaluator skips them while stage = "On Hold"

---

## 13. Error Handling & Resilience

- Provider failures (Twilio / Resend down): mark followup as `failed`, store error in `communication_logs.error_message`. Do NOT retry automatically — let next cron cycle attempt if it's still in pending state (it won't because status=failed; an admin must manually reset or the rule will re-queue).
- Template missing variables: log a warning, send the message with missing vars replaced by `[N/A]`. Never crash the evaluator.
- Candidate has no phone number: skip WhatsApp action, log as `skipped` with reason `"no_phone_number"`.
- Candidate has no email: skip email action, log as `skipped` with reason `"no_email"`.
- Rate limit from provider: catch 429, mark followup as `pending` again with `scheduled_at = now() + 1 hour`.
- Evaluator crashes mid-run: the automation_runs row will have no `finished_at`. An admin can see this in Run History and trigger manually.

---

## 14. Implementation Order

Build in this exact sequence:

1. **Schema** — run the SQL from Section 2 in Supabase.
2. **`lib/automation/resolve-template.ts`** — variable resolution (pure function, easy to test).
3. **`lib/automation/providers/whatsapp.ts`** and **`email.ts`** — provider wrappers (with dry-run mode check).
4. **`lib/automation/triggers.ts`** — enqueue functions (called by existing API routes).
5. **API: `/api/automation/settings`** — GET + PATCH (needed before anything can send).
6. **API: `/api/automation/templates`** — CRUD + seed system templates.
7. **API: `/api/automation/rules`** — CRUD + seed system rules.
8. **`lib/automation/evaluator.ts`** — full evaluator logic.
9. **API: `/api/automation/run`** — cron endpoint wrapping evaluator.
10. **`vercel.json`** — add cron schedule.
11. **Hook existing routes** — add trigger calls to candidates PATCH, interviews POST, offers PATCH.
12. **UI: `/automation` page** — Rules tab first, then Templates, then Run History, then Settings.
13. **Candidate detail panel** — add Automations section.
14. **Sidebar nav** — add Automation link.
15. **End-to-end test** — POST `/api/automation/run?mode=dry_run`, verify logs appear correctly.

---

## 15. Changelog Entry

After implementation, add to `USER_MANUAL.md`:

### Section 12 entry:
```
### [DATE] — Follow-up Automation Module
- New module: /automation (Admin + HR Manager only)
- 5 new tables: message_templates, automation_rules, candidate_followups, communication_logs, automation_runs, automation_settings
- 24 pre-built automation rules (candidate engagement + recruiter alerts + HR digests)
- WhatsApp delivery via Twilio; Email delivery via Resend
- Vercel Cron runs evaluator every 15 minutes
- All sent messages appear in existing candidate communication tracker
- Dry-run mode for safe testing before going live
```

### Section 10 entry:
```
- [DATE] Follow-up Automation module added — 6 new DB tables, 24 rules, Twilio + Resend delivery | Schema migration required (run automation schema SQL)
```

### Section 11 bug log:
_(No bugs yet — add as discovered during implementation)_
