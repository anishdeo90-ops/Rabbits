"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, Edit, Lock, Mail, MessageSquare, Play, Plus, Save, Settings, Trash2, X, Zap } from "lucide-react";
import toast from "react-hot-toast";
import type { AutomationRule, AutomationRun, AutomationSettings, CommunicationLog, MessageTemplate, Profile } from "@/lib/types";
import { KANBAN_STAGES } from "@/lib/types";

type Tab = "rules" | "templates" | "history" | "settings";

const BLANK_TEMPLATE: Partial<MessageTemplate> = {
  name: "",
  channel: "whatsapp",
  subject: "",
  body: "",
  variables: [],
  category: "custom",
  is_active: true,
};

const BLANK_RULE: Partial<AutomationRule> = {
  name: "",
  description: "",
  is_active: true,
  trigger_type: "stage_change",
  conditions: { stage: "Sourced" },
  action_type: "send_candidate_message",
  action_config: { channel: "whatsapp" },
  delay_hours: 0,
  max_per_candidate: 5,
  cooldown_hours: 48,
  sort_order: 100,
};

const VARIABLES = ["candidate_name","recruiter_name","hr_manager_name","job_title","designation","site","stage","interview_date","interview_time","interview_link","interview_round","offered_ctc","doj","company_name"];

function channelIcon(channel?: string | null) {
  return channel === "email" ? <Mail size={14} /> : <MessageSquare size={14} />;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data ?? json;
}

