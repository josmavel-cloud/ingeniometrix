"use client";

import { useMemo, useState } from "react";

import {
  type BlueprintLaunchIntake,
  syntheticProjectData,
  syntheticIntake,
} from "@/blueprint_launch/fixtures/synthetic-intake";
import { BlueprintLaunchReferenceSearch } from "@/blueprint_launch/components/blueprint-launch-reference-search";
import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type { MasterTemplatePlaygroundSnapshot } from "@/blueprint_launch/server/master-template-playground";
import type {
  BlueprintLaunchSavedIntakeOriginalSnapshot,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSearchSnapshot,
} from "@/blueprint_launch/server/local-playground-store";
import type {
  BlueprintLaunchIntakeImprovementResult,
  BlueprintLaunchProjectGlobalContext,
  BlueprintLaunchProjectSnapshot,
} from "@/blueprint_launch/server/step1-intake-context";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

const inputClassName = "brand-input";
const textareaClassName = "brand-textarea";

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

const intakeFields: Array<{
  key: keyof BlueprintLaunchIntake;
  label: string;
  rows?: number;
}> = [
  { key: "topic", label: "Tema", rows: 3 },
  { key: "problemContext", label: "Contexto del problema", rows: 5 },
  { key: "researchLine", label: "Linea de investigacion", rows: 2 },
  { key: "academicConstraints", label: "Restricciones academicas", rows: 4 },
  { key: "targetPopulation", label: "Poblacion objetivo", rows: 3 },
  { key: "availableData", label: "Datos disponibles", rows: 4 },
  { key: "preferredMethodology", label: "Metodologia preferida", rows: 3 },
  { key: "advisorNotes", label: "Observaciones del asesor", rows: 4 },
  { key: "searchQuery", label: "Search query", rows: 3 },
];

type BlueprintLaunchPlaygroundProps = {
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialIntakeImprovementResult: BlueprintLaunchIntakeImprovementResult | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialProjectSnapshot: BlueprintLaunchProjectSnapshot | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSavedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot | null;
  initialSearchSnapshot: BlueprintLaunchSearchSnapshot | null;
  initialTokenUsage: LlmUsageRegistry;
  templateSnapshot: MasterTemplatePlaygroundSnapshot;
};

function buildInitialIntake(snapshot: BlueprintLaunchSavedIntakeSnapshot | null): BlueprintLaunchIntake {
  if (!snapshot) {
    return syntheticIntake;
  }

  return {
    topic: snapshot.intake.topic ?? "",
    problemContext: snapshot.intake.problemContext ?? "",
    researchLine: snapshot.intake.researchLine ?? "",
    academicConstraints: snapshot.intake.academicConstraints ?? "",
    targetPopulation: snapshot.intake.targetPopulation ?? "",
    availableData: snapshot.intake.availableData ?? "",
    preferredMethodology: snapshot.intake.preferredMethodology ?? "",
    advisorNotes: snapshot.intake.advisorNotes ?? "",
    searchQuery: snapshot.derivedSearchQuery ?? syntheticIntake.searchQuery,
  };
}

