import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, Provider } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeTitle } from "../lib/text";
import type { ConversationalView } from "../lib/conversational-intake";
import { createConversationalProject, changeDefinition, confirmDefinition, readDefinition } from "../server/projects/conversational-definition-service";
import { fingerprint } from "../server/mvp/job-execution-context";
import { loadSearchInput } from "../server/retrieval/search-intent-service";
import { evaluateSnapshotCoverage } from "../server/retrieval/evidence-coverage-snapshot";
import { webDiscoveryOperationIdentity } from "../server/retrieval/web-discovery-operation";
import { convergePaidWebDiscoveryOperation, listWebConvergenceRecords } from "../server/retrieval/web-candidate-convergence-service";
import { WEB_DISCOVERY_PURPOSE, type ValidatedWebCandidate, type WebDiscoveryResult, type WebSourceObservation } from "../server/retrieval/web-discovery-contract";
import type { ProjectReferenceSearchSnapshot } from "../server/retrieval/reference-search-v2";

if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/imx_b4_validation_rc4") throw new Error("ISOLATED_TEST_DB_REQUIRED");
const originalFetch = global.fetch;
global.fetch = async () => { throw new Error("PROVIDER_NETWORK_FORBIDDEN"); };
process.env.IMX_ENABLE_ASTRA_WEB_CONVERGENCE = "1";
const inputJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function candidate(ref: string, title: string, url: string, observationId: string): ValidatedWebCandidate {
  return { proposal: { localCandidateRef: ref, gapIds: [],
    identityProposal: { title, authors: ["Proposed Author"], year: 2026, doi: "10.1234/model-proposed", issuer: "Proposed Issuer",
      sourceType: "STANDARD_OR_CODE" }, observedUrl: url,
    relevanceProposal: { role: "CONTEXTUAL", gapCoverage: "Possible coverage", rationale: "Needs independent review", uncertainty: "Identity not verified" },
    accessProposal: { reportedAccessType: "REPORTED_PDF", reportedPdfUrl: null, alternateUrls: [] } },
  observationIds: [observationId], metadataProvenance: { observedUrl: "TOOL_OBSERVED", title: "MODEL_PROPOSED",
    authors: "MODEL_PROPOSED", year: "MODEL_PROPOSED", doi: "MODEL_PROPOSED", issuer: "MODEL_PROPOSED",
    sourceType: "MODEL_PROPOSED", access: "MODEL_PROPOSED" } };
}

