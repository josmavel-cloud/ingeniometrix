import { createHash } from "node:crypto";
import { z } from "zod";
import { DEFINITION_FIELDS, type DefinitionField, type FieldValue } from "./conversational-intake";
import type { ResearchSearchIntent } from "./retrieval-search-input";
import { composeSemanticQueries } from "./retrieval-query-composition";
import { SCIENTIFIC_ROLES, normalizeConcept, validateScientificConcepts, type ScientificConceptPlan } from "./retrieval-scientific-concepts";

export const PLANNER_INPUT_VERSION = "research-planner-input.v1";
export const ENRICHMENT_VERSION = "search-enrichment.v1";
export const SEMANTIC_POLICY_VERSION = "semantic-retrieval.v3";
export type SourceAccessStatus = "UNKNOWN" | "REPORTED_PDF" | "VERIFIED_PDF" | "MATERIALIZED_FULL_TEXT";
export type SearchRole = "PROBLEM" | "OBJECT" | "PURPOSE" | "CONCEPT" | "CONTEXT" | "METHOD_SIGNAL" | "OUTPUT";
type FieldPolicy = { role: SearchRole; tier: 1 | 2 | 3; category: "CORE_SEARCH_SIGNALS" | "SUPPORTING_SEARCH_SIGNALS" | "ADVANCED_REFINEMENT_SIGNALS" | "UNRESOLVED_OR_UNKNOWN" };
const core = (role: SearchRole): FieldPolicy => ({ role, tier: 1, category: "CORE_SEARCH_SIGNALS" });
const supporting = (role: SearchRole, tier: 2 | 3 = 2): FieldPolicy => ({ role, tier, category: "SUPPORTING_SEARCH_SIGNALS" });
const advanced = (role: SearchRole): FieldPolicy => ({ role, tier: 3, category: "ADVANCED_REFINEMENT_SIGNALS" });
export const SEARCH_FIELD_POLICY: Record<DefinitionField, FieldPolicy> = {
  originalIdea: core("PROBLEM"), topic: core("PROBLEM"), problem: core("PROBLEM"), purpose: core("PURPOSE"),
  object: core("OBJECT"), concepts: core("CONCEPT"), context: supporting("CONTEXT"), scope: supporting("CONTEXT"),
  intendedOutput: supporting("OUTPUT"), taxonomy: supporting("CONTEXT"), academicLevel: supporting("CONTEXT", 3),
  methodPreference: supporting("METHOD_SIGNAL", 3), dataAccess: supporting("CONTEXT", 3),
  constraints: advanced("CONTEXT"), researchLine: advanced("CONTEXT"), advisorNotes: advanced("CONTEXT"),
  pendingDecisions: { ...advanced("CONTEXT"), category: "UNRESOLVED_OR_UNKNOWN" },
};
export type PlannerSignal = FieldPolicy & {
  sourceField: DefinitionField; value: string | null; knowledge: FieldValue["knowledge"];
  provenance: FieldValue | null;
};
export type SemanticPlannerInput = {
  schemaVersion: typeof PLANNER_INPUT_VERSION; searchIntentHash: string; policyVersion: typeof SEMANTIC_POLICY_VERSION;
  projectId: string; confirmedDraftRevision: number | null; definitionHash: string | null;
  signals: PlannerSignal[]; ambiguities: ResearchSearchIntent["unresolvedAmbiguities"];
  readiness: "READY" | "NEEDS_CLARIFICATION";
};

export function semanticPlannerInput(intent: ResearchSearchIntent, searchIntentHash: string): SemanticPlannerInput {
  if (intent.sourceKind !== "CONFIRMED_DEFINITION") throw new Error("CONFIRMED_INTENT_REQUIRED");
  const signals = DEFINITION_FIELDS.map(sourceField => {
    const field = intent.fieldProvenance[sourceField];
    const eligible = field?.knowledge === "KNOWN" && field.acceptance === "ACCEPTED" && field.origin !== "SYSTEM_DEFAULT";
    return { ...SEARCH_FIELD_POLICY[sourceField], sourceField,
      category: eligible ? SEARCH_FIELD_POLICY[sourceField].category : "UNRESOLVED_OR_UNKNOWN" as const,
      value: eligible ? field.value : null,
      knowledge: eligible ? "KNOWN" as const : intent.unresolvedFields.find(f => f.field === sourceField)?.knowledge ?? "UNKNOWN" as const,
      provenance: eligible ? field : null };
  });
  const known = (key: DefinitionField) => Boolean(signals.find(s => s.sourceField === key)?.value?.trim());
  return { schemaVersion: PLANNER_INPUT_VERSION, policyVersion: SEMANTIC_POLICY_VERSION, searchIntentHash,
    projectId: intent.projectId, confirmedDraftRevision: intent.confirmedDraftRevision, definitionHash: intent.definitionHash,
    signals, ambiguities: intent.unresolvedAmbiguities,
    readiness: intent.readiness === "READY" && known("topic") && (known("object") || known("concepts")) ? "READY" : "NEEDS_CLARIFICATION" };
}

