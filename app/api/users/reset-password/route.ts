import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

function genPassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { email, id, password: providedPassword } = body as { email?: string; id?: string; password?: string };

  if (!email && !id) {
    return NextResponse.json({ error: "email or id required" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
  const target = users.users.find((entry) => id ? entry.id === id : entry.email?.toLowerCase() === email?.toLowerCase());
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isSelf = target.id === user.id;
  if (!isSelf) {
    const { data: selfProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (selfProfile?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can reset other users' passwords" }, { status: 403 });
    }
  }

  const newPassword = providedPassword && providedPassword.length >= 8 ? providedPassword : genPassword();
  const { error } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
  if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });

  return NextResponse.json({
    success:   true,
    email:     target.email ?? email,
    password:  newPassword,
    generated: !providedPassword,
  });
}
