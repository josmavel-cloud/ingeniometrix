# IMX-REPORT - DOCX Renderer From Canonical Model

## Outcome

Implemented the first real DOCX renderer for thesis-plan documents using the canonical report document as input.

## Added

- `server/reporting/docx/render-canonical-report-docx.ts`
- `scripts/debug-canonical-report-docx.ts`

## Architecture Alignment

This renderer consumes the canonical report document instead of LaTeX or a template-specific intermediate.

That preserves the reporting direction already chosen:

- canonical semantic model first
- format-specific renderers second
- no LaTeX-first dependency for DOCX generation

## Current Coverage

The DOCX renderer now supports:

- cover with optional institutional logo
- centered front matter fields
- recursive section headings
- paragraphs
- bullet lists
- numbered lists
- tables
- figure placeholders
- equation placeholders
- reference lists
- annexes

It also applies canonical presentation rules for:

- page margins
- paragraph font and spacing
- title casing/heading levels
- caption placement and note placement
- table vertical line behavior

## Limits

- equation rendering is still placeholder text, not native Office math
- figures are placeholders, not real image assets yet
- no renderer QA pass against real university templates yet

## Validation

- `npm run typecheck`
- installed `docx` package for renderer generation
