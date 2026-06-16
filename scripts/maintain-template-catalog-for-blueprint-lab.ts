import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const UPT_TEMPLATE_KEYS = [
  "UNIVERSIDAD_PRIVADA_DE_TACNA_MAESTRIA_INGENIERIA_CIVIL",
  "UNIVERSIDAD_PRIVADA_DE_TACNA_UNKNOWN",
] as const;

const PUCP_TEMPLATE_KEY =
  "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL";

function bytesToBase64(value: Uint8Array | Buffer | null) {
  return value ? Buffer.from(value).toString("base64") : null;
}

async function backupUptTemplates() {
  const templates = await prisma.template.findMany({
    where: {
      key: {
        in: [...UPT_TEMPLATE_KEYS],
      },
    },
    include: {
      versions: {
        include: {
          sources: true,
          assets: true,
        },
        orderBy: {
          versionNumber: "asc",
        },
      },
    },
    orderBy: {
      key: "asc",
    },
  });
  const serializable = templates.map((template) => ({
    ...template,
    versions: template.versions.map((version) => ({
      ...version,
      sources: version.sources.map((source) => ({
        ...source,
        fileDataBase64: bytesToBase64(source.fileData),
        fileData: undefined,
      })),
      assets: version.assets.map((asset) => ({
        ...asset,
        fileDataBase64: bytesToBase64(asset.fileData),
        fileData: undefined,
      })),
    })),
  }));
  const outputDir = path.join(process.cwd(), "artifacts-local", "template-maintenance");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `upt-template-backup-${timestamp}.json`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");

  return {
    outputPath,
    templateCount: templates.length,
    versionCount: templates.reduce((sum, template) => sum + template.versions.length, 0),
  };
}

async function activatePucpTemplate() {
  const template = await prisma.template.findUnique({
    where: {
      key: PUCP_TEMPLATE_KEY,
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

  if (!template) {
    throw new Error(`No existe la plantilla PUCP esperada: ${PUCP_TEMPLATE_KEY}`);
  }

  const latestVersion = template.versions[0];
  if (!latestVersion) {
    throw new Error(`La plantilla PUCP no tiene versiones: ${PUCP_TEMPLATE_KEY}`);
  }

  const templateCandidate =
    latestVersion.templateCandidateJson &&
    typeof latestVersion.templateCandidateJson === "object" &&
    !Array.isArray(latestVersion.templateCandidateJson)
      ? {
          ...(latestVersion.templateCandidateJson as Record<string, unknown>),
          review_status: "reviewed",
        }
      : latestVersion.templateCandidateJson;

  await prisma.template.update({
    where: {
      key: PUCP_TEMPLATE_KEY,
    },
    data: {
      status: "ACTIVE",
    },
  });

  await prisma.templateVersion.update({
    where: {
      id: latestVersion.id,
    },
    data: {
      reviewStatus: "REVIEWED",
      templateCandidateJson: templateCandidate as Prisma.InputJsonValue,
    },
  });

  return {
    templateKey: PUCP_TEMPLATE_KEY,
    versionId: latestVersion.id,
    versionNumber: latestVersion.versionNumber,
  };
}

async function main() {
  const backup = await backupUptTemplates();
  const deleteResult = await prisma.template.deleteMany({
    where: {
      key: {
        in: [...UPT_TEMPLATE_KEYS],
      },
    },
  });
  const pucp = await activatePucpTemplate();

  console.log(
    JSON.stringify(
      {
        backup,
        deletedTemplateCount: deleteResult.count,
        activatedInstitutionalTemplate: pucp,
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
