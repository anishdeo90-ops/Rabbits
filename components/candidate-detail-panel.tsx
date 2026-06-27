"use client";

import { useEffect, useState, useCallback, createContext, useContext, useRef } from "react";
import { X, ExternalLink, Trash2, Save, AlertTriangle, UserPlus, Mail, MessageSquare, Phone, Upload, FileText, Calendar, Video, Plus, Send, Paperclip, Sparkles, ChevronDown, ChevronUp, Lock, Unlock, CheckCircle, Share2, ArrowRightCircle, Download } from "lucide-react";
import type { Candidate, CoSourcer, Master, Profile, CandidateOffer } from "@/lib/types";
import { computeCTC, CTC_SYSTEM_TEMPLATES, generateOfferLetterHTML, type CTCBreakdown } from "@/lib/ctc";
import toast from "react-hot-toast";

// ── Panel Context ─────────────────────────────────────────────────────────────
interface PanelCtx {
  form: Partial<Candidate>;
  canEdit: boolean;
  onChange: (key: keyof Candidate, val: string | number | null) => void;
}
const PanelContext = createContext<PanelCtx>({ form: {}, canEdit: true, onChange: () => {} });

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ field, type = "text", placeholder }: { field: keyof Candidate; type?: string; placeholder?: string }) {
  const { form, canEdit, onChange } = useContext(PanelContext);
  const val = (form[field] as string) ?? "";
  return (
    <input type={type} value={type === "date" ? (val ? val.slice(0, 10) : "") : val}
      disabled={!canEdit} placeholder={placeholder}
      onChange={e => canEdit && onChange(field, e.target.value || null)}
      className={`w-full border rounded-lg px-3 py-1.5 text-sm outline-none
        ${!canEdit ? "bg-gray-50 text-gray-400 cursor-default border-gray-100" : "border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent"}`}
    />
  );
}

