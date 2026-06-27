import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

const ALLOWED_COLUMNS = new Set([
  "designation_id",
  "question",
  "question_type",
  "is_mandatory",
  "sort_order",
  "is_active",
]);

function mapBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_COLUMNS.has(key)) out[key] = value;
  }
  return out;
}

async function getProfileRole(userId: string) {
  const admin = await createAdminClient();
  const { data, error } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return { admin, role: data?.role as string | undefined, error };
}

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("screening_questions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { admin, role, error: roleError } = await getProfileRole(user.id);
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
  if (!["admin", "hr_manager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const { data, error } = await admin
    .from("screening_questions")
    .insert({ ...mapBody(body), created_by: user.id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...rest } = body as { id?: string } & Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { admin, role, error: roleError } = await getProfileRole(user.id);
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
  if (!["admin", "hr_manager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("screening_questions")
    .update(mapBody(rest))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}
