"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Candidate, Master, Profile } from "@/lib/types";
import DetailPanel from "@/components/candidate-detail-panel";
import AddCandidateModal from "@/components/add-candidate-modal";
import toast from "react-hot-toast";
import { X, Upload, Link as LinkIcon, ExternalLink, Trash2, Plus } from "lucide-react";
import { monthFromApplicationDate } from "@/lib/utils";

// ── Searchable combobox (used for filter dropdowns) ─────────────────────────
function SearchCombobox({ options, value, onChange, placeholder, className = "" }: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!value) setInput(""); }, [value]);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const selected = options.find(o => o.id === value) ?? null;
  const filtered = input.trim() ? options.filter(o => o.name.toLowerCase().includes(input.toLowerCase())) : options;
  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={selected ? selected.name : input}
          onChange={e => { if (selected) onChange(""); setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none${value ? " pr-6" : ""}`}
        />
        {value && (
          <button onClick={() => { onChange(""); setInput(""); setOpen(false); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs leading-none">✕</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-w-xs bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
          {filtered.map(o => (
            <button key={o.id} onClick={() => { onChange(o.id); setInput(""); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-brand-50 whitespace-nowrap block ${o.id === value ? "bg-brand-50 text-brand-600 font-medium" : "text-gray-700"}`}>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type View = "sheet" | "ats" | "kanban";
type OwnerFilter = "all" | "mine" | "live" | "offered" | "joined";
type SortDir = "asc" | "desc";

interface Props {
  profile: Profile;
  sites: Master[];
  designations: Master[];
  sources: Master[];
  statuses: Master[];
  tags: Master[];
  recruiters: Profile[];
  interviewers: Master[];
  initialStatus?: string;
  initialHrId?: string;
  initialDesignationId?: string;
  initialJobId?: string;
  initialOwner?: OwnerFilter;
  initialSiteId?: string;
  initialSourceId?: string;
  initialTagId?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialDateField?: string;
  initialActivityScope?: string;
  initialPipelineStage?: string;
  initialForwardToId?: string;
}

// ── Sheet columns ────────────────────────────────────────────────────────────
interface ManualWorkflow {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  action_config?: {
    drip_interval_minutes?: number;
    delay_hours?: number;
  } | null;
}

interface WorkflowEnrollResult {
  queued: number;
  skipped_no_email: number;
  skipped_duplicate: number;
  skipped_forbidden: number;
}

const SHEET_COLS: {
  key: string; label: string; width: number;
  type?: "text" | "date" | "dropdown" | "number" | "url";
  dropdownKey?: string;
  readOnly?: boolean;
}[] = [
  { key: "hr_name",                    label: "HR NAME",                                       width: 120, readOnly: true },
  { key: "month",                      label: "MONTH",                                         width: 110, type: "dropdown", dropdownKey: "month" },
  { key: "application_date",           label: "App. Date",                                     width: 105, type: "date" },
  { key: "final_status",               label: "FINAL STATUS",                                  width: 195, type: "dropdown", dropdownKey: "status" },
  { key: "name",                       label: "NAME OF APPLICANT",                             width: 180 },
  { key: "current_designation",        label: "CURRENT DESIGNATION",                           width: 170 },
  { key: "designation_name",           label: "DESIGNATION (Recruited For)",                   width: 190, type: "dropdown", dropdownKey: "designation" },
  { key: "site_name",                  label: "CONTRACT REQUIRED FOR",                         width: 175, type: "dropdown", dropdownKey: "site" },
  { key: "mobile",                     label: "MOBILE NO",                                     width: 125 },
  { key: "email",                      label: "EMAIL ID",                                      width: 185 },
  { key: "suitable_other_position",    label: "SUITABLE FOR OTHER POSITION",                   width: 185, type: "dropdown", dropdownKey: "yesNo" },
  { key: "current_location",           label: "CANDIDATE CURRENT LOCATION",                    width: 185 },
  { key: "source_name",                label: "SOURCE",                                        width: 115, type: "dropdown", dropdownKey: "source" },
  { key: "present_salary",             label: "PRESENT SALARY",                                width: 120, type: "number" },
  { key: "expected_salary",            label: "EXPECTED SALARY",                               width: 120, type: "number" },
  { key: "google_form_sent",           label: "GOOGLE FORMS SENT",                             width: 145, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "google_form_received",       label: "GOOGLE FORM RECEIVED",                          width: 155, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "processed_by_hr",            label: "PROCESSED BY HR",                               width: 140, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "shortlist_by_hr",            label: "SHORTLIST BY HR",                               width: 130, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "tel_int_date",               label: "TEL INT DATE",                                  width: 115, type: "date" },
  { key: "tel_int_remarks",            label: "TELEPHONIC INT REMARKS(Recruiter)",              width: 225 },
  { key: "hr_manager_remarks",         label: "HR MANAGER REMARKS",                            width: 175 },
  { key: "mgmt_remarks_before_pi",     label: "MGMT REMARKS BEFORE PI",                        width: 185 },
  { key: "remarks_before_pi",          label: "Tele Int by HOD Name & Comments",               width: 215 },
  { key: "shortlisted_for_pi",         label: "Shortlisted For Personal Interview",             width: 220, type: "dropdown", dropdownKey: "yesNo" },
  { key: "pi1_date",                   label: "PI 1 Date",                                     width: 105, type: "date" },
  { key: "pi1_taken_by",               label: "PI 1 Taken By",                                 width: 170, type: "dropdown", dropdownKey: "interviewer" },
  { key: "pi1_remarks",                label: "PI 1 Remarks",                                  width: 145 },
  { key: "pi2_date",                   label: "PI 2 Date",                                     width: 105, type: "date" },
  { key: "pi2_taken_by",               label: "PI 2 Taken By",                                 width: 170, type: "dropdown", dropdownKey: "interviewer" },
  { key: "pi2_remarks",                label: "PI 2 Remarks",                                  width: 145 },
  { key: "shortlisted_by_mgmt",        label: "Management Final Decision",                     width: 185, type: "dropdown", dropdownKey: "mgmtDecision" },
  { key: "gf_issue_date",              label: "Gaurantee Form ISSUE DATE",                     width: 180, type: "date" },
  { key: "gf_received_date",           label: "Gautantee Form RECEIVED DATE",                  width: 195, type: "date" },
  { key: "gf_verification_report",     label: "GF VERIFICATION REPORT",                        width: 185 },
  { key: "addr_verification_shared",   label: "DATE OF ADDRESS VERIFICATION LETTER SHARED",    width: 270, type: "date" },
  { key: "addr_verification_received", label: "DATE OF ADDRESS VERIFICATION LETTER RECEIVED",  width: 280, type: "date" },
  { key: "remarks",                    label: "Remarks",                                       width: 155 },
  { key: "naukri_profile_url",         label: "LINK",                                          width: 120, type: "url" },
  { key: "final_action",               label: "Final Action",                                  width: 160 },
  { key: "file_no",                    label: "FILE NO",                                       width: 95 },
  { key: "doj_actual",                 label: "DOJ",                                           width: 110, type: "date" },
  { key: "hard_copy",                  label: "HARD COPY Y/N",                                 width: 110, type: "dropdown", dropdownKey: "yesNo" },
  { key: "referred_by",                label: "REFERRED BY",                                   width: 145 },
  { key: "tag_names",                  label: "TAGS",                                          width: 92, readOnly: true },
  { key: "ai_score",                   label: "AI Score",                                      width: 75,  readOnly: true },
];

// Statuses that mean candidate pipeline is closed / dead
const DEAD_STATUSES = new Set([
  "Rejected", "Not Interested", "Joined & Left",
  "Did Not Attend Interview", "Dropped By Candidate",
]);

// Kanban Pipeline view — 7 grouped columns (birds-eye)
const PIPELINE_GROUPS = [
  { name: "New Candidate", color: "#6b7280", defaultStatus: "Sourced",
    statuses: new Set(["Sourced", "Applied", "Not Yet Processed"]) },
  { name: "Screening",     color: "#3b82f6", defaultStatus: "Recruiter Screening Done",
    statuses: new Set(["Recruiter Screening Done", "HR Manager Screening Done", "Dept Mgr Screening Done", "Mgmt Approved for PI Call"]) },
  { name: "Interview",     color: "#8b5cf6", defaultStatus: "Called for PI",
    statuses: new Set(["Called for PI", "PI 1 Done", "PI 2 Done"]) },
  { name: "Shortlisted",   color: "#f59e0b", defaultStatus: "Shortlisted",
    statuses: new Set(["GF Issued", "Shortlisted", "Shortlisted But Not Offered", "Hold", "Offered"]) },
  { name: "Appointed",     color: "#10b981", defaultStatus: "Appointed",
    statuses: new Set(["Appointed", "Joined", "Active Employee"]) },
  { name: "Rejected",      color: "#ef4444", defaultStatus: "Rejected",
    statuses: new Set(["Did Not Attend Interview", "Offered But Did Not Join", "Not Interested", "Rejected", "Joined & Left", "Dropped By Candidate"]) },
  { name: "Other",         color: "#9ca3af", defaultStatus: "Other",
    statuses: new Set(["Suitable for Future", "Other"]) },
] as const;


// ── Month helpers ────────────────────────────────────────────────────────────
function buildMonthOpts() {
  const opts: { id: string; name: string }[] = [];
  const now = new Date();
  for (let y = now.getFullYear() - 2; y <= now.getFullYear(); y++) {
    for (let m = 1; m <= 12; m++) {
      const id    = `${y}-${String(m).padStart(2, "0")}`;
      const label = new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long" }) + ` ${y}`;
      opts.push({ id, name: label });
    }
  }
  return opts.reverse(); // newest first
}
const MONTH_OPTS = buildMonthOpts();
const MONTH_LABEL_TO_ID: Record<string, string> = {};
MONTH_OPTS.forEach(o => { MONTH_LABEL_TO_ID[o.name.toLowerCase()] = o.id; });

function fmtMonth(raw: string): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return MONTH_OPTS.find(o => o.id === raw)?.name ?? raw;
  return raw;
}
function normalizeMonthToId(raw: string): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  // Excel serial stored as string
  const num = Number(raw);
  if (!isNaN(num) && Number.isInteger(num) && num > 40000 && num < 70000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // "MonthName YYYY", "MonthName-YY", or "MonthName YY"
  const MNAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const m = raw.match(/^([a-zA-Z]+)[\s\-](\d{2,4})$/);
  if (m) {
    const mIdx = MNAMES.indexOf(m[1].toLowerCase());
    if (mIdx !== -1) {
      let y = parseInt(m[2], 10);
      if (y < 100) y += 2000;
      return `${y}-${String(mIdx + 1).padStart(2, "0")}`;
    }
  }
  return MONTH_LABEL_TO_ID[raw.toLowerCase()] ?? raw;
}

