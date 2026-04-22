import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trigger a manual Google Sheets sync for the current user.
// This is a stub — full implementation requires Google Sheets API OAuth tokens.
// When called, it marks last_synced_at and returns current status.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: config } = await supabase
    .from("sync_configs")
    .select("*")
    .eq("recruiter_id", user.id)
    .single();

  if (!config?.sheet_id) {
    return NextResponse.json({ error: "No sheet configured. Set up your Google Sheet ID first." }, { status: 400 });
  }

  if (!config.sheet_id) {
    return NextResponse.json({ error: "Google account not connected." }, { status: 400 });
  }

  // TODO: Implement actual Google Sheets API sync using google_access_token from profiles
  // For now, simulate a successful sync
  const { data: updated, error } = await supabase
    .from("sync_configs")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_count: 0,
    })
    .eq("recruiter_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, config: updated, message: "Sync complete (Google Sheets integration pending OAuth setup)" });
}
