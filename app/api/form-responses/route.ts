import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get("candidate_id");
  const formId      = searchParams.get("form_id");

  let q = supabase.from("form_responses").select("*, forms(name,type,fields)").order("submitted_at", { ascending: false });
  if (candidateId) q = q.eq("candidate_id", candidateId);
  if (formId)      q = q.eq("form_id", formId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Allow unauthenticated posts for public form submissions
  const supabase = await createClient();
  const body = await req.json();
  const { form_id, candidate_id, job_id, responses, respondent_name, respondent_email } = body;

  if (!form_id || !responses) return NextResponse.json({ error: "form_id and responses required" }, { status: 400 });

  const { data: saved, error } = await supabase
    .from("form_responses")
    .insert({ form_id, candidate_id: candidate_id || null, job_id: job_id || null, responses, respondent_name, respondent_email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-populate candidate profile if candidate_id provided
  if (candidate_id && responses) {
    const { data: formDef } = await supabase.from("forms").select("fields").eq("id", form_id).single();
    if (formDef?.fields) {
      const fields = formDef.fields as { id: string; maps_to?: string | null }[];
      const patch: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.maps_to && responses[f.id] !== undefined && responses[f.id] !== "") {
          patch[f.maps_to] = responses[f.id];
        }
      }
      if (Object.keys(patch).length > 0) {
        if (patch.source_name) {
          const { data: src } = await supabase.from("masters").select("id").eq("type","source").eq("name", patch.source_name).single();
          if (src) patch.source_id = src.id;
          delete patch.source_name;
        }

        const allowed = new Set([
          "name",
          "mobile",
          "email",
          "current_designation",
          "current_location",
          "present_salary",
          "expected_salary",
          "source_id",
          "designation_id",
          "site_id",
          "notice_period_days",
        ]);
        const candidateUpdate = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key)));
        if (Object.keys(candidateUpdate).length > 0) {
          const { data: existing } = await supabase.from("candidates").select("*").eq("id", candidate_id).single();
          const safeUpdate: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(candidateUpdate)) {
            const current = (existing as Record<string, unknown> | null)?.[key];
            if (current === null || current === undefined || current === "") safeUpdate[key] = value;
          }
          if (Object.keys(safeUpdate).length > 0) {
            await supabase.from("candidates").update(safeUpdate).eq("id", candidate_id);
          }
        }
      }
    }
  }

  if (candidate_id) {
    const [{ data: candidateRow }, { data: formRow }] = await Promise.all([
      supabase.from("candidates").select("name,hr_id").eq("id", candidate_id).single(),
      supabase.from("forms").select("name").eq("id", form_id).single(),
    ]);
    if (candidateRow?.hr_id) {
      await supabase.from("notifications").insert({
        user_id: candidateRow.hr_id,
        type: "form_submitted",
        candidate_id,
        title: `${candidateRow.name} filled a form`,
        body: `${candidateRow.name} has just submitted the "${formRow?.name ?? "form"}"`,
        is_read: false,
      });
    }
  }

  return NextResponse.json({ data: saved });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("form_responses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
