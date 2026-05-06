import { NextRequest, NextResponse } from "next/server";
import { automationSchemaError, cleanPatch, forbidden, requireUser } from "@/lib/automation/http";

const FIELDS = ["twilio_account_sid","twilio_auth_token","twilio_whatsapp_from","resend_api_key","resend_from_email","resend_from_name","is_live","company_name","daily_digest_time","weekly_digest_day"];

function mask(value?: string | null) {
  if (!value) return "";
  if (value.includes("...")) return value;
  return `${value.slice(0, 8)}...`;
}

export async function GET() {
  const { supabase, response } = await requireUser();
  if (response) return response;
  let { data, error } = await supabase.from("automation_settings").select("*").limit(1).maybeSingle();
  const schemaError = automationSchemaError(error);
  if (schemaError) return schemaError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    const created = await supabase.from("automation_settings").insert({ is_live: false }).select("*").single();
    const createSchemaError = automationSchemaError(created.error);
    if (createSchemaError) return createSchemaError;
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    data = created.data;
  }
  return NextResponse.json({ data: data ? { ...data, twilio_auth_token: mask(data.twilio_auth_token), resend_api_key: mask(data.resend_api_key) } : null });
}

export async function PATCH(req: NextRequest) {
  const { supabase, user, profile, response } = await requireUser();
  if (response) return response;
  if (profile?.role !== "admin") return forbidden();
  const body = cleanPatch(await req.json(), FIELDS);
  for (const key of ["twilio_auth_token", "resend_api_key"] as const) {
    if (typeof body[key] === "string" && String(body[key]).includes("...")) delete body[key];
  }
  const { data: existing } = await supabase.from("automation_settings").select("id").limit(1).maybeSingle();
  const payload = { ...body, updated_by: user!.id };
  const { data, error } = existing?.id
    ? await supabase.from("automation_settings").update(payload).eq("id", existing.id).select().single()
    : await supabase.from("automation_settings").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { ...data, twilio_auth_token: mask(data.twilio_auth_token), resend_api_key: mask(data.resend_api_key) } });
}
