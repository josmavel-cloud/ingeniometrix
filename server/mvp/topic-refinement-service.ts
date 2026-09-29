import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import { withLlmUsageContext } from "@/server/llm-usage-registry";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { MVP_STEP1_KEY, normalizeIntakeForMvpProject, type NormalizedMvpIntake } from "@/server/mvp/intake-normalization-service";
import { asStepRunJson, createMvpStepRun, findLatestMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import { extractAccessSignals } from "@/server/retrieval/reference-access";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { parseIntakeInput, type IntakeInput } from "@/server/projects/project-validation";
import { saveIntakeForProject } from "@/server/projects/project-service";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import {
  renderStep2EvidenceInformedRefinementPrompt,
  STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT,
} from "@/server/mvp/prompts/step2-evidence-informed-refinement.v2";
import type { ProjectReferenceSearchSnapshot, ReferenceScoreBreakdown } from "@/server/retrieval/reference-search-v2";

export const MVP_STEP2_KEY = "step_2_evidence_informed_refinement";
export const MVP_STEP2_PROMPT_VERSION = STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT.version;
export const DEFAULT_TOPIC_REFINEMENT_MODEL = "gpt-5.4-mini";
const STEP2_ARTIFACT_TYPE = "mvp_step2_evidence_informed_refinement";

export type TopicRefinementReference = {
  reference_id: string;
  title: string;
  abstract_excerpt: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  openalex_id: string | null;
  citation_count: number | null;
  relevance_score: number;
  score_label: ReferenceScoreBreakdown["label"] | null;
  matched_keyword_groups: {
    necessary: string[];
    complementary: string[];
    optional: string[];
  };
  matched_query_stage: ReferenceScoreBreakdown["matchedQueryStage"] | null;
  abstract_available: boolean;
  pdf_likelihood: "high" | "medium" | "low";
  pdf_url: string | null;
  open_access_signal: boolean;
  evidence_potential_score_100: number;
  evidence_roles: string[];
  concepts: string[];
  keywords: string[];
  topics: string[];
};

export type SourceFeasibilitySummary = {
  candidate_count: number;
  strong_candidate_count: number;
  abstract_count: number;
  probable_pdf_count: number;
  open_access_count: number;
  recent_count: number;
  method_source_count: number;
  contextual_source_count: number;
  review_or_foundational_count: number;
  first_batch_candidate_ids: string[];
  second_batch_candidate_ids: string[];
  readiness: "ready" | "ready_with_warnings" | "blocked";
  score_100: number;
  blockers: string[];
  warnings: string[];
};

export type ImprovedIntakeAlternative = {
  option_id: string;
  strategy: "conservadora" | "balanceada" | "ambiciosa";
  title: string;
  research_question: string;
  suggested_intake: IntakeInput;
  evidence_rationale: string;
  expected_contribution: string;
  feasibility_score_100: number;
  novelty_score_100: number;
  evidence_coverage_score_100: number;
  risks: string[];
  supporting_reference_ids: string[];
  search_terms_for_step_3: string[];
  source_feasibility: {
    score_100: number;
    expected_source_count: number;
    expected_pdf_count: number;
    first_batch_candidate_ids: string[];
    strongest_evidence_lanes: string[];
    weak_evidence_lanes: string[];
    risk_level: "low" | "medium" | "high";
  };
};

export type TopicRefinementResult = {
  artifact_type: "mvp_step2_evidence_informed_refinement";
  artifact_version: "v1";
  step_key: typeof MVP_STEP2_KEY;
  prompt_version: string;
  project_id: string;
  run_id: string;
  step_run_id: string;
  status: "completed" | "partially_completed" | "failed";
  artifact_dir: string;
  artifact_manifest_path: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  source: "llm" | "fallback";
  model: string | null;
  provider: Provider;
  normalized_intake: NormalizedMvpIntake;
  exploratory_discovery: {
    status: string;
    candidate_source_count: number;
    attempted_queries: string[];
    search_query: string | null;
    keyword_groups: ProjectReferenceSearchSnapshot["metadata"]["keywordGroups"] | null;
    query_pack: ProjectReferenceSearchSnapshot["metadata"]["queryPack"] | null;
  };
  evidence_map: {
    references: TopicRefinementReference[];
    recurring_concepts: string[];
    recurring_keywords: string[];
    recurring_topics: string[];
    methods_detected: string[];
    source_feasibility: SourceFeasibilitySummary;
    coverage_notes: string[];
  };
  alternatives: ImprovedIntakeAlternative[];
  recommended_option_id: string | null;
  frontend_cable: {
    intervention_point: "after_step_2";
    action: "choose_refined_intake_option";
    options: Array<{
      option_id: string;
      strategy: ImprovedIntakeAlternative["strategy"];
      title: string;
      feasibility_score_100: number;
      novelty_score_100: number;
      evidence_coverage_score_100: number;
      expected_pdf_count: number;
      risk_level: "low" | "medium" | "high";
    }>;
  };
  next_action_es: string;
  warnings: string[];
  errors: string[];
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type Step2ExecutionContext = {
  runId: string;
  artifactDir: string;
  artifactManifestPath: string;
  startedAtIso: string;
  requestedModel: string;
};

type RawOpenAlexLike = {
  id?: string | null;
  concepts?: unknown[];
  keywords?: unknown[];
  topics?: unknown[];
  primary_topic?: unknown;
};

const topicRefinementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["alternatives", "recommended_option_id", "coverage_notes"],
  properties: {
    alternatives: {
      type: "array",
      minItems: 3,
        maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "option_id",
          "strategy",
          "title",
          "research_question",
          "suggested_intake",
          "evidence_rationale",
          "expected_contribution",
          "feasibility_score_100",
          "novelty_score_100",
          "evidence_coverage_score_100",
          "risks",
          "supporting_reference_ids",
          "search_terms_for_step_3",
          "source_feasibility",
        ],
        properties: {
          option_id: { type: "string", minLength: 3, maxLength: 40 },
          strategy: { type: "string", enum: ["conservadora", "balanceada", "ambiciosa"] },
          title: { type: "string", minLength: 12, maxLength: 260 },
          research_question: { type: "string", minLength: 16, maxLength: 360 },
          suggested_intake: {
            type: "object",
            additionalProperties: false,
            required: [
              "topic",
              "problemContext",
              "researchLine",
              "academicConstraints",
              "targetPopulation",
              "availableData",
              "preferredMethodology",
              "advisorNotes",
            ],
            properties: {
              topic: { type: "string", minLength: 8, maxLength: 260 },
              problemContext: { type: "string", minLength: 20, maxLength: 1800 },
              researchLine: { type: "string", minLength: 8, maxLength: 420 },
              academicConstraints: { type: "string", minLength: 8, maxLength: 900 },
              targetPopulation: { type: "string", minLength: 8, maxLength: 520 },
              availableData: { type: "string", minLength: 8, maxLength: 700 },
              preferredMethodology: { type: "string", minLength: 8, maxLength: 520 },
              advisorNotes: { type: "string", minLength: 8, maxLength: 700 },
            },
          },
          evidence_rationale: { type: "string", minLength: 20, maxLength: 700 },
          expected_contribution: { type: "string", minLength: 20, maxLength: 520 },
          feasibility_score_100: { type: "number", minimum: 0, maximum: 100 },
          novelty_score_100: { type: "number", minimum: 0, maximum: 100 },
          evidence_coverage_score_100: { type: "number", minimum: 0, maximum: 100 },
          risks: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 8, maxLength: 220 } },
          supporting_reference_ids: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 8, maxLength: 80 } },
          search_terms_for_step_3: { type: "array", minItems: 3, maxItems: 12, items: { type: "string", minLength: 3, maxLength: 80 } },
          source_feasibility: {
            type: "object",
            additionalProperties: false,
            required: [
              "score_100",
              "expected_source_count",
              "expected_pdf_count",
              "first_batch_candidate_ids",
              "strongest_evidence_lanes",
              "weak_evidence_lanes",
              "risk_level",
            ],
            properties: {
              score_100: { type: "number", minimum: 0, maximum: 100 },
              expected_source_count: { type: "number", minimum: 0, maximum: 30 },
              expected_pdf_count: { type: "number", minimum: 0, maximum: 30 },
              first_batch_candidate_ids: { type: "array", minItems: 0, maxItems: 5, items: { type: "string", minLength: 8, maxLength: 80 } },
              strongest_evidence_lanes: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 3, maxLength: 80 } },
              weak_evidence_lanes: { type: "array", minItems: 0, maxItems: 8, items: { type: "string", minLength: 3, maxLength: 80 } },
              risk_level: { type: "string", enum: ["low", "medium", "high"] },
            },
          },
        },
      },
    },
    recommended_option_id: { type: "string", minLength: 3, maxLength: 40 },
    coverage_notes: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 8, maxLength: 240 } },
  },
} satisfies Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNoisyOpenAlexSignal(value: string) {
  const normalized = normalizeTitle(value);
  return normalized === "stock firearms";
}

