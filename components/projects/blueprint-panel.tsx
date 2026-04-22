"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Sparkles } from "lucide-react";

import { getProjectStatusMeta } from "@/lib/project-status";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";

type BlueprintVersionListItem = {
  id: string;
  versionNumber: number;
  createdAt: string;
  blueprintJson: Record<string, unknown>;
  coherenceReportJson: Record<string, unknown>;
};

type BlueprintUiError = {
  code?: string;
  message: string;
  nextAction?: string;
};

type BlueprintPanelProps = {
  projectId: string;
  projectStatus: string;
  hasIntakeMinimum: boolean;
  selectedReferenceCount: number;
  versions: BlueprintVersionListItem[];
};

type CoherenceCheck = {
  status: "pass" | "warning" | "fail";
  notes: string;
};

type CoherencePanelItem = {
  label: string;
  check?: CoherenceCheck;
};

type BlueprintProgress = {
  projectStatus: string;
  stageKey: string | null;
  label: string | null;
  progress: number | null;
  updatedAt: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordList(
  keyConstructs: string[],
  text: string,
) {
  const tokens = new Set<string>();

  for (const construct of keyConstructs) {
    if (construct.trim().length >= 4) {
      tokens.add(construct.trim());
    }
  }

  for (const token of text.split(/\s+/)) {
    const normalized = token.replace(/[^\p{L}\p{N}]+/gu, "");
    if (/ar$|er$|ir$/i.test(normalized) && normalized.length >= 5) {
      tokens.add(normalized);
    }
  }

  return Array.from(tokens).slice(0, 8);
}

function renderHighlightedText(text: string, keywords: string[]) {
  if (keywords.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some(
      (keyword) => keyword.toLowerCase() === part.toLowerCase(),
    );

    return isKeyword ? (
      <mark
        className="rounded-md bg-[rgba(219,193,255,0.42)] px-1 py-0.5 text-[var(--color-ink)]"
        key={`${part}-${index}`}
      >
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    );
  });
}