function Select({ field, options }: { field: keyof Candidate; options: { value: string; label: string }[] }) {
  const { form, canEdit, onChange } = useContext(PanelContext);
  const val = (form[field] as string) ?? "";
  return (
    <select value={val} disabled={!canEdit}
      onChange={e => canEdit && onChange(field, e.target.value || null)}
      className={`w-full border rounded-lg px-3 py-1.5 text-sm outline-none
        ${!canEdit ? "bg-gray-50 text-gray-400 cursor-default border-gray-100" : "border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent"}`}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Textarea({ field, rows = 3, placeholder }: { field: keyof Candidate; rows?: number; placeholder?: string }) {
  const { form, canEdit, onChange } = useContext(PanelContext);
  const val = (form[field] as string) ?? "";
  return (
    <textarea rows={rows} value={val} disabled={!canEdit} placeholder={placeholder}
      onChange={e => canEdit && onChange(field, e.target.value || null)}
      className={`w-full border rounded-lg px-3 py-1.5 text-sm outline-none resize-none
        ${!canEdit ? "bg-gray-50 text-gray-400 cursor-default border-gray-100" : "border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent"}`}
    />
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "overview" | "telephonic" | "gf" | "pi" | "comms" | "files" | "forms" | "offer" | "final" | "notes" | "history";

interface CommEntry {
  id: string; type: string; direction: string; subject?: string; content: string;
  template_used?: string; created_at: string;
  profiles?: { name: string };
}
interface FileEntry {
  id: string; file_name: string; storage_path: string; file_category: string;
  file_size?: number; mime_type?: string; created_at: string; signed_url?: string;
  profiles?: { name: string };
}

// ── Email templates ───────────────────────────────────────────────────────────
const EMAIL_TEMPLATES: { id: string; label: string; subject: string; body: (name: string) => string }[] = [
  {
    id: "interview_invite",
    label: "Interview Invite",
    subject: "Interview Invitation — {Designation}",
    body: (name) => `Dear ${name},\n\nThank you for your interest in joining our team. We are pleased to invite you for a personal interview.\n\nPlease revert to confirm your availability.\n\nRegards,\nHR Team`,
  },
  {
    id: "gf_link",
    label: "Google Form — Please Fill",
    subject: "Action Required: Candidate Form",
    body: (name) => `Dear ${name},\n\nKindly fill the attached Google Form at your earliest convenience so we can proceed with your application.\n\n[PASTE FORM LINK HERE]\n\nRegards,\nHR Team`,
  },
  {
    id: "offer_letter",
    label: "Offer Letter Dispatch",
    subject: "Offer of Employment",
    body: (name) => `Dear ${name},\n\nWe are pleased to offer you the position. Kindly find the offer letter attached.\n\nPlease revert with your acceptance by reply to this email.\n\nRegards,\nHR Team`,
  },
  {
    id: "rejection",
    label: "Regret Letter",
    subject: "Application Status Update",
    body: (name) => `Dear ${name},\n\nThank you for your time and interest in our organisation. After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.\n\nWe wish you the best in your future endeavours.\n\nRegards,\nHR Team`,
  },
  {
    id: "doj_confirmation",
    label: "DOJ Confirmation",
    subject: "Date of Joining Confirmation",
    body: (name) => `Dear ${name},\n\nWelcome aboard! This is to confirm your Date of Joining.\n\nPlease report to the HR department with all original documents.\n\nRegards,\nHR Team`,
  },
];

const WHATSAPP_TEMPLATES: { id: string; label: string; text: (name: string) => string }[] = [
  {
    id: "interview_reminder",
    label: "Interview Reminder",
    text: (name) => `Hi ${name}, this is a reminder about your interview scheduled with us. Please confirm your availability. Thank you!`,
  },
  {
    id: "gf_reminder",
    label: "Form Fill Reminder",
    text: (name) => `Hi ${name}, kindly fill the Google Form we shared earlier at your earliest. Please let us know if you need the link again.`,
  },
  {
    id: "doj_reminder",
    label: "DOJ Reminder",
    text: (name) => `Hi ${name}, a gentle reminder about your upcoming Date of Joining. Please bring all original documents. Looking forward to having you on board!`,
  },
];

// ── Google Calendar URL builder ───────────────────────────────────────────────
function buildCalendarUrl(title: string, date: string, meetLink?: string) {
  const d = date.replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${d}/${d}`,
    details: meetLink ? `Google Meet: ${meetLink}` : "",
    location: meetLink ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── Category badges ───────────────────────────────────────────────────────────
const CAT_LABEL: Record<string, string> = { cv: "CV", certificate: "Certificate", onboarding: "Onboarding", form_response: "Form Response", other: "Other" };
const CAT_COLOR: Record<string, string> = { cv: "bg-blue-100 text-blue-700", certificate: "bg-purple-100 text-purple-700", onboarding: "bg-green-100 text-green-700", form_response: "bg-brand-100 text-brand-700", other: "bg-gray-100 text-gray-600" };

function formatBytes(b?: number) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  candidateId: string;
  profile: Profile;
  sites: Master[];
  designations: Master[];
  sources: Master[];
  recruiters: Profile[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function DetailPanel({ candidateId, profile, sites, designations, sources, recruiters, onClose, onUpdated }: Props) {
  const [tab, setTab]           = useState<Tab>("overview");
  const [cand, setCand]         = useState<Candidate | null>(null);
  const [coSourcers, setCoSourcers] = useState<CoSourcer[]>([]);
  const [form, setForm]         = useState<Partial<Candidate>>({});
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  // Notes
  const [note, setNote] = useState("");

  // Comms
  const [comms, setComms]             = useState<CommEntry[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [showLogForm, setShowLogForm]   = useState(false);
  const [logType, setLogType]           = useState("email");
  const [logDir, setLogDir]             = useState("sent");
  const [logSubject, setLogSubject]     = useState("");
  const [logContent, setLogContent]     = useState("");
  const [logTemplate, setLogTemplate]   = useState("");
  const [savingLog, setSavingLog]       = useState(false);
  // Email composer
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailTemplate, setEmailTemplate]         = useState("");
  const [emailSubject, setEmailSubject]           = useState("");
  const [emailBody, setEmailBody]                 = useState("");

  // Files
  const [files, setFiles]           = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("cv");
  const [uploading, setUploading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Forms (built-in)
  const [linkedForms, setLinkedForms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [formResponses, setFormResponses] = useState<{ id: string; form_id: string; submitted_at: string; forms?: { name: string; type: string; fields: { id: string; label: string }[] }; responses: Record<string, unknown> }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<{id:string;action:string;changed_at:string;changed_by_name:string;changes:{field:string;from:string|null;to:string|null}[]}[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Offers
  const [offers, setOffers]                   = useState<CandidateOffer[]>([]);
  const [offersLoading, setOffersLoading]     = useState(false);
  const [offerView, setOfferView]             = useState<"list" | "create" | "ctc_creator" | "offer_letter">("list");
  const [activeOffer, setActiveOffer]         = useState<CandidateOffer | null>(null);
  const [ctcTemplateId, setCtcTemplateId]     = useState("NGCTC-1");
  const [annualCtcInput, setAnnualCtcInput]   = useState("");
  const [ctcBreakdown, setCtcBreakdown]       = useState<CTCBreakdown | null>(null);
  const [editedBreakdown, setEditedBreakdown] = useState<Partial<CTCBreakdown>>({});
  const [offerFormData, setOfferFormData]     = useState({ designation: "", site: "", joining_date: "", reporting_to: "", probation_months: 6, notes: "" });
  const [savingOffer, setSavingOffer]         = useState(false);
  const [offerLetterHtml, setOfferLetterHtml] = useState("");

  // AI Parse resume
  const [parsing, setParsing]         = useState(false);
  const [parsedFields, setParsedFields] = useState<Record<string, unknown> | null>(null);
  const parseFileRef = useRef<HTMLInputElement>(null);

  // AI Score
  const [aiScoring, setAiScoring] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason]       = useState("");
  const [deleteNotes, setDeleteNotes]         = useState("");
  const [deleting, setDeleting]               = useState(false);

  // Co-sourcer
  const [showCoSourcerModal, setShowCoSourcerModal] = useState(false);
  const [coSourcerRecruiter, setCoSourcerRecruiter] = useState("");
  const [linkingCoSourcer, setLinkingCoSourcer]     = useState(false);

  // Forward / handoff
  const [showForwardModal, setShowForwardModal]   = useState(false);
  const [forwardToUserId, setForwardToUserId]     = useState("");
  const [forwardTabs, setForwardTabs]             = useState<string[]>([]);
  const [forwardNote, setForwardNote]             = useState("");
  const [forwarding, setForwarding]               = useState(false);
  // Active forward TO this user (they are the recipient)
  interface ActiveForward { id: string; unlocked_tabs: string[]; from_profile: { name: string } | null }
  const [activeForward, setActiveForward]         = useState<ActiveForward | null>(null);
  const [completing, setCompleting]               = useState(false);

  const isAdmin = ["admin", "hr_manager"].includes(profile.role);
  // canEdit is false when the current tab is locked by an active forward
  const tabLocked = activeForward !== null && !activeForward.unlocked_tabs.includes(tab);
  const canEdit = !tabLocked;
  const canDelete = isAdmin || (!cand ? true : cand.created_by === profile.id || cand.hr_id === profile.id);

  const fetchCandidate = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}`);
      if (!res.ok) return;
      const json = await res.json();
      setCand(json.data); setForm(json.data);
      const csRes = await fetch(`/api/co-sourcers?candidate_id=${candidateId}`);
      if (!csRes.ok) return;
      const csJson = await csRes.json();
      setCoSourcers(csJson.data ?? []);
    } catch (e) {
      // Transient network / HMR-abort; surfaces as "Failed to fetch". Silent retry on next mount.
      console.warn("fetchCandidate failed:", e);
    }
  }, [candidateId]);

  const fetchActiveForward = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidate-forwards?candidate_id=${candidateId}&to_me=true&status=pending`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveForward(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch {}
  }, [candidateId]);

  const fetchComms = useCallback(async () => {
    setCommsLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/communications`);
      if (res.ok) { const j = await res.json(); setComms(j.data ?? []); }
    } catch (e) {
      console.warn("fetchComms failed:", e);
    } finally {
      setCommsLoading(false);
    }
  }, [candidateId]);

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/files`);
      if (res.ok) { const j = await res.json(); setFiles(j.data ?? []); }
    } catch (e) {
      console.warn("fetchFiles failed:", e);
    } finally {
      setFilesLoading(false);
    }
  }, [candidateId]);

  const fetchForms = useCallback(async () => {
    setFormsLoading(true);
    try {
      const [responsesRes, formsRes] = await Promise.all([
        fetch(`/api/form-responses?candidate_id=${candidateId}`).then(r => r.json()),
        fetch("/api/forms").then(r => r.json()),
      ]);
      setFormResponses(responsesRes.data ?? []);
      setLinkedForms(formsRes.data ?? []);
    } catch (e) {
      console.warn("fetchForms failed:", e);
    } finally {
      setFormsLoading(false);
    }
  }, [candidateId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/activity-logs?candidate_id=${candidateId}`);
      if (res.ok) { const j = await res.json(); setHistoryEntries(j.data ?? []); }
    } catch (e) {
      console.warn("fetchHistory failed:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [candidateId]);

  const fetchOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/offers`);
      if (res.ok) { const j = await res.json(); setOffers(j.data ?? []); }
    } catch (e) {
      console.warn("fetchOffers failed:", e);
    } finally {
      setOffersLoading(false);
    }
  }, [candidateId]);

  useEffect(() => { fetchCandidate(); fetchActiveForward(); }, [fetchCandidate, fetchActiveForward]);
  useEffect(() => { if (tab === "comms") fetchComms(); }, [tab, fetchComms]);
  useEffect(() => { if (tab === "files") fetchFiles(); }, [tab, fetchFiles]);
  useEffect(() => { if (tab === "forms") fetchForms(); }, [tab, fetchForms]);
  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, fetchHistory]);
  useEffect(() => { if (tab === "offer") fetchOffers(); }, [tab, fetchOffers]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function handleChange(key: keyof Candidate, value: string | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!cand || !dirty) return;
    setSaving(true);
    try {
      const WRITABLE: (keyof Candidate)[] = [
        "name", "mobile", "email", "current_designation", "month", "application_date",
        "naukri_link", "naukri_profile_url", "suitable_other_position", "current_location",
        "present_salary", "expected_salary", "offered_salary", "notice_period_days",
        "google_form_sent", "google_form_received", "processed_by_hr", "shortlist_by_hr",
        "tel_int_date", "tel_int_remarks", "hr_manager_remarks", "remarks_before_pi",
        "mgmt_remarks_before_pi", "shortlisted_for_pi",
        "pi1_date", "pi1_taken_by", "pi1_remarks", "pi2_date", "pi2_taken_by", "pi2_remarks",
        "pi3_date", "pi3_taken_by", "pi3_remarks",
        "gf_issued", "shortlisted_by_mgmt", "gf_issue_date", "gf_received_date",
        "gf_verified", "gf_verification_report", "addr_verification_shared", "addr_verification_received",
        "remarks", "final_status", "final_action", "file_no", "doj", "doj_potential", "doj_actual",
        "hard_copy", "staffingo_emp_id", "custom_data",
      ];
      const payload: Record<string, unknown> = {};
      for (const key of WRITABLE) {
        if (key in form) payload[key] = (form as Record<string, unknown>)[key];
      }
      if (form.designation_name !== cand.designation_name)
        payload.designation_id = designations.find(d => d.name === form.designation_name)?.id ?? null;
      if (form.site_name !== cand.site_name)
        payload.site_id = sites.find(s => s.name === form.site_name)?.id ?? null;
      if (form.source_name !== cand.source_name)
        payload.source_id = sources.find(s => s.name === form.source_name)?.id ?? null;

      const res = await fetch(`/api/candidates/${cand.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Save failed"); }
      else { setDirty(false); toast.success("Saved"); onUpdated(); await fetchCandidate(); }
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  async function patchCustomData(patch: Record<string, unknown>) {
    if (!cand) return;
    const updated = { ...((cand.custom_data as Record<string, unknown>) ?? {}), ...patch };
    const res = await fetch(`/api/candidates/${cand.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_data: updated }),
    });
    if (res.ok) { await fetchCandidate(); }
    return updated;
  }

  async function sendForward() {
    if (!cand || !forwardToUserId || forwardTabs.length === 0) {
      toast.error("Pick a recipient and at least one section");
      return;
    }
    setForwarding(true);
    try {
      const res = await fetch("/api/candidate-forwards", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: cand.id, to_user_id: forwardToUserId, unlocked_tabs: forwardTabs, note: forwardNote || null }),
      });
      if (res.ok) {
        toast.success("Candidate forwarded successfully");
        setShowForwardModal(false);
        setForwardToUserId(""); setForwardTabs([]); setForwardNote("");
      } else {
        const err = await res.json(); toast.error(err.error ?? "Failed to forward");
      }
    } catch { toast.error("Failed to forward"); }
    finally { setForwarding(false); }
  }

  async function completeForward() {
    if (!activeForward) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/candidate-forwards/${activeForward.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok) {
        toast.success("Marked as complete — recruiter notified");
        setActiveForward(null);
      } else {
        const err = await res.json(); toast.error(err.error ?? "Failed");
      }
    } catch { toast.error("Failed"); }
    finally { setCompleting(false); }
  }

  async function handleDelete() {
    if (!cand) return;
    if (isAdmin) {
      setDeleting(true);
      try {
        const res = await fetch(`/api/candidates/${cand.id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Candidate deleted"); onUpdated(); onClose(); }
        else { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
      } finally { setDeleting(false); }
    } else {
      if (!deleteReason) { toast.error("Please select a reason"); return; }
      setDeleting(true);
      try {
        const res = await fetch("/api/deletion-requests", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate_id: cand.id, reason: deleteReason, notes: deleteNotes }),
        });
        if (res.ok) { toast.success("Deletion request submitted"); setShowDeleteModal(false); onClose(); }
        else { const err = await res.json(); toast.error(err.error ?? "Failed to submit"); }
      } finally { setDeleting(false); }
    }
  }

  async function linkCoSourcer() {
    if (!coSourcerRecruiter || !cand) return;
    setLinkingCoSourcer(true);
    try {
      const res = await fetch("/api/co-sourcers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: cand.id, recruiter_id: coSourcerRecruiter }),
      });
      if (res.ok) { toast.success("Co-sourcer linked"); setShowCoSourcerModal(false); setCoSourcerRecruiter(""); fetchCandidate(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } finally { setLinkingCoSourcer(false); }
  }

  async function removeCoSourcer(id: string) {
    const res = await fetch(`/api/co-sourcers?id=${id}`, { method: "DELETE" });
    if (res.ok) { fetchCandidate(); toast.success("Removed"); }
  }

  async function saveDocChecklist(key: string, checked: boolean) {
    if (!cand) return;
    const updated = { ...((cand.custom_data as Record<string, unknown>) ?? {}), [key]: checked };
    await fetch(`/api/candidates/${cand.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_data: updated }),
    });
    setCand(prev => prev ? { ...prev, custom_data: updated } : prev);
  }

  async function logComm() {
    if (!logContent.trim()) { toast.error("Content required"); return; }
    setSavingLog(true);
    const res = await fetch(`/api/candidates/${candidateId}/communications`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: logType, direction: logDir, subject: logSubject, content: logContent, template_used: logTemplate || undefined }),
    });
    if (res.ok) {
      toast.success("Logged");
      setShowLogForm(false); setLogContent(""); setLogSubject(""); setLogTemplate("");
      fetchComms();
    } else { const e = await res.json(); toast.error(e.error ?? "Failed"); }
    setSavingLog(false);
  }

  async function deleteComm(commId: string) {
    const res = await fetch(`/api/candidates/${candidateId}/communications?comm_id=${commId}`, { method: "DELETE" });
    if (res.ok) { fetchComms(); toast.success("Deleted"); }
  }

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", uploadCategory);
    const res = await fetch(`/api/candidates/${candidateId}/files`, { method: "POST", body: fd });
    if (res.ok) { toast.success("File uploaded"); fetchFiles(); }
    else { const e = await res.json(); toast.error(e.error ?? "Upload failed"); }
    setUploading(false);
  }

  async function deleteFile(fileId: string) {
    const res = await fetch(`/api/candidates/${candidateId}/files?file_id=${fileId}`, { method: "DELETE" });
    if (res.ok) { fetchFiles(); toast.success("Deleted"); }
  }

  // ── Offer helpers ─────────────────────────────────────────────────────────────
  function recalcCTC() {
    const v = parseFloat(annualCtcInput);
    if (!isNaN(v) && v > 0) {
      const bd = computeCTC(v, ctcTemplateId);
      setCtcBreakdown(bd);
      setEditedBreakdown({});
    }
  }

  function getMergedBreakdown(): CTCBreakdown | null {
    if (!ctcBreakdown) return null;
    return { ...ctcBreakdown, ...editedBreakdown } as CTCBreakdown;
  }

  async function saveOffer(statusOverride?: string) {
    if (!cand) return;
    setSavingOffer(true);
    try {
      const bd = getMergedBreakdown();
      const payload: Record<string, unknown> = {
        ctc_template_id: ctcTemplateId,
        annual_ctc: (bd?.annual_ctc ?? (parseFloat(annualCtcInput) || null)),
        ctc_data: bd ?? null,
        designation: offerFormData.designation || cand.designation_name || "",
        site: offerFormData.site || cand.site_name || "",
        joining_date: offerFormData.joining_date || null,
        reporting_to: offerFormData.reporting_to || "",
        probation_months: offerFormData.probation_months,
        notes: offerFormData.notes,
        status: statusOverride ?? "draft",
      };

      if (activeOffer) {
        // Update existing
        const res = await fetch(`/api/candidates/${candidateId}/offers`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer_id: activeOffer.id, ...payload }),
        });
        if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Save failed"); return; }
        toast.success("Offer updated");
      } else {
        // Create new
        const res = await fetch(`/api/candidates/${candidateId}/offers`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Save failed"); return; }
        const j = await res.json();
        setActiveOffer(j.data);
        toast.success("Offer saved");
      }
      await fetchOffers();
      setOfferView("list");
    } finally {
      setSavingOffer(false);
    }
  }

  async function updateOfferStatus(offerId: string, status: string, extra?: Record<string,unknown>) {
    const res = await fetch(`/api/candidates/${candidateId}/offers`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer_id: offerId, status, ...extra }),
    });
    if (res.ok) { await fetchOffers(); toast.success("Status updated"); onUpdated(); }
    else { const e = await res.json(); toast.error(e.error ?? "Failed"); }
  }

  function openCTCCreator(offer?: CandidateOffer) {
    if (offer) {
      setActiveOffer(offer);
      setCtcTemplateId(offer.ctc_template_id ?? "NGCTC-1");
      setAnnualCtcInput(offer.annual_ctc ? String(offer.annual_ctc) : "");
      if (offer.ctc_data) setCtcBreakdown(offer.ctc_data as unknown as CTCBreakdown);
      setOfferFormData({
        designation: offer.designation ?? cand?.designation_name ?? "",
        site: offer.site ?? cand?.site_name ?? "",
        joining_date: offer.joining_date ?? "",
        reporting_to: offer.reporting_to ?? "",
        probation_months: offer.probation_months ?? 6,
        notes: offer.notes ?? "",
      });
    } else {
      setActiveOffer(null);
      setCtcTemplateId("NGCTC-1");
      setAnnualCtcInput(cand?.expected_salary ? String(cand.expected_salary) : "");
      setCtcBreakdown(null);
      setEditedBreakdown({});
      setOfferFormData({
        designation: cand?.designation_name ?? "",
        site: cand?.site_name ?? "",
        joining_date: "",
        reporting_to: "",
        probation_months: 6,
        notes: "",
      });
    }
    setOfferView("ctc_creator");
  }

  function openOfferLetterPreview(offer: CandidateOffer) {
    const html = generateOfferLetterHTML({
      candidateName: cand?.name ?? "",
      designation: offer.designation ?? cand?.designation_name ?? "",
      site: offer.site ?? cand?.site_name ?? "",
      joiningDate: offer.joining_date ?? "",
      reportingTo: offer.reporting_to ?? "HR Manager",
      probationMonths: offer.probation_months ?? 6,
    });
    setActiveOffer(offer);
    setOfferLetterHtml(html);
    setOfferView("offer_letter");
  }

  // ── AI Resume Parse ────────────────────────────────────────────────────────────
  async function parseResume(file: File) {
    setParsing(true);
    setParsedFields(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Parse failed"); return; }
      const j = await res.json();
      setParsedFields(j.data ?? {});
      toast.success("Resume parsed — review and apply fields below");
    } catch { toast.error("Parse failed"); }
    finally { setParsing(false); }
  }

  async function scoreWithAI() {
    if (!cand) return;
    setAiScoring(true);
    try {
      const res = await fetch(`/api/candidates/${cand.id}/score`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Scoring failed"); return; }
      await fetchCandidate();
      toast.success("AI score updated");
    } catch { toast.error("Scoring failed"); }
    finally { setAiScoring(false); }
  }

  async function applyParsedFields(fields: Record<string, unknown>) {
    if (!cand) return;
    const allowed: (keyof Candidate)[] = [
      "name","email","mobile","current_designation","current_location",
      "present_salary","expected_salary","notice_period_days","naukri_profile_url","ai_summary",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    const res = await fetch(`/api/candidates/${cand.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setForm(prev => ({ ...prev, ...patch }));
      setParsedFields(null);
      await fetchCandidate();
      toast.success("Fields applied from resume");
    } else {
      const e = await res.json();
      toast.error(e.error ?? "Apply failed");
    }
  }

  function applyEmailTemplate(tplId: string) {
    const tpl = EMAIL_TEMPLATES.find(t => t.id === tplId);
    if (!tpl || !cand) return;
    setEmailTemplate(tplId);
    setEmailSubject(tpl.subject);
    setEmailBody(tpl.body(cand.name ?? "Candidate"));
  }

  function openMailto() {
    if (!cand?.email) { toast.error("No email address for this candidate"); return; }
    const mailto = `mailto:${cand.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailto);
    // Auto-log
    if (emailBody.trim()) {
      fetch(`/api/candidates/${candidateId}/communications`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", direction: "sent", subject: emailSubject, content: emailBody, template_used: emailTemplate || undefined }),
      }).then(() => fetchComms());
    }
  }

  function openWhatsApp(templateId?: string) {
    if (!cand) return;
    const mobile = (cand.mobile ?? "").replace(/\D/g, "");
    if (!mobile) { toast.error("No mobile number for this candidate"); return; }
    const tpl = templateId ? WHATSAPP_TEMPLATES.find(t => t.id === templateId) : null;
    const text = tpl ? tpl.text(cand.name ?? "there") : "";
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`);
  }

  if (!cand) return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden sm:block flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full sm:w-[600px] bg-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    </div>
  );

  const customData = (cand.custom_data as Record<string, unknown>) ?? {};
  const coSourcerList = coSourcers.filter(cs => cs.role === "co_sourcer");

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",   label: "Overview"    },
    { key: "telephonic", label: "Telephonic"  },
    { key: "pi",         label: "PI Rounds"   },
    { key: "gf",         label: "GF / Screening" },
    { key: "offer",      label: "Offer"       },
    { key: "comms",      label: "Comms"       },
    { key: "files",      label: "Files"       },
    { key: "forms",      label: "Forms"       },
    { key: "final",      label: "Final"       },
    { key: "notes",      label: "Notes"       },
    { key: "history",    label: "🕐 History"  },
  ];

  const DOC_CHECKLIST = [
    "Aadhaar Card", "PAN Card", "Last 3 Payslips", "Experience Letter",
    "Educational Certificates", "Bank Details", "Passport Photo (2 copies)", "Background Check Consent",
  ];

  return (
    <PanelContext.Provider value={{ form, canEdit, onChange: handleChange }}>
    <>
      <div className="hidden sm:block fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-[600px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="border-b border-gray-200 px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-gray-900 truncate">{cand.name}</h2>
                {cand.ai_score != null && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,#667eea,#764ba2)" }}>
                    AI {cand.ai_score}
                  </span>
                )}
                {cand.final_status && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    cand.final_status === "Joined" ? "bg-green-100 text-green-700" :
                    cand.final_status.toLowerCase().includes("offer") ? "bg-brand-100 text-brand-700" :
                    cand.final_status.toLowerCase().includes("pi") ? "bg-indigo-100 text-indigo-700" :
                    "bg-gray-100 text-gray-600"}`}>{cand.final_status}</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {cand.designation_name} · {cand.site_name} · {cand.hr_name}
              </p>
              {coSourcerList.length > 0 && (
                <p className="text-xs text-brand-500 mt-0.5">Co-sourced: {coSourcerList.map(cs => cs.recruiter_name).join(", ")}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Forward / send candidate to higher manager */}
              <button
                title="Forward candidate to another team member"
                onClick={() => setShowForwardModal(true)}
                className="text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <Share2 size={16} />
              </button>
              {/* Quick action buttons */}
              <button title="Email candidate"
                onClick={() => { setTab("comms"); setShowEmailComposer(true); }}
                className="text-gray-400 hover:text-blue-600 transition-colors"><Mail size={16} /></button>
              <button title="WhatsApp candidate"
                onClick={() => openWhatsApp()}
                className="text-gray-400 hover:text-green-600 transition-colors"><MessageSquare size={16} /></button>
              {cand.mobile && (
                <a href={`tel:${cand.mobile}`} title="Call candidate"
                  className="text-gray-400 hover:text-brand-600 transition-colors"><Phone size={16} /></a>
              )}
              {canDelete && (
                <button onClick={() => setShowDeleteModal(true)}
                  className="text-xs border border-red-200 text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1">
                  <Trash2 size={12} />{isAdmin ? "Delete" : "Request"}
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2">
            <button onClick={scoreWithAI} disabled={aiScoring}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 transition-colors">
              <Sparkles size={12} />
              {aiScoring ? "Scoring…" : cand.ai_score != null ? "Re-score" : "Score with AI"}
            </button>
            {cand.ai_summary && (
              <div className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <p className="text-xs font-bold text-indigo-700 mb-1">✦ AI Summary</p>
                <p className="text-xs text-gray-700 leading-relaxed">{cand.ai_summary}</p>
              </div>
            )}
          </div>

          {/* Active forward banner — shown when this user is the recipient */}
          {activeForward && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Lock size={13} className="text-indigo-500 flex-shrink-0" />
                <p className="text-xs text-indigo-700">
                  <span className="font-semibold">{activeForward.from_profile?.name ?? "A recruiter"}</span> forwarded this candidate — you can edit:{" "}
                  <span className="font-medium">{activeForward.unlocked_tabs.join(", ")}</span>
                </p>
              </div>
              <button
                onClick={completeForward}
                disabled={completing}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                <CheckCircle size={12} />
                {completing ? "Saving…" : "Mark Complete"}
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex mt-3 -mb-px gap-0 overflow-x-auto">
            {TABS.map(t => {
              const locked = activeForward !== null && !activeForward.unlocked_tabs.includes(t.key);
              return (
                <button key={t.key}
                  onClick={() => !locked && setTab(t.key)}
                  title={locked ? "Locked — not included in this review" : undefined}
                  className={`relative px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                    locked
                      ? "border-transparent text-gray-300 cursor-not-allowed"
                      : tab === t.key
                        ? "border-brand-500 text-brand-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  {locked && <Lock size={9} className="inline mr-0.5 opacity-50" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name"><Input field="name" /></Field>
                <Field label="Mobile"><Input field="mobile" /></Field>
                <Field label="Email"><Input field="email" type="email" /></Field>
                <Field label="Current Designation"><Input field="current_designation" /></Field>
                <Field label="Applied For">
                  <Select field="designation_name" options={designations.map(d => ({ value: d.name, label: d.name }))} />
                </Field>
                <Field label="Site">
                  <Select field="site_name" options={sites.map(s => ({ value: s.name, label: s.name }))} />
                </Field>
                <Field label="Location"><Input field="current_location" /></Field>
                <Field label="Source">
                  <Select field="source_name" options={sources.map(s => ({ value: s.name, label: s.name }))} />
                </Field>
                <Field label="Current CTC (₹)"><Input field="present_salary" type="number" /></Field>
                <Field label="Expected CTC (₹)"><Input field="expected_salary" type="number" /></Field>
                <Field label="Notice Period (days)"><Input field="notice_period_days" type="number" /></Field>
                <Field label="Profile URL">
                  <div className="flex gap-1">
                    <Input field="naukri_profile_url" />
                    {cand.naukri_profile_url && (
                      <a href={cand.naukri_profile_url} target="_blank" rel="noopener noreferrer"
                        className="border border-gray-200 px-2 rounded-lg text-brand-500 hover:bg-gray-50 flex items-center">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </Field>
                <Field label="Current Status">
                  <Select field="final_status" options={[
                    "Sourced","Applied","Recruiter Screening Done","HR Manager Screening Done",
                    "Dept Mgr Screening Done","Mgmt Approved for PI Call","Called for PI",
                    "Did Not Attend Interview","PI 1 Done","PI 2 Done","GF Issued","Shortlisted",
                    "Shortlisted But Not Offered","Hold","Suitable for Future","Offered But Did Not Join",
                    "Offered","Not Interested","Rejected","Appointed","Joined","Joined & Left",
                    "Active Employee","Not Yet Processed","Other","Dropped By Candidate",
                  ].map(s => ({ value: s, label: s }))} />
                </Field>
              </div>
              {/* Co-sourcing */}
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-brand-700">Co-sourcing</p>
                  {canEdit && (
                    <button onClick={() => setShowCoSourcerModal(true)}
                      className="text-xs text-brand-600 border border-brand-300 px-2 py-1 rounded hover:bg-brand-100 flex items-center gap-1">
                      <UserPlus size={11} /> Link
                    </button>
                  )}
                </div>
                {coSourcerList.length === 0 && <p className="text-xs text-gray-400">No co-sourcers linked</p>}
                {coSourcerList.map(cs => (
                  <div key={cs.id} className="flex items-center justify-between text-xs text-gray-600 py-0.5">
                    <span>Co-sourcer: <strong>{cs.recruiter_name}</strong></span>
                    {isAdmin && <button onClick={() => removeCoSourcer(cs.id)} className="text-red-400 hover:text-red-600 ml-2">✕</button>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── TELEPHONIC ── */}
          {tab === "telephonic" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tel. Int. Date"><Input field="tel_int_date" type="date" /></Field>
              <Field label="GF Sent">
                <Select field="google_form_sent" options={["Yes","No","NA"].map(v => ({ value: v, label: v }))} />
              </Field>
              <Field label="GF Received">
                <Select field="google_form_received" options={["Yes","No","NA"].map(v => ({ value: v, label: v }))} />
              </Field>
              <Field label="Shortlisted by HR">
                <Select field="shortlist_by_hr" options={["Yes","No","NA"].map(v => ({ value: v, label: v }))} />
              </Field>
              <Field label="Tel Int Remarks" className="col-span-2"><Textarea field="tel_int_remarks" rows={3} /></Field>
              <Field label="HR Mgr Remarks" className="col-span-2"><Textarea field="hr_manager_remarks" rows={3} /></Field>
              <Field label="HOD Comments Before PI" className="col-span-2"><Textarea field="remarks_before_pi" rows={2} /></Field>
              <Field label="Mgmt Remarks Before PI" className="col-span-2"><Textarea field="mgmt_remarks_before_pi" rows={2} /></Field>
              <Field label="Shortlisted for PI">
                <Select field="shortlisted_for_pi" options={["Yes","No"].map(v => ({ value: v, label: v }))} />
              </Field>
            </div>
          )}

          {/* ── GF / SCREENING ── */}
          {tab === "gf" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="GF Issue Date"><Input field="gf_issue_date" type="date" /></Field>
              <Field label="GF Received Date"><Input field="gf_received_date" type="date" /></Field>
              <Field label="GF Verified"><Input field="gf_verified" /></Field>
              <Field label="Shortlisted by Mgmt">
                <Select field="shortlisted_by_mgmt" options={["Yes","No","Hold"].map(v => ({ value: v, label: v }))} />
              </Field>
              <Field label="GF Verification Report" className="col-span-2"><Textarea field="gf_verification_report" rows={2} /></Field>
              <Field label="Address Verification Sent"><Input field="addr_verification_shared" type="date" /></Field>
              <Field label="Address Verification Received"><Input field="addr_verification_received" type="date" /></Field>
            </div>
          )}

          {/* ── PI ROUNDS ── */}
          {tab === "pi" && (
            <div className="space-y-4">
              {[1, 2, 3].map(round => {
                const dateKey = `pi${round}_date` as keyof Candidate;
                const dateVal = (form[dateKey] as string) ?? "";
                const meetKey = `pi${round}_meet_link`;
                const meetVal = (customData[meetKey] as string) ?? "";
                const calTitle = `PI ${round} Interview — ${cand.name}`;
                return (
                  <div key={round} className="border border-gray-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">PI Round {round}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={`PI ${round} Date`}><Input field={dateKey} type="date" /></Field>
                      <Field label={`PI ${round} Taken By`}><Input field={`pi${round}_taken_by` as keyof Candidate} /></Field>
                      <Field label={`PI ${round} Remarks`} className="col-span-2">
                        <Textarea field={`pi${round}_remarks` as keyof Candidate} rows={2} />
                      </Field>
                    </div>

                    {/* Meet & Calendar row */}
                    <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                      <p className="text-xs font-medium text-gray-600">Scheduling</p>
                      <div className="flex gap-2 items-center">
                        <input
                          value={meetVal}
                          onChange={e => {
                            const v = e.target.value;
                            patchCustomData({ [meetKey]: v || undefined });
                          }}
                          placeholder="Google Meet link (paste or generate below)"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
                          title="Create new Google Meet"
                          className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 whitespace-nowrap">
                          <Video size={12} /> New Meet
                        </a>
                      </div>
                      <div className="flex gap-2">
                        {dateVal && (
                          <a href={buildCalendarUrl(calTitle, dateVal, meetVal || undefined)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100">
                            <Calendar size={12} /> Add to Google Calendar
                          </a>
                        )}
                        {meetVal && (
                          <a href={meetVal} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-100">
                            <Video size={12} /> Join Meet
                          </a>
                        )}
                        {!dateVal && <p className="text-xs text-gray-400 italic">Set PI date above to enable calendar link</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── COMMS ── */}
          {tab === "comms" && (
            <div className="space-y-3">
              {/* Quick action row */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setShowEmailComposer(true); setShowLogForm(false); }}
                  className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                  <Mail size={12} /> Compose Email
                </button>
                <div className="relative group">
                  <button onClick={() => openWhatsApp()}
                    className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100">
                    <MessageSquare size={12} /> WhatsApp
                  </button>
                </div>
                {WHATSAPP_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => openWhatsApp(t.id)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    WA: {t.label}
                  </button>
                ))}
                <button onClick={() => { setShowLogForm(!showLogForm); setShowEmailComposer(false); }}
                  className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 ml-auto">
                  <Plus size={12} /> Log Entry
                </button>
              </div>

              {/* Email composer */}
              {showEmailComposer && (
                <div className="border border-blue-200 rounded-xl p-3 space-y-2 bg-blue-50/30">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1"><Mail size={12} /> Email to {cand.email || "—"}</p>
                    <button onClick={() => setShowEmailComposer(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
                  </div>
                  <select value={emailTemplate} onChange={e => applyEmailTemplate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Use a template or write freely —</option>
                    {EMAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                  <textarea rows={5} value={emailBody} onChange={e => setEmailBody(e.target.value)}
                    placeholder="Email body…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <button onClick={openMailto}
                    className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">
                    <Send size={12} /> Open in Email Client
                  </button>
                  <p className="text-xs text-gray-400">Opens your default email app. The message is auto-logged here.</p>
                </div>
              )}

              {/* Manual log form */}
              {showLogForm && (
                <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Log Communication</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={logType} onChange={e => setLogType(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500">
                      {["email","whatsapp","call","other"].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                    </select>
                    <select value={logDir} onChange={e => setLogDir(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="sent">Sent</option>
                      <option value="received">Received</option>
                      <option value="logged">Logged (note)</option>
                    </select>
                  </div>
                  <input value={logSubject} onChange={e => setLogSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500" />
                  <textarea rows={3} value={logContent} onChange={e => setLogContent(e.target.value)}
                    placeholder="Summary of conversation or message…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={logComm} disabled={savingLog}
                      className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-60">
                      {savingLog ? "Saving…" : "Save Log"}
                    </button>
                    <button onClick={() => setShowLogForm(false)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              {/* Log entries */}
              {commsLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              ) : comms.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No communication logged yet</p>
              ) : (
                <div className="space-y-2">
                  {comms.map(c => {
                    const icon = c.type === "email" ? "✉️" : c.type === "whatsapp" ? "💬" : c.type === "call" ? "📞" : "📝";
                    const dirColor = c.direction === "sent" ? "text-blue-600" : c.direction === "received" ? "text-green-600" : "text-gray-500";
                    return (
                      <div key={c.id} className="bg-gray-50 rounded-lg p-2.5 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span>{icon}</span>
                            <span className={`text-xs font-medium ${dirColor}`}>{c.direction}</span>
                            {c.subject && <span className="text-xs text-gray-700 font-medium truncate">— {c.subject}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}</span>
                            <span className="text-xs text-gray-400">{c.profiles?.name ?? ""}</span>
                            <button onClick={() => deleteComm(c.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── FILES ── */}
          {tab === "files" && (
            <div className="space-y-4">
              {/* AI Resume Parser */}
              <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                    <Sparkles size={13} /> AI Resume Parser
                  </p>
                  {parsing && <span className="text-xs text-indigo-500 animate-pulse">Parsing…</span>}
                </div>
                <p className="text-xs text-gray-500 mb-2">Upload CV (PDF/Word) to auto-fill candidate fields. All fields remain editable.</p>
                <input ref={parseFileRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={e => { if (e.target.files?.[0]) parseResume(e.target.files[0]); e.target.value = ""; }} />
                <button onClick={() => parseFileRef.current?.click()} disabled={parsing}
                  className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                  <Sparkles size={11} /> {parsing ? "Parsing CV…" : "Parse CV with AI"}
                </button>

                {/* Parsed fields preview */}
                {parsedFields && Object.keys(parsedFields).length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-medium text-gray-700">Extracted fields — review before applying:</p>
                    <div className="bg-white border border-indigo-200 rounded-lg p-2.5 space-y-1 max-h-48 overflow-y-auto">
                      {Object.entries(parsedFields).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="text-gray-400 w-36 shrink-0 capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-gray-800 font-medium break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => applyParsedFields(parsedFields)}
                        className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                        <CheckCircle size={11} /> Apply to Candidate
                      </button>
                      <button onClick={() => setParsedFields(null)}
                        className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload area */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-brand-300 transition-colors">
                <Upload size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-500 mb-2">Drop file or click to upload (max 20 MB)</p>
                <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                  {["cv","certificate","onboarding","form_response","other"].map(cat => (
                    <button key={cat} onClick={() => setUploadCategory(cat)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        uploadCategory === cat ? "bg-brand-500 text-white border-brand-500" : "border-gray-200 text-gray-600 hover:border-brand-300"}`}>
                      {CAT_LABEL[cat]}
                    </button>
                  ))}
                </div>
                <input ref={fileInputRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.txt"
                  onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ""; }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-60">
                  {uploading ? "Uploading…" : "Choose File"}
                </button>
              </div>

              {/* Docs checklist */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Document Checklist</p>
                <div className="space-y-1.5">
                  {DOC_CHECKLIST.map(doc => {
                    const key = `doc_${doc.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "")}`;
                    const checked = Boolean(customData[key]);
                    return (
                      <label key={doc} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg">
                        <input type="checkbox" checked={checked} disabled={!canEdit}
                          onChange={e => saveDocChecklist(key, e.target.checked)}
                          className="accent-brand-500 w-3.5 h-3.5" />
                        <span className={checked ? "line-through text-gray-400" : "text-gray-700"}>{doc}</span>
                        {checked && <span className="text-xs text-green-600 ml-auto">✓</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Uploaded files list */}
              {filesLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              ) : files.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Uploaded Files</p>
                  <div className="space-y-2">
                    {files.map(f => (
                      <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 group">
                        <Paperclip size={13} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 font-medium truncate">{f.file_name}</p>
                          <p className="text-xs text-gray-400">{formatBytes(f.file_size)} · {new Date(f.created_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" })}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${CAT_COLOR[f.file_category] ?? CAT_COLOR.other}`}>{CAT_LABEL[f.file_category] ?? f.file_category}</span>
                        {f.signed_url && (
                          <a href={f.signed_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs border border-gray-200 px-2 py-1 rounded text-gray-600 hover:bg-white flex items-center gap-1">
                            <ExternalLink size={10} /> View
                          </a>
                        )}
                        <button onClick={() => deleteFile(f.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FORMS ── */}
          {tab === "forms" && (
            <div className="space-y-4">
              {/* Google Form (retained) */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <span>📋</span> Google Form / Cognito Form
                </p>
                <Field label="Form URL">
                  <div className="flex gap-1">
                    <input
                      value={(customData.google_form_url as string) ?? ""}
                      onChange={e => patchCustomData({ google_form_url: e.target.value || undefined })}
                      placeholder="https://forms.google.com/… or Cognito form URL"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    {(customData.google_form_url as string) && (
                      <a href={customData.google_form_url as string} target="_blank" rel="noopener noreferrer"
                        className="border border-gray-200 px-2 rounded-lg text-brand-500 hover:bg-gray-50 flex items-center">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </Field>
                {(customData.google_form_url as string) && cand.email && (
                  <button
                    onClick={() => {
                      const formUrl = customData.google_form_url as string;
                      const body = `Dear ${cand.name ?? "Candidate"},\n\nKindly fill the following form at your earliest convenience:\n${formUrl}\n\nRegards,\nHR Team`;
                      window.open(`mailto:${cand.email}?subject=${encodeURIComponent("Action Required: Please Fill the Form")}&body=${encodeURIComponent(body)}`);
                      fetch(`/api/candidates/${candidateId}/communications`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "email", direction: "sent", subject: "Action Required: Please Fill the Form", content: body }),
                      }).then(() => fetchComms());
                      toast.success("Email client opened & logged");
                    }}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                    <Send size={12} /> Send Form Link via Email
                  </button>
                )}
                <Field label="Form Response Notes">
                  <textarea
                    rows={3}
                    value={(customData.google_form_response as string) ?? ""}
                    onChange={e => patchCustomData({ google_form_response: e.target.value || undefined })}
                    placeholder="Paste the candidate's form response or notes here…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </Field>
              </div>

              {/* Built-in Forms */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Built-in Forms</p>
                  <button onClick={fetchForms} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
                </div>
                {formsLoading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : linkedForms.length === 0 ? (
                  <p className="text-xs text-gray-400">No forms created yet. Go to JDs &amp; Forms to create one.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedForms.map(f => {
                      const responses = formResponses.filter(r => r.form_id === f.id);
                      const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "")}/f/${f.id}?c=${candidateId}`;
                      return (
                        <div key={f.id} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium text-gray-800">{f.name}</p>
                              <span className="text-xs text-gray-400 capitalize">{f.type.replace("_", " ")}</span>
                            </div>
                            <div className="flex gap-1">
                              {responses.length > 0 && (
                                <button
                                  onClick={() => {
                                    const latest = responses[responses.length - 1];
                                    const fields = (latest.forms?.fields ?? []) as { id: string; label: string; type?: string }[];
                                    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                    const groups: { title: string | null; rows: { label: string; value: string }[] }[] = [];
                                    let cur: { title: string | null; rows: { label: string; value: string }[] } = { title: null, rows: [] };
                                    for (const fld of fields) {
                                      if ((fld as { type?: string }).type === "section") {
                                        if (cur.rows.length || cur.title !== null) groups.push(cur);
                                        cur = { title: fld.label || "Section", rows: [] };
                                      } else {
                                        const v = latest.responses[fld.id];
                                        if (v !== undefined && v !== "" && v !== false) {
                                          cur.rows.push({ label: fld.label, value: typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) });
                                        }
                                      }
                                    }
                                    if (cur.rows.length || cur.title !== null) groups.push(cur);
                                    const nonEmpty = groups.filter(g => g.rows.length > 0);
                                    const body = nonEmpty.map(g =>
                                      `${g.title ? `<h3 class="sec">${esc(g.title)}</h3>` : ""}${g.rows.map(r => `<div class="row"><span class="lbl">${esc(r.label)}:</span><span class="val">${esc(r.value)}</span></div>`).join("")}`
                                    ).join("");
                                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(f.name)} — ${esc(cand?.name ?? "")}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#333}h1{font-size:16px;margin:0 0 2px}h2{font-size:11px;color:#666;font-weight:normal;margin:0 0 18px}.sec{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#ff2d87;border-bottom:1px solid #fed7aa;padding-bottom:3px;margin:14px 0 6px}.row{display:flex;gap:12px;margin:3px 0}.lbl{font-weight:600;min-width:150px;flex-shrink:0;color:#555}.val{color:#111}@media print{body{padding:0}}</style></head><body><h1>${esc(f.name)}</h1><h2>Candidate: ${esc(cand?.name ?? "")} &nbsp;·&nbsp; Submitted: ${new Date(latest.submitted_at).toLocaleDateString("en-IN")}</h2>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`;
                                    const w = window.open("", "_blank");
                                    if (w) { w.document.write(html); w.document.close(); }
                                  }}
                                  className="text-xs border border-green-200 px-2 py-1 rounded-lg text-green-600 hover:bg-green-50 flex items-center gap-1">
                                  <Download size={10} /> PDF
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  let copied = false;
                                  if (navigator.clipboard && window.isSecureContext) {
                                    try {
                                      await navigator.clipboard.writeText(shareUrl);
                                      copied = true;
                                    } catch {
                                      // fall through to execCommand
                                    }
                                  }
                                  if (!copied) {
                                    const ta = document.createElement("textarea");
                                    ta.value = shareUrl;
                                    ta.style.position = "fixed";
                                    ta.style.left = "-9999px";
                                    ta.style.top = "-9999px";
                                    document.body.appendChild(ta);
                                    ta.focus();
                                    ta.select();
                                    copied = document.execCommand("copy");
                                    document.body.removeChild(ta);
                                  }
                                  if (copied) {
                                    toast.success("Form link copied");
                                  } else {
                                    toast.error("Copy failed — select and copy this link manually: " + shareUrl);
                                  }
                                }}
                                className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-50">
                                Copy Link
                              </button>
                              {cand?.email && (
                                <button
                                  onClick={() => {
                                    const body = `Dear ${cand.name ?? "Candidate"},\n\nPlease fill out the following form:\n${shareUrl}\n\nRegards,\nHR Team`;
                                    window.open(`mailto:${cand.email}?subject=${encodeURIComponent(`Please fill: ${f.name}`)}&body=${encodeURIComponent(body)}`);
                                    fetch(`/api/candidates/${candidateId}/communications`, {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ type: "email", direction: "sent", subject: `Please fill: ${f.name}`, content: body }),
                                    }).then(() => fetchComms());
                                    toast.success("Email opened & logged");
                                  }}
                                  className="text-xs border border-blue-200 px-2 py-1 rounded-lg text-blue-600 hover:bg-blue-50">
                                  Send
                                </button>
                              )}
                            </div>
                          </div>
                          {responses.length > 0 && (
                            <div className="space-y-1">
                              {responses.map(r => (
                                <div key={r.id} className="bg-gray-50 rounded-lg p-2">
                                  <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedResponse(expandedResponse === r.id ? null : r.id)}>
                                    <span className="text-xs text-gray-500">Submitted {new Date(r.submitted_at).toLocaleDateString("en-IN")}</span>
                                    <span className="text-xs text-brand-500">{expandedResponse === r.id ? "▲ hide" : "▼ view"}</span>
                                  </div>
                                  {expandedResponse === r.id && r.forms?.fields && (
                                    <div className="mt-2 space-y-3">
                                      {(() => {
                                        const fields = r.forms.fields as { id: string; label: string; type?: string }[];
                                        // Group fields by section marker. Anything before the first section goes under "General".
                                        const groups: { title: string | null; rows: { id: string; label: string }[] }[] = [];
                                        let current: { title: string | null; rows: { id: string; label: string }[] } = { title: null, rows: [] };
                                        for (const f of fields) {
                                          if (f.type === "section") {
                                            if (current.rows.length || current.title !== null) groups.push(current);
                                            current = { title: f.label || "Section", rows: [] };
                                          } else if (r.responses[f.id] !== undefined && r.responses[f.id] !== "" && r.responses[f.id] !== false) {
                                            current.rows.push({ id: f.id, label: f.label });
                                          }
                                        }
                                        if (current.rows.length || current.title !== null) groups.push(current);
                                        // Drop empty groups so a section with no answers doesn't render an empty header
                                        const nonEmpty = groups.filter(g => g.rows.length > 0);
                                        if (nonEmpty.length === 0) return <p className="text-xs text-gray-400 italic">No answers in this submission.</p>;
                                        return nonEmpty.map((g, gi) => (
                                          <div key={gi} className="space-y-1">
                                            {g.title && (
                                              <p className="text-[10px] uppercase tracking-wider font-semibold text-brand-600 border-b border-brand-100 pb-0.5 mb-1">
                                                {g.title}
                                              </p>
                                            )}
                                            <div className="space-y-1 pl-1">
                                              {g.rows.map(row => {
                                                const v = r.responses[row.id];
                                                const display = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
                                                return (
                                                  <div key={row.id} className="flex gap-2 items-baseline">
                                                    <span className="text-xs text-gray-400 font-medium flex-shrink-0 min-w-[8rem]">{row.label}:</span>
                                                    <span className="text-xs text-gray-700 break-words">{display}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ));
                                      })()}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {responses.length === 0 && (
                            <p className="text-xs text-gray-400 italic">No responses yet</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── OFFER ── */}
          {tab === "offer" && (
            <div className="space-y-3">

              {/* ── OFFER LIST ── */}
              {offerView === "list" && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Offers</p>
                    <button onClick={() => openCTCCreator()}
                      className="flex items-center gap-1.5 text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600">
                      <Plus size={11} /> New Offer
                    </button>
                  </div>

                  {offersLoading ? (
                    <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
                  ) : offers.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                      <p className="text-xs text-gray-400 mb-3">No offers created yet</p>
                      <button onClick={() => openCTCCreator()}
                        className="text-xs bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600">
                        Create First Offer
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {offers.map(offer => {
                        const statusColors: Record<string, string> = {
                          draft: "bg-gray-100 text-gray-600",
                          ctc_sent: "bg-blue-100 text-blue-700",
                          ctc_confirmed: "bg-indigo-100 text-indigo-700",
                          offer_sent: "bg-brand-100 text-brand-700",
                          offer_confirmed: "bg-green-100 text-green-700",
                          joined: "bg-emerald-100 text-emerald-700",
                          withdrawn: "bg-red-100 text-red-600",
                        };
                        const statusLabel: Record<string, string> = {
                          draft: "Draft",
                          ctc_sent: "CTC Sent",
                          ctc_confirmed: "CTC Confirmed",
                          offer_sent: "Offer Sent",
                          offer_confirmed: "Offer Confirmed",
                          joined: "Joined",
                          withdrawn: "Withdrawn",
                        };
                        const locked = Boolean(offer.locked_at);
                        return (
                          <div key={offer.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[offer.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {statusLabel[offer.status] ?? offer.status}
                                </span>
                                {locked && <span title="Locked — HR Manager can edit"><Lock size={11} className="text-gray-400" /></span>}
                                {offer.ctc_template_id && (
                                  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{offer.ctc_template_id}</span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(offer.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                              </span>
                            </div>

                            {offer.annual_ctc && (
                              <p className="text-sm font-bold text-gray-900">
                                ₹{(offer.annual_ctc / 100000).toFixed(2)}L CTC
                                {offer.ctc_data && (
                                  <span className="text-xs font-normal text-gray-500 ml-2">
                                    (₹{Math.round((offer.ctc_data as Record<string,number>).net_take_home ?? 0).toLocaleString("en-IN")}/mo take-home)
                                  </span>
                                )}
                              </p>
                            )}

                            {offer.designation && (
                              <p className="text-xs text-gray-600">{offer.designation} · {offer.site}</p>
                            )}
                            {offer.joining_date && (
                              <p className="text-xs text-gray-500">
                                Joining: {new Date(offer.joining_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
                              </p>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-1.5 flex-wrap pt-1">
                              {(!locked || isAdmin) && offer.status !== "joined" && offer.status !== "withdrawn" && (
                                <button onClick={() => openCTCCreator(offer)}
                                  className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-50">
                                  Edit CTC
                                </button>
                              )}

                              {offer.status === "draft" && (
                                <button onClick={() => updateOfferStatus(offer.id, "ctc_sent")}
                                  className="text-xs bg-blue-500 text-white px-2.5 py-1 rounded-lg hover:bg-blue-600">
                                  Send CTC
                                </button>
                              )}

                              {offer.status === "ctc_sent" && (
                                <button onClick={() => updateOfferStatus(offer.id, "ctc_confirmed")}
                                  className="text-xs bg-indigo-500 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-600">
                                  Mark CTC Confirmed
                                </button>
                              )}

                              {(offer.status === "ctc_confirmed" || offer.status === "draft") && (
                                <button onClick={() => openOfferLetterPreview(offer)}
                                  className="text-xs bg-brand-500 text-white px-2.5 py-1 rounded-lg hover:bg-brand-600 flex items-center gap-1">
                                  <FileText size={11} /> Offer Letter
                                </button>
                              )}

                              {offer.status === "offer_sent" && (
                                <button onClick={() => updateOfferStatus(offer.id, "offer_confirmed")}
                                  className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-lg hover:bg-green-600">
                                  Mark Confirmed
                                </button>
                              )}

                              {offer.status === "offer_confirmed" && (
                                <button onClick={() => updateOfferStatus(offer.id, "joined")}
                                  className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-700 flex items-center gap-1">
                                  <CheckCircle size={11} /> Mark Joined
                                </button>
                              )}

                              {!["joined","withdrawn"].includes(offer.status) && (
                                <button onClick={() => updateOfferStatus(offer.id, "withdrawn")}
                                  className="text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">
                                  Withdraw
                                </button>
                              )}
                            </div>

                            {/* Timestamps */}
                            <div className="text-xs text-gray-400 space-y-0.5 pt-1 border-t border-gray-100">
                              {offer.ctc_sent_at && <p>CTC sent: {new Date(offer.ctc_sent_at).toLocaleString("en-IN", { day:"2-digit", month:"short" })}</p>}
                              {offer.ctc_confirmed_at && <p>CTC confirmed: {new Date(offer.ctc_confirmed_at).toLocaleString("en-IN", { day:"2-digit", month:"short" })}</p>}
                              {offer.offer_sent_at && <p>Offer sent: {new Date(offer.offer_sent_at).toLocaleString("en-IN", { day:"2-digit", month:"short" })}</p>}
                              {offer.offer_confirmed_at && <p>Offer confirmed: {new Date(offer.offer_confirmed_at).toLocaleString("en-IN", { day:"2-digit", month:"short" })}</p>}
                              {offer.joined_at && <p className="text-green-600 font-medium">Joined: {offer.joined_at}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── CTC CREATOR ── */}
              {offerView === "ctc_creator" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setOfferView("list")}
                      className="text-xs text-gray-400 hover:text-gray-700">← Back</button>
                    <p className="text-xs font-semibold text-gray-700">
                      {activeOffer ? "Edit CTC" : "New Offer — CTC Creator"}
                    </p>
                  </div>

                  {/* Template selector */}
                  <div>
                    <label className="text-xs text-gray-400 font-medium block mb-1">CTC Format</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {CTC_SYSTEM_TEMPLATES.map(t => (
                        <button key={t.id}
                          onClick={() => { setCtcTemplateId(t.id); setCtcBreakdown(null); setEditedBreakdown({}); }}
                          className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                            ctcTemplateId === t.id
                              ? "border-brand-400 bg-brand-50 text-brand-800"
                              : "border-gray-200 hover:border-gray-300 text-gray-700"
                          }`}>
                          <span className="font-semibold">{t.label}</span>
                          <span className="text-gray-500 ml-2">{t.name}</span>
                          <span className="text-gray-400 ml-2">· {t.ctcRange}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Annual CTC input */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 font-medium block mb-1">Annual CTC (₹)</label>
                      <input
                        type="number"
                        value={annualCtcInput}
                        onChange={e => setAnnualCtcInput(e.target.value)}
                        placeholder="e.g. 600000"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <button onClick={recalcCTC}
                      className="text-xs bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 whitespace-nowrap">
                      Calculate
                    </button>
                  </div>

                  {/* CTC Breakdown table */}
                  {getMergedBreakdown() && (() => {
                    const bd = getMergedBreakdown()!;
                    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
                    const FieldRow = ({ label, key: k, isAnnual }: { label: string; key: keyof CTCBreakdown; isAnnual?: boolean }) => {
                      const val = (editedBreakdown[k] !== undefined ? editedBreakdown[k] : bd[k]) as number;
                      return (
                        <tr className="border-b border-gray-100">
                          <td className="py-1 text-xs text-gray-600 pr-3">{label}{isAnnual ? " (annual)" : ""}</td>
                          <td className="py-1 w-32">
                            <input type="number" value={val}
                              onChange={e => setEditedBreakdown(prev => ({ ...prev, [k]: parseFloat(e.target.value) || 0 }))}
                              className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right"
                            />
                          </td>
                          <td className="py-1 text-xs text-gray-400 text-right pl-2">{fmt(val)}</td>
                        </tr>
                      );
                    };
                    return (
                      <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                        <div className="bg-gray-50 px-3 py-2 font-semibold text-gray-700 flex justify-between">
                          <span>CTC Breakdown — {ctcTemplateId}</span>
                          <span>{fmt(bd.annual_ctc)}/year · {fmt(bd.monthly_ctc)}/month</span>
                        </div>
                        <table className="w-full px-3">
                          <tbody className="px-3">
                            <tr className="bg-brand-50"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-brand-800">Earnings (Monthly)</td></tr>
                            <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">Basic + DA</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.basic_da ?? bd.basic_da}
                                onChange={e => setEditedBreakdown(p => ({ ...p, basic_da: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.basic_da ?? bd.basic_da)}</td>
                            </tr>
                            {bd.hra > 0 && <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">HRA</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.hra ?? bd.hra}
                                onChange={e => setEditedBreakdown(p => ({ ...p, hra: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.hra ?? bd.hra)}</td>
                            </tr>}
                            <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">Conveyance</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.conveyance ?? bd.conveyance}
                                onChange={e => setEditedBreakdown(p => ({ ...p, conveyance: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.conveyance ?? bd.conveyance)}</td>
                            </tr>
                            {bd.performance > 0 && <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">Performance Allowance</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.performance ?? bd.performance}
                                onChange={e => setEditedBreakdown(p => ({ ...p, performance: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.performance ?? bd.performance)}</td>
                            </tr>}
                            <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">Special Allowance</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.special_allowance ?? bd.special_allowance}
                                onChange={e => setEditedBreakdown(p => ({ ...p, special_allowance: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.special_allowance ?? bd.special_allowance)}</td>
                            </tr>
                            <tr className="bg-blue-50 font-semibold"><td colSpan={2} className="px-3 py-1.5 text-xs text-blue-800">Gross Monthly</td>
                              <td className="py-1.5 text-xs text-blue-800 text-right pr-3">{fmt(bd.gross_monthly)}</td></tr>

                            <tr className="bg-purple-50"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-purple-800">Employer Contributions (Monthly)</td></tr>
                            {[
                              ["EPF Employer (13%)", "epf_employer"],
                              ["ESIC Employer (3.25%)", "esic_employer"],
                              ["Exgratia / Bonus (8.33%)", "exgratia"],
                              ["Gratuity (4.81%)", "gratuity"],
                              ["Mediclaim", "mediclaim"],
                            ].map(([lbl, key]) => <tr key={key} className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">{lbl}</td>
                              <td className="py-1 w-32"><input type="number" value={(editedBreakdown as Record<string,number>)[key] ?? (bd as unknown as Record<string,number>)[key]}
                                onChange={e => setEditedBreakdown(p => ({ ...p, [key]: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt((editedBreakdown as Record<string,number>)[key] ?? (bd as unknown as Record<string,number>)[key])}</td>
                            </tr>)}
                            <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">LWF Employer (annual)</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.lwf_employer ?? bd.lwf_employer}
                                onChange={e => setEditedBreakdown(p => ({ ...p, lwf_employer: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.lwf_employer ?? bd.lwf_employer)}</td>
                            </tr>
                            <tr className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">GPA (annual)</td>
                              <td className="py-1 w-32"><input type="number" value={editedBreakdown.gpa ?? bd.gpa}
                                onChange={e => setEditedBreakdown(p => ({ ...p, gpa: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt(editedBreakdown.gpa ?? bd.gpa)}</td>
                            </tr>

                            <tr className="bg-red-50"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-red-800">Employee Deductions (Monthly)</td></tr>
                            {[
                              ["EPF Employee (12%)", "epf_employee"],
                              ["ESIC Employee (0.75%)", "esic_employee"],
                              ["Professional Tax", "prof_tax"],
                            ].map(([lbl, key]) => <tr key={key} className="px-3"><td className="pl-3 py-1 text-xs text-gray-600">{lbl}</td>
                              <td className="py-1 w-32"><input type="number" value={(editedBreakdown as Record<string,number>)[key] ?? (bd as unknown as Record<string,number>)[key]}
                                onChange={e => setEditedBreakdown(p => ({ ...p, [key]: parseFloat(e.target.value)||0 }))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-400 text-right" /></td>
                              <td className="py-1 text-xs text-gray-400 text-right pr-3">{fmt((editedBreakdown as Record<string,number>)[key] ?? (bd as unknown as Record<string,number>)[key])}</td>
                            </tr>)}

                            <tr className="bg-green-50 font-bold"><td colSpan={2} className="px-3 py-2 text-xs text-green-800">Net Take-Home (Monthly)</td>
                              <td className="py-2 text-sm text-green-800 font-bold text-right pr-3">{fmt(bd.net_take_home)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Offer form details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1">Designation</label>
                      <input value={offerFormData.designation}
                        onChange={e => setOfferFormData(p => ({ ...p, designation: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1">Site / Location</label>
                      <input value={offerFormData.site}
                        onChange={e => setOfferFormData(p => ({ ...p, site: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1">Date of Joining</label>
                      <input type="date" value={offerFormData.joining_date}
                        onChange={e => setOfferFormData(p => ({ ...p, joining_date: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1">Reporting To</label>
                      <input value={offerFormData.reporting_to}
                        onChange={e => setOfferFormData(p => ({ ...p, reporting_to: e.target.value }))}
                        placeholder="HR Manager"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1">Probation (months)</label>
                      <input type="number" value={offerFormData.probation_months}
                        onChange={e => setOfferFormData(p => ({ ...p, probation_months: parseInt(e.target.value) || 6 }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400 font-medium block mb-1">Internal Notes</label>
                      <textarea rows={2} value={offerFormData.notes}
                        onChange={e => setOfferFormData(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Internal notes (not visible to candidate)"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={() => saveOffer("draft")} disabled={savingOffer || !ctcBreakdown}
                      className="text-xs bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-60">
                      {savingOffer ? "Saving…" : "Save as Draft"}
                    </button>
                    <button onClick={() => saveOffer("ctc_sent")} disabled={savingOffer || !ctcBreakdown}
                      className="text-xs bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-60 flex items-center gap-1">
                      <Send size={11} /> Save & Send CTC
                    </button>
                    <button onClick={() => setOfferView("list")}
                      className="text-xs border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              {/* ── OFFER LETTER PREVIEW ── */}
              {offerView === "offer_letter" && activeOffer && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setOfferView("list")}
                      className="text-xs text-gray-400 hover:text-gray-700">← Back</button>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!activeOffer) return;
                          const html = generateOfferLetterHTML({
                            candidateName: cand?.name ?? "",
                            designation: activeOffer.designation ?? cand?.designation_name ?? "",
                            site: activeOffer.site ?? cand?.site_name ?? "",
                            joiningDate: activeOffer.joining_date ?? "",
                            reportingTo: activeOffer.reporting_to ?? "HR Manager",
                            probationMonths: activeOffer.probation_months ?? 6,
                          });
                          await updateOfferStatus(activeOffer.id, "offer_sent", { offer_letter_html: html });
                          setOfferView("list");
                          toast.success("Offer letter marked as sent");
                        }}
                        className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 flex items-center gap-1">
                        <Send size={11} /> Mark Offer Sent
                      </button>
                      <button
                        onClick={() => {
                          const w = window.open("", "_blank");
                          if (w) { w.document.write(offerLetterHtml); w.document.close(); w.print(); }
                        }}
                        className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">
                        Print / Save PDF
                      </button>
                    </div>
                  </div>

                  <div className="border border-brand-200 rounded-lg p-2 bg-brand-50/30">
                    <p className="text-xs text-brand-700 font-medium">
                      ℹ️ This offer letter does NOT contain any CTC information. Once sent, it will be locked and only HR Manager can make changes.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden"
                    style={{ height: "500px" }}>
                    <iframe
                      srcDoc={offerLetterHtml}
                      className="w-full h-full"
                      title="Offer Letter Preview"
                    />
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── FINAL / JOINING ── */}
          {tab === "final" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="DOJ (Potential)">
                  <Input field="doj_potential" type="date" />
                  <p className="text-xs text-gray-400 mt-0.5">Estimated, before confirmation</p>
                </Field>
                <Field label="DOJ (Actual)">
                  <Input field="doj_actual" type="date" />
                  {form.doj_actual && <p className="text-xs text-green-600 mt-0.5">✅ Joined {String(form.doj_actual).slice(0, 10)}</p>}
                </Field>
                <Field label="Current Status">
                  <Select field="final_status" options={[
                    "Sourced","Applied","Recruiter Screening Done","HR Manager Screening Done",
                    "Dept Mgr Screening Done","Mgmt Approved for PI Call","Called for PI",
                    "Did Not Attend Interview","PI 1 Done","PI 2 Done","GF Issued","Shortlisted",
                    "Shortlisted But Not Offered","Hold","Suitable for Future","Offered But Did Not Join",
                    "Offered","Not Interested","Rejected","Appointed","Joined","Joined & Left",
                    "Active Employee","Not Yet Processed","Other","Dropped By Candidate",
                  ].map(s => ({ value: s, label: s }))} />
                </Field>
                <Field label="File Number"><Input field="file_no" /></Field>
                <Field label="Staffingo Employee ID"><Input field="staffingo_emp_id" /></Field>
                <Field label="Hard Copy Received">
                  <Select field="hard_copy" options={[{ value:"Y", label:"Yes" }, { value:"N", label:"No" }]} />
                </Field>
              </div>
              <Field label="Final Remarks"><Textarea field="remarks" rows={3} /></Field>
            </div>
          )}

          {/* ── NOTES ── */}
          {tab === "notes" && (
            <div className="space-y-3">
              {canEdit && (
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Add Note</label>
                  <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Add a note visible to all team members…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none" />
                  <button
                    onClick={async () => {
                      if (!note.trim()) return;
                      const existing = (customData.notes as { text: string; by: string; at: string }[]) ?? [];
                      const updated = [{ text: note, by: profile.name, at: new Date().toISOString() }, ...existing];
                      const res = await fetch(`/api/candidates/${cand.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ custom_data: { ...customData, notes: updated } }),
                      });
                      if (res.ok) { setNote(""); fetchCandidate(); }
                    }}
                    className="mt-2 bg-brand-500 text-white text-xs px-4 py-1.5 rounded-lg font-medium hover:bg-brand-600">
                    + Add Note
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {((customData.notes as { text: string; by: string; at: string }[]) ?? []).map((n, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 text-xs">{n.by}</span>
                      <span className="text-gray-400 text-xs">{new Date(n.at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" })}</span>
                    </div>
                    <p className="text-gray-600 text-xs leading-relaxed">{n.text}</p>
                  </div>
                ))}
                {!((customData.notes as unknown[])?.length) && (
                  <p className="text-xs text-gray-400 text-center py-4">No notes yet</p>
                )}
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === "history" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Change History</p>
                <button onClick={fetchHistory} className="text-xs text-gray-400 hover:text-gray-600">↻ Refresh</button>
              </div>
              {historyLoading ? (
                <p className="text-xs text-gray-400 py-6 text-center">Loading…</p>
              ) : historyEntries.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">No change history recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {historyEntries.map(entry => (
                    <div key={entry.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            entry.action === 'INSERT' ? 'bg-green-100 text-green-700' :
                            entry.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{entry.action === 'INSERT' ? 'Created' : entry.action === 'DELETE' ? 'Deleted' : 'Updated'}</span>
                          <span className="text-xs text-gray-500">{entry.changed_by_name}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(entry.changed_at).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {entry.changes.map((ch, i) => (
                          <div key={i} className="flex items-baseline gap-1.5 text-xs flex-wrap">
                            <span className="text-gray-400 font-medium shrink-0">{ch.field.replace(/_/g,' ')}</span>
                            <span className="text-gray-300 shrink-0">→</span>
                            {ch.from !== null && <span className="text-red-400 line-through shrink-0 max-w-[100px] truncate">{ch.from || '—'}</span>}
                            {ch.from !== null && <span className="text-gray-300 shrink-0">›</span>}
                            <span className="text-green-700 font-medium shrink-0 max-w-[100px] truncate">{ch.to ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        {canEdit && dirty && (
          <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0 bg-white">
            <span className="text-xs text-brand-600 font-medium">● Unsaved changes</span>
            <div className="flex gap-2">
              <button onClick={() => { setForm(cand); setDirty(false); }}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">Discard</button>
              <button onClick={save} disabled={saving}
                className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-brand-600 flex items-center gap-1 disabled:opacity-60">
                <Save size={12} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Forward Candidate Modal ── */}
      {showForwardModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForwardModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-[420px] shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Forward Candidate</h3>
                <p className="text-xs text-gray-500 mt-0.5">Select recipient & the sections they can edit</p>
              </div>
              <button onClick={() => setShowForwardModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Recipient */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Send to</label>
              <select
                value={forwardToUserId}
                onChange={e => setForwardToUserId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">— Choose a team member —</option>
                {recruiters
                  .filter(r => r.id !== profile.id && r.is_active)
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.role.replace("_", " ")})
                    </option>
                  ))}
              </select>
            </div>

            {/* Section checkboxes */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700">Sections the recipient can edit</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForwardTabs(TABS.map(t => t.key))}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >All</button>
                  <span className="text-gray-300 text-xs">|</span>
                  <button
                    type="button"
                    onClick={() => setForwardTabs([])}
                    className="text-[10px] text-gray-400 hover:underline"
                  >None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {TABS.map(t => (
                  <label key={t.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                    forwardTabs.includes(t.key)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
                  }`}>
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={forwardTabs.includes(t.key)}
                      onChange={e => {
                        if (e.target.checked) setForwardTabs(prev => [...prev, t.key]);
                        else setForwardTabs(prev => prev.filter(k => k !== t.key));
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Optional note */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Note (optional)</label>
              <textarea
                rows={2}
                value={forwardNote}
                onChange={e => setForwardNote(e.target.value)}
                placeholder="Add a message for the recipient…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowForwardModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendForward}
                disabled={forwarding || !forwardToUserId || forwardTabs.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowRightCircle size={15} />
                {forwarding ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-96 shadow-2xl z-10">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              {isAdmin ? "Delete Candidate" : "Request Candidate Deletion"}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {isAdmin ? "This will soft-delete the candidate. They can be restored by an admin."
                : "Sends a request to HR Manager for approval."}
            </p>
            {!isAdmin && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Reason *</label>
                  <select value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">— Select reason —</option>
                    <option>Duplicate entry</option>
                    <option>Candidate requested removal</option>
                    <option>Data entry error</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Additional Notes</label>
                  <textarea rows={3} value={deleteNotes} onChange={e => setDeleteNotes(e.target.value)}
                    placeholder="Context for HR Manager…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-600 disabled:opacity-60">
                {deleting ? "Processing…" : isAdmin ? "Delete" : "Submit Request"}
              </button>
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Co-Sourcer Modal ── */}
      {showCoSourcerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCoSourcerModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-80 shadow-2xl z-10">
            <h3 className="font-bold text-gray-900 text-base mb-4">Link Co-sourcer</h3>
            <label className="text-xs text-gray-500 font-medium block mb-1">Select Recruiter</label>
            <select value={coSourcerRecruiter} onChange={e => setCoSourcerRecruiter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 mb-4">
              <option value="">— Select —</option>
              {recruiters.filter(r => r.id !== profile.id && r.id !== cand.hr_id).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={linkCoSourcer} disabled={!coSourcerRecruiter || linkingCoSourcer}
                className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
                {linkingCoSourcer ? "Linking…" : "Link"}
              </button>
              <button onClick={() => setShowCoSourcerModal(false)}
                className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
    </PanelContext.Provider>
  );
}
