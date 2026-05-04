import path from "node:path";
import { NextResponse } from "next/server";

import {
  readJsonFile,
  readOptionalJsonFile,
  resolveRunDir,
  writeJsonAtomic,
  type CandidateSourcesArtifact,
  type SourceSelectionPayload,
} from "@/app/api/labs/evidence-source-selection/_shared";

type SaveRequest = {
  case_id?: unknown;
  run_id?: unknown;
  selected_reference_ids?: unknown;
  rejected_reference_ids?: unknown;
  undecided_reference_ids?: unknown;
  reviewer_notes?: unknown;
  candidate_notes?: unknown;
};

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function candidateNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, note]) => typeof note === "string")
      .map(([id, note]) => [id, note as string]),
  );
}

function findDuplicates(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveRequest;
    const caseId = typeof body.case_id === "string" ? body.case_id : "";
    const runId = typeof body.run_id === "string" ? body.run_id : "";
    const selectedReferenceIds = stringArray(body.selected_reference_ids);
    const rejectedReferenceIds = stringArray(body.rejected_reference_ids);
    const undecidedReferenceIds = stringArray(body.undecided_reference_ids);

    if (!selectedReferenceIds || !rejectedReferenceIds || !undecidedReferenceIds) {
      return NextResponse.json({ error: "IDs de seleccion invalidos." }, { status: 400 });
    }

    const runDir = resolveRunDir(caseId, runId);
    const candidateArtifact = await readJsonFile<CandidateSourcesArtifact>(
      path.join(runDir, "candidate-sources.json"),
    );
    const candidates = candidateArtifact.candidates ?? [];
    const candidateIds = new Set(candidates.map((candidate) => candidate.candidate_id));
    const allSubmittedIds = [
      ...selectedReferenceIds,
      ...rejectedReferenceIds,
      ...undecidedReferenceIds,
    ];
    const unknownIds = allSubmittedIds.filter((id) => !candidateIds.has(id));
    const duplicateSelectedRejected = findDuplicates(selectedReferenceIds, rejectedReferenceIds);
    const duplicateSelectedUndecided = findDuplicates(selectedReferenceIds, undecidedReferenceIds);
    const duplicateRejectedUndecided = findDuplicates(rejectedReferenceIds, undecidedReferenceIds);

    if (unknownIds.length > 0) {
      return NextResponse.json(
        { error: "Hay IDs que no existen en candidate-sources.json.", unknownIds },
        { status: 400 },
      );
    }

    if (
      duplicateSelectedRejected.length > 0 ||
      duplicateSelectedUndecided.length > 0 ||
      duplicateRejectedUndecided.length > 0
    ) {
      return NextResponse.json(
        {
          error: "Un candidato no puede estar en mas de un estado.",
          duplicateSelectedRejected,
          duplicateSelectedUndecided,
          duplicateRejectedUndecided,
        },
        { status: 400 },
      );
    }

    const intakeFixture = await readOptionalJsonFile<Record<string, unknown>>(
      path.join(runDir, "intake-fixture.json"),
    );
    const selectionTemplate = await readOptionalJsonFile<Record<string, unknown>>(
      path.join(runDir, "source-selection-template.json"),
    );
    const previousSelection = await readOptionalJsonFile<SourceSelectionPayload>(
      path.join(runDir, "source-selection.json"),
    );
    const sourcePolicy =
      intakeFixture && typeof intakeFixture.source_policy === "object"
        ? intakeFixture.source_policy
        : null;
    const minSelected =
      sourcePolicy &&
      typeof (sourcePolicy as Record<string, unknown>).min_selected_sources === "number"
        ? ((sourcePolicy as Record<string, unknown>).min_selected_sources as number)
        : null;
    const maxSelected =
      sourcePolicy &&
      typeof (sourcePolicy as Record<string, unknown>).max_selected_sources === "number"
        ? ((sourcePolicy as Record<string, unknown>).max_selected_sources as number)
        : null;
    const warnings: string[] = [];

    if (minSelected !== null && selectedReferenceIds.length < minSelected) {
      warnings.push(`Seleccion por debajo del minimo recomendado (${minSelected}).`);
    }

    if (maxSelected !== null && selectedReferenceIds.length > maxSelected) {
      warnings.push(`Seleccion por encima del maximo recomendado (${maxSelected}).`);
    }

    const now = new Date().toISOString();
    const selection: SourceSelectionPayload = {
      case_id: caseId,
      run_folder: runDir,
      selection_status: "completed",
      selected_reference_ids: selectedReferenceIds,
      rejected_reference_ids: rejectedReferenceIds,
      undecided_reference_ids: undecidedReferenceIds,
      reviewer_notes: typeof body.reviewer_notes === "string" ? body.reviewer_notes : "",
      candidate_notes: candidateNotes(body.candidate_notes),
      created_at: previousSelection?.created_at ?? now,
      updated_at: now,
      instructions_es:
        typeof selectionTemplate?.instructions_es === "string"
          ? selectionTemplate.instructions_es
          : "Revise las fuentes seleccionadas antes de continuar con los pasos backend 2-6.",
      source_policy: sourcePolicy,
    };

    await writeJsonAtomic(path.join(runDir, "source-selection.json"), selection);

    return NextResponse.json({ selection, warnings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la seleccion de fuentes.",
      },
      { status: 500 },
    );
  }
}

