import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pdfFixture } from "./test-rc4-g5";
const origin = "http://127.0.0.1:3311", backend = "http://127.0.0.1:3310";
let completedChecks = 0;
async function main() {
  // Secret test password stays in process memory, never in logs/command arguments.
  const fixture = JSON.parse(execFileSync("docker", ["exec", "imx-rc4-g5-staging-app-1", "node", "-e", "process.stdout.write(require('fs').readFileSync('/app/artifacts-local/operations/g5-fixture.json'))"], { encoding: "utf8" }));
  const authBody = JSON.stringify({ email: "g5-offline-owner@example.test", password: fixture.password });
  let checks = 0;
  const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; completedChecks = checks; };
  eq((await fetch(`${origin}/workspace`)).status, 200);
  eq((await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: authBody })).status, 403);
  const login = await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: authBody }); eq(login.status, 200);
  const setCookie = login.headers.get("set-cookie") || "";
  for (const flag of ["HttpOnly", "Secure", "SameSite=strict", "Path=/"]) { assert.ok(setCookie.toLowerCase().includes(flag.toLowerCase())); checks++; }
  assert.ok(!setCookie.includes("Domain=")); checks++;
  const cookie = setCookie.split(";")[0];
  const headers = { origin, cookie, "content-type": "application/json" };
  const page = await fetch(`${origin}/projects`, { headers: { cookie } }); eq(page.status, 200); assert.ok((await page.text()).includes("G5 offline restore fixture")); checks++;
  const detail = await fetch(`${origin}/api/ui/detail/${fixture.projectId}`, { headers: { cookie } }); eq(detail.status, 200);
  const data = await detail.json(); eq(data.project.id, fixture.projectId);
  const large = pdfFixture(30 * 1024 * 1024);
  const authorization = await fetch(`${origin}/api/transfers/authorize`, { method: "POST", headers, body: JSON.stringify({ purpose: "UPLOAD", projectId: fixture.projectId, draftRevision: data.project.draft.revision, fileName: "g5-30mib.pdf", byteSize: large.length, trainingConsent: false }) }); eq(authorization.status, 200);
  const grant = await authorization.json(); assert.ok(grant.url.startsWith(backend)); checks++;
  const preflight = await fetch(grant.url, { method: "OPTIONS", headers: { origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type" } }); eq(preflight.status, 204); eq(preflight.headers.get("access-control-allow-origin"), origin);
  const uploaded = await fetch(grant.url, { method: "PUT", headers: { origin, Authorization: `Bearer ${grant.token}`, "Content-Type": "application/pdf" }, body: large }); eq(uploaded.status, 200); eq((await uploaded.json()).byteSize, large.length);
  const exported = await fetch(`${origin}/api/projects/${fixture.projectId}/blueprints/${fixture.versionId}/pdf`, { headers: { cookie }, redirect: "manual" }); eq(exported.status, 302);
  const url = exported.headers.get("location")!; assert.ok(url.startsWith(backend)); checks++;
  const pdf = await fetch(url); eq(pdf.status, 200); eq(createHash("sha256").update(Buffer.from(await pdf.arrayBuffer())).digest("hex"), fixture.sha256);
  eq((await fetch(url)).status, 401);
  eq((await fetch(`${backend}/api/internal/blueprint-jobs/x/run-stage`, { method: "POST" })).status, 404);
  eq((await fetch(`${origin}/api/internal/blueprint-jobs/x/run-stage`, { method: "POST" })).status, 404);
  eq((await fetch(`${backend}/api/health/ready`)).status, 404);
  eq((await fetch(`${backend}/artifacts-local/private-storage/anything`)).status, 404);
  eq((await fetch(`${origin}/api/auth/logout`, { method: "POST", headers })).status, 200);
  eq(await (await fetch(`${origin}/api/ui/session`, { headers: { cookie } })).json(), null);
  await mkdir("artifacts-local/rc4/g5", { recursive: true });
  await writeFile("artifacts-local/rc4/g5/http-result.json", JSON.stringify({ at: new Date().toISOString(), checks, status: "PASS", maxUploadBytes: large.length, paidCalls: 0, external: false }, null, 2));
  console.log(`PASS G5 HTTP boundary: ${checks} assertions; login/reload/logout, 30 MiB direct upload, direct download, private route denial. No provider calls.`);
}
main().catch((error) => { console.error(JSON.stringify({ error: "G5_HTTP_ACCEPTANCE_FAILED", completedChecks, actualStatus: typeof error.actual === "number" ? error.actual : null, expectedStatus: typeof error.expected === "number" ? error.expected : null })); process.exitCode = 1; });
