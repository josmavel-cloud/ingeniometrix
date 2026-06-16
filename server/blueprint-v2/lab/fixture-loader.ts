import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadBlueprintLaunchLatestFixtureSet } from "@/server/blueprint-v2/lab/blueprint-launch-fixture";
import type { EvidenceSnippet } from "@/server/blueprint-v2/types";
import type {
  LoadedMasterBlueprintLabFixtureSet,
  MasterBlueprintLabFixtureSet,
} from "@/server/blueprint-v2/lab/types";

const REQUIRED_FIXTURE_FILES = [
  "synthetic-project.json",
  "synthetic-source-gate.json",
  "synthetic-acquisition.json",
  "synthetic-pdf-downloads.json",
  "synthetic-evidence-packs.json",
  "synthetic-evidence-ledger.json",
] as const;

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function assertFixture(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Fixture invalido: ${message}`);
  }
}

function collectSnippetSourceIds(snippets: EvidenceSnippet[]) {
  return new Set(
    snippets
      .map((snippet) => snippet.source_id)
      .filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.length > 0),
  );
}

function validateFixtureSet(fixtures: MasterBlueprintLabFixtureSet) {
  const registryIds = new Set(fixtures.acquisition.source_registry.map((source) => source.source_id));
  const ledgerRegistryIds = new Set(
    fixtures.evidenceLedger.source_registry.map((source) => source.source_id),
  );
  const packIds = new Set(fixtures.evidencePacks.map((pack) => pack.source_id));
  const ledgerPackIds = new Set(fixtures.evidenceLedger.evidence_packs.map((pack) => pack.source_id));
  const pdfIds = new Set(fixtures.pdfDownloads.records.map((record) => record.source_id));

  assertFixture(fixtures.project?.intake, "synthetic-project.json debe incluir intake.");
  assertFixture(
    fixtures.sourceGate.selected_sources.length > 0,
    "synthetic-source-gate.json debe incluir al menos una fuente seleccionada.",
  );

  for (const source of fixtures.sourceGate.selected_sources) {
    assertFixture(
      registryIds.has(source.source_id),
      `la fuente seleccionada ${source.source_id} no existe en acquisition.source_registry.`,
    );
  }

  for (const sourceId of packIds) {
    assertFixture(
      registryIds.has(sourceId),
      `evidence_packs contiene ${sourceId} fuera de acquisition.source_registry.`,
    );
  }

  for (const sourceId of ledgerPackIds) {
    assertFixture(
      ledgerRegistryIds.has(sourceId),
      `evidence_ledger.evidence_packs contiene ${sourceId} fuera de evidence_ledger.source_registry.`,
    );
  }

  for (const sourceId of pdfIds) {
    assertFixture(
      registryIds.has(sourceId),
      `pdf_downloads contiene ${sourceId} fuera de acquisition.source_registry.`,
    );
  }

  for (const sourceId of collectSnippetSourceIds(fixtures.evidenceLedger.snippets)) {
    assertFixture(
      ledgerRegistryIds.has(sourceId),
      `evidence_ledger.snippets contiene ${sourceId} fuera de evidence_ledger.source_registry.`,
    );
  }
}

export async function loadMasterBlueprintLabFixtureSet(input?: {
  caseName?: string;
  fixtureDir?: string;
}): Promise<LoadedMasterBlueprintLabFixtureSet> {
  const caseName = input?.caseName?.trim() || "default";

  if (caseName === "blueprint-launch-latest" && !input?.fixtureDir?.trim()) {
    const fixtureSet = await loadBlueprintLaunchLatestFixtureSet();
    validateFixtureSet(fixtureSet);
    return fixtureSet;
  }

  const fixtureDir =
    input?.fixtureDir?.trim() ||
    path.join(process.cwd(), "fixtures", "labs", "master-blueprint", caseName);
  const [
    project,
    sourceGate,
    acquisition,
    pdfDownloads,
    evidencePacks,
    evidenceLedger,
  ] = await Promise.all(
    REQUIRED_FIXTURE_FILES.map((fileName) => readJson(path.join(fixtureDir, fileName))),
  );
  const fixtureSet = {
    project,
    sourceGate,
    acquisition,
    pdfDownloads,
    evidencePacks,
    evidenceLedger,
  } as MasterBlueprintLabFixtureSet;

  validateFixtureSet(fixtureSet);

  return {
    caseName,
    fixtureDir,
    ...fixtureSet,
  };
}
