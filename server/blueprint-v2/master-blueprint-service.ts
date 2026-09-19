import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import { normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { logAuditEvent } from "@/server/audit/audit-service";
import { BlueprintGenerationError } from "@/server/blueprint/blueprint-errors";
import {
  completeBlueprintRunManifest,
  createBlueprintRunManifest,
  pushBlueprintRunStage,
} from "@/server/blueprint-v2/orchestrator/blueprint-run-manager";
import { runMasterBlueprintEngine } from "@/server/blueprint-v2/orchestrator/master-blueprint-engine";

const BLUEPRINT_PROMPT_VERSION = "master-blueprint-engine-v1";

async function writeFatalRunArtifact(input: {
  runId: string;
  projectId: string;
  error: unknown;
}) {
  const artifactDir = path.join(
    process.cwd(),
    "artifacts-local",
    "master-blueprint-engine",
    input.runId,
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "fatal-error.json"),
    `${JSON.stringify(
      {
        projectId: input.projectId,
        runId: input.runId,
        name: input.error instanceof Error ? input.error.name : "UnknownError",
        message: input.error instanceof Error ? input.error.message : String(input.error),
        stack: input.error instanceof Error ? input.error.stack ?? null : null,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function generateBlueprintVersion(
  userId: string,
  projectId: string,
  options?: {
    languageOverride?: string | null;
  },
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
      projectReferences: {
        where: {
          selected: true,
        },
        orderBy: {
          selectedOrder: "asc",
        },
        include: {
          reference: true,
        },
      },
      blueprintVersions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
      },
    },
  });

  if (!project || !project.intake) {
    throw new BlueprintGenerationError({
      code: "INTAKE_INCOMPLETE",
      message: "El proyecto aun no tiene una base de intake suficiente para generar el blueprint.",
      nextAction: "Completa el intake estructurado antes de volver a intentar.",
    });
  }

  const effectiveLanguage =
    normalizeLanguageCode(options?.languageOverride) ??
    normalizeLanguageCode(project.language) ??
    "es";
  const readyProject = {
    ...project,
    language: effectiveLanguage,
    intake: project.intake,
  };

  if (
    project.projectReferences.length < MIN_SELECTED_REFERENCES ||
    project.projectReferences.length > MAX_SELECTED_REFERENCES
  ) {
    throw new BlueprintGenerationError({
      code: "REFERENCES_OUT_OF_RANGE",
      message: `Debes seleccionar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes antes de generar el blueprint.`,
      nextAction:
        "Ajusta tu set de fuentes seleccionadas para que el blueprint tenga soporte suficiente sin volverse pesado.",
    });
  }

  const manifest = createBlueprintRunManifest({
    userId,
    projectId: project.id,
    selectedTemplateKey: project.templateKey,
  });
  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.BLUEPRINT_GENERATING,
    },
  });

  try {
    await pushBlueprintRunStage({
      manifest,
      stageKey: "preparing",
      label: "Preparando MasterBlueprintEngine",
      progress: 4,
    });

    const { blueprintPackage, coherenceReport } = await runMasterBlueprintEngine({
      manifest,
      project: readyProject,
    });

    await pushBlueprintRunStage({
      manifest,
      stageKey: "persisting",
      label: "Persistiendo version de blueprint",
      progress: 98,
    });
    completeBlueprintRunManifest(
      manifest,
      blueprintPackage.master_template.template_version_id,
    );

    const blueprintJson = {
      ...blueprintPackage.legacy_blueprint,
      language: effectiveLanguage,
      master_blueprint_engine: blueprintPackage,
      provenance_report: blueprintPackage.provenance_report,
      university_blueprint: blueprintPackage.university_blueprint,
    };
    const createdVersion = await prisma.blueprintVersion.create({
      data: {
        projectId: project.id,
        versionNumber,
        model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
        promptVersion: BLUEPRINT_PROMPT_VERSION,
        intakeSnapshotJson: {
          language: effectiveLanguage,
          topic: project.intake.topic,
          problemContext: project.intake.problemContext,
          researchLine: project.intake.researchLine,
          academicConstraints: project.intake.academicConstraints,
          targetPopulation: project.intake.targetPopulation,
          availableData: project.intake.availableData,
          preferredMethodology: project.intake.preferredMethodology,
          advisorNotes: project.intake.advisorNotes,
          searchQuery: project.intake.searchQuery,
        },
        selectedReferencesSnapshotJson: blueprintPackage.acquisition.source_registry.map(
          (source) => ({
            project_reference_id:
              project.projectReferences.find((item) => item.reference.id === source.reference_id)
                ?.id ?? null,
            selected_order: source.selected_order,
            reference_id: source.source_id,
            origin: source.origin,
            reference_origin_id: source.reference_id,
            title: source.title,
            doi: source.doi,
            authors: source.authors,
            year: source.year,
            venue: source.venue,
            abstract: source.abstract,
            landing_page_url: source.landing_page_url,
            pdf_url: source.pdf_url,
            eligible_for_formal_reference: source.eligible_for_formal_reference,
          }),
        ),
        blueprintJson: blueprintJson as Prisma.InputJsonValue,
        coherenceReportJson: coherenceReport as Prisma.InputJsonValue,
        exportStatus: ExportStatus.PENDING,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.BLUEPRINT_READY,
      },
    });

    await pushBlueprintRunStage({
      manifest,
      stageKey: "completed",
      label: "Blueprint listo",
      progress: 100,
    });
    await logAuditEvent({
      eventType: "BLUEPRINT_GENERATED",
      actorType: "SYSTEM",
      provider: Provider.OPENAI,
      userId,
      projectId: project.id,
      payloadJson: {
        versionNumber,
        promptVersion: BLUEPRINT_PROMPT_VERSION,
        language: effectiveLanguage,
        runId: manifest.run_id,
        engineName: manifest.engine_name,
        engineVersion: manifest.engine_version,
        masterTemplateVersionId: manifest.master_template_version_id,
      },
    });

    return createdVersion;
  } catch (error) {
    await writeFatalRunArtifact({
      runId: manifest.run_id,
      projectId: project.id,
      error,
    }).catch(() => undefined);
    await pushBlueprintRunStage({
      manifest,
      stageKey: "failed",
      label: "El run encontro un bloqueo",
      progress: 100,
    }).catch(() => undefined);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status:
          project.projectReferences.length > 0
            ? ProjectStatus.SOURCES_SELECTED
            : ProjectStatus.INTAKE_READY,
      },
    });

    if (error instanceof BlueprintGenerationError) {
      throw error;
    }

    throw new BlueprintGenerationError({
      code: "MODEL_OUTPUT_INVALID",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo completar el MasterBlueprintEngine.",
      nextAction:
        "Revisa el intake, el estado de las fuentes y vuelve a intentar la generacion.",
    });
  }
}
