# Full Pipeline Remediation Roadmap

Date: 2026-05-04

Scope: first full diagnostic pipeline run from intake/source selection through Evidence Engine, Blueprint Engine, and both DOCX outputs for `case-001-seismic-isolators-peruvian-buildings`.

This roadmap is planning only. It does not implement fixes, rerun the pipeline, delete artifacts, optimize, or refactor.

## Runs Inspected

- Lab A selected-source run:
  `artifacts-local/evidence-selected-source-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-04T13-20-37-881Z`
- Lab B full diagnostic DOCX run:
  `artifacts-local/lab-b-full-diagnostic-docx-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-04T14-05-30-818Z`

## Executive Summary

The diagnostic pipeline proved that Ingeniometrix can carry a real EvidenceEngineHandoffV1 through Lab B and produce both DOCX outputs. That is valuable for integration confidence, but the run is not production safe.

The main problem is not structural compatibility. The contracts validate and Lab B can ingest the handoff. The main problem is semantic eligibility: the upstream evidence set was degraded, Step 3 was blocked, only part of the selected source set materialized, citation support is partially inflated by metadata-like snippets, and Lab B still proceeded to full generation in diagnostic mode.

The first implementation batch should focus on production gates, source health, citation semantics, and warning propagation. Broader cleanup, prompt optimization, OCR, PDF robustness, and performance work should wait until correctness gates are stable.

## Evidence Snapshot

Lab A run facts:

- Selected sources: 4
- Materialized sources: 2
- Extracted text chars: 206430
- Evidence units: 70
- Direct quote count reported: 38
- Asset references: 9
- Step 2 source intake gate: `PASS_WITH_WARNINGS`
- Step 3 evidence planning gate: `BLOCK`
- Final quality gate: `warn`
- Final readiness: `alta`
- Run mode: `allow_blocked: true`, `production_valid: false`
- Warnings: 26

Lab A source health:

- `10.15446/dyna.v85n207.72296`: metadata/abstract-only, no complete public content.
- `10.19083/tesis/655017`: complete public PDF, materialized.
- `10.56048/mqr20225.7.2.2023.1062-1085`: unresolved, provider/landing access issue.
- `https://openalex.org/W4385863689`: complete public PDF, materialized, adjacent energy-dissipator evidence rather than direct isolated-building evidence.

Lab B run facts:

- Completed diagnostic steps: 7, 8, 9, 10, 11, 12, 13
- Generated DOCX files: 2
- Section count: 38
- Consistency matrix status: `blocked`
- Lab B validation: passed, score 8.5
- Package quality score: 83.39
- Traceability score: 53.33
- Warnings: 61
- Master DOCX QA: failed, score 92, missing figure caption and schedule Gantt.
- Institutional DOCX QA: failed, score 88, missing media assets, figure caption, and schedule Gantt.
- OpenAI usage: 59 calls, 198863 total tokens, estimated USD 0.572753.

## 1. Critical Correctness / Production Safety

### Issue 1.1 - Production path must not continue after upstream BLOCK

- Observed evidence: The diagnostic Lab A run continued through Steps 4-6 with `allow_blocked: true` even though Step 3 evidence planning returned `BLOCK`. This was intentional for diagnostics, but production must not permit it.
- Affected files/functions:
  - `scripts/run-evidence-selected-sources-steps-2-6.ts`
  - `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
  - `server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter.ts`
  - future production orchestration around Evidence Engine to Blueprint Engine handoff
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Keep the experimental `--allow-blocked` behavior, but add an explicit production eligibility gate that refuses handoffs marked blocked, diagnostic-only, or `production_valid: false`. The compatibility adapter can still report structural compatibility, but a separate production gate should prevent generation.
- Suggested test: Fixture handoff with Step 3 `BLOCK` validates structurally but fails production eligibility with a clear blocker.
- Risk of changing it: Low if implemented as a new gate. Medium if mixed into existing compatibility checks, because diagnostics still need to run.

### Issue 1.2 - Structural compatibility is being treated too close to production readiness

- Observed evidence: Lab B compatibility inspection allowed the handoff to proceed because required fields and counts were present. The run later generated both DOCX outputs despite degraded source health and a blocked matrix.
- Affected files/functions:
  - `server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter.ts`
  - `scripts/run-lab-b-diagnostic-ingestion.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Split reports into `schema_compatible`, `diagnostic_compatible`, and `production_eligible`. Keep `can_proceed` for diagnostics only or rename it in reports to avoid ambiguity.
