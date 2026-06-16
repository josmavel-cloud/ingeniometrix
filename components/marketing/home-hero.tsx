import Image from "next/image";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import {
  EvidenceTraceMap,
  ResearchFlowDiagram,
  SnapshotPoster,
  ThesisPlanMockup,
} from "@/components/marketing/research-visuals";
import { getRequestLanguage } from "@/server/i18n/request-language";

import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  CircleFadingPlus,
  ClipboardCheck,
  FileText,
  Globe2,
  Mail,
  Route,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

const heroSignals = [
  "Claridad para empezar",
  "Fuentes recuperables",
  "Ruta revisable",
];

const productCards = [
  {
    title: "IngenioIA",
    status: "Disponible",
    description:
      "Asistente de investigación para ordenar ideas, delimitar temas y preparar una primera base hacia el plan de tesis.",
    iconSrc: "/marketing/icon-ingenioia.svg",
  },
  {
    title: "Ingenio Mentor",
    status: "Próximamente",
    description:
      "Capa de acompañamiento para feedback, seguimiento y conversaciones de revisión con más continuidad.",
    iconSrc: "/marketing/icon-mentor.svg",
  },
  {
    title: "Ingenio Lab",
    status: "Próximamente",
    description:
      "Espacio para explorar nuevas rutas, comparar enfoques y trabajar con evidencia de forma iterativa.",
    iconSrc: "/marketing/icon-lab.svg",
  },
  {
    title: "Ingenio Studio",
    status: "Próximamente",
    description:
      "Experiencia para equipos que necesitan procesos de investigación más ordenados, visibles y repetibles.",
    iconSrc: "/marketing/icon-studio.svg",
  },
];

const workflowSteps = [
  {
    title: "Comparte una idea",
    description:
      "Empieza con el tema como lo tienes hoy, incluso si está incompleto o todavía no tiene un título claro.",
    icon: FileText,
  },
  {
    title: "Ordena el enfoque",
    description:
      "IngenioIA identifica ejes, palabras clave, supuestos y decisiones pendientes para reducir ambigüedad.",
    icon: Sparkles,
  },
  {
    title: "Revisa con criterio",
    description:
      "La salida está pensada para discusión humana: asesoría, revisión académica o validación profesional.",
    icon: ClipboardCheck,
  },
  {
    title: "Avanza con una ruta",
    description:
      "El resultado sirve como base para continuar hacia una estructura más completa y trazable.",
    icon: Route,
  },
];

const audienceCards = [
  {
    title: "Estudiantes de posgrado",
    description:
      "Para quienes necesitan convertir un tema amplio en una base clara para avanzar hacia el plan de tesis.",
    iconSrc: "/marketing/icons/thesis-plan.svg",
  },
  {
    title: "Investigadores",
    description:
      "Para ordenar líneas de trabajo, detectar vacíos iniciales y preparar rutas de revisión más consistentes.",
    iconSrc: "/marketing/icons/source-library.svg",
  },
  {
    title: "Asesores y revisores",
    description:
      "Para revisar coherencia entre tema, problema, objetivos, evidencia y decisiones metodológicas.",
    iconSrc: "/marketing/icons/method-compass.svg",
  },
  {
    title: "Equipos académicos",
    description:
      "Para trabajar con procesos más visibles, salidas comparables y criterios compartidos de revisión.",
    iconSrc: "/marketing/icons/export-package.svg",
  },
];

const providerLogos = [
  {
    name: "OpenAI",
    description: "Asistencia para estructurar, sintetizar y explicar ideas complejas.",
    logoSrc: "/providers/openai.png",
    logoClassName: "w-9 rounded-[10px]",
  },
  {
    name: "Claude",
    description: "Apoyo conversacional para análisis guiado y revisión de enfoque.",
    logoSrc: "/providers/claude.png",
    logoClassName: "w-8 rounded-[10px]",
  },
  {
    name: "OpenAlex",
    description: "Descubrimiento bibliográfico abierto y contexto académico recuperable.",
    logoSrc: "/providers/openalex.png",
    logoClassName: "w-8 rounded-[10px]",
  },
  {
    name: "Crossref",
    description: "Metadatos DOI para fortalecer trazabilidad y verificación.",
    logoSrc: "/providers/crossref.svg",
    logoClassName: "w-28",
    hideName: true,
  },
  {
    name: "Exportaciones",
    description: "Salidas preparadas para documentos, gestores bibliográficos y bitácoras.",
    logoSrc: "/marketing/icon-engine-export.svg",
    logoClassName: "w-7",
  },
];

