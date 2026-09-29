import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { emptyDefinition, userValue, searchIntent, type DefinitionField } from "@/lib/conversational-intake";
import { enrichmentGroups, semanticPlannerInput, semanticQueryPack, validateSearchEnrichment, enrichmentModelOutputSchema, type EnrichmentOutput } from "@/lib/retrieval-semantic-plan";
import { validateScientificConcepts, type ScientificRole } from "@/lib/retrieval-scientific-concepts";
import { queryRedundancyReasons, validateScientificFamily, validateScientificQueryPlan } from "@/lib/retrieval-query-composition";

let networkCalls = 0;
global.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const stored = JSON.parse(readFileSync("scripts/fixtures/phase2b12-stored-plans.json", "utf8"));
const historical = JSON.parse(readFileSync("scripts/fixtures/phase2b1-seismic.json", "utf8"));
const realInput = semanticPlannerInput(historical.intent, "offline");
for (const model of ["nano", "mini"]) {
  const before = JSON.stringify(stored[model]);
  const enrichment = { ...stored[model].enrichment, scientificConceptPlan: validateScientificConcepts(realInput, stored[model].enrichment.terms) };
  const plan = semanticQueryPack(enrichmentGroups(enrichment));
  assert.equal(plan.validation.valid, true);
  assert.deepEqual(validateScientificQueryPlan(plan), []);
  assert.ok(plan.plannedQueries.length >= 1 && plan.plannedQueries.length <= 4, "long qualified object is optional, no redundant quota");
  assert.ok(plan.plannedQueries.every(q => /simulaci[oó]n s[ií]smica/i.test(q.query)), "qualifier cannot replace research action");
  assert.ok(plan.plannedQueries.filter(q => q.family !== "CONTEXTUAL_OR_LOCAL").every(q => !q.query.includes("Perú") && !q.query.includes("2026")));
  assert.ok(plan.plannedQueries.every(q => q.translationStatus === "ORIGINAL_ONLY_ENGLISH_INCOMPLETE"));
  assert.equal(JSON.stringify(stored[model]), before, "immutable stored plan");
  assert.ok(plan.plannedQueries.every(q => q.requiredConceptIds.length >= 2 && q.sourceFieldRefs.length && q.whyValid.length));
  assert.ok(!plan.conceptPlan!.concepts.some(c => c.role === "METHOD_OR_TECHNIQUE"), "UNKNOWN method stays unresolved");
  if (model === "mini") {
    assert.equal(plan.conceptPlan!.concepts.find(c => c.value === "escala natural")?.role, "QUALIFIER");
    const bad = { ...plan.plannedQueries[0], requiredConceptIds: plan.conceptPlan!.concepts.filter(c => ["escala natural", "albañilería"].includes(c.value)).map(c => c.id), requiredConcepts: ["escala natural", "albañilería"] };
    assert.ok(validateScientificFamily(bad, plan.conceptPlan!).length);
  }
  console.log(JSON.stringify({ model, queries: plan.plannedQueries.map(q => ({ family: q.family, query: q.query, language: q.language })), coverageMode: plan.coverageMode }));
}

