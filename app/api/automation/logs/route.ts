import { NextRequest, NextResponse } from "next/server";
import { forbidden, isAutomationManager, requireUser } from "@/lib/automation/http";

export async function GET(req: NextRequest) {
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const p = new URL(req.url).searchParams;
  let query = supabase
    .from("communication_logs")
    .select("*, candidate:candidates(id,name), rule:automation_rules(id,name)")
    .order("created_at", { ascending: false });
  if (p.get("candidate_id")) query = query.eq("candidate_id", p.get("candidate_id"));
  if (p.get("status")) query = query.eq("status", p.get("status"));
  if (p.get("channel")) query = query.eq("channel", p.get("channel"));
  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
