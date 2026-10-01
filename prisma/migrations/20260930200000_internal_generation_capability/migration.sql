CREATE TABLE "InternalGenerationCapability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issuedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    CONSTRAINT "InternalGenerationCapability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalGenerationCapability_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);

CREATE UNIQUE INDEX "InternalGenerationCapability_grantKey_key" ON "InternalGenerationCapability"("grantKey");
CREATE INDEX "InternalGenerationCapability_userId_status_idx" ON "InternalGenerationCapability"("userId", "status");
ALTER TABLE "InternalGenerationCapability" ADD CONSTRAINT "InternalGenerationCapability_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InternalGenerationAuthorization" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "hardCapMicros" INTEGER NOT NULL,
    "actualCostMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "InternalGenerationAuthorization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalGenerationAuthorization_status_check" CHECK ("status" IN ('RESERVED', 'COST_PENDING', 'SETTLED', 'FAILED')),
    CONSTRAINT "InternalGenerationAuthorization_hardCapMicros_check" CHECK ("hardCapMicros" > 0),
    CONSTRAINT "InternalGenerationAuthorization_actualCostMicros_check" CHECK ("actualCostMicros" IS NULL OR "actualCostMicros" >= 0)
);

CREATE UNIQUE INDEX "InternalGenerationAuthorization_jobId_key" ON "InternalGenerationAuthorization"("jobId");
CREATE INDEX "InternalGenerationAuthorization_userId_status_idx" ON "InternalGenerationAuthorization"("userId", "status");
ALTER TABLE "InternalGenerationAuthorization" ADD CONSTRAINT "InternalGenerationAuthorization_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalGenerationAuthorization" ADD CONSTRAINT "InternalGenerationAuthorization_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalGenerationAuthorization" ADD CONSTRAINT "InternalGenerationAuthorization_capabilityId_fkey"
    FOREIGN KEY ("capabilityId") REFERENCES "InternalGenerationCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReferenceDisplayJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "referenceIdsJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "failureCategory" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ReferenceDisplayJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReferenceDisplayJob_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'BUDGET_UNAVAILABLE'))
);

CREATE UNIQUE INDEX "ReferenceDisplayJob_requestKey_key" ON "ReferenceDisplayJob"("requestKey");
CREATE INDEX "ReferenceDisplayJob_status_createdAt_idx" ON "ReferenceDisplayJob"("status", "createdAt");
CREATE INDEX "ReferenceDisplayJob_projectId_status_idx" ON "ReferenceDisplayJob"("projectId", "status");
ALTER TABLE "ReferenceDisplayJob" ADD CONSTRAINT "ReferenceDisplayJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferenceDisplayJob" ADD CONSTRAINT "ReferenceDisplayJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
