import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { findDuplicateCandidatesByMobile } from "@/lib/candidate-duplicates";

const WRITABLE_CANDIDATE_FIELDS = new Set([
  "hr_id",
  "month",
  "application_date",
  "naukri_link",
  "naukri_profile_url",
  "name",
  "current_designation",
  "designation_id",
  "site_id",
  "mobile",
  "email",
  "suitable_other_position",
  "current_location",
  "source_id",
  "present_salary",
  "expected_salary",
  "offered_salary",
  "notice_period_days",
  "google_form_sent",
  "google_form_received",
  "processed_by_hr",
  "shortlist_by_hr",
  "tel_int_date",
  "tel_int_remarks",
  "hr_manager_remarks",
  "remarks_before_pi",
  "mgmt_remarks_before_pi",
  "shortlisted_for_pi",
  "pi1_date",
  "pi1_taken_by",
  "pi1_remarks",
  "pi2_date",
  "pi2_taken_by",
  "pi2_remarks",
  "pi3_date",
  "pi3_taken_by",
  "pi3_remarks",
  "gf_issued",
  "shortlisted_by_mgmt",
  "gf_issue_date",
  "gf_received_date",
  "gf_verified",
  "gf_verification_report",
  "addr_verification_shared",
  "addr_verification_received",
  "remarks",
  "final_status",
  "final_action",
  "file_no",
  "doj",
  "doj_potential",
  "doj_actual",
  "hard_copy",
  "staffingo_emp_id",
  "ai_score",
  "ai_summary",
  "cv_drive_url",
  "cv_filename",
  "job_id",
  "custom_data",
  "parsed_keywords",
  "referred_by",
]);

function pickWritableCandidateFields(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (WRITABLE_CANDIDATE_FIELDS.has(key)) output[key] = value;
  }
  return output;
}

