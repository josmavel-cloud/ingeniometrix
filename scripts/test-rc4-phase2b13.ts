import assert from "node:assert/strict";
import fixture from "./fixtures/phase2b13-live-pool.json";
import seismic from "./fixtures/phase2b1-seismic.json";
import { composeSemanticQueries, validateScientificFamily } from "@/lib/retrieval-query-composition";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { prepareCandidateReview, validateCandidateReviews, finalCandidateAdmission, MAX_REVIEW_CANDIDATES, type ReviewItem } from "@/server/retrieval/candidate-review-policy";
import { reviewCandidateBatch } from "@/server/retrieval/candidate-semantic-review";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";

async function main() {
  const plan = fixture.metadata.enrichment.scientificConceptPlan as ScientificConceptPlan;
  const pool = fixture.candidates;
  const prepared = prepareCandidateReview(pool, plan);
  assert(prepared.batch.length <= MAX_REVIEW_CANDIDATES);
  const knownOff = new Set(pool.filter(c => c.expectedRelevance === "OFF_TOPIC").map(c => c.candidateId));
  const coarseOff = [...prepared.assessments].filter(([,a]) => a.relevance === "OFF_TOPIC");
  assert(coarseOff.some(([id]) => knownOff.has(id)), "obvious negatives bypass the model");
  const dimensions = Object.keys(seismic.intent.fieldProvenance);
  // Persisted independent relevance labels simulate the reviewer, never production logic.
  const simulated = { reviews: prepared.batch.map(c => {
    const expected = pool.find(p => p.candidateId === c.candidateId)!;
    const positive = ["HIGHLY_RELEVANT", "RELEVANT"].includes(expected.expectedRelevance);
    return { candidateId: c.candidateId, relevance: expected.expectedRelevance, role: positive ? "DIRECT" : "NONE",
      matchedIntentDimensions: positive ? ["problem", "object"] : [], mismatches: [], confidence: "HIGH",
      rationale: "Offline persisted independent relevance label, not a live model assessment.",
      evidence: [{ field: "title", quote: c.title }] };
  }) };
  const reviewed = validateCandidateReviews(simulated, prepared.batch, pool, dimensions, plan.searchIntentHash);
  const final = new Map([...prepared.assessments, ...reviewed]);
  const admitted = pool.filter(c => final.has(c.candidateId) && finalCandidateAdmission(final.get(c.candidateId)!) === "ADMITTED");
  const tp = admitted.filter(c => ["HIGHLY_RELEVANT", "RELEVANT"].includes(c.expectedRelevance));
  const fp = admitted.length - tp.length;
  assert(tp.length >= 15, `recover materially more than 5/27, got ${tp.length}`);
  assert(fp <= 1, `precision must not collapse: ${fp} false positives`);
  assert(tp.length > 5);
  assert.throws(() => validateCandidateReviews({reviews: simulated.reviews.slice(1)}, prepared.batch, pool, dimensions, plan.searchIntentHash), /INCOMPLETE/);
  const forged = structuredClone(simulated); forged.reviews[0].evidence[0].quote = "a fabricated quotation never present in the metadata";
  assert.throws(() => validateCandidateReviews(forged, prepared.batch, pool, dimensions, plan.searchIntentHash), /UNGROUNDED/);
  const alien = structuredClone(simulated); alien.reviews[0].candidateId = "invented";
  assert.throws(() => validateCandidateReviews(alien, prepared.batch, pool, dimensions, plan.searchIntentHash), /UNKNOWN_CANDIDATE/);
  const duplicate = structuredClone(simulated); duplicate.reviews[0] = duplicate.reviews[1];
  assert.throws(() => validateCandidateReviews(duplicate, prepared.batch, pool, dimensions, plan.searchIntentHash), /DUPLICATE/);
  const original = JSON.stringify(plan);
  const queries = composeSemanticQueries({necessary: [], complementary: [], optional: [], conceptPlan:plan});
  assert(queries.validation.valid);
  assert(!queries.necessaryOnly.some(q => q.includes('"evaluate"')));
  assert(!queries.necessaryOnly.some(q => q.includes('"especímenes de albañilería de escala natural"')));
  assert(queries.plannedQueries.some(q => q.translationStatus === "ORIGINAL_ONLY_ENGLISH_INCOMPLETE"));
  assert.equal(JSON.stringify(plan), original, "fallback preserves input, no invented translation");
  const bad = fixture.metadata.queryPack.plannedQueries.find(q => q.family === "RESEARCH_ACTION_PRECEDENT")!;
  assert(validateScientificFamily(bad as any, plan).includes("GENERIC_ACTION_WITHOUT_SCIENTIFIC_IDENTITY"));
  let calls = 0;
  const input = semanticPlannerInput(seismic.intent as ResearchSearchIntent, plan.searchIntentHash);
  const invalid = await reviewCandidateBatch(input, plan, pool, { generateStructuredObject: async () => { calls++; return { reviews: [] } as any; } });
  assert.equal(calls, 1); assert.equal(invalid.trace.status, "DEGRADED");
  assert.equal(invalid.trace.failureCategory, "REVIEW_BATCH_INCOMPLETE_OR_DUPLICATE");
  const timeout = await reviewCandidateBatch(input, plan, pool, { generateStructuredObject: async () => { throw new Error("timeout"); } });
  assert.equal(timeout.trace.status, "DEGRADED");
  // Role outcomes stay separate from relevance/access, with no required population or geography.
  for (const [name, phenomenon, object, role] of [
    ["structural", "fatigue response", "steel joints", "DIRECT"],
    ["education", "feedback", "digital mathematics", "DIRECT"],
    ["qualitative", "lived experience", "migration narratives", "THEORETICAL"],
    ["health", "treatment adherence", "diabetes care", "METHODOLOGICAL"],
    ["humanities", "narrative memory", "historical corpus", "THEORETICAL"],
  ]) {
    const candidate = { candidateId:name, title:`${phenomenon} in ${object}`, abstract:null, year:null };
    const row: ReviewItem = { candidateId:name, relevance:"RELEVANT", role:role as ReviewItem["role"], matchedIntentDimensions:["problem"], mismatches:[], confidence:"MEDIUM", rationale:"Title supports the stated role; no unseen text claims.", evidence:[{field:"title",quote:candidate.title}] };
    const a = validateCandidateReviews({reviews:[row]}, [candidate], [candidate], ["problem"], "test").get(name)!;
    assert.equal(finalCandidateAdmission(a), "ADMITTED"); assert.equal(a.role, role);
    assert.equal(finalCandidateAdmission({...a, confidence:"LOW"}), "NEEDS_INSPECTION");
    assert.equal(finalCandidateAdmission({...a, relevance:"PARTIALLY_RELEVANT"}), "NEEDS_INSPECTION");
  }
  console.log(JSON.stringify({status:"PASS",evaluation:"simulated reviewer using persisted independent labels",baselineRetention:"5/27",afterRetention:`${tp.length}/27`,precision:`${tp.length}/${admitted.length}`,falsePositives:fp,batchSize:prepared.batch.length,coarseRejected:coarseOff.length,deferred:prepared.deferredIds.length,queries:queries.necessaryOnly}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
