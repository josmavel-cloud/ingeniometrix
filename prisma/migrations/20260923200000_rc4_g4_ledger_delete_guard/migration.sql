-- Append-only includes deletion. Test fixtures use an isolated DBA role only.
CREATE TRIGGER commercial_ledger_no_delete BEFORE DELETE ON "CommercialLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION imx_commercial_immutable();
