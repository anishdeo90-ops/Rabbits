import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("email_templates")
    .select(`
      *,
      linked_jobs:email_template_jobs(job_id, job:jobs!email_template_jobs_job_id_fkey(id, title))
    `)
    .eq("is_active", true)
    .order("template_type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((t) => ({
    ...t,
    linked_job_ids: (t.linked_jobs as { job_id: string }[])?.map((lj) => lj.job_id) ?? [],
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
  const { job_ids, ...templateData } = body;

  if (!templateData.name || !templateData.subject || !templateData.body) {
    return NextResponse.json({ error: "name, subject, body required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({ ...templateData, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (job_ids?.length) {
    await supabase.from("email_template_jobs").insert(
      job_ids.map((jid: string) => ({ template_id: data.id, job_id: jid }))
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "hr_manager"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, job_ids, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(job_ids)) {
    await supabase.from("email_template_jobs").delete().eq("template_id", id);
    if (job_ids.length) {
      await supabase.from("email_template_jobs").insert(
        job_ids.map((jid: string) => ({ template_id: id, job_id: jid }))
      );
    }
  }

  return NextResponse.json({ data });
}
