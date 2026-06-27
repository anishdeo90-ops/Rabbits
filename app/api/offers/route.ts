import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const status = p.get("status");
  const myOnly = p.get("my") === "1";

  let query = supabase
    .from("candidate_offers")
    .select(`
      *,
      candidate:candidates(
        id, name, mobile, email, final_status,
        designation:masters!candidates_designation_id_fkey(name),
        site:masters!candidates_site_id_fkey(name)
      ),
      creator:profiles!candidate_offers_created_by_fkey(id, name)
    `)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (myOnly) query = query.eq("created_by", user.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((offer) => {
    const candidate = offer.candidate as Record<string, any> | null;
    const creator = offer.creator as Record<string, any> | null;
    return {
      ...offer,
      candidate: candidate
        ? { id: candidate.id, name: candidate.name, mobile: candidate.mobile, email: candidate.email, final_status: candidate.final_status }
        : null,
      candidate_name: candidate?.name,
      candidate_mobile: candidate?.mobile,
      designation_name: candidate?.designation?.name,
      site_name: candidate?.site?.name,
      creator,
      creator_name: creator?.name,
    };
  });

  return NextResponse.json({ data: result });
}
