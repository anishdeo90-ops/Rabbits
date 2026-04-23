"use client";

import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet, ArrowRight, Download } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

const DB_COLUMNS = [
  { value: "skip",            label: "-- Skip --" },
  { value: "title",           label: "Job Title *" },
  { value: "designation_raw", label: "Designation" },
  { value: "site_raw",        label: "Site / Location" },
  { value: "headcount",       label: "Headcount (# openings)" },
  { value: "priority",        label: "Priority (low/normal/high/urgent)" },
  { value: "status",          label: "Status (open/on_hold/closed/filled)" },
  { value: "job_type",        label: "Type (internal/client)" },
  { value: "job_platform",    label: "Job Platform (LinkedIn/Indeed/etc.)" },
  { value: "min_salary",      label: "Min Salary (₹)" },
  { value: "max_salary",      label: "Max Salary (₹)" },
  { value: "salary_range",    label: "Salary Range (e.g. 50000-80000)" },
  { value: "opened_at",       label: "Opening Date" },
  { value: "target_doj",      label: "Target DOJ" },
  { value: "description",     label: "Job Description" },
  { value: "requirements",    label: "Requirements / Skills" },
  { value: "client_name",     label: "Client Name (client jobs)" },
];

const AUTO_MAP: Record<string, string> = {
  "job title": "title", "title": "title", "position": "title", "role": "title", "vacancy": "title",
  "designation": "designation_raw", "function": "designation_raw", "job function": "designation_raw", "department": "designation_raw",
  "location": "site_raw", "site": "site_raw", "office": "site_raw", "work location": "site_raw", "city": "site_raw",
  "headcount": "headcount", "openings": "headcount", "no of openings": "headcount", "number of openings": "headcount", "vacancies": "headcount",
  "priority": "priority", "urgency": "priority", "seniority": "priority", "seniority level": "priority",
  "status": "status", "job status": "status",
  "type": "job_type", "job type": "job_type", "employment type": "job_type",
  "job platform": "job_platform", "platform": "job_platform", "posted on": "job_platform", "source platform": "job_platform",
  "min salary": "min_salary", "min ctc": "min_salary", "salary min": "min_salary",
  "max salary": "max_salary", "max ctc": "max_salary", "salary max": "max_salary",
  "salary range": "salary_range",
  "opening date": "opened_at", "posted date": "opened_at", "date posted": "opened_at",
  "target doj": "target_doj", "target join date": "target_doj", "expected doj": "target_doj",
  "description": "description", "job description": "description",
  "requirements": "requirements", "skills required": "requirements",
  "client": "client_name", "client name": "client_name",
};

type Step = "upload" | "map" | "preview" | "done";

interface ImportResult { row: number; status: "created" | "error"; title?: string; error?: string; }

