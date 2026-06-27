import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const user = users.users.find((entry) => entry.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
