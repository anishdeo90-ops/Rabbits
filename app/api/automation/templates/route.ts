import { NextRequest, NextResponse } from "next/server";
import { automationSchemaError, cleanPatch, forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

const FIELDS = ["name","channel","subject","body","variables","category","is_active"];

export async function GET(req: NextRequest) {
  const { supabase, response } = await requireUser();
  if (response) return response;
  const p = new URL(req.url).searchParams;
  let query = supabase.from("message_templates").select("*").order("category").order("name");
  if (p.get("channel")) query = query.eq("channel", p.get("channel"));
  if (p.get("category")) query = query.eq("category", p.get("category"));
  if (p.get("is_active")) query = query.eq("is_active", p.get("is_active") === "true");
  const { data, error } = await query;
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
  const { data, error } = await supabase.from("message_templates").insert({ ...body, created_by: user!.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
