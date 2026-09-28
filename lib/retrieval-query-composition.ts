import type { SemanticKeywordGroup } from "./retrieval-semantic-plan";
import { containsConcept, conceptWordCount, highAuthorityTerms, normalizeConcept, type ScientificConcept, type ScientificConceptPlan } from "./retrieval-scientific-concepts";

export const QUERY_COMPOSITION_VERSION = "scientific-query-composition.v5";
export type QueryFamily = "CORE_PHENOMENON" | "OBJECT_OR_SYSTEM" | "METHOD_PRECEDENT" | "RESEARCH_ACTION_PRECEDENT" | "THEORETICAL_OR_MECHANISTIC" | "CONTEXTUAL_OR_LOCAL";
export type ScientificQuery = {
  id: string; family: QueryFamily; familyType: QueryFamily; purpose: string;
  relaxationLevel: 0 | 1 | 2 | 3; requiredConcepts: string[]; refiners: string[]; sourceFields: string[];
  requiredConceptIds: string[]; optionalConceptIds: string[]; refinerConceptIds: string[];
  sourceFieldRefs: string[]; language: "original" | "original+en";
  translationStatus: "ENGLISH_COMPLETE" | "ORIGINAL_ONLY_ENGLISH_INCOMPLETE";
  whyValid: string[]; query: string; reason: string;
};
type Groups = { necessary: SemanticKeywordGroup[]; complementary: SemanticKeywordGroup[]; optional: SemanticKeywordGroup[]; conceptPlan?: ScientificConceptPlan };
// A generic research verb supplies intent, but not a scientific phenomenon.
export const genericResearchAction = (c: ScientificConcept) => c.role === "RESEARCH_ACTION" && /^(?:determine|determinar|assess|evaluar|evaluate|evaluation|evaluacion|study|estudiar|investigate|investigar|understand|comprender|design|diseno|analyse|analyze|analizar|compare|comparar|validate|validar)$/.test(normalizeConcept(c.value));
// A bare research verb is intent, not science. A grounded compound action
// such as "seismic simulation" can still identify a scientific process.
const science = (c: ScientificConcept) => ["PHENOMENON", "CORE_CONCEPT"].includes(c.role) ||
  c.role === "RESEARCH_ACTION" && conceptWordCount(c.value) > 1 && !genericResearchAction(c);
const domain = (c: ScientificConcept) => ["OBJECT_OR_SYSTEM", "CORE_CONCEPT"].includes(c.role);
const central = (c: ScientificConcept) => c.authority === "CENTRAL" && highAuthorityTerms(c).length > 0;
const precedentUsable = (c: ScientificConcept) => c.authority !== "EXPLORATORY" && highAuthorityTerms(c).length > 0 && ["METHOD_OR_TECHNIQUE", "THEORY_OR_FRAMEWORK"].includes(c.role);
function renderFamilyQuery(q: ScientificQuery, plan: ScientificConceptPlan) {
  const quote = (s: string) => `"${s.replace(/["(){}\n\r\\]/g, " ").trim()}"`;
  return [...q.requiredConceptIds, ...q.refinerConceptIds].map(id => {
    const concept = plan.concepts.find(c => c.id === id);
    if (!concept) return "";
    return `(${[...new Set(highAuthorityTerms(concept).filter(t => t.expansionType === "EXACT_ORIGINAL" || (q.language === "original+en" && t.language === "en")).map(t => t.value))].slice(0, 4).map(quote).join(" OR ")})`;
  }).join(" AND ");
}

