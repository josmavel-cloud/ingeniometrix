import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/campana", "/recursos"],
      disallow: [
        "/api/",
        "/blueprint-launch/",
        "/lab/",
        "/preview/",
        "/projects/",
        "/workspace/",
      ],
    },
    sitemap: "https://ingeniometrix.com/sitemap.xml",
  };
}