export const enrichmentOutputSchema = z.object({
  terms: z.array(z.object({
    sourceField: z.enum(DEFINITION_FIELDS), anchor: z.string().min(2).max(240),
    text: z.string().min(2).max(160),
    type: z.enum(["EXACT_TERM", "LINGUISTIC_VARIANT", "TRANSLATION", "ACADEMIC_SYNONYM", "RELATED_TERM"]),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    scientificRole: z.enum(SCIENTIFIC_ROLES).nullable().optional(),
    language: z.enum(["es", "en", "pt", "und"]).nullable().optional(),
  }).strict()).max(48),
  ambiguities: z.array(z.object({ sourceField: z.enum(DEFINITION_FIELDS), reason: z.string().max(400) }).strict()).max(8),
}).strict();
// New provider responses require explicit nullable fields. Historical outputs
// remain readable through the compatibility parser above, never fabricated.
export const enrichmentModelOutputSchema = enrichmentOutputSchema.extend({ terms: z.array(enrichmentOutputSchema.shape.terms.element.extend({
  scientificRole: z.enum(SCIENTIFIC_ROLES).nullable(), language: z.enum(["es", "en", "pt", "und"]).nullable(),
})).max(48) });
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
export type SearchTerm = EnrichmentOutput["terms"][number] & {
  sourceFields: DefinitionField[]; role: SearchRole; tier: 1 | 2 | 3;
  authority: "CENTRAL" | "REFINER" | "EXPLORATORY";
  provenance: "CONFIRMED_EXTRACT" | "AI_DERIVED_FOR_SEARCH";
};
export type SearchEnrichment = {
  scientificConceptPlan?: ScientificConceptPlan;
  // Private acceptance/audit evidence. This is the validated structured model
  // response before any term is normalized or rejected; never shown as science.
  rawPlannerOutput?: EnrichmentOutput;
  schemaVersion: typeof ENRICHMENT_VERSION; searchIntentHash: string; policyVersion: typeof SEMANTIC_POLICY_VERSION;
  planMode: "SEMANTIC" | "DEGRADED"; status: "READY" | "NEEDS_CLARIFICATION";
  terms: SearchTerm[]; ambiguities: SemanticPlannerInput["ambiguities"];
  researchActionInterpretation: SearchTerm[]; likelyEvidenceRoles: Array<"DIRECT" | "METHODOLOGICAL" | "THEORETICAL" | "CONTEXTUAL">;
  confidence: "UNASSESSED"; reasonCodes: string[];
  explicitExclusions: string[];
  translationTrace?: TranslationTrace[];
  plannerOutputTermCount?: number;
  translationRecovery?: { status: "NOT_NEEDED" | "COMPLETE" | "LIMITED"; model: string; promptVersion: string; requestedIds: string[]; cacheHits: number };
};
export type TranslationTrace = {
  translationId: string; sourceConceptId: string; originalText: string; translatedText: string;
  sourceLanguage: string; targetLanguage: string; expansionType: "TRANSLATION" | "ACADEMIC_SYNONYM";
  origin: "MAIN_PLANNER" | "TRANSLATION_RECOVERY" | "TRANSLATION_CACHE";
  authority: SearchTerm["authority"] | "UNRESOLVED"; sourceFields: DefinitionField[];
  plannerOperationId?: string | null;
  validationStatus: "ACCEPTED" | "REJECTED"; validationReason: string;
};
export const normalizeSearchText = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const includesPhrase = (s: string, phrase: string) => (` ${normalizeSearchText(s)} `).includes(` ${normalizeSearchText(phrase)} `);

