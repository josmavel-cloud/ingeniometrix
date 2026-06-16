# IMX-REPORT: Professional DOCX Math And Compact 2DOF Example

## Summary

The reporting DOCX renderer now supports a higher-quality Word-native math path for selected equations and matrix-heavy examples.

## Key changes

- Added `OMML`-aware equation rendering support in:
  - `server/reporting/docx/omml-equation-builder.ts`
- Extended equation blocks with optional `omml_key` in:
  - `server/reporting/synthetic-document-types.ts`
  - `server/reporting/canonical-report-types.ts`
  - related JSON schemas
- Improved DOCX rendering for:
  - captions
  - table border hierarchy and header styling
  - paragraph spacing and indentation
  - section title numbering and spacing

## Why this direction

- Word uses `OMML` for professional equations.
- The overall architecture remains canonical-model-first, not LaTeX-first.
- For Release 0, this is a safer path than generating the entire document in LaTeX and converting it to DOCX.

## Example

Generated:

- `artifacts-local/upt-2dof-compact-example.docx`

Topic:

- compact synthetic thesis-plan example for a two-degree-of-freedom structural dynamics system with matrix equations

Bundle:

- `artifacts-local/upt-2dof-compact-example.bundle/`

Quick QA:

- no raw LaTeX tokens in `word/document.xml`
- OMML math present
- OMML matrix tags present
