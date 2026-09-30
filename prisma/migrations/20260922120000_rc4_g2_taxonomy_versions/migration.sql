-- RC4 G2 is additive: historical projects, university values and plan versions remain intact.
ALTER TYPE "DegreeLevel" ADD VALUE IF NOT EXISTS 'PROYECTO_INVESTIGACION';

CREATE TYPE "AcademicFieldResolutionStatus" AS ENUM ('CANONICAL', 'CUSTOM_UNRESOLVED');
CREATE TYPE "PlanPublicationStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');
CREATE TYPE "PlanSourceDispositionStatus" AS ENUM ('USED', 'CONSIDERED_NOT_USED', 'REJECTED_AFTER_INSPECTION');

ALTER TABLE "Project" ALTER COLUMN "university" DROP NOT NULL;
ALTER TABLE "Project" ADD COLUMN "activeBlueprintVersionId" TEXT;
CREATE UNIQUE INDEX "Project_activeBlueprintVersionId_key" ON "Project"("activeBlueprintVersionId");

ALTER TABLE "TaxonomyScheme"
  ADD COLUMN "sourceJson" JSONB,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deprecatedAt" TIMESTAMP(3);

ALTER TABLE "TaxonomyConcept"
  ADD COLUMN "labelOriginal" TEXT,
  ADD COLUMN "labelEs" TEXT,
  ADD COLUMN "normalizedSearchText" TEXT,
  ADD COLUMN "sourceJson" JSONB,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deprecatedAt" TIMESTAMP(3);

UPDATE "TaxonomyConcept"
SET "labelOriginal" = "prefLabel",
    "labelEs" = COALESCE("labelEs", "prefLabel"),
    "normalizedSearchText" = lower("conceptCode" || ' ' || "prefLabel")
WHERE "labelOriginal" IS NULL OR "normalizedSearchText" IS NULL;

CREATE INDEX "TaxonomyConcept_schemeId_isActive_idx" ON "TaxonomyConcept"("schemeId", "isActive");

ALTER TABLE "ProjectKnowledgeField" DROP CONSTRAINT "ProjectKnowledgeField_conceptId_fkey";
ALTER TABLE "ProjectKnowledgeField" ALTER COLUMN "conceptId" DROP NOT NULL;
ALTER TABLE "ProjectKnowledgeField"
  ADD COLUMN "resolutionStatus" "AcademicFieldResolutionStatus" NOT NULL DEFAULT 'CANONICAL',
  ADD COLUMN "submittedLabel" TEXT,
  ADD COLUMN "normalizedSubmittedLabel" TEXT,
  ADD COLUMN "customLabel" TEXT,
  ADD COLUMN "matchedAlias" TEXT,
  ADD COLUMN "taxonomyCodeSnapshot" TEXT,
  ADD COLUMN "taxonomyVersionSnapshot" TEXT;
ALTER TABLE "ProjectKnowledgeField" ADD CONSTRAINT "ProjectKnowledgeField_conceptId_fkey"
  FOREIGN KEY ("conceptId") REFERENCES "TaxonomyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectKnowledgeField_projectId_resolutionStatus_idx" ON "ProjectKnowledgeField"("projectId", "resolutionStatus");
CREATE INDEX "ProjectKnowledgeField_normalizedSubmittedLabel_idx" ON "ProjectKnowledgeField"("normalizedSubmittedLabel");

ALTER TABLE "BlueprintVersion"
  ADD COLUMN "publicationStatus" "PlanPublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "originatingDraftRevision" INTEGER,
  ADD COLUMN "generationJobId" TEXT,
  ADD COLUMN "generationInputSnapshotId" TEXT,
  ADD COLUMN "userLabel" TEXT,
  ADD COLUMN "generationManifestJson" JSONB;
CREATE UNIQUE INDEX "BlueprintVersion_generationJobId_key" ON "BlueprintVersion"("generationJobId");
CREATE UNIQUE INDEX "BlueprintVersion_generationInputSnapshotId_key" ON "BlueprintVersion"("generationInputSnapshotId");
ALTER TABLE "BlueprintVersion" ADD CONSTRAINT "BlueprintVersion_generationJobId_fkey"
  FOREIGN KEY ("generationJobId") REFERENCES "BlueprintJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlueprintVersion" ADD CONSTRAINT "BlueprintVersion_generationInputSnapshotId_fkey"
  FOREIGN KEY ("generationInputSnapshotId") REFERENCES "GenerationInputSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeBlueprintVersionId_fkey"
  FOREIGN KEY ("activeBlueprintVersionId") REFERENCES "BlueprintVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PlanSourceDisposition" (
  "id" TEXT NOT NULL,
  "blueprintVersionId" TEXT NOT NULL,
  "projectReferenceId" TEXT NOT NULL,
  "status" "PlanSourceDispositionStatus" NOT NULL,
  "reason" TEXT,
  "evidenceLevel" TEXT,
  "relevanceDimensionsJson" JSONB,
  "provenanceJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanSourceDisposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanSourceDisposition_blueprintVersionId_fkey" FOREIGN KEY ("blueprintVersionId") REFERENCES "BlueprintVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlanSourceDisposition_projectReferenceId_fkey" FOREIGN KEY ("projectReferenceId") REFERENCES "ProjectReference"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlanSourceDisposition_blueprintVersionId_projectReferenceId_key" ON "PlanSourceDisposition"("blueprintVersionId", "projectReferenceId");
CREATE INDEX "PlanSourceDisposition_blueprintVersionId_status_idx" ON "PlanSourceDisposition"("blueprintVersionId", "status");
CREATE INDEX "PlanSourceDisposition_projectReferenceId_idx" ON "PlanSourceDisposition"("projectReferenceId");

-- Core scientific payloads of a published version are immutable. Export readiness and
-- the optional user label may change without rewriting the frozen plan.
CREATE FUNCTION reject_blueprint_scientific_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."model" IS DISTINCT FROM OLD."model"
     OR NEW."promptVersion" IS DISTINCT FROM OLD."promptVersion"
     OR NEW."intakeSnapshotJson" IS DISTINCT FROM OLD."intakeSnapshotJson"
     OR NEW."selectedReferencesSnapshotJson" IS DISTINCT FROM OLD."selectedReferencesSnapshotJson"
     OR NEW."blueprintJson" IS DISTINCT FROM OLD."blueprintJson"
     OR NEW."coherenceReportJson" IS DISTINCT FROM OLD."coherenceReportJson"
     OR NEW."originatingDraftRevision" IS DISTINCT FROM OLD."originatingDraftRevision"
     OR NEW."generationJobId" IS DISTINCT FROM OLD."generationJobId"
     OR NEW."generationInputSnapshotId" IS DISTINCT FROM OLD."generationInputSnapshotId"
     OR NEW."generationManifestJson" IS DISTINCT FROM OLD."generationManifestJson" THEN
    RAISE EXCEPTION 'Published plan versions are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "BlueprintVersion_scientific_immutable" BEFORE UPDATE ON "BlueprintVersion"
FOR EACH ROW EXECUTE FUNCTION reject_blueprint_scientific_update();
