import type { EvidenceGap } from "./evidence-gap-contract";

export const WEB_DISCOVERY_SCHEMA_VERSION = "web-discovery-result.v1";
export const WEB_DISCOVERY_POLICY_VERSION = "astra-web-discovery-policy.v1";
export const WEB_DISCOVERY_PROMPT_VERSION = "astra-web-discovery.v1";
export const WEB_DISCOVERY_PURPOSE = "ASTRA_WEB_DISCOVERY";

export const WEB_SOURCE_TYPES = ["PEER_REVIEWED_ARTICLE", "CONFERENCE_PAPER", "THESIS", "ACADEMIC_REPOSITORY",
  "STANDARD_OR_CODE", "OFFICIAL_GOVERNMENT_SOURCE", "OFFICIAL_DATASET", "INSTITUTIONAL_TECHNICAL_REPORT",
  "PROFESSIONAL_STANDARD_BODY", "OTHER_CREDIBLE_PRIMARY_SOURCE"] as const;
export type WebSourceType = typeof WEB_SOURCE_TYPES[number];
export type WebRole = "DIRECT" | "METHODOLOGICAL" | "THEORETICAL" | "CONTEXTUAL";
export type WebMetadataProvenance = "TOOL_OBSERVED" | "MODEL_EXTRACTED_FROM_OBSERVED_SOURCE" | "MODEL_PROPOSED" | "UNKNOWN";
export type WebDiscoveryState = "COMPLETED" | "PARTIAL" | "PROVIDER_UNAVAILABLE" | "INVALID_TOOL_PROVENANCE" |
  "INVALID_STRUCTURED_OUTPUT" | "NO_OBSERVED_SOURCES" | "COST_BOUND_UNAVAILABLE" | "TIMEOUT_UNKNOWN_USAGE" | "FAILED_RETRYABLE";

export type WebDiscoveryProposal = {
  localCandidateRef: string; gapIds: string[];
  identityProposal: { title: string; authors: string[]; year: number | null; doi: string | null; issuer: string | null; sourceType: WebSourceType };
  observedUrl: string;
  relevanceProposal: { role: WebRole; gapCoverage: string; rationale: string; uncertainty: string };
  accessProposal: { reportedAccessType: "REPORTED_PDF" | "REPORTED_FULL_TEXT" | "UNKNOWN";
    reportedPdfUrl: string | null; alternateUrls: string[] };
};
export type WebSourceObservation = {
  observationId: string; operationId: string; responseId: string; toolCallId: string;
  actionType: "search"; queryIfAvailable: string | null;
  observedUrl: string; normalizedUrl: string; observedTitleIfAvailable: string | null; observedAt: string;
};
export type ValidatedWebCandidate = {
  proposal: WebDiscoveryProposal; observationIds: string[];
  metadataProvenance: { observedUrl: "TOOL_OBSERVED"; title: "MODEL_PROPOSED";
    authors: "MODEL_PROPOSED" | "UNKNOWN"; year: "MODEL_PROPOSED" | "UNKNOWN";
    doi: "MODEL_PROPOSED" | "UNKNOWN"; issuer: "MODEL_PROPOSED" | "UNKNOWN";
    sourceType: "MODEL_PROPOSED"; access: "MODEL_PROPOSED" | "UNKNOWN" };
};
export type WebDiscoveryResult = {
  schemaVersion: typeof WEB_DISCOVERY_SCHEMA_VERSION; state: WebDiscoveryState;
  operationId: string; responseId: string | null; model: string;
  searchActionCount: number; toolCallCount: number;
  observations: WebSourceObservation[]; candidates: ValidatedWebCandidate[];
  rejectedProposals: Array<{ localCandidateRef: string; reason: string }>;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number; cachedInputTokens: number } | null;
  estimatedCostUsd: number | null; costPolicyVersion: string;
};
export type ResearchDiscoveryContext = { searchIntentHash: string; scientificSignals: Array<{ field: string; value: string }> };
export type WebDiscoveryInput = {
  operationContext: { operationId: string; smoke: boolean };
  researchIntentProjection: ResearchDiscoveryContext;
  evidenceGaps: Array<Pick<EvidenceGap, "gapId" | "searchIntentHash" | "kind" | "importance" | "requiredDimension" |
    "desiredEvidenceRole" | "preferredSourceTypes" | "unresolvedPremises" | "webDiscoveryEligible">>;
  seenSourceIdentities: Array<{ doi?: string; url?: string; title?: string }>;
  policy: { maxToolCalls: number; maxCandidates: number; maxOutputTokens: number };
};
export type WebDiscoveryProvider = { discover(input: WebDiscoveryInput): Promise<WebDiscoveryResult> };
