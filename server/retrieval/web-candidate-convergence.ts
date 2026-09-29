import { createHash } from "node:crypto";
import { normalizeTitle } from "@/lib/text";
import { normalizeScholarlyDoi, scholarlyVersionClass } from "./provider-query-policy";
import { decideReferenceAdmission, type ReferenceAdmission } from "./reference-admission";
import { candidateMetadataHash, CANDIDATE_REVIEW_VERSION, finalCandidateAdmission,
  type CandidateAssessment, type ItemValidationStatus } from "./candidate-review-policy";
import { normalizePublicWebUrl } from "./web-discovery-validation";
import type { ValidatedWebCandidate, WebDiscoveryResult, WebMetadataProvenance, WebSourceObservation } from "./web-discovery-contract";

export const WEB_CONVERGENCE_VERSION = "web-candidate-convergence.v1";
export type FieldProvenance = WebMetadataProvenance | "PROVIDER_METADATA" | "VERIFIED_IDENTITY";
export type ConvergenceOutcome = "MATCHED_EXISTING" | "NEW_SOURCE_CANDIDATE" | "IDENTITY_REVIEW_REQUIRED" | "REJECTED";
export type ExistingScientificSource = {
  id: string; title: string; authors: string[]; year: number | null; doi: string | null;
  workType: string | null; observedUrls: string[]; selected: boolean;
  assessmentValid: boolean; doiProvenance: FieldProvenance;
};
export type ConvergenceContext = {
  operationId: string; projectId: string; searchIntentHash: string; gapSetHash: string;
  discoveredSourcePoolVersion: string; currentSourcePoolVersion: string;
  allowedGapIds: string[];
};
export type ConvergenceInput = {
  context: ConvergenceContext; discovery: WebDiscoveryResult; candidate: ValidatedWebCandidate;
  existing: ExistingScientificSource[];
  /** May only be supplied by a trusted provider/identity-verification adapter, never copied from Astra JSON. */
  verifiedDoi?: { value: string; provenance: "PROVIDER_METADATA" | "VERIFIED_IDENTITY" };
};
export type WebCandidateConvergenceResult = {
  version: typeof WEB_CONVERGENCE_VERSION; proposalId: string; identityOutcome: ConvergenceOutcome;
  scientificSourceId: string | null; matchedBy: "OBSERVED_URL" | "VERIFIED_DOI" | null;
  discoveryObservationIds: string[]; fieldProvenance: Record<"title" | "authors" | "year" | "doi" | "issuer" | "sourceType" | "observedUrl" | "access", FieldProvenance>;
  admission: ReferenceAdmission | null; admissionRequired: boolean; semanticReviewRequired: boolean;
  selectedPreserved: boolean; reasons: string[];
};

export const convergenceKey = (operationId: string, proposalRef: string, observationIds: string[]) =>
  createHash("sha256").update(JSON.stringify([WEB_CONVERGENCE_VERSION, operationId, proposalRef, [...observationIds].sort()])).digest("hex");

/** Same relevance policy as OpenAlex/Crossref; provenance/validation is required before it is eligible. */
export function webCandidateAdmissionFromAssessment(input: {
  title: string; abstract: string | null; searchIntentHash: string;
  assessment: CandidateAssessment | null; validation: ItemValidationStatus | "DETERMINISTIC" | "UNVERIFIED";
}): ReferenceAdmission {
  const a = input.assessment;
  if (!a || !["VALID", "DETERMINISTIC"].includes(input.validation) ||
      a.policyVersion !== CANDIDATE_REVIEW_VERSION || a.searchIntentHash !== input.searchIntentHash ||
      a.metadataHash !== candidateMetadataHash({ candidateId: a.candidateId, title: input.title,
        abstract: input.abstract, year: null })) {
    return decideReferenceAdmission({ title: input.title, abstract: input.abstract, score: null, breakdown: null });
  }
  return { policyVersion: "reference-admission-v1", state: finalCandidateAdmission(a),
    reasons: [`${a.policyVersion}:${a.relevance}:${a.role}`] };
}

