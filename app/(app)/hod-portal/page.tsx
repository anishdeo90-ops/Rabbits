"use client";

import { useEffect, useState, useCallback } from "react";
import type { Master, Profile, HiringRequest } from "@/lib/types";
import toast from "react-hot-toast";

const URGENCY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-brand-100 text-brand-700",
  normal: "bg-blue-50 text-blue-600",
  low:    "bg-gray-100 text-gray-500",
};
const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  converted: "bg-blue-100 text-blue-700",
};

interface Job {
  id: string; title: string; status: string; designation_name?: string;
  site_name?: string; headcount: number; priority: string; opened_at?: string; hod_id?: string;
}

export default function HodPortalPage() {
  const [tab, setTab] = useState<"jobs" | "requests">("jobs");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [sites, setSites] = useState<Master[]>([]);
  const [designations, setDesignations] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<HiringRequest>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Fetch current profile
    fetch("/api/me").then(r => r.json()).then(j => setProfile(j.data)).catch(() => {});
    Promise.all([
      fetch("/api/masters?type=site").then(r => r.json()),
      fetch("/api/masters?type=designation").then(r => r.json()),
    ]).then(([s, d]) => { setSites(s.data ?? []); setDesignations(d.data ?? []); });
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (profile.role === "hod") params.set("hod_id", profile.id);
      const res = await fetch(`/api/jobs?${params}`);
      const json = await res.json();
      setJobs(json.data ?? []);
    } finally { setLoading(false); }
  }, [profile]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hiring-requests");
      const json = await res.json();
      setRequests(json.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (profile) { fetchJobs(); fetchRequests(); } }, [profile, fetchJobs, fetchRequests]);
  useEffect(() => { if (tab === "jobs") fetchJobs(); else fetchRequests(); }, [tab, fetchJobs, fetchRequests]);

  async function submitRequest() {
    if (!form.title?.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/hiring-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, headcount: form.headcount ?? 1, urgency: form.urgency ?? "normal" }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error ?? "Failed"); return; }
      toast.success("Request submitted");
      setShowModal(false);
      setForm({});
      fetchRequests();
    } finally { setSaving(false); }
  }

  async function reviewRequest(id: string, status: "approved" | "rejected") {
    const res = await fetch("/api/hiring-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { toast.success(`Request ${status}`); fetchRequests(); }
    else { const j = await res.json(); toast.error(j.error ?? "Failed"); }
  }

  const isAdminHR = profile && ["admin","hr_manager"].includes(profile.role);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">HOD Portal</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage your positions and raise hiring requests</p>
        </div>
        {tab === "requests" && (
          <button onClick={() => setShowModal(true)}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">
            + New Request
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200">
        {([["jobs","Jobs I Manage"],["requests","Hiring Requests"]] as [string,string][]).map(([key,label]) => (
          <button key={key} onClick={() => setTab(key as "jobs"|"requests")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : tab === "jobs" ? (
        jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {profile?.role === "hod" ? "No jobs assigned to you yet. Ask HR to assign your positions." : "No jobs found."}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map(job => (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">{job.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{job.designation_name} · {job.site_name}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    job.status === "open" ? "bg-green-500" : job.status === "on_hold" ? "bg-yellow-500" :
                    job.status === "filled" ? "bg-blue-500" : "bg-gray-300"
                  }`} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${URGENCY_COLORS[job.priority] ?? ""}`}>{job.priority}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full capitalize">{job.status.replace("_"," ")}</span>
                  {job.headcount > 1 && <span className="text-xs text-gray-400">{job.headcount} openings</span>}
                </div>
                {job.opened_at && <p className="text-xs text-gray-400">Opened: {job.opened_at.slice(0,10)}</p>}
              </div>
            ))}
          </div>
        )
      ) : (
        requests.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No hiring requests yet. Click &quot;+ New Request&quot; to submit one.</div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm text-gray-900">{req.title}</h3>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${URGENCY_COLORS[req.urgency]}`}>{req.urgency}</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[req.status]}`}>{req.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {req.designation?.name && <span>{req.designation.name}</span>}
                      {req.site?.name && <span> · {req.site.name}</span>}
                      {req.headcount > 1 && <span> · {req.headcount} openings</span>}
                    </p>
                    {req.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{req.description}</p>}
                    {isAdminHR && req.requester && <p className="text-xs text-gray-400 mt-1">By: {req.requester.name}</p>}
                    {req.review_notes && <p className="text-xs text-gray-500 mt-1 italic">Note: {req.review_notes}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-gray-400">{req.created_at.slice(0,10)}</p>
                    {isAdminHR && req.status === "pending" && (
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => reviewRequest(req.id, "approved")}
                          className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-lg hover:bg-green-600">Approve</button>
                        <button onClick={() => reviewRequest(req.id, "rejected")}
                          className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100">Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] max-h-[90vh] overflow-y-auto shadow-2xl z-10">
            <h3 className="font-bold text-gray-900 text-base mb-4">New Hiring Request</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Position Title *</label>
                <input value={form.title ?? ""} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                  placeholder="e.g. Senior BDM — Logistics"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Designation</label>
                  <select value={form.designation_id ?? ""} onChange={e => setForm(p => ({...p, designation_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Site</label>
                  <select value={form.site_id ?? ""} onChange={e => setForm(p => ({...p, site_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Headcount</label>
                  <input type="number" min={1} value={form.headcount ?? 1} onChange={e => setForm(p => ({...p, headcount: parseInt(e.target.value) || 1}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Urgency</label>
                  <select value={form.urgency ?? "normal"} onChange={e => setForm(p => ({...p, urgency: e.target.value as HiringRequest["urgency"]}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Justification / Description</label>
                <textarea rows={3} value={form.description ?? ""} onChange={e => setForm(p => ({...p, description: e.target.value || undefined}))}
                  placeholder="Why is this position needed? Any specific requirements…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={submitRequest} disabled={saving}
                className="flex-1 bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
                {saving ? "Submitting…" : "Submit Request"}
              </button>
              <button onClick={() => { setShowModal(false); setForm({}); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
