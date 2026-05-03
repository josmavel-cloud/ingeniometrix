"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, ShieldAlert } from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";

type Step10ReaderProps = {
  snapshot: {
    fixtureCase: string;
    artifactRun?: {
      runDir: string;
      runId: string;
      loadedAt: string;
      readOnly: boolean;
    };
    execution: {
      llmEnabled: boolean;
      llmPolicy: "required" | "disabled";
      providerName: string | null;
      modelName: string | null;
    };
    consistencyMatrixArtifact: ConsistencyMatrixArtifact;
    sectionDrafts?: {
      drafts?: Array<{
        section_key: string;
        title: string;
        content: string;
        fallback_cause?: string | null;
        warnings?: string[];
        quality_checks?: Record<string, boolean>;
      }>;
    };
  };
};

function statusClass(status: string) {
  if (status === "pass" || status === "complete") {
    return "border-emerald-100 bg-emerald-50 text-emerald-900";
  }

  if (status === "blocked") {
    return "border-red-100 bg-red-50 text-red-900";
  }

  return "border-amber-100 bg-amber-50 text-amber-900";
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">
        {props.value}
      </p>
    </article>
  );
}

function InfoCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
      <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
        {props.title}
      </h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function EmptyValue() {
  return <span className="text-[var(--color-muted)]">Por precisar</span>;
}

