import { listProjectsForUser, getProjectForUser } from "@/server/projects/project-service";
import { listProjectReferences } from "@/server/retrieval/reference-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { getTopicProjectForUser, listTopicSuggestionsForUser } from "@/server/projects/topic-suggestion-service";
import { purchaseForUser } from "@/server/commercial/purchases";
import type { PageContract } from "@/lib/hybrid-contracts";
import { definitionSchema } from "@/lib/conversational-intake";
import { fingerprint } from "@/server/mvp/job-execution-context";

function definitionConfirmed(p: { draft?: { confirmedRevision: number | null; contentJson: unknown } | null;
  intake?: { confirmedDefinitionJson: unknown } | null }) {
  const saved = p.intake?.confirmedDefinitionJson as { revision?: number; definitionHash?: string } | null | undefined;
  const raw = (p.draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition;
  const parsed = raw ? definitionSchema.safeParse(raw) : null;
  return Boolean(saved?.definitionHash && saved.revision === p.draft?.confirmedRevision && parsed?.success &&
    fingerprint(parsed.data) === saved.definitionHash);
}

// Older conversational confirmations intentionally left Project.status=DRAFT.
// Derive the display state from the canonical confirmation, without backfilling
// history or changing later scientific/commercial workflow states.
function presentationStatus(p: Awaited<ReturnType<typeof listProjectsForUser>>[number] | NonNullable<Awaited<ReturnType<typeof getProjectForUser>>>) {
  const conversational = Boolean((p.draft?.contentJson as Record<string, unknown> | null)?.researchDefinition);
  if (!conversational || !["DRAFT", "INTAKE_READY"].includes(p.status)) return p.status;
  return definitionConfirmed(p) ? "INTAKE_READY" : "DRAFT";
}

export async function ownedPageData(userId: string, kind: string, id?: string) {
  if (kind === "projects" && !id) {
    const projects = await listProjectsForUser(userId);
    return projects.map((p) => {
      const job = p.blueprintJobs[0];
      return { id: p.id, title: p.title, program: p.program, status: presentationStatus(p), updatedAt: p.updatedAt.toISOString(),
        latestJob: job ? { id: job.id, status: job.status, currentStage: job.currentStage, progress: job.progress,
          errorMessage: job.errorMessage, updatedAt: job.updatedAt.toISOString(), shouldNudge: false } : null,
        artifactCount: p.generatedArtifacts.length, hasDocx: p.generatedArtifacts.some((a) => a.kind === "BLUEPRINT_DOCX"),
        hasPdf: p.generatedArtifacts.some((a) => a.kind === "BLUEPRINT_PDF" || a.kind === "SOURCE_PDF") };
    }) satisfies PageContract["projects"];
  }
  if (!id) return null;
  // Ownership before any subsequent lookup (including the legacy unscoped snapshot reader).
  if (kind === "purchase") { const purchase = await purchaseForUser(userId, id).catch(() => null); return purchase ? { id: purchase.id } : null; }
  const p = await getProjectForUser(userId, id);
  if (!p) return null;
  if (kind === "detail") {
    const [references, initialReferenceSearchSnapshot, versions] = await Promise.all([
      listProjectReferences(userId, id, { languageOverride: "es" }), getLatestProjectReferenceSearchSnapshot(id), listBlueprintVersionsForUser(userId, id),
    ]);
    return {
      project: { id: p.id, title: p.title, catalogTopicId: p.catalogTopicId, country: p.country,
        degreeLevel: p.degreeLevel, status: presentationStatus(p), topicAreaLabel: p.topicAreaLabel,
        activeBlueprintVersionId: p.activeBlueprintVersionId, intake: p.intake,
        conversationalIntake: Boolean((p.draft?.contentJson as Record<string, unknown> | null)?.researchDefinition),
        definitionConfirmed: definitionConfirmed(p),
        confirmedDefinitionHash: (p.intake?.confirmedDefinitionJson as { definitionHash?: string } | null)?.definitionHash ?? null,
        draft: p.draft ? { revision: p.draft.revision, staleScopesJson: p.draft.staleScopesJson } : null,
        knowledgeFields: p.knowledgeFields.map((f) => ({ customLabel: f.customLabel, concept: f.concept ? { labelEs: f.concept.labelEs } : null })) },
      references, initialReferenceSearchSnapshot,
      blueprintVersions: versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, createdAt: v.createdAt.toISOString(),
        blueprintJson: v.blueprintJson as Record<string, unknown>, coherenceReportJson: v.coherenceReportJson as Record<string, unknown>,
        originatingDraftRevision: v.originatingDraftRevision, publicationStatus: v.publicationStatus, userLabel: v.userLabel })),
    } satisfies PageContract["detail"];
  }
  if (kind === "topic") {
    const project = await getTopicProjectForUser(userId, id);
    return { project: { id: project.id, title: project.title, topicAreaLabel: project.topicAreaLabel,
      conversationalIntake: Boolean((p.draft?.contentJson as Record<string, unknown> | null)?.researchDefinition),
      topicSelectionStatus: project.topicSelectionStatus, topicOriginType: project.topicOriginType, topicSeedText: project.topicSeedText },
      suggestions: await listTopicSuggestionsForUser(userId, id) } satisfies PageContract["topic"];
  }
  return null;
}
