import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.parsed_keywords) {
    return NextResponse.json({ error: "parsed_keywords required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("candidates")
    .update({ parsed_keywords: body.parsed_keywords, updated_by: user.id })
    .eq("id", id)
    .select("id, parsed_keywords")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
