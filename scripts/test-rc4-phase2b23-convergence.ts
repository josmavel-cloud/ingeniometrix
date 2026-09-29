import assert from "node:assert/strict";
import { candidateMetadataHash, CANDIDATE_REVIEW_VERSION, type CandidateAssessment } from "../server/retrieval/candidate-review-policy";
import { convergeWebCandidate, convergenceKey, webCandidateAdmissionFromAssessment,
  type ConvergenceInput, type ExistingScientificSource } from "../server/retrieval/web-candidate-convergence";
import type { ValidatedWebCandidate, WebDiscoveryResult, WebSourceObservation, WebSourceType } from "../server/retrieval/web-discovery-contract";

const url = "https://archive.example.org/record/alpha";
function makeCandidate(title = "A primary research article on learning outcomes", sourceType: WebSourceType = "PEER_REVIEWED_ARTICLE",
  observedUrl = url): ValidatedWebCandidate {
  return { proposal: { localCandidateRef: "candidate-one", gapIds: ["gap-one"],
    identityProposal: { title, authors: ["A. Scholar"], year: 2025, doi: null, issuer: null, sourceType },
    observedUrl, relevanceProposal: { role: "DIRECT", gapCoverage: "Potential coverage", rationale: "Proposal only", uncertainty: "Requires review" },
    accessProposal: { reportedAccessType: "UNKNOWN", reportedPdfUrl: null, alternateUrls: [] } },
  observationIds: ["observation-one"], metadataProvenance: { observedUrl: "TOOL_OBSERVED", title: "MODEL_PROPOSED",
    authors: "MODEL_PROPOSED", year: "MODEL_PROPOSED", doi: "UNKNOWN", issuer: "UNKNOWN",
    sourceType: "MODEL_PROPOSED", access: "UNKNOWN" } };
}
function makeObservation(observedUrl = url): WebSourceObservation {
  return { observationId: "observation-one", operationId: "operation-one", responseId: "response-one",
    toolCallId: "call-one", actionType: "search", queryIfAvailable: null, observedUrl,
    normalizedUrl: observedUrl, observedTitleIfAvailable: null, observedAt: "2026-01-01T00:00:00.000Z" };
}
function makeInput(candidate = makeCandidate(), existing: ExistingScientificSource[] = []): ConvergenceInput {
  const observation = makeObservation(candidate.proposal.observedUrl);
  const discovery = { state: "COMPLETED", operationId: "operation-one", responseId: "response-one",
    observations: [observation], candidates: [candidate],
    diagnostics: { response: { webSearchCalls: [{ id: "call-one", status: "completed", actionType: "search" }] },
      toolLimit: { accepted: true, reason: "WITHIN_LIMIT" } } } as unknown as WebDiscoveryResult;
  return { context: { operationId: "operation-one", projectId: "project-one", searchIntentHash: "intent-one",
    gapSetHash: "gaps-one", discoveredSourcePoolVersion: "pool-one", currentSourcePoolVersion: "pool-one",
    allowedGapIds: ["gap-one"] }, discovery, candidate, existing };
}
function source(changes: Partial<ExistingScientificSource> = {}): ExistingScientificSource {
  return { id: "existing-one", title: "A primary research article on learning outcomes", authors: ["A. Scholar"],
    year: 2025, doi: null, workType: "PEER_REVIEWED_ARTICLE", observedUrls: [], selected: true,
    assessmentValid: true, doiProvenance: "PROVIDER_METADATA", ...changes };
}
function assessment(relevance: CandidateAssessment["relevance"], title: string): CandidateAssessment {
  return { candidateId: "candidate-one", relevance, role: "METHODOLOGICAL", confidence: "HIGH",
    matchedIntentDimensions: ["purpose"], mismatches: [], rationale: "Grounded fixture",
    evidence: [{ field: "title", quote: title }], policyVersion: CANDIDATE_REVIEW_VERSION,
    searchIntentHash: "intent-one", metadataHash: candidateMetadataHash({ candidateId: "candidate-one",
      title, abstract: null, year: null }), origin: "MODEL_REVIEW" };
}

