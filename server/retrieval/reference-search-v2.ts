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
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import {
  type CrossrefMessage,
  fetchCrossrefWorkByDoi,
  resolveCrossrefTitle,
  searchCrossrefWorks,
} from "./crossref-client";
import { extractAccessSignals, verifyPdfAccess } from "./reference-access";
import { OPENALEX_QUALITY_FILTERS, searchOpenAlexWorks } from "./openalex-client";

export type ReferenceKeywordGroup = {
  label: string;
  variants: string[];
};

export type ReferenceSearchV2Metadata = {
  planSource: "llm" | "fallback";
  normalizedTopic: string;
  intentSummary: string;
  keywordGroups: {
    necessary: ReferenceKeywordGroup[];
    complementary: ReferenceKeywordGroup[];
    optional: ReferenceKeywordGroup[];
  };
  queryPack: {
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
  referenceSearchVersion: "v2";
  batchKind?: SourceDiscoveryBatchKind;
  savedAt: string;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  baseSelectedReferenceIds: string[];
  metadata: ReferenceSearchV2Metadata;
  references: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    suggestedSelectedOrder: number | null;
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
  return `
You are a senior academic literature retrieval specialist for master's thesis planning.
Your task is to read a structured intake written in Spanish and produce a multilingual OpenAlex retrieval plan.

Context:
- the user is preparing an academic research project
- OpenAlex does not guarantee that every useful work is in English or normalized to English
- OpenAlex retrieval often works well with concise English academic terminology, but local-language sources can matter for regional or regulatory context
- the output must remain tightly aligned to the intake
- do not invent facts, methods, populations, devices, or results

Goal:
- identify the highest-value keyword groups from the intake
- classify them into necessary, complementary, and optional groups
- each group must contain variant expressions, but do not use OR operators inside queries
- include English technical variants plus Spanish intake-language variants when they preserve the same concept
- include another regional language variant only when it is plausibly useful for the project's context
- produce queries that choose one variant per group
- prioritize technically useful sources; recency and language are secondary quality signals

Keyword group rules:
- necessary: the core concepts that should dominate the first search pass
- complementary: useful refiners that increase precision and quality
- optional: non-essential terms that can be discarded if they add noise
- labels can be in Spanish for readability
- variants should be English-first, but may include Spanish or regional equivalents for the same concept; do not translate proper technical acronyms like FORM unnecessarily

Query pack rules:
- necessary_only: queries using only the necessary groups
- complementary_boosted: queries that add one complementary group to the necessary core
- optional_backups: a few backup queries that remain safe and focused, including Spanish/mixed-language queries when useful
- each query must be concise and should not use OR, parentheses, or boolean syntax

Return JSON with this exact structure:
- normalized_topic
- intent_summary
- keyword_groups.necessary
- keyword_groups.complementary
- keyword_groups.optional
- query_pack.necessary_only
- query_pack.complementary_boosted
- query_pack.optional_backups
- focus_terms

Intake:
- topic_es: ${intake.topic}
- problem_context_es: ${intake.problemContext}
- target_population_es: ${intake.targetPopulation}
- preferred_methodology_es: ${intake.preferredMethodology}
- research_line_es: ${intake.researchLine}
- available_data_es: ${intake.availableData}
- academic_constraints_es: ${intake.academicConstraints}
- advisor_notes_es: ${intake.advisorNotes}
`.trim();
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
        trackingAttribution: { stage: "source_discovery" },
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

function normalizeIntakeForSearch(intake: {
  topic: string;
  problemContext: string | null;
  researchLine: string | null;
  academicConstraints: string | null;
  targetPopulation: string | null;
  availableData: string | null;
  preferredMethodology: string | null;
  advisorNotes: string | null;
}): IntakeInput {
  return {
    topic: intake.topic,
    problemContext: intake.problemContext ?? undefined,
    researchLine: intake.researchLine ?? undefined,
    academicConstraints: intake.academicConstraints ?? undefined,
    targetPopulation: intake.targetPopulation ?? undefined,
    availableData: intake.availableData ?? undefined,
    preferredMethodology: intake.preferredMethodology ?? undefined,
    advisorNotes: intake.advisorNotes ?? undefined,
  };
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

function buildRelevanceScore(input: {
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
}) {
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
  return result.doi
    ? `doi:${result.doi.toLowerCase()}`
    : `title:${normalizeTitle(result.title)}:${result.year ?? "na"}`;
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

function pickDiverseCandidates(input: {
  rankedCandidates: RankedCandidate[];
  desiredTotal: number;
  metadata: ReferenceSearchV2Metadata;
  activeLanguage: string | null | undefined;
}) {
  const sortedGlobal = [...input.rankedCandidates].sort((left, right) => right.score - left.score);
  const selected = new Map<string, RankedCandidate>();
  const add = (candidate: RankedCandidate) => {
    selected.set(buildDedupKey(candidate.candidate), candidate);
  };

  const localLane = sortedGlobal
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
    .sort((left, right) => right.score - left.score)
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
  options?: {
    desiredTotal?: number;
    batchKind?: SourceDiscoveryBatchKind;
  },
): Promise<SearchProjectReferencesV2Result> {
  const batchKind = options?.batchKind ?? "initial";
  const requestedTotal = options?.desiredTotal ?? (batchKind === "more" ? MAX_SELECTED_REFERENCES : REFERENCE_BATCH_SIZE);
  const desiredTotal = Math.min(
    Math.max(requestedTotal, MIN_SELECTED_REFERENCES),
    batchKind === "more" ? MAX_SELECTED_REFERENCES : REFERENCE_BATCH_SIZE,
  );
  const aggregationTarget = batchKind === "more" ? Math.max(desiredTotal * 7, 40) : Math.max(desiredTotal * 4, 20);
  const [project, user, existingProjectReferences] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      include: {
        intake: true,
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

  if (!project || !project.intake) {
    throw new Error("El proyecto no existe o aun no tiene intake.");
  }

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
  const searchMetadata = await buildReferenceSearchMetadata(
    normalizeIntakeForSearch(project.intake),
  );
  const searchQuery = searchMetadata.normalizedTopic;
  const openAlexQueryPack = searchMetadata.openAlexQueryPack ??
    buildOpenAlexQueryPack(searchMetadata.keywordGroups, normalizeIntakeForSearch(project.intake));
  const exhaustiveQueryStages = [
    {
      stage: "necessary_only" as const,
      queries: openAlexQueryPack.strictBoolean.length > 0
        ? openAlexQueryPack.strictBoolean
        : searchMetadata.queryPack.necessaryOnly,
      openAlexFilters: OPENALEX_QUALITY_FILTERS,
    },
    {
      stage: "complementary_boosted" as const,
      queries: openAlexQueryPack.precisionBoolean.length > 0
        ? openAlexQueryPack.precisionBoolean
        : searchMetadata.queryPack.complementaryBoosted,
      openAlexFilters: OPENALEX_QUALITY_FILTERS,
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
  const queryStages = batchKind === "more"
    ? exhaustiveQueryStages
    : exhaustiveQueryStages.slice(0, 1).map((stage) => ({
        ...stage,
        queries: stage.queries.slice(0, 3),
      }));
  const attemptedQueries: string[] = [];

  if (!searchQuery || queryStages.every((entry) => entry.queries.length === 0)) {
    throw new Error("No hay suficiente informacion para buscar fuentes.");
  }

  await prisma.project.update({
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

  const aggregatedResults = new Map<string, SearchCandidate>();
  const attemptSummaries: Array<{ query: string; resultCount: number }> = [];
  const providerBreakdown = {
    openAlex: 0,
    crossref: 0,
  };

  for (const queryStage of queryStages) {
    for (const attemptQuery of queryStage.queries) {
      attemptedQueries.push(attemptQuery);
      const attemptResults = await searchOpenAlexWorks(attemptQuery, {
        filters: queryStage.openAlexFilters,
        perPage: 35,
        sort: "relevance_score:desc,cited_by_count:desc",
      });
      attemptSummaries.push({
        query: attemptQuery,
        resultCount: attemptResults.length,
      });

      for (const result of attemptResults) {
        const candidate: SearchCandidate = {
          ...result,
          matchedQuery: attemptQuery,
          matchedQueryStage: queryStage.stage,
          rawCrossrefJson: null,
          sourceProvider: Provider.OPENALEX,
        };
        const dedupKey = buildDedupKey(candidate);

        if (!aggregatedResults.has(dedupKey)) {
          aggregatedResults.set(dedupKey, candidate);
          providerBreakdown.openAlex += 1;
        }
      }

    }
  }

  if (aggregatedResults.size < desiredTotal) {
    for (const queryStage of [...queryStages].reverse()) {
      for (const attemptQuery of [...queryStage.queries].reverse()) {
        const crossrefResults = await searchCrossrefWorks(attemptQuery);

        for (const result of crossrefResults) {
          const candidate: SearchCandidate = {
            ...result,
            matchedQuery: attemptQuery,
            matchedQueryStage: queryStage.stage,
            normalizedTitle: result.title,
            sourceProvider: Provider.CROSSREF,
          };
          const dedupKey = buildDedupKey(candidate);

          if (!aggregatedResults.has(dedupKey)) {
            aggregatedResults.set(dedupKey, candidate);
            providerBreakdown.crossref += 1;
          }
        }

        if (aggregatedResults.size >= aggregationTarget) {
          break;
        }
      }

      if (aggregatedResults.size >= aggregationTarget) {
        break;
      }
    }
  }

  const candidatePool = Array.from(aggregatedResults.values());
  const rankedCandidates: RankedCandidate[] = [];
  let skippedCount = 0;

  for (const result of candidatePool) {
    let crossrefMetadata: CrossrefMessage | null = result.rawCrossrefJson ?? null;

    // Keep discovery fast and provider-neutral: rank candidates from their retrieval metadata.
    // DOI/source health checks happen in the later inspection gate, not during initial discovery.
    if (!crossrefMetadata && result.doi && result.sourceProvider === Provider.CROSSREF) {
      try {
        crossrefMetadata = await fetchCrossrefWorkByDoi(result.doi);
      } catch {
        crossrefMetadata = null;
      }
    }

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
    const pdfAccessible = Boolean(accessSignals.pdfUrl);
    const relevance = buildRelevanceScore({
      title: resolvedTitle,
      abstract: resolvedAbstract,
      matchedQuery: result.matchedQuery,
      matchedQueryStage: result.matchedQueryStage,
      keywordGroups: searchMetadata.keywordGroups,
      citationCount: result.citationCount,
      year: resolvedYear,
      hasPdfUrl: pdfAccessible,
      hasDoi: Boolean(result.doi),
      workType: resolvedWorkType,
      venue: resolvedVenue,
      language: result.language,
      activeLanguage: languageContext.activeLanguage,
      localObjectTerms: searchMetadata.localObjectTerms,
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
      pdfUrl: pdfAccessible ? accessSignals.pdfUrl : null,
      pdfAccessible,
    });
  }

  const selectedCandidates = pickDiverseCandidates({
    rankedCandidates,
    desiredTotal,
    metadata: searchMetadata,
    activeLanguage: languageContext.activeLanguage,
  });

  let createdCount = 0;
  let updatedCount = 0;
  const persistedResults: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
  }> = [];

  for (const ranked of selectedCandidates) {
    const result = ranked.candidate;
    const lookupKeys: Array<{ doi: string } | { openAlexId: string }> = [];

    if (result.doi) {
      lookupKeys.push({ doi: result.doi });
    }

    if (result.openAlexId) {
      lookupKeys.push({ openAlexId: result.openAlexId });
    }

    const existingReference = await prisma.reference.findFirst({
      where:
        lookupKeys.length > 1
          ? { OR: lookupKeys }
          : lookupKeys.length === 1
            ? lookupKeys[0]
            : {
                normalizedTitle: ranked.normalizedTitle,
                year: ranked.year ?? undefined,
              },
    });

    const reference = existingReference
      ? await prisma.reference.update({
          where: { id: existingReference.id },
          data: {
            doi: result.doi ?? existingReference.doi,
            openAlexId: result.openAlexId,
            crossrefId: ranked.crossrefMetadata?.DOI ?? existingReference.crossrefId,
            title: ranked.resolvedTitle,
            normalizedTitle: ranked.normalizedTitle,
            authorsJson: ranked.authors,
            abstract: ranked.abstract,
            venue: ranked.venue,
            year: ranked.year ?? existingReference.year,
            workType: ranked.workType,
            landingPageUrl: ranked.landingPageUrl,
            citationCount: ranked.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson:
              (ranked.crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        })
      : await prisma.reference.create({
          data: {
            doi: result.doi,
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
        sourceProvider: result.sourceProvider,
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
    referenceSearchVersion: "v2",
    batchKind,
    savedAt: new Date().toISOString(),
    searchQuery,
    attemptedQueries,
    totalResults: persistedResults.length,
    providerBreakdown,
    baseSelectedReferenceIds,
    metadata: searchMetadata,
    references: persistedResults.map((item) => ({
      referenceId: item.referenceId,
      relevanceScore: item.relevanceScore,
      scoreBreakdown: item.scoreBreakdown,
      suggestedSelectedOrder: suggestedSelectionOrders.get(item.referenceId) ?? null,
    })),
  };

  await logAuditEvent({
    eventType: "SEARCH_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.OPENALEX,
    userId,
    projectId: project.id,
    payloadJson: {
      referenceSearchVersion: "v2",
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
      searchSnapshot,
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

  return payload.searchSnapshot ?? null;
}
