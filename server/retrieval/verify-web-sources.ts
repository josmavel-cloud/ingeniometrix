import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { fetchPublicDocument } from "./safe-document-fetch";
import { observedSourceMetadata } from "./observed-source-metadata";
import { reviewVerifiedSource } from "./verified-source-review";
import type { WebCandidateConvergenceResult } from "./web-candidate-convergence";
/** Bounded acquisition after completed web provenance. No proposed DOI/title is
 * promoted until independently observed bibliographic metadata agrees. */
export async function verifyConvergedWebSources(userId: string, projectId: string, operationId: string, results: WebCandidateConvergenceResult[]) {
  for (const result of results.slice(0, 6)) {
    if (result.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !result.candidateId) continue;
    const link = await prisma.projectReference.findFirst({ where: { projectId, referenceId: result.candidateId, project: { userId } }, include: { reference: true } });
    if (!link?.reference.landingPageUrl) continue;
    try {
      const fetched = await fetchPublicDocument(link.reference.landingPageUrl, { Accept: "text/html" }, 2 * 1024 * 1024, 15000);
      if (!fetched.ok || !fetched.contentType.includes("text/html")) continue;
      const metadata = observedSourceMetadata(fetched.body.toString("utf8"), link.reference.title);
      if (!metadata) continue;
      const referenceId = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
        const duplicate = await tx.reference.findFirst({ where: { id: { not: link.referenceId },
          ...(metadata.doi ? { doi: metadata.doi } : { normalizedTitle: normalizeTitle(metadata.title), year: metadata.year }) } });
        if (duplicate) {
          if (normalizeTitle(duplicate.title) !== normalizeTitle(metadata.title)) return null;
          const old = await tx.projectReference.findUnique({ where: { projectId_referenceId: { projectId, referenceId: link.referenceId } } });
          // Never move a user's selection or a historical link implicitly.
          if (old?.selected) return null;
          await tx.projectReference.upsert({ where: { projectId_referenceId: { projectId, referenceId: duplicate.id } },
            create: { projectId, referenceId: duplicate.id, sourceProvider: "OPENAI", selected: false }, update: {} });
          await tx.projectReference.deleteMany({ where: { projectId, referenceId: link.referenceId, selected: false } });
          return duplicate.id;
        }
        await tx.reference.update({ where: { id: link.referenceId }, data: { title: metadata.title, normalizedTitle: normalizeTitle(metadata.title),
          authorsJson: metadata.authors, abstract: metadata.abstract, year: metadata.year, doi: metadata.doi, venue: metadata.venue, workType: "observed-scholarly-source" } });
        await tx.auditLog.create({ data: { projectId, userId, actorType: "SYSTEM", eventType: "WEB_SOURCE_METADATA_VERIFIED",
          payloadJson: { referenceId: link.referenceId, operationId, observedUrl: fetched.finalUrl, bodyHash: metadata.bodyHash } as Prisma.InputJsonValue } });
        return link.referenceId;
      });
      if (referenceId) await reviewVerifiedSource(userId, projectId, referenceId, `web:${operationId}:${metadata.bodyHash}`);
    } catch {
      await prisma.auditLog.create({ data: { projectId, userId, actorType: "SYSTEM", eventType: "WEB_SOURCE_VERIFICATION_LIMITATION",
        payloadJson: { operationId, referenceId: link.referenceId, category: "IDENTITY_OR_ACQUISITION_UNRESOLVED" } } });
    }
  }
}
