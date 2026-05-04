import Image from "next/image";
import Link from "next/link";

import { BrandBadge } from "@/components/brand/brand-badge";
import {
  EvidenceTraceMap,
  ResearchFlowDiagram,
  SnapshotPoster,
  ThesisPlanMockup,
} from "@/components/marketing/research-visuals";

import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  CircleFadingPlus,
  Globe2,
  LockKeyhole,
  NotebookTabs,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";

const productSignals = [
  "Preview inmediato para aterrizar una idea de investigación",
  "Una muestra visual del tema antes de pasar al siguiente nivel",
  "Pensado para investigar con más criterio y menos fricción",
];

const snapshotVisibleSections = [
  {
    label: "Tema refinado",
    value:
      "Impacto de la inteligencia artificial en la retroalimentación académica dentro de programas de posgrado",
  },
  {
    label: "Síntesis inicial",
    value:
      "El snapshot organiza el foco del tema, delimita el contexto y convierte una idea dispersa en una base de investigación más clara.",
  },
  {
    label: "Ejes clave",
    value:
      "Uso docente, calidad de retroalimentación, adopción institucional y riesgos metodológicos.",
  },
  {
    label: "Palabras clave",
    value: "retroalimentación académica, posgrado, inteligencia artificial, diseño metodológico",
  },
];

const snapshotLockedSections = [
  "Objetivo general sugerido",
  "Preguntas de investigación",
  "Ruta metodológica inicial",
  "Estructura recomendada del plan",
  "Siguientes pasos para continuar",
];

const trustStripItems = [
  {
    title: "Fuentes trazables",
    description: "Cada avance debe poder explicarse y revisarse con evidencia recuperable.",
    iconSrc: "/marketing/icons/doi-graph.svg",
  },
  {
    title: "Punto de partida serio",
    description: "No es un generador automático de tesis. Es una entrada más clara para investigar mejor.",
    iconSrc: "/marketing/icons/thesis-plan.svg",
  },
  {
    title: "Desbloqueo natural",
    description: "Primero ves una muestra útil. Luego decides si quieres avanzar al plan inicial.",
    iconSrc: "/marketing/icons/export-package.svg",
  },
];

const featureCards = [
  {
    title: "Estructura con más criterio",
    description:
      "Convierte ideas dispersas en una base de trabajo más clara, consistente y fácil de revisar.",
    iconSrc: "/marketing/icons/ai-lens.svg",
  },
  {
    title: "Trabaja con evidencia útil",
    description:
      "Reúne fuentes, hallazgos y relaciones con una lógica visible para seguir iterando con contexto.",
    iconSrc: "/marketing/icons/evidence-ledger.svg",
  },
  {
    title: "Valida antes de escalar",
    description:
      "Ayuda a detectar vacíos, incoherencias y decisiones pendientes antes de que frenen el proceso.",
    iconSrc: "/marketing/icons/method-compass.svg",
  },
];

const workflowSteps = [
  {
    title: "Define tu punto de partida",
    description:
      "Organiza problema, objetivos, contexto y restricciones en una ruta más clara desde el inicio.",
  },
  {
    title: "Construye una base con evidencia",
    description:
      "Reúne referencias, estructura y señales útiles para trabajar con mejor criterio.",
  },
  {
    title: "Revisa y continúa",
    description:
      "Detecta vacíos e incoherencias antes de que se conviertan en fricción acumulada.",
  },
];

const serviceCards = [
  {
    title: "IngenioIA",
    description:
      "La experiencia principal para estructurar, revisar y acelerar investigación con una base más clara y trazable.",
    status: "Disponible",
    iconSrc: "/marketing/icon-ingenioia.svg",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(219,193,255,0.44),rgba(255,255,255,0.82))]",
  },
  {
    title: "Ingenio Mentor",
    description:
      "Una siguiente capa para acompañamiento, feedback y procesos de asesoría con más continuidad.",
    status: "Próximamente",
    iconSrc: "/marketing/icon-mentor.svg",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(255,190,201,0.38),rgba(255,255,255,0.84))]",
  },
  {
    title: "Ingenio Lab",
    description:
      "Exploración, iteración y experimentación para nuevas rutas de investigación y trabajo con evidencia.",
    status: "Próximamente",
    iconSrc: "/marketing/icon-lab.svg",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(157,231,214,0.32),rgba(255,255,255,0.84))]",
  },
  {
    title: "Ingenio Studio",
    description:
      "Un espacio para consultoras y equipos que necesitan procesos más ordenados, repetibles y visibles.",
    status: "Próximamente",
    iconSrc: "/marketing/icon-studio.svg",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(239,193,77,0.28),rgba(255,255,255,0.86))]",
  },
];

