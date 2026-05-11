import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  ProjectStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { getMvpProjectStatus } from "@/server/mvp/status-service";
import { saveIntakeForProject } from "@/server/projects/project-service";
import {
  listProjectReferences,
  updateSelectedProjectReferences,
} from "@/server/retrieval/reference-service";

import { structuralWarrenBridgeFixture } from "./fixtures/structural-warren-bridge-intake";

const TEST_USER_EMAIL = "mvp-frontend-sim@ingeniometrix.local";
const SIMULATOR_VERSION = "mvp.frontend-simulator.v1";

type CliOptions = {
  auto: boolean;
  keepDbRecords: boolean;
  desiredTotal: number;
  fixtureId: string;
};

type ReferenceListItem = Awaited<ReturnType<typeof listProjectReferences>>[number];
type CandidateRow = ReturnType<typeof candidateRows>[number];

function parseCliOptions(): CliOptions {
  const desiredTotalArg = process.argv
    .find((arg) => arg.startsWith("--desired-total="))
    ?.split("=")[1];
  const desiredTotal = Number(desiredTotalArg ?? MAX_SELECTED_REFERENCES);
  const fixtureId =
    process.argv.find((arg) => arg.startsWith("--fixture="))?.split("=")[1] ??
    structuralWarrenBridgeFixture.id;

  if (fixtureId !== structuralWarrenBridgeFixture.id) {
    throw new Error(`Fixture no soportado: ${fixtureId}`);
  }

  return {
    auto: process.argv.includes("--auto"),
    keepDbRecords: process.argv.includes("--keep-db-records"),
    fixtureId,
    desiredTotal: Number.isFinite(desiredTotal)
      ? Math.min(Math.max(desiredTotal, MIN_SELECTED_REFERENCES), MAX_SELECTED_REFERENCES)
      : REFERENCE_BATCH_SIZE,
  };
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function renderAuthors(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 3).join(", ")
    : "";
}

function compactStatus(status: Awaited<ReturnType<typeof getMvpProjectStatus>>) {
  return {
    project_id: status.project_id,
    project_status: status.project_status,
    product_stage: status.product_stage,
    backend_phase: status.backend_phase,
    progress: status.progress,
    blockers: status.blockers,
    warnings: status.warnings,
    next_action_es: status.next_action_es,
    counts: status.counts,
  };
}

function candidateRows(references: ReferenceListItem[]) {
  return references.slice(0, MAX_SELECTED_REFERENCES).map((item, index) => ({
    index: index + 1,
    reference_id: item.reference.id,
    suggested: item.selectedOrder !== null,
    selected_order: item.selectedOrder,
    score: item.relevanceScore,
    score_label: item.scoreBreakdown?.label ?? null,
    title: item.reference.title,
    authors: renderAuthors(item.reference.authorsJson),
    year: item.reference.year,
    venue: item.reference.venue,
    doi: item.reference.doi,
    url: item.reference.landingPageUrl,
  }));
}

function printCandidateBatch(rows: CandidateRow[], batchNumber: 1 | 2) {
  const startIndex = batchNumber === 1 ? 0 : REFERENCE_BATCH_SIZE;
  const batchRows = rows.slice(startIndex, startIndex + REFERENCE_BATCH_SIZE);

  console.log(`\nFuentes candidatas — lote ${batchNumber} (${startIndex + 1}-${startIndex + batchRows.length}):`);

  for (const row of batchRows) {
    const marker = row.suggested ? "*" : " ";
    console.log(
      `${marker} [${row.index}] ${row.title} (${row.year ?? "s/f"}) — ${row.venue ?? "sin venue"}`,
    );
    console.log(`    score=${row.score ?? "-"} ${row.score_label ?? ""} doi=${row.doi ?? "-"}`);
  }
}

