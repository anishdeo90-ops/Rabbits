import { NextRequest, NextResponse } from "next/server";
import { runEvaluator } from "@/lib/automation/evaluator";
import { isAutomationManager, requireUser } from "@/lib/automation/http";

function getMode(req: NextRequest, body?: Record<string, unknown>) {
  const queryMode = new URL(req.url).searchParams.get("mode");
  return queryMode === "dry_run" || body?.mode === "dry_run" ? "dry_run" : "live";
}

async function handle(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const body = await req.json().catch(() => ({}));
  const mode = getMode(req, body);
  if (!expected || auth !== `Bearer ${expected}`) {
    if (mode !== "dry_run") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { profile, response } = await requireUser();
    if (response) return response;
    if (!isAutomationManager(profile?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runEvaluator(mode);
  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
