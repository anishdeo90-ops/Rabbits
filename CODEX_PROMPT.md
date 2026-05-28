# HireRabbits ATS — Codex Build Prompt

## PROJECT OVERVIEW

Build **HireRabbits ATS** — a full Applicant Tracking System for recruitment teams.

**Stack:** Next.js 14 (App Router) · Supabase (Postgres + Auth + Storage) · TypeScript · TailwindCSS · shadcn/ui · Anthropic Claude SDK

**Live URL pattern:** `http://localhost:3000`  
**Auth:** Supabase email/password auth. All app routes under `/(app)/` require a session. Middleware at `middleware.ts` redirects unauthenticated users to `/login`.

---

## PHASE 1 — DATABASE SCHEMA CHANGES

Run the following as a new migration file: `supabase/migrations/20260506120000_resume_keywords.sql`

```sql
-- ── Resume keyword intelligence ───────────────────────────────────────────────

-- 1. Add parsed_keywords JSONB column to candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS parsed_keywords JSONB DEFAULT '{}';

-- Structure of parsed_keywords:
-- {
--   "skills": ["Python", "React", "SQL"],          -- tech/soft skills array
--   "years_experience": 4,                          -- total years (integer)
--   "education": "B.Tech Computer Science",         -- highest qualification
--   "current_role": "Senior Software Engineer",     -- current/last job title
--   "industries": ["FinTech", "SaaS"],              -- industry domains
--   "tools": ["Docker", "AWS", "Git"],              -- tools/platforms
--   "certifications": ["AWS Solutions Architect"],  -- certs
--   "languages": ["English", "Hindi"],              -- spoken languages
--   "summary_tags": ["Python 4yr", "React 2yr", "Team Lead"] -- human-readable tags
-- }

-- 2. GIN index for fast JSONB keyword search
CREATE INDEX IF NOT EXISTS idx_candidates_parsed_keywords
  ON candidates USING GIN (parsed_keywords);

-- Full-text index on summary_tags for text search
CREATE INDEX IF NOT EXISTS idx_candidates_keywords_fts
  ON candidates USING GIN (to_tsvector('english', coalesce(parsed_keywords->>'summary_tags', '')));

-- 3. Job-fit scores table (one score per candidate per job)
CREATE TABLE IF NOT EXISTS candidate_job_scores (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  fit_score       SMALLINT NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  fit_breakdown   JSONB DEFAULT '{}',
  -- breakdown structure:
  -- { "skills_match": 85, "experience_match": 90, "education_match": 70,
  --   "matched_skills": ["Python","SQL"], "missing_skills": ["Go"],
  --   "ai_reasoning": "Strong Python background but lacks Go experience." }
  scored_at       TIMESTAMPTZ DEFAULT NOW(),
  scored_by_model TEXT,
  UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_cjs_job_id ON candidate_job_scores (job_id, fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_cjs_candidate_id ON candidate_job_scores (candidate_id);

ALTER TABLE candidate_job_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cjs_select_auth" ON candidate_job_scores
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cjs_write_admin" ON candidate_job_scores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('admin','hr_manager','recruiter'))
  );

-- 4. Update v_pipeline_funnel to include parsed_keywords and summary tags
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
  c.ai_summary,
  c.cv_drive_url,
  c.notice_period_days,
  c.staffingo_emp_id,
  c.is_deleted,
  c.portal_token,
  c.created_at,
  c.updated_at,
  c.parsed_keywords,
  -- Expose top-level keyword fields as dedicated columns for easy filtering
  (c.parsed_keywords->>'years_experience')::INTEGER AS kw_years_experience,
  c.parsed_keywords->'skills'                        AS kw_skills,
  c.parsed_keywords->'summary_tags'                  AS kw_summary_tags,
  p.name           AS hr_name,
  p.id             AS hr_id,
  ms.name          AS site_name,
  ms.id            AS site_id,
  md.name          AS designation_name,
  md.id            AS designation_id,
  msrc.name        AS source_name,
  msrc.id          AS source_id,
  (SELECT STRING_AGG(pr.name, ', ')
   FROM co_sourcers cs2 JOIN profiles pr ON pr.id = cs2.recruiter_id
   WHERE cs2.candidate_id = c.id AND cs2.role = 'co_sourcer') AS co_sourcer_names,
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
```

