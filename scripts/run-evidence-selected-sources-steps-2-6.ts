import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { consolidateBlueprintLaunchEvidence } from "@/blueprint_launch/server/consolidated-evidence";
import {
  applySelectionState,
  type BlueprintLaunchLocalState,
  type BlueprintLaunchEvidencePlanningResult,
  type BlueprintLaunchReferenceListItem,
  type BlueprintLaunchSavedIntakeOriginalSnapshot,
  type BlueprintLaunchSavedIntakeSnapshot,
  type BlueprintLaunchSearchSnapshot,
  type BlueprintLaunchSourceAccessResolutionResult,
  type BlueprintLaunchSourceIntakeGateResult,
  type BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import { materializeBlueprintLaunchSourceContent } from "@/blueprint_launch/server/source-content-materialization";
import { planBlueprintLaunchEvidence } from "@/blueprint_launch/server/source-evidence-planning";
import {
  inspectBlueprintLaunchSourcesLimited,
  renderLimitedInspectionReport,
} from "@/blueprint_launch/server/source-limited-inspection";
import { evaluateBlueprintLaunchSourceIntakeGate } from "@/blueprint_launch/server/source-intake-gate";
import { resolveBlueprintLaunchSourceAccess } from "@/blueprint_launch/server/source-access-resolution";
import { extractBlueprintLaunchSourceSignals } from "@/blueprint_launch/server/source-signal-extraction";
import {
  buildBlueprintLaunchProjectGlobalContext,
  buildBlueprintLaunchProjectSnapshot,
  type BlueprintLaunchIntakeImprovementResult,
} from "@/blueprint_launch/server/step1-intake-context";
import type { BlueprintLaunchProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import {
  adaptCurrentLabAArtifactToEvidenceHandoffV1,
  buildBlueprintEngineInputFromEvidenceHandoffV1,
  type CurrentLabAConsolidatedEvidenceArtifact,
} from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import { evidenceEngineHandoffV1Schema } from "@/server/blueprint-engine/contracts";
import {
  buildReducedEvidencePackFromHandoff,
  type ReducedEvidencePackV1,
} from "@/server/blueprint-engine/quality/evidence-budget";
import { evaluateBlueprintProductionSafety } from "@/server/blueprint-engine/quality/production-safety";
import {
  buildUserProvidedPdfProductionWarnings,
  loadUserProvidedSourcePdfManifest,
  type UserProvidedSourcePdfManifestV1,
} from "@/server/blueprint-engine/quality/user-provided-source-pdfs";
import {
  buildExactStepTelemetry,
  buildCoarseStepTelemetry,
  buildRunTelemetryArtifact,
  normalizeUsageDelta,
  StepTimer,
  type StepTelemetrySpan,
} from "@/server/blueprint-engine/quality/run-telemetry";
import {
  buildQualityDashboard,
  renderProductionReadinessReport,
} from "@/server/blueprint-engine/quality/production-readiness-dashboard";
import {
  buildSecondaryReferenceRecoveryQueue,
  renderSecondaryReferenceRecoveryQueueReport,
} from "@/server/blueprint-engine/quality/secondary-reference-recovery";
import {
  buildSourceSufficiencyReport,
  renderSourceSufficiencyReport,
} from "@/server/blueprint-engine/quality/source-sufficiency";
import {
  buildPostInspectionSourceSufficiencyReport,
  renderPostInspectionSourceSufficiencyReport,
  shouldStopAfterPostInspectionSufficiency,
} from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";
import {
  renderPdfRelevanceReviewReport,
  reviewPdfRelevanceFromLimitedInspection,
} from "@/server/blueprint-engine/quality/pdf-relevance-review";
import {
  buildDeepResearchLightArtifacts,
  renderDeepResearchLightReport,
  shouldBuildDeepResearchLightArtifacts,
} from "@/server/blueprint-engine/quality/deep-research-light";
import {
  buildRapidDeepResearchRequest,
  renderRapidDeepResearchReport,
  runRapidDeepResearchFallback,
} from "@/server/blueprint-engine/quality/rapid-deep-research-fallback";
import { readLlmUsageRegistry, type LlmUsageRegistry } from "@/server/llm-usage-registry";
import type { IntakeInput } from "@/server/projects/project-validation";
import { resolveProjectStatusFromIntake } from "@/server/projects/project-validation";

const DEFAULT_CASE_ID = "case-001-seismic-isolators-peruvian-buildings";
const CANDIDATE_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-candidate-search-runs",
);
const SELECTED_SOURCE_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-selected-source-runs",
);

type CliArgs = {
  caseId: string;
  runFolder: string | null;
  allowBlocked: boolean;
  userProvidedPdfManifest: string | null;
  rapidDeepResearchFallback: boolean;
};

type IntakeFixture = {
  case_id: string;
  case_name: string;
  project_id: string;
  user_id: string;
  project_context: {
    title: string;
    degree_level: string;
    university: string;
    program: string;
    knowledge_area_label: string;
    template_key: string;
    country: string;
    language: string;
  };
  intake: IntakeInput;
  source_policy?: Record<string, unknown>;
};

type NormalizedIntakeContext = {
  normalized_at?: string;
  project?: IntakeFixture["project_context"] & { project_id?: string };
  intake_original?: IntakeInput;
  intake_normalized?: IntakeInput;
  lab_a_search_input?: IntakeInput;
  lab_a_search_knowledge_area_label?: string;
  canonical_topic_es?: string;
  problem_core_es?: string;
  method_preference_es?: string | null;
  target_scope_es?: string | null;
};

type CandidateSource = {
  candidate_id: string;
  title: string;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  openalex_id?: string | null;
  crossref_id?: string | null;
  abstract?: string | null;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  open_access_status?: string | null;
  relevance_score?: number | null;
  rank?: number;
  provider?: string;
  reasons?: string[];
  warnings?: string[];
};

type CandidateSourcesArtifact = {
  case_id?: string;
  generated_at?: string;
  search_snapshot_summary?: {
    search_query?: string;
    attempted_queries?: string[];
    total_results?: number;
    metadata?: BlueprintLaunchSearchSnapshot["metadata"];
  };
  candidates?: CandidateSource[];
};

type SourceSelection = {
  case_id: string;
  run_folder?: string;
  selection_status: string;
  selected_reference_ids: string[];
  rejected_reference_ids?: string[];
  undecided_reference_ids?: string[];
  reviewer_notes?: string;
  candidate_notes?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  source_policy?: unknown;
};

type RunSummary = {
  run_id: string;
  status: "completed" | "failed" | "blocked";
  case_id: string;
  source_candidate_run_folder: string;
  selected_source_count: number;
  selected_reference_ids: string[];
  completed_steps: string[];
  access_resolved_count: number;
  materialized_source_count: number;
  extracted_text_char_count: number;
  evidence_unit_count: number;
  direct_quote_count: number;
  asset_reference_count: number;
  section_dossier_count: number;
  quality_gate_status: string | null;
  warnings: string[];
  blockers: string[];
  output_folder: string;
  blocked_by_gate: boolean;
  blocked_at_step: BlockedRunStep | null;
  allow_blocked: boolean;
  production_valid: boolean;
  openai_called: boolean;
  estimated_or_logged_token_usage: Record<string, unknown> | null;
  warning?: string;
  error?: string;
  full_consolidated_evidence_artifact_path?: string | null;
  user_provided_pdf_manifest_path?: string | null;
  user_provided_pdf_count?: number;
  user_provided_pdf_production_review_required?: boolean;
};

type BlockedRunStep =
  | "step_2_source_access_resolution"
  | "step_3_evidence_planning"
  | "step_4a_limited_source_inspection"
  | "step_4b_pdf_relevance_review"
  | "step_4c_source_sufficiency"
  | "step_4b_post_inspection_sufficiency";

type SourceReplacementReportSource = {
  source_id: string;
  title: string;
  year: number | null;
  doi: string | null;
  relevance_score: number | null;
  score_label: string | null;
  access_status: string | null;
  access_kind: string | null;
  has_complete_public_content: boolean;
  resolved_content_url: string | null;
  source_level_warnings: string[];
  risk_flags: string[];
  recommendation_es: string;
};

