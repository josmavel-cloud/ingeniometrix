import { SnapshotLanding } from "@/components/marketing/snapshot-landing";
import { getPublicUrl } from "@/lib/public-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "De idea difusa a plan de tesis inicial",
  description:
    "Ordena una idea inicial de investigación con Ingeniometrix: tema refinado, ejes clave, palabras clave, supuestos y ruta inicial hacia el plan de tesis.",
  alternates: {
    canonical: "/campana",
  },
  openGraph: {
    title: "De idea difusa a plan de tesis inicial | Ingeniometrix",
    description:
      "Convierte un tema difuso en una primera base más clara para seguir investigando con criterio y trazabilidad.",
    url: getPublicUrl("/campana"),
    images: [
      {
        url: "/campana/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Chatbox de investigación de Ingeniometrix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "De idea difusa a plan de tesis inicial | Ingeniometrix",
    description:
      "Una primera lectura para ordenar tu tema, ver ejes clave y decidir si avanzas con una base más completa.",
    images: ["/campana/opengraph-image"],
  },
};

export default function CampaignPage() {
  return <SnapshotLanding />;
}
