import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  telephonic: "Telephonic",
  gf: "GF / Screen",
  pi: "PI Rounds",
  comms: "Comms",
  files: "Files",
  forms: "Forms",
  offer: "Offer",
  final: "Final",
  notes: "Notes",
  history: "History",
};

type Profile = { id: string; name: string | null; role: string | null };
type Candidate = { id: string; name: string | null };
type Forward = {
  id: string;
  candidate_id: string;
  from_user_id: string;
  to_user_id: string;
  completed_by: string | null;
  [key: string]: unknown;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get("candidate_id");
  const toMe = searchParams.get("to_me") === "true";
  const status = searchParams.get("status");
  const admin = await createAdminClient();

  let query = admin.from("candidate_forwards").select("*").order("created_at", { ascending: false });
  if (candidateId) query = query.eq("candidate_id", candidateId);
  if (toMe) query = query.eq("to_user_id", user.id);
  if (status) query = query.eq("status", status);

  const { data: forwards, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (forwards ?? []) as Forward[];
  const profileIds = unique(rows.flatMap((row) => [row.from_user_id, row.to_user_id, row.completed_by]));
  const candidateIds = unique(rows.map((row) => row.candidate_id));

  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id,name,role").in("id", profileIds)
    : { data: [] as Profile[] };
  const { data: candidates } = candidateIds.length
    ? await admin.from("candidates").select("id,name").in("id", candidateIds)
    : { data: [] as Candidate[] };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const candidateById = new Map((candidates ?? []).map((candidate) => [candidate.id, candidate]));

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      from_profile: profileById.get(row.from_user_id) ?? null,
      to_profile: profileById.get(row.to_user_id) ?? null,
      completed_profile: row.completed_by ? profileById.get(row.completed_by) ?? null : null,
      candidate: candidateById.get(row.candidate_id) ?? null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { candidate_id, to_user_id, unlocked_tabs, note } = body;

  if (!candidate_id || !to_user_id || !Array.isArray(unlocked_tabs) || unlocked_tabs.length === 0) {
    return NextResponse.json(
      { error: "candidate_id, to_user_id, and at least one unlocked_tab are required" },
      { status: 400 }
    );
  }

  const admin = await createAdminClient();
  const [{ data: sender }, { data: candidate }, { data: recipient }] = await Promise.all([
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    admin.from("candidates").select("name").eq("id", candidate_id).maybeSingle(),
    admin.from("profiles").select("id").eq("id", to_user_id).maybeSingle(),
  ]);

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (!recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  const senderName = sender?.name ?? "A team member";
  const tabList = (unlocked_tabs as string[]).map((tab) => TAB_LABELS[tab] ?? tab).join(", ");

  const { data: forward, error } = await admin
    .from("candidate_forwards")
    .insert({
      candidate_id,
      from_user_id: user.id,
      to_user_id,
      unlocked_tabs,
      note: note ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: to_user_id,
    type: "candidate_forwarded",
    candidate_id,
    forward_id: forward.id,
    title: `${senderName} sent you a candidate`,
    body: `Review ${candidate.name} - editable sections: ${tabList}`,
    is_read: false,
  });

  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
  return NextResponse.json(forward, { status: 201 });
}
