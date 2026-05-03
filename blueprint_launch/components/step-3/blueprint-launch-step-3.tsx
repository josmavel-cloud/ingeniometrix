"use client";

import { useMemo, useState, useTransition } from "react";

import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type {
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSourceIntakeGateResult,
} from "@/blueprint_launch/server/local-playground-store";
import type { BlueprintLaunchProjectGlobalContext } from "@/blueprint_launch/server/step1-intake-context";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

type BlueprintLaunchStep3LabProps = {
  initialBundle: BlueprintLaunchSelectedSourceBundle | null;
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialEvidencePlanning: BlueprintLaunchEvidencePlanningResult | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult | null;
  initialSourceIntakeGate: BlueprintLaunchSourceIntakeGateResult | null;
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

function decisionClasses(decision: string | undefined) {
  if (decision === "PASS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (decision === "PASS_WITH_WARNINGS") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function readinessClasses(readiness: string) {
  if (readiness === "alta") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (readiness === "media") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function smallList(values: string[]) {
  if (values.length === 0) {
    return <span className="text-[var(--color-muted)]">Sin elementos.</span>;
  }

  return values.join(" · ");
}

export function BlueprintLaunchStep3Lab({
  initialBundle,
  initialDebugSnapshot,
  initialEvidencePlanning,
  initialProjectGlobalContext,
  initialSavedIntake,
  initialSourceAccessResolution,
  initialSourceIntakeGate,
  initialTokenUsage,
}: BlueprintLaunchStep3LabProps) {
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(
    initialDebugSnapshot,
  );
  const [evidencePlanning, setEvidencePlanning] =
    useState<BlueprintLaunchEvidencePlanningResult | null>(initialEvidencePlanning);
  const [tokenUsage, setTokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, startRunTransition] = useTransition();

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

  function runStep3() {
    setError(null);
    setMessage(null);

    startRunTransition(async () => {
      const response = await fetch("/api/blueprint-launch/step-3", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        evidencePlanning?: BlueprintLaunchEvidencePlanningResult;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.evidencePlanning) {
        setError(payload.error ?? "No se pudo ejecutar el Paso 3.");
        return;
      }

      setDebugSnapshot(payload.debugSnapshot ?? null);
      setEvidencePlanning(payload.evidencePlanning);

      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }

      setMessage("Paso 3 ejecutado. El plan de evidencia y materializacion quedo actualizado.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 3</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Plan de evidencia, cobertura y materializacion
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Esta vista revisa si el set de fuentes resuelto por el Paso 2 esta listo para
              descargar/capturar contenido, que buscar en cada fuente y que artefactos
              downstream deben regenerarse antes de seguir.
            </p>
          </div>

          <button
            className="brand-button-primary"
            disabled={isRunning}
            onClick={runStep3}
            type="button"
          >
            {isRunning ? "Planificando..." : "Ejecutar Paso 3"}
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
          Variables base del Paso 3
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tema canonico", initialProjectGlobalContext?.canonicalTopicEs ?? "Pendiente"],
            ["Problema", initialProjectGlobalContext?.problemCoreEs ?? "Pendiente"],
            ["Metodo preferido", initialProjectGlobalContext?.methodPreferenceEs ?? "Pendiente"],
            ["Fuentes seleccionadas", `${initialBundle?.selectedCount ?? 0}`],
            ["Gate Paso 2", initialSourceIntakeGate?.decision ?? "Pendiente"],
            ["Contenido completo", `${initialSourceAccessResolution?.completePublicCount ?? 0}`],
            ["Estado intake", initialSavedIntake?.status ?? "Pendiente"],
            ["Ultimo debug", formatStableTimestamp(debugSnapshot?.savedAt)],
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
        <p className="brand-kicker">Decision</p>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Resultado del plan
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              {evidencePlanning?.summary ?? "Aun no se ha ejecutado el Paso 3."}
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
              {evidencePlanning?.nextStepRecommendation ?? "Ejecuta el planificador para preparar Paso 4."}
            </p>
          </div>
          <div className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${decisionClasses(evidencePlanning?.decision)}`}>
            {evidencePlanning?.decision ?? "PENDIENTE"}
          </div>
        </div>

        {evidencePlanning ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["LLM status", evidencePlanning.llmStatus],
              ["Prompts preparados", `${evidencePlanning.llmPromptCount}`],
              ["Llamadas LLM", `${evidencePlanning.llmCallCount}`],
              ["PDF plan", `${evidencePlanning.pdfPlanCount}`],
              ["Web/repositorio", `${evidencePlanning.webPlanCount}`],
              ["Bloqueadas", `${evidencePlanning.blockedSourceCount}`],
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
        ) : null}
      </section>

      {evidencePlanning ? (
        <>
          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Estado downstream</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Artefactos que deben regenerarse
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Invalidado en corrida", evidencePlanning.downstreamState.invalidatedDuringRun ? "si" : "no"],
                ["Materializacion obsoleta detectada", evidencePlanning.downstreamState.contentMaterializationIsStale ? "si" : "no"],
                ["Signal extraction obsoleto detectado", evidencePlanning.downstreamState.sourceSignalExtractionIsStale ? "si" : "no"],
                ["Consolidado obsoleto detectado", evidencePlanning.downstreamState.consolidatedEvidenceArtifactIsStale ? "si" : "no"],
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
              <p>Source access: {formatStableTimestamp(evidencePlanning.downstreamState.sourceAccessSavedAt)}</p>
              <p>Content materialization: {formatStableTimestamp(evidencePlanning.downstreamState.contentMaterializationSavedAt)}</p>
              <p>Razones: {smallList(evidencePlanning.downstreamState.staleReasons)}</p>
              <p>Warnings operacionales: {smallList(evidencePlanning.operationalWarnings)}</p>
              <p>Warnings de evidencia: {smallList(evidencePlanning.evidenceWarnings)}</p>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Plan de materializacion</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Fuentes y URLs que usara el Paso 4
            </h2>
            <div className="mt-6 grid gap-4">
              {evidencePlanning.materializationPlan.map((item) => (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                  key={item.sourceId}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                        {item.title}
                      </h3>
                      <p className="mt-2 break-all text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {item.sourceId}
                      </p>
                    </div>
                    <div className="rounded-full border border-[rgba(74,58,97,0.12)] bg-[rgba(245,244,250,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]">
                      {item.priority} / {item.expectedKind} / {item.resolverFamily}
                    </div>
                  </div>
                  <p className="mt-4 break-all text-sm leading-7 text-[var(--color-muted)]">
                    {item.contentUrl ?? "Sin URL de contenido completo."}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <p className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-3 text-sm leading-6 text-[var(--color-ink)]">
                      Riesgos: {smallList(item.riskFlags)}
                    </p>
                    <p className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-3 text-sm leading-6 text-[var(--color-ink)]">
                      Validacion: {smallList(item.validationNotes)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Cobertura</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Mapa preliminar por seccion
            </h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {evidencePlanning.sectionCoverage.map((section) => (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                  key={section.sectionKey}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                      {section.sectionKey}
                    </h3>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${readinessClasses(section.readiness)}`}>
                      {section.readiness}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Fuentes candidatas: {section.candidateSourceCount} · base: {section.readinessBasis}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                    Objetivos de evidencia: {smallList(section.evidenceTargets)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Vacios: {smallList(section.missingElements)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Plan por fuente</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Que buscar luego en Paso 5
            </h2>
            <div className="mt-6 grid gap-4">
              {evidencePlanning.sourceCards.map((card) => (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                  key={card.sourceId}
                >
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {card.title}
                  </h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Relevancia", card.topicRelevance],
                      ["Utilidad", card.proposalUsefulness],
                      ["Acceso", `${card.accessStatus} / ${card.accessKind}`],
                      ["Evidencia esperada", card.expectedEvidenceTypes.join(", ")],
                    ].map(([label, value]) => (
                      <div
                        className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-3"
                        key={`${card.sourceId}-${label}`}
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
                  <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                    Rol: {card.sourceRole}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                    Secciones: {smallList(card.supportsSectionKeys)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Enfoque de extraccion: {smallList(card.extractionFocus)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Metodologia: {smallList(card.methodologyHints)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                    Marco teorico/tecnico: {smallList(card.frameworkHints)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Prompts LLM</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Prompt programado y prompt final
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Estado LLM: {evidencePlanning.llmStatus}. Prompts preparados: {evidencePlanning.llmPromptCount}. Llamadas reales: {evidencePlanning.llmCallCount}. Si se omitio por credenciales locales, el prompt queda visible para depuracion y el plan usa fallback deterministico.
            </p>
            <div className="mt-6 grid gap-5">
              {evidencePlanning.llmPrompts.map((prompt, index) => (
                <article
                  className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                  key={`${prompt.schemaName}-${index}`}
                >
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    <span>{prompt.label}</span>
                    <span>Modelo: {prompt.model}</span>
                    <span>Schema: {prompt.schemaName}</span>
                    <span>Tracking: {prompt.trackingLabel}</span>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Template programado
                  </p>
                  <pre className="mt-2 max-h-[360px] overflow-auto rounded-[20px] bg-[rgba(53,45,71,0.92)] p-4 text-xs leading-6 text-white">
                    {prompt.promptTemplate}
                  </pre>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Prompt final expandido
                  </p>
                  <pre className="mt-2 max-h-[460px] overflow-auto rounded-[20px] bg-[rgba(23,20,33,0.94)] p-4 text-xs leading-6 text-white">
                    {prompt.promptText}
                  </pre>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
