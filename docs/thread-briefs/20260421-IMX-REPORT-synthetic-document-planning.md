# IMX-REPORT - Synthetic Document Planning

## Goal

Define the next implementation stage after template extraction and persistence:

- load a `TemplateVersion` from the database
- generate a fully synthetic document for testing only
- use the template structure and element rules as the only requirements
- validate that the resulting document is renderable before connecting the real blueprint pipeline

## What Was Added

### Expanded template element rules

The template contracts now model richer export-facing rules for:

- equations
  - `numbering`
  - `alignment`
  - `reference_style`
- tables
  - `caption_position`
  - `numbering`
  - `allow_vertical_lines`
  - `source_note_required`
  - `note_position`
- figures
  - `caption_position`
  - `numbering`
  - `source_note_required`
  - `note_position`
- captions
  - `prefix_style`
  - `separator`
  - `font_style`
- citations
  - `numbering`
  - `inline_style`
- reference lists
  - `numbering`
  - `ordering`

These rules are now represented in:

- `template-candidate.schema.json`
- `template-source-semantic-analysis.schema.json`
- `template-source-conventional-fallbacks.schema.json`
- `template-ingestion-types.ts`

### Synthetic document contract

Added:

- `ai/schemas/synthetic-template-document.schema.json`
- `server/reporting/synthetic-document-types.ts`

This contract represents a synthetic test document with:

- cover fields
- section tree
- paragraphs
- lists
- synthetic tables
- synthetic figures
- synthetic equations
- synthetic references
- annexes
- explicit `for_testing_only` flags

## Recommended Implementation Order

1. `server/reporting/template-runtime/load-template-version.ts`
   - fetch `TemplateVersion`
   - reconstruct `TemplateCandidate`
   - expose a runtime-safe template object

2. `server/reporting/synthetic-document/generate-synthetic-caption.ts`
   - apply caption rules consistently

3. `server/reporting/synthetic-document/generate-synthetic-table.ts`
   - create stable placeholder rows and captions

4. `server/reporting/synthetic-document/generate-synthetic-figure.ts`
   - create figure placeholders with caption and note

5. `server/reporting/synthetic-document/generate-synthetic-equation.ts`
   - create a deterministic LaTeX-like placeholder equation using equation rules

6. `server/reporting/synthetic-document/generate-synthetic-references.ts`
   - create references flagged as synthetic only

7. `server/reporting/synthetic-document/generate-synthetic-content.ts`
   - walk the section tree
   - assign block types per section guidance
   - assemble the full `SyntheticTemplateDocument`

8. `server/reporting/synthetic-document/validate-synthetic-document.ts`
   - ensure required sections are present
   - ensure references/logo rules are satisfied
   - ensure content blocks match template constraints

9. `scripts/debug-template-synthetic-document.mjs`
   - generate local test output from a chosen `TemplateVersion`

## Scope Rules For This Stage

- no blueprint integration yet
- no user-facing generation yet
- no real references
- no thesis-completion behavior
- no PDF-focused layout tuning yet
- synthetic outputs must remain explicitly unusable as academic deliverables

## Success Criteria

This stage is complete when we can:

- load either PUCP or UPT template versions from the DB
- generate a synthetic document object from either one
- validate the result automatically
- confirm that captions, tables, figures, equations, citations, and references follow template rules
