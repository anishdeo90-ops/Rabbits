# HireRabbits — User Manual
**Stack:** Next.js 14 + Supabase · **Local:** http://localhost:3000

---

## 0. Project Quick-Start
> Read this section first when picking up the project. Skips the discovery work earlier sessions already did.

### Machine state (Windows)
- **Project path:** `C:\Users\admin\Music\ATSDashboard-main` (note: `Music` folder, not `Documents`)
- **Node.js:** installed at `C:\Program Files\nodejs\` (v24+). May not be on PATH in some shells — prepend it per-call:
  - PowerShell: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH`
- **`npm.ps1` is blocked unless** the user has run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. If blocked, use `npm.cmd ...` instead of `npm ...`.
- **`node_modules` and `package-lock.json`:** already installed. Don't reinstall unless dependencies changed.
- **`.env.local`:** present with valid Supabase URL + anon + service_role keys. `ANTHROPIC_API_KEY` is **blank** — only AI resume parsing breaks until user adds one.

### Launch the dev server
The user runs `npm run dev` themselves in their own VS Code terminal (so they can watch the browser). **Do not start a competing dev server** from your shell — it'll lock files / fight for port 3000. If you genuinely need to run it (e.g. user is away), use:
```powershell
Set-Location "C:\Users\admin\Music\ATSDashboard-main"
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm.cmd run dev
```

### External services
- **Supabase project:** `lbolfapdgwfquypuzhgl` (URL: `https://lbolfapdgwfquypuzhgl.supabase.co`). User has the Supabase MCP connector installed — use it to query schema, run SQL, check logs instead of guessing.
- **Vercel:** connector installed — use it for deploy logs / env var inspection.
- **GitHub:** repo `ATSDashboard/ATSDashboard`. 

### Bug-fix workflow the user expects
1. User describes the bug + which page (e.g. "/candidates blank") + console errors if any.
2. You read **only the relevant files** (route + component + API handler). Don't read the whole codebase.
3. Edit, let the user verify in their already-running dev server (Next hot-reloads).
4. Once they confirm fixed, they push to GitHub themselves.

### Common gotchas observed
- Bash tool has **no `node`/`npm` in PATH** — use the PowerShell tool (with PATH prepended) for any node command.
- `npm install` in this folder hits **EPERM cleanup warnings** if the dev server or VS Code is holding files. Ask user to close them before reinstalling.
- The folder lives under `Music\` (not a typo) — paths with spaces aren't an issue but watch for `OneDrive` sync conflicts if it ever moves.

---

## 1. First-Time Setup

### A. Supabase
1. Create a project at https://supabase.com (Singapore region)
2. **SQL Editor → New Query** → paste & run `supabase/schema_v3.sql`
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

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

| Role | Candidates | Masters | Users | Dashboard |
|------|-----------|---------|-------|-----------|
| **Admin** | Full CRUD, all records | ✓ Edit | ✓ Create | Full |
| **HR Manager** | Full CRUD, all records | ✓ Edit | View only | Full |
| **Recruiter** | Own records only | Read only | — | Own stats |
| **HOD** | Read only + remarks | — | — | Read only |

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
- **Sheet view**: sortable table with all candidate fields; inline CV upload; click a row to open the detail panel
- **Kanban view**: drag cards across pipeline stages; column headers are **draggable to reorder** and **clickable to change which stage they show**
- **Add candidate**: modal with duplicate-check on mobile number
- **Bulk import**: Upload Excel/CSV → map columns → preview → import
- **Detail panel**: full profile, interview timeline, files, offer letter, CTC breakdown, notes, co-sourcing

### Jobs (`/jobs`)
- Tabs: **Open · On Hold · Closed · Filled**
- Each job card shows headcount and live pipeline counters (in pipeline / shortlisted / appointed / joined)
- **Import button** → bulk job import from LinkedIn/Indeed export format (see Section 5)
- **New Job** modal: title, designation, site, headcount, priority, salary range, target DOJ

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
| 12 | Create a second user (Recruiter role) | `/users` |
| 13 | Log in as Recruiter; verify they only see own candidates | — |
| 14 | Check dashboard stats update | `/dashboard` |

---

## 8. Environment Variables Reference

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |

> All other config (Google Drive, AI keys) is stored in the database via the Settings page — no additional env vars needed.

---

## 9. File Structure (key files only)

```
ats.live/
├── app/
│   ├── (app)/               # Authenticated pages
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

## 2026-06-27 - HireRabbits Frontend Branding Pass

