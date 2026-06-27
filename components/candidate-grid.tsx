"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type {
  ColDef,
  GridReadyEvent,
  CellValueChangedEvent,
  RowClickedEvent,
  ICellRendererParams,
  CellEditingStartedEvent,
} from "ag-grid-community";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { Candidate, Master, Profile } from "@/lib/types";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Download, Settings2, Eye } from "lucide-react";
import CandidateDetailPanel from "./candidate-detail-panel";
import ColumnManagerModal from "./column-manager-modal";
import type { CandidateFilters } from "./filter-bar";

interface Props {
  profile:       Profile;
  sites:         Master[];
  designations:  Master[];
  sources:       Master[];
  recruiters:    Profile[];
  filters:       CandidateFilters;
  onTotalCount:  (n: number) => void;
}

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

// Core fields that CANNOT be edited by recruiters after initial save
const LOCKED_AFTER_SAVE = new Set(["name", "mobile", "email"]);

// Fields only admin/hr_manager can edit
const MANAGER_ONLY_FIELDS = new Set(["hr_manager_remarks", "mgmt_remarks_before_pi", "shortlisted_by_mgmt", "offered_salary", "final_action", "file_no"]);

function StatusBadge({ value }: { value: string }) {
  const cls = STATUS_COLORS[value] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{value}</span>;
}

const YES_NO_VALS  = ["Y", "N", ""];
const YES_NO_WORDS = ["Yes", "No", ""];
const FINAL_STATUSES = [
  "Sourced","Applied","Recruiter Screening Done","HR Manager Screening Done",
  "Dept Mgr Screening Done","Mgmt Approved for PI Call","Called for PI",
  "Did Not Attend Interview","PI 1 Done","PI 2 Done","GF Issued","Shortlisted",
  "Shortlisted But Not Offered","Hold","Suitable for Future","Offered But Did Not Join",
  "Offered","Not Interested","Rejected","Appointed","Joined","Joined & Left",
  "Active Employee","Not Yet Processed","Other","Dropped By Candidate",
];