function extractNames(values: unknown, keys: string[]) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim() && !isNoisyOpenAlexSignal(value)) {
          return value.trim();
        }
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function tally(values: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const normalized = normalizeTitle(value);
    if (!normalized) continue;
    const current = counts.get(normalized) ?? { label: value, count: 0 };
    current.count += 1;
    counts.set(normalized, current);
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((item) => item.label);
}

function extractReferenceSignals(raw: unknown) {
  const record = asRecord(raw) as RawOpenAlexLike | null;
  if (!record) {
    return { concepts: [], keywords: [], topics: [] };
  }

  const primaryTopic = asRecord(record.primary_topic);
  return {
    concepts: extractNames(record.concepts, ["display_name", "name"]).slice(0, 8),
    keywords: extractNames(record.keywords, ["display_name", "keyword", "name"]).slice(0, 8),
    topics: [
      typeof primaryTopic?.display_name === "string" && !isNoisyOpenAlexSignal(primaryTopic.display_name)
        ? primaryTopic.display_name
        : null,
      ...extractNames(record.topics, ["display_name", "name"]),
    ].filter((value): value is string => Boolean(value)).slice(0, 8),
  };
}

function detectMethods(text: string) {
  const normalized = normalizeTitle(text);
  const candidates = [
    "systematic review",
    "scoping review",
    "case study",
    "mixed methods",
    "regression",
    "machine learning",
    "monte carlo",
    "FORM",
    "finite element",
    "survey",
    "interview",
    "quasi experimental",
    "randomized controlled trial",
    "difference in differences",
    "structural equation model",
    "bibliometric",
  ];

  return candidates.filter((candidate) => normalizeTitle(candidate).split(" ").every((term) => normalized.includes(term)));
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function clipText(value: string | null | undefined, max = 520) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3).trim()}...`;
}

function classifyEvidenceRoles(reference: {
  title: string;
  abstract_excerpt: string | null;
  concepts: string[];
  keywords: string[];
  topics: string[];
  workType?: string | null;
}) {
  const text = normalizeTitle([
    reference.title,
    reference.abstract_excerpt,
    reference.concepts.join(" "),
    reference.keywords.join(" "),
    reference.topics.join(" "),
    reference.workType,
  ].filter(Boolean).join(" "));
  const roles: string[] = [];

  if (includesAny(text, [/review/i, /survey/i, /state of the art/i, /bibliometric/i])) roles.push("review_or_foundational");
  if (includesAny(text, [/method/i, /model/i, /simulation/i, /analysis/i, /experiment/i, /framework/i, /finite element/i, /regression/i, /machine learning/i])) roles.push("method");
  if (includesAny(text, [/peru/i, /latin america/i, /local/i, /regional/i, /urban/i, /rural/i, /policy/i, /standard/i, /normative/i])) roles.push("context");
  if (includesAny(text, [/performance/i, /effect/i, /impact/i, /reliability/i, /risk/i, /damage/i, /outcome/i])) roles.push("variable_or_outcome");
  if (roles.length === 0) roles.push("background");

  return roles;
}

function pdfLikelihood(input: { hasPdfUrl: boolean; isOpenAccess: boolean; doi: string | null; landingPageUrl: string | null }) {
  if (input.hasPdfUrl) return "high" as const;
  if (input.isOpenAccess) return "medium" as const;
  if (input.landingPageUrl) return "low" as const;
  if (input.doi) return "low" as const;
  return "low" as const;
}

function buildEvidencePotentialScore(reference: {
  relevanceScore: number;
  abstractAvailable: boolean;
  pdfLikelihood: TopicRefinementReference["pdf_likelihood"];
  doi: string | null;
  citationCount: number | null;
  year: number | null;
  roles: string[];
}) {
  const currentYear = new Date().getFullYear();
  const recency = reference.year && reference.year >= currentYear - 5 ? 8 : reference.year && reference.year >= currentYear - 10 ? 4 : 0;
  const citation = Math.min(8, Math.log10(Math.max(1, reference.citationCount ?? 0)) * 4);
  const roleBonus = Math.min(10, reference.roles.length * 3);
  const score =
    reference.relevanceScore * 0.35 +
    (reference.abstractAvailable ? 18 : 0) +
    (reference.pdfLikelihood === "high" ? 20 : reference.pdfLikelihood === "medium" ? 10 : 0) +
    (reference.doi ? 4 : 0) +
    recency +
    citation +
    roleBonus;

  return Math.round(Math.max(0, Math.min(100, score)));
}

function findSnapshotItem(snapshot: ProjectReferenceSearchSnapshot | null | undefined, referenceId: string) {
  return snapshot?.references.find((item) => item.referenceId === referenceId) ?? null;
}

async function collectExploratoryReferences(input: {
  projectId: string;
  searchSnapshot?: ProjectReferenceSearchSnapshot | null;
}): Promise<TopicRefinementReference[]> {
  const projectReferences = await prisma.projectReference.findMany({
    where: { projectId: input.projectId },
    include: { reference: true },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "asc" }],
    take: 10,
  });

  return projectReferences.map((item) => {
    const signals = extractReferenceSignals(item.reference.rawOpenAlexJson);
    const snapshotItem = findSnapshotItem(input.searchSnapshot, item.referenceId);
    const accessSignals = extractAccessSignals({
      rawOpenAlexJson: item.reference.rawOpenAlexJson,
      landingPageUrl: item.reference.landingPageUrl,
      doi: item.reference.doi,
    });
    const likelihood = pdfLikelihood({
      hasPdfUrl: accessSignals.hasPdfUrl,
      isOpenAccess: accessSignals.isOpenAccess,
      doi: item.reference.doi,
      landingPageUrl: item.reference.landingPageUrl,
    });
    const abstractExcerpt = clipText(item.reference.abstract, 650);
    const roles = classifyEvidenceRoles({
      title: item.reference.title,
      abstract_excerpt: abstractExcerpt,
      concepts: signals.concepts,
      keywords: signals.keywords,
      topics: signals.topics,
      workType: item.reference.workType,
    });
    const relevanceScore = item.relevanceScore ?? 0;

    return {
      reference_id: item.referenceId,
      title: item.reference.title,
      abstract_excerpt: abstractExcerpt,
      year: item.reference.year,
      venue: item.reference.venue,
      doi: item.reference.doi,
      openalex_id: item.reference.openAlexId,
      citation_count: item.reference.citationCount,
      relevance_score: relevanceScore,
      score_label: snapshotItem?.scoreBreakdown.label ?? null,
      matched_keyword_groups: {
        necessary: snapshotItem?.scoreBreakdown.necessaryMatches ?? [],
        complementary: snapshotItem?.scoreBreakdown.complementaryMatches ?? [],
        optional: snapshotItem?.scoreBreakdown.optionalMatches ?? [],
      },
      matched_query_stage: snapshotItem?.scoreBreakdown.matchedQueryStage ?? null,
      abstract_available: Boolean(item.reference.abstract?.trim()),
      pdf_likelihood: likelihood,
      pdf_url: accessSignals.pdfUrl,
      open_access_signal: accessSignals.isOpenAccess,
      evidence_potential_score_100: buildEvidencePotentialScore({
        relevanceScore,
        abstractAvailable: Boolean(item.reference.abstract?.trim()),
        pdfLikelihood: likelihood,
        doi: item.reference.doi,
        citationCount: item.reference.citationCount,
        year: item.reference.year,
        roles,
      }),
      evidence_roles: roles,
      concepts: signals.concepts,
      keywords: signals.keywords,
      topics: signals.topics,
    };
  });
}

function buildSourceFeasibility(references: TopicRefinementReference[]): SourceFeasibilitySummary {
  const sorted = [...references].sort(
    (left, right) =>
      right.evidence_potential_score_100 - left.evidence_potential_score_100 ||
      right.relevance_score - left.relevance_score,
  );
  const candidateCount = references.length;
  const strongCandidateCount = references.filter((reference) => reference.evidence_potential_score_100 >= 60).length;
  const abstractCount = references.filter((reference) => reference.abstract_available).length;
  const probablePdfCount = references.filter((reference) => reference.pdf_likelihood === "high" || reference.pdf_likelihood === "medium").length;
  const openAccessCount = references.filter((reference) => reference.open_access_signal).length;
  const currentYear = new Date().getFullYear();
  const recentCount = references.filter((reference) => reference.year && reference.year >= currentYear - 7).length;
  const methodSourceCount = references.filter((reference) => reference.evidence_roles.includes("method")).length;
  const contextualSourceCount = references.filter((reference) => reference.evidence_roles.includes("context")).length;
  const reviewOrFoundationalCount = references.filter((reference) => reference.evidence_roles.includes("review_or_foundational")).length;
  const score = Math.round(Math.min(100,
    Math.min(candidateCount, 10) * 4 +
    Math.min(strongCandidateCount, 5) * 8 +
    Math.min(abstractCount, 8) * 3 +
    Math.min(probablePdfCount, 5) * 5 +
    Math.min(methodSourceCount, 3) * 5 +
    Math.min(reviewOrFoundationalCount, 2) * 3 +
    Math.min(recentCount, 5) * 2,
  ));
  const blockers = [
    candidateCount < 5 ? `Solo hay ${candidateCount} candidato(s) exploratorio(s); se necesitan al menos 5 para proponer opciones confiables.` : null,
    abstractCount < 3 ? `Solo ${abstractCount} candidato(s) tienen abstract; el LLM tendría poco material textual para refinar.` : null,
  ].filter((value): value is string => Boolean(value));
  const warnings = [
    probablePdfCount < 2 ? `Solo ${probablePdfCount} candidato(s) tienen PDF/open access probable; puede faltar evidencia fuerte para el plan.` : null,
    methodSourceCount < 1 ? "No se detectó una fuente metodológica clara en el pool exploratorio." : null,
    strongCandidateCount < 3 ? "Menos de 3 candidatos superan el umbral fuerte de potencial de evidencia." : null,
  ].filter((value): value is string => Boolean(value));

  return {
    candidate_count: candidateCount,
    strong_candidate_count: strongCandidateCount,
    abstract_count: abstractCount,
    probable_pdf_count: probablePdfCount,
    open_access_count: openAccessCount,
    recent_count: recentCount,
    method_source_count: methodSourceCount,
    contextual_source_count: contextualSourceCount,
    review_or_foundational_count: reviewOrFoundationalCount,
    first_batch_candidate_ids: sorted.slice(0, 5).map((reference) => reference.reference_id),
    second_batch_candidate_ids: sorted.slice(5, 10).map((reference) => reference.reference_id),
    readiness: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "ready_with_warnings" : "ready",
    score_100: score,
    blockers,
    warnings,
  };
}

function buildEvidenceMap(references: TopicRefinementReference[]) {
  const joinedText = references
    .map((reference) => [reference.title, reference.concepts.join(" "), reference.keywords.join(" "), reference.topics.join(" ")].join(" "))
    .join(" \n");
  const sourceFeasibility = buildSourceFeasibility(references);

  return {
    references,
    recurring_concepts: tally(references.flatMap((reference) => reference.concepts)).slice(0, 12),
    recurring_keywords: tally(references.flatMap((reference) => reference.keywords)).slice(0, 12),
    recurring_topics: tally(references.flatMap((reference) => reference.topics)).slice(0, 12),
    methods_detected: tally(detectMethods(joinedText)).slice(0, 8),
    source_feasibility: sourceFeasibility,
    coverage_notes: [
      `${references.length} referencias candidatas exploratorias recuperadas para refinar el intake.`,
      `${sourceFeasibility.abstract_count} referencia(s) con abstract disponible; ${sourceFeasibility.probable_pdf_count} con PDF/open access probable.`,
      `Score de suficiencia bibliografica temprana: ${sourceFeasibility.score_100}/100 (${sourceFeasibility.readiness}).`,
      "Estas referencias orientan el refinamiento del tema y siembran el pool inicial de Paso 3; todavía no equivalen a selección humana ni evidencia final.",
      ...sourceFeasibility.warnings,
      ...sourceFeasibility.blockers,
    ],
  };
}

function isNormalizedMvpIntake(value: unknown): value is NormalizedMvpIntake {
  const record = asRecord(value);
  const knowledgeArea = asRecord(record?.knowledgeArea);
  const retrievalHints = asRecord(record?.retrievalHints);

  return Boolean(
    typeof record?.topic === "string" &&
      typeof record.normalizedTopic === "string" &&
      typeof knowledgeArea?.label === "string" &&
      retrievalHints,
  );
}

async function loadStep2NormalizedIntake(input: {
  userId: string;
  projectId: string;
}): Promise<{
  normalized: NormalizedMvpIntake;
  source: "step1_run" | "step1_fresh";
  step1_run_id: string | null;
}> {
  const latestStep1 = await findLatestMvpStepRun({
    projectId: input.projectId,
    stepKey: MVP_STEP1_KEY,
  });
  const snapshot = asRecord(latestStep1?.outputSnapshotJson);

  if (
    latestStep1 &&
    ["COMPLETED", "PARTIALLY_COMPLETED"].includes(latestStep1.status) &&
    isNormalizedMvpIntake(snapshot?.normalized)
  ) {
    return {
      normalized: snapshot.normalized,
      source: "step1_run",
      step1_run_id: latestStep1.id,
    };
  }

  const fresh = await normalizeIntakeForMvpProject({
    userId: input.userId,
    projectId: input.projectId,
    persistNormalizedToProject: false,
  });

  const freshStepRun = await findLatestMvpStepRun({
    projectId: input.projectId,
    stepKey: MVP_STEP1_KEY,
  });

  return {
    normalized: fresh.normalized,
    source: "step1_fresh",
    step1_run_id: freshStepRun?.id ?? null,
  };
}

function buildFallbackAlternatives(input: {
  normalized: NormalizedMvpIntake;
  evidenceMap: ReturnType<typeof buildEvidenceMap>;
}): ImprovedIntakeAlternative[] {
  const references = input.evidenceMap.references;
  const sourceFeasibility = input.evidenceMap.source_feasibility;
  const rankedIds = sourceFeasibility.first_batch_candidate_ids.length > 0
    ? sourceFeasibility.first_batch_candidate_ids
    : references.slice(0, 5).map((reference) => reference.reference_id);
  const topIds = rankedIds.slice(0, 3);
  const concepts = [
    ...input.evidenceMap.recurring_keywords,
    ...input.evidenceMap.recurring_concepts,
    ...input.evidenceMap.recurring_topics,
  ].slice(0, 6);
  const baseTopic = input.normalized.normalizedTopic || input.normalized.topic;
  const method = input.normalized.preferredMethodology || "revision y analisis academico trazable";
  const object = input.normalized.targetPopulation || "unidad de analisis definida en el intake";

  const makeIntake = (topic: string, modifier: string): IntakeInput => ({
    topic,
    problemContext: `${input.normalized.problemContext} En el refinamiento ${modifier}, se prioriza que la pregunta quede respaldada por literatura recuperable y no solo por una formulacion atractiva.`,
    researchLine: input.normalized.researchLine,
    academicConstraints: `${input.normalized.academicConstraints} Declarar brechas de cobertura bibliografica y no citar resultados no verificados.`,
    targetPopulation: object,
    availableData: `${input.normalized.availableData} Referencias exploratorias: ${references.slice(0, 3).map((reference) => reference.title).join("; ")}.`,
    preferredMethodology: method,
    advisorNotes: `Refinar busqueda con: ${concepts.join(", ")}. Mantener seleccion humana de fuentes antes del blueprint.`,
  });
  const makeFeasibility = (
    strategy: ImprovedIntakeAlternative["strategy"],
    scoreAdjustment: number,
  ): ImprovedIntakeAlternative["source_feasibility"] => {
    const score = Math.max(0, Math.min(100, sourceFeasibility.score_100 + scoreAdjustment));
    return {
      score_100: score,
      expected_source_count: sourceFeasibility.strong_candidate_count || references.length,
      expected_pdf_count: sourceFeasibility.probable_pdf_count,
      first_batch_candidate_ids: rankedIds.slice(0, 5),
      strongest_evidence_lanes: [
        sourceFeasibility.method_source_count > 0 ? "method" : null,
        sourceFeasibility.review_or_foundational_count > 0 ? "review_or_foundational" : null,
        sourceFeasibility.probable_pdf_count > 0 ? "probable_pdf" : null,
        sourceFeasibility.abstract_count > 0 ? "abstracts" : null,
      ].filter((value): value is string => Boolean(value)),
      weak_evidence_lanes: [
        sourceFeasibility.probable_pdf_count < 2 ? "pdf_coverage" : null,
        sourceFeasibility.contextual_source_count < 1 ? "local_or_contextual_sources" : null,
        sourceFeasibility.method_source_count < 1 ? "method_sources" : null,
      ].filter((value): value is string => Boolean(value)),
      risk_level: score >= 75 && strategy !== "ambiciosa" ? "low" : score >= 55 ? "medium" : "high",
    };
  };

  return [
    {
      option_id: "opt-conservadora",
      strategy: "conservadora",
      title: `${baseTopic}: enfoque viable con literatura consolidada`,
      research_question: `¿Como puede formularse un plan de investigacion viable sobre ${baseTopic} usando literatura academica consolidada y verificable?`,
      suggested_intake: makeIntake(`${baseTopic} con enfoque en evidencia consolidada`, "conservador"),
      evidence_rationale: "Prioriza los conceptos y fuentes con mejor cobertura inicial para reducir riesgo bibliografico.",
      expected_contribution: "Plan de tesis defendible con menor novedad pero mayor factibilidad documental.",
      feasibility_score_100: 82,
      novelty_score_100: 48,
      evidence_coverage_score_100: Math.min(90, 50 + references.length * 5),
      risks: ["Puede quedar demasiado amplio o poco novedoso si no se acota el objeto de estudio."],
      supporting_reference_ids: topIds,
      search_terms_for_step_3: concepts.slice(0, 8),
      source_feasibility: makeFeasibility("conservadora", 8),
    },
    {
      option_id: "opt-balanceada",
      strategy: "balanceada",
      title: `${baseTopic}: enfoque aplicado con brecha bibliografica controlada`,
      research_question: `¿Que brecha aplicada permite estudiar ${baseTopic} manteniendo suficiente respaldo bibliografico y viabilidad metodologica?`,
      suggested_intake: makeIntake(`${baseTopic} con brecha aplicada y alcance verificable`, "balanceado"),
      evidence_rationale: "Combina literatura central con conceptos emergentes para producir una pregunta mas defendible.",
      expected_contribution: "Tema con equilibrio entre novedad, factibilidad y trazabilidad para plan de tesis.",
      feasibility_score_100: 76,
      novelty_score_100: 68,
      evidence_coverage_score_100: Math.min(86, 44 + references.length * 5),
      risks: ["Requiere validar que la brecha no este ya resuelta por revisiones recientes."],
      supporting_reference_ids: topIds,
      search_terms_for_step_3: concepts.slice(0, 10),
      source_feasibility: makeFeasibility("balanceada", 0),
    },
    {
      option_id: "opt-ambiciosa",
      strategy: "ambiciosa",
      title: `${baseTopic}: enfoque novedoso guiado por gaps`,
      research_question: `¿Que pregunta novedosa sobre ${baseTopic} surge al cruzar patrones, limitaciones y vacios de la literatura inicial?`,
      suggested_intake: makeIntake(`${baseTopic} con enfoque en gaps, limitaciones y oportunidad metodologica`, "ambicioso"),
      evidence_rationale: "Usa senales de gaps y conceptos menos saturados para proponer mayor novedad.",
      expected_contribution: "Mayor potencial diferencial, con mas riesgo de requerir Deep Research y fuentes adicionales.",
      feasibility_score_100: 58,
      novelty_score_100: 82,
      evidence_coverage_score_100: Math.min(72, 35 + references.length * 4),
      risks: ["Puede requerir fuentes premium/full text o redireccion metodologica si la cobertura real es baja."],
      supporting_reference_ids: topIds,
      search_terms_for_step_3: concepts.slice(0, 12),
      source_feasibility: makeFeasibility("ambiciosa", -12),
    },
  ];
}

function buildRefinementPrompt(input: {
  normalized: NormalizedMvpIntake;
  evidenceMap: ReturnType<typeof buildEvidenceMap>;
}) {
  const payload = {
    normalized_intake: {
      topic: input.normalized.topic,
      normalizedTopic: input.normalized.normalizedTopic,
      problemContext: input.normalized.problemContext,
      researchLine: input.normalized.researchLine,
      academicConstraints: input.normalized.academicConstraints,
      targetPopulation: input.normalized.targetPopulation,
      availableData: input.normalized.availableData,
      preferredMethodology: input.normalized.preferredMethodology,
      advisorNotes: input.normalized.advisorNotes,
      knowledgeArea: input.normalized.knowledgeArea,
      retrievalHints: input.normalized.retrievalHints,
      safetyNotes: input.normalized.safetyNotes,
    },
    source_feasibility: input.evidenceMap.source_feasibility,
    recurring_signals: {
      concepts: input.evidenceMap.recurring_concepts.slice(0, 8),
      keywords: input.evidenceMap.recurring_keywords.slice(0, 8),
      topics: input.evidenceMap.recurring_topics.slice(0, 8),
      methods_detected: input.evidenceMap.methods_detected.slice(0, 6),
      coverage_notes: input.evidenceMap.coverage_notes.slice(0, 8),
    },
    references: input.evidenceMap.references.map((reference) => ({
      reference_id: reference.reference_id,
      title: reference.title,
      abstract_excerpt: reference.abstract_excerpt,
      year: reference.year,
      venue: reference.venue,
      doi: reference.doi,
      relevance_score: reference.relevance_score,
      score_label: reference.score_label,
      matched_keyword_groups: reference.matched_keyword_groups,
      abstract_available: reference.abstract_available,
      pdf_likelihood: reference.pdf_likelihood,
      has_pdf_url: Boolean(reference.pdf_url),
      open_access_signal: reference.open_access_signal,
      evidence_potential_score_100: reference.evidence_potential_score_100,
      evidence_roles: reference.evidence_roles,
    })),
  };

  return renderStep2EvidenceInformedRefinementPrompt(payload);
}

function normalizeAlternatives(alternatives: ImprovedIntakeAlternative[], fallback: ImprovedIntakeAlternative[]) {
  const fallbackByStrategy = new Map(fallback.map((option) => [option.strategy, option]));
  const fallbackIds = fallback[0]?.source_feasibility.first_batch_candidate_ids ?? [];

  const valid = alternatives
    .filter((option) => option.title?.trim() && option.suggested_intake?.topic?.trim())
    .map((option, index) => ({
      ...option,
      option_id: option.option_id || `opt-${index + 1}`,
      feasibility_score_100: Math.max(0, Math.min(100, option.feasibility_score_100 ?? 0)),
      novelty_score_100: Math.max(0, Math.min(100, option.novelty_score_100 ?? 0)),
      evidence_coverage_score_100: Math.max(0, Math.min(100, option.evidence_coverage_score_100 ?? 0)),
      risks: option.risks?.length ? option.risks.slice(0, 6) : ["Requiere validacion humana antes de avanzar."],
      supporting_reference_ids: option.supporting_reference_ids?.slice(0, 6) ?? [],
      search_terms_for_step_3: option.search_terms_for_step_3?.slice(0, 12) ?? [],
      source_feasibility: {
        ...(fallbackByStrategy.get(option.strategy)?.source_feasibility ?? fallback[0]?.source_feasibility),
        ...(option.source_feasibility ?? {}),
        score_100: Math.max(0, Math.min(100, option.source_feasibility?.score_100 ?? fallbackByStrategy.get(option.strategy)?.source_feasibility.score_100 ?? 0)),
        expected_source_count: Math.max(0, Math.min(30, option.source_feasibility?.expected_source_count ?? fallbackByStrategy.get(option.strategy)?.source_feasibility.expected_source_count ?? 0)),
        expected_pdf_count: Math.max(0, Math.min(30, option.source_feasibility?.expected_pdf_count ?? fallbackByStrategy.get(option.strategy)?.source_feasibility.expected_pdf_count ?? 0)),
        first_batch_candidate_ids: (option.source_feasibility?.first_batch_candidate_ids?.length
          ? option.source_feasibility.first_batch_candidate_ids
          : fallbackByStrategy.get(option.strategy)?.source_feasibility.first_batch_candidate_ids ?? fallbackIds).slice(0, 5),
        strongest_evidence_lanes: (option.source_feasibility?.strongest_evidence_lanes?.length
          ? option.source_feasibility.strongest_evidence_lanes
          : fallbackByStrategy.get(option.strategy)?.source_feasibility.strongest_evidence_lanes ?? ["abstracts"]).slice(0, 8),
        weak_evidence_lanes: (option.source_feasibility?.weak_evidence_lanes ?? fallbackByStrategy.get(option.strategy)?.source_feasibility.weak_evidence_lanes ?? []).slice(0, 8),
        risk_level: option.source_feasibility?.risk_level ?? fallbackByStrategy.get(option.strategy)?.source_feasibility.risk_level ?? "medium",
      },
    }))
    .slice(0, 3);

  return valid.length >= 3 ? valid : fallback;
}

function buildStep2ExecutionContext(input: { projectId: string; runId?: string; model?: string }) {
  const runId = input.runId ?? `mvp-step2-refinement-${randomUUID()}`;
  return {
    runId,
    artifactDir: path.join(process.cwd(), "artifacts-local", "mvp-step2-refinement", input.projectId, runId),
    artifactManifestPath: path.join(process.cwd(), "artifacts-local", "mvp-step2-refinement", input.projectId, runId, "step2-refinement.json"),
    startedAtIso: new Date().toISOString(),
    requestedModel: input.model ?? process.env.TOPIC_REFINEMENT_MODEL?.trim() ?? DEFAULT_TOPIC_REFINEMENT_MODEL,
  } satisfies Step2ExecutionContext;
}

function buildFrontendCable(alternatives: ImprovedIntakeAlternative[]): TopicRefinementResult["frontend_cable"] {
  return {
    intervention_point: "after_step_2",
    action: "choose_refined_intake_option",
    options: alternatives.slice(0, 3).map((option) => ({
      option_id: option.option_id,
      strategy: option.strategy,
      title: option.title,
      feasibility_score_100: option.feasibility_score_100,
      novelty_score_100: option.novelty_score_100,
      evidence_coverage_score_100: option.evidence_coverage_score_100,
      expected_pdf_count: option.source_feasibility.expected_pdf_count,
      risk_level: option.source_feasibility.risk_level,
    })),
  };
}

export async function runMvpEvidenceInformedTopicRefinement(input: {
  userId: string;
  projectId: string;
  model?: string;
  runId?: string;
}): Promise<TopicRefinementResult> {
  const execution = buildStep2ExecutionContext({
    projectId: input.projectId,
    runId: input.runId,
    model: input.model,
  });
  await mkdir(execution.artifactDir, { recursive: true });
  const usageBefore = await captureMvpApiUsageSnapshot();
  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_STEP2_KEY,
    status: "RUNNING",
    model: execution.requestedModel,
    promptVersion: MVP_STEP2_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      project_id: input.projectId,
      run_id: execution.runId,
    }),
    artifactDir: execution.artifactDir,
    artifactManifestPath: execution.artifactManifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_STEP2_REFINEMENT_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: execution.runId,
      step_run_id: stepRun.id,
      step_key: MVP_STEP2_KEY,
      started_at: execution.startedAtIso,
      artifact_dir: execution.artifactDir,
      prompt_version: MVP_STEP2_PROMPT_VERSION,
    }),
  });

  const warnings: string[] = [];
  const errors: string[] = [];
  let provider: Provider = Provider.SYSTEM;

  const normalization = await loadStep2NormalizedIntake({
    userId: input.userId,
    projectId: input.projectId,
  });
  if (normalization.source === "step1_fresh") {
    warnings.push("No se encontró un snapshot válido de Paso 1; Paso 2 generó una normalización fresca sin persistirla en el proyecto.");
  }
  const exploratoryDiscovery = await runMvpSourceDiscovery(input.userId, input.projectId, {
    desiredTotal: 10,
    batchKind: "more",
  });
  const references = await collectExploratoryReferences({
    projectId: input.projectId,
    searchSnapshot: exploratoryDiscovery.search?.searchSnapshot,
  });
  const evidenceMap = buildEvidenceMap(references);
  warnings.push(...evidenceMap.source_feasibility.warnings);
  errors.push(...evidenceMap.source_feasibility.blockers);
  const fallbackAlternatives = buildFallbackAlternatives({
    normalized: normalization.normalized,
    evidenceMap,
  });
  let alternatives = fallbackAlternatives;
  let recommendedOptionId: string | null = fallbackAlternatives[1]?.option_id ?? fallbackAlternatives[0]?.option_id ?? null;

  try {
    const generated = await withLlmUsageContext(
      {
        projectId: input.projectId,
        userId: input.userId,
        runId: execution.runId,
        stage: "topic_refinement",
        source: "runMvpEvidenceInformedTopicRefinement",
      },
      async () =>
        generateStructuredObjectWithTextFallback<{
          alternatives: ImprovedIntakeAlternative[];
          recommended_option_id: string;
          coverage_notes: string[];
        }>({
          provider: getConfiguredLlmProvider(),
          prompt: buildRefinementPrompt({ normalized: normalization.normalized, evidenceMap }),
          schemaName: "mvp_evidence_informed_topic_refinement",
          schema: topicRefinementSchema,
          model: execution.requestedModel,
          trackingAttribution: {
            projectId: input.projectId,
            userId: input.userId,
            runId: execution.runId,
            stage: "topic_refinement",
            source: "runMvpEvidenceInformedTopicRefinement",
          },
        }),
    );

    alternatives = normalizeAlternatives(generated.alternatives, fallbackAlternatives);
    recommendedOptionId = alternatives.some((option) => option.option_id === generated.recommended_option_id)
      ? generated.recommended_option_id
      : alternatives[0]?.option_id ?? null;
    evidenceMap.coverage_notes = [...evidenceMap.coverage_notes, ...generated.coverage_notes].slice(0, 10);
    provider = Provider.OPENAI;
  } catch (error) {
    provider = Provider.SYSTEM;
    warnings.push("No se pudo generar refinamiento LLM; se entregan alternativas deterministicas degradadas.");
    errors.push(error instanceof Error ? error.message : "Fallo desconocido en refinamiento LLM.");
  }

  const frontendCable = buildFrontendCable(alternatives);
  const completedAt = new Date();
  const durationMs = Math.max(0, completedAt.getTime() - Date.parse(execution.startedAtIso));
  const status = provider === Provider.OPENAI && evidenceMap.source_feasibility.readiness !== "blocked"
    ? "completed"
    : "partially_completed";
  const apiUsageReport = await buildMvpApiUsageReport({
    before: usageBefore,
    label: "mvp_step2_topic_refinement",
    filter: { projectId: input.projectId, runId: execution.runId },
  });

  const result: TopicRefinementResult = {
    artifact_type: STEP2_ARTIFACT_TYPE,
    artifact_version: "v1",
    step_key: MVP_STEP2_KEY,
    prompt_version: MVP_STEP2_PROMPT_VERSION,
    project_id: input.projectId,
    run_id: execution.runId,
    step_run_id: stepRun.id,
    status,
    artifact_dir: execution.artifactDir,
    artifact_manifest_path: execution.artifactManifestPath,
    started_at: execution.startedAtIso,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    source: provider === Provider.OPENAI ? "llm" : "fallback",
    model: provider === Provider.OPENAI ? execution.requestedModel : null,
    provider,
    normalized_intake: normalization.normalized,
    exploratory_discovery: {
      status: exploratoryDiscovery.status,
      candidate_source_count: exploratoryDiscovery.candidate_source_count,
      attempted_queries: exploratoryDiscovery.search?.attemptedQueries ?? [],
      search_query: exploratoryDiscovery.search?.searchQuery ?? null,
      keyword_groups: exploratoryDiscovery.search?.searchSnapshot.metadata.keywordGroups ?? null,
      query_pack: exploratoryDiscovery.search?.searchSnapshot.metadata.queryPack ?? null,
    },
    evidence_map: evidenceMap,
    alternatives,
    recommended_option_id: recommendedOptionId,
    frontend_cable: frontendCable,
    next_action_es:
      "Elige una de las 3 alternativas de intake. Luego Paso 3 mostrará las primeras 5 fuentes ya persistidas para esa opción.",
    warnings,
    errors,
    api_usage: {
      run_id: execution.runId,
      report: apiUsageReport,
    },
  };

  await writeFile(execution.artifactManifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(execution.artifactDir, "api-usage-report.json"), `${JSON.stringify(apiUsageReport, null, 2)}\n`, "utf8");

  await updateMvpStepRun(stepRun.id, {
    status: status === "completed" ? "COMPLETED" : "PARTIALLY_COMPLETED",
    provider,
    model: provider === Provider.OPENAI ? execution.requestedModel : null,
    promptVersion: MVP_STEP2_PROMPT_VERSION,
    outputSnapshotJson: asStepRunJson(result),
    warningsJson: asStepRunJson(warnings),
    errorsJson: asStepRunJson(errors),
    fallbackUsed: provider !== Provider.OPENAI,
    artifactDir: execution.artifactDir,
    artifactManifestPath: execution.artifactManifestPath,
    finishedAt: completedAt,
  });

  await logAuditEvent({
    eventType: "MVP_STEP2_REFINEMENT_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: execution.runId,
      step_run_id: stepRun.id,
      status,
      source: result.source,
      model: result.model,
      normalized_intake_source: normalization.source,
      step1_run_id: normalization.step1_run_id,
      prompt_version: MVP_STEP2_PROMPT_VERSION,
      started_at: execution.startedAtIso,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      artifact_dir: execution.artifactDir,
      artifact_manifest_path: execution.artifactManifestPath,
      feasibility: evidenceMap.source_feasibility,
      frontend_cable: frontendCable,
      warnings,
      errors,
      api_usage_delta: apiUsageReport.filtered_delta,
    }),
  });

  return result;
}

export async function applyMvpStep2IntakeChoice(input: {
  userId: string;
  projectId: string;
  optionId: string;
  stepRunId?: string;
}) {
  const stepRun = await prisma.mvpStepRun.findFirst({
    where: {
      id: input.stepRunId ?? undefined,
      projectId: input.projectId,
      userId: input.userId,
      stepKey: MVP_STEP2_KEY,
    },
    orderBy: { startedAt: "desc" },
  });

  if (!stepRun) {
    throw new Error("No se encontró un run de Paso 2 para aplicar la selección.");
  }

  const snapshot = asRecord(stepRun.outputSnapshotJson);
  const alternatives = Array.isArray(snapshot?.alternatives)
    ? (snapshot.alternatives as unknown[]).map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const selected = alternatives.find((item) => item.option_id === input.optionId);
  let suggestedIntake: IntakeInput | null = null;

  try {
    suggestedIntake = selected?.suggested_intake ? parseIntakeInput(selected.suggested_intake) : null;
  } catch {
    suggestedIntake = null;
  }

  if (!selected || !suggestedIntake?.topic) {
    throw new Error(`La opción ${input.optionId} no existe o no contiene suggested_intake válido.`);
  }

  await saveIntakeForProject(input.userId, input.projectId, suggestedIntake);

  const firstBatchCandidateIds = asRecord(selected.source_feasibility)?.first_batch_candidate_ids;
  const rawFirstBatchCandidateIds = Array.isArray(firstBatchCandidateIds)
    ? firstBatchCandidateIds.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  const existingProjectReferences = rawFirstBatchCandidateIds.length > 0
    ? await prisma.projectReference.findMany({
        where: {
          projectId: input.projectId,
          referenceId: { in: rawFirstBatchCandidateIds },
        },
        select: { referenceId: true },
      })
    : [];
  const existingReferenceIds = new Set(existingProjectReferences.map((item) => item.referenceId));
  const result = {
    project_id: input.projectId,
    step_run_id: stepRun.id,
    selected_option_id: input.optionId,
    selected_strategy: typeof selected.strategy === "string" ? selected.strategy : null,
    first_batch_candidate_ids: rawFirstBatchCandidateIds.filter((id) => existingReferenceIds.has(id)),
    discarded_candidate_ids: rawFirstBatchCandidateIds.filter((id) => !existingReferenceIds.has(id)),
    next_action_es: "Paso 2 aplicado. Paso 3 debe mostrar primero las fuentes candidatas asociadas a la opción elegida.",
  };

  await logAuditEvent({
    eventType: "MVP_STEP2_REFINEMENT_OPTION_SELECTED",
    actorType: ActorType.USER,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson(result),
  });

  return result;
}
