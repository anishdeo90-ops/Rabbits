"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

type FieldType = "text" | "email" | "phone" | "number" | "date" | "textarea" | "select" | "checkbox" | "file" | "section";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maps_to?: string | null;
}

interface FormDef {
  id: string;
  name: string;
  type: string;
  description?: string;
  fields: FormField[];
  is_active?: boolean;
}

type Segment = { title: string; fields: FormField[] };

// Group fields into segments using "section" markers as dividers. Anything
// before the first marker becomes a "General" segment.
function buildSegments(fields: FormField[]): Segment[] {
  const out: Segment[] = [];
  let current: Segment = { title: "General", fields: [] };
  let sawSection = false;
  for (const f of fields) {
    if (f.type === "section") {
      if (sawSection || current.fields.length) out.push(current);
      current = { title: f.label || "Section", fields: [] };
      sawSection = true;
    } else {
      current.fields.push(f);
    }
  }
  if (current.fields.length || (sawSection && out.length === 0)) out.push(current);
  // If no sections at all, return single unnamed segment
  if (!sawSection && out.length === 0 && fields.length === 0) return [];
  return out.length ? out : [{ title: "", fields }];
}

export default function PublicFormPage() {
  const params = useParams();
  const search = useSearchParams();
  const formId = params.id as string;
  const candidateId = search.get("c") || null;
  const jobId       = search.get("j") || null;

  const [form, setForm] = useState<FormDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState(0);

  const tabStripRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!formId) return;
    fetch(`/api/forms/${formId}`)
      .then(r => r.json())
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return; }
        if (!data.is_active) { setNotFound(true); return; }
        setForm(data);
        const init: Record<string, string | boolean> = {};
        (data.fields as FormField[]).forEach(f => {
          if (f.type === "checkbox") init[f.id] = false;
        });
        setValues(init);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [formId]);

  const segments = useMemo(
    () => (form ? buildSegments(form.fields) : []),
    [form]
  );

  function set(id: string, val: string | boolean) {
    setValues(prev => ({ ...prev, [id]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  }

  function validateFields(fields: FormField[]): Record<string, string> {
    const errs: Record<string, string> = {};
    fields.forEach(f => {
      if (f.type === "section" || !f.required) return;
      const v = values[f.id];
      if (f.type === "checkbox") {
        if (!v) errs[f.id] = "Required";
      } else {
        if (!v || (v as string).trim() === "") errs[f.id] = "Required";
      }
    });
    return errs;
  }

  function goToTab(idx: number) {
    setActiveTab(idx);
    // Scroll page top for cleaner UX
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    // Bring tab into view in the strip
    setTimeout(() => {
      const strip = tabStripRef.current;
      const btn = strip?.querySelector<HTMLButtonElement>(`[data-tab-idx="${idx}"]`);
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 0);
  }

  function handleNext() {
    const seg = segments[activeTab];
    if (!seg) return;
    const segErrs = validateFields(seg.fields);
    if (Object.keys(segErrs).length > 0) {
      setErrors(prev => ({ ...prev, ...segErrs }));
      return;
    }
    goToTab(activeTab + 1);
  }

  function handlePrev() {
    goToTab(activeTab - 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || submitLock.current) return;
    // Validate ALL fields on final submit, jump to first failing tab
    let firstBadTab = -1;
    const allErrs: Record<string, string> = {};
    segments.forEach((seg, i) => {
      const segErrs = validateFields(seg.fields);
      Object.assign(allErrs, segErrs);
      if (firstBadTab === -1 && Object.keys(segErrs).length > 0) firstBadTab = i;
    });
    if (Object.keys(allErrs).length > 0) {
      setErrors(allErrs);
      if (firstBadTab !== -1) goToTab(firstBadTab);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/form-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: formId,
          candidate_id: candidateId,
          job_id: jobId,
          responses: values,
          respondent_name: pickRespondent("name"),
          respondent_email: pickRespondent("email"),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setSavedOk(true);
      setSubmitting(false);
      setTimeout(() => setSubmitted(true), 1200);
    } catch (err) {
      submitLock.current = false;
      setSubmitting(false);
      alert((err as Error).message);
    }
  }

  function pickRespondent(kind: "name" | "email"): string | null {
    if (!form) return null;
    // Prefer explicit maps_to
    for (const f of form.fields) {
      if (f.type === "section") continue;
      if (f.maps_to === kind) {
        const v = values[f.id];
        if (typeof v === "string" && v.trim()) return v;
      }
    }
    // Fallback: first field of email-type for email, first text/textarea with "name" in label for name
    if (kind === "email") {
      const f = form.fields.find(x => x.type === "email");
      if (f) {
        const v = values[f.id];
        if (typeof v === "string" && v.trim()) return v;
      }
    } else {
      const f = form.fields.find(x => x.type !== "section" && x.label.toLowerCase().includes("name"));
      if (f) {
        const v = values[f.id];
        if (typeof v === "string" && v.trim()) return v;
      }
    }
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-700">Form not found</h2>
          <p className="text-sm text-gray-500 mt-1">This form may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Thank you!</h2>
          <p className="text-gray-500 mt-2">Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  const seg = segments[activeTab];
  const isLast = activeTab === segments.length - 1;
  const isFirst = activeTab === 0;
  const hasTabs = segments.length > 1;

  // Count error fields per segment for the indicator dot
  function segErrCount(s: Segment): number {
    return s.fields.reduce((acc, f) => acc + (errors[f.id] ? 1 : 0), 0);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-5 mb-3">
          <h1 className="text-xl font-bold text-gray-900">{form.name}</h1>
          {form.description && <p className="text-sm text-gray-500 mt-1">{form.description}</p>}
          {hasTabs && (
            <p className="text-xs text-gray-400 mt-2">
              Step {activeTab + 1} of {segments.length}: <span className="text-gray-600 font-medium">{seg?.title || "Section"}</span>
            </p>
          )}
        </div>

        {/* Tab strip */}
        {hasTabs && (
          <div
            ref={tabStripRef}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-3 px-2 py-1.5 flex gap-1 overflow-x-auto"
          >
            {segments.map((s, i) => {
              const errN = segErrCount(s);
              const active = i === activeTab;
              return (
                <button
                  key={i}
                  data-tab-idx={i}
                  type="button"
                  onClick={() => goToTab(i)}
                  className={
                    "flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition " +
                    (active
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100")
                  }
                >
                  <span className="mr-1 opacity-70">{i + 1}.</span>
                  {s.title || `Section ${i + 1}`}
                  {errN > 0 && !active && (
                    <span className="ml-1.5 inline-block min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 font-semibold">
                      {errN}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-5 space-y-5">
            {seg?.fields.length === 0 && (
              <p className="text-sm text-gray-400 italic">No fields in this section.</p>
            )}
            {seg?.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={values[field.id] ?? ""}
                  onChange={val => set(field.id, val)}
                />
                {errors[field.id] && (
                  <p className="text-xs text-red-500 mt-1">{errors[field.id]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Nav row */}
          <div className="mt-4 flex gap-2">
            {hasTabs && !isFirst && (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {hasTabs && !isLast && (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-1"
              >
                Next: {segments[activeTab + 1]?.title || "Continue"} <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {isLast && (
              <button
                type="submit"
                disabled={submitting || savedOk}
                className={`flex-1 py-3 px-4 font-semibold rounded-xl transition flex items-center justify-center gap-2 ${
                  savedOk
                    ? "bg-green-600 text-white cursor-default"
                    : "bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                }`}
              >
                {savedOk ? (
                  <><CheckCircle className="w-4 h-4" /> Saved</>
                ) : submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                ) : (
                  "Submit"
                )}
              </button>
            )}
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">Powered by HireRabbits</p>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const base = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className={`${base} resize-none`}
          rows={3}
          placeholder={field.placeholder ?? ""}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "select":
      return (
        <select
          className={base}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={value as boolean}
            onChange={e => onChange(e.target.checked)}
          />
          <span className="text-sm text-gray-600">Yes</span>
        </label>
      );
    case "date":
      return (
        <input
          type="date"
          className={base}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={base}
          placeholder={field.placeholder ?? ""}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "email":
      return (
        <input
          type="email"
          className={base}
          placeholder={field.placeholder ?? "Enter email"}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "phone":
      return (
        <input
          type="tel"
          className={base}
          placeholder={field.placeholder ?? "Enter phone number"}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          type="text"
          className={base}
          placeholder={field.placeholder ?? ""}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      );
  }
}
