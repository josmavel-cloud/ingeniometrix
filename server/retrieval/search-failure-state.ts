import { ActorType, Prisma, ProjectStatus, Provider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpenAlexRequestError } from "./openalex-client";

const retryableStatus = (referenceCount: number) => referenceCount > 0
  ? ProjectStatus.SOURCES_REVIEW : ProjectStatus.INTAKE_READY;

export function safeSearchFailureCode(error: unknown) {
  return error instanceof OpenAlexRequestError ? error.code : "SEARCH_EXECUTION_FAILED";
}

// A failed provider attempt is historical; only the transient project status is
// restored. The exact updatedAt fence prevents an older attempt from clearing a
// newer search's SEARCHING state.
export async function settleFailedSearch(input: {
  userId: string; projectId: string; searchingUpdatedAt: Date;
  error: unknown; searchIntentHash: string; attemptedQueries: string[];
}) {
  const failureCode = safeSearchFailureCode(input.error);
  await prisma.$transaction(async tx => {
    const referenceCount = await tx.projectReference.count({ where: { projectId: input.projectId } });
    const changed = await tx.project.updateMany({
      where: { id: input.projectId, userId: input.userId, status: ProjectStatus.SEARCHING,
        updatedAt: input.searchingUpdatedAt },
      data: { status: retryableStatus(referenceCount) },
    });
    if (!changed.count) return;
    await tx.auditLog.create({ data: {
      userId: input.userId, projectId: input.projectId, actorType: ActorType.SYSTEM,
      provider: Provider.OPENALEX, eventType: "SEARCH_FAILED_RETRYABLE",
      payloadJson: {
        failureCode, searchIntentHash: input.searchIntentHash,
        attemptedQueries: input.attemptedQueries,
        restoredStatus: retryableStatus(referenceCount),
      } as Prisma.InputJsonValue,
    } });
  });
}

// Operator recovery for an attempt that failed before SEARCH_FAILED_RETRYABLE
// existed. It is owner-scoped, idempotent and requires the failed paid record.
export async function recoverHistoricalFailedSearch(input: {
  userId: string; projectId: string; failedOperationId: string;
}) {
  return prisma.$transaction(async tx => {
    const failed = await tx.paidOperation.findFirst({ where: {
      id: input.failedOperationId, userId: input.userId, projectId: input.projectId,
      status: "FAILED", purpose: "rc4-openalex-only-acceptance",
    }, select: { id: true, createdAt: true } });
    if (!failed) throw new Error("FAILED_SEARCH_OPERATION_NOT_FOUND");
    const project = await tx.project.findFirst({ where: { id: input.projectId, userId: input.userId },
      select: { status: true } });
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    if (project.status !== ProjectStatus.SEARCHING) return { recovered: false, status: project.status };
    const laterCompleted = await tx.auditLog.count({ where: { projectId: input.projectId,
      eventType: "SEARCH_COMPLETED", createdAt: { gt: failed.createdAt } } });
    const newerRunning = await tx.paidOperation.count({ where: { projectId: input.projectId,
      createdAt: { gt: failed.createdAt }, status: "RUNNING" } });
    if (laterCompleted || newerRunning) throw new Error("SEARCH_RECOVERY_CONFLICT");
    const referenceCount = await tx.projectReference.count({ where: { projectId: input.projectId } });
    const status = retryableStatus(referenceCount);
    await tx.project.update({ where: { id: input.projectId }, data: { status } });
    await tx.auditLog.create({ data: {
      userId: input.userId, projectId: input.projectId, actorType: ActorType.SYSTEM,
      provider: Provider.OPENALEX, eventType: "SEARCH_FAILED_RECOVERED",
      payloadJson: { failedOperationId: failed.id, restoredStatus: status,
        reasonCode: "LEGACY_TERMINAL_PROVIDER_FAILURE" } as Prisma.InputJsonValue,
    } });
    return { recovered: true, status };
  });
}
