import { buildMvpApiUsageReport } from "@/server/mvp/api-usage-service";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const projectId = readArg("project") ?? readArg("projectId");
  const runId = readArg("run") ?? readArg("runId");
  const stage = readArg("stage");
  const since = readArg("since");
  const until = readArg("until");
  const filter = projectId || runId || stage || since || until
    ? { projectId, runId, stage, since, until }
    : undefined;
  const report = await buildMvpApiUsageReport({ label: "manual_report", filter });
  console.log(JSON.stringify({
    ok: true,
    generated_at: report.generated_at,
    filter: report.filter,
    filtered_delta: report.filtered_delta,
    filtered_by_stage: report.filtered_by_stage,
    project_totals: report.project_totals,
    cumulative: report.cumulative,
    today: report.today,
    pricing: report.pricing,
    recent_calls: report.recent_calls.map((call) => ({
      recordedAt: call.recordedAt,
      model: call.model,
      operation: call.operation,
      attribution: call.attribution ?? null,
      inputTokens: call.inputTokens,
      cachedInputTokens: call.cachedInputTokens,
      outputTokens: call.outputTokens,
      totalTokens: call.totalTokens,
      costUsd: call.costUsd,
      costCad: call.costCad,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