const engineCards = [
  {
    name: "OpenAI",
    description:
      "Modelos de IA para estructurar, sintetizar y apoyar tareas de investigación con mejor contexto.",
    logoSrc: "/providers/openai.png",
    logoClassName: "w-9 rounded-[10px]",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(219,193,255,0.34),rgba(255,255,255,0.92))]",
  },
  {
    name: "Claude",
    description:
      "Asistencia conversacional para análisis, redacción guiada y trabajo con instrucciones extensas.",
    logoSrc: "/providers/claude.png",
    logoClassName: "w-8 rounded-[10px]",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(255,190,201,0.24),rgba(255,255,255,0.92))]",
  },
  {
    name: "OpenAlex",
    description:
      "Base abierta para descubrimiento bibliográfico, exploración de literatura y contexto académico.",
    logoSrc: "/providers/openalex.png",
    logoClassName: "w-8 rounded-[10px]",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(157,231,214,0.3),rgba(255,255,255,0.92))]",
  },
  {
    name: "CrossRef",
    description:
      "Metadatos, referencias y conectividad DOI para fortalecer trazabilidad y verificación.",
    logoSrc: "/providers/crossref.svg",
    logoClassName: "w-8",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(255,190,201,0.28),rgba(255,255,255,0.92))]",
  },
  {
    name: "Exportaciones",
    description:
      "Salidas listas para continuar el trabajo en documentos, gestores bibliográficos y evidencia.",
    logoSrc: "/marketing/icon-engine-export.svg",
    logoClassName: "w-7",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(239,193,77,0.24),rgba(255,255,255,0.94))]",
    tags: ["DOCX", "BibTeX", "RIS", "evidence_log.json"],
  },
];

const contactCards = [
  {
    label: "Correo",
    title: "hola@simetrika.pe",
    description:
      "Contacto general para acceso, dudas y conversaciones iniciales.",
    iconSrc: "/marketing/icon-contact-mail.svg",
  },
  {
    label: "Dominio",
    title: "ingeniometrix.com",
    description:
      "Punto de entrada público para IngenioIA y el ecosistema de producto.",
    iconSrc: "/marketing/icon-contact-domain.svg",
  },
];

const planCards = [
  {
    title: "Base",
    description: "Para empezar con una experiencia clara, guiada y enfocada en el trabajo individual.",
    iconSrc: "/marketing/icon-plan-base.svg",
    bullets: [
      "Acceso inicial a la experiencia principal",
      "Ideal para perfiles individuales",
      "Pensado para una primera adopción",
    ],
  },
  {
    title: "Plus",
    description:
      "Para flujos más frecuentes que necesitan continuidad, revisión y más profundidad de trabajo.",
    iconSrc: "/marketing/icon-plan-plus.svg",
    bullets: [
      "Más continuidad en el trabajo",
      "Mayor espacio para seguimiento",
      "Pensado para un uso más constante",
    ],
  },
  {
    title: "Premium",
    description:
      "Para consultoras, equipos y despliegues que necesitan una experiencia más amplia y colaborativa.",
    iconSrc: "/marketing/icon-plan-premium.svg",
    bullets: [
      "Orientado a entornos de equipo",
      "Base para configuraciones más amplias",
      "Dirección alineada con implementaciones futuras",
    ],
  },
];

const audienceCards = [
  {
    title: "Estudiantes y tesistas",
    description:
      "Para quienes necesitan una base más clara para organizar mejor su proceso de investigación.",
    iconSrc: "/marketing/icons/thesis-plan.svg",
  },
  {
    title: "Asesores y revisores",
    description:
      "Para quienes buscan marcos de revisión y una conversación metodológica más consistente.",
    iconSrc: "/marketing/icons/method-compass.svg",
  },
  {
    title: "Investigadores",
    description:
      "Para quienes necesitan ordenar, revisar y acelerar flujos de investigación en distintas áreas.",
    iconSrc: "/marketing/icons/source-library.svg",
  },
  {
    title: "Consultoras y equipos",
    description:
      "Para entornos que requieren procesos repetibles, más orden y una capa visible de trabajo.",
    iconSrc: "/marketing/icons/export-package.svg",
  },
];

