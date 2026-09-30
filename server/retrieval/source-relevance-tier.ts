import type { RelevanceTier } from "@/lib/source-sufficiency-policy";
import type { CandidateAssessment } from "./candidate-review-policy";

/** A user selection never changes this assessment. Partial admission remains partial. */
export function sourceRelevanceTier(assessment: CandidateAssessment | null | undefined,
  identityResolved: boolean): RelevanceTier {
  if (!identityResolved || !assessment || !assessment.searchIntentHash || !assessment.metadataHash ||
      !assessment.evidence.length || assessment.role === "NONE" || assessment.confidence === "LOW") return "EXCLUDED";
  if (["HIGHLY_RELEVANT", "RELEVANT"].includes(assessment.relevance)) return "CORE";
  return assessment.relevance === "PARTIALLY_RELEVANT" ? "EXPLORATORY" : "EXCLUDED";
}
