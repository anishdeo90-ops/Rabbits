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
| `NEXT_PUBLIC_SITE_URL` | Yes in production | Public app origin for public job URLs, sitemap, robots, and Google Jobs JSON-LD |
| `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64` | Required for Google submit | Base64 JSON key for the Google Cloud service account used by the Indexing API |
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
NEXT_PUBLIC_SITE_URL
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
supabase/migrations/20260713064114_site4people_job_boosts.sql
supabase/migrations/20260718082254_candidate_stage_activity_dates.sql
supabase/migrations/20260724075635_candidate_tags.sql
```

Note: `20260627074633_drizzle_feature_tables.sql` has `drizzle` in the filename because it was originally extracted from a newer schema. That name is historical only. Runtime code does not use Drizzle.

The `20260718082254_candidate_stage_activity_dates.sql` migration adds per-stage candidate activity dates, refreshes `v_pipeline_funnel`, and installs a trigger that stamps stage dates when recruiter workflow fields change. It was applied to the linked Supabase project on 2026-07-18. The linked project also has older remote-only migration history entries from April/May 2026 that are not present as local files, so plain `supabase db push` can report migration-history drift until those historical entries are reconciled.

The `20260724075635_candidate_tags.sql` migration adds candidate tagging. Tag definitions live in `masters` with `type = 'tag'`; candidate assignments live in `candidate_tags`; `v_pipeline_funnel` exposes `tag_ids`, `tag_names`, and `tag_colors` arrays for candidate list, ATS, and Kanban views.

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
candidate_tags
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
job_postings
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
| Public Job Page | `/public/jobs/[id]` | Crawlable job detail page for Google Jobs |

## Dashboard Activity Reporting

Dashboard date filters now report both fresh intake and actual work completed during the selected business date range.

Business date ranges use the Asia/Kolkata timezone:

- `Today` uses the current local India business date.
- `This Week` uses Monday through Sunday.
- `This Month` uses the local calendar month.

The dashboard separates activity into:

- `New CVs`: candidates whose `application_date` is inside the selected range.
- `Worked On`: candidates whose `application_date` is outside the selected range but at least one stage activity date is inside the selected range.

Pipeline stage totals use each stage's own date field instead of only checking whether the candidate arrived during the range. For example, `Tel Int Done` counts `tel_int_date` in the selected range, and `Offered` counts `offered_date` in the selected range.

The relevant stage date fields include:

```text
application_date
tel_int_date
google_form_sent_date
google_form_received_date
processed_by_hr_date
shortlist_by_hr_date
shortlisted_for_pi_date
pi1_date
pi2_date
pi3_date
shortlisted_by_mgmt_date
gf_issue_date
gf_received_date
offered_date
offered_not_joined_date
final_status_date
doj_actual
doj
```

When a recruiter changes a workflow field such as Google Form Sent, HR Shortlist, Management Shortlist, Offered, Offered But Did Not Join, or Joined, the Supabase trigger stamps the matching date if it is empty. Existing rows were backfilled during the migration where possible, but old exact stage dates can only be exact when the old database already stored them. Going forward, the trigger records real dates as the work happens.

Candidate drilldowns from the dashboard preserve the activity filters with URL parameters such as `activity_scope`, `date_field`, `pipeline_stage`, and `source_id`, so clicking a dashboard count should open the matching candidate set.

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

## Candidate Tags

Candidate tags are used to segment candidates across Sheet, ATS, and Kanban views.

Admin setup:

1. Open `/settings#masters`.
2. Select the `tag` Dropdown Masters tab.
3. Add active tag names such as `Priority`, `Walk-in`, `Night Shift`, or any segment needed by the team.
4. Pick a tag color from the preset swatches or the custom color picker. The saved color is used everywhere the tag appears.

Candidate assignment:

- Open `/candidates`.
- Click a candidate name to open the candidate sidebar.
- Use the small plus button in the sidebar header beside the existing tag chips to add tags without taking space from `Current Status`.
- Save the sidebar to update the candidate's tag assignments.
- In Sheet view, use the plus button in the thin `TAGS` column to add a tag directly from the grid.

Candidate display and filtering:

- `/candidates` has a `Tag` filter in the main filter bar.
- The filter sends `tag_id` to `/api/candidates`, so Sheet, ATS, and Kanban all show the same filtered candidate set.
- Sheet view has a thin `TAGS` column near the end of the grid, before `AI Score`.
- ATS cards and Kanban cards show colored tag chips directly on each candidate card.
- The candidate sidebar header also shows the assigned tag chips.
- Existing linked Supabase tag rows that had no saved color were backfilled to the default pink `#ff2d87`; future tag creation defaults to the same color if no color is supplied.

