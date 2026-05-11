import { buildMvpApiUsageReport } from "@/server/mvp/api-usage-service";

async function main() {
  const report = await buildMvpApiUsageReport({ label: "manual_report" });
  console.log(JSON.stringify({
    ok: true,
    generated_at: report.generated_at,
    cumulative: report.cumulative,
    today: report.today,
    pricing: report.pricing,
    recent_calls: report.recent_calls.map((call) => ({
      recordedAt: call.recordedAt,
      model: call.model,
      operation: call.operation,
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
