import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Prisma, Provider } from "@prisma/client";

import { normalizeTitle, extractSearchTerms } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  buildOpenAlexAbstract,
  fetchOpenAlexWork,
  fetchOpenAlexWorksCiting,
  type OpenAlexWork,
} from "@/server/retrieval/openalex-client";
import { extractAccessSignals } from "@/server/retrieval/reference-access";

const MAX_REFERENCED_WORKS_TO_HYDRATE = 10;
const MAX_RELATED_WORKS_TO_HYDRATE = 8;
const MAX_CITED_BY_WORKS = 8;

export type MvpSourceEnrichmentDecision =
  | "READY_FOR_THESIS_PLAN"
  | "READY_FOR_THESIS_PLAN_WITH_WARNINGS"
  | "NEEDS_TARGETED_DEEP_RESEARCH"
  | "NEEDS_SOURCE_REPLACEMENT";

export type MvpEnrichedWorkSummary = {
  openalex_id: string | null;
  doi: string | null;
  title: string | null;
  year: number | null;
  type: string | null;
  venue: string | null;
  cited_by_count: number;
  has_abstract: boolean;
  abstract_chars: number;
  topics: string[];
  keywords: string[];
  concepts: string[];
  is_oa: boolean;
  oa_status: string | null;
  has_pdf_url: boolean;
  has_fulltext: boolean;
  referenced_works_count: number;
  related_works_count: number;
};

export type MvpSourceQualityScores = {
  thesis_plan_score: number;
  thematic_relevance_score: number;
  methodological_value_score: number;
  theoretical_value_score: number;
  authority_score: number;
  accessibility_score: number;
  graph_centrality_score: number;
  diversity_score: number;
  labels: Array<
    | "core_theory_candidate"
    | "methodology_candidate"
    | "state_of_art_candidate"
    | "context_candidate"
    | "backup_or_replace"
    | "requires_full_text_later"
  >;
  reasons: string[];
};

export type MvpSourceEnrichmentItem = {
  source_id: string;
  selected_order: number | null;
  title: string;
  doi: string | null;
  openalex_id: string | null;
  refreshed_from_openalex: boolean;
  source_summary: MvpEnrichedWorkSummary;
  referenced_works_sample: MvpEnrichedWorkSummary[];
  related_works_sample: MvpEnrichedWorkSummary[];
  cited_by_sample: MvpEnrichedWorkSummary[];
  quality: MvpSourceQualityScores;
  evidence_depth: "full_text_signal" | "pdf_signal" | "abstract_plus_graph" | "metadata_limited";
  warnings: string[];
};

export type MvpSourceEnrichmentResult = {
  artifact_type: "mvp_source_enrichment";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  decision: MvpSourceEnrichmentDecision;
  selected_source_count: number;
  abstract_source_count: number;
  full_text_signal_count: number;
  pdf_signal_count: number;
  high_relevance_source_count: number;
  methodology_candidate_count: number;
  theory_candidate_count: number;
  review_or_state_of_art_count: number;
  graph_reference_count: number;
  graph_related_count: number;
  graph_cited_by_count: number;
  missing_evidence_categories: string[];
  recommended_deep_research_questions: string[];
  warnings: string[];
  blockers: string[];
  items: MvpSourceEnrichmentItem[];
};