// ── Status color map ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  "Sourced":                       "bg-gray-100 text-gray-600",
  "Applied":                       "bg-slate-100 text-slate-600",
  "Recruiter Screening Done":      "bg-blue-100 text-blue-700",
  "HR Manager Screening Done":     "bg-cyan-100 text-cyan-700",
  "Dept Mgr Screening Done":       "bg-violet-100 text-violet-700",
  "Mgmt Approved for PI Call":     "bg-indigo-100 text-indigo-700",
  "Called for PI":                 "bg-purple-100 text-purple-700",
  "Did Not Attend Interview":      "bg-red-50 text-red-400",
  "PI 1 Done":                     "bg-indigo-100 text-indigo-700",
  "PI 2 Done":                     "bg-purple-100 text-purple-700",
  "GF Issued":                     "bg-amber-100 text-amber-700",
  "Shortlisted":                   "bg-teal-100 text-teal-700",
  "Shortlisted But Not Offered":   "bg-teal-50 text-teal-600",
  "Hold":                          "bg-yellow-100 text-yellow-700",
  "Suitable for Future":           "bg-blue-50 text-blue-600",
  "Offered But Did Not Join":      "bg-red-50 text-red-600",
  "Offered":                       "bg-brand-100 text-brand-700",
  "Not Interested":                "bg-red-50 text-red-500",
  "Rejected":                      "bg-red-100 text-red-600",
  "Appointed":                     "bg-brand-200 text-brand-800",
  "Joined":                        "bg-green-100 text-green-700",
  "Joined & Left":                 "bg-gray-200 text-gray-500",
  "Active Employee":               "bg-green-200 text-green-800",
  "Not Yet Processed":             "bg-gray-50 text-gray-500",
  "Other":                         "bg-gray-100 text-gray-500",
  "Dropped By Candidate":          "bg-red-100 text-red-500",
};

const TODAY = new Date().toISOString().split("T")[0];
const TODAY_MONTH = monthFromApplicationDate(TODAY) ?? new Date().toISOString().slice(0, 7);

