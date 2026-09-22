import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { jobCostPolicy, pageBudgetPolicy } from "@/server/mvp/execution-policy";
import { GENERATION_POLICY_VERSION, SCIENTIFIC_MODEL } from "@/server/mvp/generation-budgets";
import { MVP_SOURCE_INSPECTION_KEY } from "@/server/mvp/source-inspection-service";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT } from "@/server/mvp/prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT } from "@/server/mvp/prompts/scientific-design-critic.v3";
import { SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT } from "@/server/mvp/prompts/scientific-design-critic-recovery.v1";
import { SCIENTIFIC_DESIGN_REPAIR_PROMPT } from "@/server/mvp/prompts/scientific-design-repair.v1";
import { SCIENTIFIC_DESIGN_OUTPUT_REPAIR_PROMPT } from "@/server/mvp/prompts/scientific-design-output-repair.v1";
import { APPROVED_SCIENTIFIC_PLAN_PROMPT } from "@/server/mvp/prompts/scientific-plan-approved.v1";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";
import { CONSISTENCY_MATRIX_PROMPT } from "@/server/mvp/prompts/consistency-matrix.v1";

type FrozenInput = { id: string; jobId: string; project: Record<string, any>; referenceCandidates?: unknown[]; sourceMaterializations?: unknown[]; inspection: { id: string; outputSnapshotJson: unknown } | null; draft: unknown; policies: unknown };
const context = new AsyncLocalStorage<FrozenInput | null>();
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function scientificRuntimePolicy() {
  return { version: GENERATION_POLICY_VERSION, cost: jobCostPolicy(), pages: pageBudgetPolicy(null), promptHash: fingerprint([SCIENTIFIC_DESIGN_SELECTOR_PROMPT, SCIENTIFIC_DESIGN_CRITIC_PROMPT, SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT, SCIENTIFIC_DESIGN_REPAIR_PROMPT, SCIENTIFIC_DESIGN_OUTPUT_REPAIR_PROMPT, APPROVED_SCIENTIFIC_PLAN_PROMPT, STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT, CONSISTENCY_MATRIX_PROMPT]), configuredModels: { extraction: process.env.IMX_STEP5_EXTRACTION_MODEL ?? process.env.LLM_FAST_MODEL ?? process.env.LLM_DEFAULT_MODEL ?? "gpt-5.4-mini", scientific: SCIENTIFIC_MODEL } };
}
export const currentGenerationInput = () => context.getStore();
export function researchProjectFingerprint(project: Record<string, any>) {
  return fingerprint({ intake: project.intake, references: project.projectReferences.map((r: any) => ({ id: r.id, referenceId: r.referenceId, order: r.selectedOrder })).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)), definition: { title: project.title, degreeLevel: project.degreeLevel, program: project.program, country: project.country, language: project.language, university: project.university, templateKey: project.templateKey, topicAreaId: project.topicAreaId, topicAreaLabel: project.topicAreaLabel } });
}
export function withGenerationInput<T>(input: FrozenInput | null, work: () => Promise<T>) { return context.run(input, work); }
export function frozenProject<T extends { id: string; userId: string }>(live: T | null): T | null {
  const frozen = context.getStore();
  if (!frozen || !live) return live;
  if (live.id !== frozen.project.id || live.userId !== frozen.project.userId) throw new Error("GENERATION_SNAPSHOT_OWNER_MISMATCH");
  // Version allocation and ownership come from live DB; research inputs stay frozen.
  const project = structuredClone(frozen.project);
  project.projectReferences.sort((a: any, b: any) => (a.selectedOrder ?? Number.MAX_SAFE_INTEGER) - (b.selectedOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return { ...live, ...project } as T;
}
export async function appendGenerationInput(tx: Prisma.TransactionClient, input: { jobId: string; projectId: string; userId: string; revision: number }) {
  const project = await tx.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, include: { intake: true, projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } }, knowledgeFields: { where: { isPrimary: true }, include: { concept: { include: { scheme: true } } } }, draft: true } });
  if (project.draft && project.draft.confirmedRevision !== project.draft.revision) throw new Error("DRAFT_CONFIRMATION_REQUIRED");
  const { draft, ...researchProject } = project;
  const inspection = await tx.mvpStepRun.findFirst({ where: { projectId: project.id, stepKey: MVP_SOURCE_INSPECTION_KEY, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } }, orderBy: { startedAt: "desc" }, select: { id: true, outputSnapshotJson: true } });
  const referenceCandidates = await tx.projectReference.findMany({ where: { projectId: project.id }, include: { reference: true }, orderBy: [{ selected: "desc" }, { selectedOrder: "asc" }, { relevanceScore: "desc" }, { id: "asc" }] });
  const sourceMaterializations = await tx.projectSourceMaterialization.findMany({ where: { projectId: project.id }, select: { id: true, sourceId: true, referenceId: true, materializationType: true, status: true, metricsJson: true, artifactsJson: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const uploadedDocuments = await tx.generatedArtifact.findMany({
    where: { projectId: project.id, kind: "SOURCE_PDF" },
    select: { id: true, fileName: true, mimeType: true, byteSize: true, sha256: true, metadataJson: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const policies = scientificRuntimePolicy();
  const payload = { version: "generation-input.v2", project: researchProject, referenceCandidates, sourceMaterializations, uploadedDocuments, inspection, draft: draft?.contentJson ?? null, policies, userApprovals: { draftConfirmedRevision: draft?.confirmedRevision ?? null } };
  const snapshot = await tx.generationInputSnapshot.create({ data: { jobId: input.jobId, revision: input.revision, draftId: draft?.id, draftRevision: draft?.revision, payloadJson: json(payload), contentHash: fingerprint(payload) } });
  return { snapshot, project: researchProject };
}
export async function readGenerationInput(jobId: string, snapshotId?: string | null): Promise<FrozenInput | null> {
  if (!snapshotId) return null; // Historical RC3 jobs use their existing reader.
  const row = await prisma.generationInputSnapshot.findFirstOrThrow({ where: { id: snapshotId, jobId }, include: { job: { select: { projectId: true, userId: true } } } });
  if (fingerprint(row.payloadJson) !== row.contentHash) throw new Error("GENERATION_SNAPSHOT_CORRUPT");
  const payload = row.payloadJson as unknown as Omit<FrozenInput, "id" | "jobId">;
  if (fingerprint(payload.policies) !== fingerprint(scientificRuntimePolicy())) throw new Error("GENERATION_CONFIGURATION_CHANGED: requiere revisión explícita; no se regeneró ciencia.");
  if (payload.project.id !== row.job.projectId || payload.project.userId !== row.job.userId) throw new Error("GENERATION_SNAPSHOT_OWNER_MISMATCH");
  // Prisma project/intake timestamps are needed by legacy consumers; do not revive
  // arbitrary strings inside untrusted provider metadata.
  for (const record of [payload.project, payload.project.intake, ...payload.project.projectReferences, ...payload.project.projectReferences.map((r: any) => r.reference)]) {
    if (record) for (const key of ["createdAt", "updatedAt"]) if (typeof record[key] === "string") record[key] = new Date(record[key]);
  }
  return { id: row.id, jobId, ...payload };
}
