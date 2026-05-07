# Intake 2 Improvements Handoff

Generated: 2026-05-07  
Workspace: `C:\projects\ingeniometrix`  
Case: `case-002-shaking-table-control-systems`  
Scope: documentation-only handoff for recent Lab A / Lab B improvements after intake 2 analysis.

## 1. Executive Summary

### Problems Addressed

The intake 2 run exposed several pipeline issues that were not visible enough in the first intake:

- Candidate search needed a clearer keyword strategy with category-based query expansion.
- Automatic PDF retrieval hit publisher/Cloudflare barriers, requiring a safe user-provided local PDF path.
- Lab A needed to carry richer source health, source sufficiency, secondary-reference recovery, asset/equation, and telemetry data into the Evidence Engine handoff.
- Lab B needed stronger compatibility with the improved Lab A handoff, especially for source health, method selection, reduced evidence, equation rendering, semantic source use, and production safety.
- Previous intake / stale topic contamination had to be guarded and scanned in public DOCX outputs.
- Theoretical framework, method selection, equations, references, consistency matrix, public appendices, Spanish public text quality, and DOCX QA needed improvements.

### High-Level Improvements Implemented

- Added expanded candidate search using keyword categories and contamination checks.
- Added local user-provided PDF import for diagnostics, with manifest, checksum, provenance, and production gate caution.
- Added or strengthened source health, source sufficiency, reduced evidence, secondary-reference recovery, telemetry, production readiness, and quality dashboards.
- Added Method Selection Layer with evidence-bound LLM pass, deterministic validation, route-specific requirements, cache key, telemetry, and read-only artifacts.
- Added method generation contract and semantic consistency checks so Lab B can reflect method/theory/model/equation needs without pretending weak evidence is production-ready.
- Added semantic source-use policy to prevent adjacent/context-only evidence from supporting central claims in public outputs.
- Added professional equation handling, source-grounded equation explanations, image fallback for non-native equations, raw LaTeX leak checks, and equation numbering reset.
- Improved consistency matrix generation/normalization and concordance validation.
- Improved Spanish public text cleanup, capitalization, public appendix restrictions, DOCX QA, no external relationships, no source title leaks, and no raw LaTeX.
- Improved hero image policy and generation; latest code now reuses one shared hero image per handoff/run for master and institutional DOCX.

### Test Status

The latest known verification passed:

- `npx tsc --noEmit --pretty false`
- Core regression scripts for source health, citation semantics, production safety, fresh-run isolation, method selection, evidence budget, telemetry, production readiness, DOCX QA, editorial enforcement, hero policy, and user-provided PDFs.

Some test commands print a Node warning about `--localstorage-file` without failing.

### Production Eligibility

The latest output is **diagnostic-only** and **not production-eligible**.

Latest Lab B output:

- Diagnostic compatible: `true`
- Production eligible: `false`
- DOCX QA: `100/100` master and institutional
- Stale content detected: `false`
- Spanish public text QA: passed
- Main production blockers:
  - `diagnostic_only=true`
  - `production_valid=false`
  - `degraded_handoff=true`
  - only 3 materialized usable full-text sources, below production minimum 4
  - 2 adjacent/background sources
  - user-provided PDFs allowed for diagnostics but not production-reviewed
  - secondary references detected but not recovered/validated

## 2. Timeline / Work Sessions

| Order | Issue Identified | Action Taken | Result | Verified |
|---:|---|---|---|---|
| 1 | Candidate search was not sufficiently meaningful for intake 2. | Expanded `run-evidence-candidate-search.ts` with keyword-category query expansion, no previous-case context, dedupe, provider metadata, and contamination report. | Clean candidate run produced 10 candidates and source-selection template. | Yes, `test-candidate-search-keyword-expansion.ts` passed. |
| 2 | Source access failed for some PDFs due 403/CAPTCHA/manual access barriers. | Added user-provided PDF manifest workflow and runner flag. | All 3 selected PDFs could be staged and processed locally for diagnostics. | Yes, `test-user-provided-pdf-import.ts` passed and Lab A run materialized 3/3 sources. |
| 3 | Lab A outputs did not carry enough source health and source sufficiency context. | Added source health summary, source priority metadata, and source sufficiency recommendations into Lab A artifacts/handoff path. | Lab B received usable source health and production blockers. | Yes, Lab A quality dashboard and Lab B production readiness report show source health. |
| 4 | References from source PDFs were being used implicitly or omitted without recovery. | Added secondary-reference recovery queue and reports. | 120 secondary candidates detected and marked not citable until recovered. | Yes, queue/report files generated in Lab A and Lab B folders. |
| 5 | Method/technique/theory identification needed to be evidence-bound and domain-neutral. | Added Method Selection Layer: compact evidence context, schema-shaped LLM pass, deterministic validation, route-specific requirements, cache/telemetry, read-only output. | Intake 2 routed to engineering with provisional method and production downgrades. | Yes, `test-method-selection.ts` passed; artifacts generated. |
| 6 | Lab B could overuse adjacent sources for central claims. | Added semantic source-use policy and reports; public central sections quarantine adjacent evidence. | Public central section adjacent-source count is 0 in final run. | Yes, semantic source report and summary show guard active. |
| 7 | Consistency matrix missed general/specific concordance in earlier outputs. | Updated matrix derivation, placeholder detection, question cleanup, and row validation. | Matrix status improved to `warn`, row alignment OK, no production bypass. | Yes, final semantic report: `matrix_row_alignment_ok=true`. |
| 8 | DOCX had heavy paragraphs, incomplete fragments, lowercase starts, English labels, public traceability annexes, and raw LaTeX risks. | Added Spanish public text QA, capitalization hygiene, structural section policy, public appendix policy, equation rendering QA, OOXML relationship checks, and normalization. | Final DOCX QA 100/100; Spanish public text QA passed with 0 findings. | Yes, final QA reports passed. |
| 9 | Hero cover was too generic and duplicated API calls for master/university. | Strengthened methodological infographic policy and changed hero image file identity to shared handoff/run hash. | Final run still has two PNGs from before the shared-name fix; next run should reuse one image. | Code/test verified after final run: hero policy tests 20/20 passed. |
| 10 | Full autonomous rerun still had issues after first attempt. | Ran two allowed Lab B iterations after Lab A final handoff: fixed matrix/QA false positives, then inline bullet splitting/question cleanup. | Final diagnostic output is stable for review, not production. | Yes, final run and regression tests passed. |

