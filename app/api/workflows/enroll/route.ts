import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import {
  MANUAL_WORKFLOW_TRIGGER,
  canManageWorkflows,
  dripIntervalMinutes,
  type WorkflowRule,
} from "@/lib/workflows/defaults";

type CandidateRow = {
  id: string;
  name: string | null;
  email: string | null;
  hr_id: string | null;
  created_by: string | null;
  job_id: string | null;
};

type ProfileRow = {
  id: string;
  role: string;
};

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
  );
}

function scheduledAt(startAt: string | null, index: number, intervalMinutes: number) {
  const start = startAt ? new Date(startAt) : new Date();
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  return new Date(base.getTime() + index * intervalMinutes * 60 * 1000).toISOString();
}

async function getProfile(admin: Awaited<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return data as ProfileRow | null;
}

async function getAllowedCandidateIds(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  candidates: CandidateRow[]
) {
  const candidateIds = candidates.map((candidate) => candidate.id);
  const allowed = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.hr_id === userId || candidate.created_by === userId) allowed.add(candidate.id);
  }

  const { data: coSourcers } = await admin
    .from("co_sourcers")
    .select("candidate_id")
    .eq("recruiter_id", userId)
    .in("candidate_id", candidateIds);

  for (const row of coSourcers ?? []) {
    if (row.candidate_id) allowed.add(row.candidate_id);
  }

  const jobIds = Array.from(new Set(candidates.map((candidate) => candidate.job_id).filter(Boolean))) as string[];
  if (jobIds.length) {
    const { data: assignments } = await admin
      .from("job_recruiters")
      .select("job_id")
      .eq("recruiter_id", userId)
      .in("job_id", jobIds)
      .is("assigned_until", null);

    const assignedJobIds = new Set((assignments ?? []).map((row) => row.job_id).filter(Boolean));
    for (const candidate of candidates) {
      if (candidate.job_id && assignedJobIds.has(candidate.job_id)) allowed.add(candidate.id);
    }
  }

  return allowed;
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const workflowId = typeof body.workflow_id === "string" ? body.workflow_id.trim() : "";
  const candidateIds = uniqueStrings(body.candidate_ids);
  const startAt = typeof body.start_at === "string" && body.start_at.trim() ? body.start_at.trim() : null;

  if (!workflowId) return NextResponse.json({ error: "workflow_id is required" }, { status: 400 });
  if (!candidateIds.length) return NextResponse.json({ error: "candidate_ids is required" }, { status: 400 });

  const admin = await createAdminClient();

  try {
    const profile = await getProfile(admin, user.id);
    const { data: workflow, error: workflowError } = await admin
      .from("automation_rules")
      .select("*")
      .eq("id", workflowId)
      .eq("trigger_type", MANUAL_WORKFLOW_TRIGGER)
      .eq("is_active", true)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found or inactive" }, { status: 404 });
    }

    const { data: candidates, error: candidatesError } = await admin
      .from("candidates")
      .select("id, name, email, hr_id, created_by, job_id")
      .in("id", candidateIds)
      .eq("is_deleted", false);

    if (candidatesError) return NextResponse.json({ error: candidatesError.message }, { status: 500 });

    const candidateRows = (candidates ?? []) as CandidateRow[];
    const foundCandidateIds = new Set(candidateRows.map((candidate) => candidate.id));
    let skippedForbidden = candidateIds.filter((id) => !foundCandidateIds.has(id)).length;

    let allowedIds = new Set(candidateRows.map((candidate) => candidate.id));
    if (!canManageWorkflows(profile?.role)) {
      allowedIds = await getAllowedCandidateIds(admin, user.id, candidateRows);
      skippedForbidden += candidateRows.filter((candidate) => !allowedIds.has(candidate.id)).length;
    }

    const allowedCandidates = candidateRows.filter((candidate) => allowedIds.has(candidate.id));
    const withEmail = allowedCandidates.filter((candidate) => Boolean(candidate.email?.trim()));
    const skippedNoEmail = allowedCandidates.length - withEmail.length;

    if (!withEmail.length) {
      return NextResponse.json({
        queued: 0,
        skipped_no_email: skippedNoEmail,
        skipped_duplicate: 0,
        skipped_forbidden: skippedForbidden,
      });
    }

    const { data: pendingRows, error: pendingError } = await admin
      .from("candidate_followups")
      .select("candidate_id")
      .eq("rule_id", workflowId)
      .eq("status", "pending")
      .in("candidate_id", withEmail.map((candidate) => candidate.id));

    if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });

    const duplicateIds = new Set((pendingRows ?? []).map((row) => row.candidate_id).filter(Boolean));
    const queueCandidates = withEmail.filter((candidate) => !duplicateIds.has(candidate.id));
    const interval = dripIntervalMinutes((workflow as WorkflowRule).action_config);
    const batchId = crypto.randomUUID();

    if (queueCandidates.length) {
      const rows = queueCandidates.map((candidate, index) => ({
        candidate_id: candidate.id,
        rule_id: workflowId,
        status: "pending",
        scheduled_at: scheduledAt(startAt, index, interval),
        trigger_context: {
          trigger: MANUAL_WORKFLOW_TRIGGER,
          batch_id: batchId,
          enrolled_by: user.id,
          workflow_id: workflowId,
          workflow_name: (workflow as WorkflowRule).name,
          candidate_name: candidate.name,
          start_at: startAt,
          drip_interval_minutes: interval,
        },
        result: {
          gmail_status: "queued",
          note: "Queued for Gmail workflow send.",
        },
      }));

      const { error: insertError } = await admin.from("candidate_followups").insert(rows);
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      queued: queueCandidates.length,
      skipped_no_email: skippedNoEmail,
      skipped_duplicate: duplicateIds.size,
      skipped_forbidden: skippedForbidden,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to enroll workflow" }, { status: 500 });
  }
}
