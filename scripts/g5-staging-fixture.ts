import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { issueSessionToken, revokeSessionToken } from "@/server/auth/session";
import { grantEntitlement } from "@/server/commercial/ledger";
import { STARTER_OFFER } from "@/server/commercial/catalog";
import { pdfFixture } from "./test-rc4-g5";

async function main() {
  const db = new URL(process.env.DATABASE_URL || "invalid");
  if (db.hostname !== "db" || !["/imx_g5_staging", "/imx_g5_restore"].includes(db.pathname)) throw new Error("ISOLATED_G5_DB_REQUIRED");
  const root = process.env.G5_FIXTURE_ROOT || "/app/artifacts-local";
  const statePath = path.join(root, "operations/g5-fixture.json");
  if (process.argv.includes("--seed")) {
    if (db.pathname !== "/imx_g5_staging") throw new Error("SEED_ONLY_STAGING");
    if (await prisma.user.findUnique({ where: { email: "g5-offline-owner@example.test" } })) throw new Error("FIXTURE_ALREADY_EXISTS");
    const password = randomBytes(32).toString("hex");
    const user = await prisma.user.create({ data: { email: "g5-offline-owner@example.test", passwordHash: await hashPassword(password) } });
    const project = await prisma.project.create({ data: { userId: user.id, title: "G5 offline restore fixture - not scientific acceptance", program: "Offline", degreeLevel: "MAESTRIA", draft: { create: { contentHash: "offline", contentJson: {} } } } });
    const version = await prisma.blueprintVersion.create({ data: { projectId: project.id, versionNumber: 1, model: "OFFLINE_FIXTURE", promptVersion: "NONE", intakeSnapshotJson: {}, selectedReferencesSnapshotJson: [], blueprintJson: {}, coherenceReportJson: {} } });
    const bytes = pdfFixture(); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const artifact = await prisma.generatedArtifact.create({ data: { userId: user.id, projectId: project.id, blueprintVersionId: version.id, kind: "BLUEPRINT_PDF", fileName: "g5-offline-fixture.pdf", mimeType: "application/pdf", byteSize: bytes.length, sha256, content: bytes } });
    const key = randomUUID();
    await mkdir(path.join(root, "private-storage"), { recursive: true }); await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(path.join(root, "private-storage", `${key}.pdf`), bytes, { flag: "wx", mode: 0o600 });
    const entitlement = await prisma.$transaction((tx) => grantEntitlement(tx, { userId: user.id, grantKey: `g5-offline:${user.id}`, policy: STARTER_OFFER, reason: "G5_OFFLINE_RESTORE_FIXTURE_NOT_A_PAYMENT" }));
    await writeFile(statePath, JSON.stringify({ userId: user.id, projectId: project.id, versionId: version.id, artifactId: artifact.id, entitlementId: entitlement.id, password, key, sha256 }), { flag: "wx", mode: 0o600 });
    console.log("G5 isolated fixture created; no payment/provider call.");
  }
  const fixture = JSON.parse(await readFile(statePath, "utf8"));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
  assert.ok(await verifyPassword(fixture.password, user.passwordHash));
  const session = await issueSessionToken({ userId: user.id });
  assert.equal(await prisma.userSession.count({ where: { tokenHash: createHash("sha256").update(session).digest("hex"), revokedAt: null } }), 1);
  await revokeSessionToken(session);
  const artifact = await prisma.generatedArtifact.findUniqueOrThrow({ where: { id: fixture.artifactId } });
  assert.equal(createHash("sha256").update(artifact.content).digest("hex"), fixture.sha256);
  assert.equal(createHash("sha256").update(await readFile(path.join(root, "private-storage", `${fixture.key}.pdf`))).digest("hex"), fixture.sha256);
  assert.equal(await prisma.blueprintVersion.count({ where: { id: fixture.versionId, projectId: fixture.projectId } }), 1);
  const entitlement = await prisma.commercialEntitlement.findUniqueOrThrow({ where: { id: fixture.entitlementId } });
  assert.equal(entitlement.grantedSlots, 5); assert.equal(entitlement.grantedCredits, 10000);
  const ledger = await prisma.commercialLedgerEntry.findMany({ where: { entitlementId: entitlement.id } });
  assert.equal(ledger.length, 2); assert.equal(ledger.find((e) => e.unit === "PLAN_SLOT")?.amount, 5);
  assert.equal(ledger.find((e) => e.unit === "COMPUTE_CREDIT")?.amount, 10000);
  const roles = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>>`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
  assert.equal(roles[0].rolsuper, false); assert.equal(roles[0].rolcreatedb, false); assert.equal(roles[0].rolcreaterole, false);
  await assert.rejects(() => prisma.$executeRawUnsafe("CREATE TABLE public.g5_forbidden_ddl(id INT)"));
  await assert.rejects(() => prisma.$executeRawUnsafe("SET session_replication_role = replica"));
  console.log(`PASS ${db.pathname.slice(1)}: password/session, project/version, DB/file hashes, offline entitlement ledger, non-superuser/DDL restrictions. Real payments=0.`);
}
main().catch(() => { console.error("G5_FIXTURE_VALIDATION_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
