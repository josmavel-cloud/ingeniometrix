-- CreateEnum
CREATE TYPE "GeneratedArtifactKind" AS ENUM (
  'BLUEPRINT_DOCX',
  'BLUEPRINT_PDF',
  'BIBTEX',
  'RIS',
  'EVIDENCE_LOG',
  'REPORT_PREVIEW',
  'SOURCE_PDF',
  'OTHER'
);

-- CreateTable
CREATE TABLE "GeneratedArtifact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "blueprintVersionId" TEXT,
  "jobId" TEXT,
  "kind" "GeneratedArtifactKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GeneratedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedArtifact_blueprintVersionId_kind_fileName_key"
  ON "GeneratedArtifact"("blueprintVersionId", "kind", "fileName");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_projectId_kind_createdAt_idx"
  ON "GeneratedArtifact"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_userId_kind_createdAt_idx"
  ON "GeneratedArtifact"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_jobId_kind_idx"
  ON "GeneratedArtifact"("jobId", "kind");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_sha256_idx"
  ON "GeneratedArtifact"("sha256");

-- AddForeignKey
ALTER TABLE "GeneratedArtifact"
  ADD CONSTRAINT "GeneratedArtifact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedArtifact"
  ADD CONSTRAINT "GeneratedArtifact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedArtifact"
  ADD CONSTRAINT "GeneratedArtifact_blueprintVersionId_fkey"
  FOREIGN KEY ("blueprintVersionId") REFERENCES "BlueprintVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedArtifact"
  ADD CONSTRAINT "GeneratedArtifact_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