- Suggested test: A degraded but valid handoff should return `schema_compatible: true`, `diagnostic_compatible: true`, and `production_eligible: false`.
- Risk of changing it: Low. Main risk is updating scripts and reports that currently read `can_proceed`.

### Issue 1.3 - Step 6 readiness can be optimistic despite upstream source gates

- Observed evidence: Step 6 reported readiness `alta` while Step 3 was `BLOCK`, only 2 of 4 sources materialized, one source was unresolved, and one source was metadata-only.
- Affected files/functions:
  - `blueprint_launch/server/consolidated-evidence.ts`
  - `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
  - EvidenceEngineHandoffV1 traceability/quality fields
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Add source-health and upstream-gate downgrades to readiness. If any upstream gate blocks, the handoff should carry that block and production readiness should not be `alta`.
- Suggested test: Consolidation fixture with enough section packets but upstream `BLOCK` must produce non-production readiness and a quality blocker.
- Risk of changing it: Medium. Readiness may be consumed by several reports, so preserve the old coverage readiness as a separate diagnostic field if needed.

### Issue 1.4 - Lab B continued after a blocked consistency matrix

- Observed evidence: Lab B consistency matrix status was `blocked` with `can_continue_step_11: false`, but the diagnostic runner completed Steps 11-13 and rendered DOCX.
- Affected files/functions:
  - `server/blueprint-v2/sections/consistency-matrix-engine.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - production Lab B orchestration
- Severity: Critical for production, acceptable only in diagnostics.
- Fix now or later: Fix now for production gating.
- Minimal safe fix: Add a production-only stop after Step 10 when matrix status is blocked. Diagnostic mode may continue, but reports must keep `production_valid: false`.
- Suggested test: Matrix fixture with missing objective/question fields must block production Step 11 and still allow diagnostic continuation with an explicit flag.
- Risk of changing it: Low if gated by mode. High if applied unconditionally, because it would remove useful diagnostic runs.

## 2. Evidence Quality and Source Health

### Issue 2.1 - Selected source set is too weak for production

- Observed evidence: Of 4 selected sources, only 2 materialized. One source was metadata-only, one was unresolved, and one materialized source is adjacent energy-dissipator evidence instead of direct seismic-isolator evidence.
- Affected files/functions:
  - `scripts/run-evidence-candidate-search.ts`
  - `scripts/run-evidence-selected-sources-steps-2-6.ts`
  - `blueprint_launch/server/source-access-resolution.ts`
  - `blueprint_launch/server/source-evidence-planning.ts`
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Require a minimum number of selected sources with complete public content and topic fit before Steps 4-6. The existing source replacement report should become part of the normal blocked workflow.
- Suggested test: Selection with fewer than the configured minimum complete-public sources should block and write a replacement report.
- Risk of changing it: Low. It may force more source review cycles, but that is desirable for ethical production output.

### Issue 2.2 - Wrong-PDF or weak article identity risk remains

- Observed evidence: Earlier inspection found a DOI resolving to an incorrect administrative PDF while a likely correct article URL was also available. The current materialization code validates PDF bytes and content type, but not article identity.
- Affected files/functions:
  - `blueprint_launch/server/source-content-materialization.ts`
  - `blueprint_launch/server/source-access-resolution.ts`
- Severity: High.
- Fix now or later: Fix now, minimally.
- Minimal safe fix: Add deterministic article identity checks before accepting a PDF: title token overlap, DOI match in landing page or PDF text when available, and suspicious filename/URL warnings. Do not add broad resolver refactors yet.
- Suggested test: Fixture where DOI metadata title does not match PDF title/text should mark the PDF suspicious and block or warn based on confidence.
- Risk of changing it: Medium. Strict checks can reject legitimate PDFs with poor metadata. Start with warning plus production blocker for low-confidence identity.

### Issue 2.3 - Metadata-only and unresolved sources still contribute too much downstream