function downloadSample() {
  const wb = XLSX.utils.book_new();
  const headers = ["Job Title", "Designation", "Location", "Headcount", "Priority", "Status", "Type", "Job Platform", "Min Salary", "Max Salary", "Opening Date", "Target DOJ", "Job Description", "Requirements", "Client Name"];
  const sample = [
    ["Electrical Engineer", "Electrical Engineer", "Mumbai", 2, "high", "open", "internal", "LinkedIn", 50000, 80000, "2026-04-20", "2026-05-15", "We are looking for an experienced Electrical Engineer to join our Mumbai operations team.", "BE/BTech Electrical, 3+ years experience", ""],
    ["HR Manager", "HR Manager", "Delhi", 1, "normal", "open", "internal", "Indeed", 60000, 90000, "2026-04-20", "", "Manage end-to-end HR operations for the Delhi office.", "MBA HR, 5+ years", ""],
    ["Sales Executive", "Sales Executive", "Pune", 3, "urgent", "open", "client", "Naukri", 30000, 45000, "2026-04-18", "2026-05-01", "Drive B2B sales for client's manufacturing products.", "Graduate, 1-3 years field sales experience", "ABC Pvt Ltd"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws["!cols"] = headers.map((h, i) => ({ wch: i === 11 || i === 12 ? 40 : Math.max(h.length, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Jobs Import");
  XLSX.writeFile(wb, "HireRabbits_Jobs_Import_Sample.xlsx");
}

export default function JobImportPage() {
  const [step, setStep]             = useState<Step>("upload");
  const [headers, setHeaders]       = useState<string[]>([]);
  const [rawRows, setRawRows]       = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping]       = useState<Record<string, string>>({});
  const [importing, setImporting]   = useState(false);
  const [results, setResults]       = useState<ImportResult[]>([]);
  const [createdCount, setCreated]  = useState(0);
  const [dragOver, setDragOver]     = useState(false);

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!json.length) { toast.error("No rows found"); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRawRows(json);
      // Auto-map
      const autoMap: Record<string, string> = {};
      hdrs.forEach(h => {
        const key = h.toLowerCase().trim();
        if (AUTO_MAP[key]) autoMap[h] = AUTO_MAP[key];
        else autoMap[h] = "skip";
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsArrayBuffer(file);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  async function runImport() {
    const mappedRows = rawRows.map(row => {
      const out: Record<string, unknown> = {};
      headers.forEach(h => { if (mapping[h] !== "skip") out[h] = row[h]; });
      return out;
    });
    setImporting(true);
    try {
      const res = await fetch("/api/import/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows, columnMapping: mapping }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Import failed"); return; }
      setResults(json.results ?? []);
      setCreated(json.created ?? 0);
      setStep("done");
      toast.success(`${json.created} job${json.created !== 1 ? "s" : ""} imported!`);
    } finally { setImporting(false); }
  }

  const mappedCount = Object.values(mapping).filter(v => v !== "skip").length;
  const hasTitle    = Object.values(mapping).includes("title");

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import Jobs</h1>
          <p className="text-sm text-gray-400 mt-0.5">Bulk import jobs from Excel — LinkedIn / Indeed format supported</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadSample}
            className="flex items-center gap-2 text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
            <Download size={14} /> Sample File
          </button>
          <Link href="/jobs" className="text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
            ← Back to Jobs
          </Link>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3">
        {(["upload","map","preview","done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step === s ? "bg-brand-500 text-white" :
              ["upload","map","preview","done"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
            }`}>{["upload","map","preview","done"].indexOf(step) > i ? "✓" : i + 1}</div>
            <span className={`text-xs font-medium capitalize ${step === s ? "text-brand-600" : "text-gray-400"}`}>
              {s === "upload" ? "Upload" : s === "map" ? "Map Columns" : s === "preview" ? "Preview" : "Done"}
            </span>
            {i < 3 && <ArrowRight size={12} className="text-gray-300 ml-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${dragOver ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">Drag & drop your Excel file here</p>
            <p className="text-xs text-gray-400 mt-1">or</p>
            <label className="mt-3 inline-block cursor-pointer bg-brand-500 text-white text-sm px-5 py-2.5 rounded-lg font-semibold hover:bg-brand-600">
              Browse File
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }} />
            </label>
            <p className="text-xs text-gray-400 mt-3">.xlsx · .xls · .csv — any LinkedIn or Indeed export format</p>
          </div>

          {/* Format guide */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Supported column names</p>
            <div className="grid grid-cols-3 gap-1 text-xs text-blue-600">
              {["Job Title / Position / Role", "Location / Site / City", "Designation / Function", "Headcount / Openings", "Priority / Seniority Level", "Status (open / on_hold / filled)", "Min Salary / Max Salary", "Opening Date / Date Posted", "Target DOJ / Expected DOJ", "Job Description", "Requirements / Skills Required", "Client Name"].map(c => (
                <span key={c} className="bg-white border border-blue-100 rounded px-2 py-1">{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Column mapping */}
      {step === "map" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Map Excel columns → Job fields</p>
              <span className="text-xs text-gray-400">{rawRows.length} rows · {mappedCount} columns mapped</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="text-sm text-gray-700 w-52 flex-shrink-0 font-mono truncate" title={h}>{h}</span>
                  <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
                  <select
                    value={mapping[h] ?? "skip"}
                    onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    {DB_COLUMNS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">
                    {String(rawRows[0]?.[h] ?? "").slice(0, 20)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {!hasTitle && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={16} /> Map at least one column to <strong>Job Title *</strong> to continue
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep("preview")} disabled={!hasTitle}
              className="bg-brand-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-50">
              Preview Import →
            </button>
            <button onClick={() => setStep("upload")} className="border border-gray-200 px-5 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="text-xs w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                  {headers.filter(h => mapping[h] && mapping[h] !== "skip").map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                      {DB_COLUMNS.find(c => c.value === mapping[h])?.label ?? mapping[h]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, 10).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    {headers.filter(h => mapping[h] && mapping[h] !== "skip").map(h => (
                      <td key={h} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                        {String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rawRows.length > 10 && <p className="text-xs text-gray-400">Showing 10 of {rawRows.length} rows</p>}

          <div className="flex gap-3">
            <button onClick={runImport} disabled={importing}
              className="bg-brand-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2">
              {importing ? <><span className="animate-spin">⟳</span> Importing…</> : <><Upload size={14} /> Import {rawRows.length} Jobs</>}
            </button>
            <button onClick={() => setStep("map")} className="border border-gray-200 px-5 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Done */}
      {step === "done" && (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${createdCount === rawRows.length ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            {createdCount === rawRows.length
              ? <CheckCircle size={20} className="text-green-500" />
              : <AlertTriangle size={20} className="text-amber-500" />}
            <div>
              <p className="font-semibold text-sm text-gray-800">{createdCount} of {rawRows.length} jobs imported successfully</p>
              {createdCount < rawRows.length && <p className="text-xs text-gray-500 mt-0.5">{rawRows.length - createdCount} rows had errors — see below</p>}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Row</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Title</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(r => (
                  <tr key={r.row} className={r.status === "error" ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 text-gray-400">{r.row}</td>
                    <td className="px-3 py-2 text-gray-700 font-medium">{r.title ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.status === "created"
                        ? <span className="text-green-600 font-medium">✓ Created</span>
                        : <span className="text-red-500">{r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Link href="/jobs" className="bg-brand-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600">
              View Jobs →
            </Link>
            <button onClick={() => { setStep("upload"); setResults([]); setHeaders([]); setRawRows([]); }}
              className="border border-gray-200 px-5 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