function normOpt(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function optionListWithCurrent(
  opts: { id: string; name: string; color?: string }[],
  current: string,
) {
  const clean = current.trim();
  if (!clean) return opts;
  const exists = opts.some(opt => normOpt(opt.name) === normOpt(clean));
  return exists ? opts : [{ id: clean, name: clean }, ...opts];
}

function optionListWithValues(
  opts: { id: string; name: string; color?: string }[],
  values: string[],
): { id: string; name: string; color?: string }[] {
  const seen = new Set(opts.map(opt => normOpt(opt.name)));
  const extras = values.reduce<{ id: string; name: string }[]>((acc, value) => {
    const clean = value.trim();
    const key = normOpt(clean);
    if (!clean || seen.has(key)) return acc;
    seen.add(key);
    acc.push({ id: clean, name: clean });
    return acc;
  }, []);
  return [...opts, ...extras];
}

type TagChip = { id: string; name: string; color?: string | null };

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function candidateTagChips(cand: Candidate, tags: Master[]): TagChip[] {
  const ids = asStringArray(cand.tag_ids);
  const names = asStringArray(cand.tag_names);
  const colors = asStringArray(cand.tag_colors);
  const tagById = new Map(tags.map(tag => [tag.id, tag]));
  const tagByName = new Map(tags.map(tag => [tag.name.trim().toLowerCase(), tag]));

  if (ids.length > 0) {
    return ids
      .map((id, idx) => {
        const master = tagById.get(id);
        const name = master?.name ?? names[idx] ?? id;
        const namedMaster = tagByName.get(name.trim().toLowerCase());
        return { id, name, color: master?.color ?? namedMaster?.color ?? colors[idx] };
      })
      .filter(tag => tag.name);
  }

  return names.map((name, idx) => {
    const master = tagByName.get(name.trim().toLowerCase());
    return { id: master?.id ?? name, name: master?.name ?? name, color: master?.color ?? colors[idx] };
  });
}

function TagChips({ chips, max = 3, compact = false }: { chips: TagChip[]; max?: number; compact?: boolean }) {
  if (chips.length === 0) return null;
  const visible = chips.slice(0, max);
  const extra = chips.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {visible.map(tag => (
        <span
          key={tag.id}
          className={`inline-flex items-center max-w-full truncate rounded-full border font-medium ${
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
          }`}
          style={tag.color
            ? { borderColor: tag.color, color: "#fff", backgroundColor: tag.color }
            : undefined}
          title={tag.name}
        >
          <span className="truncate">{tag.name}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className={`inline-flex items-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 font-medium ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
        }`}>
          +{extra}
        </span>
      )}
    </div>
  );
}

function withTagSnapshot(candidate: Candidate, nextIds: string[], tags: Master[]): Candidate {
  const selected = nextIds
    .map(id => tags.find(tag => tag.id === id))
    .filter((tag): tag is Master => Boolean(tag));

  return {
    ...candidate,
    tag_ids: nextIds,
    tag_names: selected.map(tag => tag.name),
    tag_colors: selected.map(tag => tag.color ?? ""),
  };
}

function SheetTagCell({
  cand,
  tags,
  editable,
  open,
  onToggle,
  onAdd,
}: {
  cand: Candidate;
  tags: Master[];
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onAdd: (tagId: string) => void;
}) {
  const selectedIds = asStringArray(cand.tag_ids);
  const chips = candidateTagChips(cand, tags);
  const available = tags.filter(tag => !selectedIds.includes(tag.id));

  return (
    <div className="relative flex h-full min-h-[28px] items-center gap-1 px-1.5 py-1">
      <div className="min-w-0 flex-1">
        <TagChips chips={chips} max={1} compact />
      </div>
      {editable && available.length > 0 && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onToggle();
          }}
          className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 transition-colors"
          title="Add tag"
        >
          <Plus size={12} />
        </button>
      )}
      {chips.length === 0 && (!editable || available.length === 0) && (
        <span className="text-xs text-gray-200">-</span>
      )}
      {open && available.length > 0 && (
        <div
          className="absolute right-1 top-7 z-50 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
        >
          {available.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onAdd(tag.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-700"
            >
              <span
                className="h-2 w-2 rounded-full border border-gray-200"
                style={tag.color ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
              />
              <span className="truncate">{tag.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CandidatesClient({
  profile, sites, designations, sources, statuses, tags, recruiters, interviewers,
  initialStatus = "", initialHrId = "", initialDesignationId = "", initialJobId = "", initialOwner = "all",
  initialSiteId = "", initialSourceId = "", initialTagId = "", initialDateFrom = "", initialDateTo = "", initialDateField = "", initialActivityScope = "", initialPipelineStage = "", initialForwardToId = "",
}: Props) {
  const router = useRouter();
  const [view, setView]             = useState<View>("sheet");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [hrFilter, setHrFilter]         = useState(initialHrId);
  const [siteFilter, setSiteFilter]     = useState(initialSiteId);
  const [sourceFilter, setSourceFilter] = useState(initialSourceId);
  const [tagFilter, setTagFilter]       = useState(initialTagId);
  const [dateFromFilter, setDateFromFilter]       = useState(initialDateFrom);
  const [dateToFilter, setDateToFilter]           = useState(initialDateTo);
  const [dateFieldFilter, setDateFieldFilter]     = useState(initialDateField);
  const [activityScopeFilter, setActivityScopeFilter] = useState(initialActivityScope);
  const [pipelineStageFilter, setPipelineStageFilter] = useState(initialPipelineStage);
  const [forwardToFilter, setForwardToFilter]         = useState(initialForwardToId);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [designFilter, setDesignFilter] = useState(initialDesignationId);
  const [jobFilter, setJobFilter] = useState(initialJobId);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>(initialOwner);
  const [kanbanFull, setKanbanFull]     = useState(false);
  const [colConfig, setColConfig]       = useState<{ pipeline: string[]; full: string[] }>({ pipeline: [], full: [] });
  const [editColIdx, setEditColIdx]     = useState<number | null>(null);
  const dragCol = useRef<string | null>(null);

  const [panelId, setPanelId]           = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Auto-open candidate panel from ?open= query param (e.g. from notification click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (openId) {
      setPanelId(openId);
      params.delete("open");
      const newSearch = params.toString();
      router.replace(window.location.pathname + (newSearch ? `?${newSearch}` : ""), { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sheet editing state ──────────────────────────────────────────────────
  const [editing, setEditing]     = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sel, setSel]             = useState<{ ri: number; ci: number } | null>(null);
  const [saving, setSaving]       = useState<Set<string>>(new Set());
  const commitLock    = useRef(false);
  const undoStack     = useRef<{ rowId: string; col: string; oldVal: string }[]>([]);
  const prevEditingRef = useRef<typeof editing>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [colSort, setColSort] = useState<{ key: string; dir: SortDir } | null>({ key: "application_date", dir: "asc" });
  const [openColFilter, setOpenColFilter] = useState<string | null>(null);
  const [openTagMenu, setOpenTagMenu] = useState<string | null>(null);
  const colFilterRef = useRef<HTMLDivElement>(null);

  // ── New row state ────────────────────────────────────────────────────────
  const defaultStatus = statuses[0]?.name ?? "Sourced";
  const [newRow, setNewRow]           = useState<Record<string, string>>({ application_date: TODAY, month: TODAY_MONTH, final_status: defaultStatus });
  const [newRowActive, setNewRowActive] = useState<string | null>(null);
  const newRowRef = useRef<HTMLTableRowElement>(null);
  const [savingNew, setSavingNew]     = useState(false);

  const tableRef    = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const cvFileRef   = useRef<HTMLInputElement>(null);

  // ── CV modal state ───────────────────────────────────────────────────────
  const [cvModal, setCvModal] = useState<{ candidateId: string; currentUrl: string | null; name: string } | null>(null);
  const [cvPasteUrl, setCvPasteUrl] = useState("");
  const [cvUploading, setCvUploading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflows, setWorkflows] = useState<ManualWorkflow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowsError, setWorkflowsError] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [enrollingWorkflow, setEnrollingWorkflow] = useState(false);

  const toOpts = (arr: string[]) => arr.map(s => ({ id: s, name: s, type: "", sort_order: 0, is_active: true, metadata: {}, created_at: "" }));
  const YN_OPTS   = toOpts(["Yes", "No"]);
  const YNNA_OPTS = toOpts(["Yes", "No", "NA"]);
  const MGMT_OPTS = toOpts(["Call on Trial", "Hold", "Unsuitable", "Suitable"]);
  const dropdownOpts: Record<string, { id: string; name: string }[]> = {
    status:             statuses,
    tag:                tags,
    site:               sites,
    designation:        designations,
    source:             sources,
    month:              MONTH_OPTS,
    yesNo:              YN_OPTS,
    yesNoNA:            YNNA_OPTS,
    mgmtDecision:       MGMT_OPTS,
    designationOrOther: [...designations, { id: "Other", name: "Other", type: "", sort_order: 999, is_active: true, metadata: {}, created_at: "" }],
    recruiter:          recruiters.map(r => ({ id: r.name, name: r.name, type: "", sort_order: 0, is_active: true, metadata: {}, created_at: "" })),
    interviewer:        interviewers,
  };

  const PAGE_SIZE = 200;
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = candidates.length < total;

  function buildFetchParams(offset = 0) {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (hrFilter)            p.set("hr_id",           hrFilter);
    else if (ownerFilter === "mine") p.set("hr_id",   profile.id);
    if (siteFilter)          p.set("site_id",          siteFilter);
    if (sourceFilter)        p.set("source_id",        sourceFilter);
    if (tagFilter)           p.set("tag_id",           tagFilter);
    if (statusFilter)        p.set("status",           statusFilter);
    if (designFilter)        p.set("designation_id",   designFilter);
    if (jobFilter)           p.set("job_id",           jobFilter);
    if (search)              p.set("search",           search);
    if (dateFromFilter)      p.set("date_from",        dateFromFilter);
    if (dateToFilter)        p.set("date_to",          dateToFilter);
    if (dateFieldFilter)     p.set("date_field",       dateFieldFilter);
    if (activityScopeFilter) p.set("activity_scope",   activityScopeFilter);
    if (pipelineStageFilter) p.set("pipeline_stage",   pipelineStageFilter);
    if (forwardToFilter)     p.set("forward_to_id",    forwardToFilter);
    return p;
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/candidates?${buildFetchParams(0)}`);
      const json = await res.json();
      setCandidates(json.data ?? []);
      setTotal(json.count ?? 0);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrFilter, ownerFilter, profile.id, siteFilter, sourceFilter, tagFilter, statusFilter, designFilter, jobFilter, search, dateFromFilter, dateToFilter, dateFieldFilter, activityScopeFilter, pipelineStageFilter, forwardToFilter]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res  = await fetch(`/api/candidates?${buildFetchParams(candidates.length)}`);
      const json = await res.json();
      setCandidates(prev => [...prev, ...(json.data ?? [])]);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  useEffect(() => {
    function closeTagMenu() {
      setOpenTagMenu(null);
    }
    document.addEventListener("mousedown", closeTagMenu);
    return () => document.removeEventListener("mousedown", closeTagMenu);
  }, []);

  // Load saved kanban column order / config from localStorage
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("kanban-col-pipeline") ?? "null");
      const f = JSON.parse(localStorage.getItem("kanban-col-full")     ?? "null");
      if (p || f) setColConfig({ pipeline: p ?? [], full: f ?? [] });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      if (editInputRef.current instanceof HTMLInputElement) editInputRef.current.select();
    }
  }, [editing]);

  // Scroll a column index into horizontal view — uses known column widths, no viewport math
  function scrollCiIntoView(ci: number) {
    const container = tableRef.current;
    if (!container) return;
    const ROW_NUM_W = 44;
    let cellLeft = ROW_NUM_W;
    for (let i = 0; i < ci; i++) cellLeft += SHEET_COLS[i].width;
    const cellRight = cellLeft + SHEET_COLS[ci].width;
    const sl = container.scrollLeft;
    const cw = container.clientWidth;
    if (cellRight > sl + cw)  container.scrollLeft = cellRight - cw;
    else if (cellLeft < sl)   container.scrollLeft = cellLeft;
  }

  // Scroll selected cell into view when navigating
  useEffect(() => {
    if (!sel) return;
    const container = tableRef.current;
    if (!container) return;
    // Horizontal: use column-width math (reliable regardless of viewport position)
    scrollCiIntoView(sel.ci);
    // Vertical: use DOM rect (row heights vary)
    const cell = container.querySelector(`td[data-rc="${sel.ri}-${sel.ci}"]`) as HTMLElement | null;
    if (!cell) return;
    const cr = cell.getBoundingClientRect();
    const tr = container.getBoundingClientRect();
    const bottom = tr.top + container.clientHeight;
    if (cr.bottom > bottom)     container.scrollTop += cr.bottom - bottom;
    else if (cr.top < tr.top)   container.scrollTop -= tr.top - cr.top;
  }, [sel]);

  // Auto-focus the table div when switching to sheet view so arrow keys work immediately
  useEffect(() => {
    if (view === "sheet") tableRef.current?.focus();
  }, [view]);

  // Restore table focus AFTER React commits when editing closes (select unmounts after batched render)
  useEffect(() => {
    if (prevEditingRef.current !== null && editing === null) {
      tableRef.current?.focus();
    }
    prevEditingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (openColFilter && colFilterRef.current && !colFilterRef.current.contains(e.target as Node)) {
        setOpenColFilter(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openColFilter]);

  // Global Ctrl+Z undo — works regardless of where focus is after a mouse-click edit
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "z") return;
      if (editing || newRowActive) return;
      e.preventDefault();
      const entry = undoStack.current[0];
      if (entry) {
        undoStack.current = undoStack.current.slice(1);
        commitEdit(entry.rowId, entry.col, entry.oldVal, "none", true);
        toast(`Undo — ${entry.col.replace(/_/g, " ")}`, { icon: "↩" });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing, newRowActive]);

  // Focus the active new-row input and scroll it into view
  useEffect(() => {
    if (!newRowActive) return;
    const el = document.getElementById(`nr-${newRowActive}`) as HTMLInputElement | HTMLSelectElement | null;
    el?.focus({ preventScroll: true });
    const ci = SHEET_COLS.findIndex(c => c.key === newRowActive);
    if (ci >= 0) scrollCiIntoView(ci);
  }, [newRowActive]);

  // Clear new-row blue box whenever the user clicks outside the new-row tr.
  // Capture phase so this fires before any click/mousedown handler on the target.
  useEffect(() => {
    if (!newRowActive) return;
    function onGlobalMouseDown(e: MouseEvent) {
      if (!newRowRef.current?.contains(e.target as Node)) {
        setNewRowActive(null);
      }
    }
    document.addEventListener('mousedown', onGlobalMouseDown, true);
    return () => document.removeEventListener('mousedown', onGlobalMouseDown, true);
  }, [newRowActive]);

  // ── Owner/Live client-side filter ────────────────────────────────────────
  const visibleCandidates = useMemo(() => {
    let result = candidates;
    if (ownerFilter === 'mine')    result = result.filter(c => c.hr_id === profile.id || c.created_by === profile.id);
    if (ownerFilter === 'live')    result = result.filter(c => !DEAD_STATUSES.has(c.final_status ?? ''));
    if (ownerFilter === 'offered') result = result.filter(c => ["Offered","Appointed","Offered But Did Not Join"].includes(c.final_status ?? ''));
    if (ownerFilter === 'joined')  result = result.filter(c => c.final_status === "Joined" || c.final_status === "Active Employee" || Boolean(c.doj_actual));
    Object.entries(colFilters).forEach(([colKey, filterVal]) => {
      if (!filterVal) return;
      const col = SHEET_COLS.find(sc => sc.key === colKey);
      result = result.filter(c => {
        const v = getCellValue(c, colKey, col?.type);
        return (colKey === 'month' ? fmtMonth(v) : v) === filterVal;
      });
    });
    if (colSort) {
      const col = SHEET_COLS.find(sc => sc.key === colSort.key);
      const dir = colSort.dir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = getCellValue(a, colSort.key, col?.type);
        const bv = getCellValue(b, colSort.key, col?.type);
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;

        if (col?.type === "date") {
          return (Date.parse(av) - Date.parse(bv)) * dir;
        }
        if (col?.type === "number") {
          return (Number(av) - Number(bv)) * dir;
        }
        if (colSort.key === "month") {
          return normalizeMonthToId(av).localeCompare(normalizeMonthToId(bv)) * dir;
        }
        return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return result;
  }, [candidates, ownerFilter, profile.id, colFilters, colSort]);

  const selectedCandidates = useMemo(
    () => visibleCandidates.filter(c => selectedCandidateIds.has(c.id)),
    [visibleCandidates, selectedCandidateIds],
  );
  const noEmailSelectedCount = selectedCandidates.filter(c => !c.email?.trim()).length;
  const allVisibleSelected = visibleCandidates.length > 0 && visibleCandidates.every(c => selectedCandidateIds.has(c.id));
  const someVisibleSelected = visibleCandidates.some(c => selectedCandidateIds.has(c.id));

  useEffect(() => {
    setSelectedCandidateIds(new Set());
    setSelectionMode(false);
  }, [
    search,
    hrFilter,
    siteFilter,
    sourceFilter,
    statusFilter,
    designFilter,
    jobFilter,
    ownerFilter,
    dateFromFilter,
    dateToFilter,
    dateFieldFilter,
    activityScopeFilter,
    pipelineStageFilter,
    forwardToFilter,
    colFilters,
  ]);

  useEffect(() => {
    if (!workflowModalOpen) return;
    let cancelled = false;
    async function loadWorkflows() {
      setWorkflowsLoading(true);
      setWorkflowsError("");
      try {
        const res = await fetch("/api/workflows");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to load workflows");
        const rows = Array.isArray(json.data) ? json.data : Array.isArray(json.workflows) ? json.workflows : [];
        const activeRows = rows.filter((workflow: ManualWorkflow) => workflow.is_active !== false);
        if (!cancelled) {
          setWorkflows(activeRows);
          setSelectedWorkflowId(activeRows[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setWorkflows([]);
          setSelectedWorkflowId("");
          setWorkflowsError(err instanceof Error ? err.message : "Failed to load workflows");
        }
      } finally {
        if (!cancelled) setWorkflowsLoading(false);
      }
    }
    loadWorkflows();
    return () => { cancelled = true; };
  }, [workflowModalOpen]);

  const statusStages = useMemo(() => {
    return optionListWithValues(
      statuses,
      visibleCandidates.map(c => c.final_status?.trim() ?? ""),
    );
  }, [statuses, visibleCandidates]);

  // ── Permission ───────────────────────────────────────────────────────────
  function canEdit(cand: Candidate) {
    if (profile.role === 'recruiter') return cand.hr_id === profile.id || cand.created_by === profile.id;
    if (profile.role === 'hod') return false;
    return true;
  }

  // ── Start edit ───────────────────────────────────────────────────────────
  function toggleVisibleSelection() {
    setSelectionMode(true);
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleCandidates.forEach(c => next.delete(c.id));
      } else {
        visibleCandidates.forEach(c => next.add(c.id));
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function toggleCandidateSelection(candidateId: string) {
    setSelectionMode(true);
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  async function startWorkflowEnrollment() {
    if (!selectedWorkflowId) {
      toast.error("Select a workflow");
      return;
    }
    setEnrollingWorkflow(true);
    try {
      const res = await fetch("/api/workflows/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: selectedWorkflowId,
          candidate_ids: selectedCandidates.map(c => c.id),
          start_at: null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to start workflow");
      const result = json as WorkflowEnrollResult;
      toast.success(
        `Queued ${result.queued ?? 0}; skipped ${((result.skipped_no_email ?? 0) + (result.skipped_duplicate ?? 0) + (result.skipped_forbidden ?? 0))}`,
      );
      setSelectedCandidateIds(new Set());
      setWorkflowModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start workflow");
    } finally {
      setEnrollingWorkflow(false);
    }
  }

  function startEdit(rowId: string, col: string, overrideValue?: string) {
    const cand   = candidates.find(c => c.id === rowId);
    if (!cand || !canEdit(cand)) return;
    const colDef = SHEET_COLS.find(c => c.key === col);
    if (!colDef || colDef.readOnly) return;
    let raw = overrideValue ?? getCellValue(cand, col, colDef.type);
    // Normalise month to YYYY-MM so the <select> value matches opt.id
    if (col === "month" && raw) raw = normalizeMonthToId(raw);
    setEditValue(raw);
    setEditing({ rowId, col });
    commitLock.current = false;
  }

  // ── Commit edit ──────────────────────────────────────────────────────────
  async function commitEdit(
    rowId: string, col: string, value: string,
    next?: "right" | "left" | "down" | "none",
    isUndo = false,
  ) {
    if (commitLock.current) return;
    commitLock.current = true;
    setEditing(null);

    let fieldKey = col;
    let fieldVal: string | number | null = value.trim() || null;

    if (col === "designation_name") {
      fieldKey = "designation_id";
      fieldVal = designations.find(d => d.name === value)?.id ?? null;
    } else if (col === "site_name") {
      fieldKey = "site_id";
      fieldVal = sites.find(s => s.name === value)?.id ?? null;
    } else if (col === "source_name") {
      fieldKey = "source_id";
      fieldVal = sources.find(s => s.name === value)?.id ?? null;
    } else if (["present_salary", "expected_salary", "notice_period_days", "ai_score"].includes(col)) {
      fieldVal = value === "" ? null : parseFloat(value);
    }

    const monthFromDate = col === "application_date" ? monthFromApplicationDate(fieldVal) : null;
    const patch: Record<string, string | number | null> = { [fieldKey]: fieldVal };
    if (col === "application_date") patch.month = monthFromDate;

    const cand   = candidates.find(c => c.id === rowId);
    const colDef = SHEET_COLS.find(c => c.key === col);
    if (!isUndo && cand && colDef) {
      undoStack.current = [
        { rowId, col, oldVal: getCellValue(cand, col, colDef.type) },
        ...undoStack.current.slice(0, 19),
      ];
    }

    // Optimistic update
    setCandidates(prev => prev.map(c =>
      c.id === rowId
        ? { ...c, [col]: value, [fieldKey]: fieldVal, ...(col === "application_date" ? { month: monthFromDate } : {}) } as Candidate
        : c,
    ));
    setSaving(prev => new Set(prev).add(rowId));

    try {
      const res = await fetch(`/api/candidates/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Save failed");
        fetchCandidates();
      }
    } catch {
      toast.error("Save failed");
      fetchCandidates();
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(rowId); return n; });
      commitLock.current = false;
    }

    if (next && next !== "none" && sel) {
      const { ri, ci } = sel;
      if (next === "right") moveSel(ri, ci + 1);
      else if (next === "left") moveSel(ri, ci - 1);
      else if (next === "down") moveSel(ri + 1, ci);
    }
  }

  async function updateCandidateTags(cand: Candidate, nextIds: string[]) {
    if (!canEdit(cand)) return;
    setOpenTagMenu(null);
    setCandidates(prev => prev.map(c => c.id === cand.id ? withTagSnapshot(c, nextIds, tags) : c));
    setSaving(prev => new Set(prev).add(cand.id));

    try {
      const res = await fetch(`/api/candidates/${cand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_ids: nextIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Tag update failed");
        fetchCandidates();
        return;
      }
      if (json.data) {
        setCandidates(prev => prev.map(c => c.id === cand.id ? json.data : c));
      }
    } catch {
      toast.error("Tag update failed");
      fetchCandidates();
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(cand.id); return n; });
    }
  }

  function getCellValue(cand: Candidate, colKey: string, colType?: string): string {
    const raw = (cand as unknown as Record<string, unknown>)[colKey];
    if (raw === null || raw === undefined) return "";
    if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean).join(", ");
    if (colType === "date") return String(raw).slice(0, 10);
    return String(raw);
  }

  function formatDateDisplay(isoDate: string): string {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    if (!year || !month || !day) return isoDate;
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = parseInt(month, 10);
    return `${day}-${MONTHS[m - 1] ?? month}-${year}`;
  }

  function getUniqueColVals(colKey: string): string[] {
    const col = SHEET_COLS.find(c => c.key === colKey);
    const vals = new Set<string>();
    candidates.forEach(c => {
      const v = getCellValue(c, colKey, col?.type);
      if (v) vals.add(colKey === 'month' ? fmtMonth(v) : v);
    });
    return Array.from(vals).sort();
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function moveSel(ri: number, ci: number) {
    const newRi = Math.max(0, Math.min(visibleCandidates.length - 1, ri));
    const newCi = Math.max(0, Math.min(SHEET_COLS.length - 1, ci));
    setSel({ ri: newRi, ci: newCi });
    tableRef.current?.focus();
  }

  function handleTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    if (newRowActive) return;
    if (!sel) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "F2"].includes(e.key)) {
        e.preventDefault(); setSel({ ri: 0, ci: 0 });
      }
      return;
    }
    const { ri, ci } = sel;
    if (e.key === "ArrowUp")    { e.preventDefault(); moveSel(ri - 1, ci); return; }
    if (e.key === "ArrowDown")  {
      e.preventDefault();
      if (ri === visibleCandidates.length - 1) {
        // Step from last regular row into the new-row at the same column
        const targetKey = SHEET_COLS[ci]?.readOnly
          ? (SHEET_COLS.find(c => !c.readOnly)?.key ?? null)
          : (SHEET_COLS[ci]?.key ?? null);
        if (targetKey) { setSel(null); setNewRowActive(targetKey); }
      } else {
        moveSel(ri + 1, ci);
      }
      return;
    }
    if (e.key === "ArrowLeft")  { e.preventDefault(); moveSel(ri, ci - 1); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); moveSel(ri, ci + 1); return; }
    if (e.key === "Tab")        { e.preventDefault(); e.shiftKey ? moveSel(ri, ci - 1) : moveSel(ri, ci + 1); return; }
    if (e.key === "Escape")     { setSel(null); return; }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col) startEdit(cand.id, col.key);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col) navigator.clipboard.writeText(getCellValue(cand, col.key, col.type)).catch(() => {});
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col && canEdit(cand)) {
        navigator.clipboard.readText().then(t => commitEdit(cand.id, col.key, t.trim())).catch(() => {});
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey) {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col && !col.readOnly && canEdit(cand)) commitEdit(cand.id, col.key, "");
      return;
    }
    // Printable char → start editing (skip name/readOnly/dropdown)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col && !col.readOnly && col.type !== "dropdown" && col.key !== "name")
        startEdit(cand.id, col.key, e.key);
    }
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowId: string, colKey: string,
  ) {
    const val = e.currentTarget.value;
    if (e.key === "Escape") { setEditing(null); commitLock.current = false; return; }
    if (e.key === "Tab") { e.preventDefault(); commitEdit(rowId, colKey, val, e.shiftKey ? "left" : "right"); return; }
    if (e.key === "Enter") { e.preventDefault(); commitEdit(rowId, colKey, val, "down"); }
  }

  // ── New row save ─────────────────────────────────────────────────────────
  async function saveNewRow() {
    if (!newRow.name?.trim())         { toast.error("Candidate name is required"); return; }
    if (!newRow.mobile?.trim())       { toast.error("Mobile number is required"); return; }
    if (!newRow.designation_name?.trim() && !newRow.designation_id?.trim()) {
      toast.error("Designation (applied for) is required"); return;
    }
    if (!newRow.final_status?.trim()) { toast.error("Status is required"); return; }
    setSavingNew(true);
    try {
      const payload: Record<string, string | number | null> = { ...newRow, hr_id: newRow.hr_id || profile.id };
      if (newRow.designation_name) {
        payload.designation_id = designations.find(d => d.name === newRow.designation_name)?.id ?? null;
        delete payload.designation_name;
      }
      if (newRow.site_name) {
        payload.site_id = sites.find(s => s.name === newRow.site_name)?.id ?? null;
        delete payload.site_name;
      }
      if (newRow.source_name) {
        payload.source_id = sources.find(s => s.name === newRow.source_name)?.id ?? null;
        delete payload.source_name;
      }
      if (newRow.present_salary)     payload.present_salary     = parseFloat(newRow.present_salary);
      if (newRow.expected_salary)    payload.expected_salary    = parseFloat(newRow.expected_salary);
      if (newRow.notice_period_days) payload.notice_period_days = parseFloat(newRow.notice_period_days);

      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        toast.success("Candidate added");
        setNewRow({ application_date: TODAY, month: TODAY_MONTH, final_status: defaultStatus });
        setNewRowActive(null);
        // Append at the bottom — avoids scroll-to-top caused by a full refetch
        if (json.data) {
          setCandidates(prev => [...prev, json.data]);
          setTotal(t => t + 1);
        }
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to add");
      }
    } finally {
      setSavingNew(false);
    }
  }

  // ── CV modal handlers ────────────────────────────────────────────────────
  function openCvModal(cand: Candidate) {
    setCvModal({ candidateId: cand.id, currentUrl: cand.cv_drive_url ?? null, name: cand.name });
    setCvPasteUrl(cand.cv_drive_url ?? "");
  }

  async function saveCvUrl() {
    if (!cvModal) return;
    const url = cvPasteUrl.trim();
    const res = await fetch(`/api/candidates/${cvModal.candidateId}/cv`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_drive_url: url || null }),
    });
    if (res.ok) {
      setCandidates(prev => prev.map(c => c.id === cvModal.candidateId ? { ...c, cv_drive_url: url || undefined } : c));
      toast.success(url ? "CV link saved" : "CV link removed");
      setCvModal(null);
    } else {
      toast.error("Failed to save CV link");
    }
  }

  async function uploadCvFile(file: File) {
    if (!cvModal) return;
    setCvUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/candidates/${cvModal.candidateId}/cv`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Upload failed"); return; }
      const j = await res.json();
      const url = j.data.cv_drive_url;
      setCandidates(prev => prev.map(c => c.id === cvModal.candidateId ? { ...c, cv_drive_url: url } : c));
      setCvPasteUrl(url);
      setCvModal(prev => prev ? { ...prev, currentUrl: url } : null);
      toast.success("CV uploaded and linked");
    } catch { toast.error("Upload failed"); }
    finally { setCvUploading(false); }
  }

  async function clearCvLink() {
    if (!cvModal) return;
    const res = await fetch(`/api/candidates/${cvModal.candidateId}/cv`, { method: "DELETE" });
    if (res.ok) {
      setCandidates(prev => prev.map(c => c.id === cvModal.candidateId ? { ...c, cv_drive_url: undefined } : c));
      toast.success("CV link removed");
      setCvModal(null);
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────
  function exportCSV() {
    if (!visibleCandidates.length) { toast.error("No candidates to export"); return; }
    const hdr  = SHEET_COLS.map(c => `"${c.label}"`).join(",");
    const rows = visibleCandidates.map(cand =>
      SHEET_COLS.map(col => {
        const v = col.key === "month" ? fmtMonth(getCellValue(cand, col.key)) : getCellValue(cand, col.key, col.type);
        return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(","),
    ).join("\n");
    const blob = new Blob([`${hdr}\n${rows}`], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `candidates_${TODAY}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${visibleCandidates.length} candidates exported`);
  }

  // ── Kanban drag ──────────────────────────────────────────────────────────
  const dragId = useRef<string | null>(null);
  function onDragStart(id: string) { dragId.current = id; dragCol.current = null; }
  async function handleCardDrop(stageName: string) {
    const id = dragId.current; if (!id) return; dragId.current = null;
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, final_status: stageName } : c));
    await fetch(`/api/candidates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final_status: stageName }),
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Candidates</h1>
          <p className="text-xs text-gray-400">{loading ? "Loading…" : `${total.toLocaleString()} total`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(["sheet", "ats", "kanban"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === v ? "bg-white shadow text-brand-600 font-semibold" : "text-gray-500 hover:text-gray-700"
                }`}>
                {v === "sheet" ? "⊞ Sheet" : v === "ats" ? "🗂 ATS" : "⇄ Kanban"}
              </button>
            ))}
          </div>
          <button onClick={() => window.location.href = "/import"}
            className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg bg-white text-gray-600 hover:bg-gray-50">↑ Import</button>
          <button onClick={exportCSV}
            className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg bg-white text-gray-600 hover:bg-gray-50">↓ Export</button>
          <button
            onClick={() => view === "sheet"
              ? (setSel(null), setEditing(null), setNewRowActive("name"),
                 setTimeout(() => {
                   if (tableRef.current) tableRef.current.scrollTop = tableRef.current.scrollHeight;
                 }, 50))
              : setShowAddModal(true)}
            className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-600">
            + {view === "sheet" ? "Add Row" : "Add Candidate"}
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex flex-wrap gap-1.5 items-center flex-shrink-0">
        {/* Search */}
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name / mobile / email"
            className="text-xs border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 w-48 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none" />
          <svg className="absolute left-2 top-2.5" width="12" height="12" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Owner filter pill toggle */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {([["all", "All"], ["mine", "Mine"], ["live", "Live"], ["offered", "Offered"], ["joined", "Joined"]] as [OwnerFilter, string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => setOwnerFilter(val)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                ownerFilter === val ? "bg-white shadow text-brand-600 font-semibold" : "text-gray-500 hover:text-gray-700"
              }`}>{lbl}
            </button>
          ))}
        </div>

        {["admin", "hr_manager"].includes(profile.role) && (
          <SearchCombobox
            options={recruiters.map(r => ({ id: r.id, name: r.name }))}
            value={hrFilter}
            onChange={setHrFilter}
            placeholder="Recruiter"
            className="w-32"
          />
        )}
        <SearchCombobox
          options={sites.map(s => ({ id: s.id, name: s.name }))}
          value={siteFilter}
          onChange={setSiteFilter}
          placeholder="Site"
          className="w-28"
        />
        <SearchCombobox
          options={statuses.map(s => ({ id: s.name, name: s.name }))}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Status"
          className="w-32"
        />
        <SearchCombobox
          options={designations.map(d => ({ id: d.id, name: d.name }))}
          value={designFilter}
          onChange={setDesignFilter}
          placeholder="Designation"
          className="w-32"
        />
        <SearchCombobox
          options={tags.map(t => ({ id: t.id, name: t.name }))}
          value={tagFilter}
          onChange={setTagFilter}
          placeholder="Tag"
          className="w-28"
        />
        {(hrFilter || siteFilter || sourceFilter || tagFilter || statusFilter || designFilter || jobFilter || search || dateFieldFilter || activityScopeFilter || pipelineStageFilter || forwardToFilter || colSort) && (
          <button onClick={() => { setHrFilter(""); setSiteFilter(""); setSourceFilter(""); setTagFilter(""); setStatusFilter(""); setDesignFilter(""); setJobFilter(""); setSearch(""); setDateFieldFilter(""); setActivityScopeFilter(""); setPipelineStageFilter(""); setForwardToFilter(""); setColSort(null); }}
            className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg bg-white">✕ Clear</button>
        )}
        {Object.keys(colFilters).length > 0 && (
          <button onClick={() => setColFilters({})}
            className="text-xs text-brand-500 border border-brand-200 px-2.5 py-1.5 rounded-lg bg-white hover:bg-brand-50">
            ✕ {Object.keys(colFilters).length} col filter{Object.keys(colFilters).length > 1 ? 's' : ''}
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {loading ? "…" : `${visibleCandidates.length} shown · ${candidates.length} loaded of ${total.toLocaleString()}`}
        </span>
      </div>

      {/* ── View container ── */}
      {selectedCandidates.length > 0 && (
        <div className="bg-brand-50 border-b border-brand-100 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-brand-700">
            {selectedCandidates.length} selected
          </span>
          <button
            onClick={() => setWorkflowModalOpen(true)}
            className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-600"
          >
            Start Workflow
          </button>
          <button
            onClick={() => {
              setSelectedCandidateIds(new Set());
              setSelectionMode(false);
            }}
            className="text-xs border border-brand-200 px-3 py-1.5 rounded-lg bg-white text-brand-600 hover:bg-brand-50"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">

        {/* ════════════════ SHEET VIEW ════════════════ */}
        {view === "sheet" && (
          <div ref={tableRef} tabIndex={0} className="h-full overflow-auto outline-none"
            onKeyDown={handleTableKeyDown}>

            <div className="bg-white border-b border-gray-100 px-4 py-1.5 sticky top-0 z-20 text-xs text-gray-400">
              Click to edit · Arrows/Tab/Enter navigate · Ctrl+C/V · Ctrl+Z undo · Del clear · ▼ filter columns
            </div>

            <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
              <thead className="sticky top-8 z-10">
                <tr className="bg-gray-50">
                  <th className="border-b-2 border-r border-gray-200 px-2 py-2 bg-gray-50 text-center" style={{ width: 44 }}>
                    {selectionMode ? (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={el => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={toggleVisibleSelection}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                        disabled={visibleCandidates.length === 0}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        aria-label="Select visible candidates"
                        title="Select all visible candidates"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectionMode(true);
                        }}
                        className="text-xs font-semibold text-gray-500 hover:text-brand-600"
                        title="Show selection checkboxes"
                        aria-label="Show selection checkboxes"
                      >
                        #
                      </button>
                    )}
                  </th>
                  {SHEET_COLS.map(col => {
                    const hasFilter = !!colFilters[col.key];
                    const isSorted = colSort?.key === col.key;
                    const isFilterOpen = openColFilter === col.key;
                    return (
                      <th key={col.key} style={{ width: col.width, minWidth: col.width }}
                        className="border-b-2 border-r border-gray-200 px-2 py-2 text-left bg-gray-50 relative group">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-gray-600 text-xs truncate flex-1">
                            {col.label}{isSorted ? (colSort.dir === "asc" ? " ↑" : " ↓") : ""}
                          </span>
                          <button
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setOpenColFilter(isFilterOpen ? null : col.key); }}
                            className={`flex-shrink-0 text-xs leading-none rounded transition-colors opacity-0 group-hover:opacity-100 ${(hasFilter || isSorted) ? 'text-brand-500 opacity-100 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                            title={hasFilter ? `Filtered: ${colFilters[col.key]}` : isSorted ? `Sorted ${colSort.dir === "asc" ? "ascending" : "descending"}` : 'Sort / filter'}
                          >▼</button>
                        </div>
                        {isFilterOpen && (
                          <div ref={colFilterRef} className="absolute top-full left-0 z-50 bg-white border border-gray-200 shadow-xl rounded-lg py-1 overflow-y-auto" style={{ minWidth: Math.max(col.width, 140), maxHeight: 260 }}>
                            <div
                              onMouseDown={e => { e.preventDefault(); setColSort({ key: col.key, dir: "asc" }); setOpenColFilter(null); }}
                              className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-brand-50 ${isSorted && colSort.dir === "asc" ? 'font-semibold text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                            >Ascending</div>
                            <div
                              onMouseDown={e => { e.preventDefault(); setColSort({ key: col.key, dir: "desc" }); setOpenColFilter(null); }}
                              className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-brand-50 ${isSorted && colSort.dir === "desc" ? 'font-semibold text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                            >Descending</div>
                            {isSorted && (
                              <div
                                onMouseDown={e => { e.preventDefault(); setColSort(null); setOpenColFilter(null); }}
                                className="px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 text-gray-500 border-b border-gray-100"
                              >Clear sort</div>
                            )}
                            {!isSorted && <div className="border-b border-gray-100 my-1" />}
                            <div
                              onMouseDown={e => { e.preventDefault(); setColFilters(p => { const n = {...p}; delete n[col.key]; return n; }); setOpenColFilter(null); }}
                              className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${!colFilters[col.key] ? 'font-semibold text-brand-600' : 'text-gray-500'}`}
                            >All (clear)</div>
                            {getUniqueColVals(col.key).map(v => (
                              <div key={v}
                                onMouseDown={e => { e.preventDefault(); setColFilters(p => ({...p, [col.key]: v})); setOpenColFilter(null); }}
                                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-brand-50 truncate ${colFilters[col.key] === v ? 'font-semibold text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                              >{v || '—'}</div>
                            ))}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="border-b-2 border-gray-200 px-2 py-2 bg-gray-50 text-xs text-gray-500" style={{ width: 50 }}>CV</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={SHEET_COLS.length + 2} className="px-4 py-12 text-center text-gray-400">Loading…</td></tr>
                ) : visibleCandidates.length === 0 ? (
                  <tr><td colSpan={SHEET_COLS.length + 2} className="px-4 py-8 text-center text-gray-400">No candidates — click "+ Add Row" to start</td></tr>
                ) : visibleCandidates.map((cand, ri) => {
                  const isSaving = saving.has(cand.id);
                  const editable = canEdit(cand);
                  return (
                    <tr key={cand.id} className={`border-b border-gray-100 ${isSaving ? "opacity-50" : ""}`}>
                      <td className="border-r border-gray-100 px-1 py-1 text-gray-400 select-none text-center">
                        {selectionMode ? (
                          <input
                            type="checkbox"
                            checked={selectedCandidateIds.has(cand.id)}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            onKeyDown={e => e.stopPropagation()}
                            onChange={() => toggleCandidateSelection(cand.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            aria-label={`Select ${cand.name}`}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">{ri + 1}</span>
                        )}
                      </td>
                      {SHEET_COLS.map((col, ci) => {
                        const isEditing  = editing?.rowId === cand.id && editing?.col === col.key;
                        const isSelected = sel?.ri === ri && sel?.ci === ci && !isEditing;
                        const rawVal     = getCellValue(cand, col.key, col.type);
                        const isNameCol  = col.key === "name";
                        const isReadOnly = !!col.readOnly;
                        const canEditCell = editable && !isReadOnly;
                        const displayVal  = col.key === "month" ? fmtMonth(rawVal) : col.type === "date" && rawVal ? formatDateDisplay(rawVal) : rawVal;

                        return (
                          <td key={col.key}
                            data-rc={`${ri}-${ci}`}
                            style={{ width: col.width, maxWidth: col.width }}
                            className={[
                              "border-r border-gray-100 p-0 relative select-none",
                              isReadOnly ? "bg-gray-50/50" : "",
                              isSelected ? "outline outline-2 outline-blue-500 outline-offset-[-2px] z-10 bg-blue-50/20" : "",
                              isEditing  ? "ring-2 ring-inset ring-brand-500 z-10" : "",
                              canEditCell ? "cursor-cell" : "cursor-default",
                            ].join(" ")}
                            onClick={() => {
                              // Don't steal focus from an active input/select in this same cell
                              if (isEditing) return;
                              setNewRowActive(null);
                              setSel({ ri, ci });
                              tableRef.current?.focus();
                              if (isNameCol) {
                                setPanelId(cand.id);
                              } else if (canEditCell) {
                                startEdit(cand.id, col.key);
                              }
                            }}
                          >
                            {isEditing ? (
                              col.type === "dropdown" && col.dropdownKey ? (
                                <select
                                  ref={editInputRef as React.Ref<HTMLSelectElement>}
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={e => commitEdit(cand.id, col.key, e.currentTarget.value, "none")}
                                  onKeyDown={e => handleCellKeyDown(e, cand.id, col.key)}
                                  className="w-full h-full border-0 outline-none bg-amber-50 text-xs px-2 py-1.5 block"
                                  style={{ minWidth: col.width }}>
                                  <option value="">—</option>
                                  {optionListWithCurrent(dropdownOpts[col.dropdownKey] ?? [], editValue).map(opt => (
                                    <option key={opt.id} value={col.key === "month" ? opt.id : opt.name}>
                                      {opt.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={editInputRef as React.Ref<HTMLInputElement>}
                                  type={col.type === "date" ? "date" : col.type === "number" ? "number" : col.type === "url" ? "url" : "text"}
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={e => commitEdit(cand.id, col.key, e.currentTarget.value, "none")}
                                  onKeyDown={e => handleCellKeyDown(e, cand.id, col.key)}
                                  className="w-full border-0 outline-none bg-amber-50 text-xs px-2 py-1.5 block"
                                  style={{ minWidth: col.width }}
                                  min={col.type === "number" ? "0" : undefined}
                                />
                              )
                            ) : (
                              <div className={[
                                col.key === "tag_names" ? "overflow-visible px-0 py-0 text-xs leading-snug" : "px-2 py-1.5 truncate text-xs leading-snug",
                                isNameCol   ? "text-brand-600 font-semibold cursor-pointer hover:underline" : "",
                                isReadOnly  ? "text-gray-400" : "",
                                !editable && !isReadOnly ? "text-gray-400" : "text-gray-800",
                              ].join(" ")}>
                                {col.key === "tag_names"
                                  ? (
                                    <SheetTagCell
                                      cand={cand}
                                      tags={tags}
                                      editable={editable}
                                      open={openTagMenu === cand.id}
                                      onToggle={() => setOpenTagMenu(openTagMenu === cand.id ? null : cand.id)}
                                      onAdd={tagId => updateCandidateTags(cand, [...asStringArray(cand.tag_ids), tagId])}
                                    />
                                  )
                                  : col.key === "final_status" && rawVal
                                  ? <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[rawVal] ?? "bg-gray-100 text-gray-600"}`}>{rawVal}</span>
                                  : (col.key === "naukri_link" || col.key === "naukri_profile_url") && rawVal
                                    ? <a href={rawVal} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-500 hover:underline">🔗 Link</a>
                                    : col.key === "ai_score" && rawVal
                                      ? <span className={`font-bold ${Number(rawVal) >= 80 ? "text-green-600" : Number(rawVal) >= 60 ? "text-yellow-600" : "text-red-500"}`}>{rawVal}</span>
                                      : displayVal || <span className="text-gray-200">—</span>
                                }
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td
                        className="px-2 py-1.5 text-center cursor-pointer hover:bg-brand-50 group"
                        onClick={() => openCvModal(cand)}
                        title={cand.cv_drive_url ? "View / update CV" : "Upload or link CV"}
                      >
                        {cand.cv_drive_url
                          ? <span className="text-brand-500 text-sm group-hover:scale-110 inline-block transition-transform">📄</span>
                          : <span className="text-gray-300 text-xs group-hover:text-brand-400 transition-colors">+ CV</span>}
                      </td>
                    </tr>
                  );
                })}

                {/* ── New row ── */}
                <tr ref={newRowRef} className="bg-brand-50/40 border-b-2 border-brand-200">
                  <td className="border-r border-brand-100 px-2 py-1 text-brand-400 font-bold text-center select-none">+</td>
                  {SHEET_COLS.map(col => {
                    const isActive = newRowActive === col.key;
                    const val = newRow[col.key] ?? "";
                    if (col.readOnly) return (
                      <td key={col.key} style={{ width: col.width }}
                        className="border-r border-brand-100 px-2 py-1.5 text-xs text-gray-400">
                        {col.key === "hr_name" ? profile.name : "—"}
                      </td>
                    );
                    return (
                      <td key={col.key} style={{ width: col.width, maxWidth: col.width }}
                        className={`border-r border-brand-100 p-0 cursor-cell ${isActive ? "ring-2 ring-inset ring-brand-500 bg-white z-10" : "hover:bg-brand-50/60"}`}
                        onClick={() => { setSel(null); setNewRowActive(col.key); }}>
                        {isActive ? (
                          col.type === "dropdown" && col.dropdownKey ? (
                            <select id={`nr-${col.key}`} value={val}
                              onChange={e => setNewRow(p => ({ ...p, [col.key]: e.target.value }))}
                              onKeyDown={e => {
                                const nrKeys = SHEET_COLS.filter(c => !c.readOnly).map(c => c.key);
                                const nrIdx  = nrKeys.indexOf(col.key);
                                if ((e.ctrlKey || e.metaKey) && e.key === "d") {
                                  e.preventDefault(); e.stopPropagation();
                                  const above = visibleCandidates[visibleCandidates.length - 1];
                                  if (above) {
                                    const v = getCellValue(above, col.key, col.type);
                                    if (v) setNewRow(p => ({ ...p, [col.key]: v }));
                                  }
                                }
                                if (e.key === "Tab" || e.key === "Enter") {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewRowActive(nrKeys[nrIdx + 1] ?? null);
                                }
                                if (e.key === "ArrowRight") {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewRowActive(nrKeys[nrIdx + 1] ?? null);
                                }
                                if (e.key === "ArrowLeft") {
                                  e.preventDefault(); e.stopPropagation();
                                  if (nrIdx > 0) setNewRowActive(nrKeys[nrIdx - 1]);
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewRowActive(null);
                                  const ci = SHEET_COLS.findIndex(c => c.key === col.key);
                                  if (visibleCandidates.length > 0) setSel({ ri: visibleCandidates.length - 1, ci: Math.max(0, ci) });
                                  tableRef.current?.focus();
                                }
                                if (e.key === "Escape") { setNewRowActive(null); }
                              }}
                              className="w-full h-full border-0 outline-none bg-white text-xs px-2 py-1.5 block"
                              style={{ minWidth: col.width }}>
                              <option value="">—</option>
                              {dropdownOpts[col.dropdownKey]?.map(opt => (
                                <option key={opt.id} value={col.key === "month" ? opt.id : opt.name}>{opt.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={`nr-${col.key}`}
                              type={col.type === "date" ? "date" : col.type === "number" ? "number" : col.type === "url" ? "url" : "text"}
                              value={val}
                              onChange={e => {
                                const nextValue = e.target.value;
                                setNewRow(p => ({
                                  ...p,
                                  [col.key]: nextValue,
                                  ...(col.key === "application_date" ? { month: monthFromApplicationDate(nextValue) ?? "" } : {}),
                                }));
                              }}
                              onKeyDown={e => {
                                const nrKeys = SHEET_COLS.filter(c => !c.readOnly).map(c => c.key);
                                const nrIdx  = nrKeys.indexOf(col.key);
                                if ((e.ctrlKey || e.metaKey) && e.key === "d") {
                                  e.preventDefault(); e.stopPropagation();
                                  const above = visibleCandidates[visibleCandidates.length - 1];
                                  if (above) {
                                    const v = getCellValue(above, col.key, col.type);
                                    if (v) setNewRow(p => ({ ...p, [col.key]: v }));
                                  }
                                }
                                if (e.key === "Tab" || e.key === "Enter") {
                                  e.preventDefault(); e.stopPropagation();
                                  const next = nrKeys[nrIdx + (e.shiftKey && e.key === "Tab" ? -1 : 1)] ?? null;
                                  setNewRowActive(next);
                                  if (!next) saveNewRow();
                                }
                                if (e.key === "ArrowLeft") {
                                  e.preventDefault(); e.stopPropagation();
                                  if (nrIdx > 0) setNewRowActive(nrKeys[nrIdx - 1]);
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewRowActive(null);
                                  const ci = SHEET_COLS.findIndex(c => c.key === col.key);
                                  if (visibleCandidates.length > 0) setSel({ ri: visibleCandidates.length - 1, ci: Math.max(0, ci) });
                                  tableRef.current?.focus();
                                }
                                if (e.key === "Escape") { setNewRowActive(null); }
                              }}
                              placeholder={col.key === "name" ? "Type name to add…" : ""}
                              className="w-full border-0 outline-none bg-white text-xs px-2 py-1.5 block"
                              style={{ minWidth: col.width }}
                              min={col.type === "number" ? "0" : undefined}
                            />
                          )
                        ) : (
                          <div className="px-2 py-1.5 text-xs truncate">
                            {val
                              ? <span className="text-gray-700">{col.key === "month" ? fmtMonth(val) : val}</span>
                              : col.key === "name"
                                ? <span className="text-brand-300 italic">Click to add name…</span>
                                : <span className="text-gray-200">—</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    {newRow.name?.trim() && (
                      <button onClick={saveNewRow} disabled={savingNew}
                        className="text-xs bg-brand-500 text-white px-2.5 py-1 rounded font-semibold hover:bg-brand-600 disabled:opacity-50">
                        {savingNew ? "…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            {hasMore && !loading && (
              <div className="flex justify-center py-4">
                <button onClick={loadMore} disabled={loadingMore}
                  className="text-xs border border-gray-200 px-4 py-2 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more (${candidates.length} of ${total.toLocaleString()} loaded)`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ ATS VIEW ════════════════ */}
        {view === "ats" && (
          <div className="h-full overflow-auto p-4">
            {loading ? (
              <div className="text-center py-16 text-gray-400">Loading…</div>
            ) : visibleCandidates.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <p className="text-gray-400">No candidates yet</p>
                <button onClick={() => setShowAddModal(true)}
                  className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-brand-600">
                  + Add First Candidate
                </button>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
                {visibleCandidates.map(cand => (
                  <div key={cand.id} onClick={() => setPanelId(cand.id)}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 cursor-pointer transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{cand.name}</p>
                        <p className="text-xs text-gray-400 truncate">{cand.designation_name ?? cand.current_designation}</p>
                      </div>
                      {cand.ai_score != null && (
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ml-2 ${cand.ai_score >= 80 ? "border-green-500 text-green-700" : cand.ai_score >= 60 ? "border-yellow-500 text-yellow-700" : "border-red-400 text-red-600"}`}>
                          {cand.ai_score}
                        </div>
                      )}
                    </div>
                    <select
                      value={cand.final_status ?? ""}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        e.stopPropagation();
                        const s = e.target.value;
                        setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, final_status: s } : c));
                        fetch(`/api/candidates/${cand.id}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ final_status: s }),
                        }).then(r => { if (!r.ok) { toast.error("Status update failed"); fetchCandidates(); } });
                      }}
                      className={`text-xs font-semibold rounded-full px-1.5 py-0.5 border-0 outline-none cursor-pointer appearance-none max-w-full ${STATUS_COLORS[cand.final_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                      {optionListWithCurrent(statuses, cand.final_status ?? "").map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    <div className="mt-2">
                      <TagChips chips={candidateTagChips(cand, tags)} max={3} />
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5 mt-2">
                      {cand.site_name && <div>📍 {cand.site_name}</div>}
                      {cand.source_name && <div>🔗 {cand.source_name}</div>}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">{cand.hr_name}</span>
                      {cand.doj_actual && <span className="text-xs text-green-600 font-medium">✓ {cand.doj_actual.slice(0, 10)}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {hasMore && !loading && (
                <div className="flex justify-center py-4">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="text-xs border border-gray-200 px-4 py-2 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more (${candidates.length} of ${total.toLocaleString()} loaded)`}
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ════════════════ KANBAN VIEW ════════════════ */}
        {view === "kanban" && (() => {
          // ── All Stages: individual status columns with saved order ──────────
          const savedOrder   = colConfig.full;
          const stageMap     = new Map(statusStages.map(s => [s.name, s]));
          const fullColNames: string[] = savedOrder.length
            ? [
                ...savedOrder.filter(n => stageMap.has(n)),
                ...statusStages.map(s => s.name).filter(n => !savedOrder.includes(n)),
              ]
            : statusStages.map(s => s.name);
          const orderedStages = fullColNames.map(n => stageMap.get(n)).filter(Boolean) as typeof statusStages;

          function saveFullOrder(names: string[]) {
            localStorage.setItem("kanban-col-full", JSON.stringify(names));
            setColConfig(prev => ({ ...prev, full: names }));
          }
          function resetFullOrder() {
            localStorage.removeItem("kanban-col-full");
            setColConfig(prev => ({ ...prev, full: [] }));
            setEditColIdx(null);
          }

          // ── Shared card renderer ────────────────────────────────────────────
          function getInitials(name?: string | null) {
            if (!name) return "";
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0][0].toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          }

          function KanbanCard({ cand, color }: { cand: (typeof visibleCandidates)[0]; color: string }) {
            const initials = getInitials(cand.hr_name);
            return (
              <div draggable
                onDragStart={() => onDragStart(cand.id)} onClick={() => setPanelId(cand.id)}
                className="bg-white rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none relative"
                style={{ borderLeft: `3px solid ${color}` }}>
                {initials && (
                  <span
                    title={cand.hr_name ?? ""}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white font-bold leading-none flex-shrink-0"
                    style={{ fontSize: 9, background: color }}>
                    {initials}
                  </span>
                )}
                <p className="text-xs font-semibold text-gray-900 leading-tight pr-7">{cand.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{cand.designation_name}</p>
                {cand.site_name && <p className="text-xs text-gray-400">{cand.site_name}</p>}
                <div className="mt-1">
                  <TagChips chips={candidateTagChips(cand, tags)} max={2} compact />
                </div>
                <select
                  value={cand.final_status ?? ""}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    e.stopPropagation();
                    const s = e.target.value;
                    setCandidates(prev => prev.map(c => c.id === cand.id ? { ...c, final_status: s } : c));
                    fetch(`/api/candidates/${cand.id}`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ final_status: s }),
                    }).then(r => { if (!r.ok) { toast.error("Status update failed"); fetchCandidates(); } });
                  }}
                  className="mt-1.5 w-full text-xs border border-gray-100 rounded px-1 py-0.5 bg-white text-gray-600 outline-none cursor-pointer">
                  {optionListWithCurrent(statusStages, cand.final_status ?? "").map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                {cand.doj_actual && <p className="text-xs text-green-600 mt-0.5">✓ {cand.doj_actual.slice(0, 10)}</p>}
              </div>
            );
          }

          return (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Kanban sub-header */}
              <div className="bg-white border-b border-gray-100 px-4 py-1.5 flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-400">View:</span>
                <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  <button onClick={() => setKanbanFull(false)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${!kanbanFull ? "bg-white shadow text-brand-600 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
                    Pipeline
                  </button>
                  <button onClick={() => setKanbanFull(true)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${kanbanFull ? "bg-white shadow text-brand-600 font-semibold" : "text-gray-500 hover:text-gray-700"}`}>
                    All Stages
                  </button>
                </div>
                {kanbanFull ? (
                  <>
                    <span className="text-xs text-gray-300">{orderedStages.length} columns · drag headers to reorder · click name to change stage</span>
                    {savedOrder.length > 0 && (
                      <button onClick={resetFullOrder} className="ml-auto text-xs text-gray-400 hover:text-brand-500 transition-colors">
                        Reset order
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-gray-300">{PIPELINE_GROUPS.length} columns</span>
                )}
              </div>

              {/* ── PIPELINE view: 7 grouped columns ── */}
              {!kanbanFull && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                  <div className="flex gap-3 h-full" style={{ minWidth: PIPELINE_GROUPS.length * 212 }}>
                    {PIPELINE_GROUPS.map(group => {
                      const groupCands = visibleCandidates.filter(c => group.statuses.has(c.final_status ?? ""));
                      return (
                        <div key={group.name}
                          className="flex flex-col rounded-xl bg-gray-100/80 flex-shrink-0 overflow-hidden" style={{ width: 200 }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={async () => {
                            if (!dragCol.current) await handleCardDrop(group.defaultStatus);
                            dragCol.current = null;
                          }}>
                          {/* Column header */}
                          <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-700 truncate mr-1">{group.name}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                              style={{ background: group.color }}>{groupCands.length}</span>
                          </div>
                          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
                            {groupCands.map(cand => (
                              <KanbanCard key={cand.id} cand={cand} color={group.color} />
                            ))}
                            {groupCands.length === 0 && <p className="text-xs text-gray-300 italic text-center py-4">Drop here</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ALL STAGES view: individual status columns ── */}
              {kanbanFull && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                  <div className="flex gap-3 h-full" style={{ minWidth: orderedStages.length * 212 }}>
                    {orderedStages.map((stage, stageIdx) => {
                      const stageCands = visibleCandidates.filter(c => c.final_status === stage.name);
                      const color      = stage.color ?? "#6b7280";
                      return (
                        <div key={stage.name}
                          className="flex flex-col rounded-xl bg-gray-100/80 flex-shrink-0 overflow-hidden" style={{ width: 200 }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={async () => {
                            if (dragCol.current && dragCol.current !== stage.name) {
                              const names = [...fullColNames];
                              const fi = names.indexOf(dragCol.current);
                              const ti = names.indexOf(stage.name);
                              if (fi >= 0 && ti >= 0) { names.splice(fi, 1); names.splice(ti, 0, dragCol.current); saveFullOrder(names); }
                              dragCol.current = null;
                            } else {
                              await handleCardDrop(stage.name);
                            }
                          }}>
                          {/* Column header — draggable for reorder */}
                          <div
                            draggable
                            onDragStart={e => { dragCol.current = stage.name; dragId.current = null; e.dataTransfer.effectAllowed = "move"; }}
                            onDragEnd={() => { dragCol.current = null; }}
                            className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-grab active:cursor-grabbing"
                          >
                            {editColIdx === stageIdx ? (
                              <select autoFocus value={stage.name}
                                onBlur={() => setEditColIdx(null)}
                                onChange={e => {
                                  const names = [...fullColNames]; names[stageIdx] = e.target.value;
                                  saveFullOrder(names); setEditColIdx(null);
                                }}
                                className="text-xs font-semibold text-gray-700 bg-white border border-brand-400 rounded px-1 outline-none w-full mr-1">
                                {statusStages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            ) : (
                              <span onClick={() => setEditColIdx(stageIdx)}
                                className="text-xs font-semibold text-gray-700 truncate mr-1 cursor-pointer hover:text-brand-500 transition-colors select-none"
                                title="Click to change stage">
                                {stage.name}
                              </span>
                            )}
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                              style={{ background: color }}>{stageCands.length}</span>
                          </div>
                          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
                            {stageCands.map(cand => (
                              <KanbanCard key={cand.id} cand={cand} color={color} />
                            ))}
                            {stageCands.length === 0 && <p className="text-xs text-gray-300 italic text-center py-4">Drop here</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {showAddModal && (
        <AddCandidateModal
          profile={profile} sites={sites} designations={designations}
          sources={sources} statuses={statuses} recruiters={recruiters}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchCandidates(); }}
        />
      )}
      {panelId && (
        <DetailPanel
          candidateId={panelId} profile={profile}
          sites={sites} designations={designations} sources={sources} tags={tags} recruiters={recruiters}
          onClose={() => setPanelId(null)} onUpdated={fetchCandidates}
        />
      )}

      {/* ── CV Upload / Link Modal ── */}
      {workflowModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Start Workflow</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedCandidates.length} candidate{selectedCandidates.length === 1 ? "" : "s"} selected
                </p>
              </div>
              <button
                onClick={() => setWorkflowModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={enrollingWorkflow}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {noEmailSelectedCount > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
                  {noEmailSelectedCount} selected candidate{noEmailSelectedCount === 1 ? "" : "s"} without email will be skipped.
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Workflow</label>
                {workflowsLoading ? (
                  <div className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-2">Loading workflows...</div>
                ) : workflowsError ? (
                  <div className="text-xs text-red-600 border border-red-100 bg-red-50 rounded-lg px-3 py-2">{workflowsError}</div>
                ) : workflows.length === 0 ? (
                  <div className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2">No active workflows available.</div>
                ) : (
                  <select
                    value={selectedWorkflowId}
                    onChange={e => setSelectedWorkflowId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {workflows.map(workflow => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1.5">Gmail must be connected before queued workflow emails can send.</p>
              </div>

              {selectedWorkflowId && (
                <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600">
                    {workflows.find(w => w.id === selectedWorkflowId)?.name}
                  </p>
                  {workflows.find(w => w.id === selectedWorkflowId)?.description && (
                    <p className="text-xs text-gray-500 mt-1">
                      {workflows.find(w => w.id === selectedWorkflowId)?.description}
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Selected candidates</p>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {selectedCandidates.slice(0, 25).map(candidate => (
                    <div key={candidate.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{candidate.name || "Unnamed candidate"}</p>
                        <p className="text-xs text-gray-400 truncate">{candidate.email || "No email"}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[candidate.final_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                        {candidate.final_status || "No status"}
                      </span>
                    </div>
                  ))}
                  {selectedCandidates.length > 25 && (
                    <div className="px-3 py-2 text-xs text-gray-400">
                      + {selectedCandidates.length - 25} more
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
              <button
                onClick={() => setWorkflowModalOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                disabled={enrollingWorkflow}
              >
                Cancel
              </button>
              <button
                onClick={startWorkflowEnrollment}
                disabled={enrollingWorkflow || workflowsLoading || workflows.length === 0 || selectedCandidates.length === 0}
                className="px-5 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
              >
                {enrollingWorkflow ? "Starting..." : "Start Workflow"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-sm font-bold text-gray-900">CV — {cvModal.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Paste a Google Drive link or upload a file</p>
              </div>
              <button onClick={() => setCvModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Current CV */}
              {cvModal.currentUrl && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span className="text-green-600 text-lg">📄</span>
                  <a href={cvModal.currentUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-700 hover:underline flex-1 truncate flex items-center gap-1">
                    <ExternalLink size={11} /> View current CV
                  </a>
                  <button onClick={clearCvLink} className="text-red-400 hover:text-red-600 ml-auto flex-shrink-0" title="Remove CV link">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {/* Option A: Paste Google Drive URL */}
              <div>
                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <LinkIcon size={12} /> Paste Google Drive / Naukri / any URL
                </label>
                <input
                  type="url"
                  value={cvPasteUrl}
                  onChange={e => setCvPasteUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 text-xs text-gray-300">
                <div className="flex-1 h-px bg-gray-100" />
                <span>or upload directly</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Option B: File Upload */}
              <div>
                <input ref={cvFileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCvFile(f); }} />
                <button
                  onClick={() => cvFileRef.current?.click()}
                  disabled={cvUploading}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-500 hover:bg-brand-50/40 transition-colors disabled:opacity-60"
                >
                  <Upload size={15} />
                  {cvUploading ? "Uploading…" : "Upload PDF / Word file"}
                </button>
                <p className="text-xs text-gray-400 mt-1.5 text-center">Max 10 MB · PDF, DOC, DOCX · Stored in Supabase</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setCvModal(null)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
              <button
                onClick={saveCvUrl}
                disabled={!cvPasteUrl.trim() && !cvModal.currentUrl}
                className="px-5 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-40"
              >
                Save Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