function renderStatusPill(status: CoherenceCheck["status"]) {
  if (status === "pass") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "warning") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function BlueprintPanel({
  projectId,
  projectStatus,
  hasIntakeMinimum,
  selectedReferenceCount,
  versions,
}: BlueprintPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<BlueprintUiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<BlueprintProgress | null>(null);
  const [isPending, startTransition] = useTransition();

  const latestVersion = versions[0] ?? null;
  const blueprint = latestVersion?.blueprintJson as
    | {
        general_objective?: string;
        specific_objectives?: string[];
        research_questions?: string[];
        assumptions?: string[];
        engine_warnings?: string[];
        references_used?: Array<{ reference_id: string; title: string }>;
        key_constructs_or_variables?: string[];
        antecedent_synthesis?: {
          gap_overview?: string;
          objective_guidance?: string[];
          summaries?: Array<{
            reference_id: string;
            title: string;
            authors: string;
            year: number | null;
            download_url: string | null;
            summary: string;
            technical_solution: string;
            unresolved_gap: string;
          }>;
        };
      }
    | undefined;
  const coherence = latestVersion?.coherenceReportJson as
    | {
        problem_objective_alignment?: CoherenceCheck;
        objective_question_alignment?: CoherenceCheck;
        objective_method_alignment?: CoherenceCheck;
        population_method_alignment?: CoherenceCheck;
        technique_analysis_alignment?: CoherenceCheck;
        citation_traceability?: CoherenceCheck;
        missing_information_flags?: string[];
        risk_flags?: string[];
      }
    | undefined;

  const coherenceItems: CoherencePanelItem[] = coherence
    ? [
        { label: "Problema vs objetivo", check: coherence.problem_objective_alignment },
        { label: "Objetivos vs preguntas", check: coherence.objective_question_alignment },
        { label: "Objetivos vs metodo", check: coherence.objective_method_alignment },
        { label: "Poblacion vs metodo", check: coherence.population_method_alignment },
        { label: "Tecnicas vs analisis", check: coherence.technique_analysis_alignment },
        { label: "Trazabilidad de citas", check: coherence.citation_traceability },
      ]
    : [];
  const keyConstructs = blueprint?.key_constructs_or_variables ?? [];
  const specificObjectiveKeywords = useMemo(
    () =>
      (blueprint?.specific_objectives ?? []).map((item) =>
        buildKeywordList(keyConstructs, item),
      ),
    [blueprint?.specific_objectives, keyConstructs],
  );
  const questionKeywords = useMemo(
    () =>
      (blueprint?.research_questions ?? []).map((item) =>
        buildKeywordList(keyConstructs, item),
      ),
    [blueprint?.research_questions, keyConstructs],
  );

  const canGenerate =
    projectStatus === "SOURCES_SELECTED" ||
    projectStatus === "BLUEPRINT_READY" ||
    projectStatus === "EXPORT_READY";
  const statusMeta = getProjectStatusMeta(projectStatus);
  const preparationChecklist = [
    {
      label: "Base minima del intake",
      ready: hasIntakeMinimum,
      detail: hasIntakeMinimum
        ? "Tema, problema y poblacion ya estan definidos."
        : "Completa el intake minimo antes de generar.",
    },
    {
      label: "Fuentes seleccionadas",
      ready:
        selectedReferenceCount >= MIN_SELECTED_REFERENCES &&
        selectedReferenceCount <= MAX_SELECTED_REFERENCES,
      detail: `${selectedReferenceCount} seleccionadas de ${MIN_SELECTED_REFERENCES}-${MAX_SELECTED_REFERENCES} necesarias.`,
    },
    {
      label: "Blueprint listo para validacion",
      ready: canGenerate,
      detail: canGenerate
        ? "El proyecto ya puede pasar a estructura y coherencia."
        : "Todavia falta cerrar la etapa de fuentes.",
    },
  ];
  const readyCount = preparationChecklist.filter((item) => item.ready).length;

  useEffect(() => {
    if (!isPending) {
      return;
    }

    let isCancelled = false;
    const interval = globalThis.setInterval(async () => {
      const response = await fetch(`/api/projects/${projectId}/blueprints/progress`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { progress?: BlueprintProgress };

      if (isCancelled || !response.ok || !payload.progress) {
        return;
      }

      setProgress(payload.progress);
    }, 1000);

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [isPending, projectId]);

  function generateBlueprint() {
    setError(null);
    setMessage(null);
    setProgress({
      projectStatus,
      stageKey: "queued",
      label: "Iniciando generacion",
      progress: 6,
      updatedAt: null,
    });

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/blueprints`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        nextAction?: string;
      };

      if (!response.ok) {
        setError({
          code: payload.code,
          message: payload.error ?? "No se pudo generar el blueprint.",
          nextAction: payload.nextAction,
        });
        return;
      }

      setProgress({
        projectStatus: "BLUEPRINT_READY",
        stageKey: "completed",
        label: "Blueprint listo",
        progress: 100,
        updatedAt: new Date().toISOString(),
      });
      setMessage("Blueprint generado correctamente.");
      router.refresh();
    });
  }

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <FileStack className="size-3.5 text-lime-500" />
            Blueprint de investigacion
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            Genera una version estructurada del plan de tesis.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Este paso usa el intake y las fuentes seleccionadas para construir un blueprint en espanol, con trazabilidad a las referencias elegidas por el usuario.
          </p>
        </div>

        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || !canGenerate}
          onClick={generateBlueprint}
          type="button"
        >
          <Sparkles className="mr-2 size-4" />
          {isPending ? "Generando..." : "Generar blueprint"}
        </button>
      </div>

      <section
        className={`mt-6 rounded-[28px] p-5 ${
          canGenerate ? "brand-card-mint" : "brand-card-lilac"
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.54)]">
              Puente hacia blueprint
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              {canGenerate
                ? "Ya puedes convertir tus fuentes en una estructura inicial."
                : "Aun falta cerrar la preparacion antes de generar."}
            </p>
            <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
              {canGenerate
                ? "Ingeniometrix usara el intake y las fuentes elegidas para proponer objetivo general, preguntas, supuestos y un chequeo de coherencia trazable."
                : "La generacion funciona mejor cuando ya existe base minima y un set semilla de fuentes suficientemente representativo."}
            </p>
          </div>

          <div className="rounded-[24px] bg-white/72 px-4 py-4 text-sm leading-6 text-[rgba(23,19,31,0.72)] lg:min-w-[250px]">
            <p>
              <strong>Checklist:</strong> {readyCount}/3
            </p>
            <p>
              <strong>Estado:</strong> {statusMeta.label}
            </p>
            <p>
              <strong>Siguiente accion:</strong>{" "}
              {canGenerate ? "Generar blueprint" : "Cerrar etapa de fuentes"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {preparationChecklist.map((item) => (
            <article
              className="rounded-[22px] border border-white/55 bg-white/68 p-4"
              key={item.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                {item.label}
              </p>
              <div className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.62)]">
                {item.ready ? "Listo" : "Pendiente"}
              </div>
              <p className="mt-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                {item.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-[24px] border border-white/55 bg-white/68 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
            Lo que veras al generar
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <div className="rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Objetivo general
            </div>
            <div className="rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Preguntas y objetivos especificos
            </div>
            <div className="rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Supuestos y referencias usadas
            </div>
            <div className="rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Reporte de coherencia
            </div>
          </div>
        </div>
      </section>

      {!canGenerate ? (
        <p className="mt-5 text-sm leading-6 text-slate-500">
          El proyecto aun esta en "{statusMeta.label}". Primero debes guardar entre{" "}
          {MIN_SELECTED_REFERENCES} y {MAX_SELECTED_REFERENCES} fuentes para
          habilitar la generacion.
        </p>
      ) : null}

      <div className="mt-5 grid gap-2">
        {error ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            <p className="font-semibold">
              {error.code ? `${error.code}: ` : ""}{error.message}
            </p>
            {error.nextAction ? (
              <p className="mt-2 leading-6">{error.nextAction}</p>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </div>

      {isPending && progress ? (
        <div className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {progress.label ?? "Generando blueprint"}
            </p>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              {progress.progress ?? 0}%
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[rgba(74,58,97,0.08)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#4f46e5_100%)] transition-all duration-500"
              style={{ width: `${progress.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            Etapas reales del motor: contexto, antecedentes, redaccion, validacion y cierre.
          </p>
        </div>
      ) : null}

      {!latestVersion ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
            Aun no hay versiones generadas.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Cuando generes el primer blueprint, aqui veras el objetivo general, la coherencia basica y la lista de referencias usadas.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Version actual
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-slate-950">
              Version {latestVersion.versionNumber}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Generada el {new Date(latestVersion.createdAt).toLocaleString("es-PE")}
            </p>
          </div>

          {blueprint?.general_objective ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Objetivo general
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                {blueprint.general_objective}
              </p>
            </div>
          ) : null}

          {(blueprint?.antecedent_synthesis?.summaries ?? []).length > 0 ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Antecedentes clave
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {blueprint?.antecedent_synthesis?.gap_overview}
              </p>

              <div className="mt-5 grid gap-4">
                {blueprint?.antecedent_synthesis?.summaries?.map((item) => (
                  <article
                    className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"
                    key={item.reference_id}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {item.authors} {item.year ? `| ${item.year}` : ""}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.reference_id}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      <strong>Solucion tecnica:</strong> {item.technical_solution}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      <strong>Vacio pendiente:</strong> {item.unresolved_gap}
                    </p>
                  </article>
                ))}
              </div>

              {(blueprint?.antecedent_synthesis?.objective_guidance ?? []).length > 0 ? (
                <div className="mt-5 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.7)] p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Guia para mejorar objetivos
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                    {blueprint?.antecedent_synthesis?.objective_guidance?.map((item) => (
                      <li key={item}>* {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Objetivos especificos
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                {(blueprint?.specific_objectives ?? []).map((item, index) => (
                  <li key={item}>
                    * {renderHighlightedText(item, specificObjectiveKeywords[index] ?? [])}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Preguntas de investigacion
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                {(blueprint?.research_questions ?? []).map((item, index) => (
                  <li key={item}>
                    * {renderHighlightedText(item, questionKeywords[index] ?? [])}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Supuestos
            </p>
            <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
              {(blueprint?.assumptions ?? []).length > 0 ? (
                blueprint?.assumptions?.map((item) => <li key={item}>* {item}</li>)
              ) : (
                <li>No se registraron supuestos en esta version.</li>
              )}
            </ul>
          </div>

          {(blueprint?.engine_warnings ?? []).length > 0 ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Alertas del motor
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-amber-900">
                {blueprint?.engine_warnings?.map((item) => <li key={item}>* {item}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Referencias usadas
            </p>
            <ul className="mt-3 grid gap-3 text-sm leading-7 text-slate-700">
              {(blueprint?.references_used ?? []).map((reference) => (
                <li key={reference.reference_id}>
                  <strong>{reference.reference_id}</strong>: {reference.title}
                </li>
              ))}
            </ul>
          </div>

          {coherence ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Reporte de coherencia
              </p>

              <div className="mt-4 grid gap-3">
                {coherenceItems.map(({ label, check }) =>
                  check ? (
                    <div
                      className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"
                      key={label}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-slate-900">{label}</p>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${renderStatusPill(check.status)}`}
                        >
                          {check.status}
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-slate-600">{check.notes}</p>
                    </div>
                  ) : null,
                )}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Faltantes detectados
                  </p>
                  <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
                    {(coherence.missing_information_flags ?? []).length > 0 ? (
                      coherence.missing_information_flags?.map((item) => (
                        <li key={item}>* {item}</li>
                      ))
                    ) : (
                      <li>No se detectaron faltantes relevantes.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">Riesgos</p>
                  <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
                    {(coherence.risk_flags ?? []).length > 0 ? (
                      coherence.risk_flags?.map((item) => <li key={item}>* {item}</li>)
                    ) : (
                      <li>No se detectaron riesgos mayores en esta version.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
