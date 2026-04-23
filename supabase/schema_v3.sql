-- ============================================================
-- HIRERABBITS ATS — SCHEMA v3
-- Run AFTER schema.sql AND schema_update.sql (v2)
-- ============================================================

-- ── 1. Profiles: add Google OAuth + avatar ────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url           TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_account_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_access_token  TEXT;   -- store encrypted in prod
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;   -- store encrypted in prod
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_sheet_id      TEXT;   -- per-recruiter sheet ID
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_drive_folder  TEXT;   -- per-recruiter CV folder
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_api_key_enc       TEXT;   -- encrypted AI provider key
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_provider          TEXT DEFAULT 'openai'; -- openai | anthropic | gemini
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_external_recruiter BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS external_token       TEXT UNIQUE; -- shareable link token

-- ── 2. Candidates: add DOJ split + AI score ──────────────
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS doj_potential      DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS doj_actual         DATE;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_score           SMALLINT CHECK (ai_score BETWEEN 0 AND 100);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ai_summary         TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_drive_url       TEXT;  -- Google Drive CV link
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_filename        TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS staffingo_emp_id   TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notice_period_days INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS naukri_profile_url TEXT;

-- Migrate existing doj → doj_actual (keep backward compat)
UPDATE candidates SET doj_actual = doj WHERE doj_actual IS NULL AND doj IS NOT NULL;

-- ── 3. JOBS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title             TEXT NOT NULL,
  job_type          TEXT NOT NULL DEFAULT 'internal'
                      CHECK (job_type IN ('internal','client')),
  job_platform      TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','on_hold','closed','filled')),
  designation_id    UUID REFERENCES masters(id) ON DELETE SET NULL,
  site_id           UUID REFERENCES masters(id) ON DELETE SET NULL,
  department        TEXT,
  headcount         INTEGER DEFAULT 1,
  priority          TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  description       TEXT,
  requirements      TEXT,
  min_salary        NUMERIC,
  max_salary        NUMERIC,
  -- Client-job specific
  client_name       TEXT,
  client_contact    TEXT,
  placement_fee_pct NUMERIC,   -- % of first-year CTC
  placement_fee_flat NUMERIC,  -- flat fee alternative
  -- JD link
  jd_id             UUID,      -- FK to jd_library added below
  -- Dates
  opened_at         DATE,
  closed_at         DATE,
  filled_at         DATE,
  target_doj        DATE,
  -- Audit
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        UUID REFERENCES profiles(id),
  is_deleted        BOOLEAN DEFAULT false
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_platform TEXT;

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_select_auth" ON jobs
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "jobs_write_admin" ON jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 4. JOB RECRUITERS (many-to-many) ─────────────────────
CREATE TABLE IF NOT EXISTS job_recruiters (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  recruiter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  assigned_by   UUID REFERENCES profiles(id),
  UNIQUE (job_id, recruiter_id)
);

ALTER TABLE job_recruiters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jr_select_auth" ON job_recruiters
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "jr_write_admin" ON job_recruiters
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );

-- ── 5. JD LIBRARY ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jd_library (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title           TEXT NOT NULL,
  designation_id  UUID REFERENCES masters(id) ON DELETE SET NULL,
  content         TEXT,                -- rich text / markdown JD body
  drive_url       TEXT,                -- Google Drive JD doc
  file_name       TEXT,
  version         INTEGER DEFAULT 1,
  tags            TEXT[],
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id)
);

ALTER TABLE jd_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jd_select_auth" ON jd_library
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "jd_write_admin" ON jd_library
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );
CREATE TRIGGER jd_updated_at BEFORE UPDATE ON jd_library
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Add FK from jobs to jd_library
ALTER TABLE jobs ADD CONSTRAINT jobs_jd_fk
  FOREIGN KEY (jd_id) REFERENCES jd_library(id) ON DELETE SET NULL
  NOT VALID;

-- ── 6. ASSESSMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title           TEXT NOT NULL,
  form_url        TEXT,
  description     TEXT,
  duration_mins   INTEGER,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id)
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments_select_auth" ON assessments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "assessments_write_admin" ON assessments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );

-- Assessment ↔ Job links (many-to-many)
CREATE TABLE IF NOT EXISTS assessment_jobs (
  assessment_id  UUID REFERENCES assessments(id) ON DELETE CASCADE,
  job_id         UUID REFERENCES jobs(id) ON DELETE CASCADE,
  PRIMARY KEY (assessment_id, job_id)
);
ALTER TABLE assessment_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aj_select_auth" ON assessment_jobs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "aj_write_admin" ON assessment_jobs FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- ── 7. CO-SOURCERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS co_sourcers (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidate_id     UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  recruiter_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'co_sourcer'
                     CHECK (role IN ('primary','co_sourcer')),
  linked_at        TIMESTAMPTZ DEFAULT NOW(),
  linked_by        UUID REFERENCES profiles(id),
  notes            TEXT,
  UNIQUE (candidate_id, recruiter_id)
);

ALTER TABLE co_sourcers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_select_auth" ON co_sourcers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cs_write_auth" ON co_sourcers
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      recruiter_id = auth.uid() OR
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
    )
  );

