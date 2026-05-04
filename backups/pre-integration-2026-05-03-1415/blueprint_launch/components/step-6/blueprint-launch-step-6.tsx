"use client";

import { useMemo, useState, useTransition } from "react";

import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type {
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSignalExtractionResult,
  ConsolidatedEvidenceArtifact,
  ConsolidatedEvidenceSectionDossier,
  ConsolidatedEvidenceUnit,
  EvidencePackArtifact,
} from "@/blueprint_launch/server/local-playground-store";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

type BlueprintLaunchStep6LabProps = {
  initialConsolidatedEvidenceArtifact: ConsolidatedEvidenceArtifact | null;
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialEvidencePacksArtifact: EvidencePackArtifact | null;
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

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-CA").format(value ?? 0);
}

function formatSignedNumber(value: number | null | undefined) {
  const number = value ?? 0;
  return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
}

function formatStableTimestamp(value: string | null | undefined) {
  if (!value) {
    return "null";
  }

  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function joinOrEmpty(values: string[] | undefined, separator = " | ") {
  return values && values.length > 0 ? values.join(separator) : "Sin elementos.";
}

function statusClasses(value: string | boolean | undefined) {
  if (value === "alta" || value === "pass" || value === "llm" || value === "hybrid" || value === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "media" || value === "warn" || value === "fallback" || value === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function buildAssetPreviewUrl(filePath: string | null | undefined) {
  return filePath ? `/api/blueprint-launch/assets?path=${encodeURIComponent(filePath)}` : null;
}

function truncate(value: string | null | undefined, maxLength = 260) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function groupEvidenceUnitsByType(units: ConsolidatedEvidenceUnit[]) {
  return units.reduce<Record<string, number>>((accumulator, unit) => {
    accumulator[unit.unit_type] = (accumulator[unit.unit_type] ?? 0) + 1;
    return accumulator;
  }, {});
}

function EvidenceUnitCard({
  unit,
  onOpen,
}: {
  unit: ConsolidatedEvidenceUnit;
  onOpen: (unit: ConsolidatedEvidenceUnit) => void;
}) {
  return (
    <div className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3 text-xs leading-5 text-[var(--color-muted)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--color-ink)]">
            {unit.unit_type} / {unit.evidence_id}
          </p>
          <p className="mt-1 break-all">{unit.source_id}</p>
        </div>
        <button
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]"
          onClick={() => onOpen(unit)}
          type="button"
        >
          Ver
        </button>
      </div>
      <p className="mt-2">Secciones: {joinOrEmpty(unit.section_keys, ", ")}</p>
      <p>Elegibilidad: {unit.citation_eligibility}</p>
      <p className="mt-2 text-[var(--color-ink)]">
        {truncate(unit.original_text ?? unit.summary_es ?? unit.caption, 360)}
      </p>
    </div>
  );
}

function DossierCard({
  dossier,
  evidenceById,
  onOpen,
}: {
  dossier: ConsolidatedEvidenceSectionDossier;
  evidenceById: Map<string, ConsolidatedEvidenceUnit>;
  onOpen: (unit: ConsolidatedEvidenceUnit) => void;
}) {
  const units = dossier.evidence_unit_ids
    .map((id) => evidenceById.get(id))
    .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit))
    .slice(0, 6);

  return (
    <details className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
        {dossier.section_label_es} / {dossier.section_key} / readiness {dossier.readiness}
      </summary>
      <div className="mt-4 grid gap-4">
        <div className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-4 text-sm leading-7 text-[var(--color-muted)]">
          <p className="font-semibold text-[var(--color-ink)]">Estrategia de redaccion</p>
          <p className="mt-2">{dossier.drafting_strategy}</p>
          <p className="mt-2">Fuentes primarias: {joinOrEmpty(dossier.primary_source_ids)}</p>
          <p>Assets utiles: {joinOrEmpty(dossier.useful_assets)}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Claims candidatos
            </p>
            <div className="mt-3 grid gap-3">
              {dossier.claim_candidates.length > 0 ? (
                dossier.claim_candidates.map((claim) => (
                  <div className="rounded-[14px] bg-[rgba(245,244,250,0.92)] p-3" key={claim.claim_es}>
                    <p className="text-sm leading-6 text-[var(--color-ink)]">{claim.claim_es}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                      Soporte: {claim.support_level} | Evidencia: {joinOrEmpty(claim.evidence_unit_ids)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--color-muted)]">Sin claims candidatos.</p>
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Control editorial
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Plan de citas: {joinOrEmpty(dossier.citation_plan)}
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
              Supuestos permitidos: {joinOrEmpty(dossier.assumptions_allowed)}
            </p>
            <p className="mt-2 text-sm leading-7 text-amber-800">
              Faltantes: {joinOrEmpty(dossier.missing_evidence)}
            </p>
            <p className="mt-2 text-sm leading-7 text-rose-800">
              No afirmar: {joinOrEmpty(dossier.do_not_claim)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Evidencia principal
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {units.map((unit) => (
              <EvidenceUnitCard key={unit.evidence_id} onOpen={onOpen} unit={unit} />
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

export function BlueprintLaunchStep6Lab({
  initialConsolidatedEvidenceArtifact,
  initialDebugSnapshot,
  initialEvidencePacksArtifact,
  initialSavedIntake,
  initialSourceSignalExtraction,
  initialTokenUsage,
}: BlueprintLaunchStep6LabProps) {
  const [consolidatedEvidenceArtifact, setConsolidatedEvidenceArtifact] =
    useState<ConsolidatedEvidenceArtifact | null>(initialConsolidatedEvidenceArtifact);
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(
    initialDebugSnapshot,
  );
  const [tokenUsage, setTokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
  const [selectedUnit, setSelectedUnit] = useState<ConsolidatedEvidenceUnit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, startRunTransition] = useTransition();

  const evidenceUnits = consolidatedEvidenceArtifact?.evidence_units ?? [];
  const sectionDossiers = consolidatedEvidenceArtifact?.section_dossiers ?? [];
  const evidenceById = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.evidence_id, unit])),
    [evidenceUnits],
  );
  const evidenceTypeCounts = useMemo(() => groupEvidenceUnitsByType(evidenceUnits), [evidenceUnits]);
  const selectedAssetPreviewUrl = buildAssetPreviewUrl(selectedUnit?.asset_path);
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

  function runStep6() {
    setError(null);
    setMessage(null);

    startRunTransition(async () => {
      const response = await fetch("/api/blueprint-launch/step-6", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        consolidatedEvidenceArtifact?: ConsolidatedEvidenceArtifact;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.consolidatedEvidenceArtifact) {
        setError(payload.error ?? "No se pudo ejecutar el Paso 6.");
        return;
      }

      setConsolidatedEvidenceArtifact(payload.consolidatedEvidenceArtifact);
      setDebugSnapshot(payload.debugSnapshot ?? null);

      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }

      setMessage("Paso 6 ejecutado. El paquete consolidado quedo listo para pasos 7-11.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      {selectedUnit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="brand-kicker">Visor de evidence unit</p>
                <h2 className="mt-2 break-all font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {selectedUnit.unit_type} / {selectedUnit.evidence_id}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Fuente: {selectedUnit.source_id} | Pagina: {selectedUnit.page_start ?? "null"}
                </p>
              </div>
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
                onClick={() => setSelectedUnit(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                {selectedAssetPreviewUrl ? (
                  <img
                    alt={selectedUnit.caption ?? selectedUnit.label}
                    className="max-h-[68vh] max-w-full rounded-[16px] object-contain"
                    src={selectedAssetPreviewUrl}
                  />
                ) : (
                  <pre className="w-full whitespace-pre-wrap rounded-[18px] bg-slate-950 p-4 text-sm leading-7 text-slate-100">
                    {selectedUnit.original_text ?? selectedUnit.summary_es ?? selectedUnit.caption ?? "Sin contenido."}
                  </pre>
                )}
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4 text-sm leading-7 text-[var(--color-muted)]">
                <p className="font-semibold text-[var(--color-ink)]">Metadata</p>
                <p className="mt-3">Label: {selectedUnit.label}</p>
                <p>Elegibilidad: {selectedUnit.citation_eligibility}</p>
                <p>Secciones: {joinOrEmpty(selectedUnit.section_keys, ", ")}</p>
                <p>Hash: {selectedUnit.quote_hash ?? "null"}</p>
                <p>Asset: {selectedUnit.asset_key ?? "null"}</p>
                <p className="break-all">Path: {selectedUnit.asset_path ?? "null"}</p>
                <p className="mt-4 font-semibold text-[var(--color-ink)]">Resumen / caption</p>
                <p>{selectedUnit.summary_es ?? selectedUnit.caption ?? "null"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 6</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Consolidacion de evidencia para pasos 7-11
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Normaliza snippets y assets del Paso 5 como evidence units, arma dossiers por
              seccion, propone una ruta metodologica defendible y genera un manifiesto de handoff
              para que el siguiente lab lea sin modificar los artefactos.
            </p>
          </div>

          <button
            className="brand-button-primary"
            disabled={isRunning}
            onClick={runStep6}
            type="button"
          >
            {isRunning ? "Consolidando..." : "Ejecutar Paso 6"}
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
        <p className="brand-kicker">Preflight</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Insumos activos
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tema", initialSavedIntake?.intake.topic ?? "Pendiente"],
            ["Paso 5 listo", initialSourceSignalExtraction?.readyForStep6 ? "si" : "no"],
            ["Fuentes Paso 5", `${initialSourceSignalExtraction?.sourceCount ?? 0}`],
            ["Evidence packs", `${initialEvidencePacksArtifact?.packs.length ?? 0}`],
            ["Snippets Paso 5", `${initialSourceSignalExtraction?.totalSnippetCount ?? 0}`],
            ["Assets Paso 5", `${initialSourceSignalExtraction?.totalAssetCount ?? 0}`],
            ["Ultimo debug", formatStableTimestamp(debugSnapshot?.savedAt)],
            ["Artifact actual", consolidatedEvidenceArtifact?.artifact_version ?? "Pendiente"],
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

      {consolidatedEvidenceArtifact ? (
        <>
          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Resultado</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Paquete consolidado
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(consolidatedEvidenceArtifact.llm_status)}`}>
                LLM: {consolidatedEvidenceArtifact.llm_status ?? "n/d"}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(consolidatedEvidenceArtifact.coverage_map.overall_readiness)}`}>
                Readiness: {consolidatedEvidenceArtifact.coverage_map.overall_readiness}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(consolidatedEvidenceArtifact.quality_gate?.status)}`}>
                Quality gate: {consolidatedEvidenceArtifact.quality_gate?.status ?? "n/d"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              {consolidatedEvidenceArtifact.summary ?? "Sin resumen."}
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Evidence units", formatNumber(evidenceUnits.length)],
                ["Dossiers", formatNumber(sectionDossiers.length)],
                ["Ready sections", formatNumber(consolidatedEvidenceArtifact.coverage_map.ready_section_count)],
                ["Partial sections", formatNumber(consolidatedEvidenceArtifact.coverage_map.partial_section_count)],
                ["Low sections", formatNumber(consolidatedEvidenceArtifact.coverage_map.low_section_count)],
                ["Prompts", formatNumber(consolidatedEvidenceArtifact.llm_prompt_count)],
                ["LLM calls", formatNumber(consolidatedEvidenceArtifact.llm_call_count)],
                ["Asset plans", formatNumber(consolidatedEvidenceArtifact.asset_usage_plan?.length)],
                ["Warnings", formatNumber(consolidatedEvidenceArtifact.warnings.length)],
                ["Checks", formatNumber(consolidatedEvidenceArtifact.quality_gate?.checks.length)],
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
              <p className="break-all">Run dir: {consolidatedEvidenceArtifact.run_dir ?? "null"}</p>
              <p className="break-all">Artifact: {consolidatedEvidenceArtifact.artifact_path ?? "null"}</p>
              <p className="break-all">Latest: {consolidatedEvidenceArtifact.latest_artifact_path ?? "null"}</p>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Optimizacion segura</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Preservacion de contexto y comparacion
            </h2>
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5 text-sm leading-7 text-[var(--color-muted)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Contrato lossless
                </p>
                <p className="mt-3">
                  Politica: {consolidatedEvidenceArtifact.context_preservation_contract?.policy ?? "n/d"}
                </p>
                <p>
                  Texto completo preservado:{" "}
                  {consolidatedEvidenceArtifact.context_preservation_contract?.full_context_is_preserved
                    ? "si"
                    : "no"}
                </p>
                <p>
                  Chunks preservados:{" "}
                  {formatNumber(consolidatedEvidenceArtifact.context_preservation_contract?.source_chunk_count)}
                </p>
                <p>
                  Caracteres de texto completo:{" "}
                  {formatNumber(consolidatedEvidenceArtifact.context_preservation_contract?.full_text_char_count)}
                </p>
                <p>
                  Rutas de hidratacion:{" "}
                  {formatNumber(consolidatedEvidenceArtifact.context_preservation_contract?.preserved_path_count)}
                </p>
                <p className="mt-3">
                  Notas: {joinOrEmpty(consolidatedEvidenceArtifact.context_preservation_contract?.hydration_notes_es)}
                </p>
              </div>

              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5 text-sm leading-7 text-[var(--color-muted)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Comparacion contra baseline
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClasses(consolidatedEvidenceArtifact.quality_comparison?.status)}`}>
                    {consolidatedEvidenceArtifact.quality_comparison?.status ?? "sin baseline"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                    Baseline: {consolidatedEvidenceArtifact.quality_comparison?.baseline_available ? "si" : "no"}
                  </span>
                </div>
                <p className="mt-3">
                  Evidence units: {formatSignedNumber(consolidatedEvidenceArtifact.quality_comparison?.deltas.evidence_unit_count)}
                </p>
                <p>
                  Extractos citables: {formatSignedNumber(consolidatedEvidenceArtifact.quality_comparison?.deltas.direct_quote_count)}
                </p>
                <p>
                  Assets citables: {formatSignedNumber(consolidatedEvidenceArtifact.quality_comparison?.deltas.asset_reference_count)}
                </p>
                <p>
                  Secciones listas: {formatSignedNumber(consolidatedEvidenceArtifact.quality_comparison?.deltas.ready_section_count)}
                </p>
                <p>
                  Caracteres de prompts: {formatSignedNumber(consolidatedEvidenceArtifact.quality_comparison?.deltas.prompt_char_count)}
                </p>
                <p className="mt-3 text-amber-800">
                  Alertas: {joinOrEmpty(consolidatedEvidenceArtifact.quality_comparison?.warnings)}
                </p>
              </div>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Decisiones</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Metodo, marco y gaps
            </h2>
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Paquete metodologico
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                  Familia: {consolidatedEvidenceArtifact.methodology_decision_packet?.method_family ?? "null"}
                </p>
                <p className="text-sm leading-7 text-[var(--color-muted)]">
                  Diseno: {consolidatedEvidenceArtifact.methodology_decision_packet?.research_design ?? "null"}
                </p>
                <p className="text-sm leading-7 text-[var(--color-muted)]">
                  Tecnicas: {joinOrEmpty(consolidatedEvidenceArtifact.methodology_decision_packet?.candidate_techniques)}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Razon: {joinOrEmpty(consolidatedEvidenceArtifact.methodology_decision_packet?.selection_rationale)}
                </p>
              </div>

              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Marco candidato
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                  Core: {consolidatedEvidenceArtifact.framework_decision_packet?.core_framework ?? "null"}
                </p>
                <p className="text-sm leading-7 text-[var(--color-muted)]">
                  Apoyos: {joinOrEmpty(consolidatedEvidenceArtifact.framework_decision_packet?.supporting_frameworks)}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Razon: {joinOrEmpty(consolidatedEvidenceArtifact.framework_decision_packet?.selection_rationale)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
                <p className="font-semibold">Gaps y validaciones</p>
                <p className="mt-2">Inferible con cuidado: {joinOrEmpty(consolidatedEvidenceArtifact.gap_resolution_plan?.inferable_with_care)}</p>
                <p className="mt-2">Bloqueante: {joinOrEmpty(consolidatedEvidenceArtifact.gap_resolution_plan?.blocking_gaps)}</p>
                <p className="mt-2">Acciones: {joinOrEmpty(consolidatedEvidenceArtifact.gap_resolution_plan?.validation_actions)}</p>
              </div>
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900">
                <p className="font-semibold">No afirmar</p>
                <p className="mt-2">{joinOrEmpty(consolidatedEvidenceArtifact.gap_resolution_plan?.do_not_claim)}</p>
                <p className="mt-2">Claims no soportados: {joinOrEmpty(consolidatedEvidenceArtifact.quality_gate?.unsupported_claims)}</p>
              </div>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Readiness</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Cobertura por seccion
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {consolidatedEvidenceArtifact.section_readiness_map.map((section) => (
                <div
                  className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                  key={section.section_key}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--color-ink)]">{section.section_key}</p>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClasses(section.readiness)}`}>
                      {section.readiness}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Fuentes: {section.source_count} | Texto: {section.snippet_count} | Assets: {section.asset_count}
                  </p>
                  <p className="text-sm leading-7 text-[var(--color-muted)]">
                    Faltantes: {joinOrEmpty(section.missing_elements)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Dossiers</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Paquetes de entrada para redaccion posterior
            </h2>
            <div className="mt-6 grid gap-4">
              {sectionDossiers.map((dossier) => (
                <DossierCard
                  dossier={dossier}
                  evidenceById={evidenceById}
                  key={dossier.section_key}
                  onOpen={setSelectedUnit}
                />
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Evidence units</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Inventario normalizado
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(evidenceTypeCounts).map(([type, count]) => (
                <span
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700"
                  key={type}
                >
                  {type}: {count}
                </span>
              ))}
            </div>
            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {evidenceUnits.slice(0, 40).map((unit) => (
                <EvidenceUnitCard key={unit.evidence_id} onOpen={setSelectedUnit} unit={unit} />
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Assets y handoff</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Plan de uso y rutas para el siguiente lab
            </h2>
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Asset usage plan
                </p>
                <div className="mt-3 grid gap-3">
                  {(consolidatedEvidenceArtifact.asset_usage_plan ?? []).slice(0, 12).map((item) => (
                    <div className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3 text-sm leading-6 text-[var(--color-muted)]" key={`${item.asset_key}-${item.section_key}`}>
                      <p className="font-semibold text-[var(--color-ink)]">{item.asset_kind} / {item.asset_key}</p>
                      <p>Seccion: {item.section_key}</p>
                      <p>{item.usage_reason}</p>
                      <p>Notas: {joinOrEmpty(item.handling_notes)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5 text-sm leading-7 text-[var(--color-muted)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Handoff manifest
                </p>
                <p className="mt-3 break-all">State: {consolidatedEvidenceArtifact.downstream_handoff_manifest?.state_file ?? "null"}</p>
                <p className="break-all">Artifact: {consolidatedEvidenceArtifact.downstream_handoff_manifest?.consolidated_evidence_artifact_path ?? "null"}</p>
                <p className="break-all">Latest: {consolidatedEvidenceArtifact.downstream_handoff_manifest?.latest_consolidated_evidence_artifact_path ?? "null"}</p>
                <p className="mt-3">Leer: {joinOrEmpty(consolidatedEvidenceArtifact.downstream_handoff_manifest?.next_lab_should_read)}</p>
                <p className="mt-3">No modificar: {joinOrEmpty(consolidatedEvidenceArtifact.downstream_handoff_manifest?.next_lab_should_not_modify)}</p>
              </div>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Quality gate</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Auditoria de trazabilidad
            </h2>
            <div className="mt-6 grid gap-3">
              {(consolidatedEvidenceArtifact.quality_gate?.checks ?? []).map((check) => (
                <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4" key={check.check_key}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[var(--color-ink)]">{check.check_key}</p>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClasses(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">{check.message}</p>
                </div>
              ))}
            </div>
          </section>

          {(consolidatedEvidenceArtifact.llm_prompts ?? []).length > 0 ? (
            <section className="surface-panel rounded-[32px] p-6 sm:p-8">
              <p className="brand-kicker">Prompts LLM</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Templates y prompts finales usados
              </h2>
              <div className="mt-6 grid gap-4">
                {(consolidatedEvidenceArtifact.llm_prompts ?? []).map((prompt) => (
                  <details
                    className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                    key={`${prompt.schemaName}-${prompt.label}`}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                      {prompt.label} / {prompt.model}
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
        </>
      ) : (
        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Pendiente</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Aun no hay consolidacion
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Ejecuta primero el Paso 5 y luego este Paso 6 para crear el paquete de handoff.
          </p>
        </section>
      )}
    </main>
  );
}
