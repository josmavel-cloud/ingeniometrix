import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { createConversationalProject, changeDefinition, confirmDefinition, readDefinition } from "@/server/projects/conversational-definition-service";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { listProjectReferences } from "@/server/retrieval/reference-service";
import { runAutomaticAstraFallback, shouldRunAutomaticAstra } from "@/server/retrieval/source-sufficiency-controller";
import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import { candidateMetadataHash } from "@/server/retrieval/candidate-review-policy";
import { fingerprint } from "@/server/mvp/job-execution-context";
import type { WebDiscoveryProvider, WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440");
  assert.equal(url.pathname, "/imx_reliability_20261001");
  global.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_ASTra_TEST"); };
  process.env.IMX_ASTRA_WEB_MINIMUM_SOURCE_FALLBACK = "1";
  process.env.IMX_ENABLE_ASTRA_WEB_DISCOVERY = "1";
  process.env.IMX_ENABLE_ASTRA_WEB_CONVERGENCE = "1";
  const user = await prisma.user.create({ data: { email: `astra-offline-${randomUUID()}@example.test` } });
  const createdRefs: string[] = [];
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation",
      idea: "Evaluate accessibility in urban public transport", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: { revision: number; etag: string; definitionHash: string } = (await readDefinition(user.id, project.id))!;
    for (const [field, value] of [["purpose", "Evaluate public transport accessibility"],
      ["object", "urban public transport systems"], ["concepts", "accessibility; urban mobility"]] as const) {
      view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
        action: { kind: "EDIT", field, value, knowledge: "KNOWN" } });
    }
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const search = await loadSearchInput(user.id, project.id);
    const searchIntentHash = fingerprint(search.intent);
    for (let i = 0; i < 2; i++) {
      const title = `Urban transport accessibility study ${i + 1}`;
      const ref = await prisma.reference.create({ data: { title, normalizedTitle: normalizeTitle(title),
        abstract: "An observed scholarly study of accessibility in public transport systems.", authorsJson: [], year: 2024,
        doi: `10.1234/astra-offline-${randomUUID()}` } });
      createdRefs.push(ref.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: ref.id,
        sourceProvider: "OPENALEX" } });
    }
    await fixtureSourceAssessments(user.id, project.id, createdRefs);
    const before = await listProjectReferences(user.id, project.id);
    assert.equal(before.filter(row => row.relevanceTier === "CORE" && row.scientificallyUsable).length, 2);
    assert(shouldRunAutomaticAstra(2, true));
    const snapshot = (await getLatestProjectReferenceSearchSnapshot(project.id))!;
    let discoveryCalls = 0, verificationCalls = 0;
    const candidateTitle = "Observed scholarly urban mobility evidence";
    const observedUrl = "https://catalog.example.org/urban-mobility-evidence";
    const provider: WebDiscoveryProvider = { async discover(input) {
      discoveryCalls++;
      const operationId = input.operationContext.operationId;
      const observationId = "observed-fixture-1";
      return { schemaVersion: "web-discovery-result.v1", state: "COMPLETED", operationId,
        responseId: "synthetic-completed-web-search", model: "offline-replay", searchActionCount: 1, toolCallCount: 1,
        observations: [{ observationId, operationId, responseId: "synthetic-completed-web-search", toolCallId: "web-call-1",
          actionType: "search", queryIfAvailable: null, observedUrl, normalizedUrl: observedUrl,
          observedTitleIfAvailable: candidateTitle, observedAt: new Date().toISOString() }],
        candidates: [{ proposal: { localCandidateRef: "candidate-1", gapIds: [input.evidenceGaps[0].gapId],
          identityProposal: { title: candidateTitle, authors: ["Synthetic Author"], year: 2024,
            doi: null, issuer: "Synthetic journal", sourceType: "PEER_REVIEWED_ARTICLE" }, observedUrl,
          relevanceProposal: { role: "DIRECT", gapCoverage: "Urban mobility", rationale: "Requires independent review",
            uncertainty: "Metadata must be observed" },
          accessProposal: { reportedAccessType: "UNKNOWN", reportedPdfUrl: null, alternateUrls: [] } },
          observationIds: [observationId], metadataProvenance: { observedUrl: "TOOL_OBSERVED", title: "MODEL_PROPOSED",
            authors: "MODEL_PROPOSED", year: "MODEL_PROPOSED", doi: "UNKNOWN", issuer: "MODEL_PROPOSED",
            sourceType: "MODEL_PROPOSED", access: "UNKNOWN" } }],
        rejectedProposals: [], usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedInputTokens: 0 },
        estimatedCostUsd: 0, costPolicyVersion: "offline-replay",
        diagnostics: { response: { webSearchCalls: [{ id: "web-call-1", status: "completed", actionType: "search" }] },
          toolLimit: { accepted: true, reason: "WITHIN_LIMIT" } } as unknown as WebDiscoveryResult["diagnostics"] } satisfies WebDiscoveryResult;
    } };
    const verify: Parameters<typeof runAutomaticAstraFallback>[2] = async (_userId, _projectId, _operationId, results) => {
      verificationCalls++;
      const found = results.find(row => row.identityOutcome === "NEW_SOURCE_CANDIDATE" && row.candidateId);
      assert(found?.candidateId, `No converged new candidate: ${results.map(row => `${row.identityOutcome}:${row.reasons.join("|")}`).join(",")}`);
      createdRefs.push(found.candidateId);
      const preReview = await listProjectReferences(user.id, project.id);
      assert(!preReview.some(row => row.referenceId === found.candidateId && row.relevanceTier === "CORE"),
        "Astra proposal is never promoted to CORE by quota alone");
      const abstract = "A verified synthetic scholarly abstract on public transport accessibility.";
      await prisma.reference.update({ where: { id: found.candidateId }, data: { abstract, year: 2024,
        authorsJson: ["Synthetic Author"], venue: "Synthetic journal" } });
      const metadataHash = candidateMetadataHash({ candidateId: found.candidateId, title: candidateTitle, abstract, year: 2024 });
      await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, actorType: "SYSTEM",
        eventType: "VERIFIED_SOURCE_ASSESSMENT_V1", payloadJson: { referenceId: found.candidateId,
          searchIntentHash, metadataHash, identityResolved: true, provenance: "offline-verified-review-replay",
          assessment: { candidateId: found.candidateId, searchIntentHash, metadataHash,
            policyVersion: "candidate-semantic-review.v2", relevance: "RELEVANT", role: "DIRECT",
            confidence: "HIGH", origin: "DETERMINISTIC", rationale: "Verified synthetic fixture",
            evidence: [{ field: "title", quote: candidateTitle }], matchedIntentDimensions: ["topic"], mismatches: [] } } } });
    };
    const input = { userId: user.id, projectId: project.id, searchIntentHash, intent: search.intent, searchSnapshot: snapshot };
    assert.equal(await runAutomaticAstraFallback(input, provider, verify), "COMPLETED");
    assert.equal((await listProjectReferences(user.id, project.id)).filter(row => row.relevanceTier === "CORE" && row.scientificallyUsable).length, 3);
    assert.equal(await runAutomaticAstraFallback(input, provider, verify), "COMPLETED");
    assert.equal(discoveryCalls, 1);
    assert.equal(verificationCalls, 1);
    assert.equal(await prisma.paidOperation.count({ where: { userId: user.id, projectId: project.id,
      purpose: "ASTRA_WEB_DISCOVERY" } }), 1);
    console.log("PASS automatic Astra: 2 CORE triggers one bounded web operation; observed candidate converges, remains unpromoted until common review, then CORE; replay adds no call");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: createdRefs } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "ASTRA_TEST_FAILED"); process.exitCode = 1; });
