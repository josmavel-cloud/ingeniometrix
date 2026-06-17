import { createHash } from "node:crypto";

import { GeneratedArtifactKind, Prisma, type GeneratedArtifact } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ArtifactContent = Buffer | Uint8Array | string;

export type GeneratedArtifactInput = {
  userId: string;
  projectId: string;
  blueprintVersionId?: string | null;
  jobId?: string | null;
  kind: GeneratedArtifactKind;
  fileName: string;
  mimeType: string;
  content: ArtifactContent;
  metadataJson?: unknown;
};

export type GeneratedArtifactSummary = {
  id: string;
  kind: GeneratedArtifactKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeContent(content: ArtifactContent) {
  return typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
}

function asJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function hashArtifactContent(content: ArtifactContent) {
  return createHash("sha256").update(normalizeContent(content)).digest("hex");
}

export function toGeneratedArtifactSummary(
  artifact: Pick<
    GeneratedArtifact,
    "id" | "kind" | "fileName" | "mimeType" | "byteSize" | "sha256" | "createdAt" | "updatedAt"
  >,
): GeneratedArtifactSummary {
  return {
    id: artifact.id,
    kind: artifact.kind,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

export async function upsertGeneratedArtifact(input: GeneratedArtifactInput) {
  const content = normalizeContent(input.content);
  const sha256 = hashArtifactContent(content);
  const metadataJson =
    input.metadataJson === undefined ? undefined : asJsonValue(input.metadataJson);
  const baseData = {
    userId: input.userId,
    projectId: input.projectId,
    blueprintVersionId: input.blueprintVersionId ?? null,
    jobId: input.jobId ?? null,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: content.byteLength,
    sha256,
    content,
    metadataJson,
  };

  if (input.blueprintVersionId) {
    return prisma.generatedArtifact.upsert({
      where: {
        blueprintVersionId_kind_fileName: {
          blueprintVersionId: input.blueprintVersionId,
          kind: input.kind,
          fileName: input.fileName,
        },
      },
      create: baseData,
      update: {
        userId: input.userId,
        projectId: input.projectId,
        jobId: input.jobId ?? null,
        mimeType: input.mimeType,
        byteSize: content.byteLength,
        sha256,
        content,
        metadataJson,
      },
    });
  }

  const existing = await prisma.generatedArtifact.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      jobId: input.jobId ?? null,
      kind: input.kind,
      fileName: input.fileName,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.generatedArtifact.update({
      where: { id: existing.id },
      data: {
        mimeType: input.mimeType,
        byteSize: content.byteLength,
        sha256,
        content,
        metadataJson,
      },
    });
  }

  return prisma.generatedArtifact.create({
    data: baseData,
  });
}

export async function listGeneratedArtifactSummariesForUserProject(input: {
  userId: string;
  projectId: string;
}) {
  const artifacts = await prisma.generatedArtifact.findMany({
    where: {
      userId: input.userId,
      projectId: input.projectId,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return artifacts.map(toGeneratedArtifactSummary);
}
