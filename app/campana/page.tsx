import { SnapshotLanding } from "@/components/marketing/snapshot-landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Snapshot de investigación",
  description:
    "Valida una idea inicial de investigación con un snapshot claro: tema refinado, ejes clave y una base visual para decidir el siguiente paso.",
  openGraph: {
    title: "Snapshot de investigación | Ingeniometrix",
    description:
      "Convierte un tema difuso en una primera base más clara para seguir investigando con mejor criterio.",
    url: "https://ingeniometrix.com/campana",
    images: [
      {
        url: "/campana/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Snapshot de investigación de Ingeniometrix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapshot de investigación | Ingeniometrix",
    description:
      "Una muestra inicial para ordenar tu tema, ver ejes clave y decidir si avanzas al plan completo.",
    images: ["/campana/opengraph-image"],
  },
};

export default function CampaignPage() {
  return <SnapshotLanding />;
}
