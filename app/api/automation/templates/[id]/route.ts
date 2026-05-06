import { NextRequest, NextResponse } from "next/server";
import { cleanPatch, forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

const FIELDS = ["name","channel","subject","body","variables","category","is_active"];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const body = cleanPatch(await req.json(), FIELDS);
  const { data: existing } = await supabase.from("message_templates").select("is_system").eq("id", id).single();
  if (existing?.is_system && profile?.role !== "admin") {
    delete body.name; delete body.body; delete body.subject;
  }
  const { data, error } = await supabase.from("message_templates").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const { data: existing } = await supabase.from("message_templates").select("is_system").eq("id", id).single();
  if (existing?.is_system) return NextResponse.json({ error: "System templates cannot be deleted" }, { status: 400 });
  const { error } = await supabase.from("message_templates").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
