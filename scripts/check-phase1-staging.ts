import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { issueSessionToken } from "@/server/auth/session";

// Disposable software-contract fixture. Never borrows the owner's session and
// never calls conversation/model, retrieval, payment or generation endpoints.
async function main() {
  if (process.env.IMX_RUN_PHASE1_STAGING_CHECK !== "1" || !process.env.DATABASE_URL?.includes("/imx_g5_staging") || process.env.IMX_PAYMENT_MODE !== "sandbox") throw new Error("Isolated staging check required");
  const origin = "https://staging.ingeniometrix.com";
  const user = await prisma.user.create({ data: { email: `phase1-contract-${randomUUID()}@example.test` } });
  const token = await issueSessionToken({ userId: user.id });
  let createdId: string | undefined;
  try {
    const request = async (url: string, method = "GET", body?: unknown, authorized = true) => {
      const response = await fetch(origin + url, { method, redirect: "manual", headers: { Origin: origin, "Content-Type": "application/json", ...(authorized ? { cookie: `imx_session=${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json().catch(() => null);
      return { status: response.status, payload };
    };
    const session = await request("/api/ui/session"); assert.equal(session.payload.id, user.id);
    const input = { intakeMode: "conversation", requestId: randomUUID(), idea: "Comprender prácticas de lectura en diarios personales mediante interpretación documental", degreeLevel: "PROYECTO_INVESTIGACION" };
    const created = await request("/api/projects", "POST", input); assert.equal(created.status, 201); createdId = created.payload.project.id;
    const again = await request("/api/projects", "POST", input); assert.equal(again.payload.project.id, createdId);
    const route = `/api/projects/${createdId}/definition`;
    let state = (await request(route)).payload.state;
    assert.equal(state.revision, 1);
    const changed = await request(route, "PUT", { requestId: randomUUID(), baseRevision: state.revision, etag: state.etag, action: { kind: "EDIT", field: "object", value: "Diarios personales y prácticas de lectura", knowledge: "KNOWN" } });
    assert.equal(changed.status, 200); state = changed.payload.state;
    assert.equal(await prisma.intake.count({ where: { projectId: createdId } }), 0);
    const confirmed = await request(route, "POST", { operation: "confirm", revision: state.revision, definitionHash: state.definitionHash }); assert.equal(confirmed.status, 200);
    const intent = (await request(`${route}?view=search-intent`)).payload.intent;
    assert.equal(intent.readiness, "READY"); assert.equal(intent.context, null); assert.equal(intent.methodologicalSignals.length, 0);
    assert.notEqual((await request(route, "GET", undefined, false)).status, 200);
    assert.equal(await prisma.blueprintJob.count({ where: { projectId: createdId } }), 0);
    assert.equal(await prisma.paidOperation.count({ where: { userId: user.id } }), 0);
    console.log(JSON.stringify({ status: "PASS", publicBoundary: true, ownerSession: "DISPOSABLE_TEST_ONLY", idempotentCreation: true, draft: true, explicitConfirmation: true, searchIntent: true, unauthorizedDenied: true, providerCalls: 0, jobs: 0 }));
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Staging contract check failed"); process.exitCode = 1; });
