import { flushProjectDraft } from "./draft-save-queue";
import { flushSelection } from "./selection-save-queue";

type Context = { intakeId: string; confirmedRevision: number; definitionHash: string;
  selectionHash: string; uploadHash: string; evidenceSetId: string | null; draftRevision: number };

export async function startProjectPlan(projectId: string, ownerId: string, expectedDefinitionHash?: string | null,
  saveSelection = false) {
  await flushProjectDraft(projectId);
  if (saveSelection) await flushSelection(projectId);
  const contextResponse = await fetch(`/api/projects/${projectId}/blueprints/context`, { cache: "no-store" });
  const contextPayload = await contextResponse.json().catch(() => ({})) as { context?: Context; code?: string };
  if (!contextResponse.ok || !contextPayload.context) throw new Error(contextPayload.code ?? "GENERATION_CONTEXT_UNAVAILABLE");
  if (expectedDefinitionHash && expectedDefinitionHash !== contextPayload.context.definitionHash)
    throw new Error("DEFINITION_REVISION_CONFLICT");
  const key = `imx-generation-operation:${ownerId}:${projectId}`;
  const signature = JSON.stringify([contextPayload.context.definitionHash, contextPayload.context.selectionHash,
    contextPayload.context.uploadHash]);
  let prior: { signature: string; operationId: string; jobId?: string } | null = null;
  try { prior = JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { /* New operation. */ }
  if (prior?.signature === signature && prior.jobId) {
    const statusResponse = await fetch(`/api/projects/${projectId}/blueprints/progress`, { cache: "no-store" });
    if (statusResponse.ok) {
      const status = await statusResponse.json() as { progress?: { jobId?: string; jobStatus?: string } };
      if (status.progress?.jobId === prior.jobId && status.progress.jobStatus === "COMPLETED") prior = null;
    }
  }
  const operationId = prior?.signature === signature ? prior.operationId : crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ signature, operationId }));
  const response = await fetch(`/api/projects/${projectId}/blueprints`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: contextPayload.context, operationId }) });
  const payload = await response.json().catch(() => ({})) as { job?: { id: string; status: string; currentStage: string | null;
    progress: number; updatedAt: string }; code?: string; error?: string; nextAction?: string };
  if (!response.ok || !payload.job) {
    if (response.status === 409) sessionStorage.removeItem(key);
    throw new Error(payload.error ?? payload.code ?? "No se pudo iniciar la operación.");
  }
  sessionStorage.setItem(key, JSON.stringify({ signature, operationId, jobId: payload.job.id }));
  return payload.job;
}
