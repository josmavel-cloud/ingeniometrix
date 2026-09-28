import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyDefinition, searchIntent, userValue, type DefinitionField } from "@/lib/conversational-intake";
import { semanticPlannerInput, validateSearchEnrichment } from "@/lib/retrieval-semantic-plan";
import { candidateEvidenceUnits, candidateMetadataHash, CANDIDATE_REVIEW_VERSION } from "@/server/retrieval/candidate-review-policy";
import { evaluateEvidenceCoverage } from "@/server/retrieval/evidence-coverage";
import { evaluateSnapshotCoverage } from "@/server/retrieval/evidence-coverage-snapshot";
import type { ProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import type { CoverageRequirement, CoverageSource } from "@/server/retrieval/evidence-gap-contract";

let networkAttempts = 0;
global.fetch = async () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
const makeIntent = (values: Partial<Record<DefinitionField, string>>) => {
  const d = emptyDefinition();
  for (const [k,v] of Object.entries(values)) d.fields[k as DefinitionField] = userValue(v!, 1, "fixture");
  return searchIntent("fixture-project", 1, "definition", d);
};
function requirement(quote: string, field: DefinitionField = "purpose", override: Partial<CoverageRequirement> = {}): CoverageRequirement {
  return { type: "DIRECT_EMPIRICAL", importance: "MATERIAL", requiredDimension: quote, anchors: [{ field, quote }], conceptGroups: [],
    desiredEvidenceRole: "DIRECT", acceptedRoles: ["DIRECT", "METHODOLOGICAL", "THEORETICAL"], preferredSourceTypes: ["SCHOLARLY"], requiresOfficialAuthority: false,
    contextualRequirements: [], materialityJustification: "Explicit research need in confirmed purpose", premise: "RESEARCH_NEED",
    minimumBasis: "ABSTRACT", decisionOrigin: "GROUNDED_REQUIREMENT", ...override };
}
function source(quote: string, override: Partial<CoverageSource> = {}): CoverageSource {
  const c: CoverageSource = { candidateId: "work-a", title: quote, abstract: `The source examines ${quote} with explicit limitations.`, year: 2020,
    projectId: "fixture-project", searchIntentHash: "intent", provenanceRef: "fixture:observation", assessmentValidation: "DETERMINISTIC",
    identity: "PROVIDER_IDENTIFIED", sourceType: "SCHOLARLY", officialAuthority: { status: "UNKNOWN" }, access: { reportedPdf: false, materializedFullText: false }, ...override };
  c.assessment ??= { candidateId: c.candidateId, relevance: "HIGHLY_RELEVANT", role: "DIRECT", confidence: "HIGH",
    matchedIntentDimensions: ["purpose", "object", "context", "methodPreference"], rationale: "Fixture grounded metadata", mismatches: [],
    evidence: [{ field: "title", quote: c.title }], policyVersion: CANDIDATE_REVIEW_VERSION, searchIntentHash: "intent", metadataHash: candidateMetadataHash(c), origin: "DETERMINISTIC" };
  return c;
}
function evaluate(quote: string, sources: CoverageSource[], req = requirement(quote)) {
  return evaluateEvidenceCoverage({ intent: makeIntent({ topic: quote, object: quote, purpose: quote, context: quote, methodPreference: quote }),
    searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources, requirements: [req] });
}

const disciplines = [
  ["engineering", "fatigue of steel joints"], ["education", "feedback in digital mathematics"],
  ["qualitative social science", "experiences of informal carers"], ["health", "adherence to rehabilitation"],
  ["humanities", "narrative memory in archival letters"],
];
for (const [discipline, q] of disciplines) {
  const covered = evaluate(q, [source(q)]);
  assert.equal(covered.gaps.length, 0, `${discipline}: one adequate source is enough; no count quota`);
  assert.equal(covered.dimensions[0].status, "SUPPORTED_BY_AVAILABLE_METADATA");
  assert.equal(covered.dimensions[0].coverageObservations[0].assessmentOrigin, "DETERMINISTIC");
  const absent = evaluate(q, []);
  assert.equal(absent.gaps[0].kind, "DISCOVERY");
  assert.equal(absent.gaps[0].webDiscoveryEligible, true);
  assert.equal(absent.dimensions[0].existence, "NOT_IDENTIFIED_IN_CURRENT_POOL");
  console.log(`PASS ${discipline}: explicit need, adequate coverage, no population/method assumptions`);
}
const q = "response of building systems";
const strong = source(q);
assert.equal(evaluate(q, [strong]).gaps.length, 0, "no PDF does not make a discovery gap");
const metadataOnly = source(q, { abstract: null });
assert.equal(evaluate(q, [metadataOnly]).gaps[0].kind, "ACCESS");
assert.equal(evaluate(q, [metadataOnly]).gaps[0].webDiscoveryEligible, false);
assert.equal(evaluate(q, [source(q, { identity: "UNCERTAIN" })]).gaps[0].route, "IDENTITY_RECONCILIATION");
assert.equal(evaluate(q, [source(q, { identity: "CONFLICT" })]).gaps[0].webDiscoveryEligible, false);
const old = source(q, { searchIntentHash: "old-intent" });
assert.equal(evaluate(q, [old]).ignoredSources[0].reason, "STALE_OR_FOREIGN_SOURCE");
assert.notEqual(evaluate(q, [old]).dimensions[0].status, "SUPPORTED_BY_AVAILABLE_METADATA");
const foreign = source(q, { projectId: "another-project" });
assert.equal(evaluate(q, [foreign]).ignoredSources.length, 1);
const weak = structuredClone(strong); weak.assessment!.confidence = "LOW"; weak.assessment!.relevance = "PARTIALLY_RELEVANT";
assert.equal(evaluate(q, [weak]).gaps[0].kind, "EVIDENCE");
assert.notEqual(evaluate(q, [weak]).dimensions[0].status, "SUPPORTED_BY_AVAILABLE_METADATA");
const invalid = structuredClone(strong); invalid.assessment!.origin = "MODEL_REVIEW"; invalid.assessmentValidation = "INVALID_UNGROUNDED";
const invalidCoverage = evaluate(q, [invalid]);
assert.equal(invalidCoverage.dimensions[0].coverageObservations[0].state, "INVALID_REVIEW");
assert.equal(invalidCoverage.gaps[0].webDiscoveryEligible, false);
const validModel = structuredClone(strong); validModel.assessment!.origin = "MODEL_REVIEW"; validModel.assessmentValidation = "VALID";
validModel.assessment!.supportingEvidenceIds = [candidateEvidenceUnits(validModel)[0].evidenceId];
validModel.assessment!.mismatchEvidenceIds = [...validModel.assessment!.supportingEvidenceIds];
assert.equal(evaluate(q, [validModel]).gaps.length, 0, "legitimate dual use remains valid");
const bad = structuredClone(validModel); bad.assessment!.supportingEvidenceIds = ["foreign-evidence"];
assert.equal(evaluate(q, [bad]).dimensions[0].coverageObservations[0].state, "INVALID_REVIEW");
const staleMetadata = structuredClone(strong); staleMetadata.abstract = "Changed metadata";
assert.equal(evaluate(q, [staleMetadata]).dimensions[0].coverageObservations[0].state, "INVALID_REVIEW");

const norm = "standard 2040";
const standardReq = requirement(norm, "purpose", { type: "STANDARD_OR_CODE", desiredEvidenceRole: "CONTEXTUAL", acceptedRoles: ["CONTEXTUAL", "DIRECT"],
  requiresOfficialAuthority: true, preferredSourceTypes: ["STANDARD_OR_CODE"], premise: "UNVERIFIED_USER_PREMISE" });
const standardGap = evaluate(norm, [], standardReq).gaps[0];
assert.equal(standardGap.webDiscoveryEligible, true);
assert.equal(standardGap.unresolvedPremises[0].status, "UNVERIFIED_USER_PREMISE");
const fakeAuthority = source(norm);
assert.notEqual(evaluate(norm, [fakeAuthority], standardReq).dimensions[0].status, "SUPPORTED_BY_AVAILABLE_METADATA");
const official = source(norm, { sourceType: "STANDARD_OR_CODE", officialAuthority: { status: "VERIFIED", provenanceRef: "fixture:authority-check" } });
assert.equal(evaluate(norm, [official], standardReq).gaps.length, 0);
const localReq = requirement(q, "context", { type: "LOCAL_OR_REGIONAL_CONTEXT", importance: "OPTIONAL" });
assert.equal(evaluate(q, [], localReq).gaps[0].webDiscoveryEligible, false);
const methodReq = requirement(q, "methodPreference", { type: "EXPERIMENTAL_OR_METHOD", desiredEvidenceRole: "METHODOLOGICAL" });
assert.equal(evaluate(q, [], methodReq).gaps[0].webDiscoveryEligible, true);
const unknownIntent = makeIntent({ topic: q, object: q, purpose: q });
const unknown = evaluateEvidenceCoverage({ intent: unknownIntent, searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [], requirements: [methodReq] });
assert.equal(unknown.gaps.length, 0); assert.equal(unknown.rejectedRequirements.length, 1);
const d = emptyDefinition();
d.fields.topic = userValue(q, 1, "fixture"); d.fields.object = userValue(q, 1, "fixture");
d.fields.purpose = { ...userValue(norm, 1, "fixture"), acceptance: "UNREVIEWED" };
const unaccepted = evaluateEvidenceCoverage({ intent: searchIntent("fixture-project", 1, "definition", d), searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [], requirements: [standardReq] });
assert.equal(unaccepted.gaps.length, 0, "unaccepted field differs from an accepted but factually unverified premise");
const fulltext = evaluate(q, [strong], requirement(q, "purpose", { minimumBasis: "MATERIALIZED_FULL_TEXT" }));
assert.equal(fulltext.gaps[0].kind, "ACCESS");

const second = source(q, { candidateId: "work-b" });
const input = { intent: unknownIntent, searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [strong, second], requirements: [requirement(q), localReq] };
const first = evaluateEvidenceCoverage(input);
const shuffled = evaluateEvidenceCoverage({ ...input, sources: [second, strong], requirements: [...input.requirements].reverse() });
assert.equal(first.sourcePoolVersion, shuffled.sourcePoolVersion); assert.equal(first.gapsHash, shuffled.gapsHash); assert.equal(first.seenSetHash, shuffled.seenSetHash);
const gap1 = evaluate(q, []).gaps[0], gap2 = evaluate(q, [source("unrelated topic")]).gaps[0];
assert.equal(gap1.gapId, gap2.gapId, "gap identity is independent of source ordering/count");
assert.notEqual(gap1.sourcePoolVersion, gap2.sourcePoolVersion);
assert.throws(() => evaluateEvidenceCoverage({ ...input, sourcePoolIntentHash: "stale" }), /STALE_POOL/);
assert.throws(() => evaluate(q, [strong, { ...strong, abstract: "different" }]), /CONFLICTING_DUPLICATE/);
const automaticIntent = makeIntent({ topic: "Material response", object: "specimens", concepts: "response", purpose: "Evaluate standard 2040", context: "Region Z" });
const projection = semanticPlannerInput(automaticIntent, "intent");
const enrichment = validateSearchEnrichment(projection, { terms: [
  { sourceField: "concepts", anchor: "response", text: "response", type: "EXACT_TERM", confidence: "HIGH", scientificRole: "PHENOMENON", language: "en" },
  { sourceField: "object", anchor: "specimens", text: "specimens", type: "EXACT_TERM", confidence: "HIGH", scientificRole: "OBJECT_OR_SYSTEM", language: "en" },
  { sourceField: "purpose", anchor: norm, text: norm, type: "EXACT_TERM", confidence: "HIGH", scientificRole: "TIME_OR_STANDARD", language: "en" },
  { sourceField: "context", anchor: "Region Z", text: "Region Z", type: "EXACT_TERM", confidence: "HIGH", scientificRole: "GEOGRAPHY", language: "en" },
], ambiguities: [] });
const auto = evaluateEvidenceCoverage({ intent: automaticIntent, searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [], enrichment });
assert(auto.gaps.some(g => g.type === "STANDARD_OR_CODE" && g.webDiscoveryEligible));
assert(auto.gaps.some(g => g.type === "LOCAL_OR_REGIONAL_CONTEXT" && !g.webDiscoveryEligible));
assert(!auto.gaps.some(g => g.type === "EXPERIMENTAL_OR_METHOD"));
const staleEnrichment = evaluateEvidenceCoverage({ intent: automaticIntent, searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [], enrichment: { ...enrichment, searchIntentHash: "old" } });
assert.equal(staleEnrichment.gaps.length, 1, "confirmed normative premise survives unavailable/stale enrichment");
assert.equal(staleEnrichment.gaps[0].type, "STANDARD_OR_CODE");
assert.equal(staleEnrichment.gaps[0].unresolvedPremises[0].status, "UNVERIFIED_USER_PREMISE");
const statisticalIntent = makeIntent({ topic: "Sampling precision", object: "measurements", purpose: "Estimate standard deviation" });
assert.equal(evaluateEvidenceCoverage({ intent: statisticalIntent, searchIntentHash: "intent", sourcePoolIntentHash: "intent", sources: [] }).gaps.length, 0,
  "a statistical use of standard is not a regulatory requirement");
// The snapshot adapter must not borrow validation from a different definition/revision.
const snapshotCandidate = source("response specimens", { authors: [], venue: null });
snapshotCandidate.assessment!.origin = "MODEL_REVIEW";
snapshotCandidate.assessment!.supportingEvidenceIds = [candidateEvidenceUnits(snapshotCandidate)[0].evidenceId];
const snapshot = {
  inputTrace: { projectId: automaticIntent.projectId, definitionHash: automaticIntent.definitionHash,
    confirmedDraftRevision: automaticIntent.confirmedDraftRevision, searchIntentHash: "intent" },
  savedAt: "2026-01-01T00:00:00Z", metadata: { enrichment },
  candidateAdmissions: [{ candidateKey: snapshotCandidate.candidateId, title: snapshotCandidate.title,
    doi: "10.1234/fixture", year: snapshotCandidate.year,
    scoreBreakdown: { candidateAssessment: snapshotCandidate.assessment },
    inspectionMetadata: { abstract: snapshotCandidate.abstract, authors: [], venue: null, access: { pdfUrl: null } } }],
} as unknown as ProjectReferenceSearchSnapshot;
const validatedSnapshot = { ...snapshot, semanticReview: { itemValidation: [{ candidateId: snapshotCandidate.candidateId, status: "VALID" }] } } as ProjectReferenceSearchSnapshot;
const coreObservation = (s: ProjectReferenceSearchSnapshot, history: ProjectReferenceSearchSnapshot[] = []) =>
  evaluateSnapshotCoverage(automaticIntent, s, history).dimensions.find(x => x.requirement.requiredDimension === "Core confirmed scientific identity")!.coverageObservations[0];
assert.equal(coreObservation(snapshot).state, "UNVERIFIABLE_REVIEW");
assert.equal(coreObservation(snapshot, [validatedSnapshot]).state, "SUPPORTED");
assert.equal(coreObservation(snapshot, [{ ...validatedSnapshot, stale: true }]).state, "UNVERIFIABLE_REVIEW");
assert.equal(coreObservation(snapshot, [{ ...validatedSnapshot, inputTrace: { ...validatedSnapshot.inputTrace!, definitionHash: "old" } }]).state, "UNVERIFIABLE_REVIEW");
assert.throws(() => evaluateSnapshotCoverage(automaticIntent, { ...snapshot, stale: true }), /SNAPSHOT_INTENT_MISMATCH/);
for (const file of ["evidence-gap-contract.ts", "evidence-gap-requirements.ts", "evidence-coverage.ts", "evidence-coverage-snapshot.ts"]) {
  const production = readFileSync(`server/retrieval/${file}`, "utf8");
  assert(!/masonry|seismic|arches|\bper[uú]\b|10\.\d{4,9}\//i.test(production), "no production fixture hardcoding");
}
assert.equal(networkAttempts, 0);
console.log("PASS 2B2.1: materiality/access/identity/provenance/hash/unknown guards; zero network calls");
