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

### FRONTEND CHANGE WARNING - READ BEFORE EDITING UI

These rules prevent the site from breaking into raw HTML or distorted table columns:

1. **Do not add CSS `@import` inside `app/globals.css`.**
   - Third-party global CSS must be imported in `app/layout.tsx` before `./globals.css`.
   - Example: AG Grid CSS belongs in `app/layout.tsx`, not inside `globals.css`.
   - If this rule is broken, Next can serve an empty/broken CSS file and the whole app will look unstyled.

2. **Do not move `import "./globals.css"` out of `app/layout.tsx`.**
   - This is the global Tailwind entrypoint for the whole site.
   - Removing it or changing its order can break every page.

3. **Do not add badges, helper text, or nested content inside the Candidates sheet `Name` cell.**
   - The `Name` column must display only the candidate name in bold.
   - Clicking the candidate name may open the candidate detail panel.
   - Extra UI belongs in detail panels, cards, or separate columns, not inside the name cell.

4. **After any frontend change, run:**
```bash
npm run build
```
   - The build runs `scripts/check-css-import-order.mjs`.
   - Do not finish a frontend change if this command fails.

5. **If the site looks blank, raw, or CSS is missing, check the active port and dev cache before editing code.**
   - Confirm you are opening the HireRabbits dev server, not another app already using `localhost:3000`.
   - If port `3000` is occupied, Next may run HireRabbits on `localhost:3001` or another nearby port.
   - Check the page title: HireRabbits should show `<title>HireRabbits</title>`.
   - Check the CSS endpoint from the loaded HTML, for example `/_next/static/css/app/layout.css`; it must return `200` and nonzero content.
   - If the page says `missing required error components, refreshing...`, the real root cause is usually: an old Next dev server is still running while `.next` was deleted or rebuilt underneath it. The old process still points at generated files that no longer exist.
   - If the HTML points to `/_next/static/css/app/layout.css?...` but that URL returns `404`, `500`, or an empty response, `.next` is stale/broken.
   - Do **not** delete `.next` while Next is still running. Always stop the process on the active port first, then delete `.next`, then restart dev.
   - Safe local recovery on Windows for the active port, usually `3001` on this machine:
```powershell
netstat -ano | findstr :3001
Stop-Process -Id <PID> -Force
Remove-Item -Recurse -Force .next
npm.cmd run dev -- -p 3001
```
   - Use port `3000` instead of `3001` if that is the active HireRabbits dev server port.
   - If `npm.cmd run dev -- -p 3001` fails with `EADDRINUSE`, another process is still holding the port; repeat `netstat -ano | findstr :3001` and stop that PID before restarting.
   - If `next dev` fails with `spawn EPERM` inside an agent/sandbox, rerun the dev-server start with elevated permission instead of assuming the app code is broken.
   - If you see stale chunk errors such as `Cannot find module './7787.js'`, use the same `.next` recovery flow.
   - This is a Next generated-cache/dev-server issue unless `app/globals.css` contains `@import` or `app/layout.tsx` import order was changed.

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

#### Candidates Resume Keyword Status

So far, for the **Candidates tab / resume keyword search**, this is already done:

1. **Database support exists**
   - Migration added: `supabase/migrations/20260506120000_resume_keywords.sql`
   - Adds `candidates.parsed_keywords jsonb`
   - Adds GIN indexes for keyword search
   - Adds `candidate_job_scores` table for job-candidate fit scoring

2. **Resume parsing API exists**
   - File: `app/api/parse-resume/route.ts`
   - It sends the uploaded CV/resume to an LLM.
   - It extracts structured fields like:
     - `skills`
     - `tools`
     - `years_experience`
     - `education`
     - `industries`
     - `certifications`
     - `languages`
     - `summary_tags`
   - It saves the result into `candidates.parsed_keywords`.

3. **Candidate detail panel has a Skills tab**
   - File: `components/candidate-detail-panel.tsx`
   - There is a `Skills` tab.
   - It displays parsed resume keywords.
   - It has a "Re-parse CV" / AI resume parser flow.

4. **Candidate list shows keyword tags**
   - File: `app/(app)/candidates/candidates-client.tsx`
   - Candidate rows can show keyword badges from `parsed_keywords.summary_tags`.

