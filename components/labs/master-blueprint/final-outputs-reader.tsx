"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FileWarning,
  Gauge,
  ShieldCheck,
} from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";
import type { MasterBlueprintLabExecutionResponse } from "@/lib/labs/master-blueprint/types";

type FinalOutputsReaderProps = {
  snapshot: MasterBlueprintLabExecutionResponse;
};

type DocxManifest = {
  output_docx_path?: string;
  output_docx_file_name?: string;
  relative_docx_path?: string;
  report_archetype?: string;
  file_size_bytes?: number;
  section_count?: number;
  matrix_rows?: number;
  references_count?: number;
  citations_inserted_count?: number;
  citation_style?: string;
  academic_model_version?: string;
  asset_placement_count?: number;
  renderable_asset_count?: number;
  available_logo_count?: number;
  rendered_image_asset_count?: number;
  main_body_section_count?: number;
  suppressed_section_count?: number;
  duplicate_pair_count?: number;
  llm_editorial_pass_count?: number;
  llm_editorial_total_tokens?: number;
  llm_editorial_cost_cad?: number;
  llm_layout_pass_count?: number;
  llm_layout_total_tokens?: number;
  llm_layout_cost_cad?: number;
  public_sanitization_pass_count?: number;
  public_source_title_replacements?: number;
  public_remaining_title_leak_count?: number;
  hero_image_status?: string;
  hero_image_model?: string | null;
  hero_image_path?: string | null;
  figure_plan_count?: number;
  equation_plan_count?: number;
  suppressed_text_asset_count?: number;
  qa_passed?: boolean;
  qa_score_100?: number;
  matrix_layout?: {
    orientation?: string;
    font_size_pt?: number;
    repeat_header?: boolean;
  };
  ooxml_patch_report?: {
    patches_applied?: string[];
    warnings?: string[];
  };
  quality_checks?: Record<string, boolean>;
  warnings?: string[];
};

type DocxQaReport = {
  passed?: boolean;
  score_100?: number;
  checks?: Record<string, boolean>;
  metrics?: Record<string, number>;
  failures?: string[];
  warnings?: string[];
};

type CompositionArtifact = {
  status?: string;
  validationReport?: {
    quality_report?: {
      score_10?: number;
      passed?: boolean;
      hard_failures?: string[];
      soft_warnings?: string[];
    };
    warnings?: string[];
  };
  provenanceReport?: {
    from_sources_pct?: number;
    unsupported_pct?: number;
  };
  universityBlueprint?: {
    sections?: unknown[];
    warnings?: string[];
  };
  universityReductionPlan?: ReductionPlan;
  consistencyMatrixArtifact?: {
    status?: string;
    can_continue_step_11?: boolean;
    specific_rows?: unknown[];
    validation?: {
      row_alignment_ok?: boolean;
      warnings?: string[];
    };
  };
  warnings?: string[];
};

type PackageQualitySummary = {
  package_quality_score?: number;
  package_quality_level?: string;
  overall_package_score_100?: number;
  benchmark_ready?: boolean;
  indicators?: Record<string, unknown>;
  component_scores_100?: Record<string, number>;
  warnings?: string[];
};

type ReductionPlan = {
  reducer?: string;
  llm_used?: boolean;
  llm_generation?: {
    model?: string;
    total_tokens?: number;
    cost_cad?: number;
    duration_ms?: number;
  } | null;
  template_section_count?: number;
  generated_section_count?: number;
  section_mappings?: Array<{
    target_section_key?: string;
    target_title?: string;
    matched_master_keys?: string[];
    strategy?: string;
    warnings?: string[];
  }>;
  warnings?: string[];
};

function asDocxManifest(value: unknown): DocxManifest {
  return value && typeof value === "object" ? (value as DocxManifest) : {};
}

function asComposition(value: unknown): CompositionArtifact {
  return value && typeof value === "object" ? (value as CompositionArtifact) : {};
}

function asPackageQuality(value: unknown): PackageQualitySummary {
  return value && typeof value === "object" ? (value as PackageQualitySummary) : {};
}

function asDocxQa(value: unknown): DocxQaReport {
  return value && typeof value === "object" ? (value as DocxQaReport) : {};
}

