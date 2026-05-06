import { NextRequest, NextResponse } from "next/server";
import { cleanPatch, forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

const FIELDS = ["name","description","is_active","trigger_type","conditions","action_type","template_id","action_config","delay_hours","max_per_candidate","cooldown_hours","sort_order"];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const body = cleanPatch(await req.json(), FIELDS);
  const { data, error } = await supabase.from("automation_rules").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  await supabase.from("candidate_followups").update({ status: "cancelled" }).eq("rule_id", id).eq("status", "pending");
  const { error } = await supabase.from("automation_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
