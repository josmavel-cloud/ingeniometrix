import type { Metadata } from "next";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import { ResearchFlowDiagram } from "@/components/marketing/research-visuals";
import { resourceArticles } from "@/lib/marketing/resources";

export const metadata: Metadata = {
  title: "Recursos",
  description:
    "Guías prácticas de Ingeniometrix para plan de tesis, investigación académica, trazabilidad y uso responsable de IA.",
  openGraph: {
    title: "Recursos | Ingeniometrix",
    description:
      "Guías para convertir una idea de investigación en una base de plan de tesis clara, revisable y trazable.",
    url: "https://ingeniometrix.com/recursos",
  },
};

export default function ResourcesPage() {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.88)] px-3 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:gap-3 sm:px-5 sm:py-4">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>
          <div className="flex items-center gap-2">
            <Link className="brand-button-secondary hidden px-4 py-2 text-sm font-semibold sm:inline-flex" href="/campana">
              Ver snapshot
            </Link>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/campana">
              Snapshot
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section className="overflow-hidden rounded-[40px] border border-[rgba(52,20,95,0.18)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_40%,#4f297f_100%)] px-6 py-10 text-white shadow-[0_32px_80px_rgba(42,16,77,0.28)] sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/78">
              <span className="inline-flex size-2 rounded-full bg-white" />
              Recursos
            </div>
            <h1 className="mt-8 font-[var(--font-heading)] text-5xl font-semibold leading-tight sm:text-6xl">
              Guías para avanzar hacia tu plan de tesis con más claridad.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/76 sm:text-lg">
              Contenido práctico sobre investigación académica, uso responsable de IA,
              trazabilidad y estructura inicial para un plan revisable.
            </p>
          </div>
        </section>

        <ResearchFlowDiagram />

        <section className="grid gap-4 lg:grid-cols-3">
          {resourceArticles.map((article) => (
            <Link
              className="surface-panel group rounded-[32px] bg-white/90 p-6 transition hover:-translate-y-1"
              href={`/recursos/${article.slug}`}
              key={article.slug}
            >
              <p className="brand-kicker">{article.eyebrow}</p>
              <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold leading-tight text-[var(--color-ink)]">
                {article.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                {article.description}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-[rgba(74,58,97,0.08)] pt-4 text-sm font-semibold text-[var(--color-plum)]">
                <span>{article.readingTime}</span>
                <span className="group-hover:translate-x-1">Leer guía →</span>
              </div>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}
