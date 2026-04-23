import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function ownedByRecruiterFilter(userId: string) {
  return `created_by.eq.${userId},hr_id.eq.${userId}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  // Default: current calendar month
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const dateFrom = p.get("date_from") ?? defaultFrom;
  const dateTo   = p.get("date_to")   ?? defaultTo;

  // 1. Candidates added by this recruiter this period
  const { data: candidatesAdded, count: totalAdded } = await supabase
    .from("candidates")
    .select("id, name, designation_id, final_status, updated_at, doj_actual", { count: "exact" })
    .eq("created_by", user.id)
    .eq("is_deleted", false)
    .gte("application_date", dateFrom)
    .lte("application_date", dateTo)
    .order("updated_at", { ascending: false });

  // 2. Interviews scheduled by this recruiter, upcoming
  const { data: upcomingInterviews } = await supabase
    .from("interviews")
    .select(`
      id, round, scheduled_at, status, meet_link, interviewer_name, duration_mins,
      candidate:candidates!interviews_candidate_id_fkey(id, name,
        designation:masters!candidates_designation_id_fkey(name)
      )
    `)
    .eq("created_by", user.id)
    .gte("scheduled_at", new Date().toISOString())
    .in("status", ["scheduled", "confirmed"])
    .order("scheduled_at", { ascending: true })
    .limit(20);

  // 3. Joinings (all time) by this recruiter
  const { data: joinings } = await supabase
    .from("candidates")
    .select("id, name, site_id, doj_actual, doj, file_no, designation_id, final_status, updated_at")
    .eq("is_deleted", false)
    .or(ownedByRecruiterFilter(user.id))
    .or("final_status.eq.Joined,doj_actual.not.is.null,doj.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(50);

  // 4. Pending follow-ups: candidates with no update in 3+ days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { count: pendingFollowups } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .or(ownedByRecruiterFilter(user.id))
    .eq("is_deleted", false)
    .not("final_status", "in", "(Joined,Rejected/Dropped,Offered But Not Joined,Offered,Appointed/Offered)")
    .lt("updated_at", threeDaysAgo);

  // 5. Interview count this period
  const { count: interviewCount } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("scheduled_at", `${dateFrom}T00:00:00`)
    .lte("scheduled_at", `${dateTo}T23:59:59`);

  // Format upcoming interviews
  const formattedInterviews = (upcomingInterviews ?? []).map((i) => ({
    ...i,
    candidate_name: (i.candidate as unknown as { name: string } | null)?.name,
    designation_name: (i.candidate as unknown as { designation?: { name: string } } | null)?.designation?.name,
  }));

  const normalizedJoinings = (joinings ?? []).map((joining) => ({
    ...joining,
    doj_actual: joining.doj_actual ?? joining.doj ?? null,
  }));

  return NextResponse.json({
    stats: {
      candidates_added: totalAdded ?? 0,
      interviews_scheduled: interviewCount ?? 0,
      joinings: normalizedJoinings.length,
      pending_followups: pendingFollowups ?? 0,
    },
    upcoming_interviews: formattedInterviews,
    recent_candidates: (candidatesAdded ?? []).slice(0, 20),
    joinings: normalizedJoinings,
    period: { date_from: dateFrom, date_to: dateTo },
  });
}
