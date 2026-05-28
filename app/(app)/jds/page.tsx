"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Copy, Trash2, Plus, ChevronUp, ChevronDown, Link2 } from "lucide-react";
import toast from "react-hot-toast";

type JdTab = "library" | "assessments" | "forms";

// ── Types ─────────────────────────────────────────────────────────────────────
interface JD { id: string; title: string; designation_name?: string; drive_url?: string; version: number; tags?: string[]; updated_at: string; }
interface Assessment { id: string; title: string; form_url?: string; description?: string; duration_mins?: number; }

type FieldType = "text" | "email" | "phone" | "number" | "date" | "textarea" | "select" | "checkbox" | "file";
interface FormField {
  id: string; type: FieldType; label: string; required: boolean;
  options?: string[];   // for select
  maps_to?: string | null; // candidate profile field
  placeholder?: string;
}
interface Form {
  id: string; name: string; type: string; description?: string;
  fields: FormField[]; is_active: boolean; created_at: string;
}

const FORM_TYPES = [
  { value: "application",    label: "Application",    color: "bg-blue-100 text-blue-700" },
  { value: "screening",      label: "Screening",      color: "bg-purple-100 text-purple-700" },
  { value: "interview_prep", label: "Interview Prep", color: "bg-indigo-100 text-indigo-700" },
  { value: "assessment",     label: "Assessment",     color: "bg-brand-100 text-brand-700" },
  { value: "onboarding",     label: "Onboarding",     color: "bg-green-100 text-green-700" },
];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",     label: "Short Text" },
  { value: "textarea", label: "Long Text"  },
  { value: "email",    label: "Email"      },
  { value: "phone",    label: "Phone"      },
  { value: "number",   label: "Number"     },
  { value: "date",     label: "Date"       },
  { value: "select",   label: "Dropdown"   },
  { value: "checkbox", label: "Yes / No"   },
  { value: "file",     label: "File Upload"},
];

// Candidate fields that form responses can be mapped to
const MAPS_TO_OPTIONS = [
  { value: "",                  label: "— Don't map —" },
  { value: "name",              label: "Full Name" },
  { value: "email",             label: "Email" },
  { value: "mobile",            label: "Mobile" },
  { value: "current_designation", label: "Current Designation" },
  { value: "current_location",  label: "Current Location" },
  { value: "present_salary",    label: "Current CTC" },
  { value: "expected_salary",   label: "Expected CTC" },
  { value: "notice_period_days", label: "Notice Period (days)" },
  { value: "source_name",       label: "Source / How heard" },
];

