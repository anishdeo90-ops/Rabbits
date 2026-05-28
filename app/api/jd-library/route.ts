import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const designationId = p.get("designation_id");
  const search        = p.get("search");

  let query = supabase
    .from("jd_library")
    .select("*, designation:masters!jd_library_designation_id_fkey(id, name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (designationId) query = query.eq("designation_id", designationId);
  if (search)        query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((j) => ({
    ...j,
    designation_name: (j.designation as { name: string } | null)?.name,
  }));

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { data, error } = await supabase
    .from("jd_library")
    .insert({ ...body, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
