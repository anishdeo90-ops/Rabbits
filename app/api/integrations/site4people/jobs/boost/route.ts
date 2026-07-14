import { NextRequest, NextResponse } from "next/server";
import { getPublicJobUrl, GOOGLE_JOBS_PLATFORM } from "@/lib/google-jobs";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Site4PeopleBoostPayload = Record<string, unknown>;

function safeString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function nullableString(value: unknown): string | null {
  const text = safeString(value);
  return text ? text : null;
}

function safeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function safeInt(value: unknown): number | null {
  const n = safeNumber(value);
  return n == null ? null : Math.max(1, Math.round(n));
}

function unixDate(value: unknown): string | null {
  const raw = safeString(value);
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function htmlToText(value: unknown): string | null {
  const text = safeString(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text : null;
}

function normalized(value: unknown): string {
  return safeString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function firstMatchingMasterId(
  masters: { id: string; name: string; type: string }[],
  type: string,
  values: unknown[],
) {
  const typed = masters.filter((master) => master.type === type);
  for (const value of values) {
    const key = normalized(value);
    if (!key) continue;
    const exact = typed.find((master) => normalized(master.name) === key);
    if (exact) return exact.id;
  }
  return null;
}

function buildRequirements(body: Site4PeopleBoostPayload): string | null {
  const lines = [
    ["Employment", body.job_type],
    ["Category", body.category],
    ["Skills", body.skills],
    ["Skill level", body.skill_level],
    ["Skill category", body.skill_category_name],
    ["Experience", [body.experience_from, body.experience_to].some((v) => v != null) ? `${safeString(body.experience_from) || "0"}-${safeString(body.experience_to) || "0"} years` : null],
    ["Field of work", body.field_of_work],
    ["Specialisation", body.specialisation],
    ["Tech stack", body.tech_stack],
    ["Selection process", body.selection_process],
    ["Shift timing", body.shift_timing],
    ["Week off", body.week_off],
  ]
    .map(([label, value]) => {
      const text = safeString(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : null;
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.SITE4PEOPLE_API_KEY;
  if (!expected) return false;
  return req.headers.get("x-api-key") === expected;
}

export async function POST(req: NextRequest) {
  if (!process.env.SITE4PEOPLE_API_KEY) {
    return NextResponse.json({ error: "SITE4PEOPLE_API_KEY is not configured" }, { status: 500 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Site4PeopleBoostPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const externalJobUid = safeString(body.job_uid);
  const title = safeString(body.title);
  if (!externalJobUid) return NextResponse.json({ error: "job_uid is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const admin = await createAdminClient();
  const { data: masters, error: mastersError } = await admin
    .from("masters")
    .select("id, name, type")
    .in("type", ["site", "designation"]);

  if (mastersError) return NextResponse.json({ error: mastersError.message }, { status: 500 });

  const jobPayload = {
    external_source: "site4people",
    external_job_uid: externalJobUid,
    external_job_id: nullableString(body.job_id),
    external_received_at: new Date().toISOString(),
    external_payload: body,
    title,
    job_type: "client",
    status: "open",
    priority: body.boost_type ? "high" : "normal",
    designation_id: firstMatchingMasterId(masters ?? [], "designation", [
      body.title,
      body.category,
      body.skill_category_name,
    ]),
    site_id: firstMatchingMasterId(masters ?? [], "site", [
      body.location,
      body.address_city_id,
      body.address_area,
      body.address_state_id,
      body.address_country_id,
    ]),
    department: nullableString(body.category),
    headcount: safeInt(body.openings) ?? 1,
    description: htmlToText(body.description),
    requirements: buildRequirements(body),
    min_salary: safeNumber(body.minimum_salary),
    max_salary: safeNumber(body.maximum_salary),
    client_name: "Site4People",
    opened_at: unixDate(body.created_at),
    job_platform: "Site4People",
    is_deleted: false,
  };

  const { data: job, error } = await admin
    .from("jobs")
    .upsert(jobPayload, { onConflict: "external_source,external_job_uid" })
    .select("id, title, external_job_uid, external_job_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicJobUrl = getPublicJobUrl(job.id);
  const { error: postingError } = await admin
    .from("job_postings")
    .upsert({
      job_id: job.id,
      platform: GOOGLE_JOBS_PLATFORM,
      status: "pending",
      external_post_url: publicJobUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,platform" });

  if (postingError) return NextResponse.json({ error: postingError.message }, { status: 500 });

  return NextResponse.json({
    data: {
      ats_job_id: job.id,
      job_uid: job.external_job_uid,
      site4people_job_id: job.external_job_id,
      title: job.title,
      public_job_url: publicJobUrl,
    },
  }, { status: 202 });
}
