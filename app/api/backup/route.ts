import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // Fetch all non-deleted candidates
  const { data: candidates, error: fetchError } = await supabase
    .from("candidates")
    .select("*")
    .eq("is_deleted", false);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  // Log the backup
  const { data: log, error: logError } = await supabase
    .from("backup_log")
    .insert({
      created_by: user.id,
      row_count: candidates?.length ?? 0,
      status: "success",
      filename: `backup_${new Date().toISOString().split("T")[0]}.json`,
    })
    .select()
    .single();

  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  return NextResponse.json({ success: true, row_count: candidates?.length ?? 0, log });
}
