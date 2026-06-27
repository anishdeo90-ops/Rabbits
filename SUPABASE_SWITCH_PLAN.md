# HireRabbits Supabase Switch Plan

Use this file as the handoff for removing Drizzle/NextAuth from this repo and switching the app fully back to Supabase.

## Current State

- Target repo: `C:\Users\admin\Music\ATSDashboard-main`
- Original Supabase repo/reference: `C:\Users\admin\Music\Rabbits-main`
- Frontend branding has already been switched to HireRabbits in this repo.
- Runtime is still mixed:
  - UI is HireRabbits.
  - Database/API layer still uses Drizzle in `lib/db/*` and many `app/api/**` routes.
  - Auth still uses NextAuth in `auth.ts`, `auth.config.ts`, `middleware.ts`, and login/logout flows.
  - Supabase packages already exist in `package.json`.

## Schema/Migration Source Of Truth

Before removing Drizzle code, make sure Supabase has every table/column the newer app expects.

Use these migration references:

1. Original Supabase schema/reference folder:
   - `C:\Users\admin\Music\Rabbits-main\supabase\schema_full.sql`
   - `C:\Users\admin\Music\Rabbits-main\supabase\schema_v3.sql`
   - `C:\Users\admin\Music\Rabbits-main\supabase\migrations\`

2. Target repo Supabase files:
   - `C:\Users\admin\Music\ATSDashboard-main\supabase\schema_v3.sql`
   - `C:\Users\admin\Music\ATSDashboard-main\supabase\migrations\add_offer_confirmation_fields.sql`
   - `C:\Users\admin\Music\ATSDashboard-main\supabase\migrations\20260627074633_drizzle_feature_tables.sql`

The key new migration is:

```txt
C:\Users\admin\Music\ATSDashboard-main\supabase\migrations\20260627074633_drizzle_feature_tables.sql
```

It was extracted from the newer Drizzle schema and validated against temporary local Postgres. It adds:

- `candidates.referred_by`
- `job_recruiters.assigned_from`
- `job_recruiters.assigned_until`
- `candidate_offers.ctc_confirm_method`
- `candidate_offers.offer_confirm_notes`
- `recruitment_forms`
- `screening_questions`
- `candidate_forwards`
- `job_creation_requests`
- `notifications`
- indexes, RLS, and authenticated grants for those new tables

Do not rely on Drizzle migrations as the final production source. Develop and maintain Supabase SQL migrations under:

```txt
C:\Users\admin\Music\ATSDashboard-main\supabase\migrations\
```

Use `Rabbits-main\supabase\` only as the old/original Supabase reference.

## Required Switch Order

### 1. Verify Supabase Schema First

Apply/verify the target migrations in Supabase before changing runtime code.

Expected tables after migration include at least:

- `profiles`
- `masters`
- `candidates`
- `jobs`
- `job_recruiters`
- `candidate_offers`
- `candidate_forwards`
- `job_creation_requests`
- `notifications`
- `recruitment_forms`
- `screening_questions`

If using Supabase SQL Editor, run the target migration SQL manually. If using CLI, connect the target Supabase project first, then apply migrations from `supabase/migrations`.

### 2. Replace NextAuth With Supabase Auth

Use the original repo as the pattern:

- `C:\Users\admin\Music\Rabbits-main\lib\supabase\client.ts`
- `C:\Users\admin\Music\Rabbits-main\lib\supabase\server.ts`
- `C:\Users\admin\Music\Rabbits-main\middleware.ts`
- `C:\Users\admin\Music\Rabbits-main\app\login\page.tsx`
- `C:\Users\admin\Music\Rabbits-main\components\sidebar.tsx`

Remove or stop using:

- `next-auth`
- `auth.ts`
- `auth.config.ts`
- NextAuth `signIn`
- NextAuth `signOut`
- NextAuth route handlers under `app/api/auth/[...nextauth]`

Expected replacement:

- Browser/client actions use Supabase browser client.
- Server/API routes use Supabase server/service clients.
- Middleware checks Supabase session, not NextAuth session.
- Login page uses Supabase auth flow.
- Logout uses Supabase `auth.signOut()`.

### 3. Replace Drizzle Runtime Queries

Remove imports from:

```txt
@/lib/db
@/lib/db/schema
drizzle-orm
```

Convert API routes under `app/api/**` to Supabase queries.

High-priority routes because they depend on newer tables:

- `app/api/notifications/route.ts`
- `app/api/notifications/[id]/route.ts`
- `app/api/candidate-forwards/route.ts`
- `app/api/candidate-forwards/[id]/route.ts`
- `app/api/job-requests/route.ts`
- `app/api/job-requests/[id]/route.ts`
- `app/api/form-responses/route.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/candidates/route.ts`
- `app/api/candidates/[id]/route.ts`

Use Supabase table names and snake_case column names directly.

### 4. Remove Drizzle Files/Dependencies After Routes Compile

Only remove these after all imports are gone:

- `lib/db/index.ts`
- `lib/db/schema.ts`
- `drizzle/`
- `drizzle.config.ts`
- `drizzle-orm`
- `drizzle-kit`
- `postgres`

Then run:

```bash
npm install
npm run build
```

### 5. Keep Manual Updated

Every repo change must update:

```txt
C:\Users\admin\Music\ATSDashboard-main\USER_MANUAL.md
```

Add concise notes for:

- Supabase auth replacement
- Drizzle route conversion
- Removed dependencies/files
- Any migrations added or changed

## Build/Validation Notes

Known current build behavior:

- `npm run build` works with dummy `DATABASE_URL` because Drizzle still exists.
- Without `DATABASE_URL`, build fails because current Drizzle code throws during route collection.
- After Drizzle removal, `DATABASE_URL` should no longer be required.

Validate after the switch:

```bash
npm run build
rg -n "next-auth|auth\\.ts|auth\\.config|drizzle-orm|@/lib/db|DATABASE_URL|drizzle" .
```

The search should only show historical docs or intentionally retained notes, not runtime code.

## Important Constraint

Do not rewrite the UI during this switch. The frontend branding pass is already done. Keep this task focused on:

- Supabase migrations
- Supabase auth
- Supabase data access
- Drizzle/NextAuth dependency removal