function printStage(title: string, payload: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function askSelection(references: ReferenceListItem[], suggestedIds: string[], auto: boolean) {
  const rows = candidateRows(references);

  if (auto) {
    printCandidateBatch(rows, 1);
    return {
      selectedReferenceIds: suggestedIds.slice(0, MIN_SELECTED_REFERENCES),
      batchFlow: {
        mode: "auto",
        shownBatches: [1],
        action: "accepted_backend_suggestions_from_first_batch",
      },
    };
  }

  printCandidateBatch(rows, 1);

  console.log(
    `\nSelecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes por índice, separadas por coma.`,
  );
  console.log("Enter = aceptar sugeridas marcadas con * del lote visible.");
  console.log("Escribe 'más' o 'next' para ver las siguientes 5 fuentes antes de elegir.");

  const rl = readline.createInterface({ input, output });
  try {
    const firstAnswer = (await rl.question("Selección de fuentes/lote 1: ")).trim();
    const wantsNextBatch = ["mas", "más", "next", "siguiente", "5"].includes(
      firstAnswer.toLowerCase(),
    );
    const shownBatches: Array<1 | 2> = [1];
    const answer = wantsNextBatch
      ? await (async () => {
          shownBatches.push(2);
          printCandidateBatch(rows, 2);
          return (await rl.question("Selección de fuentes/lotes 1-2: ")).trim();
        })()
      : firstAnswer;

    if (!answer) {
      const visibleReferenceIds = rows
        .slice(0, shownBatches.includes(2) ? MAX_SELECTED_REFERENCES : REFERENCE_BATCH_SIZE)
        .map((row) => row.reference_id);

      return {
        selectedReferenceIds: suggestedIds
          .filter((referenceId) => visibleReferenceIds.includes(referenceId))
          .slice(0, MIN_SELECTED_REFERENCES),
        batchFlow: {
          mode: "interactive",
          shownBatches,
          action: "accepted_visible_backend_suggestions",
        },
      };
    }

    const selectedIndexes = answer
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 1 && item <= rows.length);
    const uniqueIndexes = Array.from(new Set(selectedIndexes));

    return {
      selectedReferenceIds: uniqueIndexes.map((index) => rows[index - 1]?.reference_id).filter(Boolean),
      batchFlow: {
        mode: "interactive",
        shownBatches,
        action: wantsNextBatch ? "selected_after_second_batch" : "selected_from_first_batch",
      },
    };
  } finally {
    rl.close();
  }
}

async function createSimulatorProject(userId: string, runId: string) {
  const fixture = structuralWarrenBridgeFixture;

  return prisma.project.create({
    data: {
      userId,
      status: ProjectStatus.DRAFT,
      ...fixture.project,
      title: `${fixture.project.title} (${runId})`,
    },
  });
}