---

## PHASE 2 — BACKEND API CHANGES

### 2A. Update `/app/api/parse-resume/route.ts`

The current parser extracts basic fields. Update it to also extract `parsed_keywords` and optionally score the candidate against a job.

**New request shape:**
```typescript
// FormData fields:
// file         — File (PDF/Word/text) — required
// job_id       — string (UUID) — optional; if provided, score candidate against this job
// candidate_id — string (UUID) — optional; if provided, save keywords back to DB
```

**Updated Claude prompt — add to the existing extraction prompt:**

```
Also extract a second JSON block under the key "keywords" with this structure:
{
  "skills": ["Python", "React", "SQL"],
  "years_experience": 4,
  "education": "B.Tech Computer Science",
  "current_role": "Senior Software Engineer",
  "industries": ["FinTech", "SaaS"],
  "tools": ["Docker", "AWS", "Git"],
  "certifications": ["AWS Solutions Architect"],
  "languages": ["English", "Hindi"],
  "summary_tags": ["Python 4yr", "React 2yr", "Team Lead", "FinTech", "B.Tech"]
}

Rules for keywords:
- summary_tags should be concise human-readable labels max 5 words each
- Include "{skill} {N}yr" tags where N = estimated years with that skill
- years_experience = total professional experience in years (integer)
- skills = programming languages, frameworks, methodologies (deduplicated, title-cased)
- tools = platforms, software, cloud services (deduplicated)
```

**If `job_id` is provided**, make a second Claude call to score the candidate:

```
You are a technical recruiter. Given a candidate's keyword profile and a job description, 
score the candidate's fit from 0 to 100.

Candidate profile:
{parsed_keywords JSON}

Job requirements:
{job.requirements}
{job.description}

Return ONLY a JSON object:
{
  "fit_score": 82,
  "skills_match": 85,
  "experience_match": 90,
  "education_match": 70,
  "matched_skills": ["Python", "SQL"],
  "missing_skills": ["Go", "Kubernetes"],
  "ai_reasoning": "Strong Python background with 4 years experience. Meets experience requirement. Missing Go and Kubernetes which are listed as preferred."
}
```

**Response shape from the API (no candidate_id):**
```json
{
  "data": {
    "name": "...", "email": "...", "mobile": "...",
    "current_designation": "...", "current_location": "...",
    "present_salary": 500000, "expected_salary": 700000,
    "notice_period_days": 30, "ai_summary": "...",
    "parsed_keywords": { ... }
  },
  "job_fit": {
    "fit_score": 82,
    "skills_match": 85,
    "experience_match": 90,
    "education_match": 70,
    "matched_skills": ["Python", "SQL"],
    "missing_skills": ["Go"],
    "ai_reasoning": "..."
  },
  "source": "org"
}
```

**If `candidate_id` is provided** (resume re-parse for an existing candidate), also:
1. `PATCH /candidates/{candidate_id}` — save `parsed_keywords` to DB
2. If `job_id` also provided — upsert into `candidate_job_scores`

Full updated `route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAIConfig } from "@/lib/ai-client";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file        = formData.get("file")         as File | null;
  const jobId       = formData.get("job_id")       as string | null;
  const candidateId = formData.get("candidate_id") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/pdf";
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(mimeType))
    return NextResponse.json({ error: "Only PDF, Word, or text files are supported" }, { status: 400 });

  const aiConfig = await resolveAIConfig(user.id);
  if (!aiConfig)
    return NextResponse.json({
      error: "No AI provider connected. Go to Settings → AI to connect Claude or ChatGPT.",
    }, { status: 503 });

  if (aiConfig.provider !== "anthropic")
    return NextResponse.json({
      error: "Resume parsing currently requires Claude (Anthropic). Connect a Claude key in Settings → AI.",
    }, { status: 503 });

  try {
    const bytes   = await file.arrayBuffer();
    const base64  = Buffer.from(bytes).toString("base64");
    const client  = new Anthropic({ apiKey: aiConfig.api_key });

    const extractionPrompt = `You are a resume parser. Extract key details from this resume and return ONLY a valid JSON object with exactly two top-level keys: "profile" and "keywords".

