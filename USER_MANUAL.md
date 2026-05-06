# HireRabbits ATS — User Manual
**Stack:** Next.js 14 + Supabase · **Local:** http://localhost:3000

---

## CONTRIBUTING TO THIS MANUAL

Every time a change is made to the codebase, update this file before finishing:

1. **What we did** — add a one-line entry under the relevant Change Log date
2. **Next step** — note what still needs to be done (or write "—" if complete)
3. **Bug fixes** — log any bug fixed under Section 10 (Bug Fix Log)
4. **Major updates** — if the change is significant (new feature, breaking change, schema update), add a header entry under Section 11 (Major Updates)

Keep entries short and factual. Newest entries go at the top of each section.

---

## 1. First-Time Setup

### A. Supabase
1. Create a project at https://supabase.com (Singapore region)
2. **SQL Editor → New Query** → paste & run `supabase/schema_v3.sql`
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

> Automation setup: after running `supabase/schema_v3.sql`, also run `supabase/migrations/20260506090000_followup_automation.sql`.

### B. Environment
```bash
cp .env.local.example .env.local
# fill in the 3 Supabase keys above
```

### C. Run locally
```bash
npm install
npm run dev        # → http://localhost:3000
```

### D. Create first Admin
1. Supabase → **Authentication → Users → Invite user** (enter your email)
2. SQL Editor, run:
```sql
UPDATE profiles SET role = 'admin', name = 'Your Name'
WHERE email = 'your@email.com';
```
3. Log in at `/login`

### E. Deploy to Vercel
Connect repo → add the 3 env vars in Vercel Settings → deploy.

---

## 2. User Roles

| Role | Candidates | Masters | Users | Dashboard | Automation |
|------|-----------|---------|-------|-----------|------------|
| **Admin** | Full CRUD, all records | ✓ Edit | ✓ Create | Full | Full |
| **HR Manager** | Full CRUD, all records | ✓ Edit | View only | Full | Full |
| **Recruiter** | Own records only | Read only | — | Own stats | — |
| **HOD** | Read only + remarks | — | — | Read only | — |

---

## 3. Google Drive Setup (CV uploads)

1. Create a **Google Shared Drive** (Google Workspace required)
2. Go to **Settings → Google Drive** in the app
3. Paste your service account JSON key
4. Paste the Shared Drive folder ID (from the URL: `drive.google.com/drive/folders/FOLDER_ID`)
5. Add the service account email as **Content Manager** on the Shared Drive

> ⚠️ Must use a Shared Drive — service accounts have 0 quota on personal Drive.

---

## 4. Module Guide

### Candidates (`/candidates`)
- **Sheet view**: sortable table with all candidate fields; inline CV upload; keyword tags; click a row to open the detail panel
- **Skill Search**: second search box for resume keywords such as `Python 4 years`, `React developer`, or `team lead`
- **Kanban view**: drag cards across pipeline stages; column headers are **draggable to reorder** and **clickable to change which stage they show**; cards show parsed keyword tags
- **Add candidate**: modal with duplicate-check on mobile number
- **Bulk import**: Upload Excel/CSV → map columns → preview → import
- **Detail panel**: full profile, Skills tab, interview timeline, files, offer letter, CTC breakdown, notes, co-sourcing
- **AI resume parser**: CV parsing stores `parsed_keywords` with skills, tools, experience, education, industries, certifications, languages, and summary tags

### Jobs (`/jobs`)
- Tabs: **Open · On Hold · Closed · Filled**
- Each job card shows headcount and live pipeline counters (in pipeline / shortlisted / appointed / joined)
- **Import button** → bulk job import from LinkedIn/Indeed export format (see Section 5)
- **New Job** modal: title, designation, site, headcount, priority, salary range, target DOJ

### Automation (`/automation`)
- Sidebar placement: appears immediately after **Jobs**
- Admin/HR Manager only
- Tabs: **Rules · Templates · History · Settings**
- **Rules**: enable/disable automated follow-ups, alerts, stale job checks, and digests
- **Templates**: manage WhatsApp and Email message copy with supported variables
- **History**: review automation runs and communication logs
- **Settings**: configure provider credentials, dry-run mode, and test delivery

