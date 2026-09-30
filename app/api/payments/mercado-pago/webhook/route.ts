import { NextResponse } from "next/server";
import { commercialLaunchGuard } from "@/server/commercial/catalog";
import { MercadoPagoWebhookError, mercadoPago, signatureParseStatus } from "@/server/commercial/mercado-pago";
import type { VerifiedNotification } from "@/server/commercial/payment-provider";
import { processPaymentEvent } from "@/server/commercial/purchases";
import { rateLimit, requestAddress, secretHash } from "@/server/auth/security-events";

type WebhookDependencies = {
  launchGuard: () => unknown;
  applyRateLimit: (request: Request) => Promise<void>;
  verifyNotification: (request: Request) => Promise<VerifiedNotification>;
  processOrder: (eventKey: string, resourceId: string) => Promise<void>;
  log: (record: Record<string, unknown>) => void;
};

type BodyDiagnostics = {
  bodyParseStatus: "NOT_ATTEMPTED" | "PARSED" | "EMPTY" | "INVALID_JSON" | "TOO_LARGE" | "UNREADABLE";
  bodyDataIdPresent: boolean | null;
  type: string | null;
  action: string | null;
  liveMode: boolean | null;
};

const bodyNotInspected: BodyDiagnostics = {
  bodyParseStatus: "NOT_ATTEMPTED",
  bodyDataIdPresent: null,
  type: null,
  action: null,
  liveMode: null,
};

const defaultDependencies: WebhookDependencies = {
  launchGuard: commercialLaunchGuard,
  applyRateLimit: (request) => rateLimit("webhook", requestAddress(request), 600),
  verifyNotification: (request) => mercadoPago.verifyNotification(request),
  processOrder: processPaymentEvent,
  log: (record) => console.info(JSON.stringify(record)),
};

function safeLabel(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) || null : null;
}

async function inspectBodyForDiagnostics(request: Request): Promise<BodyDiagnostics> {
  const empty: Omit<BodyDiagnostics, "bodyParseStatus"> = {
    bodyDataIdPresent: null,
    type: null,
    action: null,
    liveMode: null,
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.clone().body?.getReader();
  } catch {
    return { ...empty, bodyParseStatus: "UNREADABLE" };
  }
  if (!reader) return { ...empty, bodyDataIdPresent: false, bodyParseStatus: "EMPTY" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        void reader.cancel().catch(() => undefined);
        return { ...empty, bodyParseStatus: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ...empty, bodyParseStatus: "UNREADABLE" };
  }
  if (size === 0) return { ...empty, bodyDataIdPresent: false, bodyParseStatus: "EMPTY" };

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ...empty, bodyParseStatus: "INVALID_JSON" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ...empty, bodyParseStatus: "INVALID_JSON" };
  }
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : null;
  return {
    bodyParseStatus: "PARSED",
    bodyDataIdPresent: Boolean(data && Object.prototype.hasOwnProperty.call(data, "id")),
    type: safeLabel(record.type),
    action: safeLabel(record.action),
    liveMode: typeof record.live_mode === "boolean" ? record.live_mode : null,
  };
}

function requestFacts(request: Request, body: BodyDiagnostics) {
  const requestId = request.headers.get("x-request-id");
  const signature = request.headers.get("x-signature");
  const queryDataId = new URL(request.url).searchParams.get("data.id");
  return {
    timestamp: new Date().toISOString(),
    requestCorrelationHash: requestId ? secretHash(requestId).slice(0, 16) : null,
    method: request.method,
    queryDataIdPresent: Boolean(queryDataId),
    ...body,
    xSignaturePresent: Boolean(signature),
    xRequestIdPresent: Boolean(requestId),
    signatureParseStatus: signatureParseStatus(signature),
  };
}

