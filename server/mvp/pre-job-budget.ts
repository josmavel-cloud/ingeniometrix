import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "./job-execution-context";
import { withLlmUsageContext, type LlmUsageAttribution } from "@/server/llm-usage-registry";

type OperationContext = { id: string; userId: string; requestId: string; revision: string; projectId?: string; draftId?: string };
const context = new AsyncLocalStorage<OperationContext>();
export const currentPaidOperation = () => context.getStore();
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function usdMicros(usd: number) {
  if (!Number.isFinite(usd) || usd < 0 || usd > 1000) throw new Error("INVALID_COST");
  return Math.ceil(usd * 1_000_000);
}
function configuredMicros(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0 || value > 2) throw new Error(`INVALID_PRE_JOB_POLICY: ${name}`);
  return usdMicros(value);
}
const rollingDay = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

export async function withPaidOperation<T>(input: { userId: string; requestId: string; purpose: string; projectId?: string; draftId?: string; revision: string; inputs: unknown }, work: () => Promise<T>): Promise<T> {
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(input.requestId) || !input.revision) throw new Error("INVALID_PAID_REQUEST_CONTEXT");
  const hash = fingerprint({ purpose: input.purpose, projectId: input.projectId, draftId: input.draftId, revision: input.revision, inputs: input.inputs });
  const operation = await prisma.$transaction(async (tx) => {
    await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    if (input.projectId && !await tx.project.findFirst({ where: { id: input.projectId, userId: input.userId }, select: { id: true } })) throw new Error("PROJECT_NOT_FOUND");
    const old = await tx.paidOperation.findUnique({ where: { userId_requestId: { userId: input.userId, requestId: input.requestId } } });
    if (old) {
      if (old.inputFingerprint !== hash) throw new Error("PAID_REQUEST_INPUT_CONFLICT");
      if (old.status !== "COMPLETED") throw new Error(old.status === "RUNNING" ? "PAID_REQUEST_IN_PROGRESS" : "PAID_REQUEST_ALREADY_FAILED");
      return old;
    }
    // Bound even no-provider/fallback request spam before entering expensive services.
    if (await tx.paidOperation.count({ where: { userId: input.userId, createdAt: { gte: rollingDay() } } }) >= 100) throw new Error("PRE_JOB_REQUEST_LIMIT");
    return tx.paidOperation.create({ data: { userId: input.userId, projectId: input.projectId, draftId: input.draftId, revision: input.revision, requestId: input.requestId, purpose: input.purpose, inputFingerprint: hash, hardCapMicros: configuredMicros("IMX_PRE_JOB_REQUEST_CAP_USD", 0.25) } });
  });
  if (operation.status === "COMPLETED") return operation.resultJson as T;
  return context.run({ id: operation.id, userId: input.userId, requestId: input.requestId, revision: input.revision, projectId: input.projectId, draftId: input.draftId }, () => withLlmUsageContext({ userId: input.userId, projectId: input.projectId, draftId: input.draftId, revision: input.revision, requestId: input.requestId }, async () => {
    try {
      const result = await work();
      await prisma.paidOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", resultJson: result == null ? Prisma.JsonNull : json(result), completedAt: new Date() } });
      return result;
    } catch (error) {
      await prisma.paidOperation.update({ where: { id: operation.id }, data: { status: "FAILED", completedAt: new Date() } });
      throw error;
    } finally {
      // Unknown usage remains reserved. Never release money because a request ended.
      await prisma.paidOperationCall.updateMany({ where: { operationId: operation.id, status: "RESERVED" }, data: { status: "PENDING_RECONCILIATION" } });
    }
  }));
}

export async function withPaidRequest<T>(request: Request, userId: string, projectId: string | undefined, payload: unknown, work: () => Promise<T>) {
  const project = projectId ? await prisma.project.findFirst({ where: { id: projectId, userId }, include: { intake: true, draft: true, projectReferences: { where: { selected: true }, select: { referenceId: true, selectedOrder: true } } } }) : null;
  if (projectId && !project) throw new Error("PROJECT_NOT_FOUND");
  const revision = fingerprint({ intake: project?.intake, draftRevision: project?.draft?.revision, draftContentHash: project?.draft?.contentHash, selection: project?.projectReferences, payload });
  return withPaidOperation({ userId, projectId, draftId: project?.draft?.id, requestId: request.headers.get("idempotency-key") ?? randomUUID(), revision, purpose: new URL(request.url).pathname, inputs: payload }, work);
}

export async function reservePreJobCall(purpose: string, model: string, maximumUsd: number, attribution?: LlmUsageAttribution) {
  const operation = context.getStore();
  if (!operation) throw new Error("PERSISTENT_PAID_CONTEXT_REQUIRED");
  const maximum = usdMicros(maximumUsd);
  if (maximum <= 0) throw new Error("INVALID_COST");
  const call = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${operation.userId} FOR UPDATE`;
    const record = await tx.paidOperation.findUniqueOrThrow({ where: { id: operation.id } });
    const daily = await tx.paidOperation.aggregate({ where: { userId: operation.userId, OR: [{ createdAt: { gte: rollingDay() } }, { calls: { some: { estimatedMicros: null } } }] }, _sum: { committedMicros: true } });
    const breached = await tx.paidOperation.count({ where: { userId: operation.userId, boundBreached: true } });
    if (record.status !== "RUNNING" || breached || record.committedMicros + maximum > record.hardCapMicros || (daily._sum.committedMicros ?? 0) + maximum > configuredMicros("IMX_PRE_JOB_DAILY_CAP_USD", 1)) throw new Error("PRE_JOB_COST_LIMIT");
    await tx.paidOperation.update({ where: { id: record.id }, data: { committedMicros: { increment: maximum } } });
    return tx.paidOperationCall.create({ data: { operationId: record.id, purpose, model, reservedMicros: maximum, attributionJson: json({ ...attribution, ...operation }) } });
  });
  const finish = async (cost: number | null, usage: unknown, actualModel?: string) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${operation.userId} FOR UPDATE`;
    const existing = await tx.paidOperationCall.findUniqueOrThrow({ where: { id: call.id } });
    if (existing.estimatedMicros !== null) return;
    const estimate = cost === null ? null : usdMicros(cost);
    await tx.paidOperationCall.update({ where: { id: call.id }, data: { status: estimate === null ? "UNKNOWN_USAGE" : "COMPLETED", estimatedMicros: estimate, usageJson: usage == null ? Prisma.DbNull : json(usage), actualModel, completedAt: new Date() } });
    if (estimate !== null) await tx.paidOperation.update({ where: { id: operation.id }, data: { committedMicros: { increment: estimate - existing.reservedMicros }, ...(estimate > existing.reservedMicros ? { boundBreached: true } : {}) } });
  });
  return { complete: finish, fail: () => finish(null, null) };
}
