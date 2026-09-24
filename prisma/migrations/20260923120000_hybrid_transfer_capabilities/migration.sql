CREATE TABLE "TransferGrant" (
  "id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "purpose" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "UserSession"("id") ON DELETE CASCADE,
  "artifactId" TEXT REFERENCES "GeneratedArtifact"("id") ON DELETE CASCADE,
  "documentId" TEXT, "maxBytes" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransferGrant_purpose" CHECK ("purpose" IN ('UPLOAD', 'DOWNLOAD'))
);
CREATE INDEX "TransferGrant_expiresAt_idx" ON "TransferGrant"("expiresAt");
CREATE INDEX "TransferGrant_projectId_purpose_idx" ON "TransferGrant"("projectId", "purpose");
CREATE TABLE "UploadedPdf" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "draftRevision" INTEGER NOT NULL, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "storageKey" TEXT NOT NULL UNIQUE, "expectedBytes" INTEGER NOT NULL, "byteSize" INTEGER, "sha256" TEXT,
  "trainingConsent" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "UploadedPdf_projectId_status_idx" ON "UploadedPdf"("projectId", "status");
ALTER TABLE "TransferGrant" ADD CONSTRAINT "TransferGrant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedPdf"("id") ON DELETE CASCADE;
