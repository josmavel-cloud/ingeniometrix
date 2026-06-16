"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Database,
  FileJson,
  FileStack,
  GitCompare,
  Play,
  RotateCw,
  Waypoints,
} from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";
import {
  MASTER_BLUEPRINT_LAB_STEPS,
  MASTER_BLUEPRINT_LAB_STEP_KEYS,
} from "@/lib/labs/master-blueprint/steps";
import type {
  MasterBlueprintLabArtifacts,
  MasterBlueprintLabExecutionResponse,
  MasterBlueprintLabStepKey,
  MasterBlueprintLabStepRun,
  MasterBlueprintLabSyntheticOverview,
} from "@/lib/labs/master-blueprint/types";

type MasterBlueprintLabProps = {
  initialExecution: MasterBlueprintLabExecutionResponse;
  initialSelectedStepKey?: MasterBlueprintLabStepKey;
  initialSelectedArtifactKey?: string;
};

type PromptPlanShape = {
  artifact_type?: "section_planning";
  artifact_version?: "v3" | "v6";
  generated_at?: string;
  planner_mode?: "deterministic" | "llm_hybrid" | "llm_orchestrated";
  llm_provider?: string | null;
  llm_model?: string | null;
  refined_intake_context?: {
    refined_topic_es?: string;
    normalized_problem_es?: string;
    normalized_research_line_es?: string | null;
    normalized_methodology_es?: string | null;
    normalized_population_es?: string | null;
    normalized_constraints_es?: string | null;
    accepted_foreign_terms?: Array<{
      term: string;
      rationale: string;
      preferred_spanish_gloss?: string | null;
    }>;
    key_decisions?: string[];
    ambiguity_warnings?: string[];
  };
  source_context?: {
    template_key: string;
    template_version_id: string;
    source_lab: "blueprint_launch" | "lab_fixture";
    imported_topic: string;
    knowledge_area_label: string | null;
    citation_style?: string | null;
  };
  generation_waves?: Array<{
    wave_key: string;
    label: string;
    goal?: string;
    section_keys: string[];
    ready_count: number;
    blocked_count: number;
    output_context_keys?: string[];
  }>;
  context_blueprints?: Array<{
    context_key: string;
    produced_by_wave: string;
    derived_from_section_keys: string[];
    description: string;
    shape: string;
  }>;
  asset_inclusion_plan?: Array<{
    section_key: string;
    wave: string;
    asset_policy: string;
    critical_asset_keys: string[];
    useful_asset_keys: string[];
    optional_asset_keys?: string[];
  }>;
  revision_pass_plan?: Array<{
    section_key: string;
    enabled: boolean;
    revision_goals: string[];
    trigger_conditions: string[];
    depends_on_section_keys: string[];
  }>;
  title_refinement_plan?: {
    enabled?: boolean;
    wave?: string;
    depends_on_section_keys?: string[];
    prompt_mode?: string;
  };
  citation_plan?: {
    enabled?: boolean;
    wave?: string;
    style_target?: string | null;
    section_policies?: Array<{
      section_key: string;
      citation_density_target: string;
      citation_mode: string;
      derive_from_supported_sources_only: boolean;
    }>;
    bibliography_rules?: Record<string, unknown>;
  };
  global_observations?: string[];
  merge_warnings?: string[];
  refined_section_keys?: string[];
  checks?: {
    late_sections: string[];
    weak_sections: string[];
    blocked_sections: string[];
    assumption_heavy_sections: string[];
    sections_requiring_followup: string[];
  };
  llm_refinements?: Array<{
    section_key: string;
    recommended_phase: string | null;
    recommended_depends_on_keys: string[];
    recommended_evidence_snippet_ids: string[];
    recommended_assumption_ids: string[];
    support_strategy: string | null;
    extra_instructions: string[];
    rationale: string;
  }>;
  baseline_prompt_plan?: {
    generation_plan?: Array<{
      section_key: string;
      title: string;
      phase: string;
      wave?: string;
      generation_strategy?: string;
      prompt_mode?: string;
      readiness?: string;
      enough_to_draft?: boolean;
      depends_on_keys: string[];
      required_context_keys?: string[];
      upstream_context_keys?: string[];
      source_ids?: string[];
      snippet_ids?: string[];
      asset_keys?: string[];
      critical_asset_keys?: string[];
      useful_asset_keys?: string[];
      imported_source_ids?: string[];
      imported_snippet_ids?: string[];
      imported_asset_keys?: string[];
      assumption_ids?: string[];
      support_strategy?: string | null;
      retry_policy?: {
        enabled?: boolean;
        max_attempts?: number;
        retry_on?: string[];
      };
      needs_followup_before_strong_draft?: boolean;
      phase_locked?: boolean;
      instructions?: string[];
    }>;
    prompt_manifest?: Array<{
      section_key: string;
      title: string;
      phase: string;
      wave?: string;
      generation_strategy?: string;
      prompt_mode?: string;
      readiness?: string;
      enough_to_draft?: boolean;
      prompt: string;
      evidence_snippet_ids: string[];
      supporting_source_ids: string[];
      supporting_pdf_source_ids: string[];
      supporting_web_source_ids: string[];
      supporting_assumption_ids: string[];
      source_ids?: string[];
      asset_keys?: string[];
      critical_asset_keys?: string[];
      useful_asset_keys?: string[];
      imported_source_ids?: string[];
      imported_snippet_ids?: string[];
      imported_asset_keys?: string[];
      assumption_ids?: string[];
      required_context_keys?: string[];
      upstream_context_keys?: string[];
      support_strategy?: string | null;
      asset_policy?: string;
      citation_policy?: {
        expected_density?: string;
        citation_mode?: string;
      };
      retry_policy?: {
        enabled?: boolean;
        max_attempts?: number;
        retry_on?: string[];
      };
      needs_followup_before_strong_draft?: boolean;
    }>;
  };
    generation_plan?: Array<{
      section_key: string;
      title: string;
      phase: string;
      wave?: string;
      generation_strategy?: string;
      prompt_mode?: string;
      readiness?: string;
      enough_to_draft?: boolean;
      depends_on_keys: string[];
      required_context_keys?: string[];
      upstream_context_keys?: string[];
      source_ids?: string[];
      snippet_ids?: string[];
      asset_keys?: string[];
      critical_asset_keys?: string[];
      useful_asset_keys?: string[];
      imported_source_ids?: string[];
      imported_snippet_ids?: string[];
      imported_asset_keys?: string[];
      assumption_ids?: string[];
      support_strategy?: string | null;
      retry_policy?: {
        enabled?: boolean;
        max_attempts?: number;
        retry_on?: string[];
      };
      needs_followup_before_strong_draft?: boolean;
      phase_locked?: boolean;
      instructions?: string[];
  }>;
  prompt_manifest?: Array<{
    section_key: string;
    title: string;
      phase: string;
      wave?: string;
      generation_strategy?: string;
      prompt_mode?: string;
      readiness?: string;
      enough_to_draft?: boolean;
      prompt: string;
    evidence_snippet_ids: string[];
    supporting_source_ids: string[];
    supporting_pdf_source_ids: string[];
    supporting_web_source_ids: string[];
    supporting_assumption_ids: string[];
      source_ids?: string[];
      asset_keys?: string[];
      critical_asset_keys?: string[];
      useful_asset_keys?: string[];
      imported_source_ids?: string[];
      imported_snippet_ids?: string[];
      imported_asset_keys?: string[];
      assumption_ids?: string[];
      required_context_keys?: string[];
      upstream_context_keys?: string[];
      support_strategy?: string | null;
      asset_policy?: string;
      citation_policy?: {
        expected_density?: string;
        citation_mode?: string;
      };
      retry_policy?: {
        enabled?: boolean;
        max_attempts?: number;
        retry_on?: string[];
      };
      needs_followup_before_strong_draft?: boolean;
    }>;
};

type SectionDraftShape = {
  drafts?: Array<{
    section_key: string;
    title: string;
    phase: string;
    wave?: string;
    generation_strategy?: string;
    content: string;
    content_blocks?: Array<unknown>;
    content_format_version?: string;
    domain_profile?: {
      domain_family?: string;
      evidence_style?: string;
      preferred_output_modes?: string[];
    };
    support_level: string;
    supported_source_ids: string[];
    supported_pdf_source_ids: string[];
    supported_web_source_ids: string[];
    supported_assumption_ids: string[];
    evidence_snippet_ids: string[];
    used_asset_keys?: string[];
    used_reference_ids?: string[];
    citation_policy?: {
      expected_density?: string;
      citation_mode?: string;
    };
    warnings: string[];
  }>;
  referencesWorkingSet?: {
    reference_ids?: string[];
    asset_keys?: string[];
    section_usage?: Array<{
      section_key: string;
      reference_ids?: string[];
      asset_keys?: string[];
    }>;
  };
};

