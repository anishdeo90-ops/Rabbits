"use client";

import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import {
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Upload,
  Database, Link2, Cloud, FileSpreadsheet, Clock,
} from "lucide-react";

// Auto-map common Excel header variants to DB columns (mirrors /import page)
const AUTO_MAP: Record<string, string> = {
  "hr name": "hr_name_raw", "month": "month",
  "applications received date": "application_date", "link": "naukri_link",
  "name of applicant": "name", "candidate name": "name",
  "current designation": "current_designation", "designation": "designation_raw",
  "site recruited for": "site_raw", "site": "site_raw",
  "mobile no": "mobile", "mobile": "mobile",
  "email id": "email", "email": "email",
  "candidate current location": "current_location", "location": "current_location",
  "source": "source_raw", "present salary": "present_salary",
  "expected salary": "expected_salary", "tel int date": "tel_int_date",
  "telephonic int remarks (recruiter)": "tel_int_remarks",
  "hr manager remarks": "hr_manager_remarks",
  "shortlisted for personal interview": "shortlisted_for_pi",
  "pi 1 date": "pi1_date", "pi 1 taken by": "pi1_taken_by", "pi 1 remarks": "pi1_remarks",
  "pi 2 date": "pi2_date", "pi 2 taken by": "pi2_taken_by", "pi 2 remarks": "pi2_remarks",
  "guarantee form issue date": "gf_issue_date", "guarantee form received date": "gf_received_date",
  "remarks": "remarks", "final status": "final_status", "final action": "final_action",
  "file no": "file_no", "doj": "doj", "hard copy y/n": "hard_copy",
};

interface SyncConfig {
  id?: string;
  recruiter_id: string;
  sheet_id: string;
  sheet_name: string;
  sync_direction: "to_sheet" | "from_sheet" | "both";
  auto_sync: boolean;
  sync_frequency: "manual" | "hourly" | "daily";
  last_synced_at?: string;
  last_sync_status?: "success" | "error" | "partial";
  last_sync_count?: number;
  error_message?: string;
}

interface SyncConflict {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  field_name: string;
  db_value?: string;
  sheet_value?: string;
  created_at: string;
  resolution: "pending" | "keep_db" | "keep_sheet" | "manual";
}

interface AllConfig {
  recruiter_id: string;
  sheet_id?: string;
  auto_sync: boolean;
  last_synced_at?: string;
  last_sync_status?: string;
  recruiter: { id: string; name: string; email: string };
}

interface BackupLog {
  id: string;
  created_at: string;
  row_count: number;
  status: "success" | "error";
  filename?: string;
}

