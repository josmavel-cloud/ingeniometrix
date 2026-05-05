import {
  buildCoarseStepTelemetry,
  buildRunTelemetryArtifact,
} from "@/server/blueprint-engine/quality/run-telemetry";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

async function runTest(name: string, fn: () => void): Promise<TestResult> {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

const usage = {
  calls: 3,
  inputTokens: 1000,
  cachedInputTokens: 100,
  outputTokens: 500,
  totalTokens: 1500,
  costUsd: 0.25,
  costCad: 0.34,
};

async function main() {
  const results = await Promise.all([
    runTest("run telemetry computes duration and totals", () => {
      const telemetry = buildRunTelemetryArtifact({
        run_id: "run-1",
        case_id: "case-1",
        pipeline_stage: "blueprint_engine",
        started_at: "2026-05-05T00:00:00.000Z",
        completed_at: "2026-05-05T00:00:02.000Z",
        usage_delta: usage,
        production_eligible: false,
        diagnostic_compatible: true,
        warning_count: 2,
        blocker_count: 1,
      });
      assert(telemetry.duration_ms === 2000, `duration was ${telemetry.duration_ms}`);
      assert(telemetry.call_count === 3, `call_count was ${telemetry.call_count}`);
      assert(telemetry.total_tokens === 1500, `total_tokens was ${telemetry.total_tokens}`);
      assert(telemetry.estimated_cost_usd === 0.25, `cost was ${telemetry.estimated_cost_usd}`);
    }),
    runTest("step telemetry computes aggregate totals", () => {
      const telemetry = buildCoarseStepTelemetry({
        run_id: "run-1",
        completed_steps: ["step_7_import_context", "step_8_planning", "step_9_section_drafts"],
        pipeline_stage: "blueprint_engine",
        started_at: "2026-05-05T00:00:00.000Z",
        completed_at: "2026-05-05T00:00:03.000Z",
        usage_delta: usage,
        warning_count: 4,
        blocker_count: 0,
      });
      assert(telemetry.steps.length === 3, `steps length was ${telemetry.steps.length}`);
      assert(telemetry.totals.call_count === 3, `total calls was ${telemetry.totals.call_count}`);
      assert(telemetry.totals.duration_ms === 3000, `duration was ${telemetry.totals.duration_ms}`);
      assert(telemetry.totals.warning_count === 4, `warnings were ${telemetry.totals.warning_count}`);
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
