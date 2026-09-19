-- Secure pilot additions applied after 20260918000000_baseline.
-- This migration is intentionally additive and does not recreate existing tables.

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TYPE "BlueprintJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_NEXT_STAGE', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "BlueprintJobStageStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "GeneratedArtifactKind" AS ENUM ('BLUEPRINT_DOCX', 'BLUEPRINT_PDF', 'BIBTEX', 'RIS', 'EVIDENCE_LOG', 'REPORT_PREVIEW', 'SOURCE_PDF', 'OTHER');

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgentHash" TEXT,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthThrottle" (
  "keyHash" TEXT NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("keyHash")
);

CREATE TABLE "BlueprintJob" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "BlueprintJobStatus" NOT NULL DEFAULT 'QUEUED',
  "currentStage" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "language" TEXT NOT NULL DEFAULT 'es',
  "runnerKind" TEXT NOT NULL DEFAULT 'database-worker',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "errorJson" JSONB,
  "metadataJson" JSONB,
  "stageDataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlueprintJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlueprintJobStage" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "stageKey" TEXT NOT NULL,
  "status" "BlueprintJobStageStatus" NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "errorJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlueprintJobStage_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");
CREATE INDEX "UserSession_expiresAt_revokedAt_idx" ON "UserSession"("expiresAt", "revokedAt");
CREATE INDEX "AuthThrottle_blockedUntil_idx" ON "AuthThrottle"("blockedUntil");
CREATE INDEX "BlueprintJob_projectId_status_idx" ON "BlueprintJob"("projectId", "status");
CREATE INDEX "BlueprintJob_userId_status_idx" ON "BlueprintJob"("userId", "status");
CREATE INDEX "BlueprintJob_status_nextAttemptAt_updatedAt_idx" ON "BlueprintJob"("status", "nextAttemptAt", "updatedAt");
CREATE UNIQUE INDEX "BlueprintJobStage_jobId_stageKey_key" ON "BlueprintJobStage"("jobId", "stageKey");
CREATE INDEX "BlueprintJobStage_jobId_status_idx" ON "BlueprintJobStage"("jobId", "status");
CREATE UNIQUE INDEX "GeneratedArtifact_blueprintVersionId_kind_fileName_key" ON "GeneratedArtifact"("blueprintVersionId", "kind", "fileName");
CREATE INDEX "GeneratedArtifact_projectId_kind_createdAt_idx" ON "GeneratedArtifact"("projectId", "kind", "createdAt");
CREATE INDEX "GeneratedArtifact_userId_kind_createdAt_idx" ON "GeneratedArtifact"("userId", "kind", "createdAt");
CREATE INDEX "GeneratedArtifact_jobId_kind_idx" ON "GeneratedArtifact"("jobId", "kind");
CREATE INDEX "GeneratedArtifact_sha256_idx" ON "GeneratedArtifact"("sha256");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintJob" ADD CONSTRAINT "BlueprintJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintJob" ADD CONSTRAINT "BlueprintJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlueprintJobStage" ADD CONSTRAINT "BlueprintJobStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedArtifact" ADD CONSTRAINT "GeneratedArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedArtifact" ADD CONSTRAINT "GeneratedArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedArtifact" ADD CONSTRAINT "GeneratedArtifact_blueprintVersionId_fkey" FOREIGN KEY ("blueprintVersionId") REFERENCES "BlueprintVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedArtifact" ADD CONSTRAINT "GeneratedArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