async function main() {
  const options = parseCliOptions();
  const fixture = structuralWarrenBridgeFixture;
  const runId = `frontend-sim-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-frontend-sim", runId);
  const events: Array<{ step: string; payload: unknown }> = [];

  await mkdir(artifactDir, { recursive: true });
  await prisma.$queryRaw`SELECT 1`;

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: { email: TEST_USER_EMAIL, name: "MVP Frontend Simulator", locale: "es-PE" },
    update: { name: "MVP Frontend Simulator", locale: "es-PE" },
  });

  const project = await createSimulatorProject(user.id, runId);

  const afterCreate = compactStatus(await getMvpProjectStatus(user.id, project.id));
  events.push({ step: "GET /api/projects/:id/status after create", payload: afterCreate });
  printStage("GET status inicial", afterCreate);

  const intakePayload = fixture.intake;

  await saveIntakeForProject(user.id, project.id, intakePayload);
  const afterIntake = compactStatus(await getMvpProjectStatus(user.id, project.id));
  events.push({ step: "PUT /api/projects/:id/intake", payload: { request: intakePayload, status: afterIntake } });
  printStage("PUT intake + status", afterIntake);

  const discovery = await runMvpSourceDiscovery(user.id, project.id, {
    desiredTotal: options.desiredTotal,
  });
  events.push({ step: "POST /api/projects/:id/search", payload: discovery });
  printStage("POST search/discovery", {
    status: discovery.status,
    candidate_source_count: discovery.candidate_source_count,
    suggested_selection_ids: discovery.suggested_selection_ids,
    blockers: discovery.blockers,
    warnings: discovery.warnings,
    next_action_es: discovery.next_action_es,
    search: discovery.search
      ? {
          searchQuery: discovery.search.searchQuery,
          attemptedQueries: discovery.search.attemptedQueries,
          totalResults: discovery.search.totalResults,
          providerBreakdown: discovery.search.providerBreakdown,
          metadata: {
            planSource: discovery.search.searchSnapshot.metadata.planSource,
            normalizedTopic: discovery.search.searchSnapshot.metadata.normalizedTopic,
            necessary: discovery.search.searchSnapshot.metadata.keywordGroups.necessary,
            complementary: discovery.search.searchSnapshot.metadata.keywordGroups.complementary,
            optional: discovery.search.searchSnapshot.metadata.keywordGroups.optional,
          },
        }
      : null,
  });

  if (discovery.status === "blocked") {
    throw new Error(discovery.blockers.join(" ") || "Discovery bloqueado.");
  }

  const references = await listProjectReferences(user.id, project.id);
  const rows = candidateRows(references);
  events.push({ step: "GET /api/projects/:id/references", payload: rows });
  events.push({
    step: "UI cable: first 5 references visible; next 5 hidden until user asks",
    payload: {
      firstBatch: rows.slice(0, REFERENCE_BATCH_SIZE),
      secondBatchAvailable: rows.length > REFERENCE_BATCH_SIZE,
      secondBatch: rows.slice(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES),
    },
  });
  printStage("GET references — lote 1 visible / lote 2 preparado", {
    firstBatch: rows.slice(0, REFERENCE_BATCH_SIZE),
    secondBatchAvailable: rows.length > REFERENCE_BATCH_SIZE,
    secondBatchCount: rows.slice(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES).length,
  });

  const selection = await askSelection(
    references,
    discovery.suggested_selection_ids,
    options.auto,
  );
  const selectedReferenceIds = selection.selectedReferenceIds;

  if (
    selectedReferenceIds.length < MIN_SELECTED_REFERENCES ||
    selectedReferenceIds.length > MAX_SELECTED_REFERENCES
  ) {
    throw new Error(
      `Selección inválida: ${selectedReferenceIds.length}. Debe estar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES}.`,
    );
  }

  await updateSelectedProjectReferences(user.id, project.id, selectedReferenceIds);
  const afterSelection = compactStatus(await getMvpProjectStatus(user.id, project.id));
  const selectedRows = candidateRows(await listProjectReferences(user.id, project.id)).filter((row) =>
    selectedReferenceIds.includes(row.reference_id),
  );
  events.push({
    step: "PUT /api/projects/:id/references",
    payload: { selectedReferenceIds, selectedRows, batchFlow: selection.batchFlow, status: afterSelection },
  });
  printStage("PUT references + status", { selectedRows, status: afterSelection });

  const summary = {
    ok: true,
    simulator_version: SIMULATOR_VERSION,
    run_id: runId,
    project_id: project.id,
    artifact_dir: artifactDir,
    auto: options.auto,
    fixture_id: options.fixtureId,
    fixture_label: fixture.label,
    selection_criteria: fixture.selectionCriteria,
    desired_total: options.desiredTotal,
    source_selection_batch_flow: selection.batchFlow,
    endpoint_sequence: events.map((event) => event.step),
    final_status: afterSelection,
    selected_reference_ids: selectedReferenceIds,
    next_human_gate_es:
      "Revisar calidad/source health de las fuentes seleccionadas antes de blueprint. Si hay gaps reales post-inspección, recién ahí considerar Deep Research Light.",
  };

  await writeFile(path.join(artifactDir, "frontend-sim-events.json"), `${JSON.stringify(events, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "frontend-sim-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (!options.keepDbRecords) {
    await prisma.project.delete({ where: { id: project.id } });
    summary.final_status.warnings = [
      ...summary.final_status.warnings,
      "Proyecto temporal eliminado al final del simulador; Reference rows compartidas permanecen para reuse.",
    ];
  }

  printStage("Resumen simulador front", summary);
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
