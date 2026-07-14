import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPublicJobUrl, GOOGLE_JOBS_PLATFORM } from "@/lib/google-jobs";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = await createAdminClient();
  const { data: postings } = await admin
    .from("job_postings")
    .select("job:jobs(id, updated_at, status, is_deleted)")
    .eq("platform", GOOGLE_JOBS_PLATFORM)
    .in("status", ["pending", "posting", "posted"]);

  const jobUrls = (postings ?? [])
    .map((row) => row.job)
    .flat()
    .filter((job) => job && job.status === "open" && !job.is_deleted)
    .map((job) => ({
      url: getPublicJobUrl(job.id),
      lastModified: job.updated_at ? new Date(job.updated_at) : new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

  return [
    {
      url: getPublicJobUrl("").replace(/\/public\/jobs\/$/, ""),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...jobUrls,
  ];
}
