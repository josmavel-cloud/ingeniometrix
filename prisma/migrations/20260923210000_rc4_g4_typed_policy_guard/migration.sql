CREATE OR REPLACE FUNCTION imx_commercial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'CommercialLedgerEntry' THEN
   RAISE EXCEPTION 'Commercial ledger entries are immutable';
 ELSIF TG_TABLE_NAME = 'Purchase' THEN
   IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."userId" <> OLD."userId" OR NEW."offerId" <> OLD."offerId" OR NEW."termsVersion" <> OLD."termsVersion" OR NEW."privacyVersion" <> OLD."privacyVersion" THEN
     RAISE EXCEPTION 'Purchase policy is immutable';
   END IF;
 ELSIF TG_TABLE_NAME = 'CommercialEntitlement' THEN
   IF NEW."policy" IS DISTINCT FROM OLD."policy" OR NEW."grantedSlots" <> OLD."grantedSlots" OR NEW."grantedCredits" <> OLD."grantedCredits" OR NEW."userId" <> OLD."userId" THEN
     RAISE EXCEPTION 'Grant policy is immutable';
   END IF;
 END IF;
 RETURN NEW;
END $$;
