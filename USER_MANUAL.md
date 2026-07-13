# HireRabbits ATS User Manual

This manual describes the current repository state. The app is a Next.js 14 ATS connected to Supabase for authentication and data. The old database/auth stack has been removed from runtime code.

## Current Status

- App package: `hirerabbits-ats`
- Framework: Next.js 14 App Router
- Runtime data source: Supabase
- Runtime auth: Supabase Auth
- Production host: Vercel
- Final working Vercel project: `rabbits`
- Current local repo path: `C:\Users\admin\Music\ATSDashboard-main`

The app no longer uses Drizzle ORM, NextAuth/Auth.js, a local Postgres runtime, `DATABASE_URL`, or bcrypt-based app passwords.

## Local Setup

Use PowerShell on Windows. If `npm.ps1` is blocked, use `npm.cmd`.

```powershell
Set-Location "C:\Users\admin\Music\ATSDashboard-main"
npm.cmd install
npm.cmd run dev
```

Default local URL:

```text
http://localhost:3000
```

If port `3000` is busy, run Next on another port:

```powershell
npm.cmd run dev -- -p 3002
```

Build check:

```powershell
npm.cmd run build
```

The build runs `scripts/check-css-import-order.mjs` before Next builds. If a stale `.next` cache causes a page-module error, stop the dev server, delete `.next`, and run the build again.

## Environment Variables

Copy `.env.local.example` to `.env.local` and set these values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser and server Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only admin/service queries |
| `ANTHROPIC_API_KEY` | Optional | AI resume parsing fallback key |
| `SITE4PEOPLE_API_KEY` | Optional | Shared secret for the Site4People boost-job webhook |
| `SITE4PEOPLE_CANDIDATE_CALLBACK_URL` | Optional | Site4People URL for sending candidates back |

Do not add old Drizzle, Auth.js, or local database variables. The app does not need `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, or local Postgres credentials.

## Authentication

Login page:

```text
/login
```

Auth flow:

- `app/login/page.tsx` signs in with `supabase.auth.signInWithPassword`.
- `middleware.ts` checks the Supabase session cookie.
- Unauthenticated private routes redirect to `/login?next=...`.
- Authenticated users visiting `/login` redirect to the requested `next` path or `/dashboard`.
- `app/auth/callback/route.ts` handles Supabase auth callback exchanges.
- Server code creates Supabase clients through `lib/supabase/server.ts`.
- Browser code creates Supabase clients through `lib/supabase/client.ts`.

User profile and role data lives in the `profiles` table. Supabase Auth stores the actual login identity.

## Production Deployment

Production is deployed on Vercel. The deployment only works when the Vercel project has the Supabase env vars set manually or through Vercel project settings.

Required Vercel env vars:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Optional:

```text
ANTHROPIC_API_KEY
SITE4PEOPLE_API_KEY
SITE4PEOPLE_CANDIDATE_CALLBACK_URL
```

After changing env vars in Vercel, redeploy the project. A deployment with missing or wrong Supabase env vars can show login redirects, failed auth, or broken server routes even when localhost works.

## Supabase Database

Remote Supabase is the source of truth. The local repo contains migration files and a schema reference, but the live Supabase project is what the app actually uses.

Current migration files:

```text
supabase/migrations/20260627074633_drizzle_feature_tables.sql
supabase/migrations/20260627084959_drop_stale_hrms_tables.sql
supabase/migrations/20260627115037_restore_app_runtime_tables.sql
```

Note: `20260627074633_drizzle_feature_tables.sql` has `drizzle` in the filename because it was originally extracted from a newer schema. That name is historical only. Runtime code does not use Drizzle.

Legacy file:

```text
supabase/migrations/add_offer_confirmation_fields.sql
```

This file is not timestamped like a normal Supabase CLI migration. Treat it as legacy/reference unless it is intentionally repaired or replaced with a proper timestamped migration.

Schema reference:

```text
supabase/schema_v3.sql
```

Use it as a reference snapshot, not as a guaranteed full rebuild of production.

### Current Public Tables

The linked Supabase project should contain these app tables in `public`:

```text
activity_log
ai_settings
assessment_jobs
assessments
automation_rules
backup_log
candidate_communications
candidate_files
candidate_followups
candidate_forwards
candidate_job_scores
candidate_offers
candidates
co_sourcers
ctc_templates
custom_columns
deletion_requests
email_template_jobs
email_templates
form_job_links
form_responses
forms
google_drive_settings
hiring_requests
interviews
jd_library
job_creation_requests
job_recruiters
jobs
masters
notifications
profiles
recruitment_forms
screening_questions
sync_configs
sync_conflicts
```

Current public view:

```text
v_pipeline_funnel
```

No HRMS, payroll, attendance, leave, workflow, or other stale tables are required by this app.

## Main App Pages

| Page | Route | Purpose |
| --- | --- | --- |
| Dashboard | `/dashboard` | ATS summary stats and funnel data |
| Candidates | `/candidates` | Candidate table, pipeline, files, offers, and activity |
| Jobs | `/jobs` | Job openings and pipeline counters |
| Job Import | `/jobs/import` | Bulk job import |
| Candidate Import | `/import` | Bulk candidate import |
| JDs and Forms | `/jds` | JD library, assessments, and shareable forms |
| My Activity | `/my-activity` | Interviews and communication tracker |
| Offers | `/offers` | Candidate offer tracking |
| Notifications | `/notifications` | App notifications |
| Masters | `/masters` | Lookup data management |
| Users | `/users` | Team/admin user management |
| Settings | `/settings` | Profile, team, masters, email templates, workflows, integrations, AI, backup, billing |
| Sync | `/sync` | Google Sheets sync tools |
| HOD Portal | `/hod-portal` | Hiring requests and HOD review |
| Public Form | `/f/[id]` | Candidate-facing form without login |

## User Roles

| Role | Typical Access |
| --- | --- |
| Admin | Full app access, users, settings, masters, all records |
| HR Manager | Broad recruiting access and reporting |
| Recruiter | Recruiting workflow, usually scoped to assigned/owned work |
| HOD | Hiring request and review workflow |

Exact permissions are enforced in route/page code and Supabase-backed user/profile data.

## Candidate Workflows

Manual follow-up workflows are available from the Candidates page and are stored in Supabase.

Main behavior:

- Candidate row selection is hidden by default so the sheet stays clean.
- Click the `#` column header on `/candidates` to enter selection mode.
- Select one or more visible candidates.
- Use `Start Workflow` to open the workflow modal.
- Choose an active workflow and start it for the selected candidates.
- Candidates without email are skipped.
- Duplicate pending enrollments for the same candidate/workflow are skipped.
- Workflow rows are queued as a drip, not sent all at once.

