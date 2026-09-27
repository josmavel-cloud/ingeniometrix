import { z } from "zod";
import { DEFINITION_FIELDS, type DefinitionField, type FieldValue } from "./conversational-intake";
import type { ResearchSearchIntent } from "./retrieval-search-input";

export const PLANNER_INPUT_VERSION = "research-planner-input.v1";
export const ENRICHMENT_VERSION = "search-enrichment.v1";
export const SEMANTIC_POLICY_VERSION = "semantic-retrieval.v1";
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
  }).strict()).max(48),
  ambiguities: z.array(z.object({ sourceField: z.enum(DEFINITION_FIELDS), reason: z.string().max(400) }).strict()).max(8),
}).strict();
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
export type SearchTerm = EnrichmentOutput["terms"][number] & {
  sourceFields: DefinitionField[]; role: SearchRole; tier: 1 | 2 | 3;
  authority: "CENTRAL" | "REFINER" | "EXPLORATORY";
  provenance: "CONFIRMED_EXTRACT" | "AI_DERIVED_FOR_SEARCH";
};
export type SearchEnrichment = {
  schemaVersion: typeof ENRICHMENT_VERSION; searchIntentHash: string; policyVersion: typeof SEMANTIC_POLICY_VERSION;
  planMode: "SEMANTIC" | "DEGRADED"; status: "READY" | "NEEDS_CLARIFICATION";
  terms: SearchTerm[]; ambiguities: SemanticPlannerInput["ambiguities"];
  researchActionInterpretation: SearchTerm[]; likelyEvidenceRoles: Array<"DIRECT" | "METHODOLOGICAL" | "THEORETICAL" | "CONTEXTUAL">;
  confidence: "UNASSESSED"; reasonCodes: string[];
  explicitExclusions: string[];
};
export const normalizeSearchText = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const includesPhrase = (s: string, phrase: string) => (` ${normalizeSearchText(s)} `).includes(` ${normalizeSearchText(phrase)} `);

// Fallback never invents a synonym or splits a sentence into positional groups.
export function fallbackSearchEnrichment(input: SemanticPlannerInput, reason = "PLANNER_UNAVAILABLE"): SearchEnrichment {
  const terms: SearchTerm[] = input.signals.filter(s => s.value && s.category !== "UNRESOLVED_OR_UNKNOWN" && !["constraints", "advisorNotes", "dataAccess", "academicLevel"].includes(s.sourceField))
    .flatMap(s => (s.sourceField === "concepts" ? s.value!.split(/[;\n]+/) : [s.value!]).map(text => text.trim())
      .filter(text => text.length >= 2 && text.length <= 160)
      .map(text => ({ text, anchor: text, type: "EXACT_TERM" as const, confidence: "HIGH" as const,
        sourceField: s.sourceField, sourceFields: [s.sourceField], role: s.role, tier: s.tier,
        authority: s.tier === 1 ? "CENTRAL" as const : "REFINER" as const, provenance: "CONFIRMED_EXTRACT" as const })));
  return finish(input, terms, "DEGRADED", [reason]);
}
function finish(input: SemanticPlannerInput, terms: SearchTerm[], planMode: SearchEnrichment["planMode"], reasonCodes: string[]): SearchEnrichment {
  const central = terms.filter(t => t.authority === "CENTRAL");
  const hasObject = central.some(t => t.role === "OBJECT" || t.role === "CONCEPT");
  const hasProblem = central.some(t => ["PROBLEM", "CONCEPT", "PURPOSE"].includes(t.role));
  return { schemaVersion: ENRICHMENT_VERSION, searchIntentHash: input.searchIntentHash, policyVersion: SEMANTIC_POLICY_VERSION,
    planMode, status: input.readiness === "READY" && hasObject && hasProblem && new Set(central.map(t => normalizeSearchText(t.anchor))).size >= 2 ? "READY" : "NEEDS_CLARIFICATION",
    terms, ambiguities: input.ambiguities, researchActionInterpretation: terms.filter(t => t.role === "PURPOSE"),
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
  for (const term of parsed.terms) {
    const source = input.signals.find(s => s.sourceField === term.sourceField);
    if (!source?.value || source.knowledge !== "KNOWN" || source.category === "UNRESOLVED_OR_UNKNOWN" ||
      !includesPhrase(source.value, term.anchor) || ["constraints", "advisorNotes", "dataAccess", "academicLevel"].includes(term.sourceField) ||
      (term.type === "EXACT_TERM" && !includesPhrase(term.anchor, term.text)) ||
      /["(){}\n]|\b(?:AND|OR|NOT)\b/.test(term.text) ||
      (term.text.match(/\d+/g) ?? []).some(n => !term.anchor.includes(n))) {
      rejected.push("UNSUPPORTED_OR_UNSAFE_TERM"); continue;
    }
    // Low-confidence and related concepts are exploration, never core evidence.
    const exploratory = term.confidence !== "HIGH" || term.type === "RELATED_TERM";
    const contextOnly = /\d{4}/.test(term.anchor) || input.signals.some(s => s.sourceField === "context" && s.value && includesPhrase(s.value, term.anchor));
    terms.push({ ...term, sourceFields: [term.sourceField], role: source.role, tier: source.tier,
      authority: exploratory ? "EXPLORATORY" : source.tier === 1 && !contextOnly ? "CENTRAL" : "REFINER",
      provenance: "AI_DERIVED_FOR_SEARCH" });
  }
  const result = finish(input, terms, "SEMANTIC", [...new Set(rejected)]);
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
  return { necessary: groups.filter(g => g.authority === "CENTRAL"), complementary: groups.filter(g => g.authority === "REFINER"), optional: groups.filter(g => g.authority === "EXPLORATORY") };
}

export function semanticQueryPack(groups: ReturnType<typeof enrichmentGroups>) {
  const quote = (s: string) => `"${s.replace(/["(){}\n]/g, " ").trim()}"`;
  const clause = (g: SemanticKeywordGroup) => `(${g.variants.slice(0, 4).map(quote).join(" OR ")})`;
  const cores = groups.necessary;
  const objects = cores.filter(g => g.role === "OBJECT" || g.role === "CONCEPT");
  const problems = cores.filter(g => g.role === "PROBLEM" || g.role === "CONCEPT");
  const pairs: SemanticKeywordGroup[][] = [];
  for (const problem of problems) for (const object of objects) {
    if (normalizeSearchText(problem.anchor) !== normalizeSearchText(object.anchor)) pairs.push([problem, object]);
  }
  const unique = (queries: string[]) => [...new Set(queries)].slice(0, 3);
  const necessaryOnly = unique(pairs.map(pair => pair.map(clause).join(" AND ")));
  const complementaryBoosted = necessaryOnly.length ? groups.complementary.slice(0, 3).map(g => `${necessaryOnly[0]} AND ${clause(g)}`) : [];
  return { necessaryOnly, complementaryBoosted, optionalBackups: [] as string[] };
}
