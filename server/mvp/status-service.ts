import { ExportStatus, ProjectStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";

export type MvpProductStage = "intake" | "sources" | "evidence" | "blueprint" | "export";

export type MvpProjectStatusDto = {
  project_id: string;
  project_status: ProjectStatus;
  product_stage: MvpProductStage;
  backend_phase: string;
  progress: number;
  label_es: string;
  next_action_es: string;
  blockers: string[];
  warnings: string[];
  payment_required: boolean;
  export_available: boolean;
  counts: {
    candidate_sources: number;
    selected_sources: number;
    blueprint_versions: number;
  };
  latest_blueprint_version_id: string | null;
  updated_at: string;
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function hasMinimumIntake(project: {
  intake: {
    topic: string;
    problemContext: string | null;
    targetPopulation: string | null;
  } | null;
}) {
  return Boolean(
    project.intake?.topic.trim() &&
      project.intake.problemContext?.trim() &&
      project.intake.targetPopulation?.trim(),
  );
}

function resolveStatusCopy(input: {
  status: ProjectStatus;
  hasMinimumIntake: boolean;
  candidateSourceCount: number;
  selectedSourceCount: number;
  blueprintVersionCount: number;
  latestExportReady: boolean;
}): Pick<
  MvpProjectStatusDto,
  "product_stage" | "backend_phase" | "progress" | "label_es" | "next_action_es" | "blockers" | "warnings" | "export_available"
> {
  const sourceSelectionReady =
    input.selectedSourceCount >= MIN_SELECTED_REFERENCES &&
    input.selectedSourceCount <= MAX_SELECTED_REFERENCES;

  if (!input.hasMinimumIntake || input.status === ProjectStatus.DRAFT) {
    return {
      product_stage: "intake",
      backend_phase: "intake_incomplete",
      progress: 12,
      label_es: "Intake incompleto",
      next_action_es: "Completa tema, problema y población antes de buscar fuentes.",
      blockers: ["Falta intake mínimo."],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.INTAKE_READY) {
    return {
      product_stage: "sources",
      backend_phase: "ready_for_source_discovery",
      progress: 26,
      label_es: "Listo para buscar fuentes",
      next_action_es: "Ejecuta discovery con OpenAlex/Crossref y revisa candidatos.",
      blockers: [],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.SEARCHING) {
    return {
      product_stage: "sources",
      backend_phase: "source_discovery_running",
      progress: 34,
      label_es: "Buscando fuentes",
      next_action_es: "Espera resultados de discovery; Deep Research no corre en esta fase.",
      blockers: [],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.SOURCES_REVIEW || !sourceSelectionReady) {
    return {
      product_stage: "sources",
      backend_phase: "sources_need_human_selection",
      progress: 44,
      label_es: "Fuentes listas para revisión",
      next_action_es: `Selecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes para pasar a evidencia.`,
      blockers: sourceSelectionReady ? [] : [`Hay ${input.selectedSourceCount} fuentes seleccionadas; se requieren ${MIN_SELECTED_REFERENCES}-${MAX_SELECTED_REFERENCES}.`],
      warnings: input.candidateSourceCount === 0 ? ["Aún no hay candidatos persistidos."] : [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.SOURCES_SELECTED) {
    return {
      product_stage: "evidence",
      backend_phase: "ready_for_limited_inspection",
      progress: 56,
      label_es: "Fuentes seleccionadas",
      next_action_es: "Ejecuta inspección limitada/source health antes de evidence package y Deep Research repair.",
      blockers: [],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.BLUEPRINT_GENERATING) {
    return {
      product_stage: "blueprint",
      backend_phase: "blueprint_or_evidence_running",
      progress: 72,
      label_es: "Generando blueprint",
      next_action_es: "Espera la validación de coherencia, citas y readiness.",
      blockers: [],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.BLUEPRINT_READY) {
    return {
      product_stage: "export",
      backend_phase: "ready_for_export_bundle",
      progress: 84,
      label_es: "Blueprint listo",
      next_action_es: "Genera el export bundle: evidence_log, BibTeX, RIS y DOCX Ingeniometrix.",
      blockers: [],
      warnings: [],
      export_available: false,
    };
  }

  if (input.status === ProjectStatus.EXPORT_READY) {
    return {
      product_stage: "export",
      backend_phase: input.latestExportReady ? "export_bundle_ready" : "export_status_needs_repair",
      progress: input.latestExportReady ? 100 : 88,
      label_es: input.latestExportReady ? "Export listo" : "Export requiere reparación",
      next_action_es: input.latestExportReady
        ? "El backend puede entregar los archivos si el gate de pago lo permite."
        : "Regenera o repara el export bundle antes de entregar.",
      blockers: input.latestExportReady ? [] : ["El proyecto está EXPORT_READY pero el último BlueprintVersion no está READY."],
      warnings: [],
      export_available: input.latestExportReady,
    };
  }

  return {
    product_stage: "intake",
    backend_phase: "archived_or_unknown",
    progress: 0,
    label_es: "Proyecto archivado o fuera de flujo MVP",
    next_action_es: "Revisa manualmente el estado del proyecto.",
    blockers: ["Estado no activo para el flujo MVP backend."],
    warnings: [],
    export_available: false,
  };
}

export async function getMvpProjectStatus(userId: string, projectId: string): Promise<MvpProjectStatusDto> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
      projectReferences: {
        select: {
          selected: true,
        },
      },
      blueprintVersions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
        select: {
          id: true,
          exportStatus: true,
        },
      },
      _count: {
        select: {
          blueprintVersions: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const candidateSourceCount = project.projectReferences.length;
  const selectedSourceCount = project.projectReferences.filter((item) => item.selected).length;
  const latestBlueprint = project.blueprintVersions[0] ?? null;
  const copy = resolveStatusCopy({
    status: project.status,
    hasMinimumIntake: hasMinimumIntake(project),
    candidateSourceCount,
    selectedSourceCount,
    blueprintVersionCount: project._count.blueprintVersions,
    latestExportReady: latestBlueprint?.exportStatus === ExportStatus.READY,
  });

  return {
    project_id: project.id,
    project_status: project.status,
    ...copy,
    progress: clampProgress(copy.progress),
    payment_required: copy.export_available,
    counts: {
      candidate_sources: candidateSourceCount,
      selected_sources: selectedSourceCount,
      blueprint_versions: project._count.blueprintVersions,
    },
    latest_blueprint_version_id: latestBlueprint?.id ?? null,
    updated_at: project.updatedAt.toISOString(),
  };
}
