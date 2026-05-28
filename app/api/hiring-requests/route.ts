import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  let q = supabase
    .from("hiring_requests")
    .select("*, requester:profiles!requested_by(name), reviewer:profiles!reviewed_by(name), designation:masters!designation_id(name), site:masters!site_id(name)")
    .order("created_at", { ascending: false });

  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) {
    q = q.eq("requested_by", user.id);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, designation_id, site_id, headcount, urgency, description } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("hiring_requests")
    .insert({ title, designation_id: designation_id || null, site_id: site_id || null, headcount: headcount ?? 1, urgency: urgency ?? "normal", description: description || null, requested_by: user.id })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, review_notes } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  const { data, error } = await supabase
    .from("hiring_requests")
    .update({ status, review_notes: review_notes || null, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