function textValue(value: unknown) {
  if (value == null) return "";
  return String(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(textValue).filter(Boolean) : [];
}

function fieldScore(values: string[], tokens: string[], phrase: string, weight: number) {
  const joined = values.join(" ");
  if (!joined) return 0;

  let score = phrase && joined.includes(phrase) ? weight * 2 : 0;
  for (const token of tokens) {
    if (!token) continue;
    if (values.some((value) => value === token)) score += weight * 2;
    else if (values.some((value) => value.includes(token))) score += weight;
  }
  return score;
}

function scoreKeywordMatch(row: Record<string, unknown>, tokens: string[], phrase: string, minYears: number | null) {
  const keywords = (row.parsed_keywords ?? {}) as Record<string, unknown>;
  const fields = [
    { weight: 30, values: arrayValue(keywords.skills) },
    { weight: 24, values: arrayValue(keywords.tools) },
    { weight: 18, values: [textValue(keywords.current_role), textValue(row.current_designation), textValue(row.designation_name)].filter(Boolean) },
    { weight: 16, values: arrayValue(keywords.summary_tags) },
    { weight: 12, values: arrayValue(keywords.projects) },
    { weight: 10, values: arrayValue(keywords.industries) },
    { weight: 10, values: arrayValue(keywords.certifications) },
    { weight: 8, values: arrayValue(keywords.languages) },
    { weight: 6, values: [textValue(keywords.education), textValue(keywords.college), ...arrayValue(keywords.previous_companies)].filter(Boolean) },
  ];

  let score = fields.reduce((total, field) => total + fieldScore(field.values, tokens, phrase, field.weight), 0);
  const years = Number(row.kw_years_experience ?? keywords.years_experience ?? 0);
  if (minYears !== null && Number.isFinite(years)) {
    score += years >= minYears ? 25 + Math.min(years - minYears, 10) : -1000;
  }
  return score;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const p = new URL(req.url).searchParams;
  const hrId = p.get("hr_id");
  const siteId = p.get("site_id");
  const month = p.get("month");
  const status = p.get("status");
  const search = p.get("search");
  const kwSearch = p.get("kw_search")?.trim() ?? "";
  const designId = p.get("designation_id");
  const jobId = p.get("job_id");
  const sourceId = p.get("source_id");
  const dateFrom = p.get("date_from");
  const dateTo = p.get("date_to");
  const pipelineStage = p.get("pipeline_stage");
  const forwardToId = p.get("forward_to_id");
  const piBy = p.get("pi_taken_by");
  const page = parseInt(p.get("page") ?? "1", 10);
  const limit = parseInt(p.get("limit") ?? "2000", 10);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("v_pipeline_funnel")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .order("sr_no", { ascending: false })
    .range(offset, offset + limit - 1);

  if (profile?.role === "recruiter") {
    const { data: assignedJobs } = await supabase
      .from("job_recruiters")
      .select("job_id")
      .eq("recruiter_id", user.id);

    const jobIds = (assignedJobs ?? [])
      .map((job: { job_id: string }) => job.job_id)
      .filter(Boolean);

    const parts = [`hr_id.eq.${user.id}`, `created_by.eq.${user.id}`];
    if (jobIds.length > 0) parts.push(`job_id.in.(${jobIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  if (hrId) query = query.eq("hr_id", hrId);
  if (siteId) query = query.eq("site_id", siteId);
  if (month) query = query.eq("month", month);
  if (status === "Appointed/Offered" || status === "Offered") {
    query = query.in("final_status", ["Appointed/Offered", "Offered"]);
  } else if (status) {
    query = query.eq("final_status", status);
  }
  if (designId) query = query.eq("designation_id", designId);
  if (jobId) query = query.eq("job_id", jobId);
  if (sourceId) query = query.eq("source_id", sourceId);
  if (dateFrom) query = query.gte("application_date", dateFrom);
  if (dateTo) query = query.lte("application_date", dateTo);

  const stageColumn: Record<string, string> = {
    tel_int_done: "tel_int_done",
    gf_sent: "gf_sent",
    shortlisted_hr: "shortlisted_hr",
    pi_done: "pi_done",
    shortlisted_mgmt: "shortlisted_mgmt",
    appointed: "appointed",
    joined: "joined",
  };
  if (pipelineStage && stageColumn[pipelineStage]) query = query.eq(stageColumn[pipelineStage], 1);

  if (forwardToId) {
    const { data: forwardRows, error: forwardError } = await supabase
      .from("candidate_forwards")
      .select("candidate_id")
      .eq("to_user_id", forwardToId)
      .contains("unlocked_tabs", ["pi"]);
    if (forwardError) return NextResponse.json({ error: forwardError.message }, { status: 500 });
    const ids = (forwardRows ?? []).map((row) => row.candidate_id).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ data: [], count: 0 });
    query = query.in("id", ids);
  }

  let kwTokens: string[] = [];
  let kwPhrase = "";
  let kwMinYears: number | null = null;
  if (kwSearch) {
    const yearMatch = kwSearch.match(/(\d+)\s*\+?\s*(?:year|yr)/i);
    kwMinYears = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const skillPart = kwSearch
      .replace(/\d+\s*\+?\s*(?:year|yr)s?/gi, "")
      .replace(/\bin\b/gi, "")
      .trim();
    kwPhrase = textValue(skillPart);
    kwTokens = skillPart
      .split(/[\s,]+/)
      .map(textValue)
      .filter((s) => s.length > 1);

    if (kwMinYears !== null) {
      query = query.gte("kw_years_experience", kwMinYears);
    }
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  if (kwTokens.length > 0) {
    rows = rows
      .map((row) => {
        const record = row as Record<string, unknown>;
        return {
          ...record,
          kw_match_score: scoreKeywordMatch(record, kwTokens, kwPhrase, kwMinYears),
        };
      })
      .filter((row) => {
      const record = row as Record<string, unknown>;
      const keywords = (record.parsed_keywords ?? {}) as Record<string, unknown>;
      const haystack = [
        keywords.current_role,
        keywords.education,
        keywords.college,
        record.current_designation,
        record.designation_name,
        ...(Array.isArray(keywords.skills) ? keywords.skills : []),
        ...(Array.isArray(keywords.previous_companies) ? keywords.previous_companies : []),
        ...(Array.isArray(keywords.projects) ? keywords.projects : []),
        ...(Array.isArray(keywords.tools) ? keywords.tools : []),
        ...(Array.isArray(keywords.industries) ? keywords.industries : []),
        ...(Array.isArray(keywords.certifications) ? keywords.certifications : []),
        ...(Array.isArray(keywords.languages) ? keywords.languages : []),
        ...(Array.isArray(keywords.summary_tags) ? keywords.summary_tags : []),
      ].map(textValue).join(" ");
      return Number(record.kw_match_score) > 0 && kwTokens.every((token) => haystack.includes(token));
      })
      .sort((a, b) => {
        const scoreDiff = Number(b.kw_match_score ?? 0) - Number(a.kw_match_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return Number((b as Record<string, unknown>).sr_no ?? 0) - Number((a as Record<string, unknown>).sr_no ?? 0);
      });
  }

  if (piBy) {
    const q = piBy.toLowerCase();
    rows = rows.filter((row) =>
      (row as Record<string, string>).pi1_taken_by?.toLowerCase().includes(q) ||
      (row as Record<string, string>).pi2_taken_by?.toLowerCase().includes(q) ||
      (row as Record<string, string>).pi3_taken_by?.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ data: rows, count: piBy || kwTokens.length > 0 ? rows.length : count });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
  if (mobile) {
    const admin = await createAdminClient();
    const matches = await findDuplicateCandidatesByMobile(admin, mobile, 5);
    if (matches.length > 0) {
      return NextResponse.json({
        error: `Duplicate mobile number - candidate "${matches[0].name}" already exists with this mobile.`,
        duplicate_id: matches[0].id,
        duplicate: matches[0],
        duplicates: matches,
      }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("candidates")
    .insert({ ...pickWritableCandidateFields(body), created_by: user.id, hr_id: body.hr_id ?? user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