5. **CV upload can trigger resume parsing**
   - In the candidates client, after CV upload, it calls `/api/parse-resume`.
   - If parsing succeeds, it updates that candidate's `parsed_keywords` in local state.

6. **Candidate search API supports ranked keyword search**
   - File: `app/api/candidates/route.ts`
   - It already reads `parsed_keywords`.
   - Search checks skills/tools/industries/certifications/languages/summary tags.
   - It scores candidates whose keywords include the search text and sorts strongest resume matches first.

7. **Job ranking exists separately**
   - File: `app/api/jobs/[id]/ranked-candidates/route.ts`
   - File: `app/(app)/jobs/page.tsx`
   - There is a ranked candidates modal under Jobs.
   - It orders candidates by `fit_score` descending.

What is **still not fully done yet**:

- Automatic parsing when a CV is added seems present for upload flows, but there is no confirmed database trigger/background job that parses every new CV row automatically after insert.

Conclusion: the foundation is already there: `parsed_keywords`, LLM parsing, Skills tab, keyword badges, and best-fit keyword search. The Candidates tab now scores and sorts skill searches such as `Python` or `Python 4 years` by strongest match instead of only filtering.

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
- [2026-05-07] Documented real root cause for `missing required error components` blank page and safe `.next` recovery order | —
- [2026-05-07] Fixed Advanced Skill Search focus jumping and added suggestion-only criteria entry | Verify suggestion coverage with real parsed CV data
- [2026-05-07] Documented safe recovery for stale `.next` dev-cache CSS 404s on `layout.css` | —
- [2026-05-07] Added advanced Candidates skill search modal, live AI fit score badges, score-based sorting, and local saved search views | Verify saved views and scoring against real parsed CV data
- [2026-05-07] Added site-break warning for stale `.next` cache, CSS endpoint 500s, and wrong localhost port checks | —
- [2026-05-07] Fixed Candidate detail panel fetch crash and added Candidates tab best-fit skill search ranking | Verify real Supabase data returns expected ranked order
- [2026-05-07] Restored click-to-open behavior on Candidates sheet Name cell while keeping name-only bold display | —
- [2026-05-07] Restored Candidates sheet Name column to plain editable name-only cell and documented frontend no-break rules | —
- [2026-05-06] Added CSS import-order guard to prevent the site-breaker stylesheet regression | —
- [2026-05-06] Hardened candidate routes against schema/parser drift | Run `supabase/migrations/20260506133000_harden_candidate_keyword_view.sql` on existing Supabase projects
- [2026-05-06] Site breaker bug fixed: AG Grid CSS moved out of `globals.css` and imported from root layout before app CSS | Verify authenticated table pages visually after login
- [2026-05-06] Added full Candidates tab resume keyword status breakdown: completed database/parser/UI/search pieces and pending best-fit ranking gap | Implement candidate-tab keyword scoring and sort by strongest match
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
- [2026-05-07] **Bug:** Local dev page could go blank with `missing required error components, refreshing...` after `.next` was removed while the old Next server still held port `3001` | **Fix:** Documented the root cause and required stop-process, delete `.next`, restart-on-active-port order | **File(s):** `USER_MANUAL.md`
- [2026-05-07] **Bug:** Advanced Skill Search modal jumped focus back to the Skills field while editing other fields and allowed typo-prone free-text criteria | **Fix:** Limited autofocus to modal open, added suggestion chips from parsed CV data, and blocked applying or saving pending unselected typed suggestions | **File(s):** `components/skill-search-modal.tsx`, `app/(app)/candidates/candidates-client.tsx`, `USER_MANUAL.md`
- [2026-05-07] **Bug:** Local dev could render unstyled when generated `.next` cache pointed HTML to missing `/_next/static/css/app/layout.css` | **Fix:** Documented diagnosis and safe `.next` cache recovery without editing source CSS | **File(s):** `USER_MANUAL.md`
- [2026-05-07] **Bug:** Candidates skill search could not capture structured criteria or show live per-row fit scores in the AI Score column | **Fix:** Added structured criteria modal, deterministic browser scoring, score badges, sorting, and saved local views | **File(s):** `app/(app)/candidates/candidates-client.tsx`, `components/skill-search-modal.tsx`, `lib/types.ts`, `USER_MANUAL.md`
- [2026-05-07] **Bug:** Candidate detail panel could crash the frontend with `TypeError: Failed to fetch` when candidate/detail side fetches failed | **Fix:** Wrapped panel fetches in guarded error handling and rendered a retryable error state | **File(s):** `components/candidate-detail-panel.tsx`, `USER_MANUAL.md`
- [2026-05-07] **Bug:** Candidate detail panel no longer opened from the Candidates sheet Name cell after simplifying the column | **Fix:** Restored click-to-open on the Name cell only, with bold name-only display and no nested badges/helper content | **File(s):** `app/(app)/candidates/candidates-client.tsx`, `USER_MANUAL.md`
- [2026-05-07] **Bug:** Candidates sheet Name column was overloaded with keyword badges/link styling instead of showing only the candidate name | **Fix:** Removed special Name-cell content/styling and restored normal editable text-cell behavior | **File(s):** `app/(app)/candidates/candidates-client.tsx`, `USER_MANUAL.md`
- [2026-05-06] **Bug:** Candidates site could break after schema/parser changes because `v_pipeline_funnel` exposed computed keyword fields and cast AI JSON directly to integer; future computed fields could also be written back to `candidates` by mistake | **Fix:** Candidate create/update APIs now allowlist real writable columns only, resume parser normalizes keyword arrays/years, and the keyword view safely casts `years_experience` | **File(s):** `app/api/candidates/route.ts`, `app/api/candidates/[id]/route.ts`, `app/api/parse-resume/route.ts`, `supabase/migrations/20260506120000_resume_keywords.sql`, `supabase/migrations/20260506133000_harden_candidate_keyword_view.sql`
- [2026-05-06] **Bug:** Site breaker bug - CSS could break because `app/globals.css` used CSS-level AG Grid `@import`; when the dev CSS endpoint failed, the browser received an empty stylesheet and the app rendered as raw HTML | **Fix:** Moved AG Grid CSS imports to `app/layout.tsx` before `./globals.css`, removed `@import` from `app/globals.css`, and added `predev`/`prebuild` guard so CSS-level imports cannot re-enter `globals.css` | **File(s):** `app/layout.tsx`, `app/globals.css`, `scripts/check-css-import-order.mjs`, `package.json`, `USER_MANUAL.md`
- [2026-05-06] **Bug:** Candidate page could break or show 404 when using `/candidate`, `/candidate/:id`, `/candidates/:id`, or redirected candidate links after login | **Fix:** Added compatibility redirects, preserved `next` through login, and made invalid candidate IDs show a recoverable panel message | **File(s):** `middleware.ts`, `app/login/page.tsx`, `app/(app)/candidates/page.tsx`, `app/(app)/candidates/candidates-client.tsx`, `components/candidate-detail-panel.tsx`, `app/api/candidates/[id]/route.ts`, candidate compatibility route files
<!-- BUG LOG END -->

---

## 12. Major Updates

> Log significant milestones here: new features, breaking changes, schema updates, new integrations.
> Each entry gets its own sub-header. Newest first.

### [2026-05-07] - Advanced Candidate Skill Search Views
- Candidates tab skill search now opens a structured criteria modal over parsed resume keyword fields
- Active searches compute live 0-100 AI fit scores in the sheet AI Score column and sort candidates by fit
- Search criteria can be saved locally and reapplied from quick chips above the filter bar

### [2026-05-07] - Candidate Skill Search Ranking
- Candidates tab skill search now assigns a keyword match score and sorts strongest resume matches first
- Candidate detail panel network/API failures now show a controlled retryable panel instead of a frontend crash

### [2026-05-06] — Initial Release
### [2026-05-06] - Candidate Route Hardening
- New migration: `supabase/migrations/20260506133000_harden_candidate_keyword_view.sql`
- Candidate APIs now ignore view-computed fields and only write real `candidates` columns
- Resume keyword `years_experience` is normalized before save and safely cast in `v_pipeline_funnel`

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
