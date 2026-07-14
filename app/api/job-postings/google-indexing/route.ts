import { NextRequest, NextResponse } from "next/server";
import { getPublicJobUrl, GOOGLE_JOBS_PLATFORM } from "@/lib/google-jobs";
import {
  type GoogleIndexingNotificationType,
  publishGoogleIndexingNotification,
} from "@/lib/google-indexing";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set<GoogleIndexingNotificationType>(["URL_UPDATED", "URL_DELETED"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager", "hod"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    job_id?: string;
    type?: GoogleIndexingNotificationType;
  };
  const jobId = body.job_id?.trim();
  const notificationType = body.type || "URL_UPDATED";

  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  if (!ALLOWED_TYPES.has(notificationType)) {
    return NextResponse.json({ error: "Invalid Google notification type" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id,status,is_deleted")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (notificationType === "URL_UPDATED" && (job.is_deleted || job.status !== "open")) {
    return NextResponse.json({ error: "Only open jobs can be submitted to Google Jobs." }, { status: 400 });
  }

  const url = getPublicJobUrl(jobId);
  const now = new Date().toISOString();

  const { data: existingPosting, error: existingError } = await admin
    .from("job_postings")
    .select("attempt_count")
    .eq("job_id", jobId)
    .eq("platform", GOOGLE_JOBS_PLATFORM)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const nextAttemptCount = (existingPosting?.attempt_count ?? 0) + 1;
  const { error: postingError } = await admin
    .from("job_postings")
    .upsert({
      job_id: jobId,
      platform: GOOGLE_JOBS_PLATFORM,
      status: "posting",
      external_post_url: url,
      error_message: null,
      attempt_count: nextAttemptCount,
      last_attempt_at: now,
      updated_at: now,
    }, { onConflict: "job_id,platform" });

  if (postingError) return NextResponse.json({ error: postingError.message }, { status: 500 });

  try {
    const response = await publishGoogleIndexingNotification(url, notificationType);
    const nextStatus = notificationType === "URL_DELETED" ? "cancelled" : "posted";
    const notifyTime = readNotifyTime(response, notificationType) ?? now;

    const { data: posting, error: updateError } = await admin
      .from("job_postings")
      .upsert({
        job_id: jobId,
        platform: GOOGLE_JOBS_PLATFORM,
        status: nextStatus,
        external_post_url: url,
        error_message: null,
        posted_at: notificationType === "URL_UPDATED" ? notifyTime : null,
        updated_at: now,
      }, { onConflict: "job_id,platform" })
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ data: posting, google: response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Indexing API request failed.";
    await admin
      .from("job_postings")
      .upsert({
        job_id: jobId,
        platform: GOOGLE_JOBS_PLATFORM,
        status: "failed",
        external_post_url: url,
        error_message: message,
        updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,platform" });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function readNotifyTime(payload: Record<string, unknown>, type: GoogleIndexingNotificationType) {
  const key = type === "URL_UPDATED" ? "latestUpdate" : "latestRemove";
  const snakeKey = type === "URL_UPDATED" ? "latest_update" : "latest_remove";
  const entry = (payload[key] ?? payload[snakeKey]) as { notifyTime?: string; notify_time?: string } | undefined;
  return entry?.notifyTime ?? entry?.notify_time ?? null;
}
