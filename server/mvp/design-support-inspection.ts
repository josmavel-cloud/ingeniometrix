import path from "node:path";
import { normalizeConcept } from "@/lib/retrieval-scientific-concepts";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";
import { acquireSupportDocument, METHOD_DOCUMENT_INSPECTION_VERSION, type SupportDocument, type SupportDocumentManifest } from "./design-support-document";
import { annotateRetainedSupportContentKind } from "./design-support-content-kind";
import type { DesignSupportSource } from "./design-support-addendum";
import { fingerprint } from "./job-execution-context";

export type SupportAcquisitionManifest = SupportDocumentManifest;
export type InspectedMethodSupport = { source: DesignSupportSource | null; acquired: boolean; reason: string | null;
  inspectionVersion: string; manifest: SupportAcquisitionManifest | null; networkAcquisitions: number;
  retainedArtifactReused: boolean; contentAudit?: unknown };
export const supportAcquisitionManifest = (document: SupportDocument): SupportAcquisitionManifest => ({
  observedUrl: document.observedUrl, finalUrl: document.finalUrl, sha256: document.sha256,
  mediaType: document.mediaType, ...(document.privateArtifactPath ? { privateArtifactPath: document.privateArtifactPath } : {}) });

// Common procedural admission for newly acquired and reinspected support. A DOI,
// title or abstract alone does not certify a methodological procedure.
export async function inspectMethodSupportCandidate(input: { userId: string; projectId: string; runId: string; gapId: string;
  observedUrl: string; expectedTitle: string; expectedDoi: string | null; question: string; observationIds: string[];
  retainedSource?: DesignSupportSource; acquire?: typeof acquireSupportDocument; artifactRoot?: string }): Promise<InspectedMethodSupport> {
  let manifest: SupportAcquisitionManifest | null = null;
  let acquired = false, networkAcquisitions = 0;
  try {
    let source: DesignSupportSource, contentAudit: unknown;
    if (input.retainedSource) {
      if (normalizePublicWebUrl(input.retainedSource.document.observedUrl) !== normalizePublicWebUrl(input.observedUrl) ||
        input.retainedSource.gapId !== input.gapId || input.retainedSource.provenance !== "SYSTEM_DESIGN_SUPPORT" ||
        fingerprint([...input.retainedSource.observationIds].sort()) !== fingerprint([...input.observationIds].sort()))
        throw new Error("DESIGN_SUPPORT_RETAINED_PROVENANCE_MISMATCH");
      const annotated = await annotateRetainedSupportContentKind(input.retainedSource, { artifactRoot: input.artifactRoot });
      source = annotated.source; contentAudit = annotated.audit; acquired = true;
      manifest = supportAcquisitionManifest(source.document);
    } else {
      networkAcquisitions = 1;
      const document = await (input.acquire ?? acquireSupportDocument)(input.observedUrl, `${input.question} ${input.expectedTitle}`,
        path.join(input.artifactRoot ?? path.resolve("artifacts-local", "design-support"), fingerprint([input.userId, input.projectId, input.runId])),
        { title: input.expectedTitle, doi: input.expectedDoi });
      acquired = true; manifest = supportAcquisitionManifest(document);
      source = { sourceId: `DS-${fingerprint([input.projectId, input.runId, document.sha256]).slice(0, 20)}`,
        gapId: input.gapId, title: document.title, authors: document.bibliography?.authors ?? [], year: document.bibliography?.year ?? null,
        doi: document.bibliography?.doi ?? null, observationIds: input.observationIds, document, provenance: "SYSTEM_DESIGN_SUPPORT" };
    }
    const expected = normalizeConcept(input.expectedTitle), observed = normalizeConcept(source.document.title);
    if (!expected || !observed || !(observed.includes(expected) || expected.includes(observed)))
      return { source: null, acquired, reason: "DOCUMENT_IDENTITY_UNVERIFIED", manifest, networkAcquisitions,
        retainedArtifactReused: Boolean(input.retainedSource), inspectionVersion: METHOD_DOCUMENT_INSPECTION_VERSION, contentAudit };
    if (!source.document.passages.some(passage => passage.contentKind === "FULL_TEXT_PASSAGE"))
      return { source: null, acquired, reason: "DOCUMENT_PROCEDURAL_SUPPORT_NOT_SUBSTANTIVE", manifest, networkAcquisitions,
        retainedArtifactReused: Boolean(input.retainedSource), inspectionVersion: METHOD_DOCUMENT_INSPECTION_VERSION, contentAudit };
    return { source, acquired, reason: null, manifest, networkAcquisitions, retainedArtifactReused: Boolean(input.retainedSource),
      inspectionVersion: METHOD_DOCUMENT_INSPECTION_VERSION, contentAudit };
  } catch (error) {
    const detail = error as { code?: string; documentAcquired?: boolean; documentManifest?: SupportAcquisitionManifest };
    const code = detail.code ?? (error instanceof Error ? error.message : "");
    return { source: null, acquired: acquired || detail.documentAcquired === true,
      reason: /^DOCUMENT_[A-Z_]+$|^DESIGN_SUPPORT_[A-Z_]+$|^ERR_INVALID_IP_ADDRESS$|^ETIMEDOUT$|^ECONNRESET$|^ENOTFOUND$/.test(code) ? code : "DOCUMENT_ACQUISITION_FAILED",
      manifest: manifest ?? detail.documentManifest ?? null, networkAcquisitions, retainedArtifactReused: Boolean(input.retainedSource),
      inspectionVersion: METHOD_DOCUMENT_INSPECTION_VERSION };
  }
}

