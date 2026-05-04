"use client";

import { useMemo, useState, useTransition } from "react";

import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type {
  BlueprintLaunchContentMaterializationResult,
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSignalExtractionResult,
  EvidencePackArtifact,
  ExtractedEvidencePack,
  PdfAssetRecord,
} from "@/blueprint_launch/server/local-playground-store";
import type { BlueprintLaunchProjectGlobalContext } from "@/blueprint_launch/server/step1-intake-context";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

type BlueprintLaunchStep5LabProps = {
  initialBundle: BlueprintLaunchSelectedSourceBundle | null;
  initialContentMaterialization: BlueprintLaunchContentMaterializationResult | null;
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialEvidencePacksArtifact: EvidencePackArtifact | null;
  initialEvidencePlanning: BlueprintLaunchEvidencePlanningResult | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSourceSignalExtraction: BlueprintLaunchSignalExtractionResult | null;
  initialTokenUsage: LlmUsageRegistry;
};

function formatMoney(value: number, currency: "USD" | "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function getTodayTorontoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatStableTimestamp(value: string | null | undefined) {
  if (!value) {
    return "null";
  }

  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-CA").format(value ?? 0);
}

function joinOrEmpty(values: string[] | undefined) {
  return values && values.length > 0 ? values.join(" | ") : "Sin elementos.";
}

function findPack(packs: EvidencePackArtifact | null, sourceId: string) {
  return packs?.packs.find((pack) => pack.source_id === sourceId) ?? null;
}

function getSnippetPreview(pack: ExtractedEvidencePack | null) {
  return pack?.snippets.slice(0, 10) ?? [];
}

function getAssetPreview(pack: ExtractedEvidencePack | null) {
  return pack?.assets.slice(0, 6) ?? [];
}

function buildAssetPreviewUrl(filePath: string | null | undefined) {
  return filePath ? `/api/blueprint-launch/assets?path=${encodeURIComponent(filePath)}` : null;
}

function statusClasses(value: string | boolean | undefined) {
  if (value === "llm" || value === "hybrid" || value === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "fallback" || value === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function cleanLatexText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\$\$/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\mathrm\{([^{}]+)\}/g, "$1")
    .replace(/\\text\{([^{}]+)\}/g, "$1")
    .replace(/\\operatorname\{([^{}]+)\}/g, "$1")
    .replace(/\\times/g, " x ")
    .replace(/\\cdot/g, " . ")
    .replace(/\\lambda/g, "lambda")
    .replace(/\\max/g, "max")
    .replace(/\\min/g, "min")
    .replace(/\\leq/g, " <= ")
    .replace(/\\geq/g, " >= ")
    .replace(/\\neq/g, " != ")
    .replace(/\\approx/g, " ~= ")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLatexDelimiters(value: string) {
  return value
    .replace(/\$\$/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .trim();
}

function readLatexGroup(value: string, startIndex: number) {
  if (value[startIndex] !== "{") {
    return null;
  }

  let depth = 0;
  let content = "";

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];

    if (char === "{") {
      if (depth > 0) {
        content += char;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          content,
          endIndex: index + 1,
        };
      }
      content += char;
      continue;
    }

    content += char;
  }

  return null;
}

function splitLatexByFirstFraction(value: string) {
  const raw = stripLatexDelimiters(value);
  const fractionIndex = raw.indexOf("\\frac");

  if (fractionIndex < 0) {
    return {
      before: cleanLatexText(raw),
      numerator: null,
      denominator: null,
      after: "",
    };
  }

  const numeratorGroup = readLatexGroup(raw, fractionIndex + "\\frac".length);
  const denominatorGroup = numeratorGroup ? readLatexGroup(raw, numeratorGroup.endIndex) : null;

  if (!numeratorGroup || !denominatorGroup) {
    return {
      before: cleanLatexText(raw),
      numerator: null,
      denominator: null,
      after: "",
    };
  }

  return {
    before: cleanLatexText(raw.slice(0, fractionIndex)),
    numerator: cleanLatexText(numeratorGroup.content),
    denominator: cleanLatexText(denominatorGroup.content),
    after: cleanLatexText(raw.slice(denominatorGroup.endIndex)),
  };
}