export function validateScientificFamily(q: ScientificQuery, plan: ScientificConceptPlan): string[] {
  const byId = new Map(plan.concepts.map(c => [c.id, c]));
  const required = q.requiredConceptIds.map(id => byId.get(id));
  const reasons: string[] = [];
  if (required.length < 2 || required.some(c => !c || !c.known || !c.traceable || (!central(c) && !precedentUsable(c)))) return ["CENTRAL_TERMS_NOT_ELIGIBLE"];
  const anchors = required as ScientificConcept[];
  if (anchors.some((c, i) => normalizeConcept(c.value) !== normalizeConcept(q.requiredConcepts[i] ?? ""))) reasons.push("CONCEPT_ID_VALUE_MISMATCH");
  const precedent = q.family === "METHOD_PRECEDENT" ? "METHOD_OR_TECHNIQUE" : q.family === "THEORETICAL_OR_MECHANISTIC" ? "THEORY_OR_FRAMEWORK" : null;
  const scientific = anchors.filter(c => precedent ? c.role === precedent : science(c));
  const domains = anchors.filter(domain);
  if (!scientific.length) reasons.push("SCIENTIFIC_ANCHOR_MISSING");
  const genericActions = anchors.filter(c => c.role === "RESEARCH_ACTION" && !science(c));
  if (genericActions.length) reasons.push("RESEARCH_ACTION_IS_OPTIONAL_REFINER");
  if (genericActions.length && !scientific.length) reasons.push("GENERIC_ACTION_NOT_SCIENTIFIC_ANCHOR");
  if (q.family === "RESEARCH_ACTION_PRECEDENT" && !anchors.some(c => ["PHENOMENON", "CORE_CONCEPT"].includes(c.role))) reasons.push("RESEARCH_ACTION_FAMILY_REQUIRES_DOMAIN_IDENTITY");
  if (anchors.some(genericResearchAction) && !anchors.some(c => science(c) && c.role !== "RESEARCH_ACTION")) reasons.push("GENERIC_ACTION_WITHOUT_SCIENTIFIC_IDENTITY");
  if (!domains.length) reasons.push("OBJECT_OR_DOMAIN_ANCHOR_MISSING");
  if (!scientific.some(a => domains.some(b => a.id !== b.id))) reasons.push("INDEPENDENT_SCIENTIFIC_ANCHORS_REQUIRED");
  if (anchors.some(c => ["QUALIFIER", "CONTEXT", "GEOGRAPHY", "TIME_OR_STANDARD"].includes(c.role))) reasons.push("REFINER_PROMOTED_TO_CORE");
  if (plan.objectRequired && !domains.some(c => c.role === "OBJECT_OR_SYSTEM")) reasons.push("ACCEPTED_OBJECT_NOT_REPRESENTED");
  if (q.refinerConceptIds.some(id => !byId.get(id)?.known || !byId.get(id)?.traceable || byId.get(id)!.authority === "EXPLORATORY" || !highAuthorityTerms(byId.get(id)!).length)) reasons.push("UNSUPPORTED_REFINER");
  if (q.optionalConceptIds.some(id => !byId.get(id)?.known || !byId.get(id)?.traceable || byId.get(id)!.authority === "EXPLORATORY")) reasons.push("UNSUPPORTED_OPTIONAL_CONCEPT");
  if (q.language === "original+en" && anchors.some(c => !highAuthorityTerms(c).some(t => t.language === "en"))) reasons.push("CENTRAL_TRANSLATION_MISSING");
  if (anchors.some(c => !highAuthorityTerms(c).some(t => t.expansionType === "EXACT_ORIGINAL"))) reasons.push("ORIGINAL_ANCHOR_MISSING");
  return reasons;
}

export function queryRedundancyReasons(queries: ScientificQuery[]) {
  const reasons: string[] = [];
  for (const [index, q] of queries.entries()) {
    if (q.requiredConcepts.length < 2) reasons.push(`${q.id}:RESEARCH_IDENTITY_TOO_WEAK`);
    if (q.query.length > 900) reasons.push(`${q.id}:QUERY_TOO_LONG`);
    if (q.requiredConcepts.some((a, i) => q.requiredConcepts.some((b, j) => i !== j && containsConcept(a, b)))) reasons.push(`${q.id}:COMPOSITE_AND_ITS_CONSTITUENT`);
    for (const old of queries.slice(0, index)) {
      const a = new Set([...q.requiredConcepts, ...q.refiners].map(normalizeConcept));
      const b = new Set([...old.requiredConcepts, ...old.refiners].map(normalizeConcept));
      const overlap = [...a].filter(x => b.has(x)).length / new Set([...a, ...b]).size;
      if (overlap >= 0.8 || normalizeConcept(q.query) === normalizeConcept(old.query)) reasons.push(`${q.id}:DUPLICATE_COVERAGE`);
      if (q.family === old.family) reasons.push(`${q.id}:DUPLICATE_PURPOSE`);
    }
  }
  if (queries.length > 1 && queries[0].requiredConcepts.some(a => conceptWordCount(a) > 6 && queries.every(q => q.requiredConcepts.some(b => normalizeConcept(a) === normalizeConcept(b))))) reasons.push("UNIVERSAL_LONG_LITERAL");
  return [...new Set(reasons)];
}

