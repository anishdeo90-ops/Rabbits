import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { maskKey } from "@/lib/ai-client";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = ["admin", "hr_manager"].includes(profile?.role ?? "");

  const { data: personal } = await supabase
    .from("ai_settings")
    .select("id, provider, model, label, is_active, last_tested_at, last_test_ok, api_key")
    .eq("user_id", user.id)
    .eq("scope", "personal")
    .maybeSingle();

  const { data: org } = await supabase
    .from("ai_settings")
    .select("id, provider, model, label, is_active, last_tested_at, last_test_ok, api_key")
    .eq("scope", "org")
    .maybeSingle();

  const envKey = process.env.ANTHROPIC_API_KEY;
  const hasEnvKey = Boolean(envKey && envKey !== "your-anthropic-api-key-here");

  const maskRow = (row: { id: string; provider: string; model: string | null; label: string | null; is_active: boolean; last_tested_at: string | null; last_test_ok: boolean | null; api_key: string } | null) =>
    row ? {
      id:             row.id,
      provider:       row.provider,
      model:          row.model,
      label:          row.label,
      is_active:      row.is_active,
      last_tested_at: row.last_tested_at,
      last_test_ok:   row.last_test_ok,
      key_last4:      row.api_key?.slice(-4),
      key_masked:     maskKey(row.api_key ?? ""),
    } : null;

  return NextResponse.json({
    data: {
      personal:     maskRow(personal),
      org:          maskRow(org),
      env_fallback: hasEnvKey ? { provider: "anthropic", model: "claude-opus-4-5" } : null,
      is_admin:     isAdmin,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { scope, provider, api_key, model, label } = body;

  if (!scope || !provider || !api_key)
    return NextResponse.json({ error: "scope, provider, api_key required" }, { status: 400 });
  if (!["personal", "org"].includes(scope))
    return NextResponse.json({ error: "scope must be personal or org" }, { status: 400 });
  if (!["anthropic", "openai", "gemini"].includes(provider))
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

  if (scope === "org") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!["admin", "hr_manager"].includes(profile?.role ?? ""))
      return NextResponse.json({ error: "Only admins can set org-wide AI key" }, { status: 403 });
  }

  const payload = {
    scope,
    provider,
    api_key,
    model: model || null,
    label: label || null,
    is_active: true,
    updated_at: new Date().toISOString(),
    user_id: scope === "personal" ? user.id : null,
  };

  const { data: existing } = await supabase
    .from("ai_settings")
    .select("id")
    .eq("scope", scope)
    .eq(scope === "personal" ? "user_id" : "is_active", scope === "personal" ? user.id : true)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase.from("ai_settings").update(payload).eq("id", existing.id).select("id, provider, model, label, is_active, api_key").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { ...data, api_key: undefined, key_last4: data.api_key?.slice(-4) } });
  } else {
    const { data, error } = await supabase.from("ai_settings").insert(payload).select("id, provider, model, label, is_active, api_key").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { ...data, api_key: undefined, key_last4: data.api_key?.slice(-4) } });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = new URL(req.url).searchParams.get("scope") ?? "personal";

  if (scope === "org") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!["admin", "hr_manager"].includes(profile?.role ?? ""))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await supabase.from("ai_settings").delete().eq("scope", "org");
  } else {
    await supabase.from("ai_settings").delete().eq("user_id", user.id).eq("scope", "personal");
  }

  return NextResponse.json({ success: true });
}
