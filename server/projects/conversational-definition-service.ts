import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyDefinitionAction, definitionActionSchema, definitionReadiness, definitionSchema, emptyDefinition, projectIntake, searchIntent, usable, userValue, type ConversationalView, type ResearchDefinition } from "@/lib/conversational-intake";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { DraftConflict } from "./project-draft-service";
import { assignPrimaryAcademicField, resolveAcademicField } from "./topic-area-service";

export const jsonValue = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
export const createDefinitionSchema = z.object({ intakeMode: z.literal("conversation"), idea: z.string().trim().min(8).max(8000), degreeLevel: z.enum(["PREGRADO", "MAESTRIA", "PROYECTO_INVESTIGACION"]), requestId: z.string().uuid() }).strict();
export const definitionMutationSchema = z.object({ requestId: z.string().uuid(), baseRevision: z.number().int().min(1), etag: z.string().min(1), action: definitionActionSchema }).strict();
export function definitionView(row: { id: string; revision: number; confirmedRevision: number | null; contentJson: unknown; contentHash: string }): ConversationalView {
  const definition = definitionSchema.parse((row.contentJson as Record<string, unknown>).researchDefinition);
  return { id: row.id, revision: row.revision, confirmedRevision: row.confirmedRevision, etag: `W/"draft-${row.revision}-${row.contentHash.slice(0, 16)}"`, definitionHash: fingerprint(definition), definition };
}
export async function lockedDefinition(tx: Prisma.TransactionClient, userId: string, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
  const p = await tx.project.findFirst({ where: { id: projectId, userId }, include: { draft: true, intake: true } });
  if (!p) throw new Error("PROJECT_NOT_FOUND");
  if (!p.draft || !(p.draft.contentJson as Record<string, unknown>).researchDefinition) throw new Error("LEGACY_DEFINITION_REQUIRES_REVIEW");
  return { project: p, draft: p.draft, view: definitionView(p.draft) };
}
export function checkRevision(view: ConversationalView, revision: number, etag?: string) {
  if (view.revision !== revision || (etag && view.etag !== etag)) throw new DraftConflict();
}
export async function nextTurnSequence(tx: Prisma.TransactionClient, projectId: string) {
  const last = await tx.intakeTurn.findFirst({ where: { projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const sequence = (last?.sequence ?? 0) + 1;
  if (sequence > 200) throw new Error("INTAKE_TURN_LIMIT");
  return sequence;
}
export async function writeDefinition(tx: Prisma.TransactionClient, row: { id: string; revision: number; contentJson: unknown; staleScopesJson: unknown }, definition: ResearchDefinition) {
  const content = { ...(row.contentJson as Record<string, unknown>), researchDefinition: definition };
  const scopes = ["SCIENTIFIC_DECISION", "RESEARCH_DESIGN", "EVIDENCE_PACK", "SECTIONS", "CONSISTENCY_MATRIX", "ASSETS"];
  return tx.projectDraft.update({ where: { id: row.id }, data: { contentJson: jsonValue(content), contentHash: fingerprint(content), revision: row.revision + 1,
    staleScopesJson: jsonValue([...new Set([...(Array.isArray(row.staleScopesJson) ? row.staleScopesJson : []), ...scopes])]), lastInvalidatedAt: new Date() } });
}
export async function createConversationalProject(userId: string, raw: unknown) {
  const input = createDefinitionSchema.parse(raw);
  if (process.env.IMX_CONVERSATIONAL_INTAKE === "0") throw new Error("CONVERSATIONAL_INTAKE_DISABLED");
  const hex = createHash("sha256").update(`${userId}:intake:${input.requestId}`).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const existing = await tx.project.findFirst({ where: { id, userId } });
    if (existing) {
      if (existing.topicSeedText !== input.idea || existing.degreeLevel !== input.degreeLevel) throw new Error("IDEMPOTENCY_INPUT_CONFLICT");
      return existing;
    }
    const d = emptyDefinition(), messageId = input.requestId;
    d.fields.originalIdea = userValue(input.idea, 1, messageId);
    d.fields.topic = userValue(input.idea, 1, messageId);
    d.fields.academicLevel = userValue(input.degreeLevel, 1, messageId);
    const content = { version: "draft.v1", researchDefinition: d };
    const p = await tx.project.create({ data: { id, userId, title: input.idea.slice(0, 180), topicSeedText: input.idea, topicOriginType: "CUSTOM", degreeLevel: input.degreeLevel,
      draft: { create: { revision: 1, contentJson: jsonValue(content), contentHash: fingerprint(content) } } } });
    await tx.intakeTurn.create({ data: { projectId: id, userId, sequence: 1, requestId: input.requestId, inputHash: fingerprint(input), baseRevision: 0,
      kind: "INITIAL_IDEA", inputJson: jsonValue(input), status: "COMPLETE", resultingRevision: 1 } });
    await tx.auditLog.create({ data: { projectId: id, userId, actorType: "USER", eventType: "INTAKE_CONVERSATION_CREATED", payloadJson: { revision: 1, requestId: input.requestId } } });
    return p;
  });
}
export async function readDefinition(userId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, userId }, include: { draft: true } });
  if (!p) throw new Error("PROJECT_NOT_FOUND");
  if (!p.draft || !(p.draft.contentJson as Record<string, unknown>).researchDefinition) return null;
  const turns = await prisma.intakeTurn.findMany({ where: { projectId, userId }, orderBy: { sequence: "asc" }, take: 200, select: { id: true, requestId: true, kind: true, inputJson: true, status: true, resultJson: true, createdAt: true } });
  return { ...definitionView(p.draft), turns };
}
export async function changeDefinition(userId: string, projectId: string, raw: unknown) {
  const input = definitionMutationSchema.parse(raw);
  return prisma.$transaction(async tx => {
    const { draft, view } = await lockedDefinition(tx, userId, projectId);
    const previous = await tx.intakeTurn.findUnique({ where: { projectId_requestId: { projectId, requestId: input.requestId } } });
    if (previous) {
      if (previous.inputHash !== fingerprint(input)) throw new Error("IDEMPOTENCY_INPUT_CONFLICT");
      return view; // Return CURRENT authority, never an old response over newer edits.
    }
    checkRevision(view, input.baseRevision, input.etag);
    const definition = applyDefinitionAction(view.definition, input.action, view.revision + 1, input.requestId);
    const row = await writeDefinition(tx, draft, definition);
    await tx.intakeTurn.create({ data: { projectId, userId, sequence: await nextTurnSequence(tx, projectId), requestId: input.requestId, inputHash: fingerprint(input),
      baseRevision: input.baseRevision, kind: "ACTION", inputJson: jsonValue(input.action), status: "COMPLETE", resultingRevision: row.revision } });
    return definitionView(row);
  });
}
export async function confirmDefinition(userId: string, projectId: string, revision: number, definitionHash: string) {
  return prisma.$transaction(async tx => {
    const { project, draft, view } = await lockedDefinition(tx, userId, projectId);
    checkRevision(view, revision);
    if (view.definitionHash !== definitionHash) throw new DraftConflict();
    if (definitionReadiness(view.definition).evidenceSearch.status !== "READY") throw new Error("DEFINITION_NEEDS_CLARIFICATION");
    if (draft.confirmedRevision === revision) return view;
    const snapshot = structuredClone(view.definition);
    snapshot.proposals = [];
    for (const [key, value] of Object.entries(snapshot.fields)) {
      if (usable(value)) value.confirmation = { actorId: userId, revision, valueHash: fingerprint({ key, value: value.value, knowledge: value.knowledge }), timestamp: new Date().toISOString() };
      else if (value.knowledge === "KNOWN") { value.value = ""; value.knowledge = "UNKNOWN"; }
    }
    const projection = projectIntake(snapshot);
    const confirmed = { definition: snapshot, revision, definitionHash, actorId: userId };
    const data = { ...projection, confirmedDefinitionJson: jsonValue(confirmed), searchQuery: null };
    await tx.intake.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
    const taxonomy = usable(snapshot.fields.taxonomy) ? await resolveAcademicField({ topicAreaLabel: snapshot.fields.taxonomy.value }) : null;
    await assignPrimaryAcademicField(tx, projectId, taxonomy);
    await tx.project.update({ where: { id: projectId }, data: { title: projection.topic.slice(0, 180), degreeLevel: snapshot.fields.academicLevel.value as typeof project.degreeLevel,
      topicAreaId: taxonomy?.topicAreaId ?? null, topicAreaLabel: taxonomy?.topicAreaLabel ?? null } });
    // Compatibility consumers use the last explicitly confirmed projection only.
    const content = { ...(draft.contentJson as Record<string, unknown>), intake: projection };
    const row = await tx.projectDraft.update({ where: { id: draft.id }, data: { contentJson: jsonValue(content), contentHash: fingerprint(content), confirmedRevision: revision } });
    await tx.auditLog.create({ data: { userId, projectId, actorType: "USER", eventType: "RESEARCH_DEFINITION_CONFIRMED", payloadJson: { revision, definitionHash } } });
    return definitionView(row);
  });
}
export async function readConfirmedSearchIntent(userId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, userId }, include: { draft: true, intake: true } });
  if (!p) throw new Error("PROJECT_NOT_FOUND");
  const saved = p.intake?.confirmedDefinitionJson as { definition: unknown; revision: number; definitionHash: string } | null;
  if (!saved || p.draft?.confirmedRevision !== p.draft?.revision) throw new Error("DEFINITION_CONFIRMATION_REQUIRED");
  return searchIntent(projectId, saved.revision, saved.definitionHash, definitionSchema.parse(saved.definition));
}
