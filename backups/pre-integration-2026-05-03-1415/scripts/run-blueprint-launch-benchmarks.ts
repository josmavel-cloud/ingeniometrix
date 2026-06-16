import { loadEnvConfig } from "@next/env";

import { runBlueprintLaunchBenchmarkSuite } from "@/blueprint_launch/server/benchmark-runner";

async function main() {
  loadEnvConfig(process.cwd());

  const result = await runBlueprintLaunchBenchmarkSuite({
    suiteLabel: "extended",
  });

  console.log(
    JSON.stringify(
      {
        suiteId: result.summary.suiteId,
        suiteDir: result.suiteDir,
        summaryPath: `${result.suiteDir}/summary.json`,
        reportPath: result.summary.reportPath,
        totalCases: result.summary.totalCases,
        okCases: result.summary.okCases,
        errorCases: result.summary.errorCases,
        plannerStatusBreakdown: result.summary.plannerStatusBreakdown,
        averages: result.summary.averages,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : "Error no identificado.",
  );
  process.exitCode = 1;
});
