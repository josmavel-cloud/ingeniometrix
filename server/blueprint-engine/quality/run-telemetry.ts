import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import { summarizeCitationSemantics } from "@/server/blueprint-engine/quality/citation-semantics";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import { summarizeSourceHealthFromHandoff } from "@/server/blueprint-engine/quality/source-health";

export type RunTelemetryUsageTotals = {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costCad: number;
};

export type RunTelemetryStep = {
  pipeline_stage: "evidence_engine" | "blueprint_engine" | "docx_rendering" | "diagnostic";
  step_id: string;
  step_name: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  openai_called: boolean;
  model_names: string[];
  call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  estimated_cost_cad: number;
  source_count: number | null;
  usable_full_text_source_count: number | null;
  evidence_unit_count: number | null;
  reduced_evidence_unit_count: number | null;
  direct_quote_count: number | null;
  section_count: number | null;
  docx_qa_score: number | null;
  production_eligible: boolean | null;
  diagnostic_compatible: boolean | null;
  warning_count: number;
  blocker_count: number;
};

export type RunTelemetryArtifact = {
  artifact_type: "run_telemetry";
  artifact_version: "v1";
  generated_at: string;
  run_id: string;
  case_id: string | null;
  handoff_id: string | null;
  pipeline_stage: "evidence_engine" | "blueprint_engine" | "combined";
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  openai_called: boolean;
  model_names: string[];
  call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  estimated_cost_cad: number;
  source_count: number;
  usable_full_text_source_count: number;
  evidence_unit_count: number;
  reduced_evidence_unit_count: number | null;
  direct_quote_count: number;
  section_count: number;
  docx_qa_score: number | null;
  production_eligible: boolean;
  diagnostic_compatible: boolean;
  warning_count: number;
  blocker_count: number;
};

export type StepTelemetryArtifact = {
  artifact_type: "step_telemetry";
  artifact_version: "v1";
  generated_at: string;
  run_id: string;
  steps: RunTelemetryStep[];
  totals: {
    duration_ms: number | null;
    openai_called: boolean;
    call_count: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_cad: number;
    warning_count: number;
    blocker_count: number;
  };
};

export const EMPTY_RUN_TELEMETRY_USAGE: RunTelemetryUsageTotals = {
  calls: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  costCad: 0,
};

