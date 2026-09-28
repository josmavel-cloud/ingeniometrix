import assert from "node:assert/strict";
import fixture from "./fixtures/phase2b13-live-pool.json";
import seismic from "./fixtures/phase2b1-seismic.json";
import { composeSemanticQueries, validateScientificFamily } from "@/lib/retrieval-query-composition";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { prepareCandidateReview, validateCandidateReviews, finalCandidateAdmission, MAX_REVIEW_CANDIDATES, candidateEvidenceUnits, type ReviewItem } from "@/server/retrieval/candidate-review-policy";
import { reviewCandidateBatch } from "@/server/retrieval/candidate-semantic-review";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";

async function main() {
  const plan = fixture.metadata.enrichment.scientificConceptPlan as ScientificConceptPlan;
  const pool = fixture.candidates;
  const prepared = prepareCandidateReview(pool, plan);
  assert(prepared.batch.length <= MAX_REVIEW_CANDIDATES);
  assert(prepared.batches.length <= 2);
  assert(prepared.batches.every(b => b.length <= 30));
  const knownOff = new Set(pool.filter(c => c.expectedRelevance === "OFF_TOPIC").map(c => c.candidateId));
  const coarseOff = [...prepared.assessments].filter(([,a]) => a.relevance === "OFF_TOPIC");
  assert(coarseOff.some(([id]) => knownOff.has(id)), "obvious negatives bypass the model");
  const dimensions = Object.keys(seismic.intent.fieldProvenance);
  // Persisted independent relevance labels simulate the reviewer, never production logic.
  const simulated = { reviews: prepared.batches.flat().map(c => {
    const expected = pool.find(p => p.candidateId === c.candidateId)!;
    const positive = ["HIGHLY_RELEVANT", "RELEVANT"].includes(expected.expectedRelevance);
    return { candidateId: c.candidateId, relevance: expected.expectedRelevance, role: positive ? "DIRECT" : "NONE",
      matchedIntentDimensions: positive ? ["problem", "object"] : [], mismatches: [], confidence: "HIGH",
      rationale: "Offline persisted independent relevance label, not a live model assessment.",
      supportingEvidenceIds: [c.evidenceUnits[0].evidenceId], mismatchEvidenceIds: [] };
  }) };
  const reviewed = prepared.batches.map(batch => validateCandidateReviews({reviews:simulated.reviews.filter(r=>batch.some(c=>c.candidateId===r.candidateId))}, batch, pool, dimensions, plan.searchIntentHash, prepared.assessments));
  const final = new Map([...prepared.assessments, ...reviewed.flatMap(r=>[...r.assessments])]);
  const admitted = pool.filter(c => final.has(c.candidateId) && finalCandidateAdmission(final.get(c.candidateId)!) === "ADMITTED");
  const tp = admitted.filter(c => ["HIGHLY_RELEVANT", "RELEVANT"].includes(c.expectedRelevance));
  const fp = admitted.length - tp.length;
  assert(tp.length >= 15, `recover materially more than 5/27, got ${tp.length}`);
  assert(fp <= 1, `precision must not collapse: ${fp} false positives`);
  assert(tp.length > 5);
  const first = prepared.batch;
  const firstRows = simulated.reviews.filter(r=>first.some(c=>c.candidateId===r.candidateId));
  const missing = validateCandidateReviews({reviews:firstRows.slice(1)}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(missing.statuses.get(first[0].candidateId),"INCOMPLETE");
  const forged = structuredClone(firstRows); forged[0].supportingEvidenceIds[0] = "fabricated";
  const salvaged = validateCandidateReviews({reviews:forged}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(salvaged.statuses.get(first[0].candidateId),"INVALID_UNGROUNDED");
  assert.equal(salvaged.assessments.size, first.length-1,"one bad citation cannot invalidate valid peers");
  const alien = structuredClone(firstRows); alien[0].candidateId = "invented";
  const alienResult = validateCandidateReviews({reviews:alien}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(alienResult.statuses.get(first[0].candidateId),"INCOMPLETE");
  const duplicate = structuredClone(firstRows); duplicate[0] = duplicate[1];
  const duplicateResult = validateCandidateReviews({reviews:duplicate}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(duplicateResult.statuses.get(first[1].candidateId),"INVALID_CANDIDATE");
  const crossCandidate = structuredClone(firstRows);
  crossCandidate[0].supportingEvidenceIds[0] = first[1].evidenceUnits[0].evidenceId;
  assert.equal(validateCandidateReviews({reviews:crossCandidate},first,pool,dimensions,plan.searchIntentHash).statuses.get(first[0].candidateId),"INVALID_UNGROUNDED");
  const badSchema = structuredClone(firstRows) as unknown as Array<Record<string,unknown>>;
  badSchema[0].role = "FABRICATED_ROLE";
  assert.equal(validateCandidateReviews({reviews:badSchema},first,pool,dimensions,plan.searchIntentHash).statuses.get(first[0].candidateId),"INVALID_SCHEMA");
  const roleCandidate = first.find(c=>c.reviewTask==="ROLE_ONLY");
  if (roleCandidate) {
    const previous = prepared.assessments.get(roleCandidate.candidateId)!;
    const roleResult = validateCandidateReviews({reviews:[{candidateId:roleCandidate.candidateId,relevance:"OFF_TOPIC",role:"METHODOLOGICAL",
      matchedIntentDimensions:previous.matchedIntentDimensions,mismatches:[],confidence:"MEDIUM",rationale:"Transferable method stated in metadata.",
      supportingEvidenceIds:[roleCandidate.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[]}]},[roleCandidate],pool,dimensions,plan.searchIntentHash,prepared.assessments);
    assert.equal(roleResult.assessments.get(roleCandidate.candidateId)?.relevance,previous.relevance,"role-only cannot downgrade relevance");
    assert.equal(roleResult.assessments.get(roleCandidate.candidateId)?.role,"METHODOLOGICAL");
  }
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
  assert.equal(invalid.trace.failureCategory, "REVIEW_GROSS_CANDIDATE_SET_MISMATCH");
  const timeout = await reviewCandidateBatch(input, plan, pool, { generateStructuredObject: async () => { throw new Error("timeout"); } });
  assert.equal(timeout.trace.status, "DEGRADED");
  let batchCalls = 0;
  const itemFailure = await reviewCandidateBatch(input,plan,pool,{async generateStructuredObject<T>(request: {prompt:string}) {
    batchCalls++;
    const requested = JSON.parse(request.prompt.split("CANDIDATES AND EVIDENCE UNITS:\n")[1]) as typeof prepared.batch;
    return {reviews:requested.map((c,i)=>({candidateId:c.candidateId,relevance:"RELEVANT",role:"DIRECT",matchedIntentDimensions:["problem"],
      mismatches:[],confidence:"MEDIUM",rationale:"Supported by title metadata.",supportingEvidenceIds:[batchCalls===1&&i===0?"invalid":c.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[]}))} as T;
  }});
  assert.equal(batchCalls,prepared.batches.length,"item failure does not trigger a paid retry or skip the second planned batch");
  assert.equal(itemFailure.trace.itemValidation.filter(x=>x.status==="INVALID_UNGROUNDED").length,1);
  assert.equal(itemFailure.trace.status,"PARTIAL");
  assert.equal(itemFailure.trace.batches.reduce((n,b)=>n+b.validated,0),prepared.batches.flat().length-1);
  // Role outcomes stay separate from relevance/access, with no required population or geography.
  for (const [name, phenomenon, object, role] of [
    ["structural", "fatigue response", "steel joints", "DIRECT"],
    ["education", "feedback", "digital mathematics", "DIRECT"],
    ["qualitative", "lived experience", "migration narratives", "THEORETICAL"],
    ["health", "treatment adherence", "diabetes care", "METHODOLOGICAL"],
    ["humanities", "narrative memory", "historical corpus", "THEORETICAL"],
  ]) {
    const candidate = { candidateId:name, title:`${phenomenon} in ${object}`, abstract:null, year:null };
    const request = {...candidate,reviewTask:"RELEVANCE_AND_ROLE" as const,evidenceUnits:candidateEvidenceUnits(candidate)};
    const row: ReviewItem = { candidateId:name, relevance:"RELEVANT", role:role as ReviewItem["role"], matchedIntentDimensions:["problem"], mismatches:[], confidence:"MEDIUM", rationale:"Title supports the stated role; no unseen text claims.", supportingEvidenceIds:[request.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[] };
    const a = validateCandidateReviews({reviews:[row]}, [request], [candidate], ["problem"], "test").assessments.get(name)!;
    assert.equal(finalCandidateAdmission(a), "ADMITTED"); assert.equal(a.role, role);
    assert.equal(finalCandidateAdmission({...a, confidence:"LOW"}), "NEEDS_INSPECTION");
    assert.equal(finalCandidateAdmission({...a, relevance:"PARTIALLY_RELEVANT"}), "NEEDS_INSPECTION");
  }
  console.log(JSON.stringify({status:"PASS",evaluation:"simulated reviewer using persisted independent labels",baselineRetention:"5/27",afterRetention:`${tp.length}/27`,precision:`${tp.length}/${admitted.length}`,falsePositives:fp,batchSize:prepared.batch.length,coarseRejected:coarseOff.length,deferred:prepared.deferredIds.length,queries:queries.necessaryOnly}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
