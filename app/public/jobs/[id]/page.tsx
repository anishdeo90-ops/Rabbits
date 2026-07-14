import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Building2, CalendarDays, MapPin } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildJobPostingJsonLd,
  dateOnly,
  getPublicJobUrl,
  htmlDescription,
  plainText,
  type PublicJob,
} from "@/lib/google-jobs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };
type LinkedApplicationForm = { id: string; name: string };

async function getPublicJob(id: string) {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .select(`
      *,
      site:masters!jobs_site_id_fkey(name),
      designation:masters!jobs_designation_id_fkey(name)
    `)
    .eq("id", id)
    .eq("status", "open")
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) throw error;
  return data as PublicJob | null;
}

async function getLinkedApplicationForm(jobId: string): Promise<LinkedApplicationForm | null> {
  const admin = await createAdminClient();

  const { data: links, error: linksError } = await admin
    .from("form_job_links")
    .select("form_id")
    .eq("job_id", jobId)
    .limit(5);

  if (linksError) throw linksError;

  const formIds = (links ?? []).map((row) => row.form_id).filter(Boolean);
  if (formIds.length === 0) return null;

  const { data: forms, error: formsError } = await admin
    .from("forms")
    .select("id,name,is_active")
    .in("id", formIds)
    .eq("is_active", true)
    .limit(1);

  if (formsError) throw formsError;

  const active = forms?.[0];
  return active ? { id: active.id, name: active.name } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const job = await getPublicJob(id);
  if (!job) return {};

  const title = `${job.title} | Hire Rabbits`;
  const description = plainText(job.description).slice(0, 155) || "Open role managed by Hire Rabbits.";
  const url = getPublicJobUrl(job.id);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
  };
}

export default async function PublicJobPage({ params }: PageProps) {
  const { id } = await params;
  const job = await getPublicJob(id);
  if (!job) notFound();

  const form = await getLinkedApplicationForm(job.id);
  const applyUrl = form ? `/f/${form.id}?j=${job.id}` : null;
  const absoluteApplyUrl = applyUrl ? `${getPublicJobUrl(job.id).replace(`/public/jobs/${job.id}`, "")}${applyUrl}` : null;
  const jsonLd = buildJobPostingJsonLd(job, absoluteApplyUrl);
  const descriptionHtml = htmlDescription(job);
  const siteName = job.site?.name || job.site_name || "India";
  const designationName = job.designation?.name || job.designation_name;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Hire Rabbits Job Opening
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight text-gray-950 sm:text-4xl">
            {job.title}
          </h1>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-600">
            {designationName && <Badge icon={<Briefcase className="h-4 w-4" />} label={designationName} />}
            <Badge icon={<MapPin className="h-4 w-4" />} label={siteName} />
            <Badge icon={<Building2 className="h-4 w-4" />} label={job.client_name || "Hire Rabbits"} />
            <Badge icon={<CalendarDays className="h-4 w-4" />} label={`Posted ${dateOnly(job.opened_at ?? job.created_at)}`} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-5 py-8 md:grid-cols-[1fr_260px]">
        <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Job Details</h2>
          <div
            className="prose prose-sm mt-4 max-w-none prose-p:text-gray-700 prose-p:leading-6"
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        </article>

        <aside className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-950">Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Location" value={siteName} />
              <SummaryRow label="Employment" value={job.job_type === "client" ? "Full time" : "Full time"} />
              <SummaryRow label="Openings" value={String(job.headcount ?? 1)} />
              {salaryLabel(job) && <SummaryRow label="Salary" value={salaryLabel(job)} />}
            </dl>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-950">Apply</h2>
            {form && applyUrl ? (
              <>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Submit your details through the application form.
                </p>
                <Link
                  href={applyUrl}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Apply Now
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Application form is not linked yet.
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500"
                >
                  Apply Now
                </button>
              </>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
      {icon}
      {label}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function salaryLabel(job: Pick<PublicJob, "min_salary" | "max_salary">) {
  const formatter = new Intl.NumberFormat("en-IN");
  if (job.min_salary != null && job.max_salary != null) {
    return `Rs ${formatter.format(Number(job.min_salary))}-${formatter.format(Number(job.max_salary))} / month`;
  }
  if (job.min_salary != null) return `From Rs ${formatter.format(Number(job.min_salary))} / month`;
  if (job.max_salary != null) return `Up to Rs ${formatter.format(Number(job.max_salary))} / month`;
  return null;
}
