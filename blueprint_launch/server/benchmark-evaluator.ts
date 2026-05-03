import { normalizeTitle } from "@/lib/text";

import type { BlueprintLaunchBenchmarkCase } from "@/blueprint_launch/benchmarks/benchmark-cases";
import type { BlueprintLaunchSearchSnapshot } from "@/blueprint_launch/server/local-playground-store";

export type BlueprintLaunchBenchmarkScores = {
  knowledgeAreaFit: number;
  subdomainFit: number;
  necessaryKeywordFit: number;
  complementaryKeywordFit: number;
  optionalKeywordFit: number;
  queryQuality: number;
  retrievalTop5Quality: number;
  noiseControl: number;
  traceability: number;
  overallScore: number;
};

export type BlueprintLaunchBenchmarkEvaluation = {
  scores: BlueprintLaunchBenchmarkScores;
  matchedExpectedTerms: {
    subdomain: string[];
    necessary: string[];
    complementary: string[];
    optional: string[];
    queries: string[];
  };
  forbiddenHits: {
    metadata: string[];
    results: string[];
  };
  relevantTop5Count: number;
  notes: string[];
};

function containsNormalized(text: string, term: string) {
  return normalizeTitle(text).includes(normalizeTitle(term));
}

const KNOWLEDGE_AREA_EQUIVALENCE: Record<string, string[]> = {
  "ingenieria estructural": ["ingenieria estructural", "structural engineering"],
  "ingenieria de sistemas": ["ingenieria de sistemas", "systems engineering"],
  medicina: ["medicina", "medicine"],
  educacion: ["educacion", "education"],
  administracion: ["administracion", "business administration", "management"],
  psicologia: ["psicologia", "psychology"],
  derecho: ["derecho", "law", "legal studies"],
  arquitectura: ["arquitectura", "architecture and urbanism", "architecture"],
  "ingenieria ambiental": ["ingenieria ambiental", "environmental engineering"],
  economia: ["economia", "economics"],
  comunicacion: ["comunicacion", "communications", "media studies"],
  "salud publica": ["salud publica", "public health"],
};

function matchesKnowledgeArea(actual: string | null | undefined, expected: string) {
  const normalizedExpected = normalizeTitle(expected);
  const normalizedActual = normalizeTitle(actual ?? "");
  const accepted = KNOWLEDGE_AREA_EQUIVALENCE[normalizedExpected] ?? [normalizedExpected];

  return accepted.some((item) => normalizedActual.includes(normalizeTitle(item)));
}

function countMatches(text: string, expectations: string[]) {
  return expectations.filter((term) => containsNormalized(text, term));
}

function scoreRatio(matches: number, total: number) {
  if (total <= 0) {
    return 5;
  }

  return Math.round((Math.min(matches / total, 1) * 5) * 10) / 10;
}

function flattenKeywordGroups(snapshot: BlueprintLaunchSearchSnapshot) {
  const metadata = snapshot.metadata;

  if (!metadata) {
    return {
      necessary: "",
      complementary: "",
      optional: "",
      queries: "",
      subdomain: "",
      metadata: "",
    };
  }

  const necessary = metadata.keywordGroups.necessary
    .flatMap((group) => [group.label, ...group.variants])
    .join(" ");
  const complementary = metadata.keywordGroups.complementary
    .flatMap((group) => [group.label, ...group.variants])
    .join(" ");
  const optional = metadata.keywordGroups.optional
    .flatMap((group) => [group.label, ...group.variants])
    .join(" ");
  const queries = [
    ...metadata.queryPack.necessaryOnly,
    ...metadata.queryPack.complementaryBoosted,
    ...metadata.queryPack.optionalBackups,
  ].join(" ");
  const subdomain = [
    metadata.knowledgeArea,
    metadata.subdomain,
    metadata.primarySystem,
    metadata.primaryPhenomenon,
    metadata.primaryGoal,
    metadata.normalizedTopic,
    metadata.intentSummary,
  ]
    .filter(Boolean)
    .join(" ");
  const metadataText = [necessary, complementary, optional, queries, subdomain].join(" ");

  return {
    necessary: normalizeTitle(necessary),
    complementary: normalizeTitle(complementary),
    optional: normalizeTitle(optional),
    queries: normalizeTitle(queries),
    subdomain: normalizeTitle(subdomain),
    metadata: normalizeTitle(metadataText),
  };
}

function evaluateRelevantTop5(
  snapshot: BlueprintLaunchSearchSnapshot,
  expectedTerms: string[],
  forbiddenTerms: string[],
) {
  const normalizedExpectedTerms = expectedTerms.map((term) => normalizeTitle(term));
  const normalizedForbiddenTerms = forbiddenTerms.map((term) => normalizeTitle(term));

  return snapshot.references.slice(0, 5).filter((item) => {
    const text = normalizeTitle(
      [item.reference.title, item.reference.abstract].filter(Boolean).join(" "),
    );
    const expectedHitCount = normalizedExpectedTerms.filter((term) => text.includes(term)).length;
    const forbiddenHitCount = normalizedForbiddenTerms.filter((term) => text.includes(term)).length;

    return expectedHitCount > 0 && forbiddenHitCount === 0;
  }).length;
}

