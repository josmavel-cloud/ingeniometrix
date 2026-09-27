import assert from "node:assert/strict";
import type { StructuredObjectInput } from "@/llm/provider";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ConversationalView } from "@/lib/conversational-intake";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { buildSearchMetadata, searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { listProjectReferences } from "@/server/retrieval/reference-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test DB required");
  const user = await prisma.user.create({ data: { email: `phase2b1-${randomUUID()}@example.test`, locale: "en" } });
  const unique = randomUUID();
  const refs: string[] = [];
  let modelCalls = 0, mockedRequests = 0;
  let acceptance = false, empty = false, reviewPool = false;
  global.fetch = async request => {
    const url = new URL(String(request)); mockedRequests++;
    if (url.hostname === "api.openalex.org") return Response.json({ results: empty ? [] : reviewPool ? Array.from({length:8}, (_,i) => ({
      id:`https://openalex.org/${unique}-review-${i}`, doi:`https://doi.org/10.test/${unique}-review-${i}`,
      display_name:`Learning in digital mathematics setting ${i}`, publication_year:2020,
      abstract_inverted_index:{Feedback:[0],in:[1],digital:[2],mathematics:[3]},
    })) : [
      { id: `https://openalex.org/${unique}-positive`, doi: `https://doi.org/10.test/${unique}-positive`, display_name: "Feedback in digital mathematics",
        publication_year: 1981, type: "article", abstract_inverted_index: { Feedback: [0], in: [1], digital: [2], mathematics: [3] },
        best_oa_location: { pdf_url: "https://example.test/not-fetched.pdf" } },
      { id: `https://openalex.org/${unique}-negative`, doi: `https://doi.org/10.test/${unique}-negative`, display_name: "Livestock vaccines",
        publication_year: 2026, cited_by_count: 999999, abstract_inverted_index: { Veterinary: [0], vaccine: [1], study: [2] } },
    ] });
    if (url.hostname === "api.crossref.org" && !acceptance) return Response.json({ message: { items: [] } });
    throw new Error("UNEXPECTED_NETWORK_OR_DOCUMENT_FETCH");
  };
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: ConversationalView = (await readDefinition(user.id, project.id))!;
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const before = await prisma.projectDraft.findUniqueOrThrow({ where: { projectId: project.id } });
    const result = await searchProjectReferencesV2(user.id, project.id, await loadSearchInput(user.id, project.id), { desiredTotal: 5 }, {
      async generateStructuredObject<T>() { modelCalls++; return { terms: ["feedback", "digital mathematics"].map(text => ({ sourceField: "concepts", anchor: text, text, type: "EXACT_TERM", confidence: "HIGH" })), ambiguities: [] } as T; },
    });
    refs.push(...result.searchSnapshot.references.map(r => r.referenceId));
    assert.equal(modelCalls, 1);
    assert.equal(result.totalResults, 1, "no quota refill");
    assert.equal(result.searchSnapshot.references[0].pdfAccessible, false);
    assert.equal(result.searchSnapshot.references[0].accessStatus, "REPORTED_PDF");
    assert.equal(result.searchSnapshot.references[0].admission?.state, "ADMITTED");
    assert.equal(result.searchSnapshot.candidateAdmissions?.length, 2);
    const frozen = await prisma.auditLog.findFirstOrThrow({ where: { projectId: project.id, eventType: "SEARCH_INPUT_FROZEN" } });
    assert.equal((frozen.payloadJson as { semanticPlannerInput: { schemaVersion: string } }).semanticPlannerInput.schemaVersion, "research-planner-input.v1");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { projectId: project.id, eventType: "SEARCH_COMPLETED" } });
    const original = JSON.stringify(audit.payloadJson);
    const readsBefore = mockedRequests;
    const listed = await listProjectReferences(user.id, project.id, { languageOverride: "en" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].recommendationState, "RECOMMENDED");
    // Existing presentation includes suggested selections; Gate 2D separates
    // those from human selection. Discovery must not write that selection.
    assert.equal((await prisma.projectReference.findFirstOrThrow({ where: { projectId: project.id } })).selected, false);
    assert.equal(mockedRequests, readsBefore, "recommendation reads cannot call providers");
    assert.equal(modelCalls, 1);
    assert.equal(JSON.stringify((await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).payloadJson), original);
    assert.equal(JSON.stringify((await prisma.projectDraft.findUniqueOrThrow({ where: { projectId: project.id } })).contentJson), JSON.stringify(before.contentJson));
    acceptance = true;
    const input = await loadSearchInput(user.id, project.id);
    assert.equal(input.intent.sourceKind, "CONFIRMED_DEFINITION");
    if (input.intent.sourceKind !== "CONFIRMED_DEFINITION") throw new Error("CONFIRMED_FIXTURE_REQUIRED");
    const requestId = randomUUID();
    const searchIntentHash = fingerprint(input.intent);
    const planned = await withPaidOperation({ userId: user.id, projectId: project.id, requestId, purpose: "rc4-query-composition-plan", revision: searchIntentHash, inputs: {} }, async () => ({ searchIntentHash,
      metadata: await buildSearchMetadata(input, { async generateStructuredObject<T>() { return { terms: ["feedback", "digital mathematics"].map(text => ({ sourceField: "concepts", anchor: text, text, type: "EXACT_TERM", confidence: "HIGH" })), ambiguities: [] } as T; } }) }));
    const op = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId: user.id, requestId } } });
    const providerForbidden = { async generateStructuredObject<T>(): Promise<T> { throw new Error("PLANNER_REPLAY_FORBIDDEN"); } };
    const options = { openAlexOnlyAcceptance: { planOperationId: op.id, maxQueries: 4 } };
    const accepted = await searchProjectReferencesV2(user.id, project.id, input, options, providerForbidden);
    assert.equal(accepted.providerBreakdown.crossref, 0);
    assert.equal(accepted.attemptedQueries.length, planned.metadata.queryPack.necessaryOnly.length);
    assert.ok(accepted.searchSnapshot.candidateAdmissions?.every(c => c.inspectionMetadata));
    reviewPool = true;
    let reviewCalls = 0;
    const semantic = await searchProjectReferencesV2(user.id, project.id, input, {openAlexOnlyAcceptance:{...options.openAlexOnlyAcceptance, semanticReview:true}}, {
      async generateStructuredObject<T>(request: StructuredObjectInput) {
        reviewCalls++; assert.equal(request.schemaName, "candidate_semantic_review_v1");
        return {reviews:Array.from({length:8},(_,i)=>({candidateId:`doi:10.test/${unique}-review-${i}`, relevance:"RELEVANT",role:i%2?"METHODOLOGICAL":"DIRECT",
          matchedIntentDimensions:["concepts"], mismatches:[], confidence:"HIGH", rationale:"La informacion suministrada apoya la pertinencia.",
          evidence:[{field:"abstract",quote:"Feedback in digital mathematics"}]}))} as T;
      }
    });
    refs.push(...semantic.searchSnapshot.references.map(r=>r.referenceId));
    assert.equal(reviewCalls,1); assert.equal(semantic.totalResults,8,"admission is not a five-source quota");
    assert.equal(semantic.searchSnapshot.semanticReview?.status,"COMPLETED");
    const beforeReviewReads=mockedRequests;
    assert.equal((await listProjectReferences(user.id,project.id)).length,8,"validated semantic admission survives read/list boundary");
    assert.equal(mockedRequests,beforeReviewReads); assert.equal(reviewCalls,1);
    assert.equal(await prisma.projectReference.count({where:{projectId:project.id,selected:true}}),0);
    assert.equal(JSON.stringify((await prisma.auditLog.findUniqueOrThrow({where:{id:audit.id}})).payloadJson),original);
    reviewPool = false;
    empty = true;
    const zero = await searchProjectReferencesV2(user.id, project.id, input, options, providerForbidden);
    assert.equal(zero.totalResults, 0, "zero OpenAlex cannot invoke Crossref or pad quota");
    const beforeInvalid = mockedRequests;
    await assert.rejects(searchProjectReferencesV2(user.id, project.id, input, { openAlexOnlyAcceptance: { planOperationId: op.id, maxQueries: 5 } }), /INVALID_ACCEPTANCE_LIMIT/);
    await assert.rejects(searchProjectReferencesV2(user.id, project.id, input, { openAlexOnlyAcceptance: { planOperationId: "missing", maxQueries: 4 } }), /STALE_OR_UNAUTHORIZED/);
    await assert.rejects(searchProjectReferencesV2(user.id, project.id, { ...input, intent: { ...input.intent, definitionHash: "changed" } }, options), /STALE_OR_UNAUTHORIZED/);
    assert.equal(mockedRequests, beforeInvalid);
    await assert.rejects(searchProjectReferencesV2(user.id, project.id, input, undefined, {
      async generateStructuredObject<T>() { return { terms: ["feedback", "digital mathematics"].map(text => ({ sourceField: "concepts", anchor: text, text, type: "EXACT_TERM", confidence: "HIGH", scientificRole: "QUALIFIER", language: "en" })), ambiguities: [] } as T; },
    }), /SEARCH_NEEDS_CLARIFICATION/);
    assert.equal(mockedRequests, beforeInvalid, "invalid scientific roles stop the canonical path before providers");
    console.log("PASS OpenAlex-only acceptance: completed plan reuse, no planner replay, empty result cannot fall back, owner/hash/limit guards, inspection metadata retained");
    console.log("PASS 2B1 canonical mocked path: confirmed input -> one simulated planner -> mock records -> score -> admission -> diversity -> persistence -> read; draft/history unchanged; no real network");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
