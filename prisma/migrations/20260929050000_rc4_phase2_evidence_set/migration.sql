ALTER TABLE "UploadedPdf"
  ADD COLUMN "referenceId" TEXT,
  ADD COLUMN "identityStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "extractionStatus" TEXT NOT NULL DEFAULT 'NOT_RUN';

ALTER TABLE "UploadedPdf"
  ADD CONSTRAINT "UploadedPdf_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE SET NULL;

CREATE INDEX "UploadedPdf_projectId_referenceId_idx" ON "UploadedPdf"("projectId", "referenceId");
CREATE INDEX "UploadedPdf_projectId_sha256_idx" ON "UploadedPdf"("projectId", "sha256");

CREATE TABLE "ProjectEvidenceSet" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "createdBy" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "searchIntentHash" TEXT NOT NULL,
  "definitionHash" TEXT,
  "sourcePoolVersion" TEXT NOT NULL,
  "selectionHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "readiness" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProjectEvidenceSet_projectId_version_key" ON "ProjectEvidenceSet"("projectId", "version");
CREATE UNIQUE INDEX "ProjectEvidenceSet_projectId_contentHash_key" ON "ProjectEvidenceSet"("projectId", "contentHash");
CREATE INDEX "ProjectEvidenceSet_projectId_createdAt_idx" ON "ProjectEvidenceSet"("projectId", "createdAt");
