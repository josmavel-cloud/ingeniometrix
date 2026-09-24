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

const PROVIDER_COUNTRY_TO_ALPHA2: Readonly<Record<string, string>> = Object.freeze({
  PE: "PE",
  PER: "PE",
});
const CHECKOUT_HOSTS = new Set(["www.mercadopago.com.pe", "mercadopago.com.pe", "www.mercadopago.com.ar"]);

export function normalizeProviderCountry(value: unknown) {
  if (typeof value !== "string") throw new Error("PROVIDER_COUNTRY_INVALID");
  const normalized = PROVIDER_COUNTRY_TO_ALPHA2[value.trim().toUpperCase()];
  if (!normalized) throw new Error("PROVIDER_COUNTRY_INVALID");
  return normalized;
}

export function validateCheckoutUrl(value: unknown, orderId: string) {
  if (typeof value !== "string" || !value) throw new Error("CHECKOUT_URL_MISSING");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !CHECKOUT_HOSTS.has(url.hostname.toLowerCase()) || url.pathname !== "/checkout/v1/redirect" || url.searchParams.get("order_id") !== orderId) {
    throw new Error("CHECKOUT_URL_INVALID");
  }
  return url.toString();
}

function validProviderOrderId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{8,128}$/i.test(value);
}

export function normalizeOrder(raw: Record<string, any>): VerifiedOrder {
  if (!validProviderOrderId(raw.id) || raw.live_mode === true) throw new Error("SANDBOX_ORDER_REQUIRED");
  const country = normalizeProviderCountry(raw.country_code);
  if (country !== "PE") throw new Error("PROVIDER_COUNTRY_INVALID");
  const updatedAt = new Date(raw.last_updated_date);
  if (!Number.isFinite(updatedAt.getTime()) || !raw.user_id || !raw.integration_data?.application_id || !raw.external_reference || !raw.currency) throw new Error("PROVIDER_ORDER_INCOMPLETE");
  const status = normalizeOrderStatus(raw.status, raw.status_detail || "");
  const amountMinor = moneyMinor(raw.total_amount);
  if (status === "PAID" && moneyMinor(raw.total_paid_amount) !== amountMinor) throw new Error("PROVIDER_PAID_AMOUNT_MISMATCH");
  const checkoutUrl = raw.checkout_url ? validateCheckoutUrl(raw.checkout_url, raw.id) : undefined;
  return { id: raw.id, externalReference: raw.external_reference, merchantId: String(raw.user_id), applicationId: String(raw.integration_data.application_id), amountMinor, currency: raw.currency, country, mode: "sandbox", status, sandboxIdSignal: /^ORDTST/i.test(raw.id), updatedAt, checkoutUrl };
}
export type MercadoPagoWebhookErrorCode =
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_SIGNATURE_EXPIRED"
  | "WEBHOOK_REQUEST_MALFORMED"
  | "SANDBOX_ORDER_REQUIRED"
  | "WEBHOOK_RESOURCE_MISMATCH";

export class MercadoPagoWebhookError extends Error {
  constructor(public readonly code: MercadoPagoWebhookErrorCode, public readonly httpStatus: 400 | 401) {
    super(code);
    this.name = "MercadoPagoWebhookError";
  }
}

function webhookError(code: MercadoPagoWebhookErrorCode, status: 400 | 401): never {
  throw new MercadoPagoWebhookError(code, status);
}

export function signatureParseStatus(signature: string | null): "MISSING" | "INVALID" | "VALID" {
  if (!signature) return "MISSING";
  const parts = signature.split(",").map((part) => part.trim().split("="));
  const tsValues = parts.filter(([key]) => key === "ts");
  const signatures = parts.filter(([key]) => key === "v1");
  if (tsValues.length !== 1 || signatures.length !== 1) return "INVALID";
  const ts = tsValues[0][1];
  const value = signatures[0][1];
  return /^\d{10,13}$/.test(ts || "") && /^[a-f0-9]{64}$/i.test(value || "") ? "VALID" : "INVALID";
}

