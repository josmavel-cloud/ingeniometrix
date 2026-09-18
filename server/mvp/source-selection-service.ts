import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Prisma, Provider } from "@prisma/client";

import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import { extractAccessSignals } from "@/server/retrieval/reference-access";
import { getLatestProjectReferenceSearchSnapshot, type ProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";
import { resolveReferenceSourceLanguage } from "@/server/retrieval/reference-translation-service";

export const MVP_STEP3_KEY = "step_3_source_selection_batch_gate";
export const MVP_STEP3_PROMPT_VERSION = "deterministic-source-selection-v1";
export const MVP_STEP4_KEY = "step_4_additional_sources";
export const MVP_STEP4_PROMPT_VERSION = MVP_STEP3_PROMPT_VERSION;

const STEP3_ARTIFACT_TYPE = "mvp_step3_source_selection_batch_gate";
const STEP4_ARTIFACT_TYPE = "mvp_step4_additional_sources";

type Step3Action = "prepare_first_batch" | "request_more" | "apply_selection";
type SourceSelectionStepKey = typeof MVP_STEP3_KEY | typeof MVP_STEP4_KEY;

type Step2SelectionSnapshot = {
  step_run_id: string | null;
  selected_option_id: string;
  selected_strategy: string | null;
  first_batch_candidate_ids: string[];
  selected_at: string | null;
};

export type MvpStep3Candidate = {
  project_reference_id: string;
  reference_id: string;
  title: string;
  abstract_excerpt: string | null;
  doi: string | null;
  year: number | null;
  venue: string | null;
  work_type: string | null;
  landing_page_url: string | null;
  citation_count: number | null;
  relevance_score: number;
  score_breakdown: ProjectReferenceSearchSnapshot["references"][number]["scoreBreakdown"] | null;
  selection_score_100: number;
  score_label: "alta_prioridad" | "prioridad_media" | "revision_manual";
  score_reasons: string[];
  warnings: string[];
  source_language: string | null;
  query_language: string | null;
  discovery_layer: "step2_first_batch" | "ranked_candidate_pool" | "multilingual_expansion";
  abstract_available: boolean;
  pdf_url: string | null;
  pdf_likelihood: "high" | "medium" | "low";
  open_access_signal: boolean;
  citation_status: "candidate_not_inspected";
  selected: boolean;
  selected_order: number | null;
};

export type MvpStep3Result = {
  artifact_type: typeof STEP3_ARTIFACT_TYPE | typeof STEP4_ARTIFACT_TYPE;
  artifact_version: "v1";
  step_key: SourceSelectionStepKey;
  prompt_version: typeof MVP_STEP3_PROMPT_VERSION;
  project_id: string;
  run_id: string;
  step_run_id: string;
  action: Step3Action;
  status: "completed" | "partially_completed" | "failed";
  artifact_dir: string;
  artifact_manifest_path: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  source: "deterministic" | "discovery";
  provider: Provider;
  model: null;
  step2_selection: Step2SelectionSnapshot;
  search_layers: Array<{
    layer: "base_step2_seed" | "ranked_candidate_pool" | "multilingual_expansion";
    trigger: "step2_selection" | "ranking_backfill" | "user_requested_more";
    languages: string[];
    candidate_ids: string[];
  }>;
  batches: {
    first: {
      visible_candidate_count: number;
      candidates: MvpStep3Candidate[];
    };
    second: {
      available: boolean;
      visible_candidate_count: number;
      candidates: MvpStep3Candidate[];
    };
    expanded_pool_count: number;
  };
  frontend_cable: {
    intervention_point:
      | "after_step_3_first_batch"
      | "after_step_3_more_sources"
      | "after_step_3_selection"
      | "after_step_4_more_sources"
      | "after_step_4_selection";
    action: "choose_sources_or_request_more" | "choose_sources_from_expanded_pool" | "choose_final_sources" | "run_source_inspection" | "run_source_health";
    min_selected_sources: number;
    max_selected_sources: number;
    visible_candidate_count: number;
    can_request_more: boolean;
  };
  selected_reference_ids: string[];
  discarded_candidate_ids: string[];
  next_action_es: string;
  warnings: string[];
  errors: string[];
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type ProjectReferenceWithReference = Prisma.ProjectReferenceGetPayload<{
  include: { reference: true };
}>;

type Step3ExecutionContext = {
  runId: string;
  artifactDir: string;
  artifactManifestPath: string;
  startedAtIso: string;
  action: Step3Action;
  stepKey: SourceSelectionStepKey;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function clipText(value: string | null | undefined, max = 520) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3).trim()}...`;
}

function pdfLikelihood(input: { hasPdfUrl: boolean; isOpenAccess: boolean; landingPageUrl: string | null; doi: string | null }) {
  if (input.hasPdfUrl) return "high" as const;
  if (input.isOpenAccess) return "medium" as const;
  if (input.landingPageUrl || input.doi) return "low" as const;
  return "low" as const;
}

function buildStep3ExecutionContext(input: {
  projectId: string;
  action: Step3Action;
  stepKey?: SourceSelectionStepKey;
  runId?: string;
}) {
  const stepKey = input.stepKey ?? MVP_STEP3_KEY;
  const artifactRoot = stepKey === MVP_STEP4_KEY ? "mvp-step4-additional-sources" : "mvp-step3-source-selection";
  const artifactFileName = stepKey === MVP_STEP4_KEY ? "step4-additional-sources.json" : "step3-source-selection.json";
  const runPrefix = stepKey === MVP_STEP4_KEY ? "mvp-step4-additional-sources" : "mvp-step3-source-selection";
  const runId = input.runId ?? `${runPrefix}-${input.action}-${randomUUID()}`;
  return {
    runId,
    action: input.action,
    stepKey,
    artifactDir: path.join(process.cwd(), "artifacts-local", artifactRoot, input.projectId, runId),
    artifactManifestPath: path.join(process.cwd(), "artifacts-local", artifactRoot, input.projectId, runId, artifactFileName),
    startedAtIso: new Date().toISOString(),
  } satisfies Step3ExecutionContext;
}

async function loadStep2Selection(input: {
  projectId: string;
  userId: string;
}): Promise<Step2SelectionSnapshot> {
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      projectId: input.projectId,
      userId: input.userId,
      eventType: "MVP_STEP2_REFINEMENT_OPTION_SELECTED",
    },
    orderBy: { createdAt: "desc" },
  });
  const payload = asRecord(auditLog?.payloadJson);
  const selectedOptionId = typeof payload?.selected_option_id === "string" ? payload.selected_option_id : null;

  if (!auditLog || !selectedOptionId) {
    throw new Error("Paso 3 requiere una opción de intake elegida en Paso 2 antes de mostrar fuentes.");
  }

  return {
    step_run_id: typeof payload?.step_run_id === "string" ? payload.step_run_id : null,
    selected_option_id: selectedOptionId,
    selected_strategy: typeof payload?.selected_strategy === "string" ? payload.selected_strategy : null,
    first_batch_candidate_ids: asStringArray(payload?.first_batch_candidate_ids).slice(0, REFERENCE_BATCH_SIZE),
    selected_at: auditLog.createdAt.toISOString(),
  };
}

function buildScore(input: {
  item: ProjectReferenceWithReference;
  snapshotEntry: ProjectReferenceSearchSnapshot["references"][number] | null;
  sourceLanguage: string | null;
  hasPdfUrl: boolean;
  isOpenAccess: boolean;
}) {
  const relevanceScore = input.snapshotEntry?.relevanceScore ?? input.item.relevanceScore ?? 0;
  const scoreBreakdown = input.snapshotEntry?.scoreBreakdown ?? null;
  const currentYear = new Date().getFullYear();
  const year = input.item.reference.year;
  const citationCount = input.item.reference.citationCount ?? 0;
  const abstractAvailable = Boolean(input.item.reference.abstract?.trim());
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = relevanceScore * 0.55;

  if (scoreBreakdown?.label === "ALTO") {
    score += 10;
    reasons.push("Alta alineación con los grupos centrales de búsqueda.");
  } else if (scoreBreakdown?.label === "MEDIO") {
    score += 5;
    reasons.push("Alineación media con el intake elegido.");
  } else if (scoreBreakdown?.label) {
    warnings.push("Alineación temática débil o periférica; revisar manualmente.");
  }

  if (abstractAvailable) {
    score += 12;
    reasons.push("Tiene abstract disponible para revisión inicial.");
  } else {
    warnings.push("No tiene abstract disponible en metadata.");
  }

  if (input.hasPdfUrl) {
    score += 14;
    reasons.push("Tiene URL directa de PDF.");
  } else if (input.isOpenAccess) {
    score += 8;
    reasons.push("Tiene señal open access.");
  } else {
    warnings.push("No hay PDF directo verificado en metadata; requiere source-health.");
  }

  if (input.item.reference.doi) {
    score += 4;
    reasons.push("Tiene DOI trazable.");
  }

  if (year && year >= currentYear - 5) {
    score += 6;
    reasons.push("Fuente reciente.");
  } else if (year && year >= currentYear - 10) {
    score += 3;
  }

  if (citationCount > 0) {
    score += Math.min(5, Math.log10(citationCount + 1) * 3);
  }

  if (input.sourceLanguage && !["es", "en"].includes(input.sourceLanguage)) {
    reasons.push("Amplía cobertura multilingüe sin reemplazar la revisión humana.");
  }

  const selectionScore = Math.round(Math.max(0, Math.min(100, score)));
  return {
    selectionScore,
    scoreLabel: selectionScore >= 75 ? "alta_prioridad" as const : selectionScore >= 55 ? "prioridad_media" as const : "revision_manual" as const,
    reasons: reasons.length > 0 ? reasons : ["Requiere revisión humana por señales bibliográficas limitadas."],
    warnings,
  };
}

function candidateFromProjectReference(input: {
  item: ProjectReferenceWithReference;
  snapshot: ProjectReferenceSearchSnapshot | null;
  firstBatchIds: string[];
  expanded: boolean;
}): MvpStep3Candidate {
  const snapshotEntry = input.snapshot?.references.find((entry) => entry.referenceId === input.item.referenceId) ?? null;
  const accessSignals = extractAccessSignals({
    rawOpenAlexJson: input.item.reference.rawOpenAlexJson,
    landingPageUrl: input.item.reference.landingPageUrl,
    doi: input.item.reference.doi,
  });
  const sourceLanguage = resolveReferenceSourceLanguage({
    id: input.item.reference.id,
    title: input.item.reference.title,
    abstract: input.item.reference.abstract,
    rawOpenAlexJson: input.item.reference.rawOpenAlexJson,
  });
  const score = buildScore({
    item: input.item,
    snapshotEntry,
    sourceLanguage,
    hasPdfUrl: accessSignals.hasPdfUrl,
    isOpenAccess: accessSignals.isOpenAccess,
  });
  const discoveryLayer = input.firstBatchIds.includes(input.item.referenceId)
    ? "step2_first_batch"
    : input.expanded && sourceLanguage && !["es", "en"].includes(sourceLanguage)
      ? "multilingual_expansion"
      : "ranked_candidate_pool";

  return {
    project_reference_id: input.item.id,
    reference_id: input.item.referenceId,
    title: input.item.reference.title,
    abstract_excerpt: clipText(input.item.reference.abstract),
    doi: input.item.reference.doi,
    year: input.item.reference.year,
    venue: input.item.reference.venue,
    work_type: input.item.reference.workType,
    landing_page_url: input.item.reference.landingPageUrl,
    citation_count: input.item.reference.citationCount,
    relevance_score: snapshotEntry?.relevanceScore ?? input.item.relevanceScore ?? 0,
    score_breakdown: snapshotEntry?.scoreBreakdown ?? null,
    selection_score_100: score.selectionScore,
    score_label: score.scoreLabel,
    score_reasons: score.reasons,
    warnings: score.warnings,
    source_language: sourceLanguage,
    query_language: sourceLanguage && !["es", "en"].includes(sourceLanguage) ? sourceLanguage : null,
    discovery_layer: discoveryLayer,
    abstract_available: Boolean(input.item.reference.abstract?.trim()),
    pdf_url: accessSignals.pdfUrl,
    pdf_likelihood: pdfLikelihood({
      hasPdfUrl: accessSignals.hasPdfUrl,
      isOpenAccess: accessSignals.isOpenAccess,
      landingPageUrl: input.item.reference.landingPageUrl,
      doi: input.item.reference.doi,
    }),
    open_access_signal: accessSignals.isOpenAccess,
    citation_status: "candidate_not_inspected",
    selected: input.item.selected,
    selected_order: input.item.selectedOrder,
  };
}

async function loadCandidatePool(input: {
  projectId: string;
  firstBatchIds: string[];
  expanded: boolean;
}) {
  const snapshot = await getLatestProjectReferenceSearchSnapshot(input.projectId);
  const projectReferences = await prisma.projectReference.findMany({
    where: { projectId: input.projectId },
    include: { reference: true },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "asc" }],
    take: MAX_SELECTED_REFERENCES,
  });
  const candidates = projectReferences.map((item) =>
    candidateFromProjectReference({
      item,
      snapshot,
      firstBatchIds: input.firstBatchIds,
      expanded: input.expanded,
    }),
  );
  const byId = new Map(candidates.map((candidate) => [candidate.reference_id, candidate]));
  const firstBatch = input.firstBatchIds
    .map((id) => byId.get(id))
    .filter((item): item is MvpStep3Candidate => Boolean(item));
  const backfill = candidates
    .filter((candidate) => !input.firstBatchIds.includes(candidate.reference_id))
    .sort((left, right) => right.selection_score_100 - left.selection_score_100 || right.relevance_score - left.relevance_score);
  const ordered = uniqueStrings([...firstBatch.map((candidate) => candidate.reference_id), ...backfill.map((candidate) => candidate.reference_id)])
    .map((id) => byId.get(id))
    .filter((item): item is MvpStep3Candidate => Boolean(item))
    .slice(0, MAX_SELECTED_REFERENCES);

  return { candidates: ordered, snapshot };
}

function buildSearchLayers(input: {
  candidates: MvpStep3Candidate[];
  firstBatchIds: string[];
  expanded: boolean;
}) {
  const first = input.candidates.filter((candidate) => input.firstBatchIds.includes(candidate.reference_id));
  const ranked = input.candidates.filter((candidate) => candidate.discovery_layer === "ranked_candidate_pool");
  const multilingual = input.candidates.filter((candidate) => candidate.discovery_layer === "multilingual_expansion");

  return [
    {
      layer: "base_step2_seed" as const,
      trigger: "step2_selection" as const,
      languages: uniqueStrings(first.map((candidate) => candidate.source_language)).sort(),
      candidate_ids: first.map((candidate) => candidate.reference_id),
    },
    {
      layer: "ranked_candidate_pool" as const,
      trigger: "ranking_backfill" as const,
      languages: uniqueStrings(ranked.map((candidate) => candidate.source_language)).sort(),
      candidate_ids: ranked.map((candidate) => candidate.reference_id),
    },
    ...(input.expanded
      ? [{
          layer: "multilingual_expansion" as const,
          trigger: "user_requested_more" as const,
          languages: uniqueStrings(multilingual.map((candidate) => candidate.source_language)).sort(),
          candidate_ids: multilingual.map((candidate) => candidate.reference_id),
        }]
      : []),
  ];
}

function buildBatches(candidates: MvpStep3Candidate[]) {
  const first = candidates.slice(0, REFERENCE_BATCH_SIZE);
  const second = candidates.slice(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES);
  return {
    first: {
      visible_candidate_count: first.length,
      candidates: first,
    },
    second: {
      available: second.length > 0,
      visible_candidate_count: second.length,
      candidates: second,
    },
    expanded_pool_count: candidates.length,
  };
}

function buildFrontendCable(input: {
  action: Step3Action;
  batches: MvpStep3Result["batches"];
  stepKey: SourceSelectionStepKey;
}): MvpStep3Result["frontend_cable"] {
  if (input.stepKey === MVP_STEP4_KEY) {
    if (input.action === "apply_selection") {
      return {
        intervention_point: "after_step_4_selection",
        action: "run_source_health",
        min_selected_sources: MIN_SELECTED_REFERENCES,
        max_selected_sources: MAX_SELECTED_REFERENCES,
        visible_candidate_count: input.batches.expanded_pool_count,
        can_request_more: false,
      };
    }

    return {
      intervention_point: "after_step_4_more_sources",
      action: "choose_final_sources",
      min_selected_sources: MIN_SELECTED_REFERENCES,
      max_selected_sources: MAX_SELECTED_REFERENCES,
      visible_candidate_count: input.batches.expanded_pool_count,
      can_request_more: false,
    };
  }

  if (input.action === "apply_selection") {
    return {
      intervention_point: "after_step_3_selection",
      action: "run_source_inspection",
      min_selected_sources: MIN_SELECTED_REFERENCES,
      max_selected_sources: MAX_SELECTED_REFERENCES,
      visible_candidate_count: input.batches.expanded_pool_count,
      can_request_more: false,
    };
  }

  if (input.action === "request_more") {
    return {
      intervention_point: "after_step_3_more_sources",
      action: "choose_sources_from_expanded_pool",
      min_selected_sources: MIN_SELECTED_REFERENCES,
      max_selected_sources: MAX_SELECTED_REFERENCES,
      visible_candidate_count: input.batches.expanded_pool_count,
      can_request_more: false,
    };
  }

  return {
    intervention_point: "after_step_3_first_batch",
    action: "choose_sources_or_request_more",
    min_selected_sources: MIN_SELECTED_REFERENCES,
    max_selected_sources: MAX_SELECTED_REFERENCES,
    visible_candidate_count: input.batches.first.visible_candidate_count,
    can_request_more: input.batches.second.available || input.batches.expanded_pool_count < MAX_SELECTED_REFERENCES,
  };
}

async function executeStep3(input: {
  userId: string;
  projectId: string;
  action: Step3Action;
  stepKey?: SourceSelectionStepKey;
  runId?: string;
  work: (context: Step3ExecutionContext, warnings: string[]) => Promise<{
    source: MvpStep3Result["source"];
    provider: Provider;
    step2Selection: Step2SelectionSnapshot;
    candidates: MvpStep3Candidate[];
    selectedReferenceIds?: string[];
    discardedCandidateIds?: string[];
  }>;
}) {
  const context = buildStep3ExecutionContext({
    projectId: input.projectId,
    action: input.action,
    stepKey: input.stepKey,
    runId: input.runId,
  });
  const eventPrefix = context.stepKey === MVP_STEP4_KEY ? "MVP_STEP4_ADDITIONAL_SOURCES" : "MVP_STEP3_SOURCE_SELECTION";
  await mkdir(context.artifactDir, { recursive: true });
  const usageBefore = await captureMvpApiUsageSnapshot();
  const warnings: string[] = [];
  const errors: string[] = [];
  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: context.stepKey,
    status: "RUNNING",
    provider: Provider.SYSTEM,
    model: null,
    promptVersion: MVP_STEP3_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      project_id: input.projectId,
      run_id: context.runId,
      action: input.action,
    }),
    artifactDir: context.artifactDir,
    artifactManifestPath: context.artifactManifestPath,
  });

  await logAuditEvent({
    eventType: `${eventPrefix}_STARTED`,
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: context.runId,
      step_run_id: stepRun.id,
      step_key: context.stepKey,
      action: input.action,
      started_at: context.startedAtIso,
      artifact_dir: context.artifactDir,
    }),
  });

  try {
    const output = await input.work(context, warnings);
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - Date.parse(context.startedAtIso));
    const batches = buildBatches(output.candidates);
    const status = output.candidates.length >= REFERENCE_BATCH_SIZE || input.action === "apply_selection"
      ? "completed"
      : "partially_completed";
    const selectedReferenceIds = output.selectedReferenceIds ?? [];
    const result: MvpStep3Result = {
      artifact_type: context.stepKey === MVP_STEP4_KEY ? STEP4_ARTIFACT_TYPE : STEP3_ARTIFACT_TYPE,
      artifact_version: "v1",
      step_key: context.stepKey,
      prompt_version: MVP_STEP3_PROMPT_VERSION,
      project_id: input.projectId,
      run_id: context.runId,
      step_run_id: stepRun.id,
      action: input.action,
      status,
      artifact_dir: context.artifactDir,
      artifact_manifest_path: context.artifactManifestPath,
      started_at: context.startedAtIso,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      source: output.source,
      provider: output.provider,
      model: null,
      step2_selection: output.step2Selection,
      search_layers: buildSearchLayers({
        candidates: output.candidates,
        firstBatchIds: output.step2Selection.first_batch_candidate_ids,
        expanded: input.action === "request_more",
      }),
      batches,
      frontend_cable: buildFrontendCable({ action: input.action, batches, stepKey: context.stepKey }),
      selected_reference_ids: selectedReferenceIds,
      discarded_candidate_ids: output.discardedCandidateIds ?? [],
      next_action_es: context.stepKey === MVP_STEP4_KEY
        ? input.action === "apply_selection"
          ? "Ejecuta Step 5 Source Health con la selección final antes de usar estas fuentes como evidencia."
          : "Selecciona las fuentes finales desde el pool expandido antes de ejecutar Step 5."
        : input.action === "apply_selection"
          ? "Ejecuta inspección limitada/source health antes de usar estas fuentes como evidencia."
          : "Selecciona fuentes candidatas o pide 5 más si el primer lote no es suficiente.",
      warnings,
      errors,
      api_usage: {
        run_id: context.runId,
        report: await buildMvpApiUsageReport({
          before: usageBefore,
          label: context.stepKey === MVP_STEP4_KEY ? "mvp_step4_additional_sources" : "mvp_step3_source_selection",
          filter: { projectId: input.projectId, since: usageBefore.capturedAt },
        }),
      },
    };

    await writeFile(context.artifactManifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await writeFile(path.join(context.artifactDir, "api-usage-report.json"), `${JSON.stringify(result.api_usage.report, null, 2)}\n`, "utf8");

    await updateMvpStepRun(stepRun.id, {
      status: status === "completed" ? "COMPLETED" : "PARTIALLY_COMPLETED",
      provider: output.provider,
      model: null,
      promptVersion: MVP_STEP3_PROMPT_VERSION,
      outputSnapshotJson: asStepRunJson(result),
      warningsJson: asStepRunJson(warnings),
      errorsJson: asStepRunJson(errors),
      fallbackUsed: false,
      artifactDir: context.artifactDir,
      artifactManifestPath: context.artifactManifestPath,
      finishedAt: completedAt,
    });

    await logAuditEvent({
      eventType: `${eventPrefix}_COMPLETED`,
      actorType: ActorType.SYSTEM,
      provider: output.provider,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: context.runId,
        step_run_id: stepRun.id,
        action: input.action,
        status,
        source: output.source,
        selected_reference_ids: selectedReferenceIds,
        visible_candidate_count: result.frontend_cable.visible_candidate_count,
        search_layers: result.search_layers,
        warnings,
        errors,
        api_usage_delta: result.api_usage.report.filtered_delta,
        artifact_manifest_path: context.artifactManifestPath,
      }),
    });

    return result;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Fallo desconocido en Paso 3.";
    errors.push(message);

    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider: Provider.SYSTEM,
      model: null,
      promptVersion: MVP_STEP3_PROMPT_VERSION,
      errorsJson: asStepRunJson(errors),
      artifactDir: context.artifactDir,
      artifactManifestPath: context.artifactManifestPath,
      finishedAt: completedAt,
    });
    await logAuditEvent({
      eventType: `${eventPrefix}_FAILED`,
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: context.runId,
        step_run_id: stepRun.id,
        action: input.action,
        errors,
        completed_at: completedAt.toISOString(),
      }),
    });

    throw error;
  }
}

export async function prepareMvpStep3SourceSelection(input: {
  userId: string;
  projectId: string;
  runId?: string;
}) {
  return executeStep3({
    userId: input.userId,
    projectId: input.projectId,
    action: "prepare_first_batch",
    runId: input.runId,
    work: async (_context, warnings) => {
      const step2Selection = await loadStep2Selection(input);
      const { candidates } = await loadCandidatePool({
        projectId: input.projectId,
        firstBatchIds: step2Selection.first_batch_candidate_ids,
        expanded: false,
      });

      if (step2Selection.first_batch_candidate_ids.length < REFERENCE_BATCH_SIZE) {
        warnings.push("Paso 2 dejó menos de 5 candidatos priorizados; se completó el lote con ranking determinístico.");
      }
      if (candidates.length < REFERENCE_BATCH_SIZE) {
        warnings.push("Hay menos de 5 fuentes candidatas persistidas; conviene pedir 5 más antes de seleccionar.");
      }

      return {
        source: "deterministic",
        provider: Provider.SYSTEM,
        step2Selection,
        candidates,
      };
    },
  });
}

export async function requestMvpStep3MoreSources(input: {
  userId: string;
  projectId: string;
  stepKey?: SourceSelectionStepKey;
  runId?: string;
}) {
  return executeStep3({
    userId: input.userId,
    projectId: input.projectId,
    action: "request_more",
    stepKey: input.stepKey,
    runId: input.runId,
    work: async (_context, warnings) => {
      const step2Selection = await loadStep2Selection(input);
      const discovery = await runMvpSourceDiscovery(input.userId, input.projectId, {
        desiredTotal: MAX_SELECTED_REFERENCES,
        batchKind: "more",
      });
      const { candidates } = await loadCandidatePool({
        projectId: input.projectId,
        firstBatchIds: step2Selection.first_batch_candidate_ids,
        expanded: true,
      });

      warnings.push(...discovery.warnings);
      if (discovery.status === "blocked") {
        warnings.push(...discovery.blockers);
      }
      if (candidates.length <= REFERENCE_BATCH_SIZE) {
        warnings.push("La expansión no produjo suficientes candidatos nuevos; revisar intake o query antes de avanzar.");
      }

      return {
        source: "discovery",
        provider: Provider.OPENALEX,
        step2Selection,
        candidates,
      };
    },
  });
}

export async function requestMvpStep4AdditionalSources(input: {
  userId: string;
  projectId: string;
  runId?: string;
}) {
  return requestMvpStep3MoreSources({
    userId: input.userId,
    projectId: input.projectId,
    stepKey: MVP_STEP4_KEY,
    runId: input.runId,
  });
}

export async function applyMvpStep3SourceSelection(input: {
  userId: string;
  projectId: string;
  selectedReferenceIds: string[];
  stepKey?: SourceSelectionStepKey;
  runId?: string;
}) {
  return executeStep3({
    userId: input.userId,
    projectId: input.projectId,
    action: "apply_selection",
    stepKey: input.stepKey,
    runId: input.runId,
    work: async (context, warnings) => {
      const step2Selection = await loadStep2Selection(input);
      const candidatePool = await loadCandidatePool({
        projectId: input.projectId,
        firstBatchIds: step2Selection.first_batch_candidate_ids,
        expanded: true,
      });
      const requestedReferenceIds = uniqueStrings(input.selectedReferenceIds).slice(0, MAX_SELECTED_REFERENCES);
      const existingProjectReferences = requestedReferenceIds.length > 0
        ? await prisma.projectReference.findMany({
            where: {
              projectId: input.projectId,
              referenceId: { in: requestedReferenceIds },
            },
            include: { reference: true },
          })
        : [];
      const existingReferenceIds = new Set(existingProjectReferences.map((item) => item.referenceId));
      const selectedReferenceIds = requestedReferenceIds.filter((id) => existingReferenceIds.has(id));
      const discardedCandidateIds = requestedReferenceIds.filter((id) => !existingReferenceIds.has(id));

      if (selectedReferenceIds.length < MIN_SELECTED_REFERENCES || selectedReferenceIds.length > MAX_SELECTED_REFERENCES) {
        throw new Error(`Selección inválida: ${selectedReferenceIds.length}. Debe estar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes.`);
      }

      if (discardedCandidateIds.length > 0) {
        warnings.push("Algunos IDs enviados no pertenecen al pool candidato y fueron descartados.");
      }

      await updateSelectedProjectReferences(input.userId, input.projectId, selectedReferenceIds);

      const selectedRowsById = new Map(existingProjectReferences.map((item) => [item.referenceId, item] as const));
      const selectedFirst = selectedReferenceIds
        .map((id) => selectedRowsById.get(id))
        .filter((item): item is ProjectReferenceWithReference => Boolean(item))
        .map((item) =>
          candidateFromProjectReference({
            item,
            snapshot: candidatePool.snapshot,
            firstBatchIds: step2Selection.first_batch_candidate_ids,
            expanded: true,
          }),
        );
      const refreshed = await loadCandidatePool({
        projectId: input.projectId,
        firstBatchIds: step2Selection.first_batch_candidate_ids,
        expanded: true,
      });
      const selectedSet = new Set(selectedReferenceIds);
      const rest = refreshed.candidates.filter((candidate) => !selectedSet.has(candidate.reference_id));

      await logAuditEvent({
        eventType: context.stepKey === MVP_STEP4_KEY ? "MVP_STEP4_FINAL_SOURCE_SELECTION_APPLIED" : "MVP_STEP3_SOURCE_SELECTION_APPLIED",
        actorType: ActorType.USER,
        provider: Provider.SYSTEM,
        userId: input.userId,
        projectId: input.projectId,
        payloadJson: asStepRunJson({
          selected_reference_ids: selectedReferenceIds,
          discarded_candidate_ids: discardedCandidateIds,
          selected_count: selectedReferenceIds.length,
          next_action_es: context.stepKey === MVP_STEP4_KEY
            ? "Ejecutar Step 5 Source Health con la seleccion final."
            : "Ejecutar source-health antes de usar estas fuentes como evidencia.",
        }),
      });

      return {
        source: "deterministic",
        provider: Provider.SYSTEM,
        step2Selection,
        candidates: [...selectedFirst, ...rest],
        selectedReferenceIds,
        discardedCandidateIds,
      };
    },
  });
}

export async function applyMvpStep4FinalSourceSelection(input: {
  userId: string;
  projectId: string;
  selectedReferenceIds: string[];
  runId?: string;
}) {
  return applyMvpStep3SourceSelection({
    userId: input.userId,
    projectId: input.projectId,
    selectedReferenceIds: input.selectedReferenceIds,
    stepKey: MVP_STEP4_KEY,
    runId: input.runId,
  });
}
