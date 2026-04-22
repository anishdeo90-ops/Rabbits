"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  User, Users, List, Brain, Mail, Database, Link2, Bell,
  Shield, CreditCard, Plus, Trash2, Edit2, Check, X,
  Eye, EyeOff, Copy, RefreshCw, ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string; name: string; email: string; role: string;
  department?: string; is_active: boolean;
  is_external_recruiter?: boolean; external_token?: string; created_at: string;
}
interface Master { id: string; type: string; name: string; sort_order: number; is_active: boolean; }
interface EmailTemplate { id: string; name: string; subject: string; body: string; type: string; is_active: boolean; }

// ── Settings sections ─────────────────────────────────────────────────────────
type Section =
  | "profile" | "team" | "pipeline" | "masters"
  | "email_templates" | "integrations" | "notifications"
  | "ai" | "backup" | "billing";

interface SectionDef { key: Section; label: string; icon: LucideIcon; group: string; adminOnly?: boolean; }
const SECTIONS: SectionDef[] = [
  // Account
  { key: "profile",         label: "My Profile",        icon: User,       group: "Account" },
  { key: "notifications",   label: "Notifications",     icon: Bell,       group: "Account" },
  // Workspace
  { key: "team",            label: "Team & Users",      icon: Users,      group: "Workspace", adminOnly: true },
  { key: "pipeline",        label: "Pipeline Stages",   icon: List,       group: "Workspace", adminOnly: true },
  { key: "masters",         label: "Dropdown Masters",  icon: List,       group: "Workspace", adminOnly: true },
  { key: "email_templates", label: "Email Templates",   icon: Mail,       group: "Workspace", adminOnly: true },
  // Integrations
  { key: "integrations",    label: "Integrations",      icon: Link2,      group: "Integrations" },
  // Advanced
  { key: "ai",              label: "AI & Automation",   icon: Brain,      group: "Advanced" }, // visible to all users
  { key: "backup",          label: "Backup & Security", icon: Database,   group: "Advanced",   adminOnly: true },
  { key: "billing",         label: "Billing & Plan",    icon: CreditCard, group: "Advanced",   adminOnly: true },
];

