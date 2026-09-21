CREATE TABLE "ProjectDraft" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "confirmedRevision" INTEGER,
  "contentJson" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectDraft_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "ProjectDraft_confirmed_valid" CHECK ("confirmedRevision" IS NULL OR "confirmedRevision" <= "revision"),
  CONSTRAINT "ProjectDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectDraft_projectId_key" ON "ProjectDraft"("projectId");