const faqItems = [
  {
    question: "¿IngenioIA sirve solo para tesis?",
    answer:
      "No. Puede apoyar procesos de investigación académica y aplicada en distintas áreas del conocimiento.",
  },
  {
    question: "¿Ingeniometrix reemplaza el criterio humano?",
    answer:
      "No. La plataforma está planteada para ayudar a estructurar, revisar y acelerar, no para sustituir el juicio académico o profesional.",
  },
  {
    question: "¿IngenioIA redacta una tesis completa por mí?",
    answer:
      "No. Ingeniometrix no se plantea como un generador automático de tesis, sino como una capa de apoyo para trabajar con más claridad y evidencia.",
  },
  {
    question: "¿Habrá más módulos además de IngenioIA?",
    answer:
      "Sí. Ingenio Mentor, Ingenio Lab e Ingenio Studio ya forman parte de la arquitectura pública del producto como capas futuras.",
  },
];

const launchPillars = [
  "Claridad para empezar sin perder tiempo en desorden",
  "Trazabilidad para revisar decisiones y fuentes",
  "Una experiencia premium pensada para crecer por módulos",
];

const useCaseCards = [
  {
    name: "Camila",
    program: "Maestría en Psicología Clínica",
    focus: "Ordenar una idea amplia antes de conversar con su asesor.",
    outcome:
      "Pasa de varias intuiciones sueltas a un foco inicial con variables, contexto y primeras decisiones visibles.",
    imageSrc: "/reviews/review-portrait-14.png",
  },
  {
    name: "Diego",
    program: "Maestría en Ingeniería Industrial",
    focus: "Conectar problema, evidencia y enfoque metodológico.",
    outcome:
      "Identifica vacíos tempranos y evita seguir acumulando referencias sin una pregunta clara.",
    imageSrc: "/reviews/review-portrait-15.png",
  },
  {
    name: "Valeria",
    program: "Maestría en Educación Superior",
    focus: "Delimitar un tema educativo con mejor lenguaje académico.",
    outcome:
      "Convierte un interés general en una ruta de trabajo más defendible y fácil de revisar.",
    imageSrc: "/reviews/review-portrait-16.png",
  },
  {
    name: "Mateo",
    program: "Maestría en Salud Pública",
    focus: "Visualizar una ruta inicial sin perder trazabilidad.",
    outcome:
      "Distingue tema, problema, población y posibles ejes de búsqueda antes de avanzar al plan.",
    imageSrc: "/reviews/review-portrait-17.png",
  },
  {
    name: "Lucía",
    program: "Maestría en Gestión Pública",
    focus: "Revisar coherencia entre título, problema y objetivo.",
    outcome:
      "Detecta puntos débiles del planteamiento y prepara una conversación más concreta para la siguiente revisión.",
    imageSrc: "/reviews/review-portrait-18.png",
  },
];

const planPreviewSections = [
  {
    label: "Título provisional",
    value: "Diseño de un plan de tesis con mejor coherencia entre problema, objetivos y método",
  },
  {
    label: "Problema",
    value: "Planteamiento inicial difuso y fuentes dispersas en la etapa de definición",
  },
  {
    label: "Objetivo general",
    value: "Construir una ruta de investigación clara, trazable y defendible desde el inicio",
  },
  {
    label: "Enfoque",
    value: "Revisión estructurada de literatura, delimitación y consistencia metodológica",
  },
];

const snapshotOutputCards = [
  {
    title: "Lo que ves al instante",
    badge: "Visible",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(219,193,255,0.18),rgba(255,255,255,0.9))]",
    items: [
      "Tema refinado y mejor delimitado",
      "Síntesis breve del foco de investigación",
      "Ejes clave para orientar la revisión",
      "Palabras clave para seguir explorando",
    ],
  },
  {
    title: "Lo que desbloqueas después",
    badge: "Siguiente nivel",
    accentClassName:
      "bg-[linear-gradient(135deg,rgba(157,231,214,0.18),rgba(255,255,255,0.9))]",
    items: [
      "Objetivo general sugerido",
      "Preguntas de investigación iniciales",
      "Ruta metodológica orientativa",
      "Estructura recomendada del plan",
    ],
  },
];

