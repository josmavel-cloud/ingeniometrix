import { z } from "zod";
import { definitionSchema, evidencePointerSchema, researchDesignSchema, validateResearchDefinition } from "./research-plan-contracts";
import { inspectableEvidence, sourceDisposition } from "./evidence-continuity";
import { permitsMethodologicalSupport } from "./evidence-coverage";
import { fingerprint } from "./job-execution-context";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";

const text = z.string().min(1);
const list = z.array(text);
export const researchIntentSchema = z.object({
  user_statements: z.record(z.string(), z.unknown()),
  problem: z.string(), expected_outcome: z.string(), scope: z.string(), academic_level: z.string(),
  context: z.string(), unit_population_corpus: z.string(),
  confirmed_data: list, possible_data: list, resources: list, restrictions: list, preferences: list,
  // Do not automatically convert unclassified availableData prose into confirmed access.
  unclassified_data_statement: z.string(),
  requirements: z.array(z.object({ id: text, statement: text, authority: z.enum(["USER_FIRM", "USER_PREFERENCE", "SYSTEM_PROPOSAL", "ASSUMPTION", "PENDING"]) })),
});
export type ResearchIntentContract = z.infer<typeof researchIntentSchema>;
export function intentFromIntake(raw: Record<string, unknown>): ResearchIntentContract {
  const s = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  const values = (key: string) => Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : [];
  const scientificKeys = ["topic", "problemContext", "expectedOutcome", "researchScope", "scope", "targetPopulation", "country", "context", "researchLine", "degreeLevel", "constructs", "pendingDecisions", "availableData", "confirmedData", "possibleData", "resources", "academicConstraints", "advisorNotes", "preferredMethodology"];
  const userStatements = Object.fromEntries(scientificKeys.filter((key) => raw[key] != null).map((key) => [key, raw[key]]));
  return researchIntentSchema.parse({ user_statements: userStatements, problem: s("problemContext"), expected_outcome: s("expectedOutcome") || s("topic"), scope: s("researchScope") || s("scope") || s("targetPopulation"), academic_level: s("degreeLevel"), context: [s("country"), s("context"), s("researchLine")].filter(Boolean).join("; "), unit_population_corpus: s("targetPopulation"), confirmed_data: values("confirmedData"), possible_data: values("possibleData"), resources: values("resources"), restrictions: [s("academicConstraints"), s("advisorNotes")].filter(Boolean), preferences: [s("preferredMethodology")].filter(Boolean), unclassified_data_statement: s("availableData"), requirements: [
    { id: "topic", statement: s("topic"), authority: "USER_FIRM" },
    { id: "problem", statement: s("problemContext"), authority: "USER_FIRM" },
    { id: "scope", statement: s("targetPopulation"), authority: "USER_FIRM" },
    { id: "research-scope", statement: s("researchScope") || s("scope"), authority: "USER_FIRM" },
    { id: "constructs", statement: s("constructs"), authority: "USER_FIRM" },
    { id: "pending-decisions", statement: s("pendingDecisions"), authority: "PENDING" },
    { id: "constraints", statement: s("academicConstraints"), authority: "USER_FIRM" },
    { id: "method-preference", statement: s("preferredMethodology"), authority: "USER_PREFERENCE" },
  ].filter((r) => r.statement) });
}

