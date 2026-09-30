import { enrichmentGroups, fallbackSearchEnrichment, semanticQueryPack, type SearchEnrichment, type SemanticPlannerInput } from "./retrieval-semantic-plan";
import { validateScientificQueryPlan } from "./retrieval-query-composition";

export type SearchPlanningFailure = "REAL_USER_CLARIFICATION_REQUIRED" | "SEARCH_ENRICHMENT_INVALID" |
  "QUERY_PLAN_INVALID" | "SCIENTIFIC_QUERY_VALIDATION_FAILED" | "PLANNER_OUTPUT_INVALID" |
  "PROVIDER_UNAVAILABLE" | "INTERNAL_SEARCH_PLANNING_ERROR";

export class SearchPlanningError extends Error {
  constructor(readonly code: SearchPlanningFailure) { super(code); }
}

export function validateSearchPlan(enrichment: SearchEnrichment) {
  const groups = enrichmentGroups(enrichment);
  const pack = semanticQueryPack(groups);
  const scientificReasons = validateScientificQueryPlan(pack);
  const failure: SearchPlanningFailure | null = enrichment.status !== "READY" ? "SEARCH_ENRICHMENT_INVALID" :
    !pack.validation.valid ? "QUERY_PLAN_INVALID" : scientificReasons.length ? "SCIENTIFIC_QUERY_VALIDATION_FAILED" : null;
  return { groups, pack, failure, reasons: [...pack.validation.reasons, ...scientificReasons] };
}

// A rejected semantic composition is an internal planning result, not evidence
// that the user must answer another question. The fallback uses existing anchors.
export function chooseSafeSearchPlan(input: SemanticPlannerInput, semantic: SearchEnrichment) {
  if (input.readiness !== "READY") throw new SearchPlanningError("REAL_USER_CLARIFICATION_REQUIRED");
  const first = validateSearchPlan(semantic);
  if (!first.failure) return { enrichment: semantic, ...first, degraded: semantic.planMode === "DEGRADED", degradationReason: semantic.reasonCodes[0] ?? null };
  const fallback = fallbackSearchEnrichment(input, first.failure);
  const second = validateSearchPlan(fallback);
  if (second.failure) throw new SearchPlanningError(second.failure);
  return { enrichment: fallback, ...second, degraded: true, degradationReason: first.failure };
}
