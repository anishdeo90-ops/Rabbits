import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueInterviewTriggers, enqueueStageChangeTriggers } from "@/lib/automation/triggers";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const p = new URL(req.url).searchParams;
  const candidateId  = p.get("candidate_id");
  const status       = p.get("status");
  const dateFrom     = p.get("date_from");
  const dateTo       = p.get("date_to");
  const upcomingOnly = p.get("upcoming") === "1";

  let query = supabase
    .from("interviews")
    .select(`
      *,
      candidate:candidates!interviews_candidate_id_fkey(id, name, mobile,
        designation:masters!candidates_designation_id_fkey(name)
      ),
      interviewer:profiles!interviews_interviewer_id_fkey(id, name)
    `)
    .order("scheduled_at", { ascending: true });

  // Recruiters see only their scheduled interviews
  if (profile?.role === "recruiter") query = query.eq("created_by", user.id);

  if (candidateId) query = query.eq("candidate_id", candidateId);
  if (status)      query = query.eq("status", status);
  if (dateFrom)    query = query.gte("scheduled_at", dateFrom);
  if (dateTo)      query = query.lte("scheduled_at", dateTo);
  if (upcomingOnly) query = query.gte("scheduled_at", new Date().toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((i) => ({
    ...i,
    candidate_name: (i.candidate as { name: string } | null)?.name,
    designation_name: (i.candidate as { designation?: { name: string } } | null)?.designation?.name,
    interviewer_name: (i.interviewer as { name: string } | null)?.name ?? i.interviewer_name,
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { candidate_id, round, scheduled_at, interviewer_id, interviewer_name,
          location, meet_link, duration_mins, notes, job_id } = body;

  if (!candidate_id || !round || !scheduled_at) {
    return NextResponse.json({ error: "candidate_id, round, scheduled_at required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      candidate_id, round, scheduled_at, interviewer_id, interviewer_name,
      location, meet_link, duration_mins: duration_mins ?? 60, notes, job_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-update candidate stage based on round
  const stageMap: Record<string, string> = {
    telephonic: "Tel Int Scheduled",
    pi1: "PI Scheduled",
    pi2: "PI Scheduled",
    pi3: "PI Scheduled",
  };
  const newStage = stageMap[round];
  if (newStage) {
    await supabase.from("candidates")
      .update({ final_status: newStage, updated_by: user.id })
      .eq("id", candidate_id);
    await enqueueStageChangeTriggers(candidate_id, newStage);
  }

  await enqueueInterviewTriggers(data);

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("interviews")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