## 3. Files Changed

Important: this working tree includes accumulated changes from multiple recent improvement batches. The list below is based on `git status --short` and `git diff --name-status` at handoff time. Some changes may predate the final autonomous iteration and should be reviewed before commit.

| File path | Reason for change | Main functions/classes/types changed | Affects | Risk |
|---|---|---|---|---|
| `blueprint_launch/server/consolidated-evidence.ts` | Carry source health, secondary-reference queue, richer source priorities, warnings into Step 6 artifact. | `buildSourcePriorities`, `buildLabASourceHealthSummary`, consolidated artifact assembly. | Evidence Engine, reports, Lab B compatibility. | High |
| `blueprint_launch/server/local-playground-store.ts` | Extend artifact typings for source health and secondary-reference queue. | `EvidencePackArtifact`, `ConsolidatedEvidenceSourcePriority`, `ConsolidatedEvidenceArtifact`. | Evidence Engine types/reports. | Medium |
| `blueprint_launch/server/source-content-materialization.ts` | Support user-provided PDF materialization/provenance and safer local PDF handling. | Materialization logic and manifest-aware source handling. | Evidence Engine runtime. | High |
| `blueprint_launch/server/source-evidence-planning.ts` | Minor cleanup, but file still contains old topic-specific heuristics needing review. | Planning hints/heuristics. | Evidence Engine runtime/prompts. | High |
| `blueprint_launch/server/source-signal-extraction.ts` | Build secondary-reference recovery queue and warnings during extraction artifacts. | `buildSecondaryReferenceRecoveryQueue` integration. | Evidence Engine runtime/reports. | Medium |
| `blueprint_launch/server/step1-intake-context.ts` | Adjust intake/context normalization and preserved terms. | Step 1 context helpers. | Candidate search / Lab A context. | Medium |
| `lib/topic-suggestion-scoring.ts` | Minor scoring adjustment. | Topic scoring helpers. | Candidate/source ranking. | Low |
| `package.json` | Added scripts for new tests/runners. | `scripts` map. | Dev/test workflow. | Low |
| `scripts/compare-diagnostic-runs.ts` | Add comparison support for diagnostics, telemetry, QA, cost/runtime. | Run comparison extractor/report writer. | Reports/tools. | Medium |
| `scripts/generate-upt-2dof-compact-example.ts` | Cleanup from analytic fixtures. | Script constants/imports. | Diagnostics/example generation. | Low |
| `scripts/run-blueprint-launch-steps-1-6.ts` | Minor cleanup/removal. | Runner glue. | Lab A scripts. | Medium |
| `scripts/run-evidence-candidate-search.ts` | Expanded keyword-category search, query variants, dedupe, contamination checks, reports. | CLI parsing, keyword plan, candidate scoring/rerank, report writing. | Candidate search/source selection. | High |
| `scripts/run-evidence-selected-sources-steps-2-6.ts` | User-provided PDF manifest, telemetry, quality dashboard, reduced pack, secondary refs, production reports. | CLI parsing, Step 2-6 orchestration, manual/user PDF path, reports. | Evidence Engine runtime. | High |
| `scripts/run-lab-b-diagnostic-ingestion.ts` | Align diagnostic ingestion with compatibility/safety outputs. | Diagnostic summary/report writing. | Lab B diagnostics. | Medium |
| `scripts/run-lab-b-full-diagnostic-docx.ts` | Full Lab B diagnostics with method selection, reduced evidence, semantic source use, dashboards, QA, telemetry, DOCX reports. | Main diagnostic runner orchestration. | Lab B runtime/reports/DOCX. | High |
| `scripts/test-academic-editorial-policy.ts` | Expand editorial policy tests. | Test cases. | Tests. | Low |
| `scripts/test-docx-structural-qa.ts` | Expand DOCX QA coverage. | Test fixtures/checks. | Tests/DOCX QA. | Low |
| `scripts/test-editorial-output-enforcement.ts` | Test title/keywords/length enforcement. | Test cases. | Tests/editorial. | Low |
| `scripts/test-evidence-budget.ts` | Test reduced evidence policy and dominance controls. | Test cases. | Tests/evidence budget. | Low |
| `scripts/test-hero-infographic-policy.ts` | Test infographic prompt, fallback, capitalization, and shared hero image file name. | Hero test fixture and assertions. | Tests/hero. | Low |
| `scripts/test-run-telemetry.ts` | Test telemetry totals/deltas. | Test cases. | Tests/telemetry. | Low |
| `scripts/test-section-evidence-binding.ts` | Test evidence-bound sections and adjacent guard. | Test cases. | Tests/section binding. | Low |
| `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts` | Adapt richer Lab A artifact to handoff with source health/citation/quality fields. | Adapter normalization and summary fields. | Contracts/adapters. | High |
| `server/blueprint-engine/quality/evidence-budget.ts` | Reduced evidence pack, source dominance, asset/equation retention for method review. | Budget defaults, reduced pack builder. | Shared quality / Lab B. | High |
| `server/blueprint-engine/quality/fresh-run-isolation.ts` | Stale content/source/asset/path scan and deterministic template asset rules. | Isolation and stale scan helpers. | Contamination prevention. | High |
| `server/blueprint-engine/quality/method-selection.ts` | LLM-assisted evidence-bound method selection, validation, cache/telemetry. | `MethodSelectionArtifactV1`, context builder, validator, report builder. | Method Selection. | High |
| `server/blueprint-engine/quality/production-safety.ts` | Production gates use source health/direct quote/source counts. | Eligibility helpers. | Production safety. | High |
| `server/blueprint-engine/quality/run-telemetry.ts` | Normalize run/step telemetry and dashboard inputs. | Telemetry schema/builders. | Analytics/reports. | Medium |
| `server/blueprint-engine/quality/section-evidence-binding.ts` | Count evidence-bound sections and context/adjacent support. | Binding validators/summaries. | Lab B validation. | Medium |
| `server/blueprint-engine/quality/source-health.ts` | Classify usable, metadata-only, unresolved, adjacent, etc. | Classification helpers. | Source health/production safety. | High |
| `server/blueprint-v2/editorial/academic-editorial-policy.ts` | Title, keywords, bullets, length, structure, objectives/hypotheses policies. | Editorial policy helpers. | Prompts/editorial. | Medium |
| `server/blueprint-v2/editorial/capitalization-hygiene.ts` | Spanish sentence-style capitalization and acronym preservation. | Capitalization helpers. | Public text/DOCX. | Medium |
| `server/blueprint-v2/editorial/hero-infographic-policy.ts` | Generic methodological infographic prompt/fallback policy. | `buildHeroInfographicPlan`, policy constants. | Hero prompts/DOCX. | Medium |
| `server/blueprint-v2/editorial/project-management-policy.ts` | Gantt/budget/public appendix policy. | Schedule/budget/appendix helpers. | DOCX content. | Medium |
| `server/blueprint-v2/lab/academic-document-compiler.ts` | Build public academic document models, sections, equations, bullets, appendices, references, title/keywords. | Many compiler helpers including inline bullet splitting, equation section handling. | Lab B DOCX model. | High |
| `server/blueprint-v2/lab/academic-document-editorial-pass.ts` | Enforce editorial cleanup without breaking citations. | Editorial LLM pass logic. | Lab B prompts/editorial. | Medium |
| `server/blueprint-v2/lab/academic-document-hero-image.ts` | Default to `gpt-image-2`, env override, and shared hero filename per handoff/run. | `resolveAcademicHeroImageModel`, `buildAcademicHeroImageFileName`, image generation. | Hero image generation. | Medium |
| `server/blueprint-v2/lab/academic-document-model.ts` | Extend academic model with hero/equation/public appendix/schedule/budget fields. | Academic document types. | DOCX model/contracts. | High |
| `server/blueprint-v2/lab/docx-ooxml-patcher.ts` | OOXML adjustments, relationship/update field handling. | Patch helpers. | DOCX rendering. | Medium |
| `server/blueprint-v2/lab/docx-qa-engine.ts` | DOCX QA checks for no external relationships, no LaTeX leaks, equations, TOC, appendix leakage. | QA engine checks/metrics. | DOCX QA. | Medium |
| `server/blueprint-v2/lab/docx-renderer.ts` | Render cover, equations, tables, Gantt, appendices, captions/source notes, academic styling. | Renderer helpers, asset/equation rendering, manifests. | DOCX rendering. | High |
| `server/blueprint-v2/lab/prompt-planning-hybrid.ts` | Planning output includes editorial, method, evidence, word budget guidance. | Prompt plan builder. | Step 8 prompts. | High |
| `server/blueprint-v2/lab/template-quality-contract.ts` | Cleanup from template quality contract. | Contract helpers. | Lab B validation. | Low |
| `server/blueprint-v2/prompts/section-prompt-planner.ts` | Add planning constraints for section generation. | Prompt planner text. | Prompts. | Medium |
| `server/blueprint-v2/sections/consistency-matrix-engine.ts` | Concordance normalization, question/hypothesis repair, validation. | Matrix builders, validation, placeholder logic. | Consistency matrix. | High |
| `server/blueprint-v2/sections/section-generation-engine.ts` | Preserve evidence IDs/source health/method contract in drafts. | Section generation orchestration. | Lab B generation. | High |
| `server/blueprint-v2/sections/section-generation-shared.ts` | Shared section fields/extensions. | Shared types/helpers. | Lab B generation. | Medium |
| `server/blueprint-v2/sections/section-output-normalizer.ts` | Normalize incomplete sentences, bullets, source/citation fields. | Output normalization helpers. | Lab B generation cleanup. | Medium |
| `server/blueprint/blueprint-service.ts` | Minor cleanup/removal from old blueprint service. | Service glue. | Legacy runtime. | Medium |
| `server/projects/topic-suggestion-service.ts` | Minor cleanup. | Topic suggestion service. | Project/topic suggestions. | Low |
| `server/reporting/docx/omml-equation-builder.ts` | Cleanup around equation builder. | OMML builder helpers. | DOCX equations. | Medium |
| `server/reporting/synthetic-document/generate-synthetic-content.ts` | Cleanup from synthetic doc content. | Synthetic content helpers. | Test/demo reporting. | Low |
| `tsconfig.json` | Include additional test/source paths or compiler settings. | TS config. | Build/tests. | Medium |
| `backups/pre-integration-2026-05-03-1415/blueprint-v2/lab/prompt-planning-hybrid.ts` | Backup copy modified; likely not intended for production code path. | Backup file only. | Backup artifact. | Medium |

