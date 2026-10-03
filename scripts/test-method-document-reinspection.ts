import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { fingerprint, withJobExecution } from "@/server/mvp/job-execution-context";
import { completedMethodResearchProof, recoverCompletedMethodResearch } from "@/server/mvp/design-mini-research-recovery";
import { inspectMethodSupportCandidate } from "@/server/mvp/design-support-inspection";
import { METHOD_DOCUMENT_INSPECTION_VERSION, type SupportDocument } from "@/server/mvp/design-support-document";
import type { ScientificDecisionBundle } from "@/server/mvp/scientific-decision-service";
import { runWebDiscoveryOperation, readCompletedWebDiscovery } from "@/server/retrieval/web-discovery-operation";
import type { WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(db.hostname, "127.0.0.1"); assert.equal(db.port, "55440"); assert.equal(db.pathname, "/imx_b4_validation_rc4");
  global.fetch = async () => { throw new Error("Network forbidden in offline recovery regression"); };
  const root = await mkdtemp(path.join(os.tmpdir(), "imx-method-inspection-"));
  const user = await prisma.user.create({ data: { email: `inspection-${randomUUID()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Synthetic methodological recovery", degreeLevel: "MAESTRIA" } });
    const runId = `isolated-${randomUUID()}`;
    const job = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "RUNNING", startedAt: new Date(), stageDataJson: { runId } } });
    const bundle = { contextFingerprint: "frozen-sanitized", intent: { scope: "Confirmed fixture" }, evidence_pack: { selected_sources: [] } } as unknown as ScientificDecisionBundle;
    const usage = { inputTokens: 40, outputTokens: 10, cachedInputTokens: 0, reasoningTokens: 2 };
    const ledgerUsage = { ...usage, pricingVersion: "fixture-policy", webSearchToolCalls: 1 };
    const title = "Official methodological appraisal manual";
    const abstractTitle = "A review of heterogeneous approaches";
    const substantive = "Investigators must assess each empirical design against the matching appraisal criteria and record the evidential limitations before integrating findings.";
    const abstract = "This review describes several approaches to methodology and discusses their potential applications without reproducing any of their substantive assessment procedures.";
    const html = `<html><title>${abstractTitle}</title><meta name="citation_title" content="${abstractTitle}"><h2>Abstract</h2><p>${abstract}</p></html>`;
    const file = path.join(root, "retained.html"); await writeFile(file, html, { mode: 0o600 });
    const sha = createHash("sha256").update(html).digest("hex");
    const retained = { sourceId: "DS-retained", gapId: "gap-2", title: abstractTitle, authors: [], year: null, doi: null,
      observationIds: ["observation-2"], provenance: "SYSTEM_DESIGN_SUPPORT" as const,
      document: { observedUrl: "https://example.org/record", finalUrl: "https://example.org/record", sha256: sha,
        mediaType: "text/html" as const, privateArtifactPath: file, title: abstractTitle,
        passages: [{ text: abstract, locator: "html:paragraph:1", page: null }] } };
    const ops: any[] = [], entries: any[] = [];
    for (const ordinal of [1, 2]) {
      const id = randomUUID(), callId = randomUUID(), observedUrl = ordinal === 1 ? "https://example.org/manual.pdf" : retained.document.observedUrl;
      const discovery: WebDiscoveryResult = { schemaVersion: "web-discovery-result.v1", state: "COMPLETED", operationId: id,
        responseId: `response-${ordinal}`, model: "fixture", searchActionCount: 1, toolCallCount: 1,
        observations: [{ observationId: `observation-${ordinal}`, operationId: id, responseId: `response-${ordinal}`,
          toolCallId: `tool-${ordinal}`, actionType: "search", queryIfAvailable: null, observedUrl, normalizedUrl: observedUrl,
          observedTitleIfAvailable: null, observedAt: new Date().toISOString() }],
        candidates: [{ proposal: { localCandidateRef: `candidate-${ordinal}`, gapIds: [`gap-${ordinal}`], observedUrl,
          identityProposal: { title: ordinal === 1 ? title : abstractTitle, authors: [], year: null, doi: null,
            issuer: null, sourceType: "PROFESSIONAL_STANDARD_BODY" }, relevanceProposal: { role: "METHODOLOGICAL",
            gapCoverage: "Inspect design appraisal criteria", rationale: "Candidate only", uncertainty: "Inspection required" },
          accessProposal: { reportedAccessType: "UNKNOWN", reportedPdfUrl: null, alternateUrls: [] } },
          observationIds: [`observation-${ordinal}`], metadataProvenance: { observedUrl: "TOOL_OBSERVED", title: "MODEL_PROPOSED",
            authors: "UNKNOWN", year: "UNKNOWN", doi: "UNKNOWN", issuer: "UNKNOWN", sourceType: "MODEL_PROPOSED", access: "UNKNOWN" } }],
        rejectedProposals: [], usage, estimatedCostUsd: 0.1, costPolicyVersion: "fixture-policy",
        diagnostics: { toolLimit: { accepted: true }, response: { webSearchCalls: [{ id: `tool-${ordinal}`, status: "completed", actionType: "search" }] } } as any };
      const op = await prisma.paidOperation.create({ data: { id, userId: user.id, projectId: project.id,
        revision: fingerprint([bundle.contextFingerprint, bundle.intent]), requestId: `design-web:${fingerprint([job.id, ordinal])}`,
        purpose: "DESIGN_SUPPORT_MINI_RESEARCH", inputFingerprint: fingerprint(["original", ordinal]), status: "COMPLETED",
        hardCapMicros: 200000, committedMicros: 100000, resultJson: discovery as any,
        calls: { create: { id: callId, purpose: "DESIGN_SUPPORT_MINI_RESEARCH", model: "fixture", reservedMicros: 200000,
          estimatedMicros: 100000, status: "COMPLETED", usageJson: ledgerUsage,
          attributionJson: { jobId: job.id, funding: "JOB_LINKED" } } } }, include: { calls: true } });
      ops.push(op); entries.push({ id: callId, paidOperationId: id, purpose: "DESIGN_SUPPORT_MINI_RESEARCH", stage: `METHOD_COVERAGE_RESEARCH_V1_${ordinal}`,
        status: "completed", estimate: 0.1, maximum: 0.2, usage: ledgerUsage });
      const value = { source: ordinal === 1 ? null : retained, acquired: true, reason: ordinal === 1 ? "DOCUMENT_IDENTITY_UNVERIFIED" : null };
      const originalInput = fingerprint({ version: "b4.v1", jobId: job.id, inputs: { operationId: id, url: observedUrl, policy: "design-mini-research.v2" } });
      await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: `checkpoint:METHOD_COVERAGE_DOCUMENT_V1_${(ordinal - 1) * 5 + 1}`,
        status: "COMPLETED", progress: 100, inputJson: { fingerprint: originalInput },
        outputJson: { fingerprint: originalInput, value: value as any, outputHash: fingerprint(value),
          files: ordinal === 1 ? [] : [{ path: file, hash: fingerprint(await readFile(file)) }] } } });
      await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: `checkpoint:METHOD_COVERAGE_RESEARCH_V1_${ordinal}`,
        status: "COMPLETED", progress: 100, outputJson: { fingerprint: "historical", value: { intentionallyCorrupt: true }, outputHash: "invalid", files: [] } } });
    }
    await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: "control:cost", status: "COMPLETED", progress: 100, outputJson: { entries } } });
    const prior = await prisma.blueprintJobStage.findMany({ where: { jobId: job.id } });
    const validInput = { jobId: job.id, userId: user.id, projectId: project.id, intentHash: ops[0].revision, stages: prior, operations: ops };
    assert.equal(completedMethodResearchProof(validInput).length, 2);
    assert.throws(() => completedMethodResearchProof({ ...validInput, projectId: randomUUID() }), /PROVENANCE_INVALID/);
    const unknown = structuredClone(ops); unknown[0].calls[0].estimatedMicros = null;
    assert.throws(() => completedMethodResearchProof({ ...validInput, operations: unknown }), /PROVENANCE_INVALID/);
    const wrongJob = structuredClone(ops); wrongJob[0].calls[0].attributionJson.jobId = randomUUID();
    assert.throws(() => completedMethodResearchProof({ ...validInput, operations: wrongJob }), /PROVENANCE_INVALID/);
    let acquisitions = 0;
    const inspect: typeof inspectMethodSupportCandidate = args => inspectMethodSupportCandidate({ ...args, artifactRoot: root,
      acquire: async observedUrl => {
        acquisitions++;
        return { observedUrl, finalUrl: observedUrl, sha256: "b".repeat(64), mediaType: "application/pdf", title,
          passages: [{ text: substantive, locator: "pdf:page:1:paragraph:1", page: 1, contentKind: "FULL_TEXT_PASSAGE" }] };
      } });
    const execute = () => withJobExecution({ jobId: job.id, startedAt: job.startedAt!, stage: "recovery" }, () =>
      recoverCompletedMethodResearch({ userId: user.id, projectId: project.id, runId, bundle }, { inspect }));
    const recovered = await execute();
    assert.equal(recovered.researchOperations, 2); assert.equal(recovered.operations.length, 2);
    assert.equal(recovered.acquiredDocuments, 3); assert.equal(acquisitions, 1);
    assert.equal(recovered.support.length, 1); assert.equal(recovered.support[0].title, title);
    assert.equal(recovered.researchAudit[1].checkpoints[0].reason, "DOCUMENT_PROCEDURAL_SUPPORT_NOT_SUBSTANTIVE");
    assert.ok(recovered.researchAudit[1].checkpoints[0].manifest);
    const again = await execute(); assert.deepEqual(again, recovered); assert.equal(acquisitions, 1, "No second fetch from a completed inspection");
    assert.equal(await prisma.paidOperation.count({ where: { userId: user.id } }), 2, "No new discovery or payment");
    for (const row of prior) assert.deepEqual(await prisma.blueprintJobStage.findUniqueOrThrow({ where: { id: row.id } }), row,
      "Historical failed/corrupt/settled records remain byte-for-byte unchanged");
    // New inspection-version checkpoints are also recognized on subsequent job recovery.
    const modern = prior.find(row => row.stageKey === "checkpoint:METHOD_COVERAGE_DOCUMENT_V1_6")!;
    const modernInput = fingerprint({ version:"b4.v1",jobId:job.id,inputs:{operationId:ops[1].id,
      url:retained.document.observedUrl,policy:"design-mini-research.v2",inspectionPolicy:METHOD_DOCUMENT_INSPECTION_VERSION} });
    await prisma.blueprintJobStage.update({where:{id:modern.id},data:{stageKey:`${modern.stageKey}:context:${modernInput}`,
      inputJson:{fingerprint:modernInput},outputJson:{...(modern.outputJson as any),fingerprint:modernInput}}});
    const modernRecovered = await execute();
    assert.equal(modernRecovered.researchOperations,2); assert.equal(modernRecovered.acquiredDocuments,3); assert.equal(acquisitions,1);
    const denied = await inspectMethodSupportCandidate({ userId: user.id, projectId: project.id, runId, gapId: "gap",
      observedUrl: "https://example.org/wrong", expectedTitle: "Different identity", expectedDoi: null,
      question: "fixture", observationIds: [], acquire: async observedUrl => ({ observedUrl, finalUrl: observedUrl,
        sha256: "c".repeat(64), mediaType: "text/html", title, passages: [] } as SupportDocument) });
    assert.equal(denied.source, null); assert.equal(denied.acquired, true); assert.ok(denied.manifest, "Rejected acquisition retains URL/hash manifest");
    const errorManifest = { observedUrl: "https://example.org/failed", finalUrl: "https://example.org/failed", sha256: "d".repeat(64), mediaType: "text/html" };
    const failed = await inspectMethodSupportCandidate({ userId: user.id, projectId: project.id, runId, gapId: "gap",
      observedUrl: errorManifest.observedUrl, expectedTitle: title, expectedDoi: null, question: "fixture", observationIds: [],
      acquire: async () => { throw Object.assign(new Error("DOCUMENT_TEXT_UNAVAILABLE"), { documentAcquired: true, documentManifest: errorManifest }); } });
    assert.equal(failed.acquired, true); assert.deepEqual(failed.manifest, errorManifest);
    // Exact completed discovery lookup does not invoke a provider, even without credentials or preflight.
    let dispatched = 0;
    const webInput = { userId: user.id, projectId: project.id, smoke: false, purpose: "DESIGN_SUPPORT_MINI_RESEARCH" as const,
      gapSetHash: "fixed-gap", seenSetHash: "fixed-seen", researchIntentProjection: { searchIntentHash: "fixed-intent", scientificSignals: [] },
      evidenceGaps: [], seenSourceIdentities: [], policy: { maxToolCalls: 2, maxCandidates: 5, maxOutputTokens: 4096 },
      provider: { discover: async (): Promise<WebDiscoveryResult> => { dispatched++; throw new Error("Must never dispatch"); } } };
    assert.equal(await readCompletedWebDiscovery(webInput), null);
    // Build normal operation identity and settled response with an offline adapter.
    const completedInput = { ...webInput, provider: { discover: async (request: any): Promise<WebDiscoveryResult> => {
      dispatched++;
      await prisma.paidOperationCall.create({ data: { operationId: request.operationContext.operationId, purpose: "fixture",
        model: "fixture", status: "COMPLETED", reservedMicros: 100000, estimatedMicros: 100000, usageJson: usage, attributionJson: {} } });
      return { ...structuredClone(ops[0].resultJson), operationId: request.operationContext.operationId };
    } } };
    const cached = await runWebDiscoveryOperation(completedInput);
    assert.equal(dispatched, 1);
    assert.deepEqual(await readCompletedWebDiscovery(webInput), cached);
    assert.equal(dispatched, 1, "Exact completed lookup never invokes provider adapter");
    assert.equal(METHOD_DOCUMENT_INSPECTION_VERSION, "methodological-document-inspection.v2");
    console.log("method document reinspection PASS: two settled discoveries, rejected legacy acquisition recovered once, abstract downgraded, no paid rediscovery, history immutable, ownership/unknown fail-closed");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); await rm(root, { recursive: true, force: true }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
