# IMX-REPORT - Canonical Report Document Model

## Outcome

Added a renderer-neutral canonical report document model so future DOCX and LaTeX exports can be generated from the same semantic structure.

## Files Added

- `ai/schemas/canonical-report-document.schema.json`
- `server/reporting/canonical-report-types.ts`
- `server/reporting/canonical-report/build-canonical-report-from-synthetic.ts`
- `server/reporting/canonical-report/build-canonical-report-from-template-version.ts`
- `scripts/debug-canonical-report-document.ts`

## Design Decision

Do not make LaTeX the source of truth.

Instead:

- `TemplateVersion` defines the template and rules
- a synthetic or real content builder produces semantic content
- the canonical report document becomes the single renderer input
- DOCX and LaTeX renderers will each consume this same canonical object

## Model Coverage

The canonical model includes:

- derivation metadata
- institution metadata
- cover fields
- section tree
- paragraphs
- lists
- tables
- figures
- equations
- references
- annexes
- asset references

## Why This Matters

This is the point that reduces export drift:

- captions are represented once
- tables are represented once
- equations are represented once
- references are represented once

Format-specific renderers can now focus only on translation, not reconstruction.

## Validation

- `npm run typecheck`
