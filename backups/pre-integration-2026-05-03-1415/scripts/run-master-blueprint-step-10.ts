import { loadEnvConfig } from "@next/env";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
import {
  buildConsistencyMatrixArtifactFromSectionsWithLlm,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

type CliOptions = {
  caseName: string;
  runDir?: string;
};

const LAB_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint-v2-lab",
  "steps-5-11",
);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    caseName: "blueprint-launch-latest",
  };

  for (const arg of argv) {
    if (arg.startsWith("--case=")) {
      options.caseName = arg.slice("--case=".length) || options.caseName;
      continue;
    }

    if (arg.startsWith("--run-dir=")) {
      options.runDir = arg.slice("--run-dir=".length) || undefined;
    }
  }

  return options;
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");

  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function getLatestRunDir(caseName: string) {
  const caseDir = path.join(LAB_RUN_ROOT, caseName);
  const entries = await readdir(caseDir, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(caseDir, entry.name);
        const stats = await stat(fullPath);

        return {
          name: entry.name,
          fullPath,
          mtimeMs: stats.mtimeMs,
        };
      }),
  );

  const latest = dirs
    .sort((left, right) => right.name.localeCompare(left.name) || right.mtimeMs - left.mtimeMs)
    .at(0);

  if (!latest) {
    throw new Error(`No hay runs locales para el caso ${caseName}.`);
  }

  return latest.fullPath;
}

async function main() {
  loadEnvConfig(process.cwd());

  const options = parseArgs(process.argv.slice(2));
  const runDir = options.runDir ?? (await getLatestRunDir(options.caseName));
  const drafts = await readJson<MasterSectionDraft[]>(
    path.join(runDir, "20-master-section-drafts.json"),
  );
  const sourceDrafts = drafts.filter((draft) => draft.section_key !== "consistency_matrix");
  const provider = getConfiguredLlmProvider();
  const model = process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini";
  const startedAt = Date.now();
  const artifact = await buildConsistencyMatrixArtifactFromSectionsWithLlm({
    drafts: sourceDrafts,
    provider,
    model,
  });

  await Promise.all([
    writeJson(path.join(runDir, "30-consistency-matrix.json"), artifact.legacy_rows),
    writeJson(path.join(runDir, "31-consistency-matrix-artifact.json"), artifact),
    writeJson(path.join(runDir, "32-consistency-matrix-step10-summary.json"), {
      caseName: options.caseName,
      runDir,
      executedStep: "consistency_matrix",
      executedOnlyStep10: true,
      generatedAt: artifact.generated_at,
      durationMs: Date.now() - startedAt,
      llm: artifact.llm_generation,
      status: artifact.status,
      canContinueStep11: artifact.can_continue_step_11,
      rowCount: artifact.specific_rows.length,
      warnings: artifact.validation.warnings,
      blockers: artifact.validation.blocked_reasons,
      tableModel: artifact.table_model,
    }),
  ]);

  const summary: Pick<
    ConsistencyMatrixArtifact,
    "artifact_version" | "llm_used" | "status" | "can_continue_step_11"
  > & {
    caseName: string;
    runDir: string;
    rows: number;
    model: string | null;
    totalTokens: number;
    costCad: number;
    durationMs: number;
  } = {
    caseName: options.caseName,
    runDir,
    artifact_version: artifact.artifact_version,
    llm_used: artifact.llm_used,
    status: artifact.status,
    can_continue_step_11: artifact.can_continue_step_11,
    rows: artifact.specific_rows.length,
    model: artifact.llm_generation?.model ?? null,
    totalTokens: artifact.llm_generation?.total_tokens ?? 0,
    costCad: artifact.llm_generation?.cost_cad ?? 0,
    durationMs: Date.now() - startedAt,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
