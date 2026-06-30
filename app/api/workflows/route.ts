import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import {
  MANUAL_WORKFLOW_TRIGGER,
  WORKFLOW_ACTION_TYPE,
  canManageWorkflows,
  ensureDefaultManualWorkflows,
  shapeWorkflow,
  workflowActionConfig,
  type WorkflowRule,
} from "@/lib/workflows/defaults";

async function getProfile(admin: Awaited<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string; role: string } | null;
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalTextField(value: unknown) {
  const text = textField(value);
  return text || null;
}

function delayHours(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  try {
    const profile = await getProfile(admin, user.id);
    await ensureDefaultManualWorkflows(admin, user.id);

    let query = admin
      .from("automation_rules")
      .select("*")
      .eq("trigger_type", MANUAL_WORKFLOW_TRIGGER)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!canManageWorkflows(profile?.role)) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: ((data ?? []) as WorkflowRule[]).map(shapeWorkflow) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load workflows" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const profile = await getProfile(admin, user.id);
  if (!canManageWorkflows(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Record<string, unknown>;
  const name = textField(body.name);
  if (!name) return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("automation_rules")
    .insert({
      name,
      description: optionalTextField(body.description),
      trigger_type: MANUAL_WORKFLOW_TRIGGER,
      conditions: {},
      action_type: WORKFLOW_ACTION_TYPE,
      action_config: workflowActionConfig(body),
      delay_hours: delayHours(body.delay_hours ?? body.delayHours, 0),
      sort_order: delayHours(body.sort_order ?? body.sortOrder, 100),
      is_active: typeof body.is_active === "boolean" ? body.is_active : true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: shapeWorkflow(data as WorkflowRule) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const profile = await getProfile(admin, user.id);
  if (!canManageWorkflows(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Record<string, unknown>;
  const id = textField(body.id);
  if (!id) return NextResponse.json({ error: "Workflow id is required" }, { status: 400 });

  const { data: existing, error: existingError } = await admin
    .from("automation_rules")
    .select("*")
    .eq("id", id)
    .eq("trigger_type", MANUAL_WORKFLOW_TRIGGER)
    .single();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 404 });

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in body) {
    const name = textField(body.name);
    if (!name) return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });
    update.name = name;
  }
  if ("description" in body) update.description = optionalTextField(body.description);
  if ("delay_hours" in body || "delayHours" in body) {
    update.delay_hours = delayHours(body.delay_hours ?? body.delayHours, (existing as WorkflowRule).delay_hours ?? 0);
  }
  if ("is_active" in body) update.is_active = body.is_active === true;
  if ("drip_interval_minutes" in body || "dripIntervalMinutes" in body || "workflow_key" in body) {
    update.action_config = workflowActionConfig(body, (existing as WorkflowRule).action_config);
  }

  const { data, error } = await admin
    .from("automation_rules")
    .update(update)
    .eq("id", id)
    .eq("trigger_type", MANUAL_WORKFLOW_TRIGGER)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: shapeWorkflow(data as WorkflowRule) });
}
