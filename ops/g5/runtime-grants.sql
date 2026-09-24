REVOKE ALL ON TABLE "_prisma_migrations" FROM imx_app, imx_worker;
REVOKE UPDATE, DELETE ON TABLE "CommercialLedgerEntry" FROM imx_app, imx_worker;
-- Immutable ledger triggers remain in force as a second independent control.
