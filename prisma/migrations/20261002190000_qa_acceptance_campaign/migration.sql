CREATE TABLE "QaAcceptanceCampaign" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "issuedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "totalCapMicros" INTEGER NOT NULL CHECK ("totalCapMicros" > 0 AND "totalCapMicros" <= 10000000),
  "jobCapMicros" INTEGER NOT NULL CHECK ("jobCapMicros" > 0 AND "jobCapMicros" <= 5000000),
  "maxJobs" INTEGER NOT NULL CHECK ("maxJobs" > 0 AND "maxJobs" <= 2)
);
CREATE INDEX "QaAcceptanceCampaign_userId_status_idx" ON "QaAcceptanceCampaign"("userId", "status");
