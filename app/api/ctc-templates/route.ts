import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: list all custom templates (system templates are defined client-side)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ctc_templates")
    .select("*")
    .eq("is_active", true)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST: create a custom template
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? ""))
    return NextResponse.json({ error: "Only HR Managers can create CTC templates" }, { status: 403 });

  const body = await req.json();
  const { label, name, description, components } = body;
  if (!label || !name) return NextResponse.json({ error: "label and name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("ctc_templates")
    .insert({ label, name, description, components: components ?? [], created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// PATCH: update custom template
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Prevent editing system templates
  const { data: tpl } = await supabase.from("ctc_templates").select("is_system").eq("id", id).single();
  if (tpl?.is_system) return NextResponse.json({ error: "System templates cannot be modified" }, { status: 403 });

  const { data, error } = await supabase
    .from("ctc_templates")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