function LatexAssetPreview({ value }: { value: string | null | undefined }) {
  const math = splitLatexByFirstFraction(value ?? "");
  const fallback = cleanLatexText(value) || "Sin LaTeX reconstruido.";

  return (
    <div className="w-full rounded-[22px] border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Vista matematica aproximada
      </p>
      <div className="mt-5 flex min-h-[120px] flex-wrap items-center justify-center gap-3 rounded-[18px] bg-[rgba(245,244,250,0.92)] p-5 text-center font-[var(--font-heading)] text-2xl font-semibold leading-relaxed text-[var(--color-ink)]">
        {math.numerator && math.denominator ? (
          <>
            {math.before ? <span>{math.before}</span> : null}
            <span className="inline-flex min-w-24 flex-col items-center justify-center px-2 align-middle">
              <span className="w-full border-b border-[var(--color-ink)] px-3 pb-1">
                {math.numerator}
              </span>
              <span className="w-full px-3 pt-1">{math.denominator}</span>
            </span>
            {math.after ? <span>{math.after}</span> : null}
          </>
        ) : (
          <span>{fallback}</span>
        )}
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--color-muted)]">
        El LaTeX crudo se conserva abajo para precision en etapas posteriores; esta vista solo ayuda
        a inspeccionar rapidamente el asset.
      </p>
    </div>
  );
}

function splitTableRows(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 28);
}

