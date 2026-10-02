import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { emptyDefinition, searchIntent, userValue, type DefinitionField } from "@/lib/conversational-intake";
import { fallbackSearchEnrichment, semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { chooseSafeSearchPlan } from "@/lib/search-planning-outcome";
import { referenceDisplayText } from "@/lib/reference-display-text";
import { shouldRunAutomaticAstra } from "@/server/retrieval/source-sufficiency-controller";
import { withPaidOperation, reservePreJobCall } from "@/server/mvp/pre-job-budget";
import { prisma } from "@/lib/prisma";
import { assertInternalGenerationAuthorization, INTERNAL_GENERATION_POLICY } from "@/server/commercial/internal-generation";
import { enqueueReferenceDisplayJobs } from "@/server/retrieval/reference-display-jobs";
import { enqueueBlueprintJobForUser } from "@/server/blueprint-v2/jobs/blueprint-job-service";

global.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_RELIABILITY_TEST"); };

function syntheticIntent(topic: string, object: string, concepts: string) {
  const definition = emptyDefinition();
  for (const [field, value] of Object.entries({ topic, object, concepts, problem: `Limited evidence about ${topic}` }))
    definition.fields[field as DefinitionField] = userValue(value, 1, "synthetic-test");
  return searchIntent("synthetic-project", 1, "synthetic-definition", definition);
}

async function main() {
  for (const [topic, object, concepts] of [
    ["Resilience of public transport", "A representative urban transit system, defined by service frequency, accessibility and network coverage", "resilience; urban transit"],
    ["Digital feedback in learning", "secondary school learning activities", "digital feedback; learning"],
    ["Therapeutic adherence", "outpatient care pathways", "adherence; outpatient care"],
    ["Collective memory", "oral histories from migration communities", "collective memory; oral history"],
    ["Small enterprise governance", "family-owned enterprise decision systems", "governance; enterprise"],
    ["Literary translation and reception", "nineteenth-century literary translations", "literary translation; reception"],
  ]) {
    const frozen = syntheticIntent(topic, object, concepts);
    const input = semanticPlannerInput(frozen, `synthetic-${topic}`);
    let selected: ReturnType<typeof chooseSafeSearchPlan>;
    try { selected = chooseSafeSearchPlan(input, fallbackSearchEnrichment(input)); }
    catch (error) { throw new Error(`Synthetic ${topic}: ${error instanceof Error ? error.message : "invalid"}`); }
    assert(selected.pack.plannedQueries?.length, `fallback must retain an executable query for ${topic}`);
    assert.equal(input.signals.find(signal => signal.sourceField === "object")?.value, object);
  }
  assert.equal(referenceDisplayText("Water &amp; soil"), "Water & soil");
  assert.equal(referenceDisplayText("<jats:p>Alpha &amp; beta <jats:italic>x</jats:italic></jats:p>"), "Alpha & beta x");
  assert.equal(referenceDisplayText("&lt;jats:p&gt;Alpha &amp;amp; beta&lt;/jats:p&gt;"), "Alpha & beta");
  assert.equal(referenceDisplayText("<script>secret</script>Safe <math><mi>x</mi><mo>+</mo><mi>y</mi></math>"), "Safe x+y");
  assert.equal(shouldRunAutomaticAstra(2, true, true), true);
  assert.equal(shouldRunAutomaticAstra(3, true, true), false);
  assert.equal(shouldRunAutomaticAstra(2, false, true), false);
  assert.equal(shouldRunAutomaticAstra(2, true, false), false);

  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55440");
  assert.equal(url.pathname, "/imx_reliability_20261001");
  const owner = await prisma.user.create({ data: { email: `reliability-${randomUUID()}@example.test` } });
  const stranger = await prisma.user.create({ data: { email: `reliability-other-${randomUUID()}@example.test` } });
  const project = await prisma.project.create({ data: { userId: owner.id, title: "Synthetic reliability project", degreeLevel: "MAESTRIA" } });
  const refs: string[] = [];
  try {
    await prisma.intake.create({ data: { projectId: project.id, topic: "Synthetic reliability study" } });
    const fundingFixture = await prisma.reference.create({ data: { title: "Estudio sintético de fiabilidad",
      normalizedTitle: "estudio sintetico de fiabilidad", abstract: "Resumen real de una publicación sintética.",
      authorsJson: [], rawCrossrefJson: { language: "es" } } });
    refs.push(fundingFixture.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: fundingFixture.id,
      sourceProvider: "SYSTEM", selected: true, selectedOrder: 1 } });
    const requestId = `source-sufficiency:${randomUUID()}`;
    const operation = { userId: owner.id, projectId: project.id, requestId, purpose: "SOURCE_SUFFICIENCY",
      revision: "synthetic-intent", inputs: { searchIntentHash: "synthetic-intent", policyVersion: "synthetic-test" } };
    await assert.rejects(withPaidOperation(operation, async () => {
      const ticket = await reservePreJobCall("research_search_enrichment_roles_v2", "synthetic-model", 0.01);
      await ticket.complete(0.002, { input_tokens: 10, output_tokens: 10 });
      throw new Error("QUERY_PLAN_INVALID");
    }), /QUERY_PLAN_INVALID/);
    const original = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId: owner.id, requestId } } });
    assert.equal(original.status, "FAILED");
    let attempts = 0;
    const recover = () => withPaidOperation({ ...operation,
      recoverFailed: { version: "source-sufficiency-fallback.v2", completedCallPurposes: ["research_search_enrichment_roles_v2"] } }, async () => {
      attempts++;
      return { providerReachable: true, partialResultsPreserved: true };
    });
    const simultaneous = await Promise.allSettled([recover(), recover()]);
    assert(simultaneous.some(result => result.status === "fulfilled"));
    assert.equal(attempts, 1);
    assert.deepEqual(await recover(), { providerReachable: true, partialResultsPreserved: true });
    assert.equal(attempts, 1);
    assert.equal((await prisma.paidOperation.findUniqueOrThrow({ where: { id: original.id } })).status, "FAILED");
    assert.equal(await prisma.paidOperationCall.count({ where: { operationId: original.id } }), 1);

    const uncertainId = `source-sufficiency:${randomUUID()}`;
    const uncertain = { ...operation, requestId: uncertainId };
    await assert.rejects(withPaidOperation(uncertain, async () => {
      await reservePreJobCall("research_search_enrichment_roles_v2", "synthetic-model", 0.01);
      throw new Error("UNCERTAIN_PROVIDER_RESULT");
    }), /UNCERTAIN_PROVIDER_RESULT/);
    await assert.rejects(recoverFailed(uncertain), /USAGE_RECONCILIATION_REQUIRED/);
    async function recoverFailed(input: typeof operation) {
      return withPaidOperation({ ...input, recoverFailed: { version: "source-sufficiency-fallback.v2",
        completedCallPurposes: ["research_search_enrichment_roles_v2"] } }, async () => ({ unsafe: true }));
    }
    await assert.rejects(withPaidOperation({ ...operation, userId: stranger.id }, async () => null), /PROJECT_NOT_FOUND/);

    const grant = await prisma.internalGenerationCapability.create({ data: { userId: owner.id,
      grantKey: `synthetic:${randomUUID()}`, issuedBy: "isolated-test", reason: "regression" } });
    const job = await enqueueBlueprintJobForUser(owner.id, project.id);
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } }).then(row =>
      (row.metadataJson as { commercialPolicy: string }).commercialPolicy)), INTERNAL_GENERATION_POLICY);
    assert.equal((await prisma.$transaction(tx => assertInternalGenerationAuthorization(tx, job.id))), 3);
    await prisma.internalGenerationCapability.update({ where: { id: grant.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedBy: "isolated-test" } });
    await assert.rejects(prisma.$transaction(tx => assertInternalGenerationAuthorization(tx, job.id)), /CAPABILITY_REQUIRED/);

    const spanish = await prisma.reference.create({ data: { title: "Análisis de sistemas de transporte", normalizedTitle: "analisis de sistemas de transporte",
      abstract: "Un estudio de transporte público en ciudades.", authorsJson: [], rawCrossrefJson: { language: "es" } } });
    const english = await prisma.reference.create({ data: { title: "Digital learning and public engagement", normalizedTitle: "digital learning and public engagement",
      abstract: "The study compares methods and outcomes in public education.", authorsJson: [], rawOpenAlexJson: { language: "en" } } });
    refs.push(spanish.id, english.id);
    for (const referenceId of [spanish.id, english.id])
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId, sourceProvider: "SYSTEM" } });
    const queued = await enqueueReferenceDisplayJobs(owner.id, project.id);
    assert.equal(queued.length, 1);
    assert.equal((await enqueueReferenceDisplayJobs(owner.id, project.id)).length, 1);
    assert.equal(await prisma.referenceDisplayJob.count({ where: { projectId: project.id } }), 1);
    await assert.rejects(enqueueReferenceDisplayJobs(stranger.id, project.id), /PROJECT_NOT_FOUND/);
    console.log("PASS reliability: six fields, long object, safe text, Astra gating, failed paid recovery, unknown-usage block, owner capability, translation queue; provider calls=0");
  } finally {
    await prisma.referenceDisplayJob.deleteMany({ where: { projectId: project.id } });
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: owner.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } });
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Reliability test failed"); process.exitCode = 1; });
