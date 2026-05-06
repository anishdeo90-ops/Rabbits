"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { SavedSkillView, SkillCriteria } from "@/lib/types";

const EMPTY_CRITERIA: SkillCriteria = {
  skills: "",
  tools: "",
  min_years_experience: "",
  education: "",
  college: "",
  current_role: "",
  previous_companies: "",
  projects: "",
  industries: "",
  certifications: "",
  languages: "",
  summary_tags: "",
};

const FIELD_CONFIG: {
  label: string;
  key: keyof SkillCriteria;
  type: "text" | "number" | "textarea";
  placeholder?: string;
}[] = [
  { label: "Skills", key: "skills", type: "textarea", placeholder: "Python, React, SQL" },
  { label: "Tools", key: "tools", type: "textarea", placeholder: "AWS, Docker, Power BI" },
  { label: "Min. Experience", key: "min_years_experience", type: "number", placeholder: "3" },
  { label: "Education", key: "education", type: "text", placeholder: "MBA, B.Tech" },
  { label: "College", key: "college", type: "text", placeholder: "IIT, Delhi University" },
  { label: "Current Role", key: "current_role", type: "text", placeholder: "Senior Developer" },
  { label: "Previous Companies", key: "previous_companies", type: "textarea", placeholder: "Infosys, TCS" },
  { label: "Projects", key: "projects", type: "textarea", placeholder: "ERP migration, CRM rollout" },
  { label: "Industries", key: "industries", type: "textarea", placeholder: "Retail, Healthcare" },
  { label: "Certifications", key: "certifications", type: "textarea", placeholder: "PMP, AWS Certified" },
  { label: "Languages", key: "languages", type: "textarea", placeholder: "English, Hindi" },
  { label: "Summary Tags", key: "summary_tags", type: "textarea", placeholder: "Team lead, backend" },
];

interface SkillSearchModalProps {
  open: boolean;
  onClose: () => void;
  criteria: SkillCriteria;
  onChange: (c: SkillCriteria) => void;
  onApply: (c: SkillCriteria) => void;
  savedViews: SavedSkillView[];
  onSaveView: (name: string, criteria: SkillCriteria) => void;
  suggestions?: Partial<Record<keyof SkillCriteria, string[]>>;
}

function hasCriteria(criteria: SkillCriteria) {
  return Object.values(criteria).some(value => value.trim() !== "");
}

function splitCriteriaValue(value: string) {
  return value.split(",").map(term => term.trim()).filter(Boolean);
}

function joinCriteriaValues(values: string[]) {
  return values.map(value => value.trim()).filter(Boolean).join(", ");
}

