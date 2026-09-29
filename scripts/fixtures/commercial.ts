import { prisma } from "@/lib/prisma";
import { STARTER_OFFER } from "@/server/commercial/catalog";
import { grantEntitlement } from "@/server/commercial/ledger";

function isolated() {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55440" || !url.pathname.startsWith("/imx_b4_validation")) throw new Error("Isolated validation DB required");
}
export async function grantTestPackage(userId: string, slots = 5) {
  isolated();
  return prisma.$transaction((tx) => grantEntitlement(tx, { userId, grantKey: `offline-fixture:${userId}`, policy: { ...STARTER_OFFER, planSlots: slots, computeCredits: slots * 2000 }, reason: "OFFLINE_FIXTURE_NOT_A_PAYMENT" }));
}
export async function removeTestCommercialData(userIds: string[]) {
  isolated();
  await prisma.$transaction(async (tx) => {
    // Test-only DBA cleanup of our exact fixture users, never an application API.
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.commercialLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = origin");
    await tx.commercialReservation.deleteMany({ where: { userId: { in: userIds } } });
    await tx.commercialEntitlement.deleteMany({ where: { userId: { in: userIds } } });
    await tx.purchase.deleteMany({ where: { userId: { in: userIds } } });
    await tx.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
  });
}
