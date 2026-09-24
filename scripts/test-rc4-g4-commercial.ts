import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { STARTER_OFFER, seedCommercialCatalog, commercialLaunchGuard } from "@/server/commercial/catalog";
import { reserveCommercialJob, settleCommercialJob, customerBalance, reconcileCommercialJobs, assertCommercialPaidAuthorization } from "@/server/commercial/ledger";
import { createPurchase, processPaymentEvent, purchaseForUser, reconcilePaymentEvents } from "@/server/commercial/purchases";
import { verifyMpSignature, normalizeOrder, normalizeOrderStatus, moneyMinor, mercadoPago } from "@/server/commercial/mercado-pago";
import type { PaymentProvider, VerifiedOrder } from "@/server/commercial/payment-provider";
import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB required");
  global.fetch = async () => { throw new Error("No external calls"); };
  Object.assign(process.env, { IMX_PAYMENT_MODE: "sandbox", IMX_PAYMENT_ACCOUNT_CONTEXT: "test_user", MP_TEST_ACCESS_TOKEN: "offline-not-a-token", MP_WEBHOOK_SECRET: "offline-test-secret", MP_TEST_MERCHANT_ID: "123", MP_APPLICATION_ID: "456", APP_ORIGIN: "https://app.example.test" });
  const users = await Promise.all([1,2,3].map((i) => prisma.user.create({ data: { email: `g4-${randomUUID()}-${i}@example.test` } })));
  const [user, buyer, other] = users;
  const eventKeys: string[] = [];
  let checks = 0;
  const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
  try {
    const offer = await seedCommercialCatalog();
    eq(STARTER_OFFER.computeCredits, STARTER_OFFER.maxCreditsPerPlan * STARTER_OFFER.planSlots, "five worst-case slots funded");
    const a = await grantTestPackage(user.id, 1);
    eq((await grantTestPackage(user.id, 1)).id, a.id, "idempotent grant");
    const project = await prisma.project.create({ data: { userId: user.id, title: "Offline commercial", program: "Fixture", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE" } });
    const makeJob = () => prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, metadataJson: { commercialPolicy: "commercial-v1" } } });
    const rolledBackJob = randomUUID();
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await tx.blueprintJob.create({ data: { id: rolledBackJob, projectId: project.id, userId: user.id } });
      await reserveCommercialJob(tx, rolledBackJob);
      throw new Error("SIMULATED_CRASH_BEFORE_ENQUEUE_COMMIT");
    }), /SIMULATED_CRASH/);
    eq(await prisma.blueprintJob.count({ where: { id: rolledBackJob } }), 0, "crash leaves no half-enqueued job");
    eq((await customerBalance(user.id)).available, 1, "crash rolls back reservation atomically");
    const jobs = await Promise.all([makeJob(), makeJob()]);
    const race = await Promise.allSettled(jobs.map((j) => prisma.$transaction((tx) => reserveCommercialJob(tx, j.id))));
    eq(race.filter((r) => r.status === "fulfilled").length, 1, "concurrent last slot has one winner");
    const job = jobs[race.findIndex((r) => r.status === "fulfilled")];
    const reserve = await prisma.commercialReservation.findUniqueOrThrow({ where: { jobId: job.id } });
    await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => reserveCommercialJob(tx, job.id))));
    eq(await prisma.commercialReservation.count({ where: { jobId: job.id } }), 1, "same-job reserve idempotent");
    eq((await customerBalance(user.id)).available, 0, "reservation holds last slot");
    await assert.rejects(() => prisma.commercialEntitlement.update({ where: { id: a.id }, data: { reservedCredits: 100000 } })); checks++;
    const line = await prisma.commercialLedgerEntry.findFirstOrThrow({ where: { userId: user.id } });
    await assert.rejects(() => prisma.commercialLedgerEntry.update({ where: { id: line.id }, data: { amount: 999 } }), /immutable/); checks++;
    await assert.rejects(() => prisma.commercialLedgerEntry.delete({ where: { id: line.id } }), /immutable/); checks++;
    await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: "control:cost", progress: 100, outputJson: { entries: [{ estimate: 0.91, status: "completed", retry: false }, { estimate: 0.20, status: "completed", retry: true }] } } });
    await prisma.$transaction((tx) => settleCommercialJob(tx, job.id, "FAILED"));
    eq((await customerBalance(user.id)).available, 1, "platform failure returns slot");
    eq((await prisma.commercialEntitlement.findUniqueOrThrow({ where: { id: a.id } })).consumedCredits, 0, "platform loss not billed");
    await prisma.$transaction((tx) => reserveCommercialJob(tx, job.id));
    await prisma.$transaction((tx) => settleCommercialJob(tx, job.id, "FAILED"));
    eq((await customerBalance(user.id)).available, 1, "failure before worker acquires recovery does not duplicate settlement key");
    eq((await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } })).outputJson, { entries: [{ estimate: 0.91, status: "completed", retry: false }, { estimate: 0.20, status: "completed", retry: true }] }, "B4 spend preserved");
    await prisma.blueprintJob.update({ where: { id: job.id }, data: { attempts: 1 } });
    eq((await prisma.$transaction((tx) => reserveCommercialJob(tx, job.id))).id, reserve.id, "recovery same reservation");
    const version = await prisma.blueprintVersion.create({ data: { projectId: project.id, generationJobId: job.id, versionNumber: 1, model: "offline", promptVersion: "offline", intakeSnapshotJson: {}, selectedReferencesSnapshotJson: [], blueprintJson: {}, coherenceReportJson: {} } });
    for (const kind of ["BLUEPRINT_DOCX", "BLUEPRINT_PDF"] as const) await prisma.generatedArtifact.create({ data: { userId: user.id, projectId: project.id, jobId: job.id, blueprintVersionId: version.id, kind, fileName: kind, mimeType: "application/octet-stream", byteSize: 4, sha256: "fixture-not-a-real-document", content: Buffer.from("mock") } });
    await prisma.blueprintJob.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    await assert.rejects(() => prisma.$transaction(async (tx) => { await settleCommercialJob(tx, job.id, "COMPLETED"); throw new Error("SIMULATED_CRASH_DURING_SETTLEMENT"); }), /SIMULATED_CRASH/);
    eq((await prisma.commercialReservation.findUniqueOrThrow({ where: { jobId: job.id } })).status, "RESERVED", "settlement rollback keeps reservation");
    // Simulate restart after publication persisted but before commercial settlement.
    await reconcileCommercialJobs();
    await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => settleCommercialJob(tx, job.id, "COMPLETED"))));
    const settled = await prisma.commercialEntitlement.findUniqueOrThrow({ where: { id: a.id } });
    eq([settled.consumedSlots, settled.consumedCredits, settled.reservedCredits], [1, 910, 0], "exactly one successful slot; retries free");
    await assert.rejects(() => prisma.$transaction((tx) => reserveCommercialJob(tx, jobs.find((j) => j.id !== job.id)!.id)), /ENTITLEMENT_REQUIRED/); checks++;

    const orders = new Map<string, VerifiedOrder>(); let creates = 0; let unavailable = false;
    const provider: PaymentProvider = { name: "offline_mp", async createCheckout(input) { creates++; const found = [...orders.values()].find((o) => o.externalReference === input.purchaseId); if (found) return found;
      const order: VerifiedOrder = { id: `ORDTST${randomUUID().replaceAll("-", "")}`, externalReference: input.purchaseId, merchantId: input.merchantId, applicationId: input.applicationId, currency: input.policy.currency, amountMinor: input.policy.priceMinor, country: "PE", mode: "sandbox", status: "PENDING", sandboxIdSignal: true, updatedAt: new Date(), checkoutUrl: "https://www.mercadopago.com.pe/checkout" }; orders.set(order.id, order); return order; }, async retrieveOrder(id) { if (unavailable) throw new Error("OFFLINE_UNAVAILABLE"); return orders.get(id)!; }, async verifyNotification() { throw new Error("not called by unit fixture"); } };
    const key = randomUUID(); const consent = { termsVersion: STARTER_OFFER.termsVersion, privacyVersion: STARTER_OFFER.privacyVersion };
    const purchase = await createPurchase(buyer.id, key, offer.id, consent, provider);
    await assert.rejects(() => createPurchase(buyer.id, key, "tampered-offer", consent, provider), /CONFLICT/); checks++;
    eq((await createPurchase(buyer.id, key, offer.id, consent, provider)).purchaseId, purchase.purchaseId, "checkout idempotency");
    eq(creates, 1, "persisted checkout reused");
    eq((await customerBalance(buyer.id)).available, 0, "checkout/redirect not a grant");
    await purchaseForUser(buyer.id, purchase.purchaseId);
    await assert.rejects(() => purchaseForUser(other.id, purchase.purchaseId), /NOT_FOUND/); checks++;
    const order = [...orders.values()][0];
    const notify = async () => { const key = randomUUID(); eventKeys.push(key); return processPaymentEvent(key, order.id, provider); };
    order.status = "PAID";
    for (const field of ["amountMinor", "currency", "merchantId", "applicationId", "externalReference"] as const) {
      const old = order[field]; Object.assign(order, { [field]: field === "amountMinor" ? 1 : "wrong" });
      await assert.rejects(notify, /MISMATCH/); checks++; Object.assign(order, { [field]: old });
    }
    unavailable = true; await assert.rejects(notify, /UNAVAILABLE/); unavailable = false;
    const transaction = prisma.$transaction.bind(prisma);
    // Inject a crash at the commit boundary, after production verified and granted.
    (prisma as any).$transaction = (fn: any) => transaction(async (tx) => { await fn(tx); throw new Error("SIMULATED_CRASH_BEFORE_WEBHOOK_COMMIT"); });
    try { await assert.rejects(notify, /SIMULATED_CRASH/); } finally { (prisma as any).$transaction = transaction; }
    eq((await customerBalance(buyer.id)).available, 0, "payment+grant rollback together on crash");
    await reconcilePaymentEvents(provider); // also proves retrieve after transient process failure.
    const duplicateKey = randomUUID(); eventKeys.push(duplicateKey);
    await Promise.all(Array.from({ length: 4 }, () => processPaymentEvent(duplicateKey, order.id, provider)));
    eq(await prisma.commercialEntitlement.count({ where: { purchaseId: purchase.purchaseId } }), 1, "webhook duplication grants once");
    eq((await customerBalance(buyer.id)).available, 5, "verified payment grants five");
    order.status = "PENDING"; order.updatedAt = new Date(Date.now() - 60000); await notify();
    eq((await purchaseForUser(buyer.id, purchase.purchaseId)).status, "PAID", "old pending cannot downgrade paid");
    await assert.rejects(() => prisma.purchase.update({ where: { id: purchase.purchaseId }, data: { snapshot: {} } }), /immutable/); checks++;
    order.status = "REFUNDED"; order.updatedAt = new Date(Date.now() + 1000); await notify();
    eq((await customerBalance(buyer.id)).available, 0, "refund revokes unused entitlement");
    order.status = "PAID"; order.updatedAt = new Date(Date.now() + 2000); await notify();
    eq((await purchaseForUser(buyer.id, purchase.purchaseId)).status, "REFUNDED", "reversal never regrants from late approved event");
    await assert.rejects(() => prisma.$transaction((tx) => assertCommercialPaidAuthorization(tx, job.id)), /RESERVATION_REQUIRED/); checks++;
    eq(moneyMinor("99.00"), 9900, "money in integer minor units");
    assert.throws(() => moneyMinor("9.999")); checks++;
    eq(normalizeOrderStatus("processed", "partially_refunded"), "REVIEW_REQUIRED", "partial refund freezes");
    eq(normalizeOrderStatus("charged_back", ""), "CHARGEBACK", "chargeback normalized");
    const otherPurchase = await createPurchase(other.id, randomUUID(), offer.id, consent, provider);
    const chargebackOrder = [...orders.values()].find((o) => o.externalReference === otherPurchase.purchaseId)!;
    chargebackOrder.status = "PAID";
    const paidEvent = randomUUID(); eventKeys.push(paidEvent); await processPaymentEvent(paidEvent, chargebackOrder.id, provider);
    const otherProject = await prisma.project.create({ data: { userId: other.id, title: "Unknown cost fixture", program: "Fixture", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE" } });
    const otherJob = await prisma.blueprintJob.create({ data: { projectId: otherProject.id, userId: other.id, metadataJson: { commercialPolicy: "commercial-v1" } } });
    await prisma.$transaction((tx) => reserveCommercialJob(tx, otherJob.id));
    await prisma.$transaction((tx) => settleCommercialJob(tx, otherJob.id, "COMPLETED"));
    eq((await prisma.commercialReservation.findUniqueOrThrow({ where: { jobId: otherJob.id } })).status, "COST_PENDING", "missing cost is unknown, not zero");
    chargebackOrder.status = "CHARGEBACK"; chargebackOrder.updatedAt = new Date(Date.now()+5000);
    const chargebackEvent = randomUUID(); eventKeys.push(chargebackEvent); await processPaymentEvent(chargebackEvent, chargebackOrder.id, provider);
    eq((await customerBalance(other.id)).available, 0, "chargeback freezes package with active reservation");
    eq((await prisma.commercialEntitlement.findUniqueOrThrow({ where: { purchaseId: otherPurchase.purchaseId } })).status, "REVIEW_REQUIRED", "no destructive clawback");
    await assert.rejects(() => prisma.$transaction((tx) => assertCommercialPaidAuthorization(tx, otherJob.id)), /RESERVATION_REQUIRED/); checks++;
    const raw = { id: "ORDTST123", country_code: "PE", last_updated_date: new Date().toISOString(), user_id: 123, integration_data: { application_id: 456 }, external_reference: purchase.purchaseId, currency: "PEN", status: "processed", status_detail: "accredited", total_amount: "99.00", total_paid_amount: "99.00" };
    eq(normalizeOrder(raw).status, "PAID", "real adapter normalized schema");
    assert.throws(() => normalizeOrder({ ...raw, live_mode: true }), /SANDBOX/); checks++;
    assert.throws(() => normalizeOrder({ ...raw, total_paid_amount: "1.00" }), /MISMATCH/); checks++;
    const ts = String(Math.floor(Date.now()/1000)); const resourceId = "ORDTST123", requestId = "offline-request";
    const signature = createHmac("sha256", process.env.MP_WEBHOOK_SECRET!).update(`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex");
    const signed = { resourceId, requestId, signature: `ts=${ts},v1=${signature}`, secret: process.env.MP_WEBHOOK_SECRET! };
    assert.ok(verifyMpSignature(signed)); checks++;
    assert.throws(() => verifyMpSignature({ ...signed, resourceId: "ORDTSTOTHER" })); checks++;
    assert.throws(() => verifyMpSignature({ ...signed, now: Date.now()+900000 })); checks++;
    await mercadoPago.verifyNotification(new Request(`https://app.example.test/api/payments/mercado-pago/webhook?data.id=${resourceId}`, { method: "POST", headers: { "x-request-id": requestId, "x-signature": signed.signature }, body: JSON.stringify({ type: "order", data: { id: resourceId }, live_mode: false }) })); checks++;
    process.env.IMX_PAYMENT_MODE = "production"; assert.throws(commercialLaunchGuard, /DISABLED/); checks++;
    console.log(`PASS G4 commercial: ${checks} assertions; last-slot concurrency, reserve/release/settle, restart reconciliation, append-only, payment idempotency, authoritative verification, refund, signatures. External payments=0.`);
  } finally {
    await prisma.paymentEvent.deleteMany({ where: { id: { in: eventKeys } } });
    await removeTestCommercialData(users.map((u) => u.id));
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