## 4. New Files Added

| File path | Purpose | How used | Status |
|---|---|---|---|
| `scripts/prepare-user-provided-source-pdfs.ts` | Build manifest from local user-provided PDFs with checksums and assignment template. | Run before Evidence Engine rerun with local PDFs. | Production-shaped diagnostic tool |
| `scripts/test-user-provided-pdf-import.ts` | Tests local PDF manifest and production caution. | Regression test. | Test |
| `scripts/test-candidate-search-keyword-expansion.ts` | Tests keyword category expansion and contamination guard. | Regression test. | Test |
| `scripts/test-method-generation-contract.ts` | Tests method contract and semantic consistency constraints. | Regression test. | Test |
| `scripts/test-semantic-source-use-policy.ts` | Tests adjacent/context-only evidence quarantine. | Regression test. | Test |
| `scripts/test-spanish-public-text-layer.ts` | Tests Spanish public text QA/normalization. | Regression test. | Test |
| `scripts/test-template-runtime-offline.ts` | Tests local-fixture runtime mode avoiding Prisma/cloud. | Regression test. | Test |
| `scripts/test-secondary-reference-recovery.ts` | Tests secondary-reference extraction/queue behavior. | Regression test. | Test |
| `scripts/test-source-sufficiency.ts` | Tests source sufficiency recommendations/gates. | Regression test. | Test |
| `scripts/test-academic-structure-layer.ts` | Tests academic structure, objectives/hypotheses, bullets/tables. | Regression test. | Test |
| `scripts/test-asset-equation-layer.ts` | Tests assets/equations/rendering layer. | Regression test. | Test |
| `scripts/test-citation-reference-layer.ts` | Tests citation/reference behavior. | Regression test. | Test |
| `server/blueprint-engine/quality/method-generation-contract.ts` | Converts Method Selection read-only artifact into generation constraints and semantic consistency report. | Lab B diagnostic runner/report. | Production-shaped guard |
| `server/blueprint-engine/quality/secondary-reference-recovery.ts` | Detects PDF reference-list/inline citation candidates and queues recovery. | Lab A/Lab B reports; not citable yet. | Production-shaped diagnostic |
| `server/blueprint-engine/quality/semantic-source-use-policy.ts` | Prevents adjacent/context-only sources from central public claims. | Lab B generation/report. | Production-shaped guard |
| `server/blueprint-engine/quality/source-sufficiency.ts` | Builds source sufficiency recommendations and production blockers. | Lab A/Lab B dashboards. | Production-shaped guard |
| `server/blueprint-engine/quality/user-provided-source-pdfs.ts` | Manifest schema/validation for user-provided PDF files. | Lab A runner/materialization. | Production-shaped diagnostic |
| `server/blueprint-v2/editorial/public-document-normalizer.ts` | Normalizes public-facing titles/headings/captions/labels. | Lab B before DOCX render. | Production-shaped |
| `server/blueprint-v2/editorial/spanish-public-text-qa.ts` | Deterministic public Spanish QA. | Lab B reports/gates. | Production-shaped QA |
| `server/blueprint-v2/lab/professional-equation-report.ts` | Reports equation render/source-grounding status. | Lab B report. | Production-shaped diagnostic |
| `server/blueprint-v2/lab/template-runtime-policy.ts` | Prevents accidental Prisma/cloud template lookup in local diagnostic mode. | Lab B runner. | Production-shaped guard |
| `INTAKE_2_IMPROVEMENTS_HANDOFF.md` | This consolidated handoff. | Reviewer handoff. | Documentation |
| `artifacts-local\...\CASE_002_LAB_A_AUTONOMOUS_RERUN_DIAGNOSTIC.md` | Lab A run diagnostic summary. | Local artifact review. | Diagnostic artifact |
| `artifacts-local\...\CASE_002_AUTONOMOUS_FULL_PIPELINE_DIAGNOSTIC.md` | Final full-pipeline diagnostic summary. | Local artifact review. | Diagnostic artifact |

