"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type FieldType = "text" | "email" | "phone" | "number" | "date" | "textarea" | "select" | "checkbox" | "file";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormDef {
  id: string;
  name: string;
  type: string;
  description?: string;
  fields: FormField[];
}

export default function PublicFormPage() {
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!formId) return;
    fetch(`/api/forms/${formId}`)
      .then(r => r.json())
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return; }
        if (!data.is_active) { setNotFound(true); return; }
        setForm(data);
        // Pre-init checkbox fields to false
        const init: Record<string, string | boolean> = {};
        (data.fields as FormField[]).forEach(f => {
          if (f.type === "checkbox") init[f.id] = false;
        });
        setValues(init);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [formId]);

  function set(id: string, val: string | boolean) {
    setValues(prev => ({ ...prev, [id]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  }

  function validate(): boolean {
    if (!form) return false;
    const errs: Record<string, string> = {};
    form.fields.forEach(f => {
      if (!f.required) return;
      const v = values[f.id];
      if (f.type === "checkbox") {
        if (!v) errs[f.id] = "Required";
      } else {
        if (!v || (v as string).trim() === "") errs[f.id] = "Required";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/form-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: formId,
          responses: values,
          respondent_name: (values[nameFieldId()] as string) || null,
          respondent_email: (values[emailFieldId()] as string) || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setSubmitted(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function nameFieldId() {
    return form?.fields.find(f => f.type === "text" && (f.label.toLowerCase().includes("name") || (f as FormField & { maps_to?: string }).maps_to === "name"))?.id ?? "";
  }
  function emailFieldId() {
    return form?.fields.find(f => f.type === "email" || (f as FormField & { maps_to?: string }).maps_to === "email")?.id ?? "";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-5 mb-4">
          <h1 className="text-xl font-bold text-gray-900">{form.name}</h1>
          {form.description && <p className="text-sm text-gray-500 mt-1">{form.description}</p>}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-5 space-y-5">
            {form.fields.map((field) => (
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

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full py-3 px-4 bg-brand-500 hover:bg-brand-400 text-white font-semibold rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">Powered by HireRabbits ATS</p>
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
  const base = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

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
