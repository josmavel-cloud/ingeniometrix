import { SECTION_BUDGETS } from "./research-plan-contracts";
// Keep scientifically validated models; do not silently downgrade to meet a cap.
export const GENERATION_POLICY_VERSION = "b4.v1";
export const SCIENTIFIC_MODEL = "gpt-5.4";
export function generationBudget(phase: string) {
  const key = phase === "evidence_synthesis" ? "state_of_knowledge" : phase;
  const words = SECTION_BUDGETS[key as keyof typeof SECTION_BUDGETS];
  const maximum = phase === "methodology" ? 6500 : phase === "research_design" ? 6000 : phase === "cross_section_review" ? 3500 : phase === "final_title" ? 1500 : phase === "consistency_matrix" ? 5000 : 4500;
  return { target_words: words?.[0] ?? null, max_words: words?.[1] ?? null, target_output_tokens: Math.floor(maximum * 0.7), max_output_tokens: maximum, evidence_context_budget: 60000, prior_context_budget: 50000 };
}
export function priorSectionsForPhase<T>(phase: string, sections: Record<string, T>) {
  // Coherence/review/title see the full stabilized text. Drafting need not resend
  // unrelated downstream prose; definition/design and inspected evidence remain.
  if (["cross_section_review", "final_title", "executive_summary", "consistency_matrix"].includes(phase)) return sections;
  const keys = phase === "methodology" || phase === "research_design" ? ["problem_definition", "conceptual_framework", "state_of_knowledge"] : ["problem_definition", "state_of_knowledge"];
  return Object.fromEntries(Object.entries(sections).filter(([key]) => keys.includes(key)));
}
