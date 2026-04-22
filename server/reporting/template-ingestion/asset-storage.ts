import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { getArtifactsRoot } from "@/server/reporting/template-ingestion/local-artifacts";
import type { NormalizedAssetCandidate } from "@/server/reporting/template-ingestion-types";

function sanitizeSegment(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function guessExtensionFromPath(filePath: string | null | undefined) {
  if (!filePath) {
    return "";
  }

  return path.extname(filePath).toLowerCase();
}

async function computeFileHash(filePath: string) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function storeImportedTemplateSourceFile(input: {
  templateKey: string;
  versionNumber: number;
  sourceFilePath?: string | null;
}) {
  if (!input.sourceFilePath) {
    return null;
  }

  const fileHash = await computeFileHash(input.sourceFilePath);
  const ext = guessExtensionFromPath(input.sourceFilePath);
  const rootDir = path.join(
    getArtifactsRoot(),
    "template-imports",
    sanitizeSegment(input.templateKey),
    `v${input.versionNumber}`,
    "sources",
  );
  await mkdir(rootDir, { recursive: true });
  const storedPath = path.join(rootDir, `${fileHash}${ext}`);
  await copyFile(input.sourceFilePath, storedPath);
  return storedPath;
}

function mapAssetKind(kind: NormalizedAssetCandidate["kind"]) {
  switch (kind) {
    case "logo":
      return "LOGO";
    case "seal":
      return "SEAL";
    case "cover_image":
      return "COVER_IMAGE";
    default:
      return "UNKNOWN";
  }
}

function mapAssetSourceStrategy(strategy: NormalizedAssetCandidate["source_strategy"]) {
  switch (strategy) {
    case "provided_file":
      return "PROVIDED_FILE";
    case "extracted_from_document":
      return "EXTRACTED_FROM_DOCUMENT";
    default:
      return "PLACEHOLDER";
  }
}

export async function storeImportedTemplateAssets(input: {
  templateKey: string;
  versionNumber: number;
  assets: NormalizedAssetCandidate[];
}) {
  const rootDir = path.join(
    getArtifactsRoot(),
    "template-imports",
    sanitizeSegment(input.templateKey),
    `v${input.versionNumber}`,
    "assets",
  );
  await mkdir(rootDir, { recursive: true });

  const records: Prisma.TemplateAssetCreateManyTemplateVersionInput[] = [];

  for (const asset of input.assets) {
    let storedFilePath: string | null = null;

    if (asset.source_path) {
      const fileHash = await computeFileHash(asset.source_path);
      const ext = guessExtensionFromPath(asset.source_path);
      storedFilePath = path.join(rootDir, `${sanitizeSegment(asset.asset_key)}-${fileHash}${ext}`);
      await copyFile(asset.source_path, storedFilePath);
    }

    records.push({
      assetKey: asset.asset_key,
      kind: mapAssetKind(asset.kind),
      sourceStrategy: mapAssetSourceStrategy(asset.source_strategy),
      originalFilePath: asset.source_path ?? null,
      storedFilePath,
      mimeType: asset.mime_type ?? null,
      widthPx: asset.width_px ?? null,
      heightPx: asset.height_px ?? null,
      hasTransparency: asset.has_transparency ?? null,
      metadataJson: {
        page_number: asset.page_number ?? null,
        confidence: asset.confidence ?? null,
      } as Prisma.InputJsonValue,
    });
  }

  return records;
}
