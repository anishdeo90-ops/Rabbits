import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function ownedByRecruiterFilter(userId: string) {
  return `created_by.eq.${userId},hr_id.eq.${userId}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  const p = new URL(req.url).searchParams;
  // Default: current calendar month
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const dateFrom = p.get("date_from") ?? defaultFrom;
  const dateTo   = p.get("date_to")   ?? defaultTo;
  const requestedRecruiterId = p.get("recruiter_id") ?? "";
  const canViewTeam = ["admin", "hr_manager"].includes(profile?.role ?? "");
  const targetRecruiterId = canViewTeam ? requestedRecruiterId : user.id;

  const { data: recruiters } = canViewTeam
    ? await supabase
      .from("profiles")
      .select("id, name")
      .in("role", ["recruiter", "hr_manager", "admin"])
      .eq("is_active", true)
      .order("name")
    : { data: [] };

  // 1. Candidates added by this recruiter this period
  let candidatesAddedQuery = supabase
    .from("candidates")
    .select("id, name, designation_id, final_status, updated_at, doj_actual", { count: "exact" })
    .eq("is_deleted", false)
    .gte("application_date", dateFrom)
    .lte("application_date", dateTo)
    .order("updated_at", { ascending: false });
  if (targetRecruiterId) candidatesAddedQuery = candidatesAddedQuery.eq("created_by", targetRecruiterId);
  const { data: candidatesAdded, count: totalAdded } = await candidatesAddedQuery;

  // 2. Interviews scheduled by this recruiter/team, upcoming
  let upcomingInterviewsQuery = supabase
    .from("interviews")
    .select(`
      id, round, scheduled_at, status, meet_link, interviewer_name, duration_mins,
      recruiter:profiles!interviews_created_by_fkey(id, name),
      candidate:candidates!interviews_candidate_id_fkey(id, name,
        designation:masters!candidates_designation_id_fkey(name)
      )
    `)
    .gte("scheduled_at", new Date().toISOString())
    .in("status", ["scheduled", "confirmed"])
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (targetRecruiterId) upcomingInterviewsQuery = upcomingInterviewsQuery.eq("created_by", targetRecruiterId);
  const { data: upcomingInterviews } = await upcomingInterviewsQuery;

  // 3. Joinings (all time) by this recruiter
  let joiningsQuery = supabase
    .from("candidates")
    .select("id, name, site_id, doj_actual, doj, file_no, designation_id, final_status, updated_at")
    .eq("is_deleted", false)
    .or("final_status.eq.Joined,doj_actual.not.is.null,doj.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (targetRecruiterId) joiningsQuery = joiningsQuery.or(ownedByRecruiterFilter(targetRecruiterId));
  const { data: joinings } = await joiningsQuery;

  // 4. Pending follow-ups: candidates with no update in 3+ days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  let pendingFollowupsQuery = supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("is_deleted", false)
    .not("final_status", "in", "(Joined,Rejected/Dropped,Offered But Not Joined,Offered,Appointed/Offered)")
    .lt("updated_at", threeDaysAgo);
  if (targetRecruiterId) pendingFollowupsQuery = pendingFollowupsQuery.or(ownedByRecruiterFilter(targetRecruiterId));
  const { count: pendingFollowups } = await pendingFollowupsQuery;

  // 5. Interview count this period
  let interviewCountQuery = supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .gte("scheduled_at", `${dateFrom}T00:00:00`)
    .lte("scheduled_at", `${dateTo}T23:59:59`);
  if (targetRecruiterId) interviewCountQuery = interviewCountQuery.eq("created_by", targetRecruiterId);
  const { count: interviewCount } = await interviewCountQuery;

  // Format upcoming interviews
  const formattedInterviews = (upcomingInterviews ?? []).map((i) => ({
    ...i,
    candidate_name: (i.candidate as unknown as { name: string } | null)?.name,
    designation_name: (i.candidate as unknown as { designation?: { name: string } } | null)?.designation?.name,
    recruiter_id: (i.recruiter as unknown as { id: string } | null)?.id,
    recruiter_name: (i.recruiter as unknown as { name: string } | null)?.name,
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
    viewer: profile,
    recruiters: recruiters ?? [],
    filters: { recruiter_id: targetRecruiterId },
  });
}
