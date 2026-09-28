import type { SearchEnrichment, SemanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { containsConcept, highAuthorityTerms, type ScientificConcept } from "@/lib/retrieval-scientific-concepts";
import type { CoverageRequirement, IntentAnchor } from "./evidence-gap-contract";

// Linguistic source-category signals only, never a discipline, country or specific instrument.
const normative = /\b(?:norma|normativa|regulation|regulatory|reglamento)\b|\b(?:standard|code)(?:\s+[a-z]{1,10})?\s+\d{2,4}\b|\b(?:official|technical|regulatory|design)\s+(?:standard|code)\b/i;
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function currentCoverageConcepts(input: SemanticPlannerInput, enrichment?: SearchEnrichment) {
  if (!enrichment || enrichment.searchIntentHash !== input.searchIntentHash ||
      enrichment.scientificConceptPlan?.searchIntentHash !== input.searchIntentHash) return [];
  return enrichment.scientificConceptPlan.concepts.filter(c => c.known && c.traceable && c.authority !== "EXPLORATORY" &&
    c.sourceFields.some(f => input.signals.some(s => s.sourceField === f && s.value && containsConcept(s.value, c.value))) &&
    highAuthorityTerms(c).length > 0).sort((a,b) => a.id.localeCompare(b.id));
}
export function deriveCoverageRequirements(input: SemanticPlannerInput, enrichment?: SearchEnrichment): CoverageRequirement[] {
  const concepts = currentCoverageConcepts(input, enrichment);
  const anchors = (cs: ScientificConcept[]): IntentAnchor[] => cs.flatMap(c => c.sourceFields.flatMap(field => {
    const value = input.signals.find(s => s.sourceField === field)?.value;
    return value && containsConcept(value, c.value) ? [{ field, quote: c.value }] : [];
  })).filter((a, i, all) => all.findIndex(b => b.field === a.field && b.quote === a.quote) === i);
  const science = concepts.filter(c => c.authority === "CENTRAL" && ["PHENOMENON", "CORE_CONCEPT"].includes(c.role));
  const domains = concepts.filter(c => c.authority === "CENTRAL" && ["OBJECT_OR_SYSTEM", "CORE_CONCEPT"].includes(c.role));
  const primary = science[0], object = domains.find(c => c.id !== primary?.id);
  const core = [primary, object].filter((c): c is ScientificConcept => Boolean(c));
  const base: CoverageRequirement = {
    type: "OTHER_JUSTIFIED", importance: "MATERIAL", requiredDimension: "Core confirmed scientific identity",
    anchors: anchors(core), conceptGroups: core.map(c => [c.id]),
    desiredEvidenceRole: "DIRECT", acceptedRoles: ["DIRECT", "METHODOLOGICAL", "THEORETICAL"], preferredSourceTypes: ["SCHOLARLY"],
    requiresOfficialAuthority: false, contextualRequirements: [], materialityJustification: "Explicit confirmed scientific identity",
    premise: "RESEARCH_NEED", minimumBasis: "ABSTRACT", decisionOrigin: "CONFIRMED_FIELD_POLICY",
  };
  // No invented decomposition from an unvalidated prose title, and no universal empirical requirement.
  const result: CoverageRequirement[] = core.length === 2 ? [base] : [];
  for (const c of concepts) {
    const refs = anchors([c]);
    if (!refs.length) continue;
    if (c.role === "TIME_OR_STANDARD" && normative.test(normalized(c.value))) {
      const centralNeed = input.signals.some(s => ["purpose", "intendedOutput", "problem"].includes(s.sourceField) && s.value && containsConcept(s.value, c.value));
      result.push({ ...base, type: "STANDARD_OR_CODE", importance: centralNeed ? "MATERIAL" : "SUPPORTING",
        requiredDimension: c.value, anchors: refs, conceptGroups: [[c.id]], desiredEvidenceRole: "CONTEXTUAL",
        acceptedRoles: ["CONTEXTUAL", "DIRECT"], preferredSourceTypes: ["STANDARD_OR_CODE", "OFFICIAL_GOVERNMENT_SOURCE"],
        requiresOfficialAuthority: true, premise: "UNVERIFIED_USER_PREMISE", materialityJustification: "Authoritative corroboration of an explicit normative premise" });
    } else if (core.length === 2 && ["GEOGRAPHY", "CONTEXT", "QUALIFIER"].includes(c.role)) {
      const qualifier = c.role === "QUALIFIER";
      const identityQualifier = qualifier && input.signals.some(s => ["object", "purpose"].includes(s.sourceField) && s.value && containsConcept(s.value, c.value));
      result.push({ ...base, type: qualifier ? "OTHER_JUSTIFIED" : "LOCAL_OR_REGIONAL_CONTEXT",
        importance: identityQualifier ? "MATERIAL" : "SUPPORTING", requiredDimension: c.value,
        anchors: [...base.anchors, ...refs], conceptGroups: [...base.conceptGroups, [c.id]],
        contextualRequirements: qualifier ? [] : [c.value],
        materialityJustification: qualifier ? "Explicit qualifier of the confirmed scientific identity" : "Context applicability requires review; location alone is not a universal requirement" });
    } else if (c.role === "METHOD_OR_TECHNIQUE" && refs.some(a => a.field === "methodPreference")) {
      result.push({ ...base, type: "EXPERIMENTAL_OR_METHOD", requiredDimension: c.value,
        anchors: [...base.anchors, ...refs], conceptGroups: [...base.conceptGroups, [c.id]],
        desiredEvidenceRole: "METHODOLOGICAL", acceptedRoles: ["METHODOLOGICAL", "DIRECT"],
        materialityJustification: "Explicit confirmed methodological preference" });
    }
  }
  // A retrieval planner may have omitted/downgraded a regulatory term. The
  // confirmed premise still exists: inspect the projection independently and
  // retain its complete wording, without inventing a document name or translation.
  if (!result.some(r => r.type === "STANDARD_OR_CODE")) {
    const regulatory = input.signals.filter(s => s.value && normative.test(normalized(s.value)) &&
      ["purpose", "problem", "intendedOutput", "concepts", "context", "constraints", "advisorNotes"].includes(s.sourceField));
    const signal = regulatory.find(s => ["purpose", "problem", "intendedOutput"].includes(s.sourceField)) ?? regulatory[0];
    if (signal?.value) result.push({ ...base, type: "STANDARD_OR_CODE",
      importance: ["purpose", "problem", "intendedOutput"].includes(signal.sourceField) ? "MATERIAL" : "SUPPORTING",
      requiredDimension: signal.value, anchors: [{ field: signal.sourceField, quote: signal.value }], conceptGroups: [],
      desiredEvidenceRole: "CONTEXTUAL", acceptedRoles: ["CONTEXTUAL", "DIRECT"],
      preferredSourceTypes: ["STANDARD_OR_CODE", "OFFICIAL_GOVERNMENT_SOURCE"], requiresOfficialAuthority: true,
      premise: "UNVERIFIED_USER_PREMISE", materialityJustification: "Authoritative corroboration of an explicit confirmed regulatory premise; exact instrument remains unresolved" });
  }
  return result;
}