const exact = convergeWebCandidate(makeInput(makeCandidate(), [source({ observedUrls: [url] })]));
assert.equal(exact.identityOutcome, "MATCHED_EXISTING");
assert.equal(exact.scientificSourceId, "existing-one");
assert.equal(exact.admissionRequired, false);
assert.equal(exact.semanticReviewRequired, false);
assert.equal(exact.selectedPreserved, true);
assert.equal(exact.fieldProvenance.title, "MODEL_PROPOSED");
assert.equal(exact.fieldProvenance.observedUrl, "TOOL_OBSERVED");
const conflictingUrl = makeInput(makeCandidate(), [source({ title: "A different work with a shared landing URL", observedUrls: [url] })]);
assert.equal(convergeWebCandidate(conflictingUrl).identityOutcome, "IDENTITY_REVIEW_REQUIRED");
const homepage = makeInput(makeCandidate("A primary research article on learning outcomes", "PEER_REVIEWED_ARTICLE", "https://archive.example.org/"),
  [source({ observedUrls: ["https://archive.example.org/"] })]);
assert.equal(convergeWebCandidate(homepage).identityOutcome, "IDENTITY_REVIEW_REQUIRED");
const contradictory = makeInput(makeCandidate(), [source({ observedUrls: [url] }),
  source({ id: "different-source", doi: "10.1234/other-work", observedUrls: [] })]);
contradictory.candidate.proposal.identityProposal.doi = "10.1234/other-work";
contradictory.candidate.metadataProvenance.doi = "MODEL_PROPOSED";
assert.equal(convergeWebCandidate(contradictory).identityOutcome, "IDENTITY_REVIEW_REQUIRED");

const verified = makeInput(makeCandidate(), [source({ doi: "10.1234/verified" })]);
verified.verifiedDoi = { value: "https://doi.org/10.1234/verified", provenance: "PROVIDER_METADATA" };
assert.equal(convergeWebCandidate(verified).matchedBy, "VERIFIED_DOI");
const proposed = makeInput(makeCandidate(), [source({ doi: "10.1234/proposed" })]);
proposed.candidate.proposal.identityProposal.doi = "10.1234/proposed";
proposed.candidate.metadataProvenance.doi = "MODEL_PROPOSED";
assert.equal(convergeWebCandidate(proposed).identityOutcome, "IDENTITY_REVIEW_REQUIRED");
assert.equal(convergeWebCandidate(proposed).scientificSourceId, null);

const probable = makeInput(makeCandidate(), [source()]);
assert.equal(convergeWebCandidate(probable).identityOutcome, "IDENTITY_REVIEW_REQUIRED");
const official = makeInput(makeCandidate("Official guidance for student outcomes", "OFFICIAL_GOVERNMENT_SOURCE"));
assert.equal(convergeWebCandidate(official).identityOutcome, "NEW_SOURCE_CANDIDATE");
assert.equal(convergeWebCandidate(official).admission?.state, "NEEDS_INSPECTION");
assert.equal(convergeWebCandidate(official).semanticReviewRequired, true);

const edition = makeInput(makeCandidate("The standard, 2025 edition", "STANDARD_OR_CODE"),
  [source({ title: "The standard, 2022 edition", year: 2022, workType: "STANDARD_OR_CODE", observedUrls: [url] })]);
assert.equal(convergeWebCandidate(edition).identityOutcome, "IDENTITY_REVIEW_REQUIRED");
const preprint = makeInput(makeCandidate("A primary research article on learning outcomes", "ACADEMIC_REPOSITORY"),
  [source({ workType: "journal-article", observedUrls: [url] })]);
assert.equal(convergeWebCandidate(preprint).identityOutcome, "IDENTITY_REVIEW_REQUIRED");

