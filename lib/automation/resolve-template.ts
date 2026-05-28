import type { AutomationSettings, Candidate, CandidateOffer, Interview, Profile } from "@/lib/types";

export interface TemplateContext {
  candidate?: Partial<Candidate> | null;
  recruiter?: Partial<Profile> | null;
  hrManager?: Partial<Profile> | null;
  interviewer?: Partial<Profile> | null;
  interview?: Partial<Interview> | null;
  offer?: Partial<CandidateOffer> | null;
  settings?: Partial<AutomationSettings> | null;
  designationName?: string | null;
  siteName?: string | null;
  jobTitle?: string | null;
  stage?: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function fmtDate(value?: string | null) {
  if (!value) return "[N/A]";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "[N/A]" : DATE_FMT.format(date);
}

function fmtTime(value?: string | null) {
  if (!value) return "[N/A]";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "[N/A]" : TIME_FMT.format(date);
}

function fmtCurrency(value?: number | string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "[N/A]";
  return `₹${amount.toLocaleString("en-IN")} per annum`;
}

export function resolveTemplate(text: string | null | undefined, context: TemplateContext) {
  const candidate = context.candidate ?? {};
  const recruiter = context.recruiter ?? {};
  const hrManager = context.hrManager ?? {};
  const interviewer = context.interviewer ?? {};
  const interview = context.interview ?? {};
  const offer = context.offer ?? {};
  const settings = context.settings ?? {};
  const scheduledAt = interview.scheduled_at ?? "";

  const values: Record<string, unknown> = {
    candidate_name: candidate.name,
    recruiter_name: recruiter.name,
    hr_manager_name: hrManager.name,
    interviewer_name: interviewer.name ?? interview.interviewer_name,
    job_title: context.jobTitle ?? context.designationName ?? candidate.current_designation,
    designation: context.designationName ?? offer.designation ?? candidate.current_designation,
    site: context.siteName ?? offer.site,
    stage: context.stage ?? candidate.final_status,
    interview_date: fmtDate(scheduledAt),
    interview_time: fmtTime(scheduledAt),
    interview_link: interview.meet_link ?? interview.location,
    interview_round: interview.round,
    offered_ctc: fmtCurrency(offer.annual_ctc ?? candidate.offered_salary),
    doj: fmtDate(offer.joining_date ?? candidate.doj ?? candidate.doj_actual ?? candidate.doj_potential),
    company_name: settings.company_name ?? "HireRabbits",
  };

  return (text ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || value === "") return "[N/A]";
    return String(value);
  });
}
