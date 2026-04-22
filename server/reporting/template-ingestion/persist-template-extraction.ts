import { Prisma as PrismaRuntime } from "@prisma/client";
import type { Prisma, TemplateOwnerType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ExtractedDocxSourceInput,
  ExtractedPdfNativeTextSourceInput,
  TemplateExtractionPipelineResult,
} from "@/server/reporting/template-ingestion-types";

import { storeImportedTemplateAssets, storeImportedTemplateSourceFile } from "./asset-storage";

type PersistTemplateExtractionInput = {
  extraction: TemplateExtractionPipelineResult;
  ownerType?: TemplateOwnerType;
  ownerUserId?: string | null;
  source:
    | { sourceType: "pdf_native_text"; source: ExtractedPdfNativeTextSourceInput }
    | { sourceType: "docx"; source: ExtractedDocxSourceInput };
};

function mapSourceType(sourceType: "pdf_native_text" | "docx") {
  return sourceType === "docx" ? "DOCX" : "PDF_NATIVE_TEXT";
}

function mapDocumentKind(documentKind: string) {
  switch (documentKind) {
    case "thesis_plan_instance":
      return "THESIS_PLAN_INSTANCE";
    case "template_guide":
      return "TEMPLATE_GUIDE";
    case "thesis_final_instance":
      return "THESIS_FINAL_INSTANCE";
    default:
      return "UNKNOWN";
  }
}

function mapReviewStatus(reviewStatus: string) {
  switch (reviewStatus) {
    case "draft":
      return "DRAFT";
    case "reviewed":
      return "REVIEWED";
    case "needs_review":
    default:
      return "NEEDS_REVIEW";
  }
}

function buildTemplateName(result: TemplateExtractionPipelineResult) {
  const institution = result.templateCandidate.institution.university_name;
  const program =
    result.templateCandidate.institution.program_name ??
    result.templateCandidate.institution.discipline_area ??
    "Plantilla";
  return `${institution} - ${program}`;
}

export async function persistTemplateExtraction(input: PersistTemplateExtractionInput) {
  const { extraction } = input;
  const templateKey = extraction.templateCandidate.template_key_guess ?? extraction.templateCandidate.template_family;
  const ownerType = input.ownerType ?? "SYSTEM";

  const existingTemplate = await prisma.template.findUnique({
    where: {
      key: templateKey,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
      },
    },
  });

  const versionNumber = (existingTemplate?.versions[0]?.versionNumber ?? 0) + 1;
  const storedSourcePath = await storeImportedTemplateSourceFile({
    templateKey,
    versionNumber,
    sourceFilePath: input.source.source.document_path ?? null,
  });
  const assetRecords = await storeImportedTemplateAssets({
    templateKey,
    versionNumber,
    assets: extraction.normalizedDocument.assets,
  });

  const template = existingTemplate
    ? await prisma.template.update({
        where: {
          id: existingTemplate.id,
        },
        data: {
          name: buildTemplateName(extraction),
          ownerType,
          ownerUserId: input.ownerUserId ?? null,
          status: "DRAFT",
          universityName: extraction.templateCandidate.institution.university_name,
          schoolName: extraction.templateCandidate.institution.school_name ?? null,
          programName: extraction.templateCandidate.institution.program_name ?? null,
          mention: extraction.templateCandidate.institution.mention ?? null,
          degreeLevel: extraction.templateCandidate.institution.degree_level ?? null,
          disciplineArea: extraction.templateCandidate.institution.discipline_area ?? null,
          templateFamily: extraction.templateCandidate.template_family,
        },
      })
    : await prisma.template.create({
        data: {
          key: templateKey,
          name: buildTemplateName(extraction),
          ownerType,
          ownerUserId: input.ownerUserId ?? null,
          status: "DRAFT",
          universityName: extraction.templateCandidate.institution.university_name,
          schoolName: extraction.templateCandidate.institution.school_name ?? null,
          programName: extraction.templateCandidate.institution.program_name ?? null,
          mention: extraction.templateCandidate.institution.mention ?? null,
          degreeLevel: extraction.templateCandidate.institution.degree_level ?? null,
          disciplineArea: extraction.templateCandidate.institution.discipline_area ?? null,
          templateFamily: extraction.templateCandidate.template_family,
        },
      });

  const version = await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      versionNumber,
      schemaVersion: "v1",
      language: extraction.templateCandidate.language,
      methodologyMode: extraction.templateCandidate.methodology_mode,
      citationStyle: extraction.templateCandidate.citation_style,
      documentKind: mapDocumentKind(extraction.normalizedDocument.document_kind),
      reviewStatus: mapReviewStatus(extraction.templateCandidate.review_status),
      templateFamily: extraction.templateCandidate.template_family,
      templateKeyGuess: extraction.templateCandidate.template_key_guess ?? null,
      universityName: extraction.templateCandidate.institution.university_name,
      schoolName: extraction.templateCandidate.institution.school_name ?? null,
      programName: extraction.templateCandidate.institution.program_name ?? null,
      mention: extraction.templateCandidate.institution.mention ?? null,
      degreeLevel: extraction.templateCandidate.institution.degree_level ?? null,
      disciplineArea: extraction.templateCandidate.institution.discipline_area ?? null,
      normalizedDocumentJson: extraction.normalizedDocument as unknown as Prisma.InputJsonValue,
      semanticAnalysisJson:
        extraction.semanticAnalysis === null
          ? PrismaRuntime.JsonNull
          : (extraction.semanticAnalysis as unknown as Prisma.InputJsonValue),
      templateCandidateJson: extraction.templateCandidate as unknown as Prisma.InputJsonValue,
      sources: {
        create: {
          sourceId: extraction.normalizedDocument.source_id,
          sourceType: mapSourceType(input.source.sourceType),
          documentKind: mapDocumentKind(extraction.normalizedDocument.document_kind),
          originalFilePath: input.source.source.document_path ?? null,
          storedFilePath: storedSourcePath,
          metadataJson: {
            warnings: extraction.normalizedDocument.warnings,
          } as Prisma.InputJsonValue,
        },
      },
      assets: {
        createMany: {
          data: assetRecords,
        },
      },
    },
    include: {
      sources: true,
      assets: true,
    },
  });

  return {
    template,
    version,
  };
}
