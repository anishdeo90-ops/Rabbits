import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeString, safeNumber, excelDateToISO } from "@/lib/utils";

// Excel column → DB column mapping (matches Master Data HR.xlsx structure)
const COLUMN_MAP: Record<string, string> = {
  "HR NAME":                            "hr_name_raw",
  "HR Name":                            "hr_name_raw",
  "MONTH":                              "month",
  "APPLICATIONS RECEIVED DATE":         "application_date",
  "Applications Received Date":         "application_date",
  "LINK":                               "cv_drive_url",
  "Link":                               "cv_drive_url",
  "CV Link":                            "cv_drive_url",
  "CV":                                 "cv_drive_url",
  "Resume Link":                        "cv_drive_url",
  "Profile Link":                       "naukri_profile_url",
  "Naukri Link":                        "naukri_profile_url",
  "LinkedIn":                           "naukri_profile_url",
  "NAME OF APPLICANT":                  "name",
  "Name of Applicant":                  "name",
  "CURRENT DESIGNATION":                "current_designation",
  "Current Designation":                "current_designation",
  "DESIGNATION":                        "designation_raw",
  "Designation (Recruited For)":        "designation_raw",
  "Contract Required For":              "site_raw",
  "Site Recruited For":                 "site_raw",
  "MOBILE NO":                          "mobile",
  "EMAIL ID":                           "email",
  "SUITABLE FOR OTHER POSITION":        "suitable_other_position",
  "CANDIDATE CURRENT LOCATION":         "current_location",
  "SOURCE":                             "source_raw",
  "PRESENT SALARY":                     "present_salary",
  "Present Salary (CTC PM)":            "present_salary",
  "EXPECTED SALARY":                    "expected_salary",
  "Expected Salary":                    "expected_salary",
  "GOOGLE FORMS SENT":                  "google_form_sent",
  "GOOGLE FORMS SENT DATE":             "google_form_sent_date",
  "Google Form Sent Date":              "google_form_sent_date",
  "GOOGLE FORM RECEIVED":               "google_form_received",
  "GOOGLE FORM RECEIVED DATE":          "google_form_received_date",
  "Google Form Received Date":          "google_form_received_date",
  "PROCESSED BY HR":                    "processed_by_hr",
  "PROCESSED BY HR DATE":               "processed_by_hr_date",
  "SHORTLIST BY HR":                    "shortlist_by_hr",
  "SHORTLIST BY HR DATE":               "shortlist_by_hr_date",
  "TEL INT DATE":                       "tel_int_date",
  "TELEPHONIC INT REMARKS (Recruiter)": "tel_int_remarks",
  "HR MANAGER REMARKS":                 "hr_manager_remarks",
  "REMARKS BEFORE PI":                  "remarks_before_pi",
  "MGMT REMARKS BEFORE PI":             "mgmt_remarks_before_pi",
  "Shortlisted For Personal Interview": "shortlisted_for_pi",
  "Shortlisted For PI Date":            "shortlisted_for_pi_date",
  "PI 1 Date":                          "pi1_date",
  "PI 1 Taken By":                      "pi1_taken_by",
  "PI 1 Remarks":                       "pi1_remarks",
  "PI 2 Date":                          "pi2_date",
  "PI 2 Taken By":                      "pi2_taken_by",
  "PI 2 Remarks":                       "pi2_remarks",
  "PI 3 Date":                          "pi3_date",
  "PI 3 Taken By":                      "pi3_taken_by",
  "PI 3 Remarks":                       "pi3_remarks",
  "Notice Period":                      "notice_period_days",
  "Notice Period (days)":               "notice_period_days",
  "File No":                            "file_no",
  "GF ISSUED Y/N":                      "gf_issued",
  "SHORTLISTED BY MGMT":                "shortlisted_by_mgmt",
  "SHORTLISTED BY MGMT DATE":           "shortlisted_by_mgmt_date",
  "Shortlisted By Mgmt Date":           "shortlisted_by_mgmt_date",
  "Guarantee Form ISSUE DATE":          "gf_issue_date",
  "Guarantee Form RECEIVED DATE":       "gf_received_date",
  "GF VERIFIED":                        "gf_verified",
  "GF VERIFICATION REPORT":             "gf_verification_report",
  "DATE OF ADDRESS VERIFICATION LETTER SHARED":   "addr_verification_shared",
  "DATE OF ADDRESS VERIFICATION LETTER RECEIVED": "addr_verification_received",
  "Remarks":                            "remarks",
  "Tele Int by HOD Name & Comments":    "remarks_before_pi",
  "FINAL STATUS":                       "final_status",
  "Final Status":                       "final_status",
  "Final Status Date":                  "final_status_date",
  "Offered Date":                       "offered_date",
  "Offered But Did Not Join Date":      "offered_not_joined_date",
  "Final Action":                       "final_action",
  "FILE NO":                            "file_no",
  "DOJ":                                "doj",
  "HARD COPY Y/N":                      "hard_copy",
};

