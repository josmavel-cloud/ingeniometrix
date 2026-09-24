import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hybridOrigins } from "@/lib/hybrid-origins";
import { PrivateFileArtifactStore } from "@/server/storage/artifact-store";
import { rateLimit } from "@/server/auth/security-events";

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function transferSession(sessionToken: string) {
  return prisma.userSession.findFirst({ where: { tokenHash: hash(sessionToken), revokedAt: null, expiresAt: { gt: new Date() } } });
}
export async function authorizeTransfer(sessionToken: string, input: { purpose: "UPLOAD" | "DOWNLOAD"; projectId: string; artifactId?: string; fileName?: string; byteSize?: number; draftRevision?: number; trainingConsent?: boolean }) {
  if (process.env.IMX_HYBRID_TRANSFERS !== "1") throw new Error("TRANSFERS_DISABLED");
  const session = await transferSession(sessionToken);
  if (!session) throw new Error("UNAUTHORIZED");
  await rateLimit("transfer-authorize", session.userId, 60);
  const token = randomBytes(32).toString("base64url"), now = new Date();
  const grant = await prisma.$transaction(async (tx) => {
    // Serialize quota checks with other transfer issuances for this project.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.projectId}))`;
    const project = await tx.project.findFirst({ where: { id: input.projectId, userId: session.userId }, include: { draft: true } });
    if (!project) throw new Error("NOT_FOUND");
    let artifactId: string | undefined, documentId: string | undefined, maxBytes: number;
    if (input.purpose === "DOWNLOAD") {
      const artifact = await tx.generatedArtifact.findFirst({ where: { id: input.artifactId || "", projectId: project.id, userId: session.userId,
        kind: { in: ["BLUEPRINT_DOCX", "BLUEPRINT_PDF"] } }, select: { id: true, byteSize: true } });
      if (!artifact) throw new Error("NOT_FOUND");
      artifactId = artifact.id; maxBytes = artifact.byteSize;
    } else {
      if (!Number.isInteger(input.byteSize) || !input.byteSize || input.byteSize < 5 || input.byteSize > MAX_UPLOAD_BYTES || !input.fileName || !/^[^/\\\x00-\x1f]{1,180}\.pdf$/i.test(input.fileName)) throw new Error("INVALID_UPLOAD");
      if (input.draftRevision !== project.draft?.revision) throw new Error("DRAFT_CONFLICT");
      const count = await tx.uploadedPdf.count({ where: { projectId: project.id, OR: [ { status: { in: ["QUARANTINED", "UPLOADING"] } }, { status: "AWAITING_UPLOAD", createdAt: { gt: new Date(now.getTime() - 600_000) } } ] } });
      if (count >= 2) throw new Error("PDF_LIMIT");
      maxBytes = input.byteSize;
      const doc = await tx.uploadedPdf.create({ data: { projectId: project.id, userId: session.userId, draftRevision: input.draftRevision!,
        fileName: input.fileName, storageKey: randomUUID(), expectedBytes: maxBytes, trainingConsent: input.trainingConsent === true } });
      documentId = doc.id;
    }
    return tx.transferGrant.create({ data: { tokenHash: hash(token), purpose: input.purpose, userId: session.userId, projectId: project.id,
      sessionId: session.id, artifactId, documentId, maxBytes, expiresAt: new Date(now.getTime() + (input.purpose === "UPLOAD" ? 600_000 : 60_000)) } });
  });
  const url = `${hybridOrigins().upload}/api/transfers/${input.purpose.toLowerCase()}`;
  return { token, url, expiresAt: grant.expiresAt.toISOString(), documentId: grant.documentId };
}

export async function consumeTransfer(token: string, purpose: "UPLOAD" | "DOWNLOAD") {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("UNAUTHORIZED");
  return prisma.$transaction(async (tx) => {
    const grant = await tx.transferGrant.findUnique({ where: { tokenHash: hash(token) } });
    if (!grant || grant.purpose !== purpose || grant.consumedAt || grant.expiresAt <= new Date()) throw new Error("UNAUTHORIZED");
    const session = await tx.userSession.findFirst({ where: { id: grant.sessionId, userId: grant.userId, revokedAt: null, expiresAt: { gt: new Date() } } });
    const owner = await tx.project.count({ where: { id: grant.projectId, userId: grant.userId } });
    if (!session || !owner) throw new Error("UNAUTHORIZED");
    const claimed = await tx.transferGrant.updateMany({ where: { id: grant.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("UNAUTHORIZED");
    return grant;
  });
}

export async function receivePdf(token: string, body: ReadableStream<Uint8Array>) {
  const grant = await consumeTransfer(token, "UPLOAD");
  const doc = await prisma.uploadedPdf.findUniqueOrThrow({ where: { id: grant.documentId! } });
  await prisma.uploadedPdf.update({ where: { id: doc.id }, data: { status: "UPLOADING" } });
  try {
    const result = await new PrivateFileArtifactStore().putPdf(doc.storageKey, body, grant.maxBytes);
    await prisma.uploadedPdf.update({ where: { id: doc.id }, data: { ...result, status: "QUARANTINED" } });
    return { id: doc.id, status: "QUARANTINED", ...result };
  } catch {
    await prisma.uploadedPdf.update({ where: { id: doc.id }, data: { status: "REJECTED" } });
    throw new Error("UPLOAD_REJECTED");
  }
}

export function transferCors(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== hybridOrigins().publicApp) return null;
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "PUT, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Cache-Control": "no-store" };
}
