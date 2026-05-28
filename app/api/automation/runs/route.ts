import { NextRequest, NextResponse } from "next/server";
import { forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

export async function GET(req: NextRequest) {
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 50), 200);
  const { data, error } = await supabase.from("automation_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
