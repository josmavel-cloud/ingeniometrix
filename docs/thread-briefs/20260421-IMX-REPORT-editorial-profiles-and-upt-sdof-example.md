# IMX-REPORT: Editorial Profiles And UPT SDOF Example

## What changed

Reporting now resolves explicit editorial rules plus fallback editorial profiles before synthetic generation and rendering.

Added:

- `server/reporting/template-runtime/editorial-profiles.ts`
- effective editorial rules on `load-template-version.ts`
- richer rule fields for page, titles, paragraph, equations, tables, figures, captions, and references
- synthetic generation that cites inserted figures/tables/equations and injects a fallback references section when needed
- DOCX renderer support for:
  - paragraph alignment, indentation, and spacing
  - title spacing by level
  - section title numbering
  - figure image embedding from canonical assets

## Profiles

Implemented fallback profiles:

- `PE_THESIS_DEFAULT`
- `ENGINEERING_RESEARCH_DEFAULT`

These are used when template extraction does not provide enough explicit editorial structure.

## Example artifact

Generated a full UPT synthetic thesis-plan example around:

- deduction of displacement, velocity, and acceleration response equations for a single-degree-of-freedom system in Structural Dynamics

Main output:

- `artifacts-local/upt-sdof-thesis-plan-example.docx`

Bundle:

- `artifacts-local/upt-sdof-thesis-plan-example.bundle/`

Includes:

- canonical JSON
- embedded synthetic figure assets
- summary JSON

## Verification

Ran:

- `npm run typecheck`
- DOCX QA check to verify no raw LaTeX tokens remained in `word/document.xml`

Observed output stats for the UPT example:

- approx words: `9650`
- paragraphs: `154`
- tables: `7`
- equations: `5`
- figures: `4`
- embedded media files: `4`