function collectForbiddenHits(
  snapshot: BlueprintLaunchSearchSnapshot,
  forbiddenTerms: string[],
) {
  const flat = flattenKeywordGroups(snapshot);
  const normalizedForbiddenTerms = forbiddenTerms.map((term) => normalizeTitle(term));
  const metadataHits = normalizedForbiddenTerms.filter((term) => flat.metadata.includes(term));
  const resultHits = new Set<string>();

  for (const item of snapshot.references.slice(0, 5)) {
    const text = normalizeTitle(
      [item.reference.title, item.reference.abstract].filter(Boolean).join(" "),
    );

    for (const term of normalizedForbiddenTerms) {
      if (text.includes(term)) {
        resultHits.add(term);
      }
    }
  }

  return {
    metadata: metadataHits,
    results: Array.from(resultHits),
  };
}

export function evaluateBlueprintLaunchBenchmarkCase(input: {
  benchmarkCase: BlueprintLaunchBenchmarkCase;
  snapshot: BlueprintLaunchSearchSnapshot;
}) {
  const { benchmarkCase, snapshot } = input;
  const metadata = snapshot.metadata;
  const flat = flattenKeywordGroups(snapshot);
  const matchedExpectedTerms = {
    subdomain: countMatches(flat.subdomain, benchmarkCase.expectations.expectedSubdomainTerms),
    necessary: countMatches(flat.necessary, benchmarkCase.expectations.expectedNecessaryKeywords),
    complementary: countMatches(
      flat.complementary,
      benchmarkCase.expectations.expectedComplementaryKeywords,
    ),
    optional: countMatches(flat.optional, benchmarkCase.expectations.expectedOptionalKeywords),
    queries: countMatches(flat.queries, benchmarkCase.expectations.expectedQueryTerms),
  };
  const forbiddenHits = collectForbiddenHits(snapshot, benchmarkCase.expectations.forbiddenTerms);
  const relevantTop5Count = evaluateRelevantTop5(
    snapshot,
    [
      ...benchmarkCase.expectations.expectedNecessaryKeywords,
      ...benchmarkCase.expectations.expectedComplementaryKeywords,
      ...benchmarkCase.expectations.expectedQueryTerms,
    ],
    benchmarkCase.expectations.forbiddenTerms,
  );

  const scores: BlueprintLaunchBenchmarkScores = {
    knowledgeAreaFit: matchesKnowledgeArea(metadata?.knowledgeArea, benchmarkCase.knowledgeAreaLabel)
      ? 5
      : 2,
    subdomainFit: scoreRatio(
      matchedExpectedTerms.subdomain.length,
      benchmarkCase.expectations.expectedSubdomainTerms.length,
    ),
    necessaryKeywordFit: scoreRatio(
      matchedExpectedTerms.necessary.length,
      benchmarkCase.expectations.expectedNecessaryKeywords.length,
    ),
    complementaryKeywordFit: scoreRatio(
      matchedExpectedTerms.complementary.length,
      benchmarkCase.expectations.expectedComplementaryKeywords.length,
    ),
    optionalKeywordFit: scoreRatio(
      matchedExpectedTerms.optional.length,
      benchmarkCase.expectations.expectedOptionalKeywords.length,
    ),
    queryQuality: scoreRatio(
      matchedExpectedTerms.queries.length,
      benchmarkCase.expectations.expectedQueryTerms.length,
    ),
    retrievalTop5Quality: scoreRatio(
      relevantTop5Count,
      Math.max(benchmarkCase.expectations.minRelevantTop5, 1),
    ),
    noiseControl:
      forbiddenHits.metadata.length === 0 && forbiddenHits.results.length === 0
        ? 5
        : Math.max(0, 5 - forbiddenHits.metadata.length - forbiddenHits.results.length),
    traceability:
      metadata &&
      metadata.plannerStatus &&
      metadata.normalizedTopic &&
      metadata.intentSummary &&
      metadata.keywordGroups.necessary.length > 0
        ? 5
        : 2,
    overallScore: 0,
  };

  const weightedAverage =
    scores.knowledgeAreaFit * 0.1 +
    scores.subdomainFit * 0.12 +
    scores.necessaryKeywordFit * 0.18 +
    scores.complementaryKeywordFit * 0.12 +
    scores.optionalKeywordFit * 0.06 +
    scores.queryQuality * 0.14 +
    scores.retrievalTop5Quality * 0.18 +
    scores.noiseControl * 0.06 +
    scores.traceability * 0.04;

  scores.overallScore = Math.round(weightedAverage * 100) / 100;

  const notes: string[] = [];

  if (metadata?.plannerStatus === "fallback") {
    notes.push("El planner cayo en fallback.");
  }

  if (metadata?.plannerErrorMessage) {
    notes.push(`Error del planner: ${metadata.plannerErrorMessage}`);
  }

  if (matchedExpectedTerms.necessary.length < benchmarkCase.expectations.expectedNecessaryKeywords.length) {
    notes.push("Cobertura incompleta de keywords necesarias.");
  }

  if (matchedExpectedTerms.queries.length < benchmarkCase.expectations.expectedQueryTerms.length) {
    notes.push("Las queries no cubren todos los terminos esperados.");
  }

  if (relevantTop5Count < benchmarkCase.expectations.minRelevantTop5) {
    notes.push("El top 5 recuperado contiene menos resultados relevantes de lo esperado.");
  }

  if (forbiddenHits.metadata.length > 0 || forbiddenHits.results.length > 0) {
    notes.push("Se detectaron terminos prohibidos en metadata o resultados.");
  }

  return {
    scores,
    matchedExpectedTerms,
    forbiddenHits,
    relevantTop5Count,
    notes,
  } satisfies BlueprintLaunchBenchmarkEvaluation;
}
