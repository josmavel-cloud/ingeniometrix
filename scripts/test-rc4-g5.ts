import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueSessionToken, revokeSessionToken } from "@/server/auth/session";
import { authorizeTransfer, consumeTransfer, receivePdf, transferCors, MAX_UPLOAD_BYTES } from "@/server/hybrid/transfers";
import { GET as download } from "@/app/api/transfers/download/route";
import { PrivateFileArtifactStore } from "@/server/storage/artifact-store";
import { hybridOrigins } from "@/lib/hybrid-origins";
import { proxy } from "@/proxy";
import { ownedPageData } from "@/server/hybrid/page-data";

export function pdfFixture(bytes = 0) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>"];
  let text = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(text)); text += `${i+1} 0 obj\n${body}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const pdf = Buffer.from(text); return bytes ? Buffer.concat([pdf, Buffer.alloc(bytes - pdf.length, 32)]) : pdf;
}
const stream = (buffer: Buffer) => new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < buffer.length; i += 65536) c.enqueue(buffer.subarray(i, i+65536)); c.close(); } });
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("ISOLATED_DB_REQUIRED");
  global.fetch = async () => { throw new Error("PROVIDER_CALL_FORBIDDEN"); };
  process.env.IMX_HYBRID_TRANSFERS = "1"; process.env.APP_ORIGIN = "https://staging.ingeniometrix.com";
  process.env.PUBLIC_APP_ORIGIN = process.env.APP_ORIGIN; process.env.UPLOAD_ORIGIN = "https://api-staging.ingeniometrix.com";
  const dir = await mkdtemp(path.join(tmpdir(), "imx-g5-transfer-")); process.env.IMX_PRIVATE_STORAGE_ROOT = dir;
  const users: string[] = []; let checks = 0;
  const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const rejects = async (call: () => Promise<unknown>) => { await assert.rejects(call); checks++; };
  try {
    for (let i = 0; i < 2; i++) users.push((await prisma.user.create({ data: { email: `g5-${randomUUID()}@example.test` } })).id);
    const token = await issueSessionToken({ userId: users[0] }), other = await issueSessionToken({ userId: users[1] });
    const p = await prisma.project.create({ data: { userId: users[0], title: "G5 isolated fixture", program: "Test", degreeLevel: "MAESTRIA", draft: { create: { revision: 1, contentJson: {}, contentHash: "test" } } } });
    const artifact = await prisma.generatedArtifact.create({ data: { userId: users[0], projectId: p.id, kind: "BLUEPRINT_PDF", fileName: "test.pdf", mimeType: "application/pdf", content: pdfFixture(), byteSize: pdfFixture().length, sha256: createHash("sha256").update(pdfFixture()).digest("hex") } });
    const request = { purpose: "DOWNLOAD" as const, projectId: p.id, artifactId: artifact.id };
    await rejects(() => authorizeTransfer(other, request));
    eq(await ownedPageData(users[1], "detail", p.id), null);
    eq((await ownedPageData(users[0], "projects") as unknown[]).length, 1);
    const grant = await authorizeTransfer(token, request);
    const response = await download(new Request(`${grant.url}?token=${grant.token}`));
    eq(response.status, 200); eq(Buffer.from(await response.arrayBuffer()), pdfFixture());
    eq((await download(new Request(`${grant.url}?token=${grant.token}`))).status, 401);
    const race = await authorizeTransfer(token, request);
    const result = await Promise.allSettled([consumeTransfer(race.token, "DOWNLOAD"), consumeTransfer(race.token, "DOWNLOAD")]);
    eq(result.filter((r) => r.status === "fulfilled").length, 1);
    const exp = await authorizeTransfer(token, request);
    await prisma.transferGrant.updateMany({ where: { tokenHash: createHash("sha256").update(exp.token).digest("hex") }, data: { expiresAt: new Date(0) } });
    await rejects(() => consumeTransfer(exp.token, "DOWNLOAD"));
    const upload = { purpose: "UPLOAD" as const, projectId: p.id, fileName: "evidence.pdf", draftRevision: 1, byteSize: MAX_UPLOAD_BYTES, trainingConsent: false };
    await rejects(() => authorizeTransfer(other, upload));
    await rejects(() => authorizeTransfer(token, { ...upload, byteSize: MAX_UPLOAD_BYTES + 1 }));
    await rejects(() => authorizeTransfer(token, { ...upload, draftRevision: 0 }));
    await rejects(() => authorizeTransfer(token, { ...upload, fileName: "../secret.pdf" }));
    const large = pdfFixture(MAX_UPLOAD_BYTES), up = await authorizeTransfer(token, upload);
    const received = await receivePdf(up.token, stream(large));
    eq(received.byteSize, MAX_UPLOAD_BYTES); eq(received.status, "QUARANTINED");
    eq(received.sha256, createHash("sha256").update(large).digest("hex"));
    const row = await prisma.uploadedPdf.findUniqueOrThrow({ where: { id: received.id } });
    eq(row.trainingConsent, false); eq((await readFile(path.join(dir, `${row.storageKey}.pdf`))).length, MAX_UPLOAD_BYTES);
    await rejects(() => receivePdf(up.token, stream(large)));
    const two = await authorizeTransfer(token, { ...upload, byteSize: pdfFixture().length });
    await receivePdf(two.token, stream(pdfFixture()));
    await rejects(() => authorizeTransfer(token, upload));
    await rejects(() => new PrivateFileArtifactStore(dir).putPdf(randomUUID(), stream(Buffer.from("not a PDF")), 9));
    await rejects(() => new PrivateFileArtifactStore(dir).putPdf(randomUUID(), stream(pdfFixture()), 5));
    eq(transferCors(new Request("https://api.example.test", { headers: { origin: process.env.APP_ORIGIN } }))?.["Access-Control-Allow-Origin"], process.env.APP_ORIGIN);
    eq(transferCors(new Request("https://api.example.test", { headers: { origin: "https://evil.test" } })), null);
    eq(transferCors(new Request("https://api.example.test")), null);
    for (const origin of [undefined, "https://evil.test"]) {
      const r = proxy(new NextRequest("https://api.example.test/api/transfers/authorize", { method: "POST", headers: origin ? { origin } : {} })); eq(r.status, 403);
    }
    eq(proxy(new NextRequest("https://api.example.test/api/transfers/authorize", { method: "POST", headers: { origin: process.env.APP_ORIGIN } })).status, 200);
    const revoked = await authorizeTransfer(token, request); await revokeSessionToken(token);
    await rejects(() => consumeTransfer(revoked.token, "DOWNLOAD"));
    process.env.AUTH_ORIGIN = "https://evil.test"; assert.throws(() => hybridOrigins()); checks++; delete process.env.AUTH_ORIGIN;
    const runtimeRole = process.env.IMX_RUNTIME_ROLE; process.env.IMX_RUNTIME_ROLE = "frontend";
    eq(proxy(new NextRequest("https://app.test/api/internal/blueprint-jobs/x/run-stage")).status, 404); process.env.IMX_RUNTIME_ROLE = runtimeRole;
    console.log(`PASS G5: ${checks} assertions; 30 MiB private PDF, expiry, replay/race, ownership, revoked session, origin, no provider calls.`);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true }); // Only this test's mkdtemp output.
  }
}
if (process.argv[1]?.endsWith("test-rc4-g5.ts")) main().catch((error) => { console.error(error); process.exitCode = 1; });