const responsibleItems = [
  "No es un generador automático de tesis.",
  "No promete aprobación ni resultados académicos.",
  "No inventa citas, datos ni resultados.",
  "La información faltante se declara como supuesto o pendiente.",
  "Cada salida debe pasar por revisión humana.",
];

const resourceCards = [
  {
    title: "Cómo convertir una idea en plan de tesis",
    href: "/recursos/como-convertir-idea-en-plan-de-tesis",
    description:
      "Una guía para pasar de una intuición amplia a una estructura inicial más defendible.",
  },
  {
    title: "Qué debe tener un plan de tesis",
    href: "/recursos/que-debe-tener-un-plan-de-tesis",
    description:
      "Elementos clave para revisar coherencia entre problema, objetivos, método y evidencia.",
  },
  {
    title: "IA en investigación sin perder criterio",
    href: "/recursos/ia-en-investigacion-sin-perder-criterio",
    description:
      "Cómo usar asistencia de IA sin abandonar trazabilidad, revisión y responsabilidad académica.",
  },
];

const partnerLogos = [
  {
    name: "Simetrika",
    src: "/partners/simetrika-lockup.webp",
    width: 760,
    height: 243,
  },
  {
    name: "VivaCore",
    src: "/partners/vivacore-lockup.webp",
    width: 680,
    height: 414,
  },
];

const contactCards = [
  {
    label: "Correo",
    title: "hola@simetrika.pe",
    description: "Contacto para acceso, consultas y conversaciones iniciales.",
    iconSrc: "/marketing/icon-contact-mail.svg",
  },
  {
    label: "Dominio",
    title: "ingeniometrix.com",
    description: "Punto de entrada público para Ingeniometrix e IngenioIA.",
    iconSrc: "/marketing/icon-contact-domain.svg",
  },
];

const faqItems = [
  {
    question: "¿Ingeniometrix hace mi tesis?",
    answer:
      "No. Ingeniometrix ayuda a estructurar el punto de partida y preparar una base revisable. No reemplaza el trabajo académico ni la revisión humana.",
  },
  {
    question: "¿Sirve solo para tesis?",
    answer:
      "No. La primera experiencia está enfocada en plan de tesis, pero la lógica de claridad, trazabilidad y revisión aplica a otros procesos de investigación.",
  },
  {
    question: "¿Qué hace IngenioIA?",
    answer:
      "Ordena una idea inicial, identifica ejes, palabras clave, supuestos y una ruta inicial para seguir investigando con mayor claridad.",
  },
  {
    question: "¿Qué pasa con las fuentes?",
    answer:
      "La experiencia prioriza fuentes recuperables y metadatos verificables. Si algo no está disponible, debe quedar indicado como pendiente.",
  },
];

const socialItems = [
  { icon: UsersRound, label: "LinkedIn" },
  { icon: AtSign, label: "Instagram" },
  { icon: Globe2, label: "Facebook" },
];

