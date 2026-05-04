import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FlaskConical,
  LayoutGrid,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { BrandBadge } from "@/components/brand/brand-badge";

type PreviewVariant = "editorial" | "premium" | "landing";
type ExtendedPreviewVariant =
  | "editorial"
  | "premium"
  | "landing"
  | "minimal"
  | "workbench"
  | "campaign";

const variantLinks: Array<{ href: string; label: string; value: ExtendedPreviewVariant }> = [
  { href: "/preview/editorial", label: "Editorial", value: "editorial" },
  { href: "/preview/premium", label: "Premium", value: "premium" },
  { href: "/preview/landing", label: "Landing", value: "landing" },
  { href: "/preview/minimal", label: "Minimal", value: "minimal" },
  { href: "/preview/workbench", label: "Workbench", value: "workbench" },
  { href: "/preview/campaign", label: "Campaign", value: "campaign" },
];

const serviceCards = [
  {
    title: "IngenioIA",
    description: "Entrada principal para estructurar y revisar investigacion.",
    icon: BookOpenCheck,
    status: "Disponible",
  },
  {
    title: "Ingenio Mentor",
    description: "Revision guiada y soporte a procesos de asesoria.",
    icon: ShieldCheck,
    status: "Proximamente",
  },
  {
    title: "Ingenio Lab",
    description: "Exploracion, iteracion y nuevas capas de investigacion.",
    icon: FlaskConical,
    status: "Proximamente",
  },
  {
    title: "Ingenio Studio",
    description: "Espacio de trabajo para consultoras y equipos.",
    icon: LayoutGrid,
    status: "Proximamente",
  },
];

const audiencePills = [
  "Estudiantes y tesistas",
  "Asesores y revisores",
  "Investigadores",
  "Consultoras y equipos",
];

