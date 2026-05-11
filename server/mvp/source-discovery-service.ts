import { ProjectStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import {
  searchProjectReferencesV2,
  type SearchProjectReferencesV2Result,
} from "@/server/retrieval/reference-search-v2";

export type MvpSourceDiscoveryResult = {
  project_id: string;
  status: "candidates_ready" | "blocked";
  search: SearchProjectReferencesV2Result | null;
  candidate_source_count: number;
  suggested_selection_ids: string[];
  blockers: string[];
  warnings: string[];
  next_action_es: string;
};

function suggestedSelectionIds(result: SearchProjectReferencesV2Result) {
  const suggested = result.searchSnapshot.references
    .filter((reference) => reference.suggestedSelectedOrder !== null)
    .sort(
      (left, right) =>
        (left.suggestedSelectedOrder ?? 999) - (right.suggestedSelectedOrder ?? 999),
    )
    .map((reference) => reference.referenceId);

  if (suggested.length > 0) {
    return suggested.slice(0, MAX_SELECTED_REFERENCES);
  }

  return result.searchSnapshot.references
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, MIN_SELECTED_REFERENCES)
    .map((reference) => reference.referenceId);
}

export async function runMvpSourceDiscovery(
  userId: string,
  projectId: string,
  options?: { desiredTotal?: number },
): Promise<MvpSourceDiscoveryResult> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  if (!project.intake) {
    return {
      project_id: projectId,
      status: "blocked",
      search: null,
      candidate_source_count: 0,
      suggested_selection_ids: [],
      blockers: ["El proyecto no tiene intake guardado."],
      warnings: [],
      next_action_es: "Completa el intake antes de buscar fuentes.",
    };
  }

  try {
    const search = await searchProjectReferencesV2(userId, projectId, {
      desiredTotal: options?.desiredTotal ?? MIN_SELECTED_REFERENCES,
    });
    const candidateSourceCount = await prisma.projectReference.count({
      where: { projectId },
    });
    const suggestedIds = suggestedSelectionIds(search);
    const enoughCandidates = candidateSourceCount >= MIN_SELECTED_REFERENCES;

    return {
      project_id: projectId,
      status: enoughCandidates ? "candidates_ready" : "blocked",
      search,
      candidate_source_count: candidateSourceCount,
      suggested_selection_ids: suggestedIds,
      blockers: enoughCandidates
        ? []
        : [
            `Discovery encontró ${candidateSourceCount} candidato(s); se requieren al menos ${MIN_SELECTED_REFERENCES} para selección MVP.`,
          ],
      warnings: search.totalResults === 0 ? ["No se persistieron candidatos desde los proveedores."] : [],
      next_action_es: enoughCandidates
        ? "Revisa y selecciona fuentes. Deep Research aún no debe ejecutarse; primero va inspección/source health."
        : "Ajusta el intake/query o agrega fuentes manuales antes de inspección. No ejecutes Deep Research todavía.",
    };
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.INTAKE_READY },
    });

    return {
      project_id: projectId,
      status: "blocked",
      search: null,
      candidate_source_count: 0,
      suggested_selection_ids: [],
      blockers: [
        error instanceof Error
          ? error.message
          : "No se pudo completar discovery OpenAlex/Crossref.",
      ],
      warnings: ["Discovery real falló; este bloqueo no debe activar Deep Research todavía."],
      next_action_es:
        "Reintenta discovery normal o corrige el intake. Deep Research se reserva para gaps post-inspección.",
    };
  }
}
