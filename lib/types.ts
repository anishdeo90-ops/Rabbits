export type Role = "admin" | "hr_manager" | "recruiter" | "hod" | "candidate";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  is_active: boolean;
  is_external_recruiter?: boolean;
  external_token?: string;
  avatar_url?: string;
  google_account_email?: string;
  google_sheet_id?: string;
  google_drive_folder?: string;
  created_at: string;
}

export interface Master {
  id: string;
  type: string;
  name: string;
  code?: string;
  color?: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface CustomColumn {
  id: string;
  label: string;
  field_key: string;
  col_type: "text" | "number" | "date" | "dropdown" | "boolean" | "url";
  dropdown_type?: string;
  sort_order: number;
  is_active: boolean;
}

export interface Candidate {
  id: string;
  sr_no: number;
  hr_id?: string;
  month?: string;
  application_date?: string;
  naukri_link?: string;
  naukri_profile_url?: string;
  name: string;
  current_designation?: string;
  designation_id?: string;
  site_id?: string;
  mobile?: string;
  email?: string;
  suitable_other_position?: string;
  current_location?: string;
  source_id?: string;
  present_salary?: number;
  expected_salary?: number;
  offered_salary?: number;
  notice_period_days?: number;
  // Stage 1: Screening
  google_form_sent?: string;
  google_form_sent_date?: string;
  google_form_received?: string;
  google_form_received_date?: string;
  processed_by_hr?: string;
  processed_by_hr_date?: string;
  shortlist_by_hr?: string;
  shortlist_by_hr_date?: string;
  // Stage 2: Telephonic
  tel_int_date?: string;
  tel_int_remarks?: string;
  hr_manager_remarks?: string;
  remarks_before_pi?: string;
  mgmt_remarks_before_pi?: string;
  shortlisted_for_pi?: string;
  shortlisted_for_pi_date?: string;
  // PI Rounds
  pi1_date?: string;
  pi1_taken_by?: string;
  pi1_remarks?: string;
  pi2_date?: string;
  pi2_taken_by?: string;
  pi2_remarks?: string;
  pi3_date?: string;
  pi3_taken_by?: string;
  pi3_remarks?: string;
  // GF / Offer
  gf_issued?: string;
  shortlisted_by_mgmt?: string;
  shortlisted_by_mgmt_date?: string;
  gf_issue_date?: string;
  gf_received_date?: string;
  gf_verified?: string;
  gf_verification_report?: string;
  addr_verification_shared?: string;
  addr_verification_received?: string;
  // Final
  remarks?: string;
  final_status?: string;
  final_status_date?: string;
  offered_date?: string;
  offered_not_joined_date?: string;
  final_action?: string;
  file_no?: string;
  doj?: string;
  doj_potential?: string;
  doj_actual?: string;
  hard_copy?: string;
  staffingo_emp_id?: string;
  referred_by?: string;
  // AI
  ai_score?: number;
  ai_summary?: string;
  parsed_keywords?: Record<string, unknown>;
  kw_years_experience?: number;
  // CV
  cv_drive_url?: string;
  cv_filename?: string;
  job_id?: string;
  // Custom columns (admin-extensible)
  custom_data: Record<string, unknown>;
  tag_ids?: string[];
  tag_names?: string[];
  tag_colors?: string[];
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  is_deleted: boolean;
  // Joined fields from view
  hr_name?: string;
  site_name?: string;
  designation_name?: string;
  source_name?: string;
  co_sourcer_names?: string;
}

export interface CoSourcer {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  role: "primary" | "co_sourcer";
  linked_at: string;
  linked_by?: string;
  notes?: string;
  // Joined
  recruiter_name?: string;
}

// ── Jobs ────────────────────────────────────────────────────

export type JobStatus = "open" | "on_hold" | "closed" | "filled";
export type JobType = "internal" | "client";

export interface Job {
  id: string;
  title: string;
  job_type: JobType;
  status: JobStatus;
  designation_id?: string;
  site_id?: string;
  department?: string;
  headcount: number;
  priority: "low" | "normal" | "high" | "urgent";
  description?: string;
  requirements?: string;
  min_salary?: number;
  max_salary?: number;
  // Client job fields
  client_name?: string;
  client_contact?: string;
  placement_fee_pct?: number;
  placement_fee_flat?: number;
  external_source?: string;
  external_job_uid?: string;
  external_job_id?: string;
  external_received_at?: string;
  external_payload?: Record<string, unknown>;
  // JD link
  jd_id?: string;
  hod_id?: string;
  // Dates
  opened_at?: string;
  closed_at?: string;
  filled_at?: string;
  target_doj?: string;
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  is_deleted: boolean;
  // Pipeline counters (auto-maintained by DB trigger)
  candidates_pipeline?:    number;
  candidates_shortlisted?: number;
  candidates_appointed?:   number;
  candidates_joined?:      number;
  // Joined
  designation_name?: string;
  site_name?: string;
  recruiters?: JobRecruiter[];
  postings?: JobPosting[];
}

export interface JobRecruiter {
  id: string;
  job_id: string;
  recruiter_id: string;
  assigned_at: string;
  assigned_from?: string;
  assigned_until?: string;
  assigned_by?: string;
  // Joined
  recruiter_name?: string;
  recruiter_email?: string;
}

export interface JobPosting {
  id: string;
  job_id: string;
  platform: string;
  status: "pending" | "posting" | "posted" | "failed" | "cancelled";
  external_post_url?: string;
  external_post_id?: string;
  error_message?: string;
  attempt_count: number;
  last_attempt_at?: string;
  posted_at?: string;
  created_at: string;
  updated_at: string;
}

// ── JD Library ──────────────────────────────────────────────

export interface JDLibraryItem {
  id: string;
  title: string;
  designation_id?: string;
  content?: string;
  drive_url?: string;
  file_name?: string;
  version: number;
  tags?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Joined
  designation_name?: string;
}

// ── Assessments ─────────────────────────────────────────────

export interface Assessment {
  id: string;
  title: string;
  form_url?: string;
  description?: string;
  duration_mins?: number;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  linked_jobs?: string[];
}

// ── Interviews ──────────────────────────────────────────────

export type InterviewRound = "telephonic" | "pi1" | "pi2" | "pi3" | "hr_discussion" | "final";
export type InterviewStatus = "scheduled" | "confirmed" | "done" | "rescheduled" | "cancelled" | "no_show";

export interface Interview {
  id: string;
  candidate_id: string;
  job_id?: string;
  round: InterviewRound;
  scheduled_at: string;
  duration_mins: number;
  interviewer_id?: string;
  interviewer_name?: string;
  location?: string;
  meet_link?: string;
  calendar_event_id?: string;
  status: InterviewStatus;
  outcome?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
  // Joined
  candidate_name?: string;
  designation_name?: string;
}

// ── Deletion Requests ────────────────────────────────────────

export interface DeletionRequest {
  id: string;
  candidate_id: string;
  requested_by: string;
  reason: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  // Joined
  candidate_name?: string;
  requester_name?: string;
}

// ── Email Templates ──────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  template_type: "general" | "offer" | "rejection" | "interview" | "joining" | "custom";
  variables?: string[];
  is_active: boolean;
  created_at: string;
  created_by?: string;
  linked_jobs?: string[];
}