export function buildMethodEvidencePack(ledger: MvpStep5EvidenceLedger, maxChars = 14000) {
  const available = inspectableEvidence(ledger).map(({ item, basis }) => ({ source_id: item.source_id, evidence_id: item.evidence_id, section: item.section_key, excerpt: item.supporting_excerpt, summary: item.traceable_summary_es, evidence_level: basis, allowed_use: item.allowed_use, locator: item.citation_anchor }));
  available.sort((a, b) => Number(permitsMethodologicalSupport(b.allowed_use)) - Number(permitsMethodologicalSupport(a.allowed_use)) || a.source_id.localeCompare(b.source_id) || a.evidence_id.localeCompare(b.evidence_id));
  const items: typeof available = [], excluded: { source_id: string; evidence_id: string; reason: string }[] = [];
  let size = 0;
  for (const item of available) {
    const chars = JSON.stringify(item).length;
    if (size + chars > maxChars) { excluded.push({ source_id: item.source_id, evidence_id: item.evidence_id, reason: "METHOD_PACK_CONTEXT_BUDGET" }); continue; }
    items.push(item); size += chars;
  }
  const dispositions = sourceDisposition(ledger, []);
  return { version: "method-evidence-pack.v2", items, excluded, selected_sources: ledger.source_registry.map((s) => ({ source_id: s.source_id, title: s.title, year: s.year, doi: s.doi })), source_accounting: dispositions.map((s) => ({ source_id: s.source_id, selected: s.selected, inspected: s.extraction_status === "completed", evidence_level: s.evidence_level, extracted_items: s.extracted_items, verified_items: s.verified_items, considered_by_selector: items.some((i) => i.source_id === s.source_id), exclusion_reason: items.some((i) => i.source_id === s.source_id) ? null : s.eligible ? "METHOD_PACK_CONTEXT_BUDGET" : s.exclusion_reason })), context_chars: size };
}
export type MethodEvidencePack = ReturnType<typeof buildMethodEvidencePack>;
export function accountDecisionSources(pack: MethodEvidencePack, decision: ScientificDecision) {
  const used = new Set(decision.alternatives.flatMap((a) => [...a.research_design.methodological_support, ...a.components.flatMap((c) => c.support)]).map((p) => p.source_id));
  return pack.source_accounting.map((s) => ({ ...s, evidence_extracted: s.extracted_items > 0, used_to_justify_decision: used.has(s.source_id), excluded: !used.has(s.source_id), exclusion_reason: used.has(s.source_id) ? null : s.exclusion_reason ?? "CONSIDERED_NOT_REFERENCED_IN_DECISION" }));
}
const componentSchema = z.object({ name: text, kind: z.enum(["theory", "framework", "model", "principle", "method", "technique", "instrument", "software", "research_strategy"]), role: text, inputs: list, outputs: list, dependencies: list, support: z.array(evidencePointerSchema) });
export const designAlternativeSchema = z.object({
  id: text, label: text, scope_fulfilled: text,
  definition: definitionSchema, research_design: researchDesignSchema,
  components: z.array(componentSchema).min(1),
  scope_changes: z.array(z.object({ requirement_id: text, proposed_change: text, reason: text })),
  applicability_conditions: list, baselines_or_comparisons: list, transfer_limits: list,
  feasibility: text, discarded_alternative_reasons: list,
  qualitative_component: z.string().nullable(), quantitative_component: z.string().nullable(), integration_strategy: z.string().nullable(),
  pending_user_decisions: z.array(z.object({ question: text, blocking: z.boolean() })),
});
export const scientificDecisionSchema = z.object({
  alternatives: z.array(designAlternativeSchema).max(3), recommended_id: z.string().nullable(),
  recommendation_rationale: text, clarification_questions: list,
});
// v1 snapshots remain readable. New proposals require these explicit semantic fields.
export const designAlternativeV2Schema = designAlternativeSchema.extend({
  primary_method: text,
  scope_effect: z.enum(["preserves", "narrows", "expands", "materially_changes"]),
  scope_change_impact: z.object({ original_intent: text, proposed_change: text, why_needed: text, what_is_lost: text, what_is_gained: text }).nullable(),
  integration_purpose: z.string().nullable(),
  method_handoffs: z.array(z.object({ from: text, to: text, transferred_output: text, use_by_next_method: text })),
  data_requirements: z.array(z.object({ description: text, availability: z.enum(["USER_CONFIRMED", "PROPOSED", "PENDING"]), confirmation_or_action: text })),
});
export const scientificDecisionV2Schema = scientificDecisionSchema.extend({ alternatives: z.array(designAlternativeV2Schema).max(3) });
export const designRepairSchema = z.object({ replacements: z.array(designAlternativeV2Schema).max(3), corrected_findings: list, unresolved_findings: list });
export const CRITIQUE_DIMENSIONS = ["intent", "feasibility", "evidence", "coherence", "transferability", "causal_identification", "measurement", "evaluation", "theory_framework_fit", "method_integration", "mixed_methods_validity", "uncertainty", "question_objective_alignment", "complexity", "novelty"] as const;
export const designCritiqueSchema = z.object({
  assessments: z.array(z.object({ alternative_id: text, intent_preserved: z.boolean(), method_supported: z.boolean(), executable: z.boolean(), checked_dimensions: z.array(z.enum(CRITIQUE_DIMENSIONS)), issues: z.array(z.object({ severity: z.enum(["BLOCKING", "WARNING"]), dimension: z.enum(CRITIQUE_DIMENSIONS), finding: text, required_action: text })) })),
  summary: text,
});
export type ScientificDecision = z.infer<typeof scientificDecisionSchema>;
export type DesignCritique = z.infer<typeof designCritiqueSchema>;
export type DesignAlternative = z.infer<typeof designAlternativeSchema>;
export function validateScientificDecision(decision: ScientificDecision, intent: ResearchIntentContract, pack: MethodEvidencePack) {
  const ids = new Set(decision.alternatives.map((a) => a.id));
  if (ids.size !== decision.alternatives.length || decision.recommended_id !== null && !ids.has(decision.recommended_id)) throw new Error("DESIGN_ALTERNATIVE_ID_MISMATCH");
  const methodEvidence = new Set(pack.items.filter((item) => permitsMethodologicalSupport(item.allowed_use)).map((item) => `${item.source_id}:${item.evidence_id}`));
  const inspectedEvidence = new Set(pack.items.map((item) => `${item.source_id}:${item.evidence_id}`));
  for (const a of decision.alternatives) {
    validateResearchDefinition(a.definition);
    if (a.research_design.approach === "mixed" && (!a.qualitative_component?.trim() || !a.quantitative_component?.trim() || !a.integration_strategy?.trim())) throw new Error("MIXED_METHODS_INTEGRATION_REQUIRED");
    if (a.scope_changes.some((c) => !intent.requirements.some((r) => r.id === c.requirement_id))) throw new Error("UNKNOWN_INTENT_REQUIREMENT");
    if (!a.research_design.methodological_support.length || a.research_design.methodological_support.some((p) => !methodEvidence.has(`${p.source_id}:${p.evidence_id}`)) || a.components.some((c) => c.support.some((p) => !(c.kind === "method" || c.kind === "technique" ? methodEvidence : inspectedEvidence).has(`${p.source_id}:${p.evidence_id}`)))) throw new Error("METHOD_UNSUPPORTED_BY_INSPECTED_EVIDENCE");
    if ("scope_effect" in a) validateAlternativeV2(designAlternativeV2Schema.parse(a), intent);
  }
  if (!decision.alternatives.length && !decision.clarification_questions.length) throw new Error("INSUFFICIENT_DESIGN_REQUIRES_CLARIFICATION");
}

