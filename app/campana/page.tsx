import type { Metadata } from "next";

import { SnapshotLanding } from "@/components/marketing/snapshot-landing";
import { getCampaignCopy } from "@/lib/marketing/portal-copy";
import { getPublicUrl } from "@/lib/public-site";
import { getRequestLanguage } from "@/server/i18n/request-language";

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  const copy = getCampaignCopy(language).metadata;

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: "/campana",
    },
    openGraph: {
      title: copy.ogTitle,
      description: copy.ogDescription,
      url: getPublicUrl("/campana"),
      images: [
        {
          url: "/campana/opengraph-image",
          width: 1200,
          height: 630,
          alt: copy.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.ogTitle,
      description: copy.twitterDescription,
      images: ["/campana/opengraph-image"],
    },
  };
}

export default function CampaignPage() {
  return <SnapshotLanding />;
}
