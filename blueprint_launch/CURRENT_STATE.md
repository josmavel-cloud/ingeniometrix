# Blueprint Launch Current State

Freeze date: 2026-05-03

This document freezes the current working version of the isolated `blueprint_launch`
lab before refactoring. It describes behavior as it exists now; it is not a
refactor plan.

## What This Module Does

`blueprint_launch` is an isolated local lab for the first half of the
Ingeniometrix research-assistance pipeline. It takes a structured academic
intake, searches and selects academic sources, resolves public full-text access,
materializes PDFs or web text locally, extracts text/assets/signals, and
consolidates evidence into a handoff package for downstream labs.

The current lab covers steps 1 through 6:

- Step 1: intake capture, Spanish normalization, canonical topic, problem core,
  method preference, scope, and retrieval brief generation.
- Step 2: source access resolution for selected references, including PDFs,
  DOI redirects, repositories, DSpace, Figshare, landing pages, and ambiguous
  download links.
- Step 3: evidence and materialization planning by source and thesis section.
- Step 4: deterministic content materialization, mainly PDF download or HTML/text
  capture.
- Step 5: first LLM-assisted source signal extraction, while preserving original
  text, chunks, hashes, pages, assets, tables, images, and equations.
- Step 6: consolidated evidence package with normalized evidence units, section
  dossiers, methodology/framework candidates, asset usage plan, gap plan, quality
  gate, context-preservation contract, and downstream handoff manifest.

The current frozen run has:

- 6 selected sources.
- 2,397,328 extracted text characters.
- 1,952 preserved chunks.
- 84 Step 5 snippets.
- 34 Step 5 assets.
- 155 consolidated evidence units.
- 84 direct quote evidence units.
- 34 asset reference evidence units.
- 11 section dossiers.
- `quality_gate.status = warn`.
- `quality_comparison.status = warn`.

## Main Files And Entry Points

### UI Pages

- `app/blueprint-launch/page.tsx`
- `app/blueprint-launch/step-1/page.tsx`
- `app/blueprint-launch/step-2/page.tsx`
- `app/blueprint-launch/step-3/page.tsx`
- `app/blueprint-launch/step-4/page.tsx`
- `app/blueprint-launch/step-5/page.tsx`
- `app/blueprint-launch/step-6/page.tsx`

The isolated implementation behind those routes lives in:

- `blueprint_launch/app/blueprint-launch-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-1-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-2-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-3-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-4-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-5-page.tsx`
- `blueprint_launch/app/blueprint-launch-step-6-page.tsx`

### API Routes

- `app/api/blueprint-launch/intake/route.ts`
- `app/api/blueprint-launch/search/route.ts`
- `app/api/blueprint-launch/references/route.ts`
- `app/api/blueprint-launch/step-2/route.ts`
- `app/api/blueprint-launch/step-3/route.ts`
- `app/api/blueprint-launch/step-4/route.ts`
- `app/api/blueprint-launch/step-5/route.ts`
- `app/api/blueprint-launch/step-6/route.ts`
- `app/api/blueprint-launch/assets/route.ts`
- `app/api/blueprint-launch/master-template/docx/route.ts`

### Server Orchestration

