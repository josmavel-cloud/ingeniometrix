import Link from "next/link";

const previews = [
  {
    href: "/preview/editorial",
    title: "Mas sobrio / editorial",
    description:
      "Mas aire, mas lectura, mas sensacion de herramienta editorial y de investigacion.",
  },
  {
    href: "/preview/premium",
    title: "Mas premium / tecnologico",
    description:
      "Mas contraste, mas tension visual y una presencia de producto mas fuerte.",
  },
  {
    href: "/preview/landing",
    title: "Mas comercial / landing",
    description:
      "Mas CTA, mas narrativa de valor y mas estructura de adquisicion.",
  },
  {
    href: "/preview/minimal",
    title: "Mas minimal / revista",
    description:
      "Mucho espacio negativo, menos cajas y una presencia casi editorial impresa.",
  },
  {
    href: "/preview/workbench",
    title: "Mas portal / workbench",
    description:
      "La home se acerca a una shell de producto con sidebar, modulos y sensacion de app.",
  },
  {
    href: "/preview/campaign",
    title: "Mas bold / campaign",
    description:
      "Composicion de lanzamiento, collage de marca y bloques mas expresivos.",
  },
];

export default function PreviewIndexPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="surface-panel rounded-[38px] px-6 py-8 sm:px-8 lg:px-10">
          <p className="brand-pill">Comparador de estilo</p>
          <h1 className="mt-6 font-[var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            Seis rutas para comparar el portal publico.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
            Las primeras tres cambian el tono. Las nuevas tres cambian tambien el layout de forma mas radical para que la comparacion se note de inmediato.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previews.map((item) => (
            <article className="surface-panel rounded-[32px] p-6" key={item.href}>
              <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {item.description}
              </p>
              <Link className="brand-button-primary mt-6 px-5 py-3 text-sm font-semibold" href={item.href}>
                Abrir preview
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
