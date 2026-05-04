# IMX-REPORT - Synthetic Document Runtime

## Outcome

Implemented the first runnable backend slice for synthetic template-driven documents:

- load a persisted `TemplateVersion` from the database
- reconstruct the runtime-safe template object
- generate a deterministic synthetic document
- validate the output structurally

## Added Files

- `server/reporting/template-runtime/load-template-version.ts`
- `server/reporting/synthetic-document/build-synthetic-document-from-template-version.ts`
- `server/reporting/synthetic-document/generate-synthetic-caption.ts`
- `server/reporting/synthetic-document/generate-synthetic-content.ts`
- `server/reporting/synthetic-document/generate-synthetic-equation.ts`
- `server/reporting/synthetic-document/generate-synthetic-figure.ts`
- `server/reporting/synthetic-document/generate-synthetic-references.ts`
- `server/reporting/synthetic-document/generate-synthetic-table.ts`
- `server/reporting/synthetic-document/validate-synthetic-document.ts`
- `scripts/debug-template-synthetic-document.ts`

## Current Behavior

The runtime currently:

- supports loading by `templateVersionId` or latest version by `templateKey`
- generates synthetic cover fields from the template
- generates synthetic sections recursively
- generates placeholder tables, figures, equations, references, and annex content
- respects the richer template rules for:
  - captions
  - equation alignment/numbering/reference style
  - table notes and numbering
  - figure notes and numbering
  - citation inline style
  - reference ordering

## Limits

- the output is intentionally synthetic and non-academic
- section-specific block composition is still heuristic
- synthetic content is deterministic but still generic
- no renderer integration yet

## Validation

- `npm run typecheck`
