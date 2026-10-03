import path from "node:path";
import { prisma } from "@/lib/prisma";
import { currentJobExecution, fingerprint, stageCheckpoint } from "./job-execution-context";
import { acquireSupportDocument } from "./design-support-document";
import type { DesignSupportSource } from "./design-support-addendum";
import type { DesignSupportGap } from "./design-support-gap";
import { DESIGN_MINI_RESEARCH_PURPOSE, type WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";
import { convergeWebCandidate } from "@/server/retrieval/web-candidate-convergence";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";
import { normalizeConcept } from "@/lib/retrieval-scientific-concepts";

export function observedAlternateUrls(discovery: WebDiscoveryResult, candidate: WebDiscoveryResult["candidates"][number]) {
  const completed = new Set(discovery.diagnostics?.response?.webSearchCalls.filter(call =>
    call.status === "completed" && call.actionType === "search").map(call => call.id));
  if (!discovery.diagnostics?.toolLimit?.accepted) return [];
  return [...new Set([candidate.proposal.accessProposal.reportedPdfUrl, ...candidate.proposal.accessProposal.alternateUrls])]
    .filter((url): url is string => Boolean(url && normalizePublicWebUrl(url)))
    .map(url => ({ url, observations: discovery.observations.filter(o => o.operationId === discovery.operationId &&
      o.responseId === discovery.responseId && completed.has(o.toolCallId) && o.actionType === "search" &&
      o.normalizedUrl === normalizePublicWebUrl(url)) }))
    .filter(item => item.observations.length > 0);
}

/** Inspect already observed alternate document routes before paying for another
 * discovery. A completed search and its rejected acquisition remain immutable. */
export async function acquirePreviouslyObservedSupport(input: { userId: string; projectId: string; runId: string;
  gaps: DesignSupportGap[]; knownSupport: DesignSupportSource[] }) {
  const execution = currentJobExecution();
  if (!execution || !input.gaps.length || input.knownSupport.length >= 4) return [] as DesignSupportSource[];
  const row = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: {
    jobId: execution.jobId, stageKey: "checkpoint:DESIGN_MINI_RESEARCH_V2_ACQUISITION3_1" } } });
  const saved = row?.outputJson as unknown as { value?: { operation?: { operationId?: string } }; outputHash?: string };
  if (row?.status !== "COMPLETED" || !saved?.value?.operation?.operationId || fingerprint(saved.value) !== saved.outputHash) return [];
  const operation = await prisma.paidOperation.findFirst({ where: { id: saved.value.operation.operationId,
    userId: input.userId, projectId: input.projectId, purpose: DESIGN_MINI_RESEARCH_PURPOSE, status: "COMPLETED" } });
  const discovery = operation?.resultJson as unknown as WebDiscoveryResult;
  if (!discovery || discovery.operationId !== operation!.id || !["COMPLETED", "PARTIAL"].includes(discovery.state)) return [];
  const gap = input.gaps[0];
  return stageCheckpoint("DESIGN_SUPPORT_OBSERVED_ALTERNATES_V1", { discoveryHash: fingerprint(discovery),
    checkpointHash: saved.outputHash, gap, knownHashes: input.knownSupport.map(s => s.document.sha256).sort() }, async () => {
    const sources: DesignSupportSource[] = [];
    let acquired = 0, inspected = 0;
    for (const candidate of discovery.candidates.slice(0, 5)) {
      if (!candidate.proposal.gapIds.includes(gap.gapId)) continue;
      const expected = normalizeConcept(candidate.proposal.identityProposal.title);
      if (input.knownSupport.some(s => normalizeConcept(s.title).includes(expected))) continue;
      const convergence = convergeWebCandidate({ discovery, candidate, existing: [], context: {
        operationId: discovery.operationId, projectId: input.projectId, searchIntentHash: fingerprint(gap.scopeBoundary),
        gapSetHash: fingerprint(gap), allowedGapIds: [gap.gapId], discoveredSourcePoolVersion: saved.outputHash!,
        currentSourcePoolVersion: saved.outputHash! } });
      if (convergence.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !convergence.semanticReviewRequired) continue;
      for (const alternate of observedAlternateUrls(discovery, candidate).slice(0, 2)) {
        if (acquired >= Math.min(2, 4 - input.knownSupport.length) || inspected >= 5) break;
        inspected++;
        const result = await stageCheckpoint(`DESIGN_SUPPORT_OBSERVED_DOCUMENT_${fingerprint(alternate.url)}`, {
          discoveryHash: fingerprint(discovery), gap, url: alternate.url, policy: "observed-support-document.v1",
        }, async () => {
          try {
            const document = await acquireSupportDocument(alternate.url, `${gap.question} ${gap.searchProjection} ${candidate.proposal.identityProposal.title}`,
              path.resolve("artifacts-local", "design-support", fingerprint([input.userId, input.projectId, input.runId])),
              { title: candidate.proposal.identityProposal.title, doi: candidate.proposal.identityProposal.doi });
            const observed = normalizeConcept(document.title);
            if (!expected || !observed || !(observed.includes(expected) || expected.includes(observed)) || !document.passages.length)
              return { source: null, acquired: true };
            const source: DesignSupportSource = { sourceId: `DS-${fingerprint([input.projectId, document.sha256]).slice(0, 20)}`,
              gapId: gap.gapId, title: document.title, authors: document.bibliography?.authors ?? [],
              year: document.bibliography?.year ?? null, doi: document.bibliography?.doi ?? null,
              observationIds: alternate.observations.map(o => o.observationId), document, provenance: "SYSTEM_DESIGN_SUPPORT" };
            return { source, acquired: true };
          } catch { return { source: null, acquired: false }; }
        }, value => value.source?.document.privateArtifactPath ? [value.source.document.privateArtifactPath] : []);
        if (result.acquired) acquired++;
        if (result.source && ![...input.knownSupport, ...sources].some(s => s.document.sha256 === result.source!.document.sha256)) {
          sources.push(result.source); break;
        }
      }
    }
    return sources;
  }, sources => sources.flatMap(source => source.document.privateArtifactPath ? [source.document.privateArtifactPath] : []));
}
