import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { confirmEvidenceSet, evidenceSourcePoolVersion, latestEvidenceSet } from "@/server/projects/evidence-set-service";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";

type Context = { params: Promise<{ id: string }> };
function publicSummary(row: Awaited<ReturnType<typeof latestEvidenceSet>>, isCurrent: boolean) {
  if (!row) return null;
  const snapshot = row.snapshotJson as { sources?: unknown[]; unresolvedGaps?: unknown[]; coverageLimitations?: string[] };
  return { id: row.id, version: row.version, readiness: row.readiness, isCurrent, createdAt: row.createdAt,
    selectedSourceCount: snapshot.sources?.length ?? 0, unresolvedGapCount: snapshot.unresolvedGaps?.length ?? 0,
    limitations: snapshot.coverageLimitations ?? [] };
}
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const projectId = (await context.params).id;
    const row = await latestEvidenceSet(user.id, projectId);
    const selected = await prisma.projectReference.findMany({ where: { projectId, selected: true },
      orderBy: [{ selectedOrder: "asc" }, { id: "asc" }], select: { referenceId: true, selectedOrder: true } });
    const pool = await prisma.projectReference.findMany({ where: { projectId },
      select: { referenceId: true, selected: true, selectedOrder: true, sourceProvider: true,
        relevanceScore: true, selectionReason: true, reference: { select: { updatedAt: true } } },
      orderBy: { referenceId: "asc" } });
    const uploads = await prisma.uploadedPdf.findMany({ where: { projectId, status: { not: "REMOVED" } },
      select: { id: true, referenceId: true, sha256: true, status: true, identityStatus: true } });
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id },
      select: { intake: { select: { confirmedDefinitionJson: true } } } });
    const definitionHash = (project?.intake?.confirmedDefinitionJson as { definitionHash?: string } | null)?.definitionHash ?? null;
    const isCurrent = Boolean(row && row.selectionHash === fingerprint(selected.map(item => [item.referenceId, item.selectedOrder])) &&
      row.definitionHash === definitionHash && row.sourcePoolVersion === evidenceSourcePoolVersion(row.searchIntentHash, pool, uploads));
    return NextResponse.json({ evidenceSet: publicSummary(row, isCurrent) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "EVIDENCE_SET_READ_FAILED" }, { status: 404 });
  }
}
export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json({ evidenceSet: publicSummary(await confirmEvidenceSet(user.id, (await context.params).id), true) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "EVIDENCE_SET_CONFIRM_FAILED" }, { status: 409 });
  }
}