## 5. Features / Fixes Implemented

### Contamination Prevention

- Changed: added fresh-run isolation, stale source/asset/topic/path scanning, mutable latest path counts, and public-text stale marker scanning.
- Where: `server/blueprint-engine/quality/fresh-run-isolation.ts`, `scripts/run-lab-b-full-diagnostic-docx.ts`.
- Verified: final `stale-content-scan-report.json` passed with 0 stale topic/source/asset markers and 0 mutable latest paths.
- Remaining limitation: old topic-specific strings still exist in runtime/fixtures/tests; see Section 7.

### Method Selection

- Changed: added LLM-assisted, evidence-bound Method Selection Layer with compact context, route-specific requirements, deterministic validation, cache key, telemetry, and read-only artifacts.
- Where: `server/blueprint-engine/quality/method-selection.ts`, `scripts/run-lab-b-full-diagnostic-docx.ts`.
- Verified: `test-method-selection.ts` passed; final artifacts include `method-selection-evidence-context.json`, `method-selection-artifact.json`, `method-selection-validation-report.json`, `method-selection-report.md`.
- Remaining limitation: status downgraded to provisional because input is diagnostic/degraded and source set is too small.

### Theoretical Framework / Models / Equations

- Changed: method contract and equation report now track source-backed equation assets, professional render strategy, source-grounded explanations, raw LaTeX leak count, image fallback, and missing variable notes.
- Where: `server/blueprint-engine/quality/method-generation-contract.ts`, `server/blueprint-v2/lab/professional-equation-report.ts`, `server/blueprint-v2/lab/academic-document-compiler.ts`, `server/blueprint-v2/lab/docx-renderer.ts`, `server/reporting/docx/omml-equation-builder.ts`.
- Verified: final `professional-equation-report.json` shows 14 rendered equations, 14 source-grounded explanations, 0 raw LaTeX public leaks.
- Remaining limitation: 74 variable-description warnings remain.

### Consistency Matrix

- Changed: improved derivation and validation of general/specific question/objective/hypothesis concordance, placeholder handling, question marks, and cautious hypothesis repair.
- Where: `server/blueprint-v2/sections/consistency-matrix-engine.ts`.
- Verified: final semantic consistency report shows `matrix_status=warn`, `matrix_row_alignment_ok=true`, and `matrix_can_continue_step_11=true`.
- Remaining limitation: still warning because evidence/method contract is not production-ready.

### DOCX Public Cleanup

- Changed: added no public traceability annex, no source title leaks, no external relationships, no raw LaTeX, Spanish QA, capitalization hygiene, cleaner appendices, Gantt table, table/heading cleanup.
- Where: `server/blueprint-v2/lab/docx-renderer.ts`, `server/blueprint-v2/lab/docx-qa-engine.ts`, `server/blueprint-v2/editorial/public-document-normalizer.ts`, `server/blueprint-v2/editorial/spanish-public-text-qa.ts`, `server/blueprint-v2/editorial/capitalization-hygiene.ts`.
- Verified: final master and university DOCX QA both `100/100`; Spanish public text QA passed with 0 findings.
- Remaining limitation: DOCX QA warns Word may require updating fields manually because `updateFields` was not detected in `word/settings.xml`.

### Hero Image

- Changed: hero prompt is methodological infographic-oriented and default model is `gpt-image-2`; env override preserved. Latest code uses shared handoff/run hash for one hero image across master/university.
- Where: `server/blueprint-v2/editorial/hero-infographic-policy.ts`, `server/blueprint-v2/lab/academic-document-hero-image.ts`, `scripts/test-hero-infographic-policy.ts`.
- Verified: hero policy tests passed 20/20 after shared image fix.
- Remaining limitation: final 2026-05-07T05-15 run was produced before shared filename fix, so it contains two generated cover PNGs. Next run should reuse one.

### Citations / References

- Changed: direct quote semantics distinguish true source-backed excerpts from metadata/intake/context; secondary references are queued but not cited; references count/citation anchors are tracked.
- Where: `server/blueprint-engine/quality/citation-semantics.ts` from prior batch, `server/blueprint-engine/quality/secondary-reference-recovery.ts`, `server/blueprint-v2/lab/academic-document-compiler.ts`, `server/blueprint-v2/lab/docx-renderer.ts`.
- Verified: final dashboard reports 36 true source-backed direct quotes and 0 citation semantics warnings; secondary queue generated.
- Remaining limitation: reference base is still narrow because secondary references are not recovered/selected.

### Source / Evidence Alignment

