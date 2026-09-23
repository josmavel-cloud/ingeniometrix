import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { securityAudit } from "@/server/auth/security-events";
import { commercialLaunchGuard, currentOffer, offerSchema } from "./catalog";
import { grantEntitlement, revokeEntitlement } from "./ledger";
import { mercadoPago } from "./mercado-pago";
import type { PaymentProvider, VerifiedOrder } from "./payment-provider";

export async function purchaseForUser(userId: string, id: string) {
  const p = await prisma.purchase.findFirst({ where: { id, userId } });
  if (!p) throw new Error("PURCHASE_NOT_FOUND");
  return { id: p.id, status: p.status, offer: offerSchema.parse(p.snapshot).displayName, priceMinor: offerSchema.parse(p.snapshot).priceMinor,
    currency: offerSchema.parse(p.snapshot).currency, createdAt: p.createdAt, mode: p.mode };
}
export async function createPurchase(userId: string, requestKey: string, offerId: string, accepted: { termsVersion: string; privacyVersion: string }, provider: PaymentProvider = mercadoPago) {
  const environment = commercialLaunchGuard();
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const purchase = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const prior = await tx.purchase.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    if (prior) {
      if (prior.offerId !== offerId || prior.termsVersion !== accepted.termsVersion || prior.privacyVersion !== accepted.privacyVersion) throw new Error("PURCHASE_ATTEMPT_CONFLICT");
      return prior;
    }
    const { row, policy } = await currentOffer();
    if (row.id !== offerId || accepted.termsVersion !== policy.termsVersion || accepted.privacyVersion !== policy.privacyVersion) throw new Error("OFFER_CHANGED");
    const created = await tx.purchase.create({ data: { id: randomUUID(), userId, offerId, requestKey, snapshot: policy, termsVersion: accepted.termsVersion, privacyVersion: accepted.privacyVersion,
      acceptedAt: new Date(), provider: provider.name, mode: "sandbox", merchantId: environment.merchantId, applicationId: environment.applicationId } });
    await securityAudit("PURCHASE_CREATED", userId, { purchaseId: created.id, mode: "sandbox" }, tx);
    return created;
  });
  if (purchase.checkoutUrl) return { purchaseId: purchase.id, checkoutUrl: purchase.checkoutUrl };
  // Stable provider key survives lost HTTP responses. Never substitute a new key on retry.
  const order = await provider.createCheckout({ purchaseId: purchase.id, policy: offerSchema.parse(purchase.snapshot), merchantId: purchase.merchantId, applicationId: purchase.applicationId, origin: environment.origin });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id} FOR UPDATE`;
    const current = await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    validateOrder(current, order);
    if (!order.checkoutUrl) throw new Error("CHECKOUT_URL_MISSING");
    await tx.purchase.update({ where: { id: purchase.id }, data: { providerOrderId: order.id, checkoutUrl: order.checkoutUrl, ...(current.status === "CREATED" ? { status: "CHECKOUT_READY" } : {}) } });
    await securityAudit("CHECKOUT_CREATED", userId, { purchaseId: purchase.id }, tx);
  });
  return { purchaseId: purchase.id, checkoutUrl: order.checkoutUrl! };
}
function validateOrder(purchase: { id: string; providerOrderId: string | null; merchantId: string; applicationId: string; snapshot: unknown; mode: string }, order: VerifiedOrder) {
  const policy = offerSchema.parse(purchase.snapshot);
  if (order.externalReference !== purchase.id || purchase.providerOrderId && order.id !== purchase.providerOrderId || order.merchantId !== purchase.merchantId || order.applicationId !== purchase.applicationId || order.currency !== policy.currency || order.amountMinor !== policy.priceMinor || order.mode !== purchase.mode) throw new Error("PAYMENT_VERIFICATION_MISMATCH");
}
export async function processPaymentEvent(eventKey: string, resourceId: string, provider: PaymentProvider = mercadoPago) {
  await prisma.paymentEvent.createMany({ data: [{ id: eventKey, provider: provider.name, resourceId }], skipDuplicates: true });
  const old = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: eventKey } });
  if (old.resourceId !== resourceId || old.provider !== provider.name) throw new Error("EVENT_ID_CONFLICT");
  if (old.status === "PROCESSED") return;
  // Retrieval is outside DB transaction. A failure leaves a durable RECEIVED event.
  const order = await provider.retrieveOrder(resourceId);
  if (order.id !== resourceId) throw new Error("PAYMENT_VERIFICATION_MISMATCH");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${order.externalReference} FOR UPDATE`;
    const p = await tx.purchase.findUnique({ where: { id: order.externalReference } });
    if (!p || p.provider !== provider.name) throw new Error("PAYMENT_VERIFICATION_MISMATCH");
    validateOrder(p, order);
    const event = await tx.paymentEvent.findUniqueOrThrow({ where: { id: eventKey } });
    if (event.status === "PROCESSED") return;
    const stale = p.providerUpdatedAt && order.updatedAt < p.providerUpdatedAt;
    const reversal = ["REFUNDED", "CHARGEBACK", "REVIEW_REQUIRED"].includes(order.status);
    const terminalReversal = ["REFUNDED", "CHARGEBACK", "REVIEW_REQUIRED"].includes(p.status);
    if (!stale && !(p.status === "PAID" && !reversal && order.status !== "PAID") && !terminalReversal) {
      await tx.purchase.update({ where: { id: p.id }, data: { providerOrderId: order.id, status: order.status, providerUpdatedAt: order.updatedAt } });
      if (order.status === "PAID") await grantEntitlement(tx, { userId: p.userId, purchaseId: p.id, grantKey: `purchase:${p.id}`, policy: offerSchema.parse(p.snapshot), reason: "VERIFIED_SANDBOX_PAYMENT" });
      if (reversal) await revokeEntitlement(tx, p.id, order.status);
      await securityAudit("PAYMENT_VERIFIED", p.userId, { purchaseId: p.id, status: order.status }, tx);
    }
    await tx.paymentEvent.update({ where: { id: eventKey }, data: { status: "PROCESSED", processedAt: new Date() } });
  });
}
export async function reconcilePaymentEvents(provider: PaymentProvider = mercadoPago) {
  const events = await prisma.paymentEvent.findMany({ where: { status: "RECEIVED" }, take: 100, orderBy: { createdAt: "asc" } });
  const results = [];
  for (const event of events) {
    try { await processPaymentEvent(event.id, event.resourceId, provider); results.push({ id: event.id, status: "PROCESSED" }); }
    catch { results.push({ id: event.id, status: "PENDING_RETRY" }); }
  }
  // Lost notifications are not recovered by replaying RECEIVED events alone.
  const pending = await prisma.purchase.findMany({ where: { provider: provider.name, providerOrderId: { not: null }, status: { in: ["CREATED", "CHECKOUT_READY", "PENDING", "PAID"] } }, take: 100, orderBy: { updatedAt: "asc" } });
  for (const purchase of pending) {
    const id = `reconcile:${purchase.id}:${randomUUID()}`;
    try { await processPaymentEvent(id, purchase.providerOrderId!, provider); results.push({ id, status: "PROCESSED" }); }
    catch { results.push({ id, status: "PENDING_RETRY" }); }
  }
  return results;
}
