import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: fetch sync config + conflicts for current user (or specific recruiter for admin)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const p = new URL(req.url).searchParams;
  const targetId = p.get("recruiter_id") ?? user.id;

  // Only admin/hr_manager can view other recruiters' sync
  if (targetId !== user.id && !["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [configRes, conflictsRes, allConfigsRes] = await Promise.all([
    supabase.from("sync_configs").select("*").eq("recruiter_id", targetId).single(),
    supabase.from("sync_conflicts")
      .select("*, candidate:candidates!sync_conflicts_candidate_id_fkey(id, name)")
      .eq("recruiter_id", targetId)
      .eq("resolution", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    // Admin: all recruiter configs
    ["admin", "hr_manager"].includes(profile?.role ?? "")
      ? supabase.from("sync_configs")
          .select("*, recruiter:profiles!sync_configs_recruiter_id_fkey(id, name, email)")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    config: configRes.data,
    conflicts: (conflictsRes.data ?? []).map((c) => ({
      ...c,
      candidate_name: (c.candidate as { name: string } | null)?.name,
    })),
    all_configs: allConfigsRes.data,
  });
}

// POST: save/update sync config
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sheet_id, sheet_name, sync_direction, auto_sync, sync_frequency } = body;

  const { data, error } = await supabase
    .from("sync_configs")
    .upsert({
      recruiter_id: user.id,
      sheet_id, sheet_name: sheet_name ?? "Master",
      sync_direction: sync_direction ?? "both",
      auto_sync: auto_sync ?? false,
      sync_frequency: sync_frequency ?? "manual",
      updated_at: new Date().toISOString(),
    }, { onConflict: "recruiter_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// PATCH: resolve a conflict
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { conflict_id, resolution } = body;

  if (!conflict_id || !["keep_db", "keep_sheet", "manual"].includes(resolution)) {
    return NextResponse.json({ error: "conflict_id and valid resolution required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sync_conflicts")
    .update({ resolution, resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", conflict_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If keep_sheet, apply value to candidate
  if (resolution === "keep_sheet" && data.candidate_id && data.field_name && data.sheet_value) {
    await supabase
      .from("candidates")
      .update({ [data.field_name]: data.sheet_value, updated_by: user.id })
      .eq("id", data.candidate_id);
  }

  return NextResponse.json({ data });
}
