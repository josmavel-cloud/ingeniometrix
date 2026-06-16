import Image from "next/image";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import { AiChatboxPreview } from "@/components/marketing/ai-chatbox-preview";
import {
  ResearchFlowDiagram,
  SnapshotPoster,
  ThesisPlanMockup,
} from "@/components/marketing/research-visuals";

import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Mail,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const heroSignals = [
  "Tema refinado",
  "Ejes clave",
  "Ruta inicial revisable",
];

const painSignals = [
  {
    title: "Tu idea existe, pero todavía no tiene forma",
    description:
      "Ingeniometrix ayuda a convertir una intuición amplia en un punto de partida más claro para investigación.",
    iconSrc: "/marketing/icons/ai-lens.svg",
  },
  {
    title: "Necesitas avanzar con criterio académico",
    description:
      "La salida declara supuestos, límites y decisiones pendientes para evitar conclusiones apresuradas.",
    iconSrc: "/marketing/icons/method-compass.svg",
  },
  {
    title: "Tu asesor necesita ver estructura",
    description:
      "Un snapshot visual facilita conversar sobre alcance, viabilidad, enfoque y siguientes pasos.",
    iconSrc: "/marketing/icons/thesis-plan.svg",
  },
];

const providerLogos = [
  {
    name: "OpenAI",
    src: "/providers/openai.png",
    className: "w-9 rounded-[10px]",
    description: "Asistencia para estructurar, sintetizar y explicar ideas complejas.",
  },
  {
    name: "Claude",
    src: "/providers/claude.png",
    className: "w-8 rounded-[10px]",
    description: "Apoyo conversacional para análisis guiado y revisión de enfoque.",
  },
  {
    name: "OpenAlex",
    src: "/providers/openalex.png",
    className: "w-8 rounded-[10px]",
    description: "Descubrimiento bibliográfico abierto para ubicar contexto académico.",
  },
  {
    name: "Crossref",
    src: "/providers/crossref.svg",
    className: "w-28",
    hideName: true,
    description: "Metadatos DOI para fortalecer trazabilidad y verificación.",
  },
];

const deliverables = [
  "Tema refinado y mejor delimitado",
  "Síntesis breve del problema",
  "Ejes clave para orientar la investigación",
  "Palabras clave para buscar literatura",
  "Supuestos y decisiones pendientes",
  "Ruta inicial hacia el plan de tesis",
];

const steps = [
  {
    title: "Escribe tu idea",
    description:
      "Comparte el tema como lo tienes hoy, aunque todavía esté incompleto o desordenado.",
    icon: FileText,
  },
  {
    title: "Recibe un snapshot",
    description:
      "Obtén una primera lectura con enfoque, ejes, palabras clave y una vista visual del problema.",
    icon: Sparkles,
  },
  {
    title: "Revisa el alcance",
    description:
      "Identifica supuestos, límites y decisiones que deben revisarse antes de avanzar.",
    icon: ClipboardCheck,
  },
  {
    title: "Define el siguiente paso",
    description:
      "Usa la base inicial para conversar mejor con tu asesor y continuar con más claridad.",
    icon: Route,
  },
];

const trustItems = [
  "No es un generador automático de tesis.",
  "No promete aprobación ni resultados académicos.",
  "No inventa citas, datos ni resultados.",
  "La información faltante se declara como supuesto o pendiente.",
  "La salida está pensada para revisión humana.",
];

