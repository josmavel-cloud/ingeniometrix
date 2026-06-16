-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'INTAKE_READY', 'SEARCHING', 'SOURCES_REVIEW', 'SOURCES_SELECTED', 'BLUEPRINT_GENERATING', 'BLUEPRINT_READY', 'EXPORT_READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('PREGRADO', 'POSGRADO', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO');

-- CreateEnum
CREATE TYPE "University" AS ENUM ('PUCP', 'UPT', 'UNMSM', 'UNI', 'UP', 'UPC', 'UPCH', 'ULIMA', 'UDEP', 'USMP', 'UCV', 'OTHER');

-- CreateEnum
CREATE TYPE "TemplateKey" AS ENUM ('UPC_POSGRADO', 'UCV_POSGRADO', 'USMP_POSGRADO', 'GENERIC_POSGRADO_PE');

-- CreateEnum
CREATE TYPE "TopicOriginType" AS ENUM ('CATALOG', 'CUSTOM', 'HYBRID');

-- CreateEnum
CREATE TYPE "TopicSelectionStatus" AS ENUM ('PENDING', 'SELECTED');

-- CreateEnum
CREATE TYPE "TopicSuggestionSourceType" AS ENUM ('CATALOG', 'AI_GENERATED', 'USER_SEED');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('OPENALEX', 'CROSSREF', 'OPENAI', 'ANTHROPIC', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PeerReviewStatus" AS ENUM ('PEER_REVIEWED', 'NOT_PEER_REVIEWED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PublicationStage" AS ENUM ('PREPRINT', 'ACCEPTED_MANUSCRIPT', 'VERSION_OF_RECORD', 'CORRECTED_VERSION', 'RETRACTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('PROVIDER', 'RULE', 'USER', 'MODEL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "IndexName" AS ENUM ('OPENALEX', 'CROSSREF', 'DOAJ', 'SCOPUS', 'WEB_OF_SCIENCE', 'LATINDEX', 'SCIELO', 'REDALYC', 'DIALNET', 'OTHER');

-- CreateEnum
CREATE TYPE "KeywordSource" AS ENUM ('AUTHOR', 'PROVIDER', 'USER', 'MODEL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TemplateOwnerType" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateReviewStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "TemplateSourceType" AS ENUM ('PDF_NATIVE_TEXT', 'PDF_IMAGE', 'DOCX', 'TEXT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateDocumentKind" AS ENUM ('THESIS_PLAN_INSTANCE', 'TEMPLATE_GUIDE', 'THESIS_FINAL_INSTANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TemplateAssetKind" AS ENUM ('LOGO', 'SEAL', 'COVER_IMAGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TemplateAssetSourceStrategy" AS ENUM ('PROVIDED_FILE', 'EXTRACTED_FROM_DOCUMENT', 'PLACEHOLDER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es-PE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catalogTopicId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "country" TEXT NOT NULL DEFAULT 'PE',
    "language" TEXT NOT NULL DEFAULT 'es',
    "degreeLevel" "DegreeLevel" NOT NULL,
    "university" "University" NOT NULL,
    "program" TEXT NOT NULL,
    "templateKey" "TemplateKey" NOT NULL DEFAULT 'GENERIC_POSGRADO_PE',
    "topicOriginType" "TopicOriginType" NOT NULL DEFAULT 'CATALOG',
    "topicSelectionStatus" "TopicSelectionStatus" NOT NULL DEFAULT 'PENDING',
    "topicSeedText" TEXT,
    "topicAreaId" TEXT,
    "topicAreaLabel" TEXT,
    "selectedTopicSuggestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicAreaCatalogEntry" (
    "id" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "canonicalAreaId" TEXT,
    "canonicalAreaLabel" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicAreaCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intake" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "problemContext" TEXT,
    "researchLine" TEXT,
    "academicConstraints" TEXT,
    "targetPopulation" TEXT,
    "availableData" TEXT,
    "preferredMethodology" TEXT,
    "advisorNotes" TEXT,
    "searchQuery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "doi" TEXT,
    "openAlexId" TEXT,
    "crossrefId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "authorsJson" JSONB NOT NULL,
    "abstract" TEXT,
    "venue" TEXT,
    "year" INTEGER,
    "workType" TEXT,
    "landingPageUrl" TEXT,
    "citationCount" INTEGER,
    "rawOpenAlexJson" JSONB,
    "rawCrossrefJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "sourceProvider" "Provider" NOT NULL,
    "relevanceScore" DOUBLE PRECISION,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "selectedOrder" INTEGER,
    "selectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "intakeSnapshotJson" JSONB NOT NULL,
    "selectedReferencesSnapshotJson" JSONB NOT NULL,
    "blueprintJson" JSONB NOT NULL,
    "coherenceReportJson" JSONB NOT NULL,
    "exportStatus" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlueprintVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "provider" "Provider",
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyScheme" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "uri" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyConcept" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "parentId" TEXT,
    "conceptCode" TEXT NOT NULL,
    "conceptUri" TEXT,
    "prefLabel" TEXT NOT NULL,
    "altLabelsJson" JSONB,
    "definition" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectKnowledgeField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" "ClassificationSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectKnowledgeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTopicSuggestion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" "TopicSuggestionSourceType" NOT NULL,
    "catalogTopicId" TEXT,
    "seedText" TEXT,
    "title" TEXT NOT NULL,
    "researchLine" TEXT,
    "rationale" TEXT,
    "metadataJson" JSONB,
    "primaryConceptId" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTopicSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceClassification" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "resourceTypeGeneral" TEXT,
    "resourceTypeSpecific" TEXT,
    "resourceTypeConceptId" TEXT,
    "peerReviewStatus" "PeerReviewStatus" NOT NULL DEFAULT 'UNKNOWN',
    "publicationStage" "PublicationStage" NOT NULL DEFAULT 'UNKNOWN',
    "doiInteropType" TEXT,
    "source" "ClassificationSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceIndexMembership" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "indexName" "IndexName" NOT NULL,
    "indexLabel" TEXT,
    "source" "ClassificationSource" NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceJson" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceIndexMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceKeyword" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "keywordText" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "conceptId" TEXT,
    "source" "KeywordSource" NOT NULL,
    "score" DOUBLE PRECISION,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerType" "TemplateOwnerType" NOT NULL,
    "ownerUserId" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "universityName" TEXT,
    "schoolName" TEXT,
    "programName" TEXT,
    "mention" TEXT,
    "degreeLevel" TEXT,
    "disciplineArea" TEXT,
    "templateFamily" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "methodologyMode" TEXT,
    "citationStyle" TEXT,
    "documentKind" "TemplateDocumentKind" NOT NULL DEFAULT 'UNKNOWN',
    "reviewStatus" "TemplateReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "templateFamily" TEXT,
    "templateKeyGuess" TEXT,
    "universityName" TEXT,
    "schoolName" TEXT,
    "programName" TEXT,
    "mention" TEXT,
    "degreeLevel" TEXT,
    "disciplineArea" TEXT,
    "normalizedDocumentJson" JSONB NOT NULL,
    "semanticAnalysisJson" JSONB,
    "templateCandidateJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSource" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "TemplateSourceType" NOT NULL,
    "documentKind" "TemplateDocumentKind" NOT NULL,
    "originalFilePath" TEXT,
    "storedFilePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "fileData" BYTEA,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateAsset" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "kind" "TemplateAssetKind" NOT NULL,
    "sourceStrategy" "TemplateAssetSourceStrategy" NOT NULL,
    "originalFilePath" TEXT,
    "storedFilePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "fileData" BYTEA,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "hasTransparency" BOOLEAN,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TopicAreaCatalogEntry_normalizedLabel_key" ON "TopicAreaCatalogEntry"("normalizedLabel");

-- CreateIndex
CREATE INDEX "TopicAreaCatalogEntry_canonicalAreaId_idx" ON "TopicAreaCatalogEntry"("canonicalAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_projectId_key" ON "Intake"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Reference_openAlexId_key" ON "Reference"("openAlexId");

-- CreateIndex
CREATE INDEX "Reference_doi_idx" ON "Reference"("doi");

-- CreateIndex
CREATE INDEX "Reference_normalizedTitle_year_idx" ON "Reference"("normalizedTitle", "year");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectReference_projectId_referenceId_key" ON "ProjectReference"("projectId", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintVersion_projectId_versionNumber_key" ON "BlueprintVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyScheme_code_key" ON "TaxonomyScheme"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyConcept_schemeId_conceptCode_key" ON "TaxonomyConcept"("schemeId", "conceptCode");

-- CreateIndex
CREATE INDEX "ProjectKnowledgeField_projectId_isPrimary_idx" ON "ProjectKnowledgeField"("projectId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectKnowledgeField_projectId_conceptId_key" ON "ProjectKnowledgeField"("projectId", "conceptId");

-- CreateIndex
CREATE INDEX "ProjectTopicSuggestion_projectId_selected_idx" ON "ProjectTopicSuggestion"("projectId", "selected");

-- CreateIndex
CREATE INDEX "ProjectTopicSuggestion_primaryConceptId_idx" ON "ProjectTopicSuggestion"("primaryConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTopicSuggestion_projectId_sourceType_title_key" ON "ProjectTopicSuggestion"("projectId", "sourceType", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceClassification_referenceId_key" ON "ReferenceClassification"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceIndexMembership_referenceId_indexName_key" ON "ReferenceIndexMembership"("referenceId", "indexName");

-- CreateIndex
CREATE INDEX "ReferenceKeyword_referenceId_normalizedKeyword_idx" ON "ReferenceKeyword"("referenceId", "normalizedKeyword");

-- CreateIndex
CREATE UNIQUE INDEX "Template_key_key" ON "Template"("key");

-- CreateIndex
CREATE INDEX "Template_ownerType_status_idx" ON "Template"("ownerType", "status");

-- CreateIndex
CREATE INDEX "Template_universityName_degreeLevel_status_idx" ON "Template"("universityName", "degreeLevel", "status");

-- CreateIndex
CREATE INDEX "TemplateVersion_documentKind_reviewStatus_methodologyMode_idx" ON "TemplateVersion"("documentKind", "reviewStatus", "methodologyMode");

-- CreateIndex
CREATE INDEX "TemplateVersion_universityName_degreeLevel_citationStyle_idx" ON "TemplateVersion"("universityName", "degreeLevel", "citationStyle");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_versionNumber_key" ON "TemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "TemplateSource_templateVersionId_sourceType_idx" ON "TemplateSource"("templateVersionId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateAsset_templateVersionId_assetKey_key" ON "TemplateAsset"("templateVersionId", "assetKey");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_selectedTopicSuggestionId_fkey" FOREIGN KEY ("selectedTopicSuggestionId") REFERENCES "ProjectTopicSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintVersion" ADD CONSTRAINT "BlueprintVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyConcept" ADD CONSTRAINT "TaxonomyConcept_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "TaxonomyScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyConcept" ADD CONSTRAINT "TaxonomyConcept_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaxonomyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeField" ADD CONSTRAINT "ProjectKnowledgeField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeField" ADD CONSTRAINT "ProjectKnowledgeField_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "TaxonomyConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTopicSuggestion" ADD CONSTRAINT "ProjectTopicSuggestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTopicSuggestion" ADD CONSTRAINT "ProjectTopicSuggestion_primaryConceptId_fkey" FOREIGN KEY ("primaryConceptId") REFERENCES "TaxonomyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceClassification" ADD CONSTRAINT "ReferenceClassification_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceClassification" ADD CONSTRAINT "ReferenceClassification_resourceTypeConceptId_fkey" FOREIGN KEY ("resourceTypeConceptId") REFERENCES "TaxonomyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceIndexMembership" ADD CONSTRAINT "ReferenceIndexMembership_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceKeyword" ADD CONSTRAINT "ReferenceKeyword_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceKeyword" ADD CONSTRAINT "ReferenceKeyword_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "TaxonomyConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSource" ADD CONSTRAINT "TemplateSource_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAsset" ADD CONSTRAINT "TemplateAsset_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
