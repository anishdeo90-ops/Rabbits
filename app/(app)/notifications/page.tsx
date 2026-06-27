"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2, ArrowRight, Check, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  candidate_id: string | null;
  forward_id: string | null;
  job_request_id: string | null;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface JobRequest {
  id: string;
  title: string;
  job_type: string;
  priority: string;
  headcount: number;
  min_salary: number | null;
  max_salary: number | null;
  opened_at: string | null;
  target_doj: string | null;
  description: string | null;
  note: string | null;
  status: string;
  from_profile: { id: string; name: string; role: string };
  designation: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-brand-100 text-brand-700",
  normal: "bg-blue-50 text-blue-600",
  low:    "bg-gray-100 text-gray-500",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [jobRequests, setJobRequests] = useState<Record<string, JobRequest>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const router = useRouter();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setNotifications(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function deleteOne(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  async function handleClick(n: Notification) {
    if (!n.is_read) await markRead(n.id);
    if (n.type === "job_requested" && n.job_request_id) {
      setExpandedId(prev => prev === n.id ? null : n.id);
      if (!jobRequests[n.job_request_id]) {
        const rows: JobRequest[] = await fetch(`/api/job-requests`).then(r => r.json());
        const found = rows.find(r => r.id === n.job_request_id);
        if (found) setJobRequests(prev => ({ ...prev, [n.job_request_id!]: found }));
      }
      return;
    }
    if (n.candidate_id) {
      router.push(`/candidates?open=${n.candidate_id}`);
    }
  }

  async function approveRequest(n: Notification) {
    if (!n.job_request_id) return;
    setActioning(n.id);
    try {
      const res = await fetch(`/api/job-requests/${n.job_request_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setExpandedId(null);
        // replace the notification body to reflect approval
        setNotifications(prev => prev.map(x =>
          x.id === n.id ? { ...x, body: x.body + " — ✓ Approved" } : x
        ));
      } else {
        const j = await res.json();
        alert(j.error ?? "Failed to approve");
      }
    } finally {
      setActioning(null);
    }
  }

  async function rejectRequest(n: Notification) {
    if (!n.job_request_id) return;
    setActioning(n.id);
    try {
      const res = await fetch(`/api/job-requests/${n.job_request_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", review_note: rejectNote || undefined }),
      });
      if (res.ok) {
        setExpandedId(null);
        setRejectingId(null);
        setRejectNote("");
        setNotifications(prev => prev.map(x =>
          x.id === n.id ? { ...x, body: x.body + " — ✗ Rejected", is_read: true } : x
        ));
      } else {
        const j = await res.json();
        alert(j.error ?? "Failed to reject");
      }
    } finally {
      setActioning(null);
    }
  }

  const unread = notifications.filter(n => !n.is_read).length;

  function notifIcon(type: string) {
    if (type === "candidate_forwarded") return <span className="text-white font-bold text-sm">→</span>;
    if (type === "form_submitted") return <span>📋</span>;
    if (type === "job_requested") return <span>📝</span>;
    if (type === "job_request_approved") return <CheckCircle2 size={16} className="text-white" />;
    if (type === "job_request_rejected") return <XCircle size={16} className="text-white" />;
    if (type === "job_assigned") return <span>💼</span>;
    return <Check size={16} className="text-white" />;
  }

  function notifBg(type: string) {
    if (type === "candidate_forwarded") return "bg-indigo-500";
    if (type === "form_submitted") return "bg-brand-500";
    if (type === "job_requested") return "bg-amber-500";
    if (type === "job_request_approved") return "bg-green-500";
    if (type === "job_request_rejected") return "bg-red-400";
    if (type === "job_assigned") return "bg-blue-500";
    return "bg-green-500";
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          {unread > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
              {unread} unread
            </span>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
            <CheckCheck size={15} /> Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Bell size={40} className="opacity-30" />
          <p className="text-sm">No notifications yet</p>
          <p className="text-xs text-gray-300">Candidate forwards, job requests, and form submissions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const isJobRequest = n.type === "job_requested";
            const isExpanded = expandedId === n.id;
            const jr = n.job_request_id ? jobRequests[n.job_request_id] : null;
            const alreadyActioned = jr?.status !== "pending";

            return (
              <div key={n.id}
                className={`group relative rounded-xl border transition-all ${
                  n.is_read
                    ? "bg-white border-gray-100 hover:border-gray-200"
                    : isJobRequest
                      ? "bg-amber-50/60 border-amber-100 hover:border-amber-200"
                      : "bg-indigo-50/60 border-indigo-100 hover:border-indigo-200"
                }`}>

                {/* Main row */}
                <div className="flex gap-3 p-4 cursor-pointer" onClick={() => handleClick(n)}>
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${notifBg(n.type)}`}>
                    {notifIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                        {isJobRequest && (
                          <span className="text-gray-400">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 leading-snug">{n.body}</p>
                    {!isJobRequest && n.candidate_id && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 font-medium">
                        Open candidate <ArrowRight size={11} />
                      </span>
                    )}
                    {isJobRequest && !alreadyActioned && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-amber-600 font-medium">
                        {isExpanded ? "Hide details" : "Review & approve"} <ArrowRight size={11} />
                      </span>
                    )}
                  </div>

                  {!n.is_read && (
                    <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1 ${isJobRequest ? "bg-amber-500" : "bg-indigo-500"}`} />
                  )}
                </div>

                {/* Expanded job request panel */}
                {isJobRequest && isExpanded && (
                  <div className="border-t border-amber-100 px-4 pb-4 pt-3 space-y-3">
                    {!jr ? (
                      <p className="text-xs text-gray-400">Loading details…</p>
                    ) : (
                      <>
                        {/* Job details */}
                        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-gray-900">{jr.title}</p>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[jr.priority] ?? ""}`}>
                              {jr.priority}
                            </span>
                            {jr.job_type === "client" && (
                              <span className="text-xs bg-purple-50 text-purple-600 font-semibold px-1.5 py-0.5 rounded-full">Client</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                            {jr.designation && <span>Designation: <span className="text-gray-700 font-medium">{jr.designation.name}</span></span>}
                            {jr.site && <span>Site: <span className="text-gray-700 font-medium">{jr.site.name}</span></span>}
                            {jr.headcount > 1 && <span>Openings: <span className="text-gray-700 font-medium">{jr.headcount}</span></span>}
                            {(jr.min_salary || jr.max_salary) && (
                              <span>Budget: <span className="text-gray-700 font-medium">
                                ₹{jr.min_salary?.toLocaleString("en-IN") ?? "—"} – ₹{jr.max_salary?.toLocaleString("en-IN") ?? "—"}
                              </span></span>
                            )}
                            {jr.opened_at && <span>Open Date: <span className="text-gray-700 font-medium">{jr.opened_at.slice(0,10)}</span></span>}
                            {jr.target_doj && <span>Target DOJ: <span className="text-gray-700 font-medium">{jr.target_doj.slice(0,10)}</span></span>}
                          </div>
                          {jr.description && <p className="text-xs text-gray-500 border-t border-gray-50 pt-2">{jr.description}</p>}
                          {jr.note && (
                            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 italic">
                              Note from {jr.from_profile.name}: "{jr.note}"
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        {alreadyActioned ? (
                          <p className="text-xs text-gray-400 text-center py-1">
                            Already {jr.status} — no further action needed.
                          </p>
                        ) : rejectingId === n.id ? (
                          <div className="space-y-2">
                            <textarea rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                              placeholder="Reason for rejection (optional)…"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-red-400" />
                            <div className="flex gap-2">
                              <button onClick={() => { setRejectingId(null); setRejectNote(""); }}
                                className="flex-1 border border-gray-200 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-50">
                                Back
                              </button>
                              <button onClick={() => rejectRequest(n)} disabled={actioning === n.id}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 text-white py-2 rounded-lg text-xs font-semibold hover:bg-red-600 disabled:opacity-50">
                                <XCircle size={13} />
                                {actioning === n.id ? "Rejecting…" : "Confirm Reject"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setRejectingId(n.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-500 py-2 rounded-lg text-xs font-semibold hover:bg-red-50">
                              <XCircle size={13} /> Reject
                            </button>
                            <button onClick={() => approveRequest(n)} disabled={actioning === n.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                              <CheckCircle2 size={13} />
                              {actioning === n.id ? "Approving…" : "Approve & Create Job"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all p-1 rounded">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
