import { Download, FileArchive, FileBadge2 } from "lucide-react";

import type { SupportedLanguage } from "@/lib/language";
import { getProjectUiCopy } from "@/lib/project-ui-copy";

type ExportPanelProps = {
  projectId: string;
  projectStatus: string;
  hasBlueprint: boolean;
  hasIntakeMinimum: boolean;
  selectedReferenceCount: number;
  latestBlueprintId: string | null;
  latestBlueprintVersionNumber: number | null;
  latestBlueprintCreatedAt: string | null;
  latestBlueprintReferenceCount: number;
  language: SupportedLanguage;
};

export function ExportPanel({
  projectId,
  projectStatus,
  hasBlueprint,
  hasIntakeMinimum,
  selectedReferenceCount,
  latestBlueprintId,
  latestBlueprintVersionNumber,
  latestBlueprintCreatedAt,
  latestBlueprintReferenceCount,
  language,
}: ExportPanelProps) {
  const copy = getProjectUiCopy(language).export;
  const exportReady = projectStatus === "EXPORT_READY";
  const canPrepare = hasBlueprint || exportReady;
  const baseExportUrl =
    latestBlueprintId && canPrepare
      ? `/api/projects/${projectId}/blueprints/${latestBlueprintId}`
      : null;
  const exportDownloadUrls = {
    docx: baseExportUrl ? `${baseExportUrl}/docx` : null,
    pdf: baseExportUrl ? `${baseExportUrl}/pdf` : null,
    bibtex: baseExportUrl ? `${baseExportUrl}/bibtex` : null,
    ris: baseExportUrl ? `${baseExportUrl}/ris` : null,
    evidence: baseExportUrl ? `${baseExportUrl}/evidence-log` : null,
  };
  const secondaryFormats = [
    {
      formatKey: "bibtex" as const,
      title: copy.formats.bibtex[0],
      description: copy.formats.bibtex[1],
    },
    {
      formatKey: "ris" as const,
      title: copy.formats.ris[0],
      description: copy.formats.ris[1],
    },
    {
      formatKey: "evidence" as const,
      title: copy.formats.evidence[0],
      description: copy.formats.evidence[1],
    },
  ];
  const blueprintReadiness = hasBlueprint
    ? copy.readiness.blueprintReady(latestBlueprintVersionNumber, latestBlueprintCreatedAt)
    : copy.readiness.blueprintMissing;
  const readinessItems = [
    {
      label: copy.readiness.intake[0],
      complete: hasIntakeMinimum,
      description: copy.readiness.intake[1],
    },
    {
      label: copy.readiness.sources(selectedReferenceCount)[0],
      complete: selectedReferenceCount > 0,
      description: copy.readiness.sources(selectedReferenceCount)[1],
    },
    {
      label: blueprintReadiness[0],
      complete: hasBlueprint,
      description: blueprintReadiness[1],
    },
  ];

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8" id="exportacion">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <FileArchive className="size-3.5 text-[var(--color-coral)]" />
            {copy.kicker}
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {exportDownloadUrls.docx ? (
            <a
              className="brand-button-primary px-6 py-3 text-sm font-semibold"
              href={exportDownloadUrls.docx}
            >
              <Download className="mr-2 inline size-4" />
              {copy.downloadDocx}
            </a>
          ) : (
            <button
              className="brand-button-primary px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              type="button"
            >
              <Download className="mr-2 size-4" />
              {copy.downloadDocx}
            </button>
          )}
          {exportDownloadUrls.pdf ? (
            <a
              className="brand-button-secondary px-6 py-3 text-sm font-semibold"
              href={exportDownloadUrls.pdf}
              title="PDF listo para ver y compartir"
            >
              <Download className="mr-2 inline size-4" />
              Descargar PDF
            </a>
          ) : (
            <button
              className="brand-button-secondary px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              type="button"
            >
              <Download className="mr-2 inline size-4" />
              Descargar PDF
            </button>
          )}
        </div>
      </div>

      <div
        className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
          canPrepare
            ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
            : "border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.72)] text-[var(--color-ink)]"
        }`}
      >
        {canPrepare ? copy.ready : copy.notReady}
      </div>

      <details className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          Mas formatos
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {secondaryFormats.map((format) => {
            const downloadUrl = exportDownloadUrls[format.formatKey];

            return (
              <article className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4" key={format.formatKey}>
                <FileBadge2 className="size-5 text-[var(--color-plum)]" />
                <h3 className="mt-3 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {format.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {format.description}
                </p>
                <div className="mt-4">
                  {downloadUrl ? (
                    <a className="brand-button-secondary px-4 py-2 text-xs font-semibold" href={downloadUrl}>
                      Descargar
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--color-muted)]">
                      Disponible cuando el plan este listo
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </details>

      <details className="mt-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {copy.status}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {readinessItems.map((item) => (
            <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4" key={item.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-ink)]">{item.label}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {item.complete ? copy.complete : copy.pending}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{item.description}</p>
            </div>
          ))}
        </div>
        {hasBlueprint ? (
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Evidencia vinculada a esta version: {latestBlueprintReferenceCount} referencia(s).
          </p>
        ) : null}
      </details>
    </section>
  );
}