// ── Sync ─────────────────────────────────────────────────────

export interface SyncConfig {
  id: string;
  recruiter_id: string;
  sheet_id?: string;
  sheet_name: string;
  sync_direction: "push" | "pull" | "both";
  auto_sync: boolean;
  sync_frequency: "manual" | "hourly" | "daily";
  last_synced_at?: string;
  last_sync_status?: string;
  last_sync_rows?: number;
}

export interface SyncConflict {
  id: string;
  recruiter_id?: string;
  candidate_id?: string;
  field_name?: string;
  db_value?: string;
  sheet_value?: string;
  conflict_type: "value_mismatch" | "deleted_in_db" | "deleted_in_sheet" | "new_in_sheet" | "protected_field";
  resolution?: "keep_db" | "keep_sheet" | "manual" | "pending";
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
  // Joined
  candidate_name?: string;
  recruiter_name?: string;
}

// ── Dashboard ────────────────────────────────────────────────

export type DatePeriod = "today" | "week" | "all" | "month" | "lastmonth" | "last30" | "custom";

export interface DashboardFilters {
  period: DatePeriod;
  dateFrom?: string;
  dateTo?: string;
  hrId?: string;
  siteId?: string;
  designationId?: string;
  sourceId?: string;
}

export interface FunnelRow {
  label: string;
  count: number;
  percentage?: number;
}

