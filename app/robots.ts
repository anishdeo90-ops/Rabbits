import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/google-jobs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/public/jobs/"],
      disallow: ["/api/", "/login", "/settings", "/dashboard", "/candidates", "/jobs", "/users"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
