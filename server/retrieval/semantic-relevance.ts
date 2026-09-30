import { normalizeSearchText, type SemanticKeywordGroup } from "@/lib/retrieval-semantic-plan";
export const SEMANTIC_ADMISSION_VERSION = "role-admission.v1";
export type SemanticRelevance = {
  policyVersion: typeof SEMANTIC_ADMISSION_VERSION;
  classification: "HIGH_RELEVANCE" | "POTENTIALLY_USEFUL" | "INSUFFICIENT_METADATA" | "OFF_TOPIC";
  role: "DIRECT" | "METHODOLOGICAL" | "THEORETICAL" | "CONTEXTUAL" | null;
  matchedGroups: string[]; supportingEvidence: Array<{ group: string; term: string; location: "TITLE" | "ABSTRACT" }>;
  reasons: string[];
};
function matches(text: string, term: string) {
  return (` ${normalizeSearchText(text)} `).includes(` ${normalizeSearchText(term)} `);
}
export function assessSemanticRelevance(input: {
  title: string; abstract: string | null;
  explicitExclusions?: string[];
  groups: { necessary: SemanticKeywordGroup[]; complementary: SemanticKeywordGroup[]; optional: SemanticKeywordGroup[] };
}): SemanticRelevance {
  const evidence: SemanticRelevance["supportingEvidence"] = [];
  const matched = [...input.groups.necessary, ...input.groups.complementary].filter(group => {
    for (const term of group.variants) {
      const location = matches(input.title, term) ? "TITLE" : input.abstract && matches(input.abstract, term) ? "ABSTRACT" : null;
      if (location) { evidence.push({ group: group.label, term, location }); return true; }
    }
    return false;
  });
  const core = matched.filter(g => g.authority === "CENTRAL");
  const problem = core.some(g => g.role === "PROBLEM" || g.role === "CONCEPT");
  const object = core.some(g => g.role === "OBJECT" || g.role === "CONCEPT");
  const independent = new Set(core.map(g => normalizeSearchText(g.anchor))).size >= 2;
  // Scientific role indicators describe the source, not an imposed project method.
  const text = normalizeSearchText(`${input.title} ${input.abstract ?? ""}`);
  const method = /\b(method(?:s|ology|ological)?|metodo(?:s|logia|logico)?|model(?:s|ing|ling)?|modelado|ensayo|experimental|experiment|testing|simulation|simulacion)\b/.test(text);
  const theory = /\b(theory|theoretical|teoria|teorico|conceptual|framework|marco)\b/.test(text);
  const decide = (classification: SemanticRelevance["classification"], role: SemanticRelevance["role"], reason: string): SemanticRelevance => ({
    policyVersion: SEMANTIC_ADMISSION_VERSION, classification, role, matchedGroups: matched.map(g => g.label), supportingEvidence: evidence, reasons: [reason],
  });
  if ((input.explicitExclusions ?? []).some(exclusion => matches(input.title, exclusion))) {
    return decide("OFF_TOPIC", null, "EXPLICIT_EXCLUSION_IN_TITLE");
  }
  if (!input.abstract?.trim()) return decide("INSUFFICIENT_METADATA", null, "ABSTRACT_REQUIRED_FOR_HIGH_CONFIDENCE");
  if (problem && object && independent) {
    return decide("HIGH_RELEVANCE", method ? "METHODOLOGICAL" : theory ? "THEORETICAL" : "DIRECT", "INDEPENDENT_CORE_SIGNALS_IN_TITLE_ABSTRACT");
  }
  if (core.length) return decide("POTENTIALLY_USEFUL", null, "PARTIAL_CORE_SUPPORT_REQUIRES_INSPECTION");
  if (matched.length) return decide("POTENTIALLY_USEFUL", "CONTEXTUAL", "REFINEMENT_ONLY_NOT_HIGH_RELEVANCE");
  // No lexical evidence alone cannot prove a semantic contradiction. Keep the
  // historical 2A rejection path, but new rich-input candidates stay reviewable.
  return decide("INSUFFICIENT_METADATA", null, "NO_SUPPORTED_CORE_MATCH");
}
