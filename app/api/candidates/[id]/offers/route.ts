import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: fetch offers for a candidate
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("candidate_offers")
    .select("*")
    .eq("candidate_id", id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST: create a new offer
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "hod") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("candidate_offers")
    .insert({ ...body, candidate_id: id, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// PATCH: update an offer
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const body = await req.json();
  const { offer_id, ...updates } = body;
  if (!offer_id) return NextResponse.json({ error: "offer_id required" }, { status: 400 });

  // Check lock: only hr_manager/admin can edit a locked offer
  const { data: existing } = await supabase
    .from("candidate_offers").select("locked_at, status").eq("id", offer_id).single();

  if (existing?.locked_at && !["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Offer is locked. Only HR Manager can edit." }, { status: 403 });
  }

  // Lock when offer is sent
  const patch: Record<string, unknown> = { ...updates, updated_by: user.id, updated_at: new Date().toISOString() };
  if (updates.status === "offer_sent" && !existing?.locked_at) {
    patch.locked_at = new Date().toISOString();
    patch.locked_by = user.id;
    if (!updates.offer_sent_at) patch.offer_sent_at = new Date().toISOString();
  }
  if (updates.status === "ctc_sent" && !updates.ctc_sent_at) {
    patch.ctc_sent_at = new Date().toISOString();
  }
  if (updates.status === "ctc_confirmed" && !updates.ctc_confirmed_at) {
    patch.ctc_confirmed_at = new Date().toISOString();
  }
  if (updates.status === "offer_confirmed" && !updates.offer_confirmed_at) {
    patch.offer_confirmed_at = new Date().toISOString();
  }
  if (updates.status === "joined" && !updates.joined_at) {
    patch.joined_at = new Date().toISOString().slice(0, 10);
  }

  // When offer is confirmed, also update candidate's final_status to "Offered"
  if (updates.status === "offer_confirmed") {
    await supabase.from("candidates").update({
      final_status: "Offered",
      offered_salary: updates.annual_ctc ?? null,
      updated_by: user.id,
    }).eq("id", id);
  }

  // When joined, update candidate's final_status to "Joined"
  if (updates.status === "joined") {
    await supabase.from("candidates").update({
      final_status: "Joined",
      doj_actual: patch.joined_at ?? null,
      updated_by: user.id,
    }).eq("id", id);
  }

  const { data, error } = await supabase
    .from("candidate_offers")
    .update(patch)
    .eq("id", offer_id)
    .eq("candidate_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE: soft-delete an offer
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? ""))
    return NextResponse.json({ error: "Only HR Managers can delete offers" }, { status: 403 });

  const offerId = new URL(req.url).searchParams.get("offer_id");
  if (!offerId) return NextResponse.json({ error: "offer_id required" }, { status: 400 });

  const { error } = await supabase
    .from("candidate_offers")
    .update({ is_deleted: true })
    .eq("id", offerId)
    .eq("candidate_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