### JDs & Forms (`/jds`)
- Create Job Descriptions and attach Assessment Forms
- **Assessments**: Edit, Delete (soft archive), **Share Link** — sends a public URL candidates can open in any browser (no login required)
- **Forms**: same Share modal with Copy Link + WhatsApp share button

### My Activity (`/my-activity`)
Two sections:
1. **Schedule Interview** — pick candidate (autocomplete), round, date/time/link; creates interview record
2. **Communication Tracker** — log WhatsApp, Email, Call, SMS, In Person, or Other communications
   - Timeline view per candidate, newest first
   - Filter by channel (All / WhatsApp / Email / Call / SMS / In Person / Other)
   - Hover any entry → red × to delete

### Dashboard (`/dashboard`)
- Summary stats: total candidates, active jobs, interviews this week, recent joins
- Funnel chart by stage, designation mix, recruiter leaderboard

### Masters (`/masters`)
- Manage lookup lists: Designations, Sites, Skills, Sources
- Admin/HR Manager only

### Users (`/users`)
- Create team members: name, email, password, role
- Admin only

### Settings (`/settings`)
- **Google Drive**: configure service account + folder ID
- **AI Key**: org-level OpenAI key for resume parsing (Admin); personal key override (Recruiter)
- **CTC Templates**: salary structure templates per designation

### HOD Portal (`/hod-portal`)
- Restricted view for Department Heads
- Submit hiring requests; track open positions; add remarks on candidates

---

## 5. Bulk Import

### Candidate Import
1. Go to **Candidates → Import**
2. Download the sample Excel to see the expected format
3. Upload your file → auto-map columns → preview → import
4. Results show per-row status (created / duplicate / error)

**Supported columns:** Name, Mobile, Email, Designation, Current CTC, Expected CTC, Notice Period, Location, Source, LinkedIn URL, Current Company, Skills, Experience, Notes

### Job Import (LinkedIn / Indeed format)
1. Go to **Jobs → Import**
2. Download the sample — matches LinkedIn job export column names
3. Upload → map columns → preview → import
4. Site and Designation values are matched to Masters by name (case-insensitive)

**Supported columns:** Job Title, Location, Designation/Department, Headcount, Priority, Status, Employment Type, Min/Max Salary, Opening Date, Target DOJ, Description, Requirements, Client Name

---

## 6. Public Form Links (Candidate-Facing)

When you click **Share** on an Assessment or Form, the URL format is:
```
https://your-domain.com/f/FORM_ID
```
- No login required — anyone with the link can fill it out
- Responses are stored and visible in the JDs/Forms page
- Share via WhatsApp using the built-in share button

---

## 7. Quick Test Checklist

| # | What to test | Where |
|---|-------------|-------|
| 1 | Login with admin account | `/login` |
| 2 | Add a site and designation | `/masters` |
| 3 | Create a job | `/jobs` → New Job |
| 4 | Import 5 candidates from sample Excel | `/import` |
| 5 | Move a candidate through Kanban stages | `/candidates` → Kanban |
| 6 | Upload a CV file to a candidate | Sheet view → CV column |
| 7 | Create a JD and attach an assessment | `/jds` |
| 8 | Share an assessment link; open in incognito | Copy link from Share modal |
| 9 | Schedule an interview | `/my-activity` |
| 10 | Log a WhatsApp communication | `/my-activity` → Log Communication |
| 11 | Import jobs from sample Excel | `/jobs` → Import |
| 12 | Verify Automation tab appears after Jobs for Admin/HR Manager | Sidebar → `/automation` |
| 13 | Create a second user (Recruiter role) | `/users` |
| 14 | Log in as Recruiter; verify they only see own candidates and no Automation tab | — |
| 15 | Check dashboard stats update | `/dashboard` |

---

## 8. Environment Variables Reference

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `CRON_SECRET` | Long random string used by Vercel Cron for `/api/automation/run` |

> Google Drive, AI keys, Twilio, and Resend credentials are stored in the database via Settings/Automation pages.

---

## 9. File Structure (key files only)

