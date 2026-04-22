import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const candidateId = p.get("candidate_id");
  const myOnly      = p.get("my") === "1";
  const limit       = parseInt(p.get("limit") ?? "50");

  let query = supabase
    .from("candidate_communications")
    .select(`
      *,
      candidate:candidates!candidate_communications_candidate_id_fkey(id, name, designation_id,
        designation:masters!candidates_designation_id_fkey(name)
      ),
      creator:profiles!candidate_communications_created_by_fkey(id, name)
    `)
    .order("communicated_at", { ascending: false })
    .limit(limit);

  if (candidateId) query = query.eq("candidate_id", candidateId);
  if (myOnly)      query = query.eq("created_by", user.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map(c => ({
    ...c,
    candidate_name:     (c.candidate as { name: string } | null)?.name,
    designation_name:   (c.candidate as { designation?: { name: string } } | null)?.designation?.name,
    creator_name:       (c.creator   as { name: string } | null)?.name,
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { candidate_id, type, direction, subject, content, communicated_at } = body;

  if (!candidate_id || !type || !content)
    return NextResponse.json({ error: "candidate_id, type, content required" }, { status: 400 });

  const { data, error } = await supabase
    .from("candidate_communications")
    .insert({
      candidate_id,
      type,
      direction: direction ?? "outbound",
      subject:   subject   ?? null,
      content,
      communicated_at: communicated_at ?? new Date().toISOString(),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("candidate_communications")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
