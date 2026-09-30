import { Prisma, Provider } from "@prisma/client";
import { definitionSchema } from "@/lib/conversational-intake";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { loadSearchInput } from "./search-intent-service";
import { getLatestProjectReferenceSearchSnapshot } from "./reference-search-v2";
import { webDiscoveryOperationIdentity } from "./web-discovery-operation";
import { evaluateSnapshotCoverage } from "./evidence-coverage-snapshot";
import type { CoverageSource } from "./evidence-gap-contract";
import { WEB_DISCOVERY_PURPOSE, type WebDiscoveryResult } from "./web-discovery-contract";
import { convergeWebCandidate, convergenceKey, type ConvergenceContext, type ExistingScientificSource,
  type WebCandidateConvergenceResult } from "./web-candidate-convergence";

const EVENT = "WEB_CANDIDATE_CONVERGENCE_V1";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const uuidFromHash = (hash: string) => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

function convergedCoverageSources(rows: Array<{ id: string; payloadJson: Prisma.JsonValue }>, projectId: string,
  searchIntentHash: string): CoverageSource[] {
  return rows.flatMap(row => {
    const payload = row.payloadJson as { searchIntentHash?: string; referenceId?: string | null;
      result?: WebCandidateConvergenceResult; proposedFields?: { identity?: { title?: string }; access?: { reportedAccessType?: string } } };
    if (payload.searchIntentHash !== searchIntentHash || payload.result?.identityOutcome !== "NEW_SOURCE_CANDIDATE" ||
        !payload.referenceId || !payload.proposedFields?.identity?.title) return [];
    return [{ projectId, searchIntentHash, candidateId: payload.referenceId,
      title: payload.proposedFields.identity.title, abstract: null, year: null, authors: [],
      provenanceRef: `web-convergence:${row.id}`, assessmentValidation: "UNVERIFIED" as const,
      identity: "UNCERTAIN" as const, sourceType: "UNKNOWN" as const,
      officialAuthority: { status: "UNKNOWN" as const },
      access: { reportedPdf: payload.proposedFields.access?.reportedAccessType === "REPORTED_PDF",
        materializedFullText: false } }];
  });
}

/** Private, owner-scoped view of web candidates in the common project source pool. */
export async function listWebConvergenceRecords(userId: string, projectId: string) {
  if (!await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } })) throw new Error("PROJECT_NOT_FOUND");
  const searchIntentHash = fingerprint((await loadSearchInput(userId, projectId)).intent);
  const rows = await prisma.auditLog.findMany({ where: { projectId, eventType: EVENT }, orderBy: { createdAt: "asc" } });
  return rows.map(row => row.payloadJson as unknown as { searchIntentHash: string; result: WebCandidateConvergenceResult;
    referenceId: string | null; observation: unknown; proposedFields: unknown; sourceState: string })
    .filter(row => row.searchIntentHash === searchIntentHash);
}

/**
 * Internal-only convergence. The feature flag remains off in 2B2.3; a future
 * project workflow must supply authoritative current coverage, not browser JSON.
 * Audit payloads are the additive provenance contract; rawOpenAlexJson is never
 * repurposed for web data.
 */