async function main() {
  const user = await prisma.user.create({ data: { email: `phase2b23-${randomUUID()}@example.test` } });
  const referenceId = randomUUID();
  const matchedUrl = "https://primary.example.org/publication/known";
  const newUrl = "https://authority.example.org/document/new";
  let newReferenceId: string | null = null;
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Research on standard 2040",
      degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: ConversationalView = (await readDefinition(user.id, project.id))!;
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "purpose", value: "Evaluate standard 2040 for research practice", knowledge: "KNOWN" } });
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "concepts", value: "standard 2040; research practice", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const search = await loadSearchInput(user.id, project.id);
    const searchIntentHash = fingerprint(search.intent);
    const snapshot = { referenceSearchVersion: "v2", savedAt: "2026-01-01T00:00:00.000Z", stale: false,
      inputTrace: { projectId: project.id, intakeId: search.intakeId, confirmedDraftRevision: search.intent.confirmedDraftRevision,
        definitionHash: search.intent.definitionHash, searchIntentHash }, metadata: {},
      candidateAdmissions: [], references: [{ referenceId, relevanceScore: 1, suggestedSelectedOrder: null }],
    } as unknown as ProjectReferenceSearchSnapshot;
    const coverage = evaluateSnapshotCoverage(search.intent, snapshot);
    const gap = coverage.gaps.find(g => g.webDiscoveryEligible);
    assert(gap, "fixture must have one eligible confirmed-premise gap");
    await prisma.reference.create({ data: { id: referenceId, title: "Known primary document", normalizedTitle: normalizeTitle("Known primary document"),
      authorsJson: [], landingPageUrl: matchedUrl, rawOpenAlexJson: {}, doi: null } });
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId, sourceProvider: Provider.OPENALEX,
      selected: true, selectedOrder: 1, relevanceScore: 1 } });
    await prisma.auditLog.create({ data: { projectId: project.id, userId: user.id, eventType: "SEARCH_COMPLETED",
      actorType: "SYSTEM", provider: Provider.OPENALEX,
      payloadJson: inputJson({ referenceSearchVersion: "v2", searchSnapshot: snapshot }) } });
    const policy = { maxToolCalls: 1, maxCandidates: 2, maxOutputTokens: 2048 };
    const identity = webDiscoveryOperationIdentity({ userId: user.id, projectId: project.id, searchIntentHash,
      gapSetHash: coverage.gapsHash, seenSetHash: coverage.seenSetHash, ...policy });
    const opId = randomUUID();
    const candidates = [candidate("known", "Known primary document", matchedUrl, "obs-known"),
      candidate("new", "New official primary document", newUrl, "obs-new")];
    for (const c of candidates) c.proposal.gapIds = [gap.gapId];
    const observations: WebSourceObservation[] = candidates.map(c => ({ observationId: c.observationIds[0],
      operationId: opId, responseId: "response-fixture", toolCallId: "call-fixture", actionType: "search",
      queryIfAvailable: null, observedUrl: c.proposal.observedUrl, normalizedUrl: c.proposal.observedUrl,
      observedTitleIfAvailable: null, observedAt: "2026-01-01T00:00:00.000Z" }));
    const result = { schemaVersion: "web-discovery-result.v1", state: "COMPLETED", operationId: opId,
      responseId: "response-fixture", model: "fixture", observations, candidates,
      diagnostics: { response: { webSearchCalls: [{ id: "call-fixture", status: "completed", actionType: "search" }] },
        toolLimit: { accepted: true, reason: "WITHIN_LIMIT" } } } as unknown as WebDiscoveryResult;
    await prisma.paidOperation.create({ data: { id: opId, userId: user.id, projectId: project.id,
      revision: searchIntentHash, requestId: identity.requestId, purpose: WEB_DISCOVERY_PURPOSE,
      inputFingerprint: identity.fingerprint, status: "COMPLETED", hardCapMicros: 2_500_000,
      resultJson: inputJson(result) } });
    const args = { userId: user.id, projectId: project.id, operationId: opId, policy, seenSetHash: coverage.seenSetHash,
      context: { gapSetHash: coverage.gapsHash, discoveredSourcePoolVersion: coverage.sourcePoolVersion,
        currentSourcePoolVersion: coverage.sourcePoolVersion, allowedGapIds: [gap.gapId] } };
    const first = await convergePaidWebDiscoveryOperation(args);
    assert.deepEqual(first.map(r => r.identityOutcome), ["MATCHED_EXISTING", "NEW_SOURCE_CANDIDATE"]);
    assert.equal(first[0].scientificSourceId, referenceId);
    const links = await prisma.projectReference.findMany({ where: { projectId: project.id }, include: { reference: true } });
    assert.equal(links.length, 2);
    assert.equal(links.find(l => l.referenceId === referenceId)?.selected, true);
    const newLink = links.find(l => l.referenceId !== referenceId)!;
    newReferenceId = newLink.referenceId;
    assert.equal(newLink.selected, false);
    assert.equal(newLink.reference.doi, null);
    assert.equal(newLink.reference.year, null);
    assert.deepEqual(newLink.reference.authorsJson, []);
    assert.equal(newLink.reference.rawOpenAlexJson, null);
    assert.equal(newLink.reference.rawCrossrefJson, null);
    const records = await listWebConvergenceRecords(user.id, project.id);
    assert.equal(records.length, 2);
    assert.equal((records[1].proposedFields as { provenance: { doi: string } }).provenance.doi, "MODEL_PROPOSED");
    assert.equal(records[1].sourceState, "DISCOVERED");
    const replay = await convergePaidWebDiscoveryOperation(args);
    assert.deepEqual(replay.map(r => r.proposalId), first.map(r => r.proposalId));
    assert.equal(await prisma.projectReference.count({ where: { projectId: project.id } }), 2);
    assert.equal((await listWebConvergenceRecords(user.id, project.id)).length, 2);
    await assert.rejects(() => convergePaidWebDiscoveryOperation({ ...args,
      context: { ...args.context, currentSourcePoolVersion: "stale" } }), /STALE_POOL/);
    console.log("PASS 2B2.3 persistence: common source pool, selected source preserved, proposal provenance, idempotent replay, no network");
  } finally {
    process.env.IMX_ENABLE_ASTRA_WEB_CONVERGENCE = "0";
    global.fetch = originalFetch;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: [referenceId, ...(newReferenceId ? [newReferenceId] : [])] } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
