"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, TrendingUp, Briefcase, Calendar } from "lucide-react";
import type { DatePeriod, DashboardStats, RecruiterPerformance } from "@/lib/types";

const FUNNEL_STAGES = [
  { key: "total",            label: "CVs Received",    color: "#FF2D87", status: "" },
  { key: "tel_int_done",     label: "Tel Int Done",    color: "#fb923c", status: "Tel Int Done" },
  { key: "gf_sent",          label: "GF Sent",         color: "#fbbf24", status: "Google Form Sent" },
  { key: "shortlisted_hr",   label: "Shortlisted HR",  color: "#34d399", status: "Shortlisted by HR" },
  { key: "pi_done",          label: "PI Done",         color: "#818cf8", status: "PI Done" },
  { key: "shortlisted_mgmt", label: "Shortlisted Mgmt",color: "#a3e635", status: "Shortlisted by Mgmt" },
  { key: "appointed",        label: "Offered",         color: "#22c55e", status: "Appointed/Offered" },
  { key: "joined",           label: "Joined",          color: "#16a34a", status: "Joined" },
];

type GroupBy = "overall" | "recruiter" | "site" | "month" | "designation" | "source";

export default function DashboardPage() {
  const router = useRouter();
  const [period, setPeriod]       = useState<DatePeriod>("all");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [hrId, setHrId]           = useState("");
  const [siteId, setSiteId]       = useState("");
  const [designId, setDesignId]   = useState("");
  const [sourceId, setSourceId]   = useState("");
  const [groupBy, setGroupBy]     = useState<GroupBy>("recruiter");
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [breakdown, setBreakdown] = useState<RecruiterPerformance[]>([]);
  const [masters, setMasters]     = useState<{ sites: {id:string;name:string}[]; designations: {id:string;name:string}[]; sources: {id:string;name:string}[]; recruiters: {id:string;name:string}[] }>
    ({ sites: [], designations: [], sources: [], recruiters: [] });
  const [loading, setLoading]     = useState(true);

  // Load master dropdowns once
  useEffect(() => {
    Promise.all([
      fetch("/api/masters?type=site").then(r => r.json()),
      fetch("/api/masters?type=designation").then(r => r.json()),
      fetch("/api/masters?type=source").then(r => r.json()),
      fetch("/api/users").then(r => r.json()),
    ]).then(([s, d, src, u]) => {
      setMasters({
        sites: s.data ?? [],
        designations: d.data ?? [],
        sources: src.data ?? [],
        recruiters: (u.data ?? []).filter((u: {role:string}) => u.role === "recruiter"),
      });
    });
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const base = `/api/dashboard?period=${period}${dateFrom ? `&date_from=${dateFrom}` : ""}${dateTo ? `&date_to=${dateTo}` : ""}${hrId ? `&hr_id=${hrId}` : ""}${siteId ? `&site_id=${siteId}` : ""}${designId ? `&designation_id=${designId}` : ""}${sourceId ? `&source_id=${sourceId}` : ""}`;

      const [overallRes, breakdownRes] = await Promise.all([
        fetch(`${base}&group_by=overall`).then(r => r.json()),
        fetch(`${base}&group_by=${groupBy}`).then(r => r.json()),
      ]);

      if (overallRes.error)   console.error("Dashboard overall error:", overallRes.error);
      if (breakdownRes.error) console.error("Dashboard breakdown error:", breakdownRes.error);

      setStats(overallRes.data ?? null);
      setBreakdown(breakdownRes.data ?? []);
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo, hrId, siteId, designId, sourceId, groupBy]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function handlePeriodChange(val: string) {
    setPeriod(val as DatePeriod);
    if (val !== "custom") { setDateFrom(""); setDateTo(""); }
  }

  const funnelData = FUNNEL_STAGES.map(s => ({
    label:  s.label,
    status: s.status,
    value:  stats ? (stats as unknown as Record<string, number>)[s.key] ?? 0 : 0,
    color:  s.color,
    pct:    stats?.total ? Math.round(((stats as unknown as Record<string, number>)[s.key] ?? 0) / stats.total * 100) : 0,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Period dropdown */}
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="lastmonth">Last Month</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Range…</option>
          </select>

          {period === "custom" && (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
              <span className="text-gray-400 text-sm">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
              <button onClick={fetchStats}
                className="bg-brand-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-brand-600">
                Apply
              </button>
            </>
          )}

          {/* Filters */}
          <select value={hrId} onChange={e => setHrId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All Recruiters</option>
            {masters.recruiters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={siteId} onChange={e => setSiteId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All Sites</option>
            {masters.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={designId} onChange={e => setDesignId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All Designations</option>
            {masters.designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={sourceId} onChange={e => setSourceId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All Sources</option>
            {masters.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: "Open Jobs",         value: stats?.open_jobs ?? "—",            sub: "",                                             icon: Briefcase,  color: "bg-blue-500",   href: "/jobs" },
          { label: "Active Candidates", value: stats?.total ?? "—",                sub: `${stats?.pi_done ?? 0} in PI`,                 icon: Users,      color: "bg-brand-500", href: "/candidates" },
          { label: "Interviews / Week", value: stats?.interviews_this_week ?? "—", sub: "Upcoming 7 days",                              icon: Calendar,   color: "bg-purple-500", href: null },
          { label: "Joinings",          value: stats?.joined ?? "—",               sub: "In period",                                    icon: TrendingUp, color: "bg-green-600",  href: "/candidates?status=Joined" },
          { label: "Offered",           value: stats?.appointed ?? "—",            sub: `${stats?.offered_not_joined ?? 0} not joined`, icon: Users,      color: "bg-yellow-500", href: "/candidates?status=Appointed%2FOffered" },
          { label: "Tel Int Done",      value: stats?.tel_int_done ?? "—",         sub: `${stats?.shortlisted_hr ?? 0} shortlisted`,    icon: TrendingUp, color: "bg-indigo-500", href: "/candidates?status=Tel+Int+Done" },
        ].map((kpi) => (
          <div key={kpi.label}
            onClick={() => kpi.href && router.push(kpi.href)}
            className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 transition-shadow ${kpi.href ? "cursor-pointer hover:shadow-md hover:border-gray-300" : ""}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${kpi.color}`}>
              <kpi.icon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{loading ? "…" : kpi.value}</p>
              <p className="text-xs text-gray-500 leading-tight">{kpi.label}</p>
              {kpi.sub && <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Pipeline Funnel</h3>
          <div className="space-y-2">
            {funnelData.map((stage) => (
              <div key={stage.label}
                onClick={() => stage.status && router.push(`/candidates?status=${encodeURIComponent(stage.status)}`)}
                className={`flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 transition-colors ${stage.status ? "cursor-pointer hover:bg-gray-50" : ""}`}>
                <div className="w-24 text-xs text-gray-500 flex-shrink-0 truncate">{stage.label}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-2 transition-all duration-500"
                    style={{ width: `${stage.pct || 2}%`, minWidth: 32, background: stage.color }}
                  >
                    <span className="text-white text-xs font-semibold">{loading ? "…" : stage.value}</span>
                  </div>
                </div>
                <div className="w-10 text-right text-xs text-gray-400">{stage.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">Breakdown</h3>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1">
              <option value="recruiter">By Recruiter</option>
              <option value="site">By Site</option>
              <option value="designation">By Designation</option>
              <option value="source">By Source</option>
              <option value="month">By Month</option>
            </select>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={breakdown.slice(0, 10)} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Total" fill="#FF2D87" radius={[4,4,0,0]} />
                <Bar dataKey="joined" name="Joined" fill="#16a34a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recruiter Performance Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">
            {groupBy === "recruiter" ? "Recruiter Performance" : `Breakdown by ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {groupBy === "recruiter"
                  ? ["Recruiter","Total","Tel Int","PI Done","Offered","Joined","Conv. %"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))
                  : ["Name","Total","Joined","Conv. %"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))
                }
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={groupBy === "recruiter" ? 7 : 4} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : breakdown.length === 0 ? (
                <tr><td colSpan={groupBy === "recruiter" ? 7 : 4} className="px-4 py-8 text-center text-gray-400 text-sm">No data for this period</td></tr>
              ) : breakdown.map((row, i) => {
                const r = row as unknown as Record<string, number | string>;
                const conv = r.total ? Math.round((Number(r.joined) / Number(r.total)) * 100) : 0;
                const convBadge = conv >= 10 ? "bg-green-100 text-green-700" : conv >= 5 ? "bg-yellow-100 text-yellow-700" : "bg-red-50 text-red-600";
                // Build drill-down href for this row
                const rowHref = groupBy === "recruiter"
                  ? `/candidates?hr_name=${encodeURIComponent(r.name as string)}`
                  : groupBy === "site"   ? `/candidates?site_name=${encodeURIComponent(r.name as string)}`
                  : groupBy === "month"  ? `/candidates?month=${encodeURIComponent(r.name as string)}`
                  : `/candidates`;
                return groupBy === "recruiter" ? (
                  <tr key={i} onClick={() => router.push(rowHref)} className="border-b border-gray-50 hover:bg-brand-50 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name as string}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.total as number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.tel_int_done as number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.pi_done as number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.appointed as number}</td>
                    <td className="px-4 py-2.5 font-semibold text-green-700">{r.joined as number}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${convBadge}`}>{conv}%</span>
                    </td>
                  </tr>
                ) : (
                  <tr key={i} onClick={() => router.push(rowHref)} className="border-b border-gray-50 hover:bg-brand-50 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name as string}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.total as number}</td>
                    <td className="px-4 py-2.5 font-semibold text-green-700">{r.joined as number}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${convBadge}`}>{conv}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
