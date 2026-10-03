import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { evidenceContextForPhase, generationBudget, SCIENTIFIC_MODEL } from "./generation-budgets";
import type { ScientificDecisionBundle } from "./scientific-decision-service";

export const MANDATORY_COMPOSITION_PHASES = ["evidence_synthesis", "problem_definition", "conceptual_framework", "methodology", "consistency_matrix", "cross_section_review", "final_title", "executive_summary"] as const;

export function wholeJobCostEquation(input: { knownSpent: number; unknownReserved: number; nextStageReservation: number;
  minimumRemainingMandatoryReservation: number; safetyReserve: number; hardCap: number }) {
  const projectedCommitment = input.knownSpent + input.unknownReserved + input.nextStageReservation +
    input.minimumRemainingMandatoryReservation + input.safetyReserve;
  return { projectedCommitment, allowed: Number.isFinite(projectedCommitment) && projectedCommitment <= input.hardCap };
}

export function mandatoryCompositionReservationFloor(bundle: ScientificDecisionBundle, alternativeId: string) {
  const alternative = bundle.decision.alternatives.find((item) => item.id === alternativeId);
  if (!alternative) throw new Error("WHOLE_JOB_FORECAST_ALTERNATIVE_MISSING");
  // Frozen intent, chosen design and inspected evidence are unavoidable input.
  // Generated upstream prose is not yet known, so this is a lower bound, not a
  // provider invoice or a guarantee that later full request bounds will fit.
  const evidence = bundle.evidence_pack.items.map((item) => ({ source_id: item.source_id, evidence_id: item.evidence_id,
    section_key: item.section, summary: item.summary, allowed_use: item.allowed_use }));
  const requiredMethodSupport = new Set(alternative.research_design.methodological_support
    .map((item) => `${item.source_id}:${item.evidence_id}`));
  return MANDATORY_COMPOSITION_PHASES.map((phase) => {
    const frozenMinimum = JSON.stringify({ intent: bundle.intent,
      definition: alternative.definition, researchDesign: alternative.research_design,
      evidence: evidenceContextForPhase(phase, evidence, phase === "methodology" ? requiredMethodSupport : new Set()) });
    const bound = responseCostBound({ model: SCIENTIFIC_MODEL, input: frozenMinimum,
      max_output_tokens: generationBudget(phase, "latam-compact-v1").max_output_tokens });
    if (!bound) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
    return { stage: phase, model: SCIENTIFIC_MODEL, inputFloorTokens: bound.inputTokens,
      maxOutputTokens: generationBudget(phase, "latam-compact-v1").max_output_tokens,
      minimumReservationUsd: bound.maximumUsd };
  });
}

export function designSupportRemainingForecast(bundle: ScientificDecisionBundle, alternativeId: string,
  patch: { model: string; max_output_tokens: number }, critic: { model: string; max_output_tokens: number }) {
  const remaining = mandatoryCompositionReservationFloor(bundle, alternativeId).reduce((sum, phase) => sum + phase.minimumReservationUsd, 0);
  const input = JSON.stringify(bundle.intent);
  const repair = responseCostBound({ model: patch.model, input, max_output_tokens: patch.max_output_tokens });
  const review = responseCostBound({ model: critic.model, input, max_output_tokens: critic.max_output_tokens });
  if (!repair || !review) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
  return remaining + repair.maximumUsd + review.maximumUsd;
}
