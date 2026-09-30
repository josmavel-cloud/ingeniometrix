import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { MVP_SOURCE_INSPECTION_KEY, sourceInspectionFingerprint,
  type MvpSourceInspectionItem, type MvpSourceInspectionResult } from "@/server/mvp/source-inspection-service";
import { evaluateSnapshotCoverage } from "@/server/retrieval/evidence-coverage-snapshot";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { confirmedScientificDefinitionMatches } from "@/lib/conversational-intake";

export const EVIDENCE_SET_VERSION = "evidence-set.v1";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export type EvidenceSetReadiness = "READY" | "READY_WITH_LIMITATIONS" | "BLOCKED";
export function evidenceSourcePoolVersion(searchIntentHash: string, rows: Array<{
  referenceId: string; selected: boolean; selectedOrder: number | null; sourceProvider: string;
  relevanceScore: number | null; selectionReason: string | null; reference: { updatedAt: Date };
}>, uploads: Array<{ id: string; referenceId: string | null; sha256: string | null;
  status: string; identityStatus: string }> = []) {
  return fingerprint({ searchIntentHash, rows: rows.map(row => [row.referenceId, row.selected,
    row.selectedOrder, row.sourceProvider, row.relevanceScore, row.selectionReason,
    row.reference.updatedAt]), uploads: uploads.map(doc => [doc.id, doc.referenceId, doc.sha256,
    doc.status, doc.identityStatus]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))) });
}

export function evaluateEvidenceSetReadiness(input: {
  sources: Array<{ evidenceLevel: string; identityStatus: string; preparationStatus: string }>;
  unresolvedMaterialGaps: number; pendingUploads: number;
}): { readiness: EvidenceSetReadiness; limitations: string[] } {
  const limitations: string[] = [];
  if (!input.sources.length) return { readiness: "BLOCKED", limitations: ["NO_SELECTED_SOURCES"] };
  if (input.sources.some(source => source.preparationStatus === "NOT_PREPARED" ||
      source.preparationStatus === "STALE" || source.identityStatus === "mismatch")) {
    return { readiness: "BLOCKED", limitations: ["SOURCE_PREPARATION_OR_IDENTITY_UNRESOLVED"] };
  }
  const usable = input.sources.filter(source => ["FULL_TEXT_MATERIALIZED", "ABSTRACT_AVAILABLE"].includes(source.evidenceLevel));
  if (!usable.length) return { readiness: "BLOCKED", limitations: ["NO_CONTENT_EVIDENCE_FOR_SUBSTANTIVE_CLAIMS"] };
  if (input.sources.some(source => !["FULL_TEXT_MATERIALIZED", "ABSTRACT_AVAILABLE"].includes(source.evidenceLevel))) {
    limitations.push("SELECTED_SOURCE_METADATA_ONLY_OR_UNAVAILABLE");
  }
  if (input.unresolvedMaterialGaps) limitations.push("UNRESOLVED_MATERIAL_EVIDENCE_GAPS");
  if (input.pendingUploads) limitations.push("USER_PDF_PENDING_IDENTITY_OR_INSPECTION");
  return { readiness: limitations.length ? "READY_WITH_LIMITATIONS" : "READY", limitations };
}

export async function latestEvidenceSet(userId: string, projectId: string) {
  if (!await prisma.project.count({ where: { id: projectId, userId } })) throw new Error("PROJECT_NOT_FOUND");
  return prisma.projectEvidenceSet.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
}