const socialCards = [
  { icon: UsersRound, label: "LinkedIn" },
  { icon: AtSign, label: "Instagram" },
  { icon: Video, label: "YouTube" },
  { icon: Globe2, label: "Facebook" },
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

const trustPrinciples = [
  {
    title: "Trazabilidad primero",
    description:
      "El trabajo debe poder seguirse, revisarse y sostenerse con fuentes y decisiones visibles.",
  },
  {
    title: "Apoyo, no sustitución",
    description:
      "Ingeniometrix ayuda a estructurar y revisar. No reemplaza el criterio académico ni profesional.",
  },
  {
    title: "Salida útil y editable",
    description:
      "La información se prepara para continuar el trabajo en documentos, gestores bibliográficos y revisiones posteriores.",
  },
];

const scopeBoundaryCards = [
  {
    title: "Lo que sí hace",
    items: [
      "Aclara el tema y delimita mejor el foco",
      "Organiza evidencia y relaciones útiles",
      "Sugiere una base inicial más defendible",
      "Ayuda a preparar un plan de investigación con mejor estructura",
    ],
  },
  {
    title: "Lo que no hace",
    items: [
      "No redacta una tesis completa por ti",
      "No reemplaza la asesoría ni la revisión humana",
      "No promete resultados automáticos sin criterio",
      "No se plantea como herramienta para fraude académico",
    ],
  },
];

const closingSignals = [
  "Entrada guiada para pasar de idea dispersa a enfoque claro",
  "Muestra visible antes de pedir un compromiso mayor",
  "Ruta preparada para seguir con un plan inicial más sólido",
];

export function HomeHero() {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.84)] px-3 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:gap-3 sm:px-5 sm:py-4">
          <a className="min-w-0 flex-1" href="#top">
            <BrandBadge compact context="company" />
          </a>

          <nav className="hidden items-center gap-5 text-sm text-[var(--color-muted)] md:flex">
            <a className="hover:text-[var(--color-plum)]" href="#ingenioia">
              Producto
            </a>
            <a className="hover:text-[var(--color-plum)]" href="#motores">
              Confianza
            </a>
            <a className="hover:text-[var(--color-plum)]" href="#servicios">
              Servicios
            </a>
            <a className="hover:text-[var(--color-plum)]" href="#faq">
              FAQ
            </a>
            <Link className="hover:text-[var(--color-plum)]" href="/recursos">
              Recursos
            </Link>
            <a className="hover:text-[var(--color-plum)]" href="#contacto">
              Contacto
            </a>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Link className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="/campana">
                Ver snapshot
              </Link>
            </span>
            <span className="hidden lg:inline-flex">
              <a className="brand-button-secondary px-4 py-2 text-sm font-semibold" href="#partners">
                Aliados
              </a>
            </span>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/campana">
              <span className="hidden sm:inline">Generar mi snapshot</span>
              <span className="sm:hidden">Snapshot</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-6">
        <section
          className="overflow-hidden rounded-[34px] border border-[rgba(52,20,95,0.18)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_36%,#4f297f_100%)] px-5 py-8 text-white shadow-[0_32px_80px_rgba(42,16,77,0.34)] sm:rounded-[40px] sm:px-8 lg:px-10 lg:py-12"
          id="top"
        >
          <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/78">
                <span className="inline-flex size-2 rounded-full bg-white" />
                Ingeniometrix
              </div>

              <h1 className="mt-8 max-w-3xl text-balance font-[var(--font-heading)] text-[2.45rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Pasa de un tema confuso a una base de plan de tesis más clara.
              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-white/76 sm:text-lg sm:leading-8">
                Genera un snapshot inicial con síntesis, ejes clave y una primera
                estructura visual para decidir si vale la pena desbloquear el
                siguiente nivel de tu plan.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  href="/campana"
                >
                  Generar mi snapshot
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="#ingenioia"
                >
                  Ver ejemplo
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                {productSignals.map((item) => (
                  <span
                    className="inline-flex max-w-full items-center gap-2 whitespace-normal rounded-full border border-white/12 bg-white/10 px-4 py-2 text-white/74"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex min-w-0 flex-col gap-4 lg:gap-5">
              <div className="absolute -inset-3 rounded-[40px] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(178,134,255,0.2),transparent_36%)] blur-2xl" />
              <div className="relative min-h-[320px] overflow-hidden rounded-[34px] border border-white/14 bg-[rgba(11,7,23,0.72)] shadow-[0_34px_84px_rgba(10,6,24,0.34)] sm:min-h-[420px] lg:min-h-[430px]">
                <Image
                  alt="Visual de IngenioIA"
                  className="object-cover object-center md:object-[center_48%]"
                  fill
                  priority
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  src="/marketing/hero-premium-ai-library-v3.png"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(14,8,24,0.02),rgba(14,8,24,0.14)_48%,rgba(8,5,18,0.26))]" />
              </div>

              <div
                className="relative rounded-[34px] border border-white/12 bg-[rgba(18,10,34,0.76)] p-5 shadow-[0_24px_48px_rgba(8,5,18,0.28)] backdrop-blur sm:p-6"
                id="snapshot"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
                      Snapshot de investigación
                    </p>
                    <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">
                      Vista inicial de tu tema
                    </p>
                  </div>
                  <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74">
                    Preview
                  </span>
                </div>

                <div className="mt-5 rounded-[24px] border border-white/10 bg-white/8 p-4">
                  {snapshotVisibleSections.map((item, index) => (
                    <div
                      className={`py-3 ${index === 0 ? "pt-0" : ""} ${
                        index === snapshotVisibleSections.length - 1
                          ? "pb-0"
                          : "border-b border-white/10"
                      }`}
                      key={item.label}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-white/84">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="relative mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <div className="space-y-3 opacity-45">
                    {snapshotLockedSections.map((item) => (
                      <div
                        className="rounded-[18px] border border-white/8 bg-white/8 px-4 py-3 text-sm text-white/78"
                        key={item}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(18,10,34,0.14),rgba(18,10,34,0.84))]">
                    <div className="mx-4 max-w-xs rounded-[22px] border border-white/12 bg-[rgba(255,255,255,0.12)] px-5 py-4 text-center backdrop-blur">
                      <LockKeyhole className="mx-auto size-5 text-white/82" />
                      <p className="mt-3 font-[var(--font-heading)] text-lg font-semibold text-white">
                        Desbloquea el plan inicial
                      </p>
                        <p className="mt-2 text-sm leading-6 text-white/74">
                        Objetivos, preguntas, método y siguientes pasos listos
                        para continuar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {trustStripItems.map((item) => {
            return (
              <article
                className="surface-panel rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-5 shadow-[0_16px_34px_rgba(23,19,31,0.05)]"
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
                <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </article>
            );
          })}
        </section>

        <ResearchFlowDiagram />

        <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-start" id="ingenioia">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">IngenioIA</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Una muestra útil antes de pedirte más compromiso.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              El snapshot inicial está pensado para que una persona vea valor real
              en minutos: mejor enfoque, un punto de partida más claro y una ruta
              visible para decidir si quiere continuar.
            </p>
            <div className="mt-6 space-y-3">
              {launchPillars.map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-4">
              {snapshotOutputCards.map((card) => (
                <article
                  className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.92))] p-5 shadow-[0_14px_28px_rgba(23,19,31,0.05)]"
                  key={card.title}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {card.title}
                    </h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold text-[var(--color-muted)] ${card.accentClassName}`}
                    >
                      {card.badge}
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {card.items.map((item) => (
                      <div className="flex items-start gap-3" key={item}>
                        <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                        <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="inline-flex size-11 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
                  <NotebookTabs className="size-5 text-[var(--color-ink)]" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.68)]">
                    Ejemplo de salida
                  </p>
                  <p className="mt-1 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                    Página del plan inicial
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[rgba(244,241,248,0.96)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                Borrador guiado
              </span>
            </div>

            <ThesisPlanMockup className="mt-5" />

            <div className="mt-5 rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.92))] p-5 shadow-[0_14px_28px_rgba(23,19,31,0.05)]">
              <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
                <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
                  {planPreviewSections.map((item, index) => (
                    <div
                      className={`py-3 ${index === 0 ? "pt-0" : ""} ${index === planPreviewSections.length - 1 ? "pb-0" : "border-b border-[rgba(74,58,97,0.08)]"}`}
                      key={item.label}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.64)]">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  {featureCards.map((item) => (
                    <article
                      className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-5"
                      key={item.title}
                    >
                      <div className="flex items-start gap-4">
                        <div className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
                          <Image
                            alt={item.title}
                            className="h-auto w-7"
                            height={128}
                            src={item.iconSrc}
                            width={128}
                          />
                        </div>
                        <div>
                          <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                            {item.title}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.98fr_1.02fr] lg:items-start">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">Cómo funciona</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Así se convierte una idea suelta en un punto de partida defendible.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Primero ves una muestra clara. Después decides si quieres convertir
              ese primer enfoque en una base más completa para continuar.
            </p>
            <div className="mt-6 grid gap-4">
              {workflowSteps.map((step, index) => (
                <div
                  className="flex gap-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-5"
                  key={step.title}
                >
                  <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(219,193,255,0.34),rgba(157,231,214,0.26))] font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.92))] p-5 shadow-[0_14px_28px_rgba(23,19,31,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.68)]">
                    Visible vs. desbloqueado
                  </p>
                  <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                    La transición debe sentirse natural.
                  </h3>
                </div>
                <span className="rounded-full bg-[rgba(244,241,248,0.96)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                  Preview
                </span>
              </div>

              <SnapshotPoster className="mt-5" size="compact" />

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.64)]">
                    Lo que recibe de inmediato
                  </p>
                  <div className="mt-4 space-y-3">
                    {snapshotVisibleSections.slice(0, 3).map((item) => (
                      <div className="rounded-[18px] bg-[rgba(244,241,248,0.8)] px-4 py-3" key={item.label}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.64)]">
                          {item.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(247,243,250,0.98),rgba(239,234,246,0.96))] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.64)]">
                    Lo que se desbloquea después
                  </p>
                  <div className="mt-4 space-y-3 opacity-40">
                    {snapshotLockedSections.map((item) => (
                      <div className="rounded-[18px] bg-white/88 px-4 py-3 text-sm text-[var(--color-ink)]" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-x-4 bottom-4 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/92 px-4 py-4 shadow-[0_12px_24px_rgba(23,19,31,0.08)]">
                    <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                      Desbloquea la siguiente capa
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      Cuando la muestra ya tiene sentido, el siguiente paso se
                      siente coherente y útil.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8" id="motores">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Motores integrados</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Inteligencia, descubrimiento y trazabilidad en una sola capa.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              IngenioIA se apoya en motores reconocibles para articular asistencia,
              exploración bibliográfica, verificación de metadatos y exportaciones.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {engineCards.map((engine) => {
              return (
                <article
                  className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.9))] p-5 shadow-[0_18px_36px_rgba(23,19,31,0.06)]"
                  key={engine.name}
                >
                  <div
                    className={`inline-flex size-12 items-center justify-center rounded-full ${engine.accentClassName}`}
                  >
                    <Image
                      alt={engine.name}
                      className={`h-auto ${engine.logoClassName}`}
                      height={128}
                      src={engine.logoSrc}
                      width={128}
                    />
                  </div>
                  <h3 className="mt-4 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {engine.name}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {engine.description}
                  </p>
                  {Array.isArray(engine.tags) ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {engine.tags.map((tag) => (
                        <span
                          className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white/92 px-3 py-1 text-xs font-semibold text-[var(--color-muted)]"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <EvidenceTraceMap className="mt-6" />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {trustPrinciples.map((item) => (
              <article
                className="rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5"
                key={item.title}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(100,94,115,0.64)]">
                  Confianza
                </p>
                <h3 className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">Posicionamiento</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Diseñado para investigar mejor, no para reemplazar el trabajo académico.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Esta capa de producto está pensada para ordenar, revisar y hacer más
              visible el proceso. La intención es reducir fricción sin cruzar la
              línea hacia atajos académicos irresponsables.
            </p>
          </article>

          <div className="grid gap-4 sm:grid-cols-2">
            {scopeBoundaryCards.map((card) => (
              <article
                className="surface-panel rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-6"
                key={card.title}
              >
                <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {card.title}
                </h3>
                <div className="mt-5 space-y-3">
                  {card.items.map((item) => (
                    <div className="flex items-start gap-3" key={item}>
                      <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                      <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8" id="servicios">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Servicios</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Un ecosistema que empieza por IngenioIA.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              La experiencia principal resuelve el punto de partida y abre espacio
              para nuevas capas de asesoría, exploración y trabajo en equipo.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {serviceCards.map((service) => {
              return (
                <article
                  className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.9))] p-5 shadow-[0_18px_36px_rgba(23,19,31,0.06)]"
                  key={service.title}
                >
                  <div
                    className={`inline-flex size-12 items-center justify-center rounded-full ${service.accentClassName}`}
                  >
                    <Image
                      alt={service.title}
                      className="h-auto w-7"
                      height={128}
                      src={service.iconSrc}
                      width={128}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {service.title}
                    </h3>
                    <span className="rounded-full bg-[rgba(244,241,248,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                      {service.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {service.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8" id="planes">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Planes</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Planes pensados para distintas etapas de adopción.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Desde un punto de entrada claro hasta configuraciones para trabajo
              continuo y despliegues de mayor alcance.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {planCards.map((plan, index) => (
              <article
                className={`rounded-[30px] border p-6 ${
                  index === 2
                    ? "border-[rgba(52,20,95,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,238,250,0.95))] shadow-[0_22px_46px_rgba(52,20,95,0.1)]"
                    : "border-[rgba(74,58,97,0.08)] bg-white/88"
                }`}
                key={plan.title}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      alt={plan.title}
                      className="h-auto w-10"
                      height={112}
                      src={plan.iconSrc}
                      width={112}
                    />
                    <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                      {plan.title}
                    </h3>
                  </div>
                  {index === 2 ? (
                    <span className="rounded-full bg-[var(--color-plum)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      Referencia premium
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                  {plan.description}
                </p>
                <div className="mt-5 space-y-3">
                  {plan.bullets.map((item) => (
                    <div className="flex items-start gap-3" key={item}>
                      <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                      <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">Para quién es</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Una misma base para perfiles que investigan de formas distintas.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Ingeniometrix se adapta a necesidades académicas, profesionales y de
              equipo sin perder la lógica de claridad, trazabilidad y revisión.
            </p>
          </article>

          <div className="grid gap-6 sm:grid-cols-2">
            {audienceCards.map((item) => (
                <article className="surface-panel rounded-[32px] bg-white/88 p-6" key={item.title}>
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
          </div>
        </section>

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8" id="partners">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Aliados</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Aliados que respaldan el ecosistema.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
              Simetrika y VivaCore acompañan el desarrollo de Ingeniometrix desde
              una capa de respaldo estratégico.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {partnerLogos.map((partner) => (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[rgba(247,244,251,0.98)] px-5 py-6"
                key={partner.name}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.68)]">
                  Aliado estratégico
                </p>
                <div className="mt-5 flex min-h-28 items-center justify-center rounded-[24px] border border-[rgba(74,58,97,0.06)] bg-white/92 p-5">
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

        <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="brand-pill">Casos de uso</div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Situaciones representativas de personas que investigan.
              </h2>
            </div>
            <div className="max-w-xl space-y-2 text-sm leading-7 text-[var(--color-muted)]">
              <p>
                Cinco puntos de entrada frecuentes: temas amplios, evidencia
                dispersa y decisiones metodológicas que necesitan una primera capa
                de orden.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {useCaseCards.map((review) => (
              <article
                className="overflow-hidden rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,250,0.92))] shadow-[0_18px_36px_rgba(23,19,31,0.06)]"
                key={review.name}
              >
                <div className="relative h-48 overflow-hidden">
                  <Image
                    alt={review.name}
                    className="object-cover object-center"
                    fill
                    sizes="(min-width: 1024px) 28vw, 100vw"
                    src={review.imageSrc}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(23,19,31,0.1)_58%,rgba(23,19,31,0.26))]" />
                </div>
                <div className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.64)]">
                    Caso representativo
                  </p>
                  <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold leading-7 text-[var(--color-ink)]">
                    {review.focus}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                    {review.outcome}
                  </p>
                  <div className="mt-5 border-t border-[rgba(74,58,97,0.08)] pt-4">
                    <p className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {review.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{review.program}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start" id="faq">
          <article className="surface-panel rounded-[34px] p-6 sm:p-7">
            <p className="brand-kicker">Preguntas frecuentes</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Lo esencial para entender la propuesta.
            </h2>
            <div className="mt-6 space-y-4">
              {faqItems.map((item) => (
                <div
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-5"
                  key={item.question}
                >
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {item.question}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="overflow-hidden rounded-[34px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,rgba(23,12,42,0.96),rgba(42,16,77,0.94)_40%,rgba(79,41,127,0.9)_100%)] p-6 text-white shadow-[0_28px_64px_rgba(42,16,77,0.26)] sm:p-7">
            <div className="rounded-[28px] border border-white/12 bg-white/10 p-6">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="size-5" />
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold">
                Investigar con más claridad cambia todo el recorrido.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/74">
                Ingeniometrix articula una experiencia principal enfocada en ordenar,
                revisar y hacer más defendible el trabajo de investigación.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Una entrada más clara para organizar el proceso",
                  "Mejor relación entre evidencia, estructura y revisión",
                  "Servicios futuros alineados con asesoría y equipos",
                  "Una marca pensada para escalar sin perder enfoque",
                ].map((item) => (
                  <div className="flex items-start gap-3" key={item}>
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-white" />
                    <span className="text-sm leading-7 text-white/78">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-[36px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_38%,#4f297f_100%)] px-6 py-7 text-white shadow-[0_28px_64px_rgba(42,16,77,0.24)] sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                Cierre
              </p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold sm:text-4xl">
                Si el tema ya existe, el siguiente paso puede verse hoy mismo.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74 sm:text-base">
                El objetivo de esta primera experiencia no es prometer magia, sino
                darte una muestra clara y suficiente para decidir si vale la pena
                convertirla en un plan inicial más completo.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  href="/campana"
                >
                  Generar mi snapshot
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="mailto:hola@simetrika.pe"
                >
                  Hablar con el equipo
                </a>
              </div>
            </div>

            <div className="grid gap-3">
              {closingSignals.map((item) => (
                <div
                  className="rounded-[24px] border border-white/10 bg-white/10 px-5 py-4"
                  key={item}
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-white" />
                    <p className="text-sm leading-7 text-white/80">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="overflow-hidden rounded-[36px] border border-[rgba(52,20,95,0.16)] bg-[linear-gradient(160deg,rgba(23,12,42,0.96),rgba(42,16,77,0.94)_40%,rgba(79,41,127,0.9)_100%)] px-6 py-7 text-white shadow-[0_28px_64px_rgba(42,16,77,0.26)] sm:px-8"
          id="contacto"
        >
          <div className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
            <article className="rounded-[28px] border border-white/12 bg-white/10 p-6">
              <p className="brand-kicker text-white/64">Contacto</p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold">
                Hablemos sobre tu siguiente paso con IngenioIA.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/74">
                Si quieres conocer el producto, explorar una implementación para tu
                equipo o resolver dudas iniciales, este es el mejor punto de
                contacto.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Canal principal para consultas y acceso inicial",
                  "Respuesta orientativa para perfiles individuales y equipos",
                  "Base preparada para demostraciones y despliegues futuros",
                ].map((item) => (
                  <div className="flex items-start gap-3" key={item}>
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-white" />
                    <span className="text-sm leading-7 text-white/78">{item}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[28px] border border-white/12 bg-white/10 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {contactCards.map((card) => (
                  <div
                    className="rounded-[24px] border border-white/10 bg-white/8 p-5"
                    key={card.title}
                  >
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
                className="mt-5 rounded-[24px] border border-white/10 bg-white/8 p-5"
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
                      Agregar al newsletter
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

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/8 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/56">
                  Redes
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {socialCards.map((item) => (
                    <a
                      className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold text-white/88"
                      href="#"
                      key={item.label}
                    >
                      <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/12 text-white">
                        <item.icon className="size-4" />
                      </span>
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                  href="/campana"
                >
                  Generar mi snapshot
                  <ArrowRight className="ml-2 size-4" />
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                  href="mailto:hola@simetrika.pe"
                >
                  Escribir por correo
                </a>
              </div>
            </article>
          </div>
        </section>

        <footer className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Ingeniometrix
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                IngenioIA como punto de partida para investigar con más claridad,
                revisión y trazabilidad.
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[rgba(100,94,115,0.72)]">
                © 2026 Ingeniometrix. Todos los derechos reservados.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="brand-pill">ingeniometrix.com</span>
              <span className="brand-pill">IngenioIA</span>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#motores">
                Motores
              </a>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#contacto">
                Contacto
              </a>
              <Link className="brand-pill hover:text-[var(--color-plum)]" href="/recursos">
                Recursos
              </Link>
              <a className="brand-pill hover:text-[var(--color-plum)]" href="#servicios">
                Servicios
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
