import { Download, FileArchive, FileBadge2 } from "lucide-react";

type ExportPanelProps = {
  projectStatus: string;
  hasBlueprint: boolean;
  hasIntakeMinimum: boolean;
  selectedReferenceCount: number;
  latestBlueprintVersionNumber: number | null;
  latestBlueprintCreatedAt: string | null;
  latestBlueprintReferenceCount: number;
};

const exportFormats = [
  {
    title: "DOCX",
    description: "Plan editable para revision academica y siguientes iteraciones.",
    toneClassName: "brand-card-lilac",
    readyWhen: "Blueprint disponible",
  },
  {
    title: "BibTeX",
    description: "Salida bibliografica para flujos tecnicos y gestores de referencias.",
    toneClassName: "brand-card-gold",
    readyWhen: "Fuentes seleccionadas",
  },
  {
    title: "RIS",
    description: "Intercambio simple con gestores bibliograficos compatibles.",
    toneClassName: "brand-card-mint",
    readyWhen: "Fuentes seleccionadas",
  },
  {
    title: "evidence_log.json",
    description: "Registro trazable de fuentes, decisiones y supuestos del proceso.",
    toneClassName: "brand-card-blush",
    readyWhen: "Trazabilidad consolidada",
  },
];

export function ExportPanel({
  projectStatus,
  hasBlueprint,
  hasIntakeMinimum,
  selectedReferenceCount,
  latestBlueprintVersionNumber,
  latestBlueprintCreatedAt,
  latestBlueprintReferenceCount,
}: ExportPanelProps) {
  const exportReady = projectStatus === "EXPORT_READY";
  const canPrepare = hasBlueprint || exportReady;
  const readinessItems = [
    {
      label: "Base estructurada",
      complete: hasIntakeMinimum,
      description: "Tema, problema y poblacion ya dejan al proyecto en una base utilizable.",
    },
    {
      label: "Fuentes seleccionadas",
      complete: selectedReferenceCount > 0,
      description: `Actualmente hay ${selectedReferenceCount} fuentes marcadas dentro del proyecto.`,
    },
    {
      label: "Blueprint disponible",
      complete: hasBlueprint,
      description: hasBlueprint
        ? `Version ${latestBlueprintVersionNumber ?? "-"} generada${latestBlueprintCreatedAt ? ` el ${latestBlueprintCreatedAt}` : ""}.`
        : "Todavia no existe una version generada para preparar las salidas.",
    },
    {
      label: "Descarga conectada",
      complete: false,
      description: "La UI ya esta lista; el siguiente tramo conectara los archivos reales.",
    },
  ];

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

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {readinessItems.map((item) => (
            <div
              className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4"
              key={item.label}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-ink)]">{item.label}</p>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    item.complete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[rgba(74,58,97,0.12)] bg-[rgba(244,241,248,0.9)] text-[var(--color-muted)]"
                  }`}
                >
                  {item.complete ? "Listo" : "Pendiente"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            Fuentes elegidas
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {selectedReferenceCount}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Referencias seleccionadas para sostener el flujo de salida.
          </p>
        </article>

        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            Version activa
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {latestBlueprintVersionNumber ?? "-"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Ultimo blueprint listo para convertirse en salida documental.
          </p>
        </article>

        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            Trazabilidad visible
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {latestBlueprintReferenceCount}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Referencias usadas en la version mas reciente del blueprint.
          </p>
        </article>
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
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.48)]">
                  Se habilita cuando: {format.readyWhen}
                </p>
              </div>
              <div className="rounded-full bg-white/58 p-3">
                <FileBadge2 className="size-4 text-[var(--color-plum)]" />
              </div>
            </div>

            <div className="mt-4">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  canPrepare
                    ? "border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.86)] text-[#127b6f]"
                    : "border-[rgba(74,58,97,0.12)] bg-white/72 text-[var(--color-muted)]"
                }`}
              >
                {canPrepare ? "Preparado visualmente" : "Esperando blueprint"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
