import { createHash } from "node:crypto";

import { Prisma, Provider, type MvpStepRunStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Serializable = Prisma.InputJsonValue | null | undefined;

function cleanJson(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.replace(/\u0000/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cleanJson(nested)]),
    );
  }

  return value;
}

export function asStepRunJson<T>(value: T): Prisma.InputJsonValue {
  return cleanJson(JSON.parse(JSON.stringify(value ?? null))) as Prisma.InputJsonValue;
}

export function hashJson(value: Serializable) {
  const payload = JSON.stringify(value ?? null);
  return createHash("sha256").update(payload).digest("hex");
}

export async function createMvpStepRun(input: {
  projectId: string;
  userId?: string | null;
  stepKey: string;
  status?: MvpStepRunStatus;
  provider?: Provider | null;
  model?: string | null;
  promptVersion?: string | null;
  inputSnapshotJson?: Serializable;
  warningsJson?: Serializable;
  errorsJson?: Serializable;
  retryCount?: number;
  fallbackUsed?: boolean;
  artifactDir?: string | null;
  artifactManifestPath?: string | null;
}) {
  return prisma.mvpStepRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId ?? null,
      stepKey: input.stepKey,
      status: input.status ?? "PENDING",
      provider: input.provider ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      inputSnapshotJson: input.inputSnapshotJson ?? undefined,
      inputHash: input.inputSnapshotJson ? hashJson(input.inputSnapshotJson) : null,
      warningsJson: input.warningsJson ?? undefined,
      errorsJson: input.errorsJson ?? undefined,
      retryCount: input.retryCount ?? 0,
      fallbackUsed: input.fallbackUsed ?? false,
      artifactDir: input.artifactDir ?? null,
      artifactManifestPath: input.artifactManifestPath ?? null,
    },
  });
}

export async function updateMvpStepRun(
  runId: string,
  input: {
    status?: MvpStepRunStatus;
    provider?: Provider | null;
    model?: string | null;
    promptVersion?: string | null;
    outputSnapshotJson?: Serializable;
    warningsJson?: Serializable;
    errorsJson?: Serializable;
    retryCount?: number;
    fallbackUsed?: boolean;
    artifactDir?: string | null;
    artifactManifestPath?: string | null;
    finishedAt?: Date | null;
  },
) {
  const finishedAt = input.finishedAt === undefined ? null : input.finishedAt;

  const updated = await prisma.mvpStepRun.update({
    where: { id: runId },
    data: {
      status: input.status,
      provider: input.provider ?? undefined,
      model: input.model ?? undefined,
      promptVersion: input.promptVersion ?? undefined,
      outputSnapshotJson: input.outputSnapshotJson ?? undefined,
      outputHash: input.outputSnapshotJson ? hashJson(input.outputSnapshotJson) : undefined,
      warningsJson: input.warningsJson ?? undefined,
      errorsJson: input.errorsJson ?? undefined,
      retryCount: input.retryCount ?? undefined,
      fallbackUsed: input.fallbackUsed ?? undefined,
      artifactDir: input.artifactDir ?? undefined,
      artifactManifestPath: input.artifactManifestPath ?? undefined,
      finishedAt: finishedAt ?? undefined,
    },
  });

  if (finishedAt) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE "MvpStepRun"
        SET "durationMs" = GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - "startedAt")) * 1000)
        )::int
        WHERE "id" = $2
      `,
      finishedAt.toISOString(),
      runId,
    );
  }

  return updated;
}

export async function findLatestMvpStepRun(input: {
  projectId: string;
  stepKey: string;
}) {
  return prisma.mvpStepRun.findFirst({
    where: {
      projectId: input.projectId,
      stepKey: input.stepKey,
    },
    orderBy: { createdAt: "desc" },
  });
}
