# HIRE RABBITS ATS — Server Guide & Full Reference

> **KEEP THIS FILE PRIVATE. DO NOT COMMIT TO GIT.**
> Stale as of 2026-07-13 - this file describes the old server/VPS setup. Use `USER_MANUAL.md` for the current Vercel production app (`https://rabbits-xi.vercel.app`).

This is the single source of truth for the Hire Rabbits ATS deployment: what runs where, every credential, what we achieved, and how to do every common operation (add a user, reset a password, deploy a change, roll back, etc.).

---

## ⚠️ WORKFLOW RULE — ALWAYS ASK FIRST: Local or Real?

**Before ANY code edit, Claude MUST ask the user: "Are you editing the LOCAL sandbox or the REAL live server?"**
**Default answer when unclear: LOCAL. Never edit live without explicit confirmation.**

| Folder | What it is | URL | Port |
|---|---|---|---|
| `/root/ats-staging/` | **LOCAL — staging sandbox** (test here first) | `http://localhost:3001` (via SSH tunnel) | :3001 |
| `/var/www/ats/` | **REAL — live, what users see** | `https://srv1642268.hstgr.cloud` | :3000 |

**Trigger words → behavior:**

| User says... | What it means | What Claude does |
|---|---|---|
| "local", "localhost", "sandbox", ":3001", "staging", "test" | Edit on staging | Give commands targeting `/root/ats-staging/`. Changes stay local. No `pm2 restart ats`. No build. Hot-reload picks up edits. |
| "live", "real", "production", ":3000", "deploy", "push to server" | Promote to live | First confirm with user. Then run the deploy flow ([§9.9](#99-deploy-a-code-change)): rsync staging → live → `NODE_OPTIONS=3500 npm run build` → `pm2 restart ats`. |
| "merge", "ship it", "looks good push it" | Same as above | Same — confirm, then deploy. |

**Workflow contract:**
1. ALL fixes start on **LOCAL** (`/root/ats-staging/`, port 3001).
2. User tests on `http://localhost:3001` via SSH tunnel.
3. When user explicitly says "merge / push / deploy / go live" → Claude runs the deploy flow ONLY after a confirmation.
4. **Never edit `/var/www/ats/` directly.** Hot-patches there get blown away on the next deploy and create drift between live and staging.

**Quick sanity check before editing — one question, every time:**
> "You're editing **local sandbox** (`/root/ats-staging`, port 3001) — confirm? Or did you mean live?"

---

## ⚡ QUICK START — Start Localhost (Port 3001)

These are the only commands you need to run the local dev server and open it in your browser.

### Step 1 — SSH into the VPS (from your laptop / Windows cmd)
```bash
ssh root@91.108.110.236
# Password: Vps123456789####
```

### Step 2 — Start the dev server on the VPS
```bash
cd /root/ats-staging
PORT=3001 nohup npm run dev > /tmp/staging-dev.log 2>&1 &
disown
```

Wait ~15–20 seconds for Next.js to compile, then check it started:
```bash
tail -20 /tmp/staging-dev.log
# Look for: "✓ Ready in Xs" or "ready started server on 0.0.0.0:3001"
```

### Step 3 — Open a tunnel from your laptop (new terminal window, keep SSH open)
```bash
ssh -L 3001:127.0.0.1:3001 root@91.108.110.236
# Leave this terminal open while you work
```

### Step 4 — Open in browser
```
http://localhost:3001
```

Login credentials are the same as the live site (`mis1.hirerabbits@gmail.com` etc.).

### To stop the dev server
```bash
pkill -f "next dev"
```

### Check if it's already running
```bash
pgrep -af "next dev"
# If output shows PIDs → already running, skip Step 2
tail -20 /tmp/staging-dev.log   # see the last compile status
```

> **Reminder:** This is the LOCAL sandbox. Nothing here affects the live site at https://srv1642268.hstgr.cloud. See the workflow rule above.

---

## Table of Contents

1. [Current Status](#1-current-status)
2. [What We Achieved (Phase History)](#2-what-we-achieved-phase-history)
3. [Server Architecture (One-Box Topology)](#3-server-architecture-one-box-topology)
4. [Tech Stack](#4-tech-stack)
5. [Credentials & Access](#5-credentials--access)
   - 5.1 [VPS](#51-vps--hostinger-kvm-1)
   - 5.2 [Supabase](#52-supabase-still-live)
   - 5.3 [Local Postgres on VPS](#53-local-postgres-on-vps)
   - 5.4 [GitHub](#54-github)
   - 5.5 [Environment Variables](#55-environment-variables-envlocal)
6. [Project File Hierarchy](#6-project-file-hierarchy)
7. [VPS File Locations](#7-vps-file-locations)
8. [Functionality Map (App Features → Files)](#8-functionality-map-app-features--files)
9. [How-To Operations](#9-how-to-operations)
   - 9.1 [SSH In](#91-ssh-in)
   - 9.2 [Manage the Live App (PM2)](#92-manage-the-live-app-pm2)
   - 9.3 [Add a New User](#93-add-a-new-user)
   - 9.4 [Delete a User](#94-delete-a-user)
   - 9.5 [Reset a User's Password](#95-reset-a-users-password)
   - 9.6 [Promote a User to Admin](#96-promote-a-user-to-admin)
   - 9.7 [Change a User's Role](#97-change-a-users-role)
   - 9.8 [Deactivate (Soft-Delete) a User](#98-deactivate-soft-delete-a-user)
   - 9.9 [Deploy a Code Change](#99-deploy-a-code-change)
   - 9.10 [Rollback a Bad Deploy](#910-rollback-a-bad-deploy)
   - 9.11 [Query the Database](#911-query-the-database)
   - 9.12 [View Application Logs](#912-view-application-logs)
   - 9.13 [Restart Nginx](#913-restart-nginx)
   - 9.14 [Renew the HTTPS Cert](#914-renew-the-https-cert)
   - 9.15 [Run the Staging Dev Server](#915-run-the-staging-dev-server)
   - 9.16 [Manual SQL: Bcrypt a Password](#916-manual-sql-bcrypt-a-password)
   - 9.17 [Refresh Local Postgres from Supabase](#917-refresh-local-postgres-from-supabase)
   - 9.18 [Seed / Refresh the Hire Rabbits Candidate Data Form](#918-seed--refresh-the-hire-rabbits-candidate-data-form)
10. [Data Snapshot](#10-data-snapshot)
11. [Phase Tracker](#11-phase-tracker)
12. [Things to Rotate / Fix](#12-things-to-rotate--fix)
13. [Phase 2B Detailed Plan (preserved)](#13-phase-2b-detailed-plan-preserved)
14. [Phase 2B Execution Log](#14-phase-2b-execution-log)
15. [Convention: Red-Line Step Markers](#15-convention-red-line-step-markers)
16. [Notes & Gotchas](#16-notes--gotchas)
17. [Running Claude Code on the VPS (Phase 2C+ handoff)](#17-running-claude-code-on-the-vps-phase-2c-handoff)
    - 17.1 [Why this exists](#171-why-this-exists)
    - 17.2 [One-time install](#172-one-time-install)
    - 17.3 [Permission mode](#173-permission-mode)
    - 17.4 [GUARDRAILS — what Claude MUST NOT do](#174-guardrails--what-claude-must-not-do)
    - 17.5 [settings.json denylist (belt-and-suspenders)](#175-settingsjson-denylist-belt-and-suspenders)
    - 17.6 [Handoff prompt for Phase 2C — HISTORICAL](#176-handoff-prompt-for-phase-2c)
    - 17.7 [If Claude breaks something](#177-if-claude-breaks-something)
    - 17.8 [Cleanup / uninstall](#178-cleanup--uninstall)
    - 17.9 [Phase 2C.3 DONE — handoff for verification & deploy](#179-phase-2c3-done--handoff-for-verification--deploy)
    - 17.10 [Phase 2D IN PROGRESS — full Supabase cut (RESUME HERE)](#1710-phase-2d-in-progress--full-supabase-cut-resume-here)

---

## 1. Current Status

**Staging fully off Supabase as of 2026-06-12.** Zero Supabase references remain in app/lib/components. All data reads/writes go to local Postgres 17. Staging ahead of live — deploy when ready via §9.9.

| | |
|---|---|
| Live URL | https://srv1642268.hstgr.cloud |
| Live status | **ONLINE** (~60 MB), pm2 `ats` port 3000, `AUTH_URL=https://srv1642268.hstgr.cloud` |
| Staging URL | http://91.108.110.236:3001 (internal only, stop when not in use) |
| Staging status | Ahead of live — Phase 2D/2E complete on staging, not yet deployed |
| Backup | `/var/www/ats.bak-7d378a7` — pre-sync snapshot with recruiter history feature (keep until redone) |
| Auth | NextAuth v5 (Credentials provider, JWE session cookies), bcrypt verify against `auth.users` |
| Data | **100% local Postgres 17** — Supabase fully removed from codebase |
| Cron | `0 14 * * *` (19:30 IST) → `/var/www/ats/reports/daily-report.mjs` — Telegram + email to Anish + Rohan |

**Verified working (curls + browser):**
- `curl localhost:3000` → 307 → /login
- `curl /api/me`, `/api/users` → 401 (auth() guard works)
- `curl https://srv1642268.hstgr.cloud` → 307 (full nginx → app pipeline)
- Browser login as `mis1.hirerabbits@gmail.com` → dashboard renders
- Sign Out button (after BUG-4 fix) → clears `authjs.session-token`, redirects to /login

**Forms System — staging-only (2026-05-15):** `/f/[id]` rewritten with tabbed sections (one section visible at a time, Back / Next / Submit, per-tab validation badges). Form builder at `/jds` gained a **+ Add Section** button. Public fill URL accepts `?c=<candidateId>` → submission auto-links to the candidate. Candidate sidebar Forms tab "Copy Link" / "Send via Email" buttons embed `?c=` automatically. Seeded *Candidate Data Form — Hire Rabbits* (14 sections, 139 fields) — see [§8 Forms System](#forms-system-jds--forms-tab--candidate-forms-sidebar) and [§9.18](#918-seed--refresh-the-hire-rabbits-candidate-data-form).

**2B.10 close-out — DONE (2026-05-08).** Commit `649285f` on `phase-2b-nextauth` carries:
- `app/(app)/layout.tsx` — replaced the synthesized-from-JWT profile with a real `createAdminClient().from("profiles").select("*").eq("id", session.user.id).single()` lookup (Phase 2C TODO landed early); kept the synthesized object as a fallback so a missing profiles row never causes a /login redirect loop. Also fixed `avatar_url: null` → `undefined` and dropped the non-existent `phone:` field.
- `components/sidebar.tsx` — Sign Out now calls `signOut({ callbackUrl: "/login" })` from `next-auth/react` (BUG-4 fix).

This commit is on staging only. To promote to live, follow the deploy flow in [§9.9](#99-deploy-a-code-change).

**Rollback (still one command, should not be needed):**
```bash
pm2 stop ats; rsync -a --delete /var/www/ats.bak-2026-05-07-1549/ /var/www/ats/ && pm2 start ats
```

---

## 2. What We Achieved (Phase History)

### Phase 1 — Off Vercel, onto VPS ✅
- App deployed to Hostinger KVM 1 (Ubuntu 24.04, 4 GB RAM, 1 vCPU, 50 GB NVMe).
- nginx reverse proxy in front of Next.js (PM2-managed) on port 3000.
- Let's Encrypt cert at `/etc/letsencrypt/live/srv1642268.hstgr.cloud/`.
- Vercel deployment idled (still alive, scheduled for deletion post-2B).

### Phase 2A — Local Postgres mirror ✅
- Installed PostgreSQL 17.9 from PGDG repo (matched Supabase's version).
- Restored full schema + data from `pg_dump` of Supabase into local DB `ats`.
- Created stub Supabase scaffolding (`auth`, `extensions` schemas; `authenticated`/`anon`/`service_role` roles; stub `auth.uid()`/`auth.role()`/`auth.email()`/`auth.jwt()` functions).
- 28 public tables + `auth.users` (4 rows with bcrypt password hashes).

### Phase 2B — Replace Supabase Auth with NextAuth v5 ✅ (2B.1 → 2B.9 done, 2B.10 deploying)

| Sub-phase | Commit | What it did |
|---|---|---|
| 2B.0 | — | Created staging workspace `/root/ats-staging` on branch `phase-2b-nextauth` |
| 2B.1 | `bafe982` | Installed Drizzle ORM + `postgres.js`. Created `lib/db/schema.ts` (auth.users) + `lib/db/index.ts`. 4-row connection test passed. |
| 2B.2 | `f535e5f` | Installed `next-auth@5.0.0-beta.31` + `bcryptjs`. Wrote `auth.ts` (Credentials provider) + `app/api/auth/[...nextauth]/route.ts`. Added `AUTH_SECRET`/`AUTH_URL`/`AUTH_TRUST_HOST` env vars. |
| 2B.3 | `4266bce` | Login page now calls `signIn("credentials", ...)` from `next-auth/react` instead of Supabase `signInWithPassword`. |
| 2B.4 | `4266bce` | Split-config: `auth.config.ts` (Edge-safe, no Drizzle/bcrypt imports) for middleware; `auth.ts` keeps the heavy imports. |
| 2B.5 | `4266bce` | `/api/me` uses `auth()`. Added `types/next-auth.d.ts` for `session.user.id`. JWT + session callbacks wired. |
| 2B.6 | `4266bce` | Browser login working end-to-end. Fixed BUG-1 (handlers export) + BUG-2 (layout redirect loop). |
| 2B.7 | `815cb30` | Replaced `supabase.auth.getUser()` in **48 API routes + 1 page** with `auth()`. Migration script (`scripts/migrate-getUser.mjs`) handled 47 automatically; 1 hand-fix in `users/route.ts`; second pass for the page-level pattern in `candidates/page.tsx` (BUG-3). All routes now use `createAdminClient` (service-role) for `supabase.from()` calls — bypasses RLS while we're between two ORMs. |
| 2B.8 | `0f2af5d` | Replaced `supabase.auth.admin.createUser` (invite) and `supabase.auth.admin.deleteUser` with bcrypt + Drizzle INSERT/DELETE into `auth.users`. The `on_auth_user_created` trigger auto-creates the `profiles` row. Smoke test 4/4 OK. |
| 2B.9 | `d51c73e` | Built the missing `/api/users/reset-password` route (UI was calling it from 3 places but backend was 404 since the Supabase removal). bcrypt + Drizzle UPDATE. Self-reset allowed; admin required for others. UI shows the new password in a 10-sec toast and copies to clipboard. |
| 2B.10 | LIVE + `649285f` | Cutover: rsync staging → live, env appended (8 keys), 5 build attempts (3 OOM/TS errors then 2 successes), pm2 ats online ~60 MB, browser login working. **BUG-4 found and fixed**: sidebar Sign Out still called `supabase.auth.signOut`; patched to `signOut({callbackUrl:"/login"})` from `next-auth/react`. Close-out commit `649285f` on staging also replaced the synthesized profile in `app/(app)/layout.tsx` with a real `createAdminClient` profiles lookup (originally a Phase 2C TODO). Live still runs the synthesized-fallback build; the lookup-based build is staging-only until the next deploy. |

**End state after 2B.10**:
- Zero `supabase.auth.*` method calls in app/lib code (one stale comment in `lib/supabase/server.ts:28`).
- Login → bcrypt verify against local `auth.users` → JWE session cookie (`authjs.session-token`).
- All 48 API routes guarded by NextAuth's `auth()`.
- Admin can: create users (bcrypt + Drizzle INSERT), delete users (Drizzle DELETE), reset passwords (12-char generated or admin-typed), change roles via PATCH on `/api/users`.

### Phase 2C → 2E (PLANNED — not started)
- **2C** — replace remaining `supabase.from(...)` calls (~48 routes) with Drizzle queries; introspect the 28 public tables; wire RLS-equivalent checks at app layer.
- **2D** — replace Supabase Storage (used for candidate CVs / uploads). Likely no-op if we keep storage on Supabase; otherwise migrate to local disk or S3-compatible.
- **2E** — final cutover: rotate Supabase DB password, downgrade GitHub deploy key to read-only, decommission Supabase project, point a real domain at the VPS.

---

## 3. Server Architecture (One-Box Topology)

**Everything runs on ONE Hostinger KVM 1.** No separate staging box, no separate DB.

```
┌─────────────────────────────────────────────────────────────────┐
│  Hostinger KVM 1 — 91.108.110.236 / srv1642268.hstgr.cloud     │
│  Ubuntu 24.04 · 1 vCPU · 4 GB RAM · 50 GB NVMe · 2 GB swap     │
│                                                                 │
│  ┌───────────────────┐    ┌───────────────────────────────┐    │
│  │  nginx :80 / :443 │───▶│  PM2 process "ats" :3000      │    │
│  │  (HTTPS + proxy)  │    │  /var/www/ats — LIVE app      │    │
│  └───────────────────┘    │  next start (production build)│    │
│                           └─────────────┬─────────────────┘    │
│                                         │                       │
│  ┌──────────────────────────────────┐   │                       │
│  │  /root/ats-staging :3001         │   │                       │
│  │  (only when manually started     │   │                       │
│  │   for dev work — npm run dev)    │   │                       │
│  └──────────────────────────────────┘   │                       │
│                ▲                        ▼                       │
│                │           ┌─────────────────────────────┐      │
│                └───────────▶  Postgres 17 :5432 (local)  │      │
│                            │  database: ats              │      │
│                            │  schemas: public, auth,     │      │
│                            │           extensions        │      │
│                            └─────────────────────────────┘      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Outbound to: api.supabase.co (storage only),        │      │
│  │               github.com (git pull via deploy key)   │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Practical implications (treat as soft rules):**
- Don't run `npm run build` and the dev server at the same time — the build alone uses most of the 4 GB.
- For long install/build operations, wrap in `nohup` or `tmux`. SSH drops on this box are common.
- Memory-spiky operations (large `pg_restore`, `npm install`) can transiently OOM-kill the live `ats` PM2 process. Check `pm2 status` after any heavy op.
- Backups are manual. Hostinger automated daily backups (Rs.269/mo) are currently OFF.
- The build needs `NODE_OPTIONS=--max-old-space-size=3500` to avoid OOM during type-checking.

---

## 4. Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20.20.2 |
| Framework | Next.js 14.2.15 (App Router) |
| Auth | NextAuth v5 (`next-auth@5.0.0-beta.31`, Credentials provider) |
| Password hashing | `bcryptjs` 3.0.3 |
| ORM | Drizzle ORM 0.45.2 + `postgres.js` 3.4.9 (for auth.users; rest is still `supabase.from()`) |
| Database | PostgreSQL 17.9 (local on VPS) + Supabase (storage only, post-2B.10) |
| UI | Tailwind CSS, lucide-react icons, react-hot-toast |
| Process manager | PM2 |
| Reverse proxy | nginx |
| TLS | Let's Encrypt (certbot) |
| Hosting | Hostinger KVM 1 |
| Repo | https://github.com/ATSDashboard/ATSDashboard |

---

## 5. Credentials & Access

### 5.1 VPS — Hostinger KVM 1

| Field | Value |
|---|---|
| IP | `91.108.110.236` |
| Hostname | `srv1642268.hstgr.cloud` |
| Region | India — Mumbai |
| OS | Ubuntu 24.04 LTS |
| Specs | 1 vCPU / 4 GB RAM / 50 GB NVMe / 2 GB swap |
| Hostinger panel | https://hpanel.hostinger.com/ |
| **Root password** | `Vps123456789####` ← rotate after Phase 2 |

**SSH access (from Windows cmd):**
```bash
ssh root@91.108.110.236
```

Password reset via Hostinger panel: VPS → Settings → Root password.

### 5.2 Supabase (still live)

| Field | Value |
|---|---|
| Project ref | `lbolfapdgwfquypuzhgl` |
| Dashboard | https://supabase.com/dashboard/project/lbolfapdgwfquypuzhgl |
| Project URL | https://lbolfapdgwfquypuzhgl.supabase.co |
| **DB password** | `Superbase@123456` ← ROTATE AFTER PHASE 2 |

Direct DB connection is disabled. Use the **Session Pooler**:

| | |
|---|---|
| Host | `aws-1-ap-northeast-1.pooler.supabase.com` |
| Port | `5432` |
| User | `postgres.lbolfapdgwfquypuzhgl` |
| Password | (DB password above) |
| Database | `postgres` |

Live app uses these 3 keys from Supabase (in `/var/www/ats/.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5.3 Local Postgres on VPS

| Field | Value |
|---|---|
| Version | PostgreSQL 17.9 (PGDG repo) |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `ats` |
| User (owner) | `ats_app` |
| Password | stored at `/root/.ats-db-credentials` (`grep ^DB_PASS`) |

**File `/root/.ats-db-credentials` (5 lines):**
```
DB_USER=ats_app
DB_PASS=<auto-generated 28-char>
DB_NAME=ats
DB_HOST=127.0.0.1
DB_PORT=5432
```

**Schemas:**
- `public` — 28 tables (candidates, jobs, masters, profiles, etc.)
- `auth` — `users` table (4 rows, bcrypt hashes)
- `extensions` — `uuid-ossp` + `pgcrypto`

Stub Supabase scaffolding: NOLOGIN roles `authenticated`, `anon`, `service_role`, `supabase_auth_admin` + stub `auth.uid()` / `auth.role()` / `auth.email()` / `auth.jwt()` functions returning NULL.

**RLS is OFF locally** — auth checks live in the app layer (NextAuth + per-route role guards).

**Connect as superuser (no password):**
```bash
sudo -u postgres psql -d ats
```

**Connect as the app user:**
```bash
PGPASSWORD=$(grep ^DB_PASS /root/.ats-db-credentials | cut -d= -f2) \
  psql -h 127.0.0.1 -U ats_app -d ats
```

### 5.4 GitHub

| Field | Value |
|---|---|
| Repo | https://github.com/ATSDashboard/ATSDashboard |
| Deploy key | Title: "Hostinger VPS srv1642268"; currently Read/Write (TODO: downgrade to Read-only) |
| Manage keys | https://github.com/ATSDashboard/ATSDashboard/settings/keys |

VPS clones via SSH using the deploy key at `/root/.ssh/id_ed25519`.

### 5.5 Environment Variables (`.env.local`)

**Path on live**: `/var/www/ats/.env.local` (mode 600, gitignored).
**Path on staging**: `/root/ats-staging/.env.local`.

After Phase 2B.10 cutover, live has **8 keys**:

| Key | Value | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lbolfapdgwfquypuzhgl.supabase.co` | Browser Supabase client (storage only post-2B.10) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (eyJhbGc...8Zg) | Public anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | (eyJhbGc...Uc8) | Service-role key — bypasses RLS, used by `createAdminClient()` for ALL `supabase.from()` calls during 2B |
| `ANTHROPIC_API_KEY` | (empty) | For AI resume parsing (`/api/parse-resume`); safe to leave empty |
| `DATABASE_URL` | `postgres://ats_app:<encoded>@127.0.0.1:5432/ats` | Local Postgres for Drizzle (auth.users + future Phase 2C work) |
| `AUTH_SECRET` | `2Pe4dZpX/UpxQITD5Ub24RER7cfMF9qTWI5j0QwjN7Q=` | Signs JWE session cookies (32-byte random base64, generated `openssl rand -base64 32`) |
| `AUTH_URL` | `https://srv1642268.hstgr.cloud` | NextAuth base URL (live host; was `http://localhost:3001` on staging) |
| `AUTH_TRUST_HOST` | `true` | Required when not on Vercel — Auth.js trusts `X-Forwarded-Host` |
| `NEXT_PUBLIC_APP_URL` | `https://srv1642268.hstgr.cloud` | **Build-time** public base URL. Used by the Forms "Copy Link" button so the copied URL always points to the live domain, not whatever origin the browser is on (fixes HTTP/staging copy). Added 2026-06-08. |

**Naming note**: Auth.js v5 renamed env vars from `NEXTAUTH_*` → `AUTH_*`. Both work (v5 falls back); we use the new names.

**Pre-cutover backup of live env**: `/var/www/ats/.env.local.pre-2b10`.

---

## 6. Project File Hierarchy

```
ATSDashboard/                           ← repo root
├── app/                                ← Next.js App Router
│   ├── layout.tsx                      ← root HTML shell
│   ├── page.tsx                        ← / → redirect to /login or /dashboard
│   ├── login/
│   │   └── page.tsx                    ← email + password form (signIn("credentials"))
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts                ← legacy Supabase OAuth landing (mostly dead)
│   ├── (app)/                          ← route group; all pages here are auth-guarded by layout.tsx
│   │   ├── layout.tsx                  ← calls auth(); synthesizes Profile from session; renders Sidebar + main
│   │   ├── dashboard/page.tsx          ← KPI cards, recent activity
│   │   ├── candidates/
│   │   │   ├── page.tsx                ← server component, fetches initial list
│   │   │   └── candidates-client.tsx   ← client interactivity
│   │   ├── jobs/
│   │   │   ├── page.tsx
│   │   │   └── import/page.tsx         ← bulk-import jobs from CSV/XLSX
│   │   ├── jds/page.tsx                ← JD library
│   │   ├── masters/page.tsx            ← masters table editor (departments, locations, etc.)
│   │   ├── users/page.tsx              ← USER MANAGEMENT (Add/Edit/Delete)
│   │   ├── settings/page.tsx           ← settings hub: profile, password, AI, Drive, backups
│   │   ├── offers/page.tsx
│   │   ├── interviews/                 (no page.tsx; surfaced via /candidates)
│   │   ├── my-activity/page.tsx        ← user's own activity log
│   │   ├── hod-portal/page.tsx         ← HOD-only views
│   │   ├── sync/page.tsx               ← Google Drive / sheet sync controls
│   │   └── import/page.tsx             ← generic data import
│   ├── f/[id]/page.tsx                 ← public form fill page (recruitment forms)
│   └── api/                            ← all backend routes
│       ├── auth/
│       │   └── [...nextauth]/route.ts  ← NextAuth catch-all (signin/callback/csrf/session)
│       ├── me/route.ts                 ← GET — current session info
│       ├── users/
│       │   ├── route.ts                ← GET (list, admin/HR), POST (CREATE — bcrypt+Drizzle), PATCH (edit)
│       │   ├── me/route.ts             ← GET/PATCH self
│       │   ├── reset-password/route.ts ← POST — bcrypt + Drizzle UPDATE auth.users
│       │   └── [id]/
│       │       ├── route.ts            ← DELETE (admin), PATCH (admin)
│       │       └── token/route.ts      ← external recruiter token
│       ├── candidates/
│       │   ├── route.ts                ← list / create
│       │   └── [id]/
│       │       ├── route.ts            ← read / update / delete
│       │       ├── communications/route.ts
│       │       ├── cv/route.ts
│       │       ├── files/route.ts
│       │       ├── offers/route.ts
│       │       └── score/route.ts
│       ├── jobs/{route.ts,[id]/route.ts}
│       ├── jd-library/{route.ts,[id]/route.ts}
│       ├── masters/{route.ts,[id]/route.ts}
│       ├── email-templates/{route.ts,[id]/route.ts}
│       ├── forms/{route.ts,[id]/route.ts}
│       ├── deletion-requests/{route.ts,[id]/route.ts}
│       ├── dashboard/route.ts          ← KPI aggregations
│       ├── activity-logs/route.ts
│       ├── my-activity/route.ts
│       ├── assessments/route.ts
│       ├── backup/route.ts             ← admin backup trigger
│       ├── backup-logs/route.ts
│       ├── communications/route.ts
│       ├── co-sourcers/route.ts
│       ├── ctc-templates/route.ts
│       ├── custom-columns/route.ts
│       ├── form-job-links/route.ts
│       ├── form-responses/route.ts
│       ├── hiring-requests/route.ts
│       ├── import/{route.ts,jobs/route.ts,sample/route.ts}
│       ├── interviews/route.ts
│       ├── offers/route.ts
│       ├── parse-resume/route.ts       ← Anthropic AI resume parsing
│       ├── recruitment-forms/route.ts
│       ├── screening-questions/route.ts
│       ├── settings/{ai/route.ts,google-drive/route.ts}
│       └── sync/{route.ts,trigger/route.ts}
│
├── components/                         ← reusable React components
│   ├── add-candidate-modal.tsx
│   ├── candidate-detail-panel.tsx
│   ├── candidate-grid.tsx
│   ├── column-manager-modal.tsx
│   ├── filter-bar.tsx
│   └── sidebar.tsx                     ← left nav, takes Profile prop
│
├── lib/
│   ├── ai-client.ts                    ← Anthropic API wrapper (resume parsing)
│   ├── ctc.ts                          ← CTC math helpers
│   ├── types.ts                        ← Profile, Role, Master, etc. type defs
│   ├── utils.ts
│   ├── db/                             ← Drizzle (added 2B.1)
│   │   ├── schema.ts                   ← typed auth.users table
│   │   └── index.ts                    ← `db` export, postgres.js pool
│   └── supabase/
│       ├── client.ts                   ← browser Supabase client (used for storage)
│       └── server.ts                   ← createClient() + createAdminClient()
│
├── auth.ts                             ← NextAuth({...}) — Credentials provider, jwt+session callbacks
├── auth.config.ts                      ← Edge-safe shared config (no Drizzle/bcrypt imports)
├── middleware.ts                       ← `export default NextAuth(authConfig).auth`
├── types/
│   └── next-auth.d.ts                  ← augments Session.user.id
│
├── drizzle.config.ts                   ← drizzle-kit config (schema path, dialect)
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json
├── package-lock.json
├── USER_MANUAL.md
│
├── scripts/                            ← one-off Node scripts
│   ├── test-db.mjs                     ← 2B.1 connection test
│   ├── migrate-getUser.mjs             ← 2B.7 API route sweep
│   ├── migrate-getUser-pages.mjs       ← 2B.7 page-level sweep
│   ├── smoke-2b8.mjs                   ← 2B.8 invite/delete DB smoke
│   ├── smoke-2b9.mjs                   ← 2B.9 password reset DB smoke
│   ├── patch-settings-2b9.mjs          ← 2B.9 settings UI patch (one-off)
│   └── seed-hire-rabbits-candidate-form.mjs   ← inserts/updates the 14-section Hire Rabbits candidate data form (see §9.18)
│
└── supabase/
    └── migrations/                     ← original Supabase migrations (historical)
```

---

## 7. VPS File Locations

```
/var/www/ats/                               ← LIVE app
├── .env.local                              ← 8 keys, mode 600
├── .env.local.pre-2b10                     ← backup of pre-cutover env
├── .next/                                  ← production build artifacts (BUILD_ID, server/, static/)
├── node_modules/
├── (full repo tree from section 6)
└── ...

/var/www/ats.bak-2026-05-07-1549/           ← rollback snapshot from Phase 2B.10 (1.4 GB)

/root/ats-staging/                          ← STAGING workspace
├── .env.local                              ← 8 keys (AUTH_URL=http://localhost:3001 here)
├── (full repo, branch: phase-2b-nextauth)
└── ...

/root/.ats-db-credentials                   ← local PG creds (5 lines, mode 700)
/root/.ssh/id_ed25519                       ← GitHub deploy key
/root/supabase-public.dump                  ← Supabase dump (232 KB, custom format)
/root/supabase-auth-users.dump              ← auth.users dump (11 KB)
/root/sync-from-supabase.sh                 ← REFERENCED but NOT YET CREATED — TODO

/etc/nginx/sites-available/ats              ← nginx vhost
/etc/letsencrypt/live/srv1642268.hstgr.cloud/   ← TLS cert + key
/root/.pm2/dump.pm2                         ← PM2 process list (auto-saved)
/root/.pm2/logs/ats-out.log                 ← stdout
/root/.pm2/logs/ats-error.log               ← stderr

/tmp/staging-dev.log                        ← staging dev server log (when running)
/tmp/2b10-build*.log                        ← cutover build logs
/tmp/patch-settings-2b9.mjs                 ← one-off patcher
```

---

## 8. Functionality Map (App Features → Files)

### Authentication Flow
| User action | Frontend | Backend | DB |
|---|---|---|---|
| Visit `/login` | `app/login/page.tsx` | `middleware.ts` (skips /login if logged out) | — |
| Submit email+password | `signIn("credentials", {...})` from `next-auth/react` | `app/api/auth/[...nextauth]/route.ts` → `auth.ts` `authorize()` | `SELECT id,email,encrypted_password FROM auth.users` (Drizzle) |
| bcrypt verify | — | `bcrypt.compare()` in authorize() | — |
| Session set | `authjs.session-token` cookie (JWE) | `jwt` + `session` callbacks copy `user.id` through | — |
| Visit any `(app)/*` page | redirect via `middleware.ts` if no session | `auth()` in route handlers | — |
| Logout | `signOut()` from `next-auth/react` | `/api/auth/signout` | clears cookie |

### User Management (admin only)
| Operation | UI | API | Logic |
|---|---|---|---|
| List users | `/users` page | `GET /api/users` | adminClient `select * from profiles order by name` |
| Create user | "Add User" / "Invite User" modal | `POST /api/users` `{email,name,role,department}` | passwordless INSERT into `auth.users` (`encrypted_password = null`) → trigger `on_auth_user_created` creates `profiles` row → UPDATE that profile with name/role/department |
| Edit user | "Pencil" icon | `PATCH /api/users` `{id, name, role, department, is_active}` | adminClient update profiles |
| Delete user | "Trash" icon | `DELETE /api/users/[id]` | DELETE from profiles → DELETE from auth.users (Drizzle); FK violation → 409 with "deactivate instead" hint |
| Toggle active | UserCheck/UserX icon | `PATCH /api/users` with is_active flipped | adminClient update profiles |
| Reset password (admin → other) | "Reset PW" button | `POST /api/users/reset-password {email}` | Generate 12-char random → bcrypt → UPDATE auth.users → return cleartext in JSON; UI copies to clipboard, 10-sec toast |
| First password setup | `/login` → "First login? Create password" | `POST /api/users/set-password {email,password}` | only succeeds if `auth.users.encrypted_password` is currently null; bcrypt → UPDATE auth.users |
| Reset password (self) | "Change Password" | same endpoint, target.id matches session.user.id | same flow; UI copies to clipboard |
| Issue external token | (admin) | `POST /api/users/[id]/token` | randomBytes(32).hex → update profiles.external_token, set is_external_recruiter=true |

### Candidate / Job CRUD
- `app/(app)/candidates/page.tsx` (+ `candidates-client.tsx`) — list, filter, detail panel
- `app/api/candidates/route.ts` GET/POST
- `app/api/candidates/[id]/route.ts` GET/PATCH/DELETE
- `app/api/candidates/[id]/{communications,offers,files,cv,score}/route.ts` — sub-resources
- Same pattern for `jobs`, `interviews`, `offers`, `assessments`

### Settings Hub (`/settings`)
- Profile section → `PATCH /api/users/me`
- Password section → `POST /api/users/reset-password {email: self}`
- AI settings → `GET/POST /api/settings/ai` (Anthropic key)
- Google Drive section → `GET/POST/DELETE /api/settings/google-drive`
- User management list → `GET/POST/PATCH /api/users` (admin/HR see this section)

### Public-facing
- `/f/[id]` — public form fill (no auth) — reads `?c=<candidateId>` and `?j=<jobId>` query params and includes them in the POST so submissions auto-link to the candidate/job.

### Forms System (JDs & Forms tab + candidate Forms sidebar)

**Where the data lives**
- `forms` (table) — name, type, description, `fields` (jsonb), is_active. `type` is constrained: `application | screening | interview_prep | assessment | onboarding`.
- `form_responses` — `form_id`, `candidate_id` (nullable, FK→candidates ON DELETE SET NULL), `job_id` (nullable), `responses` (jsonb keyed by field id), respondent_name/email, submitted_at.
- `form_job_links` — many-to-many between a form and the jobs it's attached to.

**Field shape (per entry in `fields[]`)**
```ts
{ id: string, type: FieldType, label: string, required: boolean,
  options?: string[],          // for select
  maps_to?: string | null,     // candidate column auto-fill key (see below)
  placeholder?: string }

type FieldType = "text" | "email" | "phone" | "number" | "date"
               | "textarea" | "select" | "checkbox" | "file"
               | "section";   // ← sentinel; not an input. Acts as tab divider on the public form.
```

A `type: "section"` entry has no input — its `label` is the section title and it splits the form into tabs on `/f/[id]`. Sections are added in the form builder via the **+ Add Section** button (purple) at `/jds` (`app/(app)/jds/page.tsx`).

**Auto-fill on submit (`POST /api/form-responses`)**
When a submission arrives with `candidate_id`, the route walks the form's `fields[]` and copies each `responses[f.id]` into the matching `candidates` column where `f.maps_to` is one of:
- `name`, `email`, `mobile`, `current_designation`, `current_location`, `present_salary`, `expected_salary`, `notice_period_days`, `source_id`, `designation_id`, `site_id`
- `source_name` is special — it's looked up against `masters` (type=`source`) and resolved to `source_id`.

**Pages & routes**
| Surface | File | Notes |
|---|---|---|
| Builder UI | `app/(app)/jds/page.tsx` | Tabs: JD Library / Assessments / Forms. Form builder modal supports + Add Section + Add Field, drag-order, "Load Application Defaults". |
| Public fill | `app/f/[id]/page.tsx` | Reads `?c=` and `?j=`. Renders horizontal **tab strip** at top — one section at a time, Back / Next: <name> / Submit. Per-section required-validation on Next; full validation on Submit (jumps to first failing tab and badges error count on each tab). |
| API — forms CRUD | `app/api/forms/{route.ts,[id]/route.ts}` | GET (auth), POST/PATCH (auth), DELETE soft-deletes via `is_active=false`. GET `/api/forms/[id]` is **intentionally unauth** so the public form page works. |
| API — submissions | `app/api/form-responses/route.ts` | POST is **unauth** (public submissions). GET requires auth and accepts `?candidate_id=` / `?form_id=`. |
| API — form↔job link | `app/api/form-job-links/route.ts` | Attach a form to a job (used for screening forms per job). |
| Candidate sidebar | `components/candidate-detail-panel.tsx` (Forms tab, ~L1224) | Lists all built-in forms. **Copy Link** / **Send via Email** produce `/f/{formId}?c={candidateId}` so submissions auto-link. Past responses are listed under each form with expand-to-view. |

**Seeded forms**
- *Candidate Data Form — Hire Rabbits* (`type=application`, 14 sections, 139 fields) — full HR onboarding form. Seeded via `scripts/seed-hire-rabbits-candidate-form.mjs`. See [§9.18](#918-seed--refresh-the-hire-rabbits-candidate-data-form).

---

## 9. How-To Operations

### 9.1 SSH In

From a Windows cmd / PowerShell / any SSH client:

```bash
ssh root@91.108.110.236
```

Password: `Vps123456789####` (rotate post-Phase 2).

For the staging dev server you also need a tunnel from your laptop:
```bash
ssh -L 3001:127.0.0.1:3001 root@91.108.110.236
# then open http://localhost:3001 in your browser
```

### 9.2 Manage the Live App (PM2)

```bash
pm2 status                       # is ats running? memory? restarts?
pm2 logs ats                     # live tail (Ctrl+C to exit)
pm2 logs ats --lines 100         # last 100 lines, no follow
pm2 logs ats --nostream | tail -50
pm2 restart ats                  # restart after env / code changes
pm2 stop ats                     # stop (rare)
pm2 start ats                    # start (if previously created)
pm2 delete ats                   # remove from PM2 list (then re-add with full command)

# If pm2 ats was DELETED and needs to be re-added (post-2B.10 case):
cd /var/www/ats
pm2 start npm --name ats -- start
pm2 save                         # persist across reboots
```

Logs are at `/root/.pm2/logs/ats-{out,error}.log`.

### 9.3 Add a New User

**Easiest — via the UI (admin only):**
1. Log in to https://srv1642268.hstgr.cloud as an admin.
2. Sidebar → **Users** (or Settings → User Management).
3. Click **Add User** / **Invite User**.
4. Fill name, email, role, department. **Admins do not set a password.**
5. Click **Create User**.

The backend (`POST /api/users`) does:
- Validates/normalizes role (`admin`, `hr_manager`, `recruiter`, `hod`)
- Drizzle INSERT into `auth.users` (uuid, email, `encrypted_password = null`, raw_user_meta_data, etc.)
- Trigger `on_auth_user_created` auto-creates the matching `public.profiles` row
- UPDATE the trigger-created `profiles` row with name, role, department
- User creates their own password from `/login` → **First login? Create password** (`POST /api/users/set-password`)
- On any error, the transaction rolls back to avoid orphans

**Direct DB (emergency / scripted):**
```bash
ssh root@91.108.110.236
sudo -u postgres psql -d ats
```
```sql
-- Generate a bcrypt hash first (from a one-liner):
-- node -e "const b=require('/var/www/ats/node_modules/bcryptjs');console.log(b.hashSync('YourPass#123',10))"
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    'newuser@hirerabbits.com',
    '$2a$10$<bcrypt-hash-from-above>',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"New User","role":"recruiter"}'::jsonb,
    now(), now());

-- Trigger creates profile row; update fields:
UPDATE public.profiles
   SET name = 'New User', role = 'recruiter', department = 'Engineering'
   WHERE email = 'newuser@hirerabbits.com';
```

### 9.4 Delete a User

**Via the UI (admin):**
1. Users page → Trash icon next to the user → confirm.
2. Backend `DELETE /api/users/[id]` removes profile then auth.users.
3. If user has FK references (candidates, jobs they own), it returns 409 → use **Deactivate** instead (toggle Active off).

**Direct DB:**
```sql
-- Find them first
SELECT u.id, u.email, p.name, p.role
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE u.email = 'gone@example.com';

-- Then delete (cascade may not be on; do both):
DELETE FROM public.profiles WHERE id = '<uuid>';
DELETE FROM auth.users    WHERE id = '<uuid>';
```

### 9.5 Reset a User's Password

**Self (logged-in user):**
1. Settings → "Change Password" button on your own profile row.
2. UI calls `POST /api/users/reset-password {email: yourEmail}`.
3. Toast shows new 12-char password + copies to clipboard for 10 seconds.

**Admin → other user:**
1. Settings → User list → "Reset PW" button on any user's row.
2. Same flow — admin reads the password out to the user (no email infra yet).

**Direct DB:**
```bash
# Generate a bcrypt hash on the VPS:
ssh root@91.108.110.236
node -e "console.log(require('/var/www/ats/node_modules/bcryptjs').hashSync('NewPass#1234',10))"
# Copy the $2a$10$... output, then:
sudo -u postgres psql -d ats
```
```sql
UPDATE auth.users
   SET encrypted_password = '$2a$10$<paste hash here>',
       updated_at = now()
   WHERE email = 'user@example.com';
```

### 9.6 Promote a User to Admin

**Direct DB (no UI for this yet):**
```bash
sudo -u postgres psql -d ats
```
```sql
UPDATE public.profiles
   SET role = 'admin', is_active = true, updated_at = now()
   WHERE id IN (SELECT id FROM auth.users WHERE email ILIKE '%rohan%')
   RETURNING id, email, role;
```

After that user logs out and back in, they'll see the admin sections.

### 9.7 Change a User's Role

**Via UI:** Users page → Edit (pencil icon) → change role dropdown → Save.

**Direct DB:**
```sql
UPDATE public.profiles
   SET role = 'hr_manager', updated_at = now()
   WHERE email = 'user@example.com';
```

Valid roles: `admin`, `hr_manager`, `recruiter`, `hod`, `candidate`.

### 9.8 Deactivate (Soft-Delete) a User

When you can't hard-delete (FK references), deactivate instead:

**UI:** Users page → UserX icon (toggles is_active off).
**DB:**
```sql
UPDATE public.profiles SET is_active = false WHERE email = '...';
```

A deactivated user's login still succeeds at NextAuth level (we don't check is_active in `authorize()` yet), but they can't see anything because the layout-level `effectiveProfile` is synthesized from session and there's no enforcement. **TODO**: add `is_active` check in `authorize()` callback.

### 9.9 Deploy a Code Change

**The standard loop** (after pushing to GitHub from your laptop):

```bash
ssh root@91.108.110.236
cd /var/www/ats
git pull
npm ci                                          # only if package.json changed
NODE_OPTIONS="--max-old-space-size=3500" npm run build   # 10-20 min, needs heap bump
pm2 restart ats
```

Then refresh https://srv1642268.hstgr.cloud and verify.

**Important:**
- Always set `NODE_OPTIONS=--max-old-space-size=3500` for builds — Next.js's type-checker OOMs at default heap on this 4 GB box.
- Kill any staging dev server first: `pkill -f "next dev"` (frees ~1 GB).
- Run `pm2 stop ats` before the build if memory is tight (`free -h` < 2 GB free).

**For the "deploy from staging" pattern** (Phase 2B.10 style):
```bash
# On VPS:
pm2 stop ats
cp -a /var/www/ats /var/www/ats.bak-$(date +%F-%H%M)
rsync -a --delete \
  --exclude=node_modules --exclude=.next \
  --exclude=.env.local --exclude=.git \
  /root/ats-staging/ /var/www/ats/
cd /var/www/ats
npm ci
NODE_OPTIONS="--max-old-space-size=3500" npm run build
pm2 start ats   # or: pm2 start npm --name ats -- start && pm2 save
```

### 9.10 Rollback a Bad Deploy

```bash
pm2 stop ats
rsync -a --delete /var/www/ats.bak-<TIMESTAMP>/ /var/www/ats/
pm2 start ats
```

The latest backup is `/var/www/ats.bak-2026-05-07-1549` (Phase 2B.10's pre-cutover snapshot).

### 9.11 Query the Database

**Local Postgres (the live data source):**
```bash
sudo -u postgres psql -P pager=off -d ats -c "SELECT count(*) FROM public.candidates;"
```

**Common queries:**
```sql
-- All users + roles
SELECT u.email, p.name, p.role, p.is_active
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  ORDER BY u.email;

-- Candidate counts by status
SELECT status, count(*) FROM public.candidates GROUP BY status ORDER BY 2 DESC;

-- Active jobs
SELECT id, title, department, status FROM public.jobs WHERE status='open';

-- Recent activity
SELECT created_at, user_email, action, entity_type, entity_id
  FROM public.activity_log ORDER BY created_at DESC LIMIT 30;

-- Table list
\dt public.*
```

**Supabase (storage queries — rare):**
```bash
PGPASSWORD='Superbase@123456' psql -P pager=off \
  -h aws-1-ap-northeast-1.pooler.supabase.com -p 5432 \
  -U postgres.lbolfapdgwfquypuzhgl -d postgres \
  -c "SELECT count(*) FROM public.candidates;"
```

### 9.12 View Application Logs

```bash
pm2 logs ats                              # live tail
pm2 logs ats --lines 200 --nostream       # last 200, no follow
tail -f /root/.pm2/logs/ats-error.log     # raw stderr
tail -f /root/.pm2/logs/ats-out.log       # raw stdout

tail -f /var/log/nginx/access.log         # nginx access
tail -f /var/log/nginx/error.log          # nginx errors

journalctl -u nginx -f                    # systemd nginx logs
```

### 9.13 Restart Nginx

```bash
systemctl status nginx          # check status
systemctl reload nginx          # graceful reload (after editing /etc/nginx/sites-available/ats)
systemctl restart nginx         # full restart
nginx -t                        # test config before reload
```

### 9.14 Renew the HTTPS Cert

certbot auto-renew should be running via systemd timer. Manual renewal:
```bash
certbot renew --dry-run         # test
certbot renew                   # actually renew if within 30 days of expiry
systemctl reload nginx          # pick up new cert
```

Cert location: `/etc/letsencrypt/live/srv1642268.hstgr.cloud/{cert,privkey,fullchain}.pem`.

### 9.15 Run the Staging Dev Server

```bash
ssh root@91.108.110.236
cd /root/ats-staging
PORT=3001 nohup npm run dev > /tmp/staging-dev.log 2>&1 &
disown

# From your laptop (separate terminal):
ssh -L 3001:127.0.0.1:3001 root@91.108.110.236
# Then open http://localhost:3001 in your browser
```

To stop: `pkill -f "next dev"`.

### 9.16 Manual SQL: Bcrypt a Password

When you need a bcrypt hash for direct SQL inserts:
```bash
node -e "console.log(require('/var/www/ats/node_modules/bcryptjs').hashSync('YourPlaintext',10))"
# Output: $2a$10$Nt3qM... — copy and paste into UPDATE / INSERT
```

### 9.17 Refresh Local Postgres from Supabase

If local PG ever gets out of sync with Supabase:
```bash
# postgres user can't read /root (mode 700) — pipe via stdin:
sudo -u postgres pg_restore -v --no-owner --no-privileges \
  -d ats < /root/supabase-public.dump
sudo -u postgres pg_restore -v --no-owner --no-privileges \
  -d ats < /root/supabase-auth-users.dump

# Restore grants + disable RLS for local app:
sudo -u postgres psql -d ats <<'SQL'
GRANT USAGE ON SCHEMA auth TO ats_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO ats_app;
GRANT USAGE ON SCHEMA public TO ats_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ats_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth   GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ats_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ats_app;
ALTER TABLE auth.users DISABLE ROW LEVEL SECURITY;
SQL
```

(`/root/sync-from-supabase.sh` was promised but never created — TODO.)

### 9.18 Seed / Refresh the Hire Rabbits Candidate Data Form

The full 14-section / 139-field Hire Rabbits candidate data form is defined inline in `scripts/seed-hire-rabbits-candidate-form.mjs`. The script is **idempotent** — keyed on `forms.name = 'Candidate Data Form — Hire Rabbits'`. First run inserts, subsequent runs UPDATE the same row's `fields`/`description` and flip `is_active=true`.

```bash
cd /root/ats-staging
node scripts/seed-hire-rabbits-candidate-form.mjs
# → Inserted new form id=<uuid>  (or)  Updated existing form id=<uuid>
# → Share base URL: /f/<uuid>  (append ?c=<candidateId> when sending to a candidate)
```

To edit the form structure:
1. Open `scripts/seed-hire-rabbits-candidate-form.mjs` — sections (`sec(...)`) and fields (`fld(type, label, opts)`) are declarative.
2. Re-run the script — same id, updated fields. **No new form is created.**
3. Hard-reload the public fill page — Next.js compiles `/f/[id]` on first request after schema change.

To attach this form (or any form) to a candidate:
- Open the candidate → **Forms tab** → click **Copy Link** next to *Candidate Data Form — Hire Rabbits*. The URL on the clipboard is `…/f/<formId>?c=<candidateId>`. When the candidate submits, the response is auto-linked to that candidate and mapped candidate columns (`email`, `mobile`, `current_location`, `present_salary`, `expected_salary`) are filled in.

To replace with a different big form: write a new `scripts/seed-<name>.mjs` from the same template, run it, and the form shows up under **JDs & Forms → Forms**.

---

## 10. Data Snapshot

Currently in local Postgres (`ats` database):

| Table | Rows |
|---|--:|
| activity_log | 679 |
| masters | 96 |
| co_sourcers | 44 |
| candidates | 43 |
| jobs | 9 |
| assessments | 6 |
| profiles / auth.users | 4 / 4 |
| email_templates | 3 |
| forms | 3 |
| form_job_links | 3 |
| candidate_communications | 2 |
| candidate_files | 2 |
| candidate_offers | 2 |
| interviews | 2 |
| google_drive_settings | 1 |
| sync_configs | 1 |
| (rest of 28 tables) | empty |

---

## 11. Phase Tracker

| Phase | Status | Notes |
|---|---|---|
| Phase 1 | ✅ DONE | App on VPS, off Vercel, HTTPS via Let's Encrypt |
| Phase 2A | ✅ DONE | Local Postgres 17 with full data mirror (auth.users re-restored 2026-05-06) |
| Phase 2B.0 | ✅ DONE | Staging workspace ready |
| Phase 2B.1 | ✅ DONE (`bafe982`) | Drizzle ORM installed, 4-row PASS |
| Phase 2B.2 | ✅ DONE (`f535e5f`) | NextAuth v5 + bcryptjs installed |
| Phase 2B.3 | ✅ DONE (`4266bce`) | Login page uses signIn() |
| Phase 2B.4 | ✅ DONE (`4266bce`) | Split auth.config.ts; middleware uses NextAuth(authConfig).auth |
| Phase 2B.5 | ✅ DONE (`4266bce`) | /api/me uses auth(); session.user.id type augmentation |
| Phase 2B.6 | ✅ DONE (`4266bce`) | Browser login E2E; BUG-1 (handlers export) + BUG-2 (layout loop) fixed |
| Phase 2B.7 | ✅ DONE (`815cb30`) | 48 API routes + 1 page migrated to auth() + createAdminClient |
| Phase 2B.8 | ✅ DONE (`0f2af5d`) | Invite flow (admin.createUser) replaced with bcrypt + Drizzle INSERT |
| Phase 2B.9 | ✅ DONE (`d51c73e`) | Password reset route built + UI toast shows generated password |
| **Phase 2B.10** | **✅ DONE** (`649285f`, 2026-05-08) | Cutover deploy: backup ✓, rsync ✓, env ✓, build #4 + #5 ✓, pm2 online, smoke ✓, browser login ✓, Sign Out fix ✓, staging close-out commit ✓ (also delivered Phase 2C synthesized-profile replacement early — live still has the fallback build until next deploy) |
| Phase 2C | ✅ DONE (`942c942`) | All 34 routes on Drizzle (recruitment-forms + screening-questions tables created and migrated in Phase 2D) |
| Phase 2D | ✅ DONE (2026-06-12) | Full Supabase cut complete. All 8 remaining files migrated to Drizzle. `lib/supabase/client.ts` + `server.ts` deleted. Zero Supabase references in codebase. |
| Phase 2E | ✅ DONE (2026-06-12) | Supabase fully removed from code. Remaining cleanup: rotate/remove Supabase keys from `.env.local`, decommission Supabase project when ready. |
| Domain | ⏳ TODO | Point real domain at VPS, swap nginx + cert |

---

## 12. Things to Rotate / Fix

- [ ] Rotate Supabase DB password (currently in this file + chat history)
- [ ] Rotate VPS root password (`Vps123456789####`)
- [ ] Downgrade GitHub deploy key from Read/Write to Read-only
- [ ] Pause / delete the dormant Vercel deployment
- [ ] Add `is_active` check to NextAuth `authorize()` (currently only checked at app-render layer)
- [ ] Clean up stale comment in `lib/supabase/server.ts:28` mentioning `auth.admin.createUser`
- [ ] Actually create `/root/sync-from-supabase.sh` (referenced everywhere, never written)
- [ ] Consolidate local project folders:
  - `C:\Users\admin\Music\ATSDashboard-main` (older zip)
  - `C:\Users\admin\Videos\ATSDashboard-main uptodate` (current zip)
  - Pick one, ideally `git clone` properly so you can `git pull`
- [ ] Consider Hostinger automated daily backups (Rs.269/mo)
- [ ] Build a real email-token password reset flow (Phase 2D candidate)
- [x] Replace synthesized profile in `app/(app)/layout.tsx` with a real `profiles` lookup — DONE on staging in `649285f` (uses `createAdminClient`, falls back to synthesized profile if the row is missing). Live picks this up on next deploy.

---

## 13. Phase 2B Detailed Plan (preserved)

**GOAL**: Replace Supabase Auth with NextAuth v5 (Auth.js). Existing users keep their passwords (verified against bcrypt hashes already in `auth.users`). Sessions become NextAuth JWTs in cookies.

**Where Supabase auth lived in the codebase (5 spots originally):**
- `middleware.ts` — session check + redirect
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server client + admin client
- `app/login/page.tsx` — `signInWithPassword` call
- `app/auth/callback/route.ts` — OAuth/invite landing
- `app/api/<48 routes>/route.ts` — `supabase.auth.getUser()` (count was 28 in original plan, actual was 48)

**Key decisions locked in:**
- Strangler-fig (zero-downtime intent, partial-failure tolerated) approach
- Auth.js / NextAuth v5 with Credentials provider
- Drizzle ORM (TS-native)
- Migrate existing data (already done in 2A)
- JWT sessions (no DB session table needed)

---

## 14. Phase 2B Execution Log

> The full step-by-step journal lives in **Server Creds.txt** section 14 (≈700 lines, dated entries from 2026-05-06 through 2026-05-07). Highlights:

- **2B.1** — Drizzle install. First test failed (`auth.users does not exist`); recovered by `pg_restore`-ing the auth.users dump and re-granting `ats_app`. Connection test then PASS, 4 rows.
- **2B.2** — NextAuth v5 beta + bcryptjs. Wrote `auth.ts` with Credentials provider; `authorize()` does case-insensitive email lookup + bcrypt.compare.
- **2B.3-6** — Wired login page, split-config middleware, `/api/me`, type augmentation. Browser test surfaced two bugs:
  - **BUG-1**: `app/api/auth/[...nextauth]/route.ts` exported `{GET,POST}` from `@/auth` — but those don't exist; needed `import { handlers } from "@/auth"; export const { GET, POST } = handlers;`
  - **BUG-2**: `app/(app)/layout.tsx` still ran `supabase.auth.getUser()` → infinite redirect loop. Fixed to use `auth()` and synthesize a minimal Profile from session.
- **2B.7** — 48 routes had `supabase.auth.getUser()` (planned 28). Wrote `scripts/migrate-getUser.mjs` (regex-trio match); migrated 47/48 automatically. Hand-fixed `users/route.ts`. **BUG-3**: `candidates/page.tsx` had its own defensive supabase auth check causing redirect loop — second migration script (`migrate-getUser-pages.mjs`) handled it.
- **2B.8** — Invite flow: replaced `supabase.auth.admin.createUser` with `bcrypt.hash` + Drizzle INSERT. Trigger `on_auth_user_created` auto-creates the profile row; we upsert profile fields after. Same treatment for `admin.deleteUser`. DB smoke 4/4 OK.
- **2B.9** — Found UI was already calling `/api/users/reset-password` from 3 places but the backend route didn't exist (silently 404'd since the Supabase removal). Built it: bcrypt + Drizzle UPDATE. Patched the settings UI toast to show the generated password and copy it to the clipboard. DB smoke 4/4 OK.
- **2B.10** — Cutover deploy:
  - 2A: pkill dev server, pm2 stop ats, `cp -a` backup to `.bak-2026-05-07-1549`
  - 2B: rsync staging → live (excluded node_modules, .next, .env.local, .git)
  - 2C: appended `AUTH_SECRET`, `AUTH_TRUST_HOST`, `DATABASE_URL` from staging + new `AUTH_URL=https://srv1642268.hstgr.cloud` (overrides staging's localhost:3001)
  - 2D: build #1 OOMed at type-check; build #2 OOMed too (without explicit `NODE_OPTIONS`)
  - 2G: bumped `NODE_OPTIONS=--max-old-space-size=3500`; build #3 hit a real TS error in `app/(app)/layout.tsx` (`avatar_url: null` should be `undefined`; `phone:` field doesn't exist on Profile)
  - 2H: hot-patched layout.tsx in BOTH live and staging (`null` → `undefined`, removed phone line); `npx tsc` confirmed clean
  - 2I-2J: build #4 succeeded (`BUILD_ID: pwxscpsbDnSTLzEUDnKya`). PM2 start + smoke test pending.

---

## 15. Convention: Red-Line Step Markers

Every command block sent to the SSH window starts with a bold-red ANSI banner:
```bash
printf '\n\033[1;31m═══════ STEP N: <title> ═══════\033[0m\n\n'
```

Scrolling back through terminal scrollback, the most recent red line marks the start of the most recent instruction. Works in any ANSI-color-capable terminal (Windows Terminal, PuTTY, iTerm, Linux console).

---

## 16. Notes & Gotchas

### Build & memory
- **Always set `NODE_OPTIONS=--max-old-space-size=3500` for `npm run build`** on this 4 GB box, or the type-checker will OOM mid-build (silently — `set -e` doesn't catch it because npm sometimes returns 0 anyway).
- Kill any staging dev server (`pkill -f "next dev"`) BEFORE running a production build, or RAM is tight and OS OOM-killer may kill the build process or the live PM2 process.
- The build is slow (15-20 min on this hardware). Always run with `nohup` so SSH drops don't kill it.
- If the build "succeeds" but `.next/BUILD_ID` is missing, that means a child process OOMed but bash kept going. Check: `test -f .next/BUILD_ID && echo OK || echo INCOMPLETE`.

### Terminal / paste issues
- Pasting >100-line heredocs into Windows cmd SSH lands the closing delimiter LATE; bash sometimes never sees it and the heredoc hangs at `>`. Workaround: split file writes into single-level (un-nested) `cat > file <<'TS'` blocks.
- `cmd1 && cmd2 && cmd3` chains hide stdout from cmd1 if it interleaves with cmd2 starting. To diagnose "did this even run?", re-run the first command alone with `; echo "exit=$?"`.
- `\d <table>` in psql triggers `less` (pager). Use `psql -P pager=off` or query `information_schema.columns` instead.
- `node -e "require('bcryptjs/package.json')"` fails on bcryptjs ≥3 (`exports` field doesn't expose `./package.json`). Use `node -p "require('./node_modules/bcryptjs/package.json').version"` with explicit relative path.
- BigInt comparison: `count(*)` in postgres-js comes back as BigInt; `result === 0` (Number) is false. Cast in SQL: `count(*)::int`.

### NextAuth v5 quirks
- v5 renames `NEXTAUTH_*` → `AUTH_*`. Both work (v5 falls back), but use the new names.
- `session.user.id` is NOT auto-exposed under JWT strategy — must (1) flow `user.id` through `jwt({token,user})` callback, (2) copy `token.id` back in `session({session,token})`, and (3) augment types in `types/next-auth.d.ts`.
- `AUTH_TRUST_HOST=true` is required when not on Vercel — otherwise Auth.js refuses to trust `X-Forwarded-Host` from nginx.
- The catch-all handler exports `{handlers, signIn, signOut, auth}` — to wire route methods you need `import { handlers } from "@/auth"; export const { GET, POST } = handlers;` (NOT `export { GET, POST } from "@/auth"`).
- Edge runtime can't import Drizzle/bcrypt/postgres.js — keep middleware on the lightweight `auth.config.ts`, only `auth.ts` imports the heavy stuff.

### Database
- `--no-privileges` in `pg_restore` means the app user (`ats_app`) gets NO grants on restored tables. Always re-run grants after a restore (see [9.17](#917-refresh-local-postgres-from-supabase)).
- The `on_auth_user_created` trigger reads `NEW.raw_user_meta_data` and `NEW.email` — INSERT into `auth.users` MUST set those (and `instance_id`, `aud`, `role`, `raw_app_meta_data`) or the profile auto-creation fails.
- RLS is OFF on local Postgres (Supabase RLS policies didn't restore because they reference Supabase auth functions). Auth checks live in the app layer.

### SSH / network
- SSH connection drops mid-command happen ~3x per long session on KVM 1. For long-running commands always use `nohup ... > /tmp/log 2>&1 &` then `disown`.
- `sudo -u postgres pg_restore /root/file` fails because `postgres` user can't traverse `/root` (mode 700). Pipe via stdin: `sudo -u postgres pg_restore ... < /root/file`.

### Misc
- `dotenv` package prints rotating ads on every run since 16.4. Silence with `export DOTENV_CONFIG_QUIET=true`.

### Auto-wipe bug — dropdown values disappearing on click (found 2026-05-21)
**Symptom:** A dropdown cell (Status, Site, Designation, Source) shows a value. User clicks the cell and immediately clicks away without changing anything. The value disappears permanently.

**Root cause:** `commitEdit` always fires on `onBlur`. For FK-mapped columns (`site_name` → `site_id`, `designation_name` → `designation_id`, `source_name` → `source_id`), it looks up the ID from the in-memory master list. If the value is not in the current master data (old/renamed/deactivated entry), the lookup returns `undefined` → `fieldVal = null` → PATCH sends `{ site_id: null }` to the DB → value wiped.

**Affected columns:** `site_name`, `designation_name`, `source_name` (any column that maps display name → FK id in `commitEdit`). Also any `final_status` value not in the `status` master list (though that column stores text directly, so it won't wipe — it will just appear as an unlisted value in the dropdown).

**How to find affected rows (run against live DB):**
```sql
-- Orphaned FK references (master entry deleted entirely)
SELECT c.id, c.name, c.site_id, c.designation_id, c.source_id
FROM candidates c
LEFT JOIN masters s   ON s.id = c.site_id
LEFT JOIN masters d   ON d.id = c.designation_id
LEFT JOIN masters src ON src.id = c.source_id
WHERE c.is_deleted = false
  AND (
    (c.site_id IS NOT NULL AND s.id IS NULL) OR
    (c.designation_id IS NOT NULL AND d.id IS NULL) OR
    (c.source_id IS NOT NULL AND src.id IS NULL)
  );

-- Inactive master entries still referenced by candidates
SELECT c.id, c.name, s.name as site, d.name as designation, src.name as source
FROM candidates c
LEFT JOIN masters s   ON s.id = c.site_id
LEFT JOIN masters d   ON d.id = c.designation_id
LEFT JOIN masters src ON src.id = c.source_id
WHERE c.is_deleted = false
  AND (s.is_active = false OR d.is_active = false OR src.is_active = false);

-- Status values not in master (stored as text — won't wipe but will look broken)
SELECT final_status, count(*) FROM candidates
WHERE is_deleted = false AND final_status IS NOT NULL
GROUP BY final_status
HAVING final_status NOT IN (SELECT name FROM masters WHERE type = 'status')
ORDER BY count(*) DESC;
```

**Fix:** Add the missing values to the `masters` table so the lookup succeeds. Example:
```sql
INSERT INTO masters (id, type, name, sort_order, is_active)
VALUES (gen_random_uuid(), 'status', 'Not Yet processed', 35, true);
```
Done 2026-05-21: added `Not Yet processed` (54 candidates) and `Dropped` (4 candidates) to live DB.

**Long-term code fix (not yet applied):** Add a no-change guard at the top of `commitEdit` in `candidates-client.tsx` — if `value.trim() === currentVal.trim()`, return early without saving. This prevents any accidental wipe even if master data drifts again.

### Sheet new-row focus bug (fixed 2026-05-20)
**Symptom:** Clicking a cell in the new-row (add-candidate row at the bottom of the sheet), typing a character, but keystrokes land in a *different* cell — the one that was last selected via arrow/click navigation in the main table. The cursor visibly appears in the new-row cell but typing starts editing the regular cell instead. Clicking "+ Add Row" temporarily fixes it because that button calls `setSel(null)`.

**Root cause:** The main table's `handleTableKeyDown` only bails out if `editing` is set. When the user is filling the new row, `editing` is null. Keystrokes from the new-row `<input>` bubble up through the DOM to the `<div tabIndex={0}>` wrapper that owns `handleTableKeyDown`. If `sel` is still pointing at a regular cell (set by a prior click), `handleTableKeyDown` calls `startEdit()` on that regular cell, which mounts a new `<input>` and steals focus.

**Fix (candidates-client.tsx):**
1. `if (newRowActive) return;` added at the top of `handleTableKeyDown` — new-row mode disables all table keyboard handling.
2. `setSel(null)` added to the new-row `<td>` `onClick` — clicking into the new row clears any regular-cell selection.

---

---

## 17. Running Claude Code on the VPS (Phase 2C+ handoff)

### 17.1 Why this exists

Phase 2B took ~4 days because every command went through a Windows cmd → SSH → bash → paste loop. To finish Phase 2C (remaining ~46 routes from `supabase.from()` → Drizzle) faster, we run Claude Code **directly on the VPS** so it has native filesystem + shell access. Speed-up is roughly 3-5x.

The trade-off: Claude is now operating *on the actual server* with no human-in-the-loop paste step, so guardrails matter. **Read §17.4 carefully before granting access.**

### 17.2 One-time install

SSH in (`ssh root@91.108.110.236`), then:

```bash
# Install globally via npm (Node 20 is already on this box)
npm install -g @anthropic-ai/claude-code
claude --version    # confirm

# Start it from the staging workspace
cd /root/ats-staging
claude
```

First run prompts authentication. Since you're on SSH (no browser locally), it prints a login URL — open it on your laptop, log in, paste the token back.

### 17.3 Permission mode

When Claude Code asks for a permission mode, pick one of:

| Mode | Behavior | When to use |
|---|---|---|
| `default` | Asks for every shell command and most edits | First-time use, max oversight |
| `acceptEdits` | Auto-accepts file edits within the cwd; still asks for shell commands | **Recommended for Phase 2C** — fast file rewrites, manual gate on `git push`, `pm2 restart`, etc. |
| `acceptAll` | Auto-accepts everything | NEVER use on this box |

Switch modes mid-session with the `/permissions` slash command if needed.

### 17.4 GUARDRAILS — what Claude MUST NOT do

**State these as absolute rules in the first message you send to Claude on the VPS** (the handoff prompt in §17.6 already includes them, but if you write your own, copy these in).

#### Filesystem — NEVER write or delete in:

- `/var/www/ats/` — **THE LIVE APP.** Any edit here is a direct production change. Phase 2C is staging-only.
- `/var/www/ats.bak-*` — pre-cutover rollback snapshot. Touching it destroys our safety net.
- `/etc/**` — system config (nginx, systemd, certbot, sudoers, anything).
- `/root/.ssh/**` — private deploy key, authorized_keys, known_hosts.
- `/root/.ats-db-credentials` — local Postgres password file.
- `/root/.pm2/**` — process manager state. Touching it breaks live.
- `/root/supabase-*.dump` — keep these as data backups.
- `~/.claude/**` — Claude's own config. Don't let it modify its own permissions.

Claude only writes inside `/root/ats-staging/`. Period.

#### Shell — NEVER run:

- `pm2 *` — affects the live app.
- `systemctl *` — affects nginx, postgres, etc.
- `nginx *`, `certbot *` — affects HTTPS / reverse proxy.
- `git push` (any remote) — would publish the migration mid-flight; manual deploy only via §9.9.
- `rsync ... /var/www/ats/` or `cp ... /var/www/ats/` — see §9.9; live deploy is a deliberate manual step.
- `apt install`, `apt upgrade`, `apt remove` — system-level changes.
- `rm -rf` anywhere outside `/root/ats-staging/`. Even inside, prefer `git clean` / `git restore` over `rm`.
- `psql ... DROP` / `TRUNCATE` against `auth.users` or `public.profiles` — would lock you out.
- `chmod`, `chown` outside `/root/ats-staging/`.
- `kill` / `pkill ats` — kills live PM2 process.
- `npm install` outside the staging folder.
- Any command modifying `.env.local` *on live* (`/var/www/ats/.env.local`).

#### App-level — NEVER:

- Modify `lib/db/schema.ts` to drop `authUsers` alias (auth.ts depends on it).
- Modify `auth.ts`, `auth.config.ts`, `middleware.ts` without explicit user approval — Phase 2B is sealed.
- Run `drizzle-kit push` or `drizzle-kit migrate` against the DB — it would write to local PG. Read-only `drizzle-kit introspect` is fine.
- Disable RLS on Supabase (the cloud one, not local). RLS is already off locally; don't change it.
- Touch any file in `app/(app)/layout.tsx` or `components/sidebar.tsx` without confirmation — these were just hot-fixed in 2B.10 and 2C.1.
- Make schema changes (CREATE / ALTER TABLE) — schemas are pinned to what `drizzle-kit introspect` produced.

#### What Claude IS allowed to do (positive scope):

- Read any file under `/root/ats-staging/`, `/tmp/staging-dev.log`, `/var/log/nginx/*` (read-only investigation).
- Edit/Write any file under `/root/ats-staging/` (the route migrations live here).
- `git add`, `git commit`, `git status`, `git log`, `git diff` within `/root/ats-staging/`.
- Run `npm run dev` / `tail /tmp/staging-dev.log` for verification.
- Run `psql -d ats` SELECT-only queries for verification.
- Run `curl http://127.0.0.1:3001/...` to test routes locally.

### 17.5 settings.json denylist (belt-and-suspenders)

Beyond the prompt-level rules, add a hard denylist in Claude Code's settings file. SSH in, then:

```bash
mkdir -p ~/.claude
cat > ~/.claude/settings.json <<'JSON'
{
  "permissions": {
    "deny": [
      "Bash(rm -rf*)",
      "Bash(rm:*/var/www/**)",
      "Bash(rm:/etc/**)",
      "Bash(rm:/root/.ssh/**)",
      "Bash(rm:/root/.ats-db-credentials)",
      "Bash(rm:/root/.pm2/**)",
      "Bash(rm:/root/supabase-*.dump)",
      "Bash(pm2*)",
      "Bash(systemctl*)",
      "Bash(nginx*)",
      "Bash(certbot*)",
      "Bash(apt*)",
      "Bash(git push*)",
      "Bash(chmod:*/var/**)",
      "Bash(chown:*/var/**)",
      "Bash(rsync:*/var/www/**)",
      "Bash(cp:*/var/www/**)",
      "Bash(drizzle-kit push*)",
      "Bash(drizzle-kit migrate*)",
      "Edit(/var/www/**)",
      "Edit(/etc/**)",
      "Edit(/root/.ssh/**)",
      "Edit(/root/.ats-db-credentials)",
      "Edit(/root/.pm2/**)",
      "Write(/var/www/**)",
      "Write(/etc/**)",
      "Write(/root/.ssh/**)",
      "Write(/root/.ats-db-credentials)",
      "Write(/root/.pm2/**)"
    ]
  }
}
JSON
chmod 600 ~/.claude/settings.json
```

Claude reads this on every startup. Even if a prompt-injection or mistake tries to make Claude run a denied command, it's blocked at the tool layer.

> **Verify the syntax** before relying on it — Claude Code's permissions schema may evolve. Run `claude config get permissions` (or `/permissions` inside Claude) to confirm the deny rules took effect.

### 17.6 Handoff prompt for Phase 2C

> ⚠️ **HISTORICAL — Phase 2C.3 is now complete.** This was the original handoff that kicked off route migration. For the *current* handoff (verification + deploy + open issues), use [§17.9](#179-phase-2c3-done--handoff-for-verification--deploy) instead.

Once Claude is running in `/root/ats-staging/`, paste this as the first message:

````
You are picking up Phase 2C of the Hire Rabbits ATS migration. Full context: /root/ats-staging/SERVER-GUIDE.md (read it first, especially §17.4 GUARDRAILS — those are absolute).

CURRENT STATE (verify with `git log --oneline -5`):
- Branch: phase-2b-nextauth, HEAD at f48bec4 ("Phase 2C.2: migrate /api/co-sourcers ...")
- Phase 2B fully complete (NextAuth replacing Supabase Auth — 48 routes already done)
- Phase 2C.1 done (d8e073d): drizzle-kit introspect output is in lib/db/schema.ts (1078 lines, all 28 public tables + auth.users typed; `authUsers` alias for auth.ts compatibility)
- Phase 2C.2 done (f48bec4): app/api/co-sourcers/route.ts migrated as PROOF OF CONCEPT — copy this pattern for everything else.

Dev server runs on port 3001 via `nohup npm run dev > /tmp/staging-dev.log 2>&1 &`. Should already be running — check `pgrep -af "next dev"`. If not, start it (do NOT touch pm2 or the live app on port 3000).

WHAT'S LEFT (Phase 2C.3):
- ~46 routes in app/api/**/route.ts still call supabase.from() via createAdminClient
- Inventory: `grep -rln "supabase\.from" app/api --include="*.ts"`
- Goal: replace every supabase.from() call with Drizzle queries against local PG, preserving the response shape so the frontend doesn't change

PATTERN (see commit f48bec4 / app/api/co-sourcers/route.ts):
- Replace `import { createAdminClient } from "@/lib/supabase/server";` with `import { db } from "@/lib/db";`, `import { tableName, ...otherTables } from "@/lib/db/schema";`, and `import { and, asc, desc, eq } from "drizzle-orm";`
- `supabase.from("X").select("*").eq("col", val)` → `db.select().from(X).where(eq(X.colCamelCase, val))`
- For Supabase joins (`select("*, profile:profiles!fk_name(...)")`), use `db.select({...}).from(X).leftJoin(Y, eq(...))` and rebuild the nested object in `.map()`
- Auth guards (auth() + role checks) STAY — only the data layer changes
- `db.insert(X).values({...}).returning()` → destructure `[inserted]`
- `db.update(X).set({...}).where(eq(...)).returning()`
- `db.delete(X).where(eq(...))`

WORKFLOW (CRITICAL):
1. ALL work is on LOCAL sandbox: /root/ats-staging, port 3001. NEVER touch /var/www/ats/ — see §17.4.
2. Batched commits per feature area:
   - 2C.3a: candidates + sub-resources (route.ts, [id]/route.ts, [id]/{communications,files,cv,offers,score}/route.ts)
   - 2C.3b: jobs + sub-resources, interviews, offers
   - 2C.3c: simple CRUD: masters, email-templates, forms, jd-library, recruitment-forms, deletion-requests
   - 2C.3d: dashboard, activity-logs, my-activity (aggregations)
   - 2C.3e: users family, settings/{ai,google-drive}, sync, backup, etc. (skip if irrelevant — flag and move on)
3. After each batch:
   - Verify dev compiles clean: `tail -50 /tmp/staging-dev.log` for "✓ Compiled" / no "⨯ Error"
   - For at least one route per batch: `curl -s -o /tmp/test.json -w "HTTP %{http_code}\n" "http://127.0.0.1:3001/api/<route>"` — expect 401 unauthorized (proves the file compiles)
   - Commit with author "Phase 2C": `git -c user.name="Phase 2C" -c user.email="phase2c@local" commit -m "Phase 2C.3X: ..."`
4. Never `git push` — staging is local-only until §9.9 deploy is run by the user.

KNOWN GOTCHAS (from prior sessions):
- The introspected schema named auth.users as `usersInAuth`, but auth.ts imports `authUsers` — there's an alias `export const authUsers = usersInAuth;` at the END of lib/db/schema.ts. DO NOT delete it.
- drizzle-kit introspect produced `.default(')` (unterminated empty-string defaults) on 4 lines in auth.users — already patched. If you re-run introspect, re-apply: `sed -i "s/\.default(')/\.default('')/g" lib/db/schema.ts`.
- Drizzle timestamps use `mode: 'string'` — they come back as strings. Don't break code that assumes Date.
- Local PG has activity_log/candidates/jobs/interviews TRUNCATEd (intentionally empty — for demo). Don't be alarmed by empty SELECTs.

DELIVERABLE:
- One commit per batch (~5 commits total)
- Final state: zero `supabase.from()` in app/api (or skip-list documented in last commit)
- Dev server still runs clean, login still works
- DO NOT deploy to /var/www/ats/. Stop when staging branch is clean and tell the user. They run §9.9 deploy manually.

START BY:
1. Reading SERVER-GUIDE.md (especially §17.4 GUARDRAILS)
2. `git log --oneline -5` to confirm HEAD == f48bec4
3. `grep -rln "supabase\.from" app/api --include="*.ts" | sort > /tmp/2c-todo.txt && wc -l /tmp/2c-todo.txt && cat /tmp/2c-todo.txt`
4. Confirming with the user which batch (2C.3a-e) to start with
````

### 17.7 If Claude breaks something

**Staging only — full reset, lose nothing important:**
```bash
cd /root/ats-staging
git status                                  # see the damage
git stash                                   # park dirty changes (recoverable)
git reset --hard HEAD                       # OR: git reset --hard f48bec4 (last good)
git clean -fdx -e node_modules -e .next     # clear untracked, keep deps
```

**If dev server is hosed:**
```bash
pkill -f "next dev"
cd /root/ats-staging
PORT=3001 nohup npm run dev > /tmp/staging-dev.log 2>&1 &
disown
```

**If live (`/var/www/ats/`) was somehow touched (it shouldn't be — §17.4):**

Roll back per [§9.10](#910-rollback-a-bad-deploy):
```bash
pm2 stop ats
rsync -a --delete /var/www/ats.bak-2026-05-07-1549/ /var/www/ats/
pm2 start ats
```

**If `auth.users` or `profiles` got corrupted on local PG:**

Re-restore from the dumps per [§9.17](#917-refresh-local-postgres-from-supabase).

### 17.8 Cleanup / uninstall

When Phase 2C is done and you no longer want Claude Code on the VPS:

```bash
npm uninstall -g @anthropic-ai/claude-code
rm -rf ~/.claude
```

This removes the binary and Claude's local config (auth tokens, settings, history). Doesn't touch the project, the database, or anything in `/root/ats-staging/`.

### 17.9 Phase 2C.3 DONE — handoff for verification & deploy

> Use this as the first message when you re-install Claude Code on the VPS (after the §17.2 install + §17.5 settings.json + ssh in). It supersedes §17.6.

````
You are picking up the Hire Rabbits ATS migration AFTER Phase 2C.3 was completed in a prior session. Read /root/ats-staging/SERVER-GUIDE.md first, especially §17.4 GUARDRAILS (absolute) and §17.9 (this handoff). Then run `git log --oneline -10` to confirm state.

CURRENT STATE (HEAD should be 942c942 on branch phase-2b-nextauth):
- 942c942  Phase 2C close-out: 33 of 34 routes on Drizzle, 2 deferred
- f0ddb45  2C.3e: backup/import/settings/sync/token (7 routes)
- cd4b145  2C.3d: dashboard + activity-logs (2 routes)
- 4cb538c  2C.3c: simple-CRUD batch (15 routes)
- 8f63847  2C.3b: jobs + interviews (3 routes)
- 323c8d9  2C.3a: candidates batch (5 routes)
- f48bec4  2C.2:  /api/co-sourcers (POC, 1 route)
- d8e073d  2C.1:  drizzle-kit introspect → lib/db/schema.ts
Plus everything before that: Phase 2B (NextAuth, 48 routes — sealed).

Net: 33 of 34 routes in app/api/ now query local PG via Drizzle. Verify with:
  grep -rln "supabase.from" app/api --include="*.ts"
  → expect 2 results (recruitment-forms + screening-questions, see DEFERRED below).

PATTERNS ESTABLISHED (use these for any further Drizzle work):
1. Frontend (lib/types.ts) is fully snake_case. Drizzle returns camelCase.
   Convert with the helpers in lib/db/index.ts:
     import { rowToSnake, rowsToSnake } from "@/lib/db";
2. For routes that accept arbitrary body payloads, derive a SQL-name → JS-name
   map at module load:
     const COL_MAP = Object.fromEntries(
       Object.entries(getTableColumns(table)).map(([camel, col]) => [col.name, camel])
     );
   Then drop unknown keys silently in mapBody().
3. For routes with a small fixed field set, use an explicit FIELD_MAP record.
4. For aliased self-joins (masters as designation+site, profiles as requester+
   reviewer), use alias() from "drizzle-orm/pg-core".
5. For one-to-many with junction tables (job_recruiters, email_template_jobs,
   assessment_jobs), fetch parents first, then children in one inArray() query
   and group in JS — avoids N+1.
6. Drizzle numeric() columns return STRINGS not numbers. If you write code that
   does math on present_salary/expected_salary/min_salary/max_salary/annual_ctc
   etc., wrap with Number() first.
7. Drizzle timestamps use mode:'string' (ISO strings, not Date objects).

DEFERRED (NOT migrated, still calling supabase.from()):
- app/api/recruitment-forms/route.ts  → public.recruitment_forms missing in local PG
- app/api/screening-questions/route.ts → public.screening_questions missing in local PG
Both are flagged with "// PHASE 2C DEFERRED" banner comments. They were already
broken before the migration (PostgREST 500s); leaving them was deliberate. Fix
path: either restore tables from /root/supabase-*.dump and re-run drizzle-kit
introspect → lib/db/schema.ts, then migrate as usual; or delete the routes +
their UI callers in app/(app)/masters/page.tsx (lines ~200, 317).

OUT-OF-SCOPE FILES STILL ON SUPABASE (these were not in the §17.6 inventory
because they're not in app/api/):
- app/(app)/candidates/page.tsx — server component, uses createAdminClient() to
  load profile + masters from cloud Supabase. Works fine, but inconsistent with
  the rest of Phase 2C. Migrate when convenient.
- app/(app)/layout.tsx — uses createAdminClient() for the profiles lookup
  (already has Phase 2B's fallback to a synthesized profile). Same situation.

OPEN ISSUES (carry into your session):
1. Authenticated smoke testing has NOT been done. Compile-clean + 401-on-no-auth
   only proves files compile, not that flows work. The user needs to log in and
   exercise: candidates list/edit/CV/files/offers, jobs CRUD + recruiter assign,
   interviews schedule, dashboard (all group_by modes), import (candidates +
   jobs Excel), masters/CTC/email-templates/JD admin pages, deletion-requests
   flow, sync conflict resolve, settings/AI, settings/google-drive.
   Watch /tmp/staging-dev.log while clicking around — Drizzle errors land there.
2. Import error reported by user but not yet diagnosed. Server returned 200 (no
   crash) but response body presumably had errors[]. Need DevTools Network →
   Response, OR add a console.log in app/api/import/route.ts before returning.
3. Numeric column audit — grep frontend for arithmetic on present_salary,
   expected_salary, offered_salary, annual_ctc, min_salary, max_salary,
   placement_fee_pct, placement_fee_flat. With Drizzle these come back as
   strings; "50000" - "30000" silently equals 20000 in JS but "50000" + "30000"
   = "5000030000". Add Number() casts where needed.
4. Email-templates updated_by no longer written. The schema has no such column
   so the previous code's update was already a no-op. If audit-trail "who last
   edited" is wanted, add the column via a migration.
5. Live (cybrancee VPS, /var/www/ats/) is STILL on the pre-Phase-2 code (HEAD =
   5deef62). NO deploy has happened. Staging branch is local-only — no git push.

DATA STATE (don't be alarmed):
- Local PG: candidates / jobs / interviews / activity_log are TRUNCATEd by
  intent (per §17.6 KNOWN GOTCHAS). Empty SELECTs are normal.
- profiles table is populated (6 users — 2 admin, 1 hr_manager, 3 recruiters:
  Anni, Liaba, Kashish).
- Live (Supabase cloud) has the real data.

USER QUESTIONS THAT CAME UP IN THE PRIOR SESSION (for context):
- "Why can't Liaba/Kashish see candidates?" — diagnosed as data-scope, not code.
  /api/candidates GET scopes recruiters to candidates where created_by=them OR
  hr_id=them OR designation_id IN (jobs they're assigned to). If none of those
  match, list is empty. Sidebar tab is NOT role-gated, so the tab is visible.
  Fix: admin assigns them as hr_id on candidates, OR adds them to job_recruiters.
- "Make staging same as live" — refused, this is the §9.9 deploy and the user
  must run it manually. Several blockers (smoke tests, import error, deferred
  routes) should be resolved first.

WHAT THE USER WANTS NEXT (likely):
1. Diagnose + fix the import error (check /tmp/staging-dev.log + ask user for
   DevTools Network → Response body, or instrument the route).
2. Run authenticated smoke tests with the user driving in the browser.
3. Decide on the 2 deferred routes.
4. Walk the user through §9.9 deploy step-by-step (you do NOT run it; the user
   types the commands per §17.4).

DEV SERVER:
Should already be running. Check: pgrep -af "next dev". If not:
  cd /root/ats-staging
  PORT=3001 nohup npm run dev > /tmp/staging-dev.log 2>&1 &
  disown
DO NOT touch pm2, the live app, or port 3000.

START BY:
1. Reading SERVER-GUIDE.md §17.4 (guardrails) and §17.9 (this).
2. `git log --oneline -10` — verify HEAD == 942c942.
3. `grep -rln "supabase.from" app/api --include="*.ts"` — expect 2 deferred files.
4. `tail -50 /tmp/staging-dev.log` — check current state.
5. Asking the user which open issue to tackle first (most likely: the import
   error they were debugging at end of last session).
````

### 17.10 Phase 2D DONE — full Supabase cut (2026-06-12)

> ~~RESUME HERE~~ — **Phase 2D/2E complete as of 2026-06-12.** See §1 and §11 for current state.

**STATE AT END OF SESSION (2026-05-12) — HISTORICAL:**

- Branch: `phase-2b-nextauth`, HEAD `4240e90`. Working tree clean except for this guide (and the untracked `Demo-HR.xlsx` test file).
- User goal: **"cut off ALL Supabase, everything stores locally."** No remnants. Storage too. Then deploy so mobile UI lands on live.
- LIVE (`/var/www/ats/`) is STILL on post-2B.10 build (`649285f`). All Phase 2D commits are staging-only. **Deploy was attempted via sub-agent at end of session and was BLOCKED by sandbox permissions** — see "DEPLOY BLOCKER" below.

---

**Recent commits (newest first):**

| Commit | What it did |
|---|---|
| `4240e90` | Phase 2D.2 (partial): 6 routes off cloud Supabase (`backup-logs`, `forms`, `users/me`, `offers`, `parse-resume`, `candidates/[id]/files`) |
| `ece7ce9` | Phase 2D.1: Drizzle for `layout.tsx`+`candidates/page.tsx`, new `recruitment_forms`+`screening_questions` tables+routes, mobile-friendly dashboard/sidebar/candidate-detail-panel, import DD/MM/YYYY fix |
| `0fe02e1` | SERVER-GUIDE §17.9 (previous handoff) |
| `942c942` | Phase 2C close-out (33 of 34 routes on Drizzle, 2 deferred — those 2 are now done in `ece7ce9`) |

---

**DONE this session (committed):**

1. **Data sync cloud Supabase → local PG.** `pg_dump --data-only --schema=public` from cloud (`/tmp/cloud-data-2026-05-11.sql`), stripped `profiles` block (preserved the 2 local-only admins Hrho4 + recruitment, plus Anish/Rohan as admin), `TRUNCATE … RESTART IDENTITY CASCADE` on 27 tables, restored. Local PG now has the cloud data + 40 candidates imported from `Demo-HR.xlsx` Sheet10.
   - Row counts after sync + import: candidates 41, jobs 1, masters 96, profiles 6, activity_log 2, forms 3, auth.users 6, candidate_files 0.

2. **`app/(app)/layout.tsx`** — profile lookup migrated to Drizzle.

3. **`app/(app)/candidates/page.tsx`** — profile + 5× masters + recruiters list migrated to Drizzle. Uses `rowsToSnake` for response shape.

4. **`app/api/import/route.ts`** — DD/MM/YYYY date-string parser + per-row retry on chunk failure. User confirmed Demo-HR.xlsx Sheet10 → 40 of 40 imported.

5. **Mobile-friendly UI** (3 surfaces, user explicitly extended scope mid-session):
   - **`app/(app)/dashboard/page.tsx`** — top padding bumped to clear mobile hamburger, filter row 2-col grid below `sm:`, charts stack below `lg:`, recruiter performance table → card view below `md:`.
   - **`components/sidebar.tsx`** — full mobile drawer: hamburger top-left below `lg:`, backdrop, slide-in transform, close ✕ in drawer header, auto-close on nav click. Desktop UX unchanged.
   - **`components/candidate-detail-panel.tsx`** — was `w-[600px]` fixed-right; now full-screen on mobile (`fixed inset-0 sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-[600px]`). Backdrop hidden on mobile (panel covers full screen).

6. **New tables in local PG** + Drizzle schema + Drizzle-based routes:
   - `public.recruitment_forms` — `id`, `name`, `form_type`, `url`, `designation_id`, `site_id`, `description`, `send_to_candidate`, `is_active`, `created_at`, `created_by`. Schema export: `recruitmentForms` in `lib/db/schema.ts:198`.
   - `public.screening_questions` — `id`, `designation_id`, `question`, `question_type`, `is_mandatory`, `sort_order`, `is_active`, `created_at`, `created_by`. Schema export: `screeningQuestions` in `lib/db/schema.ts:212`.
   - Both routes (`app/api/recruitment-forms/route.ts`, `app/api/screening-questions/route.ts`) rewritten on Drizzle with `getTableColumns` → snake-case column-name map; smoke-tested (GET both → 401 = auth guard working).

7. **Supabase Storage stripped from `app/api/candidates/[id]/files/route.ts`** — `candidate_files` table has 0 rows so legacy Supabase-path branches were dead code. New uploads already used Google Drive (kept). GET/DELETE branches that called `admin.storage.from("candidate-files")` removed entirely. `createAdminClient` import gone.

8. **6 more routes off cloud Supabase to Drizzle:** `backup-logs`, `forms`, `users/me`, `offers` (full migrations including a `leftJoin` chain for `offers` GET); `parse-resume`, `candidates/[id]/files` (removed unused/dead `createAdminClient` imports).

---

**ALL ROUTES MIGRATED — DONE 2026-06-12:**

```
app/api/candidates/[id]/communications/route.ts  ✅ Drizzle
app/api/communications/route.ts                  ✅ Drizzle
app/api/users/[id]/route.ts                      ✅ Drizzle
app/api/candidates/[id]/score/route.ts           ✅ Drizzle
app/api/sync/trigger/route.ts                    ✅ Drizzle
app/api/users/reset-password/route.ts            ✅ Drizzle
lib/ai-client.ts                                 ✅ Drizzle
app/auth/callback/route.ts                       ✅ Neutralized (dead OAuth code → redirect /login)
lib/supabase/client.ts                           ✅ DELETED
lib/supabase/server.ts                           ✅ DELETED
```

Verification: `grep -rln "supabase\|createAdminClient\|createClient" app lib components` → **zero results**.

---

**DEPLOY BLOCKER (encountered 2026-05-12):**

User asked to push the mobile-friendly UI to live so they could test from phone. A sub-agent was spawned to run §9.9; it was **blocked by sandbox permissions** on `pkill`, `kill`, and `pm2`. Nothing on live was touched. To unblock:

- The interactive Claude Code session must run with elevated bash permissions for these commands, OR
- The user must run §9.9 manually (steps in that section are correct as written; the staging branch HEAD is `4240e90`).

Recommended deploy order: finish the 10 remaining migrations first, then one deploy carries everything. Acceptable interim option: deploy `4240e90` now (mobile UI + Drizzle progress) and re-deploy after the 10 migrations land. **Cloud Supabase will keep working on live for the 9 unmigrated routes** until they're migrated, so an interim deploy is safe.

---

**USER FEEDBACK INTERNALIZED (saved to memory: `feedback_minimal_scope.md`):**

User strongly prefers narrowly-scoped changes. Two corrections this session (importer multi-sheet feature creep; mobile scope mid-session). When asked to "fix X", fix exactly X.

---

**NEXT STEP — deploy to live:**

Phase 2D/2E is complete on staging. When ready, run the §9.9 deploy flow to push to `/var/www/ats/`.

After deploying, you can safely remove these now-unused keys from `/var/www/ats/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

And then decommission the Supabase project via the dashboard.

---

## Job Assignments & Data Changes (2026-05-26)

### Jobs created & assigned to Kashish (`hrho4@hirerabbits.in`)
10 new open job openings inserted directly into local PG (`created_by` = Anish, `recruiter` = Kashish):

| Job Title | Designation linked |
|---|---|
| BDM Service / Payroll | BDM Service / Payroll |
| Back Office Executive | Back Office Executive |
| Finance / Accounts Manager | Finance / Accounts Manager |
| Transport Logistic Manager / Executive | Transport Logistic Manager / Executive |
| Manager - Operations and Administration | Manager – Operations |
| HR Coordinator | HR Coordinator |
| Sr. Accountant | Sr. Accountant |
| Accountant Cum Cashier | Accountant Cum Cashier |
| GM – Cement O&M | GM – Cement O&M |
| Assistant Executive cum PA | Assistant Executive CUM PA |

All designations already existed in `masters` — no new ones added.

**To verify:**
```sql
SELECT j.title, p.name as recruiter FROM jobs j
LEFT JOIN job_recruiters jr ON jr.job_id = j.id
LEFT JOIN profiles p ON p.id = jr.recruiter_id
WHERE p.email = 'hrho4@hirerabbits.in' AND j.is_deleted = false;
```

### Jobs assigned to Laiba (`recruitment@hirerabbits.in`)
3 existing jobs (previously unassigned) assigned to Laiba:
- **Sr. Executive HR** (`64ba8317-152c-4200-b3fa-d431fec8aef7`)
- **Site Head** (`da3470f1-9244-44ef-9907-b8411dfd3d3a`)
- **Data Analyst / MIS** (`41a3a243-ce38-424b-b97c-2e78a6429ae8`)

**To verify:**
```sql
SELECT j.title, p.name as recruiter FROM jobs j
LEFT JOIN job_recruiters jr ON jr.job_id = j.id
LEFT JOIN profiles p ON p.id = jr.recruiter_id
WHERE p.email = 'recruitment@hirerabbits.in' AND j.is_deleted = false;
```

### Jobs → Candidates click-through filter (code change)
Updated `openJobCandidates` in `app/(app)/jobs/page.tsx`:
- **Admin / HR Manager / HOD** clicking a job → candidates page with `owner=all` + designation pre-filtered + **recruiter (`hr_id`) pre-filtered** to that job's assigned recruiter.
- **Recruiter** clicking a job → `owner=mine` + designation pre-filtered (unchanged).

---

## Bug Fixing

Bug-fix session log (local staging first, then deploy when approved):

- **Master dropdown / Kanban ingestion regression** — `app/(app)/candidates/candidates-client.tsx`
  - Dropdown edit cells preserve a row's current value even if that value is missing from active masters.
  - Kanban adds columns for actual candidate `final_status` values returned by `/api/candidates`, so imported/non-master statuses do not disappear.

- **Sheet column sorting** — `app/(app)/candidates/candidates-client.tsx`
  - Column triangle menu now includes Ascending, Descending, and Clear sort.
  - Date columns sort chronologically; blank values stay at the bottom.

- **Recruiter candidate visibility** — `app/api/candidates/route.ts`, `app/(app)/candidates/candidates-client.tsx`
  - Recruiter **All** now loads all non-deleted candidates from the database.
  - Recruiter **Mine** remains client-side scoped to candidates where `hr_id` or `created_by` matches the recruiter.
  - Recruiter edit restrictions are still enforced in `app/api/candidates/[id]/route.ts`.

- **Jobs → Candidates backtracking** — `app/(app)/jobs/page.tsx`, `app/(app)/candidates/page.tsx`, `app/(app)/candidates/candidates-client.tsx`
  - Clicking a job card routes to `/candidates` with the job designation preselected.
  - Recruiters land on **Mine**; admins and HR managers land on **All**.
  - The link sends `designation_id` when present and `designation_name` as fallback; Candidates resolves the name to the dropdown ID.

- **User creation / first-login password setup** — `app/api/users/route.ts`, `app/api/users/set-password/route.ts`, `app/login/page.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/users/page.tsx`
  - Admin user creation is passwordless: name/email/role/department only.
  - New `auth.users` rows are created with `encrypted_password = null`; the existing `on_auth_user_created` trigger creates `profiles`; backend updates that trigger-created profile rather than inserting a duplicate.
  - `/login` includes **First login? Create password**. `POST /api/users/set-password` only works when no password exists yet.
  - Team & Users keeps **Reset PW** for admin reset flow.
  - Role values are normalized/validated before insert (`admin`, `hr_manager`, `recruiter`, `hod`) to avoid raw DB check errors.

- **Local staging data cleanup**
  - Merged duplicate site master: removed `ICD Tumb (Vapi)`, kept `ICD Tumb Adani`.
  - Removed duplicate Monica profiles; kept the one login-backed Monica row (`hr5.hirerabbits@gmail.com`).
  - Removed Anni and Tanu profile/auth rows after confirming no candidates/jobs references.
  - Removed local `test@gmail.com` profile/auth rows.

- **Laiba May-13 bulk-import — application_date month fix (2026-05-26)**
  - 78 candidates imported on 2026-05-13 had the correct **day** but wrong **month** in `application_date` (e.g. `2026-12-05`, `2026-09-05`, `2026-04-22`) due to DD/MM/YYYY parsing during Excel import.
  - Fix applied: kept the day, changed month to May → `make_date(2026, 5, EXTRACT(DAY FROM application_date)::int)`. `month` column also set to `2026-05`.
  - **To revert** (paste into `sudo -u postgres psql -d ats`):
  ```sql
  UPDATE candidates AS c
  SET application_date = v.d, month = v.m
  FROM (VALUES
    ('6af51ca4-d3f1-4956-8cac-94000f6a528a'::uuid,'2026-12-05'::date,'2026-07'),
    ('71cb7e58-17c6-4c75-b9f4-d9914bebce72'::uuid,'2026-07-05'::date,'2026-05'),
    ('be9f48ec-3d08-46d4-9989-97111ae4b035'::uuid,'2026-04-22'::date,'2026-04'),
    ('05d7d4a3-4e64-4680-a3c1-323e2c607b62'::uuid,'2026-04-22'::date,'2026-04'),
    ('0ce2d0ff-9f32-45dc-a039-24dc75651eaa'::uuid,'2026-04-24'::date,'2026-04'),
    ('399db9fd-2fcf-40c7-957b-94a0a9800c14'::uuid,'2026-12-05'::date,'2026-05'),
    ('98ed130f-addf-4192-b23d-fd37cb2c0688'::uuid,'2026-04-22'::date,'2026-04'),
    ('269c6bda-9bf1-4e81-865a-2cc98ffc3898'::uuid,'2026-01-05'::date,'2026-05'),
    ('66339832-fede-498e-8465-66e356e9d7c8'::uuid,'2026-12-05'::date,'2026-05'),
    ('b173266f-9733-433e-a454-f7688f28283e'::uuid,'2026-09-05'::date,'2026-05'),
    ('74132787-4762-45e1-a250-984375385721'::uuid,'2026-04-05'::date,'2026-05'),
    ('99ec88c8-9408-4ec1-82a9-f625dc6bb21e'::uuid,'2026-07-05'::date,'2026-05'),
    ('a90f4557-1aa6-483a-bd41-4abc47924824'::uuid,'2026-07-05'::date,'2026-05'),
    ('fe39820d-1926-4330-8412-d8e7c0aeb4a1'::uuid,'2026-09-05'::date,'2026-05'),
    ('e719e223-48e0-4acd-8863-a17b4deb0007'::uuid,'2026-08-05'::date,'2026-05'),
    ('fb2a249c-1e4b-48bc-ad4f-5fae2a55639d'::uuid,'2026-08-05'::date,'2026-05'),
    ('f0049067-7c54-4e4a-bf95-3d5db9059d4a'::uuid,'2026-08-05'::date,'2026-05'),
    ('5121795b-4d02-4799-b3db-d78eea7eb9f6'::uuid,'2026-07-05'::date,'2026-05'),
    ('78f33492-8805-4860-8831-ce6676141846'::uuid,'2026-09-05'::date,'2026-05'),
    ('589b7f2c-35a9-41cb-960a-792dbcfa230f'::uuid,'2026-09-05'::date,'2026-05'),
    ('8b1e35d1-6158-4f16-bd22-49bad44c8910'::uuid,'2026-09-05'::date,'2026-05'),
    ('824b13b0-5ec0-4cfc-8933-cf47038c6735'::uuid,'2026-06-05'::date,'2026-05'),
    ('fa89914a-5869-4d6a-8105-2cd6b0b95658'::uuid,'2026-09-05'::date,'2026-05'),
    ('ab6c20b1-514a-4795-9a60-0777e56c42e6'::uuid,'2026-09-05'::date,'2026-05'),
    ('cedae743-e61b-4b38-b8d0-cb4493137627'::uuid,'2026-11-05'::date,'2026-05'),
    ('96086912-802c-49c4-98a4-c30aaa76b179'::uuid,'2026-09-05'::date,'2026-05'),
    ('1da81455-ec6d-4ab2-a975-a663f47a836a'::uuid,'2026-06-05'::date,'2026-05'),
    ('3368a792-fc61-49e8-89b7-768f0426bd44'::uuid,'2026-11-05'::date,'2026-05'),
    ('70d9a8db-3a1c-44ac-94df-7b264c626e14'::uuid,'2026-08-05'::date,'2026-05'),
    ('dda2c981-bdeb-4749-b816-bb4508aaacc4'::uuid,'2026-04-22'::date,'2026-04'),
    ('6dbd3a0f-0e86-4e74-8396-c0eefbcbb94d'::uuid,'2026-06-05'::date,'2026-05'),
    ('ce54f1a3-2432-4fad-bda6-0a6e4bd7d109'::uuid,'2026-04-22'::date,'2026-04'),
    ('1edb7bce-a77a-4706-81d3-b6ace9cdd673'::uuid,'2026-04-22'::date,'2026-04'),
    ('45384ee4-f439-4e13-af49-37f41ac66ace'::uuid,'2026-04-22'::date,'2026-04'),
    ('d4bd0a7e-bf2c-4bb7-ab0c-0fbad9af8694'::uuid,'2026-04-22'::date,'2026-04'),
    ('f729db94-c285-433c-ba08-10414676ab3a'::uuid,'2026-04-22'::date,'2026-04'),
    ('be9789e8-1e4a-4ce3-aee4-60cceae04f50'::uuid,'2026-04-20'::date,'2026-04'),
    ('a393431f-7996-46fb-b2cc-2f6ae18f8f40'::uuid,'2026-05-18'::date,'2026-04'),
    ('cc19429d-f296-460f-8113-7067410366ba'::uuid,'2026-04-22'::date,'2026-04'),
    ('4cdcd805-c4ba-4b90-8a1b-9a9ec994f3fc'::uuid,'2026-04-22'::date,'2026-04'),
    ('97af31d8-fcb5-438b-82ca-d0b6152b122e'::uuid,'2026-04-22'::date,'2026-04'),
    ('dd39f86b-289b-4fd0-84ab-d029757d0986'::uuid,'2026-04-24'::date,'2026-04'),
    ('140477ba-92d2-4f16-bf0d-2434d9380e36'::uuid,'2026-04-24'::date,'2026-04'),
    ('c6120e71-ba3e-4c07-bbb1-b4d4366e2a9a'::uuid,'2026-04-24'::date,'2026-04'),
    ('6472599b-ea3c-496a-9ea4-41f430777ad7'::uuid,'2026-04-22'::date,'2026-04'),
    ('ad326f95-24cd-4f5e-a4eb-3bf067d0fbdc'::uuid,'2026-09-05'::date,'2026-05'),
    ('90ec5e95-56bc-4d4d-8856-4a3ccb869c6f'::uuid,'2026-09-04'::date,'2026-04'),
    ('0d1f3378-84bf-4820-a10a-da302fddb728'::uuid,'2026-04-22'::date,'2026-04'),
    ('4280d961-7e6e-4526-8b8d-76abbf06a075'::uuid,'2026-04-21'::date,'2026-04'),
    ('092425a6-a986-4cb6-8be3-3eb826370523'::uuid,'2026-04-21'::date,'2026-10'),
    ('b35d6906-6908-466a-8e78-e549c34c48d5'::uuid,'2026-04-21'::date,'2026-04'),
    ('dbde3b19-0f3c-4047-ad67-6c0f6d6f12be'::uuid,'2026-04-21'::date,'2026-04'),
    ('b511e883-8388-4a81-b90e-f926b4c9197f'::uuid,'2026-04-21'::date,'2026-04'),
    ('adc5e274-8f61-4068-b458-1065effec4ce'::uuid,'2026-09-21'::date,'2026-04'),
    ('66523ca1-f63b-46a9-8d4f-b1ee7c132317'::uuid,'2026-04-21'::date,'2026-04'),
    ('4b23a8bc-3b85-435b-a1c8-58227539388c'::uuid,'2026-04-21'::date,'2026-04'),
    ('6338f22b-80de-41b1-acb2-1ee86eca25bd'::uuid,'2026-04-21'::date,'2026-04'),
    ('e43d4a1a-898f-4718-a326-819a397ee57b'::uuid,'2026-04-24'::date,'2026-04'),
    ('5252fc04-e4e5-4091-8215-30a4e69c25d5'::uuid,'2026-04-24'::date,'2026-04'),
    ('313f966e-9e0a-425b-a819-968c0d683f31'::uuid,'2026-04-24'::date,'2026-04'),
    ('c54c6059-9238-4df6-9aee-8c466fffd12d'::uuid,'2026-04-24'::date,'2026-04'),
    ('7a84e8a7-11b4-4a5f-a501-de600b80d171'::uuid,'2026-04-24'::date,'2026-04'),
    ('1f952cab-3dd8-4638-be3a-126e996d5431'::uuid,'2026-04-30'::date,'2026-04'),
    ('daa0f8c1-4fe4-4dc0-a9b2-eac93b0427eb'::uuid,'2026-04-24'::date,'2026-04'),
    ('319b9f92-a190-4eca-9659-716ef773af68'::uuid,'2026-04-24'::date,'2026-04'),
    ('c4195480-9073-49b8-9b38-2b96d65ffe64'::uuid,'2026-04-24'::date,'2026-04'),
    ('b955f93b-cde9-4603-b536-cdd63c26749e'::uuid,'2026-04-05'::date,'2026-08'),
    ('55ffb99d-e4c3-4056-8094-caf83e4900e9'::uuid,'2026-04-05'::date,'2026-05'),
    ('f2c81386-b322-4d75-baba-190eb6abe1e8'::uuid,'2026-01-05'::date,'2026-05'),
    ('b145a74b-974a-4e85-94ea-1367c68b5ade'::uuid,'2026-09-05'::date,'2026-05'),
    ('8598cfdd-0f0a-49eb-94d2-f6b6ca3957fb'::uuid,'2026-07-05'::date,'2026-05'),
    ('97052ce5-a1ed-4ee0-a304-32e37215d4d4'::uuid,'2026-07-05'::date,'2026-05'),
    ('fd03c18d-9fc5-4130-a38a-ee61023ccd96'::uuid,'2026-07-05'::date,'2026-05'),
    ('f8e0100e-fe2f-4ab1-9723-0bd825aab98d'::uuid,'2026-09-05'::date,'2026-05'),
    ('c2a82912-e4f7-4e5a-80c2-d1f2ecfc4a0e'::uuid,'2026-12-05'::date,'2026-05'),
    ('758324ab-5cf6-49ca-8105-8c90a37f7d04'::uuid,'2026-12-05'::date,'2026-05'),
    ('f62b03cc-f7ac-4a10-84c3-b9c50b48cdf5'::uuid,'2026-12-05'::date,'2026-05'),
    ('4d465825-4984-49e1-af3e-b5f47722c88e'::uuid,'2026-12-05'::date,'2026-05')
  ) AS v(id, d, m)
  WHERE c.id = v.id;
  ```

---

## Bug Fixes & Feature Additions (2026-05-28) — commit `c90ea3c`

All changes developed on staging (`/root/ats-staging/`) and deployed to production via rsync + build.

---

### 1. Application Date Display Format — DD-MMM-YYYY
**File:** `app/(app)/candidates/candidates-client.tsx`

Added `formatDateDisplay()` helper that converts `YYYY-MM-DD` → `DD-MMM-YYYY` (e.g. `28-May-2026`) for display only. Applied to the `displayVal` render path in the candidate table. All other uses of the raw date value (sort, filter, CSV export, edit, API) remain in `YYYY-MM-DD` so nothing breaks.

---

### 2. Dashboard Full Drillback to Candidates
**File:** `app/(app)/dashboard/page.tsx`

Every stat on the dashboard now navigates to `/candidates` with filters pre-applied:
- `getPeriodDates()` — converts the selected period (This Month / Last Month / This Quarter / This Year / All Time) to `date_from` / `date_to`
- `buildUrl(extras)` — assembles the full query string: `date_from`, `date_to`, `hr_id`, `site_id`, `designation_id`, `owner`, plus any stage/status extras
- `rowUrl(row)` — per-recruiter-table-row URL with `hr_id` scoped

**KPI cards:** Joinings → `pipeline_stage=joined`, Offered → `pipeline_stage=appointed`, Tel Int Done → `pipeline_stage=tel_int_done`
**Funnel bars:** each stage → `pipeline_stage=<stage_key>`
**Recruiter table cells:** each stage column → `pipeline_stage=<stage_key>` + `hr_id=<recruiter>`
**GF Sent column** added to recruiter performance table with same drillback.
**"Active Candidates"** label renamed to **"All Candidates"**.

---

### 3. Pipeline Stage Filter in Candidates API
**File:** `app/api/candidates/route.ts`

Added `pipeline_stage` query param that filters on `vPipelineFunnel` integer flag columns (not `final_status`):

```
tel_int_done → vPipelineFunnel.telIntDone = 1
gf_sent      → vPipelineFunnel.gfSent = 1
shortlisted_hr / pi_done / shortlisted_mgmt / appointed / joined
```

This was the root cause of all drillback showing 0 results — the view uses binary flag columns, not text status values.

---

### 4. Recruiter Owner Default
**File:** `app/(app)/candidates/page.tsx`

`initialOwner` logic: if URL param `owner=mine|all` → use it; else if role is `recruiter` → `mine`; else → `all`. Recruiters clicking the Candidates tab from the sidebar now land on their own candidates by default.

---

### 5. My Activity Tab — Full Drizzle Rewrite (Fixed All-Zeros Bug)
**File:** `app/api/my-activity/route.ts`

Root cause: the route was hitting Supabase (empty remote DB) instead of local PostgreSQL. Completely rewritten with Drizzle ORM. All 5 queries now hit local PG:
- Pending follow-ups count (always current / not date-filtered — labelled "(Now)" in UI)
- Joinings KPI (filtered by `doj_actual` within selected period)
- Joinings table (all-time)
- Tel interviews done (date-filtered)
- Scheduled interviews (upcoming)

**File:** `app/(app)/my-activity/page.tsx` — KPI cards made clickable, candidate rows navigate to `/candidates?open=<id>&owner=mine`.

---

### 6. Form Auto-Populate Safety Fix — Fill-Only, Never Overwrite
**File:** `app/api/form-responses/route.ts`

**Bug:** When a form with `maps_to` fields was submitted via a candidate-specific URL (`?c=<candidateId>`), the auto-populate logic unconditionally overwrote existing candidate fields (name, email, mobile, etc.) with whatever the form submitter typed.

**Example:** Dipika Chauhan's record (`90ec5e95`) was overwritten with Anish Deo's form data — name, email, and mobile were replaced.

**Fix:** Before updating, fetch the existing candidate record. Only write a field if its current value is `null`, `undefined`, or `""`. Existing data is never overwritten.

```ts
// Before (dangerous):
await db.update(candidates).set(candidateUpdate).where(eq(candidates.id, candidate_id));

// After (safe — fill only empty fields):
const [existing] = await db.select().from(candidates).where(eq(candidates.id, candidate_id)).limit(1);
const safeUpdate: Record<string, unknown> = {};
for (const [camel, value] of Object.entries(candidateUpdate)) {
  const cur = (existing as Record<string, unknown>)?.[camel];
  if (cur === null || cur === undefined || cur === "") safeUpdate[camel] = value;
}
if (Object.keys(safeUpdate).length > 0)
  await db.update(candidates).set(safeUpdate).where(eq(candidates.id, candidate_id));
```

This fix covers ALL forms (Candidate Data Form, Standard Application Form, Interview Preparation Form, Finance / Accounts Manager Form, and any future forms).

**Data recovery:** Dipika Chauhan's record was restored from `activity_log.old_data` snapshot — name, email, mobile, location, salary, source all reverted exactly.

---

### 7. Recruiter Notification on Form Submission
**File:** `app/api/form-responses/route.ts`, `app/(app)/notifications/page.tsx`

When any form is submitted with a `?c=<candidateId>` link, the assigned recruiter (`candidates.hr_id`) receives a notification:

- **Type:** `form_submitted`
- **Title:** `<Candidate Name> filled a form`
- **Body:** `<Candidate Name> has just submitted the "<Form Name>"`
- **Icon:** orange 📋 in the notifications tab
- **Click action:** opens directly to that candidate's sidebar

Fires for ALL active forms. Does not fire if form is submitted without `?c=` (no candidate linked = no recruiter to notify).

---

### 8. Finance / Accounts Manager Form Created
Created via direct DB insert (`forms` table). 20 fields covering:
- Full Name, Email, Phone → mapped to candidate `name`, `email`, `mobile`
- Current Location → mapped to `current_location`
- Education Qualification, Years of Experience
- Current/Last Designation → mapped to `current_designation`
- 9 Yes/No skill questions: Internal Audit, GST, TDS, ITR, Corporate Tax, Reconciliation, Budgeting & Costing, Finalization of Accounts, Wealth/Investment Management
- Investment instruments (Equity / Mutual Funds / Bonds / Others)
- Current CTC → mapped to `present_salary`
- Expected CTC → mapped to `expected_salary`
- Notice Period

Form ID: `590c4689-f981-420c-bee6-aeb520294b25`. Share link per candidate: `/f/590c4689-f981-420c-bee6-aeb520294b25?c=<candidateId>` (copy from the candidate's Forms tab sidebar).

---

**END OF GUIDE.** For raw historical detail (every command run, every error caught), see the original `Server Creds.txt` section 14 journal.

---

## Daily Recruiter Report — Email Automation (2026-06-08)

Automated end-of-day email report sent every day at **7:30 PM IST** via cron.

### What it does

Queries local Postgres and sends both an **HTML email** to `anishdeo75@gmail.com` and a **Telegram message** to Anish's personal chat showing:
- **Per recruiter → per job → pipeline breakdown** for candidates imported **that day**
- Pipeline stages mirror the dashboard funnel: CVs Received → Tel Int Done → GF Sent → Shortlisted HR → PI Done → Mgmt Select → Offered → Joined
- Each stage shows count + % conversion from CVs
- If no recruiter imported anything that day → sends a "No Imports Today" email instead

### Files

| File | Purpose |
|---|---|
| `/var/www/ats/reports/daily-report.mjs` | Main report script — lives on LIVE only (not in staging repo) |
| `/var/log/ats-daily-report.log` | Cron output log — every run appended here |

### Credentials added to `/var/www/ats/.env.local` (live only)

```
GMAIL_USER=mis1.hirerabbits@gmail.com
GMAIL_APP_PASSWORD=<16-char app password>
TELEGRAM_BOT_TOKEN=<bot token from @BotFather>
TELEGRAM_CHAT_ID=6644863302
```

Sent FROM `mis1.hirerabbits@gmail.com` via Gmail SMTP using a Gmail App Password (Google Account → Security → App Passwords → "ATS Reports").

Telegram bot created via @BotFather. Chat ID is Anish's personal Telegram user ID. To get updates the recipient must have sent `/start` to the bot at least once.

### Cron entry (root crontab on VPS)

```
0 14 * * * /usr/bin/node /var/www/ats/reports/daily-report.mjs >> /var/log/ats-daily-report.log 2>&1
```

14:00 UTC = 19:30 IST. View with `crontab -l`.

### How to manually trigger / test

```bash
cd /var/www/ats
node reports/daily-report.mjs
```

### View logs

```bash
tail -50 /var/log/ats-daily-report.log
```

### Recruiter scope

Report covers these three recruiter accounts (hard-coded in the script):
- `recruitment@hirerabbits.in` (Laiba)
- `hrho4@hirerabbits.in` (Kashish)
- `careers@hirerabbits.in` (Jay Rathod)

To add/remove recruiters edit the `RECRUITER_EMAILS` array at the top of `daily-report.mjs`.

### How candidates are matched to jobs

Candidates have no direct `job_id` set — they link to jobs via `candidates.designation_id = jobs.designation_id`. Candidates imported today whose designation doesn't match any of the recruiter's assigned jobs appear under an **"Other / Unassigned"** row.

### Dependencies

- `nodemailer` — installed in `/var/www/ats/node_modules/nodemailer` (`npm install nodemailer` was run on 2026-06-08)
- `postgres` (postgres.js) — already present from Phase 2C
- No build step needed — plain `.mjs`, runs directly with `node`

> **Note:** `daily-report.mjs` is NOT in the git repo / staging workspace. It lives directly at `/var/www/ats/reports/` on the VPS. If you ever rsync staging → live (§9.9 deploy), the `--exclude` list does not cover `/reports/` — but since the file doesn't exist in staging it won't be overwritten. After a deploy, verify the script is still present: `ls /var/www/ats/reports/daily-report.mjs`.

---

## Flash Fixes

Small, targeted fixes applied quickly (audit → implement same session). No new features — zero breaking changes.

---

### Candidates Page — Performance (2026-06-17)

**Problem:** Every filter change fetched all 2000+ candidates (86 columns each) = ~3–5 MB JSON payload + 2000 DOM rows rendered at once → slow load, laggy typing.

**Root causes (audited):**
- `limit: "2000"` hardcoded in client — fetched entire dataset on every keystroke
- No index on `application_date` or `candidates.name` — full seq scans for date filters and name searches
- All rows rendered into DOM at once (no virtualisation)

**What was changed:**

| File | Change |
|---|---|
| `app/(app)/candidates/candidates-client.tsx` | Default fetch reduced from 2000 → **200 rows**. "Load 200 more" button appends next page. Filter bar now shows `X shown · Y loaded of Z total`. |
| `app/api/candidates/route.ts` | Added raw `offset` query param support (in addition to `page`-based) so the client can pass `candidates.length` directly as offset. |
| **DB** (live, no migration needed) | `CREATE INDEX CONCURRENTLY idx_candidates_application_date ON candidates(application_date DESC) WHERE is_deleted = false` |
| **DB** (live, no migration needed) | `CREATE INDEX CONCURRENTLY idx_candidates_name_trgm ON candidates USING gin(name gin_trgm_ops)` |

**Result:**
- Initial load: ~200 rows × 86 cols instead of 2000 — ~10× less data per request
- Date-range queries use the new partial index (index-only scan, no seq scan)
- Name search (`ILIKE '%xyz%'`) uses the GIN trigram index — instant instead of full table scan

**Notes:**
- Client-side filters (`Mine`, `Live`, `Offered`, `Joined`, column filters) apply only to loaded rows. Use "Load More" to load additional pages before filtering if needed.
- The two DB indexes were created `CONCURRENTLY` — no table lock, no downtime.
- Both indexes exist on **staging DB only**. Must re-run the two `CREATE INDEX` commands on production DB after deploy.

---

## Duplicate Detection — Full Policy & Implementation (2026-06-18)

### Policy (business rules)

| Scenario | What happens |
|---|---|
| Same phone, same designation | Duplicate — blocked on manual add; merged on import |
| Same phone, different designation | Different job application — allowed, new record inserted |
| No phone match | Always a new insert |
| Duplicate found on manual add | 409 error with existing candidate info; option to add self as co-sourcer instead |
| Duplicate found on import | Existing record **merged** — only empty/null fields filled from import row; nothing already populated is overwritten |

### Mobile normalisation (added 2026-06-18)

All mobile numbers are normalised to plain digits before storing **and** before any duplicate comparison. Single function `normalizeMobile()` in `lib/utils.ts` used everywhere:

- Strips all non-digit characters (spaces, dashes, `+`, brackets)
- Strips leading `91` if result is 12 digits (country code)
- Strips leading `0` if result is 11 digits
- Returns `""` (treated as no mobile) if result is under 7 digits

So `+91 7383586297`, `91 7383586297`, `7383 586297`, `7383586297` all normalise to `7383586297` and correctly detect each other as duplicates.

**Before this fix:** import used `safeString().trim()` (no digit stripping) + `inArray` exact match, so any formatting difference between the Excel cell and the stored value silently bypassed the dup check and inserted a fresh row.

### Manual add flow (`POST /api/candidates`)

1. Client (`add-candidate-modal.tsx`) normalises the typed mobile to digits, fires a pre-check `GET /api/candidates?search=<digits>` on blur — shows a warning modal if any match found before the form is submitted.
2. Server normalises the mobile again in `mapCandidateBody` before storing.
3. Server runs dup check using `eq(candidates.mobile, norm)` exact match on normalised digits — returns 409 with `duplicate_id` if any non-deleted candidate has the same number.
4. Frontend 409 handler shows the duplicate modal with existing candidate details and an "Add as co-sourcer" button.

### Import flow (`POST /api/import`)

Duplicate key: **`mobile::designationId`**

| Key match | Result |
|---|---|
| Same normalised mobile + same designation | Merge (fill empty fields only) |
| Same normalised mobile + different designation | New insert — intentional, different job |
| No mobile | Fallback key: `name::designationId` |

**Merge behaviour:** loops every column in the imported row; skips if imported value is empty; skips if existing DB value is already populated. Only patches truly null/empty fields — never overwrites existing data.

**Insert behaviour:** batch-inserted in chunks of 200. If a chunk fails, falls back to per-row inserts so good rows still land and only bad ones go into `errors[]` in the response.

### Known accepted gap

Post-import edits are not duplicate-checked. If a recruiter imports a candidate for Job X (allowed — different designation from an existing record) and then manually edits the designation to match another existing record, the system does not block it. Accepted — blocking all designation edits would be too restrictive. The merge-on-import guard is the primary protection.

### Real case that triggered this audit: KANAN H. SHAH (2026-06-15)

- **Laiba** added KANAN H. SHAH on 2026-06-06 → designation **Sr. Accountant** (`53ee3ec4`)
- **Kashish** imported KANAN H. SHAH on 2026-06-15 → designation **Accountant** (`fa2f3106`) at import time — correctly allowed as a different-job application
- Kashish then manually edited the designation to **Sr. Accountant** 10 minutes later — creating a de-facto duplicate. This falls into the accepted gap above.
- Confirmed from `activity_log`: INSERT had `designation_id = fa2f3106` (Accountant), first UPDATE at 18:23 changed it to `53ee3ec4` (Sr. Accountant).

### Files

| File | Role |
|---|---|
| `lib/utils.ts` | `normalizeMobile()` — single source of truth for normalisation |
| `app/api/candidates/route.ts` | Manual add: normalise on store + server-side dup check |
| `app/api/import/route.ts` | Import: normalise mobile in record build; `mobile::designationId` key; merge logic |
| `components/add-candidate-modal.tsx` | Client pre-check on blur; 409 handler shows dup modal + co-sourcer option |

---

## 18. Mac Mini Migration Guide

Moving the ATS from Hostinger VPS to a Mac mini. The Mac mini runs the app permanently (always on), with Cloudflare Tunnel for team access and ngrok for SSH access from anywhere.

**What replaces what:**

| Hostinger VPS | Mac Mini |
|---|---|
| `ssh root@91.108.110.236` | `ssh -p <ngrok-port> <username>@0.tcp.in.ngrok.io` |
| `/var/www/ats/` | `~/ats/` |
| nginx + Let's Encrypt | Cloudflare Tunnel (HTTPS handled for you) |
| Hostinger public IP | Cloudflare domain |
| `systemctl` | `brew services` / `launchctl` |
| `sudo -u postgres psql` | `psql postgres` |
| root user | your macOS username (e.g. `admin`) |

> **Database import:** covered separately — do the full app setup first, then restore the DB dump.

---

### 18.1 Enable SSH on Mac Mini

Sit in front of the Mac mini once for this step.

1. Apple menu → **System Settings** → **General** → **Sharing**
2. Turn on **Remote Login**
3. Note your macOS username shown there (e.g. `admin`)
4. Find local IP: System Settings → Wi-Fi → Details → **IP Address** (e.g. `192.168.1.50`)

Test from another machine on the same network:
```bash
ssh admin@192.168.1.50
```

---

### 18.2 Install Dependencies

SSH in (or open Terminal on the Mac mini directly).

#### Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the instructions it prints to add brew to PATH, then reload:
```bash
source ~/.zshrc
```

#### Node.js 20
```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version   # v20.x.x
npm --version
```

#### PostgreSQL 17
```bash
brew install postgresql@17
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Start PostgreSQL now and on every boot
brew services start postgresql@17

psql --version   # PostgreSQL 17.x
```

#### PM2
```bash
npm install -g pm2
pm2 --version
```

---

### 18.3 Set Up GitHub SSH Key (for cloning the repo)

```bash
# Generate deploy key
ssh-keygen -t ed25519 -C "macmini-ats" -f ~/.ssh/id_ed25519
# Press Enter twice for no passphrase

# Show the public key
cat ~/.ssh/id_ed25519.pub
```

Copy that output, then add it to GitHub:
1. Go to https://github.com/ATSDashboard/ATSDashboard/settings/keys
2. Click **Add deploy key**
3. Title: `Mac Mini`
4. Paste the key → **Add key**

Test:
```bash
ssh -T git@github.com
# "Hi ATSDashboard! You've successfully authenticated..."
```

---

### 18.4 Clone the App

```bash
mkdir -p ~/ats
cd ~/ats
git clone git@github.com:ATSDashboard/ATSDashboard.git .
ls   # should see app/ lib/ package.json etc.
```

---

### 18.5 Set Up the Database

```bash
# Connect to the default postgres database
psql postgres
```

Inside psql run:
```sql
CREATE USER ats_app WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE ats OWNER ats_app;
GRANT ALL PRIVILEGES ON DATABASE ats TO ats_app;
\q
```

Save the password somewhere safe — you'll need it in `.env.local` next.

> **Database data import** (restoring the dump from Hostinger) is a separate step — do that after the app is running. See §18.9.

---

### 18.6 Create .env.local

```bash
nano ~/ats/.env.local
```

Paste (fill in your values):
```env
DATABASE_URL=postgres://ats_app:choose-a-strong-password@127.0.0.1:5432/ats
AUTH_SECRET=2Pe4dZpX/UpxQITD5Ub24RER7cfMF9qTWI5j0QwjN7Q=
AUTH_URL=https://your-cloudflare-domain.com
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_URL=https://your-cloudflare-domain.com

NEXT_PUBLIC_SUPABASE_URL=https://lbolfapdgwfquypuzhgl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

GMAIL_USER=mis1.hirerabbits@gmail.com
GMAIL_APP_PASSWORD=<16-char app password>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=6644863302
```

> Leave `AUTH_URL` and `NEXT_PUBLIC_APP_URL` as placeholders for now. Fill them in after §18.7 (Cloudflare) gives you the real URL. The Supabase keys are in the current `.env.local` on Hostinger at `/var/www/ats/.env.local`.

---

### 18.7 Build and Start with PM2

Install dependencies and build:
```bash
cd ~/ats
npm ci
NODE_OPTIONS="--max-old-space-size=3500" npm run build
```

Build takes 10–20 min. After it finishes:
```bash
# Verify build completed
test -f .next/BUILD_ID && echo "BUILD OK" || echo "BUILD INCOMPLETE"
```

Start with PM2:
```bash
pm2 start npm --name ats -- start
pm2 status   # should show "ats" → online
```

Test locally:
```bash
curl http://localhost:3000
# Should get a redirect to /login
```

#### PM2 auto-start on Mac boot

```bash
pm2 startup
```

It prints a command like:
```bash
sudo env PATH=$PATH:/opt/homebrew/bin pm2 startup launchd -u admin --hp /Users/admin
```

**Copy and run that exact command it gives you**, then save the process list:
```bash
pm2 save
```

Now the app auto-starts every time the Mac mini boots.

---

### 18.8 Cloudflare Tunnel (Team Access — Replaces nginx + Let's Encrypt)

This gives your team a stable HTTPS URL to access the ATS from anywhere — no port-forwarding, no IP address, free.

#### Install cloudflared
```bash
brew install cloudflared
```

#### Option A — Quick test (no account, URL changes on restart)
```bash
cloudflared tunnel --url http://localhost:3000
```
Prints a `https://random.trycloudflare.com` URL. Good for testing, not for the team.

#### Option B — Permanent URL with your own domain (recommended)

1. Create a free account at https://cloudflare.com
2. Add your domain (transfer DNS to Cloudflare, or buy a cheap `.in` domain there)
3. On the Mac mini:

```bash
# Authenticate
cloudflared tunnel login
# Opens browser — log in to Cloudflare, select your domain

# Create the tunnel
cloudflared tunnel create ats-tunnel
# Note the tunnel ID: e.g. abc123-def456-...
```

Create the config file:
```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Paste (replace tunnel ID and domain):
```yaml
tunnel: abc123-def456-...
credentials-file: /Users/admin/.cloudflared/abc123-def456-....json

ingress:
  - hostname: ats.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Add the DNS record (run once):
```bash
cloudflared tunnel route dns ats-tunnel ats.yourdomain.com
```

Test the tunnel:
```bash
cloudflared tunnel run ats-tunnel
# Open https://ats.yourdomain.com in browser — should hit the app
```

Auto-start on boot:
```bash
sudo cloudflared service install
sudo launchctl start com.cloudflare.cloudflared
```

#### Update .env.local with the real URL

Now that you have the Cloudflare URL:
```bash
nano ~/ats/.env.local
# Update:
# AUTH_URL=https://ats.yourdomain.com
# NEXT_PUBLIC_APP_URL=https://ats.yourdomain.com
```

Rebuild and restart:
```bash
cd ~/ats
NODE_OPTIONS="--max-old-space-size=3500" npm run build
pm2 restart ats
```

---

### 18.9 ngrok TCP — SSH Access from Anywhere

So you can SSH into the Mac mini from anywhere to edit code, deploy changes, restart PM2, etc. — same workflow as `ssh root@91.108.110.236`.

```bash
brew install ngrok

# Add your auth token from https://dashboard.ngrok.com
ngrok config add-authtoken YOUR_NGROK_TOKEN
```

Start the SSH tunnel:
```bash
ngrok tcp 22
```

Output:
```
Forwarding  tcp://0.tcp.in.ngrok.io:15432 -> localhost:22
```

SSH from anywhere:
```bash
ssh -p 15432 admin@0.tcp.in.ngrok.io
```

#### Auto-start ngrok on boot

```bash
nano ~/Library/LaunchAgents/com.ngrok.ssh.plist
```

Paste:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ngrok.ssh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/ngrok</string>
    <string>tcp</string>
    <string>22</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/ngrok-ssh.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ngrok-ssh-error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.ngrok.ssh.plist
```

After a reboot, check the ngrok URL:
```bash
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"'
```

---

### 18.10 Database Import from Hostinger (do this after app is running)

Once the app is up and you're ready to bring over the real data:

**Step 1 — Export from Hostinger:**
```bash
ssh root@91.108.110.236
sudo -u postgres pg_dump -Fc -d ats > /root/ats-macmini-dump.dump
```

**Step 2 — Copy dump to Mac mini:**
```bash
# Run this on the Mac mini
scp root@91.108.110.236:/root/ats-macmini-dump.dump ~/ats-macmini-dump.dump
```

**Step 3 — Restore on Mac mini:**
```bash
pg_restore --no-owner --no-privileges -d ats ~/ats-macmini-dump.dump

# Re-grant permissions (pg_restore strips them)
psql ats -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ats_app;"
psql ats -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO ats_app;"
psql ats -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ats_app;"
psql ats -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO ats_app;"
psql ats -c "GRANT USAGE ON SCHEMA auth TO ats_app;"
psql ats -c "GRANT USAGE ON SCHEMA public TO ats_app;"
```

**Step 4 — Verify:**
```bash
psql ats -c "SELECT count(*) FROM public.candidates;"
psql ats -c "SELECT email FROM auth.users;"
```

**Step 5 — Restart app:**
```bash
pm2 restart ats
```

---

### 18.11 Final Checklist

Run these after full setup to confirm everything works:

```bash
# App running
pm2 status                          # ats → online

# Database connected
psql ats -c "SELECT count(*) FROM public.candidates;"

# App responding locally
curl http://localhost:3000           # redirects to /login

# Cloudflare tunnel active
sudo launchctl list | grep cloudflare

# ngrok SSH tunnel active
curl -s http://localhost:4040/api/tunnels | grep public_url
```

Then open `https://ats.yourdomain.com` in a browser and log in.

#### What happens on Mac mini reboot (everything should auto-restart)

| Service | Auto-start mechanism |
|---|---|
| PostgreSQL | `brew services` (launchd) |
| ATS app (PM2) | `pm2 startup` → launchd |
| Cloudflare Tunnel | `cloudflared service install` → launchd |
| ngrok SSH | `~/Library/LaunchAgents/com.ngrok.ssh.plist` → launchd |

---

### 18.12 Common Operations on Mac Mini

These are the Mac equivalents of Hostinger commands you already know.

```bash
# SSH in from anywhere
ssh -p <ngrok-port> admin@0.tcp.in.ngrok.io

# App logs
pm2 logs ats
pm2 logs ats --lines 100

# Restart app
pm2 restart ats

# Deploy a code change (same as §9.9 but paths differ)
cd ~/ats
git pull
npm ci                                           # only if package.json changed
NODE_OPTIONS="--max-old-space-size=3500" npm run build
pm2 restart ats

# Database
psql ats                                         # connect as your user
psql postgres -c "SELECT count(*) FROM ats.public.candidates;"

# Check PostgreSQL
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql@17

# View ngrok tunnel URL after reboot
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"'
```

---

## Mobile Normalization & Duplicate Detection Fix (2026-06-25)

### What changed

All mobile numbers are now **normalized to 10 digits** before storage and duplicate checks. Strips leading country codes (`+91`, `91`, `0`).

| Touch point | File | Change |
|---|---|---|
| Utility | `lib/utils.ts` | New `normalizeMobile()` — strips non-digits, removes 91/0 prefix, rejects < 7 digits |
| Manual add | `app/api/candidates/route.ts` | Uses `normalizeMobile()` before insert; duplicate check now uses exact match (`eq`) instead of `ilike` |
| Bulk import | `app/api/import/route.ts` | `normalizeMobile()` applied to every mobile field during import |
| Add candidate modal | `components/add-candidate-modal.tsx` | Client-side duplicate check normalizes before searching |

### Before / After

| Input | Before (stored as-is) | After (normalized) |
|---|---|---|
| `+91 98765 43210` | `+91 98765 43210` | `9876543210` |
| `091-98765-43210` | `091-98765-43210` | `9876543210` |
| `919876543210` | `919876543210` | `9876543210` |
| `9876543210` | `9876543210` | `9876543210` |

---

## Job Creation Request Workflow (2026-06-26)

### Overview

HR Managers and HODs can now **request** a new job opening rather than creating one directly. Admins review and approve/reject from the notifications panel.

### Who can do what

| Role | Can do |
|---|---|
| `admin` | Direct "+ New Job" (unchanged) + approve/reject requests |
| `hr_manager` | "Request Job" only |
| `hod` | "Request Job" only |
| `recruiter` | Neither — no job creation access |

### Flow

1. HR Manager / HOD clicks **Request Job** → fills full job form → picks one or more admins via checkbox picker → optional note → **Send Request**
2. Each selected admin gets a `job_requested` notification (amber 📝 icon)
3. Admin opens notifications → clicks the notification → inline panel expands showing full job details
4. Admin clicks **Approve & Create Job** → job is inserted into `jobs` table, assigned recruiters get `job_assigned` notification (blue 💼), requester gets `job_request_approved` notification
5. Or admin clicks **Reject** → enters optional reason → requester gets `job_request_rejected` notification
6. Pending requests appear as amber "Awaiting Approval" cards above the jobs tabs on the requester's jobs page

### DB Migration

Run on **both staging and production**:

```sql
CREATE TABLE IF NOT EXISTS job_creation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id),
  to_user_id UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  job_type TEXT DEFAULT 'internal',
  designation_id UUID,
  site_id UUID,
  headcount INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'normal',
  min_salary NUMERIC,
  max_salary NUMERIC,
  opened_at DATE,
  target_doj DATE,
  client_name TEXT,
  placement_fee_pct NUMERIC,
  description TEXT,
  recruiter_ids TEXT[],
  note TEXT,
  status TEXT DEFAULT 'pending' NOT NULL,  -- pending | approved | rejected
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  job_id UUID REFERENCES jobs(id),         -- set on approval
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS job_request_id UUID
    REFERENCES job_creation_requests(id) ON DELETE CASCADE;

GRANT ALL ON job_creation_requests TO ats_app;
```

✅ Already applied to both staging and production DB as of 2026-06-26.

### New files

| File | Purpose |
|---|---|
| `app/api/job-requests/route.ts` | GET (list own/received requests) + POST (create request + notify admins) |
| `app/api/job-requests/[id]/route.ts` | PATCH approve (creates job + notifies) or reject (notifies) |
| `app/api/users/admins/route.ts` | GET list of admins — accessible to all authenticated roles for the picker |

### Modified files

| File | Change |
|---|---|
| `lib/db/schema.ts` | Added `jobCreationRequests` table + `jobRequestId` FK on `notifications` |
| `app/(app)/jobs/page.tsx` | Role-gated button, Request Job modal with admin multi-picker, pending cards |
| `app/(app)/notifications/page.tsx` | `job_requested` inline approve/reject panel; new notification type icons |

### Notification types added

| Type | Recipient | Icon | Colour |
|---|---|---|---|
| `job_requested` | Admin(s) | 📝 | Amber |
| `job_request_approved` | Requester | ✓ | Green |
| `job_request_rejected` | Requester | ✗ | Red |
| `job_assigned` | Recruiter(s) assigned in request | 💼 | Blue |

---

## Production Fix — AUTH_URL drift (2026-06-26)

`/var/www/ats/.env.local` had `AUTH_URL` pointing to the old staging URL (`http://91.108.110.236:3001`) causing all auth redirects to break after deploying today's build.

**Fix:**
```bash
sed -i 's|AUTH_URL=http://91.108.110.236:3001|AUTH_URL=https://srv1642268.hstgr.cloud|' /var/www/ats/.env.local
pm2 restart ats --update-env
```

**Note:** After every deploy that touches `.env.local`, always run `pm2 restart ats --update-env` (not just `pm2 restart ats`) so the new env vars are picked up.
