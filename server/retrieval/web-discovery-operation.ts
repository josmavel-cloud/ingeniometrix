import { createHash } from "node:crypto";
import type { SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { withPaidOperation, currentPaidOperation } from "@/server/mvp/pre-job-budget";
import { ASTRA_WEB_COST_POLICY } from "./astra-web-cost-policy";
import { DESIGN_MINI_RESEARCH_PURPOSE, WEB_DISCOVERY_POLICY_VERSION, WEB_DISCOVERY_PROMPT_VERSION, WEB_DISCOVERY_PURPOSE,
  type ResearchDiscoveryContext, type WebDiscoveryInput, type WebDiscoveryProvider, type WebDiscoveryResult } from "./web-discovery-contract";
import type { EvidenceGap } from "./evidence-gap-contract";
import { DESIGN_MINI_WEB_RESEARCH_PROMPT } from "@/server/mvp/prompts/design-mini-web-research.v1";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function boundedResearchDiscoveryContext(projection: SemanticPlannerInput, gap: EvidenceGap): ResearchDiscoveryContext {
  if (projection.searchIntentHash !== gap.searchIntentHash) throw new Error("WEB_DISCOVERY_STALE_INTENT");
  const relevant = new Set([...gap.intentFieldRefs, "problem", "purpose", "object", "concepts", "topic"]);
  const scientificSignals = projection.signals.filter(s => relevant.has(s.sourceField) && s.knowledge === "KNOWN" && s.value)
    .slice(0,12).map(s => ({ field: s.sourceField, value: s.value!.slice(0,400) }));
  if (!scientificSignals.length) throw new Error("WEB_DISCOVERY_CONTEXT_EMPTY");
  return { searchIntentHash: projection.searchIntentHash, scientificSignals };
}

export function webDiscoveryOperationIdentity(input: {
  userId: string; projectId?: string; searchIntentHash: string; gapSetHash: string; seenSetHash: string;
  maxToolCalls: number; maxCandidates: number; maxOutputTokens: number;
  purpose?: typeof WEB_DISCOVERY_PURPOSE | typeof DESIGN_MINI_RESEARCH_PURPOSE;
}) {
  const purpose = input.purpose ?? WEB_DISCOVERY_PURPOSE;
  const fingerprint = hash({ purpose, owner: input.userId, project: input.projectId ?? null, intent: input.searchIntentHash,
    gapSetHash: input.gapSetHash, seenSetHash: input.seenSetHash,
    promptVersion: purpose === DESIGN_MINI_RESEARCH_PURPOSE ? DESIGN_MINI_WEB_RESEARCH_PROMPT.version : WEB_DISCOVERY_PROMPT_VERSION, webPolicyVersion: WEB_DISCOVERY_POLICY_VERSION,
    costPolicyVersion: ASTRA_WEB_COST_POLICY.version, model: ASTRA_WEB_COST_POLICY.model,
    reasoning: ASTRA_WEB_COST_POLICY.reasoningEffort,
    tools: [{ type: "web_search", externalWebAccess: true, maxToolCalls: input.maxToolCalls }],
    maxCandidates: input.maxCandidates, maxOutputTokens: input.maxOutputTokens });
  return { requestId: `${purpose === DESIGN_MINI_RESEARCH_PURPOSE ? "design-web" : "web"}:${fingerprint}`, fingerprint };
}

export async function runWebDiscoveryOperation(input: {
  userId: string; projectId?: string; smoke: boolean;
  gapSetHash: string; seenSetHash: string;
  researchIntentProjection: ResearchDiscoveryContext;
  evidenceGaps: WebDiscoveryInput["evidenceGaps"];
  seenSourceIdentities: WebDiscoveryInput["seenSourceIdentities"];
  policy: WebDiscoveryInput["policy"];
  provider: WebDiscoveryProvider;
  purpose?: typeof WEB_DISCOVERY_PURPOSE | typeof DESIGN_MINI_RESEARCH_PURPOSE;
}): Promise<WebDiscoveryResult> {
  if (input.smoke && input.projectId) throw new Error("SMOKE_PROJECT_FORBIDDEN");
  if (!input.smoke && !input.projectId) throw new Error("PROJECT_OWNER_CONTEXT_REQUIRED");
  const identity = webDiscoveryOperationIdentity({ userId: input.userId, projectId: input.projectId,
    searchIntentHash: input.researchIntentProjection.searchIntentHash,
    gapSetHash: input.gapSetHash, seenSetHash: input.seenSetHash, ...input.policy, purpose: input.purpose });
  return withPaidOperation({ userId: input.userId, projectId: input.projectId,
    requestId: identity.requestId, purpose: input.purpose ?? WEB_DISCOVERY_PURPOSE, revision: input.researchIntentProjection.searchIntentHash,
    ...(input.purpose === DESIGN_MINI_RESEARCH_PURPOSE ? { recoverFailed: { version: "qa-linked-budget.v1", completedCallPurposes: [] } } : {}),
    inputs: { fingerprint: identity.fingerprint, gapPayloadHash: hash(input.evidenceGaps),
      seenPayloadHash: hash(input.seenSourceIdentities), scientificContextHash: hash(input.researchIntentProjection), smoke: input.smoke } }, async () => {
    const operation = currentPaidOperation();
    if (!operation) throw new Error("WEB_DISCOVERY_PAID_OPERATION_REQUIRED");
    const discover = () => input.provider.discover({ operationContext: { operationId: operation.id, smoke: input.smoke, purpose: input.purpose },
      researchIntentProjection: input.researchIntentProjection, evidenceGaps: input.evidenceGaps,
      seenSourceIdentities: input.seenSourceIdentities, policy: input.policy });
    return discover();
  });
}
