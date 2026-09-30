import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleMercadoPagoWebhook } from "@/app/api/payments/mercado-pago/webhook/route";
import { mercadoPago } from "@/server/commercial/mercado-pago";

const secret = "offline-webhook-secret-that-must-never-be-logged";
const requestId = "offline-provider-request-id-that-must-never-be-logged";
const accessTokenCanary = "offline-access-token-that-must-never-be-logged";
const cookieCanary = "offline-session-cookie-that-must-never-be-logged";

function signedRequest(
  resourceId: string,
  body: Record<string, unknown>,
  options: { signature?: "valid" | "invalid" | "missing" } = {},
) {
  const ts = String(Math.floor(Date.now() / 1000));
  const valid = createHmac("sha256", secret)
    .update(`id:${resourceId};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  const signature = options.signature === "invalid" ? "0".repeat(64) : valid;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId,
    authorization: `Bearer ${accessTokenCanary}`,
    cookie: cookieCanary,
  };
  if (options.signature !== "missing") headers["x-signature"] = `ts=${ts},v1=${signature}`;
  return {
    request: new Request(`https://app.example.test/api/payments/mercado-pago/webhook?data.id=${encodeURIComponent(resourceId)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    rawSignature: headers["x-signature"] || "",
  };
}

async function main() {
  const previousSecret = process.env.MP_WEBHOOK_SECRET;
  process.env.MP_WEBHOOK_SECRET = secret;
  let checks = 0;
  try {
    for (const mode of ["missing", "invalid"] as const) {
      let providerLookups = 0;
      const logs: Record<string, unknown>[] = [];
      const { request } = signedRequest("123456", { type: "test", action: "test.created", data: { id: "123456" }, live_mode: false }, { signature: mode });
      const response = await handleMercadoPagoWebhook(request, {
        launchGuard: () => undefined,
        applyRateLimit: async () => undefined,
        verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
        processOrder: async () => { providerLookups++; },
        log: (record) => logs.push(record),
      });
      assert.equal(response.status, 401);
      assert.equal(providerLookups, 0);
      assert.equal(logs.at(-1)?.eventClassification, "AUTHENTICATION_FAILED");
      assert.equal(logs.at(-1)?.signatureValidationResult, "FAIL");
      assert.equal(logs.at(-1)?.safeErrorCode, "WEBHOOK_SIGNATURE_INVALID");
      checks += 3;
    }

    let commercialCalls = 0;
    const safeLogs: Record<string, unknown>[] = [];
    const simulator = signedRequest("123456", { type: "test", action: "TEST.CREATED", data: { id: "123456" }, live_mode: false });
    const simulatorResponse = await handleMercadoPagoWebhook(simulator.request, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => safeLogs.push(record),
    });
    assert.equal(simulatorResponse.status, 200);
    assert.equal(commercialCalls, 0, "simulator does not enter provider lookup or commercial persistence");
    assert.equal(safeLogs.at(-1)?.eventClassification, "VALID_TEST_NOTIFICATION");
    assert.equal(safeLogs.at(-1)?.bodyParseStatus, "PARSED");
    assert.equal(safeLogs.at(-1)?.bodyDataIdPresent, true);
    assert.equal(safeLogs.at(-1)?.type, "test");
    assert.equal(safeLogs.at(-1)?.action, "TEST.CREATED");
    assert.equal(safeLogs.at(-1)?.liveMode, false);
    assert.equal(safeLogs.at(-1)?.queryDataIdPresent, true);
    assert.equal(safeLogs.at(-1)?.xSignaturePresent, true);
    assert.equal(safeLogs.at(-1)?.xRequestIdPresent, true);
    assert.equal(safeLogs.at(-1)?.signatureParseStatus, "VALID");
    assert.equal(safeLogs.at(-1)?.signatureValidationResult, "PASS");
    assert.equal(safeLogs.at(-1)?.responseStatus, 200);
    checks += 3;

    const unsupported = signedRequest("notification-123", { type: "payment", action: "payment.updated", data: { id: "notification-123" }, live_mode: false });
    const unsupportedResponse = await handleMercadoPagoWebhook(unsupported.request, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => safeLogs.push(record),
    });
    assert.equal(unsupportedResponse.status, 200);
    assert.equal(commercialCalls, 0);
    assert.equal(safeLogs.at(-1)?.eventClassification, "VALID_UNSUPPORTED_NOTIFICATION");
    checks += 3;

    const orderId = "ORDTST123456";
    const order = signedRequest(orderId, { type: "order", action: "order.processed", data: { id: orderId }, live_mode: false });
    const orderResponse = await handleMercadoPagoWebhook(order.request, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async (_eventKey, resourceId) => { assert.equal(resourceId, orderId); commercialCalls++; },
      log: (record) => safeLogs.push(record),
    });
    assert.equal(orderResponse.status, 200);
    assert.equal(commercialCalls, 1, "valid order continues to the existing order processor");
    assert.equal(safeLogs.at(-1)?.bodyParseStatus, "PARSED");
    assert.equal(safeLogs.at(-1)?.bodyDataIdPresent, true);
    assert.equal(safeLogs.at(-1)?.queryDataIdPresent, true);
    checks += 5;

    const ts = String(Math.floor(Date.now() / 1000));
    const incorrectlyLowercased = createHmac("sha256", secret)
      .update(`id:${orderId.toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest("hex");
    const wrongCaseRequest = new Request(`https://app.example.test/api/payments/mercado-pago/webhook?data.id=${orderId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId, "x-signature": `ts=${ts},v1=${incorrectlyLowercased}` },
      body: JSON.stringify({ type: "order", action: "order.processed", data: { id: orderId }, live_mode: false }),
    });
    const wrongCaseResponse = await handleMercadoPagoWebhook(wrongCaseRequest, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => safeLogs.push(record),
    });
    assert.equal(wrongCaseResponse.status, 401, "a signature over a modified lowercase ID is invalid");
    assert.equal(commercialCalls, 1, "invalid case-normalized signature has zero commercial mutation");
    checks += 2;

    const malformedTemplate = signedRequest("123456", { type: "test", action: "test.created" });
    const malformedJson = new Request(malformedTemplate.request.url, {
      method: "POST",
      headers: malformedTemplate.request.headers,
      body: "{not-json",
    });
    const malformedLogs: Record<string, unknown>[] = [];
    const malformedResponse = await handleMercadoPagoWebhook(malformedJson, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => malformedLogs.push(record),
    });
    assert.equal(malformedResponse.status, 400);
    assert.equal(malformedLogs.at(-1)?.bodyParseStatus, "INVALID_JSON");
    assert.equal(malformedLogs.at(-1)?.signatureValidationResult, "PASS");
    assert.equal(malformedLogs.at(-1)?.safeErrorCode, "WEBHOOK_REQUEST_MALFORMED");
    assert.equal(malformedLogs.at(-1)?.eventClassification, "MALFORMED_REQUEST");
    checks += 5;

    const missingQueryTemplate = signedRequest("123456", { type: "test", action: "test.created" });
    const missingQuery = new Request("https://app.example.test/api/payments/mercado-pago/webhook", {
      method: "POST",
      headers: missingQueryTemplate.request.headers,
      body: JSON.stringify({ type: "test", action: "test.created" }),
    });
    const missingQueryLogs: Record<string, unknown>[] = [];
    const missingQueryResponse = await handleMercadoPagoWebhook(missingQuery, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => missingQueryLogs.push(record),
    });
    assert.equal(missingQueryResponse.status, 400);
    assert.equal(missingQueryLogs.at(-1)?.queryDataIdPresent, false);
    assert.equal(missingQueryLogs.at(-1)?.signatureValidationResult, "NOT_REACHED");
    assert.equal(missingQueryLogs.at(-1)?.safeErrorCode, "WEBHOOK_REQUEST_MALFORMED");
    checks += 3;

    const fakeOrder = signedRequest("ORDER123456", { type: "order", action: "order.updated", data: { id: "ORDER123456" }, live_mode: false });
    const fakeOrderResponse = await handleMercadoPagoWebhook(fakeOrder.request, {
      launchGuard: () => undefined,
      applyRateLimit: async () => undefined,
      verifyNotification: (candidate) => mercadoPago.verifyNotification(candidate),
      processOrder: async () => { commercialCalls++; },
      log: (record) => safeLogs.push(record),
    });
    assert.equal(fakeOrderResponse.status, 200);
    assert.equal(commercialCalls, 2, "non-ORDTST is authenticated and delegated to authoritative order verification");
    checks += 2;

    const serializedLogs = JSON.stringify(safeLogs);
    for (const forbidden of [secret, requestId, accessTokenCanary, cookieCanary, simulator.rawSignature]) {
      assert.equal(serializedLogs.includes(forbidden), false, `diagnostics must not include sensitive value: ${forbidden.slice(0, 8)}`);
      checks++;
    }
    assert.match(serializedLogs, /requestCorrelationHash/);
    assert.match(serializedLogs, /signatureValidationResult/);
    const expectedDiagnosticKeys = [
      "timestamp", "requestCorrelationHash", "method", "queryDataIdPresent", "bodyParseStatus",
      "bodyDataIdPresent", "type", "action", "liveMode", "xSignaturePresent", "xRequestIdPresent",
      "signatureParseStatus", "signatureValidationResult", "eventClassification", "safeErrorCode", "responseStatus",
    ].sort();
    assert.deepEqual(Object.keys(safeLogs.at(-1)!).sort(), expectedDiagnosticKeys);
    checks += 3;

    console.log(`PASS G4 webhook: ${checks} assertions; authentication-first classification, simulator acknowledgement, real-order isolation, safe diagnostics.`);
  } finally {
    if (previousSecret === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = previousSecret;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
