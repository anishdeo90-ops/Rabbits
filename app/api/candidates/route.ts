import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const p = new URL(req.url).searchParams;
  const hrId         = p.get("hr_id");
  const siteId       = p.get("site_id");
  const month        = p.get("month");
  const status       = p.get("status");
  const search       = p.get("search");
  const designId     = p.get("designation_id");
  const sourceId     = p.get("source_id");
  const dateFrom     = p.get("date_from");
  const dateTo       = p.get("date_to");
  const piBy         = p.get("pi_taken_by");
  const page         = parseInt(p.get("page") ?? "1");
  const limit        = parseInt(p.get("limit") ?? "2000");
  const offset       = (page - 1) * limit;

  let query = supabase
    .from("v_pipeline_funnel")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .order("sr_no", { ascending: false })
    .range(offset, offset + limit - 1);

  // Scope candidates for recruiter role
  if (profile?.role === 'recruiter') {
    const { data: assignedJobs } = await supabase
      .from('job_recruiters').select('job_id').eq('recruiter_id', user.id);
    const jobIds = (assignedJobs ?? []).map((j: { job_id: string }) => j.job_id).filter(Boolean);
    const parts = [`hr_id.eq.${user.id}`, `created_by.eq.${user.id}`];
    if (jobIds.length > 0) parts.push(`job_id.in.(${jobIds.join(',')})`);
    query = query.or(parts.join(','));
  }

  // Filters
  if (hrId)     query = query.eq("hr_id",           hrId);
  if (siteId)   query = query.eq("site_id",          siteId);
  if (month)    query = query.eq("month",            month);
  if (status)   query = query.eq("final_status",     status);
  if (designId) query = query.eq("designation_id",   designId);
  if (sourceId) query = query.eq("source_id",        sourceId);
  if (dateFrom) query = query.gte("application_date", dateFrom);
  if (dateTo)   query = query.lte("application_date", dateTo);

  // Search: name, mobile, email
  if (search) {
    query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // PI taken by (searches pi1, pi2, pi3 taken_by fields — done client-side post-fetch for simplicity)
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  // PI taken by filter (post-fetch since it spans 3 columns)
  if (piBy) {
    const q = piBy.toLowerCase();
    rows = rows.filter(r =>
      (r as Record<string, string>).pi1_taken_by?.toLowerCase().includes(q) ||
      (r as Record<string, string>).pi2_taken_by?.toLowerCase().includes(q) ||
      (r as Record<string, string>).pi3_taken_by?.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ data: rows, count: piBy ? rows.length : count });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Server-side duplicate mobile check
  if (body.mobile) {
    const digits = String(body.mobile).replace(/\D/g, "");
    if (digits.length >= 7) {
      const { data: existing } = await supabase
        .from("candidates")
        .select("id, name, final_status")
        .ilike("mobile", `%${digits}%`)
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          error: `Duplicate mobile number — candidate "${existing.name}" already exists with this mobile.`,
          duplicate_id: existing.id,
        }, { status: 409 });
      }
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