- Changed: source health, source sufficiency, reduced evidence, source dominance warnings, adjacent-source quarantine, evidence binding, and public central-section guard.
- Where: `server/blueprint-engine/quality/source-health.ts`, `source-sufficiency.ts`, `evidence-budget.ts`, `semantic-source-use-policy.ts`, `section-evidence-binding.ts`.
- Verified: final public central sections have 0 adjacent-source direct support; section evidence binding score is 0.974.
- Remaining limitation: source health still flags 2 adjacent/background sources and production remains blocked.

### Telemetry / Cost / Dashboards

- Changed: normalized run/step telemetry, quality dashboard, production readiness, and comparison helper.
- Where: `server/blueprint-engine/quality/run-telemetry.ts`, `scripts/compare-diagnostic-runs.ts`, Lab A/Lab B runners.
- Verified: final Lab A and Lab B output folders contain `run-telemetry.json`, `step-telemetry.json`, `quality-dashboard.json`, and `production-readiness-report.md`.
- Remaining limitation: full Lab B run summary includes method/hero/pre-post usage not fully assigned to numbered step telemetry.

### User-Provided PDFs

- Changed: added local user-provided PDF manifest and runner flag; validates PDF bytes/checksum and keeps production blocked unless future review metadata exists.
- Where: `server/blueprint-engine/quality/user-provided-source-pdfs.ts`, `scripts/prepare-user-provided-source-pdfs.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts`, `blueprint_launch/server/source-content-materialization.ts`.
- Verified: final Lab A materialized 3/3 selected sources using local PDFs; `test-user-provided-pdf-import.ts` passed.
- Remaining limitation: no UI yet; production review flag not implemented.

### Candidate Search / Source Selection

- Changed: expanded candidate search, category-based keywords, query variants, contamination report, rerank, candidate markers.
- Where: `scripts/run-evidence-candidate-search.ts`.
- Verified: candidate run produced 10 candidates; `test-candidate-search-keyword-expansion.ts` passed.
- Remaining limitation: runtime file still has case-specific seismic fallback presets; should be generalized before relying on it for arbitrary next intakes.

## 6. Prompt / LLM Changes

| Area | Affected file | Old behavior | New behavior | Expected impact | Contamination / overfitting risk |
|---|---|---|---|---|---|
| Candidate search planning | `scripts/run-evidence-candidate-search.ts` | Search could rely on broad or stale topic terms. | Category-based query plan with necessary/complementary/optional terms, expanded variants, fallback if no key. | Better candidate relevance and no previous intake carryover. | Medium: file still contains seismic-specific fallback presets. |
| Method Selection | `server/blueprint-engine/quality/method-selection.ts` | No robust method artifact. | One evidence-bound LLM pass, schema-shaped output, deterministic validator/downgrade, cache key, telemetry. | Better method/theory/model/tool/variable identification. | Low-to-medium: prompts are generic; tests cover routes. |
| Method generation contract | `server/blueprint-engine/quality/method-generation-contract.ts` | Lab B could miss or overclaim method/theory/equation needs. | Converts method artifact into constraints and semantic consistency checks. | Better title/framework/methodology/equation coherence. | Low: read-only/guarded, but still relies on LLM extraction quality. |
| Section planning | `server/blueprint-v2/lab/prompt-planning-hybrid.ts`, `section-prompt-planner.ts` | Policies were guidance-only or weakly enforced. | Adds editorial, method, evidence, word-budget, source-health constraints. | More coherent sections, fewer overclaims. | Medium: prompt complexity may increase cost and fragility. |
| Section generation | `server/blueprint-v2/sections/section-generation-engine.ts`, `section-output-normalizer.ts` | Evidence IDs/source health could be lost; heavy prose persisted. | Preserves evidence IDs, applies source guard, normalizes incomplete text and structure. | Better traceability and readability. | Medium: normalizer can trim too aggressively if not monitored. |
| Consistency matrix | `server/blueprint-v2/sections/consistency-matrix-engine.ts` | Missing general question/hypothesis rows could pass poorly. | LLM + deterministic repair/validation with cautious hypotheses. | Better concordance and production gates. | Medium: repair must not invent unsupported results. |
| Editorial/layout passes | `academic-document-editorial-pass.ts`, `academic-document-layout-pass.ts`, compiler | Output title/keywords/length could remain intake-like or verbose. | Enforced title/keywords/length/bullets/Spanish public text policies. | More academic document shape. | Medium: LLM pass may still generate imperfect content. |
| Hero image | `hero-infographic-policy.ts`, `academic-document-hero-image.ts` | Generic or duplicated cover. | Methodological infographic prompt, `gpt-image-2`, shared handoff/run image cache, deterministic SVG fallback. | Better product feel and lower duplicate image cost. | Low: prompt derives from current document/handoff. |
| Equations | `professional-equation-report.ts`, `docx-renderer.ts`, compiler | Raw LaTeX/code could leak; equations were weakly formatted. | Native math when safe, image fallback when not, source-grounded explanation, QA. | More professional analytical content. | Medium: variable descriptions still weak. |
| Timeouts/fallback | Lab A Step 6 and Method Selection | Timeout could fail or overrun. | Lab A Step 6 has fallback; Method Selection uses compact context/cache and logs telemetry. | More resilient diagnostics. | Medium: Lab A fallback still has old hardcoded topic risk. |
| Cost telemetry | `run-telemetry.ts`, runners | Cost/tokens scattered. | Step/run telemetry and dashboards. | Easier comparison and cost control. | Low. |

## 7. Contamination Controls

### Issues Found

The final run itself passed stale content checks, but repository inspection found remaining hardcoded topic terms in code/fixtures/tests:

- Old adaptive reuse / Toronto / mass timber terms in `blueprint_launch/server/source-evidence-planning.ts`, `blueprint_launch/server/consolidated-evidence.ts`, `blueprint_launch/fixtures/synthetic-intake.ts`, and benchmark files.
- Case-001 seismic terms in some tests and candidate-search fallback presets, including `scripts/test-hero-infographic-policy.ts`, `scripts/test-fresh-run-isolation.ts`, `scripts/test-source-health.ts`, and `scripts/run-evidence-candidate-search.ts`.
- `fresh-run-isolation.ts` intentionally contains known stale marker strings so it can detect them. That is acceptable as guard data, but should be documented and kept out of generation prompts.

### What Was Fixed

