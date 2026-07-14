import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const status     = p.get("status");
  const jobType    = p.get("job_type");
  const siteId     = p.get("site_id");
  const designId   = p.get("designation_id");
  const recruiterId = p.get("recruiter_id");
  const hodId      = p.get("hod_id");

  let query = supabase
    .from("jobs")
    .select(`
      *,
      designation:masters!jobs_designation_id_fkey(id, name),
      site:masters!jobs_site_id_fkey(id, name),
      recruiters:job_recruiters(
        id, recruiter_id, assigned_at, assigned_from, assigned_until,
        profile:profiles!job_recruiters_recruiter_id_fkey(id, name, email, avatar_url)
      )
    `)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (status)    query = query.eq("status", status);
  if (jobType)   query = query.eq("job_type", jobType);
  if (siteId)    query = query.eq("site_id", siteId);
  if (designId)  query = query.eq("designation_id", designId);
  if (hodId)     query = query.eq("hod_id", hodId);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "recruiter") {
    const { data: assignedRows } = await supabase
      .from("job_recruiters")
      .select("job_id")
      .eq("recruiter_id", user.id);
    const assignedIds = (assignedRows ?? []).map((row) => row.job_id).filter(Boolean);
    const parts = [`created_by.eq.${user.id}`];
    if (assignedIds.length > 0) parts.push(`id.in.(${assignedIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by recruiter assignment if requested
  let jobs = data ?? [];
  if (recruiterId) {
    jobs = jobs.filter((j) =>
      (j.recruiters as { recruiter_id: string }[])?.some((r) => r.recruiter_id === recruiterId)
    );
  }

  const jobIds = jobs.map((j) => j.id).filter(Boolean);
  let postingsByJob = new Map<string, unknown[]>();
  if (jobIds.length > 0 && ["admin", "hr_manager", "hod"].includes(profile?.role ?? "")) {
    const admin = await createAdminClient();
    const { data: postings } = await admin
      .from("job_postings")
      .select("*")
      .in("job_id", jobIds);
    postingsByJob = (postings ?? []).reduce((map, posting) => {
      const list = map.get(posting.job_id) ?? [];
      list.push(posting);
      map.set(posting.job_id, list);
      return map;
    }, new Map<string, unknown[]>());
  }

  // Flatten joined fields
  const result = jobs.map((j) => ({
    ...j,
    designation_name: (j.designation as { name: string } | null)?.name,
    site_name: (j.site as { name: string } | null)?.name,
    postings: postingsByJob.get(j.id) ?? [],
    recruiters: (j.recruiters as { recruiter_id: string; profile: { name: string } }[])?.map((r) => ({
      ...r,
      recruiter_name: r.profile?.name,
    })),
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "hr_manager", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { recruiter_ids, ...jobData } = body;

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({ ...jobData, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Assign recruiters
  if (recruiter_ids?.length) {
    await supabase.from("job_recruiters").insert(
      recruiter_ids.map((rid: string) => ({
        job_id: job.id, recruiter_id: rid, assigned_by: user.id, assigned_from: new Date().toISOString().slice(0, 10),
      }))
    );
  }

  return NextResponse.json({ data: job }, { status: 201 });
}
