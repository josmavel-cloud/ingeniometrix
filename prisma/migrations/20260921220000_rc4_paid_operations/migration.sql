-- Additive, RC4 isolated database only until deployment adoption is authorized.
CREATE TABLE "PaidOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT,
  "draftId" TEXT,
  "revision" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "hardCapMicros" INTEGER NOT NULL CHECK ("hardCapMicros" > 0),
  "committedMicros" INTEGER NOT NULL DEFAULT 0 CHECK ("committedMicros" >= 0),
  "boundBreached" BOOLEAN NOT NULL DEFAULT false,
  "resultJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PaidOperation_userId_requestId_key" ON "PaidOperation"("userId", "requestId");
CREATE INDEX "PaidOperation_userId_createdAt_idx" ON "PaidOperation"("userId", "createdAt");
CREATE TABLE "PaidOperationCall" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationId" TEXT NOT NULL REFERENCES "PaidOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "purpose" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "actualModel" TEXT,
  "reservedMicros" INTEGER NOT NULL CHECK ("reservedMicros" > 0),
  "estimatedMicros" INTEGER CHECK ("estimatedMicros" >= 0),
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "usageJson" JSONB,
  "attributionJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "PaidOperationCall_operationId_createdAt_idx" ON "PaidOperationCall"("operationId", "createdAt");
