import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const offerSchema = z.object({
  key: z.string(), version: z.number().int().positive(), displayName: z.string(),
  priceMinor: z.number().int().positive(), currency: z.literal("PEN"),
  planSlots: z.number().int().positive(), computeCredits: z.number().int().positive(),
  creditUsdMicros: z.number().int().positive(), maxCreditsPerPlan: z.number().int().positive(),
  hardCapUsdMicros: z.number().int().positive(), recurring: z.literal(false), expiration: z.null(),
  termsVersion: z.string(), privacyVersion: z.string(), policyVersion: z.string(), productionApproved: z.literal(false),
});
export type Offer = z.infer<typeof offerSchema>;
export const STARTER_OFFER: Offer = {
  key: "starter_5_plans", version: 1, displayName: "Paquete Inicial Ingeniometrix",
  priceMinor: 9900, currency: "PEN", planSlots: 5, computeCredits: 10000,
  creditUsdMicros: 1000, maxCreditsPerPlan: 2000, hardCapUsdMicros: 2000000,
  recurring: false, expiration: null, termsVersion: "pilot-sandbox-v1", privacyVersion: "pilot-sandbox-v1",
  policyVersion: "commercial-v1", productionApproved: false,
};
export async function seedCommercialCatalog() {
  return prisma.productOffer.upsert({ where: { key_version: { key: STARTER_OFFER.key, version: STARTER_OFFER.version } },
    create: { id: `${STARTER_OFFER.key}:v${STARTER_OFFER.version}`, key: STARTER_OFFER.key, version: STARTER_OFFER.version, snapshot: STARTER_OFFER }, update: {} });
}
export async function currentOffer() {
  const row = await prisma.productOffer.findFirst({ where: { key: STARTER_OFFER.key, active: true }, orderBy: { version: "desc" } });
  if (!row) throw new Error("CATALOG_UNAVAILABLE");
  return { row, policy: offerSchema.parse(row.snapshot) };
}
export function commercialLaunchGuard() {
  if (process.env.IMX_PAYMENT_MODE !== "sandbox") throw new Error("REAL_PAYMENTS_DISABLED");
  if (process.env.IMX_PAYMENT_ACCOUNT_CONTEXT !== "test_user") throw new Error("TEST_MERCHANT_REQUIRED");
  for (const key of ["MP_TEST_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "MP_TEST_MERCHANT_ID", "MP_APPLICATION_ID", "APP_ORIGIN"]) {
    if (!process.env[key]?.trim()) throw new Error("SANDBOX_CONFIGURATION_MISSING");
  }
  const origin = new URL(process.env.APP_ORIGIN!);
  if (origin.protocol !== "https:" || origin.origin !== process.env.APP_ORIGIN) throw new Error("SANDBOX_HTTPS_ORIGIN_REQUIRED");
  return { origin: origin.origin, merchantId: process.env.MP_TEST_MERCHANT_ID!, applicationId: process.env.MP_APPLICATION_ID! };
}
