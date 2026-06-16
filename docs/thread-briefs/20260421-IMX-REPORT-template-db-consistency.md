# IMX-REPORT - Template DB Consistency

## Context

After importing real thesis-plan samples from PUCP and Universidad Privada de Tacna, the template ingestion pipeline already persisted:

- `Template`
- `TemplateVersion`
- `TemplateSource`
- `TemplateAsset`

The first implementation stored most useful query fields only inside JSON blobs.

## Decision

Project the most important template metadata into scalar Prisma columns while keeping the full JSON snapshots for traceability.

Added projections:

- `Template`
  - `universityName`
  - `schoolName`
  - `programName`
  - `mention`
  - `degreeLevel`
  - `disciplineArea`
  - `templateFamily`
- `TemplateVersion`
  - `documentKind`
  - `reviewStatus`
  - `templateFamily`
  - `templateKeyGuess`
  - `universityName`
  - `schoolName`
  - `programName`
  - `mention`
  - `degreeLevel`
  - `disciplineArea`

Also added:

- `TemplateReviewStatus` enum
- indexes for common filtering paths

## Why

This keeps Release 0 flexible while making template queries practical:

- filter by university and degree without parsing JSON
- list draft/reviewed templates quickly
- inspect template family and document kind directly
- preserve full extraction outputs for auditability

## Validation

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run db:push`
- `npm run typecheck`

Backfilled existing PUCP and UPT template rows after the schema change.
