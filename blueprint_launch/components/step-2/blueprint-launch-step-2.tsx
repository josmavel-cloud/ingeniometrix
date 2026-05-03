"use client";

import { useMemo, useState, useTransition } from "react";

import type {
  BlueprintLaunchProjectGlobalContext,
} from "@/blueprint_launch/server/step1-intake-context";
import type {
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSearchSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSourceIntakeGateResult,
} from "@/blueprint_launch/server/local-playground-store";
import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

type BlueprintLaunchStep2LabProps = {
  initialBundle: BlueprintLaunchSelectedSourceBundle | null;
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSearchSnapshot: BlueprintLaunchSearchSnapshot | null;
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

function formatStableTimestamp(value: string) {
  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function getAccessStatusBadgeClasses(status: string | undefined) {
  if (status === "complete_public") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "partial_public") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "metadata_only") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function BlueprintLaunchStep2Lab({
  initialBundle,
  initialDebugSnapshot,
  initialProjectGlobalContext,
  initialSavedIntake,
  initialSearchSnapshot,
  initialSourceAccessResolution,
  initialSourceIntakeGate,
  initialTokenUsage,
}: BlueprintLaunchStep2LabProps) {
  const [bundle, setBundle] = useState<BlueprintLaunchSelectedSourceBundle | null>(initialBundle);
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(initialDebugSnapshot);
  const [sourceAccessResolution, setSourceAccessResolution] =
    useState<BlueprintLaunchSourceAccessResolutionResult | null>(initialSourceAccessResolution);
  const [sourceIntakeGate, setSourceIntakeGate] =
    useState<BlueprintLaunchSourceIntakeGateResult | null>(initialSourceIntakeGate);
  const [tokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
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

  const selectedCount =
    initialSearchSnapshot?.references.filter((item) => item.selected).length ?? bundle?.selectedCount ?? 0;

  function runStep2() {
    setError(null);
    setMessage(null);

    startRunTransition(async () => {
      const response = await fetch("/api/blueprint-launch/step-2", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        bundle?: BlueprintLaunchSelectedSourceBundle;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        sourceAccessResolution?: BlueprintLaunchSourceAccessResolutionResult;
        sourceIntakeGate?: BlueprintLaunchSourceIntakeGateResult;
      };

      if (!response.ok || !payload.sourceAccessResolution || !payload.sourceIntakeGate) {
        setError(payload.error ?? "No se pudo ejecutar el Paso 2.");
        return;
      }

      setBundle(payload.bundle ?? null);
      setDebugSnapshot(payload.debugSnapshot ?? null);
      setSourceAccessResolution(payload.sourceAccessResolution);
      setSourceIntakeGate(payload.sourceIntakeGate);
      setMessage("Paso 2 reejecutado. La resolucion de acceso y el gate quedaron actualizados.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 2</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Gate inicial y resolucion de acceso completo
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Esta vista se enfoca en comprobar si las fuentes seleccionadas tienen
              contenido publico utilizable y si el set tiene calidad suficiente para
              seguir al resto del pipeline.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="brand-button-primary"
              disabled={isRunning}
              onClick={runStep2}
              type="button"
            >
              {isRunning ? "Resolviendo..." : "Reejecutar Paso 2"}
            </button>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Contexto</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Insumos activos para la resolucion
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tema canonico", initialProjectGlobalContext?.canonicalTopicEs ?? "Pendiente"],
            ["Alcance", initialProjectGlobalContext?.targetScopeEs ?? "Pendiente"],
            ["Fuentes seleccionadas", `${selectedCount}`],
            ["Estado del intake", initialSavedIntake?.status ?? "Pendiente"],
          ].map(([label, value]) => (
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4" key={label}>
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
          Uso acumulado del proyecto
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tokens hoy", `${todayUsage.totalTokens}`],
            ["Costo hoy CAD", formatMoney(todayUsage.costCad, "CAD")],
            ["Costo total proyecto CAD", formatMoney(tokenUsage.baselineHistorical.costCad + tokenUsage.cumulative.costCad, "CAD")],
            ["Tokens medidos desde contador", `${tokenUsage.cumulative.totalTokens}`],
          ].map(([label, value]) => (
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4" key={label}>
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
        <p className="brand-kicker">Gate</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Decision del conjunto
        </h2>
        {sourceIntakeGate ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Decision
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {sourceIntakeGate.decision}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {sourceIntakeGate.summary}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {sourceIntakeGate.nextStepRecommendation}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Contenido completo", `${sourceIntakeGate.completePublicContentCount}`],
                ["Acceso parcial", `${sourceIntakeGate.partialPublicContentCount}`],
                ["Alta o media relevancia", `${sourceIntakeGate.highOrMediumCount}`],
                ["Con abstract", `${sourceIntakeGate.abstractCount}`],
                ["Con DOI o landing", `${sourceIntakeGate.doiOrLandingCount}`],
                ["Score promedio", `${sourceIntakeGate.averageRelevanceScore}`],
              ].map(([label, value]) => (
                <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4" key={label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm leading-7 text-[var(--color-muted)]">
            El Paso 2 todavia no se ha ejecutado en esta vista.
          </p>
        )}
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Resolucion por fuente</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Acceso completo, candidatos e intentos
        </h2>
        <div className="mt-6 grid gap-5">
          {sourceAccessResolution?.items.map((item) => (
            <article
              className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
              key={item.sourceId}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-4xl">
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.sourceId}
                  </p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getAccessStatusBadgeClasses(item.status)}`}>
                  {item.status} / {item.kind}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Via resuelta", item.resolvedVia],
                  ["URL final", item.finalUrl ?? "null"],
                  ["Contenido resuelto", item.resolvedContentUrl ?? "null"],
                  ["Idioma", item.languageDetected ?? "null"],
                  ["Confianza", `${item.confidence}`],
                  ["Candidatos", `${item.candidateSummary.length}`],
                  ["Intentos", `${item.attempts.length}`],
                  ["Warnings", `${item.warnings.length}`],
                ].map(([label, value]) => (
                  <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.82)] p-4" key={label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {label}
                    </p>
                    <p className="mt-2 break-all text-sm leading-6 text-[var(--color-ink)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.82)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Candidate summary
                  </p>
                  {item.candidateSummary.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {item.candidateSummary.map((candidate) => (
                        <div className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3" key={`${item.sourceId}-${candidate.url}`}>
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            {candidate.label}
                          </p>
                          <p className="mt-1 break-all text-xs leading-6 text-[var(--color-muted)]">
                            {candidate.url}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                            score {candidate.score} / {candidate.origin}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                      Sin candidatos preservados.
                    </p>
                  )}
                </div>

                <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.82)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Attempts and warnings
                  </p>
                  <div className="mt-3 grid gap-3">
                    {item.attempts.map((attempt, index) => (
                      <div className="rounded-[16px] bg-[rgba(245,244,250,0.92)] p-3" key={`${item.sourceId}-attempt-${index}`}>
                        <p className="text-sm font-semibold text-[var(--color-ink)]">
                          {attempt.step} / {attempt.outcome}
                        </p>
                        <p className="mt-1 break-all text-xs leading-6 text-[var(--color-muted)]">
                          {attempt.url ?? "null"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                          {attempt.detail}
                        </p>
                      </div>
                    ))}
                    {item.warnings.length > 0 ? (
                      <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                        {item.warnings.join(" ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          )) ?? (
            <p className="text-sm leading-7 text-[var(--color-muted)]">
              Aun no hay resultados de resolucion para mostrar.
            </p>
          )}
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Prompts LLM</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Prompts usados para ambiguedad real
        </h2>
        <div className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-7 text-[var(--color-muted)]">
          <p>
            Prompts usados en esta corrida:{" "}
            <span className="font-semibold text-[var(--color-ink)]">
              {sourceAccessResolution?.llmPromptCount ?? 0}
            </span>
          </p>
          <p>
            El Paso 2 usa un solo tipo de prompt semantico: interpretacion de acceso ambiguo.
            Solo se dispara cuando la resolucion deterministica no basta.
          </p>
          {debugSnapshot?.savedAt ? (
            <p>
              Ultimo snapshot:{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {formatStableTimestamp(debugSnapshot.savedAt)}
              </span>
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-5">
          {sourceAccessResolution?.llmPrompts.map((prompt, index) => (
            <article
              className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
              key={`${prompt.sourceId ?? "global"}-${index}`}
            >
              <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                <span>{prompt.label}</span>
                <span>Modelo: {prompt.model}</span>
                <span>Schema: {prompt.schemaName}</span>
                <span>Tracking: {prompt.trackingLabel}</span>
                <span>Source: {prompt.sourceTitle ?? prompt.sourceId ?? "null"}</span>
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Template programado
              </p>
              <pre className="mt-2 overflow-x-auto rounded-[20px] bg-[rgba(53,45,71,0.92)] p-4 text-xs leading-6 text-white">
                {prompt.promptTemplate}
              </pre>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Prompt final expandido
              </p>
              <pre className="mt-2 overflow-x-auto rounded-[20px] bg-[rgba(32,26,46,0.92)] p-4 text-xs leading-6 text-white">
                {prompt.promptText}
              </pre>
            </article>
          )) ?? null}
        </div>

        {!sourceAccessResolution?.llmPrompts.length ? (
          <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
            En esta corrida no hizo falta usar LLM para resolver accesos ambiguos.
          </p>
        ) : null}
      </section>

      {message ? (
        <p className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </main>
  );
}
