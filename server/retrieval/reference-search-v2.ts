import { recoverExploratoryCache } from "./recover-exploratory-cache";
import { REFERENCE_SEARCH_V2_1_PROMPT } from "@/server/mvp/prompts/reference-search-v2.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { Prisma, ProjectStatus, Provider } from "@prisma/client";

import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { resolveLanguageContext } from "@/lib/language";
import { buildSearchQuery, extractSearchTerms, normalizeTitle } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { confirmedScientificDefinitionMatches } from "@/lib/conversational-intake";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { freezeSearchInput, searchInputIsStale, type SearchInput, type SearchInputTrace } from "./search-intent-service";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import { enrichmentGroups, semanticPlannerInput, semanticQueryPack, fallbackSearchEnrichment, type SearchEnrichment, type SemanticKeywordGroup } from "@/lib/retrieval-semantic-plan";
import { planSemanticSearch, searchEnrichmentModel } from "./semantic-search-planner";
import { REFERENCE_SEARCH_V2_2_PROMPT } from "@/server/mvp/prompts/reference-search-v2.v2";
import { assessSemanticRelevance, type SemanticRelevance } from "./semantic-relevance";
import { QUERY_COMPOSITION_VERSION, validateScientificQueryPlan, type ScientificQuery } from "@/lib/retrieval-query-composition";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { reviewCandidateBatch } from "./candidate-semantic-review";
import { recoverCachedCentralTranslations, recoverCentralTranslations, recoveryModel } from "./search-concept-translation";
import { SEARCH_CONCEPT_TRANSLATION_PROMPT } from "@/server/mvp/prompts/search-concept-translation.v1";
import { currentPaidOperation } from "@/server/mvp/pre-job-budget";
import { chooseSafeSearchPlan, SearchPlanningError, validateSearchPlan } from "@/lib/search-planning-outcome";
import { candidateMetadataHash, CANDIDATE_REVIEW_VERSION, MAX_RECOMMENDATIONS, type CandidateAssessment, type ReviewCandidate } from "./candidate-review-policy";

import {
  type CrossrefMessage,
  resolveCrossrefTitle,
  searchCrossrefWorks,
} from "./crossref-client";
import { extractAccessSignals } from "./reference-access";
import { OPENALEX_QUALITY_FILTERS, OpenAlexRequestError, searchOpenAlexWorks } from "./openalex-client";
import { settleFailedSearch } from "./search-failure-state";
import { sourceRelevanceTier } from "./source-relevance-tier";
import { decideReferenceAdmission, REFERENCE_ADMISSION_POLICY_VERSION, type ReferenceAdmission } from "./reference-admission";
import { PROVIDER_CACHE_TTL_MS, PROVIDER_QUERY_POLICY_VERSION, providerQueryHash, renderCrossrefFamily,
  sameScientificWork, selectProviderQueries, normalizeScholarlyDoi, scholarlyVersionClass, type ExecutedProviderQuery, type ProviderQuery } from "./provider-query-policy";

export type ReferenceKeywordGroup = {
  label: string;
  variants: string[];
} & Partial<Omit<SemanticKeywordGroup, "label" | "variants">>;

export type ReferenceSearchV2Metadata = {
  enrichment?: SearchEnrichment;
  planning?: { model: string; promptVersion: string; policyVersion: string; cacheKey: string;
    replayedFromCompositionVersion?: string; replayedFromPlanOperationId?: string };
  planSource: "llm" | "fallback";
  normalizedTopic: string;
  intentSummary: string;
  keywordGroups: {
    necessary: ReferenceKeywordGroup[];
    complementary: ReferenceKeywordGroup[];
    optional: ReferenceKeywordGroup[];
  };
  queryPack: {
    conceptPlan?: ScientificConceptPlan;
    coverageMode?: string;
    compositionVersion?: string;
    plannedQueries?: ScientificQuery[];
    validation?: { valid: boolean; reasons: string[] };
    necessaryOnly: string[];
    complementaryBoosted: string[];
    optionalBackups: string[];
  };
  focusTerms: string[];
  localObjectTerms?: string[];
  scoringRules: string[];
  openAlexQueryPack?: {
    strictBoolean: string[];
    precisionBoolean: string[];
    fallbackPlain: string[];
    localLanguage?: string[];
  };
};

export type ReferenceScoreBreakdown = {
  candidateAssessment?: CandidateAssessment;
  semanticRelevance?: SemanticRelevance;
  label: "ALTO" | "MEDIO" | "BAJO" | "MINIMO";
  necessaryMatches: string[];
  complementaryMatches: string[];
  optionalMatches: string[];
  recencyBand: string;
  recencyBonus: number;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  coverageRatio?: number;
  citationBonus?: number;
  qualityBonus?: number;
  penalties?: string[];
};

export type ProjectReferenceSearchSnapshot = {
  semanticReview?: Awaited<ReturnType<typeof reviewCandidateBatch>>["trace"];
  referenceSearchVersion: "v2";
  inputTrace?: SearchInputTrace;
  stale?: boolean;
  batchKind?: SourceDiscoveryBatchKind;
  savedAt: string;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  queryPlanHash?: string;
  executedQueries?: ExecutedProviderQuery[];
  cacheHits?: number;
  cacheMisses?: number;
  discoveryObservations?: Array<{ candidateKey: string; provider: "OPENALEX" | "CROSSREF"; queryHash: string }>;
  resultState?: "NO_RELEVANT_INITIAL_RESULTS" | "MORE_FOUND_NEW_RESULTS" | "NO_NEW_RELEVANT_RESULTS" | "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN";
  baseSelectedReferenceIds: string[];
  metadata: ReferenceSearchV2Metadata;
  admissionPolicyVersion?: typeof REFERENCE_ADMISSION_POLICY_VERSION;
  candidateAdmissions?: Array<{
    candidateKey: string;
    title: string;
    doi: string | null;
    year: number | null;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    admission: ReferenceAdmission;
    inspectionMetadata?: { abstract: string | null; authors: string[]; venue: string | null; access: ReturnType<typeof extractAccessSignals> };
  }>;
  references: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    admission?: ReferenceAdmission;
    suggestedSelectedOrder: number | null;
    pdfUrl?: string | null;
    pdfAccessible?: boolean;
    accessStatus?: "REPORTED_PDF" | "UNKNOWN";
  }>;
};

export type SourceDiscoveryBatchKind = "initial" | "more";

export type SearchProjectReferencesV2Result = {
  batchKind: SourceDiscoveryBatchKind;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  createdCount: number;
  updatedCount: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  searchSnapshot: ProjectReferenceSearchSnapshot;
};

type KeywordGroupSchemaItem = {
  label: string;
  variants: string[];
};

type ReferenceSearchPlanSchema = {
  normalized_topic: string;
  intent_summary: string;
  keyword_groups: {
    necessary: KeywordGroupSchemaItem[];
    complementary: KeywordGroupSchemaItem[];
    optional: KeywordGroupSchemaItem[];
  };
  query_pack: {
    necessary_only: string[];
    complementary_boosted: string[];
    optional_backups: string[];
  };
  focus_terms: string[];
};

type SearchCandidate = {
  sourceProvider: Provider;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  coverageRatio?: number;
  citationBonus?: number;
  qualityBonus?: number;
  penalties?: string[];
  openAlexId: string | null;
  doi: string | null;
  title: string | null;
  normalizedTitle: string | null;
  language?: string | null;
  authors: string[];
  abstract: string | null;
  venue: string | null;
  year: number | null;
  workType: string | null;
  landingPageUrl: string | null;
  citationCount: number;
  rawOpenAlexJson: unknown | null;
  rawCrossrefJson: CrossrefMessage | null;
};

type RankedCandidate = {
  candidate: SearchCandidate;
  resolvedTitle: string;
  normalizedTitle: string;
  authors: string[];
  abstract: string | null;
  venue: string | null;
  year: number | null;
  workType: string | null;
  landingPageUrl: string | null;
  citationCount: number;
  crossrefMetadata: CrossrefMessage | null;
  score: number;
  scoreBreakdown: ReferenceScoreBreakdown;
  admission: ReferenceAdmission;
  pdfUrl: string | null;
  pdfAccessible: boolean;
};

const referenceSearchPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "normalized_topic",
    "intent_summary",
    "keyword_groups",
    "query_pack",
    "focus_terms",
  ],
  properties: {
    normalized_topic: { type: "string", minLength: 8, maxLength: 220 },
    intent_summary: { type: "string", minLength: 12, maxLength: 320 },
    keyword_groups: {
      type: "object",
      additionalProperties: false,
      required: ["necessary", "complementary", "optional"],
      properties: {
        necessary: { type: "array", minItems: 2, maxItems: 6, items: keywordGroupItemSchema() },
        complementary: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: keywordGroupItemSchema(),
        },
        optional: { type: "array", maxItems: 6, items: keywordGroupItemSchema() },
      },
    },
    query_pack: {
      type: "object",
      additionalProperties: false,
      required: ["necessary_only", "complementary_boosted", "optional_backups"],
      properties: {
        necessary_only: { type: "array", minItems: 1, maxItems: 4, items: queryStringSchema() },
        complementary_boosted: { type: "array", maxItems: 4, items: queryStringSchema() },
        optional_backups: { type: "array", maxItems: 3, items: queryStringSchema() },
      },
    },
    focus_terms: {
      type: "array",
      minItems: 4,
      maxItems: 12,
      items: { type: "string", minLength: 3, maxLength: 60 },
    },
  },
} satisfies Record<string, unknown>;

function keywordGroupItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "variants"],
    properties: {
      label: { type: "string", minLength: 3, maxLength: 60 },
      variants: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 3, maxLength: 80 },
      },
    },
  };
}

