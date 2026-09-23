import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { issueSessionToken, revokeSessionToken } from "@/server/auth/session";
import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB required");
  const port = 33249, origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, NODE_ENV: "production", APP_ORIGIN: origin, IMX_AUTHLESS_WORKSPACE: "0", IMX_ENABLE_DEEP_RESEARCH: "0", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", MP_TEST_ACCESS_TOKEN: "", MP_WEBHOOK_SECRET: "", OPENAI_API_KEY: "", OPENALEX_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; server.stdout.on("data", (d) => logs += d); server.stderr.on("data", (d) => logs += d);
  const users: string[] = []; const refs: string[] = []; let checks = 0;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) { if (server.exitCode !== null) throw new Error("HTTP fixture server exited"); try { if ((await fetch(`${origin}/workspace`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 500)); }
    assert.ok(ready);
    const a = await prisma.user.create({ data: { email: `g4-http-${randomUUID()}@example.test` } }); users.push(a.id);
    const b = await prisma.user.create({ data: { email: `g4-http-${randomUUID()}@example.test` } }); users.push(b.id);
    const token = await issueSessionToken({ userId: a.id }); const other = await issueSessionToken({ userId: b.id });
    const request = (path: string, method = "GET", body?: unknown, auth = token, from = origin) => fetch(`${origin}${path}`, { method, headers: { Cookie: `imx_session=${auth}`, Origin: from, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    assert.equal((await request("/api/commercial", "GET", undefined, "")).status, 401); checks++;
    const balance = await (await request("/api/commercial")).json(); assert.equal(balance.balance.available, 0); assert.equal(balance.checkoutAvailable, false); checks++;
    for (const page of ["/workspace", "/account", "/terms", "/privacy"]) { const response = await request(page); assert.ok([200,307].includes(response.status)); checks++; }
    assert.equal((await request("/api/commercial/consent", "PUT", { trainingConsent: true }, token, "https://evil.example")).status, 403); checks++;
    assert.equal((await request("/api/commercial/consent", "PUT", { trainingConsent: true })).status, 200); checks++;
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).trainingConsent, true);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).trainingConsent, false); checks++;
    assert.equal((await request("/api/commercial/consent", "PUT", { trainingConsent: false })).status, 200); checks++;
    assert.equal((await request("/api/auth/google/start", "POST", {})).status, 503); checks++;
    assert.equal((await request("/api/payments/mercado-pago/webhook", "POST", {})).status, 503); checks++;
    assert.equal((await request("/api/commercial", "POST", { offerId: "forged", priceMinor: 1, userId: b.id })).status, 409); checks++;
    const project = await prisma.project.create({ data: { userId: a.id, title: "Offline HTTP fixture", program: "Fixture", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE", intake: { create: { topic: "Offline", problemContext: "Fixture", targetPopulation: "Corpus", preferredMethodology: "Documental", availableData: "Fixture", academicConstraints: "Fixture" } } } });
    const ref = await prisma.reference.create({ data: { title: "Offline HTTP reference", normalizedTitle: "offline-http-reference", authorsJson: ["Fixture"], abstract: "Offline evidence" } }); refs.push(ref.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: ref.id, selected: true, selectedOrder: 1, sourceProvider: "SYSTEM" } });
    const rejected = await request(`/api/projects/${project.id}/blueprints`, "POST", {});
    assert.equal(rejected.status, 402, await rejected.text()); checks++;
    assert.equal(await prisma.blueprintJob.count({ where: { projectId: project.id } }), 0); checks++;
    await grantTestPackage(a.id);
    const started = await request(`/api/projects/${project.id}/blueprints`, "POST", {});
    assert.equal(started.status, 202, await started.clone().text()); const jobId = (await started.json()).job.id; checks++;
    assert.equal(await prisma.commercialReservation.count({ where: { jobId } }), 1); checks++;
    const retry = await request(`/api/projects/${project.id}/blueprints`, "POST", {});
    assert.equal((await retry.json()).job.id, jobId); checks++;
    const denied = await request(`/api/projects/${project.id}/blueprints`, "POST", {}, other);
    assert.ok(denied.status >= 400); checks++;
    assert.equal((await request(`/api/projects/${project.id}`, "GET", undefined, other)).status, 404); checks++;
    assert.equal((await request("/api/commercial/purchases/unknown", "GET", undefined, other)).status, 404); checks++;
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId } }), 0, "no worker or provider execution"); checks++;
    await revokeSessionToken(token); assert.equal((await request("/api/commercial")).status, 401); checks++;
    console.log(`PASS G4 HTTP: ${checks} assertions; real built app, auth/CSRF/consent/ownership, no-entitlement 402 rolls back, authorized enqueue reserves once; worker not started; paid calls=0.`);
  } finally {
    if (server.exitCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
    await mkdir("artifacts-local/rc4/g4", { recursive: true }); await writeFile("artifacts-local/rc4/g4/http-server.log", logs, { mode: 0o600 });
    await removeTestCommercialData(users); await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } }); await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