function diagnostic(
  request: Request,
  body: BodyDiagnostics,
  details: {
    signatureValidationResult: "PASS" | "FAIL" | "NOT_REACHED" | "UNKNOWN";
    classification: string;
    responseStatus: number;
    errorCode?: string;
  },
) {
  const facts = requestFacts(request, body);
  return {
    ...facts,
    signatureValidationResult: details.signatureValidationResult,
    eventClassification: details.classification,
    responseStatus: details.responseStatus,
    safeErrorCode: details.errorCode ?? null,
  };
}

function safeError(code: string, status: number) {
  return NextResponse.json({ received: false, error: code }, { status });
}

export async function handleMercadoPagoWebhook(request: Request, dependencies: WebhookDependencies = defaultDependencies) {
  try {
    dependencies.launchGuard();
  } catch {
    dependencies.log(diagnostic(request, bodyNotInspected, { signatureValidationResult: "NOT_REACHED", classification: "INVALID_CONFIGURATION", responseStatus: 503, errorCode: "INVALID_CONFIGURATION" }));
    return safeError("INVALID_CONFIGURATION", 503);
  }

  try {
    await dependencies.applyRateLimit(request);
  } catch {
    dependencies.log(diagnostic(request, bodyNotInspected, { signatureValidationResult: "NOT_REACHED", classification: "RATE_LIMITED", responseStatus: 429, errorCode: "RATE_LIMITED" }));
    return safeError("RATE_LIMITED", 429);
  }

  const bodyDiagnostics = await inspectBodyForDiagnostics(request);
  let event: VerifiedNotification;
  try {
    event = await dependencies.verifyNotification(request);
  } catch (error) {
    if (error instanceof MercadoPagoWebhookError) {
      const signatureFailure = error.httpStatus === 401;
      const queryDataIdPresent = Boolean(new URL(request.url).searchParams.get("data.id"));
      dependencies.log(diagnostic(request, bodyDiagnostics, {
        signatureValidationResult: signatureFailure ? "FAIL" : queryDataIdPresent ? "PASS" : "NOT_REACHED",
        classification: signatureFailure ? "AUTHENTICATION_FAILED" : "MALFORMED_REQUEST",
        responseStatus: error.httpStatus,
        errorCode: error.code,
      }));
      return safeError(error.code, error.httpStatus);
    }
    dependencies.log(diagnostic(request, bodyDiagnostics, { signatureValidationResult: "UNKNOWN", classification: "VERIFICATION_FAILURE", responseStatus: 500, errorCode: "WEBHOOK_VERIFICATION_FAILED" }));
    return safeError("WEBHOOK_VERIFICATION_FAILED", 500);
  }

  if (event.kind === "TEST") {
    dependencies.log(diagnostic(request, bodyDiagnostics, { signatureValidationResult: "PASS", classification: "VALID_TEST_NOTIFICATION", responseStatus: 200 }));
    return NextResponse.json({ received: true, classification: "test", ignored: true });
  }
  if (event.kind === "UNSUPPORTED") {
    dependencies.log(diagnostic(request, bodyDiagnostics, { signatureValidationResult: "PASS", classification: "VALID_UNSUPPORTED_NOTIFICATION", responseStatus: 200 }));
    return NextResponse.json({ received: true, classification: "unsupported", ignored: true });
  }

  try {
    await dependencies.processOrder(event.eventKey, event.resourceId);
    dependencies.log(diagnostic(request, bodyDiagnostics, { signatureValidationResult: "PASS", classification: "VALID_SUPPORTED_ORDER_NOTIFICATION", responseStatus: 200 }));
    return NextResponse.json({ received: true });
  } catch {
    dependencies.log(diagnostic(request, bodyDiagnostics, { signatureValidationResult: "PASS", classification: "ORDER_PROCESSING_TEMPORARY_FAILURE", responseStatus: 503, errorCode: "PAYMENT_PROCESSING_UNAVAILABLE" }));
    return safeError("PAYMENT_PROCESSING_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  return handleMercadoPagoWebhook(request);
}