type SourceReplacementReport = {
  case_id: string;
  generated_at: string;
  blocked_at_step: BlockedRunStep;
  source_candidate_run_folder: string;
  output_folder: string;
  selected_source_count: number;
  selected_reference_ids: string[];
  needs_more_sources: boolean;
  selected_sources: SourceReplacementReportSource[];
  low_relevance_source_ids: string[];
  missing_or_weak_public_content_source_ids: string[];
  wrong_pdf_risk_source_ids: string[];
  source_set_blockers: string[];
  source_set_warnings: string[];
  instructions_es: string[];
};

function loadLocalEnv() {
  if (!existsSync(".env")) {
    return;
  }

  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function parseArgs(args = process.argv.slice(2)): CliArgs {
  let caseId = DEFAULT_CASE_ID;
  let runFolder: string | null = null;
  let allowBlocked = false;
  let userProvidedPdfManifest: string | null = null;
  let rapidDeepResearchFallback = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--allow-blocked") {
      allowBlocked = true;
      continue;
    }

    if (arg === "--rapid-deep-research-fallback") {
      rapidDeepResearchFallback = true;
      continue;
    }

    if (arg === "--case" && next) {
      caseId = next;
      index += 1;
      continue;
    }

    if (arg === "--run-folder" && next) {
      runFolder = next;
      index += 1;
      continue;
    }

    if (arg === "--user-provided-pdf-manifest" && next) {
      userProvidedPdfManifest = next;
      index += 1;
    }
  }

  return { caseId, runFolder, allowBlocked, userProvidedPdfManifest, rapidDeepResearchFallback };
}

