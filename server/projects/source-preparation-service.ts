import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runMvpSourceInspection, sourceInspectionFingerprint,
  type MvpSourceInspectionItem } from "@/server/mvp/source-inspection-service";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function preparationState(item: MvpSourceInspectionItem) {
  if (item.identity_status === "mismatch") return "IDENTITY_REVIEW_REQUIRED";
  if (item.evidence_level === "FULL_TEXT_MATERIALIZED") return "PREPARED_FULL_TEXT";
  if (item.evidence_level === "ABSTRACT_AVAILABLE") return "PREPARED_ABSTRACT";
  if (item.fetch_status === "failed" && !item.abstract_available) return "FAILED_ACCESS";
  return "METADATA_ONLY";
}

export async function prepareSelectedSources(userId: string, projectId: string) {
  const report = await runMvpSourceInspection({ userId, projectId });
  if (!report.step_run_id) throw new Error("SOURCE_PREPARATION_RUN_MISSING");
  const selected = await prisma.projectReference.findMany({ where: { projectId, project: { userId }, selected: true },
    select: { referenceId: true } });
  const selectedIds = new Set(selected.map(row => row.referenceId));
  if (selectedIds.size !== report.items.length || report.items.some(item => !selectedIds.has(item.source_id))) {
    throw new Error("SOURCE_SELECTION_CHANGED_DURING_PREPARATION");
  }
  const records: Awaited<ReturnType<typeof prisma.projectSourceMaterialization.create>>[] = [];
  for (const item of report.items) {
    const current = await prisma.projectSourceMaterialization.findFirst({ where: { projectId,
      referenceId: item.source_id, materializationType: "SOURCE_PREPARATION_V1" }, orderBy: { createdAt: "desc" } });
    const state = preparationState(item);
    const metrics = current?.metricsJson as { sourceFingerprint?: string } | null;
    if (metrics?.sourceFingerprint === item.source_fingerprint && current?.status === state) {
      records.push(current); continue;
    }
    records.push(await prisma.projectSourceMaterialization.create({ data: { projectId,
      stepRunId: report.step_run_id, sourceId: item.source_id, referenceId: item.source_id,
      materializationType: "SOURCE_PREPARATION_V1", status: state,
      sourcePdfPath: item.downloaded_pdf_path, fulltextPath: item.full_text_path,
      metricsJson: json({ sourceFingerprint: item.source_fingerprint, evidenceLevel: item.evidence_level,
        identityStatus: item.identity_status, fetchStatus: item.fetch_status, sourceHealth: item.source_health,
        textCharCount: item.text_char_count, uploadedPdfId: item.uploaded_pdf_id,
        pdfSha256: item.pdf_sha256, fullTextSha256: item.full_text_sha256 }),
      artifactsJson: json({ pdfPath: item.downloaded_pdf_path, fulltextPath: item.full_text_path,
        samplePath: item.sample_text_path }), errorsJson: json(item.blockers) } }));
  }
  return { runId: report.run_id, stepRunId: report.step_run_id, decision: report.decision,
    items: report.items.map(item => ({ referenceId: item.source_id, status: preparationState(item),
      evidenceLevel: item.evidence_level, identityStatus: item.identity_status,
      materializationId: records.find(row => row.referenceId === item.source_id)?.id,
      warnings: item.warnings, blockers: item.blockers })) };
}

export async function listPreparedSources(userId: string, projectId: string) {
  if (!await prisma.project.count({ where: { id: projectId, userId } })) throw new Error("PROJECT_NOT_FOUND");
  const selected = await prisma.projectReference.findMany({ where: { projectId, selected: true },
    include: { reference: true } });
  const ids = selected.map(row => row.referenceId);
  const uploads = await prisma.uploadedPdf.findMany({ where: { projectId, userId,
    status: "PREPARED", identityStatus: "MATCHED", referenceId: { in: ids } },
    select: { id: true, referenceId: true, storageKey: true, sha256: true }, orderBy: { createdAt: "desc" } });
  const uploadById = new Map(uploads.map(upload => [upload.referenceId, upload]));
  const rows = await prisma.projectSourceMaterialization.findMany({ where: { projectId,
    referenceId: { in: ids }, materializationType: "SOURCE_PREPARATION_V1" }, orderBy: { createdAt: "desc" } });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.referenceId)) latest.set(row.referenceId, row);
  return selected.map(row => {
    const material = latest.get(row.referenceId);
    const expected = sourceInspectionFingerprint(row, uploadById.get(row.referenceId) ?? null);
    const actual = (material?.metricsJson as { sourceFingerprint?: string } | null)?.sourceFingerprint;
    return { referenceId: row.referenceId, status: !material ? "NOT_PREPARED" : actual !== expected ? "STALE" : material.status,
      materializationId: material?.id ?? null };
  });
}