function typeColor(type: string) {
  return FORM_TYPES.find(t => t.value === type)?.color ?? "bg-gray-100 text-gray-600";
}
function typeLabel(type: string) {
  return FORM_TYPES.find(t => t.value === type)?.label ?? type;
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Field Editor row ──────────────────────────────────────────────────────────
function FieldRow({ field, index, total, onChange, onRemove, onMove }: {
  field: FormField; index: number; total: number;
  onChange: (f: FormField) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex flex-col gap-0.5">
          <button onClick={e => { e.stopPropagation(); onMove(-1); }} disabled={index === 0}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronUp size={13} /></button>
          <button onClick={e => { e.stopPropagation(); onMove(1); }} disabled={index === total - 1}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronDown size={13} /></button>
        </div>
        <span className="text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500 flex-shrink-0">
          {FIELD_TYPES.find(t => t.value === field.type)?.label ?? field.type}
        </span>
        <span className="text-xs text-gray-700 font-medium flex-1 min-w-0 truncate">{field.label || <em className="text-gray-400">Untitled field</em>}</span>
        {field.required && <span className="text-xs text-red-500 flex-shrink-0">required</span>}
        {field.maps_to && <span className="text-xs text-blue-500 flex-shrink-0">→ {field.maps_to}</span>}
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-gray-300 hover:text-red-500 flex-shrink-0 ml-1"><Trash2 size={13} /></button>
        <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Detail editor */}
      {expanded && (
        <div className="px-3 py-3 space-y-2 border-t border-gray-100 bg-white">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Label *</label>
              <input value={field.label} onChange={e => onChange({ ...field, label: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Field Type</label>
              <select value={field.type} onChange={e => onChange({ ...field, type: e.target.value as FieldType })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500">
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Placeholder (optional)</label>
              <input value={field.placeholder ?? ""} onChange={e => onChange({ ...field, placeholder: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Maps to candidate field</label>
              <select value={field.maps_to ?? ""} onChange={e => onChange({ ...field, maps_to: e.target.value || null })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500">
                {MAPS_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {field.type === "select" && (
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Options (one per line)</label>
              <textarea rows={3} value={(field.options ?? []).join("\n")}
                onChange={e => onChange({ ...field, options: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="Option 1&#10;Option 2&#10;Option 3" />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={field.required} onChange={e => onChange({ ...field, required: e.target.checked })}
              className="accent-brand-500" />
            Required field
          </label>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JDsPage() {
  const [tab, setTab] = useState<JdTab>("library");

  // JD Library
  const [jds, setJds]               = useState<JD[]>([]);
  const [showJdModal, setShowJdModal] = useState(false);
  const [showJdEdit, setShowJdEdit]   = useState(false);
  const [jdForm, setJdForm]           = useState<Partial<JD>>({});
  const [editingJd, setEditingJd]     = useState<JD | null>(null);

  // Assessments
  const [assessments, setAssessments]   = useState<Assessment[]>([]);
  const [showAssModal, setShowAssModal] = useState(false);
  const [assForm, setAssForm]           = useState<Partial<Assessment>>({});
  const [editingAss, setEditingAss]     = useState<Assessment | null>(null);
  const [showAssEdit, setShowAssEdit]   = useState(false);
  const [shareUrl, setShareUrl]         = useState<string | null>(null);

  // Forms
  const [forms, setForms]               = useState<Form[]>([]);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [editingForm, setEditingForm]   = useState<Form | null>(null);
  const [fbName, setFbName]             = useState("");
  const [fbType, setFbType]             = useState("application");
  const [fbDesc, setFbDesc]             = useState("");
  const [fbFields, setFbFields]         = useState<FormField[]>([]);
  const [savingForm, setSavingForm]     = useState(false);

  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [jdRes, assRes, fRes] = await Promise.all([
        fetch("/api/jd-library").then(r => r.json()),
        fetch("/api/assessments").then(r => r.json()),
        fetch("/api/forms").then(r => r.json()),
      ]);
      setJds(jdRes.data ?? []);
      setAssessments(assRes.data ?? []);
      setForms(fRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── JD actions ──
  async function createJD() {
    const res = await fetch("/api/jd-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jdForm) });
    if (res.ok) { setShowJdModal(false); setJdForm({}); fetchData(); }
    else { const j = await res.json(); toast.error(j.error ?? "Error"); }
  }
  async function updateJD() {
    if (!editingJd) return;
    const res = await fetch(`/api/jd-library/${editingJd.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jdForm) });
    if (res.ok) { setEditingJd(null); setJdForm({}); fetchData(); }
    else { const j = await res.json(); toast.error(j.error ?? "Error"); }
  }

  // ── Assessment actions ──
  async function createAssessment() {
    const res = await fetch("/api/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assForm) });
    if (res.ok) { setShowAssModal(false); setAssForm({}); fetchData(); }
    else { const j = await res.json(); toast.error(j.error ?? "Error"); }
  }
  async function updateAssessment() {
    if (!editingAss) return;
    const res = await fetch("/api/assessments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingAss.id, ...assForm }) });
    if (res.ok) { setShowAssEdit(false); setEditingAss(null); setAssForm({}); fetchData(); }
    else { const j = await res.json(); toast.error(j.error ?? "Error"); }
  }
  async function deleteAssessment(id: string) {
    if (!confirm("Archive this assessment?")) return;
    const res = await fetch("/api/assessments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, is_active: false }) });
    if (res.ok) { fetchData(); toast.success("Assessment archived"); }
  }
  function shareLink(url: string) { setShareUrl(url); }

  // ── Form builder actions ──
  function openNewForm() {
    setEditingForm(null);
    setFbName(""); setFbType("application"); setFbDesc(""); setFbFields([]);
    setShowFormBuilder(true);
  }
  function openEditForm(f: Form) {
    setEditingForm(f);
    setFbName(f.name); setFbType(f.type); setFbDesc(f.description ?? "");
    setFbFields(f.fields ?? []);
    setShowFormBuilder(true);
  }
  function addField() {
    setFbFields(prev => [...prev, { id: uid(), type: "text", label: "", required: false, maps_to: null }]);
  }
  function updateField(idx: number, field: FormField) {
    setFbFields(prev => prev.map((f, i) => i === idx ? field : f));
  }
  function removeField(idx: number) {
    setFbFields(prev => prev.filter((_, i) => i !== idx));
  }
  function moveField(idx: number, dir: -1 | 1) {
    setFbFields(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  async function saveForm() {
    if (!fbName.trim()) { toast.error("Form name is required"); return; }
    setSavingForm(true);
    const payload = { name: fbName, type: fbType, description: fbDesc || null, fields: fbFields };
    const res = editingForm
      ? await fetch(`/api/forms/${editingForm.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) { toast.success(editingForm ? "Form updated" : "Form created"); setShowFormBuilder(false); fetchData(); }
    else { const j = await res.json(); toast.error(j.error ?? "Error"); }
    setSavingForm(false);
  }
  async function deleteForm(id: string) {
    if (!confirm("Archive this form?")) return;
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) { fetchData(); toast.success("Form archived"); }
  }
  function copyFormLink(id: string) {
    const url = `${window.location.origin}/f/${id}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
  }

  // ── Add default application fields ──
  function addDefaultAppFields() {
    setFbFields([
      { id: uid(), type: "text",     label: "Full Name",                        required: true,  maps_to: "name" },
      { id: uid(), type: "email",    label: "Email Address",                    required: true,  maps_to: "email" },
      { id: uid(), type: "phone",    label: "Mobile Number",                    required: true,  maps_to: "mobile" },
      { id: uid(), type: "text",     label: "Current Designation",              required: false, maps_to: "current_designation" },
      { id: uid(), type: "text",     label: "Current Location",                 required: false, maps_to: "current_location" },
      { id: uid(), type: "number",   label: "Current CTC (₹/month)",            required: false, maps_to: "present_salary" },
      { id: uid(), type: "number",   label: "Expected CTC (₹/month)",           required: false, maps_to: "expected_salary" },
      { id: uid(), type: "number",   label: "Notice Period (days)",             required: false, maps_to: "notice_period_days" },
      { id: uid(), type: "select",   label: "How did you hear about this role?", required: false, maps_to: "source_name",
        options: ["Naukri","LinkedIn","Reference","Indeed","WorkIndia","Job Hai","Careers Page","Social Media","Other"] },
    ]);
  }

  const addBtnLabel = tab === "library" ? "+ Add JD" : tab === "assessments" ? "+ Add Assessment" : "+ New Form";

  return (
    <div className="p-6 max-w-7xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">JDs, Assessments & Forms</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage job descriptions, assessments, and form templates</p>
        </div>
        <button
          onClick={() => tab === "library" ? setShowJdModal(true) : tab === "assessments" ? setShowAssModal(true) : openNewForm()}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">
          {addBtnLabel}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200">
        {([["library","JD Library"],["assessments","Assessments"],["forms","Forms"]] as [JdTab,string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === k ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {l}{k === "forms" && forms.length > 0 && ` (${forms.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : tab === "library" ? (
        // ── JD Library ──
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jds.length === 0 ? <div className="col-span-full text-center py-12 text-gray-400">No JDs in library yet</div>
          : jds.map(jd => (
            <div key={jd.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{jd.title}</p>
                  {jd.designation_name && <p className="text-xs text-gray-400">{jd.designation_name}</p>}
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">v{jd.version}</span>
              </div>
              {jd.tags && jd.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {jd.tags.map(tag => <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{tag}</span>)}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">{jd.updated_at.slice(0,10)}</span>
                <div className="flex gap-2">
                  {jd.drive_url && <a href={jd.drive_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-500 border border-brand-200 px-2 py-1 rounded hover:bg-brand-50">View</a>}
                  <button onClick={() => { setEditingJd(jd); setJdForm({ title: jd.title, drive_url: jd.drive_url, tags: jd.tags }); setShowJdEdit(true); }}
                    className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === "assessments" ? (
        // ── Assessments ──
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessments.length === 0 ? <div className="col-span-full text-center py-12 text-gray-400">No assessments yet</div>
          : assessments.map(ass => (
            <div key={ass.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 hover:shadow-sm">
              <p className="font-semibold text-gray-900 text-sm">{ass.title}</p>
              {ass.description && <p className="text-xs text-gray-500">{ass.description}</p>}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {ass.duration_mins && <span>⏱ {ass.duration_mins} min</span>}
              </div>
              {ass.form_url && (
                <a href={ass.form_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-brand-500 hover:underline flex items-center gap-1">
                  <ExternalLink size={11} /> Open Google Form
                </a>
              )}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setEditingAss(ass); setAssForm({ title: ass.title, form_url: ass.form_url, description: ass.description, duration_mins: ass.duration_mins }); setShowAssEdit(true); }}
                  className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-50">
                  Edit
                </button>
                {ass.form_url && (
                  <button onClick={() => shareLink(ass.form_url!)}
                    className="flex items-center gap-1 text-xs border border-blue-200 text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50">
                    <Copy size={11} /> Share Link
                  </button>
                )}
                <button onClick={() => deleteAssessment(ass.id)}
                  className="flex items-center gap-1 text-xs border border-red-100 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-50 ml-auto">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── Forms ──
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400">
                <p>No forms yet.</p>
                <button onClick={openNewForm} className="mt-2 text-brand-500 hover:underline text-sm">Create your first form →</button>
              </div>
            ) : forms.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2.5 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{f.name}</p>
                    {f.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{f.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeColor(f.type)}`}>
                    {typeLabel(f.type)}
                  </span>
                </div>

                <p className="text-xs text-gray-400">{f.fields?.length ?? 0} fields · Created {f.created_at.slice(0,10)}</p>

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                  <button onClick={() => openEditForm(f)}
                    className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => shareLink(`${window.location.origin}/f/${f.id}`)}
                    className="flex items-center gap-1 text-xs border border-blue-200 text-blue-600 px-2.5 py-1 rounded-lg hover:bg-blue-50">
                    <Copy size={11} /> Share
                  </button>
                  <a href={`/f/${f.id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs border border-brand-200 text-brand-600 px-2.5 py-1 rounded-lg hover:bg-brand-50">
                    <ExternalLink size={11} /> Preview
                  </a>
                  <button onClick={() => deleteForm(f.id)}
                    className="flex items-center gap-1 text-xs border border-red-100 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-50 ml-auto">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── JD Add Modal ── */}
      {showJdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowJdModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900">Add JD to Library</h3>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Title *</label>
              <input value={jdForm.title ?? ""} onChange={e => setJdForm(p => ({...p, title: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Google Drive URL</label>
              <input value={jdForm.drive_url ?? ""} onChange={e => setJdForm(p => ({...p, drive_url: e.target.value}))}
                placeholder="https://docs.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Tags (comma-separated)</label>
              <input value={(jdForm.tags ?? []).join(", ")}
                onChange={e => setJdForm(p => ({...p, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean)}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={createJD} className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">Add JD</button>
              <button onClick={() => { setShowJdModal(false); setJdForm({}); }} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── JD Edit Modal ── */}
      {showJdEdit && editingJd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowJdEdit(false); setEditingJd(null); setJdForm({}); }} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900">Edit JD</h3>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Title *</label>
              <input value={jdForm.title ?? ""} onChange={e => setJdForm(p => ({...p, title: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Google Drive URL</label>
              <input value={jdForm.drive_url ?? ""} onChange={e => setJdForm(p => ({...p, drive_url: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Tags</label>
              <input value={(jdForm.tags ?? []).join(", ")}
                onChange={e => setJdForm(p => ({...p, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean)}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={updateJD} className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">Save</button>
              <button onClick={() => { setShowJdEdit(false); setEditingJd(null); setJdForm({}); }} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assessment Edit Modal ── */}
      {showAssEdit && editingAss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAssEdit(false); setEditingAss(null); setAssForm({}); }} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900">Edit Assessment</h3>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Title *</label>
              <input value={assForm.title ?? ""} onChange={e => setAssForm(p => ({...p, title: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Google Form URL</label>
              <input value={assForm.form_url ?? ""} onChange={e => setAssForm(p => ({...p, form_url: e.target.value}))}
                placeholder="https://forms.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Duration (mins)</label>
              <input type="number" value={assForm.duration_mins ?? ""} onChange={e => setAssForm(p => ({...p, duration_mins: parseInt(e.target.value) || undefined}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
              <textarea rows={2} value={assForm.description ?? ""} onChange={e => setAssForm(p => ({...p, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={updateAssessment} className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">Save</button>
              <button onClick={() => { setShowAssEdit(false); setEditingAss(null); setAssForm({}); }} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Link Modal ── */}
      {shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShareUrl(null)} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900">Share with Candidates</h3>
            <p className="text-xs text-gray-500">Copy this link and send it to candidates via WhatsApp, email, or any channel.</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <span className="text-sm font-mono text-gray-700 flex-1 break-all select-all">{shareUrl}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Link copied to clipboard!");
                }}
                className="flex-1 bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 flex items-center justify-center gap-2">
                <Copy size={14} /> Copy Link
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent("Please fill out this form: " + shareUrl)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-green-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-600 flex items-center justify-center gap-2">
                📱 Share on WhatsApp
              </a>
            </div>
            <button onClick={() => setShareUrl(null)} className="w-full border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Close</button>
          </div>
        </div>
      )}

      {/* ── Assessment Modal ── */}
      {showAssModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAssModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10 space-y-3">
            <h3 className="font-bold text-gray-900">Add Assessment</h3>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Title *</label>
              <input value={assForm.title ?? ""} onChange={e => setAssForm(p => ({...p, title: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Google Form URL</label>
              <input value={assForm.form_url ?? ""} onChange={e => setAssForm(p => ({...p, form_url: e.target.value}))}
                placeholder="https://forms.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Duration (mins)</label>
              <input type="number" value={assForm.duration_mins ?? ""} onChange={e => setAssForm(p => ({...p, duration_mins: parseInt(e.target.value) || undefined}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" /></div>
            <div><label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
              <textarea rows={2} value={assForm.description ?? ""} onChange={e => setAssForm(p => ({...p, description: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={createAssessment} className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600">Add</button>
              <button onClick={() => { setShowAssModal(false); setAssForm({}); }} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form Builder Modal ── */}
      {showFormBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFormBuilder(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl z-10 w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Builder header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-900">{editingForm ? "Edit Form" : "New Form"}</h3>
              <button onClick={() => setShowFormBuilder(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 font-medium block mb-1">Form Name *</label>
                  <input value={fbName} onChange={e => setFbName(e.target.value)} placeholder="e.g. Operations Application Form"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Form Type</label>
                  <select value={fbType} onChange={e => setFbType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    {FORM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Description (optional)</label>
                  <input value={fbDesc} onChange={e => setFbDesc(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Fields ({fbFields.length})</p>
                  <div className="flex gap-2">
                    {fbFields.length === 0 && (
                      <button onClick={addDefaultAppFields}
                        className="text-xs border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                        + Load Application Defaults
                      </button>
                    )}
                    <button onClick={addField}
                      className="flex items-center gap-1 text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600">
                      <Plus size={12} /> Add Field
                    </button>
                  </div>
                </div>

                {fbFields.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                    No fields yet. Click "Add Field" or "Load Application Defaults".
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fbFields.map((f, i) => (
                      <FieldRow key={f.id} field={f} index={i} total={fbFields.length}
                        onChange={nf => updateField(i, nf)}
                        onRemove={() => removeField(i)}
                        onMove={dir => moveField(i, dir)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Share link preview */}
              {editingForm && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2">
                  <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                  <p className="text-xs text-gray-500 flex-1 truncate">
                    Share link: <span className="font-mono text-gray-700">/f/{editingForm.id}</span>
                  </p>
                  <button onClick={() => copyFormLink(editingForm.id)}
                    className="flex items-center gap-1 text-xs border border-gray-200 px-2 py-1 rounded text-gray-600 hover:bg-white">
                    <Copy size={11} /> Copy
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
              <button onClick={saveForm} disabled={savingForm}
                className="flex-1 bg-brand-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
                {savingForm ? "Saving…" : editingForm ? "Save Changes" : "Create Form"}
              </button>
              <button onClick={() => setShowFormBuilder(false)}
                className="px-5 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