export default function SkillSearchModal({
  open,
  onClose,
  criteria,
  onChange,
  onApply,
  savedViews,
  onSaveView,
  suggestions = {},
}: SkillSearchModalProps) {
  const [draft, setDraft] = useState<SkillCriteria>(criteria);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [viewName, setViewName] = useState("");
  const [fieldQueries, setFieldQueries] = useState<Partial<Record<keyof SkillCriteria, string>>>({});
  const [activeField, setActiveField] = useState<keyof SkillCriteria | null>(null);
  const [fieldError, setFieldError] = useState<{ key: keyof SkillCriteria; message: string } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setDraft(criteria);
    setShowSavePrompt(false);
    setViewName("");
    setFieldQueries({});
    setActiveField(null);
    setFieldError(null);
    const timer = window.setTimeout(() => firstInputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [criteria, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function updateField(key: keyof SkillCriteria, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange(next);
    setFieldError(null);
  }

  function updateQuery(key: keyof SkillCriteria, value: string) {
    setFieldQueries(prev => ({ ...prev, [key]: value }));
    if (fieldError?.key === key) setFieldError(null);
  }

  function removeSelectedValue(key: keyof SkillCriteria, value: string) {
    updateField(key, joinCriteriaValues(splitCriteriaValue(draft[key]).filter(item => item !== value)));
  }

  function selectSuggestion(key: keyof SkillCriteria, value: string) {
    const selected = splitCriteriaValue(draft[key]);
    if (!selected.some(item => item.toLowerCase() === value.toLowerCase())) {
      updateField(key, joinCriteriaValues([...selected, value]));
    }
    setFieldQueries(prev => ({ ...prev, [key]: "" }));
    setFieldError(null);
  }

  function getSuggestionOptions(key: keyof SkillCriteria) {
    const selected = new Set(splitCriteriaValue(draft[key]).map(value => value.toLowerCase()));
    const query = (fieldQueries[key] ?? "").trim().toLowerCase();
    return (suggestions[key] ?? [])
      .filter(option => {
        const normalized = option.trim().toLowerCase();
        if (!normalized || selected.has(normalized)) return false;
        if (!query) return true;
        return normalized.includes(query);
      })
      .slice(0, 8);
  }

  function handleSuggestionKeyDown(event: React.KeyboardEvent<HTMLInputElement>, key: keyof SkillCriteria) {
    const query = (fieldQueries[key] ?? "").trim();
    if (event.key === "Backspace" && !query) {
      const selected = splitCriteriaValue(draft[key]);
      if (selected.length > 0) {
        event.preventDefault();
        updateField(key, joinCriteriaValues(selected.slice(0, -1)));
      }
      return;
    }

    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const options = getSuggestionOptions(key);
    if (options.length > 0) {
      selectSuggestion(key, options[0]);
      return;
    }
    if (query) {
      setFieldError({ key, message: "Select a suggestion before applying the search." });
    }
  }

  function firstPendingQueryKey() {
    return FIELD_CONFIG
      .map(field => field.key)
      .find(key => key !== "min_years_experience" && (fieldQueries[key] ?? "").trim() !== "");
  }

  function requireSelectedSuggestions() {
    const pendingKey = firstPendingQueryKey();
    if (!pendingKey) return true;
    setActiveField(pendingKey);
    setFieldError({ key: pendingKey, message: "Choose one of the suggestions or clear the typed text." });
    return false;
  }

  function clearFields() {
    setDraft(EMPTY_CRITERIA);
    onChange(EMPTY_CRITERIA);
    setShowSavePrompt(false);
    setViewName("");
    setFieldQueries({});
    setFieldError(null);
  }

  function confirmSave() {
    if (!requireSelectedSuggestions()) return;
    const name = viewName.trim().slice(0, 40);
    if (!name || !hasCriteria(draft)) return;
    onSaveView(name, draft);
    setShowSavePrompt(false);
    setViewName("");
  }

  const duplicateName = savedViews.some(view => view.name.trim().toLowerCase() === viewName.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="absolute inset-0"
        onMouseDown={onClose}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-search-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="skill-search-title" className="text-base font-bold text-gray-900">
              Advanced Skill Search
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Match criteria against candidate Skills tabs across the database
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close advanced skill search"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELD_CONFIG.map((field, index) => (
              <div key={field.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">{field.label}</span>
                {field.type === "number" ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draft[field.key]}
                    onChange={event => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-500"
                  />
                ) : (
                  <div className="relative">
                    <div className="min-h-[58px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:border-transparent focus-within:ring-2 focus-within:ring-brand-500">
                      <div className="flex flex-wrap items-center gap-1">
                        {splitCriteriaValue(draft[field.key]).map(value => (
                          <span
                            key={value}
                            className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
                          >
                            <span className="truncate">{value}</span>
                            <button
                              type="button"
                              onClick={() => removeSelectedValue(field.key, value)}
                              className="text-brand-400 hover:text-brand-700"
                              aria-label={`Remove ${value}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          ref={index === 0 ? firstInputRef : undefined}
                          value={fieldQueries[field.key] ?? ""}
                          onChange={event => updateQuery(field.key, event.target.value)}
                          onFocus={() => setActiveField(field.key)}
                          onBlur={() => window.setTimeout(() => setActiveField(current => current === field.key ? null : current), 120)}
                          onKeyDown={event => handleSuggestionKeyDown(event, field.key)}
                          placeholder={splitCriteriaValue(draft[field.key]).length ? "Add another..." : field.placeholder}
                          className="min-w-[150px] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    {activeField === field.key && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                        {getSuggestionOptions(field.key).length > 0 ? (
                          getSuggestionOptions(field.key).map(option => (
                            <button
                              key={option}
                              type="button"
                              onMouseDown={event => {
                                event.preventDefault();
                                selectSuggestion(field.key, option);
                              }}
                              className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-700"
                            >
                              {option}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-gray-400">
                            {(fieldQueries[field.key] ?? "").trim()
                              ? "No matching suggestion. Check spelling or try another term."
                              : "No suggestions found from parsed CV data yet."}
                          </div>
                        )}
                      </div>
                    )}
                    {fieldError?.key === field.key && (
                      <p className="mt-1 text-xs text-red-500">{fieldError.message}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearFields}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSavePrompt(true)}
                className="rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
              >
                Save View
              </button>
              {showSavePrompt && (
                <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center gap-2">
                    <input
                      value={viewName}
                      onChange={event => setViewName(event.target.value.slice(0, 40))}
                      onKeyDown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          confirmSave();
                        }
                      }}
                      placeholder="e.g. Senior Python Developer"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-500"
                      aria-label="View name"
                    />
                    <button
                      type="button"
                      onClick={confirmSave}
                      disabled={!viewName.trim() || !hasCriteria(draft)}
                      className="rounded-lg bg-brand-500 p-2 text-white hover:bg-brand-600 disabled:opacity-40"
                      aria-label="Confirm saved view"
                      title={duplicateName ? "Save duplicate name" : "Save view"}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowSavePrompt(false); setViewName(""); }}
                      className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                      aria-label="Cancel saved view"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (requireSelectedSuggestions()) onApply(draft);
              }}
              className="ml-auto rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Apply Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
