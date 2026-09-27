import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ConversationalView } from "@/lib/conversational-intake";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";
import { listProjectReferences } from "@/server/retrieval/reference-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test DB required");
  const user = await prisma.user.create({ data: { email: `phase2b1-${randomUUID()}@example.test`, locale: "en" } });
  const unique = randomUUID();
  const refs: string[] = [];
  let modelCalls = 0, mockedRequests = 0;
  global.fetch = async request => {
    const url = new URL(String(request)); mockedRequests++;
    if (url.hostname === "api.openalex.org") return Response.json({ results: [
      { id: `https://openalex.org/${unique}-positive`, doi: `https://doi.org/10.test/${unique}-positive`, display_name: "Feedback in digital mathematics",
        publication_year: 1981, type: "article", abstract_inverted_index: { Feedback: [0], in: [1], digital: [2], mathematics: [3] },
        best_oa_location: { pdf_url: "https://example.test/not-fetched.pdf" } },
      { id: `https://openalex.org/${unique}-negative`, doi: `https://doi.org/10.test/${unique}-negative`, display_name: "Livestock vaccines",
        publication_year: 2026, cited_by_count: 999999, abstract_inverted_index: { Veterinary: [0], vaccine: [1], study: [2] } },
    ] });
    if (url.hostname === "api.crossref.org") return Response.json({ message: { items: [] } });
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
    console.log("PASS 2B1 canonical mocked path: confirmed input -> one simulated planner -> mock records -> score -> admission -> diversity -> persistence -> read; draft/history unchanged; no real network");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
