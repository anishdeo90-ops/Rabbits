import { NextRequest, NextResponse } from "next/server";
import { getPublicJobUrl, GOOGLE_JOBS_PLATFORM } from "@/lib/google-jobs";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const ALLOWED_STATUSES = new Set(["pending", "posting", "posted", "failed", "cancelled"]);

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager", "hod"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    job_id?: string;
    platform?: string;
    enabled?: boolean;
    status?: string;
  };

  const jobId = body.job_id?.trim();
  const platform = body.platform?.trim() || GOOGLE_JOBS_PLATFORM;
  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  if (platform !== GOOGLE_JOBS_PLATFORM) return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });

  const admin = await createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id,status,is_deleted")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job || job.is_deleted) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const nextStatus = body.enabled === false ? "cancelled" : body.status || "pending";
  if (!ALLOWED_STATUSES.has(nextStatus)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { data, error } = await admin
    .from("job_postings")
    .upsert({
      job_id: jobId,
      platform,
      status: nextStatus,
      external_post_url: getPublicJobUrl(jobId),
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,platform" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
