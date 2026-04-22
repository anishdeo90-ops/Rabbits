import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CandidatesClient from "./candidates-client";
import type { Master, Profile } from "@/lib/types";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ status?: string; hr_id?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  const [
    { data: profile },
    { data: sites },
    { data: designations },
    { data: sources },
    { data: statuses },
    { data: recruiters },
    { data: interviewers },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("masters").select("*").eq("type", "site").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "designation").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "source").eq("is_active", true).order("sort_order"),
    supabase.from("masters").select("*").eq("type", "status").eq("is_active", true).order("sort_order"),
    supabase.from("profiles").select("id,name,role,email,is_active,department,created_at")
      .in("role", ["recruiter", "hr_manager", "admin"]).order("name"),
    supabase.from("masters").select("*").eq("type", "interviewer").eq("is_active", true).order("sort_order"),
  ]);

  return (
    <CandidatesClient
      profile={profile as Profile}
      sites={(sites ?? []) as Master[]}
      designations={(designations ?? []) as Master[]}
      sources={(sources ?? []) as Master[]}
      statuses={(statuses ?? []) as Master[]}
      recruiters={(recruiters ?? []) as Profile[]}
      interviewers={(interviewers ?? []) as Master[]}
      initialStatus={params.status ?? ""}
      initialHrId={params.hr_id ?? ""}
    />
  );
}
