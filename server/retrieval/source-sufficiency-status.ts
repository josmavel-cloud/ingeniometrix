import { prisma } from "@/lib/prisma";
import { sourceProgression } from "@/lib/source-sufficiency-policy";
import { listProjectReferences } from "./reference-service";
import { getLatestProjectReferenceSearchSnapshot } from "./reference-search-v2";
export async function sourceSufficiencyStatus(userId: string, projectId: string) {
  const references = await listProjectReferences(userId, projectId);
  const snapshot = await getLatestProjectReferenceSearchSnapshot(projectId);
  const intentHash = snapshot?.inputTrace?.searchIntentHash;
  const [completed, pdfCount] = await Promise.all([
    intentHash ? prisma.auditLog.findFirst({ where: { projectId, eventType: "SOURCE_SUFFICIENCY_COMPLETED",
      payloadJson: { path: ["searchIntentHash"], equals: intentHash } }, orderBy: { createdAt: "desc" }, select: { payloadJson: true } }) : null,
    prisma.uploadedPdf.count({ where: { projectId, userId, status: "PREPARED", identityStatus: "MATCHED" } }),
  ]);
  const fallbackExhausted = (completed?.payloadJson as { fallbackExhausted?: boolean } | null)?.fallbackExhausted === true;
  return { ...sourceProgression(references.map(source => ({ id: source.referenceId, selected: source.selected,
    tier: source.relevanceTier, usable: source.scientificallyUsable })), fallbackExhausted), fallbackExhausted, pdfCount };
}
