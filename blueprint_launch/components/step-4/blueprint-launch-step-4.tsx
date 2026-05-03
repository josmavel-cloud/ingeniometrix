"use client";

import { useMemo, useState, useTransition } from "react";

import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type {
  BlueprintLaunchContentMaterializationResult,
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import type { BlueprintLaunchProjectGlobalContext } from "@/blueprint_launch/server/step1-intake-context";
import type { LlmUsageRegistry } from "@/server/llm-usage-registry";

type BlueprintLaunchStep4LabProps = {
  initialBundle: BlueprintLaunchSelectedSourceBundle | null;
  initialContentMaterialization: BlueprintLaunchContentMaterializationResult | null;
  initialDebugSnapshot: BlueprintLaunchDebugSnapshot | null;
  initialEvidencePlanning: BlueprintLaunchEvidencePlanningResult | null;
  initialProjectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  initialSavedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
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

function formatBytes(value: number | null | undefined) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatStableTimestamp(value: string | null | undefined) {
  if (!value) {
    return "null";
  }

  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function statusClasses(status: string | undefined) {
  if (status === "downloaded" || status === "captured") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function joinOrEmpty(values: string[] | undefined) {
  return values && values.length > 0 ? values.join(" · ") : "Sin elementos.";
}

export function BlueprintLaunchStep4Lab({
  initialBundle,
  initialContentMaterialization,
  initialDebugSnapshot,
  initialEvidencePlanning,
  initialProjectGlobalContext,
  initialSavedIntake,
  initialTokenUsage,
}: BlueprintLaunchStep4LabProps) {
  const [contentMaterialization, setContentMaterialization] =
    useState<BlueprintLaunchContentMaterializationResult | null>(initialContentMaterialization);
  const [debugSnapshot, setDebugSnapshot] = useState<BlueprintLaunchDebugSnapshot | null>(
    initialDebugSnapshot,
  );
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

  function runStep4() {
    setError(null);
    setMessage(null);

    startRunTransition(async () => {
      const response = await fetch("/api/blueprint-launch/step-4", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        contentMaterialization?: BlueprintLaunchContentMaterializationResult;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        tokenUsage?: LlmUsageRegistry;
      };

      if (!response.ok || !payload.contentMaterialization) {
        setError(payload.error ?? "No se pudo ejecutar el Paso 4.");
        return;
      }

      setContentMaterialization(payload.contentMaterialization);
      setDebugSnapshot(payload.debugSnapshot ?? null);

      if (payload.tokenUsage) {
        setTokenUsage(payload.tokenUsage);
      }

      setMessage("Paso 4 ejecutado. El contenido completo quedo materializado localmente.");
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Blueprint Launch / Paso 4</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Materializacion local de fuentes completas
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Descarga PDFs o captura texto completo usando el plan del Paso 3. Esta etapa es
              deterministica: valida bytes, MIME y rutas locales para preparar la primera ola
              LLM del Paso 5.
            </p>
          </div>

          <button
            className="brand-button-primary"
            disabled={isRunning}
            onClick={runStep4}
            type="button"
          >
            {isRunning ? "Materializando..." : "Ejecutar Paso 4"}
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
          Insumos usados para materializar
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Tema canonico", initialProjectGlobalContext?.canonicalTopicEs ?? "Pendiente"],
            ["Estado intake", initialSavedIntake?.status ?? "Pendiente"],
            ["Fuentes seleccionadas", `${initialBundle?.selectedCount ?? 0}`],
            ["PDFs planificados", `${initialEvidencePlanning?.pdfPlanCount ?? 0}`],
            ["Decision Paso 3", initialEvidencePlanning?.decision ?? "Pendiente"],
            ["Ready Step 5", contentMaterialization?.readyForStep5 ? "si" : "no"],
            ["Ultimo debug", formatStableTimestamp(debugSnapshot?.savedAt)],
            ["Run dir", contentMaterialization?.runDir ?? "Pendiente"],
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
          Manifest y readiness para Paso 5
        </h2>
        {contentMaterialization ? (
          <>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              {contentMaterialization.summary}
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Materializadas", `${contentMaterialization.materializedCount}`],
                ["PDFs", `${contentMaterialization.pdfCount}`],
                ["Fallidas", `${contentMaterialization.failedCount}`],
                ["Omitidas", `${contentMaterialization.skippedCount}`],
                ["Bytes totales", formatBytes(contentMaterialization.totalByteSize)],
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
              <p>Manifest: {contentMaterialization.manifestPath ?? "null"}</p>
              <p>Latest manifest: {contentMaterialization.latestManifestPath ?? "null"}</p>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Aun no hay materializacion local. Ejecuta el Paso 4.
          </p>
        )}
      </section>

      {initialEvidencePlanning ? (
        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Plan usado</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Entradas desde Paso 3
          </h2>
          <div className="mt-6 grid gap-4">
            {initialEvidencePlanning.materializationPlan.map((item) => (
              <article
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-5"
                key={item.sourceId}
              >
                <h3 className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                <p className="mt-2 break-all text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                  {item.sourceId}
                </p>
                <p className="mt-3 break-all text-sm leading-7 text-[var(--color-muted)]">
                  {item.contentUrl ?? "Sin URL"}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
                  {item.priority} / {item.expectedKind} / {item.resolverFamily}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Validacion: {joinOrEmpty(item.validationNotes)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {contentMaterialization ? (
        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="brand-kicker">Materializacion por fuente</p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Rutas locales, MIME y checks
          </h2>
          <div className="mt-6 grid gap-5">
            {contentMaterialization.items.map((item) => (
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
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses(item.materializationStatus)}`}>
                    {item.materializationStatus} / {item.storedKind}
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Resolver", item.resolverFamily ?? "null"],
                    ["Expected", item.expectedKind ?? "null"],
                    ["MIME", item.mimeType ?? "null"],
                    ["Bytes", formatBytes(item.byteSize)],
                    ["URL", item.resolvedContentUrl ?? "null"],
                    ["Ruta primaria", item.localPrimaryPath ?? "null"],
                    ["Ruta texto", item.localTextPath ?? "null"],
                    ["Idioma", item.languageDetected ?? "null"],
                  ].map(([label, value]) => (
                    <div
                      className="rounded-[18px] bg-[rgba(245,244,250,0.92)] p-3"
                      key={`${item.sourceId}-${label}`}
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
                <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                  Checks: {joinOrEmpty(item.validationChecks)}
                </p>
                {item.warnings.length > 0 ? (
                  <p className="mt-2 text-sm leading-7 text-amber-700">
                    Warnings: {joinOrEmpty(item.warnings)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
