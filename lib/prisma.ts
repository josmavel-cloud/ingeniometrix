import { PrismaClient } from "@prisma/client";

function readDatabaseUrlFromEnv(...names: string[]) {
  for (const name of names) {
    const rawValue = process.env[name]?.trim();

    if (!rawValue || rawValue === "undefined" || rawValue === "null") {
      continue;
    }

    return rawValue.replace(/^['"]|['"]$/g, "");
  }

  return undefined;
}

function ensurePrismaDatabaseEnv() {
  const pooledUrl = readDatabaseUrlFromEnv(
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
  );
  const unpooledUrl = readDatabaseUrlFromEnv(
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL_NO_SSL",
    "POSTGRES_URL",
    "DATABASE_URL",
  );

  if (pooledUrl) {
    process.env.DATABASE_URL = pooledUrl;
  }

  if (unpooledUrl) {
    process.env.DATABASE_URL_UNPOOLED = unpooledUrl;
  }
}

ensurePrismaDatabaseEnv();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