function PreviewShell({
  variant,
  children,
}: {
  variant: ExtendedPreviewVariant;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.84)] px-4 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:px-5 sm:py-4">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,245,251,0.86)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)]"
              href="/preview"
            >
              Comparador
            </Link>
            {variantLinks.map((item) => (
              <Link
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  item.value === variant
                    ? "bg-[var(--color-plum)] text-white"
                    : "border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.86)] text-[var(--color-muted)]"
                }`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto mt-8 flex w-full max-w-[var(--page-max-width)] flex-col gap-8">
        {children}
      </section>
    </main>
  );
}

function MinimalPreview() {
  return (
    <PreviewShell variant="minimal">
      <section className="grid gap-6 lg:grid-cols-[0.28fr_0.72fr]">
        <aside className="surface-panel rounded-[34px] px-5 py-6 sm:px-6">
          <p className="brand-kicker">Minimal / revista</p>
          <div className="mt-5 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
                Lectura
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                La home se comporta como una portada minimal con mucho espacio negativo.
              </p>
            </div>
            <div className="rounded-[24px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(250,248,252,0.94)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
                Navegacion
              </p>
              <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                <div>01 Hero</div>
                <div>02 Texto</div>
                <div>03 Servicios</div>
                <div>04 Partners</div>
              </div>
            </div>
          </div>
        </aside>

        <section className="surface-panel rounded-[34px] px-6 py-8 sm:px-8 lg:px-10">
          <div className="border-b border-[rgba(74,58,97,0.08)] pb-8">
            <div className="brand-pill">
              <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
              Mas minimal / revista
            </div>
            <h1 className="mt-8 max-w-4xl font-[var(--font-heading)] text-5xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-6xl lg:text-[4.6rem] lg:leading-[1.02]">
              Una portada muy limpia, casi editorial impresa.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
              Esta variante reduce el ruido al minimo. Menos cajas, menos llamadas,
              mas espacio. Sirve si quieres una presencia sobria y muy enfocada en
              lectura, confianza y criterio.
            </p>
          </div>

          <div className="grid gap-8 pt-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                Manifiesto breve
              </p>
              <div className="mt-4 space-y-4">
                {[
                  "Menos promesa, mas posicionamiento.",
                  "Mas tipografia, menos decoracion.",
                  "Ideal para un producto que quiere verse serio desde el primer scroll.",
                ].map((item) => (
                  <p className="text-base leading-8 text-[var(--color-muted)]" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {serviceCards.slice(0, 3).map((service, index) => (
                <div
                  className="flex items-start justify-between gap-4 border-t border-[rgba(74,58,97,0.08)] pt-4 first:border-t-0 first:pt-0"
                  key={service.title}
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                      0{index + 1}
                    </p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                      {service.title}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                      {service.description}
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(100,94,115,0.62)]">
                    {service.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <p className="brand-kicker">Para quien funciona</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {audiencePills.map((item) => (
              <span className="brand-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </article>
        <article className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <p className="brand-kicker">Lectura</p>
          <p className="mt-4 text-base leading-8 text-[var(--color-muted)]">
            Muy distinta a las otras porque casi abandona la idea de dashboard o landing. Parece mas una publicacion de producto.
          </p>
        </article>
      </section>
    </PreviewShell>
  );
}

function WorkbenchPreview() {
  return (
    <PreviewShell variant="workbench">
      <section className="surface-panel overflow-hidden rounded-[40px] p-0">
        <div className="grid min-h-[42rem] lg:grid-cols-[18rem_1fr]">
          <aside className="border-b border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(247,243,250,0.98),rgba(243,248,247,0.9))] px-5 py-6 lg:border-b-0 lg:border-r">
            <div className="brand-pill">Mas portal / workbench</div>
            <div className="mt-6 rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/84 p-4">
              <p className="text-sm font-semibold text-[var(--color-ink)]">IngenioIA</p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Vista pensada casi como shell de producto publico.
              </p>
            </div>
            <nav className="mt-6 space-y-2">
              {["Overview", "Evidencia", "Mentor", "Lab", "Studio", "Partners"].map((item, index) => (
                <div
                  className={`rounded-[18px] px-4 py-3 text-sm font-semibold ${
                    index === 0
                      ? "bg-[var(--color-plum)] text-white"
                      : "border border-[rgba(74,58,97,0.08)] bg-white/86 text-[var(--color-muted)]"
                  }`}
                  key={item}
                >
                  {item}
                </div>
              ))}
            </nav>
          </aside>

          <div className="px-6 py-6 sm:px-8 lg:px-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
                  Dashboard-like public portal
                </p>
                <h1 className="mt-4 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
                  Una home que ya parece parte del producto.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-muted)]">
                  Esta direccion borra mucho la frontera entre web publica y app.
                  Sirve si quieres que el portal sea casi una before-login shell del
                  sistema.
                </p>
              </div>
              <a className="brand-button-primary px-5 py-3 text-sm font-semibold" href="#workbench-stack">
                Evaluar este layout
              </a>
            </div>

            <div className="mt-8 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,242,250,0.92))] p-5 shadow-[0_18px_38px_rgba(23,19,31,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">Workspace preview</p>
                  <span className="rounded-full bg-[rgba(244,241,248,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Live shell
                  </span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Temas", value: "12" },
                    { label: "Fuentes", value: "48" },
                    { label: "Checks", value: "9" },
                  ].map((item) => (
                    <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4" key={item.label}>
                      <p className="text-xs uppercase tracking-[0.16em] text-[rgba(100,94,115,0.62)]">
                        {item.label}
                      </p>
                      <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">IngenioIA main canvas</p>
                    <div className="mt-4 h-40 rounded-[20px] bg-[linear-gradient(135deg,rgba(219,193,255,0.34),rgba(157,231,214,0.18),rgba(255,255,255,0.72))]" />
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4">
                      <p className="text-sm font-semibold text-[var(--color-ink)]">Mentor</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">Modulo proximo.</p>
                    </div>
                    <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4">
                      <p className="text-sm font-semibold text-[var(--color-ink)]">Lab</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">Exploracion y variaciones.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4" id="workbench-stack">
                <article className="surface-panel rounded-[30px] p-5">
                  <p className="brand-kicker">Por que se siente radical</p>
                  <div className="mt-4 space-y-3">
                    {[
                      "Casi no parece marketing",
                      "La home ya se siente como software",
                      "Ideal si el portal debe ser extension del producto",
                    ].map((item) => (
                      <div className="flex items-start gap-3" key={item}>
                        <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                        <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="surface-panel rounded-[30px] p-5">
                  <p className="brand-kicker">Modulos</p>
                  <div className="mt-4 space-y-3">
                    {serviceCards.map((service) => (
                      <div
                        className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white/86 px-4 py-3 text-sm font-semibold text-[var(--color-ink)]"
                        key={service.title}
                      >
                        {service.title}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PreviewShell>
  );
}

function CampaignPreview() {
  return (
    <PreviewShell variant="campaign">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[40px] border border-[rgba(74,58,97,0.1)] bg-[linear-gradient(155deg,rgba(255,255,255,0.96),rgba(255,228,214,0.94)_38%,rgba(222,241,236,0.92)_100%)] px-6 py-8 shadow-[0_28px_60px_rgba(23,19,31,0.08)] sm:px-8 lg:px-10 lg:py-12">
            <div className="brand-pill">
              <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
              Mas bold / campaign
            </div>
            <h1 className="mt-8 max-w-3xl font-[var(--font-heading)] text-5xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-6xl lg:text-[4.4rem] lg:leading-[0.98]">
              Una home de marca, collage y energia visual.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">
              Esta variante usa bloques mas expresivos, asimetrias y una composicion
              tipo campaña. Se siente mucho mas de brand launch que de portal
              sobrio o app shell.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a className="brand-button-primary px-6 py-3 text-sm font-semibold" href="#campaign-grid">
                Explorar esta direccion
                <ArrowRight className="ml-2 size-4" />
              </a>
              <Link className="brand-button-secondary px-6 py-3 text-sm font-semibold" href="/preview">
                Volver al comparador
              </Link>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2" id="campaign-grid">
            <article className="surface-panel rounded-[34px] bg-[linear-gradient(135deg,rgba(219,193,255,0.38),rgba(255,255,255,0.9))] p-6">
              <p className="brand-kicker">Story block</p>
              <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Mucho mas ritmo y collage.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                Alterna bloques fuertes y bloques de respiro para que el scroll se sienta mas narrativo.
              </p>
            </article>
            <article className="surface-panel rounded-[34px] bg-[linear-gradient(135deg,rgba(255,236,225,0.94),rgba(255,255,255,0.9))] p-6">
              <p className="brand-kicker">Promo block</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[0_14px_28px_rgba(23,19,31,0.05)]">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">IngenioIA</p>
                </div>
                <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[0_14px_28px_rgba(23,19,31,0.05)]">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">Acceso rapido</p>
                </div>
              </div>
            </article>
          </section>
        </div>

        <aside className="grid gap-4">
          <article className="surface-panel rounded-[34px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,242,250,0.92))] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
              Hero collage
            </p>
            <div className="mt-5 grid gap-3">
              <div className="h-24 rounded-[22px] bg-[linear-gradient(135deg,rgba(255,111,97,0.18),rgba(255,255,255,0.7),rgba(24,169,153,0.16))]" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-28 rounded-[22px] bg-[rgba(255,255,255,0.88)] shadow-[0_16px_30px_rgba(23,19,31,0.05)]" />
                <div className="h-28 rounded-[22px] bg-[rgba(255,255,255,0.88)] shadow-[0_16px_30px_rgba(23,19,31,0.05)]" />
              </div>
            </div>
          </article>
          <article className="surface-panel rounded-[34px] p-6">
            <p className="brand-kicker">Sensacion</p>
            <div className="mt-4 space-y-3">
              {[
                "Mas expresiva",
                "Mas de marca",
                "Menos neutral",
                "Mas memorable",
              ].map((item) => (
                <div
                  className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white/86 px-4 py-3 text-sm font-semibold text-[var(--color-ink)]"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-4">
        {serviceCards.map((service) => {
          const Icon = service.icon;

          return (
            <article
              className="surface-panel rounded-[32px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,245,239,0.88))] p-6"
              key={service.title}
            >
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[rgba(255,240,233,0.9)]">
                <Icon className="size-5 text-[var(--color-ink)]" />
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {service.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{service.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(100,94,115,0.62)]">
                {service.status}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <p className="brand-kicker">Publico</p>
          <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            Mejor si quieres una home mas memorable y de lanzamiento.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
            Es la mas radical a nivel de personalidad visual. Muy util si la marca
            necesita impacto, menos util si la home debe verse sobria y metodica.
          </p>
        </article>
        <article className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
          <p className="brand-kicker">Partners y audiencia</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {["Simetrika", "VivaCore", ...audiencePills].map((item) => (
              <span className="brand-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </article>
      </section>
    </PreviewShell>
  );
}

function EditorialPreview() {
  return (
    <PreviewShell variant="editorial">
      <section className="surface-panel rounded-[40px] px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="brand-pill">
              <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
              Mas sobrio / editorial
            </div>
            <h1 className="mt-8 max-w-3xl font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl lg:text-6xl">
              Mas aire, mas lectura, menos sensacion de landing.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              Esta direccion hace que Ingeniometrix se sienta como una herramienta
              de investigacion clara y confiable. La tipografia domina, los bloques
              respiran mas y el hero funciona casi como una portada editorial.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a className="brand-button-primary px-6 py-3 text-sm font-semibold" href="#editorial-servicios">
                Elegir esta direccion
                <ArrowRight className="ml-2 size-4" />
              </a>
              <Link className="brand-button-secondary px-6 py-3 text-sm font-semibold" href="/preview">
                Volver al comparador
              </Link>
            </div>
          </div>

          <aside className="rounded-[34px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,242,250,0.92))] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.62)]">
              Lectura visual
            </p>
            <div className="mt-5 space-y-5">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5 shadow-[0_12px_28px_rgba(23,19,31,0.05)]">
                <p className="text-sm font-semibold text-[var(--color-ink)]">Mesa de trabajo clara</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Mucho fondo limpio, contraste suave y menos modulos competitivos.
                </p>
              </div>
              <div className="rounded-[24px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(250,248,252,0.92)] p-5">
                <p className="text-sm font-semibold text-[var(--color-ink)]">Placeholder editorial</p>
                <div className="mt-4 h-16 rounded-[18px] bg-[rgba(244,241,248,0.9)]" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="h-20 rounded-[18px] bg-white/92" />
                  <div className="h-20 rounded-[18px] bg-white/92" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="surface-panel rounded-[34px] p-6 sm:p-7">
          <p className="brand-kicker">Por que se siente distinto</p>
          <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            Aqui el contenido manda antes que la promocion.
          </h2>
          <div className="mt-6 grid gap-4">
            {[
              "Hero mas tipografico y menos performatico",
              "Bloques mas largos y con mas aire vertical",
              "Ritmo parecido a una portada o articulo de producto",
            ].map((item) => (
              <div
                className="flex items-start gap-3 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/84 px-4 py-4"
                key={item}
              >
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-mint-strong)]" />
                <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="surface-panel rounded-[34px] p-6 sm:p-7" id="editorial-servicios">
          <p className="brand-kicker">Servicios</p>
          <div className="mt-5 space-y-4">
            {serviceCards.map((service) => {
              const Icon = service.icon;

              return (
                <div
                  className="flex gap-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-5"
                  key={service.title}
                >
                  <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
                    <Icon className="size-5 text-[var(--color-ink)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                        {service.title}
                      </h3>
                      <span className="rounded-full bg-[rgba(244,241,248,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {service.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                      {service.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="brand-pill">Publico</div>
            <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              El tono se acerca mas a investigacion y lectura.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
            Se percibe mejor para estudiantes, asesores e investigadores que valoran
            claridad, criterio y una interfaz menos comercial.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          {audiencePills.map((item) => (
            <span className="brand-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      </section>
    </PreviewShell>
  );
}

function PremiumPreview() {
  return (
    <PreviewShell variant="premium">
      <section className="overflow-hidden rounded-[40px] border border-[rgba(52,20,95,0.18)] bg-[linear-gradient(160deg,#170c2a_0%,#2a104d_36%,#4f297f_100%)] px-6 py-8 text-white shadow-[0_32px_80px_rgba(42,16,77,0.34)] sm:px-8 lg:px-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/78">
              <span className="inline-flex size-2 rounded-full bg-white" />
              Mas premium / tecnologico
            </div>
            <h1 className="mt-8 max-w-3xl font-[var(--font-heading)] text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Mas contraste, mas sistema, mas presencia de producto.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/76 sm:text-lg">
              Esta version se mueve hacia una percepcion de software premium. El hero
              domina, las capas brillan mas y el producto se siente mas ambicioso y
              tecnologico sin irse a una estetica sci-fi.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--color-plum)] shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                href="#premium-stack"
              >
                Elegir esta direccion
                <ArrowRight className="ml-2 size-4" />
              </a>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/10 px-6 py-3 text-sm font-semibold text-white"
                href="/preview"
              >
                Volver al comparador
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="hero-card-float rounded-[30px] border border-white/12 bg-white/10 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-white/52">System preview</p>
              <div className="mt-5 grid gap-3">
                <div className="h-24 rounded-[22px] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))]" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="h-24 rounded-[22px] border border-white/12 bg-white/8" />
                  <div className="h-24 rounded-[22px] border border-white/12 bg-white/8" />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Signal", value: "High" },
                { label: "Depth", value: "Layered" },
                { label: "Feel", value: "Premium" },
              ].map((item) => (
                <div
                  className="hero-card-float-delay rounded-[24px] border border-white/12 bg-white/10 p-4"
                  key={item.label}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-white/48">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-4" id="premium-stack">
        {[
          {
            title: "Hero fuerte",
            description: "La marca entra con mas contraste y mas autoridad visual.",
            icon: Sparkles,
          },
          {
            title: "Capas de producto",
            description: "Mas paneles, mas profundidad y una sensacion clara de sistema.",
            icon: LayoutGrid,
          },
          {
            title: "Tension visual",
            description: "Menos aire editorial, mas energia y presencia premium.",
            icon: SearchCheck,
          },
          {
            title: "Escala futura",
            description: "Se presta mejor para dashboards, modulos y presentacion institucional.",
            icon: FileCheck2,
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <article className="surface-panel rounded-[32px] bg-white/88 p-6" key={item.title}>
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[rgba(244,241,248,0.92)]">
                <Icon className="size-5 text-[var(--color-ink)]" />
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{item.description}</p>
            </article>
          );
        })}
      </section>

      <section className="surface-panel rounded-[36px] px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="brand-pill">Servicios</div>
            <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              El ecosistema se presenta como una suite.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
            Aqui los servicios se sienten como modulos de una plataforma premium, no como una simple lista de features.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {serviceCards.map((service) => {
            const Icon = service.icon;

            return (
              <article
                className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,250,0.9))] p-5 shadow-[0_18px_36px_rgba(23,19,31,0.06)]"
                key={service.title}
              >
                <div className="inline-flex size-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(219,193,255,0.46),rgba(157,231,214,0.34))]">
                  <Icon className="size-5 text-[var(--color-ink)]" />
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

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="surface-panel rounded-[34px] p-6 sm:p-7">
          <p className="brand-kicker">Publico</p>
          <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            Mejor si quieres que Ingeniometrix se sienta mas software.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
            Esta ruta ayuda si el objetivo es que la marca se perciba mas fuerte frente a partners, consultoras y cuentas institucionales.
          </p>
        </article>

        <article className="surface-panel rounded-[34px] p-6 sm:p-7">
          <p className="brand-kicker">Partners</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {["Simetrika", "VivaCore"].map((item) => (
              <div
                className="rounded-[24px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(247,244,251,0.98)] px-5 py-6"
                key={item}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[rgba(100,94,115,0.68)]">
                  Placeholder
                </p>
                <h3 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                  {item}
                </h3>
              </div>
            ))}
          </div>
        </article>
      </section>
    </PreviewShell>
  );
}

function LandingPreview() {
  return (
    <PreviewShell variant="landing">
      <section className="surface-panel overflow-hidden rounded-[40px] border-[rgba(74,58,97,0.1)] bg-[linear-gradient(180deg,rgba(255,250,244,0.98),rgba(255,241,230,0.92)_58%,rgba(244,240,251,0.94))] px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="brand-pill">
              <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
              Mas comercial / landing
            </div>
            <h1 className="mt-8 max-w-3xl font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl lg:text-6xl">
              Mas CTA, mas promesa y mas ritmo de conversion.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              Esta variante usa el mismo producto base, pero lo envuelve en una
              narrativa mas comercial. El home se acerca a una landing pensada para
              captar interes rapido y mover a registro o solicitud de acceso.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a className="brand-button-primary px-6 py-3 text-sm font-semibold" href="#landing-cta">
                Solicitar acceso
                <ArrowRight className="ml-2 size-4" />
              </a>
              <a className="brand-button-secondary px-6 py-3 text-sm font-semibold" href="#landing-proximamente">
                Ver servicios
              </a>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Friccion", value: "Menos" },
                { label: "Claridad", value: "Mas" },
                { label: "Accion", value: "Rapida" },
              ].map((item) => (
                <div
                  className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/82 px-4 py-4 text-center shadow-[0_16px_30px_rgba(23,19,31,0.05)]"
                  key={item.label}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    {item.label}
                  </p>
                  <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-6 shadow-[0_22px_42px_rgba(23,19,31,0.08)]">
              <p className="text-xs uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
                Hero promo
              </p>
              <div className="mt-5 grid gap-3">
                <div className="h-4 rounded-full bg-[rgba(52,20,95,0.12)]" />
                <div className="h-4 w-5/6 rounded-full bg-[rgba(255,111,97,0.18)]" />
                <div className="h-4 w-3/4 rounded-full bg-[rgba(24,169,153,0.16)]" />
              </div>
              <div className="mt-5 flex gap-2">
                <span className="rounded-full bg-[rgba(52,20,95,0.1)] px-3 py-2 text-xs font-semibold text-[var(--color-plum)]">
                  IngenioIA
                </span>
                <span className="rounded-full bg-[rgba(255,111,97,0.12)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)]">
                  CTA principal
                </span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="hero-card-float rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
                <p className="text-sm font-semibold text-[var(--color-ink)]">Beneficio 1</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Texto corto, directo y enfocado en conversion.
                </p>
              </div>
              <div className="hero-card-float-delay rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
                <p className="text-sm font-semibold text-[var(--color-ink)]">Beneficio 2</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Mas modular, mas marketing y mas llamada a la accion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {[
          {
            title: "Problema",
            description: "Investigar bien sigue consumiendo tiempo, energia y demasiadas iteraciones.",
            icon: SearchCheck,
          },
          {
            title: "Solucion",
            description: "IngenioIA ordena, valida y acelera procesos con evidencia y criterio.",
            icon: ClipboardList,
          },
          {
            title: "Accion",
            description: "La estructura del home empuja rapido hacia demo, acceso o registro.",
            icon: Sparkles,
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <article className="surface-panel rounded-[32px] bg-white/9 p-6" key={item.title}>
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.62)]">
                <Icon className="size-5 text-[var(--color-ink)]" />
              </div>
              <h2 className="mt-5 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{item.description}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]" id="landing-proximamente">
        <article className="surface-panel rounded-[34px] p-6 sm:p-7">
          <p className="brand-kicker">Lo que viene</p>
          <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            Aqui los modulos futuros se sienten como oferta en expansion.
          </h2>
          <div className="mt-6 grid gap-4">
            {serviceCards.map((service) => {
              const Icon = service.icon;

              return (
                <div
                  className="flex gap-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-5"
                  key={service.title}
                >
                  <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,240,233,0.9)]">
                    <Icon className="size-5 text-[var(--color-ink)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                        {service.title}
                      </h3>
                      <span className="rounded-full bg-[rgba(255,247,243,0.96)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {service.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                      {service.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="surface-panel rounded-[34px] p-6 sm:p-7" id="landing-cta">
          <p className="brand-kicker">Conversion</p>
          <div className="rounded-[30px] border border-[rgba(74,58,97,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,245,237,0.92))] p-6">
            <h2 className="font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Esta version vende mejor, pero se siente menos portal.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Si la home principal va a capturar trafico y convertir, esta direccion
              tiene mas sentido. Si debe ser puerta de entrada sobria al producto,
              probablemente convenga menos.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "CTA mas visibles",
                "Promesa mas directa",
                "Mas estructura de beneficios y prueba social",
              ].map((item) => (
                <div className="flex items-start gap-3" key={item}>
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[var(--color-coral)]" />
                  <span className="text-sm leading-7 text-[var(--color-muted)]">{item}</span>
                </div>
              ))}
            </div>
            <a className="brand-button-primary mt-6 px-5 py-3 text-sm font-semibold" href="#top">
              Me interesa esta direccion
            </a>
          </div>
        </article>
      </section>

      <section className="surface-panel rounded-[34px] px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="brand-pill">Publico</div>
            <h2 className="mt-5 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              Mejor si quieres usar la home como acquisition page.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--color-muted)]">
            Se siente mas cercana a una landing y menos a un portal de trabajo. Buena para captar, menos buena para verse neutral y editorial.
          </p>
        </div>
      </section>
    </PreviewShell>
  );
}

export function PortalStylePreview({ variant }: { variant: ExtendedPreviewVariant }) {
  if (variant === "minimal") {
    return <MinimalPreview />;
  }

  if (variant === "workbench") {
    return <WorkbenchPreview />;
  }

  if (variant === "campaign") {
    return <CampaignPreview />;
  }

  if (variant === "premium") {
    return <PremiumPreview />;
  }

  if (variant === "landing") {
    return <LandingPreview />;
  }

  return <EditorialPreview />;
}