type EvidenceLedgerInspectorShape = {
  snippets?: Array<{ snippet_id: string; label: string; text: string }>;
  assumptions?: Array<{ assumption_id: string; statement: string }>;
  assets?: Array<{
    source_id: string;
    asset_key: string;
    title: string;
    kind: "image" | "equation" | "table";
    caption: string | null;
    page_number: number | null;
    file_path: string | null;
    mime_type: string | null;
    width_px: number | null;
    height_px: number | null;
    text_content: string | null;
  }>;
};

function getStepRun(steps: MasterBlueprintLabStepRun[], stepKey: MasterBlueprintLabStepKey) {
  return steps.find((step) => step.key === stepKey) ?? null;
}

function getMainArtifactForStep(
  artifacts: MasterBlueprintLabArtifacts,
  stepKey: MasterBlueprintLabStepKey,
) {
  switch (stepKey) {
    case "master_template_runtime":
      return {
        masterTemplateRuntime: artifacts.masterTemplateRuntime,
        templateImportContext: artifacts.templateImportContext,
      };
    case "prompt_planning":
      return artifacts.promptPlan;
    case "section_generation":
      return artifacts.sectionDrafts;
    case "consistency_matrix":
      return artifacts.consistencyMatrix;
    case "blueprint_composition":
      return artifacts.blueprintComposition;
    case "legacy_blueprint_composition":
      return artifacts.legacyBlueprint;
    case "validation":
      return artifacts.validationReport;
    case "provenance":
      return artifacts.provenanceReport;
    case "university_derivation":
      return artifacts.universityBlueprint;
    case "master_docx_render":
      return artifacts.masterDocxRender;
    case "university_docx_render":
      return artifacts.universityDocxRender;
    default:
      return null;
  }
}

function getArtifactInspectorEntries(
  execution: MasterBlueprintLabExecutionResponse,
): Array<{ key: string; label: string; value: unknown }> {
  const promptPlan = (execution.artifacts.promptPlan ?? {}) as PromptPlanShape;
  const sectionDrafts = (execution.artifacts.sectionDrafts ?? {}) as SectionDraftShape;

  return [
    { key: "synthetic_overview", label: "imported overview", value: execution.inspectors.syntheticOverview },
    { key: "project", label: "imported project", value: execution.inspectors.project },
    { key: "intake", label: "imported intake", value: execution.inspectors.intake },
    { key: "source_gate", label: "imported source gate", value: execution.inspectors.sourceGate },
    { key: "acquisition", label: "imported acquisition", value: execution.inspectors.acquisition },
    { key: "source_registry", label: "source registry", value: execution.inspectors.sourceRegistry },
    { key: "pdf_downloads", label: "imported pdf downloads", value: execution.inspectors.pdfDownloads },
    { key: "evidence_packs", label: "imported evidence packs", value: execution.inspectors.evidencePacks },
    { key: "evidence_ledger", label: "evidence ledger", value: execution.inspectors.evidenceLedger },
    { key: "assumptions", label: "assumptions", value: execution.inspectors.assumptions },
    { key: "snippets", label: "snippets", value: execution.inspectors.snippets },
    { key: "master_template", label: "master template runtime", value: execution.artifacts.masterTemplateRuntime },
    { key: "template_import_context", label: "template import context", value: execution.artifacts.templateImportContext },
    { key: "prompt_plan_summary", label: "prompt planning summary", value: {
      artifact_type: promptPlan.artifact_type ?? null,
      artifact_version: promptPlan.artifact_version ?? null,
      generated_at: promptPlan.generated_at ?? null,
      planner_mode: promptPlan.planner_mode ?? "deterministic",
      llm_provider: promptPlan.llm_provider ?? null,
      llm_model: promptPlan.llm_model ?? null,
      refined_intake_context: promptPlan.refined_intake_context ?? null,
      source_context: promptPlan.source_context ?? null,
      generation_waves: promptPlan.generation_waves ?? [],
      context_blueprints: promptPlan.context_blueprints ?? [],
      asset_inclusion_plan: promptPlan.asset_inclusion_plan ?? [],
      revision_pass_plan: promptPlan.revision_pass_plan ?? [],
      title_refinement_plan: promptPlan.title_refinement_plan ?? null,
      citation_plan: promptPlan.citation_plan ?? null,
      checks: promptPlan.checks ?? {},
      refined_section_keys: promptPlan.refined_section_keys ?? [],
      global_observations: promptPlan.global_observations ?? [],
      merge_warnings: promptPlan.merge_warnings ?? [],
    } },
    { key: "prompt_plan_baseline", label: "prompt plan baseline", value: promptPlan.baseline_prompt_plan ?? {} },
    { key: "prompt_plan_refinements", label: "prompt plan refinements", value: promptPlan.llm_refinements ?? [] },
    { key: "prompt_manifest", label: "prompt manifest", value: promptPlan.prompt_manifest ?? [] },
    { key: "section_drafts", label: "section drafts", value: sectionDrafts },
    {
      key: "references_working_set",
      label: "references working set",
      value: sectionDrafts.referencesWorkingSet ?? {},
    },
    { key: "consistency_matrix", label: "consistency matrix", value: execution.artifacts.consistencyMatrix },
    { key: "legacy_blueprint", label: "legacy blueprint", value: execution.artifacts.legacyBlueprint },
    { key: "validation_report", label: "validation report", value: execution.artifacts.validationReport },
    { key: "provenance_report", label: "provenance report", value: execution.artifacts.provenanceReport },
    { key: "university_blueprint", label: "university blueprint", value: execution.artifacts.universityBlueprint },
    { key: "master_docx_render", label: "master docx render", value: execution.artifacts.masterDocxRender },
    { key: "university_docx_render", label: "university docx render", value: execution.artifacts.universityDocxRender },
  ];
}

function getPromptRefinement(
  promptPlan: PromptPlanShape,
  sectionKey: string | null,
) {
  if (!sectionKey) {
    return null;
  }

  return (
    promptPlan.llm_refinements?.find((item) => item.section_key === sectionKey) ?? null
  );
}

function getSupportLevelPreview(item: NonNullable<PromptPlanShape["prompt_manifest"]>[number]) {
  if ((item.supporting_pdf_source_ids?.length ?? 0) > 0) {
    return "pdf_supported";
  }

  if ((item.supporting_source_ids?.length ?? 0) > 0) {
    return "reference_supported";
  }

  if ((item.supporting_web_source_ids?.length ?? 0) > 0) {
    return "web_supported";
  }

  if ((item.supporting_assumption_ids?.length ?? 0) > 0) {
    return "assumption_backed";
  }

  return "intake_supported";
}

