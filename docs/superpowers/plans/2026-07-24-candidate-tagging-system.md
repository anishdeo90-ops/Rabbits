# Candidate Tagging System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add candidate tags that can be managed as a dropdown master, assigned to candidates, filtered on candidate views, and displayed in sheet/ATS/Kanban surfaces.

**Architecture:** Store tag definitions in `masters` with `type = 'tag'`, and store assignments in a normalized `candidate_tags` join table. Expose candidate tag arrays through `v_pipeline_funnel`, then let `/api/candidates` remain the single read path for sheet, ATS, and Kanban.

**Tech Stack:** Next.js 14 App Router, TypeScript React, Supabase Postgres, Supabase JS, Node `node:test`.

## Global Constraints

- Keep tags multi-select per candidate.
- Do not store reporting/filtering state in `custom_data`.
- Use Supabase RLS on new public tables and keep `v_pipeline_funnel` as `security_invoker`.
- Tag filter must affect sheet, ATS, and Kanban because all views use `/api/candidates`.
- Show tag chips in the candidate sidebar header, sidebar overview, sheet column, ATS cards, and Kanban cards.
- Update `USER_MANUAL.md`, verify locally, apply the linked Supabase migration, commit, and push to GitHub.

---

### Task 1: Tag Helper Tests And Implementation

**Files:**
- Create: `tests/candidate-tags.test.mjs`
- Create: `lib/candidates/tags.js`

**Interfaces:**
- Produces: `normalizeTagIds(value: unknown): string[]`
- Produces: `parseTagNames(value: unknown): string[]`
- Produces: `buildCandidateTagRows(candidateId: string, tagIds: unknown, assignedBy: string): { candidate_id: string; tag_id: string; assigned_by: string }[]`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTagIds, parseTagNames, buildCandidateTagRows } from "../lib/candidates/tags.js";

test("normalizeTagIds removes blanks and duplicate ids while preserving order", () => {
  assert.deepEqual(normalizeTagIds([" tag-a ", "", "tag-b", "tag-a", null]), ["tag-a", "tag-b"]);
});

test("parseTagNames accepts comma, semicolon, and pipe separated import values", () => {
  assert.deepEqual(parseTagNames("Walk-in, Priority; Night Shift | Priority"), ["Walk-in", "Priority", "Night Shift"]);
});