type SelectedReference = NonNullable<Awaited<ReturnType<typeof loadSelectedReferences>>>[number];

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function openAlexIdTail(value: string | null | undefined) {
  return value?.replace(/^https?:\/\/openalex\.org\//, "") ?? null;
}

function scoreClamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function workTitle(work: OpenAlexWork | null | undefined) {
  return work?.display_name?.trim() || null;
}

function workVenue(work: OpenAlexWork | null | undefined) {
  return work?.primary_location?.source?.display_name?.trim() || null;
}

function namedList(values: unknown, max = 12) {
  return asArray(values)
    .map((item) => {
      const record = asRecord(item);
      return asString(record?.display_name) ?? asString(record?.keyword) ?? asString(record?.name);
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, max);
}

function summarizeWork(work: OpenAlexWork | null): MvpEnrichedWorkSummary {
  const best = work?.best_oa_location ?? null;
  const primary = work?.primary_location ?? null;
  const openAccess = work?.open_access ?? null;
  const abstract = buildOpenAlexAbstract(work?.abstract_inverted_index);
  return {
    openalex_id: work?.id ?? null,
    doi: work?.doi?.replace("https://doi.org/", "") ?? null,
    title: workTitle(work),
    year: work?.publication_year ?? null,
    type: work?.type ?? null,
    venue: workVenue(work),
    cited_by_count: work?.cited_by_count ?? 0,
    has_abstract: Boolean(abstract),
    abstract_chars: abstract?.length ?? 0,
    topics: namedList(work?.topics, 8),
    keywords: namedList(work?.keywords, 12),
    concepts: namedList(work?.concepts, 12),
    is_oa: Boolean(openAccess?.is_oa),
    oa_status: asString((openAccess as Record<string, unknown> | null)?.oa_status),
    has_pdf_url: Boolean(best?.pdf_url || primary?.pdf_url),
    has_fulltext: Boolean(work?.has_fulltext || best?.pdf_url || primary?.pdf_url || openAccess?.oa_url),
    referenced_works_count: work?.referenced_works_count ?? work?.referenced_works?.length ?? 0,
    related_works_count: work?.related_works?.length ?? 0,
  };
}

function textBag(input: { project: { title: string; topicSeedText: string | null }; intake: { topic: string; problemContext: string | null; preferredMethodology: string | null; targetPopulation: string | null; researchLine: string | null } | null }) {
  return [
    input.project.title,
    input.project.topicSeedText,
    input.intake?.topic,
    input.intake?.problemContext,
    input.intake?.preferredMethodology,
    input.intake?.targetPopulation,
    input.intake?.researchLine,
  ]
    .filter(Boolean)
    .join(" ");
}

function countTermMatches(haystack: string, terms: string[]) {
  const normalized = normalizeTitle(haystack);
  const matched = terms.filter((term) => normalized.includes(normalizeTitle(term)));
  return { count: matched.length, matched };
}

const METHOD_TERMS = [
  "method", "methodology", "model", "simulation", "monte carlo", "bayesian", "sensitivity",
  "reliability index", "probability of failure", "limit state", "sampling", "finite element",
  "metodo", "metodologia", "modelo", "simulacion", "indice de confiabilidad", "probabilidad de falla",
];
const THEORY_TERMS = [
  "theory", "framework", "review", "state of the art", "structural reliability", "fatigue",
  "seismic", "bridge", "steel", "uncertainty", "risk", "teoria", "marco", "revision",
  "estado del arte", "confiabilidad estructural", "puente", "acero", "incertidumbre",
];
const REVIEW_TERMS = ["review", "state of the art", "survey", "literature", "estado del arte", "revision"];

function scoreSource(input: {
  projectTerms: string[];
  source: SelectedReference;
  work: OpenAlexWork | null;
  summary: MvpEnrichedWorkSummary;
  referenced: MvpEnrichedWorkSummary[];
  related: MvpEnrichedWorkSummary[];
  citedBy: MvpEnrichedWorkSummary[];
}): MvpSourceQualityScores {
  const abstract = buildOpenAlexAbstract(input.work?.abstract_inverted_index) ?? input.source.reference.abstract ?? "";
  const combined = [
    input.source.reference.title,
    abstract,
    input.summary.topics.join(" "),
    input.summary.keywords.join(" "),
    input.summary.concepts.join(" "),
  ].join(" ");
  const projectMatches = countTermMatches(combined, input.projectTerms);
  const methodMatches = countTermMatches(combined, METHOD_TERMS);
  const theoryMatches = countTermMatches(combined, THEORY_TERMS);
  const reviewMatches = countTermMatches(combined, REVIEW_TERMS);

  const thematic = scoreClamp(35 + projectMatches.count * 12 + input.summary.topics.length * 4 + input.summary.keywords.length * 2);
  const methodological = scoreClamp(methodMatches.count * 16 + (input.summary.type === "article" ? 10 : 0));
  const theoretical = scoreClamp(theoryMatches.count * 12 + reviewMatches.count * 18 + Math.min(input.summary.referenced_works_count, 60) * 0.5);
  const authority = scoreClamp(
    Math.min(input.summary.cited_by_count, 120) * 0.55 +
      (input.summary.type === "review" ? 18 : 0) +
      (input.summary.year && input.summary.year >= 2020 ? 12 : input.summary.year && input.summary.year >= 2015 ? 6 : 0),
  );
  const accessibility = scoreClamp(
    (input.summary.has_fulltext ? 45 : 0) +
      (input.summary.has_pdf_url ? 30 : 0) +
      (input.summary.has_abstract ? 20 : 0) +
      (input.summary.is_oa ? 5 : 0),
  );
  const graph = scoreClamp(
    Math.min(input.summary.referenced_works_count, 80) * 0.55 +
      input.related.length * 3 +
      input.citedBy.length * 4 +
      Math.min(input.summary.cited_by_count, 100) * 0.15,
  );
  const diversity = scoreClamp(
    20 +
      (input.summary.type === "review" ? 20 : 0) +
      (input.summary.topics.length > 0 ? 20 : 0) +
      (input.summary.keywords.length > 0 ? 15 : 0) +
      (input.summary.venue ? 10 : 0),
  );
  const thesisPlan = scoreClamp(
    thematic * 0.25 +
      methodological * 0.16 +
      theoretical * 0.18 +
      authority * 0.13 +
      accessibility * 0.12 +
      graph * 0.12 +
      diversity * 0.04,
  );

  const labels: MvpSourceQualityScores["labels"] = [];
  if (theoretical >= 55) labels.push("core_theory_candidate");
  if (methodological >= 45) labels.push("methodology_candidate");
  if (input.summary.type === "review" || reviewMatches.count > 0 || input.summary.referenced_works_count >= 80) labels.push("state_of_art_candidate");
  if (thematic >= 55 && labels.length === 0) labels.push("context_candidate");
  if (!input.summary.has_fulltext && !input.summary.has_pdf_url) labels.push("requires_full_text_later");
  if (thesisPlan < 45) labels.push("backup_or_replace");

  const reasons = unique([
    projectMatches.count > 0 ? `Coincide con términos del proyecto: ${projectMatches.matched.slice(0, 5).join(", ")}` : null,
    methodMatches.count > 0 ? `Aporta señales metodológicas: ${methodMatches.matched.slice(0, 5).join(", ")}` : null,
    theoryMatches.count > 0 ? `Aporta señales teóricas: ${theoryMatches.matched.slice(0, 5).join(", ")}` : null,
    input.summary.referenced_works_count > 0 ? `Tiene ${input.summary.referenced_works_count} referencias cruzadas en OpenAlex.` : null,
    input.citedBy.length > 0 ? `Se recuperaron ${input.citedBy.length} trabajos que la citan.` : null,
    input.summary.has_fulltext ? "OpenAlex reporta full text/PDF/ubicación abierta o equivalente." : "Sin señal full text; útil para plan, no para marco teórico final.",
  ]);

  return {
    thesis_plan_score: thesisPlan,
    thematic_relevance_score: thematic,
    methodological_value_score: methodological,
    theoretical_value_score: theoretical,
    authority_score: authority,
    accessibility_score: accessibility,
    graph_centrality_score: graph,
    diversity_score: diversity,
    labels,
    reasons,
  };
}

async function loadSelectedReferences(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  return project.projectReferences;
}

async function loadProjectContext(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { intake: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  return project;
}

async function hydrateWorkSummaries(ids: string[], limit: number) {
  const summaries: MvpEnrichedWorkSummary[] = [];
  for (const id of unique(ids).slice(0, limit)) {
    const work = await fetchOpenAlexWork(id).catch(() => null);
    if (work) summaries.push(summarizeWork(work));
  }
  return summaries;
}

async function enrichOne(input: {
  source: SelectedReference;
  projectTerms: string[];
  artifactDir: string;
}): Promise<MvpSourceEnrichmentItem> {
  const { source } = input;
  const warnings: string[] = [];
  const raw = asRecord(source.reference.rawOpenAlexJson);
  const rawOpenAlexId = asString(raw?.id) ?? source.reference.openAlexId;
  const refreshed = rawOpenAlexId ? await fetchOpenAlexWork(rawOpenAlexId).catch(() => null) : null;
  const work = refreshed ?? (raw as OpenAlexWork | null);

  if (!refreshed) {
    warnings.push("No se pudo refrescar OpenAlex live; se usa snapshot local si existe.");
  } else {
    await prisma.reference.update({
      where: { id: source.referenceId },
      data: {
        rawOpenAlexJson: refreshed as unknown as Prisma.InputJsonValue,
        abstract: buildOpenAlexAbstract(refreshed.abstract_inverted_index) ?? source.reference.abstract,
        citationCount: refreshed.cited_by_count ?? source.reference.citationCount,
        landingPageUrl:
          refreshed.best_oa_location?.landing_page_url ??
          refreshed.open_access?.oa_url ??
          refreshed.primary_location?.landing_page_url ??
          source.reference.landingPageUrl,
      },
    });
  }

  const sourceSummary = summarizeWork(work);
  const referenced = await hydrateWorkSummaries(work?.referenced_works ?? [], MAX_REFERENCED_WORKS_TO_HYDRATE);
  const related = await hydrateWorkSummaries(work?.related_works ?? [], MAX_RELATED_WORKS_TO_HYDRATE);
  const citedBy = work?.id ? (await fetchOpenAlexWorksCiting(work.id, { perPage: MAX_CITED_BY_WORKS })).map(summarizeWork) : [];
  const access = extractAccessSignals({
    rawOpenAlexJson: refreshed ?? source.reference.rawOpenAlexJson,
    landingPageUrl: source.reference.landingPageUrl,
    doi: source.reference.doi,
  });
  const evidenceDepth = sourceSummary.has_fulltext
    ? "full_text_signal"
    : access.pdfUrl
      ? "pdf_signal"
      : sourceSummary.has_abstract && (sourceSummary.referenced_works_count > 0 || sourceSummary.related_works_count > 0)
        ? "abstract_plus_graph"
        : "metadata_limited";

  const quality = scoreSource({
    projectTerms: input.projectTerms,
    source,
    work,
    summary: sourceSummary,
    referenced,
    related,
    citedBy,
  });

  return {
    source_id: source.referenceId,
    selected_order: source.selectedOrder,
    title: source.reference.title,
    doi: source.reference.doi,
    openalex_id: sourceSummary.openalex_id ?? rawOpenAlexId,
    refreshed_from_openalex: Boolean(refreshed),
    source_summary: sourceSummary,
    referenced_works_sample: referenced,
    related_works_sample: related,
    cited_by_sample: citedBy,
    quality,
    evidence_depth: evidenceDepth,
    warnings,
  };
}

function decide(items: MvpSourceEnrichmentItem[]): Omit<MvpSourceEnrichmentResult, "artifact_type" | "artifact_version" | "generated_at" | "project_id" | "run_id" | "artifact_dir" | "items"> {
  const abstractSourceCount = items.filter((item) => item.source_summary.has_abstract).length;
  const fullTextSignalCount = items.filter((item) => item.source_summary.has_fulltext).length;
  const pdfSignalCount = items.filter((item) => item.source_summary.has_pdf_url).length;
  const highRelevanceSourceCount = items.filter((item) => item.quality.thematic_relevance_score >= 60 || item.quality.thesis_plan_score >= 60).length;
  const methodologyCandidateCount = items.filter((item) => item.quality.labels.includes("methodology_candidate")).length;
  const theoryCandidateCount = items.filter((item) => item.quality.labels.includes("core_theory_candidate")).length;
  const reviewOrStateCount = items.filter((item) => item.quality.labels.includes("state_of_art_candidate") || item.source_summary.type === "review").length;
  const graphReferenceCount = items.reduce((sum, item) => sum + item.source_summary.referenced_works_count, 0);
  const graphRelatedCount = items.reduce((sum, item) => sum + item.related_works_sample.length, 0);
  const graphCitedByCount = items.reduce((sum, item) => sum + item.cited_by_sample.length, 0);
  const missing: string[] = [];
  const warnings = unique(items.flatMap((item) => item.warnings));
  const blockers: string[] = [];

  if (items.length < 5) missing.push("selected_source_count");
  if (abstractSourceCount < Math.min(4, items.length)) missing.push("abstract_coverage");
  if (highRelevanceSourceCount < 3) missing.push("high_relevance_sources");
  if (methodologyCandidateCount < 1) missing.push("methodology_candidate");
  if (theoryCandidateCount < 1) missing.push("theory_candidate");
  if (reviewOrStateCount < 1) missing.push("review_or_state_of_art_source");
  if (graphReferenceCount < 20) missing.push("reference_graph_depth");

  let decision: MvpSourceEnrichmentDecision = "READY_FOR_THESIS_PLAN";
  if (items.length < 3 || abstractSourceCount < 2 || highRelevanceSourceCount < 2) {
    decision = "NEEDS_SOURCE_REPLACEMENT";
    blockers.push("La base seleccionada aún no alcanza suficiencia mínima para plan de tesis trazable.");
  } else if (missing.length > 0) {
    decision = "NEEDS_TARGETED_DEEP_RESEARCH";
    warnings.push("La base sirve para planificar, pero requiere Deep Research ligero focalizado para cubrir vacíos.");
  } else if (fullTextSignalCount < 3) {
    decision = "READY_FOR_THESIS_PLAN_WITH_WARNINGS";
    warnings.push("Suficiente para plan de tesis; full text adicional se requerirá antes de redactar marco teórico final.");
  }

  const recommendedDeepResearchQuestions = unique([
    missing.includes("methodology_candidate") ? "Buscar 2-3 fuentes metodológicas sobre modelos de confiabilidad estructural aplicables a puentes metálicos/armaduras." : null,
    missing.includes("theory_candidate") ? "Buscar fuentes teóricas base sobre confiabilidad estructural, índice beta, estados límite y probabilidad de falla." : null,
    missing.includes("review_or_state_of_art_source") ? "Buscar una revisión o estado del arte reciente sobre evaluación de fatiga/confiabilidad en puentes de acero." : null,
    fullTextSignalCount < 3 ? "Identificar fuentes open access o con texto completo para sustentar el futuro marco teórico." : null,
    missing.includes("reference_graph_depth") ? "Expandir referencias cruzadas de las fuentes seleccionadas para reconstruir base teórica mínima." : null,
  ]);

  return {
    decision,
    selected_source_count: items.length,
    abstract_source_count: abstractSourceCount,
    full_text_signal_count: fullTextSignalCount,
    pdf_signal_count: pdfSignalCount,
    high_relevance_source_count: highRelevanceSourceCount,
    methodology_candidate_count: methodologyCandidateCount,
    theory_candidate_count: theoryCandidateCount,
    review_or_state_of_art_count: reviewOrStateCount,
    graph_reference_count: graphReferenceCount,
    graph_related_count: graphRelatedCount,
    graph_cited_by_count: graphCitedByCount,
    missing_evidence_categories: missing,
    recommended_deep_research_questions: recommendedDeepResearchQuestions,
    warnings,
    blockers,
  };
}

function markdownSummary(result: MvpSourceEnrichmentResult) {
  const lines = [
    `# MVP Source Enrichment — ${result.project_id}`,
    "",
    `Decision: **${result.decision}**`,
    `Selected sources: ${result.selected_source_count}`,
    `Abstract coverage: ${result.abstract_source_count}/${result.selected_source_count}`,
    `Full-text signals: ${result.full_text_signal_count}`,
    `PDF signals: ${result.pdf_signal_count}`,
    `Graph: ${result.graph_reference_count} referenced works, ${result.graph_related_count} related samples, ${result.graph_cited_by_count} cited-by samples`,
    "",
    "## Missing / Deep Research targets",
    ...(result.missing_evidence_categories.length ? result.missing_evidence_categories.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Recommended Deep Research questions",
    ...(result.recommended_deep_research_questions.length ? result.recommended_deep_research_questions.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Sources",
  ];

  for (const item of result.items) {
    lines.push(
      "",
      `### ${item.selected_order ?? "?"}. ${item.title}`,
      `- Score thesis plan: ${item.quality.thesis_plan_score}`,
      `- Labels: ${item.quality.labels.join(", ") || "none"}`,
      `- Evidence depth: ${item.evidence_depth}`,
      `- Abstract: ${item.source_summary.has_abstract ? "yes" : "no"}; refs: ${item.source_summary.referenced_works_count}; cited by: ${item.source_summary.cited_by_count}`,
      `- Topics: ${item.source_summary.topics.join("; ") || "n/a"}`,
      `- Keywords: ${item.source_summary.keywords.join("; ") || "n/a"}`,
      "- Reasons:",
      ...(item.quality.reasons.length ? item.quality.reasons.map((reason) => `  - ${reason}`) : ["  - n/a"]),
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function runMvpSourceEnrichment(input: { userId: string; projectId: string; runId?: string }) {
  const runId = input.runId ?? `mvp-source-enrichment-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-source-enrichment", input.projectId, runId);
  await mkdir(artifactDir, { recursive: true });

  const project = await loadProjectContext(input.userId, input.projectId);
  const selected = await loadSelectedReferences(input.userId, input.projectId);
  if (selected.length === 0) {
    throw new Error("No hay fuentes seleccionadas para enriquecer.");
  }

  const projectTerms = extractSearchTerms(textBag({ project, intake: project.intake }), { maxTerms: 16, minLength: 4 });
  const items: MvpSourceEnrichmentItem[] = [];
  for (const source of selected) {
    items.push(await enrichOne({ source, projectTerms, artifactDir }));
  }

  const metrics = decide(items);
  const result: MvpSourceEnrichmentResult = {
    artifact_type: "mvp_source_enrichment",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    project_id: input.projectId,
    run_id: runId,
    artifact_dir: artifactDir,
    ...metrics,
    items,
  };

  const reportPath = path.join(artifactDir, "source-enrichment-report.json");
  const summaryPath = path.join(artifactDir, "source-graph-summary.md");
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, markdownSummary(result), "utf8");

  await logAuditEvent({
    eventType: "MVP_SOURCE_ENRICHMENT_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider: Provider.OPENALEX,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      run_id: runId,
      artifact_dir: artifactDir,
      decision: result.decision,
      selected_source_count: result.selected_source_count,
      abstract_source_count: result.abstract_source_count,
      full_text_signal_count: result.full_text_signal_count,
      graph_reference_count: result.graph_reference_count,
      missing_evidence_categories: result.missing_evidence_categories,
    } as Prisma.InputJsonValue,
  });

  return result;
}
