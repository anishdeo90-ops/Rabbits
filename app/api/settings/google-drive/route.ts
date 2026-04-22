import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET — return current Google Drive config (masked, no full JSON exposed)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("google_drive_settings")
    .select("id, folder_id, folder_name, is_active, created_at, service_account_json")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return NextResponse.json({ data: null });

  // Parse service account to extract the client_email (safe to show)
  let client_email = "";
  try {
    const parsed = JSON.parse(data.service_account_json);
    client_email = parsed.client_email ?? "";
  } catch { /* ignore */ }

  return NextResponse.json({
    data: {
      id:           data.id,
      folder_id:    data.folder_id,
      folder_name:  data.folder_name,
      is_active:    data.is_active,
      created_at:   data.created_at,
      client_email,
    }
  });
}

// POST — save / update Google Drive config (all authenticated users)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { service_account_json, folder_id, folder_name } = await req.json();
  if (!service_account_json || !folder_id)
    return NextResponse.json({ error: "service_account_json and folder_id are required" }, { status: 400 });

  // Validate JSON is a valid service account
  try {
    const parsed = JSON.parse(service_account_json);
    if (!parsed.client_email || !parsed.private_key)
      return NextResponse.json({ error: "Invalid service account JSON — missing client_email or private_key" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON — paste the full service account key file content" }, { status: 400 });
  }

  // Delete old config and insert new
  await supabase.from("google_drive_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { data, error } = await supabase
    .from("google_drive_settings")
    .insert({ service_account_json, folder_id, folder_name: folder_name || null, is_active: true, created_by: user.id })
    .select("id, folder_id, folder_name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE — remove Google Drive config (all authenticated users)
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("google_drive_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return NextResponse.json({ success: true });
}
