import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

type Forward = {
  id: string;
  candidate_id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: forward, error: forwardError } = await admin
    .from("candidate_forwards")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (forwardError) return NextResponse.json({ error: forwardError.message }, { status: 500 });
  if (!forward) return NextResponse.json({ error: "Forward not found" }, { status: 404 });

  const typedForward = forward as Forward;
  if (typedForward.to_user_id !== user.id) {
    return NextResponse.json({ error: "Only the recipient can complete this forward" }, { status: 403 });
  }
  if (typedForward.status === "completed") {
    return NextResponse.json({ error: "Already completed" }, { status: 409 });
  }

  const [{ data: completor }, { data: candidate }] = await Promise.all([
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    admin.from("candidates").select("name").eq("id", typedForward.candidate_id).maybeSingle(),
  ]);

  const completorName = completor?.name ?? "A team member";
  const { data: updated, error: updateError } = await admin
    .from("candidate_forwards")
    .update({
      status: "completed",
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: typedForward.from_user_id,
    type: "forward_completed",
    candidate_id: typedForward.candidate_id,
    forward_id: params.id,
    title: "Candidate review completed",
    body: `${candidate?.name ?? "Candidate"} was reviewed by ${completorName}`,
    is_read: false,
  });

  if (notificationError) return NextResponse.json({ error: notificationError.message }, { status: 500 });
  return NextResponse.json(updated);
}
