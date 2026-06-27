import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

type Profile = { id: string; name: string | null; role: string | null };
type Master = { id: string; name: string | null };
type JobRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  designation_id: string | null;
  site_id: string | null;
  [key: string]: unknown;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "true";

  let query = admin.from("job_creation_requests").select("*").order("created_at", { ascending: false });
  if (mine) {
    query = query.eq("from_user_id", user.id);
  } else if (profile?.role === "admin") {
    query = query.eq("to_user_id", user.id);
  } else {
    query = query.eq("from_user_id", user.id);
  }

  const { data: requests, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (requests ?? []) as JobRequest[];
  const profileIds = unique(rows.flatMap((row) => [row.from_user_id, row.to_user_id]));
  const masterIds = unique(rows.flatMap((row) => [row.designation_id, row.site_id]));

  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id,name,role").in("id", profileIds)
    : { data: [] as Profile[] };
  const { data: masters } = masterIds.length
    ? await admin.from("masters").select("id,name").in("id", masterIds)
    : { data: [] as Master[] };

  const profileById = new Map((profiles ?? []).map((item) => [item.id, item]));
  const masterById = new Map((masters ?? []).map((item) => [item.id, item]));

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      from_profile: profileById.get(row.from_user_id) ?? null,
      to_profile: profileById.get(row.to_user_id) ?? null,
      designation: row.designation_id ? masterById.get(row.designation_id) ?? null : null,
      site: row.site_id ? masterById.get(row.site_id) ?? null : null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || !["hr_manager", "hod"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Only HR Managers and HODs can request job creation" }, { status: 403 });
  }

  const body = await req.json();
  const { admin_ids, note, ...jobData } = body;

  if (!Array.isArray(admin_ids) || admin_ids.length === 0) {
    return NextResponse.json({ error: "At least one admin must be selected" }, { status: 400 });
  }
  if (!jobData.title?.trim()) {
    return NextResponse.json({ error: "Job title is required" }, { status: 400 });
  }

  const { data: adminProfiles, error: adminsError } = await admin
    .from("profiles")
    .select("id,name,role")
    .in("id", admin_ids as string[]);

  if (adminsError) return NextResponse.json({ error: adminsError.message }, { status: 500 });

  const validAdmins = (adminProfiles ?? []).filter((item) => item.role === "admin");
  const senderName = profile.name ?? "A team member";
  const created = [];

  for (const adminProfile of validAdmins) {
    const { data: request, error: requestError } = await admin
      .from("job_creation_requests")
      .insert({
        from_user_id: user.id,
        to_user_id: adminProfile.id,
        title: jobData.title,
        job_type: jobData.job_type ?? "internal",
        designation_id: jobData.designation_id ?? null,
        site_id: jobData.site_id ?? null,
        headcount: jobData.headcount ?? 1,
        priority: jobData.priority ?? "normal",
        min_salary: jobData.min_salary ?? null,
        max_salary: jobData.max_salary ?? null,
        opened_at: jobData.opened_at ?? null,
        target_doj: jobData.target_doj ?? null,
        client_name: jobData.client_name ?? null,
        placement_fee_pct: jobData.placement_fee_pct ?? null,
        description: jobData.description ?? null,
        recruiter_ids: Array.isArray(jobData.recruiter_ids) ? jobData.recruiter_ids : null,
        note: note ?? null,
        status: "pending",
      })
      .select("*")
      .single();

    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: adminProfile.id,
      type: "job_requested",
      job_request_id: request.id,
      title: `${senderName} requested a new job`,
      body: `"${jobData.title}" - ${jobData.priority ?? "normal"} priority`,
      is_read: false,
    });

    if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
    created.push(request);
  }

  return NextResponse.json(created, { status: 201 });
}
