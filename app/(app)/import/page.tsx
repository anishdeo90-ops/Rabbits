"use client";

import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet, ArrowRight, X } from "lucide-react";
import toast from "react-hot-toast";

// Expected DB column options for mapping
const DB_COLUMNS = [
  { value: "skip",                         label: "-- Skip this column --" },
  { value: "name",                         label: "Candidate Name *" },
  { value: "hr_name_raw",                  label: "Recruiter Name" },
  { value: "month",                        label: "Month" },
  { value: "application_date",             label: "Application Date" },
  { value: "cv_drive_url",                  label: "CV Link (Google Drive / file URL)" },
  { value: "naukri_profile_url",            label: "Profile Link (Naukri / LinkedIn)" },
  { value: "current_designation",          label: "Current Designation" },
  { value: "designation_raw",              label: "Applied For (Designation)" },
  { value: "site_raw",                     label: "Site" },
  { value: "mobile",                       label: "Mobile" },
  { value: "email",                        label: "Email" },
  { value: "suitable_other_position",      label: "Suitable Other Position" },
  { value: "current_location",             label: "Current Location" },
  { value: "source_raw",                   label: "Source" },
  { value: "present_salary",               label: "Present Salary" },
  { value: "expected_salary",              label: "Expected Salary" },
  { value: "notice_period_days",           label: "Notice Period (days)" },
  { value: "google_form_sent",             label: "Google Form Sent" },
  { value: "google_form_received",         label: "Google Form Received" },
  { value: "processed_by_hr",              label: "Processed By HR" },
  { value: "shortlist_by_hr",              label: "Shortlist By HR" },
  { value: "tel_int_date",                 label: "Tel Int Date" },
  { value: "tel_int_remarks",              label: "Tel Int Remarks" },
  { value: "hr_manager_remarks",           label: "HR Manager Remarks" },
  { value: "remarks_before_pi",            label: "Remarks Before PI" },
  { value: "mgmt_remarks_before_pi",       label: "Mgmt Remarks Before PI" },
  { value: "shortlisted_for_pi",           label: "Shortlisted For PI" },
  { value: "pi1_date",                     label: "PI 1 Date" },
  { value: "pi1_taken_by",                 label: "PI 1 Taken By" },
  { value: "pi1_remarks",                  label: "PI 1 Remarks" },
  { value: "pi2_date",                     label: "PI 2 Date" },
  { value: "pi2_taken_by",                 label: "PI 2 Taken By" },
  { value: "pi2_remarks",                  label: "PI 2 Remarks" },
  { value: "pi3_date",                     label: "PI 3 Date" },
  { value: "pi3_taken_by",                 label: "PI 3 Taken By" },
  { value: "pi3_remarks",                  label: "PI 3 Remarks" },
  { value: "gf_issued",                    label: "GF Issued Y/N" },
  { value: "shortlisted_by_mgmt",          label: "Shortlisted By Mgmt" },
  { value: "gf_issue_date",               label: "GF Issue Date" },
  { value: "gf_received_date",            label: "GF Received Date" },
  { value: "gf_verified",                 label: "GF Verified" },
  { value: "gf_verification_report",      label: "GF Verification Report" },
  { value: "addr_verification_shared",    label: "Address Verif Shared" },
  { value: "addr_verification_received",  label: "Address Verif Received" },
  { value: "remarks",                     label: "Remarks" },
  { value: "final_status",               label: "Final Status" },
  { value: "final_action",               label: "Final Action" },
  { value: "file_no",                    label: "File No" },
  { value: "doj",                        label: "Date of Joining" },
  { value: "hard_copy",                  label: "Hard Copy Y/N" },
  { value: "referred_by",               label: "Referred By" },
];