function asReductionPlan(value: unknown): ReductionPlan {
  return value && typeof value === "object" ? (value as ReductionPlan) : {};
}

function statusClass(status?: string) {
  if (status === "pass" || status === "complete" || status === "executed") {
    return "border-emerald-100 bg-emerald-50 text-emerald-900";
  }

  if (status === "blocked" || status === "failed") {
    return "border-red-100 bg-red-50 text-red-900";
  }

  return "border-amber-100 bg-amber-50 text-amber-900";
}

function formatBytes(value?: number) {
  if (!value) {
    return "Pendiente";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function MetricCard(props: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    props.tone === "good"
      ? "bg-emerald-50 text-emerald-950"
      : props.tone === "warn"
        ? "bg-amber-50 text-amber-950"
        : "bg-white/90 text-[var(--color-ink)]";

  return (
    <article className={`rounded-[22px] border border-[rgba(74,58,97,0.08)] p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
        {props.label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6">{props.value}</p>
    </article>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
      <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
        {props.title}
      </h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function DocxCard(props: {
  title: string;
  description: string;
  manifest: DocxManifest;
  qaReport: DocxQaReport;
  downloadKind: "master_docx" | "university_docx";
  manifestKind: "master_manifest" | "university_manifest";
  modelKind: "master_academic_model" | "university_academic_model";
  qaKind: "master_qa" | "university_qa";
  fixtureCase: string;
}) {
  const checks = Object.entries(props.manifest.quality_checks ?? {});
  const qaChecks = Object.entries(props.qaReport.checks ?? {});
  const failedChecks = checks.filter(([, value]) => !value);
  const downloadUrl = `/api/labs/master-blueprint/artifact-file?caseName=${encodeURIComponent(
    props.fixtureCase,
  )}&kind=${props.downloadKind}`;
  const manifestUrl = `/api/labs/master-blueprint/artifact-file?caseName=${encodeURIComponent(
    props.fixtureCase,
  )}&kind=${props.manifestKind}`;
  const modelUrl = `/api/labs/master-blueprint/artifact-file?caseName=${encodeURIComponent(
    props.fixtureCase,
  )}&kind=${props.modelKind}`;
  const qaUrl = `/api/labs/master-blueprint/artifact-file?caseName=${encodeURIComponent(
    props.fixtureCase,
  )}&kind=${props.qaKind}`;

  return (
    <article className="rounded-[26px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-[var(--color-muted)]" />
            <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              {props.title}
            </h3>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
            {props.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white"
            href={downloadUrl}
          >
            <Download className="size-4" />
            Descargar Word
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.10)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
            href={manifestUrl}
          >
            Manifest
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.10)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
            href={modelUrl}
          >
            Modelo
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.10)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
            href={qaUrl}
          >
            QA
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="archivo" value={props.manifest.output_docx_file_name ?? "Pendiente"} />
        <MetricCard label="peso" value={formatBytes(props.manifest.file_size_bytes)} />
        <MetricCard label="cuerpo" value={`${props.manifest.main_body_section_count ?? props.manifest.section_count ?? 0}`} />
        <MetricCard label="matriz" value={`${props.manifest.matrix_rows ?? 0} filas`} />
        <MetricCard label="arquetipo" value={props.manifest.report_archetype ?? "n/d"} />
        <MetricCard label="qa docx" value={props.qaReport.score_100 === undefined ? "Pendiente" : `${props.qaReport.score_100}/100`} tone={props.qaReport.passed ? "good" : "warn"} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <MetricCard label="referencias" value={`${props.manifest.references_count ?? 0}`} />
        <MetricCard label="citas" value={`${props.manifest.citations_inserted_count ?? 0}`} />
        <MetricCard label="assets" value={`${props.manifest.asset_placement_count ?? 0}`} />
        <MetricCard label="assets render" value={`${props.manifest.renderable_asset_count ?? 0}`} />
        <MetricCard label="imagenes" value={`${props.manifest.rendered_image_asset_count ?? 0}`} />
        <MetricCard label="logos" value={`${props.manifest.available_logo_count ?? 0}`} />
        <MetricCard label="suprimidas" value={`${props.manifest.suppressed_section_count ?? 0}`} />
        <MetricCard label="duplicados" value={`${props.manifest.duplicate_pair_count ?? 0}`} tone={(props.manifest.duplicate_pair_count ?? 0) > 0 ? "warn" : "good"} />
        <MetricCard label="edicion LLM" value={`${props.manifest.llm_editorial_pass_count ?? 0}`} tone={(props.manifest.llm_editorial_pass_count ?? 0) > 0 ? "good" : "warn"} />
        <MetricCard label="tokens edit" value={`${props.manifest.llm_editorial_total_tokens ?? 0}`} />
        <MetricCard label="costo edit" value={`CAD ${(props.manifest.llm_editorial_cost_cad ?? 0).toFixed(4)}`} />
        <MetricCard
          label="enc/pie"
          value={props.manifest.quality_checks?.has_academic_header_footer ? "ok" : "pendiente"}
          tone={props.manifest.quality_checks?.has_academic_header_footer ? "good" : "warn"}
        />
        <MetricCard label="layout LLM" value={`${props.manifest.llm_layout_pass_count ?? 0}`} tone={(props.manifest.llm_layout_pass_count ?? 0) > 0 ? "good" : "warn"} />
        <MetricCard label="limpieza publica" value={`${props.manifest.public_source_title_replacements ?? 0} reemplazos`} tone={(props.manifest.public_remaining_title_leak_count ?? 0) === 0 ? "good" : "warn"} />
        <MetricCard label="hero image" value={props.manifest.hero_image_status ?? "n/d"} tone={props.manifest.hero_image_status === "generated" ? "good" : "warn"} />
        <MetricCard label="fig plan" value={`${props.manifest.figure_plan_count ?? 0}`} />
        <MetricCard label="eq plan" value={`${props.manifest.equation_plan_count ?? 0}`} />
        <MetricCard label="assets texto fuera" value={`${props.manifest.suppressed_text_asset_count ?? 0}`} />
        <MetricCard label="layout matriz" value={`${props.manifest.matrix_layout?.orientation ?? "n/d"} · ${props.manifest.matrix_layout?.font_size_pt ?? "-"}pt`} />
      </div>

      <div className="mt-5 rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.62)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Ruta local
        </p>
        <p className="mt-2 break-all font-mono text-xs leading-6 text-[var(--color-ink)]">
          {props.manifest.output_docx_path ?? "Aun no generado"}
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Quality checks
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {checks.length === 0 ? (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Sin manifest generado
              </span>
            ) : (
              checks.map(([key, value]) => (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    value
                      ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                      : "border-red-100 bg-red-50 text-red-900"
                  }`}
                  key={key}
                >
                  {key}: {value ? "ok" : "fallo"}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            DOCX QA
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {qaChecks.length === 0 ? (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Sin QA estructural
              </span>
            ) : (
              qaChecks.map(([key, value]) => (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    value
                      ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                      : "border-red-100 bg-red-50 text-red-900"
                  }`}
                  key={key}
                >
                  {key}: {value ? "ok" : "fallo"}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            OOXML patch pass
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--color-ink)]">
            {(props.manifest.ooxml_patch_report?.patches_applied ?? []).length > 0
              ? props.manifest.ooxml_patch_report?.patches_applied?.join(", ")
              : "Sin patches necesarios o no disponibles."}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Advertencias
          </p>
          {failedChecks.length > 0 ||
          (props.manifest.warnings ?? []).length > 0 ||
          (props.qaReport.failures ?? []).length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
              {failedChecks.map(([key]) => (
                <li key={key}>Check pendiente: {key}</li>
              ))}
              {(props.qaReport.failures ?? []).map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
              {(props.manifest.warnings ?? []).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-emerald-900">Sin advertencias del renderer.</p>
          )}
        </div>
      </div>
    </article>
  );
}

export function FinalOutputsReader({ snapshot }: FinalOutputsReaderProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "composition" | "raw">(
    "overview",
  );
  const composition = asComposition(snapshot.artifacts.blueprintComposition);
  const masterManifest = asDocxManifest(snapshot.artifacts.masterDocxRender);
  const universityManifest = asDocxManifest(snapshot.artifacts.universityDocxRender);
  const masterQaReport = asDocxQa(snapshot.artifacts.masterDocxQaReport);
  const universityQaReport = asDocxQa(snapshot.artifacts.universityDocxQaReport);
  const packageQuality = asPackageQuality(snapshot.artifacts.packageQualitySummary);
  const reductionPlan = asReductionPlan(
    snapshot.artifacts.universityReductionPlan ?? composition.universityReductionPlan,
  );
  const packageScore =
    packageQuality.overall_package_score_100 ?? packageQuality.package_quality_score;
  const matrix = composition.consistencyMatrixArtifact;
  const validationScore = composition.validationReport?.quality_report?.score_10;
  const hardFailures = composition.validationReport?.quality_report?.hard_failures ?? [];
  const warnings = useMemo(
    () =>
      Array.from(
        new Set([
          ...(composition.warnings ?? []),
          ...(composition.validationReport?.warnings ?? []),
          ...(reductionPlan.warnings ?? []),
          ...(packageQuality.warnings ?? []),
        ]),
      ).slice(0, 12),
    [composition, packageQuality, reductionPlan],
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5efe8_0%,#fbf8f3_46%,#f0e7dd_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="rounded-[34px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]"
                href="/lab/master-blueprint"
              >
                <ArrowLeft className="size-4" />
                Volver al lab
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Steps 11-13 / composicion + render DOCX
              </p>
              <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Revisión final del paquete académico
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Vista read-only para auditar la composición del blueprint, la matriz horizontal y
                los dos Word generados. Esta pantalla no ejecuta LLM ni re-renderiza documentos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass(composition.status)}`}>
                step 11: {composition.status ?? "pendiente"}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass(matrix?.status)}`}>
                matriz: {matrix?.status ?? "pendiente"}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="fixture" value={snapshot.fixtureCase} />
          <MetricCard label="run" value={snapshot.artifactRun?.runId ?? "runtime"} />
          <MetricCard
            label="score validacion"
            value={validationScore === undefined ? "Pendiente" : `${validationScore}/10`}
            tone={validationScore && validationScore >= 8 ? "good" : "warn"}
          />
          <MetricCard
            label="calidad paquete"
            value={
              packageScore === undefined
                ? "Pendiente"
                : `${packageScore.toFixed(2)}/100`
            }
            tone={
              packageScore && packageScore >= 75 ? "good" : "warn"
            }
          />
          <MetricCard
            label="benchmark"
            value={packageQuality.benchmark_ready ? "listo" : "aun no"}
          />
          <MetricCard
            label="docx"
            value={
              masterManifest.file_size_bytes && universityManifest.file_size_bytes
                ? "2 generados"
                : "pendientes"
            }
            tone={
              masterManifest.file_size_bytes && universityManifest.file_size_bytes ? "good" : "warn"
            }
          />
        </section>

        <div className="flex flex-wrap gap-2">
          {[
            ["overview", "Resumen"],
            ["documents", "Word"],
            ["composition", "Composición"],
            ["raw", "JSON raw"],
          ].map(([key, label]) => (
            <button
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                activeTab === key
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.82)] text-[var(--color-ink)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/84 text-[var(--color-muted)]"
              }`}
              key={key}
              onClick={() => setActiveTab(key as "overview" | "documents" | "composition" | "raw")}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Panel title="Estado del paquete">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard
                  label="alineación matriz"
                  value={matrix?.validation?.row_alignment_ok ? "ok" : "revisar"}
                  tone={matrix?.validation?.row_alignment_ok ? "good" : "warn"}
                />
                <MetricCard
                  label="filas de matriz"
                  value={`${matrix?.specific_rows?.length ?? 0}`}
                />
                <MetricCard
                  label="procedencia fuentes"
                  value={
                    composition.provenanceReport?.from_sources_pct === undefined
                      ? "Pendiente"
                      : `${composition.provenanceReport.from_sources_pct}%`
                  }
                />
                <MetricCard
                  label="secciones institucionales"
                  value={`${composition.universityBlueprint?.sections?.length ?? 0}`}
                />
                <MetricCard
                  label="reduccion LLM"
                  value={reductionPlan.llm_used ? "activa" : "pendiente/fallback"}
                  tone={reductionPlan.llm_used ? "good" : "warn"}
                />
                <MetricCard
                  label="reducer"
                  value={reductionPlan.reducer ?? "sin plan"}
                />
                <MetricCard
                  label="tokens reduccion"
                  value={
                    reductionPlan.llm_generation?.total_tokens === undefined
                      ? "Pendiente"
                      : `${reductionPlan.llm_generation.total_tokens}`
                  }
                />
              </div>
              <div className="mt-5 rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.62)] p-4">
                <div className="flex items-center gap-2">
                  {hardFailures.length === 0 ? (
                    <ShieldCheck className="size-5 text-emerald-700" />
                  ) : (
                    <FileWarning className="size-5 text-amber-700" />
                  )}
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {hardFailures.length === 0
                      ? "Sin fallas duras detectadas por validación."
                      : `${hardFailures.length} falla(s) dura(s) requieren revisión.`}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Advertencias principales">
              {warnings.length > 0 ? (
                <ul className="space-y-3 text-sm leading-7 text-[var(--color-ink)]">
                  {warnings.map((warning) => (
                    <li className="rounded-[16px] bg-amber-50 px-4 py-3 text-amber-950" key={warning}>
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2 rounded-[16px] bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">
                  <CheckCircle2 className="size-5" />
                  Sin advertencias consolidadas.
                </div>
              )}
            </Panel>

            <Panel title="Indicadores para benchmark futuro">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                <Gauge className="size-5 text-[var(--color-muted)]" />
                {packageScore === undefined
                  ? "Nivel pendiente"
                  : packageScore >= 85
                    ? "Paquete fuerte para benchmark"
                    : packageScore >= 75
                      ? "Paquete util con advertencias"
                      : "Paquete requiere iteracion"}
              </div>
              <JsonViewer
                className="mt-4"
                title="Indicadores"
                value={packageQuality.indicators ?? packageQuality.component_scores_100 ?? packageQuality}
              />
            </Panel>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="grid gap-5">
            <DocxCard
              description="Documento base para QA visual del Master Template LATAM: portada, secciones, matriz en horizontal, referencias y anexos de trazabilidad."
              downloadKind="master_docx"
              fixtureCase={snapshot.fixtureCase}
              manifest={masterManifest}
              manifestKind="master_manifest"
              modelKind="master_academic_model"
              qaKind="master_qa"
              qaReport={masterQaReport}
              title="Step 12 · Master DOCX"
            />
            <DocxCard
              description="Documento institucional derivado desde la plantilla del intake actual: conserva estructura universitaria, matriz, referencias y anexo de trazabilidad."
              downloadKind="university_docx"
              fixtureCase={snapshot.fixtureCase}
              manifest={universityManifest}
              manifestKind="university_manifest"
              modelKind="university_academic_model"
              qaKind="university_qa"
              qaReport={universityQaReport}
              title="Step 13 · Institucional DOCX"
            />
          </div>
        ) : null}

        {activeTab === "composition" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <JsonViewer title="Step 11 · blueprint_composition" value={composition} />
            <JsonViewer title="Step 11.5 - reduccion institucional" value={reductionPlan} />
            <JsonViewer title="Quality package" value={packageQuality} />
            <JsonViewer title="Master DOCX manifest" value={masterManifest} />
            <JsonViewer title="University DOCX manifest" value={universityManifest} />
            <JsonViewer title="Master academic model" value={snapshot.artifacts.masterAcademicDocument} />
            <JsonViewer title="University academic model" value={snapshot.artifacts.universityAcademicDocument} />
            <JsonViewer title="Master DOCX QA" value={masterQaReport} />
            <JsonViewer title="University DOCX QA" value={universityQaReport} />
          </div>
        ) : null}

        {activeTab === "raw" ? (
          <JsonViewer title="Snapshot completo read-only" value={snapshot} />
        ) : null}
      </div>
    </main>
  );
}
