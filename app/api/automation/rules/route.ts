import { NextRequest, NextResponse } from "next/server";
import { automationSchemaError, cleanPatch, forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

const FIELDS = ["name","description","is_active","trigger_type","conditions","action_type","template_id","action_config","delay_hours","max_per_candidate","cooldown_hours","sort_order"];

export async function GET() {
  const { supabase, response } = await requireUser();
  if (response) return response;
  const { data, error } = await supabase.from("automation_rules").select("*, template:message_templates(*)").order("sort_order");
  const schemaError = automationSchemaError(error);
  if (schemaError) return schemaError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const body = cleanPatch(await req.json(), FIELDS);
  const { data, error } = await supabase.from("automation_rules").insert({ ...body, created_by: user!.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
