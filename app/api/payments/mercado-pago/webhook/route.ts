import { NextResponse } from "next/server";
import { commercialLaunchGuard } from "@/server/commercial/catalog";
import { MercadoPagoWebhookError, mercadoPago, signatureComponentPresence, signatureParseStatus } from "@/server/commercial/mercado-pago";
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

const defaultDependencies: WebhookDependencies = {
  launchGuard: commercialLaunchGuard,
  applyRateLimit: (request) => rateLimit("webhook", requestAddress(request), 600),
  verifyNotification: (request) => mercadoPago.verifyNotification(request),
  processOrder: processPaymentEvent,
  log: (record) => console.info(JSON.stringify(record)),
};

function requestFacts(request: Request) {
  const requestId = request.headers.get("x-request-id");
  const signature = request.headers.get("x-signature");
  const components = signatureComponentPresence(signature);
  const queryDataId = new URL(request.url).searchParams.get("data.id");
  return {
    timestamp: new Date().toISOString(),
    requestCorrelationId: requestId ? secretHash(requestId).slice(0, 16) : null,
    eventType: null as string | null,
    action: null as string | null,
    liveMode: null as boolean | null,
    queryDataIdPresent: Boolean(queryDataId),
    queryDataIdCase: queryDataId ? (/^[0-9]+$/.test(queryDataId) ? "NUMERIC" : queryDataId === queryDataId.toUpperCase() ? "UPPERCASE" : queryDataId === queryDataId.toLowerCase() ? "LOWERCASE" : "MIXED") : null,
    signaturePresent: Boolean(signature),
    requestIdPresent: Boolean(requestId),
    signatureParseStatus: signatureParseStatus(signature),
    signatureTimestampPresent: components.timestampPresent,
    signatureV1Present: components.v1Present,
  };
}

function diagnostic(
  request: Request,
  details: {
    signatureValidation: "PASS" | "FAIL" | "NOT_REACHED";
    classification: string;
    responseStatus: number;
    commercialMutationResult: "NONE" | "ORDER_PROCESSED" | "ORDER_PROCESSING_FAILED";
    event?: VerifiedNotification;
    errorCode?: string;
  },
) {
  const facts = requestFacts(request);
  if (details.event) {
    facts.eventType = details.event.eventType;
    facts.action = details.event.action;
    facts.liveMode = details.event.liveMode;
  }
  return {
    scope: "mercado_pago_webhook",
    ...facts,
    signatureValidation: details.signatureValidation,
    classification: details.classification,
    responseStatus: details.responseStatus,
    commercialMutationResult: details.commercialMutationResult,
    errorCode: details.errorCode ?? null,
  };
}

function safeError(code: string, status: number) {
  return NextResponse.json({ received: false, error: code }, { status });
}

export async function handleMercadoPagoWebhook(request: Request, dependencies: WebhookDependencies = defaultDependencies) {
  try {
    dependencies.launchGuard();
  } catch {
    dependencies.log(diagnostic(request, { signatureValidation: "NOT_REACHED", classification: "INVALID_CONFIGURATION", responseStatus: 503, commercialMutationResult: "NONE", errorCode: "INVALID_CONFIGURATION" }));
    return safeError("INVALID_CONFIGURATION", 503);
  }

  try {
    await dependencies.applyRateLimit(request);
  } catch {
    dependencies.log(diagnostic(request, { signatureValidation: "NOT_REACHED", classification: "RATE_LIMITED", responseStatus: 429, commercialMutationResult: "NONE", errorCode: "RATE_LIMITED" }));
    return safeError("RATE_LIMITED", 429);
  }

  let event: VerifiedNotification;
  try {
    event = await dependencies.verifyNotification(request);
  } catch (error) {
    if (error instanceof MercadoPagoWebhookError) {
      const signatureFailure = error.httpStatus === 401;
      dependencies.log(diagnostic(request, {
        signatureValidation: signatureFailure ? "FAIL" : "PASS",
        classification: signatureFailure ? "AUTHENTICATION_FAILED" : "MALFORMED_REQUEST",
        responseStatus: error.httpStatus,
        commercialMutationResult: "NONE",
        errorCode: error.code,
      }));
      return safeError(error.code, error.httpStatus);
    }
    dependencies.log(diagnostic(request, { signatureValidation: "NOT_REACHED", classification: "VERIFICATION_FAILURE", responseStatus: 500, commercialMutationResult: "NONE", errorCode: "WEBHOOK_VERIFICATION_FAILED" }));
    return safeError("WEBHOOK_VERIFICATION_FAILED", 500);
  }

  if (event.kind === "TEST") {
    dependencies.log(diagnostic(request, { signatureValidation: "PASS", classification: "VALID_TEST_NOTIFICATION", responseStatus: 200, commercialMutationResult: "NONE", event }));
    return NextResponse.json({ received: true, classification: "test", ignored: true });
  }
  if (event.kind === "UNSUPPORTED") {
    dependencies.log(diagnostic(request, { signatureValidation: "PASS", classification: "VALID_UNSUPPORTED_NOTIFICATION", responseStatus: 200, commercialMutationResult: "NONE", event }));
    return NextResponse.json({ received: true, classification: "unsupported", ignored: true });
  }

  try {
    await dependencies.processOrder(event.eventKey, event.resourceId);
    dependencies.log(diagnostic(request, { signatureValidation: "PASS", classification: "VALID_SUPPORTED_ORDER_NOTIFICATION", responseStatus: 200, commercialMutationResult: "ORDER_PROCESSED", event }));
    return NextResponse.json({ received: true });
  } catch {
    dependencies.log(diagnostic(request, { signatureValidation: "PASS", classification: "ORDER_PROCESSING_TEMPORARY_FAILURE", responseStatus: 503, commercialMutationResult: "ORDER_PROCESSING_FAILED", event, errorCode: "PAYMENT_PROCESSING_UNAVAILABLE" }));
    return safeError("PAYMENT_PROCESSING_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  return handleMercadoPagoWebhook(request);
}
