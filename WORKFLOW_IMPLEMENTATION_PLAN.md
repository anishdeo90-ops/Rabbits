# Workflow Implementation Plan

## Goal

Add manual follow-up workflows to the ATS so HR/recruiters can select candidates from the candidate sheet, choose a workflow, and queue drip follow-ups without sending everything at once.

Keep the current Export behavior unchanged. Export continues to export whatever filters currently show. Bulk workflow selection is separate from export.

## Product Behavior

- Candidate sheet first column changes from row number-only to checkboxes.
- Header checkbox selects or clears all currently visible rows after search/filters.
- Selection clears when search/filter inputs change.
- When one or more candidates are selected, show a compact strip below filters:
  - selected count
  - Start Workflow
  - Clear
- Start Workflow opens a modal:
  - selected candidate count
  - preview of selected candidate names/emails/statuses
  - no-email warning; candidates without email are skipped
  - active workflow choices
  - Gmail connection note
  - Cancel and Start Workflow buttons
- Enrollment uses explicit candidate IDs only:

```json
{
  "workflow_id": "uuid",
  "candidate_ids": ["candidate-id-1"],
  "start_at": null
}
```

- Workflow emails must be queued gradually, not all at once.
- For now, use existing `automation_rules` and `candidate_followups` tables. Do not create new tables unless absolutely required.
- Use service-role/admin Supabase client only inside server routes. Never expose service role to client code.

## Existing Tables To Reuse

`automation_rules`

- Stores workflow definitions.
- Use `trigger_type = "manual_workflow"` for these manual candidate workflows.
- Use `action_type = "gmail_email"`.
- Store drip settings and workflow key in `action_config`.

`candidate_followups`

- Stores queued workflow/candidate rows.
- One row per candidate enrollment.
- Use `status = "pending"` when queued.
- Use `scheduled_at` to stagger candidates across time.
- Store batch/user/context metadata in `trigger_context`.
- Store Gmail connection/send status notes in `result`.

## Workflow Defaults

Seed or expose defaults if no manual workflow rows exist:

- Interview Reminder
  - For upcoming interview reminders.
  - Drip interval: 3 minutes between candidates.
- Document Collection Reminder
  - For missing documents after screening/selection.
  - Drip interval: 3 minutes between candidates.
- Offer Follow-up
  - For offer acknowledgement/follow-up.
  - Drip interval: 3 minutes between candidates.
- Joining Reminder
  - For joining date reminders.
  - Drip interval: 3 minutes between candidates.

## Dave Scope: Backend APIs And Supabase Queue

Owned files:

- `app/api/workflows/route.ts`
- `app/api/workflows/enroll/route.ts`
- optional helper under `lib/workflows/`

Do not edit candidate UI or settings UI unless asked.

Tasks:

1. Add shared workflow defaults/helper.
2. Implement `GET /api/workflows`.
   - Require authenticated user.
   - Ensure default manual workflow rows exist if none exist.
   - Recruiters should only receive active workflows.
   - Admin/HR/HOD can receive active and inactive workflows.
3. Implement `POST /api/workflows`.
   - Admin/HR/HOD only.
   - Create a manual workflow in `automation_rules`.
4. Implement `PATCH /api/workflows`.
   - Admin/HR/HOD only.
   - Update workflow name, description, delay, active status, and drip config.
5. Implement `POST /api/workflows/enroll`.
   - Body: `{ workflow_id, candidate_ids, start_at }`.
   - Require authenticated user.
   - Validate workflow exists, active, and `trigger_type = "manual_workflow"`.
   - Validate candidates exist and are not deleted.
   - Skip candidates without email.
   - Avoid duplicate pending rows for same candidate/workflow.
   - Recruiter may enroll only owned/assigned candidates.
   - Admin/HR/HOD may enroll any visible candidate.
   - Insert pending rows into `candidate_followups`.
   - Stagger `scheduled_at` by drip interval, default 3 minutes.
   - Return counts: queued, skipped_no_email, skipped_duplicate, skipped_forbidden.

API response shape for enroll:

```json
{
  "queued": 10,
  "skipped_no_email": 2,
  "skipped_duplicate": 1,
  "skipped_forbidden": 0
}
```

Verification:

- Typecheck route files.
- Confirm no service-role code is imported by client components.
- Confirm no new table/migration is needed.

## Celete Scope: Candidate Sheet Selection And Launch Modal

Owned file:

- `app/(app)/candidates/candidates-client.tsx`

Do not edit backend routes or settings UI unless asked.

Tasks:

1. Add selected candidate state.
2. Replace the sheet `#` header/cell behavior with checkboxes:
   - header checkbox selects/clears all currently visible candidates
   - row checkbox toggles that candidate
   - checkbox click must not open candidate panel or start cell editing
3. Keep row numbering if useful, but checkbox must be the primary first-column action.
4. Clear selected IDs when filters/search change.
5. Add compact selected strip under the filter bar:
   - `{n} selected`
   - `Start Workflow`
   - `Clear`
6. Add workflow launch modal:
   - fetch active workflows from `GET /api/workflows`
   - show selected candidates preview
   - show no-email skip warning
   - select one workflow
   - call `POST /api/workflows/enroll`
   - show toast/result counts
   - clear selection and close modal on success
7. Do not change existing Export button behavior.
8. Keep styling clean and consistent with existing dashboard UI.

Verification:

- Candidate sheet still filters and edits normally.
- Checkbox clicks do not trigger row edit/panel.
- Export still exports currently filtered rows.
- Workflow modal handles loading, empty workflow list, and API errors.

## Thor Scope: Settings Workflow Management UI

Owned file:

- `app/(app)/settings/page.tsx`

Do not edit candidate UI or backend routes unless asked.

Tasks:

1. Add `workflows` to settings section union.
2. Add a Workflows navigation item directly below Email Templates.
3. Add workflow state/loading/error handling.
4. Fetch workflows from `GET /api/workflows` when Workflows section opens.
5. Build a clean Workflows section:
   - header
   - New Workflow button for admin/HR/HOD
   - cards/list for workflows
   - active/inactive badge
   - drip interval display
   - Gmail credentials note
6. Add create/edit modal:
   - name
   - description
   - delay hours
   - drip interval minutes
   - active toggle
7. Save via `POST /api/workflows` or `PATCH /api/workflows`.
8. Recruiters should be able to view active workflows but not edit definitions.

Verification:

- Email Templates section still works.
- Workflows appears below Email Templates.
- Non-admin edit controls are hidden or disabled.
- Create/edit/toggle errors show cleanly.

## Coordination Rules

- Avoid editing files outside your owned scope.
- Do not remove unrelated existing changes.
- Do not change Export behavior.
- Do not create migrations unless Dave confirms existing tables are insufficient.
- Use existing code patterns in this repo.
- Keep UI text short and professional.
- After finishing, report:
  - files changed
  - behavior implemented
  - verification run
  - blockers, if any

## Final Verification Owner

The coordinator will review all diffs, resolve conflicts, run type/build checks that are safe for the current dev server state, and inspect the app manually if needed.
