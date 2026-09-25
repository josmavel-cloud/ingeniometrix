import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import { draftIntakeFrom } from "@/lib/project-draft-contract";
import { classifyPlanSourceDisposition } from "@/server/mvp/job-execution-context";
import { listBlueprintVersionsForUser, setActiveBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { createProjectForUser, getProjectForUser } from "@/server/projects/project-service";
import { readProjectDraft, saveProjectDraft } from "@/server/projects/project-draft-service";
import { parseCreateProjectInput } from "@/server/projects/project-validation";
import { listTopicAreaSuggestions, resolveAcademicField } from "@/server/projects/topic-area-service";

const emptyJson = {};

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) {
    throw new Error("RC4 isolated DB required");
  }
  global.fetch = async () => { throw new Error("No network allowed"); };

  const conceptCountBefore = await prisma.taxonomyConcept.count({ where: { scheme: { code: "FORD-2015" } } });
  assert.ok(conceptCountBefore >= 48, "The versioned FORD catalog must be seeded");
  const civil = await resolveAcademicField({ topicAreaLabel: "Ingenieria Civil" });
  assert.equal(civil?.canonicalAreaId, "2.1");
  assert.equal(civil?.taxonomyVersion, "2015-table-2.2-es-latam-v1");
  const electronicAlias = await resolveAcademicField({ topicAreaLabel: "ingeniería electrónica" });
  assert.equal(electronicAlias?.canonicalAreaId, "2.2");
  const exactCode = await resolveAcademicField({ topicAreaId: "5.3", topicAreaLabel: "Economia" });
  assert.equal(exactCode?.canonicalAreaId, "5.3");
  const hierarchy = await listTopicAreaSuggestions("ingenieria");
  assert.ok(hierarchy.some((item) => item.canonicalAreaId === "2.1" && item.parentCode === "2"));
  const custom = await resolveAcademicField({ topicAreaLabel: "Estudios anfibios interplanetarios" });
  assert.equal(custom?.resolutionStatus, "CUSTOM_UNRESOLVED");
  assert.equal(await prisma.taxonomyConcept.count({ where: { scheme: { code: "FORD-2015" } } }), conceptCountBefore, "Free text cannot mutate the canonical catalog");

  const owner = await prisma.user.create({ data: { email: `rc4-g2-owner-${Date.now()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `rc4-g2-other-${Date.now()}@example.test` } });
  let historicalProjectId: string | null = null;
  try {
    const input = parseCreateProjectInput({
      title: "Resiliencia de infraestructura urbana",
      customIdeaText: "Resiliencia de infraestructura urbana",
      degreeLevel: "PREGRADO",
      country: "PE",
      program: "Investigación de pregrado",
      language: "es",
      topicAreaId: "2.1",
      topicAreaLabel: "Ingeniería Civil",
    });
    assert.equal(input.university, undefined);
    const project = await createProjectForUser(owner.id, input);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { knowledgeFields: true } });
    assert.equal(stored.university, null, "University is optional and remains null");
    assert.equal(stored.knowledgeFields[0]?.resolutionStatus, "CANONICAL");

    const customProject = await createProjectForUser(owner.id, parseCreateProjectInput({
      title: "Proyecto interdisciplinario",
      customIdeaText: "Proyecto interdisciplinario",
      degreeLevel: "PROYECTO_INVESTIGACION",
      country: "CO",
      program: "Proyecto de investigación",
      language: "es",
      topicAreaLabel: "Estudios anfibios interplanetarios",
    }));
    const customField = await prisma.projectKnowledgeField.findFirstOrThrow({ where: { projectId: customProject.id, isPrimary: true } });
    assert.equal(customField.conceptId, null);
    assert.equal(customField.resolutionStatus, "CUSTOM_UNRESOLVED");

    const draft0 = await readProjectDraft(owner.id, project.id);
    const draft1 = await saveProjectDraft(owner.id, project.id, draft0.revision, {
      ...draft0.intake,
      problemContext: "Problema original congelable",
      researchScope: "Lima Metropolitana",
      constructs: "resiliencia; continuidad",
      pendingDecisions: "Confirmar unidad de análisis",
    }, draft0.etag);
    const version1 = await prisma.blueprintVersion.create({ data: {
      projectId: project.id,
      versionNumber: 1,
      model: "offline-fixture",
      promptVersion: "offline-fixture.v1",
      intakeSnapshotJson: draft1.intake,
      selectedReferencesSnapshotJson: [],
      blueprintJson: { title: "Plan V1", problem: draft1.intake.problemContext },
      coherenceReportJson: emptyJson,
      originatingDraftRevision: draft1.revision,
      generationManifestJson: { fixture: true },
    } });
    await prisma.project.update({ where: { id: project.id }, data: { activeBlueprintVersionId: version1.id } });
    const draft2 = await saveProjectDraft(owner.id, project.id, draft1.revision, { ...draft1.intake, problemContext: "Problema revisado para una nueva versión" }, draft1.etag);
    const frozenV1 = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: version1.id } });
    assert.equal((frozenV1.intakeSnapshotJson as { problemContext: string }).problemContext, "Problema original congelable");
    await assert.rejects(() => prisma.blueprintVersion.update({ where: { id: version1.id }, data: { blueprintJson: { title: "overwrite" } } }), /immutable/);
    const version2 = await prisma.blueprintVersion.create({ data: {
      projectId: project.id,
      versionNumber: 2,
      model: "offline-fixture",
      promptVersion: "offline-fixture.v1",
      intakeSnapshotJson: draft2.intake,
      selectedReferencesSnapshotJson: [],
      blueprintJson: { title: "Plan V2", problem: draft2.intake.problemContext },
      coherenceReportJson: emptyJson,
      originatingDraftRevision: draft2.revision,
      userLabel: "Versión revisada",
      generationManifestJson: { fixture: true },
    } });
    const versions = await listBlueprintVersionsForUser(owner.id, project.id);
    assert.deepEqual(versions.map((item) => item.versionNumber), [2, 1]);
    await setActiveBlueprintVersionForUser(owner.id, project.id, version2.id);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).activeBlueprintVersionId, version2.id);
    await assert.rejects(() => setActiveBlueprintVersionForUser(other.id, project.id, version1.id), /no encontrada/);
    await assert.rejects(() => readProjectDraft(other.id, project.id), /PROJECT_NOT_FOUND/);

    assert.equal(classifyPlanSourceDisposition({ hasEvidenceCard: true }), "USED");
    assert.equal(classifyPlanSourceDisposition({ hasEvidenceCard: false, materializationStatus: "UNUSABLE" }), "REJECTED_AFTER_INSPECTION");
    assert.equal(classifyPlanSourceDisposition({ hasEvidenceCard: false, materializationStatus: "ABSTRACT_AVAILABLE" }), "CONSIDERED_NOT_USED");

    const historical = await prisma.project.create({ data: { userId: owner.id, title: "Proyecto histórico", program: "Maestría", university: "UPC", degreeLevel: "MAESTRIA", intake: { create: draftIntakeFrom({ topic: "Tema histórico" }) } } });
    historicalProjectId = historical.id;
    assert.equal((await getProjectForUser(owner.id, historical.id))?.university, "UPC");

    const [projectPage, workflowNav, createForm] = await Promise.all([
      readFile("app/projects/[id]/page.tsx", "utf8"),
      readFile("components/projects/workflow-stage-nav.tsx", "utf8"),
      readFile("components/projects/create-project-form.tsx", "utf8"),
    ]);
    for (const label of ["Define tu investigación", "Evidencia", "Plan de tesis"]) assert.ok(projectPage.includes(label));
    assert.ok(projectPage.includes('query.step === "idea"'), "Historical Idea URL remains compatible");
    assert.ok(workflowNav.includes("sm:grid-cols-4"));
    assert.ok(!createForm.includes("Ajustes opcionales"));
    assert.ok(!createForm.includes("project-university"));

    console.log("PASS RC4 G2: FORD taxonomy, optional university, custom mapping, resumable revisions, immutable multi-version plans, owner isolation, three visible steps with historical Idea compatibility, source terminal states; paid calls=0.");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
