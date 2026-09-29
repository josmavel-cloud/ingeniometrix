import type { DefinitionField } from "@/lib/conversational-intake";
import type { SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { CandidateAssessment, ItemValidationStatus, ReviewCandidate } from "./candidate-review-policy";

export const GAP_POLICY_VERSION = "evidence-gap-policy.v1";
export const COVERAGE_POLICY_VERSION = "evidence-coverage-policy.v1";
export const SOURCE_POOL_VERSION = "coverage-source-pool.v1";
export const GAP_TYPES = ["DIRECT_EMPIRICAL", "EXPERIMENTAL_OR_METHOD", "MODELING_OR_ANALYSIS", "THEORETICAL_OR_CONCEPTUAL",
  "LOCAL_OR_REGIONAL_CONTEXT", "STANDARD_OR_CODE", "OFFICIAL_OR_POLICY", "IMPLEMENTATION_OR_DESIGN", "DATA_OR_DATASET",
  "RECENT_DEVELOPMENT", "OTHER_JUSTIFIED"] as const;
export type GapType = typeof GAP_TYPES[number];
export type GapKind = "DISCOVERY" | "ACCESS" | "IDENTITY" | "EVIDENCE";
export type Importance = "MATERIAL" | "SUPPORTING" | "OPTIONAL";
export type SourceType = "SCHOLARLY" | "STANDARD_OR_CODE" | "OFFICIAL_GOVERNMENT_SOURCE" | "OFFICIAL_DATASET" | "INSTITUTIONAL_REPORT" | "UNKNOWN";
export type Role = CandidateAssessment["role"];
export type IntentAnchor = { field: DefinitionField; quote: string };

// Internal, grounded requirement proposals, never a browser-controlled spending permission.
// Each group must match; alternatives within a validated concept group are equivalent terms.
export type CoverageRequirement = {
  type: GapType; importance: Importance; requiredDimension: string;
  anchors: IntentAnchor[]; conceptGroups: string[][];
  desiredEvidenceRole: Exclude<Role, "NONE">; acceptedRoles: Exclude<Role, "NONE">[];
  preferredSourceTypes: SourceType[]; requiresOfficialAuthority: boolean;
  contextualRequirements: string[]; materialityJustification: string;
  premise: "RESEARCH_NEED" | "UNVERIFIED_USER_PREMISE";
  minimumBasis: "ABSTRACT" | "MATERIALIZED_FULL_TEXT";
  decisionOrigin: "CONFIRMED_FIELD_POLICY" | "GROUNDED_REQUIREMENT";
};

export type CoverageSource = ReviewCandidate & {
  projectId: string; searchIntentHash: string; provenanceRef: string;
  assessment?: CandidateAssessment;
  assessmentValidation: ItemValidationStatus | "DETERMINISTIC" | "UNVERIFIED";
  identity: "PROVIDER_IDENTIFIED" | "VERIFIED" | "UNCERTAIN" | "CONFLICT";
  sourceType: SourceType;
  officialAuthority: { status: "VERIFIED" | "REPORTED" | "UNKNOWN"; provenanceRef?: string };
  access: { reportedPdf: boolean; materializedFullText: boolean; materializationRef?: string };
};
export type ObservationState = "SUPPORTED" | "PARTIAL" | "PENDING_REVIEW" | "ACCESS_LIMITED" | "IDENTITY_UNCERTAIN" | "NOT_MATCHED" | "INVALID_REVIEW" | "UNVERIFIABLE_REVIEW";
export type CoverageObservation = {
  candidateId: string; provenanceRef: string; state: ObservationState; reason: string;
  assessmentOrigin: CandidateAssessment["origin"] | null; assessmentPolicy: string | null;
  matchedGroupIndexes: number[]; role: Role | null;
  basis: "TITLE_ONLY" | "ABSTRACT" | "MATERIALIZED_FULL_TEXT";
  sourceType: SourceType; officialAuthority: CoverageSource["officialAuthority"]["status"];
};
export type DimensionCoverage = {
  dimensionId: string; requirement: CoverageRequirement;
  intentProvenance: Array<{ anchor: IntentAnchor; provenance: SemanticPlannerInput["signals"][number]["provenance"] }>;
  status: "SUPPORTED_BY_AVAILABLE_METADATA" | "NOT_IDENTIFIED_IN_CURRENT_POOL" | "PARTIAL_OR_UNASSESSED";
  // KNOWN_ABSENT is distinct but never inferred by this finite-pool engine.
  existence: "PRESENT_IN_CURRENT_POOL" | "NOT_IDENTIFIED_IN_CURRENT_POOL" | "KNOWN_ABSENT";
  inspectedSourceCount: number; coverageObservations: CoverageObservation[];
};
export type EvidenceGap = {
  schemaVersion: "EvidenceGap.v1"; gapPolicyVersion: typeof GAP_POLICY_VERSION;
  gapId: string; searchIntentHash: string; sourcePoolVersion: string; dimensionId: string;
  kind: GapKind; importance: Importance; type: GapType;
  intentFieldRefs: DefinitionField[]; requiredDimension: string;
  coverageObservations: CoverageObservation[]; insufficiencyReason: string;
  desiredEvidenceRole: Exclude<Role, "NONE">; preferredSourceTypes: SourceType[];
  contextualRequirements: string[];
  unresolvedPremises: Array<{ anchor: IntentAnchor; status: "UNVERIFIED_USER_PREMISE" }>;
  accessPreference: "RELEVANCE_BEFORE_ACCESS"; uncertainty: string[];
  decisionOrigin: CoverageRequirement["decisionOrigin"];
  status: "OPEN" | "REVIEW_REQUIRED";
  webDiscoveryEligible: boolean; eligibilityReason: string;
  route: "WEB_DISCOVERY_CANDIDATE" | "ACQUISITION_OR_LOCATION" | "IDENTITY_RECONCILIATION" | "COVERAGE_REVIEW";
};
export type EvidenceCoverage = {
  schemaVersion: "EvidenceCoverage.v1"; coveragePolicyVersion: typeof COVERAGE_POLICY_VERSION;
  gapPolicyVersion: typeof GAP_POLICY_VERSION; searchIntentHash: string;
  sourcePoolVersion: string; gapsHash: string; seenSetHash: string;
  eligibleIntentSignals: SemanticPlannerInput["signals"];
  unmappedIntentFieldRefs: DefinitionField[];
  dimensions: DimensionCoverage[]; gaps: EvidenceGap[];
  ignoredSources: Array<{ candidateId: string; reason: string }>;
  rejectedRequirements: Array<{ requiredDimension: string; reason: string }>;
  diagnostics: string[];
};
