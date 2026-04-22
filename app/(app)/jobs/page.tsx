"use client";

import { useEffect, useState, useCallback } from "react";
import { Link2, X, Upload } from "lucide-react";
import Link from "next/link";
import type { Job, Master, Profile } from "@/lib/types";
import toast from "react-hot-toast";

interface FormSummary { id: string; name: string; type: string; }
interface FormJobLink { form_id: string; forms: { id: string; name: string; type: string }; }

type JobTab = "open" | "on_hold" | "closed" | "filled";

const TAB_CONFIG: { key: JobTab; label: string; statusFilter?: string; typeFilter?: string }[] = [
  { key: "open",    label: "Open",    statusFilter: "open" },
  { key: "on_hold", label: "On Hold", statusFilter: "on_hold" },
  { key: "closed",  label: "Closed",  statusFilter: "closed" },
  { key: "filled",  label: "Filled",  statusFilter: "filled" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-brand-100 text-brand-700",
  normal: "bg-blue-50 text-blue-600",
  low:    "bg-gray-100 text-gray-500",
};

export default function JobsPage() {
  const [tab, setTab]         = useState<JobTab>("open");
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm]       = useState<Partial<Job> & { recruiter_ids?: string[] }>({});
  const [masters, setMasters] = useState<{ sites: Master[]; designations: Master[]; recruiters: { id: string; name: string }[] }>
    ({ sites: [], designations: [], recruiters: [] });
  const [linkingJob, setLinkingJob] = useState<Job | null>(null);
  const [allForms, setAllForms] = useState<FormSummary[]>([]);
  const [linkedForms, setLinkedForms] = useState<string[]>([]); // form_ids linked to current job
  const [linkLoading, setLinkLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/masters?type=site").then(r => r.json()),
      fetch("/api/masters?type=designation").then(r => r.json()),
      fetch("/api/users").then(r => r.json()),
    ]).then(([s, d, u]) => setMasters({
      sites: s.data ?? [],
      designations: d.data ?? [],
      recruiters: (u.data ?? []).filter((u: Profile) => u.role === "recruiter"),
    }));
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = TAB_CONFIG.find(t => t.key === tab)!;
      const params = new URLSearchParams();
      if (cfg.statusFilter) params.set("status",   cfg.statusFilter);
      if (cfg.typeFilter)   params.set("job_type", cfg.typeFilter);
      const res  = await fetch(`/api/jobs?${params}`);
      const json = await res.json();
      setJobs(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function createJob() {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "open", headcount: form.headcount ?? 1, priority: form.priority ?? "normal" }),
    });
    if (res.ok) { setShowModal(false); setForm({}); fetchJobs(); }
    else { const j = await res.json(); toast.error(j.error ?? "Failed to create job"); }
  }

  async function updateJob() {
    if (!editingJob) return;
    const res = await fetch(`/api/jobs/${editingJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setEditingJob(null); setForm({}); fetchJobs(); }
    else { const j = await res.json(); toast.error(j.error ?? "Failed to update job"); }
  }

  async function toggleStatus(job: Job, newStatus: Job["status"]) {
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchJobs();
  }

  const isClosed = (j: Job) => j.status === "closed" || j.status === "filled";

  async function openLinkModal(job: Job) {
    setLinkingJob(job);
    setLinkLoading(true);
    try {
      const [formsRes, linksRes] = await Promise.all([
        fetch("/api/forms").then(r => r.json()),
        fetch(`/api/form-job-links?job_id=${job.id}`).then(r => r.json()),
      ]);
      setAllForms(formsRes.data ?? []);
      setLinkedForms((linksRes.data ?? []).map((l: FormJobLink) => l.form_id));
    } finally {
      setLinkLoading(false);
    }
  }

  async function toggleFormLink(formId: string) {
    if (!linkingJob) return;
    const isLinked = linkedForms.includes(formId);
    if (isLinked) {
      await fetch(`/api/form-job-links?form_id=${formId}&job_id=${linkingJob.id}`, { method: "DELETE" });
      setLinkedForms(prev => prev.filter(id => id !== formId));
    } else {
      await fetch("/api/form-job-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: formId, job_id: linkingJob.id }),
      });
      setLinkedForms(prev => [...prev, formId]);
    }
  }

  const FORM_TYPE_COLORS: Record<string, string> = {
    application:    "bg-blue-50 text-blue-600",
    screening:      "bg-purple-50 text-purple-600",
    interview_prep: "bg-indigo-50 text-indigo-600",
    assessment:     "bg-brand-50 text-brand-600",
    onboarding:     "bg-green-50 text-green-600",
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">{jobs.length} job{jobs.length !== 1 ? "s" : ""} in this view</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/import"
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload size={14} /> Import
          </Link>
          <button onClick={() => setShowModal(true)}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">
            + New Job
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200">
        {TAB_CONFIG.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Job Cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No jobs in this category</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map(job => (
            <div key={job.id}
              className={`bg-white rounded-xl border ${isClosed(job) ? "border-gray-100 opacity-70" : "border-gray-200"} p-5 space-y-3`}>
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-semibold text-sm ${isClosed(job) ? "text-gray-400" : "text-gray-900"}`}>
                      {job.title}
                    </h3>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[job.priority] ?? ""}`}>
                      {job.priority}
                    </span>
                    {job.job_type === "client" && (
                      <span className="text-xs bg-purple-50 text-purple-600 font-semibold px-1.5 py-0.5 rounded-full">Client</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {job.designation_name} · {job.site_name}
                    {job.headcount > 1 ? ` · ${job.headcount} openings` : ""}
                  </p>
                </div>
                <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                  job.status === "open" ? "bg-green-500" :
                  job.status === "on_hold" ? "bg-yellow-500" :
                  job.status === "filled" ? "bg-blue-500" : "bg-gray-300"
                }`} />
              </div>

              {/* Recruiters */}
              {job.recruiters && job.recruiters.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Assigned:</span>
                  <div className="flex gap-1 flex-wrap">
                    {job.recruiters.map(r => (
                      <span key={r.id} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                        {r.recruiter_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Client job info */}
              {job.job_type === "client" && job.client_name && (
                <div className="bg-purple-50 rounded-lg px-3 py-2 text-xs">
                  <span className="text-purple-600 font-medium">Client: {job.client_name}</span>
                  {job.placement_fee_pct && <span className="text-purple-400 ml-2">Fee: {job.placement_fee_pct}%</span>}
                </div>
              )}

              {/* Pipeline counters */}
              {((job.candidates_pipeline ?? 0) > 0 || (job.candidates_joined ?? 0) > 0) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(job.candidates_pipeline ?? 0) > 0 && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                      {job.candidates_pipeline} in pipeline
                    </span>
                  )}
                  {(job.candidates_shortlisted ?? 0) > 0 && (
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                      {job.candidates_shortlisted} shortlisted
                    </span>
                  )}
                  {(job.candidates_appointed ?? 0) > 0 && (
                    <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-medium">
                      {job.candidates_appointed} offered
                    </span>
                  )}
                  {(job.candidates_joined ?? 0) > 0 && (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {job.candidates_joined} joined ✓
                    </span>
                  )}
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {job.opened_at && <span>Opened: {job.opened_at.slice(0,10)}</span>}
                {job.target_doj && <span>Target DOJ: {job.target_doj.slice(0,10)}</span>}
              </div>

              {/* Salary range */}
              {(job.min_salary || job.max_salary) && (
                <div className="text-xs text-gray-500">
                  Budget: ₹{job.min_salary?.toLocaleString("en-IN")} – ₹{job.max_salary?.toLocaleString("en-IN")}
                </div>
              )}

              {/* Actions */}
              {!isClosed(job) && (
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <button
                    onClick={() => openLinkModal(job)}
                    className="text-xs text-blue-600 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                    <Link2 size={11} /> Forms
                  </button>
                  <button
                    onClick={() => {
                      setEditingJob(job);
                      setForm({
                        title: job.title, job_type: job.job_type, designation_id: job.designation_id,
                        site_id: job.site_id, headcount: job.headcount, priority: job.priority,
                        min_salary: job.min_salary, max_salary: job.max_salary,
                        opened_at: job.opened_at, target_doj: job.target_doj,
                        client_name: job.client_name, placement_fee_pct: job.placement_fee_pct,
                        description: job.description,
                        recruiter_ids: job.recruiters?.map(r => r.id) ?? [],
                      });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg">Edit</button>
                  <button onClick={() => toggleStatus(job, "on_hold")}
                    className="text-xs text-yellow-600 border border-yellow-200 px-2.5 py-1 rounded-lg hover:bg-yellow-50">
                    Hold
                  </button>
                  <button onClick={() => toggleStatus(job, "closed")}
                    className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50">
                    Close
                  </button>
                  <button onClick={() => toggleStatus(job, "filled")}
                    className="ml-auto text-xs text-green-600 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-50">
                    Mark Filled ✓
                  </button>
                </div>
              )}
              {isClosed(job) && (
                <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-400 capitalize">{job.status}</span>
                  <button onClick={() => toggleStatus(job, "open")}
                    className="text-xs text-brand-500 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50">
                    Reopen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl z-10">
            <h3 className="font-bold text-gray-900 text-base mb-4">Create New Job</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Job Title *</label>
                  <input value={form.title ?? ""} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                    placeholder="e.g. Electrical Engineer"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Type</label>
                  <select value={form.job_type ?? "internal"} onChange={e => setForm(p => ({...p, job_type: e.target.value as "internal"|"client"}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="internal">Internal</option>
                    <option value="client">Client</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Designation</label>
                  <select value={form.designation_id ?? ""} onChange={e => setForm(p => ({...p, designation_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {masters.designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Site</label>
                  <select value={form.site_id ?? ""} onChange={e => setForm(p => ({...p, site_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {masters.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Headcount</label>
                  <input type="number" min={1} value={form.headcount ?? 1} onChange={e => setForm(p => ({...p, headcount: parseInt(e.target.value)}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Priority</label>
                  <select value={form.priority ?? "normal"} onChange={e => setForm(p => ({...p, priority: e.target.value as Job["priority"]}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Min Salary (₹)</label>
                  <input type="number" value={form.min_salary ?? ""} onChange={e => setForm(p => ({...p, min_salary: parseFloat(e.target.value) || undefined}))}
                    placeholder="e.g. 500000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Max Salary (₹)</label>
                  <input type="number" value={form.max_salary ?? ""} onChange={e => setForm(p => ({...p, max_salary: parseFloat(e.target.value) || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Opening Date</label>
                  <input type="date" value={form.opened_at ?? ""} onChange={e => setForm(p => ({...p, opened_at: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Target DOJ</label>
                  <input type="date" value={form.target_doj ?? ""} onChange={e => setForm(p => ({...p, target_doj: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>

              {form.job_type === "client" && (
                <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Client Name</label>
                    <input value={form.client_name ?? ""} onChange={e => setForm(p => ({...p, client_name: e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Placement Fee %</label>
                    <input type="number" value={form.placement_fee_pct ?? ""} onChange={e => setForm(p => ({...p, placement_fee_pct: parseFloat(e.target.value) || undefined}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Assign Recruiters</label>
                <div className="flex flex-wrap gap-2">
                  {masters.recruiters.map(r => {
                    const selected = (form.recruiter_ids ?? []).includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          recruiter_ids: selected
                            ? (p.recruiter_ids ?? []).filter(id => id !== r.id)
                            : [...(p.recruiter_ids ?? []), r.id],
                        }))}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                          selected ? "bg-brand-500 text-white border-brand-500" : "border-gray-200 text-gray-600 hover:border-brand-300"
                        }`}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
                <textarea rows={3} value={form.description ?? ""} onChange={e => setForm(p => ({...p, description: e.target.value || undefined}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={createJob}
                className="flex-1 bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600">
                Create Job
              </button>
              <button onClick={() => { setShowModal(false); setForm({}); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setEditingJob(null); setForm({}); }} />
          <div className="relative bg-white rounded-2xl p-6 w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl z-10">
            <h3 className="font-bold text-gray-900 text-base mb-4">Edit Job — {editingJob.title}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Job Title *</label>
                  <input value={form.title ?? ""} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Status</label>
                  <select value={form.status ?? editingJob.status} onChange={e => setForm(p => ({...p, status: e.target.value as Job["status"]}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="open">Open</option>
                    <option value="on_hold">On Hold</option>
                    <option value="closed">Closed</option>
                    <option value="filled">Filled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Type</label>
                  <select value={form.job_type ?? "internal"} onChange={e => setForm(p => ({...p, job_type: e.target.value as "internal"|"client"}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="internal">Internal</option>
                    <option value="client">Client</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Designation</label>
                  <select value={form.designation_id ?? ""} onChange={e => setForm(p => ({...p, designation_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {masters.designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Site</label>
                  <select value={form.site_id ?? ""} onChange={e => setForm(p => ({...p, site_id: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select —</option>
                    {masters.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Headcount</label>
                  <input type="number" min={1} value={form.headcount ?? 1} onChange={e => setForm(p => ({...p, headcount: parseInt(e.target.value)}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Priority</label>
                  <select value={form.priority ?? "normal"} onChange={e => setForm(p => ({...p, priority: e.target.value as Job["priority"]}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Min Salary (₹)</label>
                  <input type="number" value={form.min_salary ?? ""} onChange={e => setForm(p => ({...p, min_salary: parseFloat(e.target.value) || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Max Salary (₹)</label>
                  <input type="number" value={form.max_salary ?? ""} onChange={e => setForm(p => ({...p, max_salary: parseFloat(e.target.value) || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Opening Date</label>
                  <input type="date" value={form.opened_at ?? ""} onChange={e => setForm(p => ({...p, opened_at: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Target DOJ</label>
                  <input type="date" value={form.target_doj ?? ""} onChange={e => setForm(p => ({...p, target_doj: e.target.value || undefined}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              {form.job_type === "client" && (
                <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Client Name</label>
                    <input value={form.client_name ?? ""} onChange={e => setForm(p => ({...p, client_name: e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Placement Fee %</label>
                    <input type="number" value={form.placement_fee_pct ?? ""} onChange={e => setForm(p => ({...p, placement_fee_pct: parseFloat(e.target.value) || undefined}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Assign Recruiters</label>
                <div className="flex flex-wrap gap-2">
                  {masters.recruiters.map(r => {
                    const selected = (form.recruiter_ids ?? []).includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          recruiter_ids: selected
                            ? (p.recruiter_ids ?? []).filter(id => id !== r.id)
                            : [...(p.recruiter_ids ?? []), r.id],
                        }))}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                          selected ? "bg-brand-500 text-white border-brand-500" : "border-gray-200 text-gray-600 hover:border-brand-300"
                        }`}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
                <textarea rows={3} value={form.description ?? ""} onChange={e => setForm(p => ({...p, description: e.target.value || undefined}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={updateJob}
                className="flex-1 bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600">
                Save Changes
              </button>
              <button onClick={() => { setEditingJob(null); setForm({}); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Forms Modal */}
      {linkingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLinkingJob(null)} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Link Forms</h3>
                <p className="text-xs text-gray-400 mt-0.5">{linkingJob.title}</p>
              </div>
              <button onClick={() => setLinkingJob(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            {linkLoading ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading forms…</div>
            ) : allForms.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No forms created yet. Go to JDs &amp; Forms to create one.</div>
            ) : (
              <div className="space-y-2">
                {allForms.map(f => {
                  const linked = linkedForms.includes(f.id);
                  return (
                    <div key={f.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        linked ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => toggleFormLink(f.id)}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input type="checkbox" readOnly checked={linked}
                          className="w-4 h-4 rounded text-blue-600 border-gray-300 pointer-events-none" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FORM_TYPE_COLORS[f.type] ?? "bg-gray-100 text-gray-500"}`}>
                            {f.type.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-between items-center border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">{linkedForms.length} form{linkedForms.length !== 1 ? "s" : ""} linked</p>
              <button onClick={() => setLinkingJob(null)}
                className="text-sm font-medium text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