function input(values: Partial<Record<DefinitionField, string>>) {
  const d = emptyDefinition();
  for (const [field, value] of Object.entries(values)) d.fields[field as DefinitionField] = userValue(value!, 1, "offline");
  return semanticPlannerInput(searchIntent("offline", 1, "hash", d), "intent");
}
function term(sourceField: DefinitionField, anchor: string, scientificRole: ScientificRole, text = anchor, type: EnrichmentOutput["terms"][number]["type"] = "EXACT_TERM", language: "en" | "es" | "pt" | "und" = "es"): EnrichmentOutput["terms"][number] {
  return { sourceField, anchor, text, scientificRole, type, language, confidence: "HIGH" };
}
const fixtures = [
  ["seismic", "respuesta sísmica", "albañilería", "seismic response", "masonry"],
  ["structural", "fatiga", "puentes de acero", "fatigue", "steel bridges"],
  ["education", "retroalimentación", "actividades matemáticas digitales", "feedback", "digital mathematics activities"],
  ["qualitative", "memoria colectiva", "relatos de migración", "collective memory", "migration narratives"],
  ["biomedical", "adherencia terapéutica", "diabetes", "medication adherence", "diabetes"],
  ["humanities", "recepción literaria", "corpus de traducciones", "literary reception", "translation corpus"],
] as const;
for (const [name, phenomenon, object, englishPhenomenon, englishObject] of fixtures) {
  const i = input({ originalIdea: `${phenomenon}: ${object}`, topic: `${phenomenon}: ${object}`, problem: phenomenon, purpose: `Evaluar ${phenomenon}`, object, context: "Perú", concepts: `${phenomenon}; ${object}` });
  const raw: EnrichmentOutput = { terms: [term("problem", phenomenon, "PHENOMENON"), term("problem", phenomenon, "PHENOMENON", englishPhenomenon, "TRANSLATION", "en"), term("purpose", "Evaluar", "RESEARCH_ACTION"), term("object", object, "OBJECT_OR_SYSTEM"), term("object", object, "OBJECT_OR_SYSTEM", englishObject, "TRANSLATION", "en"), term("context", "Perú", "GEOGRAPHY")], ambiguities: [] };
  const plan = semanticQueryPack(enrichmentGroups(validateSearchEnrichment(i, raw)));
  assert.equal(plan.validation.valid, true, name);
  assert.equal(plan.plannedQueries[0].translationStatus, "ENGLISH_COMPLETE", name);
  assert.ok(plan.plannedQueries[0].query.includes(englishObject));
  assert.ok(!plan.plannedQueries[0].query.includes("Perú"));
  assert.equal(plan.plannedQueries.length, 2, "one core and one contextual family, no padding");
  assert.ok(!plan.plannedQueries.some(q => q.family === "RESEARCH_ACTION_PRECEDENT" || q.query.includes('"Evaluar"')));
  assert.ok(plan.plannedQueries[0].optionalConceptIds.some(id => plan.conceptPlan!.concepts.find(c => c.id === id)?.role === "RESEARCH_ACTION"));
  assert.deepEqual(validateScientificQueryPlan(plan), []);
  const duplicate = [...plan.plannedQueries, { ...plan.plannedQueries[0], id: "duplicate" }];
  assert.ok(queryRedundancyReasons(duplicate).length);
  const missingEnglish = { ...raw, terms: raw.terms.filter(t => t.text !== englishObject || t.language !== "en") };
  const local = semanticQueryPack(enrichmentGroups(validateSearchEnrichment(i, missingEnglish)));
  assert.equal(local.plannedQueries[0].translationStatus, "ORIGINAL_ONLY_ENGLISH_INCOMPLETE");
  assert.ok(local.plannedQueries[0].query.includes(object), "missing translation cannot delete object");
  const malicious = { ...raw, terms: raw.terms.map(t => t.sourceField === "context" ? { ...t, scientificRole: "OBJECT_OR_SYSTEM" as const } : t) };
  const guarded = validateSearchEnrichment(i, malicious).scientificConceptPlan!;
  assert.ok(guarded.diagnostics.some(d => d.code === "ROLE_PROMOTION_BLOCKED"));
  assert.ok(!guarded.concepts.some(c => c.value === "Perú" && c.role === "OBJECT_OR_SYSTEM"));
  console.log(`PASS ${name}: explicit roles, domain, language completeness, separate context`);
}

const actionInput = input({ topic: "Respuesta sísmica de albañilería", problem: "Determinar respuesta sísmica", object: "albañilería", purpose: "Evaluar respuesta sísmica" });
const actionPlan = semanticQueryPack(enrichmentGroups(validateSearchEnrichment(actionInput, { terms: [
  term("problem", "respuesta sísmica", "PHENOMENON"), term("problem", "Determinar", "RESEARCH_ACTION"),
  term("purpose", "Evaluar", "RESEARCH_ACTION"), term("object", "albañilería", "OBJECT_OR_SYSTEM"),
], ambiguities: [] })));
assert.equal(actionPlan.validation.valid, true);
assert.equal(actionPlan.plannedQueries.length, 1, "generic actions do not pad a narrow scientific plan");
for (const verb of ["Determinar", "Evaluar"]) {
  const action = actionPlan.conceptPlan!.concepts.find(c => c.value === verb)!;
  const object = actionPlan.conceptPlan!.concepts.find(c => c.value === "albañilería")!;
  const bad = { ...actionPlan.plannedQueries[0], family: "RESEARCH_ACTION_PRECEDENT" as const,
    requiredConceptIds: [action.id, object.id], requiredConcepts: [action.value, object.value] };
  assert.ok(validateScientificFamily(bad, actionPlan.conceptPlan!).includes("GENERIC_ACTION_NOT_SCIENTIFIC_ANCHOR"));
  assert.ok(validateScientificFamily(bad, actionPlan.conceptPlan!).includes("RESEARCH_ACTION_IS_OPTIONAL_REFINER"));
}
assert.ok(actionPlan.plannedQueries[0].query.includes('"respuesta sísmica"'));