export async function confirmEvidenceSet(userId: string, projectId: string, operationId?: string) {
  const search = await loadSearchInput(userId, projectId);
  const searchIntentHash = fingerprint(search.intent);
  const searchSnapshot = await getLatestProjectReferenceSearchSnapshot(projectId);
  const coverage = searchSnapshot?.inputTrace?.searchIntentHash === searchIntentHash && !searchSnapshot.stale
    ? evaluateSnapshotCoverage(search.intent, searchSnapshot) : null;
  // Verify potentially large private files before acquiring the project row lock.
  const preflightRun = await prisma.mvpStepRun.findFirst({ where: { projectId, stepKey: MVP_SOURCE_INSPECTION_KEY,
    status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } }, orderBy: { startedAt: "desc" },
    select: { id: true, outputSnapshotJson: true } });
  const preflightReport = preflightRun?.outputSnapshotJson as MvpSourceInspectionResult | null;
  const verifiedFullText = new Set<string>();
  for (const item of preflightReport?.items ?? []) {
    if (!item.downloaded_pdf_path || !item.full_text_path || !item.pdf_sha256 || !item.full_text_sha256) continue;
    const [pdf, fullText] = await Promise.all([readFile(item.downloaded_pdf_path).catch(() => null),
      readFile(item.full_text_path).catch(() => null)]);
    if (pdf && fullText && createHash("sha256").update(pdf).digest("hex") === item.pdf_sha256 &&
      createHash("sha256").update(fullText).digest("hex") === item.full_text_sha256) verifiedFullText.add(item.source_id);
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
    const project = await tx.project.findFirst({ where: { id: projectId, userId }, include: {
      intake: true, draft: true, projectReferences: { where: { selected: true },
        include: { reference: true }, orderBy: [{ selectedOrder: "asc" }, { id: "asc" }] },
      uploadedPdfs: { where: { status: { not: "REMOVED" } }, orderBy: { createdAt: "asc" } },
    } });
    if (!project?.intake) throw new Error("PROJECT_NOT_FOUND");
    const confirmed = project.intake.confirmedDefinitionJson as { revision?: number; definitionHash?: string } | null;
    if (search.intent.sourceKind === "CONFIRMED_DEFINITION" &&
      (confirmed?.revision !== search.intent.confirmedDraftRevision ||
       confirmed?.definitionHash !== search.intent.definitionHash ||
       !confirmedScientificDefinitionMatches((project.draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition, confirmed)))
      throw new Error("EVIDENCE_INTENT_STALE");
    const selected = project.projectReferences;
    const selectedIds = selected.map(row => row.referenceId);
    const inspectionRun = await tx.mvpStepRun.findFirst({ where: { projectId, stepKey: MVP_SOURCE_INSPECTION_KEY,
      status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } }, orderBy: { startedAt: "desc" },
      select: { id: true, outputSnapshotJson: true } });
    if (inspectionRun?.id !== preflightRun?.id) throw new Error("EVIDENCE_PREPARATION_CHANGED");
    const report = inspectionRun?.outputSnapshotJson as MvpSourceInspectionResult | null;
    const inspectionById = new Map((report?.items ?? []).map(item => [item.source_id, item]));
    const materials = await tx.projectSourceMaterialization.findMany({ where: { projectId,
      referenceId: { in: selectedIds }, materializationType: "SOURCE_PREPARATION_V1" },
      orderBy: { createdAt: "desc" } });
    const materialById = new Map<string, (typeof materials)[number]>();
    for (const row of materials) if (!materialById.has(row.referenceId)) materialById.set(row.referenceId, row);
    const uploadedByRef = new Map(project.uploadedPdfs.filter(doc => doc.status === "PREPARED" &&
      doc.identityStatus === "MATCHED" && doc.referenceId).map(doc => [doc.referenceId, doc]));
    const webEvents = await tx.auditLog.findMany({ where: { projectId,
      eventType: "WEB_CANDIDATE_CONVERGENCE_V1" }, select: { payloadJson: true } });
    const webOrigins = new Set(webEvents.filter(event => {
      const payload = event.payloadJson as { searchIntentHash?: string };
      return payload.searchIntentHash === searchIntentHash;
    }).map(event => (event.payloadJson as { referenceId?: string }).referenceId).filter(Boolean));
    const searchEntries = new Map((searchSnapshot?.references ?? []).map(entry => [entry.referenceId, entry]));
    const sources = await Promise.all(selected.map(async row => {
      const item: MvpSourceInspectionItem | undefined = inspectionById.get(row.referenceId);
      const upload = uploadedByRef.get(row.referenceId) ?? null;
      const expected = sourceInspectionFingerprint(row, upload);
      const material = materialById.get(row.referenceId);
      const materialFingerprint = (material?.metricsJson as { sourceFingerprint?: string } | null)?.sourceFingerprint;
      let preparationStatus = !item || !material ? "NOT_PREPARED" :
        item.source_fingerprint !== expected || materialFingerprint !== expected ? "STALE" : material.status;
      if (preparationStatus === "PREPARED_FULL_TEXT") {
        if (!verifiedFullText.has(row.referenceId)) {
          preparationStatus = "STALE";
        }
      }
      const assessment = searchEntries.get(row.referenceId)?.scoreBreakdown?.candidateAssessment;
      const discoveryOrigins = [
        ...(row.reference.rawOpenAlexJson ? ["OPENALEX_DISCOVERED"] : []),
        ...(row.reference.rawCrossrefJson ? ["CROSSREF_ENRICHED"] : []),
        ...(webOrigins.has(row.referenceId) ? ["ASTRA_WEB_OBSERVED"] : []),
        ...(project.uploadedPdfs.some(doc => doc.referenceId === row.referenceId && doc.status === "PREPARED")
          ? ["USER_UPLOADED"] : []),
      ];
      return { projectReferenceId: row.id, referenceId: row.referenceId, selectedOrder: row.selectedOrder,
        identity: { title: row.reference.title, doi: row.reference.doi, year: row.reference.year,
          authors: row.reference.authorsJson, venue: row.reference.venue },
        discoveryProvider: row.sourceProvider, discoveryOrigins, relevanceScore: row.relevanceScore,
        relevance: assessment?.relevance ?? "INSUFFICIENT_METADATA",
        role: assessment?.role ?? "NONE", assessmentOrigin: assessment?.origin ?? "UNASSESSED",
        preparationStatus, identityStatus: item?.identity_status ?? "unknown",
        evidenceLevel: preparationStatus === "STALE" || preparationStatus === "NOT_PREPARED"
          ? "UNKNOWN" : item?.evidence_level ?? "METADATA_ONLY",
        materializationId: preparationStatus === "STALE" ? null : material?.id ?? null,
        contentHash: item?.full_text_sha256 ?? item?.pdf_sha256 ?? null,
        accessStatus: item?.pdf_accessible ? "MATERIALIZED" : item?.pdf_available_signal ? "REPORTED_PDF" : "UNKNOWN",
        uploadedPdfId: upload?.id ?? null,
        limitations: [...(item?.warnings ?? []), ...(item?.blockers ?? [])],
        inspection: item ? { stepRunId: inspectionRun?.id, sourceFingerprint: item.source_fingerprint,
          pdfPath: item.downloaded_pdf_path, fullTextPath: item.full_text_path,
          samplePath: item.sample_text_path } : null };
    }));
    const uploads = project.uploadedPdfs.map(doc => ({ id: doc.id, referenceId: doc.referenceId,
      status: doc.status, identityStatus: doc.identityStatus, extractionStatus: doc.extractionStatus,
      sha256: doc.sha256, byteSize: doc.byteSize, selected: Boolean(doc.referenceId && selectedIds.includes(doc.referenceId)) }));
    const gaps = coverage?.gaps.filter(gap => gap.importance === "MATERIAL")
      .map(gap => ({ gapId: gap.gapId, kind: gap.kind, type: gap.type, status: gap.status,
        reason: gap.insufficiencyReason })) ?? [];
    const { readiness, limitations } = evaluateEvidenceSetReadiness({ sources,
      unresolvedMaterialGaps: gaps.length, pendingUploads: uploads.filter(doc => doc.identityStatus !== "MATCHED").length });
    if (readiness === "BLOCKED") throw new Error(`EVIDENCE_SET_BLOCKED:${limitations.join(",")}`);
    const allRows = await tx.projectReference.findMany({ where: { projectId },
      select: { referenceId: true, selected: true, selectedOrder: true, sourceProvider: true,
        relevanceScore: true, selectionReason: true, reference: { select: { updatedAt: true } } },
      orderBy: { referenceId: "asc" } });
    const sourcePoolVersion = evidenceSourcePoolVersion(searchIntentHash, allRows, project.uploadedPdfs);
    const selectionHash = fingerprint(selected.map(row => [row.referenceId, row.selectedOrder]));
    const snapshot = { contractVersion: EVIDENCE_SET_VERSION, projectId, intakeId: project.intake.id,
      confirmedDraftRevision: search.intent.confirmedDraftRevision, definitionHash: search.intent.definitionHash,
      searchIntentHash, sourcePoolVersion, selectionRevision: project.draft?.revision ?? 0,
      selectionHash, sources, uploadedAssets: uploads, unresolvedGaps: gaps,
      coverageLimitations: limitations, readiness, inspectionStepRunId: inspectionRun?.id ?? null };
    const contentHash = fingerprint(snapshot);
    const prior = await tx.projectEvidenceSet.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    if (prior?.contentHash === contentHash) return prior;
    const created = await tx.projectEvidenceSet.create({ data: { projectId, createdBy: userId,
      version: (prior?.version ?? 0) + 1, searchIntentHash, definitionHash: search.intent.definitionHash,
      sourcePoolVersion, selectionHash, contentHash, readiness, snapshotJson: json(snapshot) } });
    await tx.auditLog.create({ data: { projectId, userId, actorType: operationId ? "SYSTEM" : "USER",
      eventType: operationId ? "EVIDENCE_SET_ASSEMBLED_V1" : "EVIDENCE_SET_CONFIRMED_V1", payloadJson: json({ evidenceSetId: created.id,
        version: created.version, contentHash, readiness, limitations, ...(operationId ? { operationId } : {}) }) } });
    return created;
  });
}
