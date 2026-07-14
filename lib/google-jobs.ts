import type { Job } from "@/lib/types";

export const GOOGLE_JOBS_PLATFORM = "Google Jobs";

export type PublicJob = Job & {
  site?: { name: string | null } | null;
  designation?: { name: string | null } | null;
};

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function getPublicJobUrl(jobId: string) {
  return `${getSiteUrl()}/public/jobs/${jobId}`;
}

export function plainText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlDescription(job: Pick<Job, "description" | "requirements">) {
  const blocks = [
    plainText(job.description),
    plainText(job.requirements),
  ].filter(Boolean);

  const text = blocks.join("\n\nRequirements\n").trim();
  return text
    ? text.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`).join("")
    : "<p>Job details are available from the hiring team.</p>";
}

export function employmentType(value: string | null | undefined) {
  const text = (value ?? "").toLowerCase();
  if (text.includes("part")) return "PART_TIME";
  if (text.includes("contract")) return "CONTRACTOR";
  if (text.includes("intern")) return "INTERN";
  if (text.includes("temporary")) return "TEMPORARY";
  return "FULL_TIME";
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function dateOnly(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

export function validThrough(job: Pick<Job, "opened_at" | "closed_at" | "target_doj">) {
  if (job.closed_at) return new Date(job.closed_at).toISOString();
  if (job.target_doj) return new Date(`${job.target_doj}T23:59:59.000Z`).toISOString();
  const opened = new Date(`${dateOnly(job.opened_at)}T00:00:00.000Z`);
  return addDays(opened, 90).toISOString();
}

export function buildJobPostingJsonLd(job: PublicJob, applyUrl?: string | null) {
  const city = job.site?.name || job.site_name || "Ahmedabad";
  const salary = buildSalary(job);

  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: htmlDescription(job),
    datePosted: dateOnly(job.opened_at ?? job.created_at),
    validThrough: validThrough(job),
    employmentType: employmentType(job.job_type),
    directApply: false,
    hiringOrganization: {
      "@type": "Organization",
      name: job.client_name || "Hire Rabbits",
      sameAs: getSiteUrl(),
      logo: `${getSiteUrl()}/hirerabbits-logo.svg`,
    },
    ...(applyUrl ? { url: applyUrl } : {}),
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressRegion: city,
        addressCountry: "IN",
      },
    },
    ...(salary ? { baseSalary: salary } : {}),
  };
}

function buildSalary(job: Pick<Job, "min_salary" | "max_salary">) {
  if (job.min_salary == null && job.max_salary == null) return null;
  return {
    "@type": "MonetaryAmount",
    currency: "INR",
    value: {
      "@type": "QuantitativeValue",
      ...(job.min_salary != null ? { minValue: Number(job.min_salary) } : {}),
      ...(job.max_salary != null ? { maxValue: Number(job.max_salary) } : {}),
      unitText: "MONTH",
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
