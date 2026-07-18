import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DatePeriod } from "@/lib/types";
import dashboardActivity from "@/lib/dashboard/activity";

type FunnelRow = Record<string, string | number | null>;
type DashboardGroup = "overall" | "recruiter" | "site" | "month" | "designation" | "source" | "interviewer";

const { getDashboardPeriodDates, summarizeDashboardRows } = dashboardActivity;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const groupBy      = (searchParams.get("group_by") ?? "overall") as DashboardGroup;
  const hrId         = searchParams.get("hr_id");
  const siteId       = searchParams.get("site_id");
  const designId     = searchParams.get("designation_id");
  const sourceId     = searchParams.get("source_id");
  const period       = (searchParams.get("period") ?? "month") as DatePeriod;
  const customFrom   = searchParams.get("date_from") ?? undefined;
  const customTo     = searchParams.get("date_to") ?? undefined;
  const month        = searchParams.get("month");
  const fy           = searchParams.get("fy");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  let query = supabase
    .from("v_pipeline_funnel")
    .select("*")
    .eq("is_deleted", false);

  if (profile?.role === "recruiter") query = query.eq("hr_id", user.id);
  if (hrId)     query = query.eq("hr_id", hrId);
  if (siteId)   query = query.eq("site_id", siteId);
  if (designId) query = query.eq("designation_id", designId);
  if (sourceId) query = query.eq("source_id", sourceId);
  if (month)    query = query.eq("month", month);

  const range = fy
    ? (() => {
        const [startY] = fy.split("-");
        return { from: `${startY}-04-01`, to: `${parseInt(startY, 10) + 1}-03-31` };
      })()
    : month
      ? { from: undefined, to: undefined }
      : getDashboardPeriodDates(period, customFrom, customTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as FunnelRow[];

  if (groupBy === "overall") {
    const [jobsRes, interviewsRes] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open").eq("is_deleted", false),
      supabase.from("interviews").select("id", { count: "exact", head: true })
        .in("status", ["scheduled", "confirmed"])
        .gte("scheduled_at", new Date().toISOString())
        .lte("scheduled_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    return NextResponse.json({
      data: {
        ...summarizeDashboardRows(rows, range),
        open_jobs: jobsRes.count ?? 0,
        interviews_this_week: interviewsRes.count ?? 0,
      }
    });
  }

  const groupKey: Record<DashboardGroup, string> = {
    overall:     "hr_name",
    recruiter:   "hr_name",
    site:        "site_name",
    month:       "month",
    designation: "designation_name",
    source:      "source_name",
    interviewer: "hr_name",
  };

  const key = groupKey[groupBy] ?? "hr_name";
  const groups: Record<string, FunnelRow[]> = {};

  for (const row of rows) {
    const k = String(row[key] ?? "Unknown");
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  }

  const breakdown = Object.entries(groups)
    .map(([name, groupRows]) => ({ name, ...summarizeDashboardRows(groupRows, range) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ data: breakdown });
}