test("buildCandidateTagRows returns join rows for normalized tag ids", () => {
  assert.deepEqual(buildCandidateTagRows("candidate-1", ["tag-1", "tag-1", "tag-2"], "user-1"), [
    { candidate_id: "candidate-1", tag_id: "tag-1", assigned_by: "user-1" },
    { candidate_id: "candidate-1", tag_id: "tag-2", assigned_by: "user-1" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/candidate-tags.test.mjs`
Expected: FAIL because `lib/candidates/tags.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `lib/candidates/tags.js` with the three exported functions above.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/candidate-tags.test.mjs`
Expected: PASS.

### Task 2: Supabase Schema Migration

**Files:**
- Create: `supabase/migrations/<cli_timestamp>_candidate_tags.sql`

**Interfaces:**
- Produces: `public.candidate_tags(candidate_id uuid, tag_id uuid, assigned_by uuid, assigned_at timestamptz)`
- Produces: `v_pipeline_funnel.tag_ids text[]`
- Produces: `v_pipeline_funnel.tag_names text[]`
- Produces: `v_pipeline_funnel.tag_colors text[]`

- [ ] **Step 1: Generate the migration**

Run: `supabase migration new candidate_tags`
Expected: a new empty SQL file under `supabase/migrations`.

- [ ] **Step 2: Add SQL**

Add a join table with foreign keys to `candidates`, `masters`, and `profiles`, RLS enabled, grants for authenticated users, participant/HR policies, and a refreshed `v_pipeline_funnel` view that aggregates active tag master rows as arrays.

- [ ] **Step 3: Verify SQL shape locally enough to build**

Run: `supabase migration list --local`
Expected: the new migration appears in the local list.

### Task 3: Candidate API Tag Reads/Writes

**Files:**
- Modify: `app/api/candidates/route.ts`
- Modify: `app/api/candidates/[id]/route.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: `normalizeTagIds`, `buildCandidateTagRows`
- Adds: `GET /api/candidates?tag_id=<uuid>`
- Adds: `POST /api/candidates` accepts optional `tag_ids`
- Adds: `PATCH /api/candidates/:id` accepts optional `tag_ids`

- [ ] **Step 1: Add candidate tag types**

Add `tag_ids?: string[]`, `tag_names?: string[]`, and `tag_colors?: string[]` to `Candidate`, and add `{ key: "tag", label: "Tags" }` to `MASTER_TYPES`.

- [ ] **Step 2: Add API filtering**

Read `tag_id` from `GET /api/candidates`, pre-query `candidate_tags`, return an empty result when no matching candidate ids exist, otherwise add `.in("id", ids)` to the existing funnel query.

- [ ] **Step 3: Add API writes**

Normalize `tag_ids` on POST/PATCH. After creating a candidate, insert join rows. During PATCH, delete and reinsert the candidate's tag rows when the body contains `tag_ids`, and allow tag-only patches for permitted users.

### Task 4: Candidate UI

**Files:**
- Modify: `app/(app)/candidates/page.tsx`
- Modify: `app/(app)/candidates/candidates-client.tsx`
- Modify: `components/candidate-detail-panel.tsx`

**Interfaces:**
- Consumes: `tags: Master[]`
- Consumes: `initialTagId?: string`

- [ ] **Step 1: Load tag masters server-side**

Fetch `masters.type = 'tag'` in the candidates page and pass `tags` plus `initialTagId` into `CandidatesClient`.

- [ ] **Step 2: Add tag filter**

Add `tagFilter` state, send `tag_id` in `buildFetchParams`, include it in fetch dependencies and Clear behavior, and place a `SearchCombobox` in the filter bar.

- [ ] **Step 3: Add tag display helpers**

Add compact tag chip rendering that maps candidate `tag_ids`/`tag_names` to active tag masters and caps Kanban card display at two tags plus a `+N` chip.

- [ ] **Step 4: Add sheet, ATS, and Kanban display**

Add a read-only `TAGS` sheet column near final status, render chips in that cell, and render chips on ATS and Kanban cards.

- [ ] **Step 5: Add sidebar editing**

Pass `tags` into `DetailPanel`, render header tag chips, and add a multi-select tag field next to Current Status in the Overview grid. Saving the panel must include `tag_ids`.

### Task 5: Settings Master UI

**Files:**
- Modify: `app/(app)/settings/page.tsx`

**Interfaces:**
- Adds: Dropdown Masters tab `tag`

- [ ] **Step 1: Add tag master type**

Add `"tag"` to `DROPDOWN_TYPES` and update the section description to mention Tags.

- [ ] **Step 2: Preserve existing master create/edit behavior**

The existing `/api/masters` create/edit flow should handle tag masters without a new endpoint.

### Task 6: Documentation, Verification, Supabase Apply, GitHub Push

**Files:**
- Modify: `USER_MANUAL.md`

**Interfaces:**
- Uses: linked Supabase project
- Uses: GitHub `origin/main`

- [ ] **Step 1: Update the manual**

Document tag master setup, candidate sidebar assignment, sheet/ATS/Kanban display, tag filtering, and the `candidate_tags` table.

- [ ] **Step 2: Run verification**

Run: `node --test tests/candidate-tags.test.mjs`
Run: `npm.cmd run build`
Expected: both pass.

- [ ] **Step 3: Apply live migration**

Run the migration SQL on the linked Supabase database, mark the migration applied if the project still has migration-history drift, and verify `candidate_tags` plus funnel tag arrays exist.

- [ ] **Step 4: Commit and push**

Run `git status --short`, commit all related changes with `Add candidate tagging system`, push to `origin/main`, and verify `origin/main` points to the new commit.