// Auto-map common Excel header variants to DB columns
const AUTO_MAP: Record<string, string> = {
  "hr name":                              "hr_name_raw",
  "month":                                "month",
  "applications received date":           "application_date",
  "app. date":                            "application_date",
  "application date":                     "application_date",
  "link":                                 "naukri_profile_url",
  "cv link":                              "cv_drive_url",
  "cv":                                   "cv_drive_url",
  "resume link":                          "cv_drive_url",
  "google drive":                         "cv_drive_url",
  "drive link":                           "cv_drive_url",
  "profile link":                         "naukri_profile_url",
  "naukri link":                          "naukri_profile_url",
  "linkedin":                             "naukri_profile_url",
  "name of applicant":                    "name",
  "candidate name":                       "name",
  "current designation":                  "current_designation",
  "designation":                          "designation_raw",
  "designation (recruited for)":          "designation_raw",
  "contract required for":                "site_raw",
  "site recruited for":                   "site_raw",
  "site":                                 "site_raw",
  "mobile no":                            "mobile",
  "mobile":                               "mobile",
  "email id":                             "email",
  "email":                                "email",
  "suitable for other position":          "suitable_other_position",
  "candidate current location":           "current_location",
  "location":                             "current_location",
  "source":                               "source_raw",
  "present salary (ctc pm)":             "present_salary",
  "present salary":                       "present_salary",
  "expected salary":                      "expected_salary",
  "google forms sent":                    "google_form_sent",
  "google form sent":                     "google_form_sent",
  "google form received":                 "google_form_received",
  "processed by hr":                      "processed_by_hr",
  "shortlist by hr":                      "shortlist_by_hr",
  "tel int date":                         "tel_int_date",
  "telephonic int remarks (recruiter)":   "tel_int_remarks",
  "telephonic int remarks(recruiter)":    "tel_int_remarks",
  "hr manager remarks":                   "hr_manager_remarks",
  "tele int by hod name & comments":      "remarks_before_pi",
  "remarks before pi":                    "remarks_before_pi",
  "mgmt remarks before pi":               "mgmt_remarks_before_pi",
  "shortlisted for personal interview":   "shortlisted_for_pi",
  "pi 1 date":                            "pi1_date",
  "pi 1 taken by":                        "pi1_taken_by",
  "pi 1 remarks":                         "pi1_remarks",
  "pi 2 date":                            "pi2_date",
  "pi 2 taken by":                        "pi2_taken_by",
  "pi 2 remarks":                         "pi2_remarks",
  "pi 3 date":                            "pi3_date",
  "pi 3 taken by":                        "pi3_taken_by",
  "pi 3 remarks":                         "pi3_remarks",
  "notice period":                        "notice_period_days",
  "notice period (days)":                 "notice_period_days",
  "notice":                               "notice_period_days",
  "file no.":                             "file_no",
  "gf issued y/n":                        "gf_issued",
  "shortlisted by mgmt":                  "shortlisted_by_mgmt",
  "management final decision":            "shortlisted_by_mgmt",
  "guarantee form issue date":            "gf_issue_date",
  "guarantee form received date":         "gf_received_date",
  "gaurantee form issue date":            "gf_issue_date",
  "gautantee form received date":         "gf_received_date",
  "gf verified":                          "gf_verified",
  "gf verification report":              "gf_verification_report",
  "date of address verification letter shared":    "addr_verification_shared",
  "date of address verification letter received":  "addr_verification_received",
  "remarks":                              "remarks",
  "final status":                         "final_status",
  "final action":                         "final_action",
  "file no":                              "file_no",
  "doj (date of joining)":               "doj",
  "doj":                                  "doj",
  "hard copy y/n":                        "hard_copy",
  "referred by":                          "referred_by",
};

type Step = "upload" | "map" | "preview" | "done";

