import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

function readJsonIfExists(filePath: string): JsonRecord | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonRecord;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metricDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return Number((current - previous).toFixed(6));
}

function loadStepTimings(runFolder: string) {
  const stepTelemetry = readJsonIfExists(path.join(runFolder, "step-telemetry.json")) ?? {};
  const steps = Array.isArray(stepTelemetry.steps) ? stepTelemetry.steps : [];

  return {
    timing_granularity:
      typeof stepTelemetry.timing_granularity === "string"
        ? stepTelemetry.timing_granularity
        : null,
    timing_note:
      typeof stepTelemetry.timing_note === "string" ? stepTelemetry.timing_note : null,
    steps: steps
      .map((item) => {
        const step = asRecord(item);
        const stepId = typeof step.step_id === "string" ? step.step_id : null;
        if (!stepId) return null;

        return {
          pipeline_stage: typeof step.pipeline_stage === "string" ? step.pipeline_stage : null,
          step_id: stepId,
          step_name: typeof step.step_name === "string" ? step.step_name : stepId,
          duration_ms: asNumber(step.duration_ms),
          call_count: asNumber(step.call_count),
          total_tokens: asNumber(step.total_tokens),
          estimated_cost_usd: asNumber(step.estimated_cost_usd),
          warning_count: asNumber(step.warning_count),
          blocker_count: asNumber(step.blocker_count),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

function loadRunMetrics(runFolder: string) {
  const summary = readJsonIfExists(path.join(runFolder, "full-diagnostic-summary.json")) ?? {};
  const dashboard = readJsonIfExists(path.join(runFolder, "quality-dashboard.json")) ?? {};
  const telemetry = readJsonIfExists(path.join(runFolder, "run-telemetry.json")) ?? {};
  const reducedPack = readJsonIfExists(path.join(runFolder, "reduced-evidence-pack.json")) ?? {};
  const provenance = readJsonIfExists(path.join(runFolder, "50-provenance-report.json")) ?? {};
  const packageQuality = readJsonIfExists(path.join(runFolder, "90-package-quality-summary.json")) ?? {};
  const masterQa = readJsonIfExists(path.join(runFolder, "121-master-docx-qa-report.json")) ?? {};
  const universityQa = readJsonIfExists(path.join(runFolder, "131-university-docx-qa-report.json")) ?? {};
  const staleScan = readJsonIfExists(path.join(runFolder, "stale-content-scan-report.json")) ?? {};
  const tokenUsage = asRecord(summary.token_cost_usage);
  const tokenDelta = asRecord(tokenUsage.delta);
  const reducedCounts = asRecord(reducedPack.reduced_counts);
  const packageGates = asRecord(asRecord(packageQuality).gates);

  return {
    run_folder: runFolder,
    status: typeof summary.status === "string" ? summary.status : null,
    production_eligible:
      asBoolean(summary.production_eligible) ??
      asBoolean(asRecord(asRecord(dashboard).production_eligibility).production_eligible),
    source_count: asNumber(summary.source_count),
    evidence_unit_count: asNumber(summary.evidence_unit_count),
    reduced_evidence_unit_count: asNumber(reducedCounts.evidence_units),
    direct_quote_count:
      asNumber(asRecord(asRecord(dashboard).citation_health).true_source_backed_direct_quote_count) ??
      asNumber(asRecord(asRecord(dashboard).citation_health).reported_direct_quote_count),
    sections_with_evidence_ids: asNumber(provenance.sections_with_evidence_ids),
    section_evidence_binding_score: asNumber(provenance.section_evidence_binding_score),
    master_docx_qa_score: asNumber(masterQa.score_100),
    institutional_docx_qa_score: asNumber(universityQa.score_100),
    master_word_failures: asNumber(packageGates.max_word_failure_count),
    warning_count: asStringArray(summary.warnings).length,
    blocker_count: asStringArray(summary.blockers).length,
    call_count:
      asNumber(telemetry.call_count) ?? asNumber(tokenDelta.calls) ?? asNumber(summary.openai_call_count),
    total_tokens:
      asNumber(telemetry.total_tokens) ?? asNumber(tokenDelta.totalTokens),
    estimated_cost_usd:
      asNumber(telemetry.estimated_cost_usd) ?? asNumber(tokenDelta.costUsd),
    estimated_cost_cad:
      asNumber(telemetry.estimated_cost_cad) ?? asNumber(tokenDelta.costCad),
    duration_ms: asNumber(telemetry.duration_ms),
    hero_image_present: existsSync(path.join(runFolder, "cover-hero-master-2e4893d5c3c2.png")) ||
      existsSync(path.join(runFolder, "12-master-docx-preview.docx")) &&
        Boolean(asRecord(readJsonIfExists(path.join(runFolder, "120-master-docx-manifest.json"))).has_cover_visual),
    stale_content_detected: asBoolean(staleScan.stale_content_detected) ?? asBoolean(summary.stale_content_detected),
    mutable_latest_path_count:
      asNumber(staleScan.mutable_latest_path_count) ?? asNumber(summary.mutable_latest_path_count),
    step_telemetry: loadStepTimings(runFolder),
  };
}

function buildStepTimingComparison(
  previous: ReturnType<typeof loadRunMetrics>["step_telemetry"]["steps"],
  current: ReturnType<typeof loadRunMetrics>["step_telemetry"]["steps"],
) {
  const previousByStep = new Map(previous.map((step) => [step.step_id, step]));
  const currentByStep = new Map(current.map((step) => [step.step_id, step]));
  const stepIds = Array.from(new Set([...previousByStep.keys(), ...currentByStep.keys()]));

  return stepIds.map((stepId) => {
    const previousStep = previousByStep.get(stepId) ?? null;
    const currentStep = currentByStep.get(stepId) ?? null;

    return {
      pipeline_stage: currentStep?.pipeline_stage ?? previousStep?.pipeline_stage ?? null,
      step_id: stepId,
      step_name: currentStep?.step_name ?? previousStep?.step_name ?? stepId,
      previous_duration_ms: previousStep?.duration_ms ?? null,
      current_duration_ms: currentStep?.duration_ms ?? null,
      duration_ms_delta: metricDelta(currentStep?.duration_ms ?? null, previousStep?.duration_ms ?? null),
      previous_call_count: previousStep?.call_count ?? null,
      current_call_count: currentStep?.call_count ?? null,
      call_count_delta: metricDelta(currentStep?.call_count ?? null, previousStep?.call_count ?? null),
      previous_total_tokens: previousStep?.total_tokens ?? null,
      current_total_tokens: currentStep?.total_tokens ?? null,
      total_tokens_delta: metricDelta(currentStep?.total_tokens ?? null, previousStep?.total_tokens ?? null),
      previous_estimated_cost_usd: previousStep?.estimated_cost_usd ?? null,
      current_estimated_cost_usd: currentStep?.estimated_cost_usd ?? null,
      estimated_cost_usd_delta: metricDelta(
        currentStep?.estimated_cost_usd ?? null,
        previousStep?.estimated_cost_usd ?? null,
      ),
      current_warning_count: currentStep?.warning_count ?? null,
      current_blocker_count: currentStep?.blocker_count ?? null,
    };
  });
}

export function buildDiagnosticRunComparison(input: {
  previousRunFolder: string;
  currentRunFolder: string;
}) {
  const previous = loadRunMetrics(input.previousRunFolder);
  const current = loadRunMetrics(input.currentRunFolder);
  const step_timing_comparison = buildStepTimingComparison(
    previous.step_telemetry.steps,
    current.step_telemetry.steps,
  );

  return {
    artifact_type: "diagnostic_run_comparison",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    previous,
    current,
    deltas: {
      source_count: metricDelta(current.source_count, previous.source_count),
      evidence_unit_count: metricDelta(current.evidence_unit_count, previous.evidence_unit_count),
      reduced_evidence_unit_count: metricDelta(
        current.reduced_evidence_unit_count,
        previous.reduced_evidence_unit_count,
      ),
      direct_quote_count: metricDelta(current.direct_quote_count, previous.direct_quote_count),
      sections_with_evidence_ids: metricDelta(
        current.sections_with_evidence_ids,
        previous.sections_with_evidence_ids,
      ),
      section_evidence_binding_score: metricDelta(
        current.section_evidence_binding_score,
        previous.section_evidence_binding_score,
      ),
      master_docx_qa_score: metricDelta(current.master_docx_qa_score, previous.master_docx_qa_score),
      institutional_docx_qa_score: metricDelta(
        current.institutional_docx_qa_score,
        previous.institutional_docx_qa_score,
      ),
      master_word_failures: metricDelta(current.master_word_failures, previous.master_word_failures),
      warning_count: metricDelta(current.warning_count, previous.warning_count),
      blocker_count: metricDelta(current.blocker_count, previous.blocker_count),
      call_count: metricDelta(current.call_count, previous.call_count),
      total_tokens: metricDelta(current.total_tokens, previous.total_tokens),
      estimated_cost_usd: metricDelta(current.estimated_cost_usd, previous.estimated_cost_usd),
      estimated_cost_cad: metricDelta(current.estimated_cost_cad, previous.estimated_cost_cad),
      duration_ms: metricDelta(current.duration_ms, previous.duration_ms),
      mutable_latest_path_count: metricDelta(
        current.mutable_latest_path_count,
        previous.mutable_latest_path_count,
      ),
    },
    step_timing_comparison,
    step_timing_metadata: {
      previous_granularity: previous.step_telemetry.timing_granularity,
      current_granularity: current.step_telemetry.timing_granularity,
      previous_note: previous.step_telemetry.timing_note,
      current_note: current.step_telemetry.timing_note,
    },
    verdict: {
      production_still_blocked: current.production_eligible === false,
      docx_qa_preserved:
        (current.master_docx_qa_score ?? 0) >= (previous.master_docx_qa_score ?? 0) &&
        (current.institutional_docx_qa_score ?? 0) >=
          (previous.institutional_docx_qa_score ?? 0),
      cost_increased:
        current.estimated_cost_usd !== null &&
        previous.estimated_cost_usd !== null &&
        current.estimated_cost_usd > previous.estimated_cost_usd,
      stale_content_regression: current.stale_content_detected === true,
      reduced_pack_present: current.reduced_evidence_unit_count !== null,
    },
  };
}

function renderReport(comparison: ReturnType<typeof buildDiagnosticRunComparison>) {
  const stepTimingRows = comparison.step_timing_comparison.length
    ? [
        "| Lab | Step | Previous ms | Current ms | Delta ms | Current calls | Current tokens | Current cost USD |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ...comparison.step_timing_comparison.map((step) => {
          return [
            step.pipeline_stage ?? "n/a",
            step.step_name,
            step.previous_duration_ms ?? "n/a",
            step.current_duration_ms ?? "n/a",
            step.duration_ms_delta ?? "n/a",
            step.current_call_count ?? "n/a",
            step.current_total_tokens ?? "n/a",
            step.current_estimated_cost_usd ?? "n/a",
          ].join(" | ");
        }).map((row) => `| ${row} |`),
        "",
        `Previous timing granularity: ${comparison.step_timing_metadata.previous_granularity ?? "n/a"}.`,
        `Current timing granularity: ${comparison.step_timing_metadata.current_granularity ?? "n/a"}.`,
        `Note: ${comparison.step_timing_metadata.current_note ?? "Step timings reflect the granularity currently emitted by the runner telemetry."}`,
      ]
    : ["No step telemetry was available for these run folders."];

  const lines = [
    "# Run Comparison Report",
    "",
    `Previous: ${comparison.previous.run_folder}`,
    `Current: ${comparison.current.run_folder}`,
    "",
    "## Key Deltas",
    "",
    `- production_eligible: ${comparison.previous.production_eligible} -> ${comparison.current.production_eligible}`,
    `- evidence units: ${comparison.previous.evidence_unit_count} -> ${comparison.current.evidence_unit_count}`,
    `- reduced evidence units: ${comparison.previous.reduced_evidence_unit_count ?? "n/a"} -> ${comparison.current.reduced_evidence_unit_count ?? "n/a"}`,
    `- section evidence binding score: ${comparison.previous.section_evidence_binding_score ?? "n/a"} -> ${comparison.current.section_evidence_binding_score ?? "n/a"}`,
    `- master DOCX QA: ${comparison.previous.master_docx_qa_score ?? "n/a"} -> ${comparison.current.master_docx_qa_score ?? "n/a"}`,
    `- institutional DOCX QA: ${comparison.previous.institutional_docx_qa_score ?? "n/a"} -> ${comparison.current.institutional_docx_qa_score ?? "n/a"}`,
    `- OpenAI calls: ${comparison.previous.call_count ?? "n/a"} -> ${comparison.current.call_count ?? "n/a"}`,
    `- estimated cost USD: ${comparison.previous.estimated_cost_usd ?? "n/a"} -> ${comparison.current.estimated_cost_usd ?? "n/a"}`,
    `- duration ms: ${comparison.previous.duration_ms ?? "n/a"} -> ${comparison.current.duration_ms ?? "n/a"}`,
    `- stale content detected: ${comparison.previous.stale_content_detected} -> ${comparison.current.stale_content_detected}`,
    "",
    "## Step Timing Comparison",
    "",
    ...stepTimingRows,
    "",
    "## Verdict",
    "",
    `- production_still_blocked: ${comparison.verdict.production_still_blocked}`,
    `- docx_qa_preserved: ${comparison.verdict.docx_qa_preserved}`,
    `- cost_increased: ${comparison.verdict.cost_increased}`,
    `- stale_content_regression: ${comparison.verdict.stale_content_regression}`,
    `- reduced_pack_present: ${comparison.verdict.reduced_pack_present}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function parseArgs(args = process.argv.slice(2)) {
  let previousRunFolder: string | null = null;
  let currentRunFolder: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--previous" && next) {
      previousRunFolder = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--current" && next) {
      currentRunFolder = path.resolve(next);
      index += 1;
    }
  }

  if (!previousRunFolder || !currentRunFolder) {
    throw new Error("Usage: tsx scripts/compare-diagnostic-runs.ts --previous <run-folder> --current <run-folder>");
  }

  return { previousRunFolder, currentRunFolder };
}

function isDirectCliRun() {
  return process.argv[1] ? path.resolve(process.argv[1]).endsWith("compare-diagnostic-runs.ts") : false;
}

if (isDirectCliRun()) {
  const options = parseArgs();
  const comparison = buildDiagnosticRunComparison(options);
  mkdirSync(options.currentRunFolder, { recursive: true });
  writeFileSync(
    path.join(options.currentRunFolder, "run-comparison-summary.json"),
    `${JSON.stringify(comparison, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(options.currentRunFolder, "RUN_COMPARISON_REPORT.md"),
    renderReport(comparison),
    "utf8",
  );
  console.log(JSON.stringify({
    current: comparison.current.run_folder,
    production_eligible: comparison.current.production_eligible,
    reduced_evidence_unit_count: comparison.current.reduced_evidence_unit_count,
    master_docx_qa_score: comparison.current.master_docx_qa_score,
    institutional_docx_qa_score: comparison.current.institutional_docx_qa_score,
    cost_usd_delta: comparison.deltas.estimated_cost_usd,
    duration_ms_delta: comparison.deltas.duration_ms,
  }, null, 2));
}