export async function HomeHero() {
  const language = await getRequestLanguage();

  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[28px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.9)] px-3 py-3 shadow-[0_18px_45px_rgba(23,19,31,0.07)] backdrop-blur sm:gap-3 sm:px-5">
          <a className="min-w-0 flex-1" href="#top">
            <BrandBadge compact context="company" />
          </a>

          <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-muted)] lg:flex">
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#producto">
              Producto
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#trazabilidad">
              Trazabilidad
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#recursos">
              Recursos
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#contacto">
              Contacto
            </a>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <LanguageToggle initialLanguage={language} />
            <span className="hidden sm:inline-flex">
              <Link className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="/workspace">
                Iniciar sesion
              </Link>
            </span>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/workspace">
              Ir al workspace
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section
          className="rounded-[40px] border border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.72)] px-5 py-8 shadow-[0_24px_70px_rgba(23,19,31,0.08)] backdrop-blur sm:px-8 lg:px-10 lg:py-10"
          id="top"
        >
          <div className="grid gap-9 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <div className="brand-pill">Ingeniometrix</div>
              <h1 className="mt-7 max-w-3xl text-balance font-[var(--font-heading)] text-[2.8rem] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--color-ink)] sm:text-6xl">
                Investigación asistida para avanzar con claridad, criterio y trazabilidad.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
                Ingeniometrix ayuda a convertir una idea inicial en una base
                revisable para plan de tesis: tema refinado, ejes clave, supuestos
                y una ruta inicial para seguir investigando.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(52,20,95,0.18)]"
                  href="/workspace"
                >
                  Iniciar sesion
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-[rgba(74,58,97,0.12)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
                  href="#producto"
                >
                  Ver producto
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroSignals.map((item) => (
                  <div className="rounded-2xl border border-[rgba(74,58,97,0.08)] bg-white/78 px-4 py-3" key={item}>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 text-[var(--color-mint-strong)]" />
                      <span className="text-sm font-semibold text-[var(--color-ink)]">{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="relative min-h-[300px] overflow-hidden rounded-[34px] border border-[rgba(74,58,97,0.12)] bg-[var(--color-plum)] shadow-[0_24px_70px_rgba(23,19,31,0.1)] sm:min-h-[380px]">
                <Image
                  alt="Biblioteca académica asistida por inteligencia artificial"
                  className="object-cover object-center"
                  fill
                  priority
                  sizes="(min-width: 1024px) 38rem, 100vw"
                  src="/marketing/hero-premium-ai-library-v3.png"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,12,42,0.84)_0%,rgba(23,12,42,0.42)_52%,rgba(23,12,42,0.08)_100%)]" />
                <div className="absolute inset-x-5 bottom-5 rounded-[24px] border border-white/12 bg-white/12 p-5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur-md">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/62">
                    De idea a base revisable
                  </p>
                  <h2 className="mt-2 max-w-lg font-[var(--font-heading)] text-3xl font-semibold leading-tight">
                    Una ruta inicial para investigar sin perder trazabilidad.
                  </h2>
                </div>
              </div>
              <ThesisPlanMockup size="compact" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4" id="producto">
          {productCards.map((item) => (
            <article
              className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-6 shadow-[0_16px_38px_rgba(23,19,31,0.05)]"
              key={item.title}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-[#f5f1fb]">
                  <Image
                    alt={item.title}
                    className="h-auto w-10"
                    height={128}
                    src={item.iconSrc}
                    width={128}
                  />
                </div>
                <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                  {item.status}
                </span>
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <p className="brand-kicker">IngenioIA</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Del tema difuso a una primera base de plan de tesis.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              La experiencia principal está diseñada para ordenar el inicio del
              trabajo: no promete resolver la tesis, sino aclarar el punto de
              partida y hacerlo más fácil de revisar.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-6 py-3 text-sm font-semibold text-white"
                href="/workspace"
              >
                Ir al workspace
                <ArrowRight className="ml-2 size-4" />
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-[rgba(74,58,97,0.12)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
                href="/recursos"
              >
                Leer recursos
              </Link>
            </div>
          </article>

          <SnapshotPoster />
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Cómo funciona</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Una experiencia corta para avanzar con más control.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              El objetivo es reducir ambigüedad al inicio, no reemplazar la
              revisión humana ni automatizar el trabajo académico.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-4">
            {workflowSteps.map((step, index) => {
              const StepIcon = step.icon;

              return (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                  key={step.title}
                >
                  <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[#f5f1fb] text-[var(--color-plum)]">
                    <StepIcon className="size-5" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
                    Paso {index + 1}
                  </p>
                  <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {step.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <ResearchFlowDiagram />

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start" id="trazabilidad">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <p className="brand-kicker">Trazabilidad</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              IA para ordenar. Fuentes para sostener. Criterio para decidir.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Ingeniometrix separa asistencia, evidencia y decisiones humanas
              para mantener una experiencia más clara, verificable y revisable.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {providerLogos.map((item) => (
                <article
                  className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white p-4"
                  key={item.name}
                >
                  <div className="flex items-center gap-3">
                    <Image
                      alt={item.name}
                      className={`h-auto ${item.logoClassName}`}
                      height={128}
                      src={item.logoSrc}
                      width={128}
                    />
                    {"hideName" in item && item.hideName ? null : (
                      <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                        {item.name}
                      </h3>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </article>

          <EvidenceTraceMap />
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <p className="brand-kicker">Para quién es</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Una base común para personas que investigan de formas distintas.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              El valor principal es ordenar el inicio: aclarar tema, evidencia,
              supuestos y ruta antes de invertir más tiempo.
            </p>
          </article>

          <div className="grid gap-4 sm:grid-cols-2">
            {audienceCards.map((item) => (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-6 shadow-[0_14px_34px_rgba(23,19,31,0.04)]"
                key={item.title}
              >
                <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#f5f1fb]">
                  <Image
                    alt={item.title}
                    className="h-auto w-10"
                    height={96}
                    src={item.iconSrc}
                    width={96}
                  />
                </div>
                <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#f5f1fb]">
              <ShieldCheck className="size-5 text-[var(--color-plum)]" />
            </div>
            <p className="mt-5 brand-kicker">Uso responsable</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Diseñado para apoyar la investigación, no para reemplazarla.
            </h2>
            <div className="mt-6 space-y-3">
              {responsibleItems.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[34px] border border-[rgba(52,20,95,0.14)] bg-[var(--color-plum)] p-6 text-white shadow-[0_24px_60px_rgba(52,20,95,0.22)] sm:p-7">
            <Sparkles className="size-6 text-white" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
              Promesa
            </p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold">
              Menos fricción al inicio. Más claridad para decidir.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/74">
              Ingeniometrix se enfoca en el primer bloqueo: saber si el tema
              empieza a tener forma, dirección y una ruta razonable hacia el
              requisito académico del plan de tesis.
            </p>
          </article>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8" id="recursos">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Recursos</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Guías breves para investigar con mejor criterio.
              </h2>
            </div>
            <Link
              className="inline-flex items-center justify-center rounded-full border border-[rgba(74,58,97,0.12)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
              href="/recursos"
            >
              Ver recursos
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {resourceCards.map((item) => (
              <Link
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[rgba(52,20,95,0.22)]"
                href={item.href}
                key={item.href}
              >
                <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8" id="partners">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Aliados</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Respaldo para construir una experiencia seria y sostenible.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Simetrika y VivaCore acompañan el desarrollo del ecosistema Ingeniometrix.
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {partnerLogos.map((partner) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                key={partner.name}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.68)]">
                  Aliado
                </p>
                <div className="mt-5 flex min-h-28 items-center justify-center rounded-[22px] border border-[rgba(74,58,97,0.06)] bg-[#fbf9fd] p-5">
                  <Image
                    alt={partner.name}
                    className="h-auto max-h-20 w-auto max-w-full object-contain"
                    height={partner.height}
                    src={partner.src}
                    width={partner.width}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8" id="faq">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Preguntas frecuentes</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Lo esencial para entender Ingeniometrix.
              </h2>
            </div>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {faqItems.map((item) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
                key={item.question}
              >
                <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {item.question}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-[36px] border border-[rgba(52,20,95,0.16)] bg-[var(--color-plum)] px-6 py-7 text-white shadow-[0_24px_60px_rgba(52,20,95,0.22)] sm:px-8"
          id="contacto"
        >
          <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <Mail className="size-6 text-white" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Contacto
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold sm:text-4xl">
                Hablemos sobre el siguiente paso con Ingeniometrix.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-base">
                Escríbenos para solicitar acceso, resolver dudas o explorar una
                conversación inicial sobre IngenioIA.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  href="/workspace"
                >
                  Iniciar sesion
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="mailto:hola@simetrika.pe"
                >
                  Escribir por correo
                </a>
              </div>
            </div>

            <article className="rounded-[28px] border border-white/12 bg-white/10 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {contactCards.map((card) => (
                  <div className="rounded-[22px] border border-white/10 bg-white/8 p-5" key={card.title}>
                    <div className="inline-flex size-11 items-center justify-center rounded-full bg-white/10">
                      <Image
                        alt={card.label}
                        className="h-auto w-7"
                        height={128}
                        src={card.iconSrc}
                        width={128}
                      />
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                      {card.label}
                    </p>
                    <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold">
                      {card.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-white/72">
                      {card.description}
                    </p>
                  </div>
                ))}
              </div>

              <form
                action="mailto:hola@simetrika.pe?subject=Alta%20newsletter%20Ingeniometrix"
                className="mt-5 rounded-[22px] border border-white/10 bg-white/8 p-5"
                encType="text/plain"
                method="post"
              >
                <div className="flex items-start gap-3">
                  <div className="inline-flex size-11 items-center justify-center rounded-full bg-white/10">
                    <CircleFadingPlus className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                      Newsletter
                    </p>
                    <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold">
                      Recibe novedades del producto
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    className="brand-input min-w-0 flex-1 bg-white/96"
                    name="newsletter_email"
                    placeholder="Tu correo"
                    type="email"
                  />
                  <button className="brand-button-primary px-5 py-3 text-sm font-semibold" type="submit">
                    Agregar
                  </button>
                </div>
              </form>

              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/8 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                  Redes
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {socialItems.map((item) => (
                    <span
                      className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold text-white/88"
                      key={item.label}
                    >
                      <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/12 text-white">
                        <item.icon className="size-4" />
                      </span>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        <footer className="rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-white/78 px-6 py-7 shadow-[0_14px_40px_rgba(23,19,31,0.05)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Ingeniometrix
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                Investigación asistida para empezar con más claridad, criterio y trazabilidad.
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[rgba(100,94,115,0.72)]">
                © 2026 Ingeniometrix. Todos los derechos reservados.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="brand-pill">ingeniometrix.com</span>
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/workspace">
                Workspace
              </Link>
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/recursos">
                Recursos
              </Link>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#contacto">
                Contacto
              </a>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#partners">
                Aliados
              </a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