{
  "profile": {
    "name": "Full name",
    "email": "email@example.com",
    "mobile": "10-digit mobile number",
    "current_designation": "Current job title",
    "current_location": "City, State",
    "present_salary": 500000,
    "expected_salary": 700000,
    "notice_period_days": 30,
    "naukri_profile_url": "LinkedIn or Naukri profile URL if present",
    "ai_summary": "2–3 sentence professional summary"
  },
  "keywords": {
    "skills": ["Python", "React", "SQL"],
    "years_experience": 4,
    "education": "B.Tech Computer Science",
    "current_role": "Senior Software Engineer",
    "industries": ["FinTech", "SaaS"],
    "tools": ["Docker", "AWS", "Git"],
    "certifications": ["AWS Solutions Architect"],
    "languages": ["English", "Hindi"],
    "summary_tags": ["Python 4yr", "React 2yr", "Team Lead", "FinTech", "B.Tech"]
  }
}

Rules:
- Omit any profile field you cannot find — do not invent data
- Salary must be annual in rupees (integer)
- notice_period_days: convert months to days (1 month = 30 days)
- years_experience = total professional experience in years (integer)
- summary_tags: concise human-readable labels, include "{skill} {N}yr" where applicable
- skills: programming languages, frameworks, methodologies (title-cased, deduplicated)
- tools: platforms, cloud services, software (title-cased, deduplicated)
- Return ONLY the JSON object. No markdown, no explanation.`;

    let content: Anthropic.MessageParam["content"];
    if (mimeType === "application/pdf") {
      content = [
        { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } },
        { type: "text" as const, text: extractionPrompt },
      ];
    } else {
      const text = Buffer.from(bytes).toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      content = [{ type: "text" as const, text: `Resume text:\n\n${text}\n\n${extractionPrompt}` }];
    }

    const message = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 2048,
      messages: [{ role: "user", content }],
    });

    const raw       = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse resume data" }, { status: 422 });

    const parsed       = JSON.parse(jsonMatch[0]);
    const profileRaw   = parsed.profile ?? {};
    const keywordsRaw  = parsed.keywords ?? {};

    const allowedProfileFields = [
      "name", "email", "mobile", "current_designation", "current_location",
      "present_salary", "expected_salary", "notice_period_days", "naukri_profile_url", "ai_summary",
    ];
    const safeProfile: Record<string, unknown> = {};
    for (const f of allowedProfileFields) {
      if (profileRaw[f] !== undefined && profileRaw[f] !== null && profileRaw[f] !== "") {
        safeProfile[f] = profileRaw[f];
      }
    }

    const safeKeywords: Record<string, unknown> = {};
    const allowedKwFields = ["skills","years_experience","education","current_role","industries","tools","certifications","languages","summary_tags"];
    for (const f of allowedKwFields) {
      if (keywordsRaw[f] !== undefined && keywordsRaw[f] !== null) safeKeywords[f] = keywordsRaw[f];
    }

    // Job-fit scoring (if job_id provided)
    let jobFit: Record<string, unknown> | null = null;
    if (jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("title, description, requirements")
        .eq("id", jobId)
        .single();

      if (job) {
        const scoringPrompt = `You are a technical recruiter. Score this candidate's fit for a job from 0–100.

Candidate keyword profile:
${JSON.stringify(safeKeywords, null, 2)}

Job title: ${job.title}
Job requirements:
${job.requirements ?? "Not specified"}
${job.description ?? ""}