function summarizeExecutionStatus(execution: MasterBlueprintLabExecutionResponse) {
  if (execution.steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (execution.steps.every((step) => step.status === "executed")) {
    return "completed";
  }

  return "in_progress";
}

function diffCount(previousValue: unknown, currentValue: unknown) {
  const previousLines = JSON.stringify(previousValue, null, 2).split("\n");
  const currentLines = JSON.stringify(currentValue, null, 2).split("\n");
  const maxLength = Math.max(previousLines.length, currentLines.length);
  let changed = 0;

  for (let index = 0; index < maxLength; index += 1) {
    if ((previousLines[index] ?? "") !== (currentLines[index] ?? "")) {
      changed += 1;
    }
  }

  return changed;
}

function formatBytes(value: number) {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function StepStatusPill({ status }: { status: MasterBlueprintLabStepRun["status"] }) {
  const tone =
    status === "executed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "ready"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : status === "failed"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {status}
    </span>
  );
}

function SyntheticScenarioOverview(props: {
  execution: MasterBlueprintLabExecutionResponse;
  onSelectArtifact: (artifactKey: string) => void;
}) {
  const overview = props.execution.inspectors.syntheticOverview as MasterBlueprintLabSyntheticOverview;
  const templateImportContext = (props.execution.artifacts.templateImportContext ?? {}) as {
    source_snapshot?: {
      source_lab?: string;
      lab_state_path?: string;
      latest_consolidated_evidence_path?: string | null;
      materialized_content_dir?: string;
      extracted_assets_dir?: string;
      resolved_materialized_run_id?: string | null;
      resolved_assets_run_id?: string | null;
      resolved_consolidated_run_id?: string | null;
    };
    imported_project_context?: {
      knowledge_area_label?: string | null;
      topic?: string;
    };
    imported_evidence_context?: {
      selected_source_count?: number;
      materialized_pdf_count?: number;
      pack_count?: number;
      total_snippet_count?: number;
      total_asset_count?: number;
      evidence_unit_count?: number;
      original_excerpt_count?: number;
      asset_reference_count?: number;
      section_dossier_count?: number;
      overall_readiness?: string | null;
      quality_gate_status?: string | null;
      baseline_comparison_status?: string | null;
    };
    proposal_context?: {
      method_candidate?: { method_family?: string | null };
      framework_candidate?: { core_framework?: string | null };
      evidence_gaps?: string[];
      followup_requirements?: {
        blocking?: string[];
        recommended?: string[];
      } | null;
    };
    checks?: {
      weak_sections?: string[];
      blocked_sections?: string[];
      selected_sources_match?: boolean;
      stale_snapshot_detected?: boolean;
    };
    imported_handoff_summary?: {
      ready_for_steps_7_11?: boolean | null;
      quality_gate_status?: string | null;
      baseline_comparison_status?: string | null;
      handoff_notes?: string[];
      traceability_warnings?: string[];
      previous_lab_warnings?: string[];
      read_only_input_paths?: string[];
    };
  };
  const sourceCards = overview.sourceCards.slice(0, 5);
  const sectionHints = overview.sectionHintCoverage.slice(0, 6);
  const signalEntries = Object.entries(overview.evidenceCoverage.signals);
  const snippetOriginEntries = Object.entries(overview.evidenceCoverage.snippetOrigins);

  return (
    <section className="surface-panel rounded-[32px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Estado importado cargado
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            Estado importado actual antes de ejecutar los pasos 7 al 11
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            Esta vista ya no mezcla casos viejos ni ejemplos historicos. Todo lo que ves aqui
            corresponde al intake actual importado desde el lab previo y a su estado congelado
            de pasos 1 al 6.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "synthetic_overview", label: "overview" },
            { key: "template_import_context", label: "import context" },
            { key: "pdf_downloads", label: "pdfs" },
            { key: "evidence_packs", label: "evidence packs" },
            { key: "evidence_ledger", label: "ledger" },
          ].map((entry) => (
            <button
              className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white/88 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]"
              key={entry.key}
              onClick={() => props.onSelectArtifact(entry.key)}
              type="button"
            >
              Abrir {entry.label}
            </button>
          ))}
        </div>
      </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Estado fuente"
            value={templateImportContext.source_snapshot?.source_lab ?? "lab_fixture"}
          />
          <SummaryCard label="Fuentes totales" value={`${overview.sourceMix.total}`} />
        <SummaryCard
          label="PDFs descargados"
          value={`${overview.pdfCoverage.downloaded}/${overview.pdfCoverage.total}`}
        />
        <SummaryCard
          label="Snippets importados"
          value={`${templateImportContext.imported_evidence_context?.total_snippet_count ?? overview.evidenceCoverage.snippets}`}
        />
          <SummaryCard
            label="Assets importados"
            value={`${templateImportContext.imported_evidence_context?.total_asset_count ?? overview.evidenceCoverage.assets}`}
          />
          <SummaryCard
            label="Evidence units"
            value={`${templateImportContext.imported_evidence_context?.evidence_unit_count ?? 0}`}
          />
          <SummaryCard
            label="Dossiers"
            value={`${templateImportContext.imported_evidence_context?.section_dossier_count ?? 0}`}
          />
          <SummaryCard
            label="Quality gate"
            value={templateImportContext.imported_evidence_context?.quality_gate_status ?? "sin dato"}
          />
          <SummaryCard
            label="Baseline"
            value={templateImportContext.imported_evidence_context?.baseline_comparison_status ?? "sin dato"}
          />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Intake actual importado
          </p>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>Titulo:</strong> {overview.project.title}</p>
            <p>
              <strong>Universidad y programa:</strong> {overview.project.university ?? "sin dato"} /{" "}
              {overview.project.program ?? "sin dato"}
            </p>
            <p>
              <strong>Template universitario:</strong> {overview.project.templateKey ?? "sin dato"}
            </p>
            <p>
              <strong>Tema declarado:</strong> {templateImportContext.imported_project_context?.topic ?? overview.intake.objectiveSummary ?? "sin dato"}
            </p>
            <p>
              <strong>Area:</strong> {templateImportContext.imported_project_context?.knowledge_area_label ?? "sin dato"}
            </p>
            <p>
              <strong>Problema base:</strong> {overview.intake.problemSummary ?? "sin dato"}
            </p>
            <p>
              <strong>Poblacion:</strong> {overview.intake.populationSummary ?? "sin dato"}
            </p>
          </div>
        </article>

          <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Estado importado de evidencia
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>fuentes seleccionadas:</strong> {templateImportContext.imported_evidence_context?.selected_source_count ?? overview.sourceMix.selected}</p>
            <p><strong>PDFs materializados:</strong> {templateImportContext.imported_evidence_context?.materialized_pdf_count ?? overview.pdfCoverage.downloaded}</p>
            <p><strong>packs por fuente:</strong> {templateImportContext.imported_evidence_context?.pack_count ?? overview.evidenceCoverage.packs}</p>
            <p><strong>snippets del estado importado:</strong> {templateImportContext.imported_evidence_context?.total_snippet_count ?? overview.evidenceCoverage.snippets}</p>
              <p><strong>assets del estado importado:</strong> {templateImportContext.imported_evidence_context?.total_asset_count ?? overview.evidenceCoverage.assets}</p>
              <p><strong>extractos directos:</strong> {templateImportContext.imported_evidence_context?.original_excerpt_count ?? 0}</p>
              <p><strong>asset references:</strong> {templateImportContext.imported_evidence_context?.asset_reference_count ?? 0}</p>
              <p><strong>overall readiness:</strong> {templateImportContext.imported_evidence_context?.overall_readiness ?? "sin dato"}</p>
              <p><strong>peso descargado local:</strong> {formatBytes(overview.pdfCoverage.bytesDownloaded)}</p>
            </div>
          {(overview.pdfCoverage.warnings ?? []).length > 0 ? (
            <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50/80 p-3 text-sm leading-6 text-amber-900">
              {overview.pdfCoverage.warnings.map((warning) => (
                <p key={warning}>* {warning}</p>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Fuentes activas del intake actual
          </p>
          <div className="mt-4 grid gap-3">
            {sourceCards.map((source) => (
              <div
                className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-4"
                key={source.sourceId}
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                      {source.origin} {source.year ? `· ${source.year}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-ink)]">
                      {source.title}
                    </p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    {source.pdfStatus}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
                    snippets: {source.snippetCount}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
                    assets: {source.assetCount}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
                    pdf_url: {source.hasPdfUrl ? "si" : "no"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <div className="grid gap-4">
          <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Consolidacion importada
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>evidence packs:</strong> {overview.evidenceCoverage.packs}</p>
              <p><strong>assets del ledger:</strong> {overview.evidenceCoverage.assets}</p>
              <p><strong>metodo candidato:</strong> {templateImportContext.proposal_context?.method_candidate?.method_family ?? "sin dato"}</p>
              <p><strong>framework candidato:</strong> {templateImportContext.proposal_context?.framework_candidate?.core_framework ?? "sin dato"}</p>
              {signalEntries.map(([signalKey, count]) => (
                <p key={signalKey}>
                  <strong>{signalKey}:</strong> {count}
                </p>
              ))}
            </div>
          </article>

          <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Snippets, secciones y riesgos visibles
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              {snippetOriginEntries.map(([originKey, count]) => (
                <p key={originKey}>
                  <strong>{originKey}:</strong> {count}
                </p>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {sectionHints.map((entry) => (
                <div
                  className="flex items-center justify-between rounded-[16px] bg-[rgba(248,244,252,0.72)] px-3 py-2 text-sm text-[var(--color-ink)]"
                  key={entry.sectionKey}
                >
                  <span>{entry.sectionKey}</span>
                  <span className="font-semibold">{entry.snippetCount}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>weak sections:</strong> {(templateImportContext.checks?.weak_sections ?? []).join(", ") || "ninguna"}</p>
              <p><strong>blocked sections:</strong> {(templateImportContext.checks?.blocked_sections ?? []).join(", ") || "ninguna"}</p>
            </div>
          </article>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Snapshot read-only resuelto
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)] break-all">
              <p><strong>lab_state:</strong> {templateImportContext.source_snapshot?.lab_state_path ?? "sin dato"}</p>
              <p><strong>consolidated_latest:</strong> {templateImportContext.source_snapshot?.latest_consolidated_evidence_path ?? "sin dato"}</p>
              <p><strong>materialized_run:</strong> {templateImportContext.source_snapshot?.resolved_materialized_run_id ?? "sin dato"}</p>
              <p><strong>assets_run:</strong> {templateImportContext.source_snapshot?.resolved_assets_run_id ?? "sin dato"}</p>
              <p><strong>consolidated_run:</strong> {templateImportContext.source_snapshot?.resolved_consolidated_run_id ?? "sin dato"}</p>
            </div>
          </article>

          <article className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Handoff y consistencia
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>ready_for_steps_7_11:</strong> {String(templateImportContext.imported_handoff_summary?.ready_for_steps_7_11 ?? "sin dato")}</p>
              <p><strong>selected_sources_match:</strong> {String(templateImportContext.checks?.selected_sources_match ?? "sin dato")}</p>
              <p><strong>stale_snapshot_detected:</strong> {String(templateImportContext.checks?.stale_snapshot_detected ?? "sin dato")}</p>
              <p><strong>traceability warnings:</strong> {(templateImportContext.imported_handoff_summary?.traceability_warnings ?? []).length}</p>
              <p><strong>handoff notes:</strong> {(templateImportContext.imported_handoff_summary?.handoff_notes ?? []).length}</p>
            </div>
          </article>
        </div>
      </div>

      <article className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Metodo, framework y faltantes importados
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              Este resumen es el insumo congelado que vamos a usar para planificar y depurar
              los pasos 7 al 11. Si algo no esta aqui, se trata como faltante del estado fuente,
              no como dato inventado por este lab.
            </p>
          </div>
          <button
            className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]"
            onClick={() => props.onSelectArtifact("template_import_context")}
            type="button"
          >
            Abrir import context
          </button>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Candidatos consolidados
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>Metodo candidato:</strong> {templateImportContext.proposal_context?.method_candidate?.method_family ?? "faltante"}</p>
              <p><strong>Framework candidato:</strong> {templateImportContext.proposal_context?.framework_candidate?.core_framework ?? "faltante"}</p>
              <p><strong>blocking followups:</strong> {(templateImportContext.proposal_context?.followup_requirements?.blocking ?? []).length}</p>
              <p><strong>recommended followups:</strong> {(templateImportContext.proposal_context?.followup_requirements?.recommended ?? []).length}</p>
            </div>
          </div>
          <div className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Gaps explicitados por el lab previo
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              {(templateImportContext.proposal_context?.evidence_gaps ?? []).slice(0, 5).map((gap) => (
                <p key={gap}>* {gap}</p>
              ))}
              {(templateImportContext.proposal_context?.evidence_gaps ?? []).length === 0 ? (
                <p>Sin gaps declarados en el snapshot importado.</p>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

function StepNavigator(props: {
  selectedStepKey: MasterBlueprintLabStepKey;
  steps: MasterBlueprintLabExecutionResponse["steps"];
  onSelect: (stepKey: MasterBlueprintLabStepKey) => void;
}) {
  return (
    <aside className="surface-panel rounded-[28px] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Waypoints className="size-4 text-[var(--color-coral)]" />
        <p className="text-sm font-semibold text-[var(--color-ink)]">Step Navigator</p>
      </div>
      <div className="grid gap-3">
        {MASTER_BLUEPRINT_LAB_STEPS.map((step, index) => {
          const run = getStepRun(props.steps, step.key);

          return (
            <button
              className={`rounded-[22px] border px-4 py-4 text-left transition-transform hover:-translate-y-0.5 ${
                props.selectedStepKey === step.key
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/76"
              }`}
              key={step.key}
              onClick={() => props.onSelect(step.key)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.72)]">
                    Paso {index + 5}
                  </p>
                  <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                    {step.title}
                  </p>
                </div>
                <StepStatusPill status={run?.status ?? "pending"} />
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{step.summary}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>Artifacts: {run?.artifactCount ?? 0}</span>
                <span>{run?.durationMs ? `${run.durationMs} ms` : "sin ejecutar"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function DataInspector(props: {
  execution: MasterBlueprintLabExecutionResponse;
  selectedArtifactKey: string;
  onSelectArtifact: (artifactKey: string) => void;
}) {
  const entries = getArtifactInspectorEntries(props.execution);
  const selectedEntry =
    entries.find((entry) => entry.key === props.selectedArtifactKey) ?? entries[0];

  return (
    <aside className="surface-panel rounded-[28px] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Database className="size-4 text-[var(--color-coral)]" />
        <p className="text-sm font-semibold text-[var(--color-ink)]">Data Inspector</p>
      </div>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <button
            className={`rounded-[18px] border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] ${
              entry.key === selectedEntry.key
                ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)] text-[var(--color-ink)]"
                : "border-[rgba(74,58,97,0.08)] bg-white/76 text-[var(--color-muted)]"
            }`}
            key={entry.key}
            onClick={() => props.onSelectArtifact(entry.key)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <JsonViewer className="mt-4" title={selectedEntry.label} value={selectedEntry.value ?? {}} />
    </aside>
  );
}

function PromptInspector(props: {
  execution: MasterBlueprintLabExecutionResponse;
  selectedPromptKey: string | null;
  onSelectPrompt: (promptKey: string) => void;
}) {
  const promptPlan = (props.execution.artifacts.promptPlan ?? {}) as PromptPlanShape;
  const manifest = promptPlan.prompt_manifest ?? [];
  const generationPlan = promptPlan.generation_plan ?? [];
  const baselineManifest = promptPlan.baseline_prompt_plan?.prompt_manifest ?? [];
  const baselineGenerationPlan = promptPlan.baseline_prompt_plan?.generation_plan ?? [];
  const selectedPrompt =
    manifest.find((item) => item.section_key === props.selectedPromptKey) ?? manifest[0] ?? null;
  const selectedPlanItem = generationPlan.find(
    (item) => item.section_key === selectedPrompt?.section_key,
  );
  const baselinePrompt = baselineManifest.find(
    (item) => item.section_key === selectedPrompt?.section_key,
  );
  const baselinePlanItem = baselineGenerationPlan.find(
    (item) => item.section_key === selectedPrompt?.section_key,
  );
  const refinement = getPromptRefinement(promptPlan, selectedPrompt?.section_key ?? null);

  if (manifest.length === 0 || !selectedPrompt) {
    return null;
  }

  return (
    <section className="surface-panel rounded-[28px] p-5">
      <div className="flex items-center gap-2">
        <FileStack className="size-4 text-[var(--color-coral)]" />
        <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
          Prompt Inspector
        </h3>
      </div>
      <div className="mt-4 flex gap-2 overflow-auto pb-1">
        {manifest.map((item) => (
          <button
            className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
              item.section_key === selectedPrompt.section_key
                ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)] text-[var(--color-ink)]"
                : "border-[rgba(74,58,97,0.08)] bg-white/76 text-[var(--color-muted)]"
            }`}
            key={item.section_key}
            onClick={() => props.onSelectPrompt(item.section_key)}
            type="button"
          >
            {item.section_key}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Metadata
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>section_key:</strong> {selectedPrompt.section_key}</p>
            <p><strong>phase:</strong> {selectedPrompt.phase}</p>
            <p><strong>wave:</strong> {selectedPrompt.wave ?? selectedPlanItem?.wave ?? "sin dato"}</p>
            <p><strong>generation_strategy:</strong> {selectedPrompt.generation_strategy ?? selectedPlanItem?.generation_strategy ?? "sin dato"}</p>
            <p><strong>readiness:</strong> {selectedPrompt.readiness ?? selectedPlanItem?.readiness ?? "sin dato"}</p>
            <p><strong>planner_mode:</strong> {promptPlan.planner_mode ?? "deterministic"}</p>
            <p>
              <strong>LLM:</strong>{" "}
              {promptPlan.llm_provider
                ? `${promptPlan.llm_provider} / ${promptPlan.llm_model ?? "sin modelo"}`
                : "disabled"}
            </p>
            <p><strong>support_level esperado:</strong> {getSupportLevelPreview(selectedPrompt)}</p>
            <p>
              <strong>dependencias previas:</strong>{" "}
              {selectedPlanItem?.depends_on_keys?.length
                ? selectedPlanItem.depends_on_keys.join(", ")
                : "sin dependencias"}
            </p>
            <p>
              <strong>required_context_keys:</strong>{" "}
              {selectedPrompt.required_context_keys?.join(", ") || "sin dato"}
            </p>
            <p>
              <strong>snippets:</strong> {selectedPrompt.evidence_snippet_ids.length}
            </p>
            <p>
              <strong>followup:</strong>{" "}
              {selectedPrompt.needs_followup_before_strong_draft ? "si" : "no"}
            </p>
          </div>
        </div>
        <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Soportes
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>Fuentes:</strong> {selectedPrompt.supporting_source_ids.join(", ") || "ninguna"}</p>
            <p><strong>PDF:</strong> {selectedPrompt.supporting_pdf_source_ids.join(", ") || "ninguno"}</p>
            <p><strong>Web:</strong> {selectedPrompt.supporting_web_source_ids.join(", ") || "ninguno"}</p>
            <p><strong>Assets:</strong> {selectedPrompt.asset_keys?.join(", ") || "ninguno"}</p>
            <p><strong>Imported source_ids:</strong> {selectedPrompt.imported_source_ids?.join(", ") || "ninguno"}</p>
            <p><strong>Imported snippet_ids:</strong> {selectedPrompt.imported_snippet_ids?.join(", ") || "ninguno"}</p>
            <p>
              <strong>Assumptions:</strong>{" "}
              {selectedPrompt.supporting_assumption_ids.join(", ") || "ninguna"}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Baseline vs refinado
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>baseline phase:</strong> {baselinePlanItem?.phase ?? "sin baseline"}</p>
            <p><strong>merged phase:</strong> {selectedPlanItem?.phase ?? "sin merged"}</p>
            <p><strong>baseline wave:</strong> {baselinePlanItem?.wave ?? "sin baseline"}</p>
            <p><strong>merged wave:</strong> {selectedPlanItem?.wave ?? "sin merged"}</p>
            <p>
              <strong>baseline depends_on:</strong>{" "}
              {baselinePlanItem?.depends_on_keys?.join(", ") || "ninguna"}
            </p>
            <p>
              <strong>merged depends_on:</strong>{" "}
              {selectedPlanItem?.depends_on_keys?.join(", ") || "ninguna"}
            </p>
            <p>
              <strong>baseline snippets:</strong>{" "}
              {baselinePrompt?.evidence_snippet_ids?.length ?? 0}
            </p>
            <p>
              <strong>merged snippets:</strong>{" "}
              {selectedPrompt.evidence_snippet_ids.length}
            </p>
            <p>
              <strong>extra instructions:</strong>{" "}
              {refinement?.extra_instructions.length ?? 0}
            </p>
          </div>
        </div>
        <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Rationale del planner
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p>
              <strong>support_strategy:</strong>{" "}
              {selectedPrompt.support_strategy ??
                refinement?.support_strategy ??
                "sin refinamiento LLM para esta seccion"}
            </p>
            <p>
              <strong>rationale:</strong>{" "}
              {refinement?.rationale ?? "El planner mantuvo el baseline determinista."}
            </p>
            {(refinement?.extra_instructions ?? []).map((instruction) => (
              <p key={instruction}>* {instruction}</p>
            ))}
          </div>
        </div>
      </div>
      {(promptPlan.global_observations?.length ?? 0) > 0 ? (
        <div className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.7)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Observaciones globales del planner
          </p>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            {(promptPlan.global_observations ?? []).map((observation) => (
              <p key={observation}>* {observation}</p>
            ))}
          </div>
        </div>
      ) : null}
  <JsonViewer className="mt-4" title={`prompt: ${selectedPrompt.section_key}`} value={selectedPrompt.prompt} />
    </section>
  );
}

function buildAssetPreviewUrl(asset: {
  file_path: string | null;
  mime_type: string | null;
}) {
  if (!asset.file_path) {
    return null;
  }

  const searchParams = new URLSearchParams({
    path: asset.file_path,
  });

  if (asset.mime_type) {
    searchParams.set("mimeType", asset.mime_type);
  }

  return `/api/labs/master-blueprint/repo-asset?${searchParams.toString()}`;
}

function DraftBlockRenderer(props: {
  block: Record<string, unknown>;
  assetLookup: Map<string, NonNullable<EvidenceLedgerInspectorShape["assets"]>[number]>;
}) {
  const blockId = typeof props.block.block_id === "string" ? props.block.block_id : "block";
  const role = typeof props.block.role === "string" ? props.block.role : "unknown";
  const text = typeof props.block.text === "string" ? props.block.text : null;
  const structuredData =
    props.block.structured_data && typeof props.block.structured_data === "object"
      ? (props.block.structured_data as {
          schema_type?: string;
          columns?: string[];
          rows?: Array<Array<string | number | boolean | null>>;
          values?: Record<string, unknown>;
        })
      : null;
  const assetRef =
    props.block.asset_ref && typeof props.block.asset_ref === "object"
      ? (props.block.asset_ref as {
          asset_key?: string;
          title?: string | null;
          caption?: string | null;
        })
      : null;
  const children = Array.isArray(props.block.children)
    ? (props.block.children as Array<Record<string, unknown>>)
    : [];

  if (role === "list") {
    return (
      <div className="grid gap-3" key={blockId}>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--color-ink)]">
          {children.map((child) => {
            const childText = typeof child.text === "string" ? child.text : "";

            return <li key={typeof child.block_id === "string" ? child.block_id : childText}>{childText}</li>;
          })}
        </ul>
      </div>
    );
  }

  if (role === "table" || structuredData?.schema_type === "table") {
    const columns = Array.isArray(structuredData?.columns) ? structuredData.columns : [];
    const rows = Array.isArray(structuredData?.rows) ? structuredData.rows : [];

    return (
      <div className="overflow-auto rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white" key={blockId}>
        <table className="min-w-full border-collapse text-sm text-[var(--color-ink)]">
          {columns.length > 0 ? (
            <thead className="bg-[rgba(248,244,252,0.8)]">
              <tr>
                {columns.map((column) => (
                  <th className="border-b border-[rgba(74,58,97,0.08)] px-3 py-2 text-left font-semibold" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => (
                <tr className="align-top" key={`${blockId}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      className="border-t border-[rgba(74,58,97,0.08)] px-3 py-2 leading-6"
                      key={`${blockId}-cell-${rowIndex}-${cellIndex}`}
                    >
                      {cell === null ? "—" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3 text-[var(--color-muted)]">Tabla sin filas estructuradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (role === "equation" || structuredData?.schema_type === "equation") {
    const equationText =
      text ??
      (typeof structuredData?.values?.latex === "string" ? structuredData.values.latex : null) ??
      "Ecuacion sin representacion textual.";

    return (
      <div
        className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.8)] px-4 py-4 font-mono text-sm leading-7 text-[var(--color-ink)]"
        key={blockId}
      >
        {equationText}
      </div>
    );
  }

  if (role === "figure" || assetRef?.asset_key) {
    const linkedAsset = assetRef?.asset_key ? props.assetLookup.get(assetRef.asset_key) : null;
    const previewUrl = linkedAsset ? buildAssetPreviewUrl(linkedAsset) : null;

    return (
      <figure
        className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4"
        key={blockId}
      >
        {previewUrl && linkedAsset?.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={linkedAsset.caption ?? linkedAsset.title}
            className="max-h-[28rem] w-full rounded-[18px] object-contain"
            src={previewUrl}
          />
        ) : null}
        <figcaption className="mt-3 grid gap-1 text-sm leading-6 text-[var(--color-ink)]">
          <p><strong>{assetRef?.title ?? linkedAsset?.title ?? "Asset visual"}</strong></p>
          <p>{assetRef?.caption ?? linkedAsset?.caption ?? linkedAsset?.text_content ?? "Sin caption."}</p>
          {linkedAsset?.page_number ? <p>Pagina {linkedAsset.page_number}</p> : null}
          {!previewUrl && linkedAsset?.text_content ? (
            <pre className="overflow-auto whitespace-pre-wrap rounded-[16px] bg-[rgba(248,244,252,0.76)] p-3 text-xs">
              {linkedAsset.text_content}
            </pre>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="grid gap-2" key={blockId}>
      <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-ink)]">
        {text ?? "Bloque sin contenido legible."}
      </p>
    </div>
  );
}

function DraftReader(props: {
  draft: NonNullable<SectionDraftShape["drafts"]>[number];
  assets: NonNullable<EvidenceLedgerInspectorShape["assets"]>;
  viewMode: "reader" | "technical";
}) {
  const assetLookup = new Map(props.assets.map((asset) => [asset.asset_key, asset]));
  const contentBlocks = props.draft.content_blocks ?? [];
  const relatedAssets = (props.draft.used_asset_keys ?? [])
    .map((assetKey) => assetLookup.get(assetKey))
    .filter(
      (asset): asset is NonNullable<EvidenceLedgerInspectorShape["assets"]>[number] => Boolean(asset),
    );

  if (props.viewMode === "technical") {
    return <JsonViewer title={`draft tecnico: ${props.draft.section_key}`} value={props.draft} />;
  }

  return (
    <div className="grid gap-5">
      <header className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          {props.draft.phase} / {props.draft.wave ?? "sin wave"} / {props.draft.generation_strategy ?? "sin strategy"}
        </p>
        <h4 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          {props.draft.title}
        </h4>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          support level: {props.draft.support_level}
        </p>
      </header>

      <article className="grid gap-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
        {contentBlocks.length > 0 ? (
          contentBlocks.map((block, index) => (
            <DraftBlockRenderer
              assetLookup={assetLookup}
              block={block as Record<string, unknown>}
              key={
                typeof (block as { block_id?: unknown }).block_id === "string"
                  ? String((block as { block_id: string }).block_id)
                  : `${props.draft.section_key}-block-${index}`
              }
            />
          ))
        ) : (
          <>
            <div className="rounded-[18px] border border-dashed border-[rgba(74,58,97,0.14)] bg-[rgba(248,244,252,0.6)] px-4 py-3 text-sm text-[var(--color-muted)]">
              Seccion sin bloques estructurados; mostrando contenido plano.
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-ink)]">
              {props.draft.content}
            </p>
          </>
        )}
      </article>

      {relatedAssets.length > 0 ? (
        <section className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Assets usados en la seccion
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {relatedAssets.map((asset) => {
              const previewUrl = buildAssetPreviewUrl(asset);

              return (
                <article
                  className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.65)] p-4"
                  key={asset.asset_key}
                >
                  {previewUrl && asset.mime_type?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={asset.caption ?? asset.title}
                      className="max-h-[18rem] w-full rounded-[16px] object-contain"
                      src={previewUrl}
                    />
                  ) : null}
                  <div className="mt-3 grid gap-1 text-sm leading-6 text-[var(--color-ink)]">
                    <p><strong>{asset.title}</strong></p>
                    <p>kind: {asset.kind}</p>
                    {asset.page_number ? <p>pagina: {asset.page_number}</p> : null}
                    {asset.caption ? <p>{asset.caption}</p> : null}
                    {asset.text_content ? (
                      <pre className="overflow-auto whitespace-pre-wrap rounded-[14px] bg-white/90 p-3 text-xs">
                        {asset.text_content}
                      </pre>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionDraftExplorer(props: {
  execution: MasterBlueprintLabExecutionResponse;
  selectedPhase: string;
  onSelectPhase: (phase: string) => void;
  selectedDraftKey: string | null;
  onSelectDraft: (draftKey: string) => void;
  viewMode: "reader" | "technical";
  onSelectViewMode: (viewMode: "reader" | "technical") => void;
}) {
  const sectionDrafts = (props.execution.artifacts.sectionDrafts ?? {}) as SectionDraftShape;
  const drafts = sectionDrafts.drafts ?? [];
  const evidenceLedger = props.execution.inspectors.evidenceLedger as EvidenceLedgerInspectorShape;
  const phases = ["all", "body", "logic", "framing", "references", "matrix"];
  const filteredDrafts =
    props.selectedPhase === "all"
      ? drafts
      : drafts.filter((draft) => draft.phase === props.selectedPhase);
  const selectedDraft =
    filteredDrafts.find((draft) => draft.section_key === props.selectedDraftKey) ??
    filteredDrafts[0] ??
    null;

  if (drafts.length === 0 || !selectedDraft) {
    return null;
  }

  const relatedSnippets = (evidenceLedger.snippets ?? []).filter((snippet) =>
    selectedDraft.evidence_snippet_ids.includes(snippet.snippet_id),
  );
  const relatedAssumptions = (evidenceLedger.assumptions ?? []).filter((assumption) =>
    selectedDraft.supported_assumption_ids.includes(assumption.assumption_id),
  );
  const contentBlockKinds = Array.from(
    new Set(
      (selectedDraft.content_blocks ?? [])
        .map((block) =>
          block && typeof block === "object" && "kind" in block
            ? String(block.kind)
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );

  return (
    <section className="surface-panel rounded-[28px] p-5">
      <div className="flex items-center gap-2">
        <FileJson className="size-4 text-[var(--color-coral)]" />
        <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
          Draft Reader
        </h3>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {phases.map((phase) => (
          <button
            className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
              phase === props.selectedPhase
                ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)] text-[var(--color-ink)]"
                : "border-[rgba(74,58,97,0.08)] bg-white/76 text-[var(--color-muted)]"
            }`}
            key={phase}
            onClick={() => props.onSelectPhase(phase)}
            type="button"
          >
            {phase}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-full border border-[rgba(74,58,97,0.08)] bg-white/88 p-1">
          {(["reader", "technical"] as const).map((mode) => (
            <button
              className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                mode === props.viewMode
                  ? "bg-[rgba(236,216,255,0.92)] text-[var(--color-ink)]"
                  : "text-[var(--color-muted)]"
              }`}
              key={mode}
              onClick={() => props.onSelectViewMode(mode)}
              type="button"
            >
              {mode === "reader" ? "Lectura" : "Tecnico"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.24fr_0.5fr_0.26fr]">
        <div className="grid max-h-[36rem] gap-2 overflow-auto pr-1">
          {filteredDrafts.map((draft) => (
            <button
              className={`rounded-[20px] border px-4 py-3 text-left ${
                draft.section_key === selectedDraft.section_key
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/78"
              }`}
              key={draft.section_key}
              onClick={() => props.onSelectDraft(draft.section_key)}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {draft.phase} / {draft.wave ?? "sin wave"}
              </p>
              <p className="mt-2 font-semibold text-[var(--color-ink)]">{draft.title}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {draft.generation_strategy ?? "sin strategy"} / {draft.support_level}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                refs {draft.used_reference_ids?.length ?? 0} / assets {draft.used_asset_keys?.length ?? 0}
              </p>
            </button>
          ))}
        </div>
        <DraftReader
          assets={evidenceLedger.assets ?? []}
          draft={selectedDraft}
          viewMode={props.viewMode}
        />
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Trace panel
            </p>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>section_key:</strong> {selectedDraft.section_key}</p>
              <p><strong>wave:</strong> {selectedDraft.wave ?? "sin dato"}</p>
              <p><strong>strategy:</strong> {selectedDraft.generation_strategy ?? "sin dato"}</p>
              <p>
                <strong>citation_policy:</strong>{" "}
                {selectedDraft.citation_policy
                  ? `${selectedDraft.citation_policy.expected_density ?? "na"} / ${selectedDraft.citation_policy.citation_mode ?? "na"}`
                  : "sin dato"}
              </p>
              <p><strong>format:</strong> {selectedDraft.content_format_version ?? "v1"}</p>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Perfil de generacion
              </p>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>wave:</strong> {selectedDraft.wave ?? "sin dato"}</p>
                <p>
                  <strong>generation_strategy:</strong>{" "}
                  {selectedDraft.generation_strategy ?? "sin dato"}
                </p>
                <p>
                  <strong>domain_family:</strong>{" "}
                  {selectedDraft.domain_profile?.domain_family ?? "sin dato"}
                </p>
                <p>
                  <strong>evidence_style:</strong>{" "}
                  {selectedDraft.domain_profile?.evidence_style ?? "sin dato"}
                </p>
                <p>
                  <strong>output_modes:</strong>{" "}
                  {selectedDraft.domain_profile?.preferred_output_modes?.join(", ") || "sin dato"}
                </p>
              </div>
            </div>
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Referencias usadas
              </p>
              <div className="mt-3 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>source_ids:</strong> {selectedDraft.supported_source_ids.join(", ") || "ninguno"}</p>
                <p><strong>pdf_source_ids:</strong> {selectedDraft.supported_pdf_source_ids.join(", ") || "ninguno"}</p>
                <p><strong>web_source_ids:</strong> {selectedDraft.supported_web_source_ids.join(", ") || "ninguno"}</p>
                <p><strong>reference_ids:</strong> {selectedDraft.used_reference_ids?.join(", ") || "ninguno"}</p>
              </div>
            </div>
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Assets y bloques
              </p>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>used_asset_keys:</strong> {selectedDraft.used_asset_keys?.join(", ") || "ninguno"}</p>
                <p><strong>content_blocks:</strong> {selectedDraft.content_blocks?.length ?? 0}</p>
                <p><strong>block_kinds:</strong> {contentBlockKinds.join(", ") || "sin bloques tipados"}</p>
                <p><strong>format_version:</strong> {selectedDraft.content_format_version ?? "v1"}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Warnings y assumptions
              </p>
              <div className="mt-3 grid max-h-[24rem] gap-2 overflow-auto text-sm leading-6 text-[var(--color-ink)]">
                {(selectedDraft.warnings ?? []).length > 0 ? (
                  selectedDraft.warnings.map((warning) => <p key={warning}>* {warning}</p>)
                ) : (
                  <p>Sin warnings directos.</p>
                )}
                {(relatedAssumptions ?? []).map((assumption) => (
                  <p key={assumption.assumption_id}>* {assumption.statement}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Snippets usados
              </p>
              <div className="mt-3 grid max-h-[24rem] gap-3 overflow-auto">
                {relatedSnippets.length > 0 ? (
                  relatedSnippets.map((snippet) => (
                    <article
                      className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.7)] p-3"
                      key={snippet.snippet_id}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        {snippet.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                        {snippet.text}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">Sin snippets relacionados.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepSummary(props: {
  stepKey: MasterBlueprintLabStepKey;
  execution: MasterBlueprintLabExecutionResponse;
}) {
  const artifacts = props.execution.artifacts;
  const validationReport = artifacts.validationReport as
    | {
        quality_report?: {
          score_10?: number;
          passed?: boolean;
          hard_failures?: string[];
        };
      }
    | undefined;
  const provenanceReport = artifacts.provenanceReport as
    | {
        from_sources_pct?: number;
        from_pdfs_pct?: number;
        from_websearch_pct?: number;
        from_assumption_backed_pct?: number;
      }
    | undefined;
  const legacyBlueprint = artifacts.legacyBlueprint as
    | {
        general_objective?: string;
        references_used?: Array<{ reference_id: string }>;
      }
    | undefined;
  const masterTemplate = artifacts.masterTemplateRuntime as
    | {
        template_name?: string;
        sections?: Array<unknown>;
        required_section_keys?: Array<unknown>;
      }
    | undefined;
  const templateImportContext = artifacts.templateImportContext as
    | {
        source_snapshot?: {
          source_lab?: string;
          resolved_materialized_run_id?: string | null;
          resolved_assets_run_id?: string | null;
        };
        imported_evidence_context?: {
          selected_source_count?: number;
          materialized_pdf_count?: number;
          pack_count?: number;
          quality_gate_status?: string | null;
        };
        checks?: {
          mapped_section_count?: number;
          weak_sections?: string[];
          blocked_sections?: string[];
          stale_snapshot_detected?: boolean;
        };
      }
    | undefined;
  const promptPlan = (artifacts.promptPlan ?? {}) as PromptPlanShape;
  const sectionDrafts = (artifacts.sectionDrafts ?? {}) as SectionDraftShape;
  const consistencyMatrix = (artifacts.consistencyMatrix ?? { rows: [] }) as {
    rows?: Array<unknown>;
  };
  const universityBlueprint = artifacts.universityBlueprint as
    | {
        template_key?: string;
        sections?: Array<unknown>;
      }
    | undefined;

  switch (props.stepKey) {
    case "master_template_runtime":
      return (
        <div className="grid gap-4 md:grid-cols-6">
          <SummaryCard label="Template" value={masterTemplate?.template_name ?? "sin cargar"} />
          <SummaryCard label="Secciones" value={`${masterTemplate?.sections?.length ?? 0}`} />
          <SummaryCard
            label="Obligatorias"
            value={`${masterTemplate?.required_section_keys?.length ?? 0}`}
          />
          <SummaryCard
            label="Estado importado"
            value={templateImportContext?.source_snapshot?.source_lab ?? "sin contexto"}
          />
          <SummaryCard
            label="Mapeo activo"
            value={`${templateImportContext?.checks?.mapped_section_count ?? 0} secciones`}
          />
          <SummaryCard
            label="Quality gate"
            value={templateImportContext?.imported_evidence_context?.quality_gate_status ?? "sin dato"}
          />
          <SummaryCard
            label="Runs"
            value={`${templateImportContext?.source_snapshot?.resolved_materialized_run_id ?? "na"} / ${templateImportContext?.source_snapshot?.resolved_assets_run_id ?? "na"}`}
          />
        </div>
      );
    case "prompt_planning":
      return (
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Prompts" value={`${promptPlan.prompt_manifest?.length ?? 0}`} />
          <SummaryCard
            label="Planner mode"
            value={
              promptPlan.planner_mode === "llm_hybrid"
                ? `llm_hybrid${promptPlan.llm_provider ? ` (${promptPlan.llm_provider})` : ""}`
                : "deterministic"
            }
          />
          <SummaryCard
            label="Olas"
            value={`${promptPlan.generation_waves?.length ?? 0}`}
          />
          <SummaryCard
            label="Secciones refinadas"
            value={`${promptPlan.refined_section_keys?.length ?? 0}`}
          />
          <SummaryCard
            label="Weak / blocked"
            value={
              `${promptPlan.checks?.weak_sections?.length ?? 0} / ${promptPlan.checks?.blocked_sections?.length ?? 0}`
            }
          />
          <SummaryCard
            label="Primeras secciones"
            value={
              promptPlan.prompt_manifest
                ?.slice(0, 3)
                .map((item) => `${item.section_key}:${item.wave ?? "na"}`)
                .join(", ") || "sin datos"
            }
          />
        </div>
      );
    case "section_generation":
      return (
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Drafts" value={`${sectionDrafts.drafts?.length ?? 0}`} />
          <SummaryCard
            label="Fases"
            value={
              Array.from(new Set((sectionDrafts.drafts ?? []).map((draft) => draft.phase))).join(", ") ||
              "sin datos"
            }
          />
          <SummaryCard
            label="Waves"
            value={
              Array.from(new Set((sectionDrafts.drafts ?? []).map((draft) => draft.wave ?? "sin wave"))).join(", ") ||
              "sin datos"
            }
          />
          <SummaryCard
            label="Referencias / assets"
            value={`${sectionDrafts.referencesWorkingSet?.reference_ids?.length ?? 0} / ${sectionDrafts.referencesWorkingSet?.asset_keys?.length ?? 0}`}
          />
          <SummaryCard
            label="Strategies"
            value={
              Array.from(
                new Set(
                  (sectionDrafts.drafts ?? []).map(
                    (draft) => draft.generation_strategy ?? "sin strategy",
                  ),
                ),
              ).join(", ") || "sin datos"
            }
          />
          <SummaryCard
            label="Warnings"
            value={`${(sectionDrafts.drafts ?? []).flatMap((draft) => draft.warnings ?? []).length}`}
          />
        </div>
      );
    case "consistency_matrix":
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Filas" value={`${consistencyMatrix.rows?.length ?? 0}`} />
          <SummaryCard label="Estado" value="derivada al final" />
          <SummaryCard label="Origen" value="objetivos + preguntas + metodologia" />
        </div>
      );
    case "legacy_blueprint_composition":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            label="Objetivo general"
            value={legacyBlueprint?.general_objective ?? "sin componer"}
          />
          <SummaryCard
            label="Referencias usadas"
            value={`${legacyBlueprint?.references_used?.length ?? 0}`}
          />
        </div>
      );
    case "validation":
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Score"
            value={`${validationReport?.quality_report?.score_10 ?? 0}/10`}
          />
          <SummaryCard
            label="Estado"
            value={validationReport?.quality_report?.passed ? "passed" : "review needed"}
          />
          <SummaryCard
            label="Hard failures"
            value={`${validationReport?.quality_report?.hard_failures?.length ?? 0}`}
          />
        </div>
      );
    case "provenance":
      return (
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Fuentes" value={`${provenanceReport?.from_sources_pct ?? 0}%`} />
          <SummaryCard label="PDFs" value={`${provenanceReport?.from_pdfs_pct ?? 0}%`} />
          <SummaryCard label="Web" value={`${provenanceReport?.from_websearch_pct ?? 0}%`} />
          <SummaryCard
            label="Assumptions"
            value={`${provenanceReport?.from_assumption_backed_pct ?? 0}%`}
          />
        </div>
      );
    case "university_derivation":
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Template" value={universityBlueprint?.template_key ?? "sin derivar"} />
          <SummaryCard label="Secciones" value={`${universityBlueprint?.sections?.length ?? 0}`} />
          <SummaryCard label="Modo" value="runtime sintetico" />
        </div>
      );
    default:
      return null;
  }
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{props.value}</p>
    </article>
  );
}

export function MasterBlueprintLab({
  initialExecution,
  initialSelectedStepKey = "prompt_planning",
  initialSelectedArtifactKey = "prompt_plan_summary",
}: MasterBlueprintLabProps) {
  const [execution, setExecution] = useState(initialExecution);
  const [selectedStepKey, setSelectedStepKey] =
    useState<MasterBlueprintLabStepKey>(initialSelectedStepKey);
  const [selectedArtifactKey, setSelectedArtifactKey] = useState(initialSelectedArtifactKey);
  const [selectedPromptKey, setSelectedPromptKey] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState("all");
  const [selectedDraftKey, setSelectedDraftKey] = useState<string | null>(null);
  const [draftViewMode, setDraftViewMode] = useState<"reader" | "technical">("reader");
  const [allowLlmPlanning, setAllowLlmPlanning] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [diffPreview, setDiffPreview] = useState<{
    previous: unknown;
    current: unknown;
    changedLines: number;
  } | null>(null);

  useEffect(() => {
    const promptPlan = (execution.artifacts.promptPlan ?? {}) as PromptPlanShape;
    const firstPromptKey = promptPlan.prompt_manifest?.[0]?.section_key ?? null;

    if (!selectedPromptKey && firstPromptKey) {
      setSelectedPromptKey(firstPromptKey);
    }
  }, [execution, selectedPromptKey]);

  useEffect(() => {
    const sectionDrafts = (execution.artifacts.sectionDrafts ?? {}) as SectionDraftShape;
    const firstDraftKey = sectionDrafts.drafts?.[0]?.section_key ?? null;

    if (!selectedDraftKey && firstDraftKey) {
      setSelectedDraftKey(firstDraftKey);
    }
  }, [execution, selectedDraftKey]);

  async function executeThroughStep(stepKey: MasterBlueprintLabStepKey, diffStepKey = selectedStepKey) {
    setIsExecuting(true);
    setRunError(null);
    const previousArtifact = getMainArtifactForStep(execution.artifacts, diffStepKey);

    try {
      const response = await fetch("/api/labs/master-blueprint/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseName: execution.fixtureCase,
          throughStep: stepKey,
          allowLlm: allowLlmPlanning,
        }),
      });
      const payload = (await response.json()) as MasterBlueprintLabExecutionResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo ejecutar el paso del laboratorio.");
      }

      const currentArtifact = getMainArtifactForStep(payload.artifacts, diffStepKey);
      if (previousArtifact && currentArtifact) {
        setDiffPreview({
          previous: previousArtifact,
          current: currentArtifact,
          changedLines: diffCount(previousArtifact, currentArtifact),
        });
      } else {
        setDiffPreview(null);
      }

      setExecution(payload);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Fallo no identificado.");
    } finally {
      setIsExecuting(false);
    }
  }

  const selectedStep = MASTER_BLUEPRINT_LAB_STEPS.find((step) => step.key === selectedStepKey)!;
  const selectedRun = getStepRun(execution.steps, selectedStepKey);
  const selectedMainArtifact = getMainArtifactForStep(execution.artifacts, selectedStepKey);
  const overallStatus = summarizeExecutionStatus(execution);
  const promptPlan = (execution.artifacts.promptPlan ?? {}) as PromptPlanShape;
  const sectionDrafts = (execution.artifacts.sectionDrafts ?? {}) as SectionDraftShape;
  const showPromptInspector =
    (selectedStepKey === "prompt_planning" || selectedStepKey === "section_generation") &&
    (promptPlan.prompt_manifest?.length ?? 0) > 0;
  const showDraftExplorer =
    (sectionDrafts.drafts?.length ?? 0) > 0 &&
    [
      "section_generation",
      "consistency_matrix",
      "legacy_blueprint_composition",
      "validation",
      "provenance",
      "university_derivation",
    ].includes(selectedStepKey);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Master Blueprint Lab</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Consola visual para depurar pasos 7-11 sobre el intake actual importado
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Laboratorio interno de Ingeniometrix para ejecutar y entender el
              pipeline del `MasterBlueprintEngine` desde `MASTER_TEMPLATE_LATAM`
              hasta la composicion del blueprint persistible, usando como base
              congelada el estado importado del lab previo y sin depender del Thread A.
            </p>
          </div>
          <div className="grid gap-3 xl:min-w-[360px]">
            <div className="rounded-[24px] bg-[rgba(255,255,255,0.88)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Fixture del lab activo
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {execution.fixtureCase}
              </p>
            </div>
            <div className="rounded-[24px] bg-[rgba(255,255,255,0.88)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Estado fuente
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">
                {promptPlan.source_context?.source_lab ?? "blueprint_launch"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {[
            { label: "master", value: "MASTER_TEMPLATE_LATAM" },
            { label: "university", value: ((execution.artifacts.universityBlueprint as { template_key?: string } | undefined)?.template_key ?? "UPC_POSGRADO") },
            { label: "estado", value: overallStatus },
          ].map((badge) => (
            <div
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-white/88 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink)]"
              key={badge.label}
            >
              <span className="inline-flex size-2 rounded-full bg-[var(--color-coral)]" />
              {badge.label}: {badge.value}
            </div>
          ))}
        </div>
      </section>

      <SyntheticScenarioOverview
        execution={execution}
        onSelectArtifact={setSelectedArtifactKey}
      />

      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <StepNavigator
          onSelect={setSelectedStepKey}
          selectedStepKey={selectedStepKey}
          steps={execution.steps}
        />

        <section className="grid gap-6">
          <section className="surface-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Step Workspace
                </p>
                <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {selectedStep.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {selectedStep.description}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/88 px-4 py-3 text-sm text-[var(--color-ink)]">
                  <span>
                    <strong>LLM del lab</strong>
                    <span className="block text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                      Corre el lab con LLM real por defecto. Desactivalo solo si quieres una corrida offline de depuracion.
                    </span>
                  </span>
                  <button
                    aria-pressed={allowLlmPlanning}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      allowLlmPlanning
                        ? "bg-[rgba(236,216,255,0.92)] text-[var(--color-ink)]"
                        : "bg-[rgba(241,238,246,0.92)] text-[var(--color-muted)]"
                    }`}
                    onClick={() => setAllowLlmPlanning((current) => !current)}
                    type="button"
                  >
                    {allowLlmPlanning ? "enabled" : "offline"}
                  </button>
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="brand-button-secondary px-4 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                    disabled={isExecuting}
                    onClick={() => executeThroughStep(selectedStepKey)}
                    type="button"
                  >
                    {isExecuting ? <RotateCw className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                    Ejecutar solo este paso
                  </button>
                  <button
                    className="brand-button-primary px-4 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                    disabled={isExecuting}
                    onClick={() =>
                      executeThroughStep(
                        MASTER_BLUEPRINT_LAB_STEP_KEYS[MASTER_BLUEPRINT_LAB_STEP_KEYS.length - 1],
                      )
                    }
                    type="button"
                  >
                    {isExecuting ? <RotateCw className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                    Ejecutar desde aqui hasta el final
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Inputs del paso
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(() => {
                    switch (selectedStepKey) {
                      case "master_template_runtime":
                        return ["imported project", "imported intake", "consolidated evidence", "master template source"];
                      case "prompt_planning":
                        return ["master template runtime", "template import context", "imported intake", "evidence ledger"];
                      case "section_generation":
                        return ["prompt manifest", "template import context", "evidence ledger", "llm planner mode"];
                      case "consistency_matrix":
                        return ["section drafts"];
                      case "legacy_blueprint_composition":
                        return ["drafts + matrix", "source gate", "template context"];
                      case "validation":
                        return ["legacy blueprint", "drafts + matrix", "evidence ledger", "provenance interno"];
                      case "provenance":
                        return ["drafts + matrix"];
                      case "university_derivation":
                        return ["master drafts", "runtime universitario sintetico"];
                      default:
                        return [];
                    }
                  })().map((item) => (
                    <span
                      className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Estado y tiempo
                </p>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                  <p><strong>status:</strong> {selectedRun?.status ?? "pending"}</p>
                  <p><strong>duration:</strong> {selectedRun?.durationMs ? `${selectedRun.durationMs} ms` : "sin ejecutar"}</p>
                  <p><strong>artifacts:</strong> {selectedRun?.artifactCount ?? 0}</p>
                  <p><strong>executed_at:</strong> {selectedRun?.executedAt ?? "sin ejecutar"}</p>
                  <p><strong>LLM mode:</strong> {allowLlmPlanning ? "enabled" : "offline"}</p>
                  <p><strong>provider:</strong> {execution.execution.providerName ?? "no resuelto"}</p>
                  <p><strong>policy:</strong> {execution.execution.llmPolicy}</p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <StepSummary execution={execution} stepKey={selectedStepKey} />
            </div>

            {runError ? (
              <div className="mt-5 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-4" />
                  <p>{runError}</p>
                </div>
              </div>
            ) : null}

            {(selectedRun?.warnings?.length ?? 0) > 0 ? (
              <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-700" />
                  <p className="text-sm font-semibold text-amber-800">Warnings</p>
                </div>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-amber-900">
                  {selectedRun?.warnings.map((warning) => <p key={warning}>* {warning}</p>)}
                </div>
              </div>
            ) : null}

            {selectedMainArtifact ? (
              <JsonViewer
                className="mt-5"
                title={`output principal: ${selectedStep.title}`}
                value={selectedMainArtifact}
              />
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-[rgba(74,58,97,0.14)] bg-white/70 px-5 py-8 text-center">
                <p className="font-semibold text-[var(--color-ink)]">El paso aun no tiene output visible.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Ejecuta este paso para ver artifacts, warnings y tiempo medido.
                </p>
              </div>
            )}

            {diffPreview ? (
              <section className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.74)] p-4">
                <div className="flex items-center gap-2">
                  <GitCompare className="size-4 text-[var(--color-coral)]" />
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    Diff visual del output
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Lineas cambiadas: {diffPreview.changedLines}
                </p>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <JsonViewer title="output anterior" value={diffPreview.previous} />
                  <JsonViewer title="output nuevo" value={diffPreview.current} />
                </div>
              </section>
            ) : null}
          </section>

          {showPromptInspector ? (
            <PromptInspector
              execution={execution}
              onSelectPrompt={setSelectedPromptKey}
              selectedPromptKey={selectedPromptKey}
            />
          ) : null}

          {showDraftExplorer ? (
            <SectionDraftExplorer
              execution={execution}
              onSelectDraft={setSelectedDraftKey}
              onSelectPhase={setSelectedPhase}
              onSelectViewMode={setDraftViewMode}
              selectedDraftKey={selectedDraftKey}
              selectedPhase={selectedPhase}
              viewMode={draftViewMode}
            />
          ) : null}
        </section>

        <DataInspector
          execution={execution}
          onSelectArtifact={setSelectedArtifactKey}
          selectedArtifactKey={selectedArtifactKey}
        />
      </section>

      <section className="surface-panel rounded-[28px] p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--color-coral)]" />
          <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
            Como probar este lab
          </h2>
        </div>
        <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--color-muted)]">
          <p>1. Revisa primero la seccion "Estado importado cargado" para validar intake, fuentes, PDFs, assumptions y snippets del caso actual.</p>
          <p>2. Usa el Step Navigator para elegir la etapa que quieres inspeccionar.</p>
          <p>3. Ejecuta un paso puntual o corre desde ese punto hasta la derivacion universitaria.</p>
          <p>4. Usa Data Inspector para revisar inputs y artifacts como JSON legible.</p>
          <p>5. En Prompt Inspector revisa soporte esperado, snippets y dependencias por seccion.</p>
          <p>6. En Section Draft Explorer filtra por fase y contrasta contenido, fuentes, snippets y assumptions.</p>
        </div>
      </section>
    </main>
  );
}
