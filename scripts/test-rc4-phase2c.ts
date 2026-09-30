import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ConversationalView } from "@/lib/conversational-intake";
import { prisma } from "@/lib/prisma";
import type { StructuredObjectInput } from "@/llm/provider";
import { createConversationalProject, changeDefinition, confirmDefinition, readDefinition,
  readConfirmedSearchIntent } from "@/server/projects/conversational-definition-service";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { searchProjectReferencesV2, getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { updateSelectedProjectReferences, listProjectReferences } from "@/server/retrieval/reference-service";
import { ownedPageData } from "@/server/hybrid/page-data";
import { normalizeScholarlyDoi, providerQueryHash, renderCrossrefFamily, sameScientificWork,
  selectProviderQueries } from "@/server/retrieval/provider-query-policy";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test database required");
  assert.equal(normalizeScholarlyDoi("https://doi.org/10.X/AbC"), "10.x/abc");
  assert.equal(sameScientificWork({ doi: "10.X/a", title: "One paper", year: 2020, authors: ["A"] },
    { doi: "https://doi.org/10.x/A", title: "Another title", year: 2021, authors: ["B"] }), true);
  assert.equal(sameScientificWork({ doi: "10.X/a", title: "One paper", year: 2020, authors: ["A"], workType: "preprint" },
    { doi: "10.X/a", title: "One paper", year: 2020, authors: ["A"], workType: "journal-article" }), false);
  assert.equal(sameScientificWork({ doi: null, title: "A study of digital mathematics", year: 2020, authors: ["A"], workType: "preprint" },
    { doi: null, title: "A study of digital mathematics", year: 2020, authors: ["A"], workType: "journal-article" }), false);
  assert.equal(sameScientificWork({ doi: null, title: "A study of digital mathematics", year: 2020, authors: ["A"] },
    { doi: null, title: "A study of digital mathematics", year: 2020, authors: ["B"] }), false);
  const families = [{ id: "q1", family: "CORE_PHENOMENON", query: "first" },
    { id: "q2", family: "CONTEXTUAL_OR_LOCAL", query: "second" }] as never;
  const initial = selectProviderQueries({ batchKind: "initial", planHash: "plan", families, filters: ["is_retracted:false"], prior: [] });
  assert.deepEqual(initial.map(q => q.renderedQuery), ["first", "second"]);
  const prior = initial.map(q => ({ ...q, queryHash: providerQueryHash("plan", q), executedAt: "now",
    resultCount: 1, newCandidateCount: 1, cacheHit: false, errorCategory: null }));
  const more = selectProviderQueries({ batchKind: "more", planHash: "plan", families, filters: ["is_retracted:false"], prior });
  assert.deepEqual(more.map(q => q.page), [2, 2]);
  assert.equal(selectProviderQueries({ batchKind: "more", planHash: "plan", families, filters: ["is_retracted:false"],
    prior: [...prior, ...more.map(q => ({ ...q, queryHash: providerQueryHash("plan", q), executedAt: "now",
      resultCount: 0, newCandidateCount: 0, cacheHit: false, errorCategory: null }))] }).length, 0);

  const user = await prisma.user.create({ data: { email: `phase2c-${randomUUID()}@example.test` } });
  const unique = randomUUID();
  let openAlexCalls = 0, crossrefCalls = 0, plannerCalls = 0, reviewCalls = 0;
  let failProviders = false;
  const work = (suffix: string) => ({ id: `https://openalex.org/${unique}-${suffix}`,
    doi: `https://doi.org/10.test/${unique}-${suffix}`, display_name: `Feedback in digital mathematics ${suffix}`,
    publication_year: 2020, type: "article", authorships: [{ author: { display_name: "Researcher Example" } }],
    abstract_inverted_index: { Feedback: [0], in: [1], digital: [2], mathematics: [3] } });
  const originalFetch = global.fetch;
  global.fetch = async request => {
    const url = new URL(String(request));
    if (url.hostname === "api.openalex.org") {
      openAlexCalls++;
      if (failProviders) return new Response("unavailable", { status: 429, headers: { "retry-after": "20" } });
      return Response.json({ results: url.searchParams.get("page") === "2" ? [work("page2")] : [work("page1")] });
    }
    if (url.hostname === "api.crossref.org") {
      crossrefCalls++;
      if (failProviders) return new Response("unavailable", { status: 503 });
      assert.ok(!url.searchParams.get("query.bibliographic")?.includes(" AND "), "Crossref has provider-specific rendering");
      return Response.json({ message: { items: [{ DOI: `10.test/${unique}-page1`, title: ["Feedback in digital mathematics page1"],
        author: [{ given: "Researcher", family: "Example" }], issued: { "date-parts": [[2020]] }, type: "journal-article" },
      { DOI: `10.test/${unique}-crossref`, title: ["Feedback in digital mathematics crossref"],
        abstract: "<p>Feedback in digital mathematics.</p>", author: [{ given: "Researcher", family: "Example" }],
        issued: { "date-parts": [[2020]] }, type: "journal-article" },
      { DOI: `10.test/${unique}-negative`, title: ["Livestock vaccines"], abstract: "<p>Veterinary vaccine production.</p>",
        author: [{ given: "Researcher", family: "Example" }], issued: { "date-parts": [[2026]] },
        "is-referenced-by-count": 100000, type: "journal-article", link: [{ URL: "https://example.test/negative.pdf", "content-type": "application/pdf" }] }] } });
    }
    throw new Error("UNEXPECTED_EXTERNAL_CALL");
  };
  const provider = { async generateStructuredObject<T>(request: StructuredObjectInput): Promise<T> {
    if (request.schemaName === "candidate_semantic_review_v2") {
      reviewCalls++;
      const batch = JSON.parse(request.prompt.split("CANDIDATES AND EVIDENCE UNITS:\n")[1]) as Array<{candidateId:string;evidenceUnits:Array<{evidenceId:string}>}>;
      return { reviews: batch.map(candidate => ({ candidateId: candidate.candidateId, relevance: "RELEVANT", role: "DIRECT",
        matchedIntentDimensions: ["concepts"], mismatches: [], confidence: "HIGH", rationale: "The title is pertinent.",
        supportingEvidenceIds: [candidate.evidenceUnits[0].evidenceId], mismatchEvidenceIds: [] })) } as T;
    }
    plannerCalls++;
    return { terms: ["feedback", "digital mathematics"].map((text, index) => ({ sourceField: "concepts", anchor: text,
      text, type: "EXACT_TERM", confidence: "HIGH", scientificRole: index ? "CORE_CONCEPT" : "PHENOMENON", language: "en" })), ambiguities: [] } as T;
  } };
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation",
      idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: ConversationalView = (await readDefinition(user.id, project.id))!;
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const input = await loadSearchInput(user.id, project.id);
    const first = await searchProjectReferencesV2(user.id, project.id, input, { batchKind: "initial" }, provider);
    assert.equal(plannerCalls, 1);
    assert.ok(first.searchSnapshot.executedQueries?.length);
    const reusedInitial = await searchProjectReferencesV2(user.id, project.id, input, { batchKind: "initial" });
    assert.deepEqual(reusedInitial.attemptedQueries, [], "unchanged initial search reuses its completed result");
    assert.equal(plannerCalls, 1);
    assert.equal(openAlexCalls, 1);
    const callsBeforeCache = openAlexCalls;
    const repeated = await searchProjectReferencesV2(user.id, project.id, input, { batchKind: "initial" }, provider);
    assert.equal(openAlexCalls, callsBeforeCache, "same successful provider query must use the bounded cache");
    assert.ok((repeated.searchSnapshot.cacheHits ?? 0) > 0);
    await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, actorType: "SYSTEM", eventType: "SEARCH_COMPLETED",
      payloadJson: JSON.parse(JSON.stringify({ referenceSearchVersion: "v2", searchSnapshot: {
        ...first.searchSnapshot, executedQueries: undefined, attemptedQueries: ["UNRELATED HISTORICAL QUERY"] } })) } });
    const query = first.searchSnapshot.metadata.queryPack.plannedQueries![0];
    const renderedCrossref = renderCrossrefFamily(query, first.searchSnapshot.metadata.queryPack.conceptPlan!);
    assert.ok(renderedCrossref.includes("feedback") && !renderedCrossref.includes(" AND "));
    const firstId = first.searchSnapshot.references[0].referenceId;
    await updateSelectedProjectReferences(user.id, project.id, [firstId]);
    const afterSelection = await prisma.projectDraft.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.equal(afterSelection.confirmedRevision, view.revision);
    assert.ok(afterSelection.revision > view.revision);
    assert.equal((await loadSearchInput(user.id, project.id)).intent.definitionHash, input.intent.definitionHash);
    assert.equal((await readConfirmedSearchIntent(user.id, project.id)).definitionHash, input.intent.definitionHash);
    assert.equal((await getLatestProjectReferenceSearchSnapshot(project.id))?.stale, false);
    const page = await ownedPageData(user.id, "detail", project.id) as { project: { definitionConfirmed: boolean } };
    assert.equal(page.project.definitionConfirmed, true, "selection cannot hide a confirmed Sources project");
    const beforeMorePlanner = plannerCalls;
    failProviders = true;
    const retryInput = await loadSearchInput(user.id, project.id);
    await assert.rejects(() => searchProjectReferencesV2(user.id, project.id, retryInput,
      { batchKind: "more" }, provider));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status, "SOURCES_REVIEW",
      "failed MORE must leave SEARCHING and remain retryable");
    failProviders = false;
    const second = await searchProjectReferencesV2(user.id, project.id, await loadSearchInput(user.id, project.id),
      { batchKind: "more" }, provider);
    assert.equal(plannerCalls, beforeMorePlanner, "MORE must reuse the semantic plan");
    assert.ok(second.searchSnapshot.executedQueries?.some(q => q.page === 2));
    assert.ok(second.searchSnapshot.executedQueries?.filter(q => q.page === 1).every(q => q.executedAt !== undefined));
    assert.ok(second.searchSnapshot.executedQueries?.every(q => q.renderedQuery !== "UNRELATED HISTORICAL QUERY"));
    assert.ok(second.searchSnapshot.references.some(r => r.referenceId === firstId));
    assert.equal((await prisma.projectReference.findFirstOrThrow({ where: { projectId: project.id, referenceId: firstId } })).selected, true);
    const listed = await listProjectReferences(user.id, project.id);
    assert.ok(listed.some(item => item.referenceId === firstId && item.selected));
    const third = await searchProjectReferencesV2(user.id, project.id, await loadSearchInput(user.id, project.id),
      { batchKind: "more" }, provider);
    assert.equal(plannerCalls, beforeMorePlanner);
    assert.equal(crossrefCalls, 2, "one Crossref attempt per MORE; failed calls are not cached as zero results");
    assert.ok(third.searchSnapshot.executedQueries?.some(q => q.provider === "CROSSREF"));
    assert.equal(third.searchSnapshot.discoveryObservations?.filter(o => o.provider === "CROSSREF").length, 3);
    assert.ok(third.searchSnapshot.candidateAdmissions?.some(item => item.title === "Livestock vaccines" && item.admission.state !== "ADMITTED"),
      "Crossref popularity/PDF cannot bypass relevance admission");
    const enrichedOriginal = await prisma.reference.findUniqueOrThrow({ where: { id: firstId } });
    assert.ok(enrichedOriginal.rawOpenAlexJson && enrichedOriginal.rawCrossrefJson,
      "one selected scientific work retains both provider representations");
    assert.equal((await prisma.projectReference.findFirstOrThrow({ where: { projectId: project.id, referenceId: firstId } })).selected, true);
    const fourth = await searchProjectReferencesV2(user.id, project.id, await loadSearchInput(user.id, project.id),
      { batchKind: "more" }, provider);
    assert.equal(fourth.searchSnapshot.resultState, "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN");
    assert.equal(crossrefCalls, 2);
    assert.ok(openAlexCalls <= 3, "no repeated OpenAlex page-one query");
    const unchangedAudit = await prisma.auditLog.count({ where: { projectId: project.id, eventType: "SOURCE_PROVIDER_QUERY_COMPLETED" } });
    assert.equal(unchangedAudit, openAlexCalls + crossrefCalls - 2, "failed provider responses are never cached");
    const editView = (await readDefinition(user.id, project.id))!;
    await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: editView.revision, etag: editView.etag,
      action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics; teacher training", knowledge: "KNOWN" } });
    await assert.rejects(() => loadSearchInput(user.id, project.id), /DEFINITION_CONFIRMATION_REQUIRED/,
      "a genuine research edit must invalidate the confirmed SearchIntent");
    console.log(`PASS 2C: planner calls=${plannerCalls}, review calls=${reviewCalls}, OpenAlex=${openAlexCalls}, Crossref=${crossrefCalls}; selection/definition stable, MORE advances, exhausted state honest`);
  } finally {
    global.fetch = originalFetch;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
