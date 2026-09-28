import assert from "node:assert/strict";
import fixture from "./fixtures/phase2b13-live-pool.json";
import seismic from "./fixtures/phase2b1-seismic.json";
import { composeSemanticQueries, validateScientificFamily } from "@/lib/retrieval-query-composition";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { prepareCandidateReview, validateCandidateReviews, finalCandidateAdmission, MAX_REVIEW_CANDIDATES, candidateEvidenceUnits, type ReviewItem } from "@/server/retrieval/candidate-review-policy";
import { classifyCandidateReviewFailure, reviewCandidateBatch } from "@/server/retrieval/candidate-semantic-review";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";

async function main() {
  assert.equal(classifyCandidateReviewFailure(new SyntaxError("private output"), "PROVIDER"), "REVIEW_STRUCTURED_OUTPUT_PARSE_FAILURE");
  assert.equal(classifyCandidateReviewFailure(new IncompleteStructuredOutputError("private output", "max_output_tokens"), "PROVIDER"), "REVIEW_PROVIDER_OUTPUT_INCOMPLETE");
  assert.equal(classifyCandidateReviewFailure(Object.assign(new Error("private path"), { code: "EROFS" }), "PROVIDER"), "REVIEW_POST_PROVIDER_USAGE_RECORD_FAILURE");
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
  assert.equal(missing.diagnostics.get(first[0].candidateId)?.reason,"MISSING_OUTPUT");
  const forged = structuredClone(firstRows); forged[0].supportingEvidenceIds[0] = "fabricated";
  const salvaged = validateCandidateReviews({reviews:forged}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(salvaged.statuses.get(first[0].candidateId),"INVALID_UNGROUNDED");
  assert.equal(salvaged.diagnostics.get(first[0].candidateId)?.reason,"INVALID_EVIDENCE_ID");
  assert.deepEqual(salvaged.diagnostics.get(first[0].candidateId)?.returnedEvidenceRefs,["fabricated"]);
  assert(salvaged.diagnostics.get(first[0].candidateId)?.availableEvidenceRefs.includes(first[0].evidenceUnits[0].evidenceId));
  assert.equal(salvaged.assessments.size, first.length-1,"one bad citation cannot invalidate valid peers");
  const absentGrounding = structuredClone(firstRows); absentGrounding[0].supportingEvidenceIds = [];
  assert.equal(validateCandidateReviews({reviews:absentGrounding},first,pool,dimensions,plan.searchIntentHash)
    .diagnostics.get(first[0].candidateId)?.reason,"MISSING_REQUIRED_GROUNDING");
  const duplicateEvidence = structuredClone(firstRows); duplicateEvidence[0].supportingEvidenceIds.push(duplicateEvidence[0].supportingEvidenceIds[0]);
  assert.equal(validateCandidateReviews({reviews:duplicateEvidence},first,pool,dimensions,plan.searchIntentHash)
    .diagnostics.get(first[0].candidateId)?.reason,"DUPLICATE_EVIDENCE_ID");
  const duplicateMismatch = structuredClone(firstRows) as ReviewItem[];
  duplicateMismatch[0].mismatchEvidenceIds = [first[0].evidenceUnits[0].evidenceId, first[0].evidenceUnits[0].evidenceId];
  assert.equal(validateCandidateReviews({reviews:duplicateMismatch},first,pool,dimensions,plan.searchIntentHash)
    .diagnostics.get(first[0].candidateId)?.reason,"DUPLICATE_EVIDENCE_ID");
  const dualUse = structuredClone(firstRows) as ReviewItem[];
  dualUse[0].mismatchEvidenceIds = [first[0].evidenceUnits[0].evidenceId];
  const dualUseResult = validateCandidateReviews({reviews:dualUse},first,pool,dimensions,plan.searchIntentHash);
  assert.equal(dualUseResult.statuses.get(first[0].candidateId),"VALID");
  assert.deepEqual(dualUseResult.dualUseEvidenceIds.get(first[0].candidateId),[first[0].evidenceUnits[0].evidenceId]);
  assert.equal(dualUseResult.assessments.size,first.length);
  const alien = structuredClone(firstRows); alien[0].candidateId = "invented";
  const alienResult = validateCandidateReviews({reviews:alien}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(alienResult.statuses.get(first[0].candidateId),"INCOMPLETE");
  assert.equal(alienResult.diagnostics.get("invented")?.reason,"UNKNOWN_CANDIDATE");
  const duplicate = structuredClone(firstRows); duplicate[0] = duplicate[1];
  const duplicateResult = validateCandidateReviews({reviews:duplicate}, first, pool, dimensions, plan.searchIntentHash);
  assert.equal(duplicateResult.statuses.get(first[1].candidateId),"INVALID_CANDIDATE");
  assert.equal(duplicateResult.diagnostics.get(first[1].candidateId)?.reason,"DUPLICATE_ITEM");
  const crossCandidate = structuredClone(firstRows);
  crossCandidate[0].supportingEvidenceIds[0] = first[1].evidenceUnits[0].evidenceId;
  assert.equal(validateCandidateReviews({reviews:crossCandidate},first,pool,dimensions,plan.searchIntentHash).statuses.get(first[0].candidateId),"INVALID_UNGROUNDED");
  assert.equal(validateCandidateReviews({reviews:crossCandidate},first,pool,dimensions,plan.searchIntentHash)
    .diagnostics.get(first[0].candidateId)?.reason,"WRONG_CANDIDATE_EVIDENCE");
  const badSchema = structuredClone(firstRows) as unknown as Array<Record<string,unknown>>;
  badSchema[0].role = "FABRICATED_ROLE";
  assert.equal(validateCandidateReviews({reviews:badSchema},first,pool,dimensions,plan.searchIntentHash).statuses.get(first[0].candidateId),"INVALID_SCHEMA");
  assert.equal(validateCandidateReviews({reviews:badSchema},first,pool,dimensions,plan.searchIntentHash)
    .diagnostics.get(first[0].candidateId)?.reason,"INVALID_SCHEMA");
  const roleCandidate = first.find(c=>c.reviewTask==="ROLE_ONLY");
  if (roleCandidate) {
    const previous = prepared.assessments.get(roleCandidate.candidateId)!;
    const roleResult = validateCandidateReviews({reviews:[{candidateId:roleCandidate.candidateId,relevance:"OFF_TOPIC",role:"METHODOLOGICAL",
      matchedIntentDimensions:previous.matchedIntentDimensions,mismatches:[],confidence:"MEDIUM",rationale:"Transferable method stated in metadata.",
      supportingEvidenceIds:[roleCandidate.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[]}]},[roleCandidate],pool,dimensions,plan.searchIntentHash,prepared.assessments);
    assert.equal(roleResult.assessments.get(roleCandidate.candidateId)?.relevance,previous.relevance,"role-only cannot downgrade relevance");
    assert.equal(roleResult.assessments.get(roleCandidate.candidateId)?.role,"METHODOLOGICAL");
    const roleDual = validateCandidateReviews({reviews:[{candidateId:roleCandidate.candidateId,relevance:"OFF_TOPIC",role:"METHODOLOGICAL",
      matchedIntentDimensions:previous.matchedIntentDimensions,mismatches:[],confidence:"MEDIUM",rationale:"One passage supports the method and limits transfer.",
      supportingEvidenceIds:[roleCandidate.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[roleCandidate.evidenceUnits[0].evidenceId]}]},
    [roleCandidate],pool,dimensions,plan.searchIntentHash,prepared.assessments);
    assert.equal(roleDual.statuses.get(roleCandidate.candidateId),"VALID");
    assert.equal(roleDual.assessments.get(roleCandidate.candidateId)?.relevance,previous.relevance);
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
  assert.equal(timeout.trace.failureCategory, "REVIEW_PROVIDER_OR_POST_PROCESSING_FAILURE");
  const parseFailure = await reviewCandidateBatch(input, plan, pool, { generateStructuredObject: async () => { throw new SyntaxError("private output"); } });
  assert.equal(parseFailure.trace.failureCategory, "REVIEW_STRUCTURED_OUTPUT_PARSE_FAILURE");
  let batchCalls = 0;
  const itemFailure = await reviewCandidateBatch(input,plan,pool,{async generateStructuredObject<T>(request: {prompt:string}) {
    batchCalls++;
    const requested = JSON.parse(request.prompt.split("CANDIDATES AND EVIDENCE UNITS:\n")[1]) as typeof prepared.batch;
    return {reviews:requested.map((c,i)=>({candidateId:c.candidateId,relevance:"RELEVANT",role:"DIRECT",matchedIntentDimensions:["problem"],
      mismatches:[],confidence:"MEDIUM",rationale:"Supported by title metadata.",supportingEvidenceIds:[batchCalls===1&&i===0?"invalid":c.evidenceUnits[0].evidenceId],mismatchEvidenceIds:[]}))} as T;
  }});
  assert.equal(batchCalls,prepared.batches.length,"item failure does not trigger a paid retry or skip the second planned batch");
  assert.equal(itemFailure.trace.itemValidation.filter(x=>x.status==="INVALID_UNGROUNDED").length,1);
  assert.equal(itemFailure.trace.validatorPolicyVersion,"candidate-review-validator.v2.1");
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
    const shared = { ...row, mismatchEvidenceIds: [request.evidenceUnits[0].evidenceId] };
    const dual = validateCandidateReviews({reviews:[shared]}, [request], [candidate], ["problem"], "test");
    assert.equal(dual.statuses.get(name),"VALID",`${name}: a passage may establish both relevance and limitation`);
    assert.deepEqual(dual.dualUseEvidenceIds.get(name),[request.evidenceUnits[0].evidenceId]);
    assert.equal(finalCandidateAdmission({...a, confidence:"LOW"}), "NEEDS_INSPECTION");
    assert.equal(finalCandidateAdmission({...a, relevance:"PARTIALLY_RELEVANT"}), "NEEDS_INSPECTION");
  }
  const arch = { candidateId: "peripheral-arch", title: "Seismic response of masonry arches: static tests on a scale model",
    abstract: "A scale model of a masonry arch was assessed under static loading.", year: 2014 };
  const reconsidered = prepareCandidateReview([arch], plan, [], new Set([arch.candidateId]));
  assert.equal(reconsidered.batch[0]?.reviewTask, "RELEVANCE_AND_ROLE", "a human-reviewed strong positive can receive full contextual reconsideration");
  const archRow: ReviewItem = { candidateId: arch.candidateId, relevance: "PARTIALLY_RELEVANT", role: "METHODOLOGICAL",
    matchedIntentDimensions: ["problem"], mismatches: ["different structural typology and scale"], confidence: "MEDIUM",
    rationale: "Title and abstract describe a scaled arch, not the same study object.", supportingEvidenceIds: [],
    mismatchEvidenceIds: [reconsidered.batch[0].evidenceUnits[0].evidenceId] };
  const archAssessment = validateCandidateReviews({ reviews: [archRow] }, reconsidered.batch, [arch], dimensions, plan.searchIntentHash, reconsidered.assessments).assessments.get(arch.candidateId)!;
  assert.equal(archAssessment.role, "METHODOLOGICAL");
  assert.equal(finalCandidateAdmission(archAssessment), "NEEDS_INSPECTION", "a grounded peripheral source cannot remain a main recommendation");
  console.log(JSON.stringify({status:"PASS",evaluation:"simulated reviewer using persisted independent labels",baselineRetention:"5/27",afterRetention:`${tp.length}/27`,precision:`${tp.length}/${admitted.length}`,falsePositives:fp,batchSize:prepared.batch.length,coarseRejected:coarseOff.length,deferred:prepared.deferredIds.length,queries:queries.necessaryOnly}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
