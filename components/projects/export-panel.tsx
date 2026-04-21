import { Download, FileArchive, FileBadge2 } from "lucide-react";

type ExportPanelProps = {
  projectStatus: string;
  hasBlueprint: boolean;
};

const exportFormats = [
  {
    title: "DOCX",
    description: "Plan editable para revision academica y siguientes iteraciones.",
    toneClassName: "brand-card-lilac",
  },
  {
    title: "BibTeX",
    description: "Salida bibliografica para flujos tecnicos y gestores de referencias.",
    toneClassName: "brand-card-gold",
  },
  {
    title: "RIS",
    description: "Intercambio simple con gestores bibliograficos compatibles.",
    toneClassName: "brand-card-mint",
  },
  {
    title: "evidence_log.json",
    description: "Registro trazable de fuentes, decisiones y supuestos del proceso.",
    toneClassName: "brand-card-blush",
  },
];

export function ExportPanel({ projectStatus, hasBlueprint }: ExportPanelProps) {
  const exportReady = projectStatus === "EXPORT_READY";
  const canPrepare = hasBlueprint || exportReady;

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8" id="exportacion">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <FileArchive className="size-3.5 text-[var(--color-coral)]" />
            Exportacion
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            Prepara las salidas finales del MVP.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Esta etapa ya queda representada en la UI para que el flujo completo se
            entienda desde ahora. La conexion funcional de descargas puede llegar en
            el siguiente tramo sin cambiar la estructura visual.
          </p>
        </div>

        <button
          className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled
          type="button"
        >
          <Download className="mr-2 size-4" />
          Proximamente
        </button>
      </div>

      <div className="mt-6 rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.7)] p-5">
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          Estado de la etapa
        </p>
        <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
          {canPrepare
            ? "La base para exportar ya existe porque el proyecto tiene blueprint o llego a estado final. Falta conectar la descarga real."
            : "Primero necesitamos un blueprint revisable. Luego activamos las salidas finales sin cambiar la navegacion."}
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {exportFormats.map((format) => (
          <article className={`rounded-[28px] p-5 ${format.toneClassName}`} key={format.title}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {format.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {format.description}
                </p>
              </div>
              <div className="rounded-full bg-white/58 p-3">
                <FileBadge2 className="size-4 text-[var(--color-plum)]" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
