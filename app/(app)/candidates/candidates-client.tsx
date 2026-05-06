"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { Candidate, DatePeriod, Master, ParsedKeywords, Profile, SavedSkillView, SkillCriteria } from "@/lib/types";
import DetailPanel from "@/components/candidate-detail-panel";
import AddCandidateModal from "@/components/add-candidate-modal";
import SkillSearchModal from "@/components/skill-search-modal";
import toast from "react-hot-toast";
import { Check, X, Upload, Link as LinkIcon, ExternalLink, Trash2 } from "lucide-react";

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

type View = "sheet" | "ats" | "kanban";
type SkillSuggestionMap = Partial<Record<keyof SkillCriteria, string[]>>;

interface Props {
  profile: Profile;
  sites: Master[];
  designations: Master[];
  sources: Master[];
  statuses: Master[];
  recruiters: Profile[];
  interviewers: Master[];
  initialStatus?: string;
  initialHrId?: string;
  initialCandidateId?: string;
}

// ── Sheet columns ────────────────────────────────────────────────────────────
const SHEET_COLS: {
  key: string; label: string; width: number;
  type?: "text" | "date" | "dropdown" | "number" | "url";
  dropdownKey?: string;
  readOnly?: boolean;
}[] = [
  { key: "hr_name",                    label: "HR",                   width: 110, readOnly: true },
  { key: "month",                      label: "Month",                width: 110, type: "dropdown", dropdownKey: "month" },
  { key: "application_date",           label: "App. Date",            width: 105, type: "date" },
  { key: "final_status",               label: "Status",               width: 175, type: "dropdown", dropdownKey: "status" },
  { key: "name",                       label: "Name",                 width: 160 },
  { key: "current_designation",        label: "Cur. Designation",     width: 145 },
  { key: "designation_name",           label: "Designation For",      width: 165, type: "dropdown", dropdownKey: "designation" },
  { key: "site_name",                  label: "Site",                 width: 140, type: "dropdown", dropdownKey: "site" },
  { key: "mobile",                     label: "Mobile",               width: 120 },
  { key: "email",                      label: "Email",                width: 170 },
  { key: "naukri_profile_url",         label: "Profile Link",         width: 150, type: "url" },
  { key: "suitable_other_position",    label: "Suitable Other Post",  width: 145, type: "dropdown", dropdownKey: "designationOrOther" },
  { key: "current_location",           label: "Location",             width: 115 },
  { key: "source_name",                label: "Source",               width: 105, type: "dropdown", dropdownKey: "source" },
  { key: "present_salary",             label: "Cur. CTC",             width: 90,  type: "number" },
  { key: "expected_salary",            label: "Exp. CTC",             width: 90,  type: "number" },
  { key: "notice_period_days",         label: "Notice (days)",        width: 85,  type: "number" },
  { key: "ai_score",                   label: "AI Score",             width: 70,  readOnly: true },
  { key: "google_form_sent",           label: "GF Sent",              width: 80,  type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "google_form_received",       label: "GF Recd",              width: 80,  type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "processed_by_hr",            label: "Processed by HR",      width: 110, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "shortlist_by_hr",            label: "Shortlist HR",         width: 95,  type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "tel_int_date",               label: "Tel Int Date",         width: 105, type: "date" },
  { key: "tel_int_remarks",            label: "Tel Remarks",          width: 135 },
  { key: "hr_manager_remarks",         label: "HR Mgr Remarks",       width: 145 },
  { key: "mgmt_remarks_before_pi",     label: "Mgmt Remarks",         width: 145 },
  { key: "remarks_before_pi",          label: "HOD Comments",         width: 145 },
  { key: "shortlisted_for_pi",         label: "Shortlisted PI",       width: 95,  type: "dropdown", dropdownKey: "yesNo" },
  { key: "pi1_date",                   label: "PI 1 Date",            width: 105, type: "date" },
  { key: "pi1_taken_by",               label: "PI 1 By",              width: 160, type: "dropdown", dropdownKey: "interviewer" },
  { key: "pi1_remarks",                label: "PI 1 Remarks",         width: 135 },
  { key: "pi2_date",                   label: "PI 2 Date",            width: 105, type: "date" },
  { key: "pi2_taken_by",               label: "PI 2 By",              width: 160, type: "dropdown", dropdownKey: "interviewer" },
  { key: "pi2_remarks",                label: "PI 2 Remarks",         width: 135 },
  { key: "pi3_date",                   label: "PI 3 Date",            width: 105, type: "date" },
  { key: "pi3_taken_by",               label: "PI 3 By",              width: 160, type: "dropdown", dropdownKey: "interviewer" },
  { key: "pi3_remarks",                label: "PI 3 Remarks",         width: 135 },
  { key: "gf_issued",                  label: "GF Issued",            width: 80,  type: "dropdown", dropdownKey: "yesNo" },
  { key: "shortlisted_by_mgmt",        label: "Shortlist Mgmt",       width: 105, type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "gf_issue_date",              label: "GF Issue Date",        width: 105, type: "date" },
  { key: "gf_received_date",           label: "GF Recd Date",         width: 105, type: "date" },
  { key: "gf_verified",                label: "GF Verified",          width: 90,  type: "dropdown", dropdownKey: "yesNoNA" },
  { key: "gf_verification_report",     label: "GF Verification",      width: 140 },
  { key: "addr_verification_shared",   label: "Addr Verif. Shared",   width: 130, type: "date" },
  { key: "addr_verification_received", label: "Addr Verif. Recd",     width: 130, type: "date" },
  { key: "remarks",                    label: "Remarks",              width: 145 },
  { key: "final_action",               label: "Final Action",         width: 160 },
  { key: "file_no",                    label: "File No",              width: 90 },
  { key: "hard_copy",                  label: "Hard Copy",            width: 80,  type: "dropdown", dropdownKey: "yesNo" },
  { key: "doj_actual",                 label: "DOJ",                  width: 110, type: "date" },
];

