import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ActorType, Provider } from "@prisma/client";

import { getConfiguredLlmProvider } from "@/llm";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { withLlmUsageContext } from "@/server/llm-usage-registry";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import {
  MVP_STEP5_KEY,
  MVP_STEP5_PROMPT_VERSION,
  type MvpStep5BudgetPolicy,
  type MvpStep5CitationStyle,
  type MvpStep5CuratedAsset,
  type MvpStep5EvidenceBasis,
  type MvpStep5EvidenceCard,
  type MvpStep5EvidenceLedger,
  type MvpStep5LlmWavePlanItem,
  type MvpStep5PdfLayoutCandidate,
  type MvpStep5PdfLayoutInventory,
  type MvpStep5PdfMaterialization,
  type MvpStep5ReferenceRecord,
  type MvpStep5Result,
  type MvpStep5SemanticExtraction,
  type MvpStep5SectionContentPlanItem,
  type MvpStep5SourceAsset,
  type MvpStep5SourceRegistryRecord,
  type MvpStep5TextChunk,
  type MvpStep5VisualLocalizedAsset,
} from "@/server/mvp/evidence-materialization-types";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import { STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT } from "@/server/mvp/prompts/step5-asset-visual-localization.v1";
import { STEP5_EQUATION_LATEX_OCR_PROMPT } from "@/server/mvp/prompts/step5-equation-latex-ocr.v1";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT } from "@/server/mvp/prompts/step5-source-evidence-extraction.v2";
import { adaptStep5LedgerToBlueprintV2 } from "@/server/mvp/step5-blueprint-v2-adapter";
import {
  buildStep5LlmCacheKey,
  hashStep5File,
  hashStep5Prompt,
  readStep5LlmCache,
  writeStep5LlmCache,
} from "@/server/mvp/step5-llm-cache";
import {
  MVP_SOURCE_INSPECTION_KEY,
  type MvpSourceInspectionItem,
  type MvpSourceInspectionResult,
} from "@/server/mvp/source-inspection-service";
import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

const STEP5_ARTIFACT_ROOT = "mvp-step5-evidence-materialization";
const SUPPORTED_CITATION_STYLES = new Set(["APA7", "ISO690", "VANCOUVER", "IEEE"]);
const execFileAsync = promisify(execFile);
const FULLTEXT_CHUNK_MAX_CHARS = 2600;
const FULLTEXT_CHUNK_OVERLAP_CHARS = 240;

const DEFAULT_STEP5_BUDGET_POLICY: Omit<MvpStep5BudgetPolicy, "source"> = {
  policy_version: "step5-budget-policy-v1",
  raw_asset_signal_cap_per_source: 25,
  rendered_asset_page_cap_per_source: 6,
  curated_asset_cap_per_source: 2,
  curated_asset_total_target: 6,
  curated_asset_total_hard_cap: 10,
  min_asset_score_for_blueprint: 70,
  max_chunks_per_source_for_light_summary: 12,
  max_chars_per_source_for_light_summary: 24_000,
  max_chunks_per_section_for_strong_model: 8,
  max_total_chars_for_strong_model: 30_000,
};

type SelectedReferenceRow = Awaited<ReturnType<typeof loadProjectForStep5>>["projectReferences"][number];

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function buildStep5BudgetPolicy(): MvpStep5BudgetPolicy {
  return {
    policy_version: DEFAULT_STEP5_BUDGET_POLICY.policy_version,
    raw_asset_signal_cap_per_source: numberFromEnv(
      "IMX_STEP5_RAW_ASSET_SIGNAL_CAP_PER_SOURCE",
      DEFAULT_STEP5_BUDGET_POLICY.raw_asset_signal_cap_per_source,
    ),
    rendered_asset_page_cap_per_source: numberFromEnv(
      "IMX_STEP5_RENDERED_ASSET_PAGE_CAP_PER_SOURCE",
      DEFAULT_STEP5_BUDGET_POLICY.rendered_asset_page_cap_per_source,
    ),
    curated_asset_cap_per_source: numberFromEnv(
      "IMX_STEP5_CURATED_ASSET_CAP_PER_SOURCE",
      DEFAULT_STEP5_BUDGET_POLICY.curated_asset_cap_per_source,
    ),
    curated_asset_total_target: numberFromEnv(
      "IMX_STEP5_CURATED_ASSET_TOTAL_TARGET",
      DEFAULT_STEP5_BUDGET_POLICY.curated_asset_total_target,
    ),
    curated_asset_total_hard_cap: numberFromEnv(
      "IMX_STEP5_CURATED_ASSET_TOTAL_HARD_CAP",
      DEFAULT_STEP5_BUDGET_POLICY.curated_asset_total_hard_cap,
    ),
    min_asset_score_for_blueprint: numberFromEnv(
      "IMX_STEP5_MIN_ASSET_SCORE_FOR_BLUEPRINT",
      DEFAULT_STEP5_BUDGET_POLICY.min_asset_score_for_blueprint,
    ),
    max_chunks_per_source_for_light_summary: numberFromEnv(
      "IMX_STEP5_MAX_CHUNKS_PER_SOURCE_FOR_LIGHT_SUMMARY",
      DEFAULT_STEP5_BUDGET_POLICY.max_chunks_per_source_for_light_summary,
    ),
    max_chars_per_source_for_light_summary: numberFromEnv(
      "IMX_STEP5_MAX_CHARS_PER_SOURCE_FOR_LIGHT_SUMMARY",
      DEFAULT_STEP5_BUDGET_POLICY.max_chars_per_source_for_light_summary,
    ),
    max_chunks_per_section_for_strong_model: numberFromEnv(
      "IMX_STEP5_MAX_CHUNKS_PER_SECTION_FOR_STRONG_MODEL",
      DEFAULT_STEP5_BUDGET_POLICY.max_chunks_per_section_for_strong_model,
    ),
    max_total_chars_for_strong_model: numberFromEnv(
      "IMX_STEP5_MAX_TOTAL_CHARS_FOR_STRONG_MODEL",
      DEFAULT_STEP5_BUDGET_POLICY.max_total_chars_for_strong_model,
    ),
    source: "env_overrides_with_release0_defaults",
  };
}

function normalizeCitationStyle(value: string | null | undefined, warnings: string[]): MvpStep5CitationStyle {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (SUPPORTED_CITATION_STYLES.has(normalized)) {
    return normalized as MvpStep5CitationStyle;
  }

  warnings.push(
    `Citation style '${value ?? "missing"}' is not supported in Step 5 wave 1; using APA7 as Release 0 default.`,
  );
  return "APA7";
}

function parseAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as Record<string, unknown>;
      const direct = record.display_name ?? record.displayName ?? record.name ?? record.full_name ?? record.fullName;
      if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
      }
      const given = typeof record.given === "string" ? record.given.trim() : "";
      const family = typeof record.family === "string" ? record.family.trim() : "";
      return [given, family].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);
}

function authorSurname(author: string) {
  const clean = author.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "Autor";
  }
  if (clean.includes(",")) {
    return clean.split(",")[0]?.trim() || "Autor";
  }
  const parts = clean.split(" ");
  return parts[parts.length - 1] || clean;
}

function formatApaAuthors(authors: string[]) {
  if (!authors.length) {
    return "Autor no recuperado";
  }
  if (authors.length === 1) {
    return authors[0];
  }
  if (authors.length === 2) {
    return `${authors[0]} & ${authors[1]}`;
  }
  return `${authors.slice(0, -1).join(", ")}, & ${authors[authors.length - 1]}`;
}

function formatReference(input: {
  authors: string[];
  year: number | null;
  title: string;
  venue: string | null;
  doi: string | null;
  landingPageUrl: string | null;
}) {
  const year = input.year ? String(input.year) : "s. f.";
  const venue = input.venue ? ` ${input.venue}.` : "";
  const locator = input.doi
    ? ` https://doi.org/${input.doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    : input.landingPageUrl
      ? ` ${input.landingPageUrl}`
      : "";

  return `${formatApaAuthors(input.authors)}. (${year}). ${input.title}.${venue}${locator}`.replace(/\s+/g, " ").trim();
}

function inlineCitationHint(input: { authors: string[]; year: number | null; citationStyle: MvpStep5CitationStyle; index: number }) {
  if (input.citationStyle === "IEEE" || input.citationStyle === "VANCOUVER") {
    return `[${input.index}]`;
  }
  const year = input.year ? String(input.year) : "s. f.";
  if (!input.authors.length) {
    return `(Autor no recuperado, ${year})`;
  }
  if (input.authors.length === 1) {
    return `(${authorSurname(input.authors[0])}, ${year})`;
  }
  if (input.authors.length === 2) {
    return `(${authorSurname(input.authors[0])} & ${authorSurname(input.authors[1])}, ${year})`;
  }
  return `(${authorSurname(input.authors[0])} et al., ${year})`;
}

function buildArtifacts(projectId: string, runId?: string) {
  const resolvedRunId = runId?.trim() || `step5-evidence-materialization-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", STEP5_ARTIFACT_ROOT, projectId, resolvedRunId);
  return {
    runId: resolvedRunId,
    artifactDir,
    artifactManifestPath: path.join(artifactDir, "manifest.json"),
    sourceRegistryPath: path.join(artifactDir, "source-registry.json"),
    referencesPath: path.join(artifactDir, "references.json"),
    pdfMaterializationsPath: path.join(artifactDir, "pdf-materializations.json"),
    pdfLayoutInventoriesPath: path.join(artifactDir, "pdf-layout-inventories.json"),
    sourceAssetsPath: path.join(artifactDir, "source-assets.json"),
    curatedAssetsPath: path.join(artifactDir, "curated-assets.json"),
    visualLocalizedAssetsPath: path.join(artifactDir, "visual-localized-assets.json"),
    blueprintV2EvidenceLedgerPath: path.join(artifactDir, "blueprint-v2-evidence-ledger.json"),
    semanticExtractionsPath: path.join(artifactDir, "semantic-source-extractions.json"),
    budgetPolicyPath: path.join(artifactDir, "budget-policy.json"),
    apiUsageReportPath: path.join(artifactDir, "api-usage-report.json"),
    evidenceCardsPath: path.join(artifactDir, "evidence-cards.json"),
    extractionGapsPath: path.join(artifactDir, "extraction-gaps.json"),
    sectionContentPlanPath: path.join(artifactDir, "section-content-plan.json"),
    llmWavePlanPath: path.join(artifactDir, "llm-wave-plan.json"),
    evidenceLedgerPath: path.join(artifactDir, "evidence-ledger.json"),
  };
}

async function loadLatestSourceInspection(projectId: string) {
  const run = await prisma.mvpStepRun.findFirst({
    where: {
      projectId,
      stepKey: MVP_SOURCE_INSPECTION_KEY,
      status: {
        in: ["COMPLETED", "PARTIALLY_COMPLETED"],
      },
    },
    orderBy: { startedAt: "desc" },
  });

  const output = run?.outputSnapshotJson as unknown as MvpSourceInspectionResult | null;
  if (!output?.items?.length) {
    return {
      stepRunId: run?.id ?? null,
      itemsByReferenceId: new Map<string, MvpSourceInspectionItem>(),
      warnings: ["No completed source inspection run was found; evidence cards use metadata/abstract only."],
    };
  }

  return {
    stepRunId: run?.id ?? null,
    itemsByReferenceId: new Map(output.items.map((item) => [item.source_id, item])),
    warnings: [] as string[],
  };
}

