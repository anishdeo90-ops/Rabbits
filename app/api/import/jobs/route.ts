import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}
function safeNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}
function safeInt(v: unknown): number | null {
  const n = safeNum(v);
  return n == null ? null : Math.round(n);
}
function safeDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Excel serial date
  if (/^\d{4,6}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s) * 86400000);
    return d.toISOString().split("T")[0];
  }
  // Various date formats
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

const COLUMN_MAP: Record<string, string> = {
  // Title
  "Job Title":        "title",
  "Title":            "title",
  "Position":         "title",
  "Role":             "title",
  "Vacancy":          "title",
  // Designation
  "Designation":      "designation_raw",
  "Function":         "designation_raw",
  "Department":       "designation_raw",
  "Job Function":     "designation_raw",
  // Site
  "Location":         "site_raw",
  "Site":             "site_raw",
  "Office":           "site_raw",
  "Work Location":    "site_raw",
  "City":             "site_raw",
  // Headcount
  "Headcount":        "headcount",
  "Openings":         "headcount",
  "No of Openings":   "headcount",
  "Number of Openings": "headcount",
  "Vacancies":        "headcount",
  // Priority
  "Priority":         "priority",
  "Seniority":        "priority",
  "Seniority Level":  "priority",
  "Urgency":          "priority",
  // Status
  "Status":           "status",
  "Job Status":       "status",
  // Type
  "Type":             "job_type",
  "Job Type":         "job_type",
  "Employment Type":  "job_type",
  "Job Platform":     "job_platform",
  "Platform":         "job_platform",
  "Posted On":        "job_platform",
  "Source Platform":  "job_platform",
  // Salary
  "Min Salary":       "min_salary",
  "Min CTC":          "min_salary",
  "Salary Min":       "min_salary",
  "Max Salary":       "max_salary",
  "Max CTC":          "max_salary",
  "Salary Max":       "max_salary",
  "Salary Range":     "salary_range",
  // Dates
  "Opening Date":     "opened_at",
  "Posted Date":      "opened_at",
  "Date Posted":      "opened_at",
  "Target DOJ":       "target_doj",
  "Target Join Date": "target_doj",
  "Expected DOJ":     "target_doj",
  // Other
  "Description":      "description",
  "Job Description":  "description",
  "Requirements":     "requirements",
  "Skills Required":  "requirements",
  "Client":           "client_name",
  "Client Name":      "client_name",
};

const PRIORITY_MAP: Record<string, string> = {
  "urgent": "urgent", "immediate": "urgent", "asap": "urgent",
  "high": "high", "senior": "high", "director": "high", "manager": "high",
  "normal": "normal", "mid": "normal", "mid-senior": "normal", "associate": "normal", "entry level": "normal",
  "low": "low", "internship": "low", "fresher": "low",
};

const STATUS_MAP: Record<string, string> = {
  "open": "open", "active": "open", "live": "open",
  "on hold": "on_hold", "on_hold": "on_hold", "paused": "on_hold",
  "closed": "closed", "expired": "closed",
  "filled": "filled", "hired": "filled", "completed": "filled",
};

const JOB_TYPE_MAP: Record<string, string> = {
  "internal": "internal", "full time": "internal", "full-time": "internal",
  "client": "client", "contract": "client", "staffing": "client",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { rows: Record<string, unknown>[]; columnMapping: Record<string, string> };
  const { rows, columnMapping } = body;
  if (!rows?.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

  // Preload masters for name → id resolution
  const { data: mastersData } = await supabase.from("masters").select("id, name, type");
  const masters = mastersData ?? [];
  const siteMap   = new Map(masters.filter(m => m.type === "site").map(m => [m.name.toLowerCase(), m.id]));
  const designMap = new Map(masters.filter(m => m.type === "designation").map(m => [m.name.toLowerCase(), m.id]));

  const results: { row: number; status: "created" | "error"; title?: string; error?: string }[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    // Map Excel columns → internal keys using provided mapping + COLUMN_MAP fallback
    const mapped: Record<string, unknown> = {};
    for (const [excelCol, val] of Object.entries(raw)) {
      const dbCol = columnMapping[excelCol] ?? COLUMN_MAP[excelCol];
      if (dbCol && dbCol !== "skip") mapped[dbCol] = val;
    }

    const title = safeStr(mapped.title);
    if (!title) { results.push({ row: i + 1, status: "error", error: "Title is required" }); continue; }

    // Resolve site and designation
    const siteRaw  = safeStr(mapped.site_raw).toLowerCase();
    const desigRaw = safeStr(mapped.designation_raw).toLowerCase();
    const siteId   = siteRaw   ? (siteMap.get(siteRaw)   ?? null) : null;
    const designId = desigRaw  ? (designMap.get(desigRaw) ?? null) : null;

    // Normalise priority
    const priorityRaw = safeStr(mapped.priority).toLowerCase();
    const priority = PRIORITY_MAP[priorityRaw] ?? "normal";

    // Normalise status
    const statusRaw = safeStr(mapped.status).toLowerCase();
    const status = STATUS_MAP[statusRaw] ?? "open";

    // Normalise job type
    const typeRaw = safeStr(mapped.job_type).toLowerCase();
    const job_type = JOB_TYPE_MAP[typeRaw] ?? "internal";

    // Handle salary_range "50000-80000"
    let minSalary = safeNum(mapped.min_salary);
    let maxSalary = safeNum(mapped.max_salary);
    if (!minSalary && mapped.salary_range) {
      const parts = String(mapped.salary_range).split(/[-–]/);
      if (parts[0]) minSalary = safeNum(parts[0]);
      if (parts[1]) maxSalary = safeNum(parts[1]);
    }

    const jobRow = {
      title,
      designation_id: designId,
      site_id:        siteId,
      headcount:      safeInt(mapped.headcount) ?? 1,
      priority,
      status,
      job_type,
      job_platform:   safeStr(mapped.job_platform) || null,
      min_salary:     minSalary,
      max_salary:     maxSalary,
      opened_at:      safeDate(mapped.opened_at),
      target_doj:     safeDate(mapped.target_doj),
      description:    safeStr(mapped.description) || null,
      requirements:   safeStr(mapped.requirements) || null,
      client_name:    safeStr(mapped.client_name)  || null,
      created_by:     user.id,
      is_deleted:     false,
    };

    const { error } = await supabase.from("jobs").insert(jobRow);
    if (error) {
      results.push({ row: i + 1, status: "error", title, error: error.message });
    } else {
      created++;
      results.push({ row: i + 1, status: "created", title });
    }
  }

  return NextResponse.json({ created, total: rows.length, results });
}