-- Auto-insert primary co_sourcer record when candidate is created
CREATE OR REPLACE FUNCTION assign_primary_sourcer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO co_sourcers (candidate_id, recruiter_id, role, linked_by)
  VALUES (NEW.id, NEW.created_by, 'primary', NEW.created_by)
  ON CONFLICT (candidate_id, recruiter_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_assign_primary_sourcer
  AFTER INSERT ON candidates
  FOR EACH ROW EXECUTE FUNCTION assign_primary_sourcer();

-- ── 8. DELETION REQUESTS (request → approval flow) ───────
CREATE TABLE IF NOT EXISTS deletion_requests (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidate_id   UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requested_by   UUID NOT NULL REFERENCES profiles(id),
  reason         TEXT NOT NULL,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    UUID REFERENCES profiles(id),
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr_select_auth" ON deletion_requests
  FOR SELECT USING (
    auth.uid() = requested_by OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );
CREATE POLICY "dr_insert_auth" ON deletion_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "dr_update_admin" ON deletion_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );

-- ── 9. INTERVIEWS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  round           TEXT NOT NULL DEFAULT 'telephonic'
                    CHECK (round IN ('telephonic','pi1','pi2','pi3','hr_discussion','final')),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER DEFAULT 60,
  interviewer_id  UUID REFERENCES profiles(id),
  interviewer_name TEXT,     -- fallback if external
  location        TEXT,
  meet_link       TEXT,
  calendar_event_id TEXT,    -- Google Calendar event ID
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','confirmed','done','rescheduled','cancelled','no_show')),
  outcome         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interviews_select_auth" ON interviews
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "interviews_write_own" ON interviews
  FOR ALL USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );
CREATE TRIGGER interviews_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 10. EMAIL TEMPLATES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,          -- HTML or plaintext
  template_type   TEXT NOT NULL DEFAULT 'general'
                    CHECK (template_type IN ('general','offer','rejection','interview','joining','custom')),
  variables       TEXT[],                 -- e.g. ['{{candidate_name}}','{{doj}}']
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "et_select_auth" ON email_templates
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "et_write_admin" ON email_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );

-- Email template ↔ Job links
CREATE TABLE IF NOT EXISTS email_template_jobs (
  template_id  UUID REFERENCES email_templates(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES jobs(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, job_id)
);
ALTER TABLE email_template_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "etj_select_auth" ON email_template_jobs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "etj_write_admin" ON email_template_jobs FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- ── 11. GOOGLE SHEETS SYNC CONFIG ────────────────────────
CREATE TABLE IF NOT EXISTS sync_configs (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recruiter_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  sheet_id        TEXT,                   -- Google Sheet ID
  sheet_name      TEXT DEFAULT 'Master',  -- Tab name
  sync_direction  TEXT DEFAULT 'both'
                    CHECK (sync_direction IN ('push','pull','both')),
  auto_sync       BOOLEAN DEFAULT false,
  sync_frequency  TEXT DEFAULT 'manual'
                    CHECK (sync_frequency IN ('manual','hourly','daily')),
  last_synced_at  TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_rows  INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc_select_own" ON sync_configs
  FOR SELECT USING (recruiter_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));
CREATE POLICY "sc_write_own" ON sync_configs
  FOR ALL USING (recruiter_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));
