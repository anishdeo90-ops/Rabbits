import { NextRequest, NextResponse } from "next/server";
import { isAutomationManager, requireUser, forbidden } from "@/lib/automation/http";
import { resolveTemplate } from "@/lib/automation/resolve-template";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { supabase, profile, response } = await requireUser();
  if (response) return response;
  if (!isAutomationManager(profile?.role)) return forbidden();
  const { candidate_id } = await req.json();
  if (!candidate_id) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });
  const [{ data: rule }, { data: candidate }, { data: settings }] = await Promise.all([
    supabase.from("automation_rules").select("*, template:message_templates(*)").eq("id", id).single(),
    supabase.from("candidates").select("*, designation:masters!candidates_designation_id_fkey(name), site:masters!candidates_site_id_fkey(name)").eq("id", candidate_id).single(),
    supabase.from("automation_settings").select("*").limit(1).single(),
  ]);
  if (!rule || !candidate) return NextResponse.json({ error: "Rule or candidate not found" }, { status: 404 });
  const template = Array.isArray(rule.template) ? rule.template[0] : rule.template;
  const body = resolveTemplate(template?.body ?? rule.description ?? rule.name, {
    candidate,
    settings,
    designationName: candidate.designation?.name,
    siteName: candidate.site?.name,
    stage: candidate.final_status,
  });
  const subject = resolveTemplate(template?.subject ?? rule.name, { candidate, settings });
  return NextResponse.json({ data: { subject, body, channel: rule.action_config?.channel ?? template?.channel, rule } });
}