export function validateAlternativeV2(a: z.infer<typeof designAlternativeV2Schema>, intent: ResearchIntentContract) {
  const names = new Set(a.components.map((c) => c.name));
  if (names.size !== a.components.length || !a.components.some((c) => c.name === a.primary_method && c.kind === "method")) throw new Error("METHOD_PRIMARY_OR_DUPLICATE_INVALID");
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(name: string) {
    if (visiting.has(name)) throw new Error("METHOD_DEPENDENCY_CYCLE");
    if (visited.has(name)) return;
    const c = a.components.find((item) => item.name === name);
    if (!c) throw new Error("METHOD_DEPENDENCY_UNKNOWN");
    visiting.add(name); c.dependencies.forEach(visit); visiting.delete(name); visited.add(name);
  }
  a.components.forEach((c) => visit(c.name));
  for (const edge of a.method_handoffs) {
    const from = a.components.find((c) => c.name === edge.from), to = a.components.find((c) => c.name === edge.to);
    if (!from || !to || !to.dependencies.includes(from.name) || !from.outputs.includes(edge.transferred_output) || !to.inputs.includes(edge.transferred_output)) throw new Error("METHOD_HANDOFF_INVALID");
  }
  const methods = a.components.filter((c) => c.kind === "method" || c.kind === "technique");
  if (methods.some((c) => !c.inputs.length || !c.outputs.length)) throw new Error("METHOD_INPUT_OUTPUT_MISSING");
  if (methods.length > 1 && methods.some((c) => !a.method_handoffs.some((e) => e.from === c.name || e.to === c.name))) throw new Error("METHOD_INTEGRATION_MISSING");
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const softwareNames = new Set(["gis", "sig", "python", "openai", "arcgis", "qgis", "spss", "r", "stata", "excel"]);
  if (a.components.some((c) => softwareNames.has(normalize(c.name)) && c.kind !== "software")) throw new Error("SOFTWARE_IS_NOT_THEORY_OR_METHOD");
  if (a.scope_effect !== "preserves" && (!a.scope_changes.length || !a.scope_change_impact)) throw new Error("SCOPE_CHANGE_DISCLOSURE_REQUIRED");
  if (a.scope_effect === "preserves" && (a.scope_changes.length || a.scope_change_impact)) throw new Error("SCOPE_EFFECT_CONTRADICTION");
  const actions = [/implement/i, /compar/i, /valid/i];
  const objectives = a.definition.objectives.map((o) => o.text).join(" ");
  if (actions.some((action) => action.test(intent.expected_outcome) && !action.test(objectives)) && a.scope_effect === "preserves") throw new Error("INTENT_ACTION_CHANGE_UNDISCLOSED");
  if (a.research_design.approach === "mixed" && !a.integration_purpose?.trim()) throw new Error("MIXED_METHODS_INTEGRATION_REQUIRED");
  if (!a.data_requirements.length || !a.research_design.procedure.length || !a.research_design.quality_criteria.length) throw new Error("DESIGN_NOT_EXECUTABLE");
  if (a.data_requirements.some((d) => d.availability === "USER_CONFIRMED") && !intent.confirmed_data.length) throw new Error("DATA_ACCESS_NOT_USER_CONFIRMED");
}
export function validateDesignCritique(decision: ScientificDecision, critique: DesignCritique) {
  const ids = critique.assessments.map((a) => a.alternative_id);
  if (new Set(ids).size !== ids.length || ids.length !== decision.alternatives.length || decision.alternatives.some((a) => !ids.includes(a.id))) throw new Error("CRITIQUE_COVERAGE_MISMATCH");
  if (critique.assessments.some((a) => CRITIQUE_DIMENSIONS.some((dimension) => !a.checked_dimensions.includes(dimension)))) throw new Error("CRITIQUE_DIMENSION_MISSING");
}
export function alternativeIsApprovable(alternative: DesignAlternative, critique: DesignCritique) {
  const review = critique.assessments.find((a) => a.alternative_id === alternative.id);
  return Boolean(review && review.intent_preserved && review.method_supported && review.executable && !review.issues.some((i) => i.severity === "BLOCKING") && !alternative.pending_user_decisions.some((d) => d.blocking));
}
export const decisionContextFingerprint = (intake: unknown, ledger: MvpStep5EvidenceLedger) => fingerprint({ intake, selected: ledger.source_registry, evidence: ledger.semantic_extractions });
