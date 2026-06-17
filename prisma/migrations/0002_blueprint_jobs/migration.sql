-- CreateEnum
CREATE TYPE "BlueprintJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_NEXT_STAGE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlueprintJobStageStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "BlueprintJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BlueprintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'es',
    "runnerKind" TEXT NOT NULL DEFAULT 'vercel',
    "attempts" INTEGER NOT NULL DEFAULT 0,
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "BlueprintJob_projectId_status_idx" ON "BlueprintJob"("projectId", "status");

-- CreateIndex
CREATE INDEX "BlueprintJob_userId_status_idx" ON "BlueprintJob"("userId", "status");

-- CreateIndex
CREATE INDEX "BlueprintJob_status_updatedAt_idx" ON "BlueprintJob"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintJobStage_jobId_stageKey_key" ON "BlueprintJobStage"("jobId", "stageKey");

-- CreateIndex
CREATE INDEX "BlueprintJobStage_jobId_status_idx" ON "BlueprintJobStage"("jobId", "status");

-- AddForeignKey
ALTER TABLE "BlueprintJob" ADD CONSTRAINT "BlueprintJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintJob" ADD CONSTRAINT "BlueprintJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintJobStage" ADD CONSTRAINT "BlueprintJobStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
