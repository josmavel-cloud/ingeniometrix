import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { draftIntakeFrom, draftIntakeSchema, type DraftIntake, type DraftView } from "@/lib/project-draft-contract";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { resolveProjectStatusFromIntake } from "./project-validation";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export class DraftConflict extends Error { constructor() { super("El borrador cambió en otra pestaña. Conserva tus cambios y carga la revisión guardada antes de continuar."); } }
export async function lockCanonicalDraftMutation(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  const draft = await tx.projectDraft.findUnique({ where: { projectId } });
  if (draft && draft.confirmedRevision !== draft.revision) throw new DraftConflict();
}
// Keep existing explicit intake/topic operations compatible with the draft authority.
// Call under the project lock, in the same transaction as the canonical update.
export async function syncCanonicalIntakeToDraft(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: { intake: true, draft: true } });
  if (!project.draft) return;
  const content = { ...(project.draft.contentJson as Record<string, unknown>), intake: draftIntakeFrom(project.intake) };
  const contentHash = fingerprint(content);
  if (contentHash === project.draft.contentHash) return;
  await tx.projectDraft.update({ where: { id: project.draft.id }, data: { contentJson: json(content), contentHash, revision: { increment: 1 }, confirmedRevision: project.draft.revision + 1 } });
}
async function owned(tx: Prisma.TransactionClient, userId: string, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
  const project = await tx.project.findFirst({ where: { id: projectId, userId }, include: { intake: true, draft: true } });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}
function view(row: { id: string; revision: number; confirmedRevision: number | null; contentJson: unknown; updatedAt: Date }): DraftView {
  return { id: row.id, revision: row.revision, confirmedRevision: row.confirmedRevision, intake: draftIntakeFrom((row.contentJson as { intake: unknown }).intake), updatedAt: row.updatedAt.toISOString() };
}
// GET is observational: a legacy project is represented at revision 0 until first save.
export async function readProjectDraft(userId: string, projectId: string): Promise<DraftView> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, include: { intake: true, draft: true } });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project.draft ? view(project.draft) : { id: project.id, revision: 0, confirmedRevision: project.intake ? 0 : null, intake: draftIntakeFrom(project.intake), updatedAt: project.updatedAt.toISOString() };
}
export async function saveProjectDraft(userId: string, projectId: string, expectedRevision: number, raw: DraftIntake) {
  const intake = draftIntakeSchema.parse(raw);
  if (Buffer.byteLength(JSON.stringify(intake)) > 48000) throw new Error("DRAFT_TOO_LARGE");
  return prisma.$transaction(async (tx) => {
    const project = await owned(tx, userId, projectId);
    const previous = project.draft;
    // Preserve future advanced sections: this mutation owns only the intake subtree.
    const content = { ...((previous?.contentJson as Record<string, unknown> | null) ?? {}), version: "draft.v1", intake };
    const contentHash = fingerprint(content);
    if (previous?.contentHash === contentHash) return view(previous); // retry after a lost response
    if ((previous?.revision ?? 0) !== expectedRevision) throw new DraftConflict();
    const data = { contentJson: json(content), contentHash, revision: expectedRevision + 1 };
    const row = previous ? await tx.projectDraft.update({ where: { id: previous.id }, data }) : await tx.projectDraft.create({ data: { projectId, ...data } });
    return view(row);
  });
}
export async function confirmProjectDraft(userId: string, projectId: string, expectedRevision: number) {
  return prisma.$transaction(async (tx) => {
    const project = await owned(tx, userId, projectId);
    if (!project.draft || project.draft.revision !== expectedRevision) throw new DraftConflict();
    const intake = draftIntakeFrom((project.draft.contentJson as { intake: unknown }).intake);
    if (!intake.topic.trim()) throw new Error("Completa el tema antes de confirmar.");
    const values = Object.fromEntries(Object.entries(intake).map(([key, value]) => [key, key === "topic" ? value : value || null])) as Record<keyof DraftIntake, string | null> & { topic: string };
    // Confirmation replay does not change updatedAt and invalidate a paused design.
    if (project.draft.confirmedRevision === expectedRevision) return { project, draft: view(project.draft) };
    const active = await tx.blueprintJob.findFirst({ where: { projectId, status: { in: ["QUEUED", "RUNNING", "WAITING_NEXT_STAGE", "WAITING_USER_DECISION"] } }, select: { id: true } });
    const updated = await tx.project.update({ where: { id: projectId }, data: { ...(active ? {} : { status: resolveProjectStatusFromIntake(intake) }), intake: { upsert: { create: values, update: values } } }, include: { intake: true } });
    const row = await tx.projectDraft.update({ where: { id: project.draft.id }, data: { confirmedRevision: expectedRevision } });
    return { project: updated, draft: view(row) };
  });
}
