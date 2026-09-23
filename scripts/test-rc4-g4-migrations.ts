import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

async function main() {
  const base = new URL(process.env.DATABASE_URL!);
  if (base.hostname !== "127.0.0.1" || base.port !== "55440" || base.pathname !== "/imx_b4_validation_rc4") throw new Error("Isolated DB required");
  const stamp = Date.now();
  const root = path.resolve("artifacts-local/rc4/g4"); await mkdir(root, { recursive: true });
  for (const mode of ["fresh", "rc3", "g3"]) {
    const schema = `g4_${mode}_${stamp}`;
    const url = new URL(base); url.searchParams.set("schema", schema);
    const db = new PrismaClient({ datasourceUrl: url.href });
    const env = { ...process.env, DATABASE_URL: url.href, DATABASE_URL_UNPOOLED: url.href };
    const logs: string[] = [];
    const deploy = (schemaFile: string) => {
      const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", schemaFile], { env, encoding: "utf8", timeout: 120000 });
      logs.push(`${result.stdout}\n${result.stderr}`); assert.equal(result.status, 0, `migration ${mode} failed; see private log`);
    };
    try {
      if (mode !== "fresh") {
        const tmp = await mkdtemp(path.join(os.tmpdir(), "imx-g4-migrations-"));
        await cp("prisma/schema.prisma", path.join(tmp, "schema.prisma"));
        await mkdir(path.join(tmp, "migrations"));
        await cp("prisma/migrations/migration_lock.toml", path.join(tmp, "migrations/migration_lock.toml"));
        const { readdir } = await import("node:fs/promises");
        for (const folder of await readdir("prisma/migrations")) {
          if (/^\d/.test(folder) && (mode === "rc3" ? folder <= "20260919000000_secure_pilot" : folder < "20260923190000")) await cp(path.join("prisma/migrations", folder), path.join(tmp, "migrations", folder), { recursive: true });
        }
        deploy(path.join(tmp, "schema.prisma"));
        await db.$executeRaw`INSERT INTO "User" (id,email,"updatedAt","passwordHash") VALUES ('historical-user','historical@example.test',NOW(),'offline-fixture-hash')`;
        await db.$executeRaw`INSERT INTO "UserSession" (id,"userId","tokenHash","expiresAt") VALUES ('historical-session','historical-user','historical-test-session',NOW()+INTERVAL '1 day')`;
      }
      deploy("prisma/schema.prisma");
      if (mode !== "fresh") {
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: "historical-user" } })).passwordHash, "offline-fixture-hash");
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: "historical-user" } })).trainingConsent, false);
        assert.equal(await db.userSession.count(), 1);
      }
      assert.equal(await db.commercialEntitlement.count(), 0, "no automatic grants on migration");
      const indexes = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_indexes WHERE schemaname = ${schema} AND indexname = 'CommercialReservation_jobId_key'`;
      assert.equal(Number(indexes[0].count), 1);
      const applied = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      console.log(`PASS ${mode}: ${Number(applied[0].count)} migrations; schema=${schema}; preserved for inspection`);
    } finally { await writeFile(path.join(root, `migration-${mode}.log`), logs.join("\n"), { mode: 0o600 }); await db.$disconnect(); }
  }
  assert.ok((await readFile("prisma/schema.prisma", "utf8")).includes("model AuthIdentity"));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
