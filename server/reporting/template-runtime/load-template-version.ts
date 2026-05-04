import { prisma } from "@/lib/prisma";
import type {
  EffectiveTemplateElementRules,
  NormalizedTemplateSourceDocument,
  TemplateCandidate,
  TemplateSourceSemanticAnalysis,
} from "@/server/reporting/template-ingestion-types";
import { resolveEffectiveTemplateElementRules } from "@/server/reporting/template-runtime/editorial-profiles";

type LoadedTemplateAsset = {
  id: string;
  assetKey: string;
  kind: string;
  sourceStrategy: string;
  storedFilePath: string | null;
  fileName: string | null;
  fileHash: string | null;
  fileBase64: string | null;
  mimeType: string | null;
  widthPx: number | null;
  heightPx: number | null;
};

type LoadedTemplateSource = {
  id: string;
  sourceId: string;
  sourceType: string;
  documentKind: string;
  storedFilePath: string | null;
  fileName: string | null;
  fileHash: string | null;
  fileBase64: string | null;
  mimeType: string | null;
};

function repairPotentialMojibake(value: string) {
  if (!/[ÃÂï¿½]/.test(value)) {
    return value;
  }

  const repaired = Buffer.from(value, "latin1").toString("utf8");
  return repaired.includes("\ufffd") ? value : repaired;
}

function deepRepairJsonValue<T>(value: T): T {
  if (typeof value === "string") {
    return repairPotentialMojibake(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepRepairJsonValue(item)) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepRepairJsonValue(item)]),
    ) as T;
  }

  return value;
}

function bytesToBase64(value: Uint8Array | Buffer | null | undefined) {
  if (!value) {
    return null;
  }

  return Buffer.from(value).toString("base64");
}

export type LoadedTemplateVersionRuntime = {
  templateId: string;
  templateKey: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  language: string;
  methodologyMode: string | null;
  citationStyle: string | null;
  documentKind: string;
  reviewStatus: string;
  templateCandidate: TemplateCandidate;
  effectiveEditorialProfileKey: string;
  effectiveElementRules: EffectiveTemplateElementRules;
  normalizedDocument: NormalizedTemplateSourceDocument;
  semanticAnalysis: TemplateSourceSemanticAnalysis | null;
  assets: LoadedTemplateAsset[];
  sources: LoadedTemplateSource[];
  runtimeWarnings: string[];
};

function asObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadTemplateVersionRuntime(input: {
  templateVersionId?: string;
  templateKey?: string;
}) {
  if (!input.templateVersionId && !input.templateKey) {
    throw new Error("Se requiere templateVersionId o templateKey para cargar la plantilla.");
  }

  const version = input.templateVersionId
    ? await prisma.templateVersion.findUnique({
        where: {
          id: input.templateVersionId,
        },
        include: {
          template: true,
          sources: true,
          assets: true,
        },
      })
    : await prisma.templateVersion.findFirst({
        where: {
          template: {
            key: input.templateKey,
          },
        },
        orderBy: {
          versionNumber: "desc",
        },
        include: {
          template: true,
          sources: true,
          assets: true,
        },
      });

  if (!version) {
    throw new Error("No se encontro la version de plantilla solicitada.");
  }

  const normalizedDocument = deepRepairJsonValue(
    version.normalizedDocumentJson as unknown as NormalizedTemplateSourceDocument,
  );
  const templateCandidate = deepRepairJsonValue(
    version.templateCandidateJson as unknown as TemplateCandidate,
  );
  const semanticRaw = asObjectRecord(version.semanticAnalysisJson);
  const semanticAnalysis = semanticRaw
    ? deepRepairJsonValue(semanticRaw as unknown as TemplateSourceSemanticAnalysis)
    : null;
  const editorialResolution = resolveEffectiveTemplateElementRules(templateCandidate);

  return {
    templateId: version.template.id,
    templateKey: version.template.key,
    templateName: version.template.name,
    versionId: version.id,
    versionNumber: version.versionNumber,
    language: version.language,
    methodologyMode: version.methodologyMode,
    citationStyle: version.citationStyle,
    documentKind: version.documentKind,
    reviewStatus: version.reviewStatus,
    templateCandidate,
    effectiveEditorialProfileKey: editorialResolution.profileKey,
    effectiveElementRules: editorialResolution.effectiveRules,
    normalizedDocument,
    semanticAnalysis,
    assets: version.assets.map((asset) => ({
      id: asset.id,
      assetKey: asset.assetKey,
      kind: asset.kind,
      sourceStrategy: asset.sourceStrategy,
      storedFilePath: asset.storedFilePath ?? null,
      fileName: asset.fileName ?? null,
      fileHash: asset.fileHash ?? null,
      fileBase64: bytesToBase64(asset.fileData),
      mimeType: asset.mimeType ?? null,
      widthPx: asset.widthPx ?? null,
      heightPx: asset.heightPx ?? null,
    })),
    sources: version.sources.map((source) => ({
      id: source.id,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      documentKind: source.documentKind,
      storedFilePath: source.storedFilePath ?? null,
      fileName: source.fileName ?? null,
      fileHash: source.fileHash ?? null,
      fileBase64: bytesToBase64(source.fileData),
      mimeType: source.mimeType ?? null,
    })),
    runtimeWarnings: editorialResolution.warnings,
  } satisfies LoadedTemplateVersionRuntime;
}
