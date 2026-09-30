import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Provider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { normalizeScholarlyDoi } from "@/server/retrieval/provider-query-policy";
import { fetchCrossrefWorkByDoi, resolveCrossrefTitle } from "@/server/retrieval/crossref-client";
import { reviewVerifiedSource } from "@/server/retrieval/verified-source-review";
import { PrivateFileArtifactStore } from "@/server/storage/artifact-store";

const execFileAsync = promisify(execFile);
const ownDoi = /\b10\.\d{4,9}\/[^\s<>"']+/ig;

function candidateTitle(fileName: string, text: string) {
  const lines = text.slice(0, 3500).split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim());
  return lines.find(line => line.length >= 12 && line.length <= 220 && /[a-záéíóú]/i.test(line) &&
    !/^(abstract|resumen|doi|copyright|universidad|university)\b/i.test(line)) ?? fileName.replace(/\.pdf$/i, "");
}

function strongTitleMatch(title: string, text: string) {
  const tokens = normalizeTitle(title).split(/\s+/).filter(token => token.length >= 5);
  if (tokens.length < 2) return false;
  const top = normalizeTitle(text.slice(0, 3000));
  return tokens.filter(token => top.includes(token)).length / tokens.length >= 0.7;
}

/** Offline private-file processing. A DOI mentioned in a bibliography alone is
 * never sufficient to merge an uploaded document with a discovered work. */
