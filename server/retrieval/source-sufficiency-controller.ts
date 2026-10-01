import { verifyConvergedWebSources } from "./verify-web-sources";
import { prisma } from "@/lib/prisma";
import { sourceCounts, SOURCE_SUFFICIENCY_POLICY, MAX_AUTO_OPENALEX_QUERIES } from "@/lib/source-sufficiency-policy";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { fallbackSearchEnrichment } from "@/lib/retrieval-semantic-plan";
import { validateSearchPlan } from "@/lib/search-planning-outcome";
import { searchProjectReferencesV2, type ProjectReferenceSearchSnapshot } from "./reference-search-v2";
import { listProjectReferences } from "./reference-service";
import { loadSearchInput, type SearchInput } from "./search-intent-service";
import { evaluateSnapshotCoverage } from "./evidence-coverage-snapshot";
import { boundedResearchDiscoveryContext, runWebDiscoveryOperation } from "./web-discovery-operation";
import { createOpenAiWebDiscoveryProvider } from "./web-discovery-provider";
import { convergePaidWebDiscoveryOperation } from "./web-candidate-convergence-service";
import type { WebDiscoveryProvider } from "./web-discovery-contract";

export function shouldRunAutomaticAstra(coreUsableCount: number, lowerCostConvergenceComplete: boolean,
  enabled = process.env.IMX_ASTRA_WEB_MINIMUM_SOURCE_FALLBACK === "1") {
  return enabled && lowerCostConvergenceComplete && coreUsableCount < 3;
}
function safeSearchFailureCategory(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/PRE_JOB_COST_LIMIT|BUDGET_BLOCKED|COST_LIMIT/.test(code)) return "BUDGET_BLOCKED";
  if (/OPENALEX|CROSSREF|PROVIDER/.test(code)) return "PROVIDER_UNAVAILABLE";
  if (/SEARCH_INTENT_CHANGED/.test(code)) return "INTENT_CHANGED";
  return "SEARCH_BATCH_FAILED";
}
export async function runAutomaticAstraFallback(input: { userId: string; projectId: string;
  searchIntentHash: string; intent: SearchInput["intent"]; searchSnapshot: ProjectReferenceSearchSnapshot },
  provider: WebDiscoveryProvider = createOpenAiWebDiscoveryProvider({ apiKey: process.env.OPENAI_API_KEY ?? "" }),
  verify: typeof verifyConvergedWebSources = verifyConvergedWebSources) {
  if (process.env.IMX_ASTRA_WEB_MINIMUM_SOURCE_FALLBACK !== "1" ||
    process.env.IMX_ENABLE_ASTRA_WEB_DISCOVERY !== "1" ||
    process.env.IMX_ENABLE_ASTRA_WEB_CONVERGENCE !== "1") return "DISABLED";
  return withPaidOperation({ userId: input.userId, projectId: input.projectId,
    requestId: `minimum-source-astra:${input.projectId}:${input.searchIntentHash}`,
    purpose: "MINIMUM_SOURCE_ASTRA", revision: input.searchIntentHash,
    inputs: { searchIntentHash: input.searchIntentHash } }, async () => {
    const coverage = evaluateSnapshotCoverage(input.intent, input.searchSnapshot);
    const gap = coverage.gaps.find(g => g.type === "MINIMUM_SOURCE_COVERAGE");
    if (!gap) return "NOT_NEEDED";
    const policy = { maxCandidates: 6, maxToolCalls: 2, maxOutputTokens: 8000 };
    const discovery = await runWebDiscoveryOperation({ userId: input.userId, projectId: input.projectId,
      smoke: false, gapSetHash: coverage.gapsHash, seenSetHash: coverage.seenSetHash,
      researchIntentProjection: boundedResearchDiscoveryContext(semanticPlannerInput(input.intent, input.searchIntentHash), gap),
      evidenceGaps: [gap], seenSourceIdentities: (input.searchSnapshot.candidateAdmissions ?? []).slice(0, 30)
        .map(row => ({ ...(row.doi ? { doi: row.doi.slice(0, 160) } : {}), title: (row.title ?? "").slice(0, 200) })),
      policy, provider });
    if (!["COMPLETED", "PARTIAL"].includes(discovery.state)) return discovery.state;
    const converged = await convergePaidWebDiscoveryOperation({ userId: input.userId, projectId: input.projectId,
      operationId: discovery.operationId, seenSetHash: coverage.seenSetHash, policy,
      context: { gapSetHash: coverage.gapsHash, discoveredSourcePoolVersion: coverage.sourcePoolVersion,
        currentSourcePoolVersion: coverage.sourcePoolVersion, allowedGapIds: [gap.gapId] } });
    await verify(input.userId, input.projectId, discovery.operationId, converged);
    return discovery.state;
  });
}

