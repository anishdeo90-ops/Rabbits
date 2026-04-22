import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch full candidate row for fields not in view
  const { data: full } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

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
  if (profile.role === 'recruiter') {
    const { data: existing } = await supabase
      .from('candidates').select('created_by,hr_id').eq('id', id).single();
    if (!existing || (existing.created_by !== user.id && existing.hr_id !== user.id))
      return NextResponse.json({ error: "You can only edit your own candidates" }, { status: 403 });
  }

  const body = await req.json();

  // Always blocked for everyone: is_deleted, deleted_at, deleted_by
  ["is_deleted", "deleted_at", "deleted_by"].forEach(f => delete body[f]);

  // Strip view-computed / read-only fields (never writable to candidates table)
  const readOnly = ["hr_name","site_name","designation_name","source_name","co_sourcer_names",
                    "sr_no","tel_int_done","gf_sent","gf_received","shortlisted_hr","pi_done",
                    "pi2_done","pi3_done","shortlisted_mgmt","gf_issued_flag","gf_recv","appointed",
                    "joined","offered_not_joined"];
  readOnly.forEach(f => delete body[f]);

  const { data, error } = await supabase
    .from("candidates")
    .update({ ...body, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