- Final Lab B run reports:
  - `stale_content_detected=false`
  - `stale_topic_marker_count=0`
  - `stale_source_ref_count=0`
  - `stale_asset_ref_count=0`
  - `mutable_latest_path_count=0`
  - `foreign_run_path_count=0`
- Public DOCX QA reports:
  - no source title leaks
  - no public appendix debug leak
  - no internal provider markers
  - no external relationships

### Guards Now Existing

- Fresh-run isolation report.
- Stale content scan report.
- Deterministic template asset allowlist.
- Source/evidence/asset ID validation.
- Mutable latest path counting.
- Public document sanitizer and public text QA.
- DOCX QA checks for internal markers, external relationships, source title leaks, debug appendices, raw LaTeX.

### What Still Might Leak

The highest remaining contamination risk is not the final run artifact; it is old hardcoded fallback logic in Lab A. If an LLM timeout/fallback path fires, old topic-specific fallback text may still enter future artifacts unless removed or generalized.

Specific concern:

- `blueprint_launch/server/source-evidence-planning.ts` still contains adaptive reuse/Toronto hints.
- `blueprint_launch/server/consolidated-evidence.ts` still contains adaptive reuse fallback statements.
- `scripts/run-evidence-candidate-search.ts` still has seismic-specific fallback expansions.

These should be cleaned before the next intake if the goal is to validate arbitrary-domain generalization.

### Verification

- Final stale scan passed on 1,739 public text fields.
- Search of source files confirmed remaining stale/test/domain strings listed above. They are not all runtime-fatal, but they are review blockers before production hardening.

## 8. Method Selection Status

- Method Selection now runs in Lab B diagnostic mode.
- It is hybrid:
  - deterministic evidence context preparation
  - LLM-assisted method selection
  - deterministic validation/downgrade
  - cache/telemetry
- Timeout/context handling improved by using a compact evidence context and cache key.
- It remains mostly read-only, but a derived `method-generation-contract` now informs diagnostics/semantic consistency and appears to guide generation constraints. It should still be treated as guarded/provisional, not production authority.

### Produced Artifacts

Final Lab B run folder contains:

- `method-selection-evidence-context.json`
- `method-selection-artifact.json`
- `method-selection-validation-report.json`
- `method-selection-report.md`
- `method-generation-contract.json`
- `method-generation-contract.md`
- `semantic-consistency-report.json`
- `SEMANTIC_CONSISTENCY_REPORT.md`

### Latest Method Selection Result

- Route: `engineering`
- Route confidence: high
- Status before validation: `selected`
- Status after validation: `provisional`
- LLM model: `gpt-5.4-mini`
- Tokens: 24,413
- Cost: USD 0.052574
- Cache hit: `false`
- Primary method label: model-based modal decoupling control for multiaxis servohydraulic systems.

### Known Limitations

- Production blocked due degraded/diagnostic handoff and insufficient sources.
- The route-specific engineering requirements work, but equation variable descriptions are incomplete.
- It handles multiple knowledge areas in tests, but real-world validation beyond intake 2 is still pending.

## 9. Theory / Models / Equations Status

### What Changed

- Method contract checks whether title, theoretical framework, methodology, keywords, and matrix reflect the selected method.
- Engineering/quantitative topics activate equation/model/variable/software/validation needs.
- Non-engineering routes are protected by route-specific requirements and tests, so equations are not forced unless route/evidence supports them.
- Equations are either source-backed/rendered or reported as missing/required.
- Raw LaTeX is blocked from public output.

### Latest Final Run

- Current equation asset count: 6
- Renderable equation count: 7
- Professional equation render count: 14 across master/university
- Native math count: 4
- Generated image fallback count: 10
- Raw LaTeX public leak count: 0
- Equation source-grounded explanation count: 14
- Missing variable note count: 74

### Where It Appears

- `professional-equation-report.json`
- `PROFESSIONAL_EQUATION_REPORT.md`
- DOCX theoretical framework and methodology sections
- DOCX QA report via `has_professional_equations`
- Semantic consistency report

### Remaining Limitation

Variable and symbol descriptions need better extraction from original PDF context/assets. This is the next important equation-quality improvement.

## 10. Consistency Matrix Status

### What Changed

- General/specific row alignment is validated.
- Placeholder-like hypotheses/questions are repaired or cautiously derived when evidence allows.
- Question formatting and duplicate question marks are normalized.
- Matrix validation now uses actual rows, not only raw draft counts.
- Status can be `ok`, `warn`, or blocked-like depending on concordance and evidence.

### Current Gates

Incomplete/non-concordant if:

- General question/objective/hypothesis row is missing.
- Specific rows do not align one-to-one.
- Hypotheses are empty placeholders without cautious formulation.
- Matrix has missing core cells.
- Matrix claims results not supported by evidence.

### Latest Status

- Matrix status: `warn`
- Row alignment OK: `true`
- Can continue Step 11 diagnostic: `true`
- It does not make production eligible; semantic consistency still blocks production through method contract/source sufficiency.

## 11. DOCX Public Output Cleanup

### Spanish Accents / Tildes

- Added public Spanish QA and capitalization hygiene.
- Latest public Spanish QA: passed with 0 findings.
- Note: some JSON warnings show mojibake in terminal due encoding display, but public text QA passed.

### Labels Translation

- Budget/Gantt/DOCX labels were normalized for Spanish public output.
- Remaining English risk should be checked visually in DOCX before committing.

### Public Appendices

- Public traceability annex is removed.
- Public appendix policy excludes backend paths, debug logs, prompt traces, raw evidence logs, and run hashes.
- Latest DOCX QA: no public appendix debug leak.

### Links / External Paths

- DOCX QA reports `no_external_relationships=true`.
- No backend paths in public appendices.

### Schedule / Gantt Layout

- Schedule/Gantt is rendered and QA-recognized.
- Landscape sections exist.
- User requested horizontal schedule; final DOCX QA confirms Gantt marker and landscape section.

### Captions

- Figure caption QA passes structurally.
- Hero image intentionally has no caption because it is cover art.
- Equation captions are not counted as figure captions; equation rendering is handled separately.

### Remaining Issues

- Word field update warning: `No se detecto updateFields en word/settings.xml; Word puede requerir actualizar campos manualmente.`
- Human visual review is still recommended for layout aesthetics, despite QA 100/100.

## 12. Tests / Commands Run

No commands were rerun while creating this handoff. The following are the latest known commands/results from the recent work sessions.

### TypeScript

