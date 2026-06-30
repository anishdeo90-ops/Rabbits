import type { createAdminClient } from "@/lib/supabase/server";

export const MANUAL_WORKFLOW_TRIGGER = "manual_workflow";
export const WORKFLOW_ACTION_TYPE = "gmail_email";
export const DEFAULT_DRIP_INTERVAL_MINUTES = 3;

export type SupabaseAdminClient = Awaited<ReturnType<typeof createAdminClient>>;

export type ProfileRole = "admin" | "hr_manager" | "recruiter" | "hod" | "candidate";

export type WorkflowActionConfig = {
  workflow_key?: string;
  drip_interval_minutes?: number;
  [key: string]: unknown;
};

export type WorkflowRule = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  conditions: Record<string, unknown> | null;
  action_type: string | null;
  action_config: WorkflowActionConfig | null;
  delay_hours: number | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowDefault = {
  key: string;
  name: string;
  description: string;
  sort_order: number;
};

const DEFAULT_WORKFLOWS: WorkflowDefault[] = [
  {
    key: "interview_reminder",
    name: "Interview Reminder",
    description: "Follow up with candidates for upcoming interview reminders.",
    sort_order: 10,
  },
  {
    key: "document_collection_reminder",
    name: "Document Collection Reminder",
    description: "Follow up with candidates for missing documents after screening or selection.",
    sort_order: 20,
  },
  {
    key: "offer_follow_up",
    name: "Offer Follow-up",
    description: "Follow up with candidates for offer acknowledgement.",
    sort_order: 30,
  },
  {
    key: "joining_reminder",
    name: "Joining Reminder",
    description: "Follow up with candidates about joining dates.",
    sort_order: 40,
  },
];

export function canManageWorkflows(role?: string | null) {
  return role === "admin" || role === "hr_manager" || role === "hod";
}

export function dripIntervalMinutes(config?: WorkflowActionConfig | null) {
  const value = Number(config?.drip_interval_minutes);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_DRIP_INTERVAL_MINUTES;
}

export function workflowActionConfig(input: Record<string, unknown>, existing?: WorkflowActionConfig | null) {
  const merged: WorkflowActionConfig = { ...(existing ?? {}) };
  const interval = Number(input.drip_interval_minutes ?? input.dripIntervalMinutes);

  if (Number.isFinite(interval) && interval > 0) {
    merged.drip_interval_minutes = Math.floor(interval);
  } else if (!merged.drip_interval_minutes) {
    merged.drip_interval_minutes = DEFAULT_DRIP_INTERVAL_MINUTES;
  }

  if (typeof input.workflow_key === "string" && input.workflow_key.trim()) {
    merged.workflow_key = input.workflow_key.trim();
  } else if (!merged.workflow_key && typeof input.name === "string") {
    merged.workflow_key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  return merged;
}

export async function ensureDefaultManualWorkflows(
  supabase: SupabaseAdminClient,
  userId: string
) {
  const { data: existing, error } = await supabase
    .from("automation_rules")
    .select("id")
    .eq("trigger_type", MANUAL_WORKFLOW_TRIGGER)
    .limit(1);

  if (error) throw new Error(error.message);
  if (existing?.length) return;

  const now = new Date().toISOString();
  const rows = DEFAULT_WORKFLOWS.map((workflow) => ({
    name: workflow.name,
    description: workflow.description,
    trigger_type: MANUAL_WORKFLOW_TRIGGER,
    action_type: WORKFLOW_ACTION_TYPE,
    action_config: {
      workflow_key: workflow.key,
      drip_interval_minutes: DEFAULT_DRIP_INTERVAL_MINUTES,
    },
    delay_hours: 0,
    sort_order: workflow.sort_order,
    is_active: true,
    created_by: userId,
    created_at: now,
    updated_at: now,
  }));

  const { error: insertError } = await supabase.from("automation_rules").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

export function shapeWorkflow(rule: WorkflowRule) {
  const actionConfig = rule.action_config ?? {};
  return {
    ...rule,
    drip_interval_minutes: dripIntervalMinutes(actionConfig),
    workflow_key: actionConfig.workflow_key ?? null,
  };
}
