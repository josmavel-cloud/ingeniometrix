import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  LlmUsageAttribution,
  LlmUsageCallRecord,
  LlmUsageProjectTotals,
  LlmUsageRegistry,
  LlmUsageTotals,
} from "@/server/llm-usage-registry";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function roundMoney(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function emptyTotals(): LlmUsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costCad: 0,
  };
}

function addTotals(target: LlmUsageTotals, call: LlmUsageCallRecord) {
  target.calls += 1;
  target.inputTokens += call.inputTokens;
  target.cachedInputTokens += call.cachedInputTokens;
  target.outputTokens += call.outputTokens;
  target.totalTokens += call.totalTokens;
  target.costUsd = roundMoney(target.costUsd + call.costUsd);
  target.costCad = roundMoney(target.costCad + call.costCad);
}

function emptyProjectTotals(): LlmUsageProjectTotals {
  return { totals: emptyTotals(), byRun: {}, byStage: {} };
}

function stageForOperation(operation: string, fallbackStage: string) {
  if (operation.includes("translation") || operation.includes("language_detection")) {
    return "source_translation";
  }
  if (operation.includes("reference_search") || operation.includes("search")) {
    return "source_discovery";
  }
  return fallbackStage;
}

function rebuildByProject(registry: LlmUsageRegistry) {
  registry.byProject = {};
  for (const call of registry.recentCalls) {
    const projectId = call.attribution?.projectId;
    if (!projectId) continue;

    registry.byProject[projectId] = registry.byProject[projectId] ?? emptyProjectTotals();
    const projectTotals = registry.byProject[projectId];
    addTotals(projectTotals.totals, call);

    if (call.attribution?.runId) {
      projectTotals.byRun[call.attribution.runId] =
        projectTotals.byRun[call.attribution.runId] ?? emptyTotals();
      addTotals(projectTotals.byRun[call.attribution.runId], call);
    }

    if (call.attribution?.stage) {
      projectTotals.byStage[call.attribution.stage] =
        projectTotals.byStage[call.attribution.stage] ?? emptyTotals();
      addTotals(projectTotals.byStage[call.attribution.stage], call);
    }
  }
}

async function main() {
  const projectId = readArg("project") ?? readArg("projectId");
  const runId = readArg("run") ?? readArg("runId");
  const since = readArg("since");
  const until = readArg("until");
  const stage = readArg("stage") ?? "other";
  const source = readArg("source") ?? "manual_backfill";
  const userId = readArg("user") ?? readArg("userId");

  if (!projectId || !runId || !since || !until) {
    throw new Error(
      "Uso: tsx scripts/mvp/backfill-api-usage-attribution.ts --project=<id> --run=<runId> --since=<ISO> --until=<ISO> [--stage=<stage>] [--user=<id>]",
    );
  }

  const registryPath = path.join(process.cwd(), "artifacts-local", "llm-usage", "registry.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as LlmUsageRegistry;
  let updated = 0;

  registry.recentCalls = registry.recentCalls.map((call) => {
    if (call.recordedAt < since || call.recordedAt > until) return call;

    const attribution: LlmUsageAttribution = {
      ...(call.attribution ?? {}),
      projectId,
      runId,
      stage: stageForOperation(call.operation, stage),
      source,
    };
    if (userId) attribution.userId = userId;
    updated += 1;
    return { ...call, attribution };
  });

  rebuildByProject(registry);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ok: true, updated, projectId, runId, since, until }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
