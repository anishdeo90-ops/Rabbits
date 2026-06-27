import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CandidatesClient from "./candidates-client";
import type { Master, Profile } from "@/lib/types";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ status?: string; hr_id?: string; designation_id?: string; designation_name?: string; job_id?: string; owner?: string; site_id?: string; date_from?: string; date_to?: string; pipeline_stage?: string; forward_to_id?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  const [profileRow, sitesRows, designationsRows, sourcesRows, statusesRows, recruitersRows, interviewersRows] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("masters").select("*").eq("type", "site").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "designation").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "source").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "status").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id,name,role,email,is_active,department,created_at").in("role", ["recruiter", "hr_manager", "admin", "hod"]).order("name"),
    supabase.from("masters").select("*").eq("type", "interviewer").eq("is_active", true).order("sort_order"),
  ]);

  const profile = profileRow.data as Profile | null;
  const initialDesignationId =
    params.designation_id ??
    (params.designation_name
      ? (designationsRows.data ?? []).find(d => d.name.trim().toLowerCase() === params.designation_name?.trim().toLowerCase())?.id
      : "") ??
    "";

  return (
    <CandidatesClient
      profile={profile as Profile}
      sites={(sitesRows.data ?? []) as Master[]}
      designations={(designationsRows.data ?? []) as Master[]}
      sources={(sourcesRows.data ?? []) as Master[]}
      statuses={(statusesRows.data ?? []) as Master[]}
      recruiters={(recruitersRows.data ?? []) as Profile[]}
      interviewers={(interviewersRows.data ?? []) as Master[]}
      initialStatus={params.status ?? ""}
      initialHrId={params.hr_id ?? ""}
      initialDesignationId={initialDesignationId}
      initialJobId={params.job_id ?? ""}
      initialOwner={params.owner === "mine" ? "mine" : params.owner === "all" ? "all" : profile?.role === "recruiter" ? "mine" : "all"}
      initialSiteId={params.site_id ?? ""}
      initialDateFrom={params.date_from ?? ""}
      initialDateTo={params.date_to ?? ""}
      initialPipelineStage={params.pipeline_stage ?? ""}
      initialForwardToId={params.forward_to_id ?? ""}
    />
  );
}