const i = input({ topic: "Simulación sísmica de albañilería a escala natural", problem: "respuesta sísmica", object: "albañilería a escala natural", concepts: "simulación sísmica; escala natural", context: "Perú norma 2026", academicLevel: "MAESTRIA" });
const guarded = validateSearchEnrichment(i, { terms: [
  term("concepts", "escala natural", "PHENOMENON", "full-scale", "TRANSLATION", "en"),
  term("object", "albañilería", "OBJECT_OR_SYSTEM"),
  term("context", "norma 2026", "PHENOMENON"),
  term("academicLevel", "MAESTRIA", "CORE_CONCEPT"),
  term("methodPreference", "randomized experiment", "METHOD_OR_TECHNIQUE"),
], ambiguities: [] });
assert.equal(guarded.scientificConceptPlan!.concepts.find(c => c.value === "escala natural")?.role, "QUALIFIER");
assert.equal(guarded.scientificConceptPlan!.concepts.find(c => c.value === "norma 2026")?.role, "TIME_OR_STANDARD");
assert.ok(!guarded.scientificConceptPlan!.concepts.some(c => /MAESTRIA|randomized/.test(c.value)));
assert.equal(semanticQueryPack(enrichmentGroups(guarded)).validation.valid, false, "qualifier/context cannot supply missing phenomenon");
const exploratory = validateSearchEnrichment(i, { terms: [term("concepts", "simulación sísmica", "RESEARCH_ACTION", "simulation", "RELATED_TERM", "en"), term("object", "albañilería", "OBJECT_OR_SYSTEM")], ambiguities: [] });
assert.equal(semanticQueryPack(enrichmentGroups(exploratory)).validation.valid, false);
const unknownRole = validateSearchEnrichment(i, { terms: [{ ...term("concepts", "simulación sísmica", "RESEARCH_ACTION"), scientificRole: null }, term("object", "albañilería", "OBJECT_OR_SYSTEM")], ambiguities: [] });
assert.ok(unknownRole.scientificConceptPlan!.diagnostics.some(d => d.code === "SCIENTIFIC_ROLE_UNRESOLVED"));
assert.equal(semanticQueryPack(enrichmentGroups(unknownRole)).validation.valid, false);
const missingObject = validateSearchEnrichment(i, { terms: [term("problem", "respuesta sísmica", "PHENOMENON"), term("concepts", "simulación sísmica", "CORE_CONCEPT")], ambiguities: [] });
assert.equal(semanticQueryPack(enrichmentGroups(missingObject)).validation.valid, false, "accepted object may not silently disappear");
const newQualifierInput = input({ topic: "Análisis de sistemas de grado especial", object: "sistemas de grado especial", concepts: "grado especial" });
const newQualifier = validateSearchEnrichment(newQualifierInput, { terms: [term("concepts", "grado especial", "QUALIFIER")], ambiguities: [] });
assert.equal(newQualifier.scientificConceptPlan!.concepts[0].role, "QUALIFIER", "explicit qualifier stays restrictive, even inside object span");

const precedentInput = input({ topic: "Memoria y relatos", object: "relatos", concepts: "memoria; teoría narrativa", methodPreference: "análisis narrativo" });
const precedent = semanticQueryPack(enrichmentGroups(validateSearchEnrichment(precedentInput, { terms: [term("object", "relatos", "OBJECT_OR_SYSTEM"), term("concepts", "teoría narrativa", "THEORY_OR_FRAMEWORK"), term("methodPreference", "análisis narrativo", "METHOD_OR_TECHNIQUE")], ambiguities: [] })));
assert.equal(precedent.validation.valid, true);
assert.ok(precedent.plannedQueries.some(q => q.family === "METHOD_PRECEDENT"));
assert.ok(precedent.plannedQueries.some(q => q.family === "THEORETICAL_OR_MECHANISTIC"));

const narrowInput = input({ topic: "Memoria colectiva en relatos", concepts: "memoria colectiva; relatos" });
const narrow = semanticQueryPack(enrichmentGroups(validateSearchEnrichment(narrowInput, { terms: [term("concepts", "memoria colectiva", "CORE_CONCEPT"), term("concepts", "relatos", "CORE_CONCEPT")], ambiguities: [] })));
assert.equal(narrow.plannedQueries.length, 1, "narrow humanities intent does not require population or artificial diversity");
assert.equal(validateScientificQueryPlan({ ...narrow, necessaryOnly: ["unsafe"] }).includes("QUERY_RENDERING_MISMATCH"), true);
assert.equal(validateScientificQueryPlan({ ...narrow, necessaryOnly: ["unsafe"], plannedQueries: [{ ...narrow.plannedQueries[0], query: "unsafe" }] }).includes("QUERY_RENDERING_MISMATCH"), true);

const schema = z.toJSONSchema(enrichmentModelOutputSchema) as any;
assert.ok(schema.properties.terms.items.required.includes("scientificRole"));
assert.ok(schema.properties.terms.items.required.includes("language"));
assert.equal(networkCalls, 0);
console.log("PASS 2B1.2: stored plans, malicious role promotions, unknown/exploratory exclusions, method/theory, narrow plan, schema and zero network");
