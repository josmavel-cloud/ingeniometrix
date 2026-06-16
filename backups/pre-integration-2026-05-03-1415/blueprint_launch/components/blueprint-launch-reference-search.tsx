"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, FileText, Search } from "lucide-react";

import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import type { BlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import type {
  BlueprintLaunchReferenceListItem,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSearchSnapshot,
} from "@/blueprint_launch/server/local-playground-store";

type BlueprintLaunchReferenceSearchProps = {
  debugSnapshot: BlueprintLaunchDebugSnapshot | null;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  initialSearchSnapshot: BlueprintLaunchSearchSnapshot | null;
  onDebugSnapshotChange?: (snapshot: BlueprintLaunchDebugSnapshot | null) => void;
};

function formatStableTimestamp(value: string) {
  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function renderAuthors(authorsJson: string[]) {
  return Array.isArray(authorsJson) ? authorsJson.join(", ") : "";
}

function renderKeywordGroupLine(label: string, variants: string[]) {
  return `${label}: ${variants.join(" or ")}`;
}

function renderKeywordGroupCompact(values: Array<{ label: string; variants: string[] }>) {
  if (values.length === 0) {
    return "Sin grupos identificados.";
  }

  return values.map((group) => renderKeywordGroupLine(group.label, group.variants)).join(" | ");
}

function getScoreBadgeClasses(label: string | undefined) {
  if (label === "ALTO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (label === "MEDIO") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (label === "MINIMO") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function formatQueryStageLabel(value: string | undefined) {
  if (value === "necessary_only") {
    return "Necesarias";
  }

  if (value === "complementary_boosted") {
    return "Necesarias + complementaria";
  }

  if (value === "optional_backup") {
    return "Backup";
  }

  return "Sin etapa";
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

function formatAccessStatusLabel(status: string | undefined) {
  if (status === "complete_public") {
    return "Contenido completo";
  }

  if (status === "partial_public") {
    return "Acceso parcial";
  }

  if (status === "metadata_only") {
    return "Solo metadata";
  }

  return "Sin resolver";
}

function renderSimpleList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "Sin coincidencias";
}

export function BlueprintLaunchReferenceSearch({
  debugSnapshot,
  savedIntake,
  initialSearchSnapshot,
  onDebugSnapshotChange,
}: BlueprintLaunchReferenceSearchProps) {
  const [searchSnapshot, setSearchSnapshot] = useState<BlueprintLaunchSearchSnapshot | null>(
    initialSearchSnapshot,
  );
  const [references, setReferences] = useState<BlueprintLaunchReferenceListItem[]>(
    initialSearchSnapshot?.references ?? [],
  );
  const [visibleCount, setVisibleCount] = useState(
    Math.min(initialSearchSnapshot?.references.length ?? 0, REFERENCE_BATCH_SIZE),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  useEffect(() => {
    if (!initialSearchSnapshot) {
      return;
    }

    setSearchSnapshot(initialSearchSnapshot);
    setReferences(initialSearchSnapshot.references);
    setVisibleCount(Math.min(initialSearchSnapshot.references.length, REFERENCE_BATCH_SIZE));
  }, [initialSearchSnapshot]);

  const hasIntakeMinimum = savedIntake?.status === "INTAKE_READY";
  const selectedCount = useMemo(
    () => references.filter((reference) => reference.selected).length,
    [references],
  );
  const visibleReferences = useMemo(
    () => references.slice(0, visibleCount),
    [references, visibleCount],
  );
  const canExpand = visibleCount < Math.min(references.length, MAX_SELECTED_REFERENCES);
  const nextVisibleTarget = Math.min(visibleCount + REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES);

  function toggleReference(referenceId: string) {
    setReferences((current) => {
      const isSelected = current.find((item) => item.reference.id === referenceId)?.selected;

      if (!isSelected && selectedCount >= MAX_SELECTED_REFERENCES) {
        setError(`Puedes seleccionar hasta ${MAX_SELECTED_REFERENCES} fuentes en esta etapa.`);
        return current;
      }

      setError(null);

      const updated = current.map((item) =>
        item.reference.id === referenceId
          ? { ...item, selected: !item.selected }
          : item,
      );

      let order = 1;
      return updated.map((item) =>
        item.selected ? { ...item, selectedOrder: order++ } : { ...item, selectedOrder: null },
      );
    });
  }

  function runSearch(desiredTotal: number) {
    setError(null);
    setMessage(null);
    setInfo(null);

    if (!savedIntake) {
      setInfo("Guarda primero el intake local con el formato principal antes de buscar.");
      return;
    }

    startSearchTransition(async () => {
      const response = await fetch("/api/blueprint-launch/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ desiredTotal }),
      });

      const payload = (await response.json()) as {
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        error?: string;
        snapshot?: BlueprintLaunchSearchSnapshot;
      };

      if (!response.ok || !payload.snapshot) {
        setError(payload.error ?? "No se pudo ejecutar la busqueda local.");
        return;
      }

      setSearchSnapshot(payload.snapshot);
      setReferences(payload.snapshot.references);
      onDebugSnapshotChange?.(payload.debugSnapshot ?? null);
      setVisibleCount(Math.min(payload.snapshot.references.length, desiredTotal));
      setMessage(
        `Busqueda completada. Revisa las fuentes y selecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES}.`,
      );
    });
  }

  function expandReferences() {
    setError(null);
    setMessage(null);
    setInfo(null);

    if (canExpand) {
      setVisibleCount(nextVisibleTarget);
      return;
    }

    if (!savedIntake || references.length >= MAX_SELECTED_REFERENCES) {
      return;
    }

    runSearch(nextVisibleTarget);
  }

  function saveSelection() {
    setError(null);
    setMessage(null);
    setInfo(null);

    const selectedReferenceIds = references
      .filter((reference) => reference.selected)
      .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
      .map((reference) => reference.reference.id);

    if (
      selectedReferenceIds.length < MIN_SELECTED_REFERENCES ||
      selectedReferenceIds.length > MAX_SELECTED_REFERENCES
    ) {
      setError(
        `Debes seleccionar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes para continuar.`,
      );
      return;
    }

    startSaveTransition(async () => {
      const response = await fetch("/api/blueprint-launch/references", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedReferenceIds }),
      });
      const payload = (await response.json()) as {
        error?: string;
        bundle?: BlueprintLaunchSelectedSourceBundle;
        debugSnapshot?: BlueprintLaunchDebugSnapshot;
        sourceAccessResolution?: {
          completePublicCount: number;
          partialPublicCount: number;
          metadataOnlyCount: number;
          unresolvedCount: number;
        };
        sourceIntakeGate?: {
          decision: "PASS" | "PASS_WITH_WARNINGS" | "BLOCK";
          summary: string;
        };
        evidenceCompletion?: {
          decision: "RUN" | "SKIP";
          reason: string;
          usableCount?: number;
          weakSupportCount?: number;
          offTopicCount?: number;
          methodologySupportCount?: number;
          frameworkSupportCount?: number;
          cards: Array<{
            referenceId: string;
            title: string;
            evidenceSource: "abstract_metadata" | "metadata_only";
            llmStatus: "llm" | "fallback" | "skipped";
            detectedLanguage?: string | null;
            applicabilityToProject?: "directa" | "parcial" | "debil";
            usefulnessLabel?: "usable" | "weak_support" | "off_topic";
            whyRelevant: string;
            supportsSectionKeys?: string[];
            methodologyHints?: string[];
            frameworkHints?: string[];
            decisionValue?: string;
            intakeCoverage: string[];
            methodSignals: string[];
            contextSignals: string[];
            variableSignals: string[];
            evidenceLimits: string[];
            qualityFlags?: string[];
          }>;
        };
        contentMaterialization?: {
          attemptedCount: number;
          materializedCount: number;
          pdfCount: number;
          webCount: number;
          failedCount: number;
          skippedCount: number;
        };
        evidencePacksArtifact?: {
          extraction_mode: "rule_based" | "llm_structured" | "hybrid";
          packs: Array<{
            source_id: string;
            problem_signal: string | null;
            method_signal: string | null;
            context_signal: string | null;
            finding_signal: string | null;
            limitation_signal: string | null;
            future_line_signal: string | null;
            abstract_summary: string | null;
          }>;
          warnings: string[];
        };
        snapshot?: BlueprintLaunchSearchSnapshot;
      };

      if (!response.ok || !payload.snapshot) {
        setError(payload.error ?? "No se pudo guardar la seleccion local.");
        return;
      }

      setSearchSnapshot(payload.snapshot);
      setReferences(payload.snapshot.references);
      onDebugSnapshotChange?.(payload.debugSnapshot ?? null);
      setMessage(
        payload.bundle
          ? `Seleccion local guardada. Bundle listo con ${payload.bundle.selectedCount} fuente(s); ${payload.bundle.pdfLinkedCount} con URL PDF verificada.${payload.sourceIntakeGate ? ` Gate: ${payload.sourceIntakeGate.decision}.` : ""}`
          : "Seleccion local de fuentes guardada.",
      );
    });
  }

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="brand-kicker">Fuentes</p>
          <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Busqueda de fuentes con planner local del laboratorio
          </h3>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Esta seccion prueba un planner local con LLM para extraer keywords,
            clasificarlas por grupos y rerankear resultados de OpenAlex con apoyo
            de Crossref cuando hace falta completar el lote.
          </p>
        </div>

        <button
          className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isSearching || !savedIntake}
          onClick={() => runSearch(REFERENCE_BATCH_SIZE)}
          type="button"
        >
          <Search className="mr-2 size-4" />
          {isSearching ? "Buscando..." : savedIntake ? "Buscar fuentes" : "Guarda intake primero"}
        </button>
      </div>

      <div
        className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
          hasIntakeMinimum
            ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
            : "border-[rgba(233,87,87,0.12)] bg-[rgba(255,236,238,0.72)] text-[var(--color-ink)]"
        }`}
      >
        {savedIntake
          ? hasIntakeMinimum
            ? "El intake guardado ya cumple el minimo del flujo principal para buscar fuentes."
            : "El intake fue guardado, pero aun no alcanza el minimo principal: tema, problema y poblacion."
          : "Todavia no hay un intake guardado en formato principal para esta prueba local."}
      </div>

      {savedIntake ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Estado guardado", value: savedIntake.status },
            { label: "Guardado", value: formatStableTimestamp(savedIntake.savedAt) },
            {
              label: "Search query derivada",
              value: savedIntake.derivedSearchQuery ?? "Pendiente de busqueda",
            },
            {
              label: "Tema",
              value: savedIntake.intake.topic,
            },
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
      ) : null}

      <div className="mt-5 grid gap-2">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {info ? <p className="text-sm text-[var(--color-muted)]">{info}</p> : null}
      </div>

      {searchSnapshot ? (
        <details className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
            Ver contexto de busqueda
          </summary>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Search query
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {searchSnapshot.searchQuery}
              </p>
            </article>

            <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Fuente del planner
              </p>
              <div className="mt-2 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                <p>{searchSnapshot.metadata?.plannerStatus === "llm" ? "LLM" : "Fallback local"}</p>
                <p>Area: {searchSnapshot.metadata?.knowledgeArea ?? "No definida"}</p>
                <p>Subdominio: {searchSnapshot.metadata?.subdomain ?? "No identificado"}</p>
                <p>Sistema principal: {searchSnapshot.metadata?.primarySystem ?? "No identificado"}</p>
                <p>
                  Objetivo tecnico: {searchSnapshot.metadata?.primaryGoal ?? "No identificado"}
                </p>
                <p>
                  Focus terms:{" "}
                  {searchSnapshot.metadata?.focusTerms.join(", ") || "Sin terminos visibles"}
                </p>
                {searchSnapshot.metadata?.plannerErrorMessage ? (
                  <p className="text-rose-600">
                    Error del planner: {searchSnapshot.metadata.plannerErrorMessage}
                  </p>
                ) : null}
              </div>
            </article>
          </div>

          {searchSnapshot.metadata ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Normalized topic
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                  {searchSnapshot.metadata.normalizedTopic}
                </p>
              </article>

              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Intent summary
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                  {searchSnapshot.metadata.intentSummary}
                </p>
              </article>
            </div>
          ) : null}

          {searchSnapshot.metadata ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              {[
                {
                  label: "Necesarias",
                  groups: searchSnapshot.metadata.keywordGroups.necessary,
                },
                {
                  label: "Complementarias",
                  groups: searchSnapshot.metadata.keywordGroups.complementary,
                },
                {
                  label: "Opcionales",
                  groups: searchSnapshot.metadata.keywordGroups.optional,
                },
              ].map((section) => (
                <article
                  className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4"
                  key={section.label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {section.label}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {section.groups.length > 0 ? (
                      section.groups.map((group) => (
                        <p className="text-sm leading-6 text-[var(--color-ink)]" key={group.label}>
                          {renderKeywordGroupLine(group.label, group.variants)}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin grupos en esta categoria.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {searchSnapshot.metadata ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              {[
                {
                  label: "Queries necesarias",
                  queries: searchSnapshot.metadata.queryPack.necessaryOnly,
                },
                {
                  label: "Queries con complementarias",
                  queries: searchSnapshot.metadata.queryPack.complementaryBoosted,
                },
                {
                  label: "Queries backup",
                  queries: searchSnapshot.metadata.queryPack.optionalBackups,
                },
              ].map((section) => (
                <article
                  className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4"
                  key={section.label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {section.label}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {section.queries.length > 0 ? (
                      section.queries.map((query) => (
                        <p className="text-sm leading-6 text-[var(--color-ink)]" key={query}>
                          * {query}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin queries en esta etapa.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <article className="mt-4 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Consultas intentadas
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {searchSnapshot.attemptedQueries.map((query) => (
                <p className="text-sm leading-6 text-[var(--color-ink)]" key={query}>
                  * {query}
                </p>
              ))}
            </div>
          </article>

          {searchSnapshot.metadata?.scoringRules.length ? (
            <article className="mt-4 rounded-[20px] border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Regla de scoring
              </p>
              <div className="mt-3 grid gap-2">
                {searchSnapshot.metadata.scoringRules.map((rule) => (
                  <p className="text-sm leading-6 text-[var(--color-ink)]" key={rule}>
                    * {rule}
                  </p>
                ))}
              </div>
            </article>
          ) : null}
        </details>
      ) : null}

      {references.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
            Aun no hay fuentes cargadas.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Guarda el intake local y ejecuta la busqueda para traer referencias con el planner del laboratorio.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {debugSnapshot?.sourceAccessResolution ? (
            <section className="rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Resolucion de acceso completo
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {debugSnapshot.sourceAccessResolution.completePublicCount} fuente(s) con contenido publico completo,{" "}
                {debugSnapshot.sourceAccessResolution.partialPublicCount} con acceso parcial,{" "}
                {debugSnapshot.sourceAccessResolution.metadataOnlyCount} solo con metadata y{" "}
                {debugSnapshot.sourceAccessResolution.unresolvedCount} sin resolucion util.
              </p>
              <div className="mt-4 grid gap-3">
                {debugSnapshot.sourceAccessResolution.previewItems.map((item) => (
                  <div
                    className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                    key={item.sourceId}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-ink)]">{item.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          {item.sourceId}
                        </p>
                      </div>
                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getAccessStatusBadgeClasses(item.status)}`}
                      >
                        {formatAccessStatusLabel(item.status)}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Tipo:</strong> {item.kind}
                      {" | "}
                      <strong>Via:</strong> {item.resolvedVia}
                      {" | "}
                      <strong>Idioma:</strong> {item.languageDetected ?? "No detectado"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      URL resuelta: {item.resolvedContentUrl ?? "No resuelta"}
                    </p>
                    {item.warningCount > 0 ? (
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        Alertas de acceso: <strong>{item.warningCount}</strong>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {debugSnapshot?.sourceIntakeGate ? (
            <section
              className={`rounded-[24px] border p-4 ${
                debugSnapshot.sourceIntakeGate.decision === "PASS"
                  ? "border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)]"
                  : debugSnapshot.sourceIntakeGate.decision === "PASS_WITH_WARNINGS"
                    ? "border-[rgba(233,170,34,0.18)] bg-[rgba(255,248,225,0.86)]"
                    : "border-[rgba(233,87,87,0.16)] bg-[rgba(255,236,238,0.72)]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Gate inicial de fuentes
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.sourceIntakeGate.decision}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {debugSnapshot.sourceIntakeGate.summary}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Contenido publico completo:{" "}
                <strong>{debugSnapshot.sourceIntakeGate.completePublicContentCount}</strong>
                {" | "}Acceso parcial:{" "}
                <strong>{debugSnapshot.sourceIntakeGate.partialPublicContentCount}</strong>
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Siguiente paso: {debugSnapshot.sourceIntakeGate.nextStepRecommendation}
              </p>
            </section>
          ) : null}

          {debugSnapshot?.evidenceCompletion ? (
            <section
              className={`rounded-[24px] border p-4 ${
                debugSnapshot.evidenceCompletion.decision === "RUN"
                  ? "border-[rgba(74,58,97,0.12)] bg-white/92"
                  : "border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Completar evidencia
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.evidenceCompletion.decision}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {debugSnapshot.evidenceCompletion.reason}
              </p>
              {debugSnapshot.evidenceCompletion.decision === "RUN" ? (
                <div className="mt-2 grid gap-2 text-sm leading-6 text-[var(--color-muted)]">
                  <p>
                    Tarjetas generadas:{" "}
                    <strong>{debugSnapshot.evidenceCompletion.cardCount}</strong>
                    {" | "}Desde abstract:{" "}
                    <strong>{debugSnapshot.evidenceCompletion.completedFromAbstractCount}</strong>
                    {" | "}Solo metadata:{" "}
                    <strong>{debugSnapshot.evidenceCompletion.completedFromMetadataCount}</strong>
                  </p>
                  <p>
                    Usables: <strong>{debugSnapshot.evidenceCompletion.usableCount}</strong>
                    {" | "}Apoyo debil: <strong>{debugSnapshot.evidenceCompletion.weakSupportCount}</strong>
                    {" | "}Fuera de foco: <strong>{debugSnapshot.evidenceCompletion.offTopicCount}</strong>
                  </p>
                  <p>
                    Soporte a metodologia: <strong>{debugSnapshot.evidenceCompletion.methodologySupportCount}</strong>
                    {" | "}Soporte a marco: <strong>{debugSnapshot.evidenceCompletion.frameworkSupportCount}</strong>
                  </p>
                </div>
              ) : null}
              {debugSnapshot.evidenceCompletion.previewCards.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {debugSnapshot.evidenceCompletion.previewCards.map((card) => (
                    <div
                      className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                      key={card.referenceId}
                    >
                      <p className="text-sm font-semibold text-[var(--color-ink)]">{card.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                        Aplicabilidad: <strong>{card.applicabilityToProject}</strong>
                        {" | "}Utilidad: <strong>{card.usefulnessLabel}</strong>
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                        <strong>Secciones:</strong>{" "}
                        {card.supportsSectionKeys.length > 0
                          ? card.supportsSectionKeys.join(", ")
                          : "Sin soporte claro"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                        <strong>Metodo:</strong>{" "}
                        {card.methodologyHints.length > 0
                          ? card.methodologyHints.join(", ")
                          : "Sin pista util"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                        <strong>Marco:</strong>{" "}
                        {card.frameworkHints.length > 0
                          ? card.frameworkHints.join(", ")
                          : "Sin pista util"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        {card.decisionValue}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {debugSnapshot?.contentMaterialization ? (
            <section className="rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Materializar contenido completo
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.contentMaterialization.materializedCount} materializada(s)
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Intentos: <strong>{debugSnapshot.contentMaterialization.attemptedCount}</strong>
                {" | "}PDF: <strong>{debugSnapshot.contentMaterialization.pdfCount}</strong>
                {" | "}Web: <strong>{debugSnapshot.contentMaterialization.webCount}</strong>
                {" | "}Fallos: <strong>{debugSnapshot.contentMaterialization.failedCount}</strong>
                {" | "}Omitidas: <strong>{debugSnapshot.contentMaterialization.skippedCount}</strong>
              </p>
              {debugSnapshot.contentMaterialization.previewItems.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {debugSnapshot.contentMaterialization.previewItems.map((item) => (
                    <div
                      className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                      key={item.sourceId}
                    >
                      <p className="text-sm font-semibold text-[var(--color-ink)]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        Estado: <strong>{item.materializationStatus}</strong>
                        {" | "}Guardado como: <strong>{item.storedKind}</strong>
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        Archivo principal: {item.localPrimaryPath ?? "No generado"}
                      </p>
                      {item.localTextPath ? (
                        <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                          Texto extraido: {item.localTextPath}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {debugSnapshot?.sourceSignalExtraction ? (
            <section className="rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Extraccion de senales
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.sourceSignalExtraction.extractionMode} | {debugSnapshot.sourceSignalExtraction.sourceCount} fuente(s)
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                PDF input: <strong>{debugSnapshot.sourceSignalExtraction.pdfInputCount}</strong>
                {" | "}Web: <strong>{debugSnapshot.sourceSignalExtraction.webInputCount}</strong>
                {" | "}Abstract-only: <strong>{debugSnapshot.sourceSignalExtraction.abstractOnlyCount}</strong>
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Snippets: <strong>{debugSnapshot.sourceSignalExtraction.totalSnippetCount}</strong>
                {" | "}Assets: <strong>{debugSnapshot.sourceSignalExtraction.totalAssetCount}</strong>
                {" | "}Ecuaciones: <strong>{debugSnapshot.sourceSignalExtraction.equationAssetCount}</strong>
                {" | "}Tablas: <strong>{debugSnapshot.sourceSignalExtraction.tableAssetCount}</strong>
                {" | "}Imagenes: <strong>{debugSnapshot.sourceSignalExtraction.imageAssetCount}</strong>
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Warnings: <strong>{debugSnapshot.sourceSignalExtraction.warningCount}</strong>
              </p>
              {debugSnapshot.sourceSignalExtraction.warnings.length > 0 ? (
                <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/80 p-3 text-sm leading-6 text-amber-900">
                  {debugSnapshot.sourceSignalExtraction.warnings.join(" | ")}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {debugSnapshot.sourceSignalExtraction.previewSources.map((source) => (
                  <div
                    className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                    key={source.sourceId}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {source.sourceId}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Titulo:</strong> {source.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Input:</strong> {source.inputMode}
                      {" | "} <strong>Relevancia:</strong> {source.topicRelevance}
                      {" | "} <strong>Utilidad:</strong> {source.proposalUsefulness}
                      {" | "} <strong>Idioma:</strong> {source.detectedLanguage ?? "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      <strong>Primary path:</strong> {source.primaryPath ?? "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      <strong>Secondary path:</strong> {source.secondaryPath ?? "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Overview:</strong> {source.sourceOverview ?? "Sin overview"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Secciones: {source.supportsSectionKeys.join(", ") || "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Hints metodologia: {source.methodologyHints.join(" | ") || "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Hints framework: {source.frameworkHints.join(" | ") || "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Problem:</strong> {source.problemSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Method:</strong> {source.methodSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Context:</strong> {source.contextSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Finding:</strong> {source.findingSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Limitation:</strong> {source.limitationSignal ?? "Sin senal"}
                      {" | "} <strong>Future:</strong> {source.futureLineSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      PDF sections: {source.pdfSectionsAvailable.join(", ") || "n/d"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Snippets: {source.snippetCount}
                      {" | "}Assets: {source.assetCount}
                      {" | "}Eq: {source.equationAssetCount}
                      {" | "}Tables: {source.tableAssetCount}
                      {" | "}Images: {source.imageAssetCount}
                    </p>
                    {source.warnings.length > 0 ? (
                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        Warnings: {source.warnings.join(" | ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {debugSnapshot?.evidencePacksArtifact ? (
            <section className="rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Evidence packs
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.evidencePacksArtifact.extractionMode} | {debugSnapshot.evidencePacksArtifact.packCount} pack(s)
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Warnings: <strong>{debugSnapshot.evidencePacksArtifact.warningCount}</strong>
              </p>
              <div className="mt-4 grid gap-3">
                {debugSnapshot.evidencePacksArtifact.previewPacks.map((pack) => (
                  <div
                    className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                    key={pack.sourceId}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {pack.sourceId}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Problem:</strong> {pack.problemSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Method:</strong> {pack.methodSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Context:</strong> {pack.contextSignal ?? "Sin senal"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Finding:</strong> {pack.findingSignal ?? "Sin senal"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {debugSnapshot?.consolidatedEvidenceArtifact ? (
            <section className="rounded-[24px] border border-[rgba(74,58,97,0.12)] bg-white/92 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Consolidacion de evidencia
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                {debugSnapshot.consolidatedEvidenceArtifact.consolidationMode}
                {" | "} overall {debugSnapshot.consolidatedEvidenceArtifact.overallReadiness}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Ready: <strong>{debugSnapshot.consolidatedEvidenceArtifact.readySectionCount}</strong>
                {" | "}Partial: <strong>{debugSnapshot.consolidatedEvidenceArtifact.partialSectionCount}</strong>
                {" | "}Low: <strong>{debugSnapshot.consolidatedEvidenceArtifact.lowSectionCount}</strong>
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Metodos: {debugSnapshot.consolidatedEvidenceArtifact.dominantMethods.join(" | ") || "n/d"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Frameworks: {debugSnapshot.consolidatedEvidenceArtifact.dominantFrameworks.join(" | ") || "n/d"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Gaps: <strong>{debugSnapshot.consolidatedEvidenceArtifact.evidenceGapCount}</strong>
                {" | "} Direcciones: <strong>{debugSnapshot.consolidatedEvidenceArtifact.proposalDirectionCount}</strong>
                {" | "} Blocking: <strong>{debugSnapshot.consolidatedEvidenceArtifact.blockingRequirementCount}</strong>
                {" | "} Recommended: <strong>{debugSnapshot.consolidatedEvidenceArtifact.recommendedRequirementCount}</strong>
              </p>
              {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate ? (
                <div className="mt-3 rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-3">
                  <p className="text-sm leading-6 text-[var(--color-ink)]">
                    <strong>Metodo candidato:</strong> {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.methodFamily ?? "n/d"}
                    {" | "} <strong>Diseno:</strong> {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.researchDesign ?? "n/d"}
                    {" | "} <strong>Alcance:</strong> {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.scopeStatus}
                    {" | "} <strong>Soporte:</strong> {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.supportLevel}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                    Tecnicas: {debugSnapshot.consolidatedEvidenceArtifact.proposalMethodCandidate.techniques.join(" | ") || "n/d"}
                  </p>
                </div>
              ) : null}
              {debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate ? (
                <div className="mt-3 rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-3">
                  <p className="text-sm leading-6 text-[var(--color-ink)]">
                    <strong>Framework candidato:</strong> {debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate.coreFramework ?? "n/d"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                    Apoyos: {debugSnapshot.consolidatedEvidenceArtifact.proposalFrameworkCandidate.supportingFrameworks.join(" | ") || "n/d"}
                  </p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {debugSnapshot.consolidatedEvidenceArtifact.previewSections.map((section) => (
                  <div
                    className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                    key={section.sectionKey}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {section.sectionKey}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                      <strong>Readiness:</strong> {section.readiness}
                      {" | "} <strong>Draft:</strong> {section.enoughToDraft ? "si" : "no"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Sources: {section.sourceCount}
                      {" | "}Snippets: {section.snippetCount}
                      {" | "}Assets: {section.assetCount}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      Faltantes: {section.missingElements.join(" | ") || "n/d"}
                    </p>
                  </div>
                ))}
              </div>
              {debugSnapshot.consolidatedEvidenceArtifact.previewWeakSections.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {debugSnapshot.consolidatedEvidenceArtifact.previewWeakSections.map((section) => (
                    <div
                      className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-3"
                      key={`weak-${section.sectionKey}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                        Weak section packet: {section.sectionKey}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                        <strong>Estado:</strong> {section.draftabilityStatus}
                        {" | "} <strong>Evidence-backed:</strong> {section.evidenceBackedPointCount}
                        {" | "} <strong>Bridges:</strong> {section.inferenceBridgeCount}
                        {" | "} <strong>Assumptions:</strong> {section.assumptionCount}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                        Missing: {section.missingEvidence.join(" | ") || "n/d"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {searchSnapshot?.metadata ? (
            <section className="rounded-[24px] border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.42)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Palabras clave identificadas
              </p>
              <div className="mt-3 grid gap-3">
                <p className="text-sm leading-6 text-[var(--color-ink)]">
                  <strong>Necesarias:</strong>{" "}
                  {renderKeywordGroupCompact(searchSnapshot.metadata.keywordGroups.necessary)}
                </p>
                <p className="text-sm leading-6 text-[var(--color-ink)]">
                  <strong>Complementarias:</strong>{" "}
                  {renderKeywordGroupCompact(searchSnapshot.metadata.keywordGroups.complementary)}
                </p>
                <p className="text-sm leading-6 text-[var(--color-ink)]">
                  <strong>No obligatorias:</strong>{" "}
                  {renderKeywordGroupCompact(searchSnapshot.metadata.keywordGroups.optional)}
                </p>
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Seleccionadas: <strong>{selectedCount}</strong> / {MAX_SELECTED_REFERENCES}
            </p>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Mostrando <strong>{visibleReferences.length}</strong> de <strong>{references.length}</strong>
            </p>
          </div>

          {visibleReferences.map((item) => (
            <article className="surface-panel rounded-[28px] p-5" key={item.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-[var(--color-muted)]">
                  <input
                    checked={item.selected}
                    className="size-4 rounded border-slate-300 text-lime-500 focus:ring-lime-400"
                    onChange={() => toggleReference(item.reference.id)}
                    type="checkbox"
                  />
                  <span>
                    {item.selectedOrder ? `Seleccion ${item.selectedOrder}` : "No seleccionada"}
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] ${getScoreBadgeClasses(item.scoreBreakdown?.label)}`}
                  >
                    {item.scoreBreakdown?.label ?? "BAJO"}
                  </div>
                  <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Score {item.relevanceScore?.toFixed(2) ?? "0.00"}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="font-[var(--font-heading)] text-lg font-semibold text-slate-950">
                  {item.reference.title}
                </h4>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                    {[item.reference.venue, item.reference.year].filter(Boolean).join(" | ") || "Sin fecha"}
                  </span>
                  {item.reference.abstract ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                      Abstract
                    </span>
                  ) : null}
                  {item.scoreBreakdown ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                      {formatQueryStageLabel(item.scoreBreakdown.matchedQueryStage)}
                    </span>
                  ) : null}
                  {item.scoreBreakdown ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                      Recencia {item.scoreBreakdown.recencyBand}
                    </span>
                  ) : null}
                </div>

                {renderAuthors(item.reference.authorsJson) ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {renderAuthors(item.reference.authorsJson)}
                  </p>
                ) : null}

                {item.reference.abstract ? (
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    {item.reference.abstract.slice(0, 320)}
                    {item.reference.abstract.length > 320 ? "..." : ""}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {item.reference.pdfUrl ? (
                    <a
                      className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-300 hover:text-rose-800"
                      href={item.reference.pdfUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PDF
                      <FileText className="ml-2 size-4" />
                    </a>
                  ) : null}

                  {item.reference.landingPageUrl ? (
                    <a
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                      href={item.reference.landingPageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Ver fuente
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  ) : null}
                </div>

                {item.scoreBreakdown ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    {[
                      {
                        label: "Necesarias",
                        values: item.scoreBreakdown.necessaryMatches,
                      },
                      {
                        label: "Complementarias",
                        values: item.scoreBreakdown.complementaryMatches,
                      },
                      {
                        label: "Opcionales",
                        values: item.scoreBreakdown.optionalMatches,
                      },
                    ].map((section) => (
                      <div
                        className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-3"
                        key={section.label}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          {section.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                          {renderSimpleList(section.values)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {item.scoreBreakdown ? (
                  <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">
                    Query usada: <strong>{item.scoreBreakdown.matchedQuery}</strong>
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {references.length > 0 && visibleCount < MAX_SELECTED_REFERENCES ? (
        <div className="mt-6 flex justify-start">
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isSearching}
            onClick={expandReferences}
            type="button"
          >
            {isSearching
              ? "Cargando..."
              : canExpand
                ? `Ver ${Math.min(REFERENCE_BATCH_SIZE, references.length - visibleCount)} mas`
                : `Buscar ${Math.min(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES - references.length)} mas`}
          </button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          Guarda la seleccion local para dejar lista la siguiente etapa del playground.
        </p>
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isSaving || references.length === 0}
          onClick={saveSelection}
          type="button"
        >
          {isSaving ? "Guardando..." : "Guardar seleccion"}
        </button>
      </div>
    </section>
  );
}