export function Step10Reader({ snapshot }: Step10ReaderProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "inputs" | "validation" | "raw">(
    "matrix",
  );
  const artifact = snapshot.consistencyMatrixArtifact;
  const sourceDrafts = useMemo(() => {
    const sourceKeys = new Set(artifact.validation.source_section_keys);

    return (snapshot.sectionDrafts?.drafts ?? []).filter((draft) =>
      sourceKeys.has(draft.section_key),
    );
  }, [artifact.validation.source_section_keys, snapshot.sectionDrafts?.drafts]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f1ea_0%,#fbf8f3_48%,#f5efe8_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="rounded-[32px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]"
                href="/lab/master-blueprint"
              >
                <ArrowLeft className="size-4" />
                Volver al lab
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Step 10 / consistency_matrix
              </p>
              <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Matriz de consistencia
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Vista read-only generada desde drafts existentes del Paso 9. Este paso puede usar
                LLM barato solo para redactar la correspondencia de matriz; no reejecuta secciones
                ni inventa evidencia nueva.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass(artifact.status)}`}>
                {artifact.status}
              </span>
              <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {artifact.can_continue_step_11 ? "continua a paso 11" : "bloquea paso 11"}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="fixture" value={snapshot.fixtureCase} />
          <MetricCard label="run" value={snapshot.artifactRun?.runId ?? "runtime"} />
          <MetricCard label="llm" value={artifact.llm_used ? "usado" : "no usado"} />
          <MetricCard label="modelo" value={artifact.llm_generation?.model ?? "deterministico"} />
          <MetricCard label="tokens" value={`${artifact.llm_generation?.total_tokens ?? 0}`} />
          <MetricCard label="costo CAD" value={`$${(artifact.llm_generation?.cost_cad ?? 0).toFixed(4)}`} />
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="filas" value={`${artifact.specific_rows.length}`} />
          <MetricCard label="derivados" value={`${artifact.validation.derived_field_count}`} />
          <MetricCard label="faltantes" value={`${artifact.validation.missing_field_count}`} />
          <MetricCard label="duracion" value={`${artifact.llm_generation?.duration_ms ?? 0} ms`} />
        </section>

        <div className="flex flex-wrap gap-2">
          {[
            ["matrix", "Matriz"],
            ["inputs", "Inputs Paso 9"],
            ["validation", "Validacion"],
            ["raw", "JSON raw"],
          ].map(([key, label]) => (
            <button
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                activeTab === key
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.82)] text-[var(--color-ink)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/84 text-[var(--color-muted)]"
              }`}
              key={key}
              onClick={() => setActiveTab(key as "matrix" | "inputs" | "validation" | "raw")}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "matrix" ? (
          <div className="grid gap-4">
            <InfoCard title="Bloque general">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Problema principal
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                    {artifact.general_block.problema_principal ?? <EmptyValue />}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Objetivo general
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                    {artifact.general_block.objetivo_general ?? <EmptyValue />}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Hipotesis general
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
                    {artifact.general_block.hipotesis_general ?? <EmptyValue />}
                  </p>
                </div>
              </div>
            </InfoCard>

            <InfoCard title="Matriz UPT-style">
              <div className="overflow-auto rounded-[18px] border border-[rgba(74,58,97,0.08)]">
                <table className="w-full min-w-[1100px] border-collapse bg-white text-left text-sm">
                  <thead className="bg-[rgba(248,244,252,0.92)] text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    <tr>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Codigo</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Interrogante</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Objetivo</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Hipotesis</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Variable/categoria</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Metodo / tecnica</th>
                      <th className="border-b border-[rgba(74,58,97,0.08)] px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artifact.specific_rows.map((row) => (
                      <tr key={row.index} className="align-top">
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 font-semibold">
                          {row.row_id ?? row.index}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 leading-7">
                          {row.interrogante_especifica ?? <EmptyValue />}
                          {row.question_derivation_source !== "draft" ? (
                            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-amber-700">
                              {row.question_derivation_source}
                            </p>
                          ) : null}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 leading-7">
                          {row.objetivo_especifico ?? <EmptyValue />}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 leading-7">
                          {row.hipotesis_especifica ?? <EmptyValue />}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 leading-7">
                          {row.variable_o_categoria ?? row.dimension_o_criterio ?? <EmptyValue />}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4 leading-7">
                          {[row.metodo_vinculado, row.tecnica, row.instrumento].filter(Boolean).join(" / ") || <EmptyValue />}
                        </td>
                        <td className="border-b border-[rgba(74,58,97,0.08)] px-4 py-4">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                            score: {(row.alignment_score ?? 0).toFixed(3)}
                          </p>
                          {row.warnings.length > 0 ? (
                            <ul className="mt-3 grid gap-1 text-xs leading-5 text-[var(--color-muted)]">
                              {row.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </InfoCard>

            <div className="grid gap-4 xl:grid-cols-2">
              <InfoCard title="Variables e indicadores">
                <div className="grid gap-3 text-sm leading-7 text-[var(--color-ink)]">
                  <p><strong>Variable independiente:</strong> {artifact.variables_block.variable_independiente ?? <EmptyValue />}</p>
                  <p><strong>Indicadores independientes:</strong> {artifact.variables_block.indicadores_independiente.join(" | ") || <EmptyValue />}</p>
                  <p><strong>Variable dependiente:</strong> {artifact.variables_block.variable_dependiente ?? <EmptyValue />}</p>
                  <p><strong>Indicadores dependientes:</strong> {artifact.variables_block.indicadores_dependiente.join(" | ") || <EmptyValue />}</p>
                  <p><strong>Categorias:</strong> {artifact.variables_block.categorias.join(" | ") || <EmptyValue />}</p>
                </div>
              </InfoCard>

              <InfoCard title="Metodologia">
                <div className="grid gap-3 text-sm leading-7 text-[var(--color-ink)]">
                  <p><strong>Tipo:</strong> {artifact.methodology_block.tipo_investigacion ?? <EmptyValue />}</p>
                  <p><strong>Diseno:</strong> {artifact.methodology_block.diseno_investigacion ?? <EmptyValue />}</p>
                  <p><strong>Ambito:</strong> {artifact.methodology_block.ambito_estudio ?? <EmptyValue />}</p>
                  <p><strong>Poblacion:</strong> {artifact.methodology_block.poblacion ?? <EmptyValue />}</p>
                  <p><strong>Muestra:</strong> {artifact.methodology_block.muestra ?? <EmptyValue />}</p>
                  <p><strong>Tecnicas:</strong> {artifact.methodology_block.tecnicas_recoleccion.join(" | ") || <EmptyValue />}</p>
                  <p><strong>Instrumentos:</strong> {artifact.methodology_block.instrumentos.join(" | ") || <EmptyValue />}</p>
                  <p><strong>Plan de analisis:</strong> {artifact.methodology_block.plan_analisis ?? <EmptyValue />}</p>
                </div>
              </InfoCard>
            </div>
          </div>
        ) : null}

        {activeTab === "inputs" ? (
          <InfoCard title="Secciones usadas desde Paso 9">
            <div className="grid gap-3">
              {sourceDrafts.map((draft) => (
                <article
                  className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4"
                  key={draft.section_key}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {draft.section_key}
                      </p>
                      <h3 className="mt-1 font-semibold text-[var(--color-ink)]">{draft.title}</h3>
                    </div>
                    {draft.fallback_cause ? (
                      <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">
                        {draft.fallback_cause}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 line-clamp-4 text-sm leading-7 text-[var(--color-ink)]">
                    {draft.content}
                  </p>
                  {draft.warnings?.length ? (
                    <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
                      warnings: {draft.warnings.join(" | ")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </InfoCard>
        ) : null}

        {activeTab === "validation" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <InfoCard title="Estado de validacion">
              <div className="grid gap-4">
                <div className={`rounded-[18px] border p-4 ${statusClass(artifact.status)}`}>
                  <div className="flex items-center gap-2">
                    {artifact.status === "blocked" ? (
                      <ShieldAlert className="size-5" />
                    ) : (
                      <CheckCircle2 className="size-5" />
                    )}
                    <p className="font-semibold">status: {artifact.status}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6">
                    {artifact.can_continue_step_11
                      ? "Puede continuar a Paso 11 con las advertencias visibles."
                      : "No deberia continuar a Paso 11 hasta corregir secciones base."}
                  </p>
                </div>

                <div className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                  <p><strong>row_alignment_ok:</strong> {artifact.validation.row_alignment_ok ? "si" : "no"}</p>
                  <p><strong>required_inputs_present:</strong> {artifact.validation.required_inputs_present ? "si" : "no"}</p>
                  <p><strong>source_section_keys:</strong> {artifact.validation.source_section_keys.join(", ") || "ninguna"}</p>
                  <p><strong>weak_source_section_keys:</strong> {artifact.validation.weak_source_section_keys.join(", ") || "ninguna"}</p>
                  <p><strong>fallback_source_section_keys:</strong> {artifact.validation.fallback_source_section_keys.join(", ") || "ninguna"}</p>
                  <p><strong>table_model:</strong> {artifact.table_model ? `${artifact.table_model.orientation}, ${artifact.table_model.columns.length} columnas` : "no disponible"}</p>
                </div>
              </div>
            </InfoCard>

            <InfoCard title="Blockers y warnings">
              <div className="grid gap-3">
                {artifact.validation.blocked_reasons.length > 0 ? (
                  <div className="rounded-[18px] border border-red-100 bg-red-50 p-4 text-sm leading-7 text-red-900">
                    <strong>Blockers:</strong> {artifact.validation.blocked_reasons.join(" | ")}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-emerald-100 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">
                    Sin blockers.
                  </div>
                )}

                {artifact.validation.warnings.length > 0 ? (
                  <div className="rounded-[18px] border border-amber-100 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
                    <strong>Warnings:</strong> {artifact.validation.warnings.join(" | ")}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-emerald-100 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">
                    Sin warnings.
                  </div>
                )}

                {artifact.validation.row_alignment_scores?.length ? (
                  <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white p-4 text-sm leading-7 text-[var(--color-ink)]">
                    <strong>Scores por fila:</strong>{" "}
                    {artifact.validation.row_alignment_scores
                      .map((row) => `${row.row_id}: ${row.score.toFixed(3)}`)
                      .join(" | ")}
                  </div>
                ) : null}
              </div>
            </InfoCard>
          </div>
        ) : null}

        {activeTab === "raw" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <JsonViewer title="consistencyMatrixArtifact" value={artifact} />
            <JsonViewer title="sourceDrafts" value={sourceDrafts} />
          </div>
        ) : null}

        <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-[var(--color-coral)]" />
            <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              Notas para desarrollador
            </h2>
          </div>
          <div className="mt-4 grid gap-2 text-sm leading-7 text-[var(--color-muted)]">
            <p>1. Este paso se genera desde artifacts locales existentes del Paso 9; no dispara Step 9.</p>
            <p>2. Si `llm_used` es true, el LLM solo redacta correspondencia metodologica; la validacion posterior se hace por codigo.</p>
            <p>3. Si `status` queda blocked, el Paso 11 no debe componer un blueprint final como si la matriz estuviera completa.</p>
            <p>4. `table_model` define orientacion horizontal, columnas y hints para render DOCX profesional.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
