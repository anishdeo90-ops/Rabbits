"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Users, Calendar, CheckCircle, Clock, MessageSquare, Phone, Mail, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

interface ActivityStats { candidates_added: number; interviews_scheduled: number; joinings: number; pending_followups: number; }
interface Interview { id: string; round: string; scheduled_at: string; status: string; meet_link?: string; interviewer_name?: string; candidate_name?: string; designation_name?: string; }
interface CandidateRow { id: string; name: string; final_status?: string; updated_at: string; }
interface Joining { id: string; name: string; site_id?: string; doj_actual?: string; file_no?: string; }
interface CandidateSuggestion { id: string; name: string; designation_name?: string; }
interface Comm {
  id: string; candidate_id: string; candidate_name?: string; designation_name?: string;
  type: string; direction: string; subject?: string; content: string;
  communicated_at: string; creator_name?: string;
}

const MONTHS = [
  { label: "This Month",    value: "" },
  { label: "Last Month",    value: "last" },
  { label: "Last 3 Months", value: "last3" },
  { label: "Custom Range…", value: "custom" },
];

const ROUND_LABELS: Record<string, string> = {
  telephonic: "Telephonic", pi1: "PI 1", pi2: "PI 2", pi3: "PI 3",
  hr_discussion: "HR Discussion", final: "Final",
};

const CHANNELS = [
  { value: "whatsapp",   label: "WhatsApp",   icon: "💬" },
  { value: "email",      label: "Email",      icon: "✉️" },
  { value: "call",       label: "Phone Call", icon: "📞" },
  { value: "sms",        label: "SMS",        icon: "💬" },
  { value: "in_person",  label: "In Person",  icon: "🤝" },
  { value: "other",      label: "Other",      icon: "📝" },
];

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp:  "bg-green-100 text-green-700",
  email:     "bg-blue-100 text-blue-700",
  call:      "bg-purple-100 text-purple-700",
  sms:       "bg-yellow-100 text-yellow-700",
  in_person: "bg-brand-100 text-brand-700",
  other:     "bg-gray-100 text-gray-600",
};

function channelIcon(type: string) {
  return CHANNELS.find(c => c.value === type)?.icon ?? "📝";
}