const DROPDOWN_TYPES = ["designation", "source", "site", "status"] as const;
const PIPELINE_STATUSES = [
  "Sourced", "Tel Int Scheduled", "Tel Int Done", "Google Form Sent",
  "Shortlisted by HR", "PI Scheduled", "PI Done", "Shortlisted by Mgmt",
  "GF Issued", "GF Received", "Appointed/Offered", "Joined",
  "Rejected/Dropped", "On Hold", "Offered But Not Joined",
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("profile");
  const [profile, setProfile] = useState<UserRow | null>(null);

  // Team
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "recruiter", department: "", is_external_recruiter: false });

  // Masters
  const [dropdownType, setDropdownType] = useState<typeof DROPDOWN_TYPES[number]>("designation");
  const [masters, setMasters] = useState<Master[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [newMasterName, setNewMasterName] = useState("");
  const [editingMaster, setEditingMaster] = useState<{ id: string; name: string } | null>(null);

  // Email templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  // AI settings
  type AIScopeData = { id: string; provider: string; model: string | null; label: string | null; is_active: boolean; last_tested_at: string | null; last_test_ok: boolean | null; key_last4: string; key_masked: string } | null;
  type AISettingsData = { personal: AIScopeData; org: AIScopeData; env_fallback: { provider: string; model: string } | null; is_admin: boolean };
  const [aiSettings, setAiSettings]           = useState<AISettingsData | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiForm, setAiForm]                   = useState({ scope: "personal" as "personal"|"org", provider: "anthropic", api_key: "", model: "" });
  const [aiShowKey, setAiShowKey]             = useState(false);
  const [aiSaving, setAiSaving]               = useState(false);
  const [aiEditScope, setAiEditScope]         = useState<"personal"|"org"|null>(null);

  // Integrations
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  // Google Drive
  const [gdrive, setGdrive] = useState<{ client_email: string; folder_id: string; folder_name: string } | null>(null);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveForm, setGdriveForm] = useState({ service_account_json: "", folder_id: "", folder_name: "" });
  const [gdriveSaving, setGdriveSaving] = useState(false);
  const [gdriveShowJson, setGdriveShowJson] = useState(false);
  const [gdriveEdit, setGdriveEdit] = useState(false);

  // Profile edit
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({
    new_candidate: true, status_change: true, interview_reminder: true,
    weekly_report: false, offer_letter: true, joining_alert: true,
  });

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchCurrentUser = useCallback(async () => {
    const res = await fetch("/api/users/me").catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      setProfile(j.data);
      setProfileForm({ name: j.data?.name ?? "", email: j.data?.email ?? "" });
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      const j = await res.json();
      setUsers(j.data ?? []);
    } finally { setUsersLoading(false); }
  }, []);

  const fetchMasters = useCallback(async () => {
    setMastersLoading(true);
    try {
      const res = await fetch(`/api/masters?type=${dropdownType}&include_inactive=true`);
      const j = await res.json();
      setMasters(j.data ?? []);
    } finally { setMastersLoading(false); }
  }, [dropdownType]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/email-templates");
      const j = await res.json();
      setTemplates(j.data ?? []);
    } finally { setTemplatesLoading(false); }
  }, []);

  const fetchAISettings = useCallback(async () => {
    setAiSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/ai");
      if (res.ok) { const j = await res.json(); setAiSettings(j.data); }
    } finally { setAiSettingsLoading(false); }
  }, []);

  const fetchGdriveSettings = useCallback(async () => {
    setGdriveLoading(true);
    try {
      const res = await fetch("/api/settings/google-drive");
      if (res.ok) { const j = await res.json(); setGdrive(j.data); }
    } finally { setGdriveLoading(false); }
  }, []);

  useEffect(() => { fetchCurrentUser(); }, [fetchCurrentUser]);
  useEffect(() => {
    if (section === "team")            fetchUsers();
    else if (section === "masters")    fetchMasters();
    else if (section === "email_templates") fetchTemplates();
    else if (section === "ai")         fetchAISettings();
    else if (section === "integrations") fetchGdriveSettings();
  }, [section, fetchUsers, fetchMasters, fetchTemplates, fetchAISettings, fetchGdriveSettings]);
  useEffect(() => { if (section === "masters") fetchMasters(); }, [dropdownType, fetchMasters, section]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function addUser() {
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      setShowAddUser(false);
      setNewUser({ name: "", email: "", role: "recruiter", department: "", is_external_recruiter: false });
      fetchUsers();
      toast.success("User added — they can now log in");
    } else { const j = await res.json(); toast.error(j.error ?? "Failed to add user"); }
  }

  async function updateUser(id: string, updates: Partial<UserRow>) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) { setEditingUser(null); fetchUsers(); }
  }

  async function addMaster() {
    if (!newMasterName.trim()) return;
    const res = await fetch("/api/masters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: dropdownType, name: newMasterName.trim(), sort_order: masters.length + 1 }),
    });
    if (res.ok) { setNewMasterName(""); fetchMasters(); }
  }

  async function updateMaster(id: string, updates: Partial<Master>) {
    const res = await fetch(`/api/masters/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) { setEditingMaster(null); fetchMasters(); }
  }

  async function saveTemplate(t: EmailTemplate) {
    const res = await fetch(t.id ? `/api/email-templates/${t.id}` : "/api/email-templates", {
      method: t.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (res.ok) { setEditingTemplate(null); setShowAddTemplate(false); fetchTemplates(); toast.success("Template saved"); }
  }

  async function saveAIKey() {
    if (!aiForm.api_key.trim()) { toast.error("API key required"); return; }
    setAiSaving(true);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: aiForm.scope, provider: aiForm.provider, api_key: aiForm.api_key, model: aiForm.model || undefined }),
      });
      if (res.ok) {
        toast.success(aiForm.scope === "personal" ? "Personal AI key saved" : "Organisation AI key saved");
        setAiEditScope(null);
        setAiForm(p => ({ ...p, api_key: "" }));
        await fetchAISettings();
      } else { const e = await res.json(); toast.error(e.error ?? "Failed"); }
    } finally { setAiSaving(false); }
  }

  async function deleteAIKey(scope: "personal"|"org") {
    const res = await fetch(`/api/settings/ai?scope=${scope}`, { method: "DELETE" });
    if (res.ok) { toast.success("AI key removed"); fetchAISettings(); }
    else { const e = await res.json(); toast.error(e.error ?? "Failed"); }
  }

  async function saveGdrive() {
    if (!gdriveForm.service_account_json.trim()) { toast.error("Service account JSON is required"); return; }
    if (!gdriveForm.folder_id.trim()) { toast.error("Google Drive Folder ID is required"); return; }
    setGdriveSaving(true);
    try {
      const res = await fetch("/api/settings/google-drive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gdriveForm),
      });
      if (res.ok) {
        toast.success("Google Drive connected");
        setGdriveEdit(false);
        setGdriveForm({ service_account_json: "", folder_id: "", folder_name: "" });
        await fetchGdriveSettings();
      } else { const e = await res.json(); toast.error(e.error ?? "Failed"); }
    } finally { setGdriveSaving(false); }
  }

  async function disconnectGdrive() {
    const res = await fetch("/api/settings/google-drive", { method: "DELETE" });
    if (res.ok) { toast.success("Google Drive disconnected"); setGdrive(null); }
    else toast.error("Failed to disconnect");
  }

  async function saveProfile() {
    setProfileSaving(true);
    const res = await fetch("/api/users/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: profileForm.name }),
    });
    if (res.ok) { toast.success("Profile updated"); fetchCurrentUser(); }
    else toast.error("Failed to update");
    setProfileSaving(false);
  }

  async function sendPasswordReset(email: string) {
    const res = await fetch("/api/users/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) toast.success("Password reset email sent");
    else toast.error("Failed to send reset email");
  }

  async function triggerBackup() {
    const res = await fetch("/api/backup", { method: "POST" });
    if (res.ok) toast.success("Backup triggered — file will download shortly");
    else toast.error("Backup failed");
  }

  const roleBadge = (role: string) => {
    const m: Record<string, string> = {
      admin: "bg-red-100 text-red-700", hr_manager: "bg-purple-100 text-purple-700",
      recruiter: "bg-blue-100 text-blue-700", hod: "bg-indigo-100 text-indigo-700",
    };
    return m[role] ?? "bg-gray-100 text-gray-600";
  };

  const isAdmin = profile?.role === "admin" || profile?.role === "hr_manager";
  const visibleSections = SECTIONS.filter(s => !s.adminOnly || isAdmin);
  const groups = Array.from(new Set(visibleSections.map(s => s.group)));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Settings Left Nav ── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-5 py-5 border-b border-gray-100">
          <h1 className="text-base font-bold text-gray-900">Settings</h1>
          <p className="text-xs text-gray-400 mt-0.5">Workspace & account</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">{group}</p>
              {visibleSections.filter(s => s.group === group).map(s => (
                <button key={s.key} onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${
                    section === s.key
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}>
                  <s.icon size={15} className="flex-shrink-0" />
                  {s.label}
                  {section === s.key && <ChevronRight size={12} className="ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">

          {/* ══════════════ PROFILE ══════════════ */}
          {section === "profile" && (
            <div className="space-y-6">
              <SectionHeader title="My Profile" desc="Update your name and account preferences" />
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xl">
                    {profileForm.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{profileForm.name || "—"}</p>
                    <p className="text-sm text-gray-400">{profileForm.email}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${roleBadge(profile?.role ?? "")}`}>
                      {profile?.role?.replace("_"," ")}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Display Name</label>
                  <input value={profileForm.name} onChange={e => setProfileForm(p => ({...p, name: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Email Address</label>
                  <input value={profileForm.email} disabled
                    className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-default" />
                  <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact admin to update.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveProfile} disabled={profileSaving}
                    className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-60">
                    {profileSaving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={() => sendPasswordReset(profileForm.email)}
                    className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                    Change Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ NOTIFICATIONS ══════════════ */}
          {section === "notifications" && (
            <div className="space-y-6">
              <SectionHeader title="Notifications" desc="Control which events trigger email or in-app alerts" />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {[
                  { key: "new_candidate",      label: "New candidate added",          desc: "When a new candidate is sourced" },
                  { key: "status_change",       label: "Candidate status change",      desc: "When a candidate moves to a new stage" },
                  { key: "interview_reminder",  label: "Interview reminders",          desc: "24 hrs before a scheduled interview" },
                  { key: "offer_letter",        label: "Offer letter issued",          desc: "When a candidate is offered a position" },
                  { key: "joining_alert",       label: "Joining date alert",           desc: "3 days before expected DOJ" },
                  { key: "weekly_report",       label: "Weekly summary report",        desc: "Every Monday — pipeline overview" },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifPrefs(p => ({...p, [item.key]: !p[item.key as keyof typeof p]}))}
                      className={`relative w-10 h-6 rounded-full transition-colors ${
                        notifPrefs[item.key as keyof typeof notifPrefs] ? "bg-brand-500" : "bg-gray-200"
                      }`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        notifPrefs[item.key as keyof typeof notifPrefs] ? "translate-x-5" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Email notification delivery requires SMTP integration (coming soon).</p>
            </div>
          )}

          {/* ══════════════ TEAM & USERS ══════════════ */}
          {section === "team" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <SectionHeader title="Team & Users" desc="Manage who has access and their roles" />
                <button onClick={() => setShowAddUser(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600">
                  <Plus size={14} /> Invite User
                </button>
              </div>
              {usersLoading ? <Spinner /> : (
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-semibold text-gray-600 text-sm flex-shrink-0">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{u.name}</p>
                          {!u.is_active && <span className="text-xs text-gray-400">(inactive)</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadge(u.role)}`}>
                        {u.role.replace("_"," ")}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => sendPasswordReset(u.email)} title="Send password reset"
                          className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-gray-500">Reset PW</button>
                        <button onClick={() => setEditingUser(u)}
                          className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-gray-500"><Edit2 size={11}/></button>
                        <button onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                          className={`text-xs border px-2 py-1 rounded ${u.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                          {u.is_active ? <EyeOff size={11}/> : <Eye size={11}/>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add User Modal */}
              {showAddUser && (
                <Modal title="Invite New User" onClose={() => setShowAddUser(false)}>
                  <div className="space-y-3">
                    <Field label="Full Name"><input value={newUser.name} onChange={e => setNewUser(p=>({...p,name:e.target.value}))} className={inp} /></Field>
                    <Field label="Email Address"><input type="email" value={newUser.email} onChange={e => setNewUser(p=>({...p,email:e.target.value}))} className={inp} /></Field>
                    <Field label="Role">
                      <select value={newUser.role} onChange={e => setNewUser(p=>({...p,role:e.target.value}))} className={inp}>
                        <option value="recruiter">Recruiter</option>
                        <option value="hr_manager">HR Manager</option>
                        <option value="hod">HOD / Interviewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </Field>
                    <Field label="Department (optional)"><input value={newUser.department} onChange={e => setNewUser(p=>({...p,department:e.target.value}))} className={inp} /></Field>
                    <div className="flex gap-2 pt-2">
                      <button onClick={addUser} className={btnPrimary}>Add User</button>
                      <button onClick={() => setShowAddUser(false)} className={btnSecondary}>Cancel</button>
                    </div>
                  </div>
                </Modal>
              )}
              {editingUser && (
                <Modal title={`Edit — ${editingUser.name}`} onClose={() => setEditingUser(null)}>
                  <div className="space-y-3">
                    <Field label="Full Name"><input defaultValue={editingUser.name} id="eu-name" className={inp} /></Field>
                    <Field label="Role">
                      <select defaultValue={editingUser.role} id="eu-role" className={inp}>
                        <option value="recruiter">Recruiter</option>
                        <option value="hr_manager">HR Manager</option>
                        <option value="hod">HOD / Interviewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </Field>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => {
                        const name = (document.getElementById("eu-name") as HTMLInputElement)?.value;
                        const role = (document.getElementById("eu-role") as HTMLSelectElement)?.value;
                        updateUser(editingUser.id, { name, role });
                      }} className={btnPrimary}>Save</button>
                      <button onClick={() => setEditingUser(null)} className={btnSecondary}>Cancel</button>
                    </div>
                  </div>
                </Modal>
              )}
            </div>
          )}

          {/* ══════════════ PIPELINE STAGES ══════════════ */}
          {section === "pipeline" && (
            <div className="space-y-6">
              <SectionHeader title="Pipeline Stages" desc="The candidate journey stages — used across all views" />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {PIPELINE_STATUSES.map((s, i) => (
                  <div key={s} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-xs text-gray-400 w-6 text-right">{i + 1}</span>
                    <div className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0" />
                    <span className="text-sm text-gray-800">{s}</span>
                    {["Joined","Rejected/Dropped"].includes(s) && (
                      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${s === "Joined" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {s === "Joined" ? "Final ✓" : "Final ✗"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Stage customisation (add/remove/reorder) — coming in a future update.</p>
            </div>
          )}

          {/* ══════════════ DROPDOWN MASTERS ══════════════ */}
          {section === "masters" && (
            <div className="space-y-6">
              <SectionHeader title="Dropdown Masters" desc="Manage Sites, Designations, Sources and Status values" />
              <div className="flex gap-2 flex-wrap">
                {DROPDOWN_TYPES.map(t => (
                  <button key={t} onClick={() => setDropdownType(t)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                      dropdownType === t ? "bg-brand-500 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}>{t}</button>
                ))}
              </div>
              {mastersLoading ? <Spinner /> : (
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {masters.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                      {editingMaster?.id === m.id ? (
                        <>
                          <input value={editingMaster.name} onChange={e => setEditingMaster({...editingMaster, name: e.target.value})}
                            className="flex-1 border border-brand-400 rounded px-2 py-1 text-sm outline-none" />
                          <button onClick={() => updateMaster(m.id, { name: editingMaster.name })} className="text-green-600"><Check size={14}/></button>
                          <button onClick={() => setEditingMaster(null)} className="text-gray-400"><X size={14}/></button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm flex-1 ${!m.is_active ? "line-through text-gray-400" : "text-gray-800"}`}>{m.name}</span>
                          <button onClick={() => setEditingMaster({ id: m.id, name: m.name })} className="text-gray-400 hover:text-gray-600"><Edit2 size={13}/></button>
                          <button onClick={() => updateMaster(m.id, { is_active: !m.is_active })}
                            className={`text-xs px-2 py-0.5 rounded ${m.is_active ? "text-red-400 hover:text-red-600" : "text-green-500 hover:text-green-700"}`}>
                            {m.is_active ? "Hide" : "Show"}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={newMasterName} onChange={e => setNewMasterName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addMaster()}
                  placeholder={`Add new ${dropdownType}…`}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={addMaster} className={btnPrimary}><Plus size={14} /> Add</button>
              </div>
            </div>
          )}

          {/* ══════════════ EMAIL TEMPLATES ══════════════ */}
          {section === "email_templates" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <SectionHeader title="Email Templates" desc="Pre-written templates for interview invites, offers, rejections" />
                <button onClick={() => setShowAddTemplate(true)} className={btnPrimary}><Plus size={14}/> New Template</button>
              </div>
              {templatesLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {templates.length === 0 && <EmptyState text="No email templates yet" />}
                  {templates.map(t => (
                    <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Subject: {t.subject}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded capitalize">{t.type}</span>
                          <button onClick={() => setEditingTemplate(t)} className="text-xs border border-gray-200 px-2.5 py-1 rounded hover:bg-gray-50 text-gray-500">Edit</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(showAddTemplate || editingTemplate) && (
                <Modal title={editingTemplate ? "Edit Template" : "New Email Template"}
                  onClose={() => { setEditingTemplate(null); setShowAddTemplate(false); }}>
                  <TemplateForm
                    initial={editingTemplate ?? { id: "", name: "", subject: "", body: "", type: "general", is_active: true }}
                    onSave={saveTemplate}
                    onCancel={() => { setEditingTemplate(null); setShowAddTemplate(false); }}
                  />
                </Modal>
              )}
            </div>
          )}

          {/* ══════════════ INTEGRATIONS ══════════════ */}
          {section === "integrations" && (
            <div className="space-y-6">
              <SectionHeader title="Integrations" desc="Connect external services to automate your workflow" />

              {/* ── Google Drive (live) ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                  <span className="text-2xl">📁</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">Google Drive — CV Storage</p>
                    <p className="text-xs text-gray-400 mt-0.5">Upload CVs directly to a shared Google Drive folder using a Service Account</p>
                  </div>
                  {gdrive
                    ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-semibold">✓ Connected</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">Not connected</span>}
                </div>

                {gdriveLoading ? (
                  <div className="px-5 py-6 text-center text-xs text-gray-400">Loading…</div>
                ) : gdrive && !gdriveEdit ? (
                  /* ── Connected state ── */
                  <div className="px-5 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Service Account</p>
                        <p className="text-xs font-mono text-gray-700 truncate">{gdrive.client_email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Drive Folder ID</p>
                        <p className="text-xs font-mono text-gray-700 truncate">{gdrive.folder_id}</p>
                      </div>
                      {gdrive.folder_name && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Folder Name</p>
                          <p className="text-xs text-gray-700">{gdrive.folder_name}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setGdriveEdit(true)}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                        Update credentials
                      </button>
                      <button onClick={disconnectGdrive}
                        className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Setup / edit form ── */
                  <div className="px-5 py-4 space-y-4">
                    {/* Step guide */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800 space-y-1.5">
                      <p className="font-semibold mb-2">How to set up (one-time, 5 minutes):</p>
                      <p>1. Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a> → Create a project → Enable the <strong>Google Drive API</strong></p>
                      <p>2. IAM & Admin → Service Accounts → Create Service Account → Create JSON key → Download it</p>
                      <p>3. In Google Drive, create a folder for CVs → Share it with the service account email (<code>...@...iam.gserviceaccount.com</code>) as Editor</p>
                      <p>4. Copy the folder ID from the Drive URL: <code>drive.google.com/drive/folders/<strong>[FOLDER-ID]</strong></code></p>
                      <p>5. Paste both below and save.</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">
                        Service Account JSON Key <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <textarea
                          rows={gdriveShowJson ? 8 : 3}
                          value={gdriveForm.service_account_json}
                          onChange={e => setGdriveForm(p => ({ ...p, service_account_json: e.target.value }))}
                          placeholder='Paste the full JSON key file contents here: {"type":"service_account","project_id":"..."}'
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                        />
                        <button onClick={() => setGdriveShowJson(p => !p)}
                          className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-600">
                          {gdriveShowJson ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">
                          Drive Folder ID <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={gdriveForm.folder_id}
                          onChange={e => setGdriveForm(p => ({ ...p, folder_id: e.target.value }))}
                          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Folder Name (optional label)</label>
                        <input type="text" value={gdriveForm.folder_name}
                          onChange={e => setGdriveForm(p => ({ ...p, folder_name: e.target.value }))}
                          placeholder="e.g. HireRabbits CVs"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      {gdriveEdit && (
                        <button onClick={() => setGdriveEdit(false)}
                          className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                          Cancel
                        </button>
                      )}
                      <button onClick={saveGdrive} disabled={gdriveSaving}
                        className="text-xs px-5 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-60 font-medium">
                        {gdriveSaving ? "Connecting…" : "Connect Google Drive"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Google Workspace — coming soon items */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">🔵</span>
                  <span className="font-semibold text-sm text-gray-900">More Google Workspace (Coming Soon)</span>
                </div>
                {[
                  { key: "gmail",    icon: "✉️", label: "Gmail",          desc: "Send interview invites & offer letters directly from the ATS" },
                  { key: "calendar", icon: "📅", label: "Google Calendar", desc: "Auto-create calendar events when interviews are scheduled" },
                  { key: "sheets",   icon: "📊", label: "Google Sheets",   desc: "Two-way sync of candidate data with a master spreadsheet" },
                ].map(item => (
                  <div key={item.key} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
                    <span className="text-xl w-8 text-center">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">Coming Soon</span>
                  </div>
                ))}
              </div>

              {/* Job Boards */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="font-semibold text-sm text-gray-900">Job Boards & Sourcing</span>
                </div>
                {[
                  { icon: "🔶", label: "Naukri.com",    desc: "Import candidate profiles directly from Naukri search",  status: "coming_soon" },
                  { icon: "🔵", label: "LinkedIn",      desc: "Sync LinkedIn job posts and import applicants",          status: "coming_soon" },
                  { icon: "⚫", label: "Indeed",        desc: "Pull applicants from Indeed job listings",               status: "coming_soon" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
                    <span className="text-xl w-8 text-center">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">Coming Soon</span>
                  </div>
                ))}
              </div>

              {/* Communication */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="font-semibold text-sm text-gray-900">Communication</span>
                </div>
                {[
                  { icon: "💬", label: "WhatsApp Business", desc: "Send interview reminders and status updates via WhatsApp" },
                  { icon: "📱", label: "SMS / Twilio",      desc: "SMS notifications for candidates without WhatsApp" },
                  { icon: "🔔", label: "Slack",             desc: "Get pipeline alerts in your team Slack workspace" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
                    <span className="text-xl w-8 text-center">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">Coming Soon</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════ AI & AUTOMATION ══════════════ */}
          {section === "ai" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="pb-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm"
                    style={{ background: "linear-gradient(135deg,#667eea,#764ba2)" }}>✦</div>
                  <h2 className="text-lg font-bold text-gray-900">AI & Automation</h2>
                </div>
                <p className="text-sm text-gray-400">Connect your own Claude or ChatGPT key. Your key is private — only you use it. Admins can also set an org-wide key for everyone.</p>
              </div>

              {/* Active AI source banner */}
              {!aiSettingsLoading && (aiSettings?.personal || aiSettings?.org || aiSettings?.env_fallback) && (
                <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-sm font-semibold text-violet-800">AI is active</p>
                  </div>
                  <p className="text-xs text-violet-600">
                    {aiSettings.personal
                      ? `Using your personal ${aiSettings.personal.provider === "anthropic" ? "Claude" : aiSettings.personal.provider === "openai" ? "ChatGPT" : "Gemini"} key (••••${aiSettings.personal.key_last4})`
                      : aiSettings.org
                      ? `Using organisation ${aiSettings.org.provider === "anthropic" ? "Claude" : aiSettings.org.provider === "openai" ? "ChatGPT" : "Gemini"} key set by admin`
                      : "Using server Claude key (env)"}
                  </p>
                </div>
              )}
              {!aiSettingsLoading && !aiSettings?.personal && !aiSettings?.org && !aiSettings?.env_fallback && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-0.5">AI not connected</p>
                  <p className="text-xs text-amber-700">Connect a Claude or ChatGPT key below to unlock AI features across the tool.</p>
                </div>
              )}

              {/* ── My Personal AI Key ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">My AI Key</p>
                    <p className="text-xs text-gray-400 mt-0.5">Private to you — only your activity uses this key</p>
                  </div>
                  {aiSettings?.personal && aiEditScope !== "personal" && (
                    <div className="flex gap-2">
                      <button onClick={() => { setAiEditScope("personal"); setAiForm(p => ({ ...p, scope: "personal", provider: aiSettings.personal!.provider, api_key: "", model: aiSettings.personal!.model ?? "" })); }}
                        className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg text-gray-600 hover:bg-white">Replace</button>
                      <button onClick={() => deleteAIKey("personal")}
                        className="text-xs border border-red-200 px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50">Remove</button>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {aiSettings?.personal && aiEditScope !== "personal" ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold
                        ${aiSettings.personal.provider === "anthropic" ? "bg-brand-500" : aiSettings.personal.provider === "openai" ? "bg-green-600" : "bg-blue-500"}`}>
                        {aiSettings.personal.provider === "anthropic" ? "C" : aiSettings.personal.provider === "openai" ? "G" : "G"}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {aiSettings.personal.provider === "anthropic" ? "Claude (Anthropic)" : aiSettings.personal.provider === "openai" ? "ChatGPT (OpenAI)" : "Gemini (Google)"}
                        </p>
                        <p className="text-xs text-gray-400">Key: {aiSettings.personal.key_masked} · Model: {aiSettings.personal.model ?? "default"}</p>
                      </div>
                      <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                    </div>
                  ) : aiEditScope === "personal" ? (
                    <AIKeyForm
                      form={aiForm} setForm={setAiForm}
                      showKey={aiShowKey} setShowKey={setAiShowKey}
                      saving={aiSaving} onSave={saveAIKey}
                      onCancel={() => setAiEditScope(null)}
                      inp={inp} btnPrimary={btnPrimary} btnSecondary={btnSecondary}
                    />
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-xs text-gray-400 mb-3">No personal AI key connected yet</p>
                      <button onClick={() => { setAiEditScope("personal"); setAiForm({ scope: "personal", provider: "anthropic", api_key: "", model: "" }); }}
                        className={btnPrimary}>
                        + Connect My AI Key
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Org-wide AI Key (admin only) ── */}
              {aiSettings?.is_admin && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-purple-900">Organisation AI Key</p>
                      <p className="text-xs text-purple-600 mt-0.5">Shared key — all users who haven&apos;t connected personal keys will use this</p>
                    </div>
                    {aiSettings?.org && aiEditScope !== "org" && (
                      <div className="flex gap-2">
                        <button onClick={() => { setAiEditScope("org"); setAiForm(p => ({ ...p, scope: "org", provider: aiSettings.org!.provider, api_key: "", model: aiSettings.org!.model ?? "" })); }}
                          className="text-xs border border-purple-200 px-2.5 py-1 rounded-lg text-purple-700 hover:bg-white">Replace</button>
                        <button onClick={() => deleteAIKey("org")}
                          className="text-xs border border-red-200 px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-50">Remove</button>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    {aiSettings?.org && aiEditScope !== "org" ? (
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold
                          ${aiSettings.org.provider === "anthropic" ? "bg-brand-500" : aiSettings.org.provider === "openai" ? "bg-green-600" : "bg-blue-500"}`}>
                          {aiSettings.org.provider === "anthropic" ? "C" : "G"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {aiSettings.org.provider === "anthropic" ? "Claude (Anthropic)" : aiSettings.org.provider === "openai" ? "ChatGPT (OpenAI)" : "Gemini (Google)"}
                          </p>
                          <p className="text-xs text-gray-400">Key: {aiSettings.org.key_masked} · Model: {aiSettings.org.model ?? "default"}</p>
                        </div>
                        <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                      </div>
                    ) : aiEditScope === "org" ? (
                      <AIKeyForm
                        form={{ ...aiForm, scope: "org" }} setForm={setAiForm}
                        showKey={aiShowKey} setShowKey={setAiShowKey}
                        saving={aiSaving} onSave={saveAIKey}
                        onCancel={() => setAiEditScope(null)}
                        inp={inp} btnPrimary={btnPrimary} btnSecondary={btnSecondary}
                      />
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-xs text-gray-400 mb-3">No org-wide key set. All users must connect their own.</p>
                        <button onClick={() => { setAiEditScope("org"); setAiForm({ scope: "org", provider: "anthropic", api_key: "", model: "" }); }}
                          className={btnPrimary}>
                          + Set Organisation AI Key
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* How keys are used */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
                <p className="font-semibold text-gray-700 text-sm">Priority order</p>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-violet-500 text-white text-center text-xs leading-5 font-bold">1</span><span><strong>Your personal key</strong> — used first if connected</span></div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-500 text-white text-center text-xs leading-5 font-bold">2</span><span><strong>Organisation key</strong> — used if you haven&apos;t set a personal key</span></div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-gray-400 text-white text-center text-xs leading-5 font-bold">3</span><span><strong>Server key</strong> — fallback if configured by developer</span></div>
                <p className="text-gray-400 pt-1">Your API key is stored securely and is only accessible to you. Keys are never logged or shared.</p>
              </div>

              {/* ── AI Features grid ── */}
              <div>
                <p className="text-sm font-bold text-gray-800 mb-3">AI Features in this tool</p>
                <div className="grid grid-cols-1 gap-3">
                  {AI_FEATURES.map(f => (
                    <div key={f.id} className={`flex items-start gap-3 p-4 rounded-xl border ${
                      f.status === "live" ? "bg-green-50 border-green-200" :
                      f.status === "ready" ? "bg-blue-50 border-blue-200" :
                      "bg-white border-gray-200"
                    }`}>
                      <span className="text-2xl w-8 text-center shrink-0">{f.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                          {f.status === "live" && <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full font-medium">Live</span>}
                          {f.status === "ready" && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">Ready</span>}
                          {f.status === "coming_soon" && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">Soon</span>}
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{f.desc}</p>
                        <p className="text-xs text-gray-400 mt-1">📍 {f.where}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ BACKUP & SECURITY ══════════════ */}
          {section === "backup" && (
            <div className="space-y-6">
              <SectionHeader title="Backup & Security" desc="Data backups, API access and security settings" />
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Manual Backup</p>
                  <p className="text-xs text-gray-400 mb-3">Export the full candidate database as a CSV file</p>
                  <button onClick={triggerBackup} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600">
                    <Database size={14}/> Download Backup
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <p className="text-sm font-semibold text-gray-900">External Recruiter Tokens</p>
                <p className="text-xs text-gray-400">Each external recruiter has a unique token for portal access.</p>
                {users.filter(u => u.is_external_recruiter).map(u => (
                  <div key={u.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-32 truncate">{u.name}</span>
                    <code className="flex-1 text-xs bg-gray-100 px-2 py-1 rounded font-mono truncate">
                      {showTokens[u.id] ? (u.external_token ?? "—") : "••••••••••••••••"}
                    </code>
                    <button onClick={() => setShowTokens(p => ({...p, [u.id]: !p[u.id]}))} className="text-gray-400">
                      {showTokens[u.id] ? <EyeOff size={13}/> : <Eye size={13}/>}
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(u.external_token ?? ""); toast.success("Copied!"); }} className="text-gray-400">
                      <Copy size={13}/>
                    </button>
                    <button onClick={async () => {
                      const res = await fetch(`/api/users/${u.id}/token`, { method: "POST" });
                      if (res.ok) { fetchUsers(); toast.success("Token regenerated"); }
                    }} className="text-gray-400"><RefreshCw size={13}/></button>
                  </div>
                ))}
                {users.filter(u => u.is_external_recruiter).length === 0 && (
                  <p className="text-xs text-gray-400">No external recruiters yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════ BILLING ══════════════ */}
          {section === "billing" && (
            <div className="space-y-6">
              <SectionHeader title="Billing & Plan" desc="Manage your subscription and usage" />
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <div>
                    <p className="font-semibold text-gray-900">HireRabbits ATS</p>
                    <p className="text-sm text-gray-400 mt-0.5">Enterprise Plan</p>
                  </div>
                  <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">Active</span>
                </div>
                <div className="grid grid-cols-3 gap-4 py-4">
                  {[
                    { label: "Users", value: `${users.length}` },
                    { label: "Candidates", value: "Unlimited" },
                    { label: "Storage", value: "50 GB" },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-400">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                  For billing changes or upgrades, contact <span className="text-brand-500">support@hirerabbits.com</span>
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="pb-1">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-400 mt-0.5">{desc}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-6 w-[480px] shadow-2xl z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-10 text-gray-400 text-sm">{text}</div>;
}

function TemplateForm({ initial, onSave, onCancel }: {
  initial: EmailTemplate;
  onSave: (t: EmailTemplate) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState(initial);
  return (
    <div className="space-y-3">
      <Field label="Template Name"><input value={t.name} onChange={e => setT(p=>({...p,name:e.target.value}))} className={inp} /></Field>
      <Field label="Type">
        <select value={t.type} onChange={e => setT(p=>({...p,type:e.target.value}))} className={inp}>
          <option value="general">General</option>
          <option value="interview">Interview Invite</option>
          <option value="offer">Offer Letter</option>
          <option value="rejection">Rejection</option>
          <option value="joining">Joining Instructions</option>
        </select>
      </Field>
      <Field label="Subject"><input value={t.subject} onChange={e => setT(p=>({...p,subject:e.target.value}))} className={inp} /></Field>
      <Field label="Body">
        <textarea rows={6} value={t.body} onChange={e => setT(p=>({...p,body:e.target.value}))}
          placeholder="Use {{candidate_name}}, {{position}}, {{date}}, {{company}} as variables"
          className={`${inp} resize-none`} />
      </Field>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(t)} className={btnPrimary}>Save Template</button>
        <button onClick={onCancel} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ── AI Features catalogue ─────────────────────────────────────────────────────
const AI_FEATURES = [
  {
    id: "resume_parse",
    title: "Resume Parser",
    desc: "Upload any CV (PDF or Word) and auto-fill the candidate profile. Name, email, mobile, salary, notice period — all extracted instantly.",
    icon: "📄",
    status: "live" as const,
    where: "Candidate → Files tab → Parse CV with AI",
  },
  {
    id: "candidate_scoring",
    title: "Candidate Scoring (0–100)",
    desc: "AI scores each candidate against the job requirements and adds an AI score badge. Helps prioritise who to call first.",
    icon: "🎯",
    status: "ready" as const,
    where: "Candidates list — AI score column",
  },
  {
    id: "ai_summary",
    title: "Candidate Summary",
    desc: "Generates a concise 2–3 line professional summary from the CV. Shown in the candidate detail header so recruiters get context at a glance.",
    icon: "✨",
    status: "ready" as const,
    where: "Candidate detail panel — header",
  },
  {
    id: "jd_writer",
    title: "JD Writer",
    desc: "Give a job title and a few bullet points — AI writes a complete, professional job description ready to post.",
    icon: "📝",
    status: "coming_soon" as const,
    where: "Jobs → Create Job → Write with AI",
  },
  {
    id: "interview_questions",
    title: "Interview Question Generator",
    desc: "Role-specific interview questions based on the JD and the candidate's background. Different sets for technical, behavioural, and HR rounds.",
    icon: "🎤",
    status: "coming_soon" as const,
    where: "Candidate → PI Rounds tab",
  },
  {
    id: "offer_email",
    title: "Offer & Rejection Email Drafter",
    desc: "Personalised, professional offer and rejection emails — tone-adjusted based on candidate stage and history.",
    icon: "💌",
    status: "coming_soon" as const,
    where: "Candidate → Comms tab → Compose with AI",
  },
  {
    id: "duplicate_detection",
    title: "Duplicate Detection",
    desc: "Flags when a new candidate may already exist in the database with different contact details or name spelling.",
    icon: "🔍",
    status: "coming_soon" as const,
    where: "Add candidate flow",
  },
  {
    id: "pipeline_insights",
    title: "Pipeline Insights",
    desc: "Weekly AI-generated summary of your hiring pipeline — drop-off points, conversion rates, and what's slowing things down.",
    icon: "📊",
    status: "coming_soon" as const,
    where: "Dashboard → AI Insights panel",
  },
  {
    id: "salary_benchmark",
    title: "Salary Benchmarking",
    desc: "Suggests market-aligned salary ranges for any designation + location combination based on current market data.",
    icon: "💰",
    status: "coming_soon" as const,
    where: "Offer tab → CTC Creator",
  },
  {
    id: "candidate_comparison",
    title: "Candidate Comparison",
    desc: "Side-by-side AI analysis of your shortlisted candidates for a role — strengths, gaps, and a recommended pick.",
    icon: "⚖️",
    status: "coming_soon" as const,
    where: "Jobs → Shortlisted candidates view",
  },
  {
    id: "ctc_notes",
    title: "CTC & Negotiation Notes",
    desc: "AI drafts negotiation talking points and a CTC justification memo based on market data and the candidate's profile.",
    icon: "🤝",
    status: "coming_soon" as const,
    where: "Offer tab",
  },
  {
    id: "onboarding_checklist",
    title: "Onboarding Checklist Generator",
    desc: "Automatically creates a role-specific onboarding checklist when a candidate is marked as Joined.",
    icon: "✅",
    status: "coming_soon" as const,
    where: "Candidate → Final tab → Mark Joined",
  },
] as const;

// ── AIKeyForm sub-component ───────────────────────────────────────────────────
type AIFormState = { scope: "personal"|"org"; provider: string; api_key: string; model: string };
function AIKeyForm({ form, setForm, showKey, setShowKey, saving, onSave, onCancel, inp: inpCls, btnPrimary: btnP, btnSecondary: btnS }: {
  form: AIFormState;
  setForm: (fn: (p: AIFormState) => AIFormState) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  inp: string;
  btnPrimary: string;
  btnSecondary: string;
}) {
  const PROVIDERS = [
    { value: "anthropic", label: "Claude (Anthropic)", placeholder: "sk-ant-api03-…", models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"] },
    { value: "openai",    label: "ChatGPT (OpenAI)",   placeholder: "sk-proj-…",      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
    { value: "gemini",    label: "Gemini (Google)",    placeholder: "AIza…",          models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"] },
  ];
  const prov = PROVIDERS.find(p => p.value === form.provider) ?? PROVIDERS[0];

  return (
    <div className="space-y-3">
      {/* Provider selector */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1.5">AI Provider</label>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.value}
              onClick={() => setForm(prev => ({ ...prev, provider: p.value, model: "" }))}
              className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                form.provider === p.value
                  ? "border-brand-400 bg-brand-50 text-brand-800"
                  : "border-gray-200 hover:border-gray-300 text-gray-600"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">API Key</label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={form.api_key}
            onChange={e => setForm(prev => ({ ...prev, api_key: e.target.value }))}
            placeholder={prov.placeholder}
            className={`${inpCls} pr-10 font-mono text-xs`}
          />
          <button type="button" onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
            {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {form.provider === "anthropic" && <>Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">console.anthropic.com</a></>}
          {form.provider === "openai" && <>Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">platform.openai.com</a></>}
          {form.provider === "gemini" && <>Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">aistudio.google.com</a></>}
        </p>
      </div>

      {/* Optional model override */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Model <span className="font-normal text-gray-400">(optional — uses default if blank)</span></label>
        <select value={form.model} onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))} className={inpCls}>
          <option value="">Use default model</option>
          {prov.models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.api_key.trim()} className={btnP}>
          {saving ? "Saving…" : "Save Key"}
        </button>
        <button onClick={onCancel} className={btnS}>Cancel</button>
      </div>
    </div>
  );
}

// Shared class strings
const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500";
const btnPrimary = "flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600";
const btnSecondary = "px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50";
