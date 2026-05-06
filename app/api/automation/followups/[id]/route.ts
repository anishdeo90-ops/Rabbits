import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/automation/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, response } = await requireUser();
  if (response) return response;
  const { data, error } = await supabase
    .from("candidate_followups")
    .update({ status: "cancelled", executed_at: new Date().toISOString(), result: { reason: "manual_cancel" } })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
