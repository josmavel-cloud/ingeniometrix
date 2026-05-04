import Image from "next/image";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import {
  ResearchFlowDiagram,
  SnapshotPoster,
  ThesisPlanMockup,
} from "@/components/marketing/research-visuals";

import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const heroSignals = [
  "Tema refinado",
  "Ejes clave",
  "Ruta inicial",
];

const painSignals = [
  {
    title: "El tema existe, pero todavía no aterriza",
    description:
      "Ingeniometrix ayuda a transformar una idea amplia en un punto de partida más claro.",
    iconSrc: "/marketing/icons/ai-lens.svg",
  },
  {
    title: "Hay fuentes, pero falta dirección",
    description:
      "El snapshot ordena señales iniciales para evitar búsquedas dispersas y decisiones improvisadas.",
    iconSrc: "/marketing/icons/source-library.svg",
  },
  {
    title: "La asesoría funciona mejor con estructura",
    description:
      "Llegar con una base visible facilita conversaciones más concretas y revisiones más útiles.",
    iconSrc: "/marketing/icons/method-compass.svg",
  },
];

const providerLogos = [
  {
    name: "OpenAI",
    src: "/providers/openai.png",
    className: "w-9 rounded-[10px]",
    description: "Asistencia para estructurar, sintetizar y explicar con mejor contexto.",
  },
  {
    name: "Claude",
    src: "/providers/claude.png",
    className: "w-8 rounded-[10px]",
    description: "Apoyo conversacional para análisis guiado e instrucciones extensas.",
  },
  {
    name: "OpenAlex",
    src: "/providers/openalex.png",
    className: "w-8 rounded-[10px]",
    description: "Descubrimiento bibliográfico abierto y contexto académico inicial.",
  },
  {
    name: "CrossRef",
    src: "/providers/crossref.svg",
    className: "w-8",
    description: "Metadatos DOI para fortalecer trazabilidad y verificación.",
  },
];

const visibleItems = [
  "Tema refinado y mejor delimitado",
  "Síntesis breve del enfoque",
  "Ejes clave para orientar la investigación",
  "Palabras clave para seguir explorando",
  "Poster visual para entender el tema de un vistazo",
];

const lockedItems = [
  "Objetivo general sugerido",
  "Preguntas de investigación iniciales",
  "Ruta metodológica orientativa",
  "Estructura recomendada del plan",
  "Siguientes pasos para continuar",
];

const steps = [
  {
    title: "Comparte tu punto de partida",
    description:
      "Escribe tu tema como lo tienes hoy, incluso si todavía está desordenado.",
  },
  {
    title: "Recibe una primera lectura",
    description:
      "Preparamos una muestra con foco, ejes clave y una forma visual de leer el problema.",
  },
  {
    title: "Decide si avanzas",
    description:
      "Si la muestra te ayuda, puedes continuar hacia una base inicial más completa.",
  },
];

const trustItems = [
  "No se presenta como generador automático de tesis.",
  "No promete resultados académicos sin revisión humana.",
  "Prioriza claridad, trazabilidad y criterio antes que volumen.",
  "La información faltante debe reconocerse como supuesto o pendiente.",
];

const faqItems = [
  {
    question: "¿El snapshot reemplaza una asesoría?",
    answer:
      "No. Está diseñado para darte un punto de partida más claro antes de seguir con revisión humana o trabajo más profundo.",
  },
  {
    question: "¿Sirve solo para tesis?",
    answer:
      "No. Puede usarse como entrada para tesis, trabajos de investigación, artículos y otros procesos académicos o aplicados.",
  },
  {
    question: "¿Qué recibo primero?",
    answer:
      "Una muestra breve con tema refinado, síntesis, ejes clave, palabras clave y una visualización inicial del enfoque.",
  },
  {
    question: "¿Qué pasa después?",
    answer:
      "Si la muestra te resulta útil, el siguiente paso es desbloquear una base inicial más completa para continuar.",
  },
];

const intakeFields = [
  {
    label: "Correo",
    name: "correo",
    placeholder: "tu.correo@email.com",
    type: "email",
  },
  {
    label: "Programa o carrera",
    name: "programa",
    placeholder: "Ej. Maestría en Educación",
    type: "text",
  },
  {
    label: "Tipo de trabajo",
    name: "tipo",
    placeholder: "Tesis, artículo, trabajo de investigación...",
    type: "text",
  },
];

