import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { findDuplicateCandidatesByMobile } from "@/lib/candidate-duplicates";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const p = new URL(req.url).searchParams;
  const hrId = p.get("hr_id");
  const siteId = p.get("site_id");
  const month = p.get("month");
  const status = p.get("status");
  const search = p.get("search");
  const designId = p.get("designation_id");
  const sourceId = p.get("source_id");
  const dateFrom = p.get("date_from");
  const dateTo = p.get("date_to");
  const piBy = p.get("pi_taken_by");
  const page = parseInt(p.get("page") ?? "1", 10);
  const limit = parseInt(p.get("limit") ?? "2000", 10);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("v_pipeline_funnel")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .order("sr_no", { ascending: false })
    .range(offset, offset + limit - 1);

  if (profile?.role === "recruiter") {
    const { data: assignedJobs } = await supabase
      .from("job_recruiters")
      .select("job_id")
      .eq("recruiter_id", user.id);

    const jobIds = (assignedJobs ?? [])
      .map((job: { job_id: string }) => job.job_id)
      .filter(Boolean);

    const parts = [`hr_id.eq.${user.id}`, `created_by.eq.${user.id}`];
    if (jobIds.length > 0) parts.push(`job_id.in.(${jobIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  if (hrId) query = query.eq("hr_id", hrId);
  if (siteId) query = query.eq("site_id", siteId);
  if (month) query = query.eq("month", month);
  if (status === "Appointed/Offered" || status === "Offered") {
    query = query.in("final_status", ["Appointed/Offered", "Offered"]);
  } else if (status) {
    query = query.eq("final_status", status);
  }
  if (designId) query = query.eq("designation_id", designId);
  if (sourceId) query = query.eq("source_id", sourceId);
  if (dateFrom) query = query.gte("application_date", dateFrom);
  if (dateTo) query = query.lte("application_date", dateTo);

  if (search) {
    query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  if (piBy) {
    const q = piBy.toLowerCase();
    rows = rows.filter((row) =>
      (row as Record<string, string>).pi1_taken_by?.toLowerCase().includes(q) ||
      (row as Record<string, string>).pi2_taken_by?.toLowerCase().includes(q) ||
      (row as Record<string, string>).pi3_taken_by?.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ data: rows, count: piBy ? rows.length : count });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.mobile) {
    const admin = await createAdminClient();
    const matches = await findDuplicateCandidatesByMobile(admin, body.mobile, 5);
    if (matches.length > 0) {
      return NextResponse.json({
        error: `Duplicate mobile number - candidate "${matches[0].name}" already exists with this mobile.`,
        duplicate_id: matches[0].id,
        duplicate: matches[0],
        duplicates: matches,
      }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("candidates")
    .insert({ ...body, created_by: user.id, hr_id: body.hr_id ?? user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
