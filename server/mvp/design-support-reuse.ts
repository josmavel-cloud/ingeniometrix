import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { currentGenerationInput } from "@/server/projects/generation-input-snapshot";
import { DESIGN_MINI_RESEARCH_PURPOSE, type WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";
import { currentJobExecution, fingerprint, stageCheckpoint } from "./job-execution-context";
import type { DesignSupportSource } from "./design-support-addendum";
import type { DesignSupportGap } from "./design-support-gap";

export const DESIGN_SUPPORT_REUSE_POLICY = "design-support-reuse.v1";
type Snapshot = { project?: { id?: string; userId?: string }; evidenceSet?: { contentHash?: string; snapshotJson?: unknown } };
export function supportReuseIdentity(snapshot: Snapshot, owner: { projectId: string; userId: string }) {
  const evidence = snapshot.evidenceSet?.snapshotJson as { definitionHash?: string; searchIntentHash?: string;
    selectionHash?: string; projectId?: string } | undefined;
  if (snapshot.project?.id !== owner.projectId || snapshot.project.userId !== owner.userId ||
      evidence?.projectId !== owner.projectId || !evidence.definitionHash || !evidence.searchIntentHash ||
      !evidence.selectionHash || fingerprint(evidence) !== snapshot.evidenceSet?.contentHash) return null;
  return fingerprint({ projectId: owner.projectId, userId: owner.userId, definitionHash: evidence.definitionHash, searchIntentHash: evidence.searchIntentHash,
    selectionHash: evidence.selectionHash });
}

// Reuse inspected documents, never a previous job's design/critique or cost entry.
// Applicability to the new finding remains a decision for the independent critic.
export async function verifyReusableSupportSource(source: DesignSupportSource, discovery: WebDiscoveryResult,
  privateRoot = path.resolve("artifacts-local", "design-support")) {
  if (source.provenance !== "SYSTEM_DESIGN_SUPPORT" || !source.document.privateArtifactPath ||
      !source.document.passages.length || !["COMPLETED", "PARTIAL"].includes(discovery.state)) return false;
  const observed = normalizePublicWebUrl(source.document.observedUrl);
  if (!observed || !normalizePublicWebUrl(source.document.finalUrl) || !source.observationIds.length ||
      source.observationIds.some(id => !discovery.observations.some(item => item.observationId === id &&
        item.operationId === discovery.operationId && item.responseId === discovery.responseId &&
        item.normalizedUrl === observed && item.actionType === "search"))) return false;
  try {
    const root = await realpath(privateRoot), file = await realpath(source.document.privateArtifactPath);
    if (!file.startsWith(`${root}${path.sep}`)) return false;
    return createHash("sha256").update(await readFile(file)).digest("hex") === source.document.sha256;
  } catch { return false; }
}

export async function reuseProjectDesignSupport(input: { userId: string; projectId: string; gaps: DesignSupportGap[] }) {
  const execution = currentJobExecution(), frozen = currentGenerationInput();
  if (!execution || !frozen || !input.gaps.length) return [] as DesignSupportSource[];
  const identity = supportReuseIdentity(frozen, input);
  if (!identity) return [] as DesignSupportSource[];
  return stageCheckpoint("DESIGN_SUPPORT_REUSE", { identity, gaps: input.gaps, policy: DESIGN_SUPPORT_REUSE_POLICY }, async () => {
    const prior = await prisma.blueprintJobStage.findMany({ where: {
      job: { projectId: input.projectId, userId: input.userId }, jobId: { not: execution.jobId }, status: "COMPLETED",
      stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_V2_ACQUISITION3_" },
    }, orderBy: { completedAt: "desc" }, take: 10, include: { job: { select: { inputSnapshots: { orderBy: { revision: "desc" }, take: 1 } } } } });
    const reused: DesignSupportSource[] = [];
    for (const row of prior) {
      const snapshot = row.job.inputSnapshots[0];
      if (!snapshot || fingerprint(snapshot.payloadJson) !== snapshot.contentHash ||
          supportReuseIdentity(snapshot.payloadJson as Snapshot, input) !== identity) continue;
      const saved = row.outputJson as unknown as { value: { support: DesignSupportSource[]; operation: { operationId: string } }; outputHash: string };
      if (!saved?.value || fingerprint(saved.value) !== saved.outputHash) continue;
      const operation = await prisma.paidOperation.findFirst({ where: { id: saved.value.operation.operationId,
        projectId: input.projectId, userId: input.userId, purpose: DESIGN_MINI_RESEARCH_PURPOSE, status: "COMPLETED" } });
      if (!operation?.resultJson) continue;
      const discovery = operation.resultJson as unknown as WebDiscoveryResult;
      if (discovery.operationId !== operation.id) continue;
      for (const source of saved.value.support) {
        if (reused.length >= 4 || reused.some(item => item.document.sha256 === source.document.sha256) ||
            !await verifyReusableSupportSource(source, discovery)) continue;
        reused.push({ ...source, sourceId: `DS-${fingerprint([input.projectId, source.document.sha256]).slice(0, 20)}`,
          gapId: input.gaps[0].gapId, reusedFrom: { policyVersion: DESIGN_SUPPORT_REUSE_POLICY, jobId: row.jobId,
            checkpointId: row.id, checkpointHash: saved.outputHash, originalGapId: source.gapId,
            scientificIdentityHash: identity, discoveryOperationId: operation.id } });
      }
    }
    return reused;
  }, sources => sources.flatMap(source => source.document.privateArtifactPath ? [source.document.privateArtifactPath] : []));
}
