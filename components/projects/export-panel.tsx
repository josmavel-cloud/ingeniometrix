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
    bibtex: baseExportUrl ? `${baseExportUrl}/bibtex` : null,
    ris: baseExportUrl ? `${baseExportUrl}/ris` : null,
    evidence: baseExportUrl ? `${baseExportUrl}/evidence-log` : null,
  };
  const exportFormats = [
    {
      formatKey: "docx",
      title: copy.formats.docx[0],
      description: copy.formats.docx[1],
      toneClassName: "brand-card-lilac",
      readyWhen: copy.formats.docx[2],
    },
    {
      formatKey: "bibtex",
      title: copy.formats.bibtex[0],
      description: copy.formats.bibtex[1],
      toneClassName: "brand-card-gold",
      readyWhen: copy.formats.bibtex[2],
    },
    {
      formatKey: "ris",
      title: copy.formats.ris[0],
      description: copy.formats.ris[1],
      toneClassName: "brand-card-mint",
      readyWhen: copy.formats.ris[2],
    },
    {
      formatKey: "evidence",
      title: copy.formats.evidence[0],
      description: copy.formats.evidence[1],
      toneClassName: "brand-card-blush",
      readyWhen: copy.formats.evidence[2],
    },
  ];
  const blueprintReadiness = hasBlueprint
    ? copy.readiness.blueprintReady(latestBlueprintVersionNumber, latestBlueprintCreatedAt)
    : copy.readiness.blueprintMissing;
  const downloadsReadiness = Object.values(exportDownloadUrls).every(Boolean)
    ? copy.readiness.downloadsReady
    : copy.readiness.downloadsMissing;
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
    {
      label: downloadsReadiness[0],
      complete: Object.values(exportDownloadUrls).every(Boolean),
      description: downloadsReadiness[1],
    },
  ];

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8" id="exportacion">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <FileArchive className="size-3.5 text-[var(--color-coral)]" />
            {copy.kicker}
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {copy.body}
          </p>
        </div>

        {exportDownloadUrls.docx ? (
          <a
            className="brand-button-secondary px-5 py-3 text-sm font-semibold"
            href={exportDownloadUrls.docx}
          >
            <Download className="mr-2 inline size-4" />
            {copy.downloadDocx}
          </a>
        ) : (
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            disabled
            type="button"
          >
            <Download className="mr-2 size-4" />
            {copy.soon}
          </button>
        )}
      </div>

      <div
        className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
          canPrepare
            ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
            : "border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.72)] text-[var(--color-ink)]"
        }`}
      >
        {canPrepare
          ? copy.ready
          : copy.notReady}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            {copy.selectedSources}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {selectedReferenceCount}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {copy.selectedSourcesBody}
          </p>
        </article>

        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            {copy.activeVersion}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {latestBlueprintVersionNumber ?? "-"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {copy.activeVersionBody}
          </p>
        </article>

        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
            {copy.traceability}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
            {latestBlueprintReferenceCount}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {copy.traceabilityBody}
          </p>
        </article>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {exportFormats.map((format) => {
          const downloadUrl =
            exportDownloadUrls[format.formatKey as keyof typeof exportDownloadUrls];

          return (
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
                  {copy.enabledWhen}: {format.readyWhen}
                </p>
              </div>
              <div className="rounded-full bg-white/58 p-3">
                <FileBadge2 className="size-4 text-[var(--color-plum)]" />
              </div>
            </div>

            <div className="mt-4">
              {downloadUrl ? (
                <a
                  className="inline-flex rounded-full border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.86)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#127b6f]"
                  href={downloadUrl}
                >
                  {getProjectUiCopy(language).action.downloadNow}
                </a>
              ) : (
                <span className="inline-flex rounded-full border border-[rgba(74,58,97,0.12)] bg-white/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {copy.waiting}
                </span>
              )}
            </div>
          </article>
          );
        })}
      </div>

      <details className="mt-6 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {copy.status}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
                  {item.complete ? copy.complete : copy.pending}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
