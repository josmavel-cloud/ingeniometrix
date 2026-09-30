-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trainingConsent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "emailAtLinkTime" TEXT NOT NULL,
    "emailVerifiedAtLinkTime" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OidcTransaction" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "linkUserId" TEXT,
    "linkSessionHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OidcTransaction_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "ProductOffer" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "providerOrderId" TEXT,
    "checkoutUrl" TEXT,
    "providerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "grantKey" TEXT NOT NULL,
    "policy" JSONB NOT NULL,
    "grantedSlots" INTEGER NOT NULL,
    "reservedSlots" INTEGER NOT NULL DEFAULT 0,
    "consumedSlots" INTEGER NOT NULL DEFAULT 0,
    "grantedCredits" INTEGER NOT NULL,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "consumedCredits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialReservation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inputSnapshotId" TEXT,
    "policy" JSONB NOT NULL,
    "credits" INTEGER NOT NULL,
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "blueprintVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CommercialReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialLedgerEntry" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "jobId" TEXT,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "availableAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key" ON "AuthIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOffer_key_version_key" ON "ProductOffer"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_providerOrderId_key" ON "Purchase"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_userId_requestKey_key" ON "Purchase"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialEntitlement_purchaseId_key" ON "CommercialEntitlement"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialEntitlement_grantKey_key" ON "CommercialEntitlement"("grantKey");

-- CreateIndex
CREATE INDEX "CommercialEntitlement_userId_status_idx" ON "CommercialEntitlement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialReservation_jobId_key" ON "CommercialReservation"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialReservation_blueprintVersionId_key" ON "CommercialReservation"("blueprintVersionId");

-- CreateIndex
CREATE INDEX "CommercialReservation_status_idx" ON "CommercialReservation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialLedgerEntry_operationKey_key" ON "CommercialLedgerEntry"("operationKey");

-- CreateIndex
CREATE INDEX "CommercialLedgerEntry_userId_createdAt_idx" ON "CommercialLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_status_createdAt_idx" ON "PaymentEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialEntitlement" ADD CONSTRAINT "CommercialEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialEntitlement" ADD CONSTRAINT "CommercialEntitlement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialReservation" ADD CONSTRAINT "CommercialReservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BlueprintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialReservation" ADD CONSTRAINT "CommercialReservation_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "CommercialEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialLedgerEntry" ADD CONSTRAINT "CommercialLedgerEntry_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "CommercialEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialEntitlement" ADD CONSTRAINT "commercial_nonnegative" CHECK (
 "grantedSlots" >= 0 AND "reservedSlots" >= 0 AND "consumedSlots" >= 0 AND
 "grantedSlots" >= "reservedSlots" + "consumedSlots" AND
 "grantedCredits" >= 0 AND "reservedCredits" >= 0 AND "consumedCredits" >= 0 AND
 "grantedCredits" >= "reservedCredits" + "consumedCredits");
ALTER TABLE "CommercialReservation" ADD CONSTRAINT "commercial_credit_bounds" CHECK (
 "credits" > 0 AND "chargedCredits" >= 0 AND "chargedCredits" <= "credits");

CREATE FUNCTION imx_commercial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'CommercialLedgerEntry' THEN
   RAISE EXCEPTION 'Commercial ledger entries are immutable';
 ELSIF TG_TABLE_NAME = 'Purchase' AND (NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."userId" <> OLD."userId" OR NEW."offerId" <> OLD."offerId" OR NEW."termsVersion" <> OLD."termsVersion" OR NEW."privacyVersion" <> OLD."privacyVersion") THEN
   RAISE EXCEPTION 'Purchase policy is immutable';
 ELSIF TG_TABLE_NAME = 'CommercialEntitlement' AND (NEW."policy" IS DISTINCT FROM OLD."policy" OR NEW."grantedSlots" <> OLD."grantedSlots" OR NEW."grantedCredits" <> OLD."grantedCredits" OR NEW."userId" <> OLD."userId") THEN
   RAISE EXCEPTION 'Grant policy is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_ledger_immutable BEFORE UPDATE ON "CommercialLedgerEntry" FOR EACH ROW EXECUTE FUNCTION imx_commercial_immutable();
CREATE TRIGGER purchase_snapshot_immutable BEFORE UPDATE ON "Purchase" FOR EACH ROW EXECUTE FUNCTION imx_commercial_immutable();
CREATE TRIGGER entitlement_policy_immutable BEFORE UPDATE ON "CommercialEntitlement" FOR EACH ROW EXECUTE FUNCTION imx_commercial_immutable();