function roundMoney(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function durationMs(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function usageFromUnknown(value: unknown): RunTelemetryUsageTotals {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    calls: typeof record.calls === "number" ? record.calls : 0,
    inputTokens: typeof record.inputTokens === "number" ? record.inputTokens : 0,
    cachedInputTokens:
      typeof record.cachedInputTokens === "number" ? record.cachedInputTokens : 0,
    outputTokens: typeof record.outputTokens === "number" ? record.outputTokens : 0,
    totalTokens: typeof record.totalTokens === "number" ? record.totalTokens : 0,
    costUsd: typeof record.costUsd === "number" ? record.costUsd : 0,
    costCad: typeof record.costCad === "number" ? record.costCad : 0,
  };
}

export function normalizeUsageDelta(value: unknown): RunTelemetryUsageTotals {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return usageFromUnknown(record.delta ?? value);
}

function directQuoteCount(handoff: EvidenceEngineHandoffV1 | null | undefined) {
  if (!handoff) return 0;
  return summarizeCitationSemantics(handoff.evidence_units).true_source_backed_direct_quote_count;
}

function usableSourceCount(handoff: EvidenceEngineHandoffV1 | null | undefined) {
  if (!handoff) return 0;
  return summarizeSourceHealthFromHandoff(handoff).usable_full_text_source_count;
}

export function buildRunTelemetryArtifact(input: {
  run_id: string;
  case_id?: string | null;
  handoff?: EvidenceEngineHandoffV1 | null;
  pipeline_stage: RunTelemetryArtifact["pipeline_stage"];
  started_at?: string | null;
  completed_at?: string | null;
  usage_delta?: unknown;
  model_names?: string[];
  reduced_evidence_pack?: ReducedEvidencePackV1 | null;
  section_count?: number | null;
  docx_qa_score?: number | null;
  production_eligible?: boolean | null;
  diagnostic_compatible?: boolean | null;
  warning_count?: number;
  blocker_count?: number;
}): RunTelemetryArtifact {
  const usage = normalizeUsageDelta(input.usage_delta);
  const handoff = input.handoff ?? null;

  return {
    artifact_type: "run_telemetry",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    run_id: input.run_id,
    case_id: input.case_id ?? null,
    handoff_id: handoff?.handoff_id ?? null,
    pipeline_stage: input.pipeline_stage,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    duration_ms: durationMs(input.started_at, input.completed_at),
    openai_called: usage.calls > 0,
    model_names: input.model_names ?? [],
    call_count: usage.calls,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    estimated_cost_usd: usage.costUsd,
    estimated_cost_cad: usage.costCad,
    source_count: handoff?.source_registry.length ?? 0,
    usable_full_text_source_count: usableSourceCount(handoff),
    evidence_unit_count: handoff?.evidence_units.length ?? 0,
    reduced_evidence_unit_count:
      input.reduced_evidence_pack?.reduced_counts.evidence_units ?? null,
    direct_quote_count: directQuoteCount(handoff),
    section_count: input.section_count ?? handoff?.section_packets.length ?? 0,
    docx_qa_score: input.docx_qa_score ?? null,
    production_eligible: input.production_eligible ?? false,
    diagnostic_compatible: input.diagnostic_compatible ?? false,
    warning_count: input.warning_count ?? 0,
    blocker_count: input.blocker_count ?? 0,
  };
}

export function buildStepTelemetryArtifact(input: {
  run_id: string;
  steps: RunTelemetryStep[];
}): StepTelemetryArtifact {
  const durationValues = input.steps
    .map((step) => step.duration_ms)
    .filter((value): value is number => typeof value === "number");
  const durationTotal =
    durationValues.length === input.steps.length
      ? durationValues.reduce((sum, value) => sum + value, 0)
      : null;

  return {
    artifact_type: "step_telemetry",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    run_id: input.run_id,
    steps: input.steps,
    totals: {
      duration_ms: durationTotal,
      openai_called: input.steps.some((step) => step.openai_called),
      call_count: input.steps.reduce((sum, step) => sum + step.call_count, 0),
      input_tokens: input.steps.reduce((sum, step) => sum + step.input_tokens, 0),
      cached_input_tokens: input.steps.reduce((sum, step) => sum + step.cached_input_tokens, 0),
      output_tokens: input.steps.reduce((sum, step) => sum + step.output_tokens, 0),
      total_tokens: input.steps.reduce((sum, step) => sum + step.total_tokens, 0),
      estimated_cost_usd: roundMoney(
        input.steps.reduce((sum, step) => sum + step.estimated_cost_usd, 0),
      ),
      estimated_cost_cad: roundMoney(
        input.steps.reduce((sum, step) => sum + step.estimated_cost_cad, 0),
      ),
      warning_count: input.steps.reduce((sum, step) => sum + step.warning_count, 0),
      blocker_count: input.steps.reduce((sum, step) => sum + step.blocker_count, 0),
    },
  };
}

export function buildCoarseStepTelemetry(input: {
  run_id: string;
  completed_steps: string[];
  pipeline_stage: RunTelemetryStep["pipeline_stage"];
  started_at?: string | null;
  completed_at?: string | null;
  usage_delta?: unknown;
  source_count?: number | null;
  usable_full_text_source_count?: number | null;
  evidence_unit_count?: number | null;
  reduced_evidence_unit_count?: number | null;
  direct_quote_count?: number | null;
  section_count?: number | null;
  docx_qa_score?: number | null;
  production_eligible?: boolean | null;
  diagnostic_compatible?: boolean | null;
  warning_count?: number;
  blocker_count?: number;
  model_names?: string[];
}): StepTelemetryArtifact {
  const usage = normalizeUsageDelta(input.usage_delta);
  const completedAt = input.completed_at ?? null;
  const startedAt = input.started_at ?? null;
  const stepCount = Math.max(1, input.completed_steps.length);
  const perStep = {
    calls: usage.calls / stepCount,
    inputTokens: usage.inputTokens / stepCount,
    cachedInputTokens: usage.cachedInputTokens / stepCount,
    outputTokens: usage.outputTokens / stepCount,
    totalTokens: usage.totalTokens / stepCount,
    costUsd: usage.costUsd / stepCount,
    costCad: usage.costCad / stepCount,
  };
  const totalDuration = durationMs(startedAt, completedAt);
  const durationPerStep = totalDuration === null ? null : Math.round(totalDuration / stepCount);

  return buildStepTelemetryArtifact({
    run_id: input.run_id,
    steps: input.completed_steps.map((step, index) => ({
      pipeline_stage: input.pipeline_stage,
      step_id: step,
      step_name: step.replace(/^step_/, "Step ").replace(/_/g, " "),
      started_at: index === 0 ? startedAt : null,
      completed_at: index === input.completed_steps.length - 1 ? completedAt : null,
      duration_ms: durationPerStep,
      openai_called: usage.calls > 0,
      model_names: input.model_names ?? [],
      call_count: Math.round(perStep.calls),
      input_tokens: Math.round(perStep.inputTokens),
      cached_input_tokens: Math.round(perStep.cachedInputTokens),
      output_tokens: Math.round(perStep.outputTokens),
      total_tokens: Math.round(perStep.totalTokens),
      estimated_cost_usd: roundMoney(perStep.costUsd),
      estimated_cost_cad: roundMoney(perStep.costCad),
      source_count: input.source_count ?? null,
      usable_full_text_source_count: input.usable_full_text_source_count ?? null,
      evidence_unit_count: input.evidence_unit_count ?? null,
      reduced_evidence_unit_count: input.reduced_evidence_unit_count ?? null,
      direct_quote_count: input.direct_quote_count ?? null,
      section_count: input.section_count ?? null,
      docx_qa_score: input.docx_qa_score ?? null,
      production_eligible: input.production_eligible ?? null,
      diagnostic_compatible: input.diagnostic_compatible ?? null,
      warning_count: index === input.completed_steps.length - 1 ? input.warning_count ?? 0 : 0,
      blocker_count: index === input.completed_steps.length - 1 ? input.blocker_count ?? 0 : 0,
    })),
  });
}