function buildTimestampToken(value = new Date().toISOString()) {
  return value.replace(/[:.]/g, "-");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyIfExists(source: string, destination: string) {
  if (!existsSync(source)) {
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function findLatestRunFolderWithSelection(caseId: string) {
  const caseDir = path.join(CANDIDATE_RUN_ROOT, caseId);
  const entries = await readdir(caseDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDir = path.join(caseDir, entry.name);
    const selectionPath = path.join(runDir, "source-selection.json");

    if (!existsSync(selectionPath)) {
      continue;
    }

    candidates.push({
      runDir,
      updatedAt: (await stat(selectionPath)).mtimeMs,
    });
  }

  candidates.sort((left, right) => right.updatedAt - left.updatedAt);

  if (!candidates[0]) {
    throw new Error(`No se encontro source-selection.json para el caso ${caseId}.`);
  }

  return candidates[0].runDir;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function ensureIntake(value: unknown): IntakeInput {
  const record = value && typeof value === "object" ? (value as Partial<IntakeInput>) : {};

  return {
    topic: asString(record.topic),
    problemContext: asString(record.problemContext),
    researchLine: asString(record.researchLine),
    academicConstraints: asString(record.academicConstraints),
    targetPopulation: asString(record.targetPopulation),
    availableData: asString(record.availableData),
    preferredMethodology: asString(record.preferredMethodology),
    advisorNotes: asString(record.advisorNotes),
  };
}

function parseScoreLabel(candidate: CandidateSource): "ALTO" | "MEDIO" | "BAJO" | "MINIMO" {
  const reasons = (candidate.reasons ?? []).join(" ").toUpperCase();

  if (reasons.includes("ALTO")) return "ALTO";
  if (reasons.includes("MEDIO")) return "MEDIO";
  if (reasons.includes("MINIMO")) return "MINIMO";
  if (reasons.includes("BAJO")) return "BAJO";

  const score = candidate.relevance_score ?? 0;
  if (score >= 70) return "ALTO";
  if (score >= 40) return "MEDIO";
  if (score > 0) return "MINIMO";
  return "BAJO";
}

function buildReferenceListItem(input: {
  candidate: CandidateSource;
  index: number;
  searchQuery: string;
}): BlueprintLaunchReferenceListItem {
  return {
    id: `candidate-${input.index + 1}-${input.candidate.candidate_id}`,
    selected: false,
    selectedOrder: null,
    relevanceScore: input.candidate.relevance_score ?? null,
    scoreBreakdown: {
      label: parseScoreLabel(input.candidate),
      necessaryMatches: [],
      complementaryMatches: [],
      optionalMatches: [],
      recencyBand: input.candidate.year ? `${input.candidate.year}` : "sin fecha",
      recencyBonus: 0,
      matchedQuery: input.searchQuery,
      matchedQueryStage: "necessary_only",
    },
    reference: {
      id: input.candidate.candidate_id,
      title: input.candidate.title,
      translatedTitle: null,
      doi: input.candidate.doi ?? null,
      year: input.candidate.year ?? null,
      venue: input.candidate.venue ?? null,
      abstract: input.candidate.abstract ?? null,
      translatedAbstract: null,
      landingPageUrl: input.candidate.landing_page_url ?? null,
      authorsJson: input.candidate.authors ?? [],
      sourceLanguage: null,
      displayLanguage: "es",
      hasAutoTranslation: false,
      pdfUrl: input.candidate.pdf_url ?? null,
      pdfAccessible: Boolean(input.candidate.pdf_url),
    },
  };
}

function buildSelectedSourceBundle(input: {
  outputFolder: string;
  searchSnapshot: BlueprintLaunchSearchSnapshot;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
}): BlueprintLaunchSelectedSourceBundle {
  const sources = input.searchSnapshot.references
    .filter((item) => item.selected && item.selectedOrder !== null)
    .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
    .map((item) => ({
      selectedOrder: item.selectedOrder ?? 0,
      relevanceScore: item.relevanceScore,
      scoreLabel: item.scoreBreakdown?.label ?? null,
      reference: item.reference,
    }));

  return {
    savedAt: new Date().toISOString(),
    manifestPath: path.join(input.outputFolder, "selected-source-bundle.json"),
    selectedCount: sources.length,
    pdfLinkedCount: sources.filter((item) => item.reference.pdfAccessible).length,
    searchQuery: input.searchSnapshot.searchQuery,
    intakeTopic: input.savedIntake.intake.topic,
    sources,
  };
}

function buildUsageDelta(before: LlmUsageRegistry, after: LlmUsageRegistry) {
  return {
    before: before.cumulative,
    after: after.cumulative,
    delta: {
      calls: after.cumulative.calls - before.cumulative.calls,
      inputTokens: after.cumulative.inputTokens - before.cumulative.inputTokens,
      cachedInputTokens:
        after.cumulative.cachedInputTokens - before.cumulative.cachedInputTokens,
      outputTokens: after.cumulative.outputTokens - before.cumulative.outputTokens,
      totalTokens: after.cumulative.totalTokens - before.cumulative.totalTokens,
      costUsd: after.cumulative.costUsd - before.cumulative.costUsd,
      costCad: after.cumulative.costCad - before.cumulative.costCad,
    },
  };
}

async function measureEvidenceStep<T>(input: {
  timer: StepTimer;
  step_id: string;
  step_name: string;
  fn: () => Promise<T>;
}) {
  const handle = input.timer.startStep({
    pipeline_stage: "evidence_engine",
    step_id: input.step_id,
    step_name: input.step_name,
  });
  const usageBefore = await readLlmUsageRegistry().catch(() => null);
  try {
    return await input.fn();
  } finally {
    const usageAfter = await readLlmUsageRegistry().catch(() => null);
    input.timer.completeStep(handle, {
      usage_delta: usageBefore && usageAfter ? buildUsageDelta(usageBefore, usageAfter).delta : null,
    });
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function buildRunSummaryBase(input: {
  runId: string;
  caseId: string;
  sourceCandidateRunFolder: string;
  outputFolder: string;
  allowBlocked?: boolean;
}): RunSummary {
  return {
    run_id: input.runId,
    status: "failed",
    case_id: input.caseId,
    source_candidate_run_folder: input.sourceCandidateRunFolder,
    selected_source_count: 0,
    selected_reference_ids: [],
    completed_steps: [],
    access_resolved_count: 0,
    materialized_source_count: 0,
    extracted_text_char_count: 0,
    evidence_unit_count: 0,
    direct_quote_count: 0,
    asset_reference_count: 0,
    section_dossier_count: 0,
    quality_gate_status: null,
    warnings: [],
    blockers: [],
    output_folder: input.outputFolder,
    blocked_by_gate: false,
    blocked_at_step: null,
    allow_blocked: input.allowBlocked ?? false,
    production_valid: !(input.allowBlocked ?? false),
    openai_called: false,
    estimated_or_logged_token_usage: null,
    full_consolidated_evidence_artifact_path: null,
    user_provided_pdf_manifest_path: null,
    user_provided_pdf_count: 0,
    user_provided_pdf_production_review_required: false,
  };
}

function isBlockDecision(value: unknown) {
  return typeof value === "string" && value.toUpperCase() === "BLOCK";
}

export function shouldStopAfterEvidencePlanningGate(input: {
  evidencePlanning: Pick<
    BlueprintLaunchEvidencePlanningResult,
    "decision" | "preMaterializationDecision" | "blockingCategory"
  >;
  allowBlocked: boolean;
}) {
  if (input.allowBlocked || !isBlockDecision(input.evidencePlanning.decision)) {
    return false;
  }

  const preMaterializationDecision = input.evidencePlanning.preMaterializationDecision;

  if (!preMaterializationDecision) {
    return true;
  }

  return (
    preMaterializationDecision === "BLOCK_ACCESS_OR_IDENTITY" ||
    preMaterializationDecision === "NEEDS_SOURCE_REPLACEMENT"
  );
}

function normalizeForRiskMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function hasWrongPdfRisk(input: {
  title: string;
  access: BlueprintLaunchSourceAccessResolutionResult["items"][number] | undefined;
}) {
  const access = input.access;
  if (!access) {
    return false;
  }

  const contentUrl = access.resolvedContentUrl ?? access.finalUrl ?? "";
  const candidateText = access.candidateSummary
    .map((candidate) => `${candidate.label} ${candidate.url}`)
    .join(" ");
  const haystack = normalizeForRiskMatch(
    `${input.title} ${contentUrl} ${candidateText} ${access.warnings.join(" ")}`,
  );
  const looksLikePdf =
    access.kind === "pdf" ||
    /\.pdf($|[?#])/i.test(contentUrl) ||
    haystack.includes("pdf");
  const administrativeDocument =
    /\b(acreditacion|autoevaluacion|resolucion|decreto|reglamento|men|documentos|administrativo)\b/.test(
      haystack,
    );

  return looksLikePdf && administrativeDocument;
}

function readNumberFromRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" ? raw : null;
}

export function buildSourceReplacementReport(input: {
  caseId: string;
  blockedAtStep: BlockedRunStep;
  sourceCandidateRunFolder: string;
  outputFolder: string;
  selectedSourceBundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult;
  evidencePlanning?: BlueprintLaunchEvidencePlanningResult | null;
  candidateSources?: CandidateSourcesArtifact | null;
  sourceSelection?: SourceSelection | null;
}): SourceReplacementReport {
  const accessById = new Map(
    input.sourceAccessResolution.items.map((item) => [item.sourceId, item]),
  );
  const candidateById = new Map(
    (input.candidateSources?.candidates ?? []).map((candidate) => [candidate.candidate_id, candidate]),
  );
  const planById = new Map(
    (input.evidencePlanning?.materializationPlan ?? []).map((item) => [item.sourceId, item]),
  );
  const minSelectedSources =
    readNumberFromRecord(input.sourceSelection?.source_policy, "min_selected_sources") ?? 4;

  const selectedSources = input.selectedSourceBundle.sources.map((source) => {
    const sourceId = source.reference.id;
    const access = accessById.get(sourceId);
    const candidate = candidateById.get(sourceId);
    const plan = planById.get(sourceId);
    const warnings = unique([
      ...(candidate?.warnings ?? []),
      ...(access?.warnings ?? []),
      ...(plan?.validationNotes ?? []),
    ]);
    const riskFlags = unique([
      ...(plan?.riskFlags ?? []),
      source.scoreLabel === "BAJO" || source.scoreLabel === "MINIMO"
        ? "low_relevance_score"
        : "",
      !access?.hasCompletePublicContent ? "missing_or_weak_public_content" : "",
      hasWrongPdfRisk({ title: source.reference.title, access }) ? "wrong_pdf_risk" : "",
      warnings.length > 0 ? "source_warnings_present" : "",
    ]);

    let recommendationEs = "Revisar manualmente antes de mantener esta fuente.";
    if (riskFlags.includes("wrong_pdf_risk")) {
      recommendationEs =
        "Reemplazar o resolver manualmente: el PDF resuelto parece un documento administrativo o no coincide con el articulo.";
    } else if (
      riskFlags.includes("low_relevance_score") &&
      riskFlags.includes("missing_or_weak_public_content")
    ) {
      recommendationEs =
        "Priorizar reemplazo: baja relevancia y contenido publico debil o ausente.";
    } else if (riskFlags.includes("low_relevance_score")) {
      recommendationEs =
        "Buscar una fuente mas alineada al tema o justificar explicitamente por que se mantiene.";
    } else if (riskFlags.includes("missing_or_weak_public_content")) {
      recommendationEs =
        "Buscar una alternativa con texto completo publico antes de continuar.";
    }

    return {
      source_id: sourceId,
      title: source.reference.title,
      year: source.reference.year,
      doi: source.reference.doi,
      relevance_score: source.relevanceScore,
      score_label: source.scoreLabel,
      access_status: access?.status ?? null,
      access_kind: access?.kind ?? null,
      has_complete_public_content: access?.hasCompletePublicContent ?? false,
      resolved_content_url: access?.resolvedContentUrl ?? null,
      source_level_warnings: warnings,
      risk_flags: riskFlags,
      recommendation_es: recommendationEs,
    } satisfies SourceReplacementReportSource;
  });

  const lowRelevanceSourceIds = selectedSources
    .filter((source) =>
      source.risk_flags.includes("low_relevance_score") ||
      (source.relevance_score !== null && source.relevance_score < 40),
    )
    .map((source) => source.source_id);
  const missingOrWeakPublicContentSourceIds = selectedSources
    .filter((source) => source.risk_flags.includes("missing_or_weak_public_content"))
    .map((source) => source.source_id);
  const wrongPdfRiskSourceIds = selectedSources
    .filter((source) => source.risk_flags.includes("wrong_pdf_risk"))
    .map((source) => source.source_id);
  const planningBlockers = input.evidencePlanning && isBlockDecision(input.evidencePlanning.decision)
    ? [input.evidencePlanning.summary]
    : [];
  const sourceSetBlockers = unique([
    ...input.sourceIntakeGate.blockingReasons,
    ...planningBlockers,
  ]);
  const sourceSetWarnings = unique([
    ...input.sourceIntakeGate.warnings,
    ...(input.evidencePlanning?.warnings ?? []),
    ...selectedSources.flatMap((source) => source.source_level_warnings),
  ]);
  const needsMoreSources =
    input.selectedSourceBundle.selectedCount < minSelectedSources ||
    input.sourceIntakeGate.highOrMediumCount < 2 ||
    isBlockDecision(input.sourceIntakeGate.decision) ||
    isBlockDecision(input.evidencePlanning?.decision);

  return {
    case_id: input.caseId,
    generated_at: new Date().toISOString(),
    blocked_at_step: input.blockedAtStep,
    source_candidate_run_folder: input.sourceCandidateRunFolder,
    output_folder: input.outputFolder,
    selected_source_count: input.selectedSourceBundle.selectedCount,
    selected_reference_ids: input.selectedSourceBundle.sources.map((source) => source.reference.id),
    needs_more_sources: needsMoreSources,
    selected_sources: selectedSources,
    low_relevance_source_ids: lowRelevanceSourceIds,
    missing_or_weak_public_content_source_ids: missingOrWeakPublicContentSourceIds,
    wrong_pdf_risk_source_ids: wrongPdfRiskSourceIds,
    source_set_blockers: sourceSetBlockers,
    source_set_warnings: sourceSetWarnings,
    instructions_es: [
      "Volver a la seleccion de fuentes antes de continuar con los pasos 4-6.",
      "Reemplazar fuentes con baja relevancia, contenido publico debil o riesgo de PDF incorrecto.",
      "Si el set sigue siendo pequeno o debil, expandir la busqueda de candidatos y seleccionar nuevas fuentes.",
      "No usar este run bloqueado como handoff de produccion.",
    ],
  };
}

function formatSourceReplacementReportMarkdown(report: SourceReplacementReport) {
  const lines = [
    "# Source Replacement Report",
    "",
    `Case: ${report.case_id}`,
    `Blocked at: ${report.blocked_at_step}`,
    `Selected sources: ${report.selected_source_count}`,
    `Needs more sources: ${report.needs_more_sources ? "yes" : "no"}`,
    "",
    "## Blockers",
    "",
    ...(report.source_set_blockers.length > 0
      ? report.source_set_blockers.map((blocker) => `- ${blocker}`)
      : ["- None recorded."]),
    "",
    "## Warnings",
    "",
    ...(report.source_set_warnings.length > 0
      ? report.source_set_warnings.map((warning) => `- ${warning}`)
      : ["- None recorded."]),
    "",
    "## Selected Sources",
    "",
  ];

  for (const source of report.selected_sources) {
    lines.push(
      `### ${source.source_id}`,
      "",
      `- Title: ${source.title}`,
      `- Year: ${source.year ?? "unknown"}`,
      `- DOI: ${source.doi ?? "none"}`,
      `- Relevance: ${source.relevance_score ?? "unknown"} (${source.score_label ?? "unlabeled"})`,
      `- Access: ${source.access_status ?? "unknown"} / ${source.access_kind ?? "unknown"}`,
      `- Complete public content: ${source.has_complete_public_content ? "yes" : "no"}`,
      `- Resolved URL: ${source.resolved_content_url ?? "none"}`,
      `- Risk flags: ${source.risk_flags.length > 0 ? source.risk_flags.join(", ") : "none"}`,
      `- Recommendation: ${source.recommendation_es}`,
      "",
    );

    if (source.source_level_warnings.length > 0) {
      lines.push("Warnings:", "");
      for (const warning of source.source_level_warnings) {
        lines.push(`- ${warning}`);
      }
      lines.push("");
    }
  }

  lines.push("## Instructions ES", "");
  for (const instruction of report.instructions_es) {
    lines.push(`- ${instruction}`);
  }

  return `${lines.join("\n")}\n`;
}

async function updateUsageSummary(summary: RunSummary, usageBefore: LlmUsageRegistry) {
  const usageAfter = await readLlmUsageRegistry();
  const usageDelta = buildUsageDelta(usageBefore, usageAfter);
  summary.openai_called = usageDelta.delta.calls > 0;
  summary.estimated_or_logged_token_usage = usageDelta;
}

async function writeEvidenceRunAnalytics(input: {
  summary: RunSummary;
  startedAt: string;
  handoff?: ReturnType<typeof adaptCurrentLabAArtifactToEvidenceHandoffV1> | null;
  reducedEvidencePack?: ReducedEvidencePackV1 | null;
  userProvidedPdfManifest?: UserProvidedSourcePdfManifestV1 | null;
  stepSpans?: StepTelemetrySpan[] | null;
}) {
  const completedAt = new Date().toISOString();
  const usageDelta = normalizeUsageDelta(input.summary.estimated_or_logged_token_usage);
  const userProvidedPdfWarnings = buildUserProvidedPdfProductionWarnings(
    input.userProvidedPdfManifest,
  );
  const productionSafety = input.handoff
    ? evaluateBlueprintProductionSafety(
        buildBlueprintEngineInputFromEvidenceHandoffV1(input.handoff, {
          executionMode: "dry_run",
          generationOptions: {
            allow_llm: false,
            require_llm_for_sections: false,
            model_policy: "default",
            use_prompt_cache: true,
            reuse_cached_artifacts: false,
          },
        }),
        {
          signals: {
            diagnostic_only: input.summary.allow_blocked,
            production_valid: input.summary.production_valid,
            degraded_handoff: input.summary.allow_blocked || input.summary.blocked_by_gate,
            allow_blocked_upstream: input.summary.allow_blocked,
            upstream_step_3_decision:
              input.summary.blocked_at_step === "step_3_evidence_planning" ||
              input.summary.allow_blocked
                ? "BLOCK"
                : null,
            materialized_source_count: input.summary.materialized_source_count,
            min_materialized_source_count: 4,
          },
          structural_warnings: userProvidedPdfWarnings,
        },
      )
    : null;
  const runTelemetry = buildRunTelemetryArtifact({
    run_id: input.summary.run_id,
    case_id: input.summary.case_id,
    handoff: input.handoff ?? null,
    pipeline_stage: "evidence_engine",
    started_at: input.startedAt,
    completed_at: completedAt,
    usage_delta: usageDelta,
    reduced_evidence_pack: input.reducedEvidencePack ?? null,
    section_count: input.summary.section_dossier_count,
    production_eligible: productionSafety?.production_eligible ?? false,
    diagnostic_compatible: productionSafety?.diagnostic_compatible ?? input.summary.status !== "failed",
    warning_count: input.summary.warnings.length,
    blocker_count: input.summary.blockers.length,
  });
  const stepTelemetry = input.stepSpans?.length
    ? buildExactStepTelemetry({
        run_id: input.summary.run_id,
        spans: input.stepSpans,
        source_count: input.summary.selected_source_count,
        usable_full_text_source_count: productionSafety?.counts.usable_full_text_sources ?? null,
        evidence_unit_count: input.summary.evidence_unit_count,
        reduced_evidence_unit_count: input.reducedEvidencePack?.reduced_counts.evidence_units ?? null,
        direct_quote_count:
          productionSafety?.counts.true_source_backed_direct_quote_count ?? input.summary.direct_quote_count,
        section_count: input.summary.section_dossier_count,
        production_eligible: productionSafety?.production_eligible ?? false,
        diagnostic_compatible: productionSafety?.diagnostic_compatible ?? input.summary.status !== "failed",
        warning_count: input.summary.warnings.length,
        blocker_count: input.summary.blockers.length,
      })
    : buildCoarseStepTelemetry({
        run_id: input.summary.run_id,
        completed_steps: input.summary.completed_steps,
        pipeline_stage: "evidence_engine",
        started_at: input.startedAt,
        completed_at: completedAt,
        usage_delta: usageDelta,
        source_count: input.summary.selected_source_count,
        usable_full_text_source_count: productionSafety?.counts.usable_full_text_sources ?? null,
        evidence_unit_count: input.summary.evidence_unit_count,
        reduced_evidence_unit_count: input.reducedEvidencePack?.reduced_counts.evidence_units ?? null,
        direct_quote_count:
          productionSafety?.counts.true_source_backed_direct_quote_count ?? input.summary.direct_quote_count,
        section_count: input.summary.section_dossier_count,
        production_eligible: productionSafety?.production_eligible ?? false,
        diagnostic_compatible: productionSafety?.diagnostic_compatible ?? input.summary.status !== "failed",
        warning_count: input.summary.warnings.length,
        blocker_count: input.summary.blockers.length,
      });
  const dashboard = buildQualityDashboard({
    run_id: input.summary.run_id,
    case_id: input.summary.case_id,
    handoff: input.handoff ?? null,
    production_safety: productionSafety,
    reduced_evidence_pack: input.reducedEvidencePack ?? null,
    run_telemetry: runTelemetry,
    warnings: input.summary.warnings,
    blockers: input.summary.blockers,
  });

  await writeJson(path.join(input.summary.output_folder, "run-telemetry.json"), runTelemetry);
  await writeJson(path.join(input.summary.output_folder, "step-telemetry.json"), stepTelemetry);
  await writeJson(path.join(input.summary.output_folder, "quality-dashboard.json"), dashboard);
  await writeFile(
    path.join(input.summary.output_folder, "production-readiness-report.md"),
    renderProductionReadinessReport(dashboard),
    "utf8",
  );
}

export async function writeBlockedGateArtifacts(input: {
  summary: RunSummary;
  blockedAtStep: BlockedRunStep;
  selectedSourceBundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult;
  evidencePlanning?: BlueprintLaunchEvidencePlanningResult | null;
  candidateSources?: CandidateSourcesArtifact | null;
  sourceSelection?: SourceSelection | null;
  usageBefore?: LlmUsageRegistry | null;
  startedAt?: string | null;
  stepSpans?: StepTelemetrySpan[] | null;
}) {
  const summary = input.summary;
  const report = buildSourceReplacementReport({
    caseId: summary.case_id,
    blockedAtStep: input.blockedAtStep,
    sourceCandidateRunFolder: summary.source_candidate_run_folder,
    outputFolder: summary.output_folder,
    selectedSourceBundle: input.selectedSourceBundle,
    sourceAccessResolution: input.sourceAccessResolution,
    sourceIntakeGate: input.sourceIntakeGate,
    evidencePlanning: input.evidencePlanning,
    candidateSources: input.candidateSources,
    sourceSelection: input.sourceSelection,
  });

  summary.status = "blocked";
  summary.blocked_by_gate = true;
  summary.blocked_at_step = input.blockedAtStep;
  summary.allow_blocked = false;
  summary.production_valid = false;
  summary.quality_gate_status = "blocked";
  const blockedGateMessage =
    input.blockedAtStep === "step_2_source_access_resolution"
      ? "Step 2 source intake gate returned BLOCK."
      : input.blockedAtStep === "step_3_evidence_planning"
        ? "Step 3 evidence planning returned BLOCK."
        : input.blockedAtStep === "step_4a_limited_source_inspection"
          ? "Step 4A limited source inspection stopped before full extraction."
          : input.blockedAtStep === "step_4b_pdf_relevance_review"
            ? "Step 4B PDF relevance review stopped before source sufficiency."
            : "Step 4C source sufficiency stopped before full extraction.";
  summary.blockers = unique([
    ...summary.blockers,
    ...report.source_set_blockers,
    blockedGateMessage,
  ]);
  summary.warnings = unique([
    ...summary.warnings,
    ...report.source_set_warnings,
  ]);

  if (input.usageBefore) {
    await updateUsageSummary(summary, input.usageBefore);
  }

  await writeJson(path.join(summary.output_folder, "source-replacement-report.json"), report);
  await writeFile(
    path.join(summary.output_folder, "source-replacement-report.md"),
    formatSourceReplacementReportMarkdown(report),
    "utf8",
  );
  await writeJson(path.join(summary.output_folder, "run-summary.json"), summary);
  if (input.startedAt) {
    await writeEvidenceRunAnalytics({
      summary,
      startedAt: input.startedAt,
      handoff: null,
      reducedEvidencePack: null,
      stepSpans: input.stepSpans,
    });
  }

  return report;
}

function markAllowBlockedDiagnostic(summary: RunSummary) {
  summary.allow_blocked = true;
  summary.production_valid = false;
  summary.warning =
    "This run continued despite upstream BLOCK and should be used only for diagnostics.";
  summary.warnings = unique([...summary.warnings, summary.warning]);
}

async function main() {
  loadLocalEnv();

  const runStartedAt = new Date().toISOString();
  const {
    caseId,
    runFolder,
    allowBlocked,
    userProvidedPdfManifest: userProvidedPdfManifestPath,
    rapidDeepResearchFallback,
  } = parseArgs();
  const sourceCandidateRunFolder = path.resolve(
    runFolder ?? (await findLatestRunFolderWithSelection(caseId)),
  );
  const userProvidedPdfManifest = userProvidedPdfManifestPath
    ? loadUserProvidedSourcePdfManifest(path.resolve(userProvidedPdfManifestPath))
    : null;
  const runId = `evidence-selected-sources-${caseId}-${buildTimestampToken()}`;
  const outputFolder = path.join(
    SELECTED_SOURCE_RUN_ROOT,
    caseId,
    buildTimestampToken(),
  );
  const summary = buildRunSummaryBase({
    runId,
    caseId,
    sourceCandidateRunFolder,
    outputFolder,
    allowBlocked,
  });

  if (allowBlocked) {
    markAllowBlockedDiagnostic(summary);
  }

  if (userProvidedPdfManifest) {
    const warnings = buildUserProvidedPdfProductionWarnings(userProvidedPdfManifest);
    summary.user_provided_pdf_manifest_path = path.resolve(userProvidedPdfManifestPath ?? "");
    summary.user_provided_pdf_count = userProvidedPdfManifest.entries.length;
    summary.user_provided_pdf_production_review_required = warnings.length > 0;
    summary.production_valid = false;
    summary.warnings = unique([...summary.warnings, ...warnings]);
  }

  await mkdir(outputFolder, { recursive: true });

  try {
    const intakeFixturePath = path.join(sourceCandidateRunFolder, "intake-fixture.json");
    const normalizedIntakePath = path.join(sourceCandidateRunFolder, "normalized-intake-context.json");
    const candidateSourcesPath = path.join(sourceCandidateRunFolder, "candidate-sources.json");
    const sourceSelectionPath = path.join(sourceCandidateRunFolder, "source-selection.json");

    const [intakeFixture, normalizedIntake, candidateSources, sourceSelection] =
      await Promise.all([
        readJson<IntakeFixture>(intakeFixturePath),
        readJson<NormalizedIntakeContext>(normalizedIntakePath),
        readJson<CandidateSourcesArtifact>(candidateSourcesPath),
        readJson<SourceSelection>(sourceSelectionPath),
      ]);

    await copyIfExists(intakeFixturePath, path.join(outputFolder, "intake-fixture.json"));
    await copyIfExists(sourceSelectionPath, path.join(outputFolder, "source-selection.json"));
    if (userProvidedPdfManifest) {
      await writeJson(
        path.join(outputFolder, "user-provided-source-pdfs.json"),
        userProvidedPdfManifest,
      );
    }

    if (sourceSelection.selection_status !== "completed") {
      throw new Error(`source-selection.json no esta completado: ${sourceSelection.selection_status}.`);
    }

    const selectedReferenceIds = sourceSelection.selected_reference_ids ?? [];
    if (selectedReferenceIds.length === 0) {
      throw new Error("source-selection.json no contiene selected_reference_ids.");
    }

    const candidates = candidateSources.candidates ?? [];
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
    const missingIds = selectedReferenceIds.filter((id) => !candidateById.has(id));

    if (missingIds.length > 0) {
      throw new Error(`Hay fuentes seleccionadas que no existen en candidate-sources.json: ${missingIds.join(", ")}.`);
    }

    const intake = ensureIntake(normalizedIntake.intake_normalized ?? intakeFixture.intake);
    const projectContext = intakeFixture.project_context;
    const project: BlueprintLaunchProjectData = {
      title: projectContext.title,
      degreeLevel: projectContext.degree_level,
      university: projectContext.university,
      program: projectContext.program,
      knowledgeAreaLabel:
        normalizedIntake.lab_a_search_knowledge_area_label ??
        projectContext.knowledge_area_label,
      templateKey: projectContext.template_key,
      country: projectContext.country,
      language: projectContext.language,
      status: resolveProjectStatusFromIntake(intake),
      mode: "BACKEND_SELECTED_SOURCES_STEPS_2_6",
    };
    const projectSnapshot = buildBlueprintLaunchProjectSnapshot(project);
    const intakeImprovementResult: BlueprintLaunchIntakeImprovementResult = {
      improvedAt: normalizedIntake.normalized_at ?? new Date().toISOString(),
      llmStatus: "fallback",
      llmPrompts: [],
      detectedMixedLanguageFields: [],
      preservedTerms: [],
      changeNotes: [
        "Contexto normalizado de forma deterministica desde el fixture seco y el artifact de busqueda.",
      ],
      canonicalTopicEs: normalizedIntake.canonical_topic_es ?? intake.topic,
      problemCoreEs:
        normalizedIntake.problem_core_es ??
        asString(intake.problemContext).replace(/\s+/g, " ").slice(0, 240),
      methodPreferenceEs:
        normalizedIntake.method_preference_es ?? (asString(intake.preferredMethodology) || null),
      targetScopeEs: normalizedIntake.target_scope_es ?? (asString(intake.targetPopulation) || null),
      retrievalBriefEn:
        normalizedIntake.lab_a_search_knowledge_area_label ??
        "Selected-source backend continuation from candidate evidence search.",
      intakeImprovedEs: intake,
    };
    const projectGlobalContext = buildBlueprintLaunchProjectGlobalContext({
      projectSnapshot,
      intakeOriginal: ensureIntake(normalizedIntake.intake_original ?? intakeFixture.intake),
      intakeImprovementResult,
    });
    const savedIntake: BlueprintLaunchSavedIntakeSnapshot = {
      savedAt: new Date().toISOString(),
      status: resolveProjectStatusFromIntake(intake),
      intake,
      derivedSearchQuery: candidateSources.search_snapshot_summary?.search_query ?? null,
      projectContext: {
        knowledgeAreaLabel: project.knowledgeAreaLabel,
      },
    };
    const savedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot = {
      savedAt: new Date().toISOString(),
      status: resolveProjectStatusFromIntake(projectGlobalContext.intakeOriginal),
      intake: projectGlobalContext.intakeOriginal,
      projectContext: {
        knowledgeAreaLabel: project.knowledgeAreaLabel,
      },
    };
    const searchQuery = candidateSources.search_snapshot_summary?.search_query ?? savedIntake.intake.topic;
    const references = candidates.map((candidate, index) =>
      buildReferenceListItem({ candidate, index, searchQuery }),
    );
    const searchSnapshot: BlueprintLaunchSearchSnapshot = {
      savedAt: candidateSources.generated_at ?? new Date().toISOString(),
      searchQuery,
      attemptedQueries: candidateSources.search_snapshot_summary?.attempted_queries ?? [],
      totalResults: candidateSources.search_snapshot_summary?.total_results ?? references.length,
      metadata: candidateSources.search_snapshot_summary?.metadata ?? null,
      references: applySelectionState(references, selectedReferenceIds),
    };
    const selectedSourceBundle = buildSelectedSourceBundle({
      outputFolder,
      searchSnapshot,
      savedIntake,
    });

    summary.selected_source_count = selectedSourceBundle.selectedCount;
    summary.selected_reference_ids = selectedReferenceIds;

    if (selectedSourceBundle.selectedCount === 0) {
      throw new Error("No se pudo construir selected-source-bundle.json desde source-selection.json.");
    }

    await writeJson(path.join(outputFolder, "selected-source-bundle.json"), selectedSourceBundle);

    const usageBefore = await readLlmUsageRegistry();
    const stepTimer = new StepTimer();

    console.log(`[${new Date().toISOString()}] Step 2: resolving selected source access`);
    const { sourceAccessResolution, sourceIntakeGate } = await measureEvidenceStep({
      timer: stepTimer,
      step_id: "step_2_source_access_resolution",
      step_name: "Step 2 source access resolution",
      fn: async () => {
        const resolved = await resolveBlueprintLaunchSourceAccess({
          bundle: selectedSourceBundle,
          projectGlobalContext,
        });
        const gate = evaluateBlueprintLaunchSourceIntakeGate(
          searchSnapshot.references,
          resolved,
        );
        await writeJson(
          path.join(outputFolder, "step-2-access-resolution.json"),
          {
            source_access_resolution: resolved,
            source_intake_gate: gate,
          },
        );
        summary.completed_steps.push("step_2_source_access_resolution");
        summary.access_resolved_count = resolved.items.filter(
          (item) => item.status !== "unresolved",
        ).length;
        return { sourceAccessResolution: resolved, sourceIntakeGate: gate };
      },
    });

    if (isBlockDecision(sourceIntakeGate.decision) && !allowBlocked) {
      console.log(
        `[${new Date().toISOString()}] Step 2 gate BLOCK; stopping before Step 3. Use --allow-blocked only for diagnostics.`,
      );
      const report = await writeBlockedGateArtifacts({
        summary,
        blockedAtStep: "step_2_source_access_resolution",
        selectedSourceBundle,
        sourceAccessResolution,
        sourceIntakeGate,
        candidateSources,
        sourceSelection,
        usageBefore,
        startedAt: runStartedAt,
        stepSpans: stepTimer.getSpans(),
      });

      console.log(
        JSON.stringify(
          {
            status: summary.status,
            case_id: summary.case_id,
            output_folder: summary.output_folder,
            blocked_at_step: summary.blocked_at_step,
            selected_source_count: summary.selected_source_count,
            selected_sources_needing_replacement: unique([
              ...report.low_relevance_source_ids,
              ...report.missing_or_weak_public_content_source_ids,
              ...report.wrong_pdf_risk_source_ids,
            ]),
            prevented_steps: [
              "step_3_evidence_planning",
              "step_4_content_materialization",
              "step_5_source_signal_extraction",
              "step_6_consolidated_evidence",
            ],
            openai_called: summary.openai_called,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (isBlockDecision(sourceIntakeGate.decision) && allowBlocked) {
      markAllowBlockedDiagnostic(summary);
    }

    const stateForStep3: BlueprintLaunchLocalState = {
      projectSnapshot,
      savedIntakeOriginal,
      intakeImprovementResult,
      projectGlobalContext,
      savedIntake,
      searchSnapshot,
      selectedSourcesBundle: selectedSourceBundle,
      sourceAccessResolution,
      sourceIntakeGate,
      evidenceCompletion: null,
      evidencePlanning: null,
      contentMaterialization: null,
      sourceSignalExtraction: null,
      evidencePacksArtifact: null,
      consolidatedEvidenceArtifact: null,
    };

    console.log(`[${new Date().toISOString()}] Step 3: planning evidence`);
    const evidencePlanning = await measureEvidenceStep({
      timer: stepTimer,
      step_id: "step_3_evidence_planning",
      step_name: "Step 3 evidence planning",
      fn: async () => planBlueprintLaunchEvidence({
        savedIntake,
        projectGlobalContext,
        bundle: selectedSourceBundle,
        sourceAccessResolution,
        sourceIntakeGate,
        state: stateForStep3,
      }),
    });
    await writeJson(path.join(outputFolder, "step-3-evidence-planning.json"), evidencePlanning);
    summary.completed_steps.push("step_3_evidence_planning");

    if (shouldStopAfterEvidencePlanningGate({ evidencePlanning, allowBlocked })) {
      console.log(
        `[${new Date().toISOString()}] Step 3 pre-materialization gate ${evidencePlanning.preMaterializationDecision ?? "BLOCK"}; stopping before Step 4. Use --allow-blocked only for diagnostics.`,
      );
      const report = await writeBlockedGateArtifacts({
        summary,
        blockedAtStep: "step_3_evidence_planning",
        selectedSourceBundle,
        sourceAccessResolution,
        sourceIntakeGate,
        evidencePlanning,
        candidateSources,
        sourceSelection,
        usageBefore,
        startedAt: runStartedAt,
        stepSpans: stepTimer.getSpans(),
      });

      console.log(
        JSON.stringify(
          {
            status: summary.status,
            case_id: summary.case_id,
            output_folder: summary.output_folder,
            blocked_at_step: summary.blocked_at_step,
            selected_source_count: summary.selected_source_count,
            selected_sources_needing_replacement: unique([
              ...report.low_relevance_source_ids,
              ...report.missing_or_weak_public_content_source_ids,
              ...report.wrong_pdf_risk_source_ids,
            ]),
            prevented_steps: [
              "step_4_content_materialization",
              "step_5_source_signal_extraction",
              "step_6_consolidated_evidence",
            ],
            openai_called: summary.openai_called,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (isBlockDecision(evidencePlanning.decision) && allowBlocked) {
      markAllowBlockedDiagnostic(summary);
    }

    if (evidencePlanning.preMaterializationDecision === "PROCEED_TO_LIMITED_INSPECTION") {
      console.log(`[${new Date().toISOString()}] Step 4A: limited source inspection`);
      const limitedInspection = await measureEvidenceStep({
        timer: stepTimer,
        step_id: "step_4a_limited_source_inspection",
        step_name: "Step 4A limited source inspection",
        fn: async () => inspectBlueprintLaunchSourcesLimited({
          bundle: selectedSourceBundle,
          sourceAccessResolution,
          evidencePlanning,
          userProvidedPdfManifest,
        }),
      });
      await writeJson(
        path.join(outputFolder, "step-4a-limited-source-inspection.json"),
        limitedInspection,
      );
      await writeFile(
        path.join(outputFolder, "limited-inspection-summary.md"),
        renderLimitedInspectionReport(limitedInspection),
        "utf8",
      );
      summary.completed_steps.push("step_4a_limited_source_inspection");
      summary.warnings = unique([...summary.warnings, ...limitedInspection.warnings]);

      console.log(`[${new Date().toISOString()}] Step 4B: PDF high-level relevance review`);
      const pdfRelevanceReview = await measureEvidenceStep({
        timer: stepTimer,
        step_id: "step_4b_pdf_relevance_review",
        step_name: "Step 4B PDF high-level relevance review",
        fn: async () => reviewPdfRelevanceFromLimitedInspection({
          caseId,
          intake: savedIntake.intake as unknown as Record<string, unknown>,
          knowledgeAreaLabel: project.knowledgeAreaLabel,
          limitedInspection,
          selectedSourceBundle,
        }),
      });
      await writeJson(
        path.join(outputFolder, "step-4b-pdf-relevance-review.json"),
        pdfRelevanceReview,
      );
      await writeFile(
        path.join(outputFolder, "step-4b-pdf-relevance-review.md"),
        renderPdfRelevanceReviewReport(pdfRelevanceReview),
        "utf8",
      );
      summary.completed_steps.push("step_4b_pdf_relevance_review");
      summary.warnings = unique([...summary.warnings, ...pdfRelevanceReview.warnings]);
      summary.blockers = unique([...summary.blockers, ...pdfRelevanceReview.blockers]);

      const postInspectionSufficiency = buildPostInspectionSourceSufficiencyReport({
        case_id: caseId,
        selected_source_count: selectedSourceBundle.selectedCount,
        evidencePlanning,
        limitedInspection,
        pdfRelevanceReview,
        minUsableFullTextSources:
          (intakeFixture as { source_policy?: { min_selected_sources?: number } }).source_policy
            ?.min_selected_sources ?? 3,
      });
      await writeJson(
        path.join(outputFolder, "post-inspection-source-sufficiency.json"),
        postInspectionSufficiency,
      );
      await writeJson(
        path.join(outputFolder, "step-4c-source-sufficiency.json"),
        postInspectionSufficiency,
      );
      await writeFile(
        path.join(outputFolder, "post-inspection-source-sufficiency.md"),
        renderPostInspectionSourceSufficiencyReport(postInspectionSufficiency),
        "utf8",
      );
      summary.completed_steps.push("step_4c_source_sufficiency");
      summary.warnings = unique([...summary.warnings, ...postInspectionSufficiency.warnings]);

      if (shouldBuildDeepResearchLightArtifacts({ postInspectionSufficiency })) {
        const referenceCandidatePath = path.join(
          outputFolder,
          "deep-research-light-reference-candidates.json",
        );
        const deepResearchLight = buildDeepResearchLightArtifacts({
          caseId,
          intake: savedIntake.intake as unknown as Record<string, unknown>,
          bundle: selectedSourceBundle,
          evidencePlanning,
          limitedInspection,
          postInspectionSufficiency,
          referenceCandidateOutputPath: referenceCandidatePath,
        });
        await writeJson(
          path.join(outputFolder, "deep-research-light-gap-analysis.json"),
          deepResearchLight.gapAnalysis,
        );
        await writeJson(
          path.join(outputFolder, "deep-research-light-search-plan.json"),
          deepResearchLight.searchPlan,
        );
        await writeJson(referenceCandidatePath, deepResearchLight.referenceCandidates);
        await writeFile(
          path.join(outputFolder, "deep-research-light-report.md"),
          renderDeepResearchLightReport(deepResearchLight),
          "utf8",
        );
        summary.warnings = unique([
          ...summary.warnings,
          "Deep Research light fallback artifacts were prepared for source selection; no external search was executed by this runner.",
        ]);

        if (rapidDeepResearchFallback) {
          console.log(`[${new Date().toISOString()}] Step 4D: rapid Deep Research fallback`);
          const rapidRequest = buildRapidDeepResearchRequest({
            caseId,
            bundle: selectedSourceBundle,
            limitedInspection,
            postInspectionSufficiency,
            deepResearchLight,
          });
          const rapidFallback = await measureEvidenceStep({
            timer: stepTimer,
            step_id: "step_4d_rapid_deep_research_fallback",
            step_name: "Step 4D rapid Deep Research fallback",
            fn: async () =>
              runRapidDeepResearchFallback({
                request: rapidRequest,
                selectedSources: selectedSourceBundle.sources,
              }),
          });
          await writeJson(
            path.join(outputFolder, "rapid-deep-research-request.json"),
            rapidFallback.request,
          );
          await writeJson(
            path.join(outputFolder, "rapid-deep-research-result.json"),
            rapidFallback.result,
          );
          await writeJson(
            path.join(outputFolder, "rapid-deep-research-candidate-sources.json"),
            rapidFallback.candidateSources,
          );
          await writeJson(
            path.join(outputFolder, "deep-research-evidence-candidates.json"),
            rapidFallback.evidenceCandidates,
          );
          await writeJson(
            path.join(outputFolder, "rapid-deep-research-validation-report.json"),
            rapidFallback.validationReport,
          );
          await writeFile(
            path.join(outputFolder, "rapid-deep-research-report.md"),
            renderRapidDeepResearchReport(rapidFallback),
            "utf8",
          );
          summary.completed_steps.push("step_4d_rapid_deep_research_fallback");
          summary.warnings = unique([
            ...summary.warnings,
            ...rapidFallback.result.warnings,
            `Rapid Deep Research fallback status: ${rapidFallback.result.status}.`,
          ]);
        }
      }

      if (
        shouldStopAfterPostInspectionSufficiency({
          report: postInspectionSufficiency,
          allowBlocked,
        })
      ) {
        summary.blockers = unique([
          ...summary.blockers,
          ...postInspectionSufficiency.blockers,
          ...postInspectionSufficiency.reasons,
          `Step 4C source sufficiency decision: ${postInspectionSufficiency.decision}.`,
        ]);
        console.log(
          `[${new Date().toISOString()}] Step 4C gate ${postInspectionSufficiency.decision}; stopping before full Step 4/5/6.`,
        );
        const report = await writeBlockedGateArtifacts({
          summary,
          blockedAtStep: "step_4c_source_sufficiency",
          selectedSourceBundle,
          sourceAccessResolution,
          sourceIntakeGate,
          evidencePlanning,
          candidateSources,
          sourceSelection,
          usageBefore,
          startedAt: runStartedAt,
          stepSpans: stepTimer.getSpans(),
        });

        console.log(
          JSON.stringify(
            {
              status: summary.status,
              case_id: summary.case_id,
              output_folder: summary.output_folder,
              blocked_at_step: summary.blocked_at_step,
              post_inspection_decision: limitedInspection.postInspectionDecision,
              post_inspection_sufficiency_decision: postInspectionSufficiency.decision,
              selected_source_count: summary.selected_source_count,
              selected_sources_needing_replacement: unique([
                ...report.low_relevance_source_ids,
                ...report.missing_or_weak_public_content_source_ids,
                ...report.wrong_pdf_risk_source_ids,
                ...limitedInspection.sourceIdsNeedingReplacement,
                ...postInspectionSufficiency.source_ids_needing_replacement,
              ]),
              prevented_steps: [
                "step_4_content_materialization",
                "step_5_source_signal_extraction",
                "step_6_consolidated_evidence",
              ],
              openai_called: summary.openai_called,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (
        !["READY_FOR_FULL_EXTRACTION", "READY_WITH_WARNINGS"].includes(postInspectionSufficiency.decision) &&
        allowBlocked
      ) {
        markAllowBlockedDiagnostic(summary);
        summary.warnings = unique([
          ...summary.warnings,
          `Run continued despite Step 4C source sufficiency decision ${postInspectionSufficiency.decision}.`,
        ]);
      }
    }

    console.log(`[${new Date().toISOString()}] Step 4: materializing source content`);
    const contentMaterialization = await measureEvidenceStep({
      timer: stepTimer,
      step_id: "step_4_content_materialization",
      step_name: "Step 4 content materialization",
      fn: async () => materializeBlueprintLaunchSourceContent({
        bundle: selectedSourceBundle,
        sourceAccessResolution,
        evidencePlanning,
        userProvidedPdfManifest,
      }),
    });
    await writeJson(
      path.join(outputFolder, "step-4-materialization-manifest.json"),
      contentMaterialization,
    );
    summary.completed_steps.push("step_4_content_materialization");
    summary.materialized_source_count = contentMaterialization.materializedCount;

    console.log(`[${new Date().toISOString()}] Step 5: extracting source signals`);
    const { evidencePacksArtifact, sourceSignalExtraction } =
      await measureEvidenceStep({
        timer: stepTimer,
        step_id: "step_5_source_signal_extraction",
        step_name: "Step 5 source signal extraction",
        fn: async () => extractBlueprintLaunchSourceSignals({
          projectTitle: project.title,
          savedIntake,
          bundle: selectedSourceBundle,
          sourceAccessResolution,
          contentMaterialization,
          evidenceCompletion: null,
        }),
      });
    await writeJson(path.join(outputFolder, "step-5-signal-extraction-summary.json"), {
      source_signal_extraction: sourceSignalExtraction,
      evidence_packs_artifact: evidencePacksArtifact,
    });
    summary.completed_steps.push("step_5_source_signal_extraction");
    summary.extracted_text_char_count = sourceSignalExtraction.totalTextCharCount;

    console.log(`[${new Date().toISOString()}] Step 6: consolidating evidence`);
    const consolidatedEvidenceArtifact = await measureEvidenceStep({
      timer: stepTimer,
      step_id: "step_6_consolidated_evidence",
      step_name: "Step 6 consolidated evidence",
      fn: async () => consolidateBlueprintLaunchEvidence({
        projectTitle: project.title,
        savedIntake,
        sourceSignalExtraction,
        evidencePacksArtifact,
      }),
    });
    const step6OutputPath = path.join(outputFolder, "step-6-consolidated-evidence.json");
    await writeJson(step6OutputPath, consolidatedEvidenceArtifact);
    summary.completed_steps.push("step_6_consolidated_evidence");
    summary.full_consolidated_evidence_artifact_path =
      consolidatedEvidenceArtifact.artifact_path ?? null;

    if (consolidatedEvidenceArtifact.artifact_path) {
      await copyIfExists(
        consolidatedEvidenceArtifact.artifact_path,
        path.join(outputFolder, "step-6-full-consolidated-evidence-copy.json"),
      );
    }

    const rawConsolidatedJson = `${JSON.stringify(consolidatedEvidenceArtifact, null, 2)}\n`;
    const handoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(
      consolidatedEvidenceArtifact as unknown as CurrentLabAConsolidatedEvidenceArtifact,
      {
        sourceArtifactPath: step6OutputPath,
        rawJson: rawConsolidatedJson,
      },
    );
    const handoffValidation = evidenceEngineHandoffV1Schema.safeParse(handoff);

    if (!handoffValidation.success) {
      summary.blockers.push("EvidenceEngineHandoffV1 validation failed.");
      throw new Error(handoffValidation.error.issues.map((issue) => issue.message).join("; "));
    }

    await writeJson(path.join(outputFolder, "evidence-handoff-v1.json"), handoff);
    const reducedEvidencePack = buildReducedEvidencePackFromHandoff(handoff);
    await writeJson(path.join(outputFolder, "reduced-evidence-pack.json"), reducedEvidencePack);
    const productionSafetyForReports = evaluateBlueprintProductionSafety(
      buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, {
        blueprintRunId: `blueprint-diagnostic-${summary.run_id}`,
      }),
      {
        signals: {
          diagnostic_only: summary.allow_blocked,
          production_valid: summary.production_valid,
          degraded_handoff: summary.allow_blocked || summary.blocked_by_gate,
          allow_blocked_upstream: summary.allow_blocked,
          upstream_step_3_decision:
            summary.blocked_at_step === "step_3_evidence_planning" || summary.allow_blocked
              ? "BLOCK"
              : null,
          materialized_source_count: summary.materialized_source_count,
          min_materialized_source_count: 4,
        },
        structural_warnings: buildUserProvidedPdfProductionWarnings(userProvidedPdfManifest),
      },
    );
    const secondaryReferenceRecoveryQueue = buildSecondaryReferenceRecoveryQueue({
      case_id: caseId,
      handoff,
      evidencePacksArtifact,
      reducedEvidencePack,
    });
    await writeJson(
      path.join(outputFolder, "secondary-reference-recovery-queue.json"),
      secondaryReferenceRecoveryQueue,
    );
    await writeFile(
      path.join(outputFolder, "secondary-reference-recovery-queue-report.md"),
      `${renderSecondaryReferenceRecoveryQueueReport(secondaryReferenceRecoveryQueue)}\n`,
      "utf8",
    );
    const sourceSufficiencyReport = buildSourceSufficiencyReport({
      case_id: caseId,
      handoff,
      productionSafety: productionSafetyForReports,
      secondaryReferenceQueue: secondaryReferenceRecoveryQueue,
      minUsableFullTextSources:
        (intakeFixture as { source_policy?: { min_selected_sources?: number } }).source_policy
          ?.min_selected_sources ?? 4,
      userProvidedPdfProductionReviewRequired:
        Boolean(userProvidedPdfManifest) &&
        buildUserProvidedPdfProductionWarnings(userProvidedPdfManifest).length > 0,
    });
    await writeJson(path.join(outputFolder, "source-sufficiency-recommendations.json"), sourceSufficiencyReport);
    await writeFile(
      path.join(outputFolder, "source-sufficiency-recommendations.md"),
      `${renderSourceSufficiencyReport(sourceSufficiencyReport)}\n`,
      "utf8",
    );

    const evidenceUnits = consolidatedEvidenceArtifact.evidence_units ?? [];
    summary.evidence_unit_count = evidenceUnits.length;
    summary.direct_quote_count = evidenceUnits.filter(
      (unit) => unit.citation_eligibility === "direct_quote",
    ).length;
    summary.asset_reference_count = evidenceUnits.filter(
      (unit) => unit.citation_eligibility === "asset_reference",
    ).length;
    summary.section_dossier_count = consolidatedEvidenceArtifact.section_dossiers?.length ?? 0;
    summary.quality_gate_status = consolidatedEvidenceArtifact.quality_gate?.status ?? null;

    const usageAfter = await readLlmUsageRegistry();
    const usageDelta = buildUsageDelta(usageBefore, usageAfter);
    summary.openai_called = usageDelta.delta.calls > 0;
    summary.estimated_or_logged_token_usage = usageDelta;

    summary.warnings = unique([
      ...summary.warnings,
      ...sourceAccessResolution.items.flatMap((item) => item.warnings),
      ...sourceIntakeGate.warnings,
      ...evidencePlanning.warnings,
      ...contentMaterialization.items.flatMap((item) => item.warnings),
      ...sourceSignalExtraction.warnings,
      ...consolidatedEvidenceArtifact.warnings,
      ...(consolidatedEvidenceArtifact.quality_gate?.traceability_warnings ?? []),
    ]);
    summary.blockers = unique([
      ...summary.blockers,
      ...sourceIntakeGate.blockingReasons,
      ...(consolidatedEvidenceArtifact.quality_gate?.checks ?? [])
        .filter((check) => check.status === "fail")
        .map((check) => `${check.check_key}: ${check.message}`),
    ]);
    summary.status = "completed";

    await writeEvidenceRunAnalytics({
      summary,
      startedAt: runStartedAt,
      handoff,
      reducedEvidencePack,
      userProvidedPdfManifest,
      stepSpans: stepTimer.getSpans(),
    });
    await writeJson(path.join(outputFolder, "run-summary.json"), summary);

    console.log(
      JSON.stringify(
        {
          status: summary.status,
          case_id: summary.case_id,
          output_folder: summary.output_folder,
          selected_source_count: summary.selected_source_count,
          completed_steps: summary.completed_steps,
          quality_gate_status: summary.quality_gate_status,
          evidence_unit_count: summary.evidence_unit_count,
          direct_quote_count: summary.direct_quote_count,
          asset_reference_count: summary.asset_reference_count,
          warnings_count: summary.warnings.length,
          blockers_count: summary.blockers.length,
          openai_called: summary.openai_called,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    summary.status = "failed";
    summary.error = error instanceof Error ? error.message : "Unknown error.";
    summary.blockers = unique([...summary.blockers, summary.error]);
    await writeJson(path.join(outputFolder, "run-summary.json"), summary);
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}

function isDirectCliRun() {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isDirectCliRun()) {
  void main();
}
