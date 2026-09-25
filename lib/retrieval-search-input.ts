import type { Intake } from "@prisma/client";
import { DEFINITION_FIELDS, type ConfirmedResearchSearchIntent } from "./conversational-intake";
import type { IntakeInput } from "@/server/projects/project-validation";

type LegacySource = Pick<Intake, "topic" | "problemContext" | "targetPopulation" | "researchScope" | "constructs" | "preferredMethodology" | "academicConstraints" | "researchLine" | "availableData" | "advisorNotes" | "pendingDecisions">;
const nonempty = (text: string | null | undefined) => text?.trim() || null;

// Legacy provenance is deliberately unverifiable. Do not infer geography from
// Project.country or promote the old projection to a confirmed Phase 1 snapshot.
export function legacySearchIntent(projectId: string, intake: LegacySource, academicLevel: string, taxonomy: string | null) {
  const fieldValues: Record<string, string | null> = {
    topic: nonempty(intake.topic), problem: nonempty(intake.problemContext), object: nonempty(intake.targetPopulation),
    scope: nonempty(intake.researchScope), concepts: nonempty(intake.constructs), methodPreference: nonempty(intake.preferredMethodology),
    constraints: nonempty(intake.academicConstraints), researchLine: nonempty(intake.researchLine), dataAccess: nonempty(intake.availableData),
    advisorNotes: nonempty(intake.advisorNotes), pendingDecisions: nonempty(intake.pendingDecisions),
    taxonomy: nonempty(taxonomy), academicLevel: nonempty(academicLevel),
  };
  return {
    schemaVersion: "research-search-intent.v2" as const, sourceKind: "LEGACY_COMPATIBILITY" as const, projectId,
    confirmedDraftRevision: null, definitionHash: null, userOriginalIdea: null, coreProblem: fieldValues.problem,
    topic: fieldValues.topic, coreConcepts: fieldValues.concepts ? [fieldValues.concepts] : [],
    objectOrPopulation: fieldValues.object, context: null, scope: fieldValues.scope, purpose: null, intendedOutput: null,
    methodologicalSignals: fieldValues.methodPreference ? [{ kind: "LEGACY_UNVERIFIED_PREFERENCE", value: fieldValues.methodPreference }] : [],
    explicitConstraints: fieldValues.constraints ? [fieldValues.constraints] : [], taxonomy: nonempty(taxonomy), academicLevel: nonempty(academicLevel),
    unresolvedFields: DEFINITION_FIELDS.filter(field => !fieldValues[field]).map(field => ({ field, knowledge: "UNKNOWN" as const })),
    unresolvedAmbiguities: [],
    fieldProvenance: Object.fromEntries(Object.entries(fieldValues).filter(([, value]) => value).map(([field]) => [field, { origin: "LEGACY_UNVERIFIED", acceptance: "UNVERIFIED" }])),
    readiness: fieldValues.topic ? "READY" as const : "NEEDS_CLARIFICATION" as const,
  };
}

export type ResearchSearchIntent = ConfirmedResearchSearchIntent | ReturnType<typeof legacySearchIntent>;

// Adapter to the unchanged v2 query planner. For new projects every input comes
// from accepted SearchIntent values; unknowns and ambiguity questions are never
// used as terms. Legacy projects retain their historical planner mapping.
export function plannerIntake(intent: ResearchSearchIntent, legacy?: LegacySource): IntakeInput {
  if (intent.sourceKind === "LEGACY_COMPATIBILITY") {
    if (!legacy) throw new Error("LEGACY_INTAKE_REQUIRED");
    return {
      topic: legacy.topic, problemContext: legacy.problemContext ?? undefined, targetPopulation: legacy.targetPopulation ?? undefined,
      researchLine: legacy.researchLine ?? undefined, academicConstraints: legacy.academicConstraints ?? undefined,
      availableData: legacy.availableData ?? undefined, preferredMethodology: legacy.preferredMethodology ?? undefined,
      advisorNotes: legacy.advisorNotes ?? undefined,
    };
  }
  if (!intent.topic) throw new Error("SEARCH_INTENT_TOPIC_REQUIRED");
  const context = [intent.coreProblem, intent.context].filter(Boolean).join("; ");
  return {
    topic: intent.topic,
    problemContext: context || undefined,
    targetPopulation: intent.objectOrPopulation ?? undefined,
    researchLine: intent.taxonomy ?? undefined,
    academicConstraints: intent.explicitConstraints.join("; ") || undefined,
    preferredMethodology: intent.methodologicalSignals[0]?.value ?? undefined,
  };
}