export function SnapshotLanding() {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.88)] px-3 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:gap-3 sm:px-5 sm:py-4">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Link className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="/">
                Ver sitio
              </Link>
            </span>
            <a className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="#generar">
              <span className="hidden sm:inline">Solicitar snapshot</span>
              <span className="sm:hidden">Solicitar</span>
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section className="relative min-h-[690px] overflow-hidden rounded-[34px] border border-[rgba(52,20,95,0.18)] bg-[#170c2a] px-5 py-8 text-white shadow-[0_32px_80px_rgba(42,16,77,0.34)] sm:rounded-[42px] sm:px-8 lg:min-h-[720px] lg:px-10 lg:py-12">
          <Image
            alt="Biblioteca académica con capa visual de inteligencia artificial"
            className="object-cover object-center"
            fill
            priority
            sizes="(min-width: 1024px) 72rem, 100vw"
            src="/marketing/hero-premium-ai-library-v3.png"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,8,24,0.94)_0%,rgba(23,12,42,0.82)_45%,rgba(23,12,42,0.28)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,8,24,0.02),rgba(14,8,24,0.42)_72%,rgba(14,8,24,0.78))]" />

          <div className="relative grid min-h-[610px] gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-end">
            <div className="min-w-0 self-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/78">
                <span className="inline-flex size-2 rounded-full bg-white" />
                Campaña de acceso temprano
              </div>

              <h1 className="mt-8 max-w-3xl text-balance font-[var(--font-heading)] text-[2.65rem] font-semibold leading-[1.02] tracking-normal sm:text-6xl lg:text-7xl">
                Snapshot de investigación
              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-white/78 sm:text-lg sm:leading-8">
                Convierte un tema difuso en una primera base más clara, con enfoque,
                ejes clave y una visualización útil para decidir el siguiente paso.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <a
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  href="#generar"
                >
                  Solicitar mi snapshot
                  <ArrowRight className="ml-2 size-4" />
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="#ejemplo"
                >
                  Ver ejemplo
                </a>
              </div>
            </div>

            <aside className="min-w-0">
              <SnapshotPoster />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {heroSignals.map((item) => (
                  <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-3 backdrop-blur" key={item}>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 text-white" />
                      <span className="text-sm font-semibold text-white">{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {painSignals.map((item) => (
            <article
              className="surface-panel rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-6 shadow-[0_16px_34px_rgba(23,19,31,0.05)]"
              key={item.title}
            >
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
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
        </section>

        <ResearchFlowDiagram />

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Confianza operativa</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Asistencia, descubrimiento y trazabilidad en una misma experiencia.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              El snapshot es una muestra breve, pero se apoya en una lógica de
              producto preparada para trabajar con fuentes, metadatos y salidas
              revisables.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providerLogos.map((item) => (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5"
                key={item.name}
              >
                <div className="flex items-center gap-3">
                  <Image
                    alt={item.name}
                    className={`h-auto ${item.className}`}
                    height={128}
                    src={item.src}
                    width={128}
                  />
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {item.name}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-start" id="ejemplo">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">Ejemplo de entrega</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Un poster breve para entender el tema sin leer diez páginas.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              La primera salida debe ser clara, visual y suficientemente concreta
              para decidir si el enfoque tiene sentido.
            </p>
            <div className="mt-6 space-y-3">
              {visibleItems.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
            <ThesisPlanMockup className="mt-6" size="compact" />
          </article>

          <article className="surface-panel rounded-[34px] p-4 sm:p-5">
            <div className="overflow-hidden rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(145deg,#fffdf9_0%,#f5effc_54%,#effbf8_100%)] p-5 shadow-[0_22px_50px_rgba(23,19,31,0.08)]">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.64)]">
                      Tema refinado
                    </p>
                    <h3 className="mt-3 max-w-xl font-[var(--font-heading)] text-3xl font-semibold leading-tight text-[var(--color-ink)]">
                      IA generativa y retroalimentación académica en programas de posgrado
                    </h3>
                  </div>
                  <span className="rounded-full bg-[var(--color-plum)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    Snapshot
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-[1fr_0.85fr]">
                  <div className="space-y-4">
                    <div className="rounded-[22px] bg-[rgba(244,241,248,0.92)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
                        Síntesis
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                        El enfoque explora cómo la IA puede apoyar procesos de
                        retroalimentación sin reemplazar el criterio docente ni la
                        revisión académica.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {["Docencia", "Calidad", "Adopción", "Riesgo"].map((item) => (
                        <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white px-4 py-3" key={item}>
                          <p className="text-sm font-semibold text-[var(--color-ink)]">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative min-h-72 overflow-hidden rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(52,20,95,0.96),rgba(79,41,127,0.88))] p-5 text-white">
                    <div className="absolute -right-12 -top-12 size-40 rounded-full bg-[rgba(157,231,214,0.24)] blur-2xl" />
                    <div className="absolute -bottom-14 -left-14 size-44 rounded-full bg-[rgba(219,193,255,0.28)] blur-2xl" />
                    <div className="relative space-y-3">
                      {lockedItems.slice(0, 4).map((item) => (
                        <div className="rounded-[18px] border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/78" key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-x-4 bottom-4 rounded-[20px] border border-white/12 bg-white/14 px-4 py-4 text-center backdrop-blur">
                      <LockKeyhole className="mx-auto size-5 text-white" />
                      <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold">
                        Siguiente nivel bloqueado
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Cómo funciona</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Un recorrido corto para validar si vale la pena seguir.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              La campaña está diseñada para mostrar valor antes de pedir un
              compromiso mayor.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5"
                key={step.title}
              >
                <div className="inline-flex size-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(219,193,255,0.34),rgba(157,231,214,0.26))] font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {index + 1}
                </div>
                <h3 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <div className="inline-flex size-12 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
              <ShieldCheck className="size-5 text-[var(--color-ink)]" />
            </div>
            <p className="mt-5 brand-kicker">Uso responsable</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Diseñado para apoyar la investigación, no para reemplazarla.
            </h2>
            <div className="mt-6 space-y-3">
              {trustItems.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="overflow-hidden rounded-[34px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,rgba(23,12,42,0.96),rgba(42,16,77,0.94)_40%,rgba(79,41,127,0.9)_100%)] p-6 text-white shadow-[0_28px_64px_rgba(42,16,77,0.26)] sm:p-7">
            <div className="rounded-[28px] border border-white/12 bg-white/10 p-6">
              <Sparkles className="size-6 text-white" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Promesa de campaña
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold">
                Menos fricción al inicio. Más claridad para decidir.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/74">
                El snapshot no intenta resolver todo el proyecto. Resuelve el primer
                bloqueo: saber si el tema empieza a tener forma, dirección y una ruta
                razonable para seguir.
              </p>
            </div>
          </article>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Preguntas frecuentes</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Lo esencial antes de avanzar.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Respuestas breves para entender qué recibes, qué queda para después
              y cómo mantener un uso responsable.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqItems.map((item) => (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5"
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
          className="overflow-hidden rounded-[36px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_38%,#4f297f_100%)] px-6 py-7 text-white shadow-[0_28px_64px_rgba(42,16,77,0.24)] sm:px-8"
          id="generar"
        >
          <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <Mail className="size-6 text-white" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Siguiente paso
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold sm:text-4xl">
                Comparte tu tema y solicita tu snapshot.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-base">
                No necesitas tenerlo perfecto. Justamente, esta experiencia existe
                para ayudarte a ordenar una primera versión del enfoque.
              </p>
              <div className="mt-6 space-y-3">
                {["Respuesta por correo", "Acceso temprano", "Coordinación manual de acceso"].map((item) => (
                  <div className="flex items-start gap-3" key={item}>
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-white" />
                    <span className="text-sm leading-7 text-white/78">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <form
              action="mailto:hola@simetrika.pe?subject=Quiero%20mi%20snapshot"
              className="rounded-[30px] border border-white/12 bg-white/10 p-6"
              encType="text/plain"
              method="post"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Punto de partida
              </p>
              <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold">
                Cuéntanos qué quieres validar
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/74">
                Con estos datos podemos entender tu caso y responderte con una
                orientación inicial.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {intakeFields.map((field) => (
                  <label className="block" key={field.name}>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">
                      {field.label}
                    </span>
                    <input
                      className="brand-input mt-2 w-full bg-white/96"
                      name={field.name}
                      placeholder={field.placeholder}
                      required
                      type={field.type}
                    />
                  </label>
                ))}
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">
                    Tema o idea inicial
                  </span>
                  <textarea
                    className="brand-textarea mt-2 w-full bg-white/96"
                    name="tema"
                    placeholder="Escribe tu tema como lo tienes hoy, aunque todavía esté desordenado."
                    required
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  type="submit"
                >
                  Solicitar snapshot
                  <ArrowRight className="ml-2 size-4" />
                </button>
                <Link
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="/"
                >
                  Volver al sitio
                </Link>
              </div>
            </form>
          </div>
        </section>

        <footer className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Ingeniometrix
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                Snapshot de investigación para empezar con más claridad, criterio y trazabilidad.
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[rgba(100,94,115,0.72)]">
                © 2026 Ingeniometrix. Todos los derechos reservados.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/">
                Sitio principal
              </Link>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="mailto:hola@simetrika.pe">
                hola@simetrika.pe
              </a>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#generar">
                Solicitar snapshot
              </a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
