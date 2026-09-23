import { prisma } from "@/lib/prisma";
import { seedCommercialCatalog, commercialLaunchGuard } from "@/server/commercial/catalog";
import { reconcileCommercialJobs } from "@/server/commercial/ledger";
import { reconcilePaymentEvents } from "@/server/commercial/purchases";

async function main() {
  // Local operator tool, not a public admin endpoint; no arbitrary credit grant.
  if (process.env.IMX_PAYMENT_MODE !== "sandbox") throw new Error("PUBLIC_COMMERCIAL_ADMIN_DISABLED_MFA_REQUIRED");
  if (process.argv[2] === "seed") { const offer = await seedCommercialCatalog(); console.log({ offer: offer.id, productionApproved: false }); }
  else if (process.argv[2] === "reconcile") {
    commercialLaunchGuard();
    console.log({ payments: await reconcilePaymentEvents(), jobs: await reconcileCommercialJobs() });
  } else throw new Error("Use seed or reconcile; never run against production during G4");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "COMMERCIAL_OPERATION_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
