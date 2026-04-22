# HireRabbits ATS — User Manual
**Stack:** Next.js 14 + Supabase · **Local:** http://localhost:3000

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
