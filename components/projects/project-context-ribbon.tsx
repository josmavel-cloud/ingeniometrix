import type { DegreeLevel } from "@prisma/client";

type ProjectContextRibbonProps = {
  universityLabel: string;
  degreeLevel: DegreeLevel;
  program: string;
  templateKey: string;
  topicLabel: string;
};

function getDegreeLevelLabel(degreeLevel: DegreeLevel) {
  return degreeLevel === "MAESTRIA" ? "Maestria" : "Posgrado";
}

export function ProjectContextRibbon({
  universityLabel,
  degreeLevel,
  program,
  templateKey,
  topicLabel,
}: ProjectContextRibbonProps) {
  const items = [
    {
      label: "Universidad",
      value: universityLabel,
    },
    {
      label: "Nivel",
      value: getDegreeLevelLabel(degreeLevel),
    },
    {
      label: "Programa",
      value: program,
    },
    {
      label: "Plantilla",
      value: templateKey,
    },
    {
      label: "Base elegida",
      value: topicLabel,
    },
  ];

  return (
    <section className="surface-panel rounded-[30px] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="brand-kicker">Contexto activo</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Todo lo importante del proyecto, visible desde el inicio.
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
            Este contexto define la base del MVP y sostiene las siguientes
            sugerencias dentro del workspace.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <article
            className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/76 p-4"
            key={item.label}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
              {item.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
              {item.value}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