- Observed evidence: `10.15446/dyna.v85n207.72296` was metadata-only and `10.56048/mqr20225.7.2.2023.1062-1085` was unresolved, yet the handoff reached Lab B and sections used the full source registry.
- Affected files/functions:
  - `blueprint_launch/server/consolidated-evidence.ts`
  - `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
- Severity: High.
- Fix now or later: Fix now.
- Minimal safe fix: Mark source usability tiers explicitly: `full_text`, `abstract_only`, `metadata_only`, `unresolved`, `adjacent_context`. Lab B prompts should treat non-full-text sources as background only unless the claim is directly supported by recoverable text.
- Suggested test: Handoff with metadata-only source must preserve the source but forbid direct quote support from it.
- Risk of changing it: Medium. Requires careful wording so Lab B still declares gaps rather than dropping context silently.

### Issue 2.4 - Large document dominance can distort extraction and generation

- Observed evidence: One central thesis PDF contributed most of the extracted text. The Lab A run had 206430 extracted text chars across only 2 materialized sources.
- Affected files/functions:
  - `blueprint_launch/server/source-signal-extraction.ts`
  - `blueprint_launch/server/consolidated-evidence.ts`
  - Lab B planning and section generation prompt assembly
- Severity: Medium-high.
- Fix now or later: Later, after safety gates.
- Minimal safe fix: Add a warning when one source contributes a large majority of extracted text or evidence units. Do not cap aggressively yet.
- Suggested test: Fixture with one oversized source should emit a dominance warning and keep traceability counts.
- Risk of changing it: Low for warning only. Higher for caps because they can remove important evidence.

### Issue 2.5 - Scanned or unextractable PDFs need deterministic detection

- Observed evidence: Earlier selected-source diagnostics showed a downloaded PDF with 0 extracted text and 0 chunks. Current run did not show that exact failure, but the pipeline needs a guard before production.
- Affected files/functions:
  - `blueprint_launch/server/source-content-materialization.ts`
  - `blueprint_launch/server/source-signal-extraction.ts`
- Severity: High.
- Fix now or later: Fix soon, but after gate propagation.
- Minimal safe fix: If a downloaded PDF yields zero text/chunks, mark it `unextractable_pdf`, exclude it from direct evidence, and request source replacement. Do not implement OCR in Release 0.
- Suggested test: Fixture PDF/materialization manifest with zero extracted chars should block production evidence planning.
- Risk of changing it: Low. The main risk is correctly distinguishing extraction failures from intentionally skipped sources.

## 3. Citation and Traceability Semantics

### Issue 3.1 - Metadata/intake snippets inflate direct quote support

- Observed evidence: Lab A reported 38 direct quotes, but prior inspection found metadata/intake/title-like snippets counted as `direct_quote`. This weakens the ethical guarantee that meaningful output is traceable to recovered sources.
- Affected files/functions:
  - `blueprint_launch/server/consolidated-evidence.ts`
  - `blueprint_launch/server/source-signal-extraction.ts`
  - `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Only assign `direct_quote` citation eligibility to excerpts extracted from recovered full text or verified abstract text. Metadata, intake text, generated summaries, and source titles should use weaker categories.
- Suggested test: Evidence unit fixture from metadata/title/intake must not increment direct quote count.
- Risk of changing it: Medium. Counts will drop and some Lab B sections may have fewer citations, but that is the correct behavior.

### Issue 3.2 - Handoff artifact refs do not yet carry enough materialization detail

