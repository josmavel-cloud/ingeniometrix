import { z } from "zod";
import { draftIntakeFrom } from "./project-draft-contract";

export const DEFINITION_FIELDS = ["originalIdea", "topic", "problem", "purpose", "object", "context", "scope", "concepts", "intendedOutput", "methodPreference", "dataAccess", "constraints", "researchLine", "advisorNotes", "pendingDecisions", "taxonomy", "academicLevel"] as const;
export const fieldKeySchema = z.enum(DEFINITION_FIELDS);
export type DefinitionField = z.infer<typeof fieldKeySchema>;
export const FIELD_LABELS: Record<DefinitionField, string> = {
  originalIdea: "Idea original", topic: "Tema", problem: "Problema o fenómeno", purpose: "Propósito", object: "Objeto, población, corpus o sistema",
  context: "Contexto científico", scope: "Alcance", concepts: "Conceptos, categorías o constructos", intendedOutput: "Resultado o contribución esperada",
  methodPreference: "Preferencia metodológica", dataAccess: "Datos y acceso", constraints: "Restricciones", researchLine: "Línea de investigación",
  advisorNotes: "Notas del asesor", pendingDecisions: "Decisiones pendientes", taxonomy: "Área académica", academicLevel: "Nivel académico",
};
export const fieldValueSchema = z.object({
  value: z.string().max(8000), origin: z.enum(["USER_EXPLICIT", "AI_PROPOSED", "AI_INFERRED", "SYSTEM_DEFAULT", "LEGACY_UNVERIFIED"]),
  acceptance: z.enum(["UNREVIEWED", "ACCEPTED", "REJECTED"]), knowledge: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]),
  sourceMessageIds: z.array(z.string()).max(8), interpretationConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), lastChangedRevision: z.number().int(),
  confirmation: z.object({ revision: z.number().int(), valueHash: z.string(), actorId: z.string(), timestamp: z.string() }).optional(),
}).strict();
export type FieldValue = z.infer<typeof fieldValueSchema>;
export const ambiguitySchema = z.object({ id: z.string().max(100), field: fieldKeySchema, question: z.string().max(600), blocksSearch: z.boolean(), resolved: z.boolean(), createdRevision: z.number().int().positive().optional() }).strict();
export const proposalSchema = z.object({ id: z.string(), field: fieldKeySchema, proposed: fieldValueSchema, baseRevision: z.number().int(), status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "STALE"]) }).strict();
export const definitionSchema = z.object({
  schemaVersion: z.literal("research-definition.v1"), fields: z.record(fieldKeySchema, fieldValueSchema),
  proposals: z.array(proposalSchema).max(160), ambiguities: z.array(ambiguitySchema).max(24),
}).strict();
export type ResearchDefinition = z.infer<typeof definitionSchema>;
export const conversationalViewSchema = z.object({ id: z.string(), revision: z.number().int(), confirmedRevision: z.number().int().nullable(), etag: z.string(), definitionHash: z.string(), definition: definitionSchema });
export type ConversationalView = z.infer<typeof conversationalViewSchema>;
export function emptyDefinition(): ResearchDefinition {
  return definitionSchema.parse({ schemaVersion: "research-definition.v1", fields: Object.fromEntries(DEFINITION_FIELDS.map(k => [k, { value: "", origin: "SYSTEM_DEFAULT", acceptance: "UNREVIEWED", knowledge: "UNKNOWN", sourceMessageIds: [], lastChangedRevision: 0 }])), proposals: [], ambiguities: [] });
}
export function userValue(value: string, revision: number, messageId: string, knowledge: FieldValue["knowledge"] = "KNOWN"): FieldValue {
  return { value: knowledge === "KNOWN" ? value.trim() : "", origin: "USER_EXPLICIT", acceptance: "ACCEPTED", knowledge, sourceMessageIds: [messageId], lastChangedRevision: revision };
}
export function usable(field: FieldValue) {
  return field.knowledge === "KNOWN" && field.acceptance === "ACCEPTED" && field.origin !== "SYSTEM_DEFAULT" && Boolean(field.value.trim());
}
export const READINESS_POLICY_VERSION = "initial-evidence.v2";
export const SEARCH_MATERIAL_FIELDS = new Set<DefinitionField>(["topic", "problem", "object", "concepts", "purpose", "context", "intendedOutput", "scope"]);
export function ambiguityBlocksSearch(a: ResearchDefinition["ambiguities"][number]) {
  return !a.resolved && a.blocksSearch && SEARCH_MATERIAL_FIELDS.has(a.field);
}
export function canDeferAmbiguity(a: ResearchDefinition["ambiguities"][number]) {
  return !["topic", "problem", "object", "concepts", "originalIdea", "academicLevel"].includes(a.field);
}
export function definitionReadiness(d: ResearchDefinition) {
  const missing: string[] = [];
  if (!usable(d.fields.topic)) missing.push("Aclara y acepta el tema que quieres investigar.");
  if (!usable(d.fields.object) && !usable(d.fields.concepts)) missing.push("Identifica el objeto, corpus, sistema o los conceptos centrales; no necesitas una muestra numérica.");
  const blocked = d.ambiguities.filter(ambiguityBlocksSearch);
  missing.push(...blocked.map(a => a.question));
  return { policyVersion: READINESS_POLICY_VERSION, projectCreation: usable(d.fields.originalIdea) && usable(d.fields.academicLevel), evidenceSearch: { status: missing.length ? "NEEDS_CLARIFICATION" as const : "READY" as const, reasons: missing },
    scientificDesign: { status: "PENDING_SCIENTIFIC_REVIEW" as const, reasons: ["La confirmación del intake no aprueba un diseño científico; falta la evidencia y revisión de G1."] },
    optionalEnrichment: DEFINITION_FIELDS.filter(k => !usable(d.fields[k]) && !["originalIdea", "topic", "object", "academicLevel"].includes(k)) };
}
export const legacyFields = { topic: "topic", problemContext: "problem", targetPopulation: "object", researchScope: "scope", constructs: "concepts", preferredMethodology: "methodPreference", availableData: "dataAccess", academicConstraints: "constraints", researchLine: "researchLine", advisorNotes: "advisorNotes", pendingDecisions: "pendingDecisions" } as const;
export function legacyDefinition(intake: unknown): ResearchDefinition {
  const d = emptyDefinition(), raw = draftIntakeFrom(intake);
  for (const [key, field] of Object.entries(legacyFields)) if (raw[key as keyof typeof raw]) d.fields[field] = { ...d.fields[field], value: raw[key as keyof typeof raw], origin: "LEGACY_UNVERIFIED", knowledge: "KNOWN" };
  return d;
}
export function projectIntake(d: ResearchDefinition) {
  return draftIntakeFrom(Object.fromEntries(Object.entries(legacyFields).map(([key, field]) => [key, usable(d.fields[field]) ? d.fields[field].value : ""])));
}
export function searchIntent(projectId: string, revision: number, definitionHash: string, d: ResearchDefinition) {
  const value = (key: DefinitionField) => usable(d.fields[key]) ? d.fields[key].value : null;
  return { schemaVersion: "research-search-intent.v2" as const, sourceKind: "CONFIRMED_DEFINITION" as const, projectId, confirmedDraftRevision: revision, definitionHash,
    userOriginalIdea: value("originalIdea"), coreProblem: value("problem"), topic: value("topic"), coreConcepts: value("concepts") ? [value("concepts")] : [],
    objectOrPopulation: value("object"), context: value("context"), scope: value("scope"), purpose: value("purpose"), intendedOutput: value("intendedOutput"),
    methodologicalSignals: value("methodPreference") ? [{ kind: "USER_PREFERENCE", value: value("methodPreference") }] : [],
    explicitConstraints: value("constraints") ? [value("constraints")] : [], taxonomy: value("taxonomy"), academicLevel: value("academicLevel"),
    unresolvedFields: DEFINITION_FIELDS.filter(k => !usable(d.fields[k])).map(field => ({ field, knowledge: d.fields[field].knowledge })),
    unresolvedAmbiguities: d.ambiguities.filter(a => !a.resolved).map(a => ({ field: a.field, reason: a.question, blocksSearch: ambiguityBlocksSearch(a) })),
    fieldProvenance: Object.fromEntries(DEFINITION_FIELDS.filter(k => usable(d.fields[k])).map(k => [k, d.fields[k]])), readiness: definitionReadiness(d).evidenceSearch.status };
}
export type ConfirmedResearchSearchIntent = ReturnType<typeof searchIntent>;

