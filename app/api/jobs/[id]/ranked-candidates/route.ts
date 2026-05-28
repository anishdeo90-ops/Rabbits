import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("candidate_job_scores")
    .select(`
      fit_score,
      fit_breakdown,
      scored_at,
      candidates (
        id, name, mobile, email, current_designation, current_location,
        present_salary, expected_salary, notice_period_days,
        ai_summary, parsed_keywords, cv_drive_url, final_status
      )
    `)
    .eq("job_id", id)
    .order("fit_score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