Return ONLY a JSON object:
{
  "fit_score": 82,
  "skills_match": 85,
  "experience_match": 90,
  "education_match": 70,
  "matched_skills": ["Python", "SQL"],
  "missing_skills": ["Go", "Kubernetes"],
  "ai_reasoning": "One sentence explaining the score."
}`;

        const scoreMsg = await client.messages.create({
          model: aiConfig.model,
          max_tokens: 512,
          messages: [{ role: "user", content: scoringPrompt }],
        });

        const scoreRaw   = scoreMsg.content[0].type === "text" ? scoreMsg.content[0].text : "";
        const scoreMatch = scoreRaw.match(/\{[\s\S]*\}/);
        if (scoreMatch) {
          try { jobFit = JSON.parse(scoreMatch[0]); } catch { /* ignore */ }
        }
      }
    }

    // Persist keywords + score back to DB if candidate_id provided
    if (candidateId) {
      await supabase
        .from("candidates")
        .update({ parsed_keywords: safeKeywords })
        .eq("id", candidateId);

      if (jobId && jobFit && typeof jobFit.fit_score === "number") {
        await supabase
          .from("candidate_job_scores")
          .upsert({
            candidate_id:  candidateId,
            job_id:        jobId,
            fit_score:     jobFit.fit_score,
            fit_breakdown: jobFit,
            scored_by_model: aiConfig.model,
          }, { onConflict: "candidate_id,job_id" });
      }
    }

    return NextResponse.json({
      data:    { ...safeProfile, parsed_keywords: safeKeywords },
      job_fit: jobFit,
      source:  aiConfig.scope,
    });

  } catch (err) {
    console.error("Resume parse error:", err);
    return NextResponse.json({ error: "Failed to parse resume. Please try again." }, { status: 500 });
  }
}
```

---

### 2B. Update `/app/api/candidates/route.ts` — smart keyword search

Add a new query param `kw_search` to the GET handler. When present, it parses natural language like `"Python 4 years"` or `"React developer 2+ years"` and filters candidates whose `parsed_keywords` JSONB matches.

**Add this block BEFORE the existing `if (search)` block:**

```typescript
// Smart keyword search — parses queries like "Python 4 years", "React 2+ years", "team lead"
if (req.nextUrl.searchParams.get("kw_search")) {
  const kw = req.nextUrl.searchParams.get("kw_search")!.trim();

  // Extract year requirement if present: "4 years", "4+ years", "4yr", "4+yr"
  const yearMatch = kw.match(/(\d+)\s*\+?\s*(?:year|yr)/i);
  const minYears  = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Extract skill tokens (words not part of the year expression)
  const skillPart = kw
    .replace(/\d+\s*\+?\s*(?:year|yr)s?/gi, "")
    .replace(/\bin\b/gi, "")
    .trim();
  const skillTokens = skillPart
    .split(/[\s,]+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);

  // Build JSONB filter conditions
  // For each skill token: check if any element in skills[] or tools[] array ilike it
  for (const token of skillTokens) {
    query = query.or(
      `parsed_keywords->skills.cs.["${token}"],` +
      `parsed_keywords->tools.cs.["${token}"],` +
      `parsed_keywords->>summary_tags.ilike.%${token}%,` +
      `parsed_keywords->>current_role.ilike.%${token}%`
    );
  }

  // Year filter via Postgres expression — use raw filter on kw_years_experience
  if (minYears !== null) {
    query = query.gte("kw_years_experience", minYears);
  }
}
```

> **Note:** Because `v_pipeline_funnel` now exposes `kw_years_experience` as an integer column, `.gte("kw_years_experience", minYears)` works directly. The skills array containment check uses Supabase's `cs` (contains) operator on JSONB arrays.

---

### 2C. New endpoint `/app/api/candidates/[id]/keywords/route.ts`

Allows manually triggering keyword re-extraction for a candidate who already has a CV.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/candidates/:id/keywords
// Body: { parsed_keywords: {...} }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.parsed_keywords) return NextResponse.json({ error: "parsed_keywords required" }, { status: 400 });

  const { data, error } = await supabase
    .from("candidates")
    .update({ parsed_keywords: body.parsed_keywords })
    .eq("id", params.id)
    .select("id, parsed_keywords")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

---

### 2D. New endpoint `/app/api/jobs/[id]/ranked-candidates/route.ts`

