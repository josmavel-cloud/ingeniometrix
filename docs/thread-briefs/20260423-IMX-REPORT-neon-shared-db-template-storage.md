# 2026-04-23 - IMX-REPORT - Neon Shared DB Template Storage

## Summary

Reporting template persistence now uses the shared Neon PostgreSQL database for both:

- relational template metadata
- binary files associated with templates, including imported source documents and logo assets

This allows local development and Vercel deployments to use the same database-backed template storage without relying on machine-local asset paths.

## Changes

- Updated `prisma/schema.prisma` to store template source and asset binaries in `Bytes` columns.
- Switched local `.env` to the shared Neon `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
- Updated template ingestion persistence to save file bytes, hashes, names, and mime types into Neon.
- Updated template runtime loading to expose asset and source bytes as base64 payloads.
- Updated canonical report asset mapping to carry `content_base64`.
- Updated the DOCX renderer to prefer in-database base64 asset content over filesystem paths.
- Added `scripts/backfill-template-db-files.ts` to migrate existing filesystem-backed template assets and source files into Neon.

## Validation

- `prisma validate`
- `prisma db push`
- `npm run typecheck`
- backfill completed successfully for existing template sources and logo assets
- generated DOCX preview from a Neon-backed PUCP template and confirmed the canonical document includes a cover logo with `content_base64`

## Notes

- `artifacts-local/` is still used for debug outputs and generated preview bundles. This is intentional and separate from template-linked storage.
- Existing `storedFilePath` values are preserved for backward compatibility, but renderers now prefer database-backed bytes first.
