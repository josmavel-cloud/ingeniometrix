import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { definitionSchema, searchIntent } from "@/lib/conversational-intake";
import { legacySearchIntent, plannerIntake, type ResearchSearchIntent } from "@/lib/retrieval-search-input";
import type { IntakeInput } from "@/server/projects/project-validation";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { REFERENCE_SEARCH_V2_1_PROMPT } from "@/server/mvp/prompts/reference-search-v2.v1";

export type SearchInput = { intakeId: string; intent: ResearchSearchIntent; plannerInput: IntakeInput };
export type SearchInputTrace = {
  searchAttemptId: string; projectId: string; intakeId: string; confirmedDraftRevision: number | null;
  definitionHash: string | null; researchSearchIntentSchemaVersion: string; searchIntentHash: string;
  searchEngineVersion: "reference-search-v2"; plannerVersion: string; timestamp: string;
};

export async function loadSearchInput(userId: string, projectId: string): Promise<SearchInput> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, include: { intake: true, draft: true } });
  if (!project || !project.intake) throw new Error("PROJECT_INTAKE_NOT_FOUND");
  const rawDefinition = (project.draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition;
  if (rawDefinition) {
    const confirmed = project.intake.confirmedDefinitionJson as { definition: unknown; revision: number; definitionHash: string } | null;
    if (!confirmed || project.draft?.confirmedRevision !== project.draft?.revision || confirmed.revision !== project.draft?.revision) throw new Error("DEFINITION_CONFIRMATION_REQUIRED");
    const current = definitionSchema.parse(rawDefinition);
    if (fingerprint(current) !== confirmed.definitionHash) throw new Error("DEFINITION_HASH_MISMATCH");
    const intent = searchIntent(projectId, confirmed.revision, confirmed.definitionHash, definitionSchema.parse(confirmed.definition));
    if (intent.readiness !== "READY") throw new Error("SEARCH_INTENT_NOT_READY");
    return { intakeId: project.intake.id, intent, plannerInput: plannerIntake(intent) };
  }
  const intent = legacySearchIntent(projectId, project.intake, project.degreeLevel, project.topicAreaLabel);
  if (intent.readiness !== "READY") throw new Error("SEARCH_INTENT_NOT_READY");
  return { intakeId: project.intake.id, intent, plannerInput: plannerIntake(intent, project.intake) };
}

// AuditLog is append-only here; the private snapshot retains old search inputs
// even when a later confirmation replaces Intake.confirmedDefinitionJson.
export async function freezeSearchInput(userId: string, input: SearchInput): Promise<SearchInputTrace> {
  const intent = input.intent;
  const trace: SearchInputTrace = {
    searchAttemptId: randomUUID(), projectId: intent.projectId, intakeId: input.intakeId,
    confirmedDraftRevision: intent.confirmedDraftRevision, definitionHash: intent.definitionHash,
    researchSearchIntentSchemaVersion: intent.schemaVersion, searchIntentHash: fingerprint(intent),
    searchEngineVersion: "reference-search-v2", plannerVersion: REFERENCE_SEARCH_V2_1_PROMPT.version,
    timestamp: new Date().toISOString(),
  };
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${intent.projectId} AND "userId" = ${userId} FOR UPDATE`;
    const current = await tx.project.findFirst({ where: { id: intent.projectId, userId }, include: { draft: true, intake: true } });
    if (!current?.intake || current.intake.id !== input.intakeId) throw new Error("SEARCH_INPUT_STALE");
    if (intent.sourceKind === "CONFIRMED_DEFINITION") {
      if (current.draft?.revision !== intent.confirmedDraftRevision || current.draft.confirmedRevision !== intent.confirmedDraftRevision ||
        fingerprint(definitionSchema.parse((current.draft.contentJson as Record<string, unknown>).researchDefinition)) !== intent.definitionHash ||
        (current.intake.confirmedDefinitionJson as { definitionHash?: string } | null)?.definitionHash !== intent.definitionHash) throw new Error("SEARCH_INPUT_STALE");
    } else if ((current.draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition) throw new Error("SEARCH_INPUT_STALE");
    await tx.auditLog.create({ data: { eventType: "SEARCH_INPUT_FROZEN", actorType: "SYSTEM", userId,
      projectId: intent.projectId, payloadJson: JSON.parse(JSON.stringify({ ...trace, intent, plannerInput: input.plannerInput })) as Prisma.InputJsonValue } });
  });
  return trace;
}

export function searchInputIsStale(trace: SearchInputTrace, current: { revision: number | null; definitionHash: string | null }) {
  return trace.confirmedDraftRevision !== current.revision || trace.definitionHash !== current.definitionHash;
}
