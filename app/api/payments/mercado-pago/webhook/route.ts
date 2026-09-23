import { NextResponse } from "next/server";
import { commercialLaunchGuard } from "@/server/commercial/catalog";
import { mercadoPago } from "@/server/commercial/mercado-pago";
import { processPaymentEvent } from "@/server/commercial/purchases";
import { rateLimit, requestAddress } from "@/server/auth/security-events";
export async function POST(request: Request) {
  try { commercialLaunchGuard(); } catch { return new NextResponse(null, { status: 503 }); }
  let event;
  try { await rateLimit("webhook", requestAddress(request), 600); event = await mercadoPago.verifyNotification(request); }
  catch { return new NextResponse(null, { status: 401 }); }
  try { await processPaymentEvent(event.eventKey, event.resourceId); return NextResponse.json({ received: true }); }
  catch { return new NextResponse(null, { status: 503 }); } // provider retries; persisted event is reconcilable
}
