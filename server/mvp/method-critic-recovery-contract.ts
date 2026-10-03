import { fingerprint, type BackgroundProviderResponseRecord } from "./job-execution-context";
import { methodCoverageCritiqueProposalSchema } from "./method-coverage-contracts";
import { METHOD_COVERAGE_CRITIC_PROMPT } from "./prompts/method-coverage.v1";

export const METHOD_CRITIC_RECOVERY_VERSION = "method-critic-finding-contract-recovery.v1";
export const METHOD_CRITIC_RECOVERY_EVENT = "SCIENTIFIC_CONTINUATION_CRITIC_RECOVERY_AUTHORIZED";

/** Reuse one completed independent critique after a local finding-ID validator
 * rejected it. Missing historical IDs stay unresolved; this grants no science. */
export function validateMethodCriticRecovery(input: {
  priorMessage: string; projectId: string; runId: string; previousRecoveryFingerprint: string;
  expectedFindingCodes: string[];
  responses: BackgroundProviderResponseRecord[];
  stages: Array<{ id: string; stageKey: string; status: string; outputJson: unknown }>;
  costEntries: Array<{ id: string; status: string; estimate: number | null; usage?: unknown; actualModel?: string | null }>;
}) {
  if (input.priorMessage !== "METHOD_CRITIC_FINDING_COVERAGE_MISMATCH" || !input.previousRecoveryFingerprint ||
      METHOD_COVERAGE_CRITIC_PROMPT.version !== "method-coverage-independent-critic.v4")
    throw new Error("METHOD_CRITIC_RECOVERY_NOT_ELIGIBLE");
  const checkpoint = input.stages.find(row => row.stageKey === "checkpoint:METHOD_COVERAGE_CRITIC_V1_2" && row.status === "COMPLETED");
  const saved = checkpoint?.outputJson as { value?: unknown; outputHash?: string; fingerprint?: string } | undefined;
  if (!checkpoint || !saved?.value || !saved.outputHash || fingerprint(saved.value) !== saved.outputHash)
    throw new Error("METHOD_CRITIC_COMPLETED_CHECKPOINT_REQUIRED");
  const critique = methodCoverageCritiqueProposalSchema.parse(saved.value);
  const actual = critique.findingAssessments.map(row => row.code);
  const missing = [...new Set(input.expectedFindingCodes)].filter(code => !actual.includes(code));
  if (!missing.length || new Set(actual).size !== actual.length ||
      !critique.blockingScientificIssue && !critique.cellAssessments.some(cell => cell.coverageStatus === "UNSUPPORTED"))
    throw new Error("METHOD_CRITIC_PROVEN_CONTRACT_MISMATCH_REQUIRED");
  const matches = input.responses.filter(row => row.status === "COMPLETED" && row.providerStatus === "completed" &&
    (row.correlation as { projectId?: string; runId?: string; promptVersion?: string })?.projectId === input.projectId &&
    (row.correlation as { projectId?: string; runId?: string; promptVersion?: string })?.runId === input.runId &&
    (row.correlation as { projectId?: string; runId?: string; promptVersion?: string })?.promptVersion === METHOD_COVERAGE_CRITIC_PROMPT.version);
  const response = matches.find(row => {
    if (!row.outputText || !row.responseId || !row.requestFingerprint || !row.usage || !row.reservationId) return false;
    try { return fingerprint(JSON.parse(row.outputText)) === saved.outputHash; } catch { return false; }
  });
  const cost = input.costEntries.find(row => row.id === response?.reservationId);
  if (!response || !cost || cost.status !== "completed" || cost.estimate === null ||
      !Number.isFinite(cost.estimate) || cost.estimate < 0 ||
      fingerprint(cost.usage) !== fingerprint(response.usage) || cost.actualModel !== response.actualModel)
    throw new Error("METHOD_CRITIC_COMPLETED_USAGE_REQUIRED");
  return {
    version: METHOD_CRITIC_RECOVERY_VERSION, previousRecoveryFingerprint: input.previousRecoveryFingerprint,
    completedCheckpointId: checkpoint.id, completedCheckpointHash: saved.outputHash,
    completedResponseId: response.responseId, completedRequestFingerprint: response.requestFingerprint,
    completedUsageFingerprint: fingerprint(response.usage), costFingerprint: fingerprint(input.costEntries),
    missingHistoricalFindingCodes: missing, newlyReportedFindingCodes: actual.filter(code => !input.expectedFindingCodes.includes(code)),
    scientificApprovalGranted: false, completedCritiqueMustBeReused: true, newProviderCallsByRecovery: 0,
  };
}