const DATE_FIELDS = new Set([
  "application_date","tel_int_date","pi1_date","pi2_date","pi3_date",
  "google_form_sent_date","google_form_received_date","processed_by_hr_date",
  "shortlist_by_hr_date","shortlisted_for_pi_date","shortlisted_by_mgmt_date",
  "gf_issue_date","gf_received_date","offered_date","offered_not_joined_date",
  "final_status_date","addr_verification_shared","addr_verification_received",
  "doj","doj_actual",
]);

const NUMBER_FIELDS = new Set(["present_salary","expected_salary","offered_salary","notice_period_days"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin","hr_manager","recruiter"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const { rows, columnMapping } = body as {
    rows: Record<string, unknown>[];
    columnMapping: Record<string, string>;
  };

  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

  // Fetch master lookup maps
  const { data: masters } = await supabase.from("masters").select("id,type,name").eq("is_active", true);
  const masterMap: Record<string, Record<string, string>> = {};
  for (const m of masters ?? []) {
    if (!masterMap[m.type]) masterMap[m.type] = {};
    masterMap[m.type][m.name.toLowerCase()] = m.id;
  }

  // Fetch HR profiles
  const { data: hrProfiles } = await supabase.from("profiles").select("id,name").eq("role","recruiter");
  const hrMap: Record<string, string> = {};
  for (const p of hrProfiles ?? []) hrMap[p.name.toLowerCase()] = p.id;

  const records = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    if (!rawRow) continue;

    const mapped: Record<string, unknown> = {};

    for (const [excelCol, rawVal] of Object.entries(rawRow)) {
      const dbCol = columnMapping[excelCol] ?? COLUMN_MAP[excelCol];
      if (!dbCol || dbCol === "skip") continue;
      mapped[dbCol] = rawVal;
    }

    if (!mapped.name || safeString(mapped.name) === "") {
      errors.push({ row: i + 2, message: "Missing candidate name, row skipped" });
      continue;
    }

    // Resolve FK: site
    const siteRaw = safeString(mapped.site_raw).toLowerCase();
    const siteId = siteRaw ? masterMap["site"]?.[siteRaw] : undefined;

    // Resolve FK: designation
    const desigRaw = safeString(mapped.designation_raw).toLowerCase();
    const designationId = desigRaw ? masterMap["designation"]?.[desigRaw] : undefined;

    // Resolve FK: source
    const sourceRaw = safeString(mapped.source_raw).toLowerCase();
    const sourceId = sourceRaw ? masterMap["source"]?.[sourceRaw] : undefined;

    // Resolve FK: HR
    const hrRaw = safeString(mapped.hr_name_raw).toLowerCase();
    const hrId = hrRaw ? hrMap[hrRaw] : user.id;

    // Build candidate record
    const record: Record<string, unknown> = {
      created_by: user.id,
      hr_id: hrId ?? user.id,
      site_id: siteId,
      designation_id: designationId,
      source_id: sourceId,
    };

    const skip = new Set(["site_raw","designation_raw","source_raw","hr_name_raw"]);

    for (const [key, val] of Object.entries(mapped)) {
      if (skip.has(key)) continue;
      if (DATE_FIELDS.has(key)) {
        if (typeof val === "number") {
          record[key] = excelDateToISO(val as number);
        } else {
          const s = safeString(val);
          record[key] = s || null;
        }
      } else if (NUMBER_FIELDS.has(key)) {
        record[key] = safeNumber(val);
      } else {
        record[key] = safeString(val) || null;
      }
    }

    records.push(record);
  }

  if (!records.length) {
    return NextResponse.json({ error: "No valid rows to import", errors }, { status: 400 });
  }

  // Batch insert in chunks of 200
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase.from("candidates").insert(chunk);
    if (error) {
      errors.push({ row: i + 2, message: error.message });
    } else {
      inserted += chunk.length;
    }
  }

  return NextResponse.json({ inserted, errors, total: rows.length });
}
