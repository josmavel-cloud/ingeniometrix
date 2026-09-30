import assert from "node:assert/strict";
import { applyDefinitionAction, definitionReadiness, emptyDefinition, userValue } from "@/lib/conversational-intake";
import { materialAmbiguities, materialQuestion } from "@/lib/intake-question-policy";
import type { IntakeTurnResult } from "@/lib/intake-turn-contract";

const make = (question: IntakeTurnResult["nextQuestion"], proposals: IntakeTurnResult["proposedChanges"] = [], ambiguities: IntakeTurnResult["ambiguities"] = []): IntakeTurnResult =>
  ({ schemaVersion: "intake-turn.v1", baseRevision: 1, assistantText: "Entiendo la idea; lo pendiente se puede revisar después.", proposedChanges: proposals, ambiguities, nextQuestion: question });
const proposal = (field: IntakeTurnResult["proposedChanges"][number]["field"], value: string): IntakeTurnResult["proposedChanges"][number] =>
  ({ field, value, origin: "AI_INFERRED", knowledge: "KNOWN", sourceMessageIds: ["idea-id"], interpretationConfidence: "MEDIUM" });
const field = (name: "object" | "problem" | "concepts", question: string): NonNullable<IntakeTurnResult["nextQuestion"]> => ({ field: name, question, options: ["Amplio por ahora", "Tengo un contexto concreto"] });

const detailed = emptyDefinition();
detailed.fields.topic = userValue("Diseñar y evaluar un protocolo de retroalimentación automática para actividades digitales de matemáticas en secundaria", 1, "idea-id");
const detailedOutput = make(field("object", "¿A quién se dirige?"), [proposal("object", "Actividades digitales de matemáticas en secundaria")]);
assert.equal(materialQuestion(detailedOutput, detailed, 0), null);
assert.equal(detailed.fields.object.knowledge, "UNKNOWN");
assert.equal(definitionReadiness(detailed).evidenceSearch.status, "NEEDS_CLARIFICATION", "A proposal is not confirmed truth");

const medium = emptyDefinition();
medium.fields.topic = userValue("Mejorar la retroalimentación en matemáticas digitales", 1, "idea-id");
const mediumQuestion = materialQuestion(make(field("object", "¿Qué actividad u objeto quieres estudiar?")), medium, 0);
assert.equal(mediumQuestion?.options.length, 2);
const mediumAfter = applyDefinitionAction(medium, { kind: "EDIT", field: "object", value: "Actividades matemáticas digitales", knowledge: "KNOWN" }, 2, "reply-id");
assert.equal(definitionReadiness(mediumAfter).evidenceSearch.status, "READY");
assert.equal(materialQuestion(make(field("problem", "¿Cuál es el problema?")), mediumAfter, 1), null);
assert.equal(materialQuestion(make({ field: "methodPreference", question: "¿Qué método usarás?", options: [] }), mediumAfter, 1), null);

const vague = emptyDefinition();
vague.fields.topic = userValue("Tecnología y educación", 1, "idea-id");
const vagueOutput = make(field("problem", "¿Qué aspecto quieres comprender?"));
assert.ok(materialQuestion(vagueOutput, vague, 0));
assert.ok(materialQuestion(make(field("object", "¿Qué objeto observarás?")), vague, 1));
assert.ok(materialQuestion(make(field("concepts", "¿Qué conceptos importan?")), vague, 2));
assert.equal(materialQuestion(make(field("concepts", "¿Algo más?")), vague, 3), null);
assert.equal(definitionReadiness(vague).evidenceSearch.status, "NEEDS_CLARIFICATION");
assert.equal(materialAmbiguities(make(null, [], [{ field: "methodPreference", question: "¿Qué método?", blocksSearch: true }]))[0].blocksSearch, false);

console.log(JSON.stringify({ detailed: { questions: 0, quickReplies: 0, confirmedFields: ["topic"], unknownFields: ["object"], searchReadiness: "NEEDS_CLARIFICATION" }, medium: { questions: 1, quickReplies: 2, confirmedFields: ["topic", "object"], unknownFields: ["methodPreference"], searchReadiness: "READY" }, vague: { questions: 3, quickReplies: 6, confirmedFields: ["topic"], unknownFields: ["object", "concepts"], searchReadiness: "NEEDS_CLARIFICATION" }, fabricatedCertainty: false }));
