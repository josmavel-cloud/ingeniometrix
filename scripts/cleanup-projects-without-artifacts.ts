import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BlueprintJobStatus, ProjectStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const ACTIVE_JOB_STATUSES = [
  BlueprintJobStatus.QUEUED,
  BlueprintJobStatus.RUNNING,
  BlueprintJobStatus.WAITING_NEXT_STAGE,
] as const;

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const execute = hasFlag("--execute");
  const userEmail = readOption("--user");
  const olderThanDays = Number(readOption("--older-than-days") ?? "0") || 0;
  const cutoff =
    olderThanDays > 0
      ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
      : null;

  const projects = await prisma.project.findMany({
    where: {
      ...(userEmail
        ? {
            user: {
              email: userEmail,
            },
          }
        : {}),
      ...(cutoff
        ? {
            updatedAt: {
              lt: cutoff,
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    include: {
      user: {
        select: {
          email: true,
        },
      },
      blueprintJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      blueprintVersions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      generatedArtifacts: {
        select: {
          id: true,
          kind: true,
          fileName: true,
          byteSize: true,
          updatedAt: true,
        },
      },
    },
  });

  const candidates = projects
    .map((project) => {
      const latestJob = project.blueprintJobs[0] ?? null;
      const hasActiveJob =
        latestJob &&
        ACTIVE_JOB_STATUSES.some((status) => status === latestJob.status);
      const keepAsInProgress =
        project.status === ProjectStatus.BLUEPRINT_GENERATING || hasActiveJob;
      const hasPersistedArtifacts = project.generatedArtifacts.length > 0;
      const hasBlueprintVersion = project.blueprintVersions.length > 0;

      return {
        id: project.id,
        title: project.title,
        userEmail: project.user.email,
        status: project.status,
        updatedAt: project.updatedAt.toISOString(),
        latestJobStatus: latestJob?.status ?? null,
        latestJobProgress: latestJob?.progress ?? null,
        blueprintVersionId: project.blueprintVersions[0]?.id ?? null,
        hasBlueprintVersion,
        artifactCount: project.generatedArtifacts.length,
        artifacts: project.generatedArtifacts.map((artifact) => ({
          kind: artifact.kind,
          fileName: artifact.fileName,
          byteSize: artifact.byteSize,
          updatedAt: artifact.updatedAt.toISOString(),
        })),
        deleteCandidate: !keepAsInProgress && !hasPersistedArtifacts,
        keepReason: keepAsInProgress
          ? "in_progress_or_active_job"
          : hasPersistedArtifacts
            ? "has_persisted_artifacts"
            : null,
      };
    })
    .filter((project) => project.deleteCandidate);

  const report = {
    executed: execute,
    generatedAt: new Date().toISOString(),
    filters: {
      userEmail,
      olderThanDays,
      cutoff: cutoff?.toISOString() ?? null,
    },
    candidateCount: candidates.length,
    candidates,
  };

  const outputDir = path.join(process.cwd(), "artifacts-local");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `cleanup-projects-without-artifacts-${timestampForFile()}.json`,
  );
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (execute) {
    for (const candidate of candidates) {
      await prisma.project.delete({
        where: { id: candidate.id },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        executed: execute,
        candidateCount: candidates.length,
        deletedCount: execute ? candidates.length : 0,
        outputPath,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
