"use client";

import { useMemo, useState } from "react";

import {
  type BlueprintLaunchIntake,
  syntheticIntake,
  syntheticProjectData,
} from "@/blueprint_launch/fixtures/synthetic-intake";
import type {
  BlueprintLaunchSavedIntakeOriginalSnapshot,
  BlueprintLaunchSavedIntakeSnapshot,
} from "@/blueprint_launch/server/local-playground-store";
import type {
  BlueprintLaunchIntakeImprovementResult,
  BlueprintLaunchProjectGlobalContext,
  BlueprintLaunchProjectSnapshot,
} from "@/blueprint_launch/server/step1-intake-context";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

const textareaClassName = "brand-textarea";
type Step1IntakeFieldKey = Exclude<keyof BlueprintLaunchIntake, "searchQuery">;

const intakeFields: Array<{
  key: Step1IntakeFieldKey;
  label: string;
  rows: number;
}> = [
  { key: "topic", label: "Tema", rows: 3 },
  { key: "problemContext", label: "Contexto del problema", rows: 5 },
  { key: "researchLine", label: "Linea de investigacion", rows: 2 },
  { key: "academicConstraints", label: "Restricciones academicas", rows: 4 },
  { key: "targetPopulation", label: "Poblacion objetivo", rows: 3 },
  { key: "availableData", label: "Datos disponibles", rows: 4 },
  { key: "preferredMethodology", label: "Metodologia preferida", rows: 3 },
  { key: "advisorNotes", label: "Observaciones del asesor", rows: 4 },
];

type BlueprintLaunchStep1LabProps = {
  initialIntakeImprovementResult: BlueprintLaunchIntakeImprovementResult | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialProjectSnapshot: BlueprintLaunchProjectSnapshot | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSavedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot | null;
  initialTokenUsage: LlmUsageRegistry;
};

