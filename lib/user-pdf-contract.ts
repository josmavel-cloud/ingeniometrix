import { z } from "zod";

export const MAX_USER_PDFS = 2;
export const MAX_USER_PDF_BYTES = 20 * 1024 * 1024;

export const userPdfMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.literal("application/pdf"),
  byteSize: z.number().int().positive().max(MAX_USER_PDF_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  trainingConsent: z.boolean(),
}).strict();

export type UserPdfMetadata = z.infer<typeof userPdfMetadataSchema>;

export const userPdfUploadCapability = {
  version: "user-pdf-upload.v1",
  enabled: false,
  maxFiles: MAX_USER_PDFS,
  maxBytesPerFile: MAX_USER_PDF_BYTES,
  acceptedMimeTypes: ["application/pdf"],
  requiresRelevanceInspection: true,
  requiresExplicitTrainingConsent: true,
  persistenceStatus: "CONTRACT_ONLY" as const,
};