export default function AutomationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("rules");
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [settings, setSettings] = useState<Partial<AutomationSettings>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Partial<MessageTemplate> | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [logFilters, setLogFilters] = useState({ channel: "", status: "" });
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const me = await jsonFetch<Profile>("/api/users/me");
      if (!["admin", "hr_manager"].includes(me.role)) {
        toast.error("Access denied");
        router.push("/");
        return;
      }
      setProfile(me);
      const [r, t, s] = await Promise.all([
        jsonFetch<AutomationRule[]>("/api/automation/rules"),
        jsonFetch<MessageTemplate[]>("/api/automation/templates"),
        jsonFetch<AutomationSettings>("/api/automation/settings"),
      ]);
      setRules(r); setTemplates(t); setSettings(s);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load automation";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadHistory = useCallback(async () => {
    const qs = new URLSearchParams();
    if (logFilters.channel) qs.set("channel", logFilters.channel);
    if (logFilters.status) qs.set("status", logFilters.status);
    const [r, l] = await Promise.all([
      jsonFetch<AutomationRun[]>("/api/automation/runs"),
      jsonFetch<CommunicationLog[]>(`/api/automation/logs?${qs.toString()}`),
    ]);
    setRuns(r); setLogs(l);
  }, [logFilters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "history") loadHistory().catch(() => toast.error("Failed to load history")); }, [tab, loadHistory]);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  async function saveTemplate() {
    if (!editingTemplate?.name || !editingTemplate.body) return toast.error("Name and body are required");
    const isEdit = Boolean(editingTemplate.id);
    await jsonFetch(`/api/automation/templates${isEdit ? `/${editingTemplate.id}` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingTemplate),
    });
    toast.success("Template saved");
    setEditingTemplate(null);
    await load();
  }

  async function saveRule() {
    if (!editingRule?.name) return toast.error("Rule name is required");
    const isEdit = Boolean(editingRule.id);
    await jsonFetch(`/api/automation/rules${isEdit ? `/${editingRule.id}` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingRule),
    });
    toast.success("Rule saved");
    setEditingRule(null);
    await load();
  }

  async function toggleRule(rule: AutomationRule) {
    await jsonFetch(`/api/automation/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    await load();
  }

  async function deleteRule(rule: AutomationRule) {
    if (!confirm(`Delete ${rule.name}? Pending follow-ups for this rule will be cancelled.`)) return;
    await jsonFetch(`/api/automation/rules/${rule.id}`, { method: "DELETE" });
    toast.success("Rule deleted");
    await load();
  }

  async function deleteTemplate(template: MessageTemplate) {
    if (template.is_system) return;
    if (!confirm(`Disable ${template.name}?`)) return;
    await jsonFetch(`/api/automation/templates/${template.id}`, { method: "DELETE" });
    toast.success("Template disabled");
    await load();
  }

  async function saveSettings() {
    await jsonFetch("/api/automation/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    toast.success("Settings saved");
    await load();
  }

  async function runDryRun() {
    try {
      const result = await jsonFetch<{ evaluated: number; sent: number; skipped: number; failed: number }>("/api/automation/run?mode=dry_run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry_run" }),
      });
      toast.success(`Dry run: ${result.evaluated} evaluated, ${result.sent} logged`);
      if (tab === "history") await loadHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dry run failed");
    }
  }

  async function testProvider(channel: "whatsapp" | "email") {
    if (!testTo) return toast.error("Enter a test recipient");
    await jsonFetch("/api/automation/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, to: testTo }),
    });
    toast.success("Test sent");
  }

  if (loading || !profile) return <div className="p-6 text-sm text-gray-500">Loading automation...</div>;

  if (loadError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Automation failed to load</p>
          <p className="mt-1">{loadError}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-500 text-white flex items-center justify-center"><Zap size={18} /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Automation</h1>
          <p className="text-xs text-gray-500">Follow-up rules, templates, run history, and delivery settings</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={runDryRun} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
            <Play size={14} /> Run Now
          </button>
        </div>
      </div>

      {!settings.is_live && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          DRY RUN MODE - provider APIs are not called until Live Mode is enabled.
        </div>
      )}

      <div className="border-b border-gray-200">
        {[
          ["rules", "Rules"],
          ["templates", "Templates"],
          ["history", "Run History"],
          ["settings", "Settings"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setEditingRule({ ...BLANK_RULE })} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
              <Plus size={14} /> New Rule
            </button>
          </div>
          <div className="grid gap-3">
            {rules.map((rule) => {
              const template = rule.template_id ? templateById.get(rule.template_id) : null;
              const channel = String(rule.action_config?.channel ?? template?.channel ?? "");
              return (
                <div key={rule.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleRule(rule)} className={`h-6 w-11 rounded-full p-0.5 transition-colors ${rule.is_active ? "bg-brand-500" : "bg-gray-300"}`}>
                      <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${rule.is_active ? "translate-x-5" : ""}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{rule.trigger_type}</span>
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{rule.action_type}</span>
                        {channel && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{channelIcon(channel)} {channel}</span>}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">After {rule.delay_hours}h</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{rule.description || "No description"}</p>
                    </div>
                    <button onClick={() => setEditingRule(rule)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><Edit size={14} /></button>
                    <button onClick={() => deleteRule(rule)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setEditingTemplate({ ...BLANK_TEMPLATE })} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
              <Plus size={14} /> New Template
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{channelIcon(template.channel)} {template.channel}</span>
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{template.category}</span>
                      {template.is_system && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"><Lock size={11} /> System</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingTemplate(template)} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"><Edit size={14} /></button>
                    <button disabled={template.is_system} onClick={() => deleteTemplate(template)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600">{template.body}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(template.variables ?? []).map((v) => <span key={v} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{v}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Automation Runs</div>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">{["Started","Mode","Evaluated","Sent","Skipped","Failed"].map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{runs.map((run) => (
                <tr key={run.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{new Date(run.started_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2">{run.mode}</td>
                  <td className="px-4 py-2">{run.followups_evaluated}</td>
                  <td className="px-4 py-2">{run.followups_sent}</td>
                  <td className="px-4 py-2">{run.followups_skipped}</td>
                  <td className="px-4 py-2">{run.followups_failed}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              <span className="font-semibold text-gray-900">Communication Logs</span>
              <select value={logFilters.channel} onChange={e => setLogFilters(f => ({ ...f, channel: e.target.value }))} className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-xs">
                <option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
              </select>
              <select value={logFilters.status} onChange={e => setLogFilters(f => ({ ...f, status: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
                <option value="">All statuses</option><option value="dry_run">Dry run</option><option value="success">Success</option><option value="failed">Failed</option><option value="skipped">Skipped</option>
              </select>
            </div>
            <div className="divide-y divide-gray-100">
              {logs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} className="grid w-full grid-cols-6 gap-3 text-left text-sm">
                    <span>{new Date(log.created_at).toLocaleString("en-IN")}</span>
                    <span>{(log as unknown as { candidate?: { name?: string } }).candidate?.name ?? "-"}</span>
                    <span>{(log as unknown as { rule?: { name?: string } }).rule?.name ?? "-"}</span>
                    <span>{log.channel}</span>
                    <span>{log.status}</span>
                    <span className="truncate text-gray-500">{log.body}</span>
                  </button>
                  {expandedLog === log.id && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                      <p className="whitespace-pre-wrap">{log.body}</p>
                      {log.error_message && <p className="mt-2 text-red-600">{log.error_message}</p>}
                      {log.provider_response && <pre className="mt-2 overflow-auto">{JSON.stringify(log.provider_response, null, 2)}</pre>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SettingsPanel title="WhatsApp (Twilio)">
            <TextInput label="Account SID" value={settings.twilio_account_sid} onChange={v => setSettings(s => ({ ...s, twilio_account_sid: v }))} />
            <TextInput label="Auth Token" type="password" value={settings.twilio_auth_token} onChange={v => setSettings(s => ({ ...s, twilio_auth_token: v }))} />
            <TextInput label="WhatsApp From" value={settings.twilio_whatsapp_from} onChange={v => setSettings(s => ({ ...s, twilio_whatsapp_from: v }))} />
            <ProviderTest testTo={testTo} setTestTo={setTestTo} onTest={() => testProvider("whatsapp")} label="Test WhatsApp" />
          </SettingsPanel>
          <SettingsPanel title="Email (Resend)">
            <TextInput label="API Key" type="password" value={settings.resend_api_key} onChange={v => setSettings(s => ({ ...s, resend_api_key: v }))} />
            <TextInput label="From Email" value={settings.resend_from_email} onChange={v => setSettings(s => ({ ...s, resend_from_email: v }))} />
            <TextInput label="From Name" value={settings.resend_from_name} onChange={v => setSettings(s => ({ ...s, resend_from_name: v }))} />
            <ProviderTest testTo={testTo} setTestTo={setTestTo} onTest={() => testProvider("email")} label="Test Email" />
          </SettingsPanel>
          <SettingsPanel title="General">
            <TextInput label="Company Name" value={settings.company_name} onChange={v => setSettings(s => ({ ...s, company_name: v }))} />
            <TextInput label="Daily Digest Time (IST)" type="time" value={settings.daily_digest_time} onChange={v => setSettings(s => ({ ...s, daily_digest_time: v }))} />
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">Weekly Digest Day</span>
              <select value={settings.weekly_digest_day ?? "monday"} onChange={e => setSettings(s => ({ ...s, weekly_digest_day: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2">
                {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span>Live Mode</span>
              <input type="checkbox" checked={Boolean(settings.is_live)} onChange={e => setSettings(s => ({ ...s, is_live: e.target.checked }))} />
            </label>
            <button onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"><Save size={14} /> Save Settings</button>
          </SettingsPanel>
        </div>
      )}

      {editingTemplate && (
        <Modal title={editingTemplate.id ? "Edit Template" : "New Template"} onClose={() => setEditingTemplate(null)} onSave={saveTemplate}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <TextInput label="Name" value={editingTemplate.name} onChange={v => setEditingTemplate(t => ({ ...t!, name: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <SelectInput label="Channel" value={editingTemplate.channel} options={["whatsapp","email"]} onChange={v => setEditingTemplate(t => ({ ...t!, channel: v as MessageTemplate["channel"] }))} />
                <SelectInput label="Category" value={editingTemplate.category} options={["intro","interview_reminder","offer_followup","recruiter_alert","digest","welcome","stale_alert","custom"]} onChange={v => setEditingTemplate(t => ({ ...t!, category: v }))} />
              </div>
              {editingTemplate.channel === "email" && <TextInput label="Subject" value={editingTemplate.subject} onChange={v => setEditingTemplate(t => ({ ...t!, subject: v }))} />}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Body</span>
                <textarea value={editingTemplate.body ?? ""} onChange={e => setEditingTemplate(t => ({ ...t!, body: e.target.value }))} rows={10} className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm" />
              </label>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map(v => <button key={v} onClick={() => setEditingTemplate(t => ({ ...t!, body: `${t?.body ?? ""} {{${v}}}`, variables: Array.from(new Set([...(t?.variables ?? []), v])) }))} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{v}</button>)}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Preview</p>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{(editingTemplate.body ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => `[${key}]`)}</p>
            </div>
          </div>
        </Modal>
      )}

      {editingRule && (
        <Modal title={editingRule.id ? "Edit Rule" : "New Rule"} onClose={() => setEditingRule(null)} onSave={saveRule}>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="Name" value={editingRule.name} onChange={v => setEditingRule(r => ({ ...r!, name: v }))} />
            <TextInput label="Description" value={editingRule.description} onChange={v => setEditingRule(r => ({ ...r!, description: v }))} />
            <SelectInput label="Trigger Type" value={editingRule.trigger_type} options={["stage_change","no_recruiter_contact","interview_scheduled","interview_upcoming","offer_sent_no_response","gf_no_return","offer_not_joined","candidate_joined","job_stale","schedule_daily_digest","schedule_weekly_summary"]} onChange={v => setEditingRule(r => ({ ...r!, trigger_type: v as AutomationRule["trigger_type"] }))} />
            <SelectInput label="Action Type" value={editingRule.action_type} options={["send_candidate_message","notify_recruiter","notify_hr_manager","notify_interviewer","stop_all_followups"]} onChange={v => setEditingRule(r => ({ ...r!, action_type: v as AutomationRule["action_type"] }))} />
            <SelectInput label="Stage" value={String(editingRule.conditions?.stage ?? "")} options={["", ...KANBAN_STAGES.map(s => s.key)]} onChange={v => setEditingRule(r => ({ ...r!, conditions: { ...(r?.conditions ?? {}), stage: v || undefined } }))} />
            <SelectInput label="Channel" value={String(editingRule.action_config?.channel ?? "email")} options={["whatsapp","email"]} onChange={v => setEditingRule(r => ({ ...r!, action_config: { ...(r?.action_config ?? {}), channel: v } }))} />
            <SelectInput label="Template" value={editingRule.template_id ?? ""} options={["", ...templates.map(t => t.id)]} labels={Object.fromEntries(templates.map(t => [t.id, t.name]))} onChange={v => setEditingRule(r => ({ ...r!, template_id: v || null }))} />
            <NumberInput label="Delay hours" value={editingRule.delay_hours} onChange={v => setEditingRule(r => ({ ...r!, delay_hours: v }))} />
            <NumberInput label="Max executions per candidate" value={editingRule.max_per_candidate} onChange={v => setEditingRule(r => ({ ...r!, max_per_candidate: v }))} />
            <NumberInput label="Cooldown hours" value={editingRule.cooldown_hours} onChange={v => setEditingRule(r => ({ ...r!, cooldown_hours: v }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"><h3 className="font-semibold text-gray-900">{title}</h3>{children}</div>;
}

function TextInput({ label, value, onChange, type = "text" }: { label: string; value?: string | null; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>;
}

function NumberInput({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} className="w-full rounded-lg border border-gray-200 px-3 py-2" /></label>;
}

function SelectInput({ label, value, options, labels, onChange }: { label: string; value?: string | null; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><select value={value ?? ""} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2">{options.map(o => <option key={o} value={o}>{labels?.[o] ?? (o || "None")}</option>)}</select></label>;
}

function ProviderTest({ testTo, setTestTo, onTest, label }: { testTo: string; setTestTo: (value: string) => void; onTest: () => void; label: string }) {
  return <div className="flex gap-2"><input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Test recipient" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" /><button onClick={onTest} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">{label}</button></div>;
}

function Modal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-[760px] max-w-[94vw] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onSave} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"><CheckCircle size={14} /> Save</button>
        </div>
      </div>
    </div>
  );
}
