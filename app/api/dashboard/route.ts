import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DatePeriod } from "@/lib/types";

function getPeriodDates(period: DatePeriod, dateFrom?: string, dateTo?: string) {
  const now = new Date();
  switch (period) {
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
    }
    case "lastmonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
    }
    case "last30": {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
    }
    case "custom":
      return { from: dateFrom, to: dateTo };
    case "all":
    default:
      return { from: undefined, to: undefined };
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const groupBy      = searchParams.get("group_by") ?? "overall";
  const hrId         = searchParams.get("hr_id");
  const siteId       = searchParams.get("site_id");
  const designId     = searchParams.get("designation_id");
  const sourceId     = searchParams.get("source_id");
  const period       = (searchParams.get("period") ?? "month") as DatePeriod;
  const customFrom   = searchParams.get("date_from") ?? undefined;
  const customTo     = searchParams.get("date_to") ?? undefined;
  // Legacy support
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

  if (fy) {
    const [startY] = fy.split("-");
    query = query
      .gte("application_date", `${startY}-04-01`)
      .lte("application_date", `${parseInt(startY) + 1}-03-31`);
  } else if (!month) {
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    if (from) query = query.gte("application_date", from);
    if (to)   query = query.lte("application_date", to);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  function sumFunnel(rs: Record<string, number>[]) {
    return {
      total:              rs.length,
      tel_int_done:       rs.reduce((s, r) => s + (r.tel_int_done ?? 0), 0),
      gf_sent:            rs.reduce((s, r) => s + (r.gf_sent ?? 0), 0),
      gf_received:        rs.reduce((s, r) => s + (r.gf_received ?? 0), 0),
      shortlisted_hr:     rs.reduce((s, r) => s + (r.shortlisted_hr ?? 0), 0),
      pi_done:            rs.reduce((s, r) => s + (r.pi_done ?? 0), 0),
      shortlisted_mgmt:   rs.reduce((s, r) => s + (r.shortlisted_mgmt ?? 0), 0),
      gf_issued:          rs.reduce((s, r) => s + (r.gf_issued_flag ?? 0), 0),
      gf_recv:            rs.reduce((s, r) => s + (r.gf_recv ?? 0), 0),
      appointed:          rs.reduce((s, r) => s + (r.appointed ?? 0), 0),
      joined:             rs.reduce((s, r) => s + (r.joined ?? 0), 0),
      offered_not_joined: rs.reduce((s, r) => s + (r.offered_not_joined ?? 0), 0),
    };
  }

  if (groupBy === "overall") {
    // Also fetch open jobs count and upcoming interviews
    const [jobsRes, interviewsRes] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open").eq("is_deleted", false),
      supabase.from("interviews").select("id", { count: "exact", head: true })
        .in("status", ["scheduled", "confirmed"])
        .gte("scheduled_at", new Date().toISOString())
        .lte("scheduled_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    return NextResponse.json({
      data: {
        ...sumFunnel(rows as never),
        open_jobs: jobsRes.count ?? 0,
        interviews_this_week: interviewsRes.count ?? 0,
      }
    });
  }

  const groupKey: Record<string, string> = {
    recruiter:   "hr_name",
    site:        "site_name",
    month:       "month",
    designation: "designation_name",
    source:      "source_name",
  };

  const key = groupKey[groupBy] ?? "hr_name";
  const groups: Record<string, typeof rows> = {};

  for (const row of rows) {
    const k = (row as Record<string, string>)[key] ?? "Unknown";
    if (!groups[k]) groups[k] = [];
    groups[k].push(row as never);
  }

  const breakdown = Object.entries(groups)
    .map(([name, groupRows]) => ({ name, ...sumFunnel(groupRows as never) }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ data: breakdown });
}