const faqItems = [
  {
    question: "¿Qué es el snapshot?",
    answer:
      "Es una primera lectura visual de tu idea: tema refinado, síntesis, ejes clave, palabras clave, supuestos y ruta inicial.",
  },
  {
    question: "¿Reemplaza a mi asesor?",
    answer:
      "No. Ingeniometrix ayuda a preparar una base más clara para conversar, revisar y decidir con acompañamiento humano.",
  },
  {
    question: "¿La herramienta hace mi tesis?",
    answer:
      "No. Ayuda a estructurar el punto de partida. No redacta una tesis completa ni promete aprobación académica.",
  },
  {
    question: "¿Puedo usarlo si mi tema está muy amplio?",
    answer:
      "Sí. Ese es el caso ideal: ordenar una idea amplia y convertirla en una base inicial más clara.",
  },
  {
    question: "¿Qué pasa con las fuentes?",
    answer:
      "La experiencia prioriza fuentes recuperables y trazabilidad. Si falta información, debe quedar indicada.",
  },
  {
    question: "¿Cómo solicito acceso?",
    answer:
      "Por ahora la coordinación es manual por correo. La página prepara un mensaje dirigido a hola@simetrika.pe.",
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[28px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.9)] px-3 py-3 shadow-[0_18px_45px_rgba(23,19,31,0.07)] backdrop-blur sm:gap-3 sm:px-5">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-semibold text-[var(--color-muted)] lg:flex">
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#chatbox">
              Chatbox
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#entrega">
              Entrega
            </a>
            <a className="rounded-full px-3 py-2 hover:bg-white hover:text-[var(--color-plum)]" href="#faq">
              FAQ
            </a>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Link className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="/">
                Ver portal
              </Link>
            </span>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/workspace">
              Iniciar sesion
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section className="rounded-[40px] border border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.72)] px-5 py-8 shadow-[0_24px_70px_rgba(23,19,31,0.08)] backdrop-blur sm:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="brand-pill">Ingeniometrix para investigación</div>
              <h1 className="mt-7 max-w-3xl text-balance font-[var(--font-heading)] text-[2.8rem] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--color-ink)] sm:text-6xl">
                Convierte una idea de investigación en una base clara para tu plan de tesis.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
                Ordena tu tema, identifica ejes clave, declara supuestos y
                prepara una ruta inicial revisable antes de avanzar a una
                estructura más completa.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center rounded-full bg-[var(--color-plum)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(52,20,95,0.18)]"
                  href="#chatbox"
                >
                  Probar con mi tema
                  <ArrowRight className="ml-2 size-4" />
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-[rgba(74,58,97,0.12)] bg-white px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
                  href="#entrega"
                >
                  Ver qué recibo
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

              <div className="relative mt-7 min-h-[230px] overflow-hidden rounded-[32px] border border-[rgba(74,58,97,0.12)] bg-[var(--color-plum)] shadow-[0_24px_70px_rgba(23,19,31,0.1)] sm:min-h-[280px]">
                <Image
                  alt="Biblioteca académica asistida por inteligencia artificial"
                  className="object-cover object-center"
                  fill
                  priority
                  sizes="(min-width: 1024px) 34rem, 100vw"
                  src="/marketing/hero-premium-ai-library-v3.png"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,12,42,0.82)_0%,rgba(23,12,42,0.42)_52%,rgba(23,12,42,0.1)_100%)]" />
                <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-white/12 bg-white/12 p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/62">
                    Biblioteca inteligente
                  </p>
                  <h2 className="mt-2 max-w-lg font-[var(--font-heading)] text-2xl font-semibold leading-tight sm:text-3xl">
                    Del tema inicial a una ruta de investigación más clara.
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-white/82">
                    {["Fuentes", "Evidencia", "Plan"].map((item) => (
                      <span className="rounded-full border border-white/12 bg-white/12 px-3 py-1.5" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div id="chatbox">
              <AiChatboxPreview />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {painSignals.map((item) => (
            <article
              className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-6 shadow-[0_16px_38px_rgba(23,19,31,0.05)]"
              key={item.title}
            >
              <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-[#f5f1fb]">
                <Image
                  alt={item.title}
                  className="h-auto w-11"
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

        <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start" id="entrega">
          <article className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/88 p-6 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:p-7">
            <p className="brand-kicker">Qué recibes</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Un snapshot visual para entender tu tema antes de escribir páginas.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              La primera salida busca claridad: no resuelve todo el proyecto, pero
              te ayuda a ver si el enfoque tiene forma, límites y una ruta razonable.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {deliverables.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
            <ThesisPlanMockup className="mt-6" size="compact" />
          </article>

          <SnapshotPoster />
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Cómo funciona</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Un recorrido corto para avanzar con más control.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              La experiencia reduce fricción al inicio y deja claro qué debe
              revisarse antes de continuar.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-4">
            {steps.map((step, index) => {
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

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Trazabilidad</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                IA para ordenar. Fuentes para sostener. Criterio para decidir.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Ingeniometrix separa asistencia, evidencia y decisiones humanas
              para mantener una experiencia más clara y revisable.
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providerLogos.map((item) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5"
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
                  {"hideName" in item && item.hideName ? null : (
                    <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {item.name}
                    </h3>
                  )}
                </div>
                <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
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
              {trustItems.map((item) => (
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
              El snapshot se enfoca en el primer bloqueo: saber si el tema
              empieza a tener forma, dirección y una ruta razonable hacia el
              requisito académico del plan de tesis.
            </p>
          </article>
        </section>

        <section className="rounded-[34px] border border-[rgba(74,58,97,0.1)] bg-white/86 px-6 py-7 shadow-[0_18px_50px_rgba(23,19,31,0.06)] sm:px-8" id="faq">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Preguntas frecuentes</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Lo esencial antes de avanzar.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Respuestas breves sobre alcance, responsabilidad, fuentes y acceso.
            </p>
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
          id="solicitar"
        >
          <div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <Mail className="size-6 text-white" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Acceso al workspace
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold sm:text-4xl">
                Inicia sesion para generar tu snapshot.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-base">
                El acceso al producto esta limitado por ahora a cuentas
                habilitadas previamente en el backend.
              </p>
            </div>

            <form
              action="/workspace"
              className="rounded-[28px] border border-white/12 bg-white/10 p-6"
              method="get"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Autenticacion
              </p>
              <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold">
                Entra con una cuenta habilitada
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/74">
                Desde el workspace podras crear proyectos, completar intake y
                generar el blueprint con fuentes trazables.
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
                  Ir a autenticar
                  <ArrowRight className="ml-2 size-4" />
                </button>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="#chatbox"
                >
                  Volver al chatbox
                </a>
              </div>
            </form>
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
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/">
                Sitio principal
              </Link>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="mailto:hola@simetrika.pe">
                hola@simetrika.pe
              </a>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#solicitar">
                Solicitar snapshot
              </a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