function splitTableCells(row: string) {
  if (row.includes("|")) {
    return row
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  if (row.includes("\t")) {
    return row
      .split("\t")
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  return [row];
}

function TableAssetPreview({ value }: { value: string | null | undefined }) {
  const rows = splitTableRows(value);

  return (
    <div className="w-full rounded-[22px] border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        Texto tabular / contexto de tabla
      </p>
      <div className="mt-4 max-h-[58vh] overflow-auto rounded-[18px] border border-slate-200 bg-[rgba(245,244,250,0.92)]">
        {rows.length > 0 ? (
          rows.map((row, rowIndex) => {
            const cells = splitTableCells(row);

            return (
              <div
                className="grid border-b border-white/80 text-sm leading-6 text-[var(--color-ink)] last:border-b-0"
                key={`${row}-${rowIndex}`}
                style={{
                  gridTemplateColumns:
                    cells.length > 1 ? `repeat(${Math.min(cells.length, 6)}, minmax(0, 1fr))` : "1fr",
                }}
              >
                {cells.slice(0, 6).map((cell, cellIndex) => (
                  <div
                    className="border-r border-white/80 px-3 py-2 last:border-r-0"
                    key={`${cell}-${cellIndex}`}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            );
          })
        ) : (
          <p className="p-4 text-sm leading-7 text-[var(--color-muted)]">
            Sin contenido textual de tabla.
          </p>
        )}
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--color-muted)]">
        En este paso la tabla se conserva como texto/contexto recuperado. Si luego necesitamos
        estructura exacta de celdas, conviene una segunda ola especializada sobre la fuente.
      </p>
    </div>
  );
}

function AssetInspectionBadge({ asset }: { asset: PdfAssetRecord }) {
  const label =
    asset.kind === "equation"
      ? "Render + LaTeX"
      : asset.kind === "table"
        ? "Texto tabla"
        : "Imagen recortada";

  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
      {label}
    </span>
  );
}

export function BlueprintLaunchStep5Lab({
  initialBundle,
  initialContentMaterialization,
  initialDebugSnapshot,
  initialEvidencePacksArtifact,
  initialEvidencePlanning,
  initialProjectGlobalContext,
  initialSavedIntake,
  initialSourceSignalExtraction,
  initialTokenUsage,
}: BlueprintLaunchStep5LabProps) {
  const [sourceSignalExtraction, setSourceSignalExtraction] =
    useState<BlueprintLaunchSignalExtractionResult | null>(initialSourceSignalExtraction);
  const [evidencePacksArtifact, setEvidencePacksArtifact] =
    useState<EvidencePackArtifact | null>(initialEvidencePacksArtifact);
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(
    initialDebugSnapshot,
  );
  const [tokenUsage, setTokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<PdfAssetRecord | null>(null);
  const [isRunning, startRunTransition] = useTransition();
  const selectedAssetPreviewUrl = buildAssetPreviewUrl(selectedAsset?.file_path);

  const todayUsage = useMemo(() => {
    const today = getTodayTorontoDate();
    return (
      tokenUsage.byDate[today] ?? {
        calls: 0,
        totalTokens: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        costCad: 0,
      }
    );
  }, [tokenUsage]);

  function runStep5() {
    setError(null);
    setMessage(null);

    startRunTransition(async () => {
      const response = await fetch("/api/blueprint-launch/step-5", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        sourceSignalExtraction?: BlueprintLaunchSignalExtractionResult;
        evidencePacksArtifact?: EvidencePackArtifact;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.sourceSignalExtraction || !payload.evidencePacksArtifact) {
        setError(payload.error ?? "No se pudo ejecutar el Paso 5.");
        return;
      }

      setSourceSignalExtraction(payload.sourceSignalExtraction);
      setEvidencePacksArtifact(payload.evidencePacksArtifact);
      setDebugSnapshot(payload.debugSnapshot ?? null);

      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }

      setMessage("Paso 5 ejecutado. La primera ola de evidencia quedo lista para el Paso 6.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      {selectedAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="brand-kicker">Visor de asset</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {selectedAsset.kind} / {selectedAsset.asset_key}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Fuente: {selectedAsset.source_id} | Pagina: {selectedAsset.page_number ?? "null"}
                </p>
              </div>
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
                onClick={() => setSelectedAsset(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                {selectedAssetPreviewUrl ? (
                  <img
                    alt={selectedAsset.caption ?? selectedAsset.title}
                    className="max-h-[68vh] max-w-full rounded-[16px] object-contain"
                    src={selectedAssetPreviewUrl}
                  />
                ) : selectedAsset.kind === "equation" ? (
                  <LatexAssetPreview value={selectedAsset.text_content} />
                ) : selectedAsset.kind === "table" ? (
                  <TableAssetPreview value={selectedAsset.text_content ?? selectedAsset.caption} />
                ) : (
                  <pre className="w-full whitespace-pre-wrap rounded-[18px] bg-slate-950 p-4 text-sm leading-7 text-slate-100">
                    {selectedAsset.text_content ?? selectedAsset.caption ?? "Sin contenido textual."}
                  </pre>
                )}
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4 text-sm leading-7 text-[var(--color-muted)]">
                <p className="font-semibold text-[var(--color-ink)]">Metadata</p>
                <p className="mt-3">Titulo: {selectedAsset.title}</p>
                <p>Caption: {selectedAsset.caption ?? "null"}</p>
                <p>Origen: {selectedAsset.extraction_origin}</p>
                <p>MIME: {selectedAsset.mime_type ?? "null"}</p>
                <p>Dimensiones: {selectedAsset.width_px ?? "null"} x {selectedAsset.height_px ?? "null"}</p>
                <p className="break-all">Path: {selectedAsset.file_path ?? "null"}</p>
                <p className="mt-4 font-semibold text-[var(--color-ink)]">Texto / LaTeX</p>
                <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3 text-xs leading-5 text-[var(--color-ink)]">
                  {selectedAsset.text_content ?? "null"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 5</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Primera ola de extraccion de evidencia y assets
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Lee los PDFs/textos materializados en el Paso 4, extrae texto plano,
              conserva texto original con ubicacion verificable, usa LLM para priorizar chunks
              y separa senales interpretativas de extractos originales y assets.
            </p>
          </div>

          <button
            className="brand-button-primary"
            disabled={isRunning}
            onClick={runStep5}
            type="button"
          >
            {isRunning ? "Extrayendo..." : "Ejecutar Paso 5"}
          </button>
        </div>

        {message ? (
          <div className="mt-6 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Contexto activo</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Insumos usados para extraer
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tema canonico", initialProjectGlobalContext?.canonicalTopicEs ?? "Pendiente"],
            ["Estado intake", initialSavedIntake?.status ?? "Pendiente"],
            ["Fuentes seleccionadas", `${initialBundle?.selectedCount ?? 0}`],
            ["PDFs materializados", `${initialContentMaterialization?.pdfCount ?? 0}`],
            ["Decision Paso 3", initialEvidencePlanning?.decision ?? "Pendiente"],
            ["Ready Step 5", initialContentMaterialization?.readyForStep5 ? "si" : "no"],
            ["Ready Step 6", sourceSignalExtraction?.readyForStep6 ? "si" : "no"],
            ["Ultimo debug", formatStableTimestamp(debugSnapshot?.savedAt)],
          ].map(([label, value]) => (
            <div
              className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
              key={label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {label}
              </p>
              <p className="mt-2 break-all text-sm font-semibold leading-6 text-[var(--color-ink)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Costo API</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Uso de tokens y costo CAD
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tokens hoy", `${todayUsage.totalTokens}`],
            ["Costo hoy CAD", formatMoney(todayUsage.costCad, "CAD")],
            ["Costo total proyecto CAD", formatMoney(tokenUsage.baselineHistorical.costCad + tokenUsage.cumulative.costCad, "CAD")],
            ["Tokens medidos desde contador", `${tokenUsage.cumulative.totalTokens}`],
          ].map(([label, value]) => (
            <div
              className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
              key={label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {label}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Resultado</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Evidence packs listos para consolidar
        </h2>
        {sourceSignalExtraction ? (
          <>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(sourceSignalExtraction.llmStatus)}`}>
                LLM: {sourceSignalExtraction.llmStatus}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(sourceSignalExtraction.readyForStep6)}`}>
                Ready Step 6: {sourceSignalExtraction.readyForStep6 ? "si" : "no"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              {sourceSignalExtraction.summary}
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Fuentes", `${sourceSignalExtraction.sourceCount}`],
                ["Textos extraidos", `${sourceSignalExtraction.textExtractionCount}`],
                ["Caracteres texto", formatNumber(sourceSignalExtraction.totalTextCharCount)],
                ["Snippets", `${sourceSignalExtraction.totalSnippetCount}`],
                ["Assets", `${sourceSignalExtraction.totalAssetCount}`],
                ["Ecuaciones", `${sourceSignalExtraction.equationAssetCount}`],
                ["Tablas", `${sourceSignalExtraction.tableAssetCount}`],
                ["Imagenes", `${sourceSignalExtraction.imageAssetCount}`],
                ["Prompts", `${sourceSignalExtraction.llmPromptCount}`],
                ["Llamadas LLM", `${sourceSignalExtraction.llmCallCount}`],
              ].map(([label, value]) => (
                <div
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                  key={label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4 text-sm leading-7 text-[var(--color-muted)]">
              <p>Run dir: {sourceSignalExtraction.runDir ?? "null"}</p>
              <p>Evidence packs: {evidencePacksArtifact?.packs.length ?? 0}</p>
              <p>Warnings: {joinOrEmpty(sourceSignalExtraction.warnings)}</p>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Aun no hay extraccion del Paso 5. Ejecuta primero el Paso 4 y luego este paso.
          </p>
        )}
      </section>

      {sourceSignalExtraction ? (
        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Por fuente</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Senales interpretativas, extractos originales y assets curados
          </h2>
          <div className="mt-6 grid gap-5">
            {sourceSignalExtraction.sources.map((source) => {
              const pack = findPack(evidencePacksArtifact, source.sourceId);
              const snippets = getSnippetPreview(pack);
              const assets = getAssetPreview(pack);

              return (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                  key={source.sourceId}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                        {source.title}
                      </h3>
                      <p className="mt-2 break-all text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {source.sourceId}
                      </p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {source.inputMode}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Texto local", source.extractedTextPath ?? "null"],
                      ["Paginas", source.pageCount?.toString() ?? "null"],
                      ["Caracteres", formatNumber(source.textCharCount)],
                      ["Idioma", source.detectedLanguage ?? "null"],
                      ["Snippets", `${source.snippetCount}`],
                      ["Assets", `${source.assetCount}`],
                      ["Soporta", joinOrEmpty(source.supportsSectionKeys)],
                      ["Metodos", joinOrEmpty(source.methodologyHints)],
                    ].map(([label, value]) => (
                      <div
                        className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-3"
                        key={label}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                          {label}
                        </p>
                        <p className="mt-2 break-all text-xs font-semibold leading-5 text-[var(--color-ink)]">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Senales interpretativas
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                        No son citas originales; son lectura auxiliar para orientar la siguiente ola.
                      </p>
                      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                        Overview: {source.sourceOverview ?? "null"}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                        Metodo: {source.methodSignal ?? "null"}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                        Hallazgo: {source.findingSignal ?? "null"}
                      </p>
                    </div>

                    <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Assets curados
                      </p>
                      {assets.length > 0 ? (
                        <div className="mt-3 grid gap-3">
                          {assets.map((asset) => (
                            <div
                              className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3 text-xs leading-5 text-[var(--color-muted)]"
                              key={asset.asset_key}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[var(--color-ink)]">
                                    {asset.kind} / {asset.asset_key}
                                  </p>
                                  <div className="mt-2">
                                    <AssetInspectionBadge asset={asset} />
                                  </div>
                                </div>
                                <button
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]"
                                  onClick={() => setSelectedAsset(asset)}
                                  type="button"
                                >
                                  Ver
                                </button>
                              </div>
                              <p>Pagina: {asset.page_number ?? "null"}</p>
                              <p>Caption: {asset.caption ?? "null"}</p>
                              <p className="break-all">Path: {asset.file_path ?? "null"}</p>
                              <p>Texto/LaTeX: {asset.text_content ?? "null"}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                          Sin assets curados para esta fuente.
                        </p>
                      )}
                    </div>
                  </div>

                  <details className="mt-5 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                      Ver extractos originales de evidencia
                    </summary>
                    <div className="mt-4 grid gap-3">
                      {snippets.map((snippet) => (
                        <div
                          className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-4"
                          key={snippet.snippet_id}
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                            {snippet.label} / {joinOrEmpty(snippet.section_hint_keys)}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                            Tipo: {snippet.extraction_kind ?? "legacy"} | Pagina:{" "}
                            {snippet.page_start ?? snippet.page_number ?? "null"} | Hash:{" "}
                            {snippet.quote_hash?.slice(0, 16) ?? "null"}
                          </p>
                          {snippet.interpretation_es ? (
                            <p className="mt-2 rounded-[12px] bg-white p-3 text-xs leading-5 text-[var(--color-muted)]">
                              Nota LLM: {snippet.interpretation_es}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
                            {snippet.original_text ?? snippet.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {sourceSignalExtraction?.llmPrompts.length ? (
        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Prompts LLM</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Templates y prompts finales usados
          </h2>
          <div className="mt-6 grid gap-4">
            {sourceSignalExtraction.llmPrompts.map((prompt) => (
              <details
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                key={`${prompt.sourceId}-${prompt.label}`}
              >
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                  {prompt.label} / {prompt.model} / {prompt.sourceTitle ?? "global"}
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      Prompt template
                    </p>
                    <pre className="mt-3 max-h-[520px] overflow-auto rounded-[18px] bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {prompt.promptTemplate}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      Prompt final
                    </p>
                    <pre className="mt-3 max-h-[520px] overflow-auto rounded-[18px] bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {prompt.promptText}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
