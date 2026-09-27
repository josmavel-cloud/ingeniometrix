import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import type { SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { CANDIDATE_SEMANTIC_REVIEW_PROMPT } from "@/server/mvp/prompts/candidate-semantic-review.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { candidateReviewSchema, prepareCandidateReview, validateCandidateReviews, type ReviewCandidate } from "./candidate-review-policy";

export function candidateReviewModel() { return process.env.SOURCE_CANDIDATE_REVIEW_MODEL?.trim() || "gpt-5.4-mini"; }
export async function reviewCandidateBatch(input: SemanticPlannerInput, plan: ScientificConceptPlan, candidates: ReviewCandidate[], provider: Pick<LlmProvider, "generateStructuredObject">, exclusions: string[] = []) {
  const prepared = prepareCandidateReview(candidates, plan, exclusions);
  const trace = { policyVersion: "candidate-semantic-review.v1", promptVersion: CANDIDATE_SEMANTIC_REVIEW_PROMPT.version,
    model: candidateReviewModel(), searchIntentHash: input.searchIntentHash, batchIds: prepared.batch.map(c => c.candidateId),
    deferredIds: prepared.deferredIds, status: "NOT_NEEDED", failureCategory: null as string | null, latencyMs: 0 };
  if (!prepared.batch.length) return { ...prepared, trace };
  const start = Date.now();
  try {
    const signals = input.signals.filter(s => s.knowledge === "KNOWN" && s.value && s.provenance?.acceptance === "ACCEPTED" && s.provenance.origin !== "SYSTEM_DEFAULT");
    const raw = await provider.generateStructuredObject({ model: candidateReviewModel(), reasoningEffort: "low", maxOutputTokens: 14000,
      schemaName: "candidate_semantic_review_v1", schema: z.toJSONSchema(candidateReviewSchema),
      prompt: renderVersionedPrompt(CANDIDATE_SEMANTIC_REVIEW_PROMPT, { var_0: JSON.stringify(signals.map(({ sourceField, value, role, tier }) => ({ sourceField, value, role, tier }))), var_1: JSON.stringify(prepared.batch) }),
      trackingLabel: "structured:candidate_semantic_review", trackingAttribution: { stage: "source_discovery", promptVersion: CANDIDATE_SEMANTIC_REVIEW_PROMPT.version },
    });
    const validated = validateCandidateReviews(raw, prepared.batch, candidates, signals.map(s => s.sourceField), input.searchIntentHash);
    for (const [id, a] of validated) prepared.assessments.set(id, a);
    trace.status = "COMPLETED";
  } catch (error) {
    trace.status = "DEGRADED";
    trace.failureCategory = error instanceof Error && /^REVIEW_[A-Z_]+$/.test(error.message) ? error.message : "REVIEW_UNAVAILABLE_OR_INVALID";
  }
  trace.latencyMs = Date.now() - start;
  return { ...prepared, trace };
}