export async function convergePaidWebDiscoveryOperation(input: {
  userId: string; projectId: string; operationId: string;
  context: Omit<ConvergenceContext, "operationId" | "projectId" | "searchIntentHash">;
  seenSetHash: string; policy: { maxToolCalls: number; maxCandidates: number; maxOutputTokens: number };
}): Promise<WebCandidateConvergenceResult[]> {
  if (process.env.IMX_ENABLE_ASTRA_WEB_CONVERGENCE !== "1") throw new Error("WEB_CONVERGENCE_DISABLED");
  const search = await loadSearchInput(input.userId, input.projectId);
  if (search.intent.sourceKind !== "CONFIRMED_DEFINITION") throw new Error("WEB_CONVERGENCE_CONFIRMED_INTENT_REQUIRED");
  const searchIntentHash = fingerprint(search.intent);
  const context: ConvergenceContext = { ...input.context, operationId: input.operationId,
    projectId: input.projectId, searchIntentHash };
  if (context.discoveredSourcePoolVersion !== context.currentSourcePoolVersion) throw new Error("WEB_CONVERGENCE_STALE_POOL");
  const identity = webDiscoveryOperationIdentity({ userId: input.userId, projectId: input.projectId,
    searchIntentHash, gapSetHash: context.gapSetHash, seenSetHash: input.seenSetHash, ...input.policy });
  const operation = await prisma.paidOperation.findFirst({ where: { id: input.operationId, userId: input.userId,
    projectId: input.projectId, purpose: WEB_DISCOVERY_PURPOSE, status: "COMPLETED", revision: searchIntentHash,
    requestId: identity.requestId } });
  if (!operation) throw new Error("WEB_CONVERGENCE_OPERATION_NOT_AUTHORIZED");
  const discovery = operation.resultJson as unknown as WebDiscoveryResult;
  if (!discovery || discovery.operationId !== input.operationId || !["COMPLETED", "PARTIAL"].includes(discovery.state) ||
      !Array.isArray(discovery.candidates) || !Array.isArray(discovery.observations)) throw new Error("WEB_CONVERGENCE_RESULT_INVALID");
  const snapshot = await getLatestProjectReferenceSearchSnapshot(input.projectId);
  if (!snapshot || snapshot.stale || snapshot.inputTrace?.searchIntentHash !== searchIntentHash) throw new Error("WEB_CONVERGENCE_SEARCH_SNAPSHOT_STALE");

  return prisma.$transaction(async tx => {
    // Serialize convergence with other project mutations, then recheck the
    // scientific definition. Selection changes do not invalidate its hash.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} AND "userId" = ${input.userId} FOR UPDATE`;
    const project = await tx.project.findFirst({ where: { id: input.projectId, userId: input.userId },
      include: { draft: true, intake: true } });
    const confirmed = project?.intake?.confirmedDefinitionJson as { revision?: number; definitionHash?: string } | null;
    const raw = (project?.draft?.contentJson as Record<string, unknown> | null)?.researchDefinition;
    if (!raw || !confirmed || confirmed.revision !== search.intent.confirmedDraftRevision ||
        confirmed.definitionHash !== search.intent.definitionHash ||
        fingerprint(definitionSchema.parse(raw)) !== search.intent.definitionHash) throw new Error("WEB_CONVERGENCE_INTENT_STALE");
    const links = await tx.projectReference.findMany({ where: { projectId: input.projectId }, include: { reference: true } });
    const priorWeb = await tx.auditLog.findMany({ where: { projectId: input.projectId, eventType: EVENT },
      select: { id: true, payloadJson: true } });
    const priorById = new Map(priorWeb.map(row => [row.id, row]));
    const replayIds = discovery.candidates.map(c => uuidFromHash(convergenceKey(input.operationId,
      c.proposal.localCandidateRef, c.observationIds)));
    if (replayIds.length && replayIds.every(id => priorById.has(id))) return replayIds.map(id =>
      (priorById.get(id)!.payloadJson as { result: WebCandidateConvergenceResult }).result);
    const latestSearchAudit = await tx.auditLog.findFirst({ where: { projectId: input.projectId, eventType: "SEARCH_COMPLETED" },
      orderBy: { createdAt: "desc" }, select: { payloadJson: true } });
    const latestSavedAt = (latestSearchAudit?.payloadJson as { searchSnapshot?: { savedAt?: string } } | null)?.searchSnapshot?.savedAt;
    if (latestSavedAt !== snapshot.savedAt) throw new Error("WEB_CONVERGENCE_SEARCH_SNAPSHOT_CHANGED");
    const coverage = evaluateSnapshotCoverage(search.intent, snapshot, [],
      convergedCoverageSources(priorWeb, input.projectId, searchIntentHash));
    if (coverage.sourcePoolVersion !== context.currentSourcePoolVersion ||
        coverage.seenSetHash !== input.seenSetHash) throw new Error("WEB_CONVERGENCE_POOL_VERSION_MISMATCH");
    if (discovery.candidates.some(c => c.proposal.gapIds.some(id =>
      !coverage.gaps.some(g => g.gapId === id && g.webDiscoveryEligible)))) throw new Error("WEB_CONVERGENCE_GAP_NOT_CURRENTLY_ELIGIBLE");
    const webUrls = new Map<string, string[]>();
    for (const row of priorWeb) {
      const payload = row.payloadJson as { referenceId?: string | null; observation?: { normalizedUrl?: string } };
      if (payload.referenceId && payload.observation?.normalizedUrl) webUrls.set(payload.referenceId,
        [...(webUrls.get(payload.referenceId) ?? []), payload.observation.normalizedUrl]);
    }
    const admittedIds = new Set(snapshot.references.filter(r => r.admission?.state === "ADMITTED").map(r => r.referenceId));
    const existing: ExistingScientificSource[] = links.map(link => {
      const ref = link.reference;
      const providerIdentified = Boolean(ref.rawOpenAlexJson || ref.rawCrossrefJson ||
        link.sourceProvider === Provider.OPENALEX || link.sourceProvider === Provider.CROSSREF);
      return { id: ref.id, title: ref.title, authors: Array.isArray(ref.authorsJson) ?
        ref.authorsJson.filter((a): a is string => typeof a === "string") : [], year: ref.year,
        doi: ref.doi, workType: ref.workType, selected: link.selected, assessmentValid: admittedIds.has(ref.id),
        doiProvenance: providerIdentified ? "PROVIDER_METADATA" : "MODEL_PROPOSED",
        observedUrls: [...(providerIdentified && ref.landingPageUrl ? [ref.landingPageUrl] : []), ...(webUrls.get(ref.id) ?? [])] };
    });
    const results: WebCandidateConvergenceResult[] = [];
    for (const candidate of discovery.candidates) {
      const key = convergenceKey(input.operationId, candidate.proposal.localCandidateRef, candidate.observationIds);
      const eventId = uuidFromHash(key);
      const prior = await tx.auditLog.findUnique({ where: { id: eventId } });
      if (prior) {
        const payload = prior.payloadJson as { result: WebCandidateConvergenceResult };
        results.push(payload.result); continue;
      }
      let result = convergeWebCandidate({ context, discovery, candidate, existing });
      let referenceId = result.scientificSourceId;
      if (result.identityOutcome === "NEW_SOURCE_CANDIDATE") {
        // A web proposal is discoverable but not recommended. No proposed DOI
        // or access claim is promoted to verified Reference columns.
        referenceId = uuidFromHash(key);
        const proposal = candidate.proposal;
        const ref = await tx.reference.create({ data: { id: referenceId, doi: null, openAlexId: null,
          crossrefId: null, title: proposal.identityProposal.title,
          normalizedTitle: normalizeTitle(proposal.identityProposal.title),
          // Only an observed URL is grounded. Bibliographic proposals remain
          // in the audit payload, not verified Reference metadata.
          authorsJson: json([]), abstract: null,
          venue: null, year: null, workType: null,
          landingPageUrl: proposal.observedUrl, citationCount: null,
          rawOpenAlexJson: Prisma.JsonNull, rawCrossrefJson: Prisma.JsonNull } });
        await tx.projectReference.create({ data: { projectId: input.projectId, referenceId: ref.id,
          sourceProvider: Provider.OPENAI, relevanceScore: null, selected: false } });
        result = { ...result, candidateId: ref.id };
        existing.push({ id: ref.id, title: ref.title, authors: proposal.identityProposal.authors,
          year: ref.year, doi: null, workType: ref.workType, observedUrls: [proposal.observedUrl],
          selected: false, assessmentValid: false, doiProvenance: "MODEL_PROPOSED" });
      }
      const observation = discovery.observations.find(o => o.observationId === result.discoveryObservationIds[0]) ?? null;
      const payload = { version: result.version, channel: "ASTRA_WEB", operationId: input.operationId,
        responseId: discovery.responseId, searchIntentHash, gapSetHash: context.gapSetHash,
        sourcePoolVersion: context.discoveredSourcePoolVersion, proposalRef: candidate.proposal.localCandidateRef,
        referenceId, result, observation,
        proposedFields: { identity: candidate.proposal.identityProposal, access: candidate.proposal.accessProposal,
          provenance: result.fieldProvenance },
        sourceState: result.identityOutcome === "NEW_SOURCE_CANDIDATE" ? "DISCOVERED" :
          result.identityOutcome === "MATCHED_EXISTING" ? "IDENTITY_RESOLVED" : result.identityOutcome };
      await tx.auditLog.create({ data: { id: eventId, projectId: input.projectId, userId: input.userId,
        eventType: EVENT, actorType: "SYSTEM", provider: Provider.OPENAI, payloadJson: json(payload) } });
      results.push(result);
    }
    return results;
  });
}
