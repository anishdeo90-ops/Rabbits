import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueStageChangeTriggers } from "@/lib/automation/triggers";

const WRITABLE_CANDIDATE_FIELDS = new Set([
  "hr_id",
  "month",
  "application_date",
  "naukri_link",
  "naukri_profile_url",
  "name",
  "current_designation",
  "designation_id",
  "site_id",
  "mobile",
  "email",
  "suitable_other_position",
  "current_location",
  "source_id",
  "present_salary",
  "expected_salary",
  "offered_salary",
  "notice_period_days",
  "google_form_sent",
  "google_form_received",
  "processed_by_hr",
  "shortlist_by_hr",
  "tel_int_date",
  "tel_int_remarks",
  "hr_manager_remarks",
  "remarks_before_pi",
  "mgmt_remarks_before_pi",
  "shortlisted_for_pi",
  "pi1_date",
  "pi1_taken_by",
  "pi1_remarks",
  "pi2_date",
  "pi2_taken_by",
  "pi2_remarks",
  "pi3_date",
  "pi3_taken_by",
  "pi3_remarks",
  "gf_issued",
  "shortlisted_by_mgmt",
  "gf_issue_date",
  "gf_received_date",
  "gf_verified",
  "gf_verification_report",
  "addr_verification_shared",
  "addr_verification_received",
  "remarks",
  "final_status",
  "final_action",
  "file_no",
  "doj",
  "doj_potential",
  "doj_actual",
  "hard_copy",
  "staffingo_emp_id",
  "ai_score",
  "ai_summary",
  "cv_drive_url",
  "cv_filename",
  "job_id",
  "custom_data",
  "parsed_keywords",
]);

function pickWritableCandidateFields(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (WRITABLE_CANDIDATE_FIELDS.has(key)) output[key] = value;
  }
  return output;
}

// GET single candidate (full detail with co-sourcers)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("v_pipeline_funnel")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Also fetch full candidate row for fields not in view
  const { data: full } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ data: { ...full, ...data } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (profile.role === 'hod') {
    return NextResponse.json({ error: "HODs cannot edit candidate records" }, { status: 403 });
  }
  const { data: previousCandidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (profile.role === 'recruiter') {
    const existing = previousCandidate;
    if (!existing || (existing.created_by !== user.id && existing.hr_id !== user.id))
      return NextResponse.json({ error: "You can only edit your own candidates" }, { status: 403 });
  }

  const body = await req.json() as Record<string, unknown>;
  const payload = pickWritableCandidateFields(body);

  const { data, error } = await supabase
    .from("candidates")
    .update({ ...payload, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (typeof payload.final_status === "string" && payload.final_status !== previousCandidate?.final_status) {
    await enqueueStageChangeTriggers(id, payload.final_status, previousCandidate);
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!["admin","hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Please submit a deletion request instead" }, { status: 403 });
  }

  const { error } = await supabase
    .from("candidates")
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
