import type { ReferenceScoreBreakdown } from "./reference-search-v2";

export const REFERENCE_ADMISSION_POLICY_VERSION = "reference-admission-v1";

export type ReferenceAdmissionState =
  | "ADMITTED"
  | "NEEDS_INSPECTION"
  | "REJECTED_OFF_TOPIC";

export type ReferenceAdmission = {
  policyVersion: typeof REFERENCE_ADMISSION_POLICY_VERSION;
  state: ReferenceAdmissionState;
  reasons: string[];
};

// Contextual to the search intent: quality, access, citation and recency bonuses
// are deliberately not sufficient evidence of scientific relevance.
export function decideReferenceAdmission(input: {
  title: string | null;
  abstract: string | null;
  score: number | null;
  breakdown: ReferenceScoreBreakdown | null;
}): ReferenceAdmission {
  const decision = (state: ReferenceAdmissionState, reason: string): ReferenceAdmission => ({
    policyVersion: REFERENCE_ADMISSION_POLICY_VERSION,
    state,
    reasons: [reason],
  });
  const breakdown = input.breakdown;
  if (!breakdown) return decision("NEEDS_INSPECTION", "RELEVANCE_CONTEXT_UNAVAILABLE");

  const necessary = breakdown.necessaryMatches.length;
  const complementary = breakdown.complementaryMatches.length;
  const optional = breakdown.optionalMatches.length;
  const hasTitle = Boolean(input.title?.trim());
  const hasAbstract = Boolean(input.abstract?.trim());

  if (necessary === 0) {
    // A title/abstract with no core signal is affirmative evidence against a
    // recommendation. Sparse metadata is uncertainty, not irrelevance.
    if (hasTitle && (hasAbstract || input.score === 0) && complementary === 0) {
      return decision("REJECTED_OFF_TOPIC", "NO_CORE_OR_COMPLEMENTARY_COVERAGE");
    }
    return decision("NEEDS_INSPECTION", optional > 0
      ? "OPTIONAL_MATCH_ONLY"
      : "CORE_RELEVANCE_UNRESOLVED");
  }

  if (input.score === 0) {
    return decision("NEEDS_INSPECTION", "CORE_MATCH_WITH_CONFLICTING_SIGNALS");
  }
  if (hasAbstract || necessary >= 2 || (necessary >= 1 && complementary >= 1 && hasTitle)) {
    return decision("ADMITTED", complementary > 0
      ? "CORE_AND_COMPLEMENTARY_MATCH"
      : "CORE_MATCH_IN_SOURCE_METADATA");
  }
  return decision("NEEDS_INSPECTION", "INSUFFICIENT_SOURCE_METADATA");
}

export function admittedOnly<T extends { admission: ReferenceAdmission }>(items: T[]): T[] {
  return items.filter((item) => item.admission.state === "ADMITTED");
}
