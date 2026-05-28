import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const candidateId = new URL(req.url).searchParams.get("candidate_id");
  if (!candidateId) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("co_sourcers")
    .select("*, profile:profiles!co_sourcers_recruiter_id_fkey(id, name, email, avatar_url)")
    .eq("candidate_id", candidateId)
    .order("role", { ascending: true }); // primary first

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((cs) => ({
    ...cs,
    recruiter_name: (cs.profile as { name: string } | null)?.name,
  }));
  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { candidate_id, recruiter_id, notes } = body;

  if (!candidate_id || !recruiter_id) {
    return NextResponse.json({ error: "candidate_id and recruiter_id required" }, { status: 400 });
  }

  // Check for duplicate detection: is this candidate already sourced?
  const { data: existing } = await supabase
    .from("candidates")
    .select("id, name, hr_id, mobile")
    .eq("id", candidate_id)
    .single();

  if (!existing) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Check if already a co-sourcer
  const { data: existingCs } = await supabase
    .from("co_sourcers")
    .select("id")
    .eq("candidate_id", candidate_id)
    .eq("recruiter_id", recruiter_id)
    .single();

  if (existingCs) {
    return NextResponse.json({ error: "Already linked as co-sourcer" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("co_sourcers")
    .insert({ candidate_id, recruiter_id, role: "co_sourcer", linked_by: user.id, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only admin/hr_manager or the recruiter themselves can remove
  const { data: cs } = await supabase.from("co_sourcers").select("recruiter_id, role").eq("id", id).single();
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = ["admin", "hr_manager"].includes(profile?.role ?? "");
  const isOwn = cs.recruiter_id === user.id;
  if (!isAdmin && !isOwn) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (cs.role === "primary") return NextResponse.json({ error: "Cannot remove primary sourcer" }, { status: 400 });

  const { error } = await supabase.from("co_sourcers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
