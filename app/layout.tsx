import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PUBLIC_SITE_NAME, PUBLIC_SITE_URL } from "@/lib/public-site";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_URL),
  title: {
    default: `${PUBLIC_SITE_NAME} | Investigación asistida con claridad y trazabilidad`,
    template: `%s | ${PUBLIC_SITE_NAME}`,
  },
  description:
    "Ingeniometrix ayuda a convertir ideas iniciales en bases de investigación más claras, revisables y trazables con apoyo de IA.",
  applicationName: PUBLIC_SITE_NAME,
  authors: [{ name: PUBLIC_SITE_NAME }],
  creator: PUBLIC_SITE_NAME,
  publisher: PUBLIC_SITE_NAME,
  keywords: [
    "investigación asistida",
    "investigación académica",
    "asistente de investigación",
    "tesis",
    "posgrado",
    "IA académica",
    "trazabilidad",
    "OpenAlex",
    "Crossref",
    "plan de tesis",
    "recursos de investigación",
  ],
  openGraph: {
    title: `${PUBLIC_SITE_NAME} | Investigación asistida con claridad y trazabilidad`,
    description:
      "Una experiencia para convertir ideas iniciales en bases de investigación más claras, revisables y trazables.",
    url: PUBLIC_SITE_URL,
    siteName: PUBLIC_SITE_NAME,
    locale: "es",
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
    title: `${PUBLIC_SITE_NAME} | Investigación asistida con claridad y trazabilidad`,
    description:
      "Convierte ideas iniciales en bases de investigación más claras, revisables y trazables con apoyo de IA.",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
