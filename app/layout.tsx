import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPortalHomeCopy } from "@/lib/marketing/portal-copy";
import { PUBLIC_SITE_NAME, PUBLIC_SITE_URL } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getPortalHomeCopy("es").metadata;

  return {
    metadataBase: new URL(PUBLIC_SITE_URL),
    title: {
      default: copy.title,
      template: `%s | ${PUBLIC_SITE_NAME}`,
    },
    description: copy.description,
    applicationName: PUBLIC_SITE_NAME,
    authors: [{ name: PUBLIC_SITE_NAME }],
    creator: PUBLIC_SITE_NAME,
    publisher: PUBLIC_SITE_NAME,
    keywords: copy.keywords,
    openGraph: {
      title: copy.title,
      description: copy.ogDescription,
      url: PUBLIC_SITE_URL,
      siteName: PUBLIC_SITE_NAME,
      locale: "es_PE",
      type: "website",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Ingeniometrix",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.twitterDescription,
      images: ["/opengraph-image"],
    },
    icons: {
      icon: "/icon.png",
      apple: "/apple-icon.png",
    },
  };
}

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
