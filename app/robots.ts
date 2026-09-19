import type { MetadataRoute } from "next";

import { getPublicUrl } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/recursos", "/recursos/"],
      disallow: [
        "/api/",
        "/blueprint-launch/",
        "/campana",
        "/lab/",
        "/preview/",
        "/projects/",
        "/reviews/",
        "/workspace/",
      ],
    },
    sitemap: getPublicUrl("/sitemap.xml"),
  };
}
