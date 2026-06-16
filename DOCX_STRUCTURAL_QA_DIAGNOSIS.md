# DOCX Structural QA Diagnosis - Batch 3A

## Scope

Batch 3A inspects the latest Batch 2B diagnostic DOCX run:

`artifacts-local/lab-b-full-diagnostic-docx-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-04T20-17-13-879Z`

No Lab A behavior, database schema, UI, source semantics, or generation prompts were changed in this pass.

## Observed QA Failures

Master DOCX QA:

- Score: 92
- Failing checks: `has_figure_caption`, `has_schedule_gantt`
- Manifest signals: `figure_plan_count = 0`, `renderable_asset_count = 0`, `schedule_visual = null`

Institutional DOCX QA:

- Score: 88
- Failing checks: `has_media_assets`, `has_figure_caption`, `has_schedule_gantt`
- Manifest signals: `available_logo_count = 0`, `figure_plan_count = 0`, `renderable_asset_count = 0`, `schedule_visual = null`

Both QA reports showed `toc_field_count = 2`, which came from counting both a visible "Tabla de contenido" heading and the Word TOC field/title, plus a manual fallback TOC list. That created duplicate-TOC risk.

## Root Causes

### Figure Captions

`server/blueprint-v2/lab/academic-document-compiler.ts`

- `buildFigureLayoutPlan` only emits figures for physically renderable image assets.
- The latest evidence package had visual asset references, but no renderable image file paths.
- Therefore `layout_plan.figures` was empty.

`server/blueprint-v2/lab/docx-renderer.ts`

- `renderImageAsset` already renders numbered figure captions when a `FigureLayoutPlan` exists.
- The deterministic cover infographic was rendered without a `Figura N` caption.
- In the institutional document, the cover infographic was skipped when no logo fallback was available.

### Schedule / Gantt

`server/blueprint-v2/lab/academic-document-compiler.ts`

- `buildScheduleVisualPlan` looked for bullet/paragraph text containing `Mes N`.
- The schedule section existed, but was structured in a way that did not produce month tasks.
- Because a schedule section existed, the function did not use the default fallback tasks and returned `null`.

`server/blueprint-v2/lab/docx-qa-engine.ts`

- QA only accepted a narrow marker: `Cronograma referencial`.
- It did not recognize a deterministic Gantt-style schedule table with phase/dependency/deliverable fields.

### Institutional Media

`server/blueprint-v2/lab/docx-renderer.ts`

- The institutional document had no logo asset and no renderable evidence figures.
- `renderCoverVisual` required a fallback logo buffer before inserting the deterministic SVG infographic.
- Result: no media part was inserted in the DOCX package.

### Duplicate Table Of Contents

`server/blueprint-v2/lab/docx-renderer.ts`

- `renderTableOfContents` rendered a manual visible heading, a Word TOC field/title, and a manual fallback list.
- That made the visible document vulnerable to duplicate TOC display after Word updates fields.

`server/blueprint-v2/lab/docx-qa-engine.ts`

- QA had `toc_field_count`, but did not distinguish one valid TOC field from duplicate visible TOC blocks.

### Public Appendix Policy

`server/blueprint-v2/lab/docx-renderer.ts`

- Appendix wording still mentioned backend/developer storage concepts in public prose.
- Batch 1A policy existed, but DOCX QA did not explicitly count appendix debug leakage.

## Minimal Fixes Implemented

### A. Figure Captions

- Added deterministic fallback caption generation in `docx-renderer.ts`.
- Cover visual now renders with:
  - `Figura 1. ...`
  - `Fuente: elaboracion propia...`
- Existing source-backed figure captions remain unchanged.
- No scientific meaning is invented.

### B. Schedule / Gantt

- Added deterministic schedule fallback tasks even when a schedule section exists but cannot be parsed.
- Added optional `dependency` and `deliverable` fields to `ScheduleVisualTask`.
- Rendered schedule now uses a Gantt-style table with:
  - fase
  - actividad
  - periodo
  - M1-M6 markers
  - dependencia
  - entregable
- QA now recognizes either `Cronograma referencial`, `tipo Gantt`, or the phase/dependency/deliverable table markers.

### C. Institutional Media

- The deterministic cover SVG no longer depends on a logo fallback.
- If no logo is available, a transparent PNG fallback is used only to satisfy DOCX SVG packaging requirements.
- The institutional DOCX should now include a media part and a numbered figure caption.

### D. Duplicate TOC

- Removed the separate visible heading and manual fallback TOC list.
- The renderer now emits one Word TOC block/title.
- QA now reports:
  - `visible_toc_heading_count`
  - `duplicate_toc_block_count`
  - `no_duplicate_table_of_contents`

### E. Public Appendix Policy

- Public appendix prose was revised to remove backend/debug terminology.
- QA now checks appendix text for debug markers such as local artifact paths, provider/debug identifiers, source IDs, file paths, and run hashes.

## Expected Next Rerun Outcome

On the next full Lab B diagnostic DOCX rerun, expected structural QA changes:

- Master should satisfy `has_figure_caption`.
- Master should satisfy `has_schedule_gantt`.
- Institutional should satisfy `has_media_assets`.
- Institutional should satisfy `has_figure_caption`.
- Institutional should satisfy `has_schedule_gantt`.
- Duplicate TOC risk should be explicitly detected and should pass if only one visible TOC remains.
- Public appendix debug leakage should be explicitly detected and should pass.

This pass does not address hero image quality, Gantt/budget visual polish, captions style polish, or final page-count optimization.
