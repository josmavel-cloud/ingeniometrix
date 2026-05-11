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

function parseCliOptions(): CliOptions {
  const desiredTotalArg = process.argv
    .find((arg) => arg.startsWith("--desired-total="))
    ?.split("=")[1];
  const desiredTotal = Number(desiredTotalArg ?? REFERENCE_BATCH_SIZE);
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

function printStage(title: string, payload: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function askSelection(references: ReferenceListItem[], suggestedIds: string[], auto: boolean) {
  if (auto) {
    return suggestedIds.slice(0, MIN_SELECTED_REFERENCES);
  }

  const rows = candidateRows(references);
  console.log("\nFuentes candidatas para revisar:");
  for (const row of rows) {
    const marker = row.suggested ? "*" : " ";
    console.log(
      `${marker} [${row.index}] ${row.title} (${row.year ?? "s/f"}) — ${row.venue ?? "sin venue"}`,
    );
    console.log(`    score=${row.score ?? "-"} ${row.score_label ?? ""} doi=${row.doi ?? "-"}`);
  }

  console.log(
    `\nSelecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes por índice, separadas por coma.`,
  );
  console.log("Enter = aceptar sugeridas marcadas con *.");

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question("Selección de fuentes: ")).trim();

    if (!answer) {
      return suggestedIds.slice(0, MIN_SELECTED_REFERENCES);
    }

    const selectedIndexes = answer
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 1 && item <= rows.length);
    const uniqueIndexes = Array.from(new Set(selectedIndexes));

    return uniqueIndexes.map((index) => rows[index - 1]?.reference_id).filter(Boolean);
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
        }
      : null,
  });

  if (discovery.status === "blocked") {
    throw new Error(discovery.blockers.join(" ") || "Discovery bloqueado.");
  }

  const references = await listProjectReferences(user.id, project.id);
  const rows = candidateRows(references);
  events.push({ step: "GET /api/projects/:id/references", payload: rows });
  printStage("GET references", rows);

  const selectedReferenceIds = await askSelection(
    references,
    discovery.suggested_selection_ids,
    options.auto,
  );

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
    payload: { selectedReferenceIds, selectedRows, status: afterSelection },
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
