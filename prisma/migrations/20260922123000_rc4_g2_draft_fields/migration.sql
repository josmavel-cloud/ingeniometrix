ALTER TABLE "Intake"
  ADD COLUMN "researchScope" TEXT,
  ADD COLUMN "constructs" TEXT,
  ADD COLUMN "pendingDecisions" TEXT;

ALTER TABLE "ProjectDraft"
  ADD COLUMN "staleScopesJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "lastInvalidatedAt" TIMESTAMP(3);