Supabase storage:

```text
masters.type = 'tag' stores active tag definitions, including the saved color.
candidate_tags stores candidate/tag assignments.
v_pipeline_funnel exposes tag_ids, tag_names, and tag_colors arrays.
```

## Site4People And Google Jobs

Detailed integration notes live in:

```text
SITE4PEOPLE-INTEGRATION.md
```

Site4People boost-job webhook:

```text
POST /api/integrations/site4people/jobs/boost
Header: X-API-KEY: <SITE4PEOPLE_API_KEY>
```

When Site4People sends a boosted job:

1. The ATS creates or updates one canonical row in `jobs`.
2. Site4People identity is stored on that job row using `external_source`, `external_job_uid`, `external_job_id`, `external_received_at`, and `external_payload`.
3. The ATS creates/updates a `job_postings` row for `platform = Google Jobs`.
4. The public Google Jobs page is available at `/public/jobs/<ats_job_id>`.

Google Jobs does not use Python/Playwright posting. Google discovers public pages from:

```text
/public/jobs/<ats_job_id>
/sitemap.xml
/robots.txt
```

The public job page includes `JobPosting` JSON-LD, SEO metadata, and an `Apply Now` card. Admin/HR/HOD users can manage Google Jobs visibility from `/jobs`; each job card shows a Google Jobs checkbox, status badge, public job page link, and Submit button.

Google Indexing API setup:

```text
1. In Google Cloud, enable the Indexing API for the project.
2. Create a service account and JSON key.
3. In Google Search Console, verify the production site.
4. Add the service account email as a delegated owner of that Search Console property.
5. Set NEXT_PUBLIC_SITE_URL to the production https domain.
6. Set GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON_BASE64 from the service account JSON.
```

Current production setup:

```text
Site URL: https://rabbits-xi.vercel.app/
Search Console property: URL prefix
Verification file: /googled33e2ff6082116c6.html
Indexing service account: hire-rabbits-530@scraper-483120.iam.gserviceaccount.com
```

Admin posting flow:

```text
1. Open /jobs.
2. Tick Google Jobs on the job card.
3. Link an active form from Forms, for example Payroll Manager Form.
4. Open Public job page and confirm Apply Now is active.
5. Click Submit on the Google Jobs card.
```

Admin card status labels:

```text
Ready       = Google Jobs tracking is enabled and the public page is ready.
Submitting  = ATS is calling Google's Indexing API.
Submitted   = Google accepted the URL_UPDATED notification.
Failed      = Google rejected the notification; hover the badge or retry after fixing setup.
Off         = Google Jobs tracking is disabled for this job.
```

The Submit button calls:

```text
POST /api/job-postings/google-indexing
Body: { "job_id": "<ats_job_id>", "type": "URL_UPDATED" }
```

Google still decides when and whether to index the page. `Submitted` means Google accepted the crawl notification, not that the job is already visible in Google search results.

Apply button rule:

```text
Grey Apply Now = no active form is linked to that job.
Active Apply Now = form_job_links has a row and the linked form has is_active = true.
```

If Google returns `403 Failed to verify the URL ownership`, add the service account as a delegated owner in Search Console, not only as a normal/full user.

Current Apply behavior:

- If the job is linked to an active form, `Apply Now` opens `/f/<form_id>?j=<job_id>`.
- The submitted response is stored in `form_responses` with `form_id`, `job_id`, `responses`, `respondent_name`, and `respondent_email`.
- If the URL also has `c=<candidate_id>`, the form submission updates empty mapped fields on that existing candidate.
- If the URL only has `j=<job_id>`, the response is saved in `form_responses`, but a new `candidates` row is not created yet.

Required next step before Google Jobs applications fully appear on `/candidates`:

```text
On public form submit with job_id and no candidate_id:
1. create a candidates row,
2. set candidates.job_id,
3. set application_date and month,
4. map name/mobile/email/current location/designation from form fields,
5. update form_responses.candidate_id to the new candidate id,
6. if jobs.external_source = site4people, send candidate callback to Site4People.
```

Until that is built, public Google Jobs applications are captured in `form_responses` but do not automatically appear in the Candidates page.

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

Public job pages open linked forms with `j=<job_id>`. Those submissions are currently stored in `form_responses`. Candidate auto-creation from unauthenticated public applications is pending; see "Site4People And Google Jobs".

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
10. Open `/settings#masters`, add or confirm an active `tag`, assign it from a candidate sidebar, and verify the `/candidates` Tag filter affects Sheet, ATS, and Kanban.
11. Run `npm.cmd run build` before deploying code changes.

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
