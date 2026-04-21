"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Sparkles } from "lucide-react";

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

type BlueprintPanelProps = {
  projectId: string;
  projectStatus: string;
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
  versions,
}: BlueprintPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const latestVersion = versions[0] ?? null;
  const blueprint = latestVersion?.blueprintJson as
    | {
        general_objective?: string;
        specific_objectives?: string[];
        research_questions?: string[];
        assumptions?: string[];
        references_used?: Array<{ reference_id: string; title: string }>;
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

  const canGenerate =
    projectStatus === "SOURCES_SELECTED" ||
    projectStatus === "BLUEPRINT_READY" ||
    projectStatus === "EXPORT_READY";

  function generateBlueprint() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/blueprints`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo generar el blueprint.");
        return;
      }

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
          className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(163,230,53,0.32)] hover:-translate-y-0.5 hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || !canGenerate}
          onClick={generateBlueprint}
          type="button"
        >
          <Sparkles className="mr-2 size-4" />
          {isPending ? "Generando..." : "Generar blueprint"}
        </button>
      </div>

      {!canGenerate ? (
        <p className="mt-5 text-sm leading-6 text-slate-500">
          Primero debes guardar entre {MIN_SELECTED_REFERENCES} y {MAX_SELECTED_REFERENCES} fuentes para habilitar la generacion.
        </p>
      ) : null}

      <div className="mt-5 grid gap-2">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </div>

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

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Objetivos especificos
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                {(blueprint?.specific_objectives ?? []).map((item) => (
                  <li key={item}>* {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Preguntas de investigacion
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                {(blueprint?.research_questions ?? []).map((item) => (
                  <li key={item}>* {item}</li>
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
