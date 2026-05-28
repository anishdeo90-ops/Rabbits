import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = ["admin", "hr_manager"].includes(profile?.role ?? "");

  const p = new URL(req.url).searchParams;
  const status = p.get("status");

  let query = supabase
    .from("deletion_requests")
    .select(`
      *,
      candidate:candidates!deletion_requests_candidate_id_fkey(id, name, mobile),
      requester:profiles!deletion_requests_requested_by_fkey(id, name)
    `)
    .order("created_at", { ascending: false });

  if (!isAdmin) query = query.eq("requested_by", user.id);
  if (status)   query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((r) => ({
    ...r,
    candidate_name: (r.candidate as { name: string } | null)?.name,
    requester_name: (r.requester as { name: string } | null)?.name,
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { candidate_id, reason, notes } = body;

  if (!candidate_id || !reason) {
    return NextResponse.json({ error: "candidate_id and reason required" }, { status: 400 });
  }

  // Check for existing pending request
  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id")
    .eq("candidate_id", candidate_id)
    .eq("status", "pending")
    .single();

  if (existing) {
    return NextResponse.json({ error: "A pending deletion request already exists for this candidate" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("deletion_requests")
    .insert({ candidate_id, reason, notes, requested_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