export interface DashboardStats {
  total: number;
  new_cvs: number;
  worked_on_existing: number;
  tel_int_done: number;
  gf_sent: number;
  gf_received: number;
  shortlisted_hr: number;
  pi_done: number;
  shortlisted_mgmt: number;
  gf_issued: number;
  gf_recv: number;
  appointed: number;
  joined: number;
  offered_not_joined: number;
  stage_splits?: Record<string, { new: number; worked: number }>;
  // v3 additions
  open_jobs?: number;
  interviews_this_week?: number;
  offers_pending?: number;
  ai_cost_this_month?: number;
}

export interface RecruiterPerformance {
  hr_id: string;
  hr_name: string;
  total: number;
  tel_done: number;
  pi_done: number;
  joined: number;
  conversion_pct: number;
}

// ── My Activity ──────────────────────────────────────────────

export interface MyActivityStats {
  candidates_added: number;
  interviews_scheduled: number;
  joinings: number;
  pending_followups: number;
}

// ── Constants ────────────────────────────────────────────────

export const MASTER_TYPES = [
  { key: "site",        label: "Sites" },
  { key: "designation", label: "Designations" },
  { key: "source",      label: "Sources" },
  { key: "department",  label: "Departments" },
  { key: "status",      label: "Statuses" },
  { key: "tag",         label: "Tags" },
  { key: "location",    label: "Locations" },
] as const;

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin",      label: "Admin" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "recruiter",  label: "Recruiter" },
  { value: "hod",        label: "HOD / Interviewer" },
  { value: "candidate",  label: "Candidate" },
];

export const KANBAN_STAGES = [
  { key: "Sourced",                    label: "Sourced",                  color: "#6b7280" },
  { key: "Applied",                    label: "Applied",                  color: "#94a3b8" },
  { key: "Recruiter Screening Done",   label: "Recruiter Screening",      color: "#3b82f6" },
  { key: "HR Manager Screening Done",  label: "HR Screening",             color: "#06b6d4" },
  { key: "Dept Mgr Screening Done",    label: "Dept Screening",           color: "#8b5cf6" },
  { key: "Mgmt Approved for PI Call",  label: "Mgmt Approved",            color: "#6366f1" },
  { key: "Called for PI",              label: "Called for PI",            color: "#a855f7" },
  { key: "Did Not Attend Interview",   label: "No Show",                  color: "#f87171" },
  { key: "PI 1 Done",                  label: "PI 1 Done",                color: "#6366f1" },
  { key: "PI 2 Done",                  label: "PI 2 Done",                color: "#a855f7" },
  { key: "GF Issued",                  label: "GF Issued",                color: "#fbbf24" },
  { key: "Shortlisted",                label: "Shortlisted",              color: "#14b8a6" },
  { key: "Shortlisted But Not Offered",label: "Shortlisted (Not Offered)",color: "#2dd4bf" },
  { key: "Hold",                       label: "Hold",                     color: "#d97706" },
  { key: "Suitable for Future",        label: "Suitable Future",          color: "#60a5fa" },
  { key: "Offered But Did Not Join",   label: "Offered (No Join)",        color: "#dc2626" },
  { key: "Offered",                    label: "Offered",                  color: "#ff2d87" },
  { key: "Not Interested",             label: "Not Interested",           color: "#f87171" },
  { key: "Rejected",                   label: "Rejected",                 color: "#ef4444" },
  { key: "Appointed",                  label: "Appointed",                color: "#e61f73" },
  { key: "Joined",                     label: "Joined",                   color: "#16a34a" },
  { key: "Joined & Left",              label: "Joined & Left",            color: "#6b7280" },
  { key: "Active Employee",            label: "Active Employee",          color: "#15803d" },
  { key: "Not Yet Processed",          label: "Not Yet Processed",        color: "#9ca3af" },
  { key: "Other",                      label: "Other",                    color: "#d1d5db" },
  { key: "Dropped By Candidate",       label: "Dropped By Candidate",     color: "#ef4444" },
] as const;

