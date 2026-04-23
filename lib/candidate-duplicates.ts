export type DuplicateCandidate = {
  id: string;
  name: string;
  mobile: string | null;
  current_designation: string | null;
  final_status: string | null;
  hr_name: string | null;
  site_name: string | null;
};

export function normalizeMobile(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export async function findDuplicateCandidatesByMobile(
  supabase: any,
  mobile: string,
  limit = 5,
): Promise<DuplicateCandidate[]> {
  const digits = normalizeMobile(mobile);
  if (digits.length < 7) return [];

  const searchTail = digits.slice(-4);
  const fetchLimit = Math.max(limit * 10, 50);

  const { data, error } = await supabase
    .from("v_pipeline_funnel")
    .select("id, name, mobile, current_designation, final_status, hr_name, site_name")
    .eq("is_deleted", false)
    .ilike("mobile", `%${searchTail}%`)
    .order("sr_no", { ascending: false })
    .limit(fetchLimit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as DuplicateCandidate[])
    .filter((candidate: DuplicateCandidate) => normalizeMobile(candidate.mobile) === digits)
    .slice(0, limit);
}