Returns candidates linked to a job, sorted by `fit_score` descending (best fit first).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Join candidates → candidate_job_scores for this job, order by fit_score DESC
  const { data, error } = await supabase
    .from("candidate_job_scores")
    .select(`
      fit_score,
      fit_breakdown,
      scored_at,
      candidates (
        id, name, mobile, email, current_designation, current_location,
        present_salary, expected_salary, notice_period_days,
        ai_summary, parsed_keywords, cv_drive_url, final_status
      )
    `)
    .eq("job_id", params.id)
    .order("fit_score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
```

---

## PHASE 3 — FRONTEND CHANGES

### 3A. Candidate list — Smart Search Bar

**File:** `app/(app)/candidates/candidates-client.tsx`

Add a second search input specifically for keyword/skill search, separate from the existing name/mobile/email search.

**UI placement:** Directly below the existing search bar in the filter bar. Label it **"Skill Search"**.

**Component:**
```tsx
// SmartSearchInput — parses natural language like "Python 4 years"
// Shows a small hint below: 'Try "Python 4 years" or "React developer 2+ years"'

<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder='Skill search: "Python 4 years", "React developer"...'
    value={kwSearch}
    onChange={(e) => setKwSearch(e.target.value)}
    className="pl-9"
  />
  {kwSearch && (
    <button
      onClick={() => setKwSearch("")}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  )}
</div>
```

Pass `kw_search` to the `/api/candidates` query param when non-empty.

---

### 3B. Candidate cards / rows — show keyword tags

In both the **Sheet view** (table rows) and **Kanban cards**, display the candidate's `summary_tags` from `parsed_keywords` as small pill badges.

- Show max 4 tags in the row/card, then `+N more` badge
- Tags use a neutral grey background (`bg-muted text-muted-foreground`) 
- Tags containing a year number (e.g. "Python 4yr") get a blue accent (`bg-blue-50 text-blue-700`)

```tsx
// KeywordTags component
function KeywordTags({ tags, max = 4 }: { tags: string[]; max?: number }) {
  if (!tags?.length) return null;
  const visible = tags.slice(0, max);
  const rest    = tags.length - max;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {visible.map(tag => (
        <span
          key={tag}
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            /\d+yr/i.test(tag)
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {tag}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  );
}
```

---

### 3C. Resume upload — auto-parse keywords on CV upload

**File:** wherever the CV upload currently calls `POST /api/parse-resume`

After a successful parse, if `candidate_id` is known (editing existing candidate), call the keywords endpoint:
```typescript
// After parse success:
if (candidateId && data.data.parsed_keywords) {
  await fetch(`/api/candidates/${candidateId}/keywords`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parsed_keywords: data.data.parsed_keywords }),
  });
}
```

Also update the `add-candidate-modal.tsx` to pass `parsed_keywords` in the POST body when creating a new candidate after parsing:
```typescript
const candidatePayload = {
  ...parsedProfile,
  parsed_keywords: parsedData.parsed_keywords,
};
```

---

### 3D. Job detail — Ranked Candidates tab

**File:** `app/(app)/jobs/page.tsx` (or job detail panel)

When viewing a job, add a **"Ranked Candidates"** tab that calls `GET /api/jobs/:id/ranked-candidates`.

Display as a ranked list:
- Position badge (1st, 2nd, 3rd...) with color coding: gold / silver / bronze for top 3
- Fit score as a progress bar + percentage (e.g. `82%`)
- Matched skills as green pills, missing skills as red pills
- AI reasoning text in small grey italic
- Click → opens the candidate detail panel

```tsx
// FitScoreBar
function FitScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold w-10 text-right">{score}%</span>
    </div>
  );
}
```

---

### 3E. Candidate detail panel — Keywords section

In the candidate detail panel (right-side drawer), add a **"Skills & Keywords"** section that shows:
- All `skills[]` tags
- All `tools[]` tags  
- Years of experience badge
- Education
- Summary tags
- A **"Re-parse CV"** button that re-calls `POST /api/parse-resume` with the existing `cv_drive_url` (download + re-parse) or lets user re-upload

---

## PHASE 4 — TYPE DEFINITIONS

Add to `lib/supabase/types.ts` (or wherever DB types are defined):

```typescript
export interface ParsedKeywords {
  skills?:          string[];
  years_experience?: number;
  education?:       string;
  current_role?:    string;
  industries?:      string[];
  tools?:           string[];
  certifications?:  string[];
  languages?:       string[];
  summary_tags?:    string[];
}