- Replaced legacy orange visual branding with HireRabbits naming, logo assets, favicon, and pink brand palette.
- Aligned global AG Grid styling and CSS import order with the HireRabbits source app.
- Preserved the newer ATSDashboard routes, notification UI, and current NextAuth/Drizzle behavior for the later Supabase conversion step.

## 2026-06-27 - Supabase Migration Extraction

- Added `supabase/migrations/20260627074633_drizzle_feature_tables.sql` from the newer Drizzle schema.
- Migration adds newer app columns/tables: `candidates.referred_by`, job recruiter assignment dates, offer confirmation fields, `recruitment_forms`, `screening_questions`, `candidate_forwards`, `job_creation_requests`, and `notifications`.
- Validated the migration against a temporary local Postgres database; first run and repeat run both succeeded.

## 2026-06-27 - Supabase Switch Handoff

- Added `SUPABASE_SWITCH_PLAN.md` as the implementation handoff for removing NextAuth/Drizzle and switching runtime code back to Supabase.
- The plan points to the original Supabase reference folder in `C:\Users\admin\Music\Rabbits-main\supabase\` and the target migration folder in this repo.

## 2026-06-27 - Supabase Env Setup

- Created `.env.local` in this repo using the Supabase URL, anon key, and service role key from `C:\Users\admin\Music\Rabbits-main\.env.local`.
- Replaced `.env.local.example` with a Supabase-first template and marked the old local database/auth secrets as temporary legacy values to remove during the switch.
- Refreshed `.env.local` with the latest Supabase URL, anon key, service role key, secret key, and access token provided on 2026-06-27.

## 2026-06-27 - Stale Supabase Table Cleanup

- Added and applied `supabase/migrations/20260627084959_drop_stale_hrms_tables.sql` against the linked Supabase project.
- Removed stale HRMS, workflow, payroll, leave, attendance, and unused automation/keyword-scoring tables from `public`.
- Verified the stale HRMS/payroll/workflow table probe is empty on the linked project.

## 2026-06-27 - Supabase Auth Cutover Start

- Added `lib/supabase/client.ts` and `lib/supabase/server.ts` using `@supabase/ssr`.
- Switched middleware, login, app layout, sidebar logout, `/api/me`, and `/api/users/me` from NextAuth sessions to Supabase Auth sessions.
- Removed the legacy auth route and switched runtime user/session reads to Supabase Auth helpers.

## 2026-06-27 - Supabase Feature Route Conversion

- Verified linked Supabase schema for the Drizzle-derived feature tables/columns, RLS, policies, authenticated grants, indexes, and constraints; no idempotent SQL was needed.
- Verified the stale HRMS table probe is empty on the linked project.
- Converted notifications, candidate forwards, job requests, recruitment forms, and screening questions API routes from Drizzle/NextAuth session access to Supabase Auth plus Supabase service queries.
- Verified the linked schema for this route set and kept changes in timestamped Supabase migration files.

## 2026-06-27 - Broad Supabase Runtime Cleanup

- Converted remaining shared API runtime routes from Drizzle imports to Supabase clients, including jobs, candidates, form responses, offers, users/admin helpers, settings/import/dashboard/supporting routes, and the candidates app page.
- Added `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/candidate-duplicates.ts`, and a small `lib/automation/triggers.ts` helper used by the Supabase route set.
- Removed unused generated `drizzle/` and `drizzle.config.ts`.
- Verified `npm run build` succeeds after the route conversion.

## 2026-06-27 - Final Supabase Runtime Cleanup

- Removed the remaining legacy auth/db files and empty folders after all runtime imports were moved to Supabase.
- Removed obsolete Drizzle, Auth.js, local Postgres, and bcrypt npm packages from `package.json` and `package-lock.json`.
- Converted the retained smoke/seed scripts to use Supabase clients and removed old one-off local-Postgres import/report helpers.
- The live Supabase schema matches the app's direct table usage and the production build passes.

## 2026-06-27 - Runtime Table Reconciliation

- Added `supabase/migrations/20260627115037_restore_app_runtime_tables.sql` for three Supabase runtime tables still used by the app: `automation_rules`, `candidate_followups`, and `candidate_job_scores`.
- Applied the migration to the linked Supabase project, enabled RLS, and limited direct authenticated grants on those tables to `SELECT`; server-side writes use the service role.
- Repaired linked migration history for `20260627074633`, `20260627084959`, and `20260627115037`.
- Verified all table names used by app Supabase `.from(...)` calls exist in the linked public schema.