const distinct = (xs: string[]) => [...new Set(xs)];
const nameKey = (value: string) => normalizeTitle(value ?? "");
const authorKey = (source: { authors: string[] }) => nameKey(source.authors[0] ?? "");
const versionConflict = (proposal: ValidatedWebCandidate, source: ExistingScientificSource) => {
  const incoming = scholarlyVersionClass(proposal.proposal.identityProposal.sourceType);
  const existing = scholarlyVersionClass(source.workType);
  if (proposal.proposal.identityProposal.sourceType === "ACADEMIC_REPOSITORY" && existing === "journal") return true;
  if (incoming === "standard" && existing === "standard" &&
      (nameKey(proposal.proposal.identityProposal.title) !== nameKey(source.title) ||
      proposal.proposal.identityProposal.year !== source.year)) return true;
  return incoming !== "other" && existing !== "other" && incoming !== existing;
};

export function convergeWebCandidate(input: ConvergenceInput): WebCandidateConvergenceResult {
  const { context, discovery, candidate } = input;
  if (!context.projectId || !context.searchIntentHash || !context.gapSetHash ||
      context.discoveredSourcePoolVersion !== context.currentSourcePoolVersion) throw new Error("WEB_CONVERGENCE_STALE_CONTEXT");
  if (discovery.operationId !== context.operationId || !discovery.responseId ||
      !["COMPLETED", "PARTIAL"].includes(discovery.state)) throw new Error("WEB_CONVERGENCE_OPERATION_INVALID");
  const proposal = candidate.proposal;
  const base: WebCandidateConvergenceResult = {
    version: WEB_CONVERGENCE_VERSION, proposalId: convergenceKey(context.operationId, proposal.localCandidateRef, candidate.observationIds),
    identityOutcome: "REJECTED", scientificSourceId: null, matchedBy: null, discoveryObservationIds: [],
    fieldProvenance: { title: candidate.metadataProvenance.title, authors: candidate.metadataProvenance.authors,
      year: candidate.metadataProvenance.year, doi: candidate.metadataProvenance.doi,
      issuer: candidate.metadataProvenance.issuer, sourceType: candidate.metadataProvenance.sourceType,
      observedUrl: candidate.metadataProvenance.observedUrl, access: candidate.metadataProvenance.access },
    admission: decideReferenceAdmission({ title: proposal.identityProposal.title, abstract: null, score: null, breakdown: null }),
    admissionRequired: true, semanticReviewRequired: false, selectedPreserved: true, reasons: [],
  };
  const reject = (reason: string): WebCandidateConvergenceResult => ({ ...base, reasons: [reason] });
  if (discovery.candidates.filter(c => c.proposal.localCandidateRef === proposal.localCandidateRef &&
      JSON.stringify(c) === JSON.stringify(candidate)).length !== 1) return reject("CANDIDATE_NOT_VALIDATED_IN_OPERATION");
  if (!proposal.gapIds.length || proposal.gapIds.some(id => !context.allowedGapIds.includes(id))) return reject("UNKNOWN_GAP_ID");
  if (candidate.metadataProvenance.observedUrl !== "TOOL_OBSERVED" ||
      candidate.metadataProvenance.title !== "MODEL_PROPOSED" ||
      candidate.metadataProvenance.sourceType !== "MODEL_PROPOSED") return reject("INVALID_FIELD_PROVENANCE");
  const url = normalizePublicWebUrl(proposal.observedUrl);
  if (!url || proposal.accessProposal.reportedPdfUrl && !normalizePublicWebUrl(proposal.accessProposal.reportedPdfUrl) ||
      proposal.accessProposal.alternateUrls.some(u => !normalizePublicWebUrl(u))) return reject("UNSAFE_URL");
  const finalCalls = new Map<string, { status: string | null; actionType: string | null }>();
  for (const call of discovery.diagnostics?.response?.webSearchCalls ?? []) {
    if (call.id) finalCalls.set(call.id, call);
  }
  const completed = new Set([...finalCalls].filter(([, call]) => call.status === "completed" && call.actionType === "search")
    .map(([id]) => id));
  if (!completed.size || discovery.diagnostics?.toolLimit?.accepted !== true) return reject("COMPLETED_TOOL_PROVENANCE_UNAVAILABLE");
  const observations: WebSourceObservation[] = discovery.observations.filter(o => o.operationId === context.operationId &&
    o.responseId === discovery.responseId && candidate.observationIds.includes(o.observationId) &&
    completed.has(o.toolCallId) && o.normalizedUrl === url);
  if (observations.length !== 1 || candidate.observationIds.length !== 1) return reject("OBSERVED_URL_NOT_UNAMBIGUOUSLY_COMPLETED");
  const observed = observations[0];
  if (!normalizePublicWebUrl(observed.observedUrl) || observed.normalizedUrl !== normalizePublicWebUrl(observed.observedUrl)) return reject("OBSERVATION_URL_INVALID");
  base.discoveryObservationIds = [observed.observationId];
  const exactUrl = input.existing.filter(s => s.observedUrls.some(u => normalizePublicWebUrl(u) === url));
  if (exactUrl.length > 1) return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED", reasons: ["MULTIPLE_EXACT_URL_IDENTITIES"] };
  if (exactUrl.length === 1) {
    const source = exactUrl[0];
    const proposedDoi = normalizeScholarlyDoi(proposal.identityProposal.doi);
    const verifiedDoi = normalizeScholarlyDoi(input.verifiedDoi?.value);
    if (input.existing.some(other => other.id !== source.id &&
        ((proposedDoi && normalizeScholarlyDoi(other.doi) === proposedDoi) ||
        (verifiedDoi && normalizeScholarlyDoi(other.doi) === verifiedDoi)))) {
      return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED", reasons: ["URL_DOI_POINTS_TO_DIFFERENT_WORK"] };
    }
    if (new URL(url).pathname === "/" || nameKey(proposal.identityProposal.title) !== nameKey(source.title)) {
      return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED", reasons: ["SHARED_OR_CONFLICTING_URL_IDENTITY"] };
    }
    if (versionConflict(candidate, source)) return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED", reasons: ["POSSIBLE_RELATED_VERSION"] };
    return { ...base, identityOutcome: "MATCHED_EXISTING", scientificSourceId: source.id,
      matchedBy: "OBSERVED_URL", admission: null, admissionRequired: !source.assessmentValid,
      semanticReviewRequired: false, reasons: ["EXACT_OBSERVED_URL"] };
  }
  const verifiedDoi = input.verifiedDoi && normalizeScholarlyDoi(input.verifiedDoi.value);
  if (verifiedDoi) {
    const matches = input.existing.filter(s => s.doiProvenance !== "MODEL_PROPOSED" &&
      normalizeScholarlyDoi(s.doi) === verifiedDoi);
    if (matches.length > 1 || matches.length === 1 && versionConflict(candidate, matches[0])) {
      return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED", reasons: ["VERIFIED_DOI_VERSION_OR_IDENTITY_CONFLICT"] };
    }
    if (matches.length === 1) return { ...base, identityOutcome: "MATCHED_EXISTING", scientificSourceId: matches[0].id,
      matchedBy: "VERIFIED_DOI", admission: null, admissionRequired: !matches[0].assessmentValid,
      semanticReviewRequired: false, reasons: ["VERIFIED_DOI"] };
    base.fieldProvenance.doi = input.verifiedDoi!.provenance;
  }
  const proposedDoi = normalizeScholarlyDoi(proposal.identityProposal.doi);
  const possibleDoi = proposedDoi && input.existing.some(s => normalizeScholarlyDoi(s.doi) === proposedDoi);
  const possibleBibliographic = input.existing.some(s => {
    const title = nameKey(proposal.identityProposal.title);
    return title.length >= 20 && title === nameKey(s.title) &&
      (!proposal.identityProposal.year || !s.year || proposal.identityProposal.year === s.year) &&
      (!authorKey(proposal.identityProposal) || !authorKey(s) || authorKey(proposal.identityProposal) === authorKey(s));
  });
  if (possibleDoi || possibleBibliographic) return { ...base, identityOutcome: "IDENTITY_REVIEW_REQUIRED",
    reasons: distinct([...(possibleDoi ? ["MODEL_PROPOSED_DOI_MATCH"] : []), ...(possibleBibliographic ? ["PROBABLE_BIBLIOGRAPHIC_MATCH"] : [])]) };
  return { ...base, identityOutcome: "NEW_SOURCE_CANDIDATE", semanticReviewRequired: true,
    reasons: ["NO_SAFE_EXISTING_IDENTITY_MATCH", "COMMON_ADMISSION_REQUIRED"] };
}
