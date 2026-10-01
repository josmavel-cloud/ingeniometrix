import type { DefinitionField } from "./conversational-intake";
import type { SemanticPlannerInput, SearchTerm } from "./retrieval-semantic-plan";

export const SCIENTIFIC_CONCEPT_VERSION = "scientific-concepts.v1";
export const SCIENTIFIC_ROLES = ["PHENOMENON", "RESEARCH_ACTION", "OBJECT_OR_SYSTEM", "CORE_CONCEPT", "METHOD_OR_TECHNIQUE", "THEORY_OR_FRAMEWORK", "CONTEXT", "GEOGRAPHY", "TIME_OR_STANDARD", "QUALIFIER"] as const;
export type ScientificRole = typeof SCIENTIFIC_ROLES[number];
export type ConceptTerm = {
  value: string; language: "original" | "en" | "es" | "pt" | "und";
  expansionType: "EXACT_ORIGINAL" | "VALIDATED_TRANSLATION" | "ACADEMIC_EQUIVALENT" | "SYNONYM" | "RELATED_TERM" | "EXPLORATORY_TERM";
  translationOf?: string; origin: SearchTerm["provenance"]; confidence: SearchTerm["confidence"];
};
export type ScientificConcept = {
  id: string; value: string; role: ScientificRole; roleBasis: string;
  authority: SearchTerm["authority"]; sourceFields: DefinitionField[];
  origin: SearchTerm["provenance"]; known: true; traceable: true;
  terms: ConceptTerm[];
};
export type ScientificConceptPlan = {
  schemaVersion: typeof SCIENTIFIC_CONCEPT_VERSION; searchIntentHash: string;
  concepts: ScientificConcept[]; diagnostics: Array<{ code: string; sourceField?: DefinitionField; anchor?: string }>;
  objectRequired: boolean;
};
export const normalizeConcept = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const containsConcept = (s: string, p: string) => Boolean(normalizeConcept(p)) && (` ${normalizeConcept(s)} `).includes(` ${normalizeConcept(p)} `);
export const conceptWordCount = (s: string) => normalizeConcept(s).split(" ").filter(Boolean).length;
// Generic linguistic guards, not discipline/topic dictionaries. Model role
// suggestions cannot override an explicit qualifier, date/code or source field.
const qualifierOnly = (s: string) => /^(?:(?:full|large|small|natural|real|pilot|laboratory) scale|escala (?:natural|real|reducida|completa)|(?:large|small|pilot|typical|tipico|tipica)|(?:high|low) grade)$/.test(normalizeConcept(s));
const standardOrTime = (s: string) => /\b(?:\d{4}|norma|normativa|codigo|code|standard|century|siglo)\b/.test(normalizeConcept(s));
const action = (s: string) => /\b(?:simulacion|simulation|modelado|modelacion|modeling|modelling|analisis|analysis|evaluacion|evaluation|diseno|design|comprender|understanding|interpretacion|interpretation|comparacion|comparison)\b/.test(normalizeConcept(s));
const protectedRoles: ScientificRole[] = ["QUALIFIER", "CONTEXT", "GEOGRAPHY", "TIME_OR_STANDARD"];