interface ImportResult { inserted: number; merged?: number; errors: { row: number; message: string }[]; total: number; }

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  function parseFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: "binary", cellDates: false });
      setWorkbook(wb);
      // Exclude hidden / veryHidden sheets (e.g. _Lists validation sheet)
      const visibleSheets = wb.SheetNames.filter((_, i) =>
        (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) === 0
      );
      const availableSheets = visibleSheets.length > 0 ? visibleSheets : wb.SheetNames;
      setSheets(availableSheets);
      // Default: pick visible sheet with most rows
      const best = availableSheets.reduce((best, name) => {
        const r = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        const br = XLSX.utils.sheet_to_json(wb.Sheets[best], { defval: "" });
        return (r as unknown[]).length > (br as unknown[]).length ? name : best;
      }, availableSheets[0]);
      loadSheet(wb, best);
    };
    reader.readAsBinaryString(file);
  }

  function loadSheet(wb: XLSX.WorkBook, sheetName: string) {
    setActiveSheet(sheetName);
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (!json.length) { toast.error("Sheet is empty"); return; }

    // Find actual header row (look for "NAME OF APPLICANT" or "name" in first 5 rows)
    let dataRows = json;
    for (let i = 0; i < Math.min(5, json.length); i++) {
      const row = json[i];
      const vals = Object.values(row).map((v) => String(v).toLowerCase());
      if (vals.some((v) => v.includes("name") || v.includes("applicant") || v.includes("mobile"))) {
        // This row is the header row — use its values as headers and skip it
        const newHeaders = Object.values(row).map((v) => String(v).trim()).filter(Boolean);
        const headerKeys = Object.keys(row);
        dataRows = json.slice(i + 1).map((dataRow) => {
          const out: Record<string, unknown> = {};
          headerKeys.forEach((key, idx) => { out[newHeaders[idx] ?? key] = dataRow[key]; });
          return out;
        });
        break;
      }
    }

    const hdrs = dataRows.length > 0 ? Object.keys(dataRows[0]) : [];
    setHeaders(hdrs);
    setRawRows(dataRows.filter((r) => Object.values(r).some((v) => v !== "")));

    // Auto-map
    const autoMapping: Record<string, string> = {};
    for (const h of hdrs) {
      const key = h.toLowerCase().trim();
      autoMapping[h] = AUTO_MAP[key] ?? "skip";
    }
    setMapping(autoMapping);
    setStep("map");
  }

  async function handleImport() {
    setImporting(true);
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rawRows, columnMapping: mapping }),
    });
    const json = await res.json();
    setResult(json);
    setStep("done");
    setImporting(false);
  }

  function reset() {
    setStep("upload"); setFileName(""); setSheets([]); setActiveSheet("");
    setRawRows([]); setHeaders([]); setMapping({}); setResult(null); setWorkbook(null);
  }

  const mappedCount = Object.values(mapping).filter((v) => v !== "skip").length;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import from Excel / CSV</h1>
          <p className="text-sm text-gray-500 mt-1">Upload your candidate data file to bulk-import records</p>
        </div>
        <a
          href="/api/import/sample"
          download
          className="flex items-center gap-1.5 text-xs border border-brand-300 text-brand-600 px-3 py-1.5 rounded-lg hover:bg-brand-50 font-medium"
        >
          ↓ Download Sample Format
        </a>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {["upload", "map", "preview", "done"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
              step === s ? "bg-brand-600 text-white" :
              ["upload","map","preview","done"].indexOf(step) > i ? "bg-green-500 text-white" :
              "bg-gray-200 text-gray-500"
            }`}>
              {["upload","map","preview","done"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            <span className={`text-sm ${step === s ? "font-semibold text-gray-900" : "text-gray-400"} capitalize`}>{s}</span>
            {i < 3 && <ArrowRight size={14} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Upload */}
      {step === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center hover:border-brand-400 transition-colors cursor-pointer"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-700">Drop your Excel file here</p>
          <p className="text-sm text-gray-400 mt-1">or click to browse — .xlsx / .xls files accepted</p>
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }}
          />
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">
            <Upload size={14} /> Choose File
          </div>
        </div>
      )}

      {/* STEP 2: Column mapping */}
      {step === "map" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">{fileName}</p>
                <p className="text-sm text-gray-500">{rawRows.length} rows detected</p>
              </div>
              {sheets.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Sheet:</span>
                  <select
                    value={activeSheet}
                    onChange={(e) => workbook && loadSheet(workbook, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Map each Excel column to the correct ATS field. Unmapped columns are skipped.
              <span className="ml-2 text-brand-600 font-medium">{mappedCount}/{headers.length} mapped</span>
            </p>

            <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate" title={h}>{h}</p>
                  </div>
                  <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
                  <select
                    value={mapping[h] ?? "skip"}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                    className={`text-xs border rounded px-2 py-1 w-52 flex-shrink-0 ${
                      mapping[h] && mapping[h] !== "skip"
                        ? "border-green-400 bg-green-50"
                        : "border-gray-300"
                    }`}
                  >
                    {DB_COLUMNS.map((col) => (
                      <option key={col.value} value={col.value}>{col.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!Object.values(mapping).some((v) => v === "name")}
              className="px-5 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Preview */}
      {step === "preview" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Ready to import</h2>
            <p className="text-sm text-gray-500 mb-4">
              {rawRows.length} rows from <strong>{fileName}</strong> — sheet <strong>{activeSheet}</strong>
            </p>

            {/* Preview table (first 10 rows) */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="text-xs w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Row</th>
                    {headers.filter((h) => mapping[h] && mapping[h] !== "skip").map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                        {DB_COLUMNS.find((c) => c.value === mapping[h])?.label ?? mapping[h]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      {headers.filter((h) => mapping[h] && mapping[h] !== "skip").map((h) => (
                        <td key={h} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[160px] truncate">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rawRows.length > 10 && (
              <p className="text-xs text-gray-400 mt-2">Showing 10 of {rawRows.length} rows</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("map")} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 font-medium"
            >
              {importing ? "Importing…" : `Import ${rawRows.length} Records`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === "done" && result && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            {result.inserted > 0 ? (
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
            ) : (
              <AlertTriangle size={48} className="mx-auto text-brand-500 mb-4" />
            )}
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {result.inserted} of {result.total} records imported
            </h2>
            {(result.merged ?? 0) > 0 && (
              <p className="text-sm text-blue-600">{result.merged} existing candidate{result.merged === 1 ? "" : "s"} updated with missing data from this import</p>
            )}
            {result.errors.length > 0 && (
              <p className="text-sm text-brand-600">{result.errors.length} rows had errors and were skipped</p>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-brand-50 rounded-xl border border-brand-200 p-5">
              <h3 className="text-sm font-semibold text-brand-800 mb-3">Skipped rows</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-brand-700">Row {e.row}: {e.message}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              Import Another File
            </button>
            <a href="/candidates"
              className="px-5 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              View Candidates →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
