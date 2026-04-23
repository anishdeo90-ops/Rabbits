import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { findDuplicateCandidatesByMobile } from "@/lib/candidate-duplicates";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const mobile = params.get("mobile") ?? "";
  const limit = Math.min(parseInt(params.get("limit") ?? "5", 10) || 5, 10);

  if (mobile.trim().length < 7) {
    return NextResponse.json({ data: [] });
  }

  const admin = await createAdminClient();
  const data = await findDuplicateCandidatesByMobile(admin, mobile, limit);
  return NextResponse.json({ data });
}
