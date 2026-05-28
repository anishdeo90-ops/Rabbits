"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight, Check, X, Trash2, Link as LinkIcon } from "lucide-react";
import toast from "react-hot-toast";
import type { Master } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ScreeningQuestion {
  id: string; designation_id?: string; question: string;
  question_type: string; is_mandatory: boolean; sort_order: number; is_active: boolean;
}

interface RecruitmentForm {
  id: string; name: string; form_type: string; url?: string;
  designation_id?: string; site_id?: string;
  description?: string; send_to_candidate: boolean; is_active: boolean;
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const MASTER_TYPES = [
  { key: "site",        label: "🏢 Sites" },
  { key: "designation", label: "💼 Designations" },
  { key: "source",      label: "📡 Sources" },
  { key: "department",  label: "🏬 Departments" },
  { key: "location",    label: "📍 Locations" },
  { key: "status",      label: "🏷️ Statuses" },
];

const SPECIAL_TABS = [
  { key: "screening",  label: "❓ Screening Questions" },
  { key: "forms",      label: "📝 Forms & Assessments" },
];

const Q_TYPES = ["text","yesno","number","rating","dropdown"];
const FORM_TYPES = [
  { value: "google_form", label: "Google Form" },
  { value: "assessment",  label: "Assessment" },
  { value: "document",    label: "Document" },
  { value: "custom",      label: "Custom Link" },
];

// ─────────────────────────────────────────────────────────────
// Master table (generic reusable component)
// ─────────────────────────────────────────────────────────────
function MasterTable({ type, showColor }: { type: string; showColor: boolean }) {
  const [items, setItems] = useState<Master[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState({ name: "", code: "", color: "#6b7280" });
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/masters?type=${type}`);
    const j = await r.json(); setItems(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [type]);

  async function add() {
    if (!newName.trim()) { toast.error("Name required"); return; }
    const r = await fetch("/api/masters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name: newName.trim(), code: newCode.trim() || null, color: showColor ? newColor : null }),
    });
    if (r.ok) { toast.success("Added"); setNewName(""); setNewCode(""); setAdding(false); load(); }
    else { const e = await r.json(); toast.error(e.error ?? "Failed"); }
  }

  async function save(item: Master) {
    await fetch("/api/masters", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, name: editState.name, code: editState.code || null, color: editState.color }),
    });
    setEditId(null); load();
  }

  async function toggle(item: Master) {
    await fetch("/api/masters", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    }); load();
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">{items.length} items</span>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            <Plus size={12}/> Add
          </button>
        </div>

        {adding && (
          <div className="flex items-center gap-2 px-5 py-3 bg-brand-50 border-b flex-wrap">
            <input autoFocus placeholder="Name *" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()}
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm min-w-0" />
            <input placeholder="Code" value={newCode} onChange={e => setNewCode(e.target.value)}
              className="w-28 border border-gray-300 rounded px-3 py-1.5 text-sm" />
            {showColor && (
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                className="w-9 h-8 cursor-pointer rounded border border-gray-300" />
            )}
            <button onClick={add} className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700"><Check size={14}/></button>
            <button onClick={() => { setAdding(false); setNewName(""); }} className="p-1.5 bg-gray-200 text-gray-600 rounded"><X size={14}/></button>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No items yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-2.5 text-left">#</th>
                <th className="px-5 py-2.5 text-left">Name</th>
                <th className="px-5 py-2.5 text-left">Code</th>
                {showColor && <th className="px-5 py-2.5 text-left">Color</th>}
                <th className="px-5 py-2.5 text-left">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={`border-t ${i % 2 ? "bg-gray-50" : ""}`}>
                  <td className="px-5 py-2.5 text-gray-400">{i + 1}</td>
                  <td className="px-5 py-2.5">
                    {editId === item.id
                      ? <input autoFocus value={editState.name} onChange={e => setEditState({ ...editState, name: e.target.value })} className="border border-brand-400 rounded px-2 py-1 text-sm w-full" />
                      : <span className={item.is_active ? "text-gray-900 font-medium" : "text-gray-400 line-through"}>{item.name}</span>
                    }
                  </td>
                  <td className="px-5 py-2.5 text-gray-500">
                    {editId === item.id
                      ? <input value={editState.code} onChange={e => setEditState({ ...editState, code: e.target.value })} className="border border-brand-400 rounded px-2 py-1 text-sm w-24" />
                      : (item.code ?? "—")
                    }
                  </td>
                  {showColor && (
                    <td className="px-5 py-2.5">
                      {editId === item.id
                        ? <input type="color" value={editState.color} onChange={e => setEditState({ ...editState, color: e.target.value })} className="w-8 h-6 cursor-pointer rounded" />
                        : <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full border border-gray-200" style={{ background: item.color ?? "#6b7280" }} /><span className="text-xs text-gray-400">{item.color}</span></span>
                      }
                    </td>
                  )}
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {editId === item.id ? (
                        <>
                          <button onClick={() => save(item)} className="p-1 text-green-600 hover:text-green-800"><Check size={15}/></button>
                          <button onClick={() => setEditId(null)} className="p-1 text-gray-400"><X size={15}/></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(item.id); setEditState({ name: item.name, code: item.code ?? "", color: item.color ?? "#6b7280" }); }} className="p-1 text-gray-400 hover:text-brand-600"><Pencil size={14}/></button>
                          <button onClick={() => toggle(item)} className="p-1 text-gray-400 hover:text-gray-700">
                            {item.is_active ? <ToggleRight size={16} className="text-green-500"/> : <ToggleLeft size={16}/>}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screening questions tab
// ─────────────────────────────────────────────────────────────
function ScreeningQuestionsTab({ designations }: { designations: Master[] }) {
  const [items, setItems]   = useState<ScreeningQuestion[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState({ question: "", question_type: "text", designation_id: "", is_mandatory: false });

  async function load() {
    const r = await fetch("/api/screening-questions");
    if (r.ok) { const j = await r.json(); setItems(j.data ?? []); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.question.trim()) { toast.error("Question required"); return; }
    const r = await fetch("/api/screening-questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, designation_id: form.designation_id || null }),
    });
    if (r.ok) { toast.success("Added"); setAdding(false); setForm({ question: "", question_type: "text", designation_id: "", is_mandatory: false }); load(); }
  }

  async function toggle(item: ScreeningQuestion) {
    await fetch("/api/screening-questions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    }); load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define questions to ask candidates during screening (per job role or generic)</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus size={12}/> Add Question
        </button>
      </div>

      {adding && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Question *</label>
            <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })}
              placeholder="e.g. Years of experience in logistics?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Type</label>
              <select value={form.question_type} onChange={e => setForm({ ...form, question_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {Q_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">For Designation (optional)</label>
              <select value={form.designation_id} onChange={e => setForm({ ...form, designation_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Designations</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded" />
                <span className="text-sm text-gray-700">Mandatory</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">Save Question</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-2.5 text-left">Question</th>
              <th className="px-5 py-2.5 text-left">Type</th>
              <th className="px-5 py-2.5 text-left">For Role</th>
              <th className="px-5 py-2.5 text-left">Mandatory</th>
              <th className="px-5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No questions yet.</td></tr>
            ) : items.map((q, i) => (
              <tr key={q.id} className={`border-t ${i % 2 ? "bg-gray-50" : ""}`}>
                <td className="px-5 py-3 max-w-sm">
                  <p className={`font-medium ${q.is_active ? "text-gray-900" : "text-gray-400 line-through"}`}>{q.question}</p>
                </td>
                <td className="px-5 py-3"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{q.question_type}</span></td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {q.designation_id ? (designations.find(d => d.id === q.designation_id)?.name ?? "—") : <span className="text-gray-400">All roles</span>}
                </td>
                <td className="px-5 py-3">{q.is_mandatory ? <span className="text-brand-600 font-medium text-xs">✓ Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => toggle(q)} className="p-1 text-gray-400 hover:text-gray-700">
                      {q.is_active ? <ToggleRight size={16} className="text-green-500"/> : <ToggleLeft size={16}/>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Forms & Assessments tab
// ─────────────────────────────────────────────────────────────
function FormsTab({ designations, sites }: { designations: Master[]; sites: Master[] }) {
  const [items, setItems]   = useState<RecruitmentForm[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState({ name: "", form_type: "google_form", url: "", designation_id: "", site_id: "", description: "", send_to_candidate: false });

  async function load() {
    const r = await fetch("/api/recruitment-forms");
    if (r.ok) { const j = await r.json(); setItems(j.data ?? []); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    const r = await fetch("/api/recruitment-forms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        designation_id: form.designation_id || null,
        site_id: form.site_id || null,
      }),
    });
    if (r.ok) { toast.success("Form added"); setAdding(false); load(); }
  }

  async function toggle(item: RecruitmentForm) {
    await fetch("/api/recruitment-forms", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    }); load();
  }

  const typeLabel = (t: string) => FORM_TYPES.find(f => f.value === t)?.label ?? t;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Manage Google Forms, assessments and document links. Send directly to candidates in Phase 2.</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus size={12}/> Add Form
        </button>
      </div>

      {adding && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Form Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. General Application Form" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Type</label>
              <select value={form.form_type} onChange={e => setForm({ ...form, form_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {FORM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">URL / Link</label>
              <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="https://forms.google.com/…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">For Designation (optional)</label>
              <select value={form.designation_id} onChange={e => setForm({ ...form, designation_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Designations</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">For Site (optional)</label>
              <select value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Sites</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of what this form collects" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="send_cand" checked={form.send_to_candidate}
                onChange={e => setForm({ ...form, send_to_candidate: e.target.checked })} className="rounded" />
              <label htmlFor="send_cand" className="text-sm text-gray-700 cursor-pointer">Auto-send to candidate (Phase 2)</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">Save Form</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {items.length === 0 && <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No forms yet.</div>}
        {items.map(item => (
          <div key={item.id} className={`bg-white rounded-xl border p-4 flex items-start gap-4 ${item.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-xl flex-shrink-0">
              {item.form_type === "google_form" ? "📋" : item.form_type === "assessment" ? "📝" : "📄"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">{typeLabel(item.form_type)}</span>
                {item.send_to_candidate && <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded">Send to candidate</span>}
              </div>
              {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                {item.designation_id && <span>Role: {designations.find(d => d.id === item.designation_id)?.name}</span>}
                {item.site_id && <span>Site: {sites.find(s => s.id === item.site_id)?.name}</span>}
                {!item.designation_id && !item.site_id && <span>Applies to: All roles & sites</span>}
              </div>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:underline">
                  <LinkIcon size={10}/> {item.url.length > 60 ? item.url.slice(0, 60) + "…" : item.url}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(item)} className="p-1.5 text-gray-400 hover:text-gray-700">
                {item.is_active ? <ToggleRight size={18} className="text-green-500"/> : <ToggleLeft size={18}/>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function MastersPage() {
  const [activeTab, setActiveTab] = useState("site");
  const [designations, setDesignations] = useState<Master[]>([]);
  const [sites, setSites]               = useState<Master[]>([]);

  useEffect(() => {
    fetch("/api/masters?type=designation").then(r => r.json()).then(j => setDesignations(j.data ?? []));
    fetch("/api/masters?type=site").then(r => r.json()).then(j => setSites(j.data ?? []));
  }, []);

  const allTabs = [...MASTER_TYPES, ...SPECIAL_TABS];
  const activeLabel = allTabs.find(t => t.key === activeTab)?.label ?? "";

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Masters</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage all dropdown lists, screening questions and form links</p>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 pt-3 pb-1">Dropdown Masters</p>
            {MASTER_TYPES.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === t.key ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                {t.label}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 pt-2.5 pb-1">Recruitment Tools</p>
            {SPECIAL_TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === t.key ? "bg-brand-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">{activeLabel}</h2>
          </div>

          {MASTER_TYPES.map(t => activeTab === t.key && (
            <MasterTable key={t.key} type={t.key} showColor={t.key === "status"} />
          ))}
          {activeTab === "screening" && <ScreeningQuestionsTab designations={designations} />}
          {activeTab === "forms"     && <FormsTab designations={designations} sites={sites} />}
        </div>
      </div>
    </div>
  );
}