- `blueprint_launch/server/local-playground-store.ts`
- `blueprint_launch/server/step1-intake-context.ts`
- `blueprint_launch/server/local-reference-search.ts`
- `blueprint_launch/server/source-access-resolution.ts`
- `blueprint_launch/server/source-access-patterns.ts`
- `blueprint_launch/server/source-intake-gate.ts`
- `blueprint_launch/server/source-evidence-planning.ts`
- `blueprint_launch/server/source-content-materialization.ts`
- `blueprint_launch/server/source-signal-extraction.ts`
- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/debug-run-store.ts`
- `blueprint_launch/server/selected-source-bundle.ts`

### PDF Runtime

- `blueprint_launch/server/pdf_extract_runtime.py`

This script uses Python to extract PDF text and visual assets. It currently
imports `pypdf` and `PIL`.

### UI Components

- `blueprint_launch/components/blueprint-launch-playground.tsx`
- `blueprint_launch/components/blueprint-launch-reference-search.tsx`
- `blueprint_launch/components/step-1/blueprint-launch-step-1.tsx`
- `blueprint_launch/components/step-2/blueprint-launch-step-2.tsx`
- `blueprint_launch/components/step-3/blueprint-launch-step-3.tsx`
- `blueprint_launch/components/step-4/blueprint-launch-step-4.tsx`
- `blueprint_launch/components/step-5/blueprint-launch-step-5.tsx`
- `blueprint_launch/components/step-6/blueprint-launch-step-6.tsx`

### Local Runner And Smoke Test

- `scripts/run-blueprint-launch-steps-1-6.ts`
- `scripts/smoke-blueprint-launch-current-state.mjs`

## Inputs Expected

The module expects:

- A structured intake compatible with `IntakeInput`.
- Optional knowledge area label; current frozen lab uses `Arquitectura`.
- Search results from OpenAlex and fallback enrichment from Crossref.
- User-selected references stored in the local lab state.
- Resolved full-text URLs from OpenAlex metadata, DOI redirects, repository pages,
  DSpace APIs, Figshare APIs, HTML links, or direct PDF links.
- Local `.env` values for LLM-backed paths when LLM execution is desired.
- Python runtime with PDF extraction dependencies for Step 5 PDF processing.

The current frozen state is stored at:

- `artifacts-local/blueprint_launch/lab-state.json`

Important current artifact paths:

- Step 5 run directory:
  `artifacts-local/blueprint_launch/extracted_assets/run-2026-05-01T16-23-06-878Z`
- Step 6 consolidated artifact:
  `artifacts-local/blueprint_launch/consolidated_evidence/run-2026-05-01T16-45-16-616Z/consolidated-evidence.json`
- Step 6 latest artifact:
  `artifacts-local/blueprint_launch/consolidated_evidence/latest-consolidated-evidence.json`
- Step 4 materialized content:
  `artifacts-local/blueprint_launch/materialized_content/run-2026-05-01T16-22-56-812Z`

## Outputs Produced

The lab writes local outputs under `artifacts-local/blueprint_launch`.

Primary outputs:

- `lab-state.json`: current local state snapshot for the lab.
- `selected_sources/*.json`: selected source bundle manifests.
- `materialized_content/run-*/manifest.json`: downloaded/captured source content.
- `extracted_assets/run-*`: extracted source text, chunks, images, tables, and
  equations.
- `consolidated_evidence/run-*/consolidated-evidence.json`: Step 6 handoff
  artifact.
- `consolidated_evidence/latest-consolidated-evidence.json`: latest Step 6
  handoff artifact.
- `debug_runs/*.json`: debug snapshots for UI inspection.

The Step 6 artifact includes:

- `coverage_map`
- `source_priorities`
- `evidence_units`
- `section_dossiers`
- `methodology_decision_packet`
- `framework_decision_packet`
- `asset_usage_plan`
- `gap_resolution_plan`
- `downstream_handoff_manifest`
- `quality_gate`
- `context_preservation_contract`
- `quality_comparison`
- `llm_prompts`

## External APIs Used

The module may call:

- OpenAlex API through `server/retrieval/openalex-client`.
- Crossref API through `server/retrieval/crossref-client`.
- DOI redirects through `https://doi.org/...`.
- OpenAI Responses API through `llm/providers/openai.ts`.
- Public publisher/repository URLs for PDFs and web full text.
- DSpace REST endpoints discovered from repository URLs.
- Figshare API endpoints discovered from article/file metadata.
- Handle resolver endpoints for some repository records.

The smoke test added for this freeze does not call external APIs.

## Environment Variables Required

For deterministic artifact validation only:

- No environment variables are required by the smoke test.

For LLM-backed execution:

- `OPENAI_API_KEY`: required when `LLM_PROVIDER` is `openai`.
- `LLM_PROVIDER`: optional, defaults to `openai`.
- `LLM_DEFAULT_MODEL`: optional, defaults in this lab to `gpt-5.4`.
- `LLM_REQUEST_TIMEOUT_MS`: optional OpenAI request timeout.
- `LLM_REQUEST_MAX_RETRIES`: optional OpenAI retry count.

Runtime assumptions:

- Node.js 20.x, matching `package.json`.
- Python available as either the bundled Codex runtime Python or `python` on PATH.
- Python packages needed by `pdf_extract_runtime.py`: `pypdf` and `PIL`/Pillow.

No OpenAlex or Crossref API key is currently required by this module.

## Known Bugs Or Fragile Areas

- The lab is intentionally isolated and local. It is not yet the Release 0
  production path.
- `artifacts-local` is mutable local state. A rerun can overwrite `latest-*`
  manifests and change what the UI loads.
- Source search can return a different set of references over time. The runner
  has logic to preserve historical selected sources for comparable reruns, but
  this remains fragile.
- Step 2 source access depends on public web pages that can change, block, return
  403, or alter HTML structure.
- DSpace/Figshare/repository heuristics are good enough for this frozen run but
  still heuristic.
- Step 5 PDF extraction depends on Python and local PDF parsing libraries.
- Asset cropping is heuristic. Some images/tables may include too much page
  context or need human review before final document rendering.
- Step 5 and Step 6 prompts can be large. The current strategy preserves corpus
  losslessly and only compacts prompts.
- The current Step 6 quality comparison is `warn` because `future_work` has one
  fewer direct quote in the dossier than the earlier baseline. The full corpus is
  still preserved.
- `evaluation_criteria` and `case_context` need careful downstream handling:
  assets/signals exist, but not every point is directly citable text.
- Missing `OPENAI_API_KEY` triggers fallback/skipped LLM behavior in several
  steps. This is expected but can reduce semantic richness.

## Smoke Test

Run from the repository root:

```powershell
node scripts/smoke-blueprint-launch-current-state.mjs
```

The smoke test is read-only. It validates that the current frozen local state and
artifact graph are still loadable and internally consistent. It does not call
OpenAI, OpenAlex, Crossref, repository URLs, or any Next.js API route.