function queryStringSchema() {
  return { type: "string", minLength: 8, maxLength: 160 };
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const normalized = normalizeTitle(value);

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function uniqueVariants(values: string[]) {
  return uniqueNormalized(values).slice(0, 4);
}

function buildKeywordGroup(label: string, variants: string[]): ReferenceKeywordGroup {
  return {
    label,
    variants: uniqueVariants(variants),
  };
}

function pushGroup(target: ReferenceKeywordGroup[], label: string, variants: string[]) {
  const group = buildKeywordGroup(label, variants);

  if (group.variants.length === 0) {
    return;
  }

  const normalizedLabel = normalizeTitle(label);

  if (target.some((item) => normalizeTitle(item.label) === normalizedLabel)) {
    return;
  }

  target.push(group);
}

function buildPhrase(terms: string[], start: number, count: number) {
  const phrase = terms.slice(start, start + count).join(" ").trim();
  return phrase.length >= 6 ? phrase : null;
}

function buildQueryPack(keywordGroups: ReferenceSearchV2Metadata["keywordGroups"]) {
  const necessaryBase = keywordGroups.necessary.map((group) => group.variants[0]).filter(Boolean);
  const necessaryAlternate = keywordGroups.necessary
    .map((group) => group.variants[1] ?? group.variants[0])
    .filter(Boolean);

  const necessaryOnly = uniqueNormalized([
    buildSearchQuery(necessaryBase),
    buildSearchQuery(necessaryAlternate),
    buildSearchQuery([
      necessaryBase[0],
      necessaryBase[1],
      necessaryBase[2],
      keywordGroups.necessary[3]?.variants[1] ?? keywordGroups.necessary[3]?.variants[0] ?? null,
    ]),
  ]).slice(0, 4);

  const complementaryBoosted = uniqueNormalized(
    keywordGroups.complementary.slice(0, 4).map((group) =>
      buildSearchQuery([...necessaryBase, group.variants[0]]),
    ),
  ).slice(0, 4);

  const optionalBackups = uniqueNormalized(
    keywordGroups.optional.slice(0, 3).map((group) =>
      buildSearchQuery([necessaryBase[0], necessaryBase[1], group.variants[0]]),
    ),
  ).slice(0, 3);

  return {
    necessaryOnly,
    complementaryBoosted,
    optionalBackups,
  };
}


function quoteOpenAlexTerm(value: string) {
  const trimmed = value.trim().replace(/"/g, "");

  if (!trimmed) {
    return null;
  }

  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

function buildRelaxedSearchVariants(value: string) {
  const trimmed = value.trim();
  const genericWords = new Set([
    "a",
    "an",
    "and",
    "de",
    "del",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "analysis",
    "assessment",
    "evaluation",
    "method",
    "methods",
    "model",
    "models",
    "order",
    "study",
    "studies",
  ]);
  const contentWords = normalizeTitle(trimmed)
    .split(" ")
    .filter((word) => word.length >= 3 && !genericWords.has(word));
  const relaxed = [trimmed];

  if (contentWords.length >= 2) {
    relaxed.push(contentWords.slice(-2).join(" "));
  }

  if (contentWords.length === 3) {
    relaxed.push(`${contentWords[0]} ${contentWords[contentWords.length - 1]}`);
  }

  return uniqueNormalized(relaxed).slice(0, 3);
}

function buildOpenAlexClauseVariants(group: ReferenceKeywordGroup) {
  return uniqueNormalized(group.variants.flatMap(buildRelaxedSearchVariants)).slice(0, 5);
}

function buildOrClause(values: string[]) {
  const quoted = uniqueNormalized(values)
    .slice(0, 5)
    .map(quoteOpenAlexTerm)
    .filter((value): value is string => Boolean(value));

  if (quoted.length === 0) {
    return null;
  }

  return quoted.length === 1 ? quoted[0] : `(${quoted.join(" OR ")})`;
}

function buildBooleanQuery(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" AND ");
}

function rankTermsByFieldCoverage(fields: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const field of fields) {
    for (const term of extractSearchTerms(field ?? "", { maxTerms: 30, minLength: 4 })) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term);
}

function buildLocalObjectTerms(intake: IntakeInput) {
  const topicTerms = extractSearchTerms(intake.topic, { maxTerms: 16, minLength: 4 });
  const targetTerms = extractSearchTerms(intake.targetPopulation ?? "", {
    maxTerms: 18,
    minLength: 4,
  });
  const researchLineTerms = extractSearchTerms(intake.researchLine ?? "", {
    maxTerms: 18,
    minLength: 4,
  });
  const dataTerms = extractSearchTerms(intake.availableData ?? "", { maxTerms: 18, minLength: 4 });

  return uniqueNormalized([
    ...targetTerms,
    ...topicTerms.slice(2),
    ...researchLineTerms,
    ...dataTerms,
  ])
    .filter((term) => !topicTerms.slice(0, 2).includes(term))
    .slice(0, 16);
}

function buildLocalLanguageQueries(intake: IntakeInput) {
  const topicTerms = extractSearchTerms(intake.topic, { maxTerms: 12, minLength: 4 });
  const researchLineTerms = extractSearchTerms(intake.researchLine ?? "", {
    maxTerms: 14,
    minLength: 4,
  });
  const targetTerms = extractSearchTerms(intake.targetPopulation ?? "", {
    maxTerms: 14,
    minLength: 4,
  });
  const dataTerms = extractSearchTerms(intake.availableData ?? "", {
    maxTerms: 30,
    minLength: 4,
  });
  const problemTerms = extractSearchTerms(intake.problemContext ?? "", {
    maxTerms: 30,
    minLength: 4,
  });
  const methodTerms = extractSearchTerms(intake.preferredMethodology ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const corePhrase = buildSearchQuery(topicTerms.slice(0, 2));
  const topicCore = buildSearchQuery(topicTerms.slice(0, 4));
  const crossFieldTerms = rankTermsByFieldCoverage([
    intake.topic,
    intake.researchLine,
    intake.targetPopulation,
    intake.availableData,
    intake.problemContext,
    intake.preferredMethodology,
  ]).filter((term) => !topicTerms.slice(0, 2).includes(term));
  const objectTerms = uniqueNormalized([...targetTerms, ...researchLineTerms, ...dataTerms]).filter(
    (term) => !topicTerms.slice(0, 2).includes(term),
  );
  const methodContextTerms = uniqueNormalized([...methodTerms, ...problemTerms, ...dataTerms]).filter(
    (term) => !topicTerms.slice(0, 2).includes(term),
  );

  return uniqueNormalized([
    buildSearchQuery([corePhrase, crossFieldTerms[0], crossFieldTerms[1]]),
    buildSearchQuery([corePhrase, objectTerms[0], objectTerms[1]]),
    buildSearchQuery([corePhrase, objectTerms[0], methodContextTerms[0]]),
    buildSearchQuery([corePhrase, crossFieldTerms[2], crossFieldTerms[4]]),
    buildSearchQuery([corePhrase, objectTerms[0], crossFieldTerms[4]]),
    buildSearchQuery([objectTerms[0], crossFieldTerms[4], corePhrase]),
    buildSearchQuery([crossFieldTerms[2], crossFieldTerms[4], corePhrase]),
    buildSearchQuery([corePhrase, crossFieldTerms[2], methodContextTerms[2]]),
    buildSearchQuery([topicCore, crossFieldTerms[0], crossFieldTerms[1]]),
    buildSearchQuery([topicTerms[0], topicTerms[1], objectTerms[0], dataTerms[0]]),
  ])
    .filter((query) => query.split(" ").length >= 3)
    .slice(0, 10);
}

function buildOpenAlexQueryPack(
  keywordGroups: ReferenceSearchV2Metadata["keywordGroups"],
  intake?: IntakeInput,
) {
  const necessaryClauses = keywordGroups.necessary
    .slice(0, 5)
    .map((group) => buildOrClause(buildOpenAlexClauseVariants(group)))
    .filter((value): value is string => Boolean(value));
  const complementaryClauses = keywordGroups.complementary
    .slice(0, 5)
    .map((group) => buildOrClause(buildOpenAlexClauseVariants(group)))
    .filter((value): value is string => Boolean(value));
  const optionalClauses = keywordGroups.optional
    .slice(0, 3)
    .map((group) => buildOrClause(buildOpenAlexClauseVariants(group)))
    .filter((value): value is string => Boolean(value));

  const primaryCore = necessaryClauses.slice(0, 2);
  const broadCore = necessaryClauses.slice(0, 3);

  // Keep this generic: combine the strongest core concepts, then test method/context refiners.
  // Do not force every necessary facet into every query; narrow facets can make OpenAlex rank
  // semantically adjacent but unsuitable works above better general foundations.
  const strictBoolean = uniqueNormalized([
    buildBooleanQuery(broadCore),
    buildBooleanQuery([...primaryCore, complementaryClauses[0]]),
    buildBooleanQuery([...primaryCore, complementaryClauses[1]]),
    buildBooleanQuery([...primaryCore, complementaryClauses[2]]),
  ]).slice(0, 5);

  const precisionBoolean = uniqueNormalized([
    buildBooleanQuery([...primaryCore, complementaryClauses[0], complementaryClauses[1]]),
    buildBooleanQuery([...primaryCore, complementaryClauses[1], complementaryClauses[2]]),
    buildBooleanQuery([necessaryClauses[0], necessaryClauses[2], complementaryClauses[1]]),
    buildBooleanQuery([necessaryClauses[0], necessaryClauses[1], optionalClauses[0]]),
    buildBooleanQuery([necessaryClauses[0], complementaryClauses[0], optionalClauses[1]]),
  ]).slice(0, 5);

  const fallbackPlain = buildQueryPack(keywordGroups);

  return {
    strictBoolean,
    precisionBoolean,
    fallbackPlain: uniqueNormalized([
      ...fallbackPlain.necessaryOnly,
      ...fallbackPlain.complementaryBoosted,
      ...fallbackPlain.optionalBackups,
    ]).slice(0, 4),
    localLanguage: intake ? buildLocalLanguageQueries(intake) : [],
  };
}

function buildFallbackKeywordGroups(intake: IntakeInput): ReferenceSearchV2Metadata["keywordGroups"] {
  const topicTerms = extractSearchTerms(intake.topic, { maxTerms: 14, minLength: 4 });
  const problemTerms = extractSearchTerms(intake.problemContext ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const populationTerms = extractSearchTerms(intake.targetPopulation ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const methodTerms = extractSearchTerms(intake.preferredMethodology ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const lineTerms = extractSearchTerms(intake.researchLine ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const dataTerms = extractSearchTerms(intake.availableData ?? "", {
    maxTerms: 6,
    minLength: 4,
  });
  const constraintTerms = extractSearchTerms(intake.academicConstraints ?? "", {
    maxTerms: 6,
    minLength: 4,
  });
  const advisorTerms = extractSearchTerms(intake.advisorNotes ?? "", {
    maxTerms: 6,
    minLength: 4,
  });

  const necessary: ReferenceKeywordGroup[] = [];
  const complementary: ReferenceKeywordGroup[] = [];
  const optional: ReferenceKeywordGroup[] = [];

  pushGroup(necessary, "fenomeno principal", [
    buildPhrase(topicTerms, 0, 3) ?? "",
    buildPhrase(topicTerms, 0, 2) ?? "",
    buildPhrase(problemTerms, 0, 3) ?? "",
  ]);
  pushGroup(necessary, "objeto de estudio", [
    buildPhrase(populationTerms, 0, 3) ?? "",
    buildPhrase(topicTerms, 3, 3) ?? "",
  ]);
  pushGroup(necessary, "enfoque tecnico", [
    buildPhrase(lineTerms, 0, 3) ?? "",
    buildPhrase(methodTerms, 0, 3) ?? "",
    buildPhrase(problemTerms, 3, 3) ?? "",
  ]);
  pushGroup(necessary, "variable principal", [
    buildPhrase(problemTerms, 0, 2) ?? "",
    buildPhrase(topicTerms, 6, 3) ?? "",
  ]);

  pushGroup(complementary, "metodo", [
    buildPhrase(methodTerms, 0, 3) ?? "",
    buildPhrase(methodTerms, 3, 3) ?? "",
  ]);
  pushGroup(complementary, "contexto", [
    buildPhrase(populationTerms, 3, 3) ?? "",
    buildPhrase(problemTerms, 5, 3) ?? "",
  ]);
  pushGroup(complementary, "datos o senales", [
    buildPhrase(dataTerms, 0, 3) ?? "",
    buildPhrase(dataTerms, 3, 3) ?? "",
  ]);

  pushGroup(optional, "restricciones", [
    buildPhrase(constraintTerms, 0, 3) ?? "",
  ]);
  pushGroup(optional, "notas del asesor", [
    buildPhrase(advisorTerms, 0, 3) ?? "",
  ]);
  pushGroup(optional, "linea ampliada", [
    buildPhrase(lineTerms, 3, 3) ?? "",
  ]);

  if (necessary.length < 2) {
    pushGroup(necessary, "tema base", [
      buildSearchQuery(topicTerms.slice(0, 4)),
      buildSearchQuery(topicTerms.slice(4, 8)),
    ]);
    pushGroup(necessary, "alcance tecnico", [
      buildSearchQuery(topicTerms.slice(2, 6)),
    ]);
  }

  if (complementary.length === 0) {
    pushGroup(complementary, "precision metodologica", [
      buildSearchQuery(methodTerms.slice(0, 4)),
      buildSearchQuery(problemTerms.slice(0, 4)),
    ]);
  }

  return {
    necessary: necessary.slice(0, 6),
    complementary: complementary.slice(0, 6),
    optional: optional.slice(0, 6),
  };
}

function buildFallbackMetadata(intake: IntakeInput): ReferenceSearchV2Metadata {
  const keywordGroups = buildFallbackKeywordGroups(intake);
  const queryPack = buildQueryPack(keywordGroups);
  const openAlexQueryPack = buildOpenAlexQueryPack(keywordGroups, intake);
  const normalizedTopic =
    buildSearchQuery(keywordGroups.necessary.map((group) => group.variants[0]).slice(0, 4)) ||
    intake.topic;
  const intentSummary =
    buildSearchQuery([normalizedTopic, keywordGroups.complementary[0]?.variants[0] ?? null]) ||
    intake.topic;
  const focusTerms = uniqueNormalized([
    ...keywordGroups.necessary.flatMap((group) => group.variants),
    ...keywordGroups.complementary.flatMap((group) => group.variants),
  ]).slice(0, 12);
  const localObjectTerms = buildLocalObjectTerms(intake);

  return {
    planSource: "fallback",
    normalizedTopic,
    intentSummary,
    keywordGroups,
    queryPack,
    openAlexQueryPack,
    focusTerms,
    localObjectTerms,
    scoringRules: [
      "OpenAlex: usar busquedas booleanas con frases/OR/AND, filtros de calidad y sort por relevance_score+citas.",
      "ALTO: coincide con grupos necesarios y complementarios, con cobertura suficiente del nucleo del intake.",
      "MEDIO: coincide con al menos un grupo necesario pero menor precision complementaria.",
      "MINIMO: coincide solo con grupos opcionales o señales perifericas.",
      "Penalizar fuerte si no hay coincidencias necesarias o si titulo/resumen no contienen señales claras del intake.",
      "Las citas, DOI, venue, resumen, idioma, tipo documental, recencia y acceso PDF son señales secundarias; nunca reemplazan la alineacion semantica.",
      "No filtrar por language:en por defecto; conservar fuentes multilingues y evaluar cobertura conceptual en variantes ingles/espanol/regionales."
    ],
  };
}

function buildPrompt(intake: IntakeInput) {
  return renderVersionedPrompt(REFERENCE_SEARCH_V2_1_PROMPT, { var_0: (intake.topic), var_1: (intake.problemContext), var_2: (intake.targetPopulation), var_3: (intake.preferredMethodology), var_4: (intake.researchLine), var_5: (intake.availableData), var_6: (intake.academicConstraints), var_7: (intake.advisorNotes) }).trim();
}

function sanitizeKeywordGroups(
  groups: ReferenceSearchPlanSchema["keyword_groups"],
): ReferenceSearchV2Metadata["keywordGroups"] {
  return {
    necessary: groups.necessary.map((group) => buildKeywordGroup(group.label, group.variants)),
    complementary: groups.complementary.map((group) =>
      buildKeywordGroup(group.label, group.variants),
    ),
    optional: groups.optional.map((group) => buildKeywordGroup(group.label, group.variants)),
  };
}

async function buildReferenceSearchMetadata(intake: IntakeInput): Promise<ReferenceSearchV2Metadata> {
  const fallbackMetadata = buildFallbackMetadata(intake);

  try {
    const provider = getConfiguredLlmProvider();
    const generatedPlan = await generateStructuredObjectWithTextFallback<ReferenceSearchPlanSchema>(
      {
        provider,
        prompt: buildPrompt(intake),
        schemaName: "reference_search_v2_plan",
        schema: referenceSearchPlanSchema,
        model: process.env.SOURCE_DISCOVERY_PLAN_MODEL?.trim() || "gpt-5.4-nano",
        trackingAttribution: { stage: "source_discovery", promptVersion: REFERENCE_SEARCH_V2_1_PROMPT.version },
      },
    );

    const keywordGroups = sanitizeKeywordGroups(generatedPlan.keyword_groups);
    const queryPack = {
      necessaryOnly: uniqueNormalized(generatedPlan.query_pack.necessary_only).slice(0, 4),
      complementaryBoosted: uniqueNormalized(
        generatedPlan.query_pack.complementary_boosted,
      ).slice(0, 4),
      optionalBackups: uniqueNormalized(generatedPlan.query_pack.optional_backups).slice(0, 3),
    };

    const effectiveKeywordGroups = {
      necessary:
        keywordGroups.necessary.length > 0
          ? keywordGroups.necessary
          : fallbackMetadata.keywordGroups.necessary,
      complementary:
        keywordGroups.complementary.length > 0
          ? keywordGroups.complementary
          : fallbackMetadata.keywordGroups.complementary,
      optional:
        keywordGroups.optional.length > 0
          ? keywordGroups.optional
          : fallbackMetadata.keywordGroups.optional,
    };

    return {
      planSource: "llm",
      normalizedTopic:
        generatedPlan.normalized_topic?.trim() || fallbackMetadata.normalizedTopic,
      intentSummary:
        generatedPlan.intent_summary?.trim() || fallbackMetadata.intentSummary,
      keywordGroups: effectiveKeywordGroups,
      queryPack: {
        necessaryOnly:
          queryPack.necessaryOnly.length > 0
            ? queryPack.necessaryOnly
            : fallbackMetadata.queryPack.necessaryOnly,
        complementaryBoosted:
          queryPack.complementaryBoosted.length > 0
            ? queryPack.complementaryBoosted
            : fallbackMetadata.queryPack.complementaryBoosted,
        optionalBackups:
          queryPack.optionalBackups.length > 0
            ? queryPack.optionalBackups
            : fallbackMetadata.queryPack.optionalBackups,
      },
      openAlexQueryPack: buildOpenAlexQueryPack(effectiveKeywordGroups, intake),
      focusTerms: uniqueNormalized([
        ...generatedPlan.focus_terms,
        ...fallbackMetadata.focusTerms,
      ]).slice(0, 12),
      localObjectTerms: fallbackMetadata.localObjectTerms,
      scoringRules: fallbackMetadata.scoringRules,
    };
  } catch {
    return fallbackMetadata;
  }
}

export async function buildSearchMetadata(input: SearchInput, provider?: Pick<import("@/llm/provider").LlmProvider, "generateStructuredObject">): Promise<ReferenceSearchV2Metadata> {
  if (input.intent.sourceKind === "LEGACY_COMPATIBILITY") return buildReferenceSearchMetadata(input.plannerInput);
  const structured = semanticPlannerInput(input.intent, fingerprint(input.intent));
  if (structured.readiness !== "READY") throw new SearchPlanningError("REAL_USER_CLARIFICATION_REQUIRED");
  const cacheKey = fingerprint({ searchIntentHash: structured.searchIntentHash, promptVersion: REFERENCE_SEARCH_V2_2_PROMPT.version,
    model: searchEnrichmentModel(), policyVersion: structured.policyVersion, compositionVersion: QUERY_COMPOSITION_VERSION,
    translationPromptVersion: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, translationModel: recoveryModel() });
  const priorPlanning = provider ? null : (await prisma.auditLog.findMany({ where: { projectId: input.intent.projectId,
    eventType: { in: ["SEARCH_PLANNER_PREPARED", "SEARCH_PLANNER_FAILED"] } },
    orderBy: { createdAt: "desc" }, take: 30, select: { eventType: true, payloadJson: true } }))
    .find(row => (row.payloadJson as { cacheKey?: string }).cacheKey === cacheKey) ?? null;
  const cached = priorPlanning?.eventType === "SEARCH_PLANNER_PREPARED"
    ? (priorPlanning.payloadJson as { enrichment?: SearchEnrichment }).enrichment ?? null : null;
  let llm = provider;
  let enrichment: SearchEnrichment;
  if (cached) enrichment = cached;
  else if (priorPlanning?.eventType === "SEARCH_PLANNER_FAILED") enrichment = fallbackSearchEnrichment(structured, "PREVIOUS_PLANNER_FAILURE");
  else {
    try { llm ??= getConfiguredLlmProvider(); enrichment = await planSemanticSearch(structured, llm); }
    catch { enrichment = fallbackSearchEnrichment(structured, "PROVIDER_UNAVAILABLE"); }
    if (enrichment.translationTrace?.length) enrichment.translationTrace = enrichment.translationTrace.map(t => ({ ...t, plannerOperationId: currentPaidOperation()?.id ?? null }));
    if (llm && enrichment.planMode === "SEMANTIC" && enrichment.status === "READY") enrichment = await recoverCentralTranslations(structured, enrichment, llm);
  }
  const semanticAssessment = validateSearchPlan(enrichment);
  let selected: ReturnType<typeof chooseSafeSearchPlan>;
  try { selected = chooseSafeSearchPlan(structured, enrichment); }
  catch (error) {
    if (!provider && !priorPlanning) await logAuditEvent({ eventType: "SEARCH_PLANNER_FAILED", actorType: "SYSTEM",
      userId: currentPaidOperation()?.userId, projectId: input.intent.projectId,
      payloadJson: { cacheKey, searchIntentHash: structured.searchIntentHash,
        category: error instanceof SearchPlanningError ? error.code : "INTERNAL_SEARCH_PLANNING_ERROR" } });
    throw error;
  }
  if (selected.degraded && !cached) selected = chooseSafeSearchPlan(structured,
    await recoverCachedCentralTranslations(structured, selected.enrichment));
  enrichment = selected.enrichment;
  const keywordGroups = selected.groups;
  const queryPack = selected.pack;
  if (!cached && !provider) {
    const operation = currentPaidOperation();
    const cacheableEnrichment = { ...enrichment };
    delete cacheableEnrichment.rawPlannerOutput;
    await logAuditEvent({ eventType: "SEARCH_PLANNER_PREPARED", actorType: "SYSTEM", userId: operation?.userId,
      projectId: input.intent.projectId, payloadJson: JSON.parse(JSON.stringify({ cacheKey, searchIntentHash: structured.searchIntentHash,
        plannerVersion: REFERENCE_SEARCH_V2_2_PROMPT.version, policyVersion: structured.policyVersion,
        compositionVersion: QUERY_COMPOSITION_VERSION, planMode: enrichment.planMode,
        degradationReason: selected.degradationReason, enrichment: cacheableEnrichment })) as Prisma.InputJsonValue });
    if (selected.degraded) await logAuditEvent({ eventType: "DETERMINISTIC_FALLBACK_USED", actorType: "SYSTEM",
      userId: operation?.userId, projectId: input.intent.projectId,
      payloadJson: { cacheKey, searchIntentHash: structured.searchIntentHash, reason: selected.degradationReason ?? "SEMANTIC_PLANNER_DEGRADED" } });
    if (selected.degraded) await logAuditEvent({ eventType: "SEMANTIC_PLANNER_DEGRADED", actorType: "SYSTEM",
      userId: operation?.userId, projectId: input.intent.projectId,
      payloadJson: { cacheKey, searchIntentHash: structured.searchIntentHash,
        category: selected.degradationReason ?? "PLANNER_OUTPUT_INVALID",
        reasonCodes: semanticAssessment.reasons.filter(reason => /^[A-Z][A-Z0-9_]*$/.test(reason)) } });
  }
  return {
    enrichment, planSource: enrichment.planMode === "SEMANTIC" ? "llm" : "fallback",
    planning: { model: searchEnrichmentModel(), promptVersion: REFERENCE_SEARCH_V2_2_PROMPT.version, policyVersion: structured.policyVersion,
      cacheKey },
    normalizedTopic: input.intent.topic ?? "", intentSummary: input.intent.coreProblem ?? input.intent.topic ?? "",
    keywordGroups, queryPack,
    focusTerms: enrichment.terms.filter(t => t.authority === "CENTRAL").map(t => t.text), localObjectTerms: [],
    scoringRules: ["SEMANTIC_ROLES_NOT_GROUP_POSITION", "RELEVANCE_BEFORE_QUALITY_ACCESS", "REFINERS_NEVER_UNIVERSAL", "NO_QUOTA_PADDING"],
    openAlexQueryPack: { strictBoolean: queryPack.necessaryOnly, precisionBoolean: queryPack.complementaryBoosted,
      fallbackPlain: queryPack.necessaryOnly, localLanguage: [] },
  };
}

// Operator-only acceptance reuses the paid semantic graph. The historical paid
// result remains immutable; only query composition is replayed under this code.
export function recomposeAcceptedSearchMetadata(source: ReferenceSearchV2Metadata, planOperationId: string): ReferenceSearchV2Metadata {
  if (source.enrichment?.planMode !== "SEMANTIC" || source.enrichment.status !== "READY" ||
      !source.enrichment.scientificConceptPlan || !source.planning) throw new Error("ACCEPTANCE_PLAN_INVALID");
  const queryPack = semanticQueryPack(enrichmentGroups(source.enrichment));
  if (!queryPack.validation.valid || validateScientificQueryPlan(queryPack).length) throw new Error("ACCEPTANCE_RECOMPOSITION_INVALID");
  return { ...source,
    planning: { ...source.planning, replayedFromCompositionVersion: source.queryPack.compositionVersion ?? "UNVERSIONED",
      replayedFromPlanOperationId: planOperationId },
    queryPack,
    openAlexQueryPack: { strictBoolean: queryPack.necessaryOnly, precisionBoolean: queryPack.complementaryBoosted,
      fallbackPlain: queryPack.necessaryOnly, localLanguage: [] },
  };
}

function reusableMetadata(snapshot: ProjectReferenceSearchSnapshot | null | undefined, intentHash: string,
  confirmed: boolean): ReferenceSearchV2Metadata | null {
  if (snapshot?.inputTrace?.searchIntentHash !== intentHash || !snapshot.metadata) return null;
  const metadata = snapshot.metadata;
  if (!confirmed) return metadata.planSource === "fallback" ? metadata : null;
  if (metadata.planning?.promptVersion !== REFERENCE_SEARCH_V2_2_PROMPT.version ||
      metadata.queryPack.compositionVersion !== QUERY_COMPOSITION_VERSION ||
      !metadata.queryPack.validation?.valid || validateScientificQueryPlan(metadata.queryPack).length) return null;
  return metadata;
}

function getRecencyBand(year: number | null) {
  const currentYear = new Date().getFullYear();

  if (year && year >= currentYear - 3) {
    return { label: "2023-2026", bonus: 6 };
  }

  if (year && year >= currentYear - 6) {
    return { label: "2020-2022", bonus: 3 };
  }

  if (year && year >= currentYear - 9) {
    return { label: "2017-2019", bonus: 1 };
  }

  return { label: "2016 o anterior", bonus: 0 };
}

function textMatchesVariant(text: string, variant: string) {
  const normalizedVariant = normalizeTitle(variant);

  if (!normalizedVariant) {
    return false;
  }

  if (normalizedVariant.includes(" ")) {
    return text.includes(normalizedVariant);
  }

  return text.split(" ").includes(normalizedVariant);
}

function findMatchedLabels(
  text: string,
  groups: Array<{ label: string; variants: string[] }>,
) {
  return groups
    .filter((group) => group.variants.some((variant) => textMatchesVariant(text, variant)))
    .map((group) => group.label);
}

function computeGroupCoverage(input: {
  text: string;
  groups: ReferenceSearchV2Metadata["keywordGroups"];
}) {
  const requiredGroups = input.groups.necessary;
  const matchedRequired = requiredGroups.filter((group) =>
    group.variants.some((variant) => textMatchesVariant(input.text, variant)),
  ).length;

  return requiredGroups.length > 0 ? matchedRequired / requiredGroups.length : 0;
}

function hasAnyGroupMatch(text: string, groups: ReferenceSearchV2Metadata["keywordGroups"]) {
  return [...groups.necessary, ...groups.complementary, ...groups.optional].some((group) =>
    group.variants.some((variant) => textMatchesVariant(text, variant)),
  );
}

function detectVenueQualityPenalty(venue: string | null) {
  const normalizedVenue = normalizeTitle(venue);
  if (!normalizedVenue) {
    return { penalty: 0, reasons: [] as string[] };
  }

  const suspiciousPatterns = [
    "universal research reports",
    "world journal of advanced research and reviews",
    "journal of artificial intelligence general science",
    "international journal of all research",
    "researchgate",
  ];
  const genericMarketingTerms = ["advanced research", "general science", "universal research"];
  const reasons = [
    ...suspiciousPatterns
      .filter((pattern) => normalizedVenue.includes(pattern))
      .map((pattern) => `venue potencialmente debil: ${pattern}`),
    ...genericMarketingTerms
      .filter((pattern) => normalizedVenue.includes(pattern))
      .map((pattern) => `venue generica/promocional: ${pattern}`),
  ];

  return {
    penalty: Math.min(24, reasons.length * 12),
    reasons: [...new Set(reasons)],
  };
}

export function buildRelevanceScore(input: {
  title: string;
  abstract: string | null;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  keywordGroups: ReferenceSearchV2Metadata["keywordGroups"];
  citationCount: number;
  year: number | null;
  hasPdfUrl: boolean;
  hasDoi: boolean;
  workType: string | null;
  venue: string | null;
  language: string | null | undefined;
  activeLanguage: string | null | undefined;
  localObjectTerms?: string[];
  explicitExclusions?: string[];
}) {
  if (input.keywordGroups.necessary.some(g => g.role)) {
    const semanticRelevance = assessSemanticRelevance({ title: input.title, abstract: input.abstract,
      explicitExclusions: input.explicitExclusions,
      groups: input.keywordGroups as Parameters<typeof assessSemanticRelevance>[0]["groups"] });
    const matched = (groups: ReferenceKeywordGroup[]) => groups.filter(g => semanticRelevance.matchedGroups.includes(g.label)).map(g => g.label);
    // Score orders already classified candidates; it is NOT an admission threshold.
    // No local-language, group-position, recency, popularity or PDF penalties.
    return { score: semanticRelevance.classification === "HIGH_RELEVANCE" ? 100 + semanticRelevance.supportingEvidence.filter(e => e.location === "TITLE").length : 0,
      breakdown: { label: semanticRelevance.classification === "HIGH_RELEVANCE" ? "ALTO" as const : "BAJO" as const,
        necessaryMatches: matched(input.keywordGroups.necessary), complementaryMatches: matched(input.keywordGroups.complementary), optionalMatches: [],
        recencyBand: getRecencyBand(input.year).label, recencyBonus: 0, matchedQuery: input.matchedQuery, matchedQueryStage: input.matchedQueryStage,
        semanticRelevance } };
  }
  const normalizedTitle = normalizeTitle(input.title);
  const normalizedAbstract = normalizeTitle(input.abstract);
  const normalizedVenue = normalizeTitle(input.venue);
  const normalizedText = normalizeTitle([input.title, input.abstract, input.venue].filter(Boolean).join(" "));
  const necessaryMatches = findMatchedLabels(normalizedText, input.keywordGroups.necessary);
  const secondNecessaryGroup = input.keywordGroups.necessary[1];
  const secondNecessaryMatched = secondNecessaryGroup
    ? secondNecessaryGroup.variants.some((variant) => textMatchesVariant(normalizedText, variant))
    : true;
  const complementaryMatches = findMatchedLabels(
    normalizedText,
    input.keywordGroups.complementary,
  );
  const optionalMatches = findMatchedLabels(normalizedText, input.keywordGroups.optional);
  const localObjectMatches = (input.localObjectTerms ?? []).filter((term) =>
    textMatchesVariant(normalizedText, term),
  );
  const recency = getRecencyBand(input.year);
  const coverageRatio = computeGroupCoverage({ text: normalizedText, groups: input.keywordGroups });
  const necessaryTitleMatches = findMatchedLabels(normalizedTitle, input.keywordGroups.necessary);
  const firstNecessaryInTitle = input.keywordGroups.necessary[0]
    ? input.keywordGroups.necessary[0].variants.some((variant) =>
        textMatchesVariant(normalizedTitle, variant),
      )
    : false;
  const necessaryAbstractMatches = findMatchedLabels(normalizedAbstract, input.keywordGroups.necessary);
  const titleHasCoreMatch = hasAnyGroupMatch(normalizedTitle, input.keywordGroups);
  const abstractHasCoreMatch = hasAnyGroupMatch(normalizedAbstract, input.keywordGroups);
  const venueHasCoreMatch = hasAnyGroupMatch(normalizedVenue, input.keywordGroups);

  const citationBonus = Math.min(Math.log10(input.citationCount + 1) * 3, 6);
  const abstractBonus = input.abstract?.trim() ? 2.5 : -4;
  const accessBonus = input.hasPdfUrl ? 1.5 : 0;
  const doiBonus = input.hasDoi ? 2 : -3;
  const venueBonus = input.venue?.trim() ? 1.5 : -2;
  const typeBonus = ["article", "review", "book-chapter"].includes(input.workType ?? "") ? 1.5 : 0;
  const titleBonus = necessaryTitleMatches.length > 0 ? 24 : titleHasCoreMatch ? 4 : 0;
  const abstractAlignmentBonus = necessaryAbstractMatches.length > 0 ? 6 : abstractHasCoreMatch ? 2 : 0;
  const venueAlignmentBonus = venueHasCoreMatch ? 0.5 : 0;
  const candidateLanguage = input.language?.split("-")[0]?.toLowerCase() ?? null;
  const activeLanguage = input.activeLanguage?.split("-")[0]?.toLowerCase() ?? null;
  const languageAlignmentBonus =
    candidateLanguage && activeLanguage && candidateLanguage === activeLanguage && necessaryMatches.length > 0
      ? 4
      : 0;
  const localObjectBonus = Math.min(localObjectMatches.length * 3, 8);
  const venueQuality = detectVenueQualityPenalty(input.venue);

  const penalties: string[] = [];
  let alignmentPenalty = venueQuality.penalty;

  penalties.push(...venueQuality.reasons);

  if (necessaryMatches.length === 0) {
    penalties.push("sin coincidencias necesarias");
    alignmentPenalty += 28;
  }

  if (candidateLanguage && activeLanguage && candidateLanguage === activeLanguage && !firstNecessaryInTitle) {
    penalties.push("fuente local sin nucleo necesario en titulo");
    alignmentPenalty += 20;
  }

  if ((input.localObjectTerms?.length ?? 0) >= 2 && localObjectMatches.length === 0) {
    penalties.push("sin señales del objeto/poblacion local del intake");
    alignmentPenalty += 50;
  }

  if ((input.localObjectTerms?.length ?? 0) >= 2) {
    const localObjectTitleMatches = (input.localObjectTerms ?? []).filter((term) =>
      textMatchesVariant(normalizedTitle, term),
    );

    if (localObjectTitleMatches.length === 0) {
      penalties.push("titulo sin objeto/poblacion del intake");
      alignmentPenalty += 20;
    }
  }

  if (coverageRatio < 0.5) {
    penalties.push("cobertura parcial del nucleo del intake");
    alignmentPenalty += 18;
  }

  if (coverageRatio < 0.34) {
    penalties.push("baja cobertura del nucleo del intake");
    alignmentPenalty += 18;
  }

  if (necessaryMatches.length === 1 && input.keywordGroups.necessary.length >= 3) {
    penalties.push("solo una dimension necesaria cubierta");
    alignmentPenalty += 12;
  }

  if (!secondNecessaryMatched && input.keywordGroups.necessary.length >= 2) {
    penalties.push("sin cobertura del objeto/poblacion principal del intake");
    alignmentPenalty += 40;
  }

  if (necessaryTitleMatches.length === 0 && coverageRatio < 0.75) {
    penalties.push("titulo sin dimension necesaria clara");
    alignmentPenalty += 10;
  }

  if (!titleHasCoreMatch && !abstractHasCoreMatch) {
    penalties.push("titulo/resumen sin señal clara del intake");
    alignmentPenalty += 18;
  }

  let scoreLabel: ReferenceScoreBreakdown["label"] = "BAJO";
  let baseScore = 12;

  if (necessaryMatches.length >= 2 && complementaryMatches.length > 0) {
    scoreLabel = coverageRatio >= 0.5 ? "ALTO" : "MEDIO";
    baseScore = 58 + necessaryMatches.length * 8 + complementaryMatches.length * 5;
  } else if (necessaryMatches.length >= 2) {
    scoreLabel = "MEDIO";
    baseScore = 44 + necessaryMatches.length * 8;
  } else if (necessaryMatches.length === 1 && complementaryMatches.length > 0) {
    scoreLabel = "MEDIO";
    baseScore = 34 + complementaryMatches.length * 3;
  } else if (necessaryMatches.length === 1) {
    scoreLabel = "BAJO";
    baseScore = 26;
  } else if (optionalMatches.length > 0 && complementaryMatches.length === 0) {
    scoreLabel = "MINIMO";
    baseScore = 8 + optionalMatches.length * 2;
  } else if (complementaryMatches.length > 0) {
    baseScore = 12 + complementaryMatches.length * 3;
  }

  const queryStageBonus =
    input.matchedQueryStage === "necessary_only"
      ? 3
      : input.matchedQueryStage === "complementary_boosted"
        ? 4
        : 0.5;
  const coverageBonus = coverageRatio * 18;
  const rawScore =
    baseScore +
    coverageBonus +
    recency.bonus +
    citationBonus +
    abstractBonus +
    accessBonus +
    doiBonus +
    venueBonus +
    typeBonus +
    titleBonus +
    abstractAlignmentBonus +
    venueAlignmentBonus +
    languageAlignmentBonus +
    localObjectBonus +
    queryStageBonus -
    alignmentPenalty;

  return {
    score: Math.max(0, Math.round(rawScore * 10) / 10),
    breakdown: {
      label: scoreLabel,
      necessaryMatches,
      complementaryMatches,
      optionalMatches,
      recencyBand: recency.label,
      recencyBonus: recency.bonus,
      matchedQuery: input.matchedQuery,
      matchedQueryStage: input.matchedQueryStage,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      citationBonus: Math.round(citationBonus * 10) / 10,
      qualityBonus: Math.round((abstractBonus + accessBonus + doiBonus + venueBonus + typeBonus + languageAlignmentBonus) * 10) / 10,
      penalties: localObjectMatches.length > 0
        ? [...penalties, `objeto local: ${localObjectMatches.slice(0, 3).join(", ")}`]
        : penalties,
    } satisfies ReferenceScoreBreakdown,
  };
}

function buildDedupKey(result: SearchCandidate) {
  const doi = normalizeScholarlyDoi(result.doi);
  const version = scholarlyVersionClass(result.workType);
  return doi ? `doi:${doi}${version === "other" || version === "journal" ? "" : `:${version}`}` : result.openAlexId ? `openalex:${result.openAlexId}`
    : `unresolved:${fingerprint({ title: normalizeTitle(result.title), year: result.year, authors: result.authors, type: result.workType, url: result.landingPageUrl })}`;
}


function computeLocalLanguagePriority(input: {
  candidate: RankedCandidate;
  metadata: ReferenceSearchV2Metadata;
  activeLanguage: string | null | undefined;
}) {
  const candidateLanguage = input.candidate.candidate.language?.split("-")[0]?.toLowerCase() ?? null;
  const activeLanguage = input.activeLanguage?.split("-")[0]?.toLowerCase() ?? null;

  if (!candidateLanguage || !activeLanguage || candidateLanguage !== activeLanguage) {
    return null;
  }

  const normalizedTitle = normalizeTitle(input.candidate.resolvedTitle);
  const normalizedText = normalizeTitle(
    [input.candidate.resolvedTitle, input.candidate.abstract].filter(Boolean).join(" "),
  );
  const firstNecessary = input.metadata.keywordGroups.necessary[0];
  const firstNecessaryInTitle = firstNecessary
    ? firstNecessary.variants.some((variant) => textMatchesVariant(normalizedTitle, variant))
    : false;
  const necessaryTitleMatches = findMatchedLabels(
    normalizedTitle,
    input.metadata.keywordGroups.necessary,
  );
  const necessaryTextMatches = findMatchedLabels(normalizedText, input.metadata.keywordGroups.necessary);
  const complementaryTitleMatches = findMatchedLabels(
    normalizedTitle,
    input.metadata.keywordGroups.complementary,
  );
  const localObjectTitleMatches = (input.metadata.localObjectTerms ?? []).filter((term) =>
    textMatchesVariant(normalizedTitle, term),
  );
  const localObjectTextMatches = (input.metadata.localObjectTerms ?? []).filter((term) =>
    textMatchesVariant(normalizedText, term),
  );

  if (necessaryTextMatches.length === 0 || localObjectTextMatches.length === 0) {
    return null;
  }

  return (
    10 +
    (firstNecessaryInTitle ? 35 : -25) +
    necessaryTitleMatches.length * 12 +
    necessaryTextMatches.length * 6 +
    Math.min(localObjectTitleMatches.length * 6, 24) +
    Math.min(localObjectTextMatches.length * 2, 12) +
    complementaryTitleMatches.length * 8 +
    Math.min(input.candidate.citationCount, 10)
  );
}

export function pickDiverseCandidates(input: {
  rankedCandidates: RankedCandidate[];
  desiredTotal: number;
  metadata: ReferenceSearchV2Metadata;
  activeLanguage: string | null | undefined;
}) {
  const compare = (left: RankedCandidate, right: RankedCandidate) => right.score - left.score ||
    Number(Boolean(right.pdfUrl)) - Number(Boolean(left.pdfUrl)) ||
    Number(extractAccessSignals(right.candidate).isOpenAccess) - Number(extractAccessSignals(left.candidate).isOpenAccess);
  const sortedGlobal = [...input.rankedCandidates].sort(compare);
  const selected = new Map<string, RankedCandidate>();
  const add = (candidate: RankedCandidate) => {
    selected.set(buildDedupKey(candidate.candidate), candidate);
  };

  const localLane = (input.metadata.enrichment ? [] : sortedGlobal)
    .map((candidate) => ({
      candidate,
      priority: computeLocalLanguagePriority({
        candidate,
        metadata: input.metadata,
        activeLanguage: input.activeLanguage,
      }),
    }))
    .filter((item): item is { candidate: RankedCandidate; priority: number } =>
      typeof item.priority === "number",
    )
    .map((item) => ({
      ...item,
      candidate: {
        ...item.candidate,
        score: Math.max(item.candidate.score, Math.round(item.priority * 10) / 10),
      },
    }))
    .sort((left, right) => right.priority - left.priority || right.candidate.score - left.candidate.score);

  for (const item of localLane.slice(0, 2)) {
    add(item.candidate);
  }

  for (const candidate of sortedGlobal) {
    if (selected.size >= input.desiredTotal) {
      break;
    }
    add(candidate);
  }

  return Array.from(selected.values())
    .sort(compare)
    .slice(0, input.desiredTotal);
}

function buildSuggestedSelectionOrders(input: {
  baseSelectedReferenceIds: string[];
  previousProjectReferenceIds: Set<string>;
  latestReferenceIds: string[];
}) {
  const preservedSelectedIds = input.baseSelectedReferenceIds.filter((referenceId) =>
    input.latestReferenceIds.includes(referenceId),
  );
  const availableSlots = Math.max(0, MAX_SELECTED_REFERENCES - preservedSelectedIds.length);
  const newReferenceIds = input.latestReferenceIds.filter(
    (referenceId) => !input.previousProjectReferenceIds.has(referenceId),
  );
  const suggestedIds =
    preservedSelectedIds.length === 0
      ? input.latestReferenceIds.slice(0, Math.min(3, availableSlots))
      : newReferenceIds.slice(0, Math.min(3, availableSlots));
  const combinedSelection = Array.from(new Set([...preservedSelectedIds, ...suggestedIds])).slice(
    0,
    MAX_SELECTED_REFERENCES,
  );

  return new Map(
    combinedSelection.map((referenceId, index) => [referenceId, index + 1] as const),
  );
}

export async function searchProjectReferencesV2(
  userId: string,
  projectId: string,
  input: SearchInput,
  options?: {
    desiredTotal?: number;
    batchKind?: SourceDiscoveryBatchKind;
    automaticConvergence?: boolean;
    // Internal acceptance capability; never accepted from public route bodies.
    openAlexOnlyAcceptance?: { planOperationId: string; maxQueries: number; semanticReview?: boolean };
  },
  planningProvider?: Pick<import("@/llm/provider").LlmProvider, "generateStructuredObject">,
): Promise<SearchProjectReferencesV2Result> {
  const batchKind = options?.batchKind ?? "initial";
  const requestedTotal = options?.desiredTotal ?? (batchKind === "more" ? MAX_SELECTED_REFERENCES : REFERENCE_BATCH_SIZE);
  const desiredTotal = Math.min(
    Math.max(requestedTotal, MIN_SELECTED_REFERENCES),
    batchKind === "more" ? MAX_SELECTED_REFERENCES : REFERENCE_BATCH_SIZE,
  );
  const [project, user, existingProjectReferences] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    }),
    prisma.projectReference.findMany({
      where: { projectId },
      select: {
        referenceId: true,
        selected: true,
        selectedOrder: true,
      },
      orderBy: [{ selectedOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!project || input.intent.projectId !== projectId || input.intent.readiness !== "READY") {
    throw new Error("El proyecto no existe o aun no tiene intake.");
  }
  const intentHash = fingerprint(input.intent);
  const recentSearchAudits = await prisma.auditLog.findMany({ where: { projectId, eventType: "SEARCH_COMPLETED" },
    orderBy: { createdAt: "desc" }, take: 20, select: { payloadJson: true } });
  const priorSnapshots = recentSearchAudits.map(row => (row.payloadJson as { searchSnapshot?: ProjectReferenceSearchSnapshot } | null)?.searchSnapshot)
    .filter((snapshot): snapshot is ProjectReferenceSearchSnapshot => Boolean(snapshot?.inputTrace?.searchIntentHash === intentHash));
  const priorSnapshot = priorSnapshots[0] ?? null;
  const acceptance = options?.openAlexOnlyAcceptance;
  let preparedMetadata: ReferenceSearchV2Metadata | undefined;
  if (acceptance) {
    if (batchKind !== "initial" || !Number.isInteger(acceptance.maxQueries) || acceptance.maxQueries < 1 || acceptance.maxQueries > 4) throw new Error("INVALID_ACCEPTANCE_LIMIT");
    const operation = await prisma.paidOperation.findFirst({ where: { id: acceptance.planOperationId, userId, projectId, status: "COMPLETED", purpose: "rc4-query-composition-plan" } });
    const result = operation?.resultJson as { searchIntentHash?: string; metadata?: ReferenceSearchV2Metadata } | null;
    if (result?.searchIntentHash !== fingerprint(input.intent)) throw new Error("ACCEPTANCE_PLAN_STALE_OR_UNAUTHORIZED");
    preparedMetadata = result.metadata?.queryPack.compositionVersion === QUERY_COMPOSITION_VERSION
      ? result.metadata : result.metadata && recomposeAcceptedSearchMetadata(result.metadata, acceptance.planOperationId);
    const pack = preparedMetadata?.queryPack;
    if (preparedMetadata?.enrichment?.planMode !== "SEMANTIC" || pack?.compositionVersion !== QUERY_COMPOSITION_VERSION || !pack.validation?.valid || validateScientificQueryPlan(pack).length || preparedMetadata.planning?.promptVersion !== REFERENCE_SEARCH_V2_2_PROMPT.version) throw new Error("ACCEPTANCE_PLAN_INVALID");
    if (JSON.stringify(preparedMetadata.openAlexQueryPack?.strictBoolean) !== JSON.stringify(pack.necessaryOnly)) throw new Error("ACCEPTANCE_RENDERING_MISMATCH");
  }
  if (!preparedMetadata && !(batchKind === "initial" && planningProvider)) preparedMetadata = priorSnapshots.map(snapshot => reusableMetadata(snapshot, intentHash,
    input.intent.sourceKind === "CONFIRMED_DEFINITION")).find((metadata): metadata is ReferenceSearchV2Metadata => Boolean(metadata)) ?? undefined;
  if (batchKind === "more" && !preparedMetadata) throw new Error("MORE_REQUIRES_REUSABLE_INITIAL_PLAN");
  if (batchKind === "initial" && !acceptance && !planningProvider && priorSnapshot &&
      reusableMetadata(priorSnapshot, intentHash, input.intent.sourceKind === "CONFIRMED_DEFINITION") &&
      Date.now() - Date.parse(priorSnapshot.savedAt) < PROVIDER_CACHE_TTL_MS) {
    const recovered = await recoverExploratoryCache(userId, projectId, priorSnapshot);
    return { batchKind, searchQuery: priorSnapshot.searchQuery, attemptedQueries: [],
      totalResults: priorSnapshot.references.length, createdCount: 0, updatedCount: 0,
      providerBreakdown: { openAlex: 0, crossref: 0 }, searchSnapshot: recovered };
  }
  const inputTrace = await freezeSearchInput(userId, input);

  const baseSelectedReferenceIds = existingProjectReferences
    .filter((item) => item.selected)
    .map((item) => item.referenceId);
  const previousProjectReferenceIds = new Set(
    existingProjectReferences.map((item) => item.referenceId),
  );
  const languageContext = resolveLanguageContext({
    userLocale: user?.locale,
    projectLanguage: project.language,
  });
  const searchMetadata = preparedMetadata ?? await buildSearchMetadata(input, planningProvider);
  const queryPlanHash = fingerprint({ intentHash, plannerCacheKey: searchMetadata.planning?.cacheKey ?? null,
    compositionVersion: searchMetadata.queryPack.compositionVersion ?? null, queryPack: searchMetadata.queryPack.necessaryOnly,
    policy: PROVIDER_QUERY_POLICY_VERSION });
  const searchQuery = searchMetadata.normalizedTopic;
  const openAlexQueryPack = searchMetadata.openAlexQueryPack ??
    buildOpenAlexQueryPack(searchMetadata.keywordGroups, input.plannerInput);
  const exhaustiveQueryStages = [
    {
      stage: "necessary_only" as const,
      queries: openAlexQueryPack.strictBoolean.length > 0
        ? openAlexQueryPack.strictBoolean
        : searchMetadata.queryPack.necessaryOnly,
      openAlexFilters: searchMetadata.enrichment ? ["is_retracted:false", "is_paratext:false"] : OPENALEX_QUALITY_FILTERS,
    },
    {
      stage: "complementary_boosted" as const,
      queries: openAlexQueryPack.precisionBoolean.length > 0
        ? openAlexQueryPack.precisionBoolean
        : searchMetadata.queryPack.complementaryBoosted,
      openAlexFilters: searchMetadata.enrichment ? ["is_retracted:false", "is_paratext:false"] : OPENALEX_QUALITY_FILTERS,
    },
    {
      stage: "optional_backup" as const,
      queries: [
        ...(openAlexQueryPack.localLanguage ?? []),
        ...(openAlexQueryPack.fallbackPlain.length > 0
          ? openAlexQueryPack.fallbackPlain
          : searchMetadata.queryPack.optionalBackups),
      ],
      openAlexFilters: [
        "is_retracted:false",
        "is_paratext:false",
        "has_abstract:true",
        "type:article|review|book-chapter",
      ],
    },
  ];
  const currentFamilyQueries = new Set(searchMetadata.queryPack.plannedQueries?.map(item => item.query) ?? exhaustiveQueryStages[0].queries);
  const currentFamilyIds = new Set(searchMetadata.queryPack.plannedQueries?.map(item => item.id) ?? []);
  const priorExecutions: ExecutedProviderQuery[] = priorSnapshots.flatMap(snapshot => snapshot.executedQueries ?? [])
    .filter(item => item.provider === "OPENALEX" ? currentFamilyQueries.has(item.renderedQuery)
      : currentFamilyIds.has(item.familyId));
  // Older immutable snapshots predate query-level tracking. Their recorded
  // page-one queries still count as executed; do not replay them for MORE.
  for (const snapshot of priorSnapshots.filter(item => !item.executedQueries?.length)) for (const query of snapshot.attemptedQueries ?? []) {
    if (!currentFamilyQueries.has(query)) continue;
    const family = searchMetadata.queryPack.plannedQueries?.find(item => item.query === query);
    const oldQuery: ProviderQuery = { familyId: family?.id ?? "legacy", familyType: family?.family ?? "LEGACY",
      provider: "OPENALEX", renderedQuery: query, filters: exhaustiveQueryStages[0].openAlexFilters, page: 1 };
    priorExecutions.push({ ...oldQuery, queryHash: providerQueryHash(queryPlanHash, oldQuery), executedAt: snapshot.savedAt,
      resultCount: -1, newCandidateCount: -1, cacheHit: false, errorCategory: null });
  }
  const providerQueries = selectProviderQueries({ batchKind, planHash: queryPlanHash,
    families: searchMetadata.queryPack.plannedQueries ?? [],
    fallbackQueries: exhaustiveQueryStages[0].queries,
    filters: exhaustiveQueryStages[0].openAlexFilters, prior: options?.automaticConvergence ? priorExecutions.map(query => ({ ...query, errorCategory: null })) : priorExecutions,
    maxOpenAlexQueries: acceptance?.maxQueries ?? (options?.automaticConvergence ? Math.max(0, Math.min(2, 6 - new Set(priorExecutions.filter(q => q.provider === "OPENALEX").map(q => q.queryHash)).size)) : 2) });
  const attemptedQueries: string[] = [];

  if (!searchQuery || (batchKind === "initial" && providerQueries.length === 0)) {
    throw new Error("No hay suficiente informacion para buscar fuentes.");
  }

  let searchingUpdatedAt: Date | null = null;
  try {
  const searchingProject = await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.SEARCHING,
      intake: {
        update: {
          searchQuery,
        },
      },
    },
  });
  searchingUpdatedAt = searchingProject.updatedAt;

  const aggregatedResults = new Map<string, SearchCandidate>();
  const attemptSummaries: Array<{ query: string; resultCount: number }> = [];
  const executedQueries: ExecutedProviderQuery[] = [];
  const discoveryObservations: NonNullable<ProjectReferenceSearchSnapshot["discoveryObservations"]> = [];
  const priorSeen = new Set(priorSnapshots.flatMap(snapshot => snapshot.candidateAdmissions?.map(item => item.candidateKey) ?? []));
  let cacheHits = 0, cacheMisses = 0;
  async function cachedProviderResults<T>(query: ProviderQuery, execute: () => Promise<T[]>): Promise<T[]> {
    // The explicit operator acceptance path measures the provider itself and
    // must not confuse a previous fixture response with a live result.
    if (acceptance) { cacheMisses++; return execute(); }
    const queryHash = providerQueryHash(queryPlanHash, query);
    const row = await prisma.auditLog.findFirst({ where: { projectId, eventType: "SOURCE_PROVIDER_QUERY_COMPLETED",
      createdAt: { gte: new Date(Date.now() - PROVIDER_CACHE_TTL_MS) }, payloadJson: { path: ["queryHash"], equals: queryHash } },
      orderBy: { createdAt: "desc" }, select: { payloadJson: true } });
    const cached = row?.payloadJson as { results?: T[] } | undefined;
    if (Array.isArray(cached?.results)) { cacheHits++; return cached.results; }
    cacheMisses++;
    const results = await execute(); // Only successful responses are cached. Never cache a 429/timeout as empty.
    await logAuditEvent({ eventType: "SOURCE_PROVIDER_QUERY_COMPLETED", actorType: "SYSTEM",
      provider: query.provider === "OPENALEX" ? Provider.OPENALEX : Provider.CROSSREF, userId, projectId,
      payloadJson: JSON.parse(JSON.stringify({ queryHash, queryPlanHash,
        query: { ...query, renderedQueryHash: fingerprint(query.renderedQuery), renderedQuery: undefined },
        resultCount: results.length, results, executedAt: new Date().toISOString() })) as Prisma.InputJsonValue });
    return results;
  }
  const providerBreakdown = {
    openAlex: 0,
    crossref: 0,
  };
  let openAlexUnavailable = false;

  for (const query of providerQueries) {
    if (openAlexUnavailable) break;
    const queryHash = providerQueryHash(queryPlanHash, query);
    attemptedQueries.push(query.renderedQuery);
    const oldHits = cacheHits;
    let attemptResults: Awaited<ReturnType<typeof searchOpenAlexWorks>>;
    try {
      attemptResults = await cachedProviderResults(query, () => searchOpenAlexWorks(query.renderedQuery, {
        filters: query.filters, page: query.page, perPage: 35,
        sort: "relevance_score:desc,cited_by_count:desc", retryRateLimit: !acceptance,
      }));
    } catch (error) {
      if (acceptance) throw error;
      if (!(error instanceof OpenAlexRequestError)) throw error;
      openAlexUnavailable = true;
      executedQueries.push({ ...query, queryHash, executedAt: new Date().toISOString(), resultCount: 0,
        newCandidateCount: 0, cacheHit: false, errorCategory: error instanceof Error ? error.message : "OPENALEX_PROVIDER_ERROR" });
      break;
    }
    let newCandidateCount = 0;
    attemptSummaries.push({ query: query.renderedQuery, resultCount: attemptResults.length });
    for (const result of attemptResults) {
      const candidate: SearchCandidate = { ...result, matchedQuery: query.renderedQuery,
        matchedQueryStage: query.familyType === "CONTEXTUAL_OR_LOCAL" ? "optional_backup" : "necessary_only",
        rawCrossrefJson: null, sourceProvider: Provider.OPENALEX };
      const dedupKey = buildDedupKey(candidate);
      discoveryObservations.push({ candidateKey: dedupKey, provider: "OPENALEX", queryHash });
      if (batchKind === "more" && priorSeen.has(dedupKey)) continue;
      if (!aggregatedResults.has(dedupKey)) { aggregatedResults.set(dedupKey, candidate); providerBreakdown.openAlex++; newCandidateCount++; }
    }
    executedQueries.push({ ...query, queryHash, executedAt: new Date().toISOString(), resultCount: attemptResults.length,
      newCandidateCount, cacheHit: cacheHits > oldHits, errorCategory: null });
  }

  // Crossref discovery is bounded and secondary: only a provider failure or an
  // explicit MORE request with no new OpenAlex candidate justifies it.
  if (!acceptance && (openAlexUnavailable || batchKind === "more" && aggregatedResults.size === 0)) {
    const family = searchMetadata.queryPack.plannedQueries?.[0];
    if (family && searchMetadata.queryPack.conceptPlan) {
      const renderedQuery = renderCrossrefFamily(family, searchMetadata.queryPack.conceptPlan);
      const query: ProviderQuery = { familyId: family.id, familyType: family.family, provider: "CROSSREF", renderedQuery,
        filters: [], page: 1 };
      const queryHash = providerQueryHash(queryPlanHash, query);
      if (!priorExecutions.some(item => item.provider === "CROSSREF")) {
        try {
        const oldHits = cacheHits;
        const crossrefResults = await cachedProviderResults(query, () => searchCrossrefWorks(renderedQuery));
        let newCandidateCount = 0;
        for (const result of crossrefResults) {
          const candidate: SearchCandidate = { ...result, matchedQuery: renderedQuery, matchedQueryStage: "necessary_only",
            normalizedTitle: result.title, sourceProvider: Provider.CROSSREF };
          const dedupKey = buildDedupKey(candidate);
          discoveryObservations.push({ candidateKey: dedupKey, provider: "CROSSREF", queryHash });
          if (batchKind === "more" && priorSeen.has(dedupKey)) {
            const doi = normalizeScholarlyDoi(candidate.doi);
            if (doi && candidate.rawCrossrefJson) {
              const linked = await prisma.projectReference.findFirst({ where: { projectId, reference: { doi } },
                include: { reference: true } });
              if (linked && !linked.reference.rawCrossrefJson) await prisma.reference.update({ where: { id: linked.referenceId },
                data: { crossrefId: doi, rawCrossrefJson: candidate.rawCrossrefJson as Prisma.InputJsonValue } });
            }
            continue;
          }
          const existing = [...aggregatedResults.entries()].find(([, item]) => sameScientificWork(item, candidate));
          if (existing) {
            // One work, two observations; do not discard the richer OpenAlex representation.
            existing[1].rawCrossrefJson = candidate.rawCrossrefJson;
            continue;
          }
          aggregatedResults.set(dedupKey, candidate); providerBreakdown.crossref++; newCandidateCount++;
        }
        attemptedQueries.push(renderedQuery);
        attemptSummaries.push({ query: renderedQuery, resultCount: crossrefResults.length });
        executedQueries.push({ ...query, queryHash, executedAt: new Date().toISOString(), resultCount: crossrefResults.length,
          newCandidateCount, cacheHit: cacheHits > oldHits, errorCategory: null });
        } catch (error) {
          if (!options?.automaticConvergence) throw error;
          executedQueries.push({ ...query, queryHash, executedAt: new Date().toISOString(), resultCount: 0,
            newCandidateCount: 0, cacheHit: false, errorCategory: "CROSSREF_UNAVAILABLE" });
        }
      }
    }
  }
  if (!options?.automaticConvergence && openAlexUnavailable && !executedQueries.some(item => item.errorCategory === null)) throw new Error("OPENALEX_PROVIDER_TEMPORARILY_UNAVAILABLE");

  const candidatePool = Array.from(aggregatedResults.values());
  const rankedCandidates: RankedCandidate[] = [];
  let skippedCount = 0;

  for (const result of candidatePool) {
    let crossrefMetadata: CrossrefMessage | null = result.rawCrossrefJson ?? null;

    // Crossref discovery already supplied its metadata. DOI verification is a
    // later inspection task, never an unbounded hidden provider request here.

    const resolvedTitle = result.title?.trim() || resolveCrossrefTitle(crossrefMetadata);
    const normalizedCandidateTitle = normalizeTitle(resolvedTitle);

    if (!resolvedTitle || !normalizedCandidateTitle) {
      skippedCount += 1;
      continue;
    }

    const resolvedAuthors =
      crossrefMetadata?.author?.map((author) =>
        [author.given, author.family].filter(Boolean).join(" "),
      ) ?? result.authors;
    const resolvedAbstract = crossrefMetadata?.abstract ?? result.abstract;
    const resolvedVenue = crossrefMetadata?.publisher ?? result.venue;
    const resolvedYear =
      crossrefMetadata?.issued?.["date-parts"]?.[0]?.[0] ?? result.year;
    const resolvedWorkType = crossrefMetadata?.type ?? result.workType;
    const resolvedLandingPageUrl = crossrefMetadata?.URL ?? result.landingPageUrl;
    const accessSignals = extractAccessSignals({
      rawOpenAlexJson: result.rawOpenAlexJson,
      landingPageUrl: resolvedLandingPageUrl,
      doi: result.doi,
    });
    // This stage only sees provider-reported locations; no download/verification.
    const pdfAccessible = false;
    const relevance = buildRelevanceScore({
      title: resolvedTitle,
      abstract: resolvedAbstract,
      matchedQuery: result.matchedQuery,
      matchedQueryStage: result.matchedQueryStage,
      keywordGroups: searchMetadata.keywordGroups,
      citationCount: result.citationCount,
      year: resolvedYear,
      hasPdfUrl: Boolean(accessSignals.pdfUrl),
      hasDoi: Boolean(result.doi),
      workType: resolvedWorkType,
      venue: resolvedVenue,
      language: result.language,
      activeLanguage: languageContext.activeLanguage,
      localObjectTerms: searchMetadata.localObjectTerms,
      explicitExclusions: searchMetadata.enrichment?.explicitExclusions,
    });

    rankedCandidates.push({
      candidate: result,
      resolvedTitle,
      normalizedTitle: normalizedCandidateTitle,
      authors: resolvedAuthors,
      abstract: resolvedAbstract,
      venue: resolvedVenue,
      year: resolvedYear,
      workType: resolvedWorkType,
      landingPageUrl: resolvedLandingPageUrl,
      citationCount: result.citationCount,
      crossrefMetadata,
      score: relevance.score,
      scoreBreakdown: relevance.breakdown,
      admission: decideReferenceAdmission({
        title: resolvedTitle,
        abstract: resolvedAbstract,
        score: relevance.score,
        breakdown: relevance.breakdown,
      }),
      pdfUrl: accessSignals.pdfUrl,
      pdfAccessible,
    });
  }

  let semanticReview: ProjectReferenceSearchSnapshot["semanticReview"];
  const conceptPlan = searchMetadata.enrichment?.scientificConceptPlan;
  if (conceptPlan && (!acceptance || acceptance.semanticReview)) {
    const reviewInputs: ReviewCandidate[] = rankedCandidates.map(item => ({ candidateId: buildDedupKey(item.candidate),
      title: item.resolvedTitle, abstract: item.abstract, authors: item.authors, year: item.year, venue: item.venue,
      workType: item.workType, query: item.candidate.matchedQuery,
      deterministicSignals: item.scoreBreakdown.semanticRelevance }));
    const review = await reviewCandidateBatch(semanticPlannerInput(input.intent, fingerprint(input.intent)), conceptPlan, reviewInputs,
      { generateStructuredObject: request => (planningProvider ?? getConfiguredLlmProvider()).generateStructuredObject(request) }, searchMetadata.enrichment?.explicitExclusions);
    semanticReview = review.trace;
    for (let i = 0; i < rankedCandidates.length; i++) {
      const item = rankedCandidates[i], original = reviewInputs[i];
      const assessment = review.assessments.get(original.candidateId) ?? {
        policyVersion: CANDIDATE_REVIEW_VERSION, candidateId: original.candidateId, searchIntentHash: conceptPlan.searchIntentHash,
        metadataHash: candidateMetadataHash(original), origin: "DETERMINISTIC" as const, relevance: "INSUFFICIENT_METADATA" as const,
        role: "NONE" as const, confidence: "LOW" as const, rationale: "BOUNDED_REVIEW_DEFERRED_OR_UNAVAILABLE", matchedIntentDimensions: [], mismatches: [], evidence: [],
      };
      item.scoreBreakdown.candidateAssessment = assessment;
      item.admission = decideReferenceAdmission({ title: item.resolvedTitle, abstract: item.abstract, score: item.score, breakdown: item.scoreBreakdown });
      item.score = item.admission.state === "ADMITTED" ? assessment.relevance === "HIGHLY_RELEVANT" ? 200 : 100 : 0;
      item.scoreBreakdown.label = item.admission.state === "ADMITTED" ? "ALTO" : "BAJO";
    }
  }
  const selectedCandidates = pickDiverseCandidates({
    rankedCandidates: rankedCandidates.filter(item => item.admission.state === "ADMITTED" ||
      sourceRelevanceTier(item.scoreBreakdown.candidateAssessment, Boolean(item.candidate.doi || item.candidate.openAlexId)) === "EXPLORATORY"),
    desiredTotal: semanticReview ? Math.min(options?.desiredTotal ?? MAX_RECOMMENDATIONS, MAX_RECOMMENDATIONS) : desiredTotal,
    metadata: searchMetadata,
    activeLanguage: languageContext.activeLanguage,
  });

  let createdCount = 0;
  let updatedCount = 0;
  const persistedResults: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    admission: ReferenceAdmission;
    pdfUrl: string | null;
    pdfAccessible: boolean;
  }> = [];

  for (const ranked of selectedCandidates) {
    const result = ranked.candidate;
    const canonicalDoi = normalizeScholarlyDoi(result.doi);
    const lookupKeys: Array<{ doi: string } | { openAlexId: string }> = [];

    if (canonicalDoi) {
      lookupKeys.push({ doi: canonicalDoi });
      if (result.doi !== canonicalDoi) lookupKeys.push({ doi: result.doi! });
    }

    if (result.openAlexId) {
      lookupKeys.push({ openAlexId: result.openAlexId });
    }

    const exactIdentity = lookupKeys.length ? await prisma.reference.findFirst({
      where:
        lookupKeys.length > 1
          ? { OR: lookupKeys }
          : lookupKeys[0],
    }) : null;
    const titleMatches = !exactIdentity && !canonicalDoi && !result.openAlexId ? await prisma.reference.findMany({
      where: { normalizedTitle: ranked.normalizedTitle, year: ranked.year ?? undefined }, take: 8 }) : [];
    const exactIdentityCompatible = exactIdentity ? sameScientificWork({ ...result, title: ranked.resolvedTitle, authors: ranked.authors, year: ranked.year }, {
      doi: exactIdentity.doi, openAlexId: exactIdentity.openAlexId, landingPageUrl: exactIdentity.landingPageUrl,
      title: exactIdentity.title, year: exactIdentity.year,
      authors: Array.isArray(exactIdentity.authorsJson) ? exactIdentity.authorsJson.filter((author): author is string => typeof author === "string") : [],
      workType: exactIdentity.workType }) : false;
    if (exactIdentity && !exactIdentityCompatible) {
      ranked.admission = { policyVersion: REFERENCE_ADMISSION_POLICY_VERSION, state: "NEEDS_INSPECTION", reasons: ["UNCERTAIN_VERSION_IDENTITY"] };
      continue;
    }
    const existingReference = (exactIdentityCompatible ? exactIdentity : null) ?? titleMatches.find(item => sameScientificWork({ ...result,
      title: ranked.resolvedTitle, authors: ranked.authors, year: ranked.year }, {
      doi: item.doi, openAlexId: item.openAlexId, landingPageUrl: item.landingPageUrl,
      title: item.title, year: item.year, authors: Array.isArray(item.authorsJson) ? item.authorsJson.filter((author): author is string => typeof author === "string") : [],
      workType: item.workType })) ?? null;

    const reference = existingReference
      ? await prisma.reference.update({
          where: { id: existingReference.id },
          data: {
            doi: canonicalDoi ?? existingReference.doi,
            openAlexId: result.openAlexId ?? existingReference.openAlexId,
            crossrefId: ranked.crossrefMetadata?.DOI ?? existingReference.crossrefId,
            title: ranked.resolvedTitle,
            normalizedTitle: ranked.normalizedTitle,
            authorsJson: ranked.authors,
            abstract: ranked.abstract ?? existingReference.abstract,
            venue: ranked.venue ?? existingReference.venue,
            year: ranked.year ?? existingReference.year,
            workType: ranked.workType,
            landingPageUrl: ranked.landingPageUrl,
            citationCount: ranked.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? existingReference.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson:
              (ranked.crossrefMetadata ?? existingReference.rawCrossrefJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        })
      : await prisma.reference.create({
          data: {
            doi: canonicalDoi,
            openAlexId: result.openAlexId,
            crossrefId: ranked.crossrefMetadata?.DOI ?? null,
            title: ranked.resolvedTitle,
            normalizedTitle: ranked.normalizedTitle,
            authorsJson: ranked.authors,
            abstract: ranked.abstract,
            venue: ranked.venue,
            year: ranked.year,
            workType: ranked.workType,
            landingPageUrl: ranked.landingPageUrl,
            citationCount: ranked.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson:
              (ranked.crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

    if (existingReference) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    await prisma.projectReference.upsert({
      where: {
        projectId_referenceId: {
          projectId: project.id,
          referenceId: reference.id,
        },
      },
      update: {
        sourceProvider: existingReference?.rawOpenAlexJson ? Provider.OPENALEX : result.sourceProvider,
        relevanceScore: ranked.score,
      },
      create: {
        projectId: project.id,
        referenceId: reference.id,
        sourceProvider: result.sourceProvider,
        relevanceScore: ranked.score,
      },
    });

    persistedResults.push({
      referenceId: reference.id,
      relevanceScore: ranked.score,
      scoreBreakdown: ranked.scoreBreakdown,
      admission: ranked.admission,
      pdfUrl: ranked.pdfUrl,
      pdfAccessible: ranked.pdfAccessible,
    });
  }

  const suggestedSelectionOrders = buildSuggestedSelectionOrders({
    baseSelectedReferenceIds,
    previousProjectReferenceIds,
    latestReferenceIds: persistedResults
      .filter((item) => item.relevanceScore >= 50)
      .map((item) => item.referenceId),
  });

  const projectReferenceCount = await prisma.projectReference.count({
    where: { projectId: project.id },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status:
        projectReferenceCount > 0
          ? ProjectStatus.SOURCES_REVIEW
          : ProjectStatus.INTAKE_READY,
    },
  });

  const searchSnapshot: ProjectReferenceSearchSnapshot = {
    ...(semanticReview ? { semanticReview } : {}),
    referenceSearchVersion: "v2",
    inputTrace,
    batchKind,
    savedAt: new Date().toISOString(),
    searchQuery,
    attemptedQueries,
    totalResults: persistedResults.length,
    providerBreakdown,
    queryPlanHash,
    executedQueries: [...priorExecutions, ...executedQueries]
      .filter((item, index, all) => all.findIndex(other => other.queryHash === item.queryHash && other.errorCategory === item.errorCategory) === index),
    cacheHits,
    cacheMisses,
    discoveryObservations: [...(batchKind === "more" ? priorSnapshot?.discoveryObservations ?? [] : []), ...discoveryObservations]
      .filter((item, index, all) => all.findIndex(other => other.candidateKey === item.candidateKey && other.provider === item.provider && other.queryHash === item.queryHash) === index),
    resultState: batchKind === "initial" ? persistedResults.length ? undefined : "NO_RELEVANT_INITIAL_RESULTS"
      : persistedResults.length ? "MORE_FOUND_NEW_RESULTS"
      : !providerQueries.length && !executedQueries.length ? "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN" : "NO_NEW_RELEVANT_RESULTS",
    baseSelectedReferenceIds,
    metadata: searchMetadata,
    admissionPolicyVersion: REFERENCE_ADMISSION_POLICY_VERSION,
    candidateAdmissions: [...(batchKind === "more" ? priorSnapshot?.candidateAdmissions ?? [] : []), ...rankedCandidates.map((item) => ({
      candidateKey: buildDedupKey(item.candidate),
      title: item.resolvedTitle,
      doi: item.candidate.doi,
      year: item.year,
      relevanceScore: item.score,
      scoreBreakdown: item.scoreBreakdown,
      admission: item.admission,
      inspectionMetadata: { abstract: item.candidate.abstract, authors: item.candidate.authors, venue: item.candidate.venue, access: extractAccessSignals(item.candidate) },
    }))].filter((item, index, all) => all.findIndex(other => other.candidateKey === item.candidateKey) === index),
    references: [...(batchKind === "more" ? priorSnapshot?.references ?? [] : []), ...persistedResults.map((item) => ({
      referenceId: item.referenceId,
      relevanceScore: item.relevanceScore,
      scoreBreakdown: item.scoreBreakdown,
      admission: item.admission,
      suggestedSelectedOrder: suggestedSelectionOrders.get(item.referenceId) ?? null,
      pdfUrl: item.pdfUrl,
      pdfAccessible: item.pdfAccessible,
      accessStatus: item.pdfUrl ? "REPORTED_PDF" as const : "UNKNOWN" as const,
    }))].filter((item, index, all) => all.findIndex(other => other.referenceId === item.referenceId) === index),
  };

  await logAuditEvent({
    eventType: "SEARCH_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.OPENALEX,
    userId,
    projectId: project.id,
    payloadJson: {
      referenceSearchVersion: "v2",
      inputTrace,
      batchKind,
      searchQuery,
      searchIntent: searchMetadata.intentSummary,
      languageContext,
      attemptedQueries,
      attempts: attemptSummaries,
      candidatePoolSize: candidatePool.length,
      resultCount: persistedResults.length,
      createdCount,
      updatedCount,
      skippedCount,
      providerBreakdown,
      queryPlanHash,
      executedQueries,
      cacheHits,
      cacheMisses,
      discoveryObservations,
      searchSnapshot,
      providerFallback: openAlexUnavailable ? "OpenAlex unavailable; supported Crossref fallback used" : null,
    },
  });

  return {
    batchKind,
    searchQuery,
    attemptedQueries,
    totalResults: persistedResults.length,
    createdCount,
    updatedCount,
    providerBreakdown,
    searchSnapshot,
  };
  } catch (error) {
    if (searchingUpdatedAt) {
      try {
        await settleFailedSearch({ userId, projectId, searchingUpdatedAt, error,
          searchIntentHash: fingerprint(input.intent), attemptedQueries });
      } catch {
        console.warn("SEARCH_FAILURE_SETTLEMENT_FAILED");
      }
    }
    throw error;
  }
}

export async function getLatestProjectReferenceSearchSnapshot(projectId: string) {
  const latestSearchAudit = await prisma.auditLog.findFirst({
    where: {
      projectId,
      eventType: "SEARCH_COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });

  const payload = latestSearchAudit?.payloadJson as
    | { searchSnapshot?: ProjectReferenceSearchSnapshot; referenceSearchVersion?: string }
    | null
    | undefined;

  if (payload?.referenceSearchVersion !== "v2") {
    return null;
  }

  const snapshot = payload.searchSnapshot;
  if (!snapshot?.inputTrace || snapshot.inputTrace.confirmedDraftRevision === null) return snapshot ?? null;
  const [draft, intake] = await Promise.all([prisma.projectDraft.findUnique({ where: { projectId } }), prisma.intake.findUnique({ where: { projectId } })]);
  const raw = (draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition;
  const confirmed = intake?.confirmedDefinitionJson as { revision?: number; definitionHash?: string; definition?: unknown } | null;
  const matches = confirmedScientificDefinitionMatches(raw, confirmed);
  return { ...snapshot, stale: searchInputIsStale(snapshot.inputTrace, { revision: matches ? confirmed?.revision ?? null : null,
    definitionHash: matches ? confirmed?.definitionHash ?? null : null }) };
}
