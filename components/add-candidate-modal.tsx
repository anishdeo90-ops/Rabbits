"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import type { Master, Profile } from "@/lib/types";

interface DupCandidate {
  id: string; name: string; mobile: string; current_designation: string | null;
  final_status: string | null; hr_name: string | null; site_name: string | null;
}

interface Props {
  profile: Profile;
  sites: Master[];
  designations: Master[];
  sources: Master[];
  statuses: Master[];
  recruiters: Profile[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddCandidateModal({ profile, sites, designations, sources, statuses, recruiters, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [dupLoading, setDupLoading]       = useState(false);
  const [duplicates, setDuplicates]       = useState<DupCandidate[]>([]);
  const [showDupModal, setShowDupModal]   = useState(false);
  const [pendingDupId, setPendingDupId]   = useState<string | null>(null);
  const [linkingCoSrc, setLinkingCoSrc]   = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    current_designation: "",
    designation_id: "",
    site_id: "",
    source_id: "",
    current_location: "",
    present_salary: "",
    expected_salary: "",
    month: new Date().toISOString().slice(0, 7),   // YYYY-MM format for DB consistency
    application_date: new Date().toISOString().split("T")[0],
    naukri_profile_url: "",
    hr_id: profile.role === "recruiter" ? profile.id : "",
    final_status: statuses[0]?.name ?? "Sourced",
  });

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function checkDuplicates(mobile: string) {
    if (mobile.trim().length < 7) return;
    setDupLoading(true);
    try {
      const res = await fetch(`/api/candidates/duplicates?mobile=${encodeURIComponent(mobile.trim())}&limit=5`);
      if (!res.ok) return;
      const j = await res.json();
      const matches: DupCandidate[] = j.data ?? [];
      if (matches.length > 0) {
        setDuplicates(matches);
        setPendingDupId(matches[0].id);
        setShowDupModal(true);
      }
    } catch { /* ignore */ }
    finally { setDupLoading(false); }
  }

  async function linkAsCoSourcer(existingId: string) {
    setLinkingCoSrc(true);
    try {
      const res = await fetch("/api/co-sourcers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: existingId, recruiter_id: profile.id }),
      });
      if (res.ok) {
        toast.success("You've been added as co-sourcer");
        setShowDupModal(false);
        onSaved();
      } else {
        const e = await res.json();
        toast.error(e.error ?? "Failed to link");
      }
    } catch { toast.error("Failed to link"); }
    finally { setLinkingCoSrc(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim())          { toast.error("Candidate name is required"); return; }
    if (!form.mobile?.trim())       { toast.error("Mobile number is required"); return; }
    if (!form.designation_id)       { toast.error("Designation (applied for) is required"); return; }
    if (!form.final_status?.trim()) { toast.error("Status is required"); return; }
    setSaving(true);

    const payload: Record<string, string | number | null> = { ...form };
    if (form.present_salary)  payload.present_salary  = Number(form.present_salary);
    if (form.expected_salary) payload.expected_salary = Number(form.expected_salary);

    const res = await fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success("Candidate added");
      onSaved();
    } else if (res.status === 409) {
      // Duplicate mobile — show the modal instead of a plain toast
      const err = await res.json();
      const dup: DupCandidate = { id: err.duplicate_id, name: err.error.split('"')[1] ?? "Existing", mobile: form.mobile, current_designation: null, final_status: null, hr_name: null, site_name: null };
      setDuplicates([dup]);
      setPendingDupId(err.duplicate_id);
      setShowDupModal(true);
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to add");
    }
    setSaving(false);
  }

  const field = (label: string, key: string, type = "text", required = false, min?: number, onBlur?: () => void) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={(form as Record<string, string>)[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        onBlur={onBlur}
        required={required}
        min={min !== undefined ? String(min) : undefined}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );

  const select = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={(form as Record<string, string>)[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Add New Candidate</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form id="add-candidate-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            {field("Candidate Name", "name", "text", true)}
            {field("Mobile", "mobile", "tel", false, undefined, () => checkDuplicates(form.mobile))}
            {field("Email", "email", "email")}
            {field("Current Designation", "current_designation")}
            {select("Applied For (Designation)", "designation_id", designations.map((d) => ({ value: d.id, label: d.name })))}
            {select("Site", "site_id", sites.map((s) => ({ value: s.id, label: s.name })))}
            {select("Source", "source_id", sources.map((s) => ({ value: s.id, label: s.name })))}
            {field("Current Location", "current_location")}
            {field("Present Salary (₹)", "present_salary", "number", false, 0)}
            {field("Expected Salary (₹)", "expected_salary", "number", false, 0)}
            {field("Month", "month", "month")}
            {field("Application Date", "application_date", "date")}
            {field("Profile Link (Naukri / LinkedIn)", "naukri_profile_url", "url")}

            {profile.role !== "recruiter" && select(
              "Assigned Recruiter", "hr_id",
              recruiters.map((r) => ({ value: r.id, label: r.name }))
            )}

            {select("Initial Status", "final_status",
              statuses.map(s => ({ value: s.name, label: s.name }))
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          {dupLoading && <span className="text-xs text-gray-400 mr-auto flex items-center gap-1"><span className="animate-spin inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />Checking duplicates…</span>}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-candidate-form"
            disabled={saving}
            className="px-5 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add Candidate"}
          </button>
        </div>
      </div>

      {/* Duplicate Detection Modal */}
      {showDupModal && duplicates.length > 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-start gap-3 px-6 py-5 border-b">
              <div className="p-2 bg-yellow-100 rounded-full flex-shrink-0">
                <AlertTriangle size={18} className="text-yellow-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Duplicate Mobile Detected</h3>
                <p className="text-xs text-gray-500 mt-0.5">This mobile number already exists in the system.</p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-2 max-h-56 overflow-y-auto">
              {duplicates.map(dup => (
                <div key={dup.id} className="border border-gray-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{dup.name}</p>
                      <p className="text-xs text-gray-500">{dup.current_designation ?? "—"} · {dup.site_name ?? "—"} · {dup.hr_name ?? "—"}</p>
                      {dup.final_status && (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">{dup.final_status}</span>
                      )}
                    </div>
                    <button onClick={() => { setPendingDupId(dup.id); }}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pendingDupId === dup.id ? "border-brand-500 bg-brand-50 text-brand-600" : "border-gray-200 text-gray-500 hover:border-brand-300"}`}>
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex flex-col gap-2">
              {pendingDupId && (
                <button onClick={() => linkAsCoSourcer(pendingDupId)} disabled={linkingCoSrc}
                  className="w-full py-2 text-sm font-medium bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-60">
                  {linkingCoSrc ? "Linking…" : "Link Me as Co-sourcer"}
                </button>
              )}
              <button onClick={() => setShowDupModal(false)}
                className="w-full py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Continue Adding Anyway
              </button>
              <button onClick={() => { setShowDupModal(false); onClose(); }}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
