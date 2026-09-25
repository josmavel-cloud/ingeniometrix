import assert from "node:assert/strict";

import { admittedOnly, decideReferenceAdmission, REFERENCE_ADMISSION_POLICY_VERSION } from "@/server/retrieval/reference-admission";
import { buildRelevanceScore, pickDiverseCandidates, type ReferenceSearchV2Metadata, type SearchProjectReferencesV2Result } from "@/server/retrieval/reference-search-v2";
import { suggestedSelectionIds } from "@/server/mvp/source-discovery-service";

global.fetch = async () => { throw new Error("NO_PROVIDER_OR_DOCUMENT_FETCH"); };

const metadata: ReferenceSearchV2Metadata = {
  planSource: "fallback", normalizedTopic: "Retroalimentacion en matematicas digitales",
  intentSummary: "Disenar y evaluar retroalimentacion para actividades digitales de matematicas en secundaria",
  keywordGroups: {
    necessary: [
      { label: "retroalimentacion", variants: ["feedback", "retroalimentacion"] },
      { label: "matematicas digitales", variants: ["digital mathematics", "matematicas digitales"] },
    ],
    complementary: [{ label: "secundaria", variants: ["secondary school", "secundaria"] }],
    optional: [{ label: "Lima", variants: ["Lima"] }],
  },
  queryPack: { necessaryOnly: [], complementaryBoosted: [], optionalBackups: [] },
  focusTerms: [], scoringRules: [],
};

function candidate(title: string, abstract: string | null, options: {
  citationCount?: number; year?: number; hasPdfUrl?: boolean; venue?: string;
} = {}) {
  const relevance = buildRelevanceScore({
    title, abstract, matchedQuery: "feedback digital mathematics",
    matchedQueryStage: "necessary_only", keywordGroups: metadata.keywordGroups,
    citationCount: options.citationCount ?? 0, year: options.year ?? 2020,
    hasPdfUrl: options.hasPdfUrl ?? false, hasDoi: true, workType: "article",
    venue: options.venue ?? "Journal of Education", language: "en", activeLanguage: "en",
  });
  const admission = decideReferenceAdmission({ title, abstract, score: relevance.score, breakdown: relevance.breakdown });
  return {
    candidate: {
      sourceProvider: "OPENALEX", matchedQuery: "feedback digital mathematics", matchedQueryStage: "necessary_only",
      openAlexId: null, doi: null, title, normalizedTitle: title.toLowerCase(), language: "en", authors: [], abstract,
      venue: options.venue ?? "Journal of Education", year: options.year ?? 2020, workType: "article", landingPageUrl: null,
      citationCount: options.citationCount ?? 0, rawOpenAlexJson: null, rawCrossrefJson: null,
    },
    resolvedTitle: title, normalizedTitle: title.toLowerCase(), authors: [], abstract,
    venue: options.venue ?? "Journal of Education", year: options.year ?? 2020, workType: "article", landingPageUrl: null,
    citationCount: options.citationCount ?? 0, crossrefMetadata: null,
    score: relevance.score, scoreBreakdown: relevance.breakdown, admission,
    pdfUrl: options.hasPdfUrl ? "https://example.test/paper.pdf" : null, pdfAccessible: Boolean(options.hasPdfUrl),
  };
}

const historicalBadTitles = [
  "Evaluacion de la bioacumulacion de cobre en Euglena gracilis mediante la tecnica de fluorescencia de rayos X",
  "Evaluacion de la tecnica de contraimmunoelectroforesis para determinar la potencia antigena de las vacunas antirrabicas",
  "EVALUACION INICIAL EN POBLACIONES HETEROGENEAS DE CAMOTE (Ipomea Batatas (L.) lam) EN TACNA",
  "Los Estudios Sobre recursos Naturales en las Americas: Proyecto 29 del Programa de Cooperacion Tecnica de la Organizacion de los Estados Americanos, Centro de Entrenamiento para la Evaluacion de Recursos Naturales",
  "Evaluación de la crianza artificial de terneros lactantes, con dos tipos de alimentación inicial",
];
const negatives = historicalBadTitles.map((title) => candidate(title, null));
assert.equal(negatives.length, 5);
for (const item of negatives) {
  assert.equal(item.score, 0);
  assert.equal(item.scoreBreakdown.necessaryMatches.length, 0);
  assert.equal(item.admission.state, "REJECTED_OFF_TOPIC");
}

