import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId  = searchParams.get("job_id");
  const formId = searchParams.get("form_id");

  let q = supabase.from("form_job_links").select("*, forms(id,name,type), jobs(id,title)");
  if (jobId)  q = q.eq("job_id", jobId);
  if (formId) q = q.eq("form_id", formId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { form_id, job_id } = await req.json();
  if (!form_id || !job_id) return NextResponse.json({ error: "form_id and job_id required" }, { status: 400 });

  const { error } = await supabase.from("form_job_links").upsert({ form_id, job_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formId = searchParams.get("form_id");
  const jobId  = searchParams.get("job_id");
  if (!formId || !jobId) return NextResponse.json({ error: "form_id and job_id required" }, { status: 400 });

  const { error } = await supabase.from("form_job_links").delete().eq("form_id", formId).eq("job_id", jobId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
