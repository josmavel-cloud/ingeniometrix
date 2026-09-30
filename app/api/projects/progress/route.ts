import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        blueprintJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            currentStage: true,
            progress: true,
            errorMessage: true,
            lockedAt: true,
            lastHeartbeatAt: true,
            updatedAt: true,
          },
        },
        generatedArtifacts: {
          select: {
            kind: true,
          },
        },
      },
    });

    return NextResponse.json({
      projects: projects.map((project) => {
        const latestJob = project.blueprintJobs[0] ?? null;

        return {
          id: project.id,
          status: project.status,
          updatedAt: project.updatedAt.toISOString(),
          job: latestJob
            ? {
                id: latestJob.id,
                status: latestJob.status,
                currentStage: latestJob.currentStage,
                progress: latestJob.progress,
                errorMessage: latestJob.errorMessage,
                updatedAt: latestJob.updatedAt.toISOString(),
                shouldNudge: false,
              }
            : null,
          artifactCount: project.generatedArtifacts.length,
          hasDocx: project.generatedArtifacts.some(
            (artifact) => artifact.kind === "BLUEPRINT_DOCX",
          ),
          hasPdf: project.generatedArtifacts.some(
            (artifact) =>
              artifact.kind === "BLUEPRINT_PDF" || artifact.kind === "SOURCE_PDF",
          ),
        };
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo obtener el progreso.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
