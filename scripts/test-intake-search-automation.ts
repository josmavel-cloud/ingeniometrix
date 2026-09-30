import assert from "node:assert/strict";
import { confirmedScientificDefinitionMatches, emptyDefinition, globalConfirmationPreview, sameScientificDefinition, searchIntent, userValue } from "@/lib/conversational-intake";
import { fallbackSearchEnrichment, semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { chooseSafeSearchPlan, SearchPlanningError } from "@/lib/search-planning-outcome";

const definition = emptyDefinition();
definition.fields.originalIdea = userValue("Diseñar y evaluar una intervención académica", 1, "idea");
definition.fields.academicLevel = userValue("MAESTRIA", 1, "idea");
const proposed = [
  ["topic", "Intervención para mejorar el aprendizaje en actividades digitales"],
  ["problem", "Dificultades de aprendizaje en actividades digitales"],
  ["purpose", "Evaluar una intervención de aprendizaje"],
  ["object", "Actividades digitales de estudiantes"],
  ["concepts", "Aprendizaje; actividades digitales"],
] as const;
for (const [field, value] of proposed) definition.proposals.push({ id: `idea:${field}`, field, baseRevision: 1, status: "PENDING",
  proposed: { value, origin: "AI_PROPOSED", acceptance: "UNREVIEWED", knowledge: "KNOWN", sourceMessageIds: ["idea"], lastChangedRevision: 1 } });
const approved = globalConfirmationPreview(definition);
assert.equal(definition.fields.object.knowledge, "UNKNOWN", "a proposal is not silently confirmed");
for (const [field] of proposed) assert.equal(approved.fields[field].acceptance, "ACCEPTED", "one global confirmation accepts the visible summary");
assert.equal(approved.fields.methodPreference.knowledge, "UNKNOWN");
assert.equal(approved.fields.intendedOutput.knowledge, "UNKNOWN");
assert.equal(approved.fields.dataAccess.knowledge, "UNKNOWN");
const answered = structuredClone(definition);
answered.ambiguities.push({ id: "earlier-question", field: "object", question: "¿Qué objeto estudiarás?", blocksSearch: true,
  resolved: false, createdRevision: 1 });
assert.equal(globalConfirmationPreview(answered).ambiguities[0].resolved, true,
  "the next-turn proposal resolves an earlier question during global confirmation");
const cosmetic = structuredClone(approved);
cosmetic.proposals.push({ id: "pending", field: "object", baseRevision: 15, status: "PENDING",
  proposed: { value: "Otro objeto posible", origin: "AI_PROPOSED", acceptance: "UNREVIEWED", knowledge: "KNOWN",
    sourceMessageIds: ["refinement"], lastChangedRevision: 15 } });
assert.equal(sameScientificDefinition(approved, cosmetic), true, "an unapproved alternative does not stale search");
assert.equal(confirmedScientificDefinitionMatches(cosmetic, { definition: approved, definitionHash: "historical-hash" }), true);
const material = structuredClone(approved);
material.fields.object = userValue("Un objeto científico distinto", 15, "refinement");
assert.equal(sameScientificDefinition(approved, material), false, "material scope changes need confirmation");

const intent = searchIntent("test-project", 14, "synthetic-definition-hash", approved);
const input = semanticPlannerInput(intent, "synthetic-intent-hash");
assert.equal(input.readiness, "READY");
const semantic = fallbackSearchEnrichment(input);
semantic.planMode = "SEMANTIC";
semantic.terms = []; // A paid planner returned unusable terms despite valid input.
semantic.status = "NEEDS_CLARIFICATION";
semantic.scientificConceptPlan = undefined;
const selected = chooseSafeSearchPlan(input, semantic);
assert.equal(selected.enrichment.planMode, "DEGRADED");
assert.equal(selected.enrichment.status, "READY");
assert.equal(selected.pack.validation.valid, true);
assert.equal(selected.failure, null);
assert.equal(selected.degradationReason, "SEARCH_ENRICHMENT_INVALID");
assert.throws(() => chooseSafeSearchPlan({ ...input, readiness: "NEEDS_CLARIFICATION" }, semantic),
  (error: unknown) => error instanceof SearchPlanningError && error.code === "REAL_USER_CLARIFICATION_REQUIRED");
console.log("PASS global confirmation and incident-like planner fallback without provider calls");

for (const domain of ["ingeniería estructural", "educación digital", "salud comunitaria", "entrevistas sociales", "gestión empresarial", "archivos históricos"]) {
  const fixture = emptyDefinition();
  fixture.fields.originalIdea = userValue(`Investigar ${domain} con evidencia verificable`, 1, "idea");
  fixture.fields.topic = userValue(`Investigación aplicada sobre ${domain}`, 1, "idea");
  fixture.fields.object = userValue(`Prácticas y sistemas de ${domain}`, 1, "idea");
  fixture.fields.concepts = userValue(`Prácticas; sistemas; ${domain}`, 1, "idea");
  const projection = semanticPlannerInput(searchIntent(`fixture-${domain}`, 1, "hash", fixture), "hash");
  const plan = chooseSafeSearchPlan(projection, fallbackSearchEnrichment(projection));
  assert.equal(plan.pack.validation.valid, true, domain);
}
console.log("PASS six multidisciplinary search fixtures with optional fields UNKNOWN");