export function validateScientificQueryPlan(pack: { conceptPlan?: ScientificConceptPlan; plannedQueries?: ScientificQuery[]; necessaryOnly: string[] }) {
  if (!pack.conceptPlan || !pack.plannedQueries?.length) return ["SCIENTIFIC_ROLE_VALIDATION_REQUIRED"];
  const reasons = pack.plannedQueries.flatMap(q => validateScientificFamily(q, pack.conceptPlan!));
  reasons.push(...queryRedundancyReasons(pack.plannedQueries));
  if (pack.plannedQueries.some(q => q.query !== renderFamilyQuery(q, pack.conceptPlan!))) reasons.push("QUERY_RENDERING_MISMATCH");
  if (JSON.stringify(pack.necessaryOnly) !== JSON.stringify(pack.plannedQueries.map(q => q.query))) reasons.push("QUERY_RENDERING_MISMATCH");
  return [...new Set(reasons)];
}

export function composeSemanticQueries(input: Groups) {
  const plan = input.conceptPlan;
  const plannedQueries: ScientificQuery[] = [];
  const diagnostics: string[] = [];
  const concepts = plan?.concepts ?? [];
  const cores = concepts.filter(central);
  const domains = cores.filter(domain).sort((a, b) => Number(b.role === "OBJECT_OR_SYSTEM") - Number(a.role === "OBJECT_OR_SYSTEM") || conceptWordCount(a.value) - conceptWordCount(b.value) || a.id.localeCompare(b.id));
  const object = domains[0];
  const anchors = cores.filter(c => science(c) && c.id !== object?.id && !containsConcept(object?.value ?? "", c.value) && !containsConcept(c.value, object?.value ?? ""))
    .sort((a, b) => ["PHENOMENON", "CORE_CONCEPT", "RESEARCH_ACTION"].indexOf(a.role) - ["PHENOMENON", "CORE_CONCEPT", "RESEARCH_ACTION"].indexOf(b.role) || Number(b.sourceFields.includes("problem")) - Number(a.sourceFields.includes("problem")) || a.id.localeCompare(b.id));
  const phenomenon = anchors[0];
  const add = (family: QueryFamily, level: ScientificQuery["relaxationLevel"], required: ScientificConcept[], refiners: ScientificConcept[], purpose: string) => {
    if (!plan || plannedQueries.length >= 4) return;
    const all = [...required, ...refiners];
    const english = all.every(c => highAuthorityTerms(c).some(t => t.language === "en"));
    const sourceFields = [...new Set(all.flatMap(c => c.sourceFields))].sort();
    const q: ScientificQuery = { id: `q${plannedQueries.length + 1}`, family, familyType: family, purpose, relaxationLevel: level,
      requiredConcepts: required.map(c => c.value), refiners: refiners.map(c => c.value), sourceFields,
      requiredConceptIds: required.map(c => c.id), optionalConceptIds: [], refinerConceptIds: refiners.map(c => c.id), sourceFieldRefs: sourceFields,
      language: english ? "original+en" : "original", translationStatus: english ? "ENGLISH_COMPLETE" : "ORIGINAL_ONLY_ENGLISH_INCOMPLETE", whyValid: [], query: "", reason: purpose };
    const failures = validateScientificFamily(q, plan);
    if (failures.length) { diagnostics.push(...failures); return; }
    // Never lose a central concept to manufacture an English-only query.
    q.query = renderFamilyQuery(q, plan);
    const duplicates = queryRedundancyReasons([...plannedQueries, q]);
    if (duplicates.length) { diagnostics.push(...duplicates); return; }
    q.whyValid = ["SCIENTIFIC_ANCHOR_PRESENT", "OBJECT_OR_DOMAIN_ANCHOR_PRESENT", "QUALIFIER_NOT_SOLE_ANCHOR", "CENTRAL_TERMS_TRACEABLE", "NO_UNKNOWN_OR_REJECTED_CONTENT", "GROUNDED_TERMS_ONLY", "DISTINCT_PURPOSE_AND_COVERAGE"];
    if (!english) diagnostics.push(`${q.id}:ENGLISH_COVERAGE_INCOMPLETE_OR_UNVERIFIED`);
    plannedQueries.push(q);
  };
  if (phenomenon && object) {
    add("CORE_PHENOMENON", 1, [phenomenon, object], [], "Scientific phenomenon/action and domain; no contextual restriction");
    const qualifiedObject = domains.find(c => c.id !== object.id && c.role === "OBJECT_OR_SYSTEM" && containsConcept(c.value, object.value));
    const qualifier = concepts.find(c => c.role === "QUALIFIER" && c.authority === "REFINER" && c.sourceFields.some(f => ["object", "concepts"].includes(f)));
    // A long qualified object remains available as an optional refinement. Do
    // not require its whole literal phrase when a grounded broader object exists.
    if (qualifiedObject && conceptWordCount(qualifiedObject.value) <= 4) add("OBJECT_OR_SYSTEM", 0, [phenomenon, qualifiedObject], [], "Qualified object, preserving the scientific phenomenon/action");
    else if (qualifiedObject) {
      const coreQuery = plannedQueries[0];
      if (coreQuery) coreQuery.optionalConceptIds.push(qualifiedObject.id);
      diagnostics.push("LONG_OBJECT_PRESERVED_AS_OPTIONAL_REFINEMENT");
    }
    else if (qualifier) add("OBJECT_OR_SYSTEM", 0, [phenomenon, object], [qualifier], "Object qualification, never a replacement for scientific identity");
    const action = cores.find(c => c.role === "RESEARCH_ACTION" && !science(c));
    if (action && plannedQueries[0]) {
      // Adding only a generic verb cannot create a distinct evidence purpose.
      // Keep the action as optional intent metadata, not a provider requirement.
      plannedQueries[0].optionalConceptIds.push(action.id);
      diagnostics.push("REDUNDANT_ACTION_FAMILY_DROPPED");
    }
  }
  if (object) {
    const method = concepts.find(c => c.role === "METHOD_OR_TECHNIQUE" && precedentUsable(c));
    if (method) add("METHOD_PRECEDENT", 2, [method, object], [], "Grounded technique precedent, not a final methodological choice");
    const theory = concepts.find(c => c.role === "THEORY_OR_FRAMEWORK" && precedentUsable(c));
    if (theory) add("THEORETICAL_OR_MECHANISTIC", 3, [theory, object], [], "Grounded theoretical precedent with domain anchor");
    const context = concepts.filter(c => ["CONTEXT", "GEOGRAPHY", "TIME_OR_STANDARD"].includes(c.role) && c.authority === "REFINER" && c.sourceFields.includes("context"))
      .sort((a, b) => Number(a.role === "TIME_OR_STANDARD") - Number(b.role === "TIME_OR_STANDARD") || conceptWordCount(a.value) - conceptWordCount(b.value))[0];
    if (context && phenomenon) add("CONTEXTUAL_OR_LOCAL", 3, [phenomenon, object], [context], "Separate contextual branch; premises and standards remain unverified");
  }
  const reasons = !plan ? ["SCIENTIFIC_ROLE_VALIDATION_REQUIRED"] : !plannedQueries.length ? ["NEEDS_SCIENTIFIC_ANCHORS"] : queryRedundancyReasons(plannedQueries);
  return { compositionVersion: QUERY_COMPOSITION_VERSION, conceptPlan: plan, plannedQueries,
    necessaryOnly: plannedQueries.map(q => q.query), complementaryBoosted: [] as string[], optionalBackups: [] as string[],
    coverageMode: plannedQueries.some(q => q.translationStatus === "ENGLISH_COMPLETE") ? "MULTILINGUAL" : "DEGRADED_ORIGINAL_LANGUAGE",
    validation: { valid: reasons.length === 0, reasons, diagnostics } };
}
