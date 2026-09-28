import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import type { SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { CANDIDATE_SEMANTIC_REVIEW_PROMPT_V2 } from "@/server/mvp/prompts/candidate-semantic-review.v2";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { candidateReviewSchema, prepareCandidateReview, validateCandidateReviews, type ReviewCandidate } from "./candidate-review-policy";

export function candidateReviewModel() { return process.env.SOURCE_CANDIDATE_REVIEW_MODEL?.trim() || "gpt-5.4-mini"; }
export async function reviewCandidateBatch(input: SemanticPlannerInput, plan: ScientificConceptPlan, candidates: ReviewCandidate[], provider: Pick<LlmProvider, "generateStructuredObject">, exclusions: string[] = []) {
  const prepared = prepareCandidateReview(candidates, plan, exclusions);
  const trace = { policyVersion: "candidate-semantic-review.v2", promptVersion: CANDIDATE_SEMANTIC_REVIEW_PROMPT_V2.version,
    model: candidateReviewModel(), searchIntentHash: input.searchIntentHash, batchIds: prepared.batches.map(b => b.map(c => c.candidateId)),
    deferredIds: prepared.deferredIds, status: "NOT_NEEDED", failureCategory: null as string | null, latencyMs: 0,
    batches: [] as Array<{ requested: number; validated: number; itemFailures: number; systemicFailure: string | null; latencyMs: number }>,
    itemValidation: [] as Array<{ candidateId: string; status: string }> };
  if (!prepared.batches.length) return { ...prepared, trace };
  const start = Date.now();
  const signals = input.signals.filter(s => s.knowledge === "KNOWN" && s.value && s.provenance?.acceptance === "ACCEPTED" && s.provenance.origin !== "SYSTEM_DEFAULT");
  for (const batch of prepared.batches) {
    const batchStart = Date.now();
    try {
      const raw = await provider.generateStructuredObject({ model: candidateReviewModel(), reasoningEffort: "low", maxOutputTokens: 14000,
        schemaName: "candidate_semantic_review_v2", schema: z.toJSONSchema(candidateReviewSchema),
        prompt: renderVersionedPrompt(CANDIDATE_SEMANTIC_REVIEW_PROMPT_V2, { var_0: JSON.stringify(signals.map(({ sourceField, value, role, tier }) => ({ sourceField, value, role, tier }))),
          var_1: JSON.stringify(batch.map(({ candidateId, title, abstract, year, authors, venue, workType, query, deterministicSignals, reviewTask, evidenceUnits }) =>
            ({ candidateId, title, abstractAvailable: Boolean(abstract), year, authors, venue, workType, query, deterministicSignals, reviewTask, evidenceUnits }))) }),
        trackingLabel: "structured:candidate_semantic_review", trackingAttribution: { stage: "source_discovery", promptVersion: CANDIDATE_SEMANTIC_REVIEW_PROMPT_V2.version },
      });
      const validated = validateCandidateReviews(raw, batch, candidates, signals.map(s => s.sourceField), input.searchIntentHash, prepared.assessments);
      for (const [id, a] of validated.assessments) prepared.assessments.set(id, a);
      for (const [candidateId, status] of validated.statuses) trace.itemValidation.push({ candidateId, status });
      trace.batches.push({ requested: batch.length, validated: validated.assessments.size,
        itemFailures: [...validated.statuses.values()].filter(status => status !== "VALID").length, systemicFailure: null, latencyMs: Date.now() - batchStart });
      trace.status = trace.batches.some(b => b.itemFailures) ? "PARTIAL" : "COMPLETED";
    } catch (error) {
      trace.status = "DEGRADED";
      trace.failureCategory = error instanceof Error && /^REVIEW_[A-Z_]+$/.test(error.message) ? error.message : "REVIEW_UNAVAILABLE_OR_INVALID";
      trace.batches.push({ requested: batch.length, validated: 0, itemFailures: 0, systemicFailure: trace.failureCategory, latencyMs: Date.now() - batchStart });
      break; // Systemic failure: no second paid call.
    }
  }
  trace.latencyMs = Date.now() - start;
  return { ...prepared, trace };
}