export function validateScientificConcepts(input: SemanticPlannerInput, terms: SearchTerm[]): ScientificConceptPlan {
  const diagnostics: ScientificConceptPlan["diagnostics"] = [];
  const concepts = new Map<string, ScientificConcept>();
  const value = (field: DefinitionField) => input.signals.find(s => s.sourceField === field)?.value ?? "";
  for (const term of terms) {
    const source = input.signals.find(s => s.sourceField === term.sourceField);
    const reject = (code: string) => diagnostics.push({ code, sourceField: term.sourceField, anchor: term.anchor });
    if (!source?.value || source.knowledge !== "KNOWN" || source.provenance?.acceptance !== "ACCEPTED" || source.provenance?.origin === "SYSTEM_DEFAULT" || !containsConcept(source.value, term.anchor)) { reject("INELIGIBLE_CONCEPT_SOURCE"); continue; }
    if (["academicLevel", "pendingDecisions", "constraints", "advisorNotes", "dataAccess"].includes(term.sourceField)) { reject("NON_SCIENTIFIC_ANCHOR"); continue; }
    // EXACT extraction may identify a narrower literal span. A translation of
    // a whole sentence cannot be treated as equivalent to one arbitrary clause.
    const anchor = term.type === "EXACT_TERM" && containsConcept(term.anchor, term.text) ? term.text : term.anchor;
    const objectSpan = containsConcept(value("object"), anchor);
    const exactConfirmedObject = term.sourceField === "object" && term.type === "EXACT_TERM" &&
      term.provenance === "CONFIRMED_EXTRACT" && term.scientificRole === "OBJECT_OR_SYSTEM" &&
      normalizeConcept(anchor) === normalizeConcept(source.value);
    // Long model-selected spans still need an atomic concept. An exact, already
    // confirmed object is different: length alone cannot erase its identity.
    if (!exactConfirmedObject && conceptWordCount(anchor) > (objectSpan ? 8 : 6)) { reject("NON_ATOMIC_CONCEPT_ANCHOR"); continue; }
    let forced: ScientificRole | undefined;
    if (term.scientificRole === "QUALIFIER" || qualifierOnly(anchor) || qualifierOnly(term.text)) forced = "QUALIFIER";
    else if (exactConfirmedObject) forced = "OBJECT_OR_SYSTEM";
    else if (standardOrTime(anchor)) forced = "TIME_OR_STANDARD";
    else if (term.sourceField === "context" || (containsConcept(value("context"), anchor) && !objectSpan)) forced = term.scientificRole === "GEOGRAPHY" ? "GEOGRAPHY" : "CONTEXT";
    else if (term.scientificRole && protectedRoles.includes(term.scientificRole)) forced = term.scientificRole;
    else if (objectSpan) forced = "OBJECT_OR_SYSTEM";
    let role: ScientificRole;
    let roleBasis: string;
    if (forced) {
      role = forced; roleBasis = "CONFIRMED_SPAN_GUARD";
      if (term.scientificRole && term.scientificRole !== forced) reject("ROLE_PROMOTION_BLOCKED");
    } else if (term.scientificRole) {
      role = term.scientificRole; roleBasis = "VALIDATED_ROLE_PROPOSAL";
      const identitySpan = ["originalIdea", "topic", "problem", "purpose", "concepts"].some(f => containsConcept(value(f as DefinitionField), anchor));
      if (["PHENOMENON", "RESEARCH_ACTION", "CORE_CONCEPT", "THEORY_OR_FRAMEWORK"].includes(role) && !identitySpan) { reject("ROLE_WITHOUT_IDENTITY_SUPPORT"); continue; }
      if (role === "OBJECT_OR_SYSTEM" && !objectSpan) { reject("OBJECT_ROLE_WITHOUT_OBJECT_SUPPORT"); continue; }
      if (role === "METHOD_OR_TECHNIQUE" && !containsConcept(value("methodPreference"), anchor) && !identitySpan) { reject("UNSUPPORTED_METHOD_ROLE"); continue; }
    } else if (term.scientificRole === null) {
      reject("SCIENTIFIC_ROLE_UNRESOLVED"); continue;
    } else {
      // Conservative, explicitly marked compatibility for stored pre-role plans.
      // No alphabetic/list-index selection determines scientific roles.
      roleBasis = "LEGACY_GROUNDED_ROLE";
      if (action(anchor) && ["originalIdea", "topic", "problem", "purpose", "concepts"].some(f => containsConcept(value(f as DefinitionField), anchor))) role = "RESEARCH_ACTION";
      else if (["problem", "topic", "originalIdea"].includes(term.sourceField)) role = "PHENOMENON";
      else if (term.sourceField === "concepts") role = "CORE_CONCEPT";
      else if (term.sourceField === "methodPreference") role = "METHOD_OR_TECHNIQUE";
      else role = "CONTEXT";
    }
    const authority = term.authority === "EXPLORATORY" ? "EXPLORATORY" : protectedRoles.includes(role) ? "REFINER" : term.authority;
    const id = `concept:${role}:${encodeURIComponent(normalizeConcept(anchor))}`;
    const concept = concepts.get(id) ?? { id, value: anchor, role, roleBasis, authority, sourceFields: [], origin: term.provenance, known: true as const, traceable: true as const, terms: [] };
    concept.sourceFields = [...new Set([...concept.sourceFields, term.sourceField])].sort() as DefinitionField[];
    // A low-authority variant never upgrades or replaces a central representation.
    if (authority === "CENTRAL") concept.authority = "CENTRAL";
    else if (concept.authority === "EXPLORATORY" && authority === "REFINER") concept.authority = "REFINER";
    if (term.confidence === "HIGH" && term.type !== "RELATED_TERM") {
      // Original span is deterministic confirmed extraction, NOT a new translation.
      if (!concept.terms.some(t => t.expansionType === "EXACT_ORIGINAL")) concept.terms.push({ value: anchor, language: "original", expansionType: "EXACT_ORIGINAL", origin: "CONFIRMED_EXTRACT", confidence: "HIGH" });
    }
    const expansionType: ConceptTerm["expansionType"] = term.confidence !== "HIGH" ? "EXPLORATORY_TERM" :
      term.type === "EXACT_TERM" ? "EXACT_ORIGINAL" : term.type === "TRANSLATION" ? "VALIDATED_TRANSLATION" : term.type === "ACADEMIC_SYNONYM" ? "ACADEMIC_EQUIVALENT" : term.type === "RELATED_TERM" ? "RELATED_TERM" : "SYNONYM";
    const language = term.language ?? (term.type === "EXACT_TERM" ? "original" : "und");
    if (term.type === "TRANSLATION" && language === "und") { reject("TRANSLATION_LANGUAGE_UNVERIFIED"); concepts.set(id, concept); continue; }
    if (!concept.terms.some(t => t.value === term.text && t.language === language)) concept.terms.push({ value: term.text, language, expansionType, origin: term.provenance, confidence: term.confidence, ...(term.type === "TRANSLATION" ? { translationOf: id } : {}) });
    concepts.set(id, concept);
  }
  const result = [...concepts.values()].sort((a, b) => a.id.localeCompare(b.id));
  const eligible = result.filter(c => c.authority === "CENTRAL");
  if (value("object") && !eligible.some(c => c.role === "OBJECT_OR_SYSTEM")) diagnostics.push({ code: "ACCEPTED_OBJECT_NOT_REPRESENTED" });
  if (!eligible.some(c => ["PHENOMENON", "RESEARCH_ACTION", "CORE_CONCEPT"].includes(c.role))) diagnostics.push({ code: "SCIENTIFIC_ANCHOR_MISSING" });
  return { schemaVersion: SCIENTIFIC_CONCEPT_VERSION, searchIntentHash: input.searchIntentHash, concepts: result, diagnostics, objectRequired: Boolean(value("object")) };
}

export const highAuthorityTerms = (c: ScientificConcept) => c.terms.filter(t => t.confidence === "HIGH" && !["RELATED_TERM", "EXPLORATORY_TERM"].includes(t.expansionType));
