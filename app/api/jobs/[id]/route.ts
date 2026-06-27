import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "hr_manager", "hod"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { recruiter_ids, ...jobData } = body;

  const { data, error } = await supabase
    .from("jobs")
    .update({ ...jobData, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(recruiter_ids)) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: active } = await supabase
      .from("job_recruiters")
      .select("id,recruiter_id")
      .eq("job_id", id)
      .is("assigned_until", null);
    const activeRows = active ?? [];
    const activeIds = activeRows.map((row) => row.recruiter_id);
    const incomingIds = recruiter_ids as string[];
    const toClose = activeRows.filter((row) => !incomingIds.includes(row.recruiter_id)).map((row) => row.id);
    if (toClose.length) {
      await supabase.from("job_recruiters").update({ assigned_until: today }).in("id", toClose);
    }
    const toAdd = incomingIds.filter((rid) => !activeIds.includes(rid));
    if (toAdd.length) {
      await supabase.from("job_recruiters").insert(
        toAdd.map((rid: string) => ({
          job_id: id, recruiter_id: rid, assigned_by: user.id, assigned_from: today,
        }))
      );
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const { error } = await supabase.from("jobs").update({ is_deleted: true }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