export default function SyncPage() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [allConfigs, setAllConfigs] = useState<AllConfig[]>([]);
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [profile, setProfile] = useState<{ role: string; google_account_email?: string; google_sheet_id?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted?: number; updated?: number; errors?: { row: number; message: string }[]; error?: string } | null>(null);

  // Form state for sync config
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("Master");
  const [syncDirection, setSyncDirection] = useState<"to_sheet" | "from_sheet" | "both">("both");
  const [autoSync, setAutoSync] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState<"manual" | "hourly" | "daily">("daily");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [syncRes, profileRes, logsRes] = await Promise.all([
        fetch("/api/sync").then(r => r.json()),
        fetch("/api/users/me").then(r => r.json()).catch(() => ({ data: null })),
        fetch("/api/backup-logs").then(r => r.json()).catch(() => ({ data: [] })),
      ]);

      if (syncRes.config) {
        setConfig(syncRes.config);
        setSheetId(syncRes.config.sheet_id ?? "");
        setSheetName(syncRes.config.sheet_name ?? "Master");
        setSyncDirection(syncRes.config.sync_direction ?? "both");
        setAutoSync(syncRes.config.auto_sync ?? false);
        setSyncFrequency(syncRes.config.sync_frequency ?? "daily");
      }
      setConflicts(syncRes.conflicts ?? []);
      setAllConfigs(syncRes.all_configs ?? []);
      setProfile(profileRes.data ?? null);
      setBackupLogs(logsRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_id: sheetId, sheet_name: sheetName, sync_direction: syncDirection, auto_sync: autoSync, sync_frequency: syncFrequency }),
      });
      const json = await res.json();
      if (json.data) setConfig(json.data);
    } finally {
      setSaving(false);
    }
  }

  async function resolveConflict(id: string, resolution: "keep_db" | "keep_sheet") {
    const res = await fetch("/api/sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conflict_id: id, resolution }),
    });
    if (res.ok) {
      setConflicts(prev => prev.filter(c => c.id !== id));
    }
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      const json = await res.json();
      if (json.error) toast.error("Sync failed: " + json.error);
      else { toast.success("Sync completed"); await fetchData(); }
    } catch {
      toast.error("Sync trigger failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;

    // Validate file size (max 5 MB)
    if (importFile.size > 5 * 1024 * 1024) {
      toast.error("File too large — max 5 MB");
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      // Parse file client-side
      const data = await importFile.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", cellDates: false });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      if (!json.length) { toast.error("File is empty or unreadable"); return; }

      // Build auto column mapping
      const headers = Object.keys(json[0]);
      const columnMapping: Record<string, string> = {};
      for (const h of headers) {
        columnMapping[h] = AUTO_MAP[h.toLowerCase().trim()] ?? "skip";
      }

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: json, columnMapping }),
      });
      const result = await res.json();
      setImportResult(result);
      if (result.inserted > 0) toast.success(`${result.inserted} candidates imported`);
      else if (result.error) toast.error(result.error);
    } catch {
      toast.error("Failed to parse file");
    } finally {
      setImporting(false);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) +
      " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  const statusBadge = (s?: string) => {
    if (!s) return "bg-gray-100 text-gray-500";
    if (s === "success") return "bg-green-100 text-green-700";
    if (s === "error") return "bg-red-100 text-red-600";
    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import & Sync</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage Google Sheets sync, Excel imports, and data backups</p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing || !config?.sheet_id}
          className="flex items-center gap-2 bg-brand-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {/* Protected fields notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <strong>Protected fields</strong> (name, mobile, email, salary info) cannot be overwritten by sheet sync.
          Changes to these fields in Google Sheets will be flagged as conflicts and require admin approval.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* LEFT: Google Sheets Config */}
        <div className="col-span-2 space-y-5">
          {/* Google Account */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                  <Link2 size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">Google Account</h3>
                  <p className="text-xs text-gray-400">Connect for Sheets sync, Drive CV storage & Calendar</p>
                </div>
              </div>
              {profile?.google_account_email ? (
                <span className="text-xs bg-green-100 text-green-700 font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} /> Connected
                </span>
              ) : (
                <button
                  onClick={() => toast("Google OAuth coming soon — contact admin to connect your account", { icon: "ℹ️" })}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
                  Connect Google
                </button>
              )}
            </div>
            {profile?.google_account_email && (
              <div className="bg-gray-50 rounded-lg px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{profile.google_account_email}</p>
                  <p className="text-xs text-gray-400">Google Workspace account</p>
                </div>
                <button
                  onClick={() => toast("To disconnect, contact your admin to revoke Google access", { icon: "ℹ️" })}
                  className="text-xs text-red-500 hover:text-red-600 font-medium">Disconnect</button>
              </div>
            )}
          </div>

          {/* Sync Config */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
                <FileSpreadsheet size={16} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Google Sheets Sync</h3>
                {config?.last_synced_at && (
                  <p className="text-xs text-gray-400">Last synced: {formatDate(config.last_synced_at)}</p>
                )}
              </div>
              {config && (
                <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadge(config.last_sync_status)}`}>
                  {config.last_sync_status ?? "Never synced"}
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Google Sheet ID</label>
                <input
                  type="text"
                  value={sheetId}
                  onChange={e => setSheetId(e.target.value)}
                  placeholder="Paste Sheet ID from URL (e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Found in the Google Sheets URL between /d/ and /edit</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sheet Tab Name</label>
                  <input
                    type="text"
                    value={sheetName}
                    onChange={e => setSheetName(e.target.value)}
                    placeholder="Master"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sync Direction</label>
                  <select
                    value={syncDirection}
                    onChange={e => setSyncDirection(e.target.value as typeof syncDirection)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="both">Two-way (DB ↔ Sheet)</option>
                    <option value="to_sheet">Export only (DB → Sheet)</option>
                    <option value="from_sheet">Import only (Sheet → DB)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Auto Sync</label>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => setAutoSync(!autoSync)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSync ? "bg-brand-500" : "bg-gray-200"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSync ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className="text-sm text-gray-600">{autoSync ? "Enabled" : "Disabled"}</span>
                  </div>
                </div>
                {autoSync && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Frequency</label>
                    <select
                      value={syncFrequency}
                      onChange={e => setSyncFrequency(e.target.value as typeof syncFrequency)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="manual">Manual only</option>
                      <option value="hourly">Every hour</option>
                      <option value="daily">Daily (midnight)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={saveConfig}
                  disabled={saving || !sheetId}
                  className="bg-brand-500 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Config"}
                </button>
              </div>
            </div>
          </div>

          {/* Conflicts */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <h3 className="font-semibold text-gray-800 text-sm">Sync Conflicts</h3>
                {conflicts.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {conflicts.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">Choose which version to keep for each conflict</p>
            </div>
            {loading ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : conflicts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle size={24} className="mx-auto text-green-400 mb-2" />
                <p className="text-sm text-gray-500">No pending conflicts</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Candidate", "Field", "DB Value", "Sheet Value", "Actions"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{c.candidate_name ?? c.candidate_id.slice(0, 8)}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{c.field_name}</td>
                        <td className="px-4 py-2.5 text-blue-700 font-medium">{c.db_value ?? "—"}</td>
                        <td className="px-4 py-2.5 text-brand-600 font-medium">{c.sheet_value ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => resolveConflict(c.id, "keep_db")}
                              className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-medium hover:bg-blue-100"
                            >
                              Keep DB
                            </button>
                            <button
                              onClick={() => resolveConflict(c.id, "keep_sheet")}
                              className="text-xs bg-brand-50 text-brand-700 px-2.5 py-1 rounded-lg font-medium hover:bg-brand-100"
                            >
                              Keep Sheet
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Admin: All Recruiter Sync Status */}
          {allConfigs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">All Recruiters — Sync Status</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Recruiter","Sheet Connected","Auto Sync","Last Synced","Status"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allConfigs.map((ac) => (
                      <tr key={ac.recruiter_id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{ac.recruiter?.name}</td>
                        <td className="px-4 py-2.5">
                          {ac.sheet_id
                            ? <span className="text-green-600 text-xs font-semibold flex items-center gap-1"><CheckCircle size={12} /> Yes</span>
                            : <span className="text-gray-400 text-xs flex items-center gap-1"><XCircle size={12} /> No</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold ${ac.auto_sync ? "text-green-700" : "text-gray-400"}`}>
                            {ac.auto_sync ? "On" : "Off"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDate(ac.last_synced_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(ac.last_sync_status)}`}>
                            {ac.last_sync_status ?? "Never"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Import + Backup */}
        <div className="space-y-5">
          {/* Excel Import */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                <Upload size={16} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Excel Import</h3>
                <p className="text-xs text-gray-400">Upload .xlsx / .csv file</p>
              </div>
            </div>

            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors"
              onClick={() => document.getElementById("import-file")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImportFile(f); }}
            >
              <Upload size={24} className="mx-auto text-gray-300 mb-2" />
              {importFile ? (
                <div>
                  <p className="text-sm font-semibold text-gray-800">{importFile.name}</p>
                  <p className="text-xs text-gray-400">{(importFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500">Drop file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx, .csv — max 5 MB</p>
                </div>
              )}
            </div>
            <input id="import-file" type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />

            {importFile && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="mt-3 w-full bg-brand-500 text-white text-sm py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Start Import"}
              </button>
            )}

            {importResult && (
              <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${importResult.error || importResult.errors?.length ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                {importResult.error && <p className="text-red-600 font-medium">{importResult.error}</p>}
                {importResult.inserted != null && (
                  <p className="text-green-700 font-medium">{importResult.inserted} candidates imported</p>
                )}
                {importResult.errors?.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-red-600 text-xs mt-1">Row {e.row}: {e.message}</p>
                ))}
                {(importResult.errors?.length ?? 0) > 5 && (
                  <p className="text-red-500 text-xs mt-1">…and {(importResult.errors?.length ?? 0) - 5} more. Use the full <a href="/import" className="underline">Import page</a> for details.</p>
                )}
              </div>
            )}
          </div>

          {/* Backup */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <Database size={16} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">Daily Backup</h3>
                <p className="text-xs text-gray-400">Auto-backup to Google Drive</p>
              </div>
            </div>

            <button
              onClick={async () => {
                const res = await fetch("/api/backup", { method: "POST" });
                if (res.ok) { toast.success("Backup triggered"); fetchData(); }
                else toast.error("Backup failed");
              }}
              className="w-full bg-indigo-50 text-indigo-700 text-sm py-2 rounded-lg font-medium hover:bg-indigo-100 border border-indigo-200 flex items-center justify-center gap-2"
            >
              <Cloud size={15} />
              Trigger Manual Backup
            </button>

            <div className="mt-4 space-y-2">
              {backupLogs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">No backup history</p>
              ) : backupLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {log.status === "success"
                      ? <CheckCircle size={12} className="text-green-500" />
                      : <XCircle size={12} className="text-red-500" />
                    }
                    <span className="text-gray-600">{formatDate(log.created_at)}</span>
                  </div>
                  <span className="text-gray-400">{log.row_count?.toLocaleString()} rows</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sync Stats */}
          {config && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800 text-sm">Last Sync Summary</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={`font-semibold ${config.last_sync_status === "success" ? "text-green-700" : config.last_sync_status === "error" ? "text-red-600" : "text-gray-400"}`}>
                    {config.last_sync_status ?? "Never run"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Records synced</span>
                  <span className="font-semibold text-gray-800">{config.last_sync_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last run</span>
                  <span className="text-gray-600 text-xs">{formatDate(config.last_synced_at)}</span>
                </div>
                {config.error_message && (
                  <div className="bg-red-50 rounded-lg px-3 py-2 mt-2">
                    <p className="text-xs text-red-600">{config.error_message}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