- Observed evidence: The handoff is structurally valid, but materialized PDF/extracted text refs are not consistently available to Lab B from the contract-native path.
- Affected files/functions:
  - `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
  - `server/blueprint-engine/contracts/*`
  - `scripts/run-evidence-selected-sources-steps-2-6.ts`
- Severity: High.
- Fix now or later: Fix now or next batch.
- Minimal safe fix: Preserve non-mutating artifact refs for materialized PDF path, extracted text/chunk manifest path, source access status, and extraction status when available.
- Suggested test: Adapted handoff from a selected-source run must include refs for materialized sources and omit refs for skipped sources without failing schema validation.
- Risk of changing it: Low if fields are additive/permissive. Medium if schema becomes too strict too early.

### Issue 3.3 - Citation traceability score is low despite successful generation

- Observed evidence: Lab B package quality traceability score was 53.33 while validation passed and both DOCX outputs rendered.
- Affected files/functions:
  - `server/blueprint-v2/sections/section-generation-engine.ts`
  - `server/blueprint-v2/compose/blueprint-composition-engine.ts`
  - `server/blueprint-v2/lab/package-quality-summary` generation path
- Severity: High.
- Fix now or later: Fix now for production thresholding.
- Minimal safe fix: Add production threshold rules for traceability score and section citation coverage. Diagnostic runs can pass with warnings; production runs should block below threshold.
- Suggested test: Lab B fixture with traceability below threshold must produce `production_valid: false` even if DOCX renders.
- Risk of changing it: Medium. Some valid sparse-evidence cases may be blocked until source selection improves.

### Issue 3.4 - Adjacent-topic evidence can be misused as direct topic evidence

- Observed evidence: The diagnostic report flagged risk that energy-dissipator evidence was used as if it supported seismic isolators directly.
- Affected files/functions:
  - `blueprint_launch/server/source-evidence-planning.ts`
  - `blueprint_launch/server/consolidated-evidence.ts`
  - `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
  - `server/blueprint-v2/sections/section-generation-engine.ts`
- Severity: High.
- Fix now or later: Fix now for labeling, later for deeper ranking.
- Minimal safe fix: Add source-topic-fit labels such as `direct`, `adjacent`, `background`, and require Lab B to phrase adjacent evidence as contextual, not as direct proof.
- Suggested test: Adjacent source fixture should allow background use but fail if used as support for a direct isolator-performance claim.
- Risk of changing it: Medium. Requires prompt and validator care to avoid overblocking useful background literature.

## 4. Lab B Generation Quality and Overclaim Prevention

### Issue 4.1 - Overclaim detection is not strict enough for degraded handoffs

- Observed evidence: Diagnostic report marked `likely_overclaims: true`, but package gates showed `claims_guard_failure_count: 0`.
- Affected files/functions:
  - `server/blueprint-v2/sections/section-generation-validator.ts`
  - `server/blueprint-v2/sections/section-generation-engine.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
- Severity: High.
- Fix now or later: Fix now.
- Minimal safe fix: Add degraded-handoff rules to the validator: require limitation language, forbid strong empirical conclusions where source support is metadata-only or adjacent, and block production when likely overclaim checks fail.
- Suggested test: Degraded handoff fixture should require "limitaciones", "no se recupero", or equivalent caveats in relevant sections.
- Risk of changing it: Medium. Can make generated text more cautious, but that aligns with product ethics.

### Issue 4.2 - Consistency matrix block did not stop downstream diagnostic composition

- Observed evidence: Matrix status was `blocked` because specific rows lacked objective/question alignment, yet Steps 11-13 completed.
- Affected files/functions:
  - `server/blueprint-v2/sections/consistency-matrix-engine.ts`
  - `server/blueprint-v2/compose/blueprint-composition-engine.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
- Severity: High.
- Fix now or later: Fix now for production, keep diagnostic override.
- Minimal safe fix: Production runner must stop after Step 10 if matrix status is blocked. Diagnostic report should preserve the blocked matrix state in the DOCX manifests.
- Suggested test: Blocked matrix fixture should produce no production DOCX and a clear repair report.
- Risk of changing it: Low in production mode; diagnostics need explicit allow flag.

### Issue 4.3 - Questions, objectives, and hypotheses are misaligned

- Observed evidence: Matrix warnings: 4 questions vs 3 objectives, 5 hypotheses vs 3 objectives, no explicit variables, weak lexical correspondence, and preliminary matrix gaps.
- Affected files/functions:
  - `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
  - `server/blueprint-v2/sections/consistency-matrix-engine.ts`
  - planning artifacts in Step 8
- Severity: High.
- Fix now or later: Fix after production gates.
- Minimal safe fix: Add deterministic repair or stricter validation before section generation: each specific objective should have one aligned question, hypothesis when applicable, variables, and evidence support status.
- Suggested test: Planning fixture with count mismatch must return a blocked matrix and a repair suggestion.
- Risk of changing it: Medium. It may require prompt changes and can affect section drafting.

### Issue 4.4 - Lab B needs stronger degraded-input warning propagation into text

- Observed evidence: Diagnostic report says warning propagation was present, but it also identified overclaim and metadata-only overuse risks.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
  - `server/blueprint-v2/sections/section-generation-engine.ts`
- Severity: Medium-high.
- Fix now or later: Fix soon.
- Minimal safe fix: Insert a contract-native evidence limitations block into Step 8 planning and Step 9 section prompts. Require explicit assumptions/gaps in methods, limitations, and results-related sections.
- Suggested test: Degraded handoff fixture should produce section drafts containing source limitations and should not claim local Peruvian empirical validation if unavailable.
- Risk of changing it: Medium. Prompt changes can affect style and length.

## 5. DOCX Rendering and QA

### Issue 5.1 - DOCX QA fails on required figures/schedule assets

- Observed evidence: Master DOCX QA failed on `has_figure_caption` and `has_schedule_gantt`. Institutional DOCX QA failed on `has_media_assets`, `has_figure_caption`, and `has_schedule_gantt`.
- Affected files/functions:
  - `server/blueprint-v2/lab/docx-renderer.ts`
  - `server/blueprint-v2/lab/docx-qa-engine.ts`
  - `server/blueprint-v2/lab/academic-document-compiler.ts`
- Severity: Medium-high.
- Fix now or later: Fix after evidence safety gates.
- Minimal safe fix: Decide which assets are mandatory for Release 0 templates. If schedule/Gantt is required, generate a deterministic schedule table/figure from the plan. If not required in diagnostic mode, downgrade those QA checks to diagnostic warnings.
- Suggested test: Rendered DOCX fixture should pass required QA or explicitly mark skipped optional assets.
- Risk of changing it: Medium. Template-specific requirements can diverge across UPC, UCV, and USMP.

### Issue 5.2 - Hero/media skip interacts poorly with QA expectations

- Observed evidence: Full diagnostic run used `--skip-hero-image`; institutional QA still failed on missing media assets.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - `server/blueprint-v2/lab/docx-renderer.ts`
  - `server/blueprint-v2/lab/docx-qa-engine.ts`
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Make QA aware of diagnostic flags such as `skip_hero_image`, while keeping production media requirements explicit.
- Suggested test: Diagnostic render with skipped hero should not be mislabeled as production-ready.
- Risk of changing it: Low if production QA remains strict.

### Issue 5.3 - DOCX can render even when upstream academic gates are blocked

- Observed evidence: Both DOCX files were created despite Step 3 and Step 10 blockers.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - production Lab B runner
  - `server/blueprint-v2/lab/steps-11-13-runner.ts`
- Severity: Critical for production.
- Fix now or later: Fix now as part of production eligibility gating.
- Minimal safe fix: Require `production_eligible: true`, non-blocked matrix, and passing DOCX preflight before production DOCX render.
- Suggested test: Blocked handoff should not create production DOCX files.
- Risk of changing it: Low if diagnostic output folder remains available.

## 6. LLM Cost, Caching, and Performance

### Issue 6.1 - Full diagnostic generation is expensive enough to need guardrails

- Observed evidence: The full Lab B diagnostic run used 59 OpenAI calls and 198863 total tokens, with estimated cost USD 0.572753.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
  - `server/blueprint-v2/sections/section-generation-engine.ts`
- Severity: Medium.
- Fix now or later: Later, after correctness.
- Minimal safe fix: Add run-level budget reporting and a `--max-sections` smoke mode for diagnostics. Do not optimize prompts before semantic gates are correct.
- Suggested test: Diagnostic run with `--max-sections 3` should generate bounded section artifacts and report skipped sections.
- Risk of changing it: Medium. Smoke mode must not be confused with production output.

### Issue 6.2 - Step artifacts are large and should become resumable

- Observed evidence: Full diagnostic artifacts include large planning and lab result files. Rerunning all steps for small fixes will be costly.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - `server/blueprint-v2/lab/pipeline.ts`
  - section generation and composition engines
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Add explicit resume-from-artifact support per diagnostic step after gates stabilize.
- Suggested test: Resume from Step 8 plan and regenerate only Step 9 artifacts.
- Risk of changing it: Medium-high. Resume logic can accidentally mix incompatible artifacts if hashes are not checked.

### Issue 6.3 - Large document dominance increases prompt load

- Observed evidence: One materialized thesis dominates extracted text, which likely increases prompt and extraction load.
- Affected files/functions:
  - `blueprint_launch/server/source-signal-extraction.ts`
  - Lab B prompt assembly
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Add source contribution metrics and warnings first. Later, use section-specific retrieval from evidence units instead of broad prompt payloads.
- Suggested test: Oversized-source fixture should report dominance metrics and keep deterministic hashes.
- Risk of changing it: High if optimization changes evidence selection before traceability is stable.

## 7. Code Cleanup / Refactor Opportunities

### Issue 7.1 - Diagnostic runners contain production-shaped logic

- Observed evidence: `scripts/run-lab-b-full-diagnostic-docx.ts` now performs contract loading, degraded warning extraction, Step 7 context synthesis, Step 8/9 orchestration, matrix handling, composition, DOCX rendering, and report generation.
- Affected files/functions:
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
  - `scripts/run-evidence-selected-sources-steps-2-6.ts`
  - `server/blueprint-engine/adapters/*`
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Do not refactor yet. After gates stabilize, extract reusable backend services for production eligibility, artifact writing, degraded warning extraction, and contract-native Lab B import context.
- Suggested test: Existing scripts should continue to pass after helper extraction.
- Risk of changing it: Medium. Refactor before correctness fixes may hide behavior changes.

### Issue 7.2 - Lab B import path still has mutable-latest assumptions in older runners

- Observed evidence: The new diagnostic path builds from EvidenceEngineHandoffV1, but existing Lab B lab runners and helpers historically read current/latest artifacts.
- Affected files/functions:
  - `server/blueprint-v2/lab/template-import-context.ts`
  - `server/blueprint-v2/lab/steps-5-11-runner.ts`
  - `server/blueprint-v2/lab/steps-11-13-runner.ts`
  - `scripts/run-master-blueprint-lab-steps-5-11.ts`
  - `scripts/run-master-blueprint-steps-11-13.ts`
- Severity: Medium-high.
- Fix now or later: Later, after production gate definitions.
- Minimal safe fix: Add a contract-native import-context builder while keeping old lab runners intact.
- Suggested test: Same handoff path should produce stable Step 7 import context without reading mutable `latest` paths.
- Risk of changing it: Medium. Existing Lab B tests may depend on lab artifact conventions.

### Issue 7.3 - Status vocabulary is inconsistent

- Observed evidence: Artifacts use `BLOCK`, `blocked`, `warn`, `PASS_WITH_WARNINGS`, `production_valid`, `can_proceed`, and diagnostic flags across different layers.
- Affected files/functions:
  - `server/blueprint-engine/contracts/*`
  - `server/blueprint-engine/adapters/*`
  - `blueprint_launch/server/*`
  - `server/blueprint-v2/*`
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Add a small status normalization helper in the contract/adapters layer without changing Lab A or Lab B runtime internals.
- Suggested test: All known status variants normalize to canonical `pass`, `warn`, `block`, or `diagnostic_only`.
- Risk of changing it: Low if additive. Higher if persisted artifacts are rewritten, which should be avoided.

### Issue 7.4 - Artifact writing/reporting patterns are duplicated

- Observed evidence: Multiple scripts write summary JSON, Markdown reports, copied inputs, and warnings with similar but non-identical shapes.
- Affected files/functions:
  - `scripts/run-evidence-candidate-search.ts`
  - `scripts/run-evidence-selected-sources-steps-2-6.ts`
  - `scripts/run-lab-b-diagnostic-ingestion.ts`
  - `scripts/run-lab-b-full-diagnostic-docx.ts`
- Severity: Low-medium.
- Fix now or later: Later.
- Minimal safe fix: Create shared artifact writer only after schemas and required report fields settle.
- Suggested test: Snapshot summary schema for each runner.
- Risk of changing it: Medium. Mechanical cleanup can break file names expected by the UI and downstream scripts.

## 8. Testing Strategy

### Issue 8.1 - Need production eligibility tests separate from contract validation

- Observed evidence: Contracts validate, but the degraded handoff is not production-valid.
- Affected files/functions:
  - `scripts/test-blueprint-contract-boundary.ts`
  - new test for production eligibility
  - `server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter.ts`
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Add fixture tests for `schema valid but production blocked`.
- Suggested test: Use the diagnostic handoff or a minimized fixture with `allow_blocked_upstream` and Step 3 `BLOCK`.
- Risk of changing it: Low.

### Issue 8.2 - Need source health tests

- Observed evidence: Current and prior runs show metadata-only, unresolved, wrong-PDF risk, and unextractable-PDF risk.
- Affected files/functions:
  - `blueprint_launch/server/source-access-resolution.ts`
  - `blueprint_launch/server/source-content-materialization.ts`
  - `blueprint_launch/server/source-signal-extraction.ts`
- Severity: High.
- Fix now or later: Fix now/s soon.
- Minimal safe fix: Add deterministic local fixtures for access states and materialization manifests. Avoid live provider calls.
- Suggested test: Metadata-only and unresolved selected sources should block production continuation.
- Risk of changing it: Low if tests are fixture-only.

### Issue 8.3 - Need citation semantics tests

- Observed evidence: Direct quote counts are inflated by non-source snippets.
- Affected files/functions:
  - `blueprint_launch/server/consolidated-evidence.ts`
  - handoff adapter
- Severity: Critical.
- Fix now or later: Fix now.
- Minimal safe fix: Add tests around citation eligibility assignment and direct quote counts.
- Suggested test: Units from metadata/intake/title do not count as `direct_quote`; recovered text excerpts do.
- Risk of changing it: Low.

### Issue 8.4 - Need Lab B blocked-matrix and overclaim tests

- Observed evidence: Matrix status was blocked, but full diagnostic composition continued. Overclaim risk was detected by report logic, not by claims guard failures.
- Affected files/functions:
  - `server/blueprint-v2/sections/consistency-matrix-engine.ts`
  - `server/blueprint-v2/sections/section-generation-validator.ts`
  - production Lab B runner
- Severity: High.
- Fix now or later: Fix now for gating, later for richer semantic validation.
- Minimal safe fix: Add fixture matrix with missing fields and fixture section draft with unsupported strong claim.
- Suggested test: Production mode blocks; diagnostic mode continues with warnings.
- Risk of changing it: Medium for generation-validator tests that may need stable text fixtures.

### Issue 8.5 - Need DOCX QA fixture tests

- Observed evidence: Both DOCX outputs rendered but failed QA gates.
- Affected files/functions:
  - `server/blueprint-v2/lab/docx-qa-engine.ts`
  - `server/blueprint-v2/lab/docx-renderer.ts`
- Severity: Medium.
- Fix now or later: Later.
- Minimal safe fix: Add fixture document models for master and institutional DOCX QA before changing renderer behavior.
- Suggested test: Required captions/schedule/media checks should pass or emit mode-aware diagnostic warnings.
- Risk of changing it: Medium because DOCX rendering is sensitive to template details.

## Recommended First Implementation Batch

1. Add a production eligibility gate after EvidenceEngineHandoffV1 validation and before Lab B generation. It should block Step 3 `BLOCK`, `production_valid: false`, diagnostic-only handoffs, insufficient materialized sources, and blocked matrix for production runs.
2. Fix citation semantics so metadata, intake snippets, source titles, and generated summaries cannot inflate `direct_quote` support.
3. Propagate upstream gate status and source health into Step 6 readiness and EvidenceEngineHandoffV1 degraded-input fields.
4. Require minimum source health before Steps 4-6 or before production Lab B: enough complete-public, topic-fit, materialized, extractable sources.
5. Add production matrix gate before Step 11 and DOCX rendering, while preserving explicit diagnostic override.
6. Add focused tests for the above before touching broader Lab A or Lab B internals.

## Changes to Avoid For Now

- Broad refactors of Lab A or Lab B runtime.
- UI changes.
- Database schema changes.
- Env or secret changes.
- OCR implementation.
- New retrieval providers.
- PDF ingestion expansion beyond current Release 0 limits.
- Hero image generation or visual polish.
- Prompt optimization before evidence/citation semantics are fixed.
- Rewriting old artifacts or relying on mutable `latest` paths as production inputs.
- Making diagnostics look production-valid by suppressing warnings.

## Backup / Checkpoint Recommendation

A backup/checkpoint should be created before implementation starts.

Recommended checkpoint:

- Create a dedicated git branch or worktree for the remediation batch.
- Record the current dirty worktree state before edits.
- Preserve the two inspected run folders exactly as-is.
- If implementation will touch pipeline scripts or adapters, write a small pre-remediation note in `artifacts-local/` containing the run folder paths and the expected diagnostic verdicts.

No artifact backup or code checkpoint was created as part of this roadmap-only step.
