import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/security-events";
import { commercialLaunchGuard, currentOffer } from "@/server/commercial/catalog";
import { customerBalance } from "@/server/commercial/ledger";
import { limitedJson } from "@/server/commercial/mercado-pago";
import { createPurchase, purchaseForUser } from "@/server/commercial/purchases";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const purchases = await prisma.purchase.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true } });
  let offer = null, checkoutAvailable = false;
  try { const current = await currentOffer(); offer = { id: current.row.id, ...current.policy }; commercialLaunchGuard(); checkoutAvailable = true; } catch { /* absent configuration is explicit */ }
  return NextResponse.json({ balance: await customerBalance(user.id), offer: offer && { id: offer.id, displayName: offer.displayName, priceMinor: offer.priceMinor, currency: offer.currency, planSlots: offer.planSlots, termsVersion: offer.termsVersion, privacyVersion: offer.privacyVersion }, checkoutAvailable, mode: "sandbox", trainingConsent: user.trainingConsent,
    purchases: await Promise.all(purchases.map((p) => purchaseForUser(user.id, p.id))) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  try {
    await rateLimit("checkout", user.id, 10);
    const body = z.object({ offerId: z.string(), requestKey: z.string(), termsVersion: z.string(), privacyVersion: z.string(), acceptTerms: z.literal(true), acknowledgePrivacy: z.literal(true) }).strict().parse(await limitedJson(request));
    return NextResponse.json(await createPurchase(user.id, body.requestKey, body.offerId, body));
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el pago de prueba. Puedes reintentar la misma solicitud; no se concedió un paquete nuevo." }, { status: 409 });
  }
}