export async function prepareUploadedPdf(userId: string, projectId: string, documentId: string) {
  const document = await prisma.uploadedPdf.findFirst({ where: { id: documentId, projectId, userId } });
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  if (document.status === "PREPARED") return document;
  if (document.status !== "QUARANTINED" || !document.sha256) throw new Error("DOCUMENT_NOT_READY");
  const storage = new PrivateFileArtifactStore();
  const pdfPath = storage.pathForPdf(document.storageKey);
  const bytes = await readFile(pdfPath);
  if (createHash("sha256").update(bytes).digest("hex") !== document.sha256) throw new Error("DOCUMENT_HASH_MISMATCH");
  const textDir = path.join(storage.root, "extracted", projectId);
  const textPath = path.join(textDir, `${document.id}.txt`);
  await mkdir(textDir, { recursive: true, mode: 0o700 });
  let text = "";
  try {
    await execFileAsync("pdftotext", ["-f", "1", "-l", "5", pdfPath, textPath], { timeout: 30_000 });
    text = await readFile(textPath, "utf8");
  } catch {
    await writeFile(textPath, "", { mode: 0o600 });
  }
  const dois = new Set((text.slice(0, 8000).match(ownDoi) ?? []).map(normalizeScholarlyDoi).filter(Boolean));
  const links = await prisma.projectReference.findMany({ where: { projectId }, include: { reference: true } });
  const exact = links.filter(link => link.reference.doi && dois.has(normalizeScholarlyDoi(link.reference.doi)) &&
    strongTitleMatch(link.reference.title, text));
  const matched = exact.length === 1 ? exact[0] : null;
  // Resolve only a single DOI in the document header, never citations in its
  // bibliography. The independent provider title must also match the first page.
  const headerDois = [...new Set((text.slice(0, 1500).match(ownDoi) ?? []).map(normalizeScholarlyDoi).filter((doi): doi is string => Boolean(doi)))];
  let verifiedMetadata: Awaited<ReturnType<typeof fetchCrossrefWorkByDoi>> = null;
  if (!matched && exact.length === 0 && headerDois.length === 1) {
    const metadata = await fetchCrossrefWorkByDoi(headerDois[0]).catch(() => null);
    const title = resolveCrossrefTitle(metadata);
    if (metadata && normalizeScholarlyDoi(metadata.DOI ?? "") === headerDois[0] && title && strongTitleMatch(title, text)) verifiedMetadata = metadata;
  }
  const prepared = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
    const current = await tx.uploadedPdf.findFirst({ where: { id: documentId, projectId, userId } });
    if (!current) throw new Error("DOCUMENT_NOT_FOUND");
    if (current.status === "PREPARED") return current;
    if (current.status !== "QUARANTINED" || current.sha256 !== document.sha256) throw new Error("DOCUMENT_CHANGED");
    let referenceId = matched?.referenceId ?? null;
    if (!referenceId && verifiedMetadata) {
      const doi = normalizeScholarlyDoi(verifiedMetadata.DOI)!;
      const title = resolveCrossrefTitle(verifiedMetadata)!;
      // Serialize canonical identity creation across concurrent uploads/projects.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reference-doi:${doi}`}))`;
      const existing = await tx.reference.findFirst({ where: { doi } });
      if (!existing || normalizeTitle(existing.title) === normalizeTitle(title)) {
        const reference = existing ?? await tx.reference.create({ data: { doi, crossrefId: doi, title,
          normalizedTitle: normalizeTitle(title), authorsJson: verifiedMetadata.author?.map(a => [a.given, a.family].filter(Boolean).join(" ")) ?? [],
          abstract: verifiedMetadata.abstract?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
          year: verifiedMetadata.issued?.["date-parts"]?.[0]?.[0] ?? null, venue: verifiedMetadata.publisher,
          workType: verifiedMetadata.type, rawCrossrefJson: JSON.parse(JSON.stringify(verifiedMetadata)) } });
        referenceId = reference.id;
        await tx.projectReference.upsert({ where: { projectId_referenceId: { projectId, referenceId } },
          create: { projectId, referenceId, sourceProvider: Provider.CROSSREF, selected: false }, update: {} });
      }
    }
    const identityResolved = Boolean(referenceId);
    if (!referenceId) {
      const title = candidateTitle(document.fileName, text);
      const reference = await tx.reference.create({ data: { title, normalizedTitle: normalizeTitle(title),
        authorsJson: [], doi: null, abstract: null, workType: "user-uploaded-unverified" } });
      referenceId = reference.id;
      await tx.projectReference.create({ data: { projectId, referenceId,
        sourceProvider: Provider.SYSTEM, selected: false } });
    }
    await tx.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "PDF_SOURCE_PREPARED",
      payloadJson: { documentId: document.id, referenceId, sha256: document.sha256, textCharCount: text.length,
        identityResolved, operation: "PRIVATE_PDF_IDENTIFICATION" } } });
    return tx.uploadedPdf.update({ where: { id: document.id }, data: {
      referenceId, status: "PREPARED", identityStatus: identityResolved ? "MATCHED" : "NEEDS_INSPECTION",
      extractionStatus: text.trim() ? "TEXT_EXTRACTED" : "NO_EXTRACTABLE_TEXT" } });
  });
  if (prepared.identityStatus === "MATCHED" && prepared.referenceId) {
    await reviewVerifiedSource(userId, projectId, prepared.referenceId, `user-pdf:${prepared.id}:${prepared.sha256}`).catch(() => undefined);
  }
  return prepared;
}

export async function removeUploadedPdf(userId: string, projectId: string, documentId: string) {
  const document = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
    const row = await tx.uploadedPdf.findFirst({ where: { id: documentId, projectId, userId } });
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    if (row.status === "REMOVED") return row;
    // Keep the row for provenance. A selected scientific source is never
    // silently deselected; its prepared evidence becomes stale instead.
    return tx.uploadedPdf.update({ where: { id: row.id }, data: { status: "REMOVED", extractionStatus: "REMOVED" } });
  });
  const historicalEvidence = await prisma.projectEvidenceSet.findMany({ where: { projectId }, select: { snapshotJson: true } });
  const historicalInputs = await prisma.generationInputSnapshot.findMany({ where: { job: { projectId } }, select: { payloadJson: true } });
  if ([...historicalEvidence.map(row => row.snapshotJson), ...historicalInputs.map(row => row.payloadJson)]
    .some(snapshot => JSON.stringify(snapshot).includes(document.id))) return { id: document.id, status: "REMOVED" };
  const storage = new PrivateFileArtifactStore();
  await unlink(storage.pathForPdf(document.storageKey)).catch(() => undefined);
  await unlink(path.join(storage.root, "extracted", projectId, `${document.id}.txt`)).catch(() => undefined);
  return { id: document.id, status: "REMOVED" };
}
