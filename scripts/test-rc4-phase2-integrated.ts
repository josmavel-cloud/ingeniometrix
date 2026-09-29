import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import type { ConversationalView } from "@/lib/conversational-intake";
import { normalizeTitle } from "@/lib/text";
import { createConversationalProject, changeDefinition, confirmDefinition, readDefinition } from
  "@/server/projects/conversational-definition-service";
import { updateSelectedProjectReferences, listProjectReferences } from "@/server/retrieval/reference-service";
import { prepareSelectedSources } from "@/server/projects/source-preparation-service";
import { confirmEvidenceSet, evidenceSourcePoolVersion, evaluateEvidenceSetReadiness } from "@/server/projects/evidence-set-service";
import { publicAddress, safeDocumentUrl } from "@/server/retrieval/safe-document-fetch";
import { prepareUploadedPdf, removeUploadedPdf } from "@/server/projects/uploaded-pdf-source-service";
import { PrivateFileArtifactStore } from "@/server/storage/artifact-store";

if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/imx_b4_validation_rc4") throw new Error("ISOLATED_TEST_DB_REQUIRED");
const previousFetch = global.fetch;
global.fetch = async () => { throw new Error("EXTERNAL_PROVIDER_CALL_FORBIDDEN"); };

async function main() {
  assert.throws(() => safeDocumentUrl("http://127.0.0.1/private"), /DOCUMENT_URL_UNSAFE/);
  assert.throws(() => safeDocumentUrl("file:///etc/passwd"), /DOCUMENT_URL_UNSAFE/);
  assert.equal(publicAddress("10.1.1.1", 4), false);
  assert.equal(publicAddress("127.0.0.1", 4), false);
  assert.equal(publicAddress("8.8.8.8", 4), true);
  assert.equal(evaluateEvidenceSetReadiness({ sources: [{ evidenceLevel: "FULL_TEXT_MATERIALIZED",
    identityStatus: "matched", preparationStatus: "PREPARED_FULL_TEXT" }], unresolvedMaterialGaps: 0,
    pendingUploads: 0 }).readiness, "READY");
  assert.equal(evaluateEvidenceSetReadiness({ sources: [{ evidenceLevel: "ABSTRACT_AVAILABLE",
    identityStatus: "unknown", preparationStatus: "PREPARED_ABSTRACT" }, { evidenceLevel: "METADATA_ONLY",
    identityStatus: "unknown", preparationStatus: "METADATA_ONLY" }], unresolvedMaterialGaps: 1,
    pendingUploads: 1 }).readiness, "READY_WITH_LIMITATIONS");
  assert.equal(evaluateEvidenceSetReadiness({ sources: [{ evidenceLevel: "UNKNOWN",
    identityStatus: "mismatch", preparationStatus: "IDENTITY_REVIEW_REQUIRED" }], unresolvedMaterialGaps: 0,
    pendingUploads: 0 }).readiness, "BLOCKED");
  for (const discipline of ["engineering", "education", "qualitative social science", "health", "humanities"]) {
    assert.equal(evaluateEvidenceSetReadiness({ sources: [{ evidenceLevel: "ABSTRACT_AVAILABLE",
      identityStatus: "unknown", preparationStatus: "PREPARED_ABSTRACT" }], unresolvedMaterialGaps: 0,
      pendingUploads: 0 }).readiness, "READY", `readiness must be discipline-independent: ${discipline}`);
  }

  const user = await prisma.user.create({ data: { email: `phase2-full-${randomUUID()}@example.test` } });
  const references: string[] = [];
  const temporary = await mkdtemp(path.join(os.tmpdir(), "imx-phase2-fixture-"));
  const previousStorageRoot = process.env.IMX_PRIVATE_STORAGE_ROOT;
  process.env.IMX_PRIVATE_STORAGE_ROOT = path.join(temporary, "private");
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation",
      idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: ConversationalView = (await readDefinition(user.id, project.id))!;
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision,
      etag: view.etag, action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics",
        knowledge: "KNOWN" } });
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    for (const [index, abstract] of ["Study of feedback in digital mathematics education.", null,
      "Methodology for feedback in mathematics education.", null].entries()) {
      const title = `Digital mathematics evidence ${index + 1}`;
      const ref = await prisma.reference.create({ data: { title, normalizedTitle: normalizeTitle(title),
        authorsJson: ["Test Researcher"], abstract, year: 2020 + index,
        landingPageUrl: index === 3 ? "https://unavailable.invalid/document" : null } });
      references.push(ref.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: ref.id,
        sourceProvider: "SYSTEM", relevanceScore: 50 } });
    }
    await updateSelectedProjectReferences(user.id, project.id, references.slice(0, 3));
    const listed = await listProjectReferences(user.id, project.id);
    assert.equal(listed.filter(row => row.selected).length, 3, "selection must reflect persisted state only");
    const first = await prepareSelectedSources(user.id, project.id);
    assert.equal(first.items.length, 3);
    assert.equal(first.items.filter(row => row.status === "PREPARED_ABSTRACT").length, 2);
    const materialCount = await prisma.projectSourceMaterialization.count({ where: { projectId: project.id,
      materializationType: "SOURCE_PREPARATION_V1" } });
    const repeated = await prepareSelectedSources(user.id, project.id);
    assert.equal(repeated.stepRunId, first.stepRunId, "unchanged source preparation reuses the prior inspection");
    assert.equal(await prisma.projectSourceMaterialization.count({ where: { projectId: project.id,
      materializationType: "SOURCE_PREPARATION_V1" } }), materialCount, "no duplicate materializations");
    const set = await confirmEvidenceSet(user.id, project.id);
    assert.equal(set.version, 1);
    assert.equal(set.readiness, "READY_WITH_LIMITATIONS");
    await assert.rejects(() => prisma.projectEvidenceSet.update({ where: { id: set.id },
      data: { readiness: "READY" } }), /immutable/i, "database refuses in-place evidence mutation");
    assert.equal((await confirmEvidenceSet(user.id, project.id)).id, set.id, "confirm is idempotent");
    await updateSelectedProjectReferences(user.id, project.id, references);
    assert.equal((await prisma.projectEvidenceSet.findUniqueOrThrow({ where: { id: set.id } })).contentHash,
      set.contentHash, "old snapshot remains unchanged");
    await assert.rejects(() => confirmEvidenceSet(user.id, project.id), /EVIDENCE_SET_BLOCKED/,
      "selection change requires preparation before another immutable version");
    await prepareSelectedSources(user.id, project.id);
    const second = await confirmEvidenceSet(user.id, project.id);
    assert.equal(second.version, 2);
    assert.notEqual(second.contentHash, set.contentHash);
    assert.ok((second.snapshotJson as { sources: Array<{ preparationStatus: string }> }).sources
      .some(source => source.preparationStatus === "FAILED_ACCESS"), "one unavailable source stays accounted for");
    assert.equal((await prisma.projectDraft.findUniqueOrThrow({ where: { projectId: project.id } })).confirmedRevision,
      view.revision, "selection does not stale scientific definition");

    const pdfTitle = "Learning feedback in digital mathematics";
    const pdfReference = await prisma.reference.create({ data: { title: pdfTitle,
      normalizedTitle: normalizeTitle(pdfTitle), authorsJson: ["Author Example"], doi: "10.1234/test.example" } });
    references.push(pdfReference.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: pdfReference.id,
      sourceProvider: "OPENALEX", selected: false } });
    const psPath = path.join(temporary, "source.ps"), pdfPath = path.join(temporary, "source.pdf");
    await writeFile(psPath, `%!PS-Adobe-3.0\n/Helvetica findfont 16 scalefont setfont\n72 720 moveto (${pdfTitle}) show\n72 690 moveto (DOI: 10.1234/test.example) show\nshowpage\n`);
    await promisify(execFile)("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
      `-sOutputFile=${pdfPath}`, psPath], { timeout: 15_000 });
    const bytes = await readFile(pdfPath);
    const draft = await prisma.projectDraft.findUniqueOrThrow({ where: { projectId: project.id } });
    const upload = await prisma.uploadedPdf.create({ data: { userId: user.id, projectId: project.id,
      draftRevision: draft.revision, fileName: "learning-source.pdf", storageKey: randomUUID(),
      expectedBytes: bytes.length, status: "QUARANTINED" } });
    const stored = await new PrivateFileArtifactStore().putPdf(upload.storageKey,
      new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }), bytes.length);
    await prisma.uploadedPdf.update({ where: { id: upload.id }, data: stored });
    const processed = await prepareUploadedPdf(user.id, project.id, upload.id);
    assert.equal(processed.referenceId, pdfReference.id, "strong DOI and title match links one source");
    assert.equal(processed.identityStatus, "MATCHED");
    assert.equal(processed.extractionStatus, "TEXT_EXTRACTED");
    assert.equal(await prisma.projectReference.count({ where: { projectId: project.id, referenceId: pdfReference.id } }), 1);
    assert.equal((await prepareUploadedPdf(user.id, project.id, upload.id)).id, upload.id, "PDF processing is idempotent");
    await updateSelectedProjectReferences(user.id, project.id, references);
    const withUpload = await prepareSelectedSources(user.id, project.id);
    assert.equal(withUpload.items.find(item => item.referenceId === pdfReference.id)?.status, "PREPARED_FULL_TEXT",
      "matched user PDF enters common selected-source preparation without a provider call");
    const pdfSet = await confirmEvidenceSet(user.id, project.id);
    assert.equal(pdfSet.version, 3);
    assert.ok((pdfSet.snapshotJson as { sources: Array<{ uploadedPdfId?: string }> }).sources
      .some(source => source.uploadedPdfId === upload.id));
    await prisma.reference.update({ where: { id: pdfReference.id }, data: { venue: "Updated venue" } });
    const changedPool = await prisma.projectReference.findMany({ where: { projectId: project.id },
      select: { referenceId: true, selected: true, selectedOrder: true, sourceProvider: true,
        relevanceScore: true, selectionReason: true, reference: { select: { updatedAt: true } } },
      orderBy: { referenceId: "asc" } });
    const poolUploads = await prisma.uploadedPdf.findMany({ where: { projectId: project.id, status: { not: "REMOVED" } },
      select: { id: true, referenceId: true, sha256: true, status: true, identityStatus: true } });
    assert.notEqual(evidenceSourcePoolVersion(pdfSet.searchIntentHash, changedPool, poolUploads), pdfSet.sourcePoolVersion,
      "bibliographic edits make a frozen source pool stale without modifying its snapshot");
    assert.equal((await removeUploadedPdf(user.id, project.id, upload.id)).status, "REMOVED");
    assert.equal(await new PrivateFileArtifactStore().exists(upload.storageKey), false);
    await assert.rejects(() => confirmEvidenceSet(user.id, project.id), /EVIDENCE_SET_BLOCKED/,
      "removing an uploaded representation invalidates current preparation without rewriting the old set");

    // A genuinely new no-DOI document must enter as an unselected candidate.
    const newPdfPath = path.join(temporary, "unmatched.pdf");
    const newPsPath = path.join(temporary, "unmatched.ps");
    await writeFile(newPsPath, "%!PS-Adobe-3.0\n/Helvetica findfont 16 scalefont setfont\n72 720 moveto (A New Primary Qualitative Study) show\nshowpage\n");
    await promisify(execFile)("gs", ["-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
      `-sOutputFile=${newPdfPath}`, newPsPath], { timeout: 15_000 });
    const unmatched = await readFile(newPdfPath);
    const unmatchedDoc = await prisma.uploadedPdf.create({ data: { userId: user.id, projectId: project.id,
      draftRevision: draft.revision, fileName: "qualitative-study.pdf", storageKey: randomUUID(),
      expectedBytes: unmatched.length, status: "QUARANTINED" } });
    const unmatchedStored = await new PrivateFileArtifactStore().putPdf(unmatchedDoc.storageKey,
      new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(unmatched); controller.close(); } }), unmatched.length);
    await prisma.uploadedPdf.update({ where: { id: unmatchedDoc.id }, data: unmatchedStored });
    const unmatchedResult = await prepareUploadedPdf(user.id, project.id, unmatchedDoc.id);
    assert.equal(unmatchedResult.identityStatus, "NEEDS_INSPECTION");
    assert.ok(unmatchedResult.referenceId);
    references.push(unmatchedResult.referenceId!);
    assert.equal((await prisma.projectReference.findUniqueOrThrow({ where: { projectId_referenceId: {
      projectId: project.id, referenceId: unmatchedResult.referenceId! } } })).selected, false,
    "new uploaded source is not auto-selected or recommended");
    console.log("PASS integrated Phase 2 offline: persistent selection, idempotent preparation, evidence levels, immutable versioning, frozen intent, no providers");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: references } } });
    await prisma.$disconnect();
    global.fetch = previousFetch;
    if (previousStorageRoot === undefined) delete process.env.IMX_PRIVATE_STORAGE_ROOT;
    else process.env.IMX_PRIVATE_STORAGE_ROOT = previousStorageRoot;
    await rm(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
