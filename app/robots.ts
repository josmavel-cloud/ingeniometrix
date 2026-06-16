import type { MetadataRoute } from "next";

import { getPublicUrl } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/campana", "/recursos", "/recursos/"],
      disallow: [
        "/api/",
        "/blueprint-launch/",
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