export function BlueprintLaunchPlayground({
  initialDebugSnapshot,
  initialIntakeImprovementResult,
  initialProjectGlobalContext,
  initialProjectSnapshot,
  initialSavedIntake,
  initialSavedIntakeOriginal,
  initialSearchSnapshot,
  initialTokenUsage,
  templateSnapshot,
}: BlueprintLaunchPlaygroundProps) {
  const [intake, setIntake] = useState<BlueprintLaunchIntake>(buildInitialIntake(initialSavedIntake));
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(
    initialDebugSnapshot,
  );
  const [projectSnapshot, setProjectSnapshot] =
    useState<BlueprintLaunchProjectSnapshot | null>(initialProjectSnapshot);
  const [savedIntakeOriginal, setSavedIntakeOriginal] =
    useState<BlueprintLaunchSavedIntakeOriginalSnapshot | null>(initialSavedIntakeOriginal);
  const [intakeImprovementResult, setIntakeImprovementResult] =
    useState<BlueprintLaunchIntakeImprovementResult | null>(initialIntakeImprovementResult);
  const [projectGlobalContext, setProjectGlobalContext] =
    useState<BlueprintLaunchProjectGlobalContext | null>(initialProjectGlobalContext);
  const [savedIntakeSnapshot, setSavedIntakeSnapshot] =
    useState<BlueprintLaunchSavedIntakeSnapshot | null>(initialSavedIntake);
  const [searchSnapshotSeed, setSearchSnapshotSeed] =
    useState<BlueprintLaunchSearchSnapshot | null>(initialSearchSnapshot);
  const [tokenUsage, setTokenUsage] = useState<LlmUsageRegistry>(initialTokenUsage);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [intakeSaveMessage, setIntakeSaveMessage] = useState<string | null>(null);
  const [intakeSaveError, setIntakeSaveError] = useState<string | null>(null);
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  const completionCount = useMemo(
    () =>
      intakeFields.filter(({ key }) => intake[key].trim().length > 0).length,
    [intake],
  );
  const tokenUsageToday = useMemo(() => {
    const todayDate = getTodayTorontoDate();
    return (
      tokenUsage.byDate[todayDate] ?? {
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
  const debugItems = useMemo(() => {
    if (!debugSnapshot) {
      return [
        { label: "Modo de ejecucion", value: "Local playground" },
        { label: "Persistencia", value: "Backend local + artifacts-local" },
        { label: "Providers", value: "LLM opcional + OpenAlex/Crossref en fuentes" },
        { label: "Fuente de entrada", value: "Datos sinteticos editables" },
        { label: "Ruta de prueba", value: "/blueprint-launch" },
        { label: "Ultimo evento", value: "Sin corridas registradas en este hilo" },
        { label: "Campos completos", value: `${completionCount}/${intakeFields.length}` },
      ];
    }

    return [
      { label: "Modo de ejecucion", value: "Local playground" },
      { label: "Persistencia", value: "Backend local + artifacts-local" },
      { label: "Paso 1", value: intakeImprovementResult?.llmStatus ?? "Pendiente" },
      { label: "Tokens hoy", value: `${tokenUsageToday.totalTokens}` },
      { label: "Costo hoy CAD", value: formatMoney(tokenUsageToday.costCad, "CAD") },
      { label: "Ultimo evento", value: debugSnapshot.eventType },
      { label: "Ultimo guardado", value: formatStableTimestamp(debugSnapshot.savedAt) },
      { label: "Area del conocimiento", value: debugSnapshot.knowledgeAreaLabel ?? "No definida" },
      { label: "Planner", value: debugSnapshot.plannerStatus },
      { label: "Search query", value: debugSnapshot.search.searchQuery ?? "Pendiente" },
      {
        label: "Resultados / seleccionadas",
        value: `${debugSnapshot.search.totalResults} / ${debugSnapshot.search.selectedCount}`,
      },
      {
        label: "Gate inicial",
        value: debugSnapshot.sourceIntakeGate?.decision ?? "Pendiente",
      },
      {
        label: "Contenido completo resuelto",
        value: debugSnapshot.sourceAccessResolution
          ? `${debugSnapshot.sourceAccessResolution.completePublicCount}`
          : "Pendiente",
      },
      {
        label: "Completar evidencia",
        value: debugSnapshot.evidenceCompletion?.decision ?? "Pendiente",
      },
      {
        label: "Materializacion local",
        value: debugSnapshot.contentMaterialization
          ? `${debugSnapshot.contentMaterialization.materializedCount}`
          : "Pendiente",
      },
      {
        label: "Evidence packs",
        value: debugSnapshot.evidencePacksArtifact?.extractionMode ?? "Pendiente",
      },
      {
        label: "Extraccion de senales",
        value: debugSnapshot.sourceSignalExtraction
          ? `${debugSnapshot.sourceSignalExtraction.sourceCount} fuente(s) | ${debugSnapshot.sourceSignalExtraction.totalSnippetCount} snippets | ${debugSnapshot.sourceSignalExtraction.totalAssetCount} assets`
          : "Pendiente",
      },
      {
        label: "Consolidacion de evidencia",
        value: debugSnapshot.consolidatedEvidenceArtifact
          ? `${debugSnapshot.consolidatedEvidenceArtifact.overallReadiness} | listas ${debugSnapshot.consolidatedEvidenceArtifact.readySectionCount}`
          : "Pendiente",
      },
      {
        label: "Metodo candidato",
        value: debugSnapshot.consolidatedEvidenceArtifact?.proposalMethodCandidate?.methodFamily
          ? `${debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.methodFamily} | ${debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.supportLevel}`
          : "Pendiente",
      },
      {
        label: "PDFs verificados",
        value: `${debugSnapshot.search.pdfAccessibleCount}`,
      },
      {
        label: "PDFs descargados localmente",
        value: debugSnapshot.contentMaterialization
          ? `${debugSnapshot.contentMaterialization.pdfCount}`
          : "Pendiente",
      },
      {
        label: "Campos completos",
        value: `${debugSnapshot.intakeCompletedFields}/${debugSnapshot.intakeTotalFields}`,
      },
    ];
  }, [completionCount, debugSnapshot, intakeImprovementResult?.llmStatus, tokenUsageToday.costCad, tokenUsageToday.totalTokens]);

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
    setIsSavingIntake(true);
    setIntakeSaveError(null);
    setIntakeSaveMessage(null);

    try {
      const response = await fetch("/api/blueprint-launch/intake", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          knowledgeAreaLabel: syntheticProjectData.knowledgeAreaLabel,
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
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        intakeImprovementResult?: BlueprintLaunchIntakeImprovementResult;
        originalSnapshot?: BlueprintLaunchSavedIntakeOriginalSnapshot;
        projectGlobalContext?: BlueprintLaunchProjectGlobalContext;
        projectSnapshot?: BlueprintLaunchProjectSnapshot;
        snapshot?: BlueprintLaunchSavedIntakeSnapshot;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.snapshot) {
        setIntakeSaveError(payload.error ?? "No se pudo guardar el intake local.");
        return;
      }

      setSavedIntakeSnapshot(payload.snapshot);
      setSavedIntakeOriginal(payload.originalSnapshot ?? null);
      setProjectSnapshot(payload.projectSnapshot ?? null);
      setIntakeImprovementResult(payload.intakeImprovementResult ?? null);
      setProjectGlobalContext(payload.projectGlobalContext ?? null);
      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }
      setDebugSnapshot(payload.debugSnapshot ?? null);
      setSearchSnapshotSeed(null);
      setSearchResetKey((current) => current + 1);
      setIntakeSaveMessage(
        "Intake local guardado con el mismo payload base del flujo principal.",
      );
    } finally {
      setIsSavingIntake(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="brand-kicker">Blueprint Launch</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Laboratorio local para blueprint con datos sinteticos
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Esta pagina vive solo para probar el flujo del intake, la
              recuperacion de fuentes y una generacion inicial del texto del
              blueprint sin tocar el workspace principal.
            </p>
          </div>

          <div className="grid gap-3 sm:min-w-[260px]">
            <div className="rounded-[24px] bg-[rgba(255,255,255,0.82)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Cobertura del intake
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">
                {completionCount}/{intakeFields.length}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Todos los campos se cargan con datos sinteticos editables.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Paso 1</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Contexto global del proyecto e intake mejorado
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--color-muted)]">
          Este visor exclusivo del Paso 1 muestra el proyecto base, el intake original,
          la mejora aplicada con LLM y el contexto global persistido que usaran los
          siguientes pasos sin repetir el mismo contexto en cada prompt.
        </p>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {[
            { label: "LLM mejora intake", value: intakeImprovementResult?.llmStatus ?? "pendiente" },
            { label: "Canonical topic", value: projectGlobalContext?.canonicalTopicEs ?? "pendiente" },
            { label: "Problem core", value: projectGlobalContext?.problemCoreEs ?? "pendiente" },
            { label: "Method preference", value: projectGlobalContext?.methodPreferenceEs ?? "pendiente" },
          ].map((item) => (
            <div
              className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
              key={item.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Datos del proyecto
            </p>
            <div className="mt-4 grid gap-3">
              {[
                { label: "Titulo", value: projectSnapshot?.projectTitle ?? syntheticProjectData.title },
                { label: "Grado", value: projectSnapshot?.degreeLevel ?? syntheticProjectData.degreeLevel },
                { label: "Universidad", value: projectSnapshot?.university ?? syntheticProjectData.university },
                { label: "Programa", value: projectSnapshot?.program ?? syntheticProjectData.program },
                { label: "Area", value: projectSnapshot?.knowledgeAreaLabel ?? syntheticProjectData.knowledgeAreaLabel },
                { label: "Template", value: projectSnapshot?.templateKey ?? syntheticProjectData.templateKey },
                { label: "Pais", value: projectSnapshot?.country ?? syntheticProjectData.country },
                { label: "Idioma", value: projectSnapshot?.language ?? syntheticProjectData.language },
                { label: "Estado", value: projectSnapshot?.status ?? syntheticProjectData.status },
                { label: "Modo", value: projectSnapshot?.mode ?? syntheticProjectData.mode },
              ].map((item) => (
                <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3" key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Visor de tokens y costo API
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              Desde hoy se registra el consumo real de la API. El costo en CAD usa la
              ultima tasa publicada por Bank of Canada disponible hoy:
              {" "}
              <strong>{tokenUsage.fxRateUsdToCad}</strong>
              {" "}USD/CAD publicada el <strong>{tokenUsage.fxPublishedDate}</strong>.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Hoy
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                  Calls: <strong>{tokenUsageToday.calls}</strong>
                  {" | "}Tokens: <strong>{tokenUsageToday.totalTokens}</strong>
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                  Input: {tokenUsageToday.inputTokens}
                  {" | "}Cached: {tokenUsageToday.cachedInputTokens}
                  {" | "}Output: {tokenUsageToday.outputTokens}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                  USD: {formatMoney(tokenUsageToday.costUsd, "USD")}
                  {" | "}CAD: {formatMoney(tokenUsageToday.costCad, "CAD")}
                </p>
              </div>
              <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Acumulado
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                  Calls: <strong>{tokenUsage.cumulative.calls}</strong>
                  {" | "}Tokens: <strong>{tokenUsage.cumulative.totalTokens}</strong>
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                  Input: {tokenUsage.cumulative.inputTokens}
                  {" | "}Cached: {tokenUsage.cumulative.cachedInputTokens}
                  {" | "}Output: {tokenUsage.cumulative.outputTokens}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                  USD: {formatMoney(tokenUsage.cumulative.costUsd, "USD")}
                  {" | "}CAD: {formatMoney(tokenUsage.cumulative.costCad, "CAD")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Intake original
            </p>
            <div className="mt-4 grid gap-3">
              {[
                { label: "Tema", value: savedIntakeOriginal?.intake.topic ?? intake.topic },
                { label: "Contexto del problema", value: savedIntakeOriginal?.intake.problemContext ?? intake.problemContext },
                { label: "Linea de investigacion", value: savedIntakeOriginal?.intake.researchLine ?? intake.researchLine },
                { label: "Restricciones academicas", value: savedIntakeOriginal?.intake.academicConstraints ?? intake.academicConstraints },
                { label: "Poblacion objetivo", value: savedIntakeOriginal?.intake.targetPopulation ?? intake.targetPopulation },
                { label: "Datos disponibles", value: savedIntakeOriginal?.intake.availableData ?? intake.availableData },
                { label: "Metodologia preferida", value: savedIntakeOriginal?.intake.preferredMethodology ?? intake.preferredMethodology },
                { label: "Observaciones del asesor", value: savedIntakeOriginal?.intake.advisorNotes ?? intake.advisorNotes },
              ].map((item) => (
                <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white px-4 py-3" key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Intake mejorado
            </p>
            <div className="mt-4 grid gap-3">
              {[
                { label: "Tema", value: intakeImprovementResult?.intakeImprovedEs.topic ?? savedIntakeSnapshot?.intake.topic ?? "Pendiente" },
                { label: "Contexto del problema", value: intakeImprovementResult?.intakeImprovedEs.problemContext ?? savedIntakeSnapshot?.intake.problemContext ?? "Pendiente" },
                { label: "Linea de investigacion", value: intakeImprovementResult?.intakeImprovedEs.researchLine ?? savedIntakeSnapshot?.intake.researchLine ?? "Pendiente" },
                { label: "Restricciones academicas", value: intakeImprovementResult?.intakeImprovedEs.academicConstraints ?? savedIntakeSnapshot?.intake.academicConstraints ?? "Pendiente" },
                { label: "Poblacion objetivo", value: intakeImprovementResult?.intakeImprovedEs.targetPopulation ?? savedIntakeSnapshot?.intake.targetPopulation ?? "Pendiente" },
                { label: "Datos disponibles", value: intakeImprovementResult?.intakeImprovedEs.availableData ?? savedIntakeSnapshot?.intake.availableData ?? "Pendiente" },
                { label: "Metodologia preferida", value: intakeImprovementResult?.intakeImprovedEs.preferredMethodology ?? savedIntakeSnapshot?.intake.preferredMethodology ?? "Pendiente" },
                { label: "Observaciones del asesor", value: intakeImprovementResult?.intakeImprovedEs.advisorNotes ?? savedIntakeSnapshot?.intake.advisorNotes ?? "Pendiente" },
              ].map((item) => (
                <div className="rounded-[20px] border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)] px-4 py-3" key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Notas de mejora del intake
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Campos mixtos detectados
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                  {intakeImprovementResult?.detectedMixedLanguageFields.join(" | ") || "Sin mezcla detectada o pendiente"}
                </p>
              </div>
              <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Terminos preservados
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                  {intakeImprovementResult?.preservedTerms.join(" | ") || "Pendiente"}
                </p>
              </div>
              <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Notas de cambio
                </p>
                <div className="mt-2 grid gap-2">
                  {(intakeImprovementResult?.changeNotes ?? ["Pendiente"]).map((note) => (
                    <p className="text-sm leading-6 text-[var(--color-ink)]" key={note}>
                      * {note}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Contexto global persistido
            </p>
            <div className="mt-4 grid gap-3">
              {[
                { label: "Canonical topic ES", value: projectGlobalContext?.canonicalTopicEs ?? "Pendiente" },
                { label: "Problem core ES", value: projectGlobalContext?.problemCoreEs ?? "Pendiente" },
                { label: "Method preference ES", value: projectGlobalContext?.methodPreferenceEs ?? "Pendiente" },
                { label: "Target scope ES", value: projectGlobalContext?.targetScopeEs ?? "Pendiente" },
                { label: "Retrieval brief EN", value: projectGlobalContext?.retrievalBriefEn ?? "Pendiente" },
              ].map((item) => (
                <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white px-4 py-3" key={item.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Proyecto</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Datos del proyecto
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
          Este bloque resume el contexto sintetico del proyecto usado para esta
          prueba local del blueprint.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4 md:col-span-2 xl:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Titulo
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
              {syntheticProjectData.title}
            </p>
          </div>

          {[
            { label: "Grado", value: syntheticProjectData.degreeLevel },
            { label: "Universidad", value: syntheticProjectData.university },
            { label: "Programa", value: syntheticProjectData.program },
            { label: "Area del conocimiento", value: syntheticProjectData.knowledgeAreaLabel },
            { label: "Template", value: syntheticProjectData.templateKey },
            { label: "Pais", value: syntheticProjectData.country },
            { label: "Idioma", value: syntheticProjectData.language },
            { label: "Estado", value: syntheticProjectData.status },
            { label: "Modo", value: syntheticProjectData.mode },
          ].map((item) => (
            <div
              className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
              key={item.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="surface-panel rounded-[32px] p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="brand-kicker">Intake editable</p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  Todos los campos del intake
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className="brand-button-secondary px-4 py-2 text-sm font-semibold"
                  onClick={handleReset}
                  type="button"
                >
                  Restaurar datos sinteticos
                </button>
                <button
                  className="brand-button-primary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                  disabled={isSavingIntake}
                  onClick={handleSaveIntake}
                  type="button"
                >
                  {isSavingIntake ? "Guardando..." : "Guardar intake local"}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Formato de guardado principal
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                Se guarda con el mismo payload base del programa principal:
                `topic`, `problemContext`, `researchLine`, `academicConstraints`,
                `targetPopulation`, `availableData`, `preferredMethodology` y
                `advisorNotes`, junto con el area del conocimiento proveniente del
                paso previo del proyecto. `searchQuery` no se guarda desde este
                formulario; se deriva durante la busqueda.
              </p>
              {savedIntakeSnapshot ? (
                <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
                  Ultimo guardado:{" "}
                  <strong>{formatStableTimestamp(savedIntakeSnapshot.savedAt)}</strong>
                  {" "}| Estado: <strong>{savedIntakeSnapshot.status}</strong>
                  {" "}| Area:{" "}
                  <strong>{savedIntakeSnapshot.projectContext.knowledgeAreaLabel ?? "No definida"}</strong>
                </p>
              ) : null}
              {intakeSaveMessage ? (
                <p className="mt-3 text-sm text-emerald-700">{intakeSaveMessage}</p>
              ) : null}
              {intakeSaveError ? (
                <p className="mt-3 text-sm text-rose-600">{intakeSaveError}</p>
              ) : null}
            </div>

            <div className="mt-6 grid gap-5">
              {intakeFields.map(({ key, label, rows }) => (
                <label className="grid gap-2" key={key}>
                  <span className="text-sm font-semibold text-[var(--color-muted)]">
                    {label}
                  </span>
                  {rows && rows > 2 ? (
                    <textarea
                      className={textareaClassName}
                      onChange={(event) => updateField(key, event.target.value)}
                      rows={rows}
                      value={intake[key]}
                    />
                  ) : (
                    <input
                      className={inputClassName}
                      onChange={(event) => updateField(key, event.target.value)}
                      value={intake[key]}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          <section className="brand-card-mint rounded-[32px] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              DevOps debug
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Estado local de depuracion
            </h2>
            <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.78)]">
              Este bloque muestra solo la ultima corrida registrada por el backend
              del laboratorio. Todas las ejecuciones quedan archivadas en
              `artifacts-local`, pero aqui solo se expone el snapshot mas reciente.
            </p>

            <div className="mt-6 grid gap-3">
              {debugItems.map((item) => (
                <div
                  className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3"
                  key={item.label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Keywords necesarias
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                  {debugSnapshot?.keywordGroups.necessary.join(" | ") || "Sin corrida aun."}
                </p>
              </div>
              <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Keywords complementarias
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                  {debugSnapshot?.keywordGroups.complementary.join(" | ") || "Sin corrida aun."}
                </p>
              </div>
              <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Keywords no obligatorias
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                  {debugSnapshot?.keywordGroups.optional.join(" | ") || "Sin corrida aun."}
                </p>
              </div>
              {debugSnapshot?.plannerErrorMessage ? (
                <div className="rounded-[20px] border border-[rgba(233,87,87,0.16)] bg-[rgba(255,236,238,0.72)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Error del planner
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.plannerErrorMessage}
                  </p>
                </div>
              ) : null}
              {debugSnapshot?.sourceIntakeGate ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Resolucion de acceso completo
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.sourceAccessResolution
                      ? `${debugSnapshot.sourceAccessResolution.completePublicCount} completas | ${debugSnapshot.sourceAccessResolution.partialPublicCount} parciales | ${debugSnapshot.sourceAccessResolution.metadataOnlyCount} metadata | ${debugSnapshot.sourceAccessResolution.unresolvedCount} sin resolver`
                    : "Sin resolucion visible."}
                  </p>
                </div>
              ) : null}
              {debugSnapshot?.sourceAccessResolution ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Preview de acceso por fuente
                  </p>
                  <div className="mt-2 grid gap-2">
                    {debugSnapshot.sourceAccessResolution.previewItems.map((item) => (
                      <p className="text-sm leading-6 text-[var(--color-ink)]" key={item.sourceId}>
                        <strong>{item.title}</strong>
                        {" | "}Estado: {item.status}
                        {" | "}Tipo: {item.kind}
                        {" | "}Via: {item.resolvedVia}
                        {" | "}Idioma: {item.languageDetected ?? "n/d"}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {debugSnapshot?.sourceIntakeGate ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Gate inicial de fuentes
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.sourceIntakeGate.decision}: {debugSnapshot.sourceIntakeGate.summary}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Seleccionadas: <strong>{debugSnapshot.sourceIntakeGate.selectedCount}</strong>
                    {" | "}ALTO/MEDIO: <strong>{debugSnapshot.sourceIntakeGate.highOrMediumCount}</strong>
                    {" | "}Abstract: <strong>{debugSnapshot.sourceIntakeGate.abstractCount}</strong>
                    {" | "}DOI/Landing: <strong>{debugSnapshot.sourceIntakeGate.doiOrLandingCount}</strong>
                    {" | "}Completo: <strong>{debugSnapshot.sourceIntakeGate.completePublicContentCount}</strong>
                    {" | "}Parcial: <strong>{debugSnapshot.sourceIntakeGate.partialPublicContentCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Promedio score: <strong>{debugSnapshot.sourceIntakeGate.averageRelevanceScore.toFixed(2)}</strong>
                  </p>
                  {debugSnapshot.sourceIntakeGate.warnings.length > 0 ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                      Alertas: {debugSnapshot.sourceIntakeGate.warnings.join(" | ")}
                    </p>
                  ) : null}
                  {debugSnapshot.sourceIntakeGate.blockingReasons.length > 0 ? (
                    <p className="mt-2 text-sm leading-6 text-rose-700">
                      Bloqueos: {debugSnapshot.sourceIntakeGate.blockingReasons.join(" | ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {debugSnapshot?.evidenceCompletion ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Completar evidencia
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.evidenceCompletion.decision}: {debugSnapshot.evidenceCompletion.reason}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Tarjetas: <strong>{debugSnapshot.evidenceCompletion.cardCount}</strong>
                    {" | "}Desde abstract:{" "}
                    <strong>{debugSnapshot.evidenceCompletion.completedFromAbstractCount}</strong>
                    {" | "}Solo metadata:{" "}
                    <strong>{debugSnapshot.evidenceCompletion.completedFromMetadataCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Usables: <strong>{debugSnapshot.evidenceCompletion.usableCount}</strong>
                    {" | "}Apoyo debil: <strong>{debugSnapshot.evidenceCompletion.weakSupportCount}</strong>
                    {" | "}Fuera de foco: <strong>{debugSnapshot.evidenceCompletion.offTopicCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Metodologia: <strong>{debugSnapshot.evidenceCompletion.methodologySupportCount}</strong>
                    {" | "}Marco: <strong>{debugSnapshot.evidenceCompletion.frameworkSupportCount}</strong>
                  </p>
                  {debugSnapshot.evidenceCompletion.previewCards.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {debugSnapshot.evidenceCompletion.previewCards.map((card) => (
                        <p className="text-sm leading-6 text-[var(--color-ink)]" key={card.referenceId}>
                          <strong>{card.title}</strong>
                          {" | "}Aplicabilidad: {card.applicabilityToProject}
                          {" | "}Utilidad: {card.usefulnessLabel}
                          {" | "}Secciones:{" "}
                          {card.supportsSectionKeys.length > 0
                            ? card.supportsSectionKeys.join(", ")
                            : "n/d"}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {debugSnapshot?.contentMaterialization ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Materializar contenido completo
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    Materializadas: <strong>{debugSnapshot.contentMaterialization.materializedCount}</strong>
                    {" | "}PDF: <strong>{debugSnapshot.contentMaterialization.pdfCount}</strong>
                    {" | "}Web: <strong>{debugSnapshot.contentMaterialization.webCount}</strong>
                    {" | "}Fallos: <strong>{debugSnapshot.contentMaterialization.failedCount}</strong>
                  </p>
                  <div className="mt-2 grid gap-2">
                    {debugSnapshot.contentMaterialization.previewItems.map((item) => (
                      <p className="text-sm leading-6 text-[var(--color-ink)]" key={item.sourceId}>
                        <strong>{item.title}</strong>
                        {" | "}Estado: {item.materializationStatus}
                        {" | "}Tipo: {item.storedKind}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {debugSnapshot?.sourceSignalExtraction ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Extraccion de senales - Paso 5
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.sourceSignalExtraction.extractionMode}
                    {" | "}fuentes: <strong>{debugSnapshot.sourceSignalExtraction.sourceCount}</strong>
                    {" | "}PDF input: <strong>{debugSnapshot.sourceSignalExtraction.pdfInputCount}</strong>
                    {" | "}web: <strong>{debugSnapshot.sourceSignalExtraction.webInputCount}</strong>
                    {" | "}abstract-only: <strong>{debugSnapshot.sourceSignalExtraction.abstractOnlyCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Snippets: <strong>{debugSnapshot.sourceSignalExtraction.totalSnippetCount}</strong>
                    {" | "}Assets: <strong>{debugSnapshot.sourceSignalExtraction.totalAssetCount}</strong>
                    {" | "}Imagenes: <strong>{debugSnapshot.sourceSignalExtraction.imageAssetCount}</strong>
                    {" | "}Tablas: <strong>{debugSnapshot.sourceSignalExtraction.tableAssetCount}</strong>
                    {" | "}Ecuaciones: <strong>{debugSnapshot.sourceSignalExtraction.equationAssetCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Warnings: <strong>{debugSnapshot.sourceSignalExtraction.warningCount}</strong>
                  </p>
                  {debugSnapshot.sourceSignalExtraction.warnings.length > 0 ? (
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      {debugSnapshot.sourceSignalExtraction.warnings.join(" | ")}
                    </p>
                  ) : null}
                  <div className="mt-2 grid gap-2">
                    {debugSnapshot.sourceSignalExtraction.previewSources.map((source) => (
                      <div className="rounded-[16px] border border-[rgba(23,19,31,0.06)] bg-white/72 px-3 py-2" key={source.sourceId}>
                        <p className="text-sm leading-6 text-[var(--color-ink)]">
                          <strong>{source.sourceId}</strong>
                          {" | "}input: {source.inputMode}
                          {" | "}relevancia: {source.topicRelevance}
                          {" | "}utilidad: {source.proposalUsefulness}
                          {" | "}idioma: {source.detectedLanguage ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          titulo: {source.title}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          primary: {source.primaryPath ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          secondary: {source.secondaryPath ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-ink)]">
                          overview: {source.sourceOverview ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          secciones: {source.supportsSectionKeys.join(", ") || "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          method hints: {source.methodologyHints.join(" | ") || "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          framework hints: {source.frameworkHints.join(" | ") || "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-ink)]">
                          P: {source.problemSignal ?? "n/d"} {" | "} M: {source.methodSignal ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-ink)]">
                          Ctx: {source.contextSignal ?? "n/d"} {" | "} F: {source.findingSignal ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-ink)]">
                          Lim: {source.limitationSignal ?? "n/d"} {" | "} Fut: {source.futureLineSignal ?? "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          pdf sections: {source.pdfSectionsAvailable.join(", ") || "n/d"}
                        </p>
                        <p className="text-sm leading-6 text-[var(--color-muted)]">
                          snippets: {source.snippetCount}
                          {" | "}assets: {source.assetCount}
                          {" | "}eq: {source.equationAssetCount}
                          {" | "}tables: {source.tableAssetCount}
                          {" | "}images: {source.imageAssetCount}
                        </p>
                        {source.warnings.length > 0 ? (
                          <p className="text-sm leading-6 text-amber-800">
                            warnings: {source.warnings.join(" | ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {debugSnapshot?.evidencePacksArtifact ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Evidence packs
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.evidencePacksArtifact.extractionMode} | packs:{" "}
                    <strong>{debugSnapshot.evidencePacksArtifact.packCount}</strong>
                    {" | "}warnings:{" "}
                    <strong>{debugSnapshot.evidencePacksArtifact.warningCount}</strong>
                  </p>
                  <div className="mt-2 grid gap-2">
                    {debugSnapshot.evidencePacksArtifact.previewPacks.map((pack) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={pack.sourceId}>
                        <strong>{pack.sourceId}</strong>
                        {" | "}P: {pack.problemSignal ?? "n/a"}
                        {" | "}M: {pack.methodSignal ?? "n/a"}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {debugSnapshot?.consolidatedEvidenceArtifact ? (
                <div className="rounded-[20px] border border-[rgba(23,19,31,0.08)] bg-white/72 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Consolidacion de evidencia - Paso 6
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                    {debugSnapshot.consolidatedEvidenceArtifact.consolidationMode}
                    {" | "}overall: <strong>{debugSnapshot.consolidatedEvidenceArtifact.overallReadiness}</strong>
                    {" | "}ready: <strong>{debugSnapshot.consolidatedEvidenceArtifact.readySectionCount}</strong>
                    {" | "}partial: <strong>{debugSnapshot.consolidatedEvidenceArtifact.partialSectionCount}</strong>
                    {" | "}low: <strong>{debugSnapshot.consolidatedEvidenceArtifact.lowSectionCount}</strong>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    metodos: {debugSnapshot.consolidatedEvidenceArtifact.dominantMethods.join(" | ") || "n/d"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    frameworks: {debugSnapshot.consolidatedEvidenceArtifact.dominantFrameworks.join(" | ") || "n/d"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    gaps: <strong>{debugSnapshot.consolidatedEvidenceArtifact.evidenceGapCount}</strong>
                    {" | "}direcciones: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalDirectionCount}</strong>
                    {" | "}blocking: <strong>{debugSnapshot.consolidatedEvidenceArtifact.blockingRequirementCount}</strong>
                    {" | "}recommended: <strong>{debugSnapshot.consolidatedEvidenceArtifact.recommendedRequirementCount}</strong>
                  </p>
                  {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                      metodo candidato: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.methodFamily ?? "n/d"}</strong>
                      {" | "}diseno: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.researchDesign ?? "n/d"}</strong>
                      {" | "}alcance: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.scopeStatus}</strong>
                      {" | "}soporte: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.supportLevel}</strong>
                    </p>
                  ) : null}
                  {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate?.techniques.length ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      tecnicas: {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.techniques.join(" | ")}
                    </p>
                  ) : null}
                  {debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      framework candidato: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate.coreFramework ?? "n/d"}</strong>
                      {" | "}apoyos: {debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate.supportingFrameworks.join(" | ") || "n/d"}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    paquetes de secciones debiles: <strong>{debugSnapshot.consolidatedEvidenceArtifact.weakSectionCompletionCount}</strong>
                  </p>
                  <div className="mt-2 grid gap-2">
                    {debugSnapshot.consolidatedEvidenceArtifact.previewSections.map((section) => (
                      <p className="text-sm leading-6 text-[var(--color-ink)]" key={section.sectionKey}>
                        <strong>{section.sectionKey}</strong>
                        {" | "}readiness: {section.readiness}
                        {" | "}draft: {section.enoughToDraft ? "si" : "no"}
                        {" | "}sources: {section.sourceCount}
                        {" | "}snippets: {section.snippetCount}
                        {" | "}assets: {section.assetCount}
                        {" | "}faltantes: {section.missingElements.join(" / ") || "n/d"}
                        </p>
                      ))}
                      {debugSnapshot.consolidatedEvidenceArtifact.previewWeakSections.map((section) => (
                        <p className="text-sm leading-6 text-[var(--color-muted)]" key={`weak-${section.sectionKey}`}>
                          weak {section.sectionKey}
                          {" | "}estado: {section.draftabilityStatus}
                          {" | "}evidence: {section.evidenceBackedPointCount}
                          {" | "}bridges: {section.inferenceBridgeCount}
                          {" | "}assumptions: {section.assumptionCount}
                          {" | "}faltantes: {section.missingEvidence.join(" / ") || "n/d"}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
            </div>
          </section>
        </div>

        <BlueprintLaunchReferenceSearch
          debugSnapshot={debugSnapshot}
          initialSearchSnapshot={searchSnapshotSeed}
          key={`reference-search-${searchResetKey}`}
          onDebugSnapshotChange={setDebugSnapshot}
          savedIntake={savedIntakeSnapshot}
        />

        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Plantilla</p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Resumen del MasterTemplate
              </h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Este resumen describe la estructura y las reglas base del master
                template que usa el sistema para orientar el blueprint y los
                entregables de prueba.
              </p>
            </div>

            <a
              className="brand-button-primary px-5 py-3 text-sm font-semibold"
              href="/api/blueprint-launch/master-template/docx"
            >
              Descargar plantilla en Word
            </a>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Template", value: templateSnapshot.templateName },
              { label: "Key", value: templateSnapshot.templateKey },
              { label: "Version", value: templateSnapshot.versionLabel },
              { label: "Origen", value: templateSnapshot.source },
              { label: "Metodo", value: templateSnapshot.methodologyMode },
              { label: "Citas", value: templateSnapshot.citationStyle },
              {
                label: "Secciones",
                value: `${templateSnapshot.sectionCount} total / ${templateSnapshot.requiredSectionCount} obligatorias`,
              },
              {
                label: "Campos de portada",
                value: `${templateSnapshot.coverFieldCount}`,
              },
            ].map((item) => (
              <div
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                key={item.label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Formato base
              </p>
              <div className="mt-4 grid gap-3">
                {[
                  { label: "Papel", value: templateSnapshot.format.paperSize },
                  { label: "Margenes cm", value: templateSnapshot.format.marginsCm },
                  {
                    label: "Parrafo",
                    value: `${templateSnapshot.format.fontFamily} ${templateSnapshot.format.fontSizePt} pt / ${templateSnapshot.format.lineSpacing}`,
                  },
                  {
                    label: "Alineacion",
                    value: templateSnapshot.format.paragraphAlignment,
                  },
                  {
                    label: "Titulos",
                    value: templateSnapshot.format.titleNumbering,
                  },
                  {
                    label: "Cita inline",
                    value: templateSnapshot.format.citationInlineStyle,
                  },
                  {
                    label: "Referencias",
                    value: templateSnapshot.format.referenceOrdering,
                  },
                  {
                    label: "Tablas/Figuras",
                    value: `${templateSnapshot.format.tableCaptionPosition} / ${templateSnapshot.format.figureCaptionPosition}`,
                  },
                ].map((item) => (
                  <div className="rounded-[20px] bg-[rgba(248,244,252,0.72)] px-4 py-3" key={item.label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Secciones principales
              </p>
              <div className="mt-4 grid gap-3">
                {templateSnapshot.sections.slice(0, 12).map((section) => (
                  <div
                    className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white px-4 py-3"
                    key={section.id}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {section.title}
                      </p>
                      <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                        {`L${section.level} | ${section.required ? "Obligatoria" : "Opcional"}`}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      Tipo: {section.contentKind}
                    </p>
                    {section.purpose ? (
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        {section.purpose}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {templateSnapshot.notes.length > 0 ? (
            <div className="mt-6 rounded-[24px] border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Notas del template
              </p>
              <div className="mt-3 grid gap-2">
                {templateSnapshot.notes.map((note) => (
                  <p className="text-sm leading-6 text-[var(--color-ink)]" key={note}>
                    * {note}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Salida</p>
          <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Pendiente
          </h3>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Esta seccion se mantendra vacia hasta que arranquemos la etapa de
            generacion del blueprint.
          </p>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/96">
            <textarea
              className="min-h-[42rem] max-h-[42rem] w-full resize-none overflow-auto border-0 bg-transparent p-5 font-mono text-[13px] leading-6 text-[var(--color-ink)] focus:outline-none"
              placeholder="Sin salida por ahora."
              readOnly
              value=""
            />
          </div>
        </section>
      </section>
    </main>
  );
}