// Fallback never invents a synonym or splits a sentence into positional groups.
export function fallbackSearchEnrichment(input: SemanticPlannerInput, reason = "PLANNER_UNAVAILABLE"): SearchEnrichment {
  const terms: SearchTerm[] = input.signals.filter(s => s.value && s.category !== "UNRESOLVED_OR_UNKNOWN" && !["constraints", "advisorNotes", "dataAccess", "academicLevel"].includes(s.sourceField))
    .flatMap(s => {
      // A confirmed object may contain a short identity followed by comma-separated
      // qualifications. Keep the complete field in the scientific input and retain
      // each qualification as a refiner. A comma is a grammatical boundary, not a
      // positional word limit; otherwise the exact confirmed object remains whole.
      const clauses = s.sourceField === "object" ? s.value!.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean) : [];
      const shortHead = clauses.length > 1 && clauses[0].split(/\s+/).length >= 2 && clauses[0].split(/\s+/).length <= 8;
      const pieces = s.sourceField === "object" && shortHead ? clauses.map((text, index) => ({ text, qualifier: index > 0 })) :
        (s.sourceField === "concepts" ? s.value!.split(/[;\n]+/) : [s.value!]).map(text => ({ text, qualifier: false }));
      return pieces.map(({ text, qualifier }) => ({ text: text.trim(), qualifier }))
      .filter(({ text }) => text.length >= 2 && text.length <= 160)
      .map(({ text, qualifier }) => ({ text, anchor: text, type: "EXACT_TERM" as const, confidence: "HIGH" as const,
        sourceField: s.sourceField, sourceFields: [s.sourceField], role: s.role, tier: s.tier,
        ...(s.sourceField === "object" ? { scientificRole: qualifier ? "QUALIFIER" as const : "OBJECT_OR_SYSTEM" as const } : {}),
        authority: qualifier ? "REFINER" as const : s.tier === 1 ? "CENTRAL" as const : "REFINER" as const,
        provenance: "CONFIRMED_EXTRACT" as const }));
    });
  return finish(input, terms, "DEGRADED", [reason]);
}
function finish(input: SemanticPlannerInput, terms: SearchTerm[], planMode: SearchEnrichment["planMode"], reasonCodes: string[]): SearchEnrichment {
  const central = terms.filter(t => t.authority === "CENTRAL");
  const hasObject = central.some(t => t.role === "OBJECT" || t.role === "CONCEPT");
  const hasProblem = central.some(t => ["PROBLEM", "CONCEPT", "PURPOSE"].includes(t.role));
  return { schemaVersion: ENRICHMENT_VERSION, searchIntentHash: input.searchIntentHash, policyVersion: SEMANTIC_POLICY_VERSION,
    planMode, status: input.readiness === "READY" && hasObject && hasProblem && new Set(central.map(t => normalizeSearchText(t.anchor))).size >= 2 ? "READY" : "NEEDS_CLARIFICATION",
    terms, scientificConceptPlan: validateScientificConcepts(input, terms), ambiguities: input.ambiguities, researchActionInterpretation: terms.filter(t => t.role === "PURPOSE"),
    likelyEvidenceRoles: ["DIRECT", ...(terms.some(t => t.role === "METHOD_SIGNAL") ? ["METHODOLOGICAL" as const] : []),
      ...(terms.some(t => t.role === "CONCEPT") ? ["THEORETICAL" as const] : []), ...(terms.some(t => t.role === "CONTEXT") ? ["CONTEXTUAL" as const] : [])],
    confidence: "UNASSESSED", reasonCodes,
    // Only explicit machine-recognizable exclusion clauses become hard rules.
    // Other natural-language constraints remain in the complete planner input.
    explicitExclusions: input.signals.filter(s => s.sourceField === "constraints" && s.value)
      .flatMap(s => [...s.value!.matchAll(/(?:excluir|exclude)\s*:\s*([^;\n.]+)/gi)].map(m => m[1].trim())) };
}
export function validateSearchEnrichment(input: SemanticPlannerInput, raw: unknown): SearchEnrichment {
  const parsed = enrichmentOutputSchema.parse(raw);
  const terms: SearchTerm[] = [];
  const rejected: string[] = [];
  const proposed: Array<{ term: EnrichmentOutput["terms"][number]; reason: string | null }> = [];
  for (const term of parsed.terms) {
    const source = input.signals.find(s => s.sourceField === term.sourceField);
    const reason = !source?.value || source.knowledge !== "KNOWN" || source.category === "UNRESOLVED_OR_UNKNOWN" ? "INELIGIBLE_OR_UNKNOWN_SOURCE" :
      !includesPhrase(source.value, term.anchor) ? "ANCHOR_NOT_IN_CONFIRMED_FIELD" :
      ["constraints", "advisorNotes", "dataAccess", "academicLevel"].includes(term.sourceField) ? "NON_SEMANTIC_SOURCE_FIELD" :
      term.type === "EXACT_TERM" && !includesPhrase(term.anchor, term.text) ? "EXACT_TEXT_NOT_IN_ANCHOR" :
      /["(){}\n]|\b(?:AND|OR|NOT)\b/.test(term.text) ? "UNSAFE_SYNTAX" :
      (term.text.match(/\d+/g) ?? []).some(n => !term.anchor.includes(n)) ? "UNSUPPORTED_NUMBER" : null;
    if (reason) {
      rejected.push("UNSUPPORTED_OR_UNSAFE_TERM"); proposed.push({ term, reason }); continue;
    }
    // Low-confidence and related concepts are exploration, never core evidence.
    const eligibleSource = source!;
    const exploratory = term.confidence !== "HIGH" || term.type === "RELATED_TERM";
    const contextOnly = /\d{4}/.test(term.anchor) || input.signals.some(s => s.sourceField === "context" && s.value && includesPhrase(s.value, term.anchor));
    terms.push({ ...term, sourceFields: [term.sourceField], role: eligibleSource.role, tier: eligibleSource.tier,
      authority: exploratory ? "EXPLORATORY" : eligibleSource.tier === 1 && !contextOnly ? "CENTRAL" : "REFINER",
      provenance: "AI_DERIVED_FOR_SEARCH" });
    proposed.push({ term, reason: null });
  }
  const result = finish(input, terms, "SEMANTIC", [...new Set(rejected)]);
  result.plannerOutputTermCount = parsed.terms.length;
  result.translationTrace = proposed.filter(x => x.term.type === "TRANSLATION" || x.term.type === "ACADEMIC_SYNONYM").map(({ term, reason }) => {
    const acceptedTerm = terms.find(t => t.sourceField === term.sourceField && t.anchor === term.anchor && t.text === term.text && t.type === term.type);
    const concept = result.scientificConceptPlan?.concepts.find(c => c.sourceFields.includes(term.sourceField) && normalizeConcept(c.value) === normalizeConcept(term.anchor) &&
      c.terms.some(t => t.value === term.text && t.language === term.language &&
        (t.expansionType === "VALIDATED_TRANSLATION" || t.expansionType === "ACADEMIC_EQUIVALENT")));
    const statusReason = reason ?? (!term.language || term.language === "und" ? "TARGET_LANGUAGE_UNVERIFIED" :
      !concept ? "SCIENTIFIC_CONCEPT_REJECTED_OR_MISMATCHED" :
      acceptedTerm?.authority === "EXPLORATORY" ? "LOW_AUTHORITY_EXPLORATORY" : "VALIDATED_CONCEPT_TERM");
    const accepted = statusReason === "VALIDATED_CONCEPT_TERM";
    const originalText = concept?.value ?? term.anchor;
    const translationId = createHash("sha256").update(JSON.stringify([input.searchIntentHash, term.sourceField, term.anchor, term.text, term.type, term.language])).digest("hex");
    return { translationId, sourceConceptId: concept?.id ?? `unresolved:${normalizeConcept(term.anchor)}`, originalText,
      translatedText: term.text, sourceLanguage: terms.some(t => t.sourceField === term.sourceField && t.anchor === term.anchor && t.type === "EXACT_TERM" && t.language === "es") ? "es" :
        terms.some(t => t.sourceField === term.sourceField && t.anchor === term.anchor && t.type === "EXACT_TERM" && t.language === "en") ? "en" : "original",
      targetLanguage: term.language ?? "und", expansionType: term.type as "TRANSLATION" | "ACADEMIC_SYNONYM",
      origin: "MAIN_PLANNER" as const, authority: acceptedTerm?.authority ?? "UNRESOLVED" as const,
      sourceFields: [term.sourceField], plannerOperationId: null,
      validationStatus: accepted ? "ACCEPTED" as const : "REJECTED" as const, validationReason: statusReason };
  });
  result.ambiguities = [...input.ambiguities, ...parsed.ambiguities.map(a => ({ field: a.sourceField, reason: a.reason, blocksSearch: false }))];
  return result;
}

export type SemanticKeywordGroup = { label: string; variants: string[]; role: SearchRole; tier: 1 | 2 | 3; sourceFields: DefinitionField[]; authority: SearchTerm["authority"]; anchor: string };
export function enrichmentGroups(enrichment: SearchEnrichment) {
  const grouped = new Map<string, SemanticKeywordGroup>();
  for (const term of enrichment.terms) {
    const key = `${term.sourceField}:${normalizeSearchText(term.anchor)}:${term.authority}`;
    const group = grouped.get(key) ?? { label: `${term.role}: ${term.anchor}`, variants: [], role: term.role, tier: term.tier,
      sourceFields: term.sourceFields, authority: term.authority, anchor: term.anchor };
    if (!group.variants.includes(term.text)) group.variants.push(term.text);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()];
  return { necessary: groups.filter(g => g.authority === "CENTRAL"), complementary: groups.filter(g => g.authority === "REFINER"), optional: groups.filter(g => g.authority === "EXPLORATORY"), conceptPlan: enrichment.scientificConceptPlan };
}

export function semanticQueryPack(groups: ReturnType<typeof enrichmentGroups>) {
  return composeSemanticQueries(groups);
}
