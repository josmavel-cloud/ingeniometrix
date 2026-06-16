import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");
const refinementPath = path.join(
  repoRoot,
  "lib",
  "assets",
  "reference-keyword-refinement.json",
);

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

async function loadRefinementRules() {
  const raw = await fs.readFile(refinementPath, "utf8");
  return JSON.parse(raw);
}

function isSingleToken(value) {
  return !value.includes(" ");
}

async function main() {
  await loadLocalEnv();
  const rules = await loadRefinementRules();

  const providerStoplist = new Set(rules.providerStoplist);
  const systemStoplist = new Set(rules.systemStoplist);
  const systemSingleTokenAllowlist = new Set(rules.systemSingleTokenAllowlist);

  const keywords = await prisma.referenceKeyword.findMany({
    select: {
      id: true,
      source: true,
      normalizedKeyword: true,
      keywordText: true,
      score: true,
    },
  });

  const idsToDelete = [];

  for (const keyword of keywords) {
    const normalized = keyword.normalizedKeyword;

    if (keyword.source === "PROVIDER" && providerStoplist.has(normalized)) {
      idsToDelete.push(keyword.id);
      continue;
    }

    if (keyword.source === "SYSTEM") {
      if (systemStoplist.has(normalized)) {
        idsToDelete.push(keyword.id);
        continue;
      }

      if (
        isSingleToken(normalized) &&
        !systemSingleTokenAllowlist.has(normalized)
      ) {
        idsToDelete.push(keyword.id);
        continue;
      }

      if ((keyword.score ?? 0) < 0.3 && normalized.length < 8) {
        idsToDelete.push(keyword.id);
      }
    }
  }

  const result = await prisma.referenceKeyword.deleteMany({
    where: {
      id: {
        in: idsToDelete,
      },
    },
  });

  await prisma.$disconnect();

  console.log("Resumen de refinamiento de keywords:");
  console.log(`- keywords evaluadas: ${keywords.length}`);
  console.log(`- keywords eliminadas: ${result.count}`);
  console.log(`- keywords restantes: ${keywords.length - result.count}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
