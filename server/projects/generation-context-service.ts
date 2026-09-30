import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { definitionSchema } from "@/lib/conversational-intake";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { evidenceSourcePoolVersion } from "@/server/projects/evidence-set-service";
import { searchIntent } from "@/lib/conversational-intake";

export type GenerationContext = {
  intakeId: string;
  confirmedRevision: number;
  definitionHash: string;
  selectionHash: string;
  uploadHash: string;
  evidenceSetId: string | null;
  draftRevision: number;
};

export async function generationContextForUser(userId: string, projectId: string,
  db: Prisma.TransactionClient = prisma): Promise<GenerationContext> {
  const project = await db.project.findFirst({ where: { id: projectId, userId },
    include: { intake: true, draft: true, projectReferences: { where: { selected: true },
      select: { referenceId: true, selectedOrder: true }, orderBy: [{ selectedOrder: "asc" }, { referenceId: "asc" }] },
      uploadedPdfs: { where: { status: { not: "REMOVED" } }, select: { id: true, sha256: true, status: true,
        referenceId: true, identityStatus: true }, orderBy: { id: "asc" } } } });
  if (!project?.intake || !project.draft) throw new Error("GENERATION_CONTEXT_UNAVAILABLE");
  const confirmed = project.intake.confirmedDefinitionJson as { revision?: number; definitionHash?: string; definition?: unknown } | null;
  const raw = (project.draft.contentJson as Record<string, unknown>).researchDefinition;
  if (raw) {
    if (!confirmed?.revision || !confirmed.definitionHash || project.draft.confirmedRevision !== confirmed.revision ||
      fingerprint(definitionSchema.parse(raw)) !== confirmed.definitionHash) throw new Error("DEFINITION_CONFIRMATION_REQUIRED");
  } else if (project.draft.confirmedRevision !== project.draft.revision) throw new Error("DEFINITION_CONFIRMATION_REQUIRED");
  const selected = project.projectReferences.map(row => [row.referenceId, row.selectedOrder]);
  if (!selected.length) throw new Error("SOURCE_SELECTION_REQUIRED");
  const definitionHash = confirmed?.definitionHash ?? project.draft.contentHash;
  const selectionHash = fingerprint(selected);
  const uploadHash = fingerprint(project.uploadedPdfs.map(doc => [doc.id, doc.sha256, doc.status, doc.referenceId, doc.identityStatus]));
  const pool = await db.projectReference.findMany({ where: { projectId },
    select: { referenceId: true, selected: true, selectedOrder: true, sourceProvider: true,
      relevanceScore: true, selectionReason: true, reference: { select: { updatedAt: true } } }, orderBy: { referenceId: "asc" } });
  const intentHash = raw && confirmed?.revision && confirmed.definitionHash ? fingerprint(searchIntent(projectId,
    confirmed.revision, confirmed.definitionHash, definitionSchema.parse(confirmed.definition))) : null;
  const latest = await db.projectEvidenceSet.findFirst({ where: { projectId }, orderBy: { version: "desc" },
    select: { id: true, definitionHash: true, selectionHash: true, sourcePoolVersion: true,
      searchIntentHash: true, snapshotJson: true } });
  const snapshot = latest?.snapshotJson as { uploadedAssets?: unknown[] } | undefined;
  return { intakeId: project.intake.id, confirmedRevision: confirmed?.revision ?? project.draft.revision,
    definitionHash, selectionHash, uploadHash,
    evidenceSetId: latest?.definitionHash === definitionHash && latest.selectionHash === selectionHash &&
      latest.sourcePoolVersion === evidenceSourcePoolVersion(latest.searchIntentHash, pool, project.uploadedPdfs) &&
      (!intentHash || latest.searchIntentHash === intentHash) &&
      fingerprint((snapshot?.uploadedAssets ?? []).map((doc: any) => [doc.id, doc.sha256, doc.status, doc.referenceId, doc.identityStatus])
        .sort((left: unknown[], right: unknown[]) => String(left[0]).localeCompare(String(right[0])))) === uploadHash ? latest.id : null,
    draftRevision: project.draft.revision };
}

export function assertExpectedGenerationContext(expected: GenerationContext, actual: GenerationContext) {
  if (expected.intakeId !== actual.intakeId || expected.confirmedRevision !== actual.confirmedRevision ||
    expected.definitionHash !== actual.definitionHash) throw new Error("DEFINITION_REVISION_CONFLICT");
  if (expected.selectionHash !== actual.selectionHash || expected.uploadHash !== actual.uploadHash) throw new Error("SOURCE_SELECTION_CONFLICT");
  // Evidence can be created by this job. An old evidence ID never becomes authority over new selection.
}
