import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return { supabase, user, profile: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { supabase, user, profile: profile as Profile, response: null };
}

export function isAutomationManager(role?: string | null) {
  return role === "admin" || role === "hr_manager";
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function automationSchemaError(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  const message = error.message ?? "";
  if (error.code !== "42P01" && !message.includes("does not exist")) return null;

  return NextResponse.json(
    {
      error:
        "Automation database tables are missing. Run supabase/migrations/20260506090000_followup_automation.sql, then reload /automation.",
    },
    { status: 500 },
  );
}

export function cleanPatch<T extends Record<string, unknown>>(body: T, allowed: string[]) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
}