export default function CandidateGrid({ profile, sites, designations, sources, recruiters, filters, onTotalCount }: Props) {
  const gridRef       = useRef<AgGridReact>(null);
  const [rowData, setRowData]       = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Candidate | null>(null);
  const [showColMgr, setShowColMgr] = useState(false);

  const canEdit    = ["admin","hr_manager","recruiter"].includes(profile.role);
  const isAdmin    = profile.role === "admin";
  const isManager  = ["admin","hr_manager"].includes(profile.role);
  const isRecruiter = profile.role === "recruiter";

  // Lookup maps
  const siteMap      = useMemo(() => Object.fromEntries(sites.map(s => [s.id, s.name])), [sites]);
  const desigMap     = useMemo(() => Object.fromEntries(designations.map(d => [d.id, d.name])), [designations]);
  const sourceMap    = useMemo(() => Object.fromEntries(sources.map(s => [s.id, s.name])), [sources]);
  const recruiterMap = useMemo(() => Object.fromEntries(recruiters.map(r => [r.id, r.name])), [recruiters]);

  async function fetchCandidates() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.hr_id)          params.set("hr_id",          filters.hr_id);
    if (filters.site_id)        params.set("site_id",         filters.site_id);
    if (filters.status)         params.set("status",          filters.status);
    if (filters.search)         params.set("search",          filters.search);
    if (filters.designation_id) params.set("designation_id",  filters.designation_id);
    if (filters.source_id)      params.set("source_id",       filters.source_id);
    if (filters.month)          params.set("month",           filters.month);
    if (filters.date_from)      params.set("date_from",       filters.date_from);
    if (filters.date_to)        params.set("date_to",         filters.date_to);
    if (filters.pi_taken_by)    params.set("pi_taken_by",     filters.pi_taken_by);
    params.set("limit", "2000");
    const res  = await fetch(`/api/candidates?${params}`);
    const json = await res.json();
    setRowData(json.data ?? []);
    onTotalCount(json.count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchCandidates(); }, [
    filters.hr_id, filters.site_id, filters.status, filters.search,
    filters.designation_id, filters.source_id, filters.month,
    filters.date_from, filters.date_to, filters.pi_taken_by,
  ]);

  // ── Inline cell save ──────────────────────────────────────
  const onCellValueChanged = useCallback(async (e: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = e;
    if (!colDef.field) return;

    // New unsaved row — handled by onRowEditingStopped below
    if (!data.id) return;

    const res = await fetch(`/api/candidates/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [colDef.field]: newValue ?? null }),
    });
    if (!res.ok) {
      toast.error("Save failed");
      e.node.setDataValue(colDef.field, oldValue);
    }
  }, []);

  // ── Prevent editing locked fields on existing rows ────────
  const onCellEditingStarted = useCallback((e: CellEditingStartedEvent) => {
    const field = e.colDef.field ?? "";
    const isNew = !e.data?.id;

    // Recruiters cannot edit name/mobile/email of existing rows
    if (!isNew && isRecruiter && LOCKED_AFTER_SAVE.has(field)) {
      toast("Contact details are locked after entry", { icon: "🔒" });
      e.api.stopEditing(true);
      return;
    }
    // Recruiters cannot edit manager-only fields
    if (!isManager && MANAGER_ONLY_FIELDS.has(field)) {
      toast("Only HR Manager / Admin can edit this field", { icon: "🔒" });
      e.api.stopEditing(true);
    }
  }, [isRecruiter, isManager]);

  // ── Add new blank row directly in grid ────────────────────
  function addNewRow() {
    const blank: Partial<Candidate> = {
      hr_id:           isRecruiter ? profile.id : undefined,
      application_date: new Date().toISOString().split("T")[0],
      month:           new Date().toLocaleString("default", { month: "long", year: "numeric" }),
      final_status:    "Sourced",
    };
    const res = gridRef.current?.api.applyTransaction({ add: [blank as Candidate], addIndex: 0 });
    if (res?.add[0]) {
      gridRef.current?.api.startEditingCell({ rowIndex: 0, colKey: "name" });
    }
  }

  // ── Save new row when editing stops ──────────────────────
  async function saveNewRow(data: Partial<Candidate>) {
    if (!data.name?.trim()) { toast.error("Candidate name is required"); return; }
    const res = await fetch("/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, hr_id: data.hr_id ?? profile.id }),
    });
    if (res.ok) {
      toast.success("Candidate saved");
      fetchCandidates();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to save");
      gridRef.current?.api.applyTransaction({ remove: [data as Candidate] });
    }
  }

  // ── Delete (admin only, soft) ─────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Archive this record? It can be restored by admin later.")) return;
    const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Archived"); fetchCandidates(); }
    else toast.error("Failed");
  }

  // ── Column definitions ────────────────────────────────────
  const colDefs: ColDef<Candidate>[] = useMemo(() => {
    const e = canEdit; // shorthand

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateCol = (field: string, header: string, opts: Partial<ColDef> = {}): ColDef<any> => ({
      field, headerName: header, width: 110, editable: e,
      cellEditor: "agDateCellEditor",
      valueFormatter: p => formatDate(p.value),
      filter: "agDateColumnFilter",
      ...opts,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectCol = (field: string, header: string, values: string[], opts: Partial<ColDef> = {}): ColDef<any> => ({
      field, headerName: header, width: 100, editable: e,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values },
      filter: true,
      ...opts,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textCol = (field: string, header: string, opts: Partial<ColDef> = {}): ColDef<any> => ({
      field, headerName: header, width: 140, editable: e, filter: true, ...opts,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memoCol = (field: string, header: string, opts: Partial<ColDef> = {}): ColDef<any> => ({
      field, headerName: header, width: 200, editable: e,
      cellEditor: "agLargeTextCellEditor",
      cellEditorPopup: true,
      ...opts,
    });

    return [
      // ── Identity (pinned left) ────────────────────────────
      {
        field: "sr_no", headerName: "#", width: 55, pinned: "left",
        editable: false, sortable: true, filter: false,
        cellStyle: { color: "#94a3b8", fontWeight: 600 },
      },
      {
        headerName: "", width: 36, pinned: "left", editable: false,
        sortable: false, filter: false, resizable: false,
        cellRenderer: (p: ICellRendererParams) => p.data?.id ? (
          <button
            onClick={() => setSelected(p.data)}
            title="View full details"
            className="flex items-center justify-center w-full h-full text-gray-400 hover:text-brand-600"
          >
            <Eye size={14} />
          </button>
        ) : null,
      },
      {
        field: "name", headerName: "Candidate Name", width: 190, pinned: "left",
        editable: e, sortable: true, filter: true,
        cellStyle: { fontWeight: 600, color: "#0f172a" },
        cellClass: p => !p.data?.id ? "bg-yellow-50" : "",
      },

      // ── Contact ───────────────────────────────────────────
      textCol("mobile", "Mobile", { width: 125 }),
      textCol("email",  "Email",  { width: 190 }),

      // ── Current Profile ───────────────────────────────────
      textCol("current_designation", "Current Designation",  { width: 165 }),
      textCol("current_location",    "Current Location",     { width: 130 }),
      {
        field: "present_salary", headerName: "Present Salary (₹)", width: 120,
        editable: e, type: "numericColumn",
        cellEditor: "agNumberCellEditor",
        valueFormatter: p => formatCurrency(p.value),
        filter: "agNumberColumnFilter",
      },
      {
        field: "expected_salary", headerName: "Expected Salary (₹)", width: 120,
        editable: e, type: "numericColumn",
        cellEditor: "agNumberCellEditor",
        valueFormatter: p => formatCurrency(p.value),
        filter: "agNumberColumnFilter",
      },

      // ── Applied Role ──────────────────────────────────────
      {
        field: "designation_id", headerName: "Designation (Recruited For)", width: 155, editable: e,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: designations.map(d => d.id) },
        valueFormatter: p => desigMap[p.value] ?? "",
        filter: true,
      },
      {
        field: "site_id", headerName: "Site / Location", width: 120, editable: e,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: sites.map(s => s.id) },
        valueFormatter: p => siteMap[p.value] ?? "",
        filter: true,
      },
      {
        field: "source_id", headerName: "Source", width: 110, editable: e,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: sources.map(s => s.id) },
        valueFormatter: p => sourceMap[p.value] ?? "",
        filter: true,
      },
      {
        field: "naukri_link", headerName: "Profile Link", width: 90, editable: e,
        cellRenderer: (p: ICellRendererParams) => p.value
          ? <a href={p.value} target="_blank" rel="noreferrer" className="text-blue-500 underline text-xs">🔗 Link</a>
          : null,
      },

      // ── Attribution ───────────────────────────────────────
      {
        field: "hr_id", headerName: "Recruiter", width: 130,
        editable: isManager,
        hide: isRecruiter,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: recruiters.map(r => r.id) },
        valueFormatter: p => recruiterMap[p.value] ?? p.value ?? "",
        filter: true,
      },
      textCol("month",            "Month",            { width: 110 }),
      dateCol("application_date", "Application Date", { width: 115 }),

      // ── Stage 1 · Screening ───────────────────────────────
      selectCol("google_form_sent",     "GF Sent",      YES_NO_VALS,  { width: 80  }),
      selectCol("google_form_received", "GF Received",  YES_NO_VALS,  { width: 95  }),
      selectCol("processed_by_hr",      "Processed HR", YES_NO_WORDS, { width: 100 }),
      selectCol("shortlist_by_hr",      "Shortlist HR", YES_NO_WORDS, { width: 100 }),

      // ── Stage 2 · Telephonic Interview ────────────────────
      dateCol("tel_int_date",    "Tel Int Date",         { width: 110 }),
      memoCol("tel_int_remarks", "Tel Int Remarks",      { width: 200 }),
      selectCol("shortlisted_for_pi", "Shortlisted for PI", YES_NO_WORDS, { width: 120 }),

      // ── Pre-PI Notes ──────────────────────────────────────
      memoCol("hr_manager_remarks",    "HR Manager Remarks",    {
        width: 200, editable: isManager,
        cellStyle: { background: isManager ? "transparent" : "#f8fafc" },
      }),
      memoCol("remarks_before_pi",      "Remarks Before PI",    { width: 200 }),
      memoCol("mgmt_remarks_before_pi", "Mgmt Remarks (Pre-PI)",{ width: 200, editable: isManager }),

      // ── Stage 3 · PI Round 1 ──────────────────────────────
      dateCol("pi1_date",     "PI 1 Date",    { width: 110 }),
      textCol("pi1_taken_by", "PI 1 Taken By",{ width: 130 }),
      memoCol("pi1_remarks",  "PI 1 Remarks", { width: 200 }),

      // ── Stage 4 · PI Round 2 ──────────────────────────────
      dateCol("pi2_date",     "PI 2 Date",    { width: 110 }),
      textCol("pi2_taken_by", "PI 2 Taken By",{ width: 130 }),
      memoCol("pi2_remarks",  "PI 2 Remarks", { width: 200 }),

      // ── Stage 5 · PI Round 3 ──────────────────────────────
      dateCol("pi3_date",     "PI 3 Date",    { width: 110 }),
      textCol("pi3_taken_by", "PI 3 Taken By",{ width: 130 }),
      memoCol("pi3_remarks",  "PI 3 Remarks", { width: 200 }),

      // ── Stage 6 · Management Sign-off ─────────────────────
      selectCol("shortlisted_by_mgmt", "Shortlisted by Mgmt", YES_NO_WORDS, {
        width: 130, editable: isManager,
      }),
      selectCol("gf_issued",         "GF Issued",       YES_NO_VALS, { width: 85  }),
      dateCol("gf_issue_date",       "GF Issue Date",   { width: 110 }),
      dateCol("gf_received_date",    "GF Received Date",{ width: 120 }),
      selectCol("gf_verified",       "GF Verified",     YES_NO_VALS, { width: 90  }),
      memoCol("gf_verification_report", "GF Verif. Report", { width: 200 }),

      // ── Stage 7 · Address Verification ────────────────────
      dateCol("addr_verification_shared",   "Addr. Verif. Shared",   { width: 120 }),
      dateCol("addr_verification_received", "Addr. Verif. Received", { width: 125 }),

      // ── Offer & Closing ───────────────────────────────────
      {
        field: "offered_salary", headerName: "Offered Salary (₹)", width: 130,
        editable: isManager, type: "numericColumn",
        cellEditor: "agNumberCellEditor",
        valueFormatter: p => formatCurrency(p.value),
        filter: "agNumberColumnFilter",
        cellStyle: { fontWeight: 600, color: "#15803d" },
      },
      textCol("suitable_other_position", "Suitable for Other Position", { width: 165 }),
      memoCol("remarks",      "Remarks",      { width: 200 }),
      textCol("final_action", "Final Action", { width: 130, editable: isManager }),
      textCol("file_no",      "File No.",     { width: 85, editable: isManager }),
      selectCol("hard_copy",  "Hard Copy",    YES_NO_VALS, { width: 90 }),

      // ── Pinned Right ──────────────────────────────────────
      {
        field: "final_status", headerName: "Final Status", width: 175,
        pinned: "right", editable: e,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: FINAL_STATUSES },
        cellRenderer: (p: ICellRendererParams) => p.value ? <StatusBadge value={p.value} /> : null,
        filter: true,
      },
      dateCol("doj", "Date of Joining", { pinned: "right", width: 115 }),

      // ── Admin: delete ─────────────────────────────────────
      ...(isAdmin ? [{
        headerName: "", width: 46, pinned: "right" as const,
        editable: false, sortable: false, filter: false, resizable: false,
        cellRenderer: (p: ICellRendererParams) =>
          p.data?.id ? (
            <button onClick={() => handleDelete(p.data.id)}
              className="text-red-400 hover:text-red-600 text-xs" title="Archive">✕</button>
          ) : null,
      }] : []),
    ];
  }, [canEdit, isAdmin, isManager, isRecruiter, siteMap, desigMap, sourceMap, recruiterMap,
      sites, designations, sources, recruiters, profile.id]);

  return (
    <div className="flex flex-col h-full">

      {/* ── Action toolbar ────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2 bg-white border-b flex-wrap flex-shrink-0">
        <div className="flex-1" />

        <button onClick={fetchCandidates} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw size={12} />
        </button>

        <button onClick={() => gridRef.current?.api.exportDataAsCsv({ fileName: "candidates.csv" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download size={12} /> Export
        </button>

        {isAdmin && (
          <button onClick={() => setShowColMgr(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Settings2 size={12} /> Columns
          </button>
        )}

        {canEdit && (
          <button onClick={addNewRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium">
            <Plus size={12} /> Add Row
          </button>
        )}
      </div>

      {/* ── Hint bar ─────────────────────────────────────── */}
      <div className="px-5 py-1.5 bg-brand-50 border-b border-brand-100 text-xs text-brand-700 flex items-center gap-4 flex-shrink-0">
        <span>💡 <strong>Click any cell</strong> to edit inline · <strong>Tab</strong> moves right · <strong>Enter</strong> saves · <strong>Esc</strong> cancels</span>
        <span>👁 <strong>Click the eye icon</strong> on any row to see full candidate details &amp; interview history</span>
        {isRecruiter && <span>🔒 Contact details (name/mobile/email) are locked after first save</span>}
      </div>

      {/* ── AG Grid ──────────────────────────────────────── */}
      <div className="flex-1 ag-theme-alpine" style={{ minHeight: 0 }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={colDefs}
          loading={loading}
          defaultColDef={{
            resizable: true,
            sortable: true,
            filter: true,
            minWidth: 70,
            editable: false,
            wrapHeaderText: true,
            autoHeaderHeight: true,
          }}
          onCellValueChanged={onCellValueChanged}
          onCellEditingStarted={onCellEditingStarted}
          onRowClicked={(e: RowClickedEvent) => {
            // Only open detail if not clicking a button/link
            const target = e.event?.target as HTMLElement;
            if (target?.tagName === "BUTTON" || target?.tagName === "A") return;
            if (e.data?.id) setSelected(e.data);
          }}
          editType="fullRow"
          stopEditingWhenCellsLoseFocus
          suppressRowClickSelection
          rowSelection="multiple"
          animateRows
          enableCellTextSelection
          rowClass="cursor-pointer"
          getRowStyle={p => !p.data?.id ? { background: "#fffbeb" } : undefined}
          onRowEditingStopped={e => {
            if (!e.data?.id) saveNewRow(e.data);
          }}
          domLayout="normal"
          onGridReady={(e: GridReadyEvent) => e.api.autoSizeColumn("name", false)}
        />
      </div>

      {/* ── Candidate detail panel ────────────────────────── */}
      {selected && (
        <CandidateDetailPanel
          candidateId={selected.id}
          profile={profile}
          sites={sites}
          designations={designations}
          sources={sources}
          recruiters={[]}
          onClose={() => setSelected(null)}
          onUpdated={() => { fetchCandidates(); setSelected(null); }}
        />
      )}

      {/* ── Column manager (admin) ───────────────────────── */}
      {showColMgr && (
        <ColumnManagerModal onClose={() => setShowColMgr(false)} />
      )}
    </div>
  );
}
