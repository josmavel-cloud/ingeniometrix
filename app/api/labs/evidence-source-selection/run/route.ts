import path from "node:path";
import { NextResponse } from "next/server";

import {
  readCandidateSourcesForRun,
  readOptionalJsonFile,
  resolveRunDir,
} from "@/app/api/labs/evidence-source-selection/_shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") ?? "";
    const runId = url.searchParams.get("runId") ?? "";
    const runDir = resolveRunDir(caseId, runId);
    const [candidateSources, runSummary, intakeFixture, selectionTemplate, sourceSelection] =
      await Promise.all([
        readCandidateSourcesForRun(runDir),
        readOptionalJsonFile<Record<string, unknown>>(path.join(runDir, "run-summary.json")),
        readOptionalJsonFile<Record<string, unknown>>(path.join(runDir, "intake-fixture.json")),
        readOptionalJsonFile<Record<string, unknown>>(
          path.join(runDir, "source-selection-template.json"),
        ),
        readOptionalJsonFile<Record<string, unknown>>(path.join(runDir, "source-selection.json")),
      ]);

    return NextResponse.json({
      run: {
        case_id: caseId,
        run_id: runId,
        run_folder: runDir,
      },
      candidate_sources: candidateSources,
      run_summary: runSummary,
      intake_fixture: intakeFixture,
      source_selection_template: selectionTemplate,
      source_selection: sourceSelection,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el run de seleccion de fuentes.",
      },
      { status: 404 },
    );
  }
}