// Kanban core view — key outcome stages only (mirrors the dashboard funnel)
const KANBAN_CORE_KEYS = new Set([
  "Sourced", "Tel Int Done", "Shortlisted by HR", "PI Done",
  "Shortlisted by Mgmt", "GF Issued", "Appointed/Offered",
  "Joined", "On Hold", "Rejected/Dropped",
]);

// ── Month helpers ────────────────────────────────────────────────────────────
function buildMonthOpts() {
  const opts: { id: string; name: string }[] = [];
  const now = new Date();
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      const id    = `${y}-${String(m).padStart(2, "0")}`;
      const label = new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long" }) + `-${String(y).slice(2)}`;
      opts.push({ id, name: label });
    }
  }
  return opts.reverse(); // newest first
}
const MONTH_OPTS = buildMonthOpts();
const MONTH_LABEL_TO_ID: Record<string, string> = {};
MONTH_OPTS.forEach(o => { MONTH_LABEL_TO_ID[o.name.toLowerCase()] = o.id; });

function excelSerialToMonthId(raw: string): string | null {
  if (!/^\d{5}$/.test(raw)) return null;
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const baseUtc = Date.UTC(1899, 11, 30);
  const date = new Date(baseUtc + serial * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMonth(raw: string): string {
  if (!raw) return "";
  const normalized = excelSerialToMonthId(raw) ?? raw;
  if (/^\d{4}-\d{2}$/.test(normalized)) return MONTH_OPTS.find(o => o.id === normalized)?.name ?? normalized;
  return raw;
}
function normalizeMonthToId(raw: string): string {
  if (!raw) return "";
  const serialMonth = excelSerialToMonthId(raw);
  if (serialMonth) return serialMonth;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return MONTH_LABEL_TO_ID[raw.toLowerCase()] ?? raw;
}

// ── Status color map (covers both old and new status names) ─────────────────
const STATUS_COLORS: Record<string, string> = {
  "Sourced":                       "bg-gray-100 text-gray-600",
  "Recruiter Screening Done":      "bg-blue-100 text-blue-700",
  "HR Manager Screening Done":     "bg-cyan-100 text-cyan-700",
  "Dept Mgr Screening Done":       "bg-violet-100 text-violet-700",
  "Mgmt Approved for PI Call":     "bg-indigo-100 text-indigo-700",
  "Called for PI":                 "bg-purple-100 text-purple-700",
  "Did not Attend Interview":      "bg-red-50 text-red-400",
  "PI 1 done":                     "bg-indigo-100 text-indigo-700",
  "PI 2 Done":                     "bg-purple-100 text-purple-700",
  "PI Done":                       "bg-indigo-100 text-indigo-700",
  "GF Issued":                     "bg-amber-100 text-amber-700",
  "Shortlisted":                   "bg-teal-100 text-teal-700",
  "Hold":                          "bg-yellow-100 text-yellow-700",
  "On Hold":                       "bg-yellow-100 text-yellow-700",
  "Suitable for Future":           "bg-blue-50 text-blue-600",
  "Offered but Not Joined":        "bg-red-50 text-red-600",
  "Offered But Not Joined":        "bg-red-50 text-red-600",
  "Offered":                       "bg-brand-100 text-brand-700",
  "Appointed":                     "bg-brand-100 text-brand-700",
  "Appointed/Offered":             "bg-brand-100 text-brand-700",
  "Not Interested":                "bg-red-50 text-red-500",
  "Rejected":                      "bg-red-100 text-red-600",
  "Rejected/Dropped":              "bg-red-100 text-red-600",
  "Joined":                        "bg-green-100 text-green-700",
  "Joined & Left":                 "bg-gray-200 text-gray-500",
  "Active Employee":               "bg-green-100 text-green-700",
  // Legacy
  "Tel Int Scheduled":             "bg-violet-50 text-violet-600",
  "Tel Int Done":                  "bg-purple-100 text-purple-700",
  "Google Form Sent":              "bg-emerald-50 text-emerald-600",
  "Shortlisted by HR":             "bg-teal-100 text-teal-700",
  "PI Scheduled":                  "bg-indigo-50 text-indigo-600",
  "Shortlisted by Mgmt":           "bg-emerald-100 text-emerald-700",
  "GF Received":                   "bg-amber-50 text-amber-600",
};

const TODAY = new Date().toISOString().split("T")[0];

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function KeywordTags({ tags, max = 4 }: { tags?: string[]; max?: number }) {
  if (!tags?.length) return null;
  const visible = tags.slice(0, max);
  const rest = tags.length - max;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {visible.map(tag => (
        <span
          key={tag}
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            /\d+yr/i.test(tag)
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {tag}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  );
}

function getKeywordTags(candidate: Candidate) {
  return candidate.parsed_keywords?.summary_tags ?? [];
}

function getDateRangeForPeriod(period: DatePeriod) {
  const now = new Date();
  if (period === "month") {
    return {
      from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toIsoDate(now),
    };
  }
  if (period === "lastmonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }
  if (period === "last30") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: toIsoDate(start), to: toIsoDate(now) };
  }
  return { from: "", to: "" };
}

function hasSkillCriteria(criteria: SkillCriteria) {
  return Object.values(criteria).some(value => value.trim() !== "");
}

function parseCriteriaList(value: string) {
  return value.split(",").map(term => term.trim().toLowerCase()).filter(Boolean);
}

function addSuggestion(target: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(item => addSuggestion(target, item));
    return;
  }
  if (typeof value !== "string" && typeof value !== "number") return;
  String(value)
    .split(",")
    .map(item => item.trim().replace(/\s+/g, " "))
    .filter(item => item.length >= 2)
    .forEach(item => target.add(item));
}

function sortedSuggestions(values: Set<string>) {
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .slice(0, 250);
}

function criteriaToSearchString(criteria: SkillCriteria) {
  const parts = [
    criteria.skills,
    criteria.tools,
    criteria.education,
    criteria.college,
    criteria.current_role,
    criteria.previous_companies,
    criteria.projects,
    criteria.industries,
    criteria.certifications,
    criteria.languages,
    criteria.summary_tags,
    criteria.min_years_experience.trim() ? `${criteria.min_years_experience.trim()} years` : "",
  ];
  return parts
    .flatMap(part => part.split(","))
    .map(part => part.trim())
    .filter(Boolean)
    .join(" ");
}

function buildCriteriaSummary(criteria: SkillCriteria) {
  const parts = [
    ...parseCriteriaList(criteria.skills).slice(0, 2),
    ...parseCriteriaList(criteria.tools).slice(0, 2),
    criteria.current_role.trim(),
    criteria.min_years_experience.trim() ? `${criteria.min_years_experience.trim()}+ yrs` : "",
  ].filter(Boolean);
  return parts.slice(0, 4).join(" · ");
}

function criteriaEqual(a: SkillCriteria, b: SkillCriteria) {
  return (Object.keys(EMPTY_CRITERIA) as (keyof SkillCriteria)[])
    .every(key => a[key].trim() === b[key].trim());
}

function matchScore(candidateVals: string[], searchTerms: string[], weight: number): number {
  if (!searchTerms.length || !candidateVals.length) return 0;
  const vals = candidateVals.map(value => value.toLowerCase()).filter(Boolean);
  let score = 0;
  for (const term of searchTerms) {
    if (vals.includes(term)) score += weight * 2;
    else if (vals.some(value => value.includes(term) || term.includes(value))) score += weight;
  }
  return score;
}

function scoreCandidate(c: Candidate, criteria: SkillCriteria): number {
  if (!hasSkillCriteria(criteria)) return 0;
  const kw = (c.parsed_keywords ?? {}) as ParsedKeywords;
  const minYrs = criteria.min_years_experience ? Number(criteria.min_years_experience) : null;
  const hasMinYears = minYrs !== null && Number.isFinite(minYrs);

  if (hasMinYears) {
    const candidateYrs = Number(kw.years_experience ?? c.kw_years_experience ?? 0);
    if (!candidateYrs || candidateYrs < minYrs) return 0;
  }

  const skills = parseCriteriaList(criteria.skills);
  const tools = parseCriteriaList(criteria.tools);
  const summaryTags = parseCriteriaList(criteria.summary_tags);
  const projects = parseCriteriaList(criteria.projects);
  const industries = parseCriteriaList(criteria.industries);
  const certifications = parseCriteriaList(criteria.certifications);
  const languages = parseCriteriaList(criteria.languages);
  const previousCompanies = parseCriteriaList(criteria.previous_companies);
  const currentRole = criteria.current_role.trim().toLowerCase();
  const education = criteria.education.trim().toLowerCase();
  const college = criteria.college.trim().toLowerCase();

  const maxPossible =
    (skills.length ? 30 * 2 : 0) +
    (tools.length ? 20 * 2 : 0) +
    (currentRole ? 12 * 2 : 0) +
    (summaryTags.length ? 10 * 2 : 0) +
    (projects.length ? 8 * 2 : 0) +
    (industries.length ? 8 * 2 : 0) +
    (certifications.length ? 6 * 2 : 0) +
    (languages.length ? 4 * 2 : 0) +
    (education ? 2 * 2 : 0) +
    (college ? 2 * 2 : 0) +
    (previousCompanies.length ? 2 * 2 : 0) +
    (hasMinYears ? 10 : 0);

  if (maxPossible === 0) return 0;

  let raw = 0;
  if (hasMinYears) raw += 10;
  raw += matchScore(kw.skills ?? [], skills, 30);
  raw += matchScore(kw.tools ?? [], tools, 20);
  raw += matchScore(kw.summary_tags ?? [], summaryTags, 10);
  raw += matchScore(kw.projects ?? [], projects, 8);
  raw += matchScore(kw.industries ?? [], industries, 8);
  raw += matchScore(kw.certifications ?? [], certifications, 6);
  raw += matchScore(kw.languages ?? [], languages, 4);
  raw += matchScore(kw.previous_companies ?? [], previousCompanies, 2);

  const candidateRole = [kw.current_role, c.current_designation].filter(Boolean).join(" ").toLowerCase();
  if (currentRole && candidateRole.includes(currentRole)) raw += 12 * 2;
  const candidateEdu = (kw.education ?? "").toLowerCase();
  if (education && candidateEdu.includes(education)) raw += 2 * 2;
  const candidateCollege = (kw.college ?? "").toLowerCase();
  if (college && candidateCollege.includes(college)) raw += 2 * 2;

  return Math.min(100, Math.round((raw / maxPossible) * 100));
}

function AiScoreBadge({ score }: { score: number }) {
  if (score <= 0) {
    return (
      <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-400">
        —
      </span>
    );
  }
  const color = score >= 80
    ? "bg-green-100 text-green-700 border-green-200"
    : score >= 50
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-flex min-w-8 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

export default function CandidatesClient({
  profile, sites, designations, sources, statuses, recruiters, interviewers,
  initialStatus = "", initialHrId = "", initialCandidateId = "",
}: Props) {
  const [view, setView]             = useState<View>("sheet");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [skillCriteria, setSkillCriteria] = useState<SkillCriteria>(EMPTY_CRITERIA);
  const [draftSkillCriteria, setDraftSkillCriteria] = useState<SkillCriteria>(EMPTY_CRITERIA);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedSkillView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [hrFilter, setHrFilter]         = useState(initialHrId);
  const [siteFilter, setSiteFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [designFilter, setDesignFilter] = useState("");
  const [period, setPeriod]             = useState<DatePeriod>("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo]     = useState("");
  const [kanbanFull, setKanbanFull]     = useState(false);
  const [colConfig, setColConfig]       = useState<{ pipeline: string[]; full: string[] }>({ pipeline: [], full: [] });
  const [editColIdx, setEditColIdx]     = useState<number | null>(null);
  const dragCol = useRef<string | null>(null);

  const [panelId, setPanelId]           = useState<string | null>(initialCandidateId || null);
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Sheet editing state ──────────────────────────────────────────────────
  const [editing, setEditing]     = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sel, setSel]             = useState<{ ri: number; ci: number } | null>(null);
  const [saving, setSaving]       = useState<Set<string>>(new Set());
  const commitLock = useRef(false);
  const lastEdit   = useRef<{ rowId: string; col: string; oldVal: string } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [openColFilter, setOpenColFilter] = useState<string | null>(null);
  const colFilterRef = useRef<HTMLDivElement>(null);

  // ── New row state ────────────────────────────────────────────────────────
  const defaultStatus = statuses[0]?.name ?? "Sourced";
  const [newRow, setNewRow]           = useState<Record<string, string>>({ application_date: TODAY, final_status: defaultStatus });
  const [newRowActive, setNewRowActive] = useState<string | null>(null);
  const [savingNew, setSavingNew]     = useState(false);

  const tableRef    = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const cvFileRef   = useRef<HTMLInputElement>(null);

  // ── CV modal state ───────────────────────────────────────────────────────
  const [cvModal, setCvModal] = useState<{ candidateId: string; currentUrl: string | null; name: string } | null>(null);
  const [cvPasteUrl, setCvPasteUrl] = useState("");
  const [cvUploading, setCvUploading] = useState(false);

  const toOpts = (arr: string[]) => arr.map(s => ({ id: s, name: s, type: "", sort_order: 0, is_active: true, metadata: {}, created_at: "" }));
  const YN_OPTS   = toOpts(["Yes", "No"]);
  const YNNA_OPTS = toOpts(["Yes", "No", "NA"]);

  const dropdownOpts: Record<string, { id: string; name: string }[]> = {
    status:             statuses,
    site:               sites,
    designation:        designations,
    source:             sources,
    month:              MONTH_OPTS,
    yesNo:              YN_OPTS,
    yesNoNA:            YNNA_OPTS,
    designationOrOther: [...designations, { id: "Other", name: "Other", type: "", sort_order: 999, is_active: true, metadata: {}, created_at: "" }],
    recruiter:          recruiters.map(r => ({ id: r.name, name: r.name, type: "", sort_order: 0, is_active: true, metadata: {}, created_at: "" })),
    interviewer:        interviewers,
  };

  const skillActive = hasSkillCriteria(skillCriteria);
  const skillSearchSummary = buildCriteriaSummary(skillCriteria);

  const skillSuggestions = useMemo<SkillSuggestionMap>(() => {
    const buckets: Record<keyof SkillCriteria, Set<string>> = {
      skills: new Set(),
      tools: new Set(),
      min_years_experience: new Set(),
      education: new Set(),
      college: new Set(),
      current_role: new Set(),
      previous_companies: new Set(),
      projects: new Set(),
      industries: new Set(),
      certifications: new Set(),
      languages: new Set(),
      summary_tags: new Set(),
    };

    candidates.forEach(candidate => {
      const kw = candidate.parsed_keywords ?? {};
      addSuggestion(buckets.skills, kw.skills);
      addSuggestion(buckets.skills, candidate.kw_skills);
      addSuggestion(buckets.tools, kw.tools);
      addSuggestion(buckets.education, kw.education);
      addSuggestion(buckets.college, kw.college);
      addSuggestion(buckets.current_role, kw.current_role);
      addSuggestion(buckets.current_role, candidate.current_designation);
      addSuggestion(buckets.previous_companies, kw.previous_companies);
      addSuggestion(buckets.previous_companies, candidate.kw_previous_companies);
      addSuggestion(buckets.projects, kw.projects);
      addSuggestion(buckets.projects, candidate.kw_projects);
      addSuggestion(buckets.industries, kw.industries);
      addSuggestion(buckets.certifications, kw.certifications);
      addSuggestion(buckets.languages, kw.languages);
      addSuggestion(buckets.summary_tags, kw.summary_tags);
      addSuggestion(buckets.summary_tags, candidate.kw_summary_tags);
    });

    designations.forEach(designation => {
      addSuggestion(buckets.current_role, designation.name);
      addSuggestion(buckets.summary_tags, designation.name);
    });

    return {
      skills: sortedSuggestions(buckets.skills),
      tools: sortedSuggestions(buckets.tools),
      education: sortedSuggestions(buckets.education),
      college: sortedSuggestions(buckets.college),
      current_role: sortedSuggestions(buckets.current_role),
      previous_companies: sortedSuggestions(buckets.previous_companies),
      projects: sortedSuggestions(buckets.projects),
      industries: sortedSuggestions(buckets.industries),
      certifications: sortedSuggestions(buckets.certifications),
      languages: sortedSuggestions(buckets.languages),
      summary_tags: sortedSuggestions(buckets.summary_tags),
    };
  }, [candidates, designations]);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const derivedRange = period === "custom"
        ? { from: dateFrom, to: dateTo }
        : getDateRangeForPeriod(period);
      const p = new URLSearchParams({ limit: "2000" });
      if (hrFilter)     p.set("hr_id",         hrFilter);
      if (siteFilter)   p.set("site_id",        siteFilter);
      if (statusFilter) p.set("status",         statusFilter);
      if (designFilter) p.set("designation_id", designFilter);
      if (search)       p.set("search",         search);
      const skillSearch = criteriaToSearchString(skillCriteria);
      if (skillSearch)  p.set("kw_search",      skillSearch);
      if (derivedRange.from) p.set("date_from", derivedRange.from);
      if (derivedRange.to) p.set("date_to", derivedRange.to);
      const res  = await fetch(`/api/candidates?${p}`);
      const json = await res.json();
      setCandidates(json.data ?? []);
      setTotal(json.count ?? 0);
    } finally {
      setLoading(false);
    }
  }, [hrFilter, siteFilter, statusFilter, designFilter, search, skillCriteria, period, dateFrom, dateTo]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("ats_saved_skill_views") ?? "[]");
      setSavedViews(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedViews([]);
    }
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

  // Scroll selected cell into view when navigating with arrow keys
  useEffect(() => {
    if (!sel) return;
    const cell = tableRef.current?.querySelector(`td[data-rc="${sel.ri}-${sel.ci}"]`);
    (cell as HTMLElement)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (openColFilter && colFilterRef.current && !colFilterRef.current.contains(e.target as Node)) {
        setOpenColFilter(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openColFilter]);

  const scoredCandidates = useMemo(() => {
    if (!skillActive) return candidates;
    return [...candidates]
      .map(c => ({ ...c, _liveScore: scoreCandidate(c, skillCriteria) }))
      .sort((a, b) => (b._liveScore ?? 0) - (a._liveScore ?? 0));
  }, [candidates, skillActive, skillCriteria]);

  const visibleCandidates = useMemo(() => {
    let result = scoredCandidates;
    Object.entries(colFilters).forEach(([colKey, filterVal]) => {
      if (!filterVal) return;
      const col = SHEET_COLS.find(sc => sc.key === colKey);
      result = result.filter(c => {
        const v = getCellValue(c, colKey, col?.type);
        return (colKey === 'month' ? fmtMonth(v) : v) === filterVal;
      });
    });
    return result;
  }, [scoredCandidates, colFilters]);

  function handlePeriodChange(val: string) {
    const nextPeriod = val as DatePeriod;
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") {
      setCustomDateFrom("");
      setCustomDateTo("");
      setDateFrom("");
      setDateTo("");
    }
  }

  function applyCustomDateRange() {
    setDateFrom(customDateFrom);
    setDateTo(customDateTo);
  }

  function openSkillModal() {
    setDraftSkillCriteria(skillCriteria);
    setShowSkillModal(true);
  }

  function closeSkillModal() {
    setDraftSkillCriteria(skillCriteria);
    setActiveViewId(savedViews.find(view => criteriaEqual(view.criteria, skillCriteria))?.id ?? null);
    setShowSkillModal(false);
  }

  function applySkillCriteria(criteria: SkillCriteria) {
    setSkillCriteria(criteria);
    setDraftSkillCriteria(criteria);
    setActiveViewId(savedViews.find(view => criteriaEqual(view.criteria, criteria))?.id ?? null);
    setShowSkillModal(false);
  }

  function clearSkillCriteria() {
    setSkillCriteria(EMPTY_CRITERIA);
    setDraftSkillCriteria(EMPTY_CRITERIA);
    setActiveViewId(null);
  }

  function persistSavedViews(nextViews: SavedSkillView[]) {
    setSavedViews(nextViews);
    localStorage.setItem("ats_saved_skill_views", JSON.stringify(nextViews));
  }

  function saveSkillView(name: string, criteria: SkillCriteria) {
    if (!name.trim()) return;
    if (!hasSkillCriteria(criteria)) {
      toast.error("Add search criteria before saving");
      return;
    }
    const view: SavedSkillView = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 40),
      criteria,
      created_at: new Date().toISOString(),
    };
    persistSavedViews([...savedViews, view]);
    toast.success("View saved");
  }

  function applySavedView(viewToApply: SavedSkillView) {
    setSkillCriteria(viewToApply.criteria);
    setDraftSkillCriteria(viewToApply.criteria);
    setActiveViewId(viewToApply.id);
    setShowSkillModal(false);
  }

  function deleteSavedView(viewId: string) {
    if (!window.confirm("Delete this saved view?")) return;
    persistSavedViews(savedViews.filter(view => view.id !== viewId));
    if (activeViewId === viewId) setActiveViewId(null);
  }

  // ── Permission ───────────────────────────────────────────────────────────
  function canEdit(cand: Candidate) {
    if (profile.role === 'recruiter') return cand.hr_id === profile.id || cand.created_by === profile.id;
    if (profile.role === 'hod') return false;
    return true;
  }

  // ── Start edit ───────────────────────────────────────────────────────────
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

    const cand   = candidates.find(c => c.id === rowId);
    const colDef = SHEET_COLS.find(c => c.key === col);
    if (cand && colDef) lastEdit.current = { rowId, col, oldVal: getCellValue(cand, col, colDef.type) };

    // Optimistic update
    setCandidates(prev => prev.map(c =>
      c.id === rowId ? { ...c, [col]: value, [fieldKey]: fieldVal } as Candidate : c,
    ));
    setSaving(prev => new Set(prev).add(rowId));

    try {
      const res = await fetch(`/api/candidates/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: fieldVal }),
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

  function getCellValue(cand: Candidate, colKey: string, colType?: string): string {
    const raw = (cand as unknown as Record<string, unknown>)[colKey];
    if (raw === null || raw === undefined) return "";
    if (colType === "date") return String(raw).slice(0, 10);
    return String(raw);
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
    if (!sel) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "F2"].includes(e.key)) {
        e.preventDefault(); setSel({ ri: 0, ci: 0 });
      }
      return;
    }
    const { ri, ci } = sel;
    if (e.key === "ArrowUp")    { e.preventDefault(); moveSel(ri - 1, ci); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); moveSel(ri + 1, ci); return; }
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
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (lastEdit.current) {
        const { rowId, col, oldVal } = lastEdit.current;
        lastEdit.current = null;
        commitEdit(rowId, col, oldVal, "none");
        toast("Undo", { icon: "↩" });
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey) {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col && !col.readOnly && canEdit(cand)) commitEdit(cand.id, col.key, "");
      return;
    }
    // Printable char -> start editing (skip readOnly/dropdown)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const cand = visibleCandidates[ri]; const col = SHEET_COLS[ci];
      if (cand && col && !col.readOnly && col.type !== "dropdown")
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
        toast.success("Candidate added");
        setNewRow({ application_date: TODAY, final_status: defaultStatus });
        setNewRowActive(null);
        fetchCandidates();
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
      fd.append("candidate_id", cvModal.candidateId);
      const res = await fetch(`/api/candidates/${cvModal.candidateId}/cv`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Upload failed"); return; }
      const j = await res.json();
      const url = j.data.cv_drive_url;
      setCandidates(prev => prev.map(c => c.id === cvModal.candidateId ? { ...c, cv_drive_url: url } : c));
      setCvPasteUrl(url);
      setCvModal(prev => prev ? { ...prev, currentUrl: url } : null);
      toast.success("CV uploaded and linked");
      try {
        const parseFd = new FormData();
        parseFd.append("file", file);
        parseFd.append("candidate_id", cvModal.candidateId);
        const parseRes = await fetch("/api/parse-resume", { method: "POST", body: parseFd });
        if (parseRes.ok) {
          const parsed = await parseRes.json();
          const parsedKeywords = parsed.data?.parsed_keywords;
          if (parsedKeywords) {
            setCandidates(prev => prev.map(c => c.id === cvModal.candidateId ? { ...c, parsed_keywords: parsedKeywords } : c));
          }
        }
      } catch {
        // CV upload should still succeed even when AI parsing is unavailable.
      }
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
                 setTimeout(() => document.getElementById("nr-name")?.focus(), 50))
              : setShowAddModal(true)}
            className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-600">
            + {view === "sheet" ? "Add Row" : "Add Candidate"}
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex flex-wrap gap-2 items-center flex-shrink-0">
        {savedViews.length > 0 && (
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex min-w-0 items-center gap-2">
              {savedViews.map(viewItem => {
                const active = activeViewId === viewItem.id || criteriaEqual(skillCriteria, viewItem.criteria);
                return (
                  <span
                    key={viewItem.id}
                    className={[
                      "flex items-center gap-1 rounded-full border border-brand-200 px-2.5 py-1 text-xs text-brand-700",
                      active ? "bg-brand-100 font-semibold" : "bg-brand-50",
                    ].join(" ")}
                  >
                    {active && <Check size={11} />}
                    <button
                      type="button"
                      onClick={() => applySavedView(viewItem)}
                      className="max-w-44 truncate"
                      title={viewItem.name}
                    >
                      {viewItem.name}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteSavedView(viewItem.id);
                      }}
                      className="text-brand-500 hover:text-brand-800"
                      aria-label={`Delete ${viewItem.name}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {/* Search */}
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, mobile, email…"
            className="text-xs border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 w-52 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none" />
          <svg className="absolute left-2 top-2.5" width="12" height="12" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="relative">
          <input
            readOnly
            value={skillSearchSummary}
            onClick={openSkillModal}
            onFocus={openSkillModal}
            placeholder='Skill Search: "Python 4 years"'
            className="text-xs border border-gray-200 rounded-lg pl-7 pr-7 py-1.5 w-60 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none cursor-pointer bg-white" />
          <svg className="absolute left-2 top-2.5" width="12" height="12" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {skillActive && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                clearSkillCriteria();
              }}
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-700">
              <X size={12} />
            </button>
          )}
        </div>

        <select
          value={period}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none"
        >
          <option value="all">All Time</option>
          <option value="month">This Month</option>
          <option value="lastmonth">Last Month</option>
          <option value="last30">Last 30 Days</option>
          <option value="custom">Custom Range...</option>
        </select>

        {period === "custom" && (
          <>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none"
            />
            <span className="text-gray-300 text-xs">to</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none"
            />
            <button
              onClick={applyCustomDateRange}
              className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-brand-600"
            >
              Apply
            </button>
          </>
        )}

        {["admin", "hr_manager"].includes(profile.role) && (
          <select value={hrFilter} onChange={e => setHrFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
            <option value="">All Recruiters</option>
            {recruiters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select value={designFilter} onChange={e => setDesignFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
          <option value="">All Designations</option>
          {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {(hrFilter || siteFilter || statusFilter || designFilter || search || skillActive || period !== "all" || dateFrom || dateTo || customDateFrom || customDateTo) && (
          <button onClick={() => {
            setHrFilter("");
            setSiteFilter("");
            setStatusFilter("");
            setDesignFilter("");
            setSearch("");
            clearSkillCriteria();
            setPeriod("all");
            setDateFrom("");
            setDateTo("");
            setCustomDateFrom("");
            setCustomDateTo("");
          }}
            className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg bg-white">✕ Clear</button>
        )}
        {Object.keys(colFilters).length > 0 && (
          <button onClick={() => setColFilters({})}
            className="text-xs text-brand-500 border border-brand-200 px-2.5 py-1.5 rounded-lg bg-white hover:bg-brand-50">
            ✕ {Object.keys(colFilters).length} col filter{Object.keys(colFilters).length > 1 ? 's' : ''}
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {loading ? "…" : `${visibleCandidates.length} of ${total.toLocaleString()}`}
        </span>
      </div>

      {/* ── View container ── */}
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
                  <th className="border-b-2 border-r border-gray-200 px-2 py-2 bg-gray-50" style={{ width: 32 }}>#</th>
                  {SHEET_COLS.map(col => {
                    const hasFilter = !!colFilters[col.key];
                    const isFilterOpen = openColFilter === col.key;
                    return (
                      <th key={col.key} style={{ width: col.width, minWidth: col.width }}
                        className="border-b-2 border-r border-gray-200 px-2 py-2 text-left bg-gray-50 relative group">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-gray-600 text-xs truncate flex-1">{col.label}</span>
                          <button
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setOpenColFilter(isFilterOpen ? null : col.key); }}
                            className={`flex-shrink-0 text-xs leading-none rounded transition-colors opacity-0 group-hover:opacity-100 ${hasFilter ? 'text-brand-500 opacity-100 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                            title={hasFilter ? `Filtered: ${colFilters[col.key]}` : 'Filter'}
                          >▼</button>
                        </div>
                        {isFilterOpen && (
                          <div ref={colFilterRef} className="absolute top-full left-0 z-50 bg-white border border-gray-200 shadow-xl rounded-lg py-1 overflow-y-auto" style={{ minWidth: Math.max(col.width, 140), maxHeight: 260 }}>
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
                      <td className="border-r border-gray-100 px-2 py-1 text-gray-400 select-none text-center">{ri + 1}</td>
                      {SHEET_COLS.map((col, ci) => {
                        const isEditing  = editing?.rowId === cand.id && editing?.col === col.key;
                        const isSelected = sel?.ri === ri && sel?.ci === ci && !isEditing;
                        const rawVal     = getCellValue(cand, col.key, col.type);
                        const isNameCol  = col.key === "name";
                        const isReadOnly = !!col.readOnly;
                        const canEditCell = editable && !isReadOnly;
                        const displayVal  = col.key === "month" ? fmtMonth(rawVal) : rawVal;

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
                                  {dropdownOpts[col.dropdownKey]?.map(opt => (
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
                                "px-2 py-1.5 text-xs leading-snug truncate",
                                isNameCol ? "font-semibold text-gray-900 cursor-pointer" : "",
                                isReadOnly  ? "text-gray-400" : "",
                                !editable && !isReadOnly && !isNameCol ? "text-gray-400" : "text-gray-800",
                              ].join(" ")}>
                                {col.key === "ai_score" && skillActive
                                  ? <AiScoreBadge score={cand._liveScore ?? 0} />
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
                <tr className="bg-brand-50/40 border-b-2 border-brand-200">
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
                        onClick={() => setNewRowActive(col.key)}>
                        {isActive ? (
                          col.type === "dropdown" && col.dropdownKey ? (
                            <select autoFocus value={val}
                              onChange={e => setNewRow(p => ({ ...p, [col.key]: e.target.value }))}
                              onBlur={() => setNewRowActive(null)}
                              onKeyDown={e => {
                                if (e.key === "Tab" || e.key === "Enter") {
                                  e.preventDefault();
                                  const keys = SHEET_COLS.filter(c => !c.readOnly).map(c => c.key);
                                  setNewRowActive(keys[keys.indexOf(col.key) + 1] ?? null);
                                }
                                if (e.key === "Escape") setNewRowActive(null);
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
                              id={col.key === "name" ? "nr-name" : undefined}
                              autoFocus={col.key !== "name"}
                              type={col.type === "date" ? "date" : col.type === "number" ? "number" : col.type === "url" ? "url" : "text"}
                              value={val}
                              onChange={e => setNewRow(p => ({ ...p, [col.key]: e.target.value }))}
                              onBlur={() => setNewRowActive(null)}
                              onKeyDown={e => {
                                if (e.key === "Tab" || e.key === "Enter") {
                                  e.preventDefault();
                                  const keys = SHEET_COLS.filter(c => !c.readOnly).map(c => c.key);
                                  const idx  = keys.indexOf(col.key);
                                  const next = keys[idx + (e.shiftKey && e.key === "Tab" ? -1 : 1)];
                                  setNewRowActive(next ?? null);
                                  if (!next) saveNewRow();
                                }
                                if (e.key === "Escape") setNewRowActive(null);
                              }}
                              placeholder=""
                              className="w-full border-0 outline-none bg-white text-xs px-2 py-1.5 block"
                              style={{ minWidth: col.width }}
                              min={col.type === "number" ? "0" : undefined}
                            />
                          )
                        ) : (
                          <div className="px-2 py-1.5 text-xs truncate">
                            {val
                              ? <span className="text-gray-700">{col.key === "month" ? fmtMonth(val) : val}</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {visibleCandidates.map(cand => (
                  <div key={cand.id} onClick={() => setPanelId(cand.id)}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 cursor-pointer transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{cand.name}</p>
                        <p className="text-xs text-gray-400 truncate">{cand.designation_name ?? cand.current_designation}</p>
                        <KeywordTags tags={getKeywordTags(cand)} />
                      </div>
                      {skillActive ? (
                        <div className="ml-2 flex-shrink-0">
                          <AiScoreBadge score={cand._liveScore ?? 0} />
                        </div>
                      ) : cand.ai_score != null && (
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
                      {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
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
            )}
          </div>
        )}

        {/* ════════════════ KANBAN VIEW ════════════════ */}
        {view === "kanban" && (() => {
          const kanbanStages = kanbanFull
            ? statuses
            : statuses.filter(s => KANBAN_CORE_KEYS.has(s.name));

          // Resolve ordered stages from saved config (falls back to default order)
          const savedOrder = kanbanFull ? colConfig.full : colConfig.pipeline;
          const stageMap   = new Map(statuses.map(s => [s.name, s]));
          const colNames: string[] = savedOrder.length
            ? [
                ...savedOrder.filter(n => stageMap.has(n)),
                ...kanbanStages.map(s => s.name).filter(n => !savedOrder.includes(n)),
              ]
            : kanbanStages.map(s => s.name);
          const orderedStages = colNames.map(n => stageMap.get(n)).filter(Boolean) as typeof kanbanStages;

          function saveOrder(names: string[]) {
            const key = kanbanFull ? "kanban-col-full" : "kanban-col-pipeline";
            localStorage.setItem(key, JSON.stringify(names));
            setColConfig(prev => kanbanFull ? { ...prev, full: names } : { ...prev, pipeline: names });
          }

          function resetOrder() {
            const key = kanbanFull ? "kanban-col-full" : "kanban-col-pipeline";
            localStorage.removeItem(key);
            setColConfig(prev => kanbanFull ? { ...prev, full: [] } : { ...prev, pipeline: [] });
            setEditColIdx(null);
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
                <span className="text-xs text-gray-300">{orderedStages.length} columns</span>
                <span className="text-xs text-gray-300">· drag column headers to reorder · click name to change stage</span>
                {savedOrder.length > 0 && (
                  <button onClick={resetOrder} className="ml-auto text-xs text-gray-400 hover:text-brand-500 transition-colors">
                    Reset order
                  </button>
                )}
              </div>

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
                            // Column reorder
                            const names = [...colNames];
                            const fi = names.indexOf(dragCol.current);
                            const ti = names.indexOf(stage.name);
                            if (fi >= 0 && ti >= 0) {
                              names.splice(fi, 1);
                              names.splice(ti, 0, dragCol.current);
                              saveOrder(names);
                            }
                            dragCol.current = null;
                          } else {
                            await handleCardDrop(stage.name);
                          }
                        }}>
                        {/* Column header — draggable for reorder */}
                        <div
                          draggable
                          onDragStart={e => {
                            dragCol.current = stage.name;
                            dragId.current  = null;
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => { dragCol.current = null; }}
                          className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 cursor-grab active:cursor-grabbing group"
                        >
                          {editColIdx === stageIdx ? (
                            <select
                              autoFocus
                              value={stage.name}
                              onBlur={() => setEditColIdx(null)}
                              onChange={e => {
                                const newName = e.target.value;
                                const names   = [...colNames];
                                names[stageIdx] = newName;
                                saveOrder(names);
                                setEditColIdx(null);
                              }}
                              className="text-xs font-semibold text-gray-700 bg-white border border-brand-400 rounded px-1 outline-none w-full mr-1"
                            >
                              {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                          ) : (
                            <span
                              onClick={() => setEditColIdx(stageIdx)}
                              className="text-xs font-semibold text-gray-700 truncate mr-1 cursor-pointer hover:text-brand-500 transition-colors select-none"
                              title="Click to change stage"
                            >
                              {stage.name}
                            </span>
                          )}
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                            style={{ background: color }}>{stageCands.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
                          {stageCands.map(cand => (
                            <div key={cand.id} draggable
                              onDragStart={() => onDragStart(cand.id)} onClick={() => setPanelId(cand.id)}
                              className="bg-white rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none"
                              style={{ borderLeft: `3px solid ${color}` }}>
                              <p className="text-xs font-semibold text-gray-900 leading-tight">{cand.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{cand.designation_name}</p>
                              <KeywordTags tags={getKeywordTags(cand)} max={3} />
                              {cand.site_name && <p className="text-xs text-gray-400">{cand.site_name}</p>}
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
                                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                              {cand.doj_actual && <p className="text-xs text-green-600 mt-0.5">✓ {cand.doj_actual.slice(0, 10)}</p>}
                            </div>
                          ))}
                          {stageCands.length === 0 && <p className="text-xs text-gray-300 italic text-center py-4">Drop here</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
          sites={sites} designations={designations} sources={sources} recruiters={recruiters}
          onClose={() => setPanelId(null)} onUpdated={fetchCandidates}
        />
      )}

      <SkillSearchModal
        open={showSkillModal}
        onClose={closeSkillModal}
        criteria={draftSkillCriteria}
        onChange={(criteria) => {
          setDraftSkillCriteria(criteria);
          setActiveViewId(savedViews.find(viewItem => criteriaEqual(viewItem.criteria, criteria))?.id ?? null);
        }}
        onApply={applySkillCriteria}
        savedViews={savedViews}
        onSaveView={saveSkillView}
        suggestions={skillSuggestions}
      />

      {/* ── CV Upload / Link Modal ── */}
      {cvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-sm font-bold text-gray-900">CV — {cvModal.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Paste a URL or upload to Supabase</p>
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

              {/* Option A: Paste URL */}
              <div>
                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <LinkIcon size={12} /> Paste Supabase / Naukri / any URL
                </label>
                <input
                  type="url"
                  value={cvPasteUrl}
                  onChange={e => setCvPasteUrl(e.target.value)}
                  placeholder="https://.../candidate-cv.pdf"
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
                <p className="text-xs text-gray-400 mt-1.5 text-center">Max 15 MB · PDF, DOC, DOCX · Stored in Supabase</p>
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
