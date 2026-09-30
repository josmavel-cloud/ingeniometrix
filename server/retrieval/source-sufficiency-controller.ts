import { verifyConvergedWebSources } from "./verify-web-sources";
import { prisma } from "@/lib/prisma";
import { sourceCounts, SOURCE_SUFFICIENCY_POLICY, MAX_AUTO_OPENALEX_QUERIES } from "@/lib/source-sufficiency-policy";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { searchProjectReferencesV2 } from "./reference-search-v2";
import { listProjectReferences } from "./reference-service";
import { loadSearchInput, type SearchInput } from "./search-intent-service";
import { evaluateSnapshotCoverage } from "./evidence-coverage-snapshot";
import { boundedResearchDiscoveryContext, runWebDiscoveryOperation } from "./web-discovery-operation";
import { createOpenAiWebDiscoveryProvider } from "./web-discovery-provider";
import { convergePaidWebDiscoveryOperation } from "./web-candidate-convergence-service";

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
  return withPaidOperation({ userId, projectId, requestId, purpose: "SOURCE_SUFFICIENCY",
    revision: searchIntentHash, inputs: { searchIntentHash, policyVersion: SOURCE_SUFFICIENCY_POLICY } }, async () => {
    let result = await searchProjectReferencesV2(userId, projectId, search, { batchKind: "initial", automaticConvergence: true });
    let current = await counts(userId, projectId);
    // Each batch takes at most two unused validated queries. A final batch with
    // no OA capacity allows the single justified Crossref formulation.
    for (let batch = 0; batch < 4 && current.core < 3; batch++) {
      if (fingerprint((await loadSearchInput(userId, projectId)).intent) !== searchIntentHash) throw new Error("SEARCH_INTENT_CHANGED");
      const before = result.searchSnapshot.executedQueries?.length ?? 0;
      result = await searchProjectReferencesV2(userId, projectId, search, { batchKind: "more", automaticConvergence: true });
      current = await counts(userId, projectId);
      const executions = result.searchSnapshot.executedQueries ?? [];
      if (executions.length === before || (new Set(executions.filter(q => q.provider === "OPENALEX").map(q => q.queryHash)).size >= MAX_AUTO_OPENALEX_QUERIES && executions.some(q => q.provider === "CROSSREF"))) break;
    }
    let astra = "NOT_NEEDED";
    if (current.core < 3) {
      astra = "DISABLED";
      if (process.env.IMX_ASTRA_WEB_MINIMUM_SOURCE_FALLBACK === "1") {
        // Separate deterministic operation key also prevents a new Astra payment
        // when the seen set changes under the same frozen search definition.
        astra = await withPaidOperation({ userId, projectId,
          requestId: `minimum-source-astra:${projectId}:${searchIntentHash}`, purpose: "MINIMUM_SOURCE_ASTRA",
          revision: searchIntentHash, inputs: { searchIntentHash } }, async () => {
          const coverage = evaluateSnapshotCoverage(search.intent, result.searchSnapshot);
          const gap = coverage.gaps.find(g => g.type === "MINIMUM_SOURCE_COVERAGE");
          if (!gap) return "NOT_NEEDED";
          const policy = { maxCandidates: 6, maxToolCalls: 2, maxOutputTokens: 8000 };
          const discovery = await runWebDiscoveryOperation({ userId, projectId, smoke: false,
            gapSetHash: coverage.gapsHash, seenSetHash: coverage.seenSetHash,
            researchIntentProjection: boundedResearchDiscoveryContext(semanticPlannerInput(search.intent, searchIntentHash), gap),
            evidenceGaps: [gap], seenSourceIdentities: (result.searchSnapshot.candidateAdmissions ?? []).slice(0, 30)
              .map(row => ({ ...(row.doi ? { doi: row.doi.slice(0, 160) } : {}), title: (row.title ?? "").slice(0, 200) })),
            policy, provider: createOpenAiWebDiscoveryProvider({ apiKey: process.env.OPENAI_API_KEY ?? "" }) });
          if (!["COMPLETED", "PARTIAL"].includes(discovery.state)) return discovery.state;
          const converged = await convergePaidWebDiscoveryOperation({ userId, projectId, operationId: discovery.operationId,
            seenSetHash: coverage.seenSetHash, policy, context: { gapSetHash: coverage.gapsHash,
              discoveredSourcePoolVersion: coverage.sourcePoolVersion, currentSourcePoolVersion: coverage.sourcePoolVersion,
              allowedGapIds: [gap.gapId] } });
          await verifyConvergedWebSources(userId, projectId, discovery.operationId, converged);
          return discovery.state;
        }).catch(() => "UNAVAILABLE_OR_BUDGET_DENIED");
      }
    }
    current = await counts(userId, projectId);
    const sufficiency = { policyVersion: SOURCE_SUFFICIENCY_POLICY, searchIntentHash,
      semanticPlanIdentity: result.searchSnapshot.queryPlanHash, seenSourceSetHash: fingerprint(result.searchSnapshot.candidateAdmissions?.map(row => row.candidateKey).sort()),
      ...current, fallbackExhausted: current.core < 3, astra };
    await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "SOURCE_SUFFICIENCY_COMPLETED", payloadJson: sufficiency } });
    return { ...result, sufficiency };
  });
}
