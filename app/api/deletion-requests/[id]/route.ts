import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH: admin approves or rejects a deletion request
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden — admin/hr_manager only" }, { status: 403 });
  }

  const body = await req.json();
  const { status, review_notes } = body;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be approved or rejected" }, { status: 400 });
  }

  // Fetch the request
  const { data: dr } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (!dr) return NextResponse.json({ error: "Request not found or already reviewed" }, { status: 404 });

  // Update request
  const { data, error } = await supabase
    .from("deletion_requests")
    .update({ status, review_notes, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If approved, soft-delete the candidate
  if (status === "approved") {
    await supabase.from("candidates").update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    }).eq("id", dr.candidate_id);
  }

  return NextResponse.json({ data });
}
