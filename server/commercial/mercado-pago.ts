import { createHmac, timingSafeEqual } from "node:crypto";
import { commercialLaunchGuard } from "./catalog";
import type { PaymentProvider, PaymentStatus, VerifiedOrder } from "./payment-provider";
import { secretHash } from "@/server/auth/security-events";

export function normalizeOrderStatus(status: string, detail: string): PaymentStatus {
  if (status === "charged_back" || detail === "charged_back") return "CHARGEBACK";
  if (status === "refunded" || detail === "refunded") return "REFUNDED";
  if (detail === "partially_refunded") return "REVIEW_REQUIRED";
  if (status === "processed" && detail === "accredited") return "PAID";
  return ({ created: "PENDING", processing: "PENDING", action_required: "PENDING", canceled: "CANCELLED", expired: "EXPIRED", failed: "FAILED" } as Record<string, PaymentStatus>)[status] ?? "REVIEW_REQUIRED";
}
export function moneyMinor(value: unknown) {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("PROVIDER_AMOUNT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("PROVIDER_AMOUNT_INVALID");
  return result;
}
export function normalizeOrder(raw: Record<string, any>): VerifiedOrder {
  // Orders sandbox IDs are ORDTST; also reject an explicit live flag.
  if (typeof raw.id !== "string" || !/^ORDTST[A-Z0-9]+$/i.test(raw.id) || raw.live_mode === true || raw.country_code !== "PE") throw new Error("SANDBOX_ORDER_REQUIRED");
  const updatedAt = new Date(raw.last_updated_date);
  if (!Number.isFinite(updatedAt.getTime()) || !raw.user_id || !raw.integration_data?.application_id || !raw.external_reference || !raw.currency) throw new Error("PROVIDER_ORDER_INCOMPLETE");
  const status = normalizeOrderStatus(raw.status, raw.status_detail);
  const amountMinor = moneyMinor(raw.total_amount);
  if (status === "PAID" && moneyMinor(raw.total_paid_amount) !== amountMinor) throw new Error("PROVIDER_PAID_AMOUNT_MISMATCH");
  if (raw.checkout_url) {
    const url = new URL(raw.checkout_url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.mercadopago.com.pe", "mercadopago.com.pe", "www.mercadopago.com.ar"].includes(url.hostname) || url.pathname !== "/checkout/v1/redirect" || url.searchParams.get("order_id") !== raw.id) throw new Error("CHECKOUT_URL_INVALID");
  }
  return { id: raw.id, externalReference: raw.external_reference, merchantId: String(raw.user_id), applicationId: String(raw.integration_data.application_id), amountMinor, currency: raw.currency, mode: "sandbox", status, updatedAt, checkoutUrl: raw.checkout_url };
}
export function verifyMpSignature(input: { resourceId: string; requestId: string; signature: string; secret: string; now?: number }) {
  const parts = input.signature.split(",").map((part) => part.trim().split("="));
  const tsValues = parts.filter(([key]) => key === "ts"), signatures = parts.filter(([key]) => key === "v1");
  if (tsValues.length !== 1 || signatures.length !== 1) throw new Error("WEBHOOK_SIGNATURE_INVALID");
  const ts = tsValues[0][1], sig = signatures[0][1];
  if (!/^\d{10,13}$/.test(ts || "") || !/^[a-f0-9]{64}$/i.test(sig || "") || !input.requestId || !input.secret) throw new Error("WEBHOOK_SIGNATURE_INVALID");
  const stamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs((input.now ?? Date.now()) - stamp) > 10 * 60_000) throw new Error("WEBHOOK_SIGNATURE_EXPIRED");
  const manifest = `id:${input.resourceId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) throw new Error("WEBHOOK_SIGNATURE_INVALID");
  return secretHash(manifest);
}
export async function limitedJson(request: Request, limit = 16384) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("BODY_REQUIRED");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error("REQUEST_TOO_LARGE"); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function api(path: string, init?: RequestInit) {
  commercialLaunchGuard();
  const response = await fetch(`https://api.mercadopago.com${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.MP_TEST_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
  return response.json();
}
export const mercadoPago: PaymentProvider = {
  name: "mercado_pago",
  async createCheckout(input) {
    // Test-account credentials may have APP_USR prefix: prefix alone is not safe.
    const owner = await api("/users/me");
    if (String(owner.id) !== input.merchantId || !Array.isArray(owner.tags) || !owner.tags.includes("test_user")) throw new Error("TEST_MERCHANT_REQUIRED");
    const amount = (input.policy.priceMinor / 100).toFixed(2);
    const result = await api("/v1/orders", { method: "POST", headers: { "X-Idempotency-Key": input.purchaseId }, body: JSON.stringify({ type: "online", processing_mode: "manual", total_amount: amount, external_reference: input.purchaseId,
      config: { online: { success_url: `${input.origin}/account/purchases/${input.purchaseId}`, failure_url: `${input.origin}/account/purchases/${input.purchaseId}`, pending_url: `${input.origin}/account/purchases/${input.purchaseId}` } },
      items: [{ external_code: `${input.policy.key}:v${input.policy.version}`, title: input.policy.displayName, quantity: 1, unit_price: amount }] }) });
    return normalizeOrder(result);
  },
  async retrieveOrder(id) {
    if (!/^ORDTST[A-Z0-9]+$/i.test(id)) throw new Error("SANDBOX_ORDER_REQUIRED");
    return normalizeOrder(await api(`/v1/orders/${encodeURIComponent(id)}`));
  },
  async verifyNotification(request) {
    const resourceId = new URL(request.url).searchParams.get("data.id") || "";
    if (!/^ORDTST[A-Z0-9]+$/i.test(resourceId)) throw new Error("SANDBOX_ORDER_REQUIRED");
    const eventKey = verifyMpSignature({ resourceId, requestId: request.headers.get("x-request-id") || "", signature: request.headers.get("x-signature") || "", secret: process.env.MP_WEBHOOK_SECRET || "" });
    const body = await limitedJson(request);
    if (body.type !== "order" || typeof body.data?.id !== "string" || body.data.id.toLowerCase() !== resourceId.toLowerCase() || body.live_mode === true) throw new Error("WEBHOOK_RESOURCE_MISMATCH");
    return { eventKey, resourceId: body.data.id };
  },
};