async function loadProjectForStep5(input: { userId: string; projectId: string }) {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        include: { reference: true },
        orderBy: [
          { selectedOrder: "asc" },
          { relevanceScore: "desc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!project) {
    throw new Error("Project not found for Step 5 evidence materialization.");
  }
  if (!project.intake) {
    throw new Error("Step 5 requires a normalized intake before materializing evidence.");
  }
  if (!project.projectReferences.length) {
    throw new Error("Step 5 requires selected sources from Step 3 before materializing evidence.");
  }

  return project;
}

async function resolveTemplateContext(templateKey: string, warnings: string[]) {
  try {
    const runtime = await loadTemplateVersionRuntime({ templateKey });
    return {
      templateKey: runtime.templateKey,
      templateVersionId: runtime.versionId,
      citationStyle: normalizeCitationStyle(runtime.citationStyle, warnings),
      runtimeSummary: {
        template_key: runtime.templateKey,
        template_name: runtime.templateName,
        template_version_id: runtime.versionId,
        version_number: runtime.versionNumber,
        language: runtime.language,
        citation_style: runtime.citationStyle,
        document_kind: runtime.documentKind,
        review_status: runtime.reviewStatus,
        runtime_warnings: runtime.runtimeWarnings,
      },
    };
  } catch (error) {
    warnings.push(
      `Template runtime could not be loaded for '${templateKey}'; using template key and APA7 fallback. ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      templateKey,
      templateVersionId: null,
      citationStyle: normalizeCitationStyle(null, warnings),
      runtimeSummary: {
        template_key: templateKey,
        template_name: null,
        template_version_id: null,
        version_number: null,
        language: "es",
        citation_style: "APA7",
        document_kind: null,
        review_status: null,
        runtime_warnings: ["template_runtime_unavailable"],
      },
    };
  }
}

function buildSourceRegistry(input: {
  rows: SelectedReferenceRow[];
  citationStyle: MvpStep5CitationStyle;
  warnings: string[];
}) {
  return input.rows.map((row, index): MvpStep5SourceRegistryRecord => {
    const reference = row.reference;
    const authors = parseAuthors(reference.authorsJson);
    if (!authors.length) {
      input.warnings.push(`Reference ${reference.id} has no recovered authors.`);
    }
    if (!reference.abstract) {
      input.warnings.push(`Reference ${reference.id} has no recovered abstract.`);
    }

    const formattedReference = formatReference({
      authors,
      year: reference.year,
      title: reference.title,
      venue: reference.venue ?? null,
      doi: reference.doi ?? null,
      landingPageUrl: reference.landingPageUrl ?? null,
    });

    return {
      source_id: `S${index + 1}`,
      project_reference_id: row.id,
      reference_id: reference.id,
      selected_order: row.selectedOrder,
      provider: row.sourceProvider,
      relevance_score: row.relevanceScore,
      citation_key: `S${index + 1}`,
      title: reference.title,
      authors,
      year: reference.year,
      venue: reference.venue ?? null,
      doi: reference.doi ?? null,
      landing_page_url: reference.landingPageUrl ?? null,
      work_type: reference.workType ?? null,
      has_abstract: Boolean(reference.abstract),
      has_doi: Boolean(reference.doi),
      has_landing_page: Boolean(reference.landingPageUrl),
      formatted_reference: formattedReference,
      formatting_status: input.citationStyle === "APA7" ? "formatted" : "fallback_apa7_pending_renderer",
      selection_reason: row.selectionReason ?? null,
    };
  });
}

function buildReferenceRecords(input: {
  registry: MvpStep5SourceRegistryRecord[];
  citationStyle: MvpStep5CitationStyle;
}): MvpStep5ReferenceRecord[] {
  return input.registry.map((source, index) => ({
    citation_key: source.citation_key,
    reference_id: source.reference_id,
    project_reference_id: source.project_reference_id,
    citation_style: input.citationStyle,
    formatted_reference: source.formatted_reference,
    inline_citation_hint: inlineCitationHint({
      authors: source.authors,
      year: source.year,
      citationStyle: input.citationStyle,
      index: index + 1,
    }),
    reference_metadata: {
      doi: source.doi,
      title: source.title,
      authors: source.authors,
      year: source.year,
      venue: source.venue,
      landing_page_url: source.landing_page_url,
    },
  }));
}

function topSourceIds(registry: MvpStep5SourceRegistryRecord[], count: number) {
  return registry
    .slice()
    .sort((left, right) => (right.relevance_score ?? 0) - (left.relevance_score ?? 0))
    .slice(0, Math.min(count, registry.length))
    .map((source) => source.source_id);
}

function buildSectionContentPlan(registry: MvpStep5SourceRegistryRecord[]): MvpStep5SectionContentPlanItem[] {
  const allSourceIds = registry.map((source) => source.source_id);
  const topThree = topSourceIds(registry, 3);
  const withAbstracts = registry.filter((source) => source.has_abstract).map((source) => source.source_id);

  return [
    {
      section_key: "cover_metadata",
      section_label: "Metadatos de portada",
      purpose: "Preparar datos administrativos y de plantilla sin afirmar resultados de investigacion.",
      evidence_targets: ["intake_final", "template_runtime"],
      preferred_source_ids: [],
      required_reference_count: 0,
      useful_asset_kinds: [],
      extraction_targets: ["titulo tentativo", "programa", "universidad", "nivel academico"],
      allowed_claim_types: ["descriptive_project_metadata"],
      claims_to_avoid: ["source_based_findings", "empirical_results"],
    },
    {
      section_key: "problem_statement",
      section_label: "Planteamiento del problema",
      purpose: "Vincular el problema del intake con antecedentes recuperados y brechas verificables.",
      evidence_targets: ["contextual_gap", "practical_relevance", "known_limitations"],
      preferred_source_ids: withAbstracts.length ? withAbstracts.slice(0, 3) : topThree,
      required_reference_count: Math.min(3, registry.length),
      useful_asset_kinds: ["table", "figure"],
      extraction_targets: ["problem context", "reported gap", "limitations", "scope conditions"],
      allowed_claim_types: ["source_reported_gap", "source_reported_context"],
      claims_to_avoid: ["local_statistics_without_source", "causal_claim_without_method"],
    },
    {
      section_key: "research_antecedents",
      section_label: "Antecedentes",
      purpose: "Ordenar estudios previos seleccionados para soportar el estado de conocimiento.",
      evidence_targets: ["study_objective", "method", "sample_or_case", "main_findings", "limitations"],
      preferred_source_ids: allSourceIds,
      required_reference_count: Math.min(5, registry.length),
      useful_asset_kinds: ["summary_table"],
      extraction_targets: ["objective", "method", "dataset", "findings", "limitations"],
      allowed_claim_types: ["source_summary", "comparative_synthesis"],
      claims_to_avoid: ["invented_findings", "unsupported_quality_ranking"],
    },
    {
      section_key: "theoretical_framework",
      section_label: "Marco teorico",
      purpose: "Identificar conceptos, teorias, tecnicas o metodos aplicables al problema.",
      evidence_targets: ["definitions", "technical_method", "theory", "variables_or_constructs"],
      preferred_source_ids: topThree,
      required_reference_count: Math.min(3, registry.length),
      useful_asset_kinds: ["equation", "figure", "table"],
      extraction_targets: ["definitions", "method/theory", "assumptions", "equations", "parameters"],
      allowed_claim_types: ["definition", "method_description", "theory_application"],
      claims_to_avoid: ["method_recommendation_without_evidence", "formula_without_source"],
    },
    {
      section_key: "methodology",
      section_label: "Metodologia",
      purpose: "Preparar evidencia para proponer un diseno metodologico compatible con el intake y las fuentes.",
      evidence_targets: ["method_candidates", "data_requirements", "analysis_techniques", "validity_limits"],
      preferred_source_ids: topThree,
      required_reference_count: Math.min(2, registry.length),
      useful_asset_kinds: ["flow_diagram", "equation", "table"],
      extraction_targets: ["applicable technique", "inputs", "outputs", "validation approach", "limitations"],
      allowed_claim_types: ["method_proposal_supported_by_sources", "scope_limitation"],
      claims_to_avoid: ["guaranteed_results", "fabricated_dataset"],
    },
    {
      section_key: "variables_or_categories",
      section_label: "Variables o categorias",
      purpose: "Preparar constructos, variables, parametros o categorias trazables a fuentes.",
      evidence_targets: ["variables", "indicators", "measurement_dimensions"],
      preferred_source_ids: topThree,
      required_reference_count: Math.min(2, registry.length),
      useful_asset_kinds: ["table"],
      extraction_targets: ["variable", "indicator", "metric", "measurement condition"],
      allowed_claim_types: ["operational_definition", "measurement_hint"],
      claims_to_avoid: ["invented_instrument", "untraceable_metric"],
    },
    {
      section_key: "analysis_plan",
      section_label: "Plan de analisis",
      purpose: "Definir que informacion debe extraerse para soportar un plan de analisis no fraudulento.",
      evidence_targets: ["analysis_methods", "comparison_criteria", "expected_outputs"],
      preferred_source_ids: topThree,
      required_reference_count: Math.min(2, registry.length),
      useful_asset_kinds: ["equation", "table"],
      extraction_targets: ["analysis technique", "criteria", "data needed", "limitations"],
      allowed_claim_types: ["analysis_plan", "assumption"],
      claims_to_avoid: ["pretended_execution", "invented_results"],
    },
    {
      section_key: "consistency_matrix",
      section_label: "Matriz de consistencia",
      purpose: "Preparar insumos para coherencia entre problema, objetivos, variables y metodo.",
      evidence_targets: ["problem_objective_alignment", "variable_method_alignment"],
      preferred_source_ids: topThree,
      required_reference_count: Math.min(2, registry.length),
      useful_asset_kinds: ["table"],
      extraction_targets: ["problem terms", "objectives", "variables", "method linkage"],
      allowed_claim_types: ["alignment_statement", "traceability_note"],
      claims_to_avoid: ["new_untraceable_objective", "unsupported_hypothesis"],
    },
    {
      section_key: "references",
      section_label: "Referencias",
      purpose: "Mantener lista formal de referencias para renderizado y exportacion.",
      evidence_targets: ["complete_reference_list"],
      preferred_source_ids: allSourceIds,
      required_reference_count: registry.length,
      useful_asset_kinds: [],
      extraction_targets: ["formatted reference", "DOI", "authors", "year", "venue"],
      allowed_claim_types: ["bibliographic_record"],
      claims_to_avoid: ["invented_bibliographic_field"],
    },
  ];
}

function buildLlmWavePlan(): MvpStep5LlmWavePlanItem[] {
  return [
    {
      wave_key: "source_evidence_extraction",
      status: "planned_not_executed",
      criticality: "critical",
      model_tier: "coding",
      prompt_version: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
      input_contract: ["source_registry_json", "pdf_or_abstract_text", "section_content_plan"],
      output_contract: ["evidence_cards", "quoted_or_paraphrased_claims", "source_page_refs_when_available"],
      cache_key_material: ["reference_id", "prompt_hash", "prompt_version", "model"],
      retry_strategy: "retry once per source, then continue with explicit gap",
      fallback_strategy: "keep deterministic evidence card and explicit gaps when extraction fails",
    },
    {
      wave_key: "asset_visual_localization",
      status: "planned_not_executed",
      criticality: "recommended",
      model_tier: "fast_light",
      prompt_version: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
      input_contract: ["source_assets", "semantic_asset_reviews", "asset_image"],
      output_contract: ["visual_localized_assets", "bbox_normalized", "bbox_pixels", "cropped_image_path", "fallback_page_image_path"],
      cache_key_material: ["asset_id", "image_hash", "prompt_hash", "prompt_version", "model"],
      retry_strategy: "no retry for unsupported asset types",
      fallback_strategy: "use page image fallback when visual localization is ambiguous, unavailable, or crop fails",
    },
    {
      wave_key: "equation_latex_ocr",
      status: "planned_not_executed",
      criticality: "recommended",
      model_tier: "fast_light",
      prompt_version: STEP5_EQUATION_LATEX_OCR_PROMPT.version,
      input_contract: ["equation_asset_image", "asset_metadata"],
      output_contract: ["equation_latex", "equation_latex_status", "equation_latex_confidence_100"],
      cache_key_material: ["asset_id", "image_hash", "prompt_hash", "prompt_version", "model"],
      retry_strategy: "no retry; preserve image fallback when transcription is uncertain",
      fallback_strategy: "render equation image when LaTeX transcription is missing or partial",
    },
  ];
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compactText(value: string | null | undefined, maxChars: number) {
  const normalized = value
    ?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
  if (!normalized) {
    return null;
  }
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1).trim()}...` : normalized;
}

function sha256Buffer(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanFullText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function makeChunkId(sourceId: string, pageNumber: number, chunkNumber: number) {
  return `${sourceId}-p${String(pageNumber).padStart(3, "0")}-c${String(chunkNumber).padStart(2, "0")}`;
}

function chunkPageText(input: {
  sourceId: string;
  referenceId: string;
  citationKey: string;
  pageNumber: number;
  text: string;
}) {
  const chunks: MvpStep5TextChunk[] = [];
  const text = cleanFullText(input.text);
  if (!text) {
    return chunks;
  }

  let offset = 0;
  let chunkNumber = 1;
  while (offset < text.length) {
    const limit = Math.min(text.length, offset + FULLTEXT_CHUNK_MAX_CHARS);
    const softBreak = text.lastIndexOf("\n\n", limit);
    const end = softBreak > offset + 800 ? softBreak : limit;
    chunks.push({
      chunk_id: makeChunkId(input.sourceId, input.pageNumber, chunkNumber),
      source_id: input.sourceId,
      reference_id: input.referenceId,
      citation_key: input.citationKey,
      page_start: input.pageNumber,
      page_end: input.pageNumber,
      char_start: offset,
      char_end: end,
      text: text.slice(offset, end).trim(),
    });
    if (end >= text.length) {
      break;
    }
    offset = Math.max(end - FULLTEXT_CHUNK_OVERLAP_CHARS, offset + 1);
    chunkNumber += 1;
  }

  return chunks;
}

function sourceDirectoryName(source: MvpStep5SourceRegistryRecord) {
  return `${source.source_id}-${source.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72)}`;
}

async function materializePdfSources(input: {
  artifactDir: string;
  registry: MvpStep5SourceRegistryRecord[];
  inspectionByReferenceId: Map<string, MvpSourceInspectionItem>;
}) {
  const materializations: MvpStep5PdfMaterialization[] = [];

  for (const source of input.registry) {
    const inspection = input.inspectionByReferenceId.get(source.reference_id) ?? null;
    const originalPdfPath = inspection?.downloaded_pdf_path ?? null;
    const sourceDir = path.join(input.artifactDir, "materialized-sources", sourceDirectoryName(source));
    const sourcePdfPath = path.join(sourceDir, "source.pdf");
    const fulltextPath = path.join(sourceDir, "fulltext.txt");
    const pagesPath = path.join(sourceDir, "pages.json");
    const chunksPath = path.join(sourceDir, "chunks.json");

    if (!originalPdfPath) {
      materializations.push({
        source_id: source.source_id,
        reference_id: source.reference_id,
        citation_key: source.citation_key,
        status: "skipped_no_pdf",
        original_pdf_path: null,
        source_pdf_path: null,
        fulltext_path: null,
        pages_path: null,
        chunks_path: null,
        pdf_sha256: null,
        fulltext_sha256: null,
        page_count: 0,
        char_count: 0,
        chunk_count: 0,
        asset_signal_counts: { equations: 0, tables: 0, figures: 0 },
        warnings: ["No downloaded PDF was available from source inspection."],
        errors: [],
      });
      continue;
    }

    await mkdir(sourceDir, { recursive: true });
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const pdfBuffer = await readFile(originalPdfPath);
      await copyFile(originalPdfPath, sourcePdfPath);
      await execFileAsync("pdftotext", ["-layout", sourcePdfPath, fulltextPath], { timeout: 60_000 });
      const rawText = await readFile(fulltextPath, "utf8");
      const pages = rawText
        .split(/\f/g)
        .map((pageText, pageIndex) => ({
          page_number: pageIndex + 1,
          text: cleanFullText(pageText),
        }))
        .filter((page) => page.text.length > 0)
        .map((page) => ({
          ...page,
          char_count: page.text.length,
        }));
      const fulltext = pages.map((page) => `\n\n[page ${page.page_number}]\n${page.text}`).join("").trim();
      const chunks = pages.flatMap((page) =>
        chunkPageText({
          sourceId: source.source_id,
          referenceId: source.reference_id,
          citationKey: source.citation_key,
          pageNumber: page.page_number,
          text: page.text,
        }),
      );

      if (!fulltext) {
        warnings.push("pdftotext completed but no usable full text was extracted.");
      }

      await writeFile(fulltextPath, `${fulltext}\n`, "utf8");
      await writeJson(
        pagesPath,
        pages.map((page) => ({
          page_number: page.page_number,
          char_count: page.char_count,
          text: page.text,
          text_excerpt: compactText(page.text, 1200),
        })),
      );
      await writeJson(chunksPath, chunks);

      materializations.push({
        source_id: source.source_id,
        reference_id: source.reference_id,
        citation_key: source.citation_key,
        status: fulltext ? "materialized" : "failed",
        original_pdf_path: originalPdfPath,
        source_pdf_path: sourcePdfPath,
        fulltext_path: fulltextPath,
        pages_path: pagesPath,
        chunks_path: chunksPath,
        pdf_sha256: sha256Buffer(pdfBuffer),
        fulltext_sha256: fulltext ? sha256Buffer(fulltext) : null,
        page_count: pages.length,
        char_count: fulltext.length,
        chunk_count: chunks.length,
        asset_signal_counts: {
          equations: countTextPattern(fulltext, /(?:=|equation|formula|ecuaci[oó]n|f[oó]rmula|model)/gi),
          tables: countTextPattern(fulltext, /(?:table|tabla)\s+\d+/gi),
          figures: countTextPattern(fulltext, /(?:figure|fig\.|figura)\s+\d+/gi),
        },
        warnings,
        errors,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      materializations.push({
        source_id: source.source_id,
        reference_id: source.reference_id,
        citation_key: source.citation_key,
        status: "failed",
        original_pdf_path: originalPdfPath,
        source_pdf_path: sourcePdfPath,
        fulltext_path: fulltextPath,
        pages_path: pagesPath,
        chunks_path: chunksPath,
        pdf_sha256: null,
        fulltext_sha256: null,
        page_count: 0,
        char_count: 0,
        chunk_count: 0,
        asset_signal_counts: { equations: 0, tables: 0, figures: 0 },
        warnings,
        errors,
      });
    }
  }

  return materializations;
}

function detectAssetKinds(text: string) {
  return {
    figure: /(?:figure|fig\.|figura)\s*\d+/i.test(text),
    table: /(?:table|tabla)\s*\d+/i.test(text),
    equation: /(?:equation|formula|ecuaci[oó]n|f[oó]rmula|\b[a-zA-Z]\s*=|=\s*[-+]?\d|\bmodel\b)/i.test(text),
  };
}

function firstSignalLine(text: string, kind: MvpStep5SourceAsset["asset_kind"]) {
  const pattern = kind === "figure"
    ? /(?:figure|fig\.|figura)\s*\d+[^\n]*/i
    : kind === "table"
      ? /(?:table|tabla)\s*\d+[^\n]*/i
      : /(?:equation|formula|ecuaci[oó]n|f[oó]rmula|[a-zA-Z]\s*=[^\n]{0,160}|model[^\n]{0,160})/i;
  return text.match(pattern)?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

async function renderPdfPageFallback(input: {
  pdfPath: string;
  outputDir: string;
  sourceId: string;
  pageNumber: number;
}) {
  await mkdir(input.outputDir, { recursive: true });
  const prefix = path.join(input.outputDir, `${input.sourceId}-page-${String(input.pageNumber).padStart(3, "0")}`);
  await execFileAsync(
    "pdftoppm",
    ["-f", String(input.pageNumber), "-l", String(input.pageNumber), "-r", "144", "-png", input.pdfPath, prefix],
    { timeout: 45_000 },
  );
  const expectedPrefix = `${input.sourceId}-page-${String(input.pageNumber).padStart(3, "0")}-`;
  const rendered = (await readdir(input.outputDir))
    .filter((fileName) => fileName.startsWith(expectedPrefix) && fileName.endsWith(".png"))
    .sort()[0];
  return rendered ? path.join(input.outputDir, rendered) : `${prefix}-${String(input.pageNumber).padStart(2, "0")}.png`;
}

async function commandSupportsPymupdf(command: string, baseArgs: string[] = []) {
  try {
    await execFileAsync(command, [...baseArgs, "-c", "import fitz"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function resolvePymupdfPython(warnings: string[]) {
  const envPython = process.env.IMX_STEP5_PDF_LAYOUT_PYTHON?.trim();
  if (envPython && await commandSupportsPymupdf(envPython)) {
    return { command: envPython, baseArgs: [] as string[] };
  }

  if (await commandSupportsPymupdf("python3")) {
    return { command: "python3", baseArgs: [] as string[] };
  }

  const cacheRoot = process.env.IMX_STEP5_PDF_LAYOUT_VENV?.trim() ||
    path.join(process.env.HOME || process.cwd(), ".cache", "ingeniometrix", "step5-pdf-layout-venv");
  const pythonPath = path.join(cacheRoot, "bin", "python");

  if (await commandSupportsPymupdf(pythonPath)) {
    return { command: pythonPath, baseArgs: [] as string[] };
  }

  try {
    await mkdir(path.dirname(cacheRoot), { recursive: true });
    await execFileAsync("python3", ["-m", "venv", cacheRoot], { timeout: 120_000 });
    await execFileAsync(
      pythonPath,
      ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "pymupdf"],
      { timeout: 180_000 },
    );
  } catch (error) {
    warnings.push(`PyMuPDF runtime setup failed; PDF layout inventory will be skipped. ${error instanceof Error ? error.message : String(error)}`);
  }

  if (await commandSupportsPymupdf(pythonPath)) {
    return { command: pythonPath, baseArgs: [] as string[] };
  }

  return null;
}

function normalizeLayoutCandidateKind(value: unknown): MvpStep5PdfLayoutCandidate["asset_kind"] {
  if (value === "table" || value === "equation" || value === "figure") {
    return value;
  }
  return "figure";
}

function compactStringList(values: unknown[], maxChars: number) {
  return values
    .map((value) => compactText(String(value ?? ""), maxChars))
    .filter((value): value is string => Boolean(value));
}

function normalizeLayoutCandidate(candidate: MvpStep5PdfLayoutCandidate): MvpStep5PdfLayoutCandidate {
  return {
    ...candidate,
    asset_kind: normalizeLayoutCandidateKind(candidate.asset_kind),
    caption_text: candidate.caption_text ? compactText(candidate.caption_text, 500) : null,
    nearby_text: candidate.nearby_text ? compactText(candidate.nearby_text, 1400) : null,
    score_100: clampScore(candidate.score_100),
    warnings: compactStringList(candidate.warnings ?? [], 300),
    errors: compactStringList(candidate.errors ?? [], 300),
  };
}

function assetQualityFlags(input: {
  assetKind: MvpStep5SourceAsset["asset_kind"];
  cropPixels?: MvpStep5PdfLayoutCandidate["crop_pixels"];
  warnings: string[];
}) {
  const flags = new Set<string>();
  for (const warning of input.warnings) {
    if (/caption/i.test(warning)) flags.add("caption_review");
    if (/weak equation|inline math|fragment/i.test(warning)) flags.add("equation_signal_review");
    if (/large/i.test(warning)) flags.add("large_fallback_like_bbox");
  }
  if (!input.cropPixels) {
    flags.add("no_body_crop");
  } else {
    const shortSide = Math.min(input.cropPixels.width, input.cropPixels.height);
    if (shortSide < (input.assetKind === "equation" ? 40 : 180)) {
      flags.add("low_resolution_crop");
    }
  }
  return Array.from(flags);
}

function selectLayoutCandidatesForAssets(candidates: MvpStep5PdfLayoutCandidate[], cap: number) {
  const sorted = candidates
    .filter((candidate) => candidate.crop_path || candidate.page_image_path)
    .slice()
    .sort((left, right) => {
      if (right.score_100 !== left.score_100) {
        return right.score_100 - left.score_100;
      }
      if (left.page_number !== right.page_number) {
        return left.page_number - right.page_number;
      }
      return left.candidate_id.localeCompare(right.candidate_id);
    });
  const selected: MvpStep5PdfLayoutCandidate[] = [];
  const seen = new Set<string>();
  const perKindFloor = Math.max(2, Math.floor(cap / 4));

  for (const kind of ["table", "equation", "figure"] as const) {
    for (const candidate of sorted.filter((item) => item.asset_kind === kind).slice(0, perKindFloor)) {
      if (selected.length >= cap) break;
      seen.add(candidate.candidate_id);
      selected.push(candidate);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= cap) break;
    if (seen.has(candidate.candidate_id)) continue;
    selected.push(candidate);
  }

  return selected;
}

async function buildPdfLayoutInventories(input: {
  artifactDir: string;
  pdfMaterializations: MvpStep5PdfMaterialization[];
  warnings: string[];
}) {
  const inventories: MvpStep5PdfLayoutInventory[] = [];
  const runtime = await resolvePymupdfPython(input.warnings);
  const scriptPath = path.join(process.cwd(), "scripts", "mvp", "python", "step5_pdf_layout_inventory.py");

  for (const materialization of input.pdfMaterializations) {
    if (materialization.status !== "materialized" || !materialization.source_pdf_path) {
      inventories.push({
        source_id: materialization.source_id,
        reference_id: materialization.reference_id,
        citation_key: materialization.citation_key,
        status: "skipped_no_pdf",
        extractor: "pymupdf",
        extractor_version: null,
        pdf_path: materialization.source_pdf_path,
        page_count: materialization.page_count,
        pages: [],
        candidates: [],
        warnings: ["No materialized PDF was available for layout inventory."],
        errors: [],
      });
      continue;
    }

    if (!runtime) {
      inventories.push({
        source_id: materialization.source_id,
        reference_id: materialization.reference_id,
        citation_key: materialization.citation_key,
        status: "failed",
        extractor: "pymupdf",
        extractor_version: null,
        pdf_path: materialization.source_pdf_path,
        page_count: materialization.page_count,
        pages: [],
        candidates: [],
        warnings: [],
        errors: ["PyMuPDF runtime is not available."],
      });
      continue;
    }

    const outputDir = path.join(input.artifactDir, "materialized-sources", `${materialization.source_id}-assets`);
    try {
      const { stdout } = await execFileAsync(
        runtime.command,
        [
          ...runtime.baseArgs,
          scriptPath,
          "--pdf",
          materialization.source_pdf_path,
          "--source-id",
          materialization.source_id,
          "--output-dir",
          outputDir,
          "--max-candidates",
          String(input.pdfMaterializations.length > 1 ? 80 : 100),
        ],
        { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 },
      );
      const jsonStart = stdout.indexOf("{");
      const payload = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout) as Omit<
        MvpStep5PdfLayoutInventory,
        "reference_id" | "citation_key"
      >;
      inventories.push({
        source_id: materialization.source_id,
        reference_id: materialization.reference_id,
        citation_key: materialization.citation_key,
        status: payload.status === "completed" ? "completed" : "failed",
        extractor: "pymupdf",
        extractor_version: payload.extractor_version ?? null,
        pdf_path: materialization.source_pdf_path,
        page_count: payload.page_count ?? materialization.page_count,
        pages: payload.pages ?? [],
        candidates: (payload.candidates ?? []).map(normalizeLayoutCandidate),
        warnings: compactStringList(payload.warnings ?? [], 500),
        errors: compactStringList(payload.errors ?? [], 500),
      });
    } catch (error) {
      inventories.push({
        source_id: materialization.source_id,
        reference_id: materialization.reference_id,
        citation_key: materialization.citation_key,
        status: "failed",
        extractor: "pymupdf",
        extractor_version: null,
        pdf_path: materialization.source_pdf_path,
        page_count: materialization.page_count,
        pages: [],
        candidates: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  return inventories;
}

async function buildSourceAssets(input: {
  artifactDir: string;
  pdfMaterializations: MvpStep5PdfMaterialization[];
  pdfLayoutInventories: MvpStep5PdfLayoutInventory[];
  budgetPolicy: MvpStep5BudgetPolicy;
}) {
  const assets: MvpStep5SourceAsset[] = [];
  const layoutBySourceId = new Map(input.pdfLayoutInventories.map((inventory) => [inventory.source_id, inventory]));

  for (const materialization of input.pdfMaterializations) {
    if (materialization.status !== "materialized" || !materialization.pages_path || !materialization.source_pdf_path) {
      continue;
    }

    const layoutInventory = layoutBySourceId.get(materialization.source_id);
    const layoutCandidates = selectLayoutCandidatesForAssets(
      layoutInventory?.candidates ?? [],
      input.budgetPolicy.raw_asset_signal_cap_per_source,
    );

    if (layoutCandidates.length > 0) {
      assets.push(...layoutCandidates.map((candidate, index): MvpStep5SourceAsset => ({
        asset_id: `${materialization.source_id}-A${String(index + 1).padStart(3, "0")}`,
        source_id: materialization.source_id,
        reference_id: materialization.reference_id,
        citation_key: materialization.citation_key,
        asset_kind: candidate.asset_kind,
        status: candidate.crop_path || candidate.page_image_path ? "ready_for_review" : "text_only",
        page_number: candidate.page_number,
        detection_method: "pymupdf_layout",
        caption_or_signal_text: candidate.caption_text,
        caption_text: candidate.asset_kind === "equation" ? null : candidate.caption_text,
        nearby_text_excerpt: candidate.nearby_text,
        render_strategy: (candidate.body_crop_path ?? candidate.crop_path) ? "layout_crop" : "page_image_fallback",
        image_path: candidate.page_image_path,
        structured_path: candidate.body_crop_path ?? candidate.crop_path,
        body_image_path: candidate.body_crop_path ?? candidate.crop_path,
        fallback_image_path: candidate.crop_path ?? candidate.page_image_path,
        primary_representation: candidate.asset_kind === "equation" ? "latex" : "image",
        coordinates: {
          status: "exact_bbox",
          unit: "pdf_points",
          bbox: candidate.body_bbox_pdf_points ?? candidate.bbox_pdf_points,
          page_width: candidate.page_width_points,
          page_height: candidate.page_height_points,
          source: "pymupdf_layout",
          fallback_page_image_path: candidate.page_image_path,
        },
        fallback_insert_as_image: Boolean(candidate.body_crop_path || candidate.crop_path || candidate.page_image_path),
        quality_flags: assetQualityFlags({
          assetKind: candidate.asset_kind,
          cropPixels: candidate.body_crop_pixels ?? candidate.crop_pixels,
          warnings: candidate.warnings,
        }),
        warnings: [
          "Asset candidate generated from PDF layout inventory; LLM vision validates semantics downstream.",
          ...candidate.warnings,
        ],
        errors: candidate.errors,
      })));
      continue;
    }

    type PageRecord = { page_number: number; text?: string; text_excerpt?: string | null };
    const pages = JSON.parse(await readFile(materialization.pages_path, "utf8")) as PageRecord[];
    const pagesWithSignals = pages
      .map((page) => ({
        page,
        kinds: detectAssetKinds(page.text ?? page.text_excerpt ?? ""),
      }))
      .filter((item) => item.kinds.figure || item.kinds.table || item.kinds.equation)
      .slice(0, input.budgetPolicy.rendered_asset_page_cap_per_source);

    const renderedPages = new Map<number, { imagePath: string | null; errors: string[] }>();
    const sourceAssets: MvpStep5SourceAsset[] = [];
    const imageDir = path.join(
      input.artifactDir,
      "materialized-sources",
      `${materialization.source_id}-assets`,
      "page-renders",
    );

    for (const item of pagesWithSignals) {
      try {
        const imagePath = await renderPdfPageFallback({
          pdfPath: materialization.source_pdf_path,
          outputDir: imageDir,
          sourceId: materialization.source_id,
          pageNumber: item.page.page_number,
        });
        renderedPages.set(item.page.page_number, { imagePath, errors: [] });
      } catch (error) {
        renderedPages.set(item.page.page_number, {
          imagePath: null,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    for (const item of pagesWithSignals) {
      const text = item.page.text ?? item.page.text_excerpt ?? "";
      const rendered = renderedPages.get(item.page.page_number) ?? { imagePath: null, errors: [] };
      const kinds = [
        ["figure", item.kinds.figure],
        ["table", item.kinds.table],
        ["equation", item.kinds.equation],
      ] as const;

      for (const [kind, present] of kinds) {
        if (!present) continue;
        const assetId = `${materialization.source_id}-A${String(sourceAssets.length + 1).padStart(3, "0")}`;
        sourceAssets.push({
          asset_id: assetId,
          source_id: materialization.source_id,
          reference_id: materialization.reference_id,
          citation_key: materialization.citation_key,
          asset_kind: kind,
          status: rendered.imagePath ? "ready_for_review" : "render_failed",
          page_number: item.page.page_number,
          detection_method: "text_signal",
          caption_or_signal_text: firstSignalLine(text, kind),
          caption_text: null,
          nearby_text_excerpt: compactText(text, 900),
          render_strategy: rendered.imagePath ? "page_image_fallback" : "text_only",
          image_path: rendered.imagePath,
          structured_path: null,
          body_image_path: null,
          fallback_image_path: rendered.imagePath,
          primary_representation: kind === "equation" ? "latex" : rendered.imagePath ? "image" : "text_only",
          fallback_insert_as_image: Boolean(rendered.imagePath),
          quality_flags: ["page_level_fallback"],
          warnings: ["Asset is page-level fallback; exact crop/reconstruction is deferred to the next refinement pass."],
          errors: rendered.errors,
        });
      }
    }

    assets.push(...sourceAssets.slice(0, input.budgetPolicy.raw_asset_signal_cap_per_source));
  }

  return assets;
}

function hasExplicitAssetLabel(asset: MvpStep5SourceAsset) {
  return /(?:figure|fig\.|figura|table|tabla|equation|ecuaci[oó]n|formula|f[oó]rmula)\s*\d+/i.test(
    asset.caption_or_signal_text ?? "",
  );
}

function isVagueAssetSignal(asset: MvpStep5SourceAsset) {
  const signal = (asset.caption_or_signal_text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!signal) {
    return true;
  }
  return ["model", "modelling", "modeling", "modelo"].includes(signal) || signal.length < 8;
}

function sourceRelevanceRank(registry: MvpStep5SourceRegistryRecord[]) {
  return new Map(
    registry
      .slice()
      .sort((left, right) => (right.relevance_score ?? 0) - (left.relevance_score ?? 0))
      .map((source, index) => [source.source_id, index + 1]),
  );
}

function chooseAssetSection(input: {
  asset: MvpStep5SourceAsset;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
}) {
  const direct = input.sectionContentPlan.find(
    (section) =>
      section.section_key !== "references" &&
      section.preferred_source_ids.includes(input.asset.source_id) &&
      section.useful_asset_kinds.includes(input.asset.asset_kind),
  );
  if (direct) {
    return direct.section_key;
  }

  const generic = input.sectionContentPlan.find(
    (section) => section.section_key !== "references" && section.useful_asset_kinds.includes(input.asset.asset_kind),
  );
  if (generic) {
    return generic.section_key;
  }

  if (input.asset.asset_kind === "table") {
    return "variables_or_categories";
  }
  if (input.asset.asset_kind === "equation") {
    return "methodology";
  }
  return "theoretical_framework";
}

function scoreSourceAssetForBlueprint(input: {
  asset: MvpStep5SourceAsset;
  registryRankBySourceId: Map<string, number>;
  sectionKey: string;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
}) {
  let score = 35;
  const reasons: string[] = [];
  const section = input.sectionContentPlan.find((item) => item.section_key === input.sectionKey);

  if (input.asset.structured_path || input.asset.image_path) {
    score += 10;
    reasons.push(input.asset.structured_path ? "body crop available" : "page render available");
  }
  if (hasExplicitAssetLabel(input.asset)) {
    score += 22;
    reasons.push("explicit asset label detected");
  }
  if (section?.preferred_source_ids.includes(input.asset.source_id)) {
    score += 14;
    reasons.push("source preferred for section");
  }
  if (section?.useful_asset_kinds.includes(input.asset.asset_kind)) {
    score += 12;
    reasons.push("asset kind useful for section");
  }
  const rank = input.registryRankBySourceId.get(input.asset.source_id) ?? 99;
  if (rank <= 3) {
    score += 10;
    reasons.push("high relevance selected source");
  }
  if (/\b(method|methodology|model|equation|variable|indicator|framework|theory|analysis|resultado|tabla|figure|figura|ecuaci[oó]n)\b/i.test(
    `${input.asset.caption_or_signal_text ?? ""} ${input.asset.nearby_text_excerpt ?? ""}`,
  )) {
    score += 10;
    reasons.push("nearby text has method/theory signals");
  }
  if (input.asset.status === "render_failed") {
    score -= 15;
    reasons.push("render failed");
  }
  if (isVagueAssetSignal(input.asset)) {
    score -= 20;
    reasons.push("caption or signal is weak");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reason: reasons.length ? reasons.join("; ") : "basic page-level signal only",
  };
}

function curateSourceAssets(input: {
  sourceAssets: MvpStep5SourceAsset[];
  sourceRegistry: MvpStep5SourceRegistryRecord[];
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
  budgetPolicy: MvpStep5BudgetPolicy;
}) {
  const registryRankBySourceId = sourceRelevanceRank(input.sourceRegistry);
  const scored = input.sourceAssets
    .map((asset) => {
      const sectionKey = chooseAssetSection({ asset, sectionContentPlan: input.sectionContentPlan });
      const curation = scoreSourceAssetForBlueprint({
        asset,
        registryRankBySourceId,
        sectionKey,
        sectionContentPlan: input.sectionContentPlan,
      });
      return { asset, sectionKey, ...curation };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.asset.asset_id.localeCompare(right.asset.asset_id);
    });

  const selected: MvpStep5CuratedAsset[] = [];
  const bySource = new Map<string, number>();
  const limit = Math.min(input.budgetPolicy.curated_asset_total_target, input.budgetPolicy.curated_asset_total_hard_cap);

  for (const item of scored) {
    if (selected.length >= limit) {
      break;
    }
    if (item.score < input.budgetPolicy.min_asset_score_for_blueprint) {
      continue;
    }
    const sourceCount = bySource.get(item.asset.source_id) ?? 0;
    if (sourceCount >= input.budgetPolicy.curated_asset_cap_per_source) {
      continue;
    }
    bySource.set(item.asset.source_id, sourceCount + 1);
    selected.push({
      ...item.asset,
      curation_status: "CURATED_FOR_BLUEPRINT",
      curation_score_100: item.score,
      curation_reason: item.reason,
      section_key: item.sectionKey,
      citation_anchor: {
        citation_key: item.asset.citation_key,
        reference_id: item.asset.reference_id,
        source_id: item.asset.source_id,
        page_number: item.asset.page_number,
        asset_id: item.asset.asset_id,
        chunk_id: null,
      },
      coordinates: {
        status: item.asset.coordinates?.status ?? "pending_exact_bbox",
        unit: "pdf_points",
        bbox: item.asset.coordinates?.bbox ?? null,
        page_width: item.asset.coordinates?.page_width ?? null,
        page_height: item.asset.coordinates?.page_height ?? null,
        source: item.asset.coordinates?.source ?? "text_signal",
        fallback_page_image_path: item.asset.coordinates?.fallback_page_image_path ?? item.asset.image_path,
      },
    });
  }

  return selected;
}

function resolveStep5ExtractionModel() {
  return (
    process.env.IMX_STEP5_EXTRACTION_MODEL?.trim() ||
    process.env.LLM_FAST_MODEL?.trim() ||
    process.env.LLM_DEFAULT_MODEL?.trim() ||
    "gpt-5.4-mini"
  );
}

function buildPromptFromRegistry(input: {
  finalIntake: unknown;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
  source: MvpStep5SourceRegistryRecord;
  evidenceBasis: MvpStep5EvidenceBasis;
  recoveredChunks: Array<{
    chunk_id: string | null;
    page_start: number | null;
    page_end: number | null;
    text: string;
  }>;
  assetCandidates: MvpStep5SourceAsset[];
  sourceHealth: unknown;
}) {
  const replacements: Record<string, string> = {
    final_intake_json: JSON.stringify(input.finalIntake),
    section_content_plan_json: JSON.stringify(input.sectionContentPlan),
    source_registry_record_json: JSON.stringify(input.source),
    evidence_basis: input.evidenceBasis,
    recovered_chunks_json: JSON.stringify(input.recoveredChunks),
    asset_candidates_json: JSON.stringify(input.assetCandidates),
    source_health_json: JSON.stringify(input.sourceHealth),
  };

  let userPrompt = STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.userPromptTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    userPrompt = userPrompt.replaceAll(`{{${key}}}`, value);
  }

  return [
    STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.systemPrompt,
    "",
    userPrompt,
  ].join("\n");
}

function sourceExtractionKeywords(input: {
  finalIntake: Record<string, unknown>;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
}) {
  const values = [
    ...Object.values(input.finalIntake).filter((value): value is string => typeof value === "string"),
    ...input.sectionContentPlan.flatMap((section) => [
      section.purpose,
      ...section.evidence_targets,
      ...section.extraction_targets,
      ...section.allowed_claim_types,
    ]),
    "method",
    "methodology",
    "model",
    "framework",
    "theory",
    "variable",
    "parameter",
    "indicator",
    "limitation",
    "metodo",
    "modelo",
    "teoria",
    "variable",
    "indicador",
    "constructo",
    "categoria",
    "instrumento",
    "muestra",
    "poblacion",
    "analisis",
    "resultado",
    "hallazgo",
    "antecedente",
    "limitacion",
  ];
  return Array.from(new Set(
    values
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9áéíóúñ]+/i)
      .map((word) => word.trim())
      .filter((word) => word.length >= 5),
  )).slice(0, 80);
}

function scoreChunkForSemanticExtraction(chunk: MvpStep5TextChunk, keywords: string[]) {
  const text = chunk.text.toLowerCase();
  const keywordScore = keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
  const methodScore = /method|methodology|model|analysis|equation|formula|framework|variable|parameter|indicator|limitation|metodo|modelo|analisis|ecuaci[oó]n|variable|indicador/i.test(chunk.text)
    ? 8
    : 0;
  const assetScore = /figure|fig\.|table|tabla|equation|formula|ecuaci[oó]n/i.test(chunk.text) ? 4 : 0;
  const earlyPageScore = chunk.page_start <= 5 ? 2 : 0;
  return keywordScore + methodScore + assetScore + earlyPageScore;
}

async function buildRecoveredChunksForLlm(input: {
  source: MvpStep5SourceRegistryRecord;
  row: SelectedReferenceRow | null;
  materialization: MvpStep5PdfMaterialization | null;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
  finalIntake: Record<string, unknown>;
  budgetPolicy: MvpStep5BudgetPolicy;
}) {
  if (input.materialization?.status === "materialized" && input.materialization.chunks_path) {
    const chunks = JSON.parse(await readFile(input.materialization.chunks_path, "utf8")) as MvpStep5TextChunk[];
    const keywords = sourceExtractionKeywords({
      finalIntake: input.finalIntake,
      sectionContentPlan: input.sectionContentPlan,
    });
    const selected = chunks
      .map((chunk, index) => ({
        chunk,
        index,
        score: scoreChunkForSemanticExtraction(chunk, keywords),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      })
      .slice(0, input.budgetPolicy.max_chunks_per_source_for_light_summary)
      .sort((left, right) => left.chunk.page_start - right.chunk.page_start || left.chunk.chunk_id.localeCompare(right.chunk.chunk_id));

    const recovered: Array<{ chunk_id: string | null; page_start: number | null; page_end: number | null; text: string }> = [];
    let charCount = 0;
    for (const item of selected) {
      const remaining = input.budgetPolicy.max_chars_per_source_for_light_summary - charCount;
      if (remaining <= 0) {
        break;
      }
      const text = item.chunk.text.slice(0, remaining).trim();
      if (!text) {
        continue;
      }
      recovered.push({
        chunk_id: item.chunk.chunk_id,
        page_start: item.chunk.page_start,
        page_end: item.chunk.page_end,
        text,
      });
      charCount += text.length;
    }
    return recovered;
  }

  const abstract = compactText(input.row?.reference.abstract, input.budgetPolicy.max_chars_per_source_for_light_summary);
  return abstract
    ? [{ chunk_id: null, page_start: null, page_end: null, text: abstract }]
    : [];
}

type Step5SemanticLlmPayload = Pick<
  MvpStep5SemanticExtraction,
  | "quality_score_100"
  | "quality_decision"
  | "technique_method_theory"
  | "variables_or_constructs"
  | "limitations"
  | "evidence_items"
  | "asset_reviews"
  | "section_coverage"
  | "gaps"
  | "warnings"
>;

function clampScore(value: unknown) {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function normalizeCitationAnchor(input: {
  anchor: Partial<MvpStep5SemanticExtraction["evidence_items"][number]["citation_anchor"]> | null | undefined;
  source: MvpStep5SourceRegistryRecord;
}) {
  return {
    citation_key: input.source.citation_key,
    reference_id: input.source.reference_id,
    source_id: input.source.source_id,
    page_number: typeof input.anchor?.page_number === "number" ? input.anchor.page_number : null,
    chunk_id: typeof input.anchor?.chunk_id === "string" && input.anchor.chunk_id.trim() ? input.anchor.chunk_id.trim() : null,
  };
}

function normalizeSemanticExtraction(input: {
  payload: Step5SemanticLlmPayload;
  source: MvpStep5SourceRegistryRecord;
  model: string;
  evidenceBasis: MvpStep5EvidenceBasis;
  inputChunkCount: number;
  inputCharCount: number;
  artifactPath: string;
}) {
  const validDecision = new Set(["sufficient_for_blueprint_preparation", "needs_more_evidence", "insufficient"]);
  const qualityDecision = validDecision.has(input.payload.quality_decision ?? "")
    ? input.payload.quality_decision
    : "needs_more_evidence";
  const normalizeSectionKey = (sectionKey: string | null | undefined) => sectionKey?.trim() || "research_antecedents";

  const extraction: MvpStep5SemanticExtraction = {
    source_id: input.source.source_id,
    reference_id: input.source.reference_id,
    citation_key: input.source.citation_key,
    prompt_version: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
    model: input.model,
    status: "completed",
    evidence_basis: input.evidenceBasis,
    input_chunk_count: input.inputChunkCount,
    input_char_count: input.inputCharCount,
    extracted_at: new Date().toISOString(),
    quality_score_100: clampScore(input.payload.quality_score_100),
    quality_decision: qualityDecision,
    technique_method_theory: (input.payload.technique_method_theory ?? []).slice(0, 8).map((item) => ({
      label_es: compactText(item.label_es, 180) ?? "Concepto sin etiqueta",
      type: item.type,
      description_es: compactText(item.description_es, 900) ?? "",
      citation_anchor: normalizeCitationAnchor({ anchor: item.citation_anchor, source: input.source }),
      confidence_100: clampScore(item.confidence_100),
    })),
    variables_or_constructs: (input.payload.variables_or_constructs ?? []).slice(0, 8).map((item) => ({
      name_es: compactText(item.name_es, 180) ?? "Variable sin etiqueta",
      description_es: compactText(item.description_es, 700) ?? "",
      role: item.role,
      citation_anchor: normalizeCitationAnchor({ anchor: item.citation_anchor, source: input.source }),
      confidence_100: clampScore(item.confidence_100),
    })),
    limitations: (input.payload.limitations ?? []).slice(0, 6).map((item) => ({
      limitation_es: compactText(item.limitation_es, 700) ?? "",
      citation_anchor: normalizeCitationAnchor({ anchor: item.citation_anchor, source: input.source }),
      confidence_100: clampScore(item.confidence_100),
    })),
    evidence_items: (input.payload.evidence_items ?? []).slice(0, 12).map((item, index) => ({
      evidence_id: item.evidence_id?.trim() || `${input.source.source_id}-EV${String(index + 1).padStart(2, "0")}`,
      source_id: input.source.source_id,
      citation_key: input.source.citation_key,
      section_key: normalizeSectionKey(item.section_key),
      claim_type: compactText(item.claim_type, 120) ?? "source_summary",
      traceable_summary_es: compactText(item.traceable_summary_es, 900) ?? "",
      supporting_quote_or_paraphrase_es: compactText(item.supporting_quote_or_paraphrase_es, 900) ?? "",
      citation_anchor: normalizeCitationAnchor({ anchor: item.citation_anchor, source: input.source }),
      confidence_100: clampScore(item.confidence_100),
      allowed_use: item.allowed_use,
      gaps: (item.gaps ?? []).map((gap) => compactText(gap, 300)).filter((gap): gap is string => Boolean(gap)),
    })),
    asset_reviews: (input.payload.asset_reviews ?? []).slice(0, 8).map((item) => ({
      asset_id: item.asset_id,
      source_id: input.source.source_id,
      section_key: normalizeSectionKey(item.section_key),
      relevance_score_100: clampScore(item.relevance_score_100),
      description_es: compactText(item.description_es, 700) ?? "",
      keep_for_blueprint: Boolean(item.keep_for_blueprint),
      rendering_strategy: item.rendering_strategy,
      citation_anchor: normalizeCitationAnchor({ anchor: item.citation_anchor, source: input.source }),
    })),
    section_coverage: (input.payload.section_coverage ?? []).slice(0, 9).map((item) => ({
      section_key: normalizeSectionKey(item.section_key),
      coverage_score_100: clampScore(item.coverage_score_100),
      usable_evidence_ids: (item.usable_evidence_ids ?? []).slice(0, 12),
      gaps: (item.gaps ?? []).map((gap) => compactText(gap, 300)).filter((gap): gap is string => Boolean(gap)),
    })),
    gaps: (input.payload.gaps ?? []).map((gap) => compactText(gap, 400)).filter((gap): gap is string => Boolean(gap)),
    warnings: (input.payload.warnings ?? []).map((warning) => compactText(warning, 400)).filter((warning): warning is string => Boolean(warning)),
    errors: [],
    artifact_path: input.artifactPath,
  };

  return extraction;
}

async function runSemanticSourceExtractions(input: {
  userId: string;
  projectId: string;
  runId: string;
  rows: SelectedReferenceRow[];
  finalIntake: Record<string, unknown>;
  sourceRegistry: MvpStep5SourceRegistryRecord[];
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
  sourceAssets: MvpStep5SourceAsset[];
  pdfMaterializationsByReferenceId: Map<string, MvpStep5PdfMaterialization>;
  inspectionByReferenceId: Map<string, MvpSourceInspectionItem>;
  budgetPolicy: MvpStep5BudgetPolicy;
  artifactPath: string;
}) {
  const rowsByReferenceId = new Map(input.rows.map((row) => [row.referenceId, row]));
  const model = resolveStep5ExtractionModel();
  let provider: ReturnType<typeof getConfiguredLlmProvider>;

  try {
    provider = getConfiguredLlmProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return input.sourceRegistry.map((source): MvpStep5SemanticExtraction => ({
      source_id: source.source_id,
      reference_id: source.reference_id,
      citation_key: source.citation_key,
      prompt_version: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
      model,
      status: "failed",
      evidence_basis: "VERIFIED_METADATA_ONLY",
      input_chunk_count: 0,
      input_char_count: 0,
      extracted_at: new Date().toISOString(),
      quality_score_100: null,
      quality_decision: null,
      technique_method_theory: [],
      variables_or_constructs: [],
      limitations: [],
      evidence_items: [],
      asset_reviews: [],
      section_coverage: [],
      gaps: [],
      warnings: [],
      errors: [message],
      artifact_path: input.artifactPath,
    }));
  }

  const extractions: MvpStep5SemanticExtraction[] = [];

  for (const source of input.sourceRegistry) {
    const row = rowsByReferenceId.get(source.reference_id) ?? null;
    const materialization = input.pdfMaterializationsByReferenceId.get(source.reference_id) ?? null;
    const sourceHealth = input.inspectionByReferenceId.get(source.reference_id) ?? null;
    const evidenceBasis = resolveEvidenceBasis({
      fulltext: materialization?.status === "materialized" ? materialization.fulltext_path : null,
      sampleText: sourceHealth?.sample_text_path ?? null,
      abstract: row?.reference.abstract,
    });
    const recoveredChunks = await buildRecoveredChunksForLlm({
      source,
      row,
      materialization,
      sectionContentPlan: input.sectionContentPlan,
      finalIntake: input.finalIntake,
      budgetPolicy: input.budgetPolicy,
    });
    const inputCharCount = recoveredChunks.reduce((sum, chunk) => sum + chunk.text.length, 0);

    if (!recoveredChunks.length) {
      extractions.push({
        source_id: source.source_id,
        reference_id: source.reference_id,
        citation_key: source.citation_key,
        prompt_version: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
        model,
        status: "skipped_no_text",
        evidence_basis: evidenceBasis,
        input_chunk_count: 0,
        input_char_count: 0,
        extracted_at: new Date().toISOString(),
        quality_score_100: null,
        quality_decision: null,
        technique_method_theory: [],
        variables_or_constructs: [],
        limitations: [],
        evidence_items: [],
        asset_reviews: [],
        section_coverage: [],
        gaps: ["No recovered text was available for semantic extraction."],
        warnings: [],
        errors: [],
        artifact_path: input.artifactPath,
      });
      continue;
    }

    try {
      const prompt = buildPromptFromRegistry({
        finalIntake: input.finalIntake,
        sectionContentPlan: input.sectionContentPlan,
        source,
        evidenceBasis,
        recoveredChunks,
        assetCandidates: input.sourceAssets.filter((asset) => asset.source_id === source.source_id),
        sourceHealth,
      });
      const promptHash = hashStep5Prompt(prompt);
      const cacheKey = buildStep5LlmCacheKey({
        kind: "source_evidence_extraction",
        model,
        promptVersion: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
        schemaName: "mvp_step5_source_evidence_extraction",
        promptHash,
        sourceId: source.source_id,
      });
      const cachedPayload = await readStep5LlmCache<Step5SemanticLlmPayload>({
        kind: "source_evidence_extraction",
        cacheKey,
      });
      if (cachedPayload) {
        extractions.push(normalizeSemanticExtraction({
          payload: cachedPayload,
          source,
          model,
          evidenceBasis,
          inputChunkCount: recoveredChunks.length,
          inputCharCount,
          artifactPath: input.artifactPath,
        }));
        continue;
      }
      const payload = await withLlmUsageContext(
        {
          projectId: input.projectId,
          userId: input.userId,
          runId: input.runId,
          stage: "evidence_materialization",
          source: "runMvpEvidenceMaterialization.semanticSourceExtraction",
        },
        async () =>
          generateStructuredObjectWithTextFallback<Step5SemanticLlmPayload>({
            provider,
            prompt,
            schemaName: "mvp_step5_source_evidence_extraction",
            schema: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.outputSchema as unknown as Record<string, unknown>,
            model,
            trackingAttribution: {
              projectId: input.projectId,
              userId: input.userId,
              runId: input.runId,
              stage: "evidence_materialization",
              source: `step5_source_${source.source_id}`,
              sourceId: source.source_id,
              promptVersion: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
              promptHash,
              schemaName: "mvp_step5_source_evidence_extraction",
              cacheKey,
            },
          }),
      );
      await writeStep5LlmCache({
        kind: "source_evidence_extraction",
        cacheKey,
        model,
        promptVersion: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
        payload,
      });
      extractions.push(normalizeSemanticExtraction({
        payload,
        source,
        model,
        evidenceBasis,
        inputChunkCount: recoveredChunks.length,
        inputCharCount,
        artifactPath: input.artifactPath,
      }));
    } catch (error) {
      extractions.push({
        source_id: source.source_id,
        reference_id: source.reference_id,
        citation_key: source.citation_key,
        prompt_version: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
        model,
        status: "failed",
        evidence_basis: evidenceBasis,
        input_chunk_count: recoveredChunks.length,
        input_char_count: inputCharCount,
        extracted_at: new Date().toISOString(),
        quality_score_100: null,
        quality_decision: null,
        technique_method_theory: [],
        variables_or_constructs: [],
        limitations: [],
        evidence_items: [],
        asset_reviews: [],
        section_coverage: [],
        gaps: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        artifact_path: input.artifactPath,
      });
    }
  }

  return extractions;
}

function mergeSemanticEvidenceCards(input: {
  evidenceCards: MvpStep5EvidenceCard[];
  semanticExtractions: MvpStep5SemanticExtraction[];
}) {
  const bySourceId = new Map(input.semanticExtractions.map((extraction) => [extraction.source_id, extraction]));
  return input.evidenceCards.map((card) => {
    const extraction = bySourceId.get(card.source_id);
    if (!extraction) {
      return {
        ...card,
        semantic_extraction: {
          status: "not_run" as const,
          quality_score_100: null,
          quality_decision: null,
          evidence_item_count: 0,
          method_theory_count: 0,
          variable_count: 0,
          limitation_count: 0,
          source_extraction_path: null,
        },
      };
    }

    const extractionSummary = extraction.evidence_items
      .slice(0, 4)
      .map((item) => item.traceable_summary_es)
      .filter(Boolean)
      .join(" ");
    const semanticClaimTypes = extraction.evidence_items.map((item) => item.claim_type);
    const semanticGaps = [
      ...extraction.gaps,
      ...extraction.section_coverage.flatMap((section) => section.gaps),
      ...extraction.evidence_items.flatMap((item) => item.gaps),
      ...extraction.errors.map((error) => `Semantic extraction failed: ${error}`),
    ];
    const uniqueGaps = Array.from(new Set([
      ...card.extraction_gaps,
      ...semanticGaps,
    ])).filter(Boolean);
    const cappedGaps = uniqueGaps.length > 14
      ? [
          ...uniqueGaps.slice(0, 13),
          `${uniqueGaps.length - 13} additional semantic gaps are available in the source extraction artifact.`,
        ]
      : uniqueGaps;
    const qualityScore = extraction.quality_score_100 === null
      ? card.quality_score_100
      : Math.max(card.quality_score_100, extraction.quality_score_100);
    const qualityStatus: MvpStep5EvidenceCard["quality_status"] =
      extraction.status === "completed" &&
      extraction.quality_decision === "sufficient_for_blueprint_preparation" &&
      card.evidence_basis === "PDF_FULLTEXT"
        ? "READY_FOR_PRELIMINARY_PLANNING"
        : card.quality_status;

    return {
      ...card,
      quality_score_100: qualityScore,
      quality_status: qualityStatus,
      traceable_summary: extractionSummary || card.traceable_summary,
      extractable_claim_types: Array.from(new Set([
        ...card.extractable_claim_types,
        ...semanticClaimTypes,
        ...(extraction.technique_method_theory.length ? ["method_theory_extraction"] : []),
        ...(extraction.variables_or_constructs.length ? ["variables_or_constructs"] : []),
      ])).slice(0, 20),
      extraction_gaps: cappedGaps,
      semantic_extraction: {
        status: extraction.status,
        quality_score_100: extraction.quality_score_100,
        quality_decision: extraction.quality_decision,
        evidence_item_count: extraction.evidence_items.length,
        method_theory_count: extraction.technique_method_theory.length,
        variable_count: extraction.variables_or_constructs.length,
        limitation_count: extraction.limitations.length,
        source_extraction_path: extraction.artifact_path,
      },
    };
  });
}

function resolveStep5VisionModel() {
  return (
    process.env.IMX_STEP5_VISION_MODEL?.trim() ||
    process.env.LLM_FAST_MODEL?.trim() ||
    process.env.LLM_DEFAULT_MODEL?.trim() ||
    "gpt-5.4-mini"
  );
}

function visualLocalizationCap() {
  return Math.max(0, Math.floor(numberFromEnv("IMX_STEP5_VISUAL_LOCALIZATION_MAX_ASSETS", 8)));
}

function buildVisualLocalizationPrompt(input: {
  assetId: string;
  sourceId: string;
  assetKind: string;
  pageNumber: number | null;
  caption: string | null;
  description: string | null;
  sectionKey: string;
}) {
  const replacements: Record<string, string> = {
    asset_id: input.assetId,
    source_id: input.sourceId,
    asset_kind: input.assetKind,
    page_number: input.pageNumber === null ? "unknown" : String(input.pageNumber),
    caption_or_signal_text: input.caption ?? "not available",
    semantic_description_es: input.description ?? "not available",
    section_key: input.sectionKey,
  };
  let userPrompt = STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.userPromptTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    userPrompt = userPrompt.replaceAll(`{{${key}}}`, value);
  }
  return [STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.systemPrompt, "", userPrompt].join("\n");
}

function buildEquationLatexPrompt(input: {
  assetId: string;
  sourceId: string;
  pageNumber: number | null;
  caption: string | null;
}) {
  const replacements: Record<string, string> = {
    asset_id: input.assetId,
    source_id: input.sourceId,
    page_number: input.pageNumber === null ? "unknown" : String(input.pageNumber),
    caption_or_signal_text: input.caption ?? "not available",
  };
  let userPrompt = STEP5_EQUATION_LATEX_OCR_PROMPT.userPromptTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    userPrompt = userPrompt.replaceAll(`{{${key}}}`, value);
  }
  return [STEP5_EQUATION_LATEX_OCR_PROMPT.systemPrompt, "", userPrompt].join("\n");
}

function clampUnit(value: unknown) {
  return Math.max(0, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 0));
}

function normalizeBbox(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const x = clampUnit(record.x);
  const y = clampUnit(record.y);
  const width = Math.max(0.01, Math.min(1 - x, clampUnit(record.width)));
  const height = Math.max(0.01, Math.min(1 - y, clampUnit(record.height)));
  return { x, y, width, height };
}

async function cropImageWithPython(input: {
  imagePath: string;
  outputPath: string;
  bbox: NonNullable<MvpStep5VisualLocalizedAsset["bbox_normalized"]>;
}) {
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const script = [
    "import json, sys",
    "from PIL import Image",
    "image_path, output_path, bbox_json = sys.argv[1], sys.argv[2], sys.argv[3]",
    "bbox = json.loads(bbox_json)",
    "img = Image.open(image_path).convert('RGB')",
    "w, h = img.size",
    "x = max(0, min(w - 1, round(bbox['x'] * w)))",
    "y = max(0, min(h - 1, round(bbox['y'] * h)))",
    "cw = max(1, min(w - x, round(bbox['width'] * w)))",
    "ch = max(1, min(h - y, round(bbox['height'] * h)))",
    "img.crop((x, y, x + cw, y + ch)).save(output_path)",
    "print(json.dumps({'x': x, 'y': y, 'width': cw, 'height': ch, 'page_width': w, 'page_height': h}))",
  ].join("\n");
  const { stdout } = await execFileAsync(
    "python3",
    ["-c", script, input.imagePath, input.outputPath, JSON.stringify(input.bbox)],
    { timeout: 45_000 },
  );
  return JSON.parse(stdout) as NonNullable<MvpStep5VisualLocalizedAsset["bbox_pixels"]>;
}

async function cropSourceAssetContextWithPython(input: {
  imagePath: string;
  outputPath: string;
  coordinates: NonNullable<MvpStep5SourceAsset["coordinates"]>;
}) {
  const bbox = input.coordinates.bbox;
  const pageWidth = input.coordinates.page_width;
  const pageHeight = input.coordinates.page_height;
  if (!bbox || !pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const script = [
    "import json, sys",
    "from PIL import Image",
    "image_path, output_path, payload_json = sys.argv[1], sys.argv[2], sys.argv[3]",
    "payload = json.loads(payload_json)",
    "bbox = payload['bbox']",
    "page_w = float(payload['page_width'])",
    "page_h = float(payload['page_height'])",
    "img = Image.open(image_path).convert('RGB')",
    "w, h = img.size",
    "cx = bbox['x'] + bbox['width'] / 2",
    "cy = bbox['y'] + bbox['height'] / 2",
    "expanded_w = max(bbox['width'] * 4.2, page_w * 0.58)",
    "expanded_h = max(bbox['height'] * 4.0, page_h * 0.18)",
    "x0 = max(0.0, cx - expanded_w / 2)",
    "y0 = max(0.0, cy - expanded_h / 2)",
    "x1 = min(page_w, cx + expanded_w / 2)",
    "y1 = min(page_h, cy + expanded_h / 2)",
    "sx = w / page_w",
    "sy = h / page_h",
    "px0 = max(0, min(w - 1, round(x0 * sx)))",
    "py0 = max(0, min(h - 1, round(y0 * sy)))",
    "px1 = max(px0 + 1, min(w, round(x1 * sx)))",
    "py1 = max(py0 + 1, min(h, round(y1 * sy)))",
    "img.crop((px0, py0, px1, py1)).save(output_path)",
    "print(json.dumps({'x': px0, 'y': py0, 'width': px1 - px0, 'height': py1 - py0, 'page_width': w, 'page_height': h}))",
  ].join("\n");
  await execFileAsync(
    "python3",
    ["-c", script, input.imagePath, input.outputPath, JSON.stringify({
      bbox,
      page_width: pageWidth,
      page_height: pageHeight,
    })],
    { timeout: 45_000 },
  );
  return input.outputPath;
}

async function resolveVisualValidationImage(input: {
  artifactDir: string;
  extractionSourceId: string;
  asset: MvpStep5SourceAsset;
}) {
  if (input.asset.asset_kind !== "equation") {
    return input.asset.structured_path ?? input.asset.image_path ?? null;
  }

  if (input.asset.image_path && input.asset.coordinates) {
    const contextPath = path.join(
      input.artifactDir,
      "materialized-sources",
      `${input.extractionSourceId}-assets`,
      "validation-context",
      `${input.asset.asset_id}.png`,
    );
    try {
      const contextImage = await cropSourceAssetContextWithPython({
        imagePath: input.asset.image_path,
        outputPath: contextPath,
        coordinates: input.asset.coordinates,
      });
      if (contextImage) {
        return contextImage;
      }
    } catch {
      // Fall through to the existing rendered asset paths.
    }
  }

  return input.asset.structured_path ?? input.asset.image_path ?? null;
}

function scoreSupplementalEquationAsset(asset: MvpStep5SourceAsset) {
  const signal = compactText(asset.caption_or_signal_text ?? "", 300) ?? "";
  const nearby = compactText(asset.nearby_text_excerpt ?? "", 1200) ?? "";
  let score = 50;

  if (/^\(?\d+\)/.test(nearby)) {
    score += 35;
  }
  if (/\bEquation\s*\(\d+\)/i.test(nearby)) {
    score += 12;
  }
  if (/=/.test(signal)) {
    score += 12;
  }
  if (!/=\s*$/.test(signal)) {
    score += 8;
  }
  if (/[∗ξΓαμ휉√∕]/.test(`${signal} ${nearby}`)) {
    score += 5;
  }
  if (nearby.length > 600) {
    score -= 25;
  }
  if (/^(and|for clarity|it is|system|the results|whereas|while)\b/i.test(nearby)) {
    score -= 25;
  }
  if (signal.length < 8) {
    score -= 10;
  }

  return clampScore(score);
}

async function runVisualAssetLocalization(input: {
  userId: string;
  projectId: string;
  runId: string;
  artifactDir: string;
  sourceAssets: MvpStep5SourceAsset[];
  semanticExtractions: MvpStep5SemanticExtraction[];
}) {
  const sourceAssetsById = new Map(input.sourceAssets.map((asset) => [asset.asset_id, asset]));
  const semanticCandidates = input.semanticExtractions.flatMap((extraction) =>
    extraction.asset_reviews
      .filter((review) => review.keep_for_blueprint && review.rendering_strategy !== "do_not_use")
      .map((review) => ({ extraction, review })),
  );
  const semanticAssetIds = new Set(semanticCandidates.map(({ review }) => review.asset_id));
  const supplementalEquationCandidates = input.semanticExtractions.flatMap((extraction) =>
    input.sourceAssets
      .filter((asset) =>
        asset.source_id === extraction.source_id &&
        asset.asset_kind === "equation" &&
        !semanticAssetIds.has(asset.asset_id) &&
        Boolean(asset.structured_path ?? asset.image_path)
      )
      .map((asset) => ({ asset, score: scoreSupplementalEquationAsset(asset) }))
      .filter(({ score }) => score >= 60)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.asset.page_number !== right.asset.page_number) {
          return left.asset.page_number - right.asset.page_number;
        }
        return left.asset.asset_id.localeCompare(right.asset.asset_id);
      })
      .slice(0, 2)
      .map(({ asset, score }) => ({
        extraction,
        review: {
          asset_id: asset.asset_id,
          source_id: asset.source_id,
          section_key: "methodology",
          relevance_score_100: score,
          description_es: asset.caption_or_signal_text ?? "Ecuacion detectada en el PDF para posible transcripcion LaTeX.",
          keep_for_blueprint: true,
          rendering_strategy: "needs_crop_or_reconstruction" as const,
          citation_anchor: {
            citation_key: asset.citation_key,
            reference_id: asset.reference_id,
            source_id: asset.source_id,
            page_number: asset.page_number,
            chunk_id: null,
          },
        },
      })),
  );
  const candidates = [...supplementalEquationCandidates, ...semanticCandidates]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.review.asset_id === item.review.asset_id) === index)
    .slice(0, visualLocalizationCap());
  const model = resolveStep5VisionModel();
  let provider: ReturnType<typeof getConfiguredLlmProvider>;

  try {
    provider = getConfiguredLlmProvider();
    if (!provider.generateVisionStructuredObject) {
      throw new Error("Configured LLM provider does not support vision structured output.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return candidates.map(({ extraction, review }): MvpStep5VisualLocalizedAsset => {
      const rawAsset = sourceAssetsById.get(review.asset_id);
      return {
        asset_id: review.asset_id,
        source_id: extraction.source_id,
        reference_id: extraction.reference_id,
        citation_key: extraction.citation_key,
        asset_kind: rawAsset?.asset_kind ?? "figure",
        section_key: review.section_key,
        page_number: review.citation_anchor.page_number ?? rawAsset?.page_number ?? 0,
        prompt_version: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
        model,
        localization_status: "failed",
        confidence_100: null,
	        bbox_normalized: null,
	        bbox_pixels: null,
	        visual_description_es: null,
	        equation_latex: null,
	        equation_latex_status: rawAsset?.asset_kind === "equation" ? "failed" : "not_applicable",
	        equation_latex_confidence_100: null,
	        page_image_path: rawAsset?.image_path ?? null,
        cropped_image_path: null,
        fallback_page_image_path: rawAsset?.image_path ?? null,
        citation_anchor: {
          ...review.citation_anchor,
          page_number: review.citation_anchor.page_number ?? rawAsset?.page_number ?? 0,
          asset_id: review.asset_id,
        },
        warnings: [],
        errors: [message],
      };
    });
  }

  const generateVisionStructuredObject = provider.generateVisionStructuredObject.bind(provider);
  const localized: MvpStep5VisualLocalizedAsset[] = [];

  for (const { extraction, review } of candidates) {
    const rawAsset = sourceAssetsById.get(review.asset_id);
    const validationImagePath = rawAsset
      ? await resolveVisualValidationImage({
        artifactDir: input.artifactDir,
        extractionSourceId: extraction.source_id,
        asset: rawAsset,
      })
      : null;
    const fallbackPageImagePath = rawAsset?.image_path ?? rawAsset?.structured_path ?? null;
    const pageNumber = review.citation_anchor.page_number ?? rawAsset?.page_number ?? 0;
    const baseRecord = {
      asset_id: review.asset_id,
      source_id: extraction.source_id,
      reference_id: extraction.reference_id,
      citation_key: extraction.citation_key,
      asset_kind: rawAsset?.asset_kind ?? "figure",
      section_key: review.section_key,
      page_number: pageNumber,
      prompt_version: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
      model,
      page_image_path: validationImagePath,
      fallback_page_image_path: fallbackPageImagePath,
      citation_anchor: {
        ...review.citation_anchor,
        page_number: pageNumber,
        asset_id: review.asset_id,
      },
    };

    if (!rawAsset || !validationImagePath) {
      localized.push({
        ...baseRecord,
        localization_status: "skipped",
        confidence_100: null,
	        bbox_normalized: null,
	        bbox_pixels: null,
	        visual_description_es: null,
	        equation_latex: null,
	        equation_latex_status: baseRecord.asset_kind === "equation" ? "failed" : "not_applicable",
	        equation_latex_confidence_100: null,
	        cropped_image_path: null,
        warnings: ["No rendered or layout-cropped image was available for visual validation."],
        errors: [],
      });
      continue;
    }

    try {
      const prompt = buildVisualLocalizationPrompt({
        assetId: review.asset_id,
        sourceId: extraction.source_id,
        assetKind: rawAsset.asset_kind,
        pageNumber,
        caption: rawAsset.caption_or_signal_text,
        description: review.description_es,
        sectionKey: review.section_key,
      });
      const imageHash = await hashStep5File(validationImagePath);
      const promptHash = hashStep5Prompt(prompt);
      const cacheKey = buildStep5LlmCacheKey({
        kind: "asset_visual_localization",
        model,
        promptVersion: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
        schemaName: "mvp_step5_asset_visual_localization",
        promptHash,
        imageHash,
        sourceId: extraction.source_id,
        assetId: review.asset_id,
      });
      const cachedPayload = await readStep5LlmCache<{
        asset_id: string;
        localization_status: "localized" | "ambiguous" | "not_found";
        bbox_normalized: { x: number; y: number; width: number; height: number };
        confidence_100: number;
        visual_description_es: string;
        warnings: string[];
      }>({
        kind: "asset_visual_localization",
        cacheKey,
      });
      const payload = await withLlmUsageContext(
        {
          projectId: input.projectId,
          userId: input.userId,
          runId: input.runId,
          stage: "evidence_materialization",
          source: "runMvpEvidenceMaterialization.visualAssetLocalization",
        },
        async () => cachedPayload ??
          generateVisionStructuredObject<{
            asset_id: string;
            localization_status: "localized" | "ambiguous" | "not_found";
            bbox_normalized: { x: number; y: number; width: number; height: number };
            confidence_100: number;
            visual_description_es: string;
            warnings: string[];
          }>({
            prompt,
            imagePath: validationImagePath,
            schemaName: "mvp_step5_asset_visual_localization",
            schema: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.outputSchema as unknown as Record<string, unknown>,
            model,
            trackingLabel: "vision_structured:mvp_step5_asset_visual_localization",
            trackingAttribution: {
              projectId: input.projectId,
              userId: input.userId,
              runId: input.runId,
              stage: "evidence_materialization",
              source: `step5_asset_${review.asset_id}`,
              sourceId: extraction.source_id,
              assetId: review.asset_id,
              promptVersion: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
              promptHash,
              schemaName: "mvp_step5_asset_visual_localization",
              cacheKey,
            },
          }),
      );
      if (!cachedPayload) {
        await writeStep5LlmCache({
          kind: "asset_visual_localization",
          cacheKey,
          model,
          promptVersion: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
          payload,
        });
      }
      const bbox = normalizeBbox(payload.bbox_normalized);
	      const cropPath = payload.localization_status === "localized"
	        ? path.join(input.artifactDir, "materialized-sources", `${extraction.source_id}-assets`, "crops", `${review.asset_id}.png`)
	        : null;
	      const bboxPixels = cropPath ? await cropImageWithPython({ imagePath: validationImagePath, outputPath: cropPath, bbox }) : null;
	      let equationLatex: string | null = null;
	      let equationLatexStatus: MvpStep5VisualLocalizedAsset["equation_latex_status"] =
	        rawAsset.asset_kind === "equation" ? "failed" : "not_applicable";
	      let equationLatexConfidence: number | null = null;
	      const equationWarnings: string[] = [];
	      const equationOcrImagePath = rawAsset.asset_kind === "equation" && validationImagePath
	        ? validationImagePath
	        : cropPath;
	      if (rawAsset.asset_kind === "equation" && equationOcrImagePath && payload.localization_status !== "not_found") {
	        try {
	          const equationPrompt = buildEquationLatexPrompt({
	            assetId: review.asset_id,
	            sourceId: extraction.source_id,
	            pageNumber,
	            caption: rawAsset.caption_or_signal_text,
	          });
	          const equationImageHash = await hashStep5File(equationOcrImagePath);
	          const equationPromptHash = hashStep5Prompt(equationPrompt);
	          const equationCacheKey = buildStep5LlmCacheKey({
	            kind: "equation_latex_ocr",
	            model,
	            promptVersion: STEP5_EQUATION_LATEX_OCR_PROMPT.version,
	            schemaName: "mvp_step5_equation_latex_ocr",
	            promptHash: equationPromptHash,
	            imageHash: equationImageHash,
	            sourceId: extraction.source_id,
	            assetId: review.asset_id,
	          });
	          const cachedEquationPayload = await readStep5LlmCache<{
	            status: "transcribed" | "partial" | "not_equation" | "failed";
	            latex: string | null;
	            confidence_100: number;
	            description_es: string;
	            warnings: string[];
	          }>({
	            kind: "equation_latex_ocr",
	            cacheKey: equationCacheKey,
	          });
	          const equationPayload = await withLlmUsageContext(
	            {
	              projectId: input.projectId,
	              userId: input.userId,
	              runId: input.runId,
	              stage: "evidence_materialization",
	              source: "runMvpEvidenceMaterialization.equationLatexOcr",
	            },
	            async () => cachedEquationPayload ??
	              generateVisionStructuredObject<{
	                status: "transcribed" | "partial" | "not_equation" | "failed";
	                latex: string | null;
	                confidence_100: number;
	                description_es: string;
	                warnings: string[];
	              }>({
	                prompt: equationPrompt,
	                imagePath: equationOcrImagePath,
	                schemaName: "mvp_step5_equation_latex_ocr",
	                schema: STEP5_EQUATION_LATEX_OCR_PROMPT.outputSchema as unknown as Record<string, unknown>,
	                model,
	                trackingLabel: "vision_structured:mvp_step5_equation_latex_ocr",
	                trackingAttribution: {
	                  projectId: input.projectId,
	                  userId: input.userId,
	                  runId: input.runId,
	                  stage: "evidence_materialization",
	                  source: `step5_equation_${review.asset_id}`,
	                  sourceId: extraction.source_id,
	                  assetId: review.asset_id,
	                  promptVersion: STEP5_EQUATION_LATEX_OCR_PROMPT.version,
	                  promptHash: equationPromptHash,
	                  schemaName: "mvp_step5_equation_latex_ocr",
	                  cacheKey: equationCacheKey,
	                },
	              }),
	          );
	          if (!cachedEquationPayload) {
	            await writeStep5LlmCache({
	              kind: "equation_latex_ocr",
	              cacheKey: equationCacheKey,
	              model,
	              promptVersion: STEP5_EQUATION_LATEX_OCR_PROMPT.version,
	              payload: equationPayload,
	            });
	          }
	          equationLatex = equationPayload.latex ? compactText(equationPayload.latex, 1200) : null;
	          equationLatexStatus = equationPayload.status;
	          equationLatexConfidence = clampScore(equationPayload.confidence_100);
	          equationWarnings.push(...compactStringList(equationPayload.warnings ?? [], 300));
	        } catch (error) {
	          equationWarnings.push(`Equation LaTeX OCR failed: ${error instanceof Error ? error.message : String(error)}`);
	        }
	      }
	      localized.push({
	        ...baseRecord,
	        localization_status: payload.localization_status,
	        confidence_100: clampScore(payload.confidence_100),
	        bbox_normalized: bbox,
	        bbox_pixels: bboxPixels,
	        visual_description_es: compactText(payload.visual_description_es, 700),
	        equation_latex: equationLatex,
	        equation_latex_status: equationLatexStatus,
	        equation_latex_confidence_100: equationLatexConfidence,
	        cropped_image_path: cropPath,
	        warnings: [
	          ...(payload.warnings ?? []).map((warning) => compactText(warning, 300)).filter((warning): warning is string => Boolean(warning)),
	          ...equationWarnings,
	        ],
	        errors: [],
	      });
    } catch (error) {
      localized.push({
        ...baseRecord,
        localization_status: "failed",
        confidence_100: null,
	        bbox_normalized: null,
	        bbox_pixels: null,
	        visual_description_es: null,
	        equation_latex: null,
	        equation_latex_status: rawAsset.asset_kind === "equation" ? "failed" : "not_applicable",
	        equation_latex_confidence_100: null,
	        cropped_image_path: null,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  return localized;
}

async function readSampleText(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }
  try {
    return compactText(await readFile(filePath, "utf8"), 2400);
  } catch {
    return null;
  }
}

function countTextPattern(text: string | null, pattern: RegExp) {
  if (!text) {
    return 0;
  }
  return Array.from(text.matchAll(pattern)).length;
}

function resolveEvidenceBasis(input: { fulltext: string | null; sampleText: string | null; abstract: string | null | undefined }): MvpStep5EvidenceBasis {
  if (input.fulltext) {
    return "PDF_FULLTEXT";
  }
  if (input.sampleText) {
    return "PDF_SAMPLE_TEXT";
  }
  if (input.abstract?.trim()) {
    return "ABSTRACT_METADATA";
  }
  return "VERIFIED_METADATA_ONLY";
}

function scoreEvidenceCard(input: {
  source: MvpStep5SourceRegistryRecord;
  basis: MvpStep5EvidenceBasis;
  inspection: MvpSourceInspectionItem | null;
}) {
  let score = 15;
  if (input.source.has_doi) score += 15;
  if (input.source.has_abstract) score += 20;
  if (input.basis === "PDF_FULLTEXT") score += 35;
  if (input.basis === "PDF_SAMPLE_TEXT") score += 25;
  if (input.inspection?.allowed_evidence_use === "central_claim_support" || input.inspection?.allowed_evidence_use === "method_support") score += 15;
  if (input.inspection?.pdf_available_signal) score += 8;
  if (input.inspection?.identity_status === "matched") score += 7;

  const relevance = input.source.relevance_score ?? 0;
  score += relevance > 1 ? Math.min(10, relevance / 10) : Math.min(10, relevance * 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function assignSections(input: {
  sourceId: string;
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
}) {
  const sectionKeys = input.sectionContentPlan
    .filter((section) => section.section_key !== "references" && section.preferred_source_ids.includes(input.sourceId))
    .map((section) => section.section_key);
  return sectionKeys.length ? sectionKeys : ["research_antecedents"];
}

async function buildEvidenceCards(input: {
  rows: SelectedReferenceRow[];
  registry: MvpStep5SourceRegistryRecord[];
  sectionContentPlan: MvpStep5SectionContentPlanItem[];
  inspectionByReferenceId: Map<string, MvpSourceInspectionItem>;
  pdfMaterializationsByReferenceId: Map<string, MvpStep5PdfMaterialization>;
}) {
  const rowsByReferenceId = new Map(input.rows.map((row) => [row.referenceId, row]));
  const cards: MvpStep5EvidenceCard[] = [];

  for (const [index, source] of input.registry.entries()) {
    const row = rowsByReferenceId.get(source.reference_id);
    const inspection = input.inspectionByReferenceId.get(source.reference_id) ?? null;
    const pdfMaterialization = input.pdfMaterializationsByReferenceId.get(source.reference_id) ?? null;
    const fulltext = pdfMaterialization?.status === "materialized"
      ? await readSampleText(pdfMaterialization.fulltext_path)
      : null;
    const sampleText = await readSampleText(inspection?.sample_text_path);
    const abstractText = compactText(row?.reference.abstract, 2400);
    const basis = resolveEvidenceBasis({ fulltext, sampleText, abstract: row?.reference.abstract });
    const excerpt = fulltext ?? sampleText ?? abstractText ?? compactText([source.title, source.venue].filter(Boolean).join(". "), 900);
    const qualityScore = scoreEvidenceCard({ source, basis, inspection });
    const requiresFullText = basis !== "PDF_FULLTEXT" || qualityScore < 75;
    const assignedSectionKeys = assignSections({
      sourceId: source.source_id,
      sectionContentPlan: input.sectionContentPlan,
    });
    const gaps = [
      ...(basis === "VERIFIED_METADATA_ONLY" ? ["No abstract or PDF sample text is available for source-level extraction."] : []),
      ...(basis === "ABSTRACT_METADATA" ? ["Full text/PDF is still required before final theoretical or methodological drafting."] : []),
      ...(basis === "PDF_SAMPLE_TEXT" ? ["Only source-health PDF sample text was available; full-text materialization should be reviewed."] : []),
      ...(pdfMaterialization?.status === "failed" ? pdfMaterialization.errors.map((item) => `Full-text PDF materialization failed: ${item}`) : []),
      ...(inspection?.blockers ?? []),
      ...(!inspection ? ["Source inspection data is missing; PDF access and identity checks must be confirmed."] : []),
    ];

    const qualityStatus: MvpStep5EvidenceCard["quality_status"] =
      qualityScore >= 75 && basis === "PDF_SAMPLE_TEXT"
        ? "NEEDS_FULL_TEXT_REVIEW"
        : qualityScore >= 75 && basis === "PDF_FULLTEXT"
        ? "READY_FOR_PRELIMINARY_PLANNING"
        : qualityScore >= 50 && basis !== "VERIFIED_METADATA_ONLY"
          ? "NEEDS_FULL_TEXT_REVIEW"
          : "INSUFFICIENT_FOR_SECTION_DRAFTING";

    cards.push({
      card_id: `EC${index + 1}`,
      source_id: source.source_id,
      reference_id: source.reference_id,
      project_reference_id: source.project_reference_id,
      citation_key: source.citation_key,
      evidence_basis: basis,
      allowed_evidence_use: inspection?.allowed_evidence_use ?? (basis === "VERIFIED_METADATA_ONLY" ? "gap_only" : "context_only"),
      source_health: inspection?.source_health ?? "not_inspected",
      quality_status: qualityStatus,
      quality_score_100: qualityScore,
      requires_full_text: requiresFullText,
      assigned_section_keys: assignedSectionKeys,
      text_excerpt: excerpt,
      traceable_summary: excerpt
        ? `Recovered text for ${source.citation_key} supports preliminary planning for: ${assignedSectionKeys.join(", ")}.`
        : `Only bibliographic metadata was recovered for ${source.citation_key}.`,
      extractable_claim_types: basis === "PDF_FULLTEXT"
        ? ["source_summary", "method_description", "definition_or_context", "asset_candidate_review", "section_evidence_extraction"]
        : basis === "PDF_SAMPLE_TEXT"
        ? ["source_summary", "method_description", "definition_or_context", "asset_candidate_review"]
        : basis === "ABSTRACT_METADATA"
          ? ["source_summary", "contextual_relevance", "gap_mapping"]
          : ["bibliographic_record", "gap_mapping"],
      extraction_gaps: gaps,
      asset_candidates: {
        equations: pdfMaterialization?.asset_signal_counts.equations ?? inspection?.equation_candidate_count ?? countTextPattern(excerpt, /(?:=|equation|formula|ecuaci[oó]n|f[oó]rmula)/gi),
        tables: pdfMaterialization?.asset_signal_counts.tables ?? inspection?.table_candidate_count ?? countTextPattern(excerpt, /(?:table|tabla)\s+\d+/gi),
        figures: pdfMaterialization?.asset_signal_counts.figures ?? inspection?.figure_candidate_count ?? countTextPattern(excerpt, /(?:figure|fig\.|figura)\s+\d+/gi),
        fallback_rendering: pdfMaterialization?.source_pdf_path || inspection?.downloaded_pdf_path ? "image_required_after_pdf_extraction" : "none",
      },
      source_artifacts: {
        downloaded_pdf_path: inspection?.downloaded_pdf_path ?? null,
        sample_text_path: inspection?.sample_text_path ?? null,
        fulltext_path: pdfMaterialization?.fulltext_path ?? null,
        chunks_path: pdfMaterialization?.chunks_path ?? null,
        pages_path: pdfMaterialization?.pages_path ?? null,
      },
    });
  }

  return cards;
}

function buildFinalIntakeSnapshot(project: Awaited<ReturnType<typeof loadProjectForStep5>>) {
  return {
    topic: project.intake?.topic ?? null,
    problem_context: project.intake?.problemContext ?? null,
    research_line: project.intake?.researchLine ?? null,
    target_population: project.intake?.targetPopulation ?? null,
    preferred_methodology: project.intake?.preferredMethodology ?? null,
    search_query: project.intake?.searchQuery ?? null,
    template_key: project.templateKey,
  };
}

function updateLlmWavePlanWithSemanticResults(input: {
  llmWavePlan: MvpStep5LlmWavePlanItem[];
  semanticExtractions: MvpStep5SemanticExtraction[];
}) {
  const completed = input.semanticExtractions.filter((item) => item.status === "completed").length;
  const attempted = input.semanticExtractions.filter((item) => item.status !== "skipped_no_text").length;
  return input.llmWavePlan.map((wave) => {
    if (wave.wave_key !== "source_evidence_extraction") {
      return wave;
    }
    const status: MvpStep5LlmWavePlanItem["status"] = completed === 0
      ? "failed"
      : completed < attempted
        ? "partially_executed"
        : "executed";
    return {
      ...wave,
      status,
    };
  });
}

function updateLlmWavePlanWithVisualResults(input: {
  llmWavePlan: MvpStep5LlmWavePlanItem[];
  visualLocalizedAssets: MvpStep5VisualLocalizedAsset[];
}) {
  const localized = input.visualLocalizedAssets.filter((item) => item.localization_status === "localized").length;
  const attempted = input.visualLocalizedAssets.filter((item) => item.localization_status !== "skipped").length;
  return input.llmWavePlan.map((wave) => {
    if (wave.wave_key !== "asset_visual_localization") {
      return wave;
    }
    const status: MvpStep5LlmWavePlanItem["status"] = attempted === 0
      ? "planned_not_executed"
      : localized === 0
        ? "failed"
        : localized < attempted
          ? "partially_executed"
          : "executed";
    return {
      ...wave,
      status,
      prompt_version: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT.version,
      output_contract: ["visual_localized_assets", "bbox_normalized", "bbox_pixels", "cropped_image_path", "fallback_page_image_path"],
      fallback_strategy: "use page image fallback when visual localization is ambiguous, unavailable, or crop fails",
    };
  });
}

function updateLlmWavePlanWithEquationResults(input: {
  llmWavePlan: MvpStep5LlmWavePlanItem[];
  visualLocalizedAssets: MvpStep5VisualLocalizedAsset[];
}) {
  const equationAssets = input.visualLocalizedAssets.filter((item) => item.asset_kind === "equation");
  const successful = equationAssets.filter((item) =>
    item.equation_latex_status === "transcribed" || item.equation_latex_status === "partial"
  ).length;
  return input.llmWavePlan.map((wave) => {
    if (wave.wave_key !== "equation_latex_ocr") {
      return wave;
    }
    const status: MvpStep5LlmWavePlanItem["status"] = equationAssets.length === 0
      ? "planned_not_executed"
      : successful === 0
        ? "failed"
        : successful < equationAssets.length
          ? "partially_executed"
          : "executed";
    return {
      ...wave,
      status,
    };
  });
}

export async function runMvpEvidenceMaterialization(input: {
  userId: string;
  projectId: string;
  runId?: string;
}): Promise<MvpStep5Result> {
  const artifacts = buildArtifacts(input.projectId, input.runId);
  const apiUsageBefore = await captureMvpApiUsageSnapshot();
  const budgetPolicy = buildStep5BudgetPolicy();
  await mkdir(artifacts.artifactDir, { recursive: true });
  const warnings: string[] = [];
  const errors: string[] = [];
  const project = await loadProjectForStep5(input);
  const templateContext = await resolveTemplateContext(project.templateKey, warnings);
  const sourceInspection = await loadLatestSourceInspection(input.projectId);
  warnings.push(...sourceInspection.warnings);

  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_STEP5_KEY,
    status: "RUNNING",
    provider: Provider.SYSTEM,
    model: null,
    promptVersion: MVP_STEP5_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      run_id: artifacts.runId,
      project_id: input.projectId,
      selected_reference_count: project.projectReferences.length,
      template_key: project.templateKey,
      prompt_registry: MVP_STEP5_PROMPT_VERSION,
      source_evidence_prompt_registry: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.version,
      source_inspection_step_run_id: sourceInspection.stepRunId,
      budget_policy: budgetPolicy,
    }),
    artifactDir: artifacts.artifactDir,
    artifactManifestPath: artifacts.artifactManifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_STEP5_EVIDENCE_MATERIALIZATION_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: artifacts.runId,
      step_run_id: stepRun.id,
      step_key: MVP_STEP5_KEY,
      prompt_version: MVP_STEP5_PROMPT_VERSION,
      artifact_dir: artifacts.artifactDir,
    }),
  });

  try {
    const sourceRegistry = buildSourceRegistry({
      rows: project.projectReferences,
      citationStyle: templateContext.citationStyle,
      warnings,
    });
    const finalIntake = buildFinalIntakeSnapshot(project);
    const references = buildReferenceRecords({
      registry: sourceRegistry,
      citationStyle: templateContext.citationStyle,
    });
    const sectionContentPlan = buildSectionContentPlan(sourceRegistry);
    const llmWavePlan = buildLlmWavePlan();
    const pdfMaterializations = await materializePdfSources({
      artifactDir: artifacts.artifactDir,
      registry: sourceRegistry,
      inspectionByReferenceId: sourceInspection.itemsByReferenceId,
    });
    const pdfMaterializationsByReferenceId = new Map(
      pdfMaterializations.map((item) => [item.reference_id, item]),
    );
    const pdfLayoutInventories = await buildPdfLayoutInventories({
      artifactDir: artifacts.artifactDir,
      pdfMaterializations,
      warnings,
    });
    const sourceAssets = await buildSourceAssets({
      artifactDir: artifacts.artifactDir,
      pdfMaterializations,
      pdfLayoutInventories,
      budgetPolicy,
    });
    const curatedAssets = curateSourceAssets({
      sourceAssets,
      sourceRegistry,
      sectionContentPlan,
      budgetPolicy,
    });
    const deterministicEvidenceCards = await buildEvidenceCards({
      rows: project.projectReferences,
      registry: sourceRegistry,
      sectionContentPlan,
      inspectionByReferenceId: sourceInspection.itemsByReferenceId,
      pdfMaterializationsByReferenceId,
    });
    const semanticExtractions = await runSemanticSourceExtractions({
      userId: input.userId,
      projectId: input.projectId,
      runId: artifacts.runId,
      rows: project.projectReferences,
      finalIntake,
      sourceRegistry,
      sectionContentPlan,
      sourceAssets,
      pdfMaterializationsByReferenceId,
      inspectionByReferenceId: sourceInspection.itemsByReferenceId,
      budgetPolicy,
      artifactPath: artifacts.semanticExtractionsPath,
    });
    const visualLocalizedAssets = await runVisualAssetLocalization({
      userId: input.userId,
      projectId: input.projectId,
      runId: artifacts.runId,
      artifactDir: artifacts.artifactDir,
      sourceAssets,
      semanticExtractions,
    });
    const evidenceCards = mergeSemanticEvidenceCards({
      evidenceCards: deterministicEvidenceCards,
      semanticExtractions,
    });
    const executedLlmWavePlan = updateLlmWavePlanWithEquationResults({
      llmWavePlan: updateLlmWavePlanWithVisualResults({
        llmWavePlan: updateLlmWavePlanWithSemanticResults({
          llmWavePlan,
          semanticExtractions,
        }),
        visualLocalizedAssets,
      }),
      visualLocalizedAssets,
    });
    const extractionGaps = evidenceCards.flatMap((card) =>
      card.extraction_gaps.map((gap) => ({
        card_id: card.card_id,
        source_id: card.source_id,
        reference_id: card.reference_id,
        gap,
      })),
    );
    const semanticCompletedCount = semanticExtractions.filter((item) => item.status === "completed").length;
    const status: MvpStep5Result["status"] = sourceRegistry.length >= 3 && semanticCompletedCount > 0
      ? "completed"
      : "partially_completed";

    if (sourceRegistry.length < 3) {
      warnings.push("Fewer than three selected sources are available; later drafting must treat evidence coverage as incomplete.");
    }
    if (semanticCompletedCount === 0) {
      warnings.push("No semantic LLM source extraction completed; Step 5 preserved deterministic materialization only.");
    }

    const evidenceLedger: MvpStep5EvidenceLedger = {
      project_id: input.projectId,
      step_run_id: stepRun.id,
      template_key: templateContext.templateKey,
      template_version_id: templateContext.templateVersionId,
      citation_style: templateContext.citationStyle,
      source_registry: sourceRegistry,
      references,
      pdf_materializations: pdfMaterializations,
      pdf_layout_inventories: pdfLayoutInventories,
      source_assets: sourceAssets,
      curated_assets: curatedAssets,
      visual_localized_assets: visualLocalizedAssets,
      semantic_extractions: semanticExtractions,
      budget_policy: budgetPolicy,
      evidence_cards: evidenceCards,
      section_content_plan: sectionContentPlan,
      llm_wave_plan: executedLlmWavePlan,
      artifact_manifest_path: artifacts.artifactManifestPath,
      warnings,
    };
    const blueprintV2EvidenceLedger = adaptStep5LedgerToBlueprintV2(evidenceLedger);

    const templateContentPlanRow = await prisma.projectTemplateContentPlan.create({
      data: {
        projectId: input.projectId,
        stepRunId: stepRun.id,
        templateVersionId: templateContext.templateVersionId,
        templateKey: templateContext.templateKey,
        citationStyle: templateContext.citationStyle,
        qualityStatus: "PLANNED",
        sectionPlanJson: asStepRunJson(sectionContentPlan),
        llmWavePlanJson: asStepRunJson(executedLlmWavePlan),
        artifactManifestPath: artifacts.artifactManifestPath,
      },
    });

    const evidenceLedgerRow = await prisma.projectEvidenceLedger.create({
      data: {
        projectId: input.projectId,
        stepRunId: stepRun.id,
        citationStyle: templateContext.citationStyle,
        sourceRegistryJson: asStepRunJson(sourceRegistry),
        referencesJson: asStepRunJson(references),
        ledgerJson: asStepRunJson(evidenceLedger),
        artifactManifestPath: artifacts.artifactManifestPath,
      },
    });

    await prisma.projectEvidenceCard.createMany({
      data: evidenceCards.map((card) => ({
        projectId: input.projectId,
        stepRunId: stepRun.id,
        evidenceLedgerId: evidenceLedgerRow.id,
        sourceId: card.source_id,
        referenceId: card.reference_id,
        citationKey: card.citation_key,
        evidenceBasis: card.evidence_basis,
        qualityStatus: card.quality_status,
        qualityScore: card.quality_score_100,
        requiresFullText: card.requires_full_text,
        sectionKeysJson: asStepRunJson(card.assigned_section_keys),
        contentJson: asStepRunJson(card),
        artifactPath: artifacts.evidenceCardsPath,
      })),
    });

    await prisma.projectSourceMaterialization.createMany({
      data: pdfMaterializations.map((item) => ({
        projectId: input.projectId,
        stepRunId: stepRun.id,
        evidenceLedgerId: evidenceLedgerRow.id,
        sourceId: item.source_id,
        referenceId: item.reference_id,
        materializationType: "PDF_FULLTEXT",
        status: item.status,
        sourcePdfPath: item.source_pdf_path,
        fulltextPath: item.fulltext_path,
        pagesPath: item.pages_path,
        chunksPath: item.chunks_path,
        metricsJson: asStepRunJson({
          page_count: item.page_count,
          char_count: item.char_count,
          chunk_count: item.chunk_count,
          asset_signal_counts: item.asset_signal_counts,
          pdf_sha256: item.pdf_sha256,
          fulltext_sha256: item.fulltext_sha256,
        }),
        artifactsJson: asStepRunJson({
          original_pdf_path: item.original_pdf_path,
          source_pdf_path: item.source_pdf_path,
          fulltext_path: item.fulltext_path,
          pages_path: item.pages_path,
          chunks_path: item.chunks_path,
          pdf_layout_inventory_path: artifacts.pdfLayoutInventoriesPath,
        }),
        errorsJson: asStepRunJson({
          warnings: item.warnings,
          errors: item.errors,
        }),
      })),
    });

    const curatedAssetsById = new Map(curatedAssets.map((asset) => [asset.asset_id, asset]));
    const visualLocalizedAssetsById = new Map(visualLocalizedAssets.map((asset) => [asset.asset_id, asset]));
    await prisma.projectSourceAsset.createMany({
      data: sourceAssets.map((asset) => {
        const curated = curatedAssetsById.get(asset.asset_id) ?? null;
        const visual = visualLocalizedAssetsById.get(asset.asset_id) ?? null;
        return {
        projectId: input.projectId,
        stepRunId: stepRun.id,
        evidenceLedgerId: evidenceLedgerRow.id,
        sourceId: asset.source_id,
        referenceId: asset.reference_id,
        citationKey: asset.citation_key,
        assetKind: asset.asset_kind,
        status: asset.status,
        curationStatus: curated?.curation_status ?? "RAW",
        curationScore: visual?.confidence_100 ?? curated?.curation_score_100 ?? null,
        sectionKey: visual?.section_key ?? curated?.section_key ?? null,
        pageNumber: asset.page_number,
        imagePath: asset.image_path,
        structuredPath: visual?.cropped_image_path ?? asset.structured_path,
        bboxJson: visual ? asStepRunJson({
          status: visual.localization_status,
          unit: "normalized_and_pixels",
          bbox_normalized: visual.bbox_normalized,
          bbox_pixels: visual.bbox_pixels,
          fallback_page_image_path: visual.fallback_page_image_path,
        }) : asset.coordinates ? asStepRunJson(asset.coordinates) : curated ? asStepRunJson(curated.coordinates) : undefined,
        metadataJson: asStepRunJson(visual ?? curated ?? asset),
        };
      }),
    });

    const apiUsageReport = await buildMvpApiUsageReport({
      before: apiUsageBefore,
      label: "mvp_step5_evidence_materialization",
      filter: {
        projectId: input.projectId,
        runId: artifacts.runId,
        since: apiUsageBefore.capturedAt,
      },
    });
    const apiUsageTotals = apiUsageReport.filtered_delta ?? apiUsageReport.delta;
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - stepRun.startedAt.getTime());

    const result: MvpStep5Result = {
      step_key: MVP_STEP5_KEY,
      prompt_version: MVP_STEP5_PROMPT_VERSION,
      project_id: input.projectId,
      step_run_id: stepRun.id,
      template_content_plan_id: templateContentPlanRow.id,
      evidence_ledger_id: evidenceLedgerRow.id,
      status,
      template_key: templateContext.templateKey,
      template_version_id: templateContext.templateVersionId,
      citation_style: templateContext.citationStyle,
      selected_source_count: sourceRegistry.length,
      planned_section_count: sectionContentPlan.length,
      planned_llm_wave_count: executedLlmWavePlan.length,
      started_at: stepRun.startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      artifact_dir: artifacts.artifactDir,
      artifact_manifest_path: artifacts.artifactManifestPath,
      artifacts: {
        manifest: artifacts.artifactManifestPath,
        source_registry: artifacts.sourceRegistryPath,
        references: artifacts.referencesPath,
        pdf_materializations: artifacts.pdfMaterializationsPath,
        pdf_layout_inventories: artifacts.pdfLayoutInventoriesPath,
        source_assets: artifacts.sourceAssetsPath,
        curated_assets: artifacts.curatedAssetsPath,
        visual_localized_assets: artifacts.visualLocalizedAssetsPath,
        blueprint_v2_evidence_ledger: artifacts.blueprintV2EvidenceLedgerPath,
        semantic_extractions: artifacts.semanticExtractionsPath,
        budget_policy: artifacts.budgetPolicyPath,
        api_usage_report: artifacts.apiUsageReportPath,
        evidence_cards: artifacts.evidenceCardsPath,
        extraction_gaps: artifacts.extractionGapsPath,
        section_content_plan: artifacts.sectionContentPlanPath,
        llm_wave_plan: artifacts.llmWavePlanPath,
        evidence_ledger: artifacts.evidenceLedgerPath,
      },
      source_registry: sourceRegistry,
      references,
      pdf_materializations: pdfMaterializations,
      pdf_layout_inventories: pdfLayoutInventories,
      pdf_layout_candidate_count: pdfLayoutInventories.reduce((sum, item) => sum + item.candidates.length, 0),
      materialized_pdf_count: pdfMaterializations.filter((item) => item.status === "materialized").length,
      fulltext_chunk_count: pdfMaterializations.reduce((sum, item) => sum + item.chunk_count, 0),
      source_assets: sourceAssets,
      source_asset_count: sourceAssets.length,
      rendered_asset_page_count: new Set(sourceAssets.map((asset) => asset.image_path).filter(Boolean)).size,
      curated_assets: curatedAssets,
      curated_asset_count: curatedAssets.length,
      visual_localized_assets: visualLocalizedAssets,
      visual_localized_asset_count: visualLocalizedAssets.filter((item) => item.localization_status === "localized").length,
      semantic_extractions: semanticExtractions,
      semantic_extraction_count: semanticExtractions.filter((item) => item.status === "completed").length,
      budget_policy: budgetPolicy,
      evidence_cards: evidenceCards,
      evidence_card_count: evidenceCards.length,
      extraction_gap_count: extractionGaps.length,
      section_content_plan: sectionContentPlan,
      llm_wave_plan: executedLlmWavePlan,
      warnings,
      api_usage: {
        run_id: artifacts.runId,
        report_path: artifacts.apiUsageReportPath,
        llm_calls_executed: apiUsageTotals.calls,
        input_tokens: apiUsageTotals.inputTokens,
        cached_input_tokens: apiUsageTotals.cachedInputTokens,
        output_tokens: apiUsageTotals.outputTokens,
        total_tokens: apiUsageTotals.totalTokens,
        estimated_cost_usd: apiUsageTotals.costUsd,
        estimated_cost_cad: apiUsageTotals.costCad,
      },
    };

    await writeJson(artifacts.sourceRegistryPath, sourceRegistry);
    await writeJson(artifacts.referencesPath, references);
    await writeJson(artifacts.pdfMaterializationsPath, pdfMaterializations);
    await writeJson(artifacts.pdfLayoutInventoriesPath, pdfLayoutInventories);
    await writeJson(artifacts.sourceAssetsPath, sourceAssets);
    await writeJson(artifacts.curatedAssetsPath, curatedAssets);
    await writeJson(artifacts.visualLocalizedAssetsPath, visualLocalizedAssets);
    await writeJson(artifacts.blueprintV2EvidenceLedgerPath, blueprintV2EvidenceLedger);
    await writeJson(artifacts.semanticExtractionsPath, semanticExtractions);
    await writeJson(artifacts.budgetPolicyPath, budgetPolicy);
    await writeJson(artifacts.apiUsageReportPath, apiUsageReport);
    await writeJson(artifacts.evidenceCardsPath, evidenceCards);
    await writeJson(artifacts.extractionGapsPath, extractionGaps);
    await writeJson(artifacts.sectionContentPlanPath, sectionContentPlan);
    await writeJson(artifacts.llmWavePlanPath, executedLlmWavePlan);
    await writeJson(artifacts.evidenceLedgerPath, evidenceLedger);
    await writeJson(artifacts.artifactManifestPath, {
      ...result,
      template_runtime_summary: templateContext.runtimeSummary,
      prompt_registry: {
        source_evidence_extraction: STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT,
        asset_visual_localization: STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT,
        equation_latex_ocr: STEP5_EQUATION_LATEX_OCR_PROMPT,
      },
      blueprint_v2_evidence_ledger: {
        artifact_path: artifacts.blueprintV2EvidenceLedgerPath,
        source_count: blueprintV2EvidenceLedger.source_registry.length,
        evidence_pack_count: blueprintV2EvidenceLedger.evidence_packs.length,
        snippet_count: blueprintV2EvidenceLedger.snippets.length,
        asset_count: blueprintV2EvidenceLedger.assets.length,
      },
      source_inspection_step_run_id: sourceInspection.stepRunId,
    });

    await updateMvpStepRun(stepRun.id, {
      status: status === "completed" ? "COMPLETED" : "PARTIALLY_COMPLETED",
      provider: semanticCompletedCount > 0 ? Provider.OPENAI : Provider.SYSTEM,
      model: semanticCompletedCount > 0 ? resolveStep5ExtractionModel() : null,
      promptVersion: MVP_STEP5_PROMPT_VERSION,
      outputSnapshotJson: asStepRunJson(result),
      warningsJson: asStepRunJson(warnings),
      errorsJson: asStepRunJson(errors),
      fallbackUsed: false,
      artifactDir: artifacts.artifactDir,
      artifactManifestPath: artifacts.artifactManifestPath,
      finishedAt: completedAt,
    });

    await logAuditEvent({
      eventType: "MVP_STEP5_EVIDENCE_MATERIALIZATION_COMPLETED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: artifacts.runId,
        step_run_id: stepRun.id,
        status,
        selected_source_count: sourceRegistry.length,
        materialized_pdf_count: pdfMaterializations.filter((item) => item.status === "materialized").length,
        fulltext_chunk_count: pdfMaterializations.reduce((sum, item) => sum + item.chunk_count, 0),
        source_asset_count: sourceAssets.length,
        rendered_asset_page_count: new Set(sourceAssets.map((asset) => asset.image_path).filter(Boolean)).size,
        curated_asset_count: curatedAssets.length,
        visual_localized_asset_count: visualLocalizedAssets.filter((item) => item.localization_status === "localized").length,
        semantic_extraction_count: semanticCompletedCount,
        evidence_card_count: evidenceCards.length,
        extraction_gap_count: extractionGaps.length,
        planned_section_count: sectionContentPlan.length,
        planned_llm_wave_count: executedLlmWavePlan.length,
        duration_ms: durationMs,
        api_usage: result.api_usage,
        budget_policy: budgetPolicy,
        template_key: templateContext.templateKey,
        template_version_id: templateContext.templateVersionId,
        citation_style: templateContext.citationStyle,
        warnings,
        artifact_manifest_path: artifacts.artifactManifestPath,
      }),
    });

    return result;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);

    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider: Provider.SYSTEM,
      model: null,
      promptVersion: MVP_STEP5_PROMPT_VERSION,
      errorsJson: asStepRunJson(errors),
      artifactDir: artifacts.artifactDir,
      artifactManifestPath: artifacts.artifactManifestPath,
      finishedAt: completedAt,
    });

    await logAuditEvent({
      eventType: "MVP_STEP5_EVIDENCE_MATERIALIZATION_FAILED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: artifacts.runId,
        step_run_id: stepRun.id,
        errors,
        completed_at: completedAt.toISOString(),
      }),
    });

    throw error;
  }
}
