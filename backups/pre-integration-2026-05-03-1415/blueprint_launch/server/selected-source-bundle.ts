import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlueprintLaunchSelectedSourceBundle } from "./local-playground-store";
import { readBlueprintLaunchLocalState } from "./local-playground-store";

const SELECTED_SOURCES_DIR = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "selected_sources",
);

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

export async function buildBlueprintLaunchSelectedSourcesBundle(): Promise<BlueprintLaunchSelectedSourceBundle> {
  const state = await readBlueprintLaunchLocalState();
  const selectedSources = (state.searchSnapshot?.references ?? [])
    .filter((item) => item.selected && item.selectedOrder !== null)
    .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
    .map((item) => ({
      selectedOrder: item.selectedOrder ?? 0,
      relevanceScore: item.relevanceScore,
      scoreLabel: item.scoreBreakdown?.label ?? null,
      reference: item.reference,
    }));

  if (selectedSources.length === 0) {
    throw new Error("No hay fuentes seleccionadas para materializar.");
  }

  const savedAt = new Date().toISOString();
  const manifestFilename = `selected-sources-${buildTimestampToken(savedAt)}.json`;
  const manifestPath = path.join(SELECTED_SOURCES_DIR, manifestFilename);

  return {
    savedAt,
    manifestPath,
    selectedCount: selectedSources.length,
    pdfLinkedCount: selectedSources.filter((item) => item.reference.pdfAccessible).length,
    searchQuery: state.searchSnapshot?.searchQuery ?? null,
    intakeTopic: state.savedIntake?.intake.topic ?? null,
    sources: selectedSources,
  };
}

export async function writeBlueprintLaunchSelectedSourcesBundle(
  bundle: BlueprintLaunchSelectedSourceBundle,
) {
  await mkdir(SELECTED_SOURCES_DIR, { recursive: true });
  await writeFile(bundle.manifestPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const latestManifestPath = path.join(SELECTED_SOURCES_DIR, "latest-selected-sources.json");
  await writeFile(latestManifestPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}