| Command | Result | Time/reference |
|---|---|---|
| `npx tsc --noEmit --pretty false` | Passed | Latest verification after shared hero image fix |

### Regression Tests

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/test-user-provided-pdf-import.ts` | Passed | Local PDF manifest/provenance |
| `npx tsx scripts/test-candidate-search-keyword-expansion.ts` | Passed | Candidate keyword categories |
| `npx tsx scripts/test-method-selection.ts` | Passed | 15 checks |
| `npx tsx scripts/test-evidence-budget.ts` | Passed | 5/5 |
| `npx tsx scripts/test-run-telemetry.ts` | Passed | 4/4 |
| `npx tsx scripts/test-production-readiness-dashboard.ts` | Passed | 2/2 |
| `npx tsx scripts/test-fresh-run-isolation.ts` | Passed | 6/6 |
| `npx tsx scripts/test-hero-infographic-policy.ts` | Passed | 20/20 after shared hero fix |
| `npx tsx scripts/test-project-management-content.ts` | Passed | 7/7 |
| `npx tsx scripts/test-docx-structural-qa.ts` | Passed | 8/8 |
| `npx tsx scripts/test-editorial-output-enforcement.ts` | Passed | 10/10 |
| `npx tsx scripts/test-academic-editorial-policy.ts` | Passed | 9/9 |
| `npx tsx scripts/test-section-evidence-binding.ts` | Passed | 6/6 |
| `npx tsx scripts/test-source-health.ts` | Passed | 7/7 |
| `npx tsx scripts/test-citation-semantics.ts` | Passed | 7/7 |
| `npx tsx scripts/test-production-safety-and-contamination-guards.ts` | Passed | 4/4 |
| `npx tsx scripts/test-method-generation-contract.ts` | Passed in recent batch | Method contract |
| `npx tsx scripts/test-semantic-source-use-policy.ts` | Passed in recent batch | Adjacent-source guard |
| `npx tsx scripts/test-spanish-public-text-layer.ts` | Passed in recent batch | Public Spanish QA |
| `npx tsx scripts/test-template-runtime-offline.ts` | Passed in recent batch | Local-fixture runtime |
| `npx tsx scripts/test-secondary-reference-recovery.ts` | Passed in recent batch | Secondary references |
| `npx tsx scripts/test-source-sufficiency.ts` | Passed in recent batch | Source sufficiency |
| `npx tsx scripts/test-academic-structure-layer.ts` | Passed in recent batch | Academic structure |
| `npx tsx scripts/test-asset-equation-layer.ts` | Passed in recent batch | Equation/asset layer |
| `npx tsx scripts/test-citation-reference-layer.ts` | Passed in recent batch | Citations/references |

### Pipeline Runs

| Command | Result | Output |
|---|---|---|
| `npx tsx scripts/run-evidence-candidate-search.ts --case case-002-shaking-table-control-systems --expand --max-candidates 15` | Completed | `artifacts-local\evidence-candidate-search-runs\case-002-shaking-table-control-systems\2026-05-05T15-12-29-416Z` |
| `npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case case-002-shaking-table-control-systems` | Completed earlier but only 1 usable full-text source due access blocks | `2026-05-05T15-30-40-276Z` |
| `npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case case-002-shaking-table-control-systems --user-provided-pdf-manifest artifacts-local/evidence-selected-source-runs/case-002-shaking-table-control-systems/2026-05-06T20-23-02-210Z/user-provided-source-pdfs.json` | Completed | `2026-05-07T04-22-09-727Z` |
| `npx tsx scripts/run-lab-b-full-diagnostic-docx.ts --handoff artifacts-local/evidence-selected-source-runs/case-002-shaking-table-control-systems/2026-05-07T04-22-09-727Z/evidence-handoff-v1.json --allow-degraded-handoff` | Completed, first iteration found matrix/QA issues | `2026-05-07T04-37-28-026Z` |
| Same Lab B command | Completed, second iteration fixed matrix but found Spanish QA dense objective issue | `2026-05-07T04-57-07-408Z` |
| Same Lab B command | Completed final iteration | `2026-05-07T05-15-31-767Z` |

No comparison script was run after the final autonomous rerun during this handoff step.

## 13. Latest Runs / Artifacts

### Candidate Search

- Path: `C:\projects\ingeniometrix\artifacts-local\evidence-candidate-search-runs\case-002-shaking-table-control-systems\2026-05-05T15-12-29-416Z`
- Purpose: expanded candidate search and human source selection checkpoint.
- Status: completed.
- Candidate count: 10.
- Providers: OpenAlex + Crossref.
- OpenAI called: false.
- Live retrieval called: completed.
- PDF download/extraction: not executed.
- Source selection status: pending in template, later completed via UI/source-selection.

### Evidence Engine Final Run

- Path: `C:\projects\ingeniometrix\artifacts-local\evidence-selected-source-runs\case-002-shaking-table-control-systems\2026-05-07T04-22-09-727Z`
- Purpose: Lab A Steps 2-6 using selected sources and user-provided PDFs.
- Status: completed.
- Source count: 3.
- Usable full-text sources: 3.
- Materialized sources: 3.
- Evidence units: 83.
- Reduced evidence units: 20.
- True direct quotes: 36.
- Asset references: 22.
- Section dossiers: 11.
- Production eligibility: false.
- Cost: 6 OpenAI calls, 128,932 tokens, USD 0.552493, CAD 0.755921.
- Stale contamination: Lab B fresh-run scan later passed; Lab A did not report stale public output.
- Important reports:
  - `CASE_002_LAB_A_AUTONOMOUS_RERUN_DIAGNOSTIC.md`
  - `quality-dashboard.json`
  - `run-telemetry.json`
  - `step-telemetry.json`
  - `secondary-reference-recovery-queue.json`
  - `source-sufficiency-recommendations.json`

### Lab B Final Full Diagnostic Run

- Path: `C:\projects\ingeniometrix\artifacts-local\lab-b-full-diagnostic-docx-runs\case-002-shaking-table-control-systems\2026-05-07T05-15-31-767Z`
- Purpose: full Lab B diagnostic DOCX pipeline, Steps 7-13.
- Status: completed.
- Source count: 3.
- Evidence units: 83.
- Reduced evidence units: 20.
- Section count: 38.
- Generated DOCX count: 2.
- Production eligibility: false.
- DOCX QA: 100/100 master, 100/100 institutional.
- Stale contamination: false.
- Spanish public text QA: passed.
- Cost: 64 OpenAI calls, 278,174 tokens, USD 0.683488, CAD 0.935139.
- Runtime: 910,570 ms.

### Method Selection Artifacts

- Path: same final Lab B run folder.
- Files:
  - `method-selection-evidence-context.json`
  - `method-selection-artifact.json`
  - `method-selection-validation-report.json`
  - `method-selection-report.md`
- Status: generated.
- Route: engineering.
- Confidence: high.
- Status after validation: provisional.
- Production-ready: no.

### DOCX Outputs

- Master DOCX: `C:\projects\ingeniometrix\artifacts-local\lab-b-full-diagnostic-docx-runs\case-002-shaking-table-control-systems\2026-05-07T05-15-31-767Z\12-master-docx-preview.docx`
- Institutional DOCX: `C:\projects\ingeniometrix\artifacts-local\lab-b-full-diagnostic-docx-runs\case-002-shaking-table-control-systems\2026-05-07T05-15-31-767Z\13-university-docx-preview.docx`
- Hero images in final run:
  - `cover-hero-master-d94ad1ec983f.png`
  - `cover-hero-university-b4f1df5c41bd.png`
- Note: after final run, code was changed so future runs should use a single shared `cover-hero-shared-*.png`.

## 14. Current Known Issues

### Blocking Before Production

- Source count and usable full-text source count are below the production threshold.
- User-provided PDFs lack explicit production review metadata.
- Two sources are adjacent/background and must not support central claims.
- Secondary references are detected but unrecovered/unselected/unvalidated.
- Method contract is not production-ready.
- Lab A Step 6 had LLM timeout warning and used fallback for dossiers.
- Production eligibility is intentionally false.

### Important Before Next Intake

- Remove/generalize old topic-specific fallback terms in Lab A runtime:
  - adaptive reuse / Toronto / mass timber in `source-evidence-planning.ts` and `consolidated-evidence.ts`.
- Remove/generalize case-specific seismic fallback presets from `scripts/run-evidence-candidate-search.ts`.
- Replace topic-specific test fixtures with neutral multi-domain fixtures where practical.
- Improve equation variable extraction/explanation from source-backed PDF context.
- Verify one shared hero image in a new targeted/full run if image generation is enabled.
- Recover/select additional direct method/control sources before production-quality run.

### Can Wait

- Visual polish after QA 100/100.
- Word `updateFields` warning unless users report field-update friction.
- UI for user-provided PDF upload/assignment.
- Broader cost optimization beyond existing telemetry/reduced pack.

### Technical Debt

- Dirty worktree is large: 54 modified tracked files and multiple untracked new files.
- A backup file under `backups/pre-integration-2026-05-03-1415/...` is modified and should likely be reverted or excluded before commit.
- Several artifact-local diagnostic reports/DOCX/PDF files should remain uncommitted.
- Some line-ending warnings appear in Git output.
- Some legacy runtime paths still contain topic-specific heuristics.

### Uncertain / Needs Review

- Whether the user-visible stale content earlier came from runtime fallback, old DOCX opened from previous folder, Word cache, or source-evidence-planning hardcoded text. Final scan is clean, but code risk remains.
- Whether the equation fallback images are visually good enough without a human DOCX page render review.
- Whether references are academically sufficient after secondary recovery is implemented.

## 15. Recommended Next Steps

1. Immediately remove or neutralize old hardcoded Lab A fallback topics and case-specific candidate-search presets before another arbitrary intake.
2. Add at least 1-2 stronger direct full-text sources for intake 2, preferably from the secondary-reference queue or fresh candidate expansion.
3. Add explicit production review metadata for user-provided PDFs, but do not weaken gates.
4. Improve equation variable/context extraction from source-backed assets and surrounding PDF text.
5. Run targeted tests first:
   - candidate keyword expansion
   - fresh-run isolation
   - method selection
   - source sufficiency
   - asset/equation layer
   - DOCX QA
6. Then run a targeted Lab A rerun only if source set changes.
7. Run full Lab B diagnostic only after Lab A source sufficiency improves or after the hardcoded fallback cleanup is complete.
8. Avoid:
   - weakening production gates
   - committing `artifacts-local`
   - adding browser automation/CAPTCHA workarounds
   - treating unrecovered secondary references as citations
   - trusting old fallback logic for the next intake

System readiness:

- Ready for another diagnostic intake only after hardcoded stale runtime fallback cleanup.
- Not ready for production-quality output until source sufficiency and user-provided PDF review are solved.

## 16. Git / Checkpoint Recommendation

### What Should Be Committed

Commit in reviewable batches rather than one giant commit:

1. Lab A evidence/source health/user PDF/secondary-reference improvements.
2. Shared quality guards: source health, source sufficiency, evidence budget, telemetry, production safety, fresh-run isolation.
3. Method Selection and method generation contract.
4. Lab B semantic source use, consistency matrix, section generation, editorial/public cleanup.
5. DOCX renderer/QA/equation/hero improvements.
6. Test scripts and package scripts.
7. Handoff docs only if useful for reviewer history.

### What Should Not Be Committed

- `artifacts-local\...` generated runs, PDFs, DOCX, PNGs, JSON diagnostics, telemetry dumps.
- User-provided PDF files.
- Candidate search artifacts.
- Local manual staging folders.
- Any secrets or `.env`.
- Backup file modifications unless intentionally reviewed.

### Tag Recommendation

After review and a clean commit series, create a tag such as:

- `checkpoint/intake-2-diagnostic-quality-pass`

Do not tag before removing or explicitly documenting the old topic-specific fallback risk.

### Backup Recommendation

Before cleanup/refactor:

- Create a local branch or worktree checkpoint.
- Preserve final diagnostic artifact folders outside Git if needed:
  - Lab A: `C:\projects\ingeniometrix\artifacts-local\evidence-selected-source-runs\case-002-shaking-table-control-systems\2026-05-07T04-22-09-727Z`
  - Lab B: `C:\projects\ingeniometrix\artifacts-local\lab-b-full-diagnostic-docx-runs\case-002-shaking-table-control-systems\2026-05-07T05-15-31-767Z`

### Final Handoff Judgment

The recent work substantially improved diagnostic quality, traceability, DOCX reliability, method awareness, source/evidence alignment, and production safety. The most important reviewer decision is whether to first clean hardcoded stale fallback paths before another intake. My recommendation is yes: do that before the next broad-domain validation run.