```
ats.live/
├── app/
│   ├── (app)/               # Authenticated pages
│   │   ├── automation/      # Follow-up rules, templates, history, settings
│   │   ├── candidates/      # Pipeline + Kanban view
│   │   ├── dashboard/       # Stats overview
│   │   ├── hod-portal/      # HOD-only view
│   │   ├── import/          # Candidate bulk import
│   │   ├── jds/             # JDs, Assessments, Forms
│   │   ├── jobs/
│   │   │   └── import/      # Job bulk import
│   │   ├── masters/         # Lookup data management
│   │   ├── my-activity/     # Interviews + Comms tracker
│   │   ├── settings/        # Drive, AI, CTC config
│   │   ├── sync/            # Google Sheets sync
│   │   └── users/           # Team management
│   ├── api/                 # 29 API route handlers
│   ├── f/[id]/              # Public form viewer (no auth)
│   └── login/               # Auth page
├── components/              # Shared React components
├── lib/                     # Supabase client, types, utils
├── supabase/
│   └── schema_v3.sql        # Full database schema (run this)
├── .env.local.example       # Copy → .env.local
└── USER_MANUAL.md           # This file
```

---

## 10. Change Log

> Add a new entry here every time you make a change. Format: `- [YYYY-MM-DD] What was done | Next step`
> Newest first.

<!-- CHANGE LOG START -->
- [2026-05-06] Resume keyword intelligence added with parsed keyword storage, skill search, candidate keyword badges, and job ranked-candidate view | Run `supabase/migrations/20260506120000_resume_keywords.sql`
- [2026-05-06] Fixed candidate page break/404 compatibility issue | Verify candidate detail links with real candidate IDs after login
- [2026-05-06] Automation load now reports missing DB migration clearly; setup docs call out the Automation migration | Run `supabase/migrations/20260506090000_followup_automation.sql` on any existing Supabase project missing Automation tables
- [2026-05-06] User manual updated for Automation sidebar placement after Jobs and Automation module usage | —
- [2026-05-06] Follow-up Automation module added - 6 new DB tables, 24 rules, Twilio + Resend delivery | Schema migration required: run `supabase/migrations/20260506090000_followup_automation.sql`
- [2026-05-06] Initial USER_MANUAL.md created with setup, roles, modules, import, and env var docs | —
<!-- CHANGE LOG END -->

---

## 11. Bug Fix Log

> Every bug fix must be logged here. Format: `- [YYYY-MM-DD] **Bug:** description | **Fix:** what was done | **File(s):** path(s)`
> Newest first.

<!-- BUG LOG START -->
- [2026-05-06] **Bug:** Candidate page could break or show 404 when using `/candidate`, `/candidate/:id`, `/candidates/:id`, or redirected candidate links after login | **Fix:** Added compatibility redirects, preserved `next` through login, and made invalid candidate IDs show a recoverable panel message | **File(s):** `middleware.ts`, `app/login/page.tsx`, `app/(app)/candidates/page.tsx`, `app/(app)/candidates/candidates-client.tsx`, `components/candidate-detail-panel.tsx`, `app/api/candidates/[id]/route.ts`, candidate compatibility route files
<!-- BUG LOG END -->

---

## 12. Major Updates

> Log significant milestones here: new features, breaking changes, schema updates, new integrations.
> Each entry gets its own sub-header. Newest first.

### [2026-05-06] — Initial Release
### [2026-05-06] - Follow-up Automation Module
- New module: `/automation` (Admin + HR Manager only)
- 6 new tables: `message_templates`, `automation_rules`, `candidate_followups`, `communication_logs`, `automation_runs`, `automation_settings`
- 24 pre-built automation rules for candidate engagement, recruiter alerts, stale jobs, and digests
- WhatsApp delivery via Twilio; Email delivery via Resend
- Vercel Cron runs evaluator daily at `/api/automation/run` on Hobby-compatible deployments; use a Pro plan if you need the original 15-minute cadence
- All sent candidate messages appear in the existing candidate communication tracker
- Dry-run mode for safe testing before going live

### [2026-05-06] - Initial Release
- Full ATS launched: Candidates, Jobs, JDs, My Activity, Dashboard, Masters, Users, Settings, HOD Portal
- Schema: `schema_v3.sql`
- Google Drive integration (service account + Shared Drive)
- Public form links (`/f/[id]`) with no-auth access
- Bulk import for candidates and jobs (Excel/CSV)
