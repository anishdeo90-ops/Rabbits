"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, TrendingUp, Briefcase, Calendar } from "lucide-react";
import type { DatePeriod, DashboardStats, RecruiterPerformance } from "@/lib/types";
import dashboardActivity from "@/lib/dashboard/activity";

const { getDashboardPeriodDates } = dashboardActivity;

function SearchCombobox({ options, value, onChange, placeholder, className = "" }: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!value) setInput(""); }, [value]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selected = options.find(o => o.id === value) ?? null;
  const filtered = input.trim() ? options.filter(o => o.name.toLowerCase().includes(input.toLowerCase())) : options;

  return (
    <div className="relative" ref={ref}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={selected ? selected.name : input}
          onChange={e => { if (selected) onChange(""); setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent ${value ? "pr-7" : ""} ${className}`}
        />
        {value && (
          <button onClick={() => { onChange(""); setInput(""); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs leading-none">✕</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
          {filtered.map(o => (
            <button key={o.id} onClick={() => { onChange(o.id); setInput(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 truncate block">
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FUNNEL_STAGES = [
  { key: "new_cvs",             label: "New CVs",          color: "#ff2d87", activityScope: "new" },
  { key: "worked_on_existing",  label: "Worked On",        color: "#0ea5e9", activityScope: "worked" },
  { key: "tel_int_done",        label: "Tel Int Done",     color: "#ff7bb3", pipelineStage: "tel_int_done" },
  { key: "gf_sent",             label: "GF Sent",          color: "#fbbf24", pipelineStage: "gf_sent" },
  { key: "shortlisted_hr",      label: "Shortlisted HR",   color: "#34d399", pipelineStage: "shortlisted_hr" },
  { key: "pi_done",             label: "PI Done",          color: "#818cf8", pipelineStage: "pi_done" },
  { key: "shortlisted_mgmt",    label: "Shortlisted Mgmt", color: "#a3e635", pipelineStage: "shortlisted_mgmt" },
  { key: "appointed",           label: "Offered",          color: "#22c55e", pipelineStage: "appointed" },
  { key: "joined",              label: "Joined",           color: "#16a34a", pipelineStage: "joined" },
];

type GroupBy = "overall" | "recruiter" | "site" | "month" | "designation" | "source" | "interviewer";
type PersonOption = { id: string; name: string; type: "recruiter" | "interviewer"; label: string };

export default function DashboardPage() {
  const router = useRouter();
  const comboboxRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod]       = useState<DatePeriod>("today");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [hrId, setHrId]           = useState("");
  const [hodId, setHodId]         = useState("");
  const [siteId, setSiteId]       = useState("");
  const [designId, setDesignId]   = useState("");
  const [sourceId, setSourceId]   = useState("");
  const [groupBy, setGroupBy]     = useState<GroupBy>("recruiter");
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [chartBreakdown, setChartBreakdown]           = useState<RecruiterPerformance[]>([]);
  const [recruiterBreakdown, setRecruiterBreakdown]   = useState<RecruiterPerformance[]>([]);
  const [interviewerBreakdown, setInterviewerBreakdown] = useState<RecruiterPerformance[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userRole, setUserRole]   = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [masters, setMasters] = useState<{
    sites: {id:string;name:string}[];
    designations: {id:string;name:string}[];
    sources: {id:string;name:string}[];
    recruiters: {id:string;name:string}[];
    interviewers: {id:string;name:string}[];
  }>({ sites: [], designations: [], sources: [], recruiters: [], interviewers: [] });

  // Close combobox when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setPersonOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load master dropdowns + current user role once
  useEffect(() => {
    Promise.all([
      fetch("/api/masters?type=site").then(r => r.json()),
      fetch("/api/masters?type=designation").then(r => r.json()),
      fetch("/api/masters?type=source").then(r => r.json()),
      fetch("/api/users").then(r => r.json()),
      fetch("/api/users/me").then(r => r.json()),
    ]).then(([s, d, src, u, me]) => {
      const allUsers: {id:string;name:string;role:string}[] = u.data ?? [];
      setMasters({
        sites:        s.data ?? [],
        designations: d.data ?? [],
        sources:      src.data ?? [],
        recruiters:   allUsers.filter(u => u.role === "recruiter"),
        interviewers: allUsers.filter(u => u.role === "hod" || u.role === "hr_manager" || u.role === "admin"),
      });
      setUserRole(me.data?.role ?? "");
    });
  }, []);

  // Combined people list for combobox
  const allPeople: PersonOption[] = [
    ...masters.recruiters.map(r => ({ id: r.id, name: r.name, type: "recruiter" as const, label: "HR" })),
    ...masters.interviewers.map(i => ({ id: i.id, name: i.name, type: "interviewer" as const, label: "HOD" })),
  ];

  const filteredPeople = inputValue.trim()
    ? allPeople.filter(p => p.name.toLowerCase().includes(inputValue.toLowerCase()))
    : allPeople;

  const selectedPerson: PersonOption | null = hrId
    ? (allPeople.find(p => p.id === hrId && p.type === "recruiter") ?? null)
    : hodId
    ? (allPeople.find(p => p.id === hodId && p.type === "interviewer") ?? null)
    : null;

  function selectPerson(p: PersonOption) {
    if (p.type === "recruiter") { setHrId(p.id); setHodId(""); }
    else { setHodId(p.id); setHrId(""); }
    setInputValue("");
    setPersonOpen(false);
  }

  function clearPerson() {
    setHrId(""); setHodId(""); setInputValue(""); setPersonOpen(false);
  }

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const datePart   = `${dateFrom ? `&date_from=${dateFrom}` : ""}${dateTo ? `&date_to=${dateTo}` : ""}`;
      const commonPart = `${siteId ? `&site_id=${siteId}` : ""}${designId ? `&designation_id=${designId}` : ""}${sourceId ? `&source_id=${sourceId}` : ""}`;

      // Overall stats respects all active filters (for KPI cards)
      const overallBase      = `/api/dashboard?period=${period}${datePart}${commonPart}${hrId ? `&hr_id=${hrId}` : ""}${hodId ? `&hod_id=${hodId}` : ""}`;
      // Recruiter table uses period + hrId filter only
      const recruiterBase    = `/api/dashboard?period=${period}${datePart}${commonPart}${hrId ? `&hr_id=${hrId}` : ""}`;
      // Interviewer table always all-time (candidate_forwards has no strong date dimension)
      const interviewerBase  = `/api/dashboard?period=all${commonPart}${hodId ? `&hod_id=${hodId}` : ""}`;

      const [overallRes, recruiterRes, interviewerRes, chartRes] = await Promise.all([
        fetch(`${overallBase}&group_by=overall`).then(r => r.json()),
        fetch(`${recruiterBase}&group_by=recruiter`).then(r => r.json()),
        fetch(`${interviewerBase}&group_by=interviewer`).then(r => r.json()),
        fetch(`${overallBase}&group_by=${groupBy}`).then(r => r.json()),
      ]);

      if (overallRes.error)     console.error("Dashboard overall error:", overallRes.error);
      if (recruiterRes.error)   console.error("Dashboard recruiter error:", recruiterRes.error);
      if (interviewerRes.error) console.error("Dashboard interviewer error:", interviewerRes.error);

      setStats(overallRes.data ?? null);
      setRecruiterBreakdown(recruiterRes.data ?? []);
      setInterviewerBreakdown(interviewerRes.data ?? []);
      setChartBreakdown(chartRes.data ?? []);
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo, hrId, hodId, siteId, designId, sourceId, groupBy]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function handlePeriodChange(val: string) {
    setPeriod(val as DatePeriod);
    if (val !== "custom") { setDateFrom(""); setDateTo(""); }
  }

  function getPeriodDates(): { date_from?: string; date_to?: string } {
    const dates = getDashboardPeriodDates(period, dateFrom, dateTo);
    return { date_from: dates.from, date_to: dates.to };
  }

  function buildUrl(extras: Record<string, string> = {}): string {
    const p = new URLSearchParams();
    const dates = getPeriodDates();
    if (dates.date_from) p.set("date_from", dates.date_from);
    if (dates.date_to)   p.set("date_to",   dates.date_to);
    if (hrId)     p.set("hr_id",          hrId);
    if (hodId)    p.set("forward_to_id",  hodId);
    if (siteId)   p.set("site_id",        siteId);
    if (designId) p.set("designation_id", designId);
    if (sourceId) p.set("source_id",      sourceId);
    p.set("owner", userRole === "recruiter" ? "mine" : "all");
    for (const [k, v] of Object.entries(extras)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    return `/candidates?${p.toString()}`;
  }

  function rowUrl(row: Record<string, number | string>): string {
    const name = row.name as string;
    switch (groupBy) {
      case "recruiter": {
        const rec = masters.recruiters.find(r => r.name === name);
        return buildUrl({ hr_id: rec?.id ?? "", activity_scope: "activity" });
      }
      case "interviewer": {
        const hod = masters.interviewers.find(i => i.name === name);
        return hod ? `/candidates?forward_to_id=${hod.id}&owner=all` : buildUrl();
      }
      case "site": {
        const site = masters.sites.find(s => s.name === name);
        return buildUrl({ site_id: site?.id ?? "", activity_scope: "activity" });
      }
      case "designation": {
        const des = masters.designations.find(d => d.name === name);
        return buildUrl({ designation_id: des?.id ?? "", activity_scope: "activity" });
      }
      case "source": {
        const source = masters.sources.find(s => s.name === name);
        return buildUrl({ source_id: source?.id ?? "", activity_scope: "activity" });
      }
      case "month": {
        const [y, m] = name.split("-").map(Number);
        if (y && m) {
          const from = new Date(y, m - 1, 1).toISOString().split("T")[0];
          const to   = new Date(y, m, 0).toISOString().split("T")[0];
          return buildUrl({ date_from: from, date_to: to, activity_scope: "activity" });
        }
        return buildUrl({ activity_scope: "activity" });
      }
      default:
        return buildUrl({ activity_scope: "activity" });
    }
  }

  const funnelData = FUNNEL_STAGES.map(s => {
    const value = stats ? Number((stats as unknown as Record<string, number>)[s.key] ?? 0) : 0;
    return {
      label:         s.label,
      pipelineStage: "pipelineStage" in s ? s.pipelineStage : "",
      activityScope: "activityScope" in s ? s.activityScope : "",
      value,
      color:         s.color,
      pct:           stats?.total ? Math.round(value / stats.total * 100) : 0,
      split:         stats?.stage_splits?.[s.key],
    };
  });

  // Shared badge helper
  function convBadgeClass(conv: number) {
    return conv >= 10 ? "bg-green-100 text-green-700" : conv >= 5 ? "bg-yellow-100 text-yellow-700" : "bg-red-50 text-red-600";
  }

  return (
    <div className="p-4 pt-14 sm:p-6 sm:pt-14 lg:pt-6 space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="w-full lg:w-auto lg:ml-auto grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
          {/* Period dropdown */}
          <select value={period} onChange={e => handlePeriodChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent">
            <option value="today">Today</option>
            <option value="week">This Week</option>
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
                className="bg-brand-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-brand-600">Apply</button>
            </>
          )}

          {/* Combined person search combobox */}
          <div className="relative" ref={comboboxRef}>
            <div className="relative flex items-center">
              {selectedPerson && (
                <span className={`absolute left-2 z-10 text-xs px-1.5 py-0.5 rounded font-medium pointer-events-none ${selectedPerson.type === "recruiter" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  {selectedPerson.label}
                </span>
              )}
              <input
                type="text"
                value={selectedPerson ? selectedPerson.name : inputValue}
                onChange={e => {
                  if (selectedPerson) clearPerson();
                  setInputValue(e.target.value);
                  setPersonOpen(true);
                }}
                onFocus={() => setPersonOpen(true)}
                placeholder="All People"
                className={`text-sm border border-gray-200 rounded-lg py-2 w-48 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent ${selectedPerson ? "pl-12 pr-7" : "px-3"}`}
              />
              {(hrId || hodId) && (
                <button onClick={clearPerson}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs leading-none">✕</button>
              )}
            </div>
            {personOpen && filteredPeople.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
                {filteredPeople.map(p => (
                  <button key={`${p.type}-${p.id}`}
                    onClick={() => selectPerson(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center gap-2">
                    <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${p.type === "recruiter" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{p.label}</span>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Other filters */}
          <SearchCombobox options={masters.sites}        value={siteId}   onChange={setSiteId}   placeholder="All Sites"         className="w-36" />
          <SearchCombobox options={masters.designations} value={designId} onChange={setDesignId} placeholder="All Designations"  className="w-44" />
          <SearchCombobox options={masters.sources}      value={sourceId} onChange={setSourceId} placeholder="All Sources"        className="w-36" />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: "Open Jobs",         value: stats?.open_jobs ?? "—",            sub: "",                                             icon: Briefcase,  color: "bg-blue-500",   href: "/jobs" },
          { label: "New CVs",           value: stats?.new_cvs ?? "—",              sub: `${stats?.total ?? 0} total activity`,          icon: Users,      color: "bg-brand-500", href: buildUrl({ activity_scope: "new" }) },
          { label: "Worked On",         value: stats?.worked_on_existing ?? "—",   sub: "Existing candidates",                         icon: TrendingUp, color: "bg-cyan-600",   href: buildUrl({ activity_scope: "worked" }) },
          { label: "Tel Int Done",      value: stats?.tel_int_done ?? "—",         sub: `${stats?.shortlisted_hr ?? 0} shortlisted`,    icon: Calendar,   color: "bg-purple-500", href: buildUrl({ pipeline_stage: "tel_int_done", date_field: "stage" }) },
          { label: "Offered",           value: stats?.appointed ?? "—",            sub: `${stats?.offered_not_joined ?? 0} not joined`, icon: Users,      color: "bg-yellow-500", href: buildUrl({ pipeline_stage: "appointed", date_field: "stage" }) },
          { label: "Joinings",          value: stats?.joined ?? "—",               sub: "In period",                                    icon: TrendingUp, color: "bg-green-600",  href: buildUrl({ pipeline_stage: "joined", date_field: "stage" }) },
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Pipeline Funnel</h3>
          <div className="space-y-2">
            {funnelData.map((stage) => (
              <div key={stage.label}
                onClick={() => {
                  if (stage.pipelineStage) router.push(buildUrl({ pipeline_stage: stage.pipelineStage, date_field: "stage" }));
                  else if (stage.activityScope) router.push(buildUrl({ activity_scope: stage.activityScope }));
                }}
                className={`flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 transition-colors ${stage.pipelineStage || stage.activityScope ? "cursor-pointer hover:bg-gray-50" : ""}`}>
                <div className="w-24 text-xs text-gray-500 flex-shrink-0 truncate">{stage.label}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-2 transition-all duration-500"
                    style={{ width: `${stage.pct || 2}%`, minWidth: 32, background: stage.color }}
                  >
                    <span className="text-white text-xs font-semibold">{loading ? "…" : stage.value}</span>
                  </div>
                </div>
                {stage.split && <div className="hidden sm:block w-20 text-right text-[11px] text-gray-400">{stage.split.new}/{stage.split.worked}</div>}
                <div className="w-10 text-right text-xs text-gray-400">{stage.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">Breakdown</h3>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1">
              <option value="recruiter">By Recruiter</option>
              <option value="interviewer">By HOD / Interviewer</option>
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
              <BarChart
                data={chartBreakdown.slice(0, 10)}
                margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
                style={{ cursor: "pointer" }}
                onClick={(d) => { if (d?.activePayload?.[0]) { const r = d.activePayload[0].payload as Record<string, number | string>; router.push(rowUrl(r)); } }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Total" fill="#ff2d87" radius={[4,4,0,0]} />
                <Bar dataKey="joined" name="Joined" fill="#16a34a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Recruitment Performance ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">
            Recruitment Performance{hrId && selectedPerson ? ` — ${selectedPerson.name}` : ""}
          </h3>
        </div>
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Recruiter","Total","Tel Int","GF Sent","PI Done","Offered","Joined","Conv. %"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : recruiterBreakdown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No data for this period</td></tr>
              ) : recruiterBreakdown.map((row, i) => {
                const r = row as unknown as Record<string, number | string>;
                const conv = r.total ? Math.round((Number(r.joined) / Number(r.total)) * 100) : 0;
                const recId = masters.recruiters.find(x => x.name === r.name)?.id ?? "";
                return (
                  <tr key={i} onClick={() => router.push(buildUrl({ hr_id: recId, activity_scope: "activity" }))} className="border-b border-gray-50 hover:bg-brand-50 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name as string}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, activity_scope: "activity" })); }}>{r.total as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, pipeline_stage: "tel_int_done", date_field: "stage" })); }}>{r.tel_int_done as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, pipeline_stage: "gf_sent", date_field: "stage" })); }}>{r.gf_sent as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, pipeline_stage: "pi_done", date_field: "stage" })); }}>{r.pi_done as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, pipeline_stage: "appointed", date_field: "stage" })); }}>{r.appointed as number}</td>
                    <td className="px-4 py-2.5 font-semibold text-green-700" onClick={e => { e.stopPropagation(); router.push(buildUrl({ hr_id: recId, pipeline_stage: "joined", date_field: "stage" })); }}>{r.joined as number}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${convBadgeClass(conv)}`}>{conv}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : recruiterBreakdown.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No data for this period</div>
          ) : recruiterBreakdown.map((row, i) => {
            const r = row as unknown as Record<string, number | string>;
            const conv = r.total ? Math.round((Number(r.joined) / Number(r.total)) * 100) : 0;
            const recId = masters.recruiters.find(x => x.name === r.name)?.id ?? "";
            return (
              <div key={i} onClick={() => router.push(buildUrl({ hr_id: recId, activity_scope: "activity" }))} className="px-4 py-3 hover:bg-brand-50 active:bg-brand-100 cursor-pointer">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 truncate">{r.name as string}</p>
                  <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${convBadgeClass(conv)}`}>{conv}%</span>
                </div>
                <div className="grid grid-cols-6 gap-1 text-xs text-gray-500">
                  <div><div className="text-gray-400">Total</div><div className="text-gray-800 font-semibold">{r.total as number}</div></div>
                  <div><div className="text-gray-400">Tel Int</div><div className="text-gray-800 font-semibold">{r.tel_int_done as number}</div></div>
                  <div><div className="text-gray-400">GF Sent</div><div className="text-gray-800 font-semibold">{r.gf_sent as number}</div></div>
                  <div><div className="text-gray-400">PI</div><div className="text-gray-800 font-semibold">{r.pi_done as number}</div></div>
                  <div><div className="text-gray-400">Offered</div><div className="text-gray-800 font-semibold">{r.appointed as number}</div></div>
                  <div><div className="text-gray-400">Joined</div><div className="text-green-700 font-semibold">{r.joined as number}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Interviewer Performance ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">
            Interviewer Performance{hodId && selectedPerson ? ` — ${selectedPerson.name}` : ""}
          </h3>
        </div>
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Interviewer","Forwarded","PI Done","Shortlisted","Joined","Conv. %"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : interviewerBreakdown.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No data</td></tr>
              ) : interviewerBreakdown.map((row, i) => {
                const r = row as unknown as Record<string, number | string>;
                const conv = r.total ? Math.round((Number(r.joined) / Number(r.total)) * 100) : 0;
                const hod = masters.interviewers.find(x => x.name === r.name);
                const hodUrl = (stage?: string) => `/candidates?forward_to_id=${hod?.id ?? ""}&owner=all${stage ? `&pipeline_stage=${stage}` : ""}`;
                return (
                  <tr key={i} onClick={() => hod && router.push(hodUrl())} className={`border-b border-gray-50 hover:bg-brand-50 ${hod ? "cursor-pointer" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name as string}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); hod && router.push(hodUrl()); }}>{r.total as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); hod && router.push(hodUrl("pi_done")); }}>{r.pi_done as number}</td>
                    <td className="px-4 py-2.5 text-gray-700" onClick={e => { e.stopPropagation(); hod && router.push(hodUrl("shortlisted_mgmt")); }}>{r.shortlisted_mgmt as number}</td>
                    <td className="px-4 py-2.5 font-semibold text-green-700" onClick={e => { e.stopPropagation(); hod && router.push(hodUrl("joined")); }}>{r.joined as number}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${convBadgeClass(conv)}`}>{conv}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : interviewerBreakdown.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No data</div>
          ) : interviewerBreakdown.map((row, i) => {
            const r = row as unknown as Record<string, number | string>;
            const conv = r.total ? Math.round((Number(r.joined) / Number(r.total)) * 100) : 0;
            const hod = masters.interviewers.find(x => x.name === r.name);
            return (
              <div key={i} onClick={() => hod && router.push(`/candidates?forward_to_id=${hod.id}&owner=all`)} className={`px-4 py-3 hover:bg-brand-50 active:bg-brand-100 ${hod ? "cursor-pointer" : ""}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 truncate">{r.name as string}</p>
                  <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${convBadgeClass(conv)}`}>{conv}%</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-xs text-gray-500">
                  <div><div className="text-gray-400">Fwd</div><div className="text-gray-800 font-semibold">{r.total as number}</div></div>
                  <div><div className="text-gray-400">PI Done</div><div className="text-gray-800 font-semibold">{r.pi_done as number}</div></div>
                  <div><div className="text-gray-400">Shortlisted</div><div className="text-gray-800 font-semibold">{r.shortlisted_mgmt as number}</div></div>
                  <div><div className="text-gray-400">Joined</div><div className="text-green-700 font-semibold">{r.joined as number}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
