import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

type JobRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  job_type: string | null;
  designation_id: string | null;
  site_id: string | null;
  headcount: number | null;
  priority: string | null;
  min_salary: string | number | null;
  max_salary: string | number | null;
  opened_at: string | null;
  target_doj: string | null;
  client_name: string | null;
  placement_fee_pct: string | number | null;
  description: string | null;
  recruiter_ids: string[] | null;
  status: string;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: request, error: requestError } = await admin
    .from("job_creation_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const typedRequest = request as JobRequest;
  if (typedRequest.to_user_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned reviewer for this request" }, { status: 403 });
  }
  if (typedRequest.status !== "pending") {
    return NextResponse.json({ error: "Request already reviewed" }, { status: 409 });
  }

  const body = await req.json();
  const { action, review_note } = body;

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const adminName = profile.name ?? "Admin";

  if (action === "approve") {
    const { data: newJob, error: jobError } = await admin
      .from("jobs")
      .insert({
        title: typedRequest.title,
        job_type: typedRequest.job_type ?? "internal",
        designation_id: typedRequest.designation_id ?? null,
        site_id: typedRequest.site_id ?? null,
        headcount: typedRequest.headcount ?? 1,
        priority: typedRequest.priority ?? "normal",
        min_salary: typedRequest.min_salary ?? null,
        max_salary: typedRequest.max_salary ?? null,
        opened_at: typedRequest.opened_at ?? null,
        target_doj: typedRequest.target_doj ?? null,
        client_name: typedRequest.client_name ?? null,
        placement_fee_pct: typedRequest.placement_fee_pct ?? null,
        description: typedRequest.description ?? null,
        status: "open",
        created_by: typedRequest.from_user_id,
      })
      .select("*")
      .single();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

    if (Array.isArray(typedRequest.recruiter_ids) && typedRequest.recruiter_ids.length > 0) {
      const recruiterRows = typedRequest.recruiter_ids.map((recruiterId) => ({
        job_id: newJob.id,
        recruiter_id: recruiterId,
        assigned_by: user.id,
      }));

      const { error: recruiterError } = await admin.from("job_recruiters").insert(recruiterRows);
      if (recruiterError) return NextResponse.json({ error: recruiterError.message }, { status: 500 });

      const { error: notificationError } = await admin.from("notifications").insert(
        typedRequest.recruiter_ids.map((recruiterId) => ({
          user_id: recruiterId,
          type: "job_assigned",
          job_request_id: id,
          title: "You've been assigned to a job",
          body: `You've been assigned to "${typedRequest.title}" by ${adminName}`,
          is_read: false,
        }))
      );

      if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
    }

    const { data: updated, error: updateError } = await admin
      .from("job_creation_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: now,
        review_note: review_note ?? null,
        job_id: newJob.id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: typedRequest.from_user_id,
      type: "job_request_approved",
      job_request_id: id,
      title: "Job request approved",
      body: `"${typedRequest.title}" was approved by ${adminName} and is now live`,
      is_read: false,
    });

    if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  const { data: updated, error: updateError } = await admin
    .from("job_creation_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: now,
      review_note: review_note ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: typedRequest.from_user_id,
    type: "job_request_rejected",
    job_request_id: id,
    title: "Job request rejected",
    body: `"${typedRequest.title}" was rejected by ${adminName}${review_note ? `: ${review_note}` : ""}`,
    is_read: false,
  });

  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
  return NextResponse.json(updated);
}
