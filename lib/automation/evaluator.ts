import { createAdminClient } from "@/lib/supabase/server";
import type { AutomationRule, AutomationSettings, Candidate, CandidateFollowup, CandidateOffer, Interview, MessageTemplate, Profile } from "@/lib/types";
import { resolveTemplate } from "@/lib/automation/resolve-template";
import { sendEmail } from "@/lib/automation/providers/email";
import { normalizeWhatsAppNumber, sendWhatsApp } from "@/lib/automation/providers/whatsapp";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;
type Mode = "live" | "dry_run";

const TERMINAL_STAGES = new Set(["Joined", "Rejected/Dropped"]);

interface Counts {
  evaluated: number;
  sent: number;
  skipped: number;
  failed: number;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function getSettings(supabase: SupabaseAdmin) {
  const { data } = await supabase.from("automation_settings").select("*").limit(1).maybeSingle();
  if (data) return data as AutomationSettings;
  const { data: created } = await supabase.from("automation_settings").insert({ is_live: false }).select("*").single();
  return created as AutomationSettings;
}

async function getCandidateContext(supabase: SupabaseAdmin, candidateId: string, context: Record<string, unknown>) {
  const [{ data: candidate }, { data: offer }, { data: interview }] = await Promise.all([
    supabase.from("candidates").select("*, designation:masters!candidates_designation_id_fkey(name), site:masters!candidates_site_id_fkey(name), job:jobs(title)").eq("id", candidateId).maybeSingle(),
    supabase.from("candidate_offers").select("*").eq("candidate_id", candidateId).eq("is_deleted", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    context.interview_id
      ? supabase.from("interviews").select("*").eq("id", String(context.interview_id)).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const typedCandidate = candidate as (Candidate & { designation?: { name?: string }; site?: { name?: string }; job?: { title?: string } }) | null;
  const recruiterId = typedCandidate?.hr_id ?? typedCandidate?.created_by ?? null;
  const [{ data: recruiter }, { data: managers }] = await Promise.all([
    recruiterId ? supabase.from("profiles").select("*").eq("id", recruiterId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("*").eq("role", "hr_manager").eq("is_active", true).limit(1),
  ]);

  let interviewer: Profile | null = null;
  const typedInterview = interview as Interview | null;
  if (typedInterview?.interviewer_id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", typedInterview.interviewer_id).maybeSingle();
    interviewer = data as Profile | null;
  }

  return {
    candidate: typedCandidate,
    offer: offer as CandidateOffer | null,
    interview: typedInterview,
    recruiter: recruiter as Profile | null,
    hrManager: ((managers ?? []) as Profile[])[0] ?? null,
    interviewer,
    designationName: typedCandidate?.designation?.name ?? typedCandidate?.current_designation ?? null,
    siteName: typedCandidate?.site?.name ?? null,
    jobTitle: typedCandidate?.job?.title ?? typedCandidate?.designation?.name ?? null,
  };
}

async function logCommunication(
  supabase: SupabaseAdmin,
  payload: {
    followup: CandidateFollowup;
    rule: AutomationRule;
    channel: string;
    recipientType: string;
    recipientId?: string | null;
    recipientPhone?: string | null;
    recipientEmail?: string | null;
    subject?: string | null;
    body: string;
    status: "success" | "failed" | "skipped" | "dry_run";
    providerMessageId?: string | null;
    providerResponse?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }
) {
  await supabase.from("communication_logs").insert({
    followup_id: payload.followup.id,
    rule_id: payload.rule.id,
    candidate_id: payload.followup.candidate_id,
    channel: payload.channel,
    recipient_type: payload.recipientType,
    recipient_id: payload.recipientId ?? null,
    recipient_phone: payload.recipientPhone ?? null,
    recipient_email: payload.recipientEmail ?? null,
    subject: payload.subject ?? null,
    body: payload.body,
    status: payload.status,
    provider_message_id: payload.providerMessageId ?? null,
    provider_response: payload.providerResponse ?? null,
    error_message: payload.errorMessage ?? null,
  });
}

async function writeCandidateCommunication(supabase: SupabaseAdmin, followup: CandidateFollowup, rule: AutomationRule, channel: string, subject: string | null, body: string) {
  if (channel !== "whatsapp" && channel !== "email") return;
  await supabase.from("candidate_communications").insert({
    candidate_id: followup.candidate_id,
    type: channel,
    direction: "sent",
    subject,
    content: body,
    template_used: rule.name,
    created_by: null,
    communicated_at: new Date().toISOString(),
  });
}

async function markFollowup(supabase: SupabaseAdmin, followup: CandidateFollowup, status: string, result?: Record<string, unknown>, error?: string) {
  await supabase.from("candidate_followups").update({
    status,
    executed_at: new Date().toISOString(),
    result: result ?? {},
    error_message: error ?? null,
  }).eq("id", followup.id);
}

async function processFollowup(supabase: SupabaseAdmin, followup: CandidateFollowup, settings: AutomationSettings, requestedMode: Mode): Promise<"sent" | "skipped" | "failed"> {
  const rule = followup.automation_rules as AutomationRule | undefined;
  if (!rule) {
    await markFollowup(supabase, followup, "failed", {}, "Automation rule missing");
    return "failed";
  }

  if (rule.action_type === "stop_all_followups") {
    await supabase.from("candidate_followups").update({ status: "cancelled" }).eq("candidate_id", followup.candidate_id).eq("status", "pending").neq("id", followup.id);
    await markFollowup(supabase, followup, "sent", { stopped: true });
    return "sent";
  }

  const context = jsonObject(followup.trigger_context);
  const full = await getCandidateContext(supabase, followup.candidate_id, context);
  if (!full.candidate) {
    await markFollowup(supabase, followup, "failed", {}, "Candidate missing");
    return "failed";
  }
  if (full.candidate.final_status === "On Hold") return "skipped";
  if (TERMINAL_STAGES.has(full.candidate.final_status ?? "")) {
    await markFollowup(supabase, followup, "cancelled", { reason: "terminal_stage" });
    return "skipped";
  }

  const [{ count: sentCount }, { data: recent }] = await Promise.all([
    supabase.from("candidate_followups").select("id", { count: "exact", head: true }).eq("candidate_id", followup.candidate_id).eq("rule_id", rule.id).eq("status", "sent"),
    supabase.from("candidate_followups").select("executed_at").eq("candidate_id", followup.candidate_id).eq("rule_id", rule.id).eq("status", "sent").order("executed_at", { ascending: false }).limit(1),
  ]);
  if ((sentCount ?? 0) >= rule.max_per_candidate) {
    await markFollowup(supabase, followup, "skipped", { reason: "max_per_candidate" });
    return "skipped";
  }
  const lastExecutedAt = recent?.[0]?.executed_at ? new Date(recent[0].executed_at).getTime() : 0;
  if (lastExecutedAt && Date.now() - lastExecutedAt < rule.cooldown_hours * 60 * 60 * 1000) {
    await markFollowup(supabase, followup, "skipped", { reason: "cooldown" });
    return "skipped";
  }

  const template = rule.template as MessageTemplate | null | undefined;
  const channel = String(rule.action_config?.channel ?? template?.channel ?? "email");
  const body = resolveTemplate(template?.body ?? rule.description ?? rule.name, {
    ...full,
    settings,
    stage: String(context.stage ?? full.candidate.final_status ?? ""),
  });
  const subject = resolveTemplate(template?.subject ?? rule.name, { ...full, settings });

  let recipientType = "candidate";
  let recipientId: string | null = null;
  let recipientEmail: string | null = null;
  let recipientPhone: string | null = null;

  if (rule.action_type === "notify_recruiter") {
    recipientType = "recruiter";
    recipientId = full.recruiter?.id ?? null;
    recipientEmail = full.recruiter?.email ?? null;
  } else if (rule.action_type === "notify_hr_manager") {
    recipientType = "hr_manager";
    recipientId = full.hrManager?.id ?? null;
    recipientEmail = full.hrManager?.email ?? null;
  } else if (rule.action_type === "notify_interviewer") {
    recipientType = "interviewer";
    recipientId = full.interviewer?.id ?? null;
    recipientEmail = full.interviewer?.email ?? null;
  } else if (channel === "email") {
    recipientEmail = full.candidate.email ?? null;
  } else {
    recipientPhone = normalizeWhatsAppNumber(full.candidate.mobile);
  }

  if (channel === "whatsapp" && !recipientPhone) {
    await logCommunication(supabase, { followup, rule, channel, recipientType, recipientId, recipientPhone, subject, body, status: "skipped", errorMessage: "no_phone_number" });
    await markFollowup(supabase, followup, "skipped", { reason: "no_phone_number" });
    return "skipped";
  }
  if (channel === "email" && !recipientEmail) {
    await logCommunication(supabase, { followup, rule, channel, recipientType, recipientId, recipientEmail, subject, body, status: "skipped", errorMessage: "no_email" });
    await markFollowup(supabase, followup, "skipped", { reason: "no_email" });
    return "skipped";
  }

  const effectiveMode: Mode = requestedMode === "dry_run" || !settings.is_live ? "dry_run" : "live";
  if (effectiveMode === "dry_run") {
    await logCommunication(supabase, { followup, rule, channel, recipientType, recipientId, recipientPhone, recipientEmail, subject, body, status: "dry_run" });
    await markFollowup(supabase, followup, "sent", { dry_run: true, channel, to: recipientEmail ?? recipientPhone });
    return "sent";
  }

  try {
    const result = channel === "whatsapp"
      ? await sendWhatsApp(settings, recipientPhone!, body)
      : await sendEmail(settings, recipientEmail!, subject, body);
    await logCommunication(supabase, { followup, rule, channel, recipientType, recipientId, recipientPhone, recipientEmail, subject, body, status: "success", providerMessageId: result.messageId, providerResponse: result.response });
    await writeCandidateCommunication(supabase, followup, rule, channel, subject, body);
    await markFollowup(supabase, followup, "sent", { provider_message_id: result.messageId, channel, to: recipientEmail ?? recipientPhone });
    return "sent";
  } catch (error) {
    const err = error as Error & { status?: number; response?: Record<string, unknown> };
    if (err.status === 429) {
      await supabase.from("candidate_followups").update({ scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), error_message: err.message }).eq("id", followup.id);
      return "skipped";
    }
    await logCommunication(supabase, { followup, rule, channel, recipientType, recipientId, recipientPhone, recipientEmail, subject, body, status: "failed", providerResponse: err.response, errorMessage: err.message });
    await markFollowup(supabase, followup, "failed", {}, err.message);
    return "failed";
  }
}

async function queueIfNone(supabase: SupabaseAdmin, candidateId: string, rule: AutomationRule, scheduledAt: string, context: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from("candidate_followups")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("rule_id", rule.id)
    .eq("status", "pending")
    .limit(1);
  if (existing?.length) return;
  await supabase.from("candidate_followups").insert({ candidate_id: candidateId, rule_id: rule.id, scheduled_at: scheduledAt, trigger_context: context });
}

async function evaluateNoContact(supabase: SupabaseAdmin) {
  const { data: rules } = await supabase.from("automation_rules").select("*").eq("is_active", true).eq("trigger_type", "no_recruiter_contact");
  for (const rule of (rules ?? []) as AutomationRule[]) {
    const stage = typeof rule.conditions.stage === "string" ? rule.conditions.stage : null;
    const hours = Number(rule.conditions.hours ?? 24);
    let query = supabase.from("candidates").select("id, final_status, created_at").eq("is_deleted", false);
    if (stage) query = query.eq("final_status", stage);
    const { data: candidates } = await query.limit(200);
    for (const candidate of (candidates ?? []) as Candidate[]) {
      if (TERMINAL_STAGES.has(candidate.final_status ?? "") || candidate.final_status === "On Hold") continue;
      const { data: comm } = await supabase.from("candidate_communications").select("communicated_at, created_at").eq("candidate_id", candidate.id).order("communicated_at", { ascending: false }).limit(1);
      const last = comm?.[0]?.communicated_at ?? comm?.[0]?.created_at ?? candidate.created_at;
      if (Date.now() - new Date(last).getTime() >= hours * 60 * 60 * 1000) {
        await queueIfNone(supabase, candidate.id, rule, new Date().toISOString(), { trigger: "no_recruiter_contact", stage, hours });
      }
    }
  }
}

async function evaluateInterviewUpcoming(supabase: SupabaseAdmin) {
  const { data: rules } = await supabase.from("automation_rules").select("*").eq("is_active", true).eq("trigger_type", "interview_upcoming");
  if (!rules?.length) return;
  const { data: interviews } = await supabase
    .from("interviews")
    .select("*")
    .in("status", ["scheduled", "confirmed"])
    .gte("scheduled_at", new Date().toISOString())
    .limit(300);
  for (const interview of (interviews ?? []) as Interview[]) {
    for (const rule of rules as AutomationRule[]) {
      const hoursBefore = Number(rule.conditions.hours_before ?? 24);
      const fireAt = new Date(new Date(interview.scheduled_at).getTime() - hoursBefore * 60 * 60 * 1000);
      if (fireAt.getTime() < Date.now() - 15 * 60 * 1000) continue;
      await queueIfNone(supabase, interview.candidate_id, rule, fireAt.toISOString(), { trigger: "interview_upcoming", interview_id: interview.id, hours_before: hoursBefore });
    }
  }
}

async function evaluateOfferNotJoined(supabase: SupabaseAdmin) {
  const { data: rules } = await supabase.from("automation_rules").select("*").eq("is_active", true).eq("trigger_type", "offer_not_joined");
  for (const rule of (rules ?? []) as AutomationRule[]) {
    const days = Number(rule.conditions.days ?? 14);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates } = await supabase.from("candidates").select("id").eq("is_deleted", false).eq("final_status", "Offered But Not Joined").lt("updated_at", cutoff).limit(100);
    for (const candidate of (candidates ?? []) as Candidate[]) {
      await queueIfNone(supabase, candidate.id, rule, new Date().toISOString(), { trigger: "offer_not_joined", days });
    }
  }
}

export async function runEvaluator(mode: Mode = "live") {
  const supabase = await createAdminClient();
  const settings = await getSettings(supabase);
  const counts: Counts = { evaluated: 0, sent: 0, skipped: 0, failed: 0 };
  const { data: run } = await supabase.from("automation_runs").insert({ mode }).select("id").single();

  try {
    await evaluateNoContact(supabase);
    await evaluateInterviewUpcoming(supabase);
    await evaluateOfferNotJoined(supabase);

    const { data: followups, error } = await supabase
      .from("candidate_followups")
      .select("*, automation_rules(*, template:message_templates(*))")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    for (const followup of (followups ?? []) as CandidateFollowup[]) {
      counts.evaluated += 1;
      const result = await processFollowup(supabase, followup, settings, mode);
      if (result === "sent") counts.sent += 1;
      else if (result === "skipped") counts.skipped += 1;
      else counts.failed += 1;
    }

    if (run?.id) {
      await supabase.from("automation_runs").update({
        finished_at: new Date().toISOString(),
        followups_evaluated: counts.evaluated,
        followups_sent: counts.sent,
        followups_skipped: counts.skipped,
        followups_failed: counts.failed,
      }).eq("id", run.id);
    }
    return { ...counts, run_id: run?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation evaluator failed";
    if (run?.id) await supabase.from("automation_runs").update({ finished_at: new Date().toISOString(), error_message: message }).eq("id", run.id);
    throw error;
  }
}
