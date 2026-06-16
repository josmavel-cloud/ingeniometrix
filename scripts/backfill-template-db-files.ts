import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

function guessMimeTypeFromPath(filePath: string | null | undefined) {
  const ext = path.extname(filePath ?? "").toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return null;
  }
}

function buildFilePayload(filePath: string) {
  const fileData = readFileSync(filePath);
  return {
    fileData,
    fileHash: createHash("sha256").update(fileData).digest("hex"),
    fileName: path.basename(filePath),
    mimeType: guessMimeTypeFromPath(filePath),
  };
}

async function backfillTemplateAssets() {
  const assets = await prisma.templateAsset.findMany({
    where: {
      fileData: null,
      storedFilePath: {
        not: null,
      },
    },
    select: {
      id: true,
      storedFilePath: true,
      fileName: true,
      fileHash: true,
      mimeType: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const asset of assets) {
    if (!asset.storedFilePath || !existsSync(asset.storedFilePath)) {
      skipped += 1;
      continue;
    }

    const payload = buildFilePayload(asset.storedFilePath);
    await prisma.templateAsset.update({
      where: {
        id: asset.id,
      },
      data: {
        fileData: payload.fileData,
        fileHash: asset.fileHash ?? payload.fileHash,
        fileName: asset.fileName ?? payload.fileName,
        mimeType: asset.mimeType ?? payload.mimeType,
      },
    });
    updated += 1;
  }

  return { updated, skipped, total: assets.length };
}

async function backfillTemplateSources() {
  const sources = await prisma.templateSource.findMany({
    where: {
      fileData: null,
      storedFilePath: {
        not: null,
      },
    },
    select: {
      id: true,
      storedFilePath: true,
      fileName: true,
      fileHash: true,
      mimeType: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const source of sources) {
    if (!source.storedFilePath || !existsSync(source.storedFilePath)) {
      skipped += 1;
      continue;
    }

    const payload = buildFilePayload(source.storedFilePath);
    await prisma.templateSource.update({
      where: {
        id: source.id,
      },
      data: {
        fileData: payload.fileData,
        fileHash: source.fileHash ?? payload.fileHash,
        fileName: source.fileName ?? payload.fileName,
        mimeType: source.mimeType ?? payload.mimeType,
      },
    });
    updated += 1;
  }

  return { updated, skipped, total: sources.length };
}

async function main() {
  const [assetResult, sourceResult] = await Promise.all([
    backfillTemplateAssets(),
    backfillTemplateSources(),
  ]);

  console.log(
    JSON.stringify(
      {
        assets: assetResult,
        sources: sourceResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