export default function MyActivityPage() {
  const [period, setPeriod]             = useState("");
  const [stats, setStats]               = useState<ActivityStats | null>(null);
  const [interviews, setInterviews]     = useState<Interview[]>([]);
  const [candidates, setCandidates]     = useState<CandidateRow[]>([]);
  const [joinings, setJoinings]         = useState<Joining[]>([]);
  const [loading, setLoading]           = useState(true);
  const [customFrom, setCustomFrom]     = useState("");
  const [customTo,   setCustomTo]       = useState("");

  // Schedule Interview modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    candidate_id: "", candidate_name: "", round: "telephonic", scheduled_at: "", meet_link: "",
  });
  const [scheduling, setScheduling]     = useState(false);

  // Communication tracker
  const [comms, setComms]               = useState<Comm[]>([]);
  const [commsLoading, setCommsLoading] = useState(true);
  const [showCommModal, setShowCommModal] = useState(false);
  const [commForm, setCommForm]         = useState({
    candidate_id: "", candidate_name: "", type: "whatsapp", direction: "outbound", subject: "", content: "",
  });
  const [savingComm, setSavingComm]     = useState(false);
  const [commFilter, setCommFilter]     = useState("all");

  // Shared autocomplete
  const [suggestions, setSuggestions]   = useState<CandidateSuggestion[]>([]);
  const [showSugg, setShowSugg]         = useState(false);
  const [loadingSugg, setLoadingSugg]   = useState(false);
  const [activeSearch, setActiveSearch] = useState<"schedule" | "comm" | null>(null);
  const suggRef                         = useRef<HTMLDivElement>(null);
  const searchTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (suggRef.current && !suggRef.current.contains(e.target as Node)) { setShowSugg(false); setActiveSearch(null); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function searchCandidates(q: string, ctx: "schedule" | "comm") {
    if (!q.trim() || q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    setLoadingSugg(true); setActiveSearch(ctx);
    try {
      const res  = await fetch(`/api/candidates?search=${encodeURIComponent(q)}&limit=8`);
      const json = await res.json();
      setSuggestions((json.data ?? []).map((c: CandidateSuggestion) => ({ id: c.id, name: c.name, designation_name: c.designation_name })));
      setShowSugg(true);
    } finally { setLoadingSugg(false); }
  }

  const fetchComms = useCallback(async () => {
    setCommsLoading(true);
    try {
      const res  = await fetch("/api/communications?my=1&limit=100");
      const json = await res.json();
      setComms(json.data ?? []);
    } finally { setCommsLoading(false); }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let dateFrom = "", dateTo = "";
      if (period === "") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        dateTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      } else if (period === "last") {
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
        dateTo   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      } else if (period === "last3") {
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
        dateTo   = now.toISOString().split("T")[0];
      } else if (period === "custom") {
        dateFrom = customFrom; dateTo = customTo;
      }
      const params = `date_from=${dateFrom}&date_to=${dateTo}`;
      const res  = await fetch(`/api/my-activity?${params}`);
      const json = await res.json();
      setStats(json.stats);
      setInterviews(json.upcoming_interviews ?? []);
      setCandidates(json.recent_candidates ?? []);
      setJoinings(json.joinings ?? []);
    } finally { setLoading(false); }
  }, [period, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchComms(); }, [fetchComms]);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  function formatRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  const statusBadge: Record<string, string> = {
    "Joined": "bg-green-100 text-green-700", "Appointed/Offered": "bg-brand-100 text-brand-700",
    "PI Done": "bg-indigo-100 text-indigo-700", "Rejected/Dropped": "bg-red-100 text-red-600",
    "On Hold": "bg-yellow-100 text-yellow-700",
  };

  // Comms filtered by channel
  const filteredComms = commFilter === "all" ? comms : comms.filter(c => c.type === commFilter);

  // Suggestions dropdown (shared)
  function SuggestionBox({ ctx, onSelect }: { ctx: "schedule" | "comm"; onSelect: (c: CandidateSuggestion) => void }) {
    if (activeSearch !== ctx || !showSugg) return null;
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
        {loadingSugg ? <p className="text-xs text-gray-400 px-3 py-2">Searching…</p>
          : suggestions.length === 0 ? <p className="text-xs text-gray-400 px-3 py-2">No candidates found</p>
          : suggestions.map(c => (
            <button key={c.id} onMouseDown={e => { e.preventDefault(); onSelect(c); }}
              className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center justify-between group">
              <span className="text-sm font-medium text-gray-800 group-hover:text-brand-700">{c.name}</span>
              {c.designation_name && <span className="text-xs text-gray-400 ml-2">{c.designation_name}</span>}
            </button>
          ))}
      </div>
    );
  }

  async function saveComm() {
    if (!commForm.candidate_id || !commForm.content.trim()) {
      toast.error("Select a candidate and add a message"); return;
    }
    setSavingComm(true);
    try {
      const res = await fetch("/api/communications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: commForm.candidate_id,
          type:         commForm.type,
          direction:    commForm.direction,
          subject:      commForm.subject || null,
          content:      commForm.content,
        }),
      });
      if (res.ok) {
        toast.success("Communication logged");
        setShowCommModal(false);
        setCommForm({ candidate_id: "", candidate_name: "", type: "whatsapp", direction: "outbound", subject: "", content: "" });
        fetchComms();
      } else {
        const j = await res.json(); toast.error(j.error ?? "Failed to save");
      }
    } finally { setSavingComm(false); }
  }

  async function deleteComm(id: string) {
    await fetch(`/api/communications?id=${id}`, { method: "DELETE" });
    setComms(prev => prev.filter(c => c.id !== id));
    toast.success("Removed");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Activity</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your personal recruiting dashboard</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <span className="text-gray-400 text-sm">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <button onClick={fetchData}
                className="bg-brand-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-brand-600">Apply</button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Candidates Added",     value: stats?.candidates_added,     icon: Users,        color: "bg-brand-500" },
          { label: "Interviews Scheduled", value: stats?.interviews_scheduled, icon: Calendar,     color: "bg-purple-500" },
          { label: "My Joinings",          value: stats?.joinings,             icon: CheckCircle,  color: "bg-green-600" },
          { label: "Pending Follow-ups",   value: stats?.pending_followups,    icon: Clock,        color: "bg-yellow-500" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${kpi.color}`}>
              <kpi.icon size={20} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{loading ? "…" : (kpi.value ?? 0)}</p>
              <p className="text-xs text-gray-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Communication Tracker ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-500" />
            <h3 className="font-semibold text-gray-800 text-sm">Communication Tracker</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{comms.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Channel filter */}
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {[{ value: "all", label: "All" }, ...CHANNELS].map(ch => (
                <button key={ch.value} onClick={() => setCommFilter(ch.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    commFilter === ch.value ? "bg-white shadow text-brand-600 font-semibold" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {"icon" in ch ? ch.icon + " " : ""}{ch.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCommModal(true)}
              className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-brand-600">
              + Log Communication
            </button>
          </div>
        </div>

        {commsLoading ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading communications…</div>
        ) : filteredComms.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <MessageSquare size={28} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No communications logged yet</p>
            <p className="text-xs text-gray-400 mt-1">Log WhatsApp messages, calls, emails with candidates from one place</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {filteredComms.map(c => (
              <div key={c.id} className="px-5 py-3 hover:bg-gray-50 flex items-start gap-3 group">
                <span className="text-lg mt-0.5 flex-shrink-0">{channelIcon(c.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{c.candidate_name ?? "Unknown"}</span>
                    {c.designation_name && <span className="text-xs text-gray-400">{c.designation_name}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[c.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {CHANNELS.find(ch => ch.value === c.type)?.label ?? c.type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-brand-50 text-brand-600"}`}>
                      {c.direction === "inbound" ? "↙ Received" : "↗ Sent"}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">{formatRelative(c.communicated_at)}</span>
                  </div>
                  {c.subject && <p className="text-xs font-medium text-gray-700 mt-0.5">{c.subject}</p>}
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{c.content}</p>
                </div>
                <button onClick={() => deleteComm(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Interviews */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Upcoming Interviews</h3>
          <button onClick={() => setShowScheduleModal(true)} className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-brand-600">
            + Schedule New
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Candidate","Designation","Date & Time","Round","Meet Link","Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              : interviews.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No upcoming interviews</td></tr>
              : interviews.map(iv => (
                <tr key={iv.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{iv.candidate_name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{iv.designation_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700">{formatDateTime(iv.scheduled_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {ROUND_LABELS[iv.round] ?? iv.round}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {iv.meet_link ? <a href={iv.meet_link} target="_blank" rel="noopener noreferrer" className="text-brand-500 text-xs font-medium hover:underline">🔗 Join</a>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      iv.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>{iv.status.charAt(0).toUpperCase() + iv.status.slice(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 2-col grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">My Candidates — This Period</h3>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Name","Stage","Last Update"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">Loading…</td></tr>
                : candidates.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">No candidates added this period</td></tr>
                : candidates.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge[c.final_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.final_status ?? "Sourced"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                      {new Date(c.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">My Joinings (All Time)</h3>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Name","DOJ (Actual)","File No"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">Loading…</td></tr>
                : joinings.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">No joinings yet</td></tr>
                : joinings.map(j => (
                  <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{j.name}</td>
                    <td className="px-4 py-2.5 text-green-700 font-semibold">
                      {j.doj_actual ? new Date(j.doj_actual).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{j.file_no ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Log Communication Modal ── */}
      {showCommModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCommModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[460px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900 text-base">Log Communication</h3>

            {/* Candidate search */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Candidate *</label>
              <div className="relative" ref={activeSearch === "comm" ? suggRef : undefined}>
                <input
                  value={commForm.candidate_name}
                  onChange={e => {
                    setCommForm(p => ({ ...p, candidate_name: e.target.value, candidate_id: "" }));
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => searchCandidates(e.target.value, "comm"), 250);
                  }}
                  onFocus={() => { if (suggestions.length && activeSearch === "comm") setShowSugg(true); }}
                  placeholder="Search candidate…"
                  autoComplete="off"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                {commForm.candidate_id && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓</span>
                )}
                <SuggestionBox ctx="comm" onSelect={c => setCommForm(p => ({ ...p, candidate_id: c.id, candidate_name: c.name }))} />
              </div>
            </div>

            {/* Channel + Direction */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Channel *</label>
                <select value={commForm.type} onChange={e => setCommForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  {CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.icon} {ch.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Direction</label>
                <select value={commForm.direction} onChange={e => setCommForm(p => ({ ...p, direction: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="outbound">↗ Sent (Outbound)</option>
                  <option value="inbound">↙ Received (Inbound)</option>
                </select>
              </div>
            </div>

            {/* Subject (optional for email) */}
            {commForm.type === "email" && (
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Subject</label>
                <input value={commForm.subject} onChange={e => setCommForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="e.g. Interview Invitation — Electrical Engineer"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            )}

            {/* Message */}
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                {commForm.type === "call" ? "Call Summary *" : commForm.type === "email" ? "Email Summary *" : "Message / Notes *"}
              </label>
              <textarea rows={4} value={commForm.content} onChange={e => setCommForm(p => ({ ...p, content: e.target.value }))}
                placeholder={commForm.type === "call" ? "e.g. Discussed joining date, candidate agreed to report on 1 May…"
                  : commForm.type === "email" ? "e.g. Sent offer letter and welcome email…"
                  : "Paste message or summarise the conversation…"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={saveComm} disabled={savingComm || !commForm.candidate_id || !commForm.content.trim()}
                className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-50">
                {savingComm ? "Saving…" : "Log Communication"}
              </button>
              <button onClick={() => setShowCommModal(false)}
                className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Interview Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowScheduleModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[420px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900 text-base">Schedule Interview</h3>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Candidate Name</label>
              <div className="relative" ref={activeSearch === "schedule" ? suggRef : undefined}>
                <input
                  value={scheduleForm.candidate_name}
                  onChange={e => {
                    setScheduleForm(p => ({ ...p, candidate_name: e.target.value, candidate_id: "" }));
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => searchCandidates(e.target.value, "schedule"), 250);
                  }}
                  onFocus={() => { if (suggestions.length && activeSearch === "schedule") setShowSugg(true); }}
                  placeholder="Start typing to search candidates…"
                  autoComplete="off"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                {scheduleForm.candidate_id && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓ linked</span>
                )}
                <SuggestionBox ctx="schedule" onSelect={c => setScheduleForm(p => ({ ...p, candidate_id: c.id, candidate_name: c.name }))} />
              </div>
              {!scheduleForm.candidate_id && scheduleForm.candidate_name.length > 1 && (
                <p className="text-xs text-amber-600 mt-1">Select a candidate from the suggestions to link properly</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Round</label>
              <select value={scheduleForm.round} onChange={e => setScheduleForm(p => ({...p, round: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                <option value="telephonic">Telephonic</option>
                <option value="pi1">PI Round 1</option>
                <option value="pi2">PI Round 2</option>
                <option value="pi3">PI Round 3</option>
                <option value="hr_discussion">HR Discussion</option>
                <option value="final">Final</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Date & Time</label>
              <input type="datetime-local" value={scheduleForm.scheduled_at} onChange={e => setScheduleForm(p => ({...p, scheduled_at: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Meet Link (optional)</label>
              <input value={scheduleForm.meet_link} onChange={e => setScheduleForm(p => ({...p, meet_link: e.target.value}))}
                placeholder="https://meet.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                disabled={!scheduleForm.candidate_id || !scheduleForm.scheduled_at || scheduling}
                onClick={async () => {
                  setScheduling(true);
                  try {
                    const res = await fetch("/api/interviews", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        candidate_id: scheduleForm.candidate_id,
                        round: scheduleForm.round,
                        scheduled_at: scheduleForm.scheduled_at,
                        meet_link: scheduleForm.meet_link || undefined,
                      }),
                    });
                    if (res.ok) {
                      toast.success("Interview scheduled");
                      setShowScheduleModal(false);
                      setScheduleForm({ candidate_id: "", candidate_name: "", round: "telephonic", scheduled_at: "", meet_link: "" });
                      fetchData();
                    } else {
                      const j = await res.json(); toast.error(j.error ?? "Failed to schedule");
                    }
                  } finally { setScheduling(false); }
                }}
                className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-50">
                {scheduling ? "Scheduling…" : "Schedule Interview"}
              </button>
              <button onClick={() => setShowScheduleModal(false)}
                className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
