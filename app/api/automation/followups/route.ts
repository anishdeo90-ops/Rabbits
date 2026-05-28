import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/automation/http";

export async function GET(req: NextRequest) {
  const { supabase, user, profile, response } = await requireUser();
  if (response) return response;
  const p = new URL(req.url).searchParams;
  let query = supabase
    .from("candidate_followups")
    .select("*, automation_rules(id,name,action_type,trigger_type), candidate:candidates(id,name,created_by,hr_id)")
    .order("scheduled_at", { ascending: false });
  if (p.get("candidate_id")) query = query.eq("candidate_id", p.get("candidate_id"));
  if (p.get("status")) query = query.eq("status", p.get("status"));
  if (p.get("rule_id")) query = query.eq("rule_id", p.get("rule_id"));

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (profile?.role === "recruiter") {
    const ids = rows.map((row) => row.candidate_id);
    const { data: coSourcers } = await supabase.from("co_sourcers").select("candidate_id").in("candidate_id", ids).eq("recruiter_id", user!.id);
    const coSourced = new Set((coSourcers ?? []).map((row) => row.candidate_id));
    rows = rows.filter((row) => row.candidate?.created_by === user!.id || row.candidate?.hr_id === user!.id || coSourced.has(row.candidate_id));
  }
  return NextResponse.json({ data: rows });
}
