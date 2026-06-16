import type { MetadataRoute } from "next";

import { resourceArticles } from "@/lib/marketing/resources";
import { getPublicUrl } from "@/lib/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getPublicUrl(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getPublicUrl("/campana"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: getPublicUrl("/recursos"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...resourceArticles.map((article) => ({
      url: getPublicUrl(`/recursos/${article.slug}`),
      lastModified: new Date(article.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
