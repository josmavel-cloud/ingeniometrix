import {
  buildCoarseStepTelemetry,
  buildExactStepTelemetry,
  buildRunTelemetryArtifact,
  StepTimer,
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
      assert(
        telemetry.timing_granularity === "coarse_allocated" &&
          /Coarse telemetry/.test(telemetry.timing_note),
        `timing metadata was ${telemetry.timing_granularity}: ${telemetry.timing_note}`,
      );
    }),
    runTest("exact step telemetry preserves measured spans", () => {
      const telemetry = buildExactStepTelemetry({
        run_id: "run-1",
        spans: [
          {
            pipeline_stage: "evidence_engine",
            step_id: "step_2_source_access_resolution",
            step_name: "Step 2 source access resolution",
            started_at: "2026-05-05T00:00:00.000Z",
            completed_at: "2026-05-05T00:00:01.250Z",
            duration_ms: 1250,
            usage_delta: { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costCad: 0 },
          },
          {
            pipeline_stage: "evidence_engine",
            step_id: "step_3_evidence_planning",
            step_name: "Step 3 evidence planning",
            started_at: "2026-05-05T00:00:01.250Z",
            completed_at: "2026-05-05T00:00:02.000Z",
            duration_ms: 750,
            usage_delta: usage,
          },
        ],
        warning_count: 1,
      });
      assert(telemetry.timing_granularity === "exact", `granularity was ${telemetry.timing_granularity}`);
      assert(telemetry.totals.duration_ms === 2000, `duration was ${telemetry.totals.duration_ms}`);
      assert(telemetry.totals.call_count === 3, `calls were ${telemetry.totals.call_count}`);
      assert(telemetry.steps[1]?.duration_ms === 750, `step duration was ${telemetry.steps[1]?.duration_ms}`);
      assert(telemetry.totals.warning_count === 1, `warnings were ${telemetry.totals.warning_count}`);
    }),
    runTest("StepTimer records an exact span", () => {
      const timer = new StepTimer();
      const handle = timer.startStep({
        pipeline_stage: "blueprint_engine",
        step_id: "step_7_import_context",
      });
      const span = timer.completeStep(handle, { warning_count: 2 });
      assert(span.step_id === "step_7_import_context", `step id was ${span.step_id}`);
      assert(span.started_at !== null && span.completed_at !== null, "timestamps missing");
      assert(typeof span.duration_ms === "number" && span.duration_ms >= 0, `duration was ${span.duration_ms}`);
      assert(timer.getSpans().length === 1, `span count was ${timer.getSpans().length}`);
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