export const PIPELINE_STAGES = [
  "Sourced","Applied","Recruiter Screening Done","HR Manager Screening Done",
  "Dept Mgr Screening Done","Mgmt Approved for PI Call","Called for PI",
  "Did Not Attend Interview","PI 1 Done","PI 2 Done","GF Issued","Shortlisted",
  "Shortlisted But Not Offered","Hold","Suitable for Future","Offered But Did Not Join",
  "Offered","Not Interested","Rejected","Appointed","Joined","Joined & Left",
  "Active Employee","Not Yet Processed","Other","Dropped By Candidate",
] as const;

export const YES_NO_OPTIONS = ["Y", "N", ""];
export const PROCESSED_OPTIONS = ["Yes", "No", ""];

export const PROTECTED_CANDIDATE_FIELDS: (keyof Candidate)[] = [
  "name", "mobile", "email", "current_designation", "designation_id",
  "present_salary", "expected_salary", "offered_salary",
];

// ── Hiring Requests ─────────────────────────────────────
// ── CTC / Offers ─────────────────────────────────────────────────────────────

export type OfferStatus =
  | 'draft' | 'ctc_sent' | 'ctc_confirmed'
  | 'offer_sent' | 'offer_confirmed' | 'joined' | 'withdrawn';

export interface CandidateOffer {
  id: string;
  candidate_id: string;
  ctc_template_id?: string;
  annual_ctc?: number;
  ctc_data?: Record<string, number>;
  ctc_notes?: string;
  ctc_confirm_method?: "physical_sign" | "email" | "whatsapp" | "verbal";
  ctc_sent_at?: string;
  ctc_confirmed_at?: string;
  offer_letter_html?: string;
  offer_sent_at?: string;
  offer_confirmed_at?: string;
  offer_confirm_notes?: string;
  joining_date?: string;
  joined_at?: string;
  designation?: string;
  site?: string;
  reporting_to?: string;
  probation_months?: number;
  status: OfferStatus;
  locked_at?: string;
  locked_by?: string;
  notes?: string;
  is_deleted: boolean;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

export interface CTCTemplate {
  id: string;
  label: string;
  name: string;
  description?: string;
  components: CTCComponentDef[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface CTCComponentDef {
  id: string;
  label: string;
  category: 'earning' | 'deduction' | 'employer_contribution';
  calc_type: 'formula' | 'fixed_monthly' | 'fixed_annual' | 'balance' | 'manual';
  value?: number;
  formula?: string;
  taxable?: boolean;
}

// ── Hiring Requests ─────────────────────────────────────────────────────────────
export interface HiringRequest {
  id: string;
  title: string;
  designation_id?: string;
  site_id?: string;
  headcount: number;
  urgency: "low" | "normal" | "high" | "urgent";
  description?: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected" | "converted";
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  converted_job_id?: string;
  created_at: string;
  updated_at: string;
  // Joined
  requester?: { name: string };
  reviewer?: { name: string };
  designation?: { name: string };
  site?: { name: string };
}