function formatStableTimestamp(value: string) {
  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

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

function buildInitialIntake(params: {
  savedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot | null;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
}): BlueprintLaunchIntake {
  const source = params.savedIntakeOriginal?.intake ?? params.savedIntake?.intake ?? syntheticIntake;
  return {
    topic: source.topic ?? "",
    problemContext: source.problemContext ?? "",
    researchLine: source.researchLine ?? "",
    academicConstraints: source.academicConstraints ?? "",
    targetPopulation: source.targetPopulation ?? "",
    availableData: source.availableData ?? "",
    preferredMethodology: source.preferredMethodology ?? "",
    advisorNotes: source.advisorNotes ?? "",
    searchQuery: syntheticIntake.searchQuery,
  };
}

export function BlueprintLaunchStep1Lab({
  initialIntakeImprovementResult,
  initialProjectGlobalContext,
  initialProjectSnapshot,
  initialSavedIntake,
  initialSavedIntakeOriginal,
  initialTokenUsage,
}: BlueprintLaunchStep1LabProps) {
  const [intake, setIntake] = useState<BlueprintLaunchIntake>(
    buildInitialIntake({
      savedIntakeOriginal: initialSavedIntakeOriginal,
      savedIntake: initialSavedIntake,
    }),
  );
  const [savedIntakeOriginal, setSavedIntakeOriginal] =
    useState<BlueprintLaunchSavedIntakeOriginalSnapshot | null>(initialSavedIntakeOriginal);
  const [savedIntakeSnapshot, setSavedIntakeSnapshot] =
    useState<BlueprintLaunchSavedIntakeSnapshot | null>(initialSavedIntake);
  const [projectSnapshot, setProjectSnapshot] =
    useState<BlueprintLaunchProjectSnapshot | null>(initialProjectSnapshot);
  const [intakeImprovementResult, setIntakeImprovementResult] =
    useState<BlueprintLaunchIntakeImprovementResult | null>(initialIntakeImprovementResult);
  const [projectGlobalContext, setProjectGlobalContext] =
    useState<BlueprintLaunchProjectGlobalContext | null>(initialProjectGlobalContext);
  const [tokenUsage, setTokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const completionCount = useMemo(
    () =>
      intakeFields.filter(({ key }) => intake[key].trim().length > 0).length,
    [intake],
  );

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

  const totalProjectCostCad = tokenUsage.baselineHistorical.costCad + tokenUsage.cumulative.costCad;
  const totalProjectCostUsd = tokenUsage.baselineHistorical.costUsd + tokenUsage.cumulative.costUsd;
  const trackedTokenLabel =
    tokenUsage.baselineHistorical.totalTokens === null
      ? "Tokens acumulados medidos desde el contador actual"
      : "Tokens acumulados totales del proyecto";

  function updateField(key: keyof BlueprintLaunchIntake, value: string) {
    setIntake((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleReset() {
    setIntake(syntheticIntake);
  }

  async function handleSaveIntake() {
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/blueprint-launch/intake", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          knowledgeAreaLabel: syntheticProjectData.knowledgeAreaLabel,
          preserveExistingArtifacts: true,
          topic: intake.topic,
          problemContext: intake.problemContext,
          researchLine: intake.researchLine,
          academicConstraints: intake.academicConstraints,
          targetPopulation: intake.targetPopulation,
          availableData: intake.availableData,
          preferredMethodology: intake.preferredMethodology,
          advisorNotes: intake.advisorNotes,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        intakeImprovementResult?: BlueprintLaunchIntakeImprovementResult;
        originalSnapshot?: BlueprintLaunchSavedIntakeOriginalSnapshot;
        projectGlobalContext?: BlueprintLaunchProjectGlobalContext;
        projectSnapshot?: BlueprintLaunchProjectSnapshot;
        snapshot?: BlueprintLaunchSavedIntakeSnapshot;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.snapshot) {
        setSaveError(payload.error ?? "No se pudo guardar el Paso 1 del lab.");
        return;
      }

      setSavedIntakeOriginal(payload.originalSnapshot ?? null);
      setSavedIntakeSnapshot(payload.snapshot);
      setProjectSnapshot(payload.projectSnapshot ?? null);
      setIntakeImprovementResult(payload.intakeImprovementResult ?? null);
      setProjectGlobalContext(payload.projectGlobalContext ?? null);
      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }
      setSaveMessage(
        "Paso 1 guardado. El contexto global y el intake mejorado quedaron persistidos para el resto del pipeline.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 1</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Contexto global del proyecto e intake mejorado
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Esta vista es exclusiva para el Paso 1. Aqui se valida el contexto del
              proyecto, se corrige y normaliza el intake con LLM, y se persiste el
              contexto global que consumiran los pasos posteriores.
            </p>
          </div>

          <div className="grid gap-3 sm:min-w-[280px]">
            <div className="rounded-[24px] bg-[rgba(255,255,255,0.82)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Cobertura del intake
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">
                {completionCount}/{intakeFields.length}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                El mismo intake de Arquitectura se mantiene como caso base de prueba.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Datos del proyecto</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Snapshot del proyecto canonicamente fijado
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Titulo", projectSnapshot?.projectTitle ?? syntheticProjectData.title],
            ["Grado", projectSnapshot?.degreeLevel ?? syntheticProjectData.degreeLevel],
            ["Universidad", projectSnapshot?.university ?? syntheticProjectData.university],
            ["Programa", projectSnapshot?.program ?? syntheticProjectData.program],
            ["Area", projectSnapshot?.knowledgeAreaLabel ?? syntheticProjectData.knowledgeAreaLabel],
            ["Template", projectSnapshot?.templateKey ?? syntheticProjectData.templateKey],
            ["Pais", projectSnapshot?.country ?? syntheticProjectData.country],
            ["Idioma", projectSnapshot?.language ?? syntheticProjectData.language],
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
          Visor de tokens y costo acumulado
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--color-muted)]">
          El contador corre desde hoy y ademas incluye un baseline historico de costo
          previo del proyecto. Como no se proporcionaron tokens historicos, el costo
          total si es acumulable, pero los tokens totales solo estan medidos desde el
          inicio de este registro.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tokens hoy", `${todayUsage.totalTokens}`],
            ["Costo hoy CAD", formatMoney(todayUsage.costCad, "CAD")],
            [trackedTokenLabel, `${tokenUsage.cumulative.totalTokens}`],
            ["Costo total del proyecto CAD", formatMoney(totalProjectCostCad, "CAD")],
            [
              "Baseline historico CAD",
              tokenUsage.baselineHistorical.active
                ? formatMoney(tokenUsage.baselineHistorical.costCad, "CAD")
                : formatMoney(0, "CAD"),
            ],
            ["Costo medido desde hoy CAD", formatMoney(tokenUsage.cumulative.costCad, "CAD")],
            ["Costo total del proyecto USD", formatMoney(totalProjectCostUsd, "USD")],
            [
              "Tokens historicos previos",
              tokenUsage.baselineHistorical.totalTokens === null
                ? "No disponibles"
                : `${tokenUsage.baselineHistorical.totalTokens}`,
            ],
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

        <div className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-7 text-[var(--color-muted)]">
          <p>
            Inicio del registro actual: <span className="font-semibold text-[var(--color-ink)]">{tokenUsage.startedDate}</span>
          </p>
          <p>
            Pricing: <a className="underline underline-offset-2" href={tokenUsage.pricingSourceUrl} rel="noreferrer" target="_blank">{tokenUsage.pricingVersion}</a>
          </p>
          <p>
            FX USD/CAD usado: <span className="font-semibold text-[var(--color-ink)]">{tokenUsage.fxRateUsdToCad}</span> publicado el{" "}
            <span className="font-semibold text-[var(--color-ink)]">{tokenUsage.fxPublishedDate}</span> por{" "}
            <a className="underline underline-offset-2" href={tokenUsage.fxSourceUrl} rel="noreferrer" target="_blank">Bank of Canada</a>
          </p>
          <p>
            Baseline historico:{" "}
            <span className="font-semibold text-[var(--color-ink)]">
              {tokenUsage.baselineHistorical.notes ?? "Sin baseline importado"}
            </span>
          </p>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="brand-kicker">Intake original</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Editor del intake base
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="brand-button-secondary" onClick={handleReset} type="button">
              Restaurar sintetico
            </button>
            <button
              className="brand-button-primary"
              disabled={isSaving}
              onClick={handleSaveIntake}
              type="button"
            >
              {isSaving ? "Guardando..." : "Guardar Paso 1"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          {intakeFields.map((field) => (
            <label className="grid gap-2" key={field.key}>
              <span className="text-sm font-semibold text-[var(--color-ink)]">{field.label}</span>
              <textarea
                className={textareaClassName}
                onChange={(event) => updateField(field.key, event.target.value)}
                rows={field.rows}
                value={intake[field.key]}
              />
            </label>
          ))}
        </div>

        {saveMessage ? (
          <p className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {saveMessage}
          </p>
        ) : null}

        {saveError ? (
          <p className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {saveError}
          </p>
        ) : null}
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <div className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Intake persistido</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Original guardado
          </h2>
          <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
            <span>Estado: {savedIntakeOriginal?.status ?? "Pendiente"}</span>
            <span>
              Guardado:{" "}
              {savedIntakeOriginal?.savedAt
                ? formatStableTimestamp(savedIntakeOriginal.savedAt)
                : "Pendiente"}
            </span>
          </div>
          <div className="mt-6 grid gap-4">
            {savedIntakeOriginal
              ? intakeFields.map((field) => (
                  <div
                    className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                    key={field.key}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {field.label}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--color-ink)]">
                      {savedIntakeOriginal.intake[field.key]}
                    </p>
                  </div>
                ))
              : (
                  <p className="text-sm leading-7 text-[var(--color-muted)]">
                    Todavia no hay un intake original persistido para este paso.
                  </p>
                )}
          </div>
        </div>

        <div className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Intake mejorado</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Salida estructurada del LLM
          </h2>
          <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
            <span>LLM: {intakeImprovementResult?.llmStatus ?? "Pendiente"}</span>
            <span>
              Generado:{" "}
              {intakeImprovementResult?.improvedAt
                ? formatStableTimestamp(intakeImprovementResult.improvedAt)
                : "Pendiente"}
            </span>
          </div>
          <div className="mt-6 grid gap-4">
            {intakeImprovementResult
              ? intakeFields.map((field) => (
                  <div
                    className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                    key={field.key}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {field.label}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--color-ink)]">
                      {intakeImprovementResult.intakeImprovedEs[field.key]}
                    </p>
                  </div>
                ))
              : (
                  <p className="text-sm leading-7 text-[var(--color-muted)]">
                    Todavia no hay una mejora de intake persistida.
                  </p>
                )}
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Prompts LLM</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Prompts finales usados en este paso
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Aqui se muestran los prompts finales efectivamente usados por el Paso 1,
            para que la depuracion futura tenga trazabilidad completa del contexto que
            se envio al modelo.
          </p>
          <div className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.76)] p-4 text-sm leading-7 text-[var(--color-muted)]">
            <p>
              Prompts usados en esta corrida:{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {intakeImprovementResult?.llmPrompts?.length ?? 0}
              </span>
            </p>
            <p>
              Este Paso 1 hoy usa un solo prompt estructurado para mejorar el intake y
              derivar variables canónicas. Si en otra corrida se usaran prompts
              adicionales, esta misma sección los mostrará todos.
            </p>
          </div>

          <div className="mt-6 grid gap-5">
            {(intakeImprovementResult?.llmPrompts ?? []).map((prompt) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                key={prompt.label}
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
                <pre className="mt-2 overflow-x-auto rounded-[20px] bg-[rgba(53,45,71,0.92)] p-4 text-xs leading-6 text-white">
                  {prompt.promptTemplate}
                </pre>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Prompt final expandido
                </p>
                <pre className="mt-4 overflow-x-auto rounded-[20px] bg-[rgba(32,26,46,0.92)] p-4 text-xs leading-6 text-white">
                  {prompt.promptText}
                </pre>
              </article>
            ))}

            {!intakeImprovementResult?.llmPrompts?.length ? (
              <p className="text-sm leading-7 text-[var(--color-muted)]">
                No hay prompts persistidos todavia para este paso.
              </p>
            ) : null}
          </div>
        </div>

        <div className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Notas de mejora</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Politica aplicada y trazabilidad
          </h2>

          <div className="mt-6 grid gap-4">
            {[
              {
                label: "Campos mezclados detectados",
                values: intakeImprovementResult?.detectedMixedLanguageFields ?? [],
              },
              {
                label: "Terminos preservados",
                values: intakeImprovementResult?.preservedTerms ?? [],
              },
              {
                label: "Notas de cambio",
                values: intakeImprovementResult?.changeNotes ?? [],
              },
            ].map((group) => (
              <div
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                key={group.label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {group.label}
                </p>
                {group.values.length > 0 ? (
                  <ul className="mt-3 grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                    {group.values.map((value) => (
                      <li key={value}>- {value}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                    Sin datos para este grupo.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Contexto global</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Artefacto persistido para el resto del pipeline
        </h2>

        {projectGlobalContext ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {[
              ["Canonical topic", projectGlobalContext.canonicalTopicEs],
              ["Problem core", projectGlobalContext.problemCoreEs],
              ["Method preference", projectGlobalContext.methodPreferenceEs ?? "null"],
              ["Target scope", projectGlobalContext.targetScopeEs ?? "null"],
              ["Retrieval brief (EN)", projectGlobalContext.retrievalBriefEn],
            ].map(([label, value]) => (
              <div
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                key={label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {label}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--color-ink)]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm leading-7 text-[var(--color-muted)]">
            El contexto global aparecera aqui cuando guardes el Paso 1.
          </p>
        )}

        <div className="mt-6 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.76)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Reglas del producto
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[20px] bg-[rgba(32,26,46,0.92)] p-4 text-xs leading-6 text-white">
            {JSON.stringify(projectGlobalContext?.productRules ?? null, null, 2)}
          </pre>
          {savedIntakeSnapshot?.savedAt ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Ultimo guardado operativo:{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                {formatStableTimestamp(savedIntakeSnapshot.savedAt)}
              </span>
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