export interface CandidateJobScore {
  id:              string;
  candidate_id:    string;
  job_id:          string;
  fit_score:       number;
  fit_breakdown: {
    skills_match:      number;
    experience_match:  number;
    education_match:   number;
    matched_skills:    string[];
    missing_skills:    string[];
    ai_reasoning:      string;
  };
  scored_at:       string;
  scored_by_model: string;
}
```

Update the `Candidate` type to include:
```typescript
parsed_keywords?: ParsedKeywords;
```

---

## PHASE 5 — IMPLEMENTATION ORDER

Build in this exact sequence to avoid dependency issues:

1. **Migration** — run `supabase/migrations/20260506120000_resume_keywords.sql`
2. **`/api/parse-resume/route.ts`** — updated with keyword extraction + job scoring
3. **`/api/candidates/[id]/keywords/route.ts`** — new endpoint
4. **`/api/jobs/[id]/ranked-candidates/route.ts`** — new endpoint
5. **`/api/candidates/route.ts`** — add `kw_search` param handling
6. **Type definitions** — update `ParsedKeywords`, `Candidate`, `CandidateJobScore`
7. **`candidates-client.tsx`** — add smart search input + keyword tags
8. **`add-candidate-modal.tsx`** — pass `parsed_keywords` on create
9. **Job detail** — add Ranked Candidates tab
10. **Candidate detail panel** — add Skills & Keywords section

---

## EXISTING CODE CONTEXT

### Current `/api/parse-resume/route.ts` behavior
- POST with FormData `file` field
- Resolves AI config from `ai_settings` table (personal → org → env)
- Only supports Anthropic/Claude for document parsing
- Returns `{ data: { name, email, mobile, current_designation, current_location, present_salary, expected_salary, notice_period_days, naukri_profile_url, ai_summary }, source }`

### Current `/api/candidates/route.ts` search
- Existing `search` param: `name.ilike`, `mobile.ilike`, `email.ilike`
- New `kw_search` param should be additive (both can be active simultaneously)

### AI Config resolution (`lib/ai-client.ts`)
- `resolveAIConfig(userId)` → `{ provider, api_key, model, scope }`
- Priority: personal key → org key → `ANTHROPIC_API_KEY` env var
- Only Anthropic is currently supported for document parsing

### Database
- `v_pipeline_funnel` is a view over `candidates` — use it for GET queries
- Write operations go directly to `candidates` table
- `masters` table stores designations, sites, skills, sources (type column differentiates)
- `profiles` table: `id`, `name`, `email`, `role` (admin/hr_manager/recruiter/hod)

### Key paths
```
app/
  (app)/
    candidates/
      candidates-client.tsx   ← main candidates list + kanban
      page.tsx
    jobs/
      page.tsx                ← jobs list + detail panel
  api/
    parse-resume/route.ts     ← CV parser
    candidates/
      route.ts                ← GET (list) + POST (create)
      [id]/
        cv/route.ts           ← CV upload to Google Drive
lib/
  ai-client.ts                ← AI config resolver
  supabase/
    client.ts                 ← browser Supabase client
    server.ts                 ← server Supabase client
```

---

## CONSTRAINTS

- Do not break existing functionality — the current search (name/mobile/email) must continue to work
- `parsed_keywords` is optional — candidates without it should still display normally
- Keyword search is additive with existing filters (site, designation, status, date range)
- AI calls are expensive — do NOT call the scoring endpoint unless `job_id` is explicitly provided
- Keep all existing RLS policies intact; add new ones for `candidate_job_scores`
- No mock data — all data comes from Supabase
- TypeScript strict mode — no `any` types
- TailwindCSS only — no inline styles except dynamic values (e.g. `style={{ width: \`${score}%\` }}`)
