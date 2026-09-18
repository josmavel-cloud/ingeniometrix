import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileText,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";

import { BrandBadge } from "@/components/brand/brand-badge";
import { ThesisPlanMockup } from "@/components/marketing/research-visuals";

const steps = [
  {
    number: "01",
    title: "Define tu investigacion",
    description:
      "Parte de tu idea y aclara el problema, la poblacion y el contexto que necesitas estudiar.",
  },
  {
    number: "02",
    title: "Contrastala con evidencia real",
    description:
      "Busca y selecciona referencias recuperables desde OpenAlex y Crossref.",
  },
  {
    number: "03",
    title: "Obten un plan estructurado",
    description:
      "Revisa objetivos, preguntas, metodo y aspectos pendientes antes de descargar.",
  },
];

const differentiators = [
  "Referencias reales y recuperables, no citas inventadas.",
  "Trazabilidad entre la evidencia seleccionada y el plan.",
  "Supuestos y aspectos pendientes visibles para revision.",
  "Control humano en cada decision academica importante.",
];

const deliverables = [
  {
    icon: FileText,
    title: "Plan de tesis",
    description: "Una base estructurada y editable para revision academica.",
  },
  {
    icon: BookOpenCheck,
    title: "Referencias utilizadas",
    description: "Las fuentes seleccionadas y vinculadas al resultado.",
  },
  {
    icon: ShieldCheck,
    title: "Registro de evidencia",
    description: "Decisiones, fuentes y supuestos con trazabilidad.",
  },
  {
    icon: Download,
    title: "DOCX descargable",
    description: "Un documento listo para continuar trabajando con tu asesor.",
  },
];

export function HomeHero() {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.9)] px-3 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:px-5 sm:py-4">
          <a className="min-w-0 flex-1" href="#inicio">
            <BrandBadge compact context="company" />
          </a>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-muted)] lg:flex">
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#como-funciona">
              Como funciona
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#diferencia">
              Trazabilidad
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#recibes">
              Que recibes
            </a>
          </nav>
          <Link className="brand-button-primary px-4 py-2 text-sm font-semibold" href="/workspace">
            Entrar
          </Link>
        </div>
      </header>

      <div className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section
          className="overflow-hidden rounded-[40px] border border-[rgba(52,20,95,0.18)] bg-[linear-gradient(155deg,#170c2a_0%,#34145f_55%,#6d3a91_100%)] px-6 py-10 text-white shadow-[0_32px_80px_rgba(42,16,77,0.28)] sm:px-8 lg:px-10 lg:py-14"
          id="inicio"
        >
          <div className="grid gap-9 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/78">
                <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
                Para estudiantes e investigadores de posgrado
              </div>
              <h1 className="mt-7 font-[var(--font-heading)] text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Convierte tu idea en un plan de tesis sustentado en evidencia real.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/76 sm:text-lg">
                Ingeniometrix te guia para definir la investigacion, contrastarla con
                fuentes cientificas y preparar una estructura defendible para revision.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)]" href="/workspace">
                  Empezar con mi idea
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3 text-sm font-semibold text-white" href="#como-funciona">
                  Ver como funciona
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-2 text-xs font-semibold text-white/72">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2">Evidencia recuperable</span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2">Revision humana</span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2">DOCX editable</span>
              </div>
            </div>
            <ThesisPlanMockup />
          </div>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-8 sm:px-8 lg:px-10" id="como-funciona">
          <div className="max-w-3xl">
            <p className="brand-kicker">Como funciona</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Un recorrido claro, de la idea al documento.
            </h2>
          </div>
          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {steps.map((step) => (
              <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-6" key={step.number}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-plum)]">Paso {step.number}</p>
                <h3 className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]" id="diferencia">
          <article className="brand-card-primary rounded-[34px] p-6 sm:p-8">
            <SearchCheck className="size-7 text-white" />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Por que es diferente</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
              Evidencia para sostener. Criterio para decidir.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/76">
              OpenAlex y Crossref permiten recuperar fuentes verificables. Ingeniometrix
              organiza esa evidencia sin sustituir tu criterio ni el de tu asesor.
            </p>
          </article>
          <div className="surface-panel grid gap-3 rounded-[34px] p-5 sm:grid-cols-2 sm:p-7">
            {differentiators.map((item) => (
              <div className="flex items-start gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/80 p-4" key={item}>
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-mint-strong)]" />
                <p className="text-sm leading-6 text-[var(--color-ink)]">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-8 sm:px-8 lg:px-10" id="recibes">
          <div className="max-w-3xl">
            <p className="brand-kicker">Que recibes</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Una base util para revisar, defender y continuar.
            </h2>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {deliverables.map(({ icon: Icon, title, description }) => (
              <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/84 p-5" key={title}>
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[rgba(52,20,95,0.08)]">
                  <Icon className="size-5 text-[var(--color-plum)]" />
                </span>
                <h3 className="mt-4 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{description}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm text-[var(--color-muted)]">
            Tambien puedes descargar BibTeX y RIS para continuar en tu gestor bibliografico.
          </p>
        </section>

        <section className="overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#fff0e7,#f1e7ff_52%,#e4f6f1)] px-6 py-9 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="brand-kicker">Tu siguiente paso</p>
              <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
                Empieza con la idea que tienes hoy.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                No necesitas llegar con el tema resuelto. El recorrido te ayuda a definirlo y contrastarlo.
              </p>
            </div>
            <Link className="brand-button-primary shrink-0 px-6 py-3 text-sm font-semibold" href="/workspace">
              Entrar a Ingeniometrix
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col gap-4 rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/78 px-5 py-5 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>(c) 2026 Ingeniometrix. Investigacion asistida con trazabilidad.</p>
          <div className="flex flex-wrap gap-2">
            <Link className="brand-pill" href="/recursos">Recursos</Link>
            <a className="brand-pill" href="mailto:hola@simetrika.pe">Contacto</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
