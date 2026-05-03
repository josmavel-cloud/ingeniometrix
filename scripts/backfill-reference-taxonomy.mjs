import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

const RESOURCE_TYPE_MAP = {
  article: "journal article",
  "journal-article": "journal article",
  dissertation: "thesis",
  report: "report",
  book: "book",
  "book-part": "book part",
  "book-chapter": "book part",
  "edited-book": "book",
  monograph: "book",
  "proceedings-article": "conference paper",
  "posted-content": "preprint",
  other: "other"
};

async function loadLocalEnv() {
  try {
    const envFile = await fs.readFile(envPath, "utf8");

    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function inferGeneralType() {
  return "Text";
}

function inferSpecificType(workType) {
  if (!workType) {
    return "other";
  }

  return RESOURCE_TYPE_MAP[workType] ?? workType.replace(/-/g, " ");
}

function inferPublicationStage(workType) {
  if (workType === "posted-content") {
    return "PREPRINT";
  }

  return "UNKNOWN";
}

async function resolveCoarTypeConcepts() {
  const scheme = await prisma.taxonomyScheme.findUnique({
    where: {
      code: "COAR-RESOURCE-TYPES-3.2",
    },
    include: {
      concepts: true,
    },
  });

  if (!scheme) {
    throw new Error("No existe el esquema COAR-RESOURCE-TYPES-3.2 en la base.");
  }

  const byLabel = new Map();
  for (const concept of scheme.concepts) {
    byLabel.set(concept.prefLabel.toLowerCase(), concept);
  }

  return byLabel;
}

async function main() {
  await loadLocalEnv();
  const coarConcepts = await resolveCoarTypeConcepts();
  const references = await prisma.reference.findMany({
    select: {
      id: true,
      openAlexId: true,
      crossrefId: true,
      workType: true,
      rawOpenAlexJson: true,
      rawCrossrefJson: true,
    },
  });

  let classificationCount = 0;
  let membershipCount = 0;

  try {
    for (const reference of references) {
      const specificType = inferSpecificType(reference.workType);
      const concept = coarConcepts.get(specificType.toLowerCase()) ?? null;

      await prisma.referenceClassification.upsert({
        where: {
          referenceId: reference.id,
        },
        update: {
          resourceTypeGeneral: inferGeneralType(),
          resourceTypeSpecific: specificType,
          resourceTypeConceptId: concept?.id ?? null,
          peerReviewStatus: "UNKNOWN",
          publicationStage: inferPublicationStage(reference.workType),
          doiInteropType: reference.workType ?? null,
          source: "RULE",
          confidence: 0.7,
          evidenceJson: {
            providerWorkType: reference.workType,
            matchedCoarLabel: concept?.prefLabel ?? null,
          },
        },
        create: {
          referenceId: reference.id,
          resourceTypeGeneral: inferGeneralType(),
          resourceTypeSpecific: specificType,
          resourceTypeConceptId: concept?.id ?? null,
          peerReviewStatus: "UNKNOWN",
          publicationStage: inferPublicationStage(reference.workType),
          doiInteropType: reference.workType ?? null,
          source: "RULE",
          confidence: 0.7,
          evidenceJson: {
            providerWorkType: reference.workType,
            matchedCoarLabel: concept?.prefLabel ?? null,
          },
        },
      });
      classificationCount += 1;

      if (reference.openAlexId) {
        await prisma.referenceIndexMembership.upsert({
          where: {
            referenceId_indexName: {
              referenceId: reference.id,
              indexName: "OPENALEX",
            },
          },
          update: {
            indexLabel: "OpenAlex",
            source: "PROVIDER",
            status: "indexed",
            evidenceJson: {
              openAlexId: reference.openAlexId,
            },
          },
          create: {
            referenceId: reference.id,
            indexName: "OPENALEX",
            indexLabel: "OpenAlex",
            source: "PROVIDER",
            status: "indexed",
            evidenceJson: {
              openAlexId: reference.openAlexId,
            },
          },
        });
        membershipCount += 1;
      }

      if (reference.crossrefId || (reference.rawCrossrefJson && reference.workType)) {
        await prisma.referenceIndexMembership.upsert({
          where: {
            referenceId_indexName: {
              referenceId: reference.id,
              indexName: "CROSSREF",
            },
          },
          update: {
            indexLabel: "Crossref",
            source: "PROVIDER",
            status: "indexed",
            evidenceJson: {
              crossrefId: reference.crossrefId,
            },
          },
          create: {
            referenceId: reference.id,
            indexName: "CROSSREF",
            indexLabel: "Crossref",
            source: "PROVIDER",
            status: "indexed",
            evidenceJson: {
              crossrefId: reference.crossrefId,
            },
          },
        });
        membershipCount += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("Resumen de backfill:");
  console.log(`- clasificaciones normalizadas: ${classificationCount}`);
  console.log(`- memberships de indices procesadas: ${membershipCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