export function verifyMpSignature(input: { resourceId: string; requestId: string; signature: string; secret: string; now?: number }) {
  const parts = input.signature.split(",").map((part) => part.trim().split("="));
  const tsValues = parts.filter(([key]) => key === "ts"), signatures = parts.filter(([key]) => key === "v1");
  if (tsValues.length !== 1 || signatures.length !== 1) return webhookError("WEBHOOK_SIGNATURE_INVALID", 401);
  const ts = tsValues[0][1], sig = signatures[0][1];
  if (!/^\d{10,13}$/.test(ts || "") || !/^[a-f0-9]{64}$/i.test(sig || "") || !input.requestId || !input.secret) return webhookError("WEBHOOK_SIGNATURE_INVALID", 401);
  const stamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs((input.now ?? Date.now()) - stamp) > 10 * 60_000) return webhookError("WEBHOOK_SIGNATURE_EXPIRED", 401);
  const manifest = `id:${input.resourceId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) return webhookError("WEBHOOK_SIGNATURE_INVALID", 401);
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
export async function searchMercadoPagoOrderIds(input: { externalReference: string; beginDate: Date; endDate: Date }) {
  const query = new URLSearchParams({
    begin_date: input.beginDate.toISOString(),
    end_date: input.endDate.toISOString(),
    external_reference: input.externalReference,
    limit: "10",
  });
  const result = await api(`/v1/orders?${query.toString()}`);
  if (!result || !Array.isArray(result.data)) throw new Error("PAYMENT_PROVIDER_SEARCH_INVALID");
  const ids: string[] = result.data
    .filter((order: Record<string, unknown>) => order?.external_reference === input.externalReference && validProviderOrderId(order?.id))
    .map((order: Record<string, unknown>) => String(order.id));
  return [...new Set(ids)];
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
    if (!validProviderOrderId(id)) throw new Error("PROVIDER_ORDER_ID_INVALID");
    return normalizeOrder(await api(`/v1/orders/${encodeURIComponent(id)}`));
  },
  async verifyNotification(request) {
    const resourceId = new URL(request.url).searchParams.get("data.id") || "";
    if (!resourceId) return webhookError("WEBHOOK_REQUEST_MALFORMED", 400);
    const eventKey = verifyMpSignature({ resourceId, requestId: request.headers.get("x-request-id") || "", signature: request.headers.get("x-signature") || "", secret: process.env.MP_WEBHOOK_SECRET || "" });
    let body: Record<string, any>;
    try {
      body = await limitedJson(request);
    } catch {
      return webhookError("WEBHOOK_REQUEST_MALFORMED", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return webhookError("WEBHOOK_REQUEST_MALFORMED", 400);
    const eventType = typeof body.type === "string" ? body.type.trim().toLowerCase() : "";
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : null;
    const liveMode = typeof body.live_mode === "boolean" ? body.live_mode : null;

    // Mercado Pago's official simulator sends a signed probe with a synthetic
    // data.id. It authenticates the endpoint but is never a commercial event.
    if (eventType === "test" && action === "test.created" && liveMode !== true) {
      return { kind: "TEST", eventKey, eventType: "test", action: "test.created", liveMode: false };
    }
    if (eventType !== "order") {
      return { kind: "UNSUPPORTED", eventKey, eventType: eventType || "unknown", action, liveMode };
    }

    // Order semantics are intentionally applied only after authentication.
    if (!validProviderOrderId(resourceId)) return webhookError("WEBHOOK_REQUEST_MALFORMED", 400);
    if (typeof body.data?.id !== "string" || body.data.id.toLowerCase() !== resourceId.toLowerCase() || body.live_mode === true) {
      return webhookError("WEBHOOK_RESOURCE_MISMATCH", 400);
    }
    return { kind: "ORDER", eventKey, resourceId: body.data.id, eventType: "order", action, liveMode: false };
  },
};
