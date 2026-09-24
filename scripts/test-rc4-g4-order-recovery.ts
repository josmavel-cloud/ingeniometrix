import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { STARTER_OFFER, seedCommercialCatalog } from "@/server/commercial/catalog";
import { normalizeOrder, normalizeProviderCountry } from "@/server/commercial/mercado-pago";
import { recoverMercadoPagoOrderForPurchase, validateOrderForPurchase } from "@/server/commercial/purchases";
import type { VerifiedOrder } from "@/server/commercial/payment-provider";
import { removeTestCommercialData } from "./fixtures/commercial";

function rawOrder(id: string, country = "PE") {
  return {
    id,
    external_reference: "purchase-fixture",
    user_id: "merchant-fixture",
    integration_data: { application_id: "application-fixture" },
    total_amount: "99.00",
    currency: "PEN",
    country_code: country,
    status: "created",
    status_detail: null,
    live_mode: false,
    last_updated_date: new Date().toISOString(),
    checkout_url: `https://www.mercadopago.com.pe/checkout/v1/redirect?order_id=${id}`,
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB required");
  let checks = 0;
  assert.equal(normalizeProviderCountry("PE"), "PE"); checks++;
  assert.equal(normalizeProviderCountry("PER"), "PE"); checks++;
  assert.throws(() => normalizeProviderCountry("PR"), /COUNTRY_INVALID/); checks++;

  const prefixed = normalizeOrder(rawOrder("ORDTST123456", "PER"));
  assert.equal(prefixed.sandboxIdSignal, true); checks++;
  const unprefixed = normalizeOrder(rawOrder("ORDER123456", "PE"));
  assert.equal(unprefixed.sandboxIdSignal, false); checks++;
  const purchaseShape = { id: "purchase-fixture", providerOrderId: null, merchantId: "merchant-fixture", applicationId: "application-fixture", snapshot: STARTER_OFFER, mode: "sandbox" };
  validateOrderForPurchase(purchaseShape, prefixed); checks++;
  assert.throws(() => validateOrderForPurchase(purchaseShape, { ...prefixed, merchantId: "wrong" }), /MISMATCH/); checks++;
  assert.throws(() => validateOrderForPurchase(purchaseShape, { ...prefixed, amountMinor: 1 }), /MISMATCH/); checks++;
  assert.throws(() => validateOrderForPurchase(purchaseShape, { ...prefixed, externalReference: "wrong" }), /MISMATCH/); checks++;
  assert.throws(() => normalizeOrder({ ...rawOrder("ORDTST123456"), checkout_url: "https://attacker.example/checkout/v1/redirect?order_id=ORDTST123456" }), /CHECKOUT_URL_INVALID/); checks++;

  const user = await prisma.user.create({ data: { email: `recovery-${randomUUID()}@example.test` } });
  try {
    const offer = await seedCommercialCatalog();
    const createLocalPurchase = () => prisma.purchase.create({ data: {
      userId: user.id,
      offerId: offer.id,
      requestKey: randomUUID(),
      snapshot: STARTER_OFFER,
      termsVersion: STARTER_OFFER.termsVersion,
      privacyVersion: STARTER_OFFER.privacyVersion,
      acceptedAt: new Date(),
      provider: "mercado_pago",
      mode: "sandbox",
      merchantId: "merchant-fixture",
      applicationId: "application-fixture",
    } });
    const local = await createLocalPurchase();
    const orderId = "ORDERRECOVERY123";
    const recoveredOrder: VerifiedOrder = {
      ...normalizeOrder({ ...rawOrder(orderId, "PER"), external_reference: local.id }),
      externalReference: local.id,
    };
    let searches = 0;
    let retrieves = 0;
    const provider = {
      search: async () => { searches++; return [orderId]; },
      retrieve: async () => { retrieves++; return recoveredOrder; },
    };
    const recovered = await recoverMercadoPagoOrderForPurchase(local.id, provider);
    assert.equal(recovered.matchCount, 1); checks++;
    const persisted = await prisma.purchase.findUniqueOrThrow({ where: { id: local.id } });
    assert.deepEqual([persisted.providerOrderId, Boolean(persisted.checkoutUrl), persisted.status], [orderId, true, "CHECKOUT_READY"]); checks++;
    assert.equal(await prisma.commercialEntitlement.count({ where: { userId: user.id } }), 0); checks++;
    assert.notEqual(persisted.status, "PAID"); checks++;
    assert.equal(await prisma.auditLog.count({ where: { userId: user.id, eventType: "PAYMENT_ORDER_RECOVERED" } }), 1); checks++;

    const reused = await recoverMercadoPagoOrderForPurchase(local.id, provider);
    assert.equal(reused.reused, true); checks++;
    assert.deepEqual([searches, retrieves], [1, 1], "persisted provider order avoids another provider operation"); checks++;

    const missing = await createLocalPurchase();
    await assert.rejects(() => recoverMercadoPagoOrderForPurchase(missing.id, { search: async () => [], retrieve: async () => { throw new Error("must not retrieve"); } }), /NOT_FOUND/); checks++;
    assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: missing.id } })).providerOrderId, null); checks++;

    const ambiguous = await createLocalPurchase();
    await assert.rejects(() => recoverMercadoPagoOrderForPurchase(ambiguous.id, { search: async () => ["ORDERONE123", "ORDERTWO123"], retrieve: async () => { throw new Error("must not retrieve"); } }), /AMBIGUOUS/); checks++;
    assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: ambiguous.id } })).providerOrderId, null); checks++;

    console.log(`PASS G4 order recovery: ${checks} assertions; normalized country, multifactor validation, zero/multiple safety, idempotent persistence, no entitlement.`);
  } finally {
    await removeTestCommercialData([user.id]);
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
