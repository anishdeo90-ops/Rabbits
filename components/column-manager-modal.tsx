"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, GripVertical, Check } from "lucide-react";
import toast from "react-hot-toast";
import type { CustomColumn } from "@/lib/types";
import { slugify } from "@/lib/utils";

interface Props { onClose: () => void; }

const COL_TYPES = [
  { value: "text",     label: "Text" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "dropdown", label: "Dropdown (from Masters)" },
  { value: "boolean",  label: "Yes / No" },
  { value: "url",      label: "URL / Link" },
];

const MASTER_TYPES = ["site","designation","source","department","location","status"];

export default function ColumnManagerModal({ onClose }: Props) {
  const [cols, setCols]         = useState<CustomColumn[]>([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType]   = useState("text");
  const [newDropdown, setNewDropdown] = useState("");
  const [saving, setSaving]     = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/custom-columns");
    if (res.ok) { const j = await res.json(); setCols(j.data ?? []); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newLabel.trim()) { toast.error("Column name required"); return; }
    setSaving(true);
    const res = await fetch("/api/custom-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label:         newLabel.trim(),
        field_key:     slugify(newLabel.trim()),
        col_type:      newType,
        dropdown_type: newType === "dropdown" ? newDropdown : null,
        sort_order:    cols.length + 100,
      }),
    });
    if (res.ok) {
      toast.success("Column added — will appear in grid on next load");
      setNewLabel(""); setNewType("text"); setAdding(false);
      load();
    } else {
      const e = await res.json(); toast.error(e.error ?? "Failed");
    }
    setSaving(false);
  }

  async function toggleActive(col: CustomColumn) {
    await fetch("/api/custom-columns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: col.id, is_active: !col.is_active }),
    });
    load();
  }

  async function handleDelete(col: CustomColumn) {
    if (!confirm(`Delete column "${col.label}"? All data in this column will be lost.`)) return;
    await fetch(`/api/custom-columns?id=${col.id}`, { method: "DELETE" });
    toast.success("Column deleted");
    load();
  }

  async function handleRename(col: CustomColumn, newName: string) {
    await fetch("/api/custom-columns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: col.id, label: newName }),
    });
    setEditId(null);
    load();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Manage Columns</h2>
            <p className="text-xs text-gray-500 mt-0.5">Add custom columns, rename or hide existing ones</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20}/></button>
        </div>

        {/* Info box */}
        <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
          <strong>How it works:</strong> Custom columns are stored as flexible fields on each candidate.
          Core columns (Name, Mobile, Site, etc.) cannot be deleted but can be renamed.
          New columns appear on the right side of the grid.
        </div>

        {/* Columns list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
          ) : (
            <>
              {/* Core columns notice */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Custom Columns ({cols.length})
              </p>

              {cols.length === 0 && !adding && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No custom columns yet. Add one below.
                </div>
              )}

              <div className="space-y-2">
                {cols.map(col => (
                  <div key={col.id}
                    className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 ${col.is_active ? "bg-white" : "bg-gray-50 opacity-60"}`}>
                    <GripVertical size={14} className="text-gray-300 flex-shrink-0" />

                    {/* Label */}
                    <div className="flex-1">
                      {editId === col.id ? (
                        <form onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.querySelector("input") as HTMLInputElement).value; if (v) handleRename(col, v); }}>
                          <input
                            autoFocus
                            defaultValue={col.label}
                            className="border border-brand-400 rounded px-2 py-1 text-sm w-full"
                            onBlur={e => { if (e.target.value !== col.label) handleRename(col, e.target.value); else setEditId(null); }}
                            onKeyDown={e => e.key === "Escape" && setEditId(null)}
                          />
                        </form>
                      ) : (
                        <button onClick={() => setEditId(col.id)} className="text-sm font-medium text-gray-800 hover:text-brand-600 text-left">
                          {col.label}
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {COL_TYPES.find(t => t.value === col.col_type)?.label}
                        {col.dropdown_type && ` · from ${col.dropdown_type} master`}
                        {" · "}<code className="bg-gray-100 px-1 rounded text-[10px]">{col.field_key}</code>
                      </p>
                    </div>

                    {/* Active toggle */}
                    <button onClick={() => toggleActive(col)}
                      className={`text-xs px-2 py-1 rounded font-medium ${col.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {col.is_active ? "Visible" : "Hidden"}
                    </button>

                    {/* Delete */}
                    <button onClick={() => handleDelete(col)} className="p-1 text-red-300 hover:text-red-600">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new column */}
              {adding ? (
                <div className="mt-4 border-2 border-brand-400 rounded-xl p-4 bg-brand-50">
                  <p className="text-xs font-bold text-gray-700 mb-3">New Column</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Column Name *</label>
                      <input
                        autoFocus
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        placeholder="e.g. Notice Period, Reference Name…"
                        onKeyDown={e => e.key === "Enter" && handleAdd()}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {newLabel && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Field key: <code>{slugify(newLabel)}</code>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Column Type</label>
                      <select
                        value={newType}
                        onChange={e => setNewType(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {COL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {newType === "dropdown" && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Dropdown Source (Master Type)</label>
                        <select
                          value={newDropdown}
                          onChange={e => setNewDropdown(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">Select master type…</option>
                          {MASTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleAdd} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-60">
                      <Check size={14}/>{saving ? "Saving…" : "Add Column"}
                    </button>
                    <button onClick={() => { setAdding(false); setNewLabel(""); setNewType("text"); }}
                      className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)}
                  className="mt-4 flex items-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 justify-center">
                  <Plus size={16}/> Add Custom Column
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