const modelOnly = makeInput();
modelOnly.discovery.observations = [];
assert.equal(convergeWebCandidate(modelOnly).reasons[0], "OBSERVED_URL_NOT_UNAMBIGUOUSLY_COMPLETED");
const nonCompleted = makeInput();
(nonCompleted.discovery.diagnostics!.response!.webSearchCalls[0] as {status: string}).status = "searching";
assert.equal(convergeWebCandidate(nonCompleted).reasons[0], "COMPLETED_TOOL_PROVENANCE_UNAVAILABLE");
const finalAttempt = makeInput();
(finalAttempt.discovery.diagnostics!.response!.webSearchCalls as Array<{id: string;status: string;actionType: string}>).push(
  { id: "call-one", status: "searching", actionType: "open_page" });
assert.equal(convergeWebCandidate(finalAttempt).reasons[0], "COMPLETED_TOOL_PROVENANCE_UNAVAILABLE");
const foreignObservation = makeInput();
foreignObservation.discovery.observations[0].operationId = "other-operation";
assert.equal(convergeWebCandidate(foreignObservation).reasons[0], "OBSERVED_URL_NOT_UNAMBIGUOUSLY_COMPLETED");
const alteredProposal = makeInput();
alteredProposal.candidate = structuredClone(alteredProposal.candidate);
alteredProposal.candidate.proposal.identityProposal.title = "A different proposed title";
assert.equal(convergeWebCandidate(alteredProposal).reasons[0], "CANDIDATE_NOT_VALIDATED_IN_OPERATION");
const unsafe = makeInput(makeCandidate("A primary research article on learning outcomes", "PEER_REVIEWED_ARTICLE", "http://127.0.0.1/resource"));
assert.equal(convergeWebCandidate(unsafe).reasons[0], "UNSAFE_URL");
const stale = makeInput(); stale.context.currentSourcePoolVersion = "pool-two";
assert.throws(() => convergeWebCandidate(stale), /STALE_CONTEXT/);
const foreign = makeInput(); foreign.discovery.operationId = "other-operation";
assert.throws(() => convergeWebCandidate(foreign), /OPERATION_INVALID/);

const key = convergenceKey("operation-one", "candidate-one", ["observation-one"]);
assert.equal(key, convergenceKey("operation-one", "candidate-one", ["observation-one"]));
assert.notEqual(key, convergenceKey("operation-two", "candidate-one", ["observation-one"]));
assert.notEqual(key, convergenceKey("operation-one", "candidate-one", ["observation-two"]));

const title = "A method that overlaps the research question";
assert.equal(webCandidateAdmissionFromAssessment({ title, abstract: null, searchIntentHash: "intent-one",
  assessment: assessment("RELEVANT", title), validation: "VALID" }).state, "ADMITTED");
assert.equal(webCandidateAdmissionFromAssessment({ title, abstract: null, searchIntentHash: "intent-one",
  assessment: assessment("PARTIALLY_RELEVANT", title), validation: "VALID" }).state, "NEEDS_INSPECTION");
assert.equal(webCandidateAdmissionFromAssessment({ title, abstract: null, searchIntentHash: "intent-one",
  assessment: assessment("OFF_TOPIC", title), validation: "VALID" }).state, "REJECTED_OFF_TOPIC");
assert.equal(webCandidateAdmissionFromAssessment({ title, abstract: null, searchIntentHash: "intent-one",
  assessment: assessment("RELEVANT", title), validation: "INVALID_UNGROUNDED" }).state, "NEEDS_INSPECTION");

for (const [discipline, sourceType] of [
  ["engineering", "PEER_REVIEWED_ARTICLE"], ["education", "OFFICIAL_GOVERNMENT_SOURCE"],
  ["qualitative social science", "THESIS"], ["health", "OFFICIAL_DATASET"],
  ["humanities", "INSTITUTIONAL_TECHNICAL_REPORT"],
] as Array<[string, WebSourceType]>) {
  const input = makeInput(makeCandidate(`Primary source in ${discipline} and its research context`, sourceType));
  assert.equal(convergeWebCandidate(input).identityOutcome, "NEW_SOURCE_CANDIDATE");
}
console.log("PASS: 2B2.3 convergence identity, provenance, admission, staleness and multidisciplinary fixtures");
