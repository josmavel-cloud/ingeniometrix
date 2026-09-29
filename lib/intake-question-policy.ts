import { SEARCH_MATERIAL_FIELDS, usable, type ResearchDefinition } from "./conversational-intake";
import type { IntakeTurnResult } from "./intake-turn-contract";

const coreFields = new Set(["topic", "problem", "object", "concepts"]);
const materialFields = SEARCH_MATERIAL_FIELDS;

export function materialAmbiguities(result: IntakeTurnResult) {
  return result.ambiguities.map(a => ({ ...a, blocksSearch: a.blocksSearch && materialFields.has(a.field) }));
}

// The model can propose a question, but only material gaps become another turn.
// Unaccepted proposals count as provisional understanding, never as confirmed facts.
export function materialQuestion(result: IntakeTurnResult, definition: ResearchDefinition, previousQuestions: number) {
  const question = result.nextQuestion;
  if (!question || previousQuestions >= 3) return null;
  if (!materialFields.has(question.field)) return null;
  const blocking = materialAmbiguities(result).some(a => a.blocksSearch && a.field === question.field);
  if (!blocking && !coreFields.has(question.field)) return null;
  const provisionallyKnown = (field: "topic" | "object" | "concepts") =>
    usable(definition.fields[field]) || result.proposedChanges.some(p => p.field === field && p.knowledge === "KNOWN" && Boolean(p.value.trim()));
  if (!blocking && provisionallyKnown("topic") && (provisionallyKnown("object") || provisionallyKnown("concepts"))) return null;
  if (!blocking && (usable(definition.fields[question.field]) || result.proposedChanges.some(p => p.field === question.field && p.knowledge === "KNOWN"))) return null;
  return question;
}