Workflow data uses existing tables:

```text
automation_rules
candidate_followups
```

No extra workflow table is required for the current implementation. Workflow definitions use `automation_rules.trigger_type = manual_workflow`; queued candidate sends are stored in `candidate_followups`.

Admins, HR managers, and HOD users can create, edit, activate, and deactivate workflows from:

```text
/settings#workflows
```

Recruiters can view active workflows and start allowed workflows for candidates they can access.

## Mobile Navigation

Desktop and laptop keep the normal left Settings sidebar.

On mobile:

- Tap the main hamburger menu.
- Tap `Settings` in the app drawer.
- Settings expands inside the same drawer and shows its sub-options.
- Tap a Settings sub-option such as `Workflows`, `Email Templates`, or `AI & Automation`.
- The drawer closes and the Settings page opens that section using a URL hash such as `/settings#workflows`.

The Settings page does not show a second horizontal section scroller on mobile.

## Key Runtime Files

```text
app/login/page.tsx
app/auth/callback/route.ts
middleware.ts
lib/supabase/client.ts
lib/supabase/server.ts
lib/types.ts
lib/candidate-duplicates.ts
lib/automation/triggers.ts
lib/workflows/defaults.ts
```

API routes live under:

```text
app/api/
```

Authenticated app pages live under:

```text
app/(app)/
```

Public form pages live under:

```text
app/f/[id]/
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start local Next dev server |
| `npm.cmd run build` | Validate CSS import order and build production app |
| `npm.cmd run start` | Start a built production app |
| `scripts/check-css-import-order.mjs` | Prevent global CSS import-order regressions |
| `scripts/test-db.mjs` | Supabase connection smoke test |
| `scripts/smoke-2b8.mjs` | Supabase smoke check |
| `scripts/smoke-2b9.mjs` | Supabase smoke check |
| `scripts/seed-*.mjs` | Seed Supabase form templates |

## Google Drive Setup

Google Drive integration is configured from the app settings page, not from local database config.

1. Create or choose a Google Shared Drive folder.
2. Add the service account email as Content Manager.
3. Open `/settings`.
4. Save the service account JSON and folder ID.
5. Test candidate CV upload from `/candidates`.

Service accounts should use Shared Drive storage. Personal Drive storage can fail because service accounts may have no usable personal storage quota.

## AI Resume Parsing

AI parsing can use:

- `ANTHROPIC_API_KEY` from environment as a fallback.
- AI settings stored in Supabase through `/settings`.

If AI parsing fails but the app otherwise works, check the API key first.

## Bulk Import

Candidate import:

```text
/import
```

Supported candidate fields include name, mobile, email, designation, CTC, notice period, location, source, company, skills, experience, and notes.

Job import:

```text
/jobs/import
```

Supported job fields include title, location, designation, headcount, priority, status, employment type, salary range, opening date, target DOJ, description, requirements, and client name.

## Public Forms

Public form links use this format:

```text
https://your-domain.com/f/FORM_ID
```

Public forms do not require login. Responses are stored in Supabase and shown inside the app.

## Quick Verification Checklist

1. Log in at `/login`.
2. Open `/dashboard`.
3. Create or update a candidate in `/candidates`.
4. Create or update a job in `/jobs`.
5. Open `/jds` and verify forms/assessments load.
6. Open a public `/f/[id]` link in a signed-out browser.
7. Upload a candidate CV if Google Drive is configured.
8. Open `/settings#workflows` and verify workflows load.
9. Select candidates from `/candidates` and verify the Start Workflow modal opens.
10. Run `npm.cmd run build` before deploying code changes.

## Removed Legacy Stack

These are intentionally not part of the current runtime:

```text
auth.ts
auth.config.ts
types/next-auth.d.ts
lib/db/
drizzle/
drizzle.config.ts
DATABASE_URL
NextAuth/Auth.js runtime sessions
Drizzle ORM runtime queries
local Postgres runtime connection
bcryptjs app-password flow
```

If any new code or documentation asks for those items, treat it as stale and update it to the Supabase path instead.
