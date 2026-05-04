import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { resolveHtmlLanguage } from "@/lib/language";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  metadataBase: new URL("https://ingeniometrix.com"),
  title: {
    default: "Ingeniometrix | Investigación académica con más claridad",
    template: "%s | Ingeniometrix",
  },
  description:
    "Ingeniometrix ayuda a estructurar, revisar y avanzar procesos de investigación académica con criterio, trazabilidad y apoyo de IA.",
  applicationName: "Ingeniometrix",
  authors: [{ name: "Ingeniometrix" }],
  creator: "Ingeniometrix",
  publisher: "Ingeniometrix",
  keywords: [
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
    title: "Ingeniometrix | Investigación académica con más claridad",
    description:
      "Una experiencia para convertir ideas dispersas en bases de investigación más claras, trazables y listas para seguir avanzando.",
    url: "https://ingeniometrix.com",
    siteName: "Ingeniometrix",
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
    title: "Ingeniometrix | Investigación académica con más claridad",
    description:
      "Estructura, revisa y avanza procesos de investigación con criterio, trazabilidad y apoyo de IA.",
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

export default async function RootLayout({ children }: RootLayoutProps) {
  const currentUser = await getCurrentUser();

  return (
    <html lang={resolveHtmlLanguage({ userLocale: currentUser?.locale })}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
