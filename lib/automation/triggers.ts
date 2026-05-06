import { createAdminClient } from "@/lib/supabase/server";
import type { AutomationRule, Candidate, Interview } from "@/lib/types";

const TERMINAL_STAGES = new Set(["Joined", "Rejected/Dropped"]);

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function queueRule(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  candidateId: string,
  rule: Pick<AutomationRule, "id" | "delay_hours">,
  context: Record<string, unknown>
) {
  const { data: existing } = await supabase
    .from("candidate_followups")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("rule_id", rule.id)
    .eq("status", "pending")
    .limit(1);

  if (existing?.length) return null;

  const { data } = await supabase
    .from("candidate_followups")
    .insert({
      candidate_id: candidateId,
      rule_id: rule.id,
      scheduled_at: hoursFromNow(rule.delay_hours ?? 0),
      trigger_context: { ...context, triggered_at: new Date().toISOString() },
    })
    .select()
    .single();

  return data;
}

export async function cancelPendingFollowups(candidateId: string) {
  const supabase = await createAdminClient();
  await supabase
    .from("candidate_followups")
    .update({ status: "cancelled", updated_at: new Date().toISOString(), result: { reason: "terminal_stage" } })
    .eq("candidate_id", candidateId)
    .eq("status", "pending");
}

export async function enqueueStageChangeTriggers(candidateId: string, stage: string, existingCandidate?: Partial<Candidate> | null) {
  const supabase = await createAdminClient();
  if (TERMINAL_STAGES.has(stage)) await cancelPendingFollowups(candidateId);

  const triggerType = stage === "Joined" ? "candidate_joined" : "stage_change";
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .eq("trigger_type", triggerType)
    .order("sort_order");

  for (const rule of (rules ?? []) as AutomationRule[]) {
    const wantedStage = typeof rule.conditions?.stage === "string" ? rule.conditions.stage : null;
    if (triggerType === "stage_change" && wantedStage && wantedStage !== stage) continue;
    await queueRule(supabase, candidateId, rule, {
      trigger: triggerType,
      stage,
      previous_stage: existingCandidate?.final_status ?? null,
    });
  }
}

export async function enqueueInterviewTriggers(interview: Partial<Interview> & { candidate_id: string }) {
  const supabase = await createAdminClient();
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .eq("trigger_type", "interview_scheduled")
    .order("sort_order");

  for (const rule of (rules ?? []) as AutomationRule[]) {
    await queueRule(supabase, interview.candidate_id, rule, {
      trigger: "interview_scheduled",
      interview_id: interview.id,
      interview_round: interview.round,
      scheduled_at: interview.scheduled_at,
    });
  }
}

export async function enqueueOfferTriggers(candidateId: string, offerId?: string | null) {
  const supabase = await createAdminClient();
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .in("trigger_type", ["offer_sent_no_response"])
    .order("sort_order");

  for (const rule of (rules ?? []) as AutomationRule[]) {
    const hours = Number(rule.conditions?.hours ?? rule.delay_hours ?? 0);
    await queueRule(supabase, candidateId, { ...rule, delay_hours: hours }, {
      trigger: "offer_sent_no_response",
      offer_id: offerId ?? null,
    });
  }
}