export const definitionActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EDIT"), field: fieldKeySchema, value: z.string().max(8000), knowledge: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]) }).strict(),
  z.object({ kind: z.enum(["ACCEPT", "REJECT"]), proposalId: z.string().max(160) }).strict(),
  z.object({ kind: z.literal("RESOLVE"), ambiguityId: z.string().max(100), answer: z.string().min(1).max(2000) }).strict(),
  z.object({ kind: z.literal("DEFER"), ambiguityId: z.string().max(100) }).strict(),
]);
export type DefinitionAction = z.infer<typeof definitionActionSchema>;
export function applyDefinitionAction(raw: ResearchDefinition, action: DefinitionAction, revision: number, messageId: string): ResearchDefinition {
  const d = structuredClone(raw);
  if (action.kind === "EDIT") {
    if (action.field === "originalIdea") throw new Error("ORIGINAL_IDEA_IMMUTABLE");
    if (action.field === "academicLevel" && !["PREGRADO", "MAESTRIA", "PROYECTO_INVESTIGACION"].includes(action.value)) throw new Error("INVALID_ACADEMIC_LEVEL");
    d.fields[action.field] = userValue(action.value, revision, messageId, action.knowledge === "KNOWN" && !action.value.trim() ? "UNKNOWN" : action.knowledge);
    for (const p of d.proposals) if (p.field === action.field && p.status === "PENDING") p.status = "STALE";
    if (usable(d.fields[action.field])) for (const a of d.ambiguities) if (a.field === action.field) a.resolved = true;
  } else if (action.kind === "DEFER") {
    const a = d.ambiguities.find(a => a.id === action.ambiguityId);
    if (!a || !canDeferAmbiguity(a)) throw new Error("CORE_AMBIGUITY_REQUIRES_ANSWER");
    // Explicitly keep the uncertainty; never invent a field value or acceptance.
    a.blocksSearch = false;
  } else if (action.kind === "RESOLVE") {
    const a = d.ambiguities.find(a => a.id === action.ambiguityId); if (!a) throw new Error("AMBIGUITY_NOT_FOUND");
    if (["originalIdea", "academicLevel"].includes(a.field)) throw new Error("USE_EXPLICIT_FIELD_CONTROL");
    if (!action.answer.trim()) throw new Error("AMBIGUITY_ANSWER_REQUIRED");
    a.resolved = true; d.fields[a.field] = userValue(action.answer, revision, messageId);
    for (const p of d.proposals) if (p.field === a.field && p.status === "PENDING") p.status = "STALE";
  } else {
    const p = d.proposals.find(p => p.id === action.proposalId); if (!p || p.status !== "PENDING") throw new Error("PROPOSAL_NOT_PENDING");
    if (action.kind === "REJECT") p.status = "REJECTED";
    else {
      if (d.fields[p.field].lastChangedRevision > p.baseRevision) throw new Error("PROPOSAL_STALE");
      p.status = "ACCEPTED"; d.fields[p.field] = { ...p.proposed, acceptance: "ACCEPTED", lastChangedRevision: revision, confirmation: undefined };
      if (usable(d.fields[p.field])) for (const a of d.ambiguities) {
        // A proposal preceding (or accompanying) a question cannot answer it.
        // Legacy ambiguities retain their turn ID, allowing conservative dating.
        const turnId = a.id.split(":a")[0];
        const createdRevision = a.createdRevision ?? d.proposals.find(old => old.id.startsWith(`${turnId}:`))?.baseRevision;
        const predatesProposal = a.createdRevision !== undefined ? p.baseRevision >= a.createdRevision : createdRevision !== undefined && p.baseRevision > createdRevision;
        if (a.field === p.field && predatesProposal) a.resolved = true;
      }
    }
  }
  return definitionSchema.parse(d);
}