const direct = candidate("Feedback in digital mathematics activities for secondary school students", "A study of feedback and digital mathematics activities in secondary school.");
const methodological = candidate("Evaluation methods for feedback in digital mathematics", "A methodological precedent for evaluating secondary school mathematics feedback.");
const theoretical = candidate("A theory of formative feedback in digital mathematics", "Conceptual framework for feedback in secondary school digital mathematics learning.");
const sparse = candidate("Feedback in digital learning", null);
const differentGeography = candidate("Feedback in digital mathematics in Kenya", "Secondary school digital mathematics feedback is studied in Kenya.");
const foundational = candidate("Foundations of feedback in digital mathematics", "A foundational study of feedback in digital mathematics education.", { year: 1981 });
for (const positive of [direct, methodological, theoretical, differentGeography, foundational]) {
  assert.equal(positive.admission.state, "ADMITTED", positive.resolvedTitle);
}
assert.equal(sparse.admission.state, "NEEDS_INSPECTION");

for (const negative of [
  candidate("Antirabies vaccine response in domestic animals", "A veterinary vaccine study.", { citationCount: 50000 }),
  candidate("Copper toxicity in Euglena cultures", "A biological toxicity experiment.", { hasPdfUrl: true }),
  candidate("Sweet potato yield in Lima", "An agronomic field study in Lima."),
  candidate("Calf feeding outcomes", "A livestock study.", { year: new Date().getFullYear() }),
]) assert.equal(negative.admission.state, "REJECTED_OFF_TOPIC");

const all = [...negatives, direct, methodological, theoretical, sparse, differentGeography, foundational];
for (const desiredTotal of [5, 10, 30]) {
  const selected = pickDiverseCandidates({
    rankedCandidates: admittedOnly(all) as Parameters<typeof pickDiverseCandidates>[0]["rankedCandidates"],
    desiredTotal, metadata, activeLanguage: "en",
  });
  assert.equal(selected.length, 5);
  assert.ok(selected.every((item) => item.admission.state === "ADMITTED"));
}
assert.equal(pickDiverseCandidates({ rankedCandidates: admittedOnly(negatives) as Parameters<typeof pickDiverseCandidates>[0]["rankedCandidates"], desiredTotal: 5, metadata, activeLanguage: "en" }).length, 0);
assert.equal(pickDiverseCandidates({ rankedCandidates: admittedOnly([direct, methodological]) as Parameters<typeof pickDiverseCandidates>[0]["rankedCandidates"], desiredTotal: 5, metadata, activeLanguage: "en" }).length, 2);

const snapshotReferences = all.map((item, index) => ({
  referenceId: `reference-${index}`, relevanceScore: item.score,
  scoreBreakdown: item.scoreBreakdown, admission: item.admission,
  suggestedSelectedOrder: item.admission.state === "ADMITTED" ? index + 1 : null,
}));
const result = { searchSnapshot: { references: snapshotReferences } } as SearchProjectReferencesV2Result;
assert.equal(suggestedSelectionIds(result).length, 5);
assert.ok(suggestedSelectionIds(result).every((id) => !historicalBadTitles.some((_, index) => id === `reference-${index}`)));
const rejectedOnlyResult = { searchSnapshot: { references: snapshotReferences.slice(0, 5) } } as SearchProjectReferencesV2Result;
assert.deepEqual(suggestedSelectionIds(rejectedOnlyResult), []);
assert.equal(decideReferenceAdmission({ title: null, abstract: null, score: null, breakdown: null }).state, "NEEDS_INSPECTION");
assert.equal(REFERENCE_ADMISSION_POLICY_VERSION, "reference-admission-v1");
console.log("PASS Phase 2A: historical negatives, positive/uncertain controls, quality non-rescue, admission before diversity, alternate suggestions; no external calls");