async function counts(userId: string, projectId: string) {
  const sources = await listProjectReferences(userId, projectId);
  return sourceCounts(sources.map(source => ({ id: source.referenceId, selected: source.selected,
    tier: source.relevanceTier, usable: source.scientificallyUsable })));
}
/** One durable, cost-scoped convergence per frozen scientific intent and policy.
 * No transaction is held during network/model work. Failed paid attempts are not replayed.
 */
export async function convergeSourceSufficiency(userId: string, projectId: string, search: SearchInput) {
  const searchIntentHash = fingerprint(search.intent);
  const requestId = `source-sufficiency:${fingerprint({ projectId, searchIntentHash, policy: SOURCE_SUFFICIENCY_POLICY })}`;
  const previous = await prisma.paidOperation.findUnique({ where: { userId_requestId: { userId, requestId } }, select: { status: true } });
  let recoverFailed: { version: string; completedCallPurposes: string[] } | undefined;
  if (previous?.status === "FAILED") {
    // Only the known pre-discovery planner failure can resume automatically.
    // Earlier provider/review calls remain protected by the paid-call whitelist.
    const failure = await prisma.auditLog.findFirst({ where: { userId, projectId, eventType: "SEARCH_PLANNER_FAILED" },
      orderBy: { createdAt: "desc" }, select: { payloadJson: true } });
    const payload = failure?.payloadJson as { searchIntentHash?: string; category?: string } | null;
    if (payload?.searchIntentHash === searchIntentHash && payload.category === "QUERY_PLAN_INVALID") {
      const input = semanticPlannerInput(search.intent, searchIntentHash);
      if (input.readiness === "READY" && !validateSearchPlan(fallbackSearchEnrichment(input)).failure)
        recoverFailed = { version: "source-sufficiency-fallback.v2", completedCallPurposes: ["research_search_enrichment_roles_v2"] };
    }
  }
  return withPaidOperation({ userId, projectId, requestId, purpose: "SOURCE_SUFFICIENCY",
    revision: searchIntentHash, inputs: { searchIntentHash, policyVersion: SOURCE_SUFFICIENCY_POLICY }, recoverFailed }, async () => {
    let result = await searchProjectReferencesV2(userId, projectId, search, { batchKind: "initial", automaticConvergence: true });
    let current = await counts(userId, projectId);
    let lowerCostConvergenceComplete = true;
    // Each batch takes at most two unused validated queries. A final batch with
    // no OA capacity allows the single justified Crossref formulation.
    for (let batch = 0; batch < 4 && current.core < 3; batch++) {
      if (fingerprint((await loadSearchInput(userId, projectId)).intent) !== searchIntentHash) throw new Error("SEARCH_INTENT_CHANGED");
      const before = result.searchSnapshot.executedQueries?.length ?? 0;
      try {
        result = await searchProjectReferencesV2(userId, projectId, search, { batchKind: "more", automaticConvergence: true });
      } catch (error) {
        // Each completed batch has already published its valid sources. A later
        // provider/review failure must not erase those results or masquerade as
        // a successful exhaustion of the cheaper retrieval routes.
        lowerCostConvergenceComplete = false;
        await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM",
          eventType: "SOURCE_SUFFICIENCY_PARTIAL", payloadJson: { searchIntentHash,
            category: safeSearchFailureCategory(error) } } });
        break;
      }
      current = await counts(userId, projectId);
      const executions = result.searchSnapshot.executedQueries ?? [];
      if (executions.length === before || (new Set(executions.filter(q => q.provider === "OPENALEX").map(q => q.queryHash)).size >= MAX_AUTO_OPENALEX_QUERIES && executions.some(q => q.provider === "CROSSREF"))) break;
    }
    let astra = "NOT_NEEDED";
    if (current.core < 3) {
      astra = "DISABLED";
      if (shouldRunAutomaticAstra(current.core, lowerCostConvergenceComplete)) {
        // Separate deterministic operation key also prevents a new Astra payment
        // when the seen set changes under the same frozen search definition.
        astra = await runAutomaticAstraFallback({ userId, projectId, searchIntentHash,
          intent: search.intent, searchSnapshot: result.searchSnapshot }).catch(async error => {
          const category = error instanceof Error && /BUDGET|COST_LIMIT|PRE_JOB_COST_LIMIT/.test(error.message)
            ? "ASTRA_BUDGET_BLOCKED" : "ASTRA_UNAVAILABLE";
          await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM",
            eventType: category, payloadJson: { searchIntentHash } } });
          return category;
        });
      }
    }
    current = await counts(userId, projectId);
    const sufficiency = { policyVersion: SOURCE_SUFFICIENCY_POLICY, searchIntentHash,
      semanticPlanIdentity: result.searchSnapshot.queryPlanHash, seenSourceSetHash: fingerprint(result.searchSnapshot.candidateAdmissions?.map(row => row.candidateKey).sort()),
      ...current, fallbackExhausted: current.core < 3 && lowerCostConvergenceComplete,
      lowerCostConvergenceComplete, astra };
    await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "SOURCE_SUFFICIENCY_COMPLETED", payloadJson: sufficiency } });
    return { ...result, sufficiency };
  });
}