CREATE TRIGGER sc_updated_at BEFORE UPDATE ON sync_configs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 12. SYNC CONFLICTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recruiter_id    UUID REFERENCES profiles(id),
  candidate_id    UUID REFERENCES candidates(id),
  field_name      TEXT,
  db_value        TEXT,
  sheet_value     TEXT,
  conflict_type   TEXT DEFAULT 'value_mismatch'
                    CHECK (conflict_type IN ('value_mismatch','deleted_in_db','deleted_in_sheet','new_in_sheet','protected_field')),
  resolution      TEXT CHECK (resolution IN ('keep_db','keep_sheet','manual','pending')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts_select_own" ON sync_conflicts
  FOR SELECT USING (recruiter_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager')));
CREATE POLICY "conflicts_write_auth" ON sync_conflicts
  FOR ALL USING (auth.role() = 'authenticated');

-- ── 13. BACKUP LOG ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_log (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  triggered_by    UUID REFERENCES profiles(id),
  trigger_type    TEXT DEFAULT 'manual' CHECK (trigger_type IN ('manual','scheduled','import')),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  rows_backed_up  INTEGER,
  drive_file_id   TEXT,
  drive_file_name TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

ALTER TABLE backup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bl_select_admin" ON backup_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
  );
CREATE POLICY "bl_insert_auth" ON backup_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 14. INDEXES (performance) ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidates_hr_id      ON candidates (hr_id);
CREATE INDEX IF NOT EXISTS idx_candidates_site_id    ON candidates (site_id);
CREATE INDEX IF NOT EXISTS idx_candidates_mobile     ON candidates (mobile);
CREATE INDEX IF NOT EXISTS idx_candidates_status     ON candidates (final_status);
CREATE INDEX IF NOT EXISTS idx_candidates_doj_actual ON candidates (doj_actual);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate  ON interviews (candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled  ON interviews (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_co_sourcers_candidate ON co_sourcers (candidate_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status           ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_rec    ON sync_conflicts (recruiter_id, resolution);

-- ── 15. UPDATED v_pipeline_funnel view (v3) ───────────────
CREATE OR REPLACE VIEW v_pipeline_funnel AS
SELECT
  c.id,
  c.sr_no,
  c.name,
  c.month,
  c.application_date,
  c.tel_int_date,
  c.pi1_date,
  c.pi2_date,
  c.pi3_date,
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
  c.ai_score,
  c.cv_drive_url,
  c.notice_period_days,
  c.staffingo_emp_id,
  c.is_deleted,
  c.portal_token,
  c.created_at,
  c.updated_at,
  p.name           AS hr_name,
  p.id             AS hr_id,
  ms.name          AS site_name,
  ms.id            AS site_id,
  md.name          AS designation_name,
  md.id            AS designation_id,
  msrc.name        AS source_name,
  msrc.id          AS source_id,
  -- Co-sourcing
  (SELECT STRING_AGG(pr.name, ', ')
   FROM co_sourcers cs2 JOIN profiles pr ON pr.id = cs2.recruiter_id
   WHERE cs2.candidate_id = c.id AND cs2.role = 'co_sourcer') AS co_sourcer_names,
  -- Funnel stage flags
  CASE WHEN c.tel_int_date IS NOT NULL THEN 1 ELSE 0 END AS tel_int_done,
  CASE WHEN c.google_form_sent IS NOT NULL AND c.google_form_sent != '' THEN 1 ELSE 0 END AS gf_sent,
  CASE WHEN c.google_form_received IS NOT NULL AND c.google_form_received != '' THEN 1 ELSE 0 END AS gf_received,
  CASE WHEN c.shortlist_by_hr IS NOT NULL AND c.shortlist_by_hr != '' THEN 1 ELSE 0 END AS shortlisted_hr,
  CASE WHEN c.pi1_date IS NOT NULL THEN 1 ELSE 0 END AS pi_done,
  CASE WHEN c.pi2_date IS NOT NULL THEN 1 ELSE 0 END AS pi2_done,
  CASE WHEN c.pi3_date IS NOT NULL THEN 1 ELSE 0 END AS pi3_done,
  CASE WHEN c.shortlisted_by_mgmt IS NOT NULL AND c.shortlisted_by_mgmt != '' THEN 1 ELSE 0 END AS shortlisted_mgmt,
  CASE WHEN c.gf_issue_date IS NOT NULL THEN 1 ELSE 0 END AS gf_issued,
  CASE WHEN c.gf_received_date IS NOT NULL THEN 1 ELSE 0 END AS gf_recv,
  CASE WHEN c.final_status IN ('Appointed/Offered') THEN 1 ELSE 0 END AS appointed,
  CASE WHEN c.doj_actual IS NOT NULL OR c.doj IS NOT NULL THEN 1 ELSE 0 END AS joined,
  CASE WHEN c.final_status = 'Offered But Not Joined' THEN 1 ELSE 0 END AS offered_not_joined
FROM candidates c
LEFT JOIN profiles p    ON p.id    = c.hr_id
LEFT JOIN masters ms    ON ms.id   = c.site_id
LEFT JOIN masters md    ON md.id   = c.designation_id
LEFT JOIN masters msrc  ON msrc.id = c.source_id
WHERE c.is_deleted = false;

-- ── 16. Seed default email templates ─────────────────────
INSERT INTO email_templates (name, subject, body, template_type, variables) VALUES
  ('Offer Letter - Standard',
   'Offer of Employment – {{designation}} at {{company}}',
   'Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{designation}} at {{site}}.\n\nYour joining date is {{doj}}. Please confirm your acceptance by replying to this email.\n\nRegards,\n{{hr_name}}\nHireRabbits HR',
   'offer',
   ARRAY['{{candidate_name}}','{{designation}}','{{company}}','{{site}}','{{doj}}','{{hr_name}}']),
  ('Interview Invitation',
   'Interview Invitation – {{designation}} role',
   'Dear {{candidate_name}},\n\nWe would like to invite you for a {{round}} interview for the {{designation}} position.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\nMode: {{interview_mode}}\n{{meet_link}}\n\nPlease confirm your availability.\n\nRegards,\n{{hr_name}}',
   'interview',
   ARRAY['{{candidate_name}}','{{designation}}','{{round}}','{{interview_date}}','{{interview_time}}','{{interview_mode}}','{{meet_link}}','{{hr_name}}']),
  ('Rejection - Post PI',
   'Regarding your application for {{designation}}',
   'Dear {{candidate_name}},\n\nThank you for taking the time to interview with us for the {{designation}} position.\n\nAfter careful consideration, we have decided to move forward with other candidates at this time. We will keep your profile on file for future opportunities.\n\nBest regards,\n{{hr_name}}\nHireRabbits HR',
   'rejection',
   ARRAY['{{candidate_name}}','{{designation}}','{{hr_name}}'])
ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE — Run this file in Supabase SQL Editor after v2
-- ============================================================
