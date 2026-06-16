import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { MasterBlueprintSectionReader } from "@/components/labs/master-blueprint/section-reader";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function resolveLatestRunDir(caseName: string) {
  const runsRoot = path.join(
    process.cwd(),
    "artifacts-local",
    "blueprint-v2-lab",
    "steps-5-11",
    caseName,
  );
  const entries = await readdir(runsRoot, { withFileTypes: true });
  const runNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  if (runNames.length === 0) {
    throw new Error(`No se encontraron corridas del lab en ${runsRoot}.`);
  }

  const runId = runNames[0];
  return {
    runId,
    runDir: path.join(runsRoot, runId),
  };
}

export default async function MasterBlueprintSectionReaderPage() {
  const caseName = "blueprint-launch-latest";
  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName,
  });
  const { runId, runDir } = await resolveLatestRunDir(caseName);
  const [promptPlan, masterSectionDrafts, labResult] = await Promise.all([
    readJson<Record<string, unknown>>(path.join(runDir, "10-section-prompt-plan.json")),
    readJson<unknown[]>(path.join(runDir, "20-master-section-drafts.json")),
    readJson<Record<string, unknown>>(path.join(runDir, "80-lab-result.json")),
  ]);
  const referencesWorkingSet = Array.from(
    new Set(
      masterSectionDrafts.flatMap((draft) => {
        if (!draft || typeof draft !== "object" || !("used_reference_ids" in draft)) {
          return [];
        }

        const value = draft.used_reference_ids;
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      }),
    ),
  );

  return (
    <MasterBlueprintSectionReader
      snapshot={{
        caseName,
        runId,
        intakeTopic: fixtures.project.intake.topic,
        promptPlan: promptPlan as never,
        sectionDrafts: {
          drafts: masterSectionDrafts as never,
          referencesWorkingSet,
        },
        evidenceLedger:
          (labResult.evidence_ledger as Record<string, unknown> | undefined) ??
          (fixtures.evidenceLedger as never),
      }}
    />
  );
}
