CREATE TABLE "ReferenceDisplayTranslation" (
  "id" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "targetLanguage" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "sourceLanguage" TEXT,
  "displayTitle" TEXT,
  "displayAbstract" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" TEXT,
  "provenance" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferenceDisplayTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferenceDisplayTranslation_referenceId_contentHash_targetLanguage_policyVersion_key"
  ON "ReferenceDisplayTranslation"("referenceId", "contentHash", "targetLanguage", "policyVersion");
CREATE INDEX "ReferenceDisplayTranslation_referenceId_targetLanguage_idx"
  ON "ReferenceDisplayTranslation"("referenceId", "targetLanguage");
ALTER TABLE "ReferenceDisplayTranslation" ADD CONSTRAINT "ReferenceDisplayTranslation_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
