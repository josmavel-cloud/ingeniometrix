# Pipeline Cleanup Architecture Audit

Date: 2026-05-07

Scope audited:

- `scripts/`
- `server/blueprint-engine/`
- `server/blueprint-v2/`
- `blueprint_launch/server/`
- `app/api/labs/`
- `app/lab/`
- `components/labs/`
- `fixtures/`
- `package.json` scripts
- tests currently stored as `scripts/test-*.ts`
- backup folders as commit-risk only
- `artifacts-local/` as generated local state only

This is a documentation-only audit. No code was moved, deleted, refactored, optimized, or rerun. The audit used file inventory, package script inspection, import/search inspection, and mutable `latest` path search.

## Executive Summary

The pipeline now has many valuable safeguards, but the implementation has grown in a diagnostic-first shape. The highest cleanup need is not deleting code. It is separating stable production-shaped primitives from diagnostic orchestration, artifact writing, reports, and lab-only UI readers.

Main findings:

- There are overlapping runners for Lab A, Lab B, dry runs, smoke runs, and diagnostics.
- The largest runner, `scripts/run-lab-b-full-diagnostic-docx.ts`, mixes orchestration, artifact IO, safety checks, dashboard/report writing, method selection, DOCX generation, and comparison metadata.
- Lab A runtime under `blueprint_launch/server/` remains mostly isolated, but several files are large and now carry integration-era compatibility logic.
- Mutable `latest` artifact readers still exist in legacy/lab paths. These are acceptable for lab/debug views but must stay out of production execution.
- Many reusable utilities already exist under `server/blueprint-engine/quality/`, but some large modules should eventually be split by schema, context building, validation, telemetry, and report writing.
- `app/api/labs/`, `app/lab/`, and `components/labs/` are useful lab-only surfaces and should remain isolated from production routes.
- Backup files and generated artifacts are the clearest commit-risk items.

Recommended cleanup posture before the next intake:

1. Do not restructure Lab A or Lab B core yet.
2. Create a checkpoint first.
3. Extract shared diagnostic IO/report helpers only if cleanup work resumes before the next intake.
4. Leave runner behavior stable until there is a small wrapper/helper extraction with tests.

## Finding Table

### PCA-001 - Flat diagnostic script accumulation

| Field | Value |
| --- | --- |
| File/path | `scripts/` |
| Current role | Mixed local scripts, diagnostic runners, smoke scripts, tests, DB/taxonomy utilities, package wrappers |
| Current consumers/importers | `package.json` scripts; developers run them directly with `tsx`/`node`; several scripts import runtime modules |
| Classification | diagnostic runner / lab-only utility / test-only |
| Cleanup recommendation | move later, or keep flat until a scripts convention is documented |
| Risk if changed | medium |
| Safe before next intake | no, except documentation and package script notes |
| Tests exist | yes, many `scripts/test-*.ts` |
| Suggested validation command | `npx tsc --noEmit --pretty false` plus all moved script package aliases |

Rationale: the flat convention is noisy but currently predictable. Moving files now would risk breaking package scripts and local instructions. Prefer a later batch that creates `scripts/diagnostics/`, `scripts/tests/`, and `scripts/legacy/` only after wrappers preserve old aliases.

### PCA-002 - Lab B full diagnostic runner is too large

| Field | Value |
| --- | --- |
| File/path | `scripts/run-lab-b-full-diagnostic-docx.ts` |
| Current role | Full Lab B diagnostic orchestration from handoff to DOCX, including safety checks, reduced evidence, method selection, fresh-run scan, hero handling, telemetry, dashboards, report writing |
| Current consumers/importers | `package.json` script `diagnose:lab-b-full-docx`; direct CLI usage; imports many `server/blueprint-engine/quality/*` and `server/blueprint-v2/*` modules |
| Classification | diagnostic runner |
| Cleanup recommendation | split, then convert current file to thin wrapper |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | partial: many focused tests cover helpers, but no full runner unit test without side effects |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-fresh-run-isolation.ts`; `npx tsx scripts/test-method-selection.ts`; `npx tsx scripts/test-evidence-budget.ts`; `npx tsx scripts/test-run-telemetry.ts`; controlled diagnostic rerun only after helper extraction |

Recommended split targets:

- diagnostic CLI argument parsing
- run folder resolution and artifact writer
- degraded input warning builder
- fresh-run and stale-content report writer
- method selection artifact writer
- DOCX artifact manifest writer
- telemetry/dashboard/readiness writer
- final markdown report writer

### PCA-003 - Evidence selected-source runner mixes pipeline execution and diagnostics

| Field | Value |
| --- | --- |
| File/path | `scripts/run-evidence-selected-sources-steps-2-6.ts` |
| Current role | Runs Lab A Steps 2-6 from selected sources, stop-on-block gates, manual/user-provided PDF import, reduced evidence pack, telemetry/dashboard/report writing |
| Current consumers/importers | `package.json` script `run:evidence-selected-sources`; direct CLI use; imports Lab A server modules and shared quality modules |
| Classification | diagnostic runner / temporary bridge |
| Cleanup recommendation | split, then convert to thin wrapper |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: `test:selected-source-block-gate`, `test:user-provided-pdf-import`, source health/citation/safety tests |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-selected-source-runner-block-gate.ts`; `npx tsx scripts/test-user-provided-pdf-import.ts`; `npx tsx scripts/test-source-health.ts`; `npx tsx scripts/test-citation-semantics.ts` |

This runner should eventually delegate to shared helpers for artifact copying, summary writing, source replacement reports, reduced evidence packs, telemetry, and user-provided PDF manifest loading.

### PCA-004 - Candidate search runner has overlapping responsibilities

| Field | Value |
| --- | --- |
| File/path | `scripts/run-evidence-candidate-search.ts` |
| Current role | Loads intake fixtures, builds keyword-category query strategy, calls candidate search providers, expands/deduplicates/ranks candidates, writes source-selection artifacts and reports |
| Current consumers/importers | `package.json` scripts `search:evidence-candidates`, `search:evidence-candidates:expand`; direct CLI use |
| Classification | diagnostic runner / lab-only utility |
| Cleanup recommendation | split into query planner, provider runner, candidate normalizer, dedupe/ranker, artifact writer |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: `scripts/test-candidate-search-keyword-expansion.ts`, `scripts/test-stale-fallback-cleanup.ts` |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-candidate-search-keyword-expansion.ts`; `npx tsx scripts/test-stale-fallback-cleanup.ts`; one targeted candidate search after cleanup |

This file was recently cleaned for stale fallback risk. Avoid structural changes until the second-intake retrieval loop is stable.

### PCA-005 - Duplicate Lab B runners overlap with the full diagnostic runner

| Field | Value |
| --- | --- |
| File/path | `scripts/run-master-blueprint-lab-steps-5-11.ts`, `scripts/run-master-blueprint-step-10.ts`, `scripts/run-master-blueprint-steps-11-13.ts`, `scripts/run-lab-b-diagnostic-ingestion.ts`, `scripts/run-lab-b-full-diagnostic-docx.ts` |
| Current role | Older step-specific Lab B lab runners and newer full diagnostic runner |
| Current consumers/importers | `package.json` lab/debug scripts; direct CLI use |
| Classification | diagnostic runner / legacy-obsolete candidate |
| Cleanup recommendation | archive or mark legacy later; keep until full diagnostic runner is stable across more intakes |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | partial smoke and focused helper tests |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-docx-structural-qa.ts`; `npx tsx scripts/test-section-evidence-binding.ts` |

The old step runners still provide useful fallback debugging. Do not delete until the new runner has stable smoke coverage.

### PCA-006 - Duplicate Lab A runners overlap with selected-source runner

| Field | Value |
| --- | --- |
| File/path | `scripts/run-blueprint-launch-steps-1-6.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts`, `scripts/smoke-blueprint-launch-current-state.mjs`, `scripts/validate-evidence-handoff-contract.ts` |
| Current role | Legacy/current Lab A step execution, selected-source integration execution, smoke/contract validation |
| Current consumers/importers | package scripts or direct CLI use; contract adapter scripts |
| Classification | diagnostic runner / legacy lab runner / temporary bridge |
| Cleanup recommendation | keep isolated; later archive old smoke/latest-based flows after selected-source flow is production-shaped |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes, but mostly focused |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-blueprint-contract-boundary.ts`; `npx tsx scripts/test-production-safety-and-contamination-guards.ts` |

`run-blueprint-launch-steps-1-6.ts` reads `latest-consolidated-evidence.json` for comparison baseline. That is useful in legacy Lab A but should remain non-production.

### PCA-007 - Lab A core is isolated but large

| Field | Value |
| --- | --- |
| File/path | `blueprint_launch/server/source-access-resolution.ts`, `source-evidence-planning.ts`, `source-content-materialization.ts`, `source-signal-extraction.ts`, `consolidated-evidence.ts` |
| Current role | Frozen Lab A runtime for source access, planning, materialization, extraction, consolidation |
| Current consumers/importers | Lab A scripts, selected-source runner, adapters, legacy UI/debug pages |
| Classification | production-shaped core / legacy isolated lab code |
| Cleanup recommendation | keep; split later only after production contracts are stable |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | indirect: source health, citation semantics, production safety, user PDF tests |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-source-health.ts`; `npx tsx scripts/test-citation-semantics.ts`; `npx tsx scripts/test-user-provided-pdf-import.ts` |

Several files exceed a healthy module size. Cleanup should extract pure helpers only after behavior is locked and backed by fixtures.

### PCA-008 - Lab A mutable latest artifact writers/readers remain

| Field | Value |
| --- | --- |
| File/path | `blueprint_launch/server/consolidated-evidence.ts`, `debug-run-store.ts`, `selected-source-bundle.ts`, `source-content-materialization.ts`, `scripts/run-blueprint-launch-steps-1-6.ts`, `scripts/smoke-blueprint-launch-current-state.mjs` |
| Current role | Legacy local/latest artifact state for Lab A debug and compatibility |
| Current consumers/importers | Legacy Lab A UI, smoke scripts, compatibility adapter paths |
| Classification | legacy/obsolete risk in production; lab-only utility in current use |
| Cleanup recommendation | keep but quarantine; add production guard documentation |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: fresh-run isolation detects mutable latest refs downstream |
| Suggested validation command | `npx tsx scripts/test-fresh-run-isolation.ts`; `npx tsx scripts/test-production-safety-and-contamination-guards.ts` |

These paths are not inherently wrong for local labs, but production-shaped runs must consume immutable handoff/run artifacts instead.

### PCA-009 - Contract adapters are temporary but central

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`, `server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter.ts` |
| Current role | Bridge current Lab A artifacts to `EvidenceEngineHandoffV1` and Lab B-compatible input |
| Current consumers/importers | backend dry-run scripts, selected-source runner, Lab B diagnostic ingestion, Lab B full diagnostic runner, contract/safety tests |
| Classification | temporary bridge/adapter |
| Cleanup recommendation | keep until production wiring; split large adapter later |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: blueprint contract boundary, production safety, source health, citation semantics |
| Suggested validation command | `npx tsx scripts/test-blueprint-contract-boundary.ts`; `npx tsx scripts/test-production-safety-and-contamination-guards.ts` |

`current-lab-a-handoff-adapter.ts` is large and still has compatibility with mutable latest references. Fresh-run guards now mitigate downstream risk, but the adapter should eventually prefer explicit artifact paths only.

### PCA-010 - Shared quality modules are production-shaped but uneven in size

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/*` |
| Current role | Production safety, citation semantics, source health, evidence budget, run telemetry, readiness dashboard, fresh-run isolation, method selection, source sufficiency, semantic source policy, user-provided PDF manifest utilities |
| Current consumers/importers | Evidence selected-source runner, Lab B full diagnostic runner, tests, method generation contract |
| Classification | production-shaped core |
| Cleanup recommendation | keep; split only largest files by responsibility |
| Risk if changed | medium to high |
| Safe before next intake | mostly no; small docs only |
| Tests exist | yes, focused scripts cover most modules |
| Suggested validation command | all quality tests: `test-production-safety`, `test-citation-semantics`, `test-source-health`, `test-evidence-budget`, `test-run-telemetry`, `test-production-readiness-dashboard`, `test-method-selection`, `test-user-provided-pdf-import` |

The directory is now the best candidate for stable shared policy. Avoid moving it. Instead split `method-selection.ts` and other large files into internal submodules later.

### PCA-011 - Method selection module is too broad

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/method-selection.ts` |
| Current role | Method selection schema, context selection, LLM pass, fallback, validation, scoring, route-specific requirements, report/caching helpers |
| Current consumers/importers | `scripts/run-lab-b-full-diagnostic-docx.ts`, `scripts/test-method-selection.ts`, method generation contract tests |
| Classification | production-shaped core |
| Cleanup recommendation | split |
| Risk if changed | medium/high |
| Safe before next intake | no |
| Tests exist | yes: `scripts/test-method-selection.ts` |
| Suggested validation command | `npx tsx scripts/test-method-selection.ts`; `npx tsx scripts/test-method-generation-contract.ts` |

Suggested split:

- `method-selection/schema.ts`
- `method-selection/context.ts`
- `method-selection/llm.ts`
- `method-selection/validation.ts`
- `method-selection/report.ts`
- `method-selection/cache.ts`

### PCA-012 - Evidence budget and telemetry are good shared cores but should own more IO

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/evidence-budget.ts`, `run-telemetry.ts`, `production-readiness-dashboard.ts` |
| Current role | Reduced evidence pack, telemetry summaries, dashboard/readiness reports |
| Current consumers/importers | Lab A selected-source runner, Lab B full diagnostic runner, comparison script, tests |
| Classification | production-shaped core |
| Cleanup recommendation | keep; convert repeated runner-side dashboard writing into shared writers |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | yes |
| Suggested validation command | `npx tsx scripts/test-evidence-budget.ts`; `npx tsx scripts/test-run-telemetry.ts`; `npx tsx scripts/test-production-readiness-dashboard.ts` |

The logic is reusable; repeated file writing is still mostly in scripts.

### PCA-013 - Fresh-run isolation exists, but latest readers remain in lab UI

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/fresh-run-isolation.ts`, `server/blueprint-v2/lab/artifact-reader.ts`, `app/api/labs/master-blueprint/artifacts/latest/route.ts`, `app/lab/master-blueprint/*`, `components/labs/master-blueprint/*` |
| Current role | Fresh-run guard plus lab UI latest-artifact readers |
| Current consumers/importers | Lab B full diagnostic runner, lab API routes, lab pages/components |
| Classification | production-shaped guard plus lab-only utility |
| Cleanup recommendation | keep guards; label latest readers lab-only; never promote to production |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | yes for guard; limited for UI |
| Suggested validation command | `npx tsx scripts/test-fresh-run-isolation.ts`; Next typecheck/build when UI changes resume |

This is a key architectural boundary: latest readers are acceptable for lab browsing but not for production execution.

### PCA-014 - Lab B planning file is extremely large

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-v2/lab/prompt-planning-hybrid.ts` |
| Current role | Step 8 planning, section plan shaping, editorial/method/evidence policy incorporation, report shaping |
| Current consumers/importers | Lab B pipeline/runners and section generation flow |
| Classification | production-shaped core / lab legacy hybrid |
| Cleanup recommendation | split |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | indirect: editorial, structure, method, semantic source, section evidence tests |
| Suggested validation command | `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-editorial-output-enforcement.ts`; `npx tsx scripts/test-academic-structure-layer.ts`; `npx tsx scripts/test-method-generation-contract.ts` |

Suggested split:

- plan schema and defaults
- evidence/method integration
- title/keywords planning
- section budget planning
- consistency matrix planning
- report serialization

### PCA-015 - Lab B document compiler and renderer are too broad

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-v2/lab/academic-document-compiler.ts`, `server/blueprint-v2/lab/docx-renderer.ts` |
| Current role | Academic document model assembly, public text normalization, section layout, assets/tables/equations, DOCX rendering, captions, appendices |
| Current consumers/importers | Lab B runner and DOCX output path |
| Classification | production-shaped core |
| Cleanup recommendation | split after a visual/DOCX stability checkpoint |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: DOCX structural QA, project management, asset/equation, Spanish public text |
| Suggested validation command | `npx tsx scripts/test-docx-structural-qa.ts`; `npx tsx scripts/test-project-management-content.ts`; `npx tsx scripts/test-asset-equation-layer.ts`; `npx tsx scripts/test-spanish-public-text-layer.ts` |

Do not split before a golden-output comparison process exists, because subtle DOCX regressions are easy.

### PCA-016 - Consistency matrix and section generation are large but essential

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-v2/sections/consistency-matrix-engine.ts`, `section-generation-engine.ts`, `section-generation-prompt.ts`, `section-generation-fallback.ts` |
| Current role | Section drafting, evidence binding, consistency matrix, fallback section generation, section-level validation |
| Current consumers/importers | Lab B pipeline and diagnostic runner |
| Classification | production-shaped core |
| Cleanup recommendation | split only by pure helper boundaries; keep behavior stable |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes: section evidence binding, academic structure, method generation contract |
| Suggested validation command | `npx tsx scripts/test-section-evidence-binding.ts`; `npx tsx scripts/test-academic-structure-layer.ts`; `npx tsx scripts/test-method-generation-contract.ts` |

Priority cleanup is reducing duplicate prompt/validation logic, not changing generation semantics.

### PCA-017 - Editorial policy modules are reusable but should stay together for now

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-v2/editorial/*` |
| Current role | Academic editorial policy, capitalization, hero infographic policy, project management policy, Spanish/public normalization |
| Current consumers/importers | Lab B planning, compiler, renderer, tests |
| Classification | production-shaped core |
| Cleanup recommendation | keep |
| Risk if changed | medium |
| Safe before next intake | yes only for documentation or test-only improvements |
| Tests exist | yes |
| Suggested validation command | `npx tsx scripts/test-academic-editorial-policy.ts`; `npx tsx scripts/test-hero-infographic-policy.ts`; `npx tsx scripts/test-project-management-content.ts`; `npx tsx scripts/test-spanish-public-text-layer.ts` |

These modules are relatively cohesive compared with runner and Lab B orchestration files.

### PCA-018 - Lab source selection UI is temporary but currently useful

| Field | Value |
| --- | --- |
| File/path | `app/lab/evidence-source-selection/page.tsx`, `components/labs/evidence-source-selection/evidence-source-selection-lab.tsx`, `app/api/labs/evidence-source-selection/*` |
| Current role | Lab-only UI/API to inspect candidate search runs and save selected source IDs |
| Current consumers/importers | Developer/user in local browser; candidate search artifacts |
| Classification | lab-only utility / temporary bridge |
| Cleanup recommendation | keep isolated; later replace with production source-selection flow |
| Risk if changed | medium |
| Safe before next intake | no, unless fixing a blocking source-selection issue |
| Tests exist | limited; no strong UI test |
| Suggested validation command | `npx tsc --noEmit --pretty false`; manual open `http://localhost:3000/lab/evidence-source-selection` |

This should not be merged into production routes until auth, persistence, and source selection contracts are ready.

### PCA-019 - Master blueprint lab UI uses mutable latest artifacts

| Field | Value |
| --- | --- |
| File/path | `app/lab/master-blueprint/*`, `app/api/labs/master-blueprint/*`, `components/labs/master-blueprint/*`, `server/blueprint-v2/lab/artifact-reader.ts` |
| Current role | Lab browsing/execution UI for Master Blueprint artifacts and latest run state |
| Current consumers/importers | Local lab pages and API routes |
| Classification | lab-only utility / legacy lab code |
| Cleanup recommendation | keep isolated; add warning docs; do not use in production |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | partial smoke only |
| Suggested validation command | `npx tsc --noEmit --pretty false`; smoke only if lab UI is touched |

Latest artifact reads here are a known lab convenience. Production execution should use immutable run IDs and handoff hashes.

### PCA-020 - Fixtures mix real intake benchmarks and synthetic lab fixtures

| Field | Value |
| --- | --- |
| File/path | `fixtures/intakes/*`, `fixtures/labs/master-blueprint/*` |
| Current role | Intake cases, backend dry-run fixtures, lab synthetic evidence fixtures |
| Current consumers/importers | Candidate search runner, backend dry-run runner, tests/lab runners |
| Classification | fixture/benchmark |
| Cleanup recommendation | keep; later split `fixtures/intakes/realistic/` and `fixtures/tests/neutral/` |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | yes, but not all fixtures are test-only |
| Suggested validation command | candidate search tests and backend dry run |

Case-specific fixtures are acceptable as fixtures. They should not leak into reusable runtime defaults.

### PCA-021 - Some tests still use case-specific or domain-specific text

| Field | Value |
| --- | --- |
| File/path | `scripts/test-*.ts`, especially method/hero/equation/source tests |
| Current role | Lightweight regression tests |
| Current consumers/importers | package scripts; developers |
| Classification | test-only |
| Cleanup recommendation | keep flat for now; later neutralize synthetic fixtures |
| Risk if changed | low/medium |
| Safe before next intake | no, unless a stale contamination test is failing |
| Tests exist | this is test code |
| Suggested validation command | all `test:*` scripts in `package.json` |

Case-specific terms are acceptable in tests only when testing stale-content detection or realistic fixtures. Generic policy tests should use neutral synthetic text.

### PCA-022 - Package scripts are complete but noisy

| Field | Value |
| --- | --- |
| File/path | `package.json` scripts |
| Current role | Main local command registry for dev, diagnostics, tests, DB, taxonomy, lab, smoke, debug |
| Current consumers/importers | Developers and Codex runs |
| Classification | lab-only utility / diagnostic runner / package command registry |
| Cleanup recommendation | rename/group later; keep aliases stable before next intake |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | scripts themselves are validation commands |
| Suggested validation command | `npm run <alias>` smoke for changed aliases; `npx tsc --noEmit --pretty false` |

Potentially unclear or legacy commands:

- `debug:blueprint*`
- `debug:master-blueprint*`
- `debug:workflow*`
- `lab:master-blueprint:*`
- `smoke:*`

Do not remove yet. Later add comments in a runbook or replace with namespaced aliases like `legacy:*`, `diagnose:*`, and `test:*`.

### PCA-023 - Artifact/report writing is duplicated across scripts

| Field | Value |
| --- | --- |
| File/path | `scripts/run-lab-b-full-diagnostic-docx.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts`, `scripts/run-evidence-candidate-search.ts`, `scripts/compare-diagnostic-runs.ts`, `scripts/run-lab-b-diagnostic-ingestion.ts` |
| Current role | Each script writes JSON, Markdown, summaries, run folders, and sometimes dashboards |
| Current consumers/importers | Direct CLI outputs |
| Classification | diagnostic runner |
| Cleanup recommendation | convert to shared helper |
| Risk if changed | medium |
| Safe before next intake | maybe, if limited to additive helpers and no behavior change |
| Tests exist | indirect |
| Suggested validation command | `npx tsc --noEmit --pretty false`; runner-specific tests; no full pipeline until helper extraction is complete |

Suggested shared helper:

- `scripts/lib/run-artifacts.ts` or `server/blueprint-engine/diagnostics/artifact-writer.ts`
- `writeJsonArtifact`
- `writeMarkdownReport`
- `copyInputArtifact`
- `createTimestampedRunFolder`
- `safeRelativeRunPath`

### PCA-024 - Telemetry/dashboard/readiness writers are split between core and scripts

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/run-telemetry.ts`, `production-readiness-dashboard.ts`, runners |
| Current role | Core computes summaries; scripts decide file naming/writing |
| Current consumers/importers | Lab A and Lab B diagnostic runners |
| Classification | production-shaped core plus diagnostic runner |
| Cleanup recommendation | convert to shared writer |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | yes |
| Suggested validation command | `npx tsx scripts/test-run-telemetry.ts`; `npx tsx scripts/test-production-readiness-dashboard.ts` |

Keep computation in core; extract only repeatable IO naming and markdown formatting later.

### PCA-025 - User-provided PDF manifest utilities are correctly shared

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-engine/quality/user-provided-source-pdfs.ts`, `scripts/prepare-user-provided-source-pdfs.ts`, `blueprint_launch/server/source-content-materialization.ts` |
| Current role | Safe local PDF manifest creation and local materialization override for selected source IDs |
| Current consumers/importers | PDF prepare script, selected-source runner, materialization step, tests |
| Classification | production-shaped core / diagnostic runner |
| Cleanup recommendation | keep; make prepare script a thin wrapper later |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | yes |
| Suggested validation command | `npx tsx scripts/test-user-provided-pdf-import.ts` |

This is a good pattern for future cleanup: shared reusable logic in server, thin CLI wrapper in scripts.

### PCA-026 - Backup folder is a commit risk

| Field | Value |
| --- | --- |
| File/path | `backups/pre-integration-2026-05-03-1415/*` |
| Current role | Local backup/checkpoint copy |
| Current consumers/importers | None expected |
| Classification | backup/commit risk |
| Cleanup recommendation | archive outside repo or ensure ignored; do not treat as runtime |
| Risk if changed | low for runtime, medium for accidental loss |
| Safe before next intake | yes, but only as git hygiene, not code cleanup |
| Tests exist | not applicable |
| Suggested validation command | `git status --short`; verify no backup files staged |

One backup file appears modified in git status. It should not be included in runtime cleanup commits.

### PCA-027 - `artifacts-local/` is generated state and must remain uncommitted

| Field | Value |
| --- | --- |
| File/path | `artifacts-local/` |
| Current role | Local diagnostic outputs, candidate runs, evidence runs, Lab B runs, DOCX files, reports |
| Current consumers/importers | Diagnostic scripts and lab UIs read specific folders |
| Classification | generated artifact |
| Cleanup recommendation | keep ignored; never use as source code |
| Risk if changed | high if deleted; low if ignored |
| Safe before next intake | no deletion; yes to verify ignore status |
| Tests exist | not applicable |
| Suggested validation command | `git status --ignored --short artifacts-local` if needed |

Do not commit `artifacts-local`. Use reports only as local evidence unless explicitly promoted to docs.

### PCA-028 - Production and diagnostic modes are mixed in runners

| Field | Value |
| --- | --- |
| File/path | `scripts/run-lab-b-full-diagnostic-docx.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts` |
| Current role | Diagnostic execution with production-shaped gates and summaries |
| Current consumers/importers | Direct CLI/package scripts |
| Classification | diagnostic runner |
| Cleanup recommendation | split mode config and gate evaluation into shared helper |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | yes for gates, not full mode composition |
| Suggested validation command | `npx tsx scripts/test-production-safety-and-contamination-guards.ts`; `npx tsx scripts/test-fresh-run-isolation.ts`; controlled diagnostic rerun only after refactor |

The gates themselves are valuable. The cleanup should make mode behavior explicit: `diagnostic`, `production_dry_run`, `production`.

### PCA-029 - Server blueprint-v2 evidence acquisition may overlap with Lab A

| Field | Value |
| --- | --- |
| File/path | `server/blueprint-v2/evidence/*`, `server/blueprint-v2/source/*` |
| Current role | Older Lab B evidence/source acquisition helpers |
| Current consumers/importers | Need follow-up import audit before changes |
| Classification | legacy/obsolete candidate |
| Cleanup recommendation | archive later if unused; keep until import audit |
| Risk if changed | medium/high |
| Safe before next intake | no |
| Tests exist | unclear |
| Suggested validation command | import search plus `npx tsc --noEmit --pretty false` |

Do not delete until confirmed unused by UI, lab runner, or production routes.

### PCA-030 - Large lab UI components are not Release 0 production UI

| Field | Value |
| --- | --- |
| File/path | `components/labs/master-blueprint/master-blueprint-lab.tsx`, `step-7-reader.tsx`, `step-9-reader.tsx`, `final-outputs-reader.tsx`, `section-reader.tsx` |
| Current role | Lab artifact readers and displays |
| Current consumers/importers | `app/lab/master-blueprint/*` |
| Classification | lab-only utility |
| Cleanup recommendation | keep isolated; split only when UI work resumes |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | limited |
| Suggested validation command | `npx tsc --noEmit --pretty false`; manual lab UI check |

These components should not influence production UX decisions until source selection and project workspace UI are wired.

### PCA-031 - Debug scripts should be archived after stable runbooks exist

| Field | Value |
| --- | --- |
| File/path | `scripts/debug-*.mjs`, `scripts/smoke-*.mjs`, old generated example scripts |
| Current role | Historical debugging and smoke checks |
| Current consumers/importers | package debug/smoke scripts or direct use |
| Classification | legacy/obsolete / lab-only utility |
| Cleanup recommendation | archive later |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | smoke scripts themselves |
| Suggested validation command | `npx tsc --noEmit --pretty false`; targeted smoke only if retained |

Keep until the cleanup creates a documented modern diagnostic command set.

### PCA-032 - Test scripts should eventually move or be wrapped, not renamed abruptly

| Field | Value |
| --- | --- |
| File/path | `scripts/test-*.ts` |
| Current role | Lightweight test suite without a test runner framework |
| Current consumers/importers | `package.json` `test:*` aliases and direct CLI |
| Classification | test-only |
| Cleanup recommendation | keep flat now; later move to `scripts/tests/` with package aliases preserved |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | this is test code |
| Suggested validation command | all `test:*` aliases touched by move |

Flat scripts are currently ugly but operational. A move should be mechanical and scripted only after a branch/checkpoint.

### PCA-033 - Source selection lab API reads local artifacts directly

| Field | Value |
| --- | --- |
| File/path | `app/api/labs/evidence-source-selection/_shared.ts`, `run/route.ts`, `runs/route.ts`, `save/route.ts` |
| Current role | Local artifact-backed candidate source selection |
| Current consumers/importers | Source selection lab page |
| Classification | lab-only utility / temporary bridge |
| Cleanup recommendation | keep; later replace with project-scoped API and DB persistence |
| Risk if changed | medium |
| Safe before next intake | no |
| Tests exist | no dedicated route test |
| Suggested validation command | `npx tsc --noEmit --pretty false`; manual source selection UI check |

This is intentionally not production persistence. It should not be expanded except for MVP workflow needs.

### PCA-034 - Current file sizes indicate responsibility hotspots

| Field | Value |
| --- | --- |
| File/path | Large files over roughly 800 lines |
| Current role | Hotspots across Lab A, Lab B, diagnostics, and lab UI |
| Current consumers/importers | Multiple |
| Classification | mixed |
| Cleanup recommendation | split in staged batches |
| Risk if changed | high |
| Safe before next intake | no |
| Tests exist | varies |
| Suggested validation command | full focused test set after each split |

Largest hotspots:

- `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
- `scripts/run-lab-b-full-diagnostic-docx.ts`
- `server/blueprint-v2/lab/academic-document-compiler.ts`
- `server/blueprint-engine/quality/method-selection.ts`
- `components/labs/master-blueprint/master-blueprint-lab.tsx`
- `server/blueprint-v2/lab/docx-renderer.ts`
- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/source-signal-extraction.ts`
- `blueprint_launch/server/source-access-resolution.ts`
- `scripts/run-evidence-candidate-search.ts`
- `server/blueprint-v2/sections/consistency-matrix-engine.ts`
- `scripts/run-evidence-selected-sources-steps-2-6.ts`

## Specific Audit Topics

### 1. Duplicate or overlapping runners

Overlaps found:

- Lab A complete/legacy: `scripts/run-blueprint-launch-steps-1-6.ts`
- Lab A selected-source integration: `scripts/run-evidence-selected-sources-steps-2-6.ts`
- Lab B ingestion preview: `scripts/run-lab-b-diagnostic-ingestion.ts`
- Lab B full diagnostic: `scripts/run-lab-b-full-diagnostic-docx.ts`
- Older Lab B step runners: `scripts/run-master-blueprint-lab-steps-5-11.ts`, `scripts/run-master-blueprint-step-10.ts`, `scripts/run-master-blueprint-steps-11-13.ts`
- Smoke/current-state scripts: `scripts/smoke-blueprint-launch-current-state.mjs`, `scripts/smoke-master-blueprint-lab-current-state.ts`

Recommendation: keep all for now, but mark older step runners and latest-based smoke scripts as legacy in a runbook. Do not delete before another full-intake verification cycle.

### 2. Scripts that should become thin wrappers

Best candidates:

- `scripts/run-lab-b-full-diagnostic-docx.ts`
- `scripts/run-evidence-selected-sources-steps-2-6.ts`
- `scripts/run-evidence-candidate-search.ts`
- `scripts/prepare-user-provided-source-pdfs.ts`
- `scripts/compare-diagnostic-runs.ts`

Thin wrappers should parse CLI args, call shared orchestration/helpers, and print final paths.

### 3. Diagnostic scripts that should move to `scripts/diagnostics`

Candidate move list:

- `run-backend-pipeline-dry-run.ts`
- `run-blueprint-engine-input-dry-run.ts`
- `run-lab-b-diagnostic-ingestion.ts`
- `run-lab-b-full-diagnostic-docx.ts`
- `run-evidence-candidate-search.ts`
- `run-evidence-selected-sources-steps-2-6.ts`
- `compare-diagnostic-runs.ts`
- smoke/debug scripts after runbook migration

Recommendation: do not move yet. First create wrappers or preserve package aliases.

### 4. Test scripts location

Current convention is flat `scripts/test-*.ts`. It is noisy but simple and package aliases already point there.

Recommendation: keep flat until cleanup batch C9. If moved, preserve `package.json` aliases and avoid changing test semantics.

### 5. Temporary adapters and bridges

Keep until production wiring:

- `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
- `server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter.ts`
- source selection lab APIs
- user-provided PDF manifest workflow
- Lab B full diagnostic runner

These are not throwaway anymore, but they are bridges. They should remain explicit and not be hidden as production services yet.

### 6. Legacy lab code that should remain isolated

Keep isolated:

- `blueprint_launch/server/*`
- `server/blueprint-v2/lab/*`
- `app/lab/*`
- `app/api/labs/*`
- `components/labs/*`

Do not wire lab latest readers into production routes.

### 7. Modules reading mutable latest artifacts

Mutable latest reads/writes found in:

- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/debug-run-store.ts`
- `blueprint_launch/server/selected-source-bundle.ts`
- `blueprint_launch/server/source-content-materialization.ts`
- `scripts/run-blueprint-launch-steps-1-6.ts`
- `scripts/smoke-blueprint-launch-current-state.mjs`
- `scripts/validate-evidence-handoff-contract.ts`
- `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
- `server/blueprint-v2/lab/artifact-reader.ts`
- `app/api/labs/master-blueprint/artifacts/latest/route.ts`
- `app/lab/master-blueprint/*`
- `components/labs/master-blueprint/*`

Classification:

- acceptable in lab/debug/latest browsing
- risky if used in production execution
- already guarded downstream by fresh-run isolation

Recommendation: keep but label and quarantine.

### 8. Package scripts that are obsolete, duplicated, unclear, or risky

Potentially unclear:

- `debug:blueprint*`
- `debug:master-blueprint*`
- `debug:workflow*`
- `lab:master-blueprint:*`
- `smoke:*`

Potentially duplicated:

- old Lab B step runners versus `diagnose:lab-b-full-docx`
- dry-run scripts versus full diagnostic ingestion

Risky to remove now because they are developer recovery tools. Later, move to `legacy:*` or document in `docs/runbooks/pipeline-diagnostics.md`.

### 9. Code paths mixing diagnostic and production behavior

Main paths:

- `scripts/run-lab-b-full-diagnostic-docx.ts`
- `scripts/run-evidence-selected-sources-steps-2-6.ts`
- readiness/dashboard writers in scripts
- adapters that tolerate latest paths for compatibility

Recommendation: create explicit mode config:

- `diagnostic`
- `diagnostic_allow_degraded`
- `production_dry_run`
- `production`

Then gate artifact readers and latest refs by mode.

### 10. Shared utilities to extract

Recommended shared helpers:

- artifact writer
- report writer
- run folder resolver
- telemetry writer
- dashboard writer
- production readiness writer
- PDF manifest utilities
- stale/fresh-run guards
- comparison metrics reader

Best location options:

- `server/blueprint-engine/diagnostics/` for shared diagnostic/reporting primitives
- `scripts/lib/` for CLI-only helpers

Prefer `server/blueprint-engine/diagnostics/` when the helper is useful to both Lab A and Lab B runners.

### 11. Files with too many responsibilities

Highest priority:

- `scripts/run-lab-b-full-diagnostic-docx.ts`
- `server/blueprint-v2/lab/prompt-planning-hybrid.ts`
- `server/blueprint-v2/lab/academic-document-compiler.ts`
- `server/blueprint-engine/quality/method-selection.ts`
- `server/blueprint-v2/lab/docx-renderer.ts`
- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/source-signal-extraction.ts`
- `blueprint_launch/server/source-access-resolution.ts`
- `scripts/run-evidence-candidate-search.ts`
- `scripts/run-evidence-selected-sources-steps-2-6.ts`
- `server/blueprint-v2/sections/consistency-matrix-engine.ts`

### 12. Tests using real/case-specific terms

Tests should retain case terms only when testing:

- stale-content detection
- realistic fixture behavior
- known regression cases

Generic policy tests should use neutral synthetic fixtures. Candidate scripts:

- `scripts/test-method-selection.ts`
- `scripts/test-hero-infographic-policy.ts`
- `scripts/test-asset-equation-layer.ts`
- `scripts/test-candidate-search-keyword-expansion.ts`
- `scripts/test-stale-fallback-cleanup.ts`

Do not change now unless a stale hardcoded runtime term is discovered.

### 13. Backups and generated artifacts that must not be committed

Do not commit:

- `backups/pre-integration-2026-05-03-1415/*`
- `artifacts-local/*`
- generated DOCX files under artifacts
- local PDF staging folders
- diagnostic run folders unless explicitly promoted as fixtures

Current backup folder should be reviewed before commit because at least one backup file appears modified in the working tree.

### 14. Critical issues discovered during audit

Do not fix in this audit, but track:

1. Large diagnostic runners are now operationally critical but fragile.
2. Mutable latest readers still exist in lab/legacy paths.
3. Production and diagnostic modes share runner files.
4. Tests are numerous but not centrally orchestrated.
5. Backup files are visible in git status and could be accidentally committed.
6. Lab B document generation has several large modules where small formatting changes can regress DOCX output.
7. Old step runners are still useful but not clearly labeled as legacy.

## Recommended Cleanup Sequence

### Batch C1

- goal: Create a safe cleanup checkpoint and commit hygiene boundary.
- files affected: `git status`, `backups/`, `artifacts-local/`, root docs, package script inventory.
- risk: low.
- validation tests: `git status --short`; `npx tsc --noEmit --pretty false`.

Actions:

- Confirm no `artifacts-local/` files are staged.
- Confirm backup files are not part of runtime commits.
- Add or update a runbook note for cleanup scope before moving code.

### Batch C2

- goal: Extract shared diagnostic artifact/report helpers without changing runner semantics.
- files affected: `scripts/run-lab-b-full-diagnostic-docx.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts`, `scripts/run-evidence-candidate-search.ts`, new `server/blueprint-engine/diagnostics/*` or `scripts/lib/*`.
- risk: medium.
- validation tests: `npx tsc --noEmit --pretty false`; `npx tsx scripts/test-run-telemetry.ts`; `npx tsx scripts/test-production-readiness-dashboard.ts`; `npx tsx scripts/test-fresh-run-isolation.ts`.

Actions:

- Extract JSON/Markdown writer.
- Extract timestamped run folder resolver.
- Extract common summary writer.
- Keep existing CLI names unchanged.

### Batch C3

- goal: Convert the biggest diagnostic runners into thin wrappers.
- files affected: `scripts/run-lab-b-full-diagnostic-docx.ts`, `scripts/run-evidence-selected-sources-steps-2-6.ts`, `scripts/run-evidence-candidate-search.ts`.
- risk: high.
- validation tests: all focused tests plus one controlled diagnostic rerun after refactor.

Actions:

- Move orchestration into named helper modules.
- Preserve CLI flags and output artifact names.
- Avoid behavior changes.

### Batch C4

- goal: Isolate Lab A compatibility and latest-artifact behavior.
- files affected: `blueprint_launch/server/consolidated-evidence.ts`, `source-signal-extraction.ts`, `source-access-resolution.ts`, `source-evidence-planning.ts`, `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`.
- risk: high.
- validation tests: `test-blueprint-contract-boundary`, `test-source-health`, `test-citation-semantics`, `test-user-provided-pdf-import`, `test-production-safety`.

Actions:

- Extract pure helpers from large Lab A modules.
- Keep Lab A runtime API stable.
- Add explicit labels for latest-based legacy artifact behavior.

### Batch C5

- goal: Split Method Selection into schema/context/LLM/validator/report/cache modules.
- files affected: `server/blueprint-engine/quality/method-selection.ts`, `method-generation-contract.ts`, tests.
- risk: medium/high.
- validation tests: `npx tsx scripts/test-method-selection.ts`; `npx tsx scripts/test-method-generation-contract.ts`; `npx tsx scripts/test-evidence-budget.ts`.

Actions:

- Preserve exported public functions.
- Move internals behind barrel exports.
- Avoid prompt or scoring changes in the same batch.

### Batch C6

- goal: Split Lab B planning and section generation by responsibility.
- files affected: `server/blueprint-v2/lab/prompt-planning-hybrid.ts`, `server/blueprint-v2/sections/*`.
- risk: high.
- validation tests: `test-academic-structure-layer`, `test-section-evidence-binding`, `test-method-generation-contract`, `test-editorial-output-enforcement`, typecheck.

Actions:

- Separate planning schema/defaults from prompt/context assembly.
- Separate consistency matrix alignment helpers.
- Preserve prompt text unless explicitly part of a later product-quality batch.

### Batch C7

- goal: Split DOCX compiler/renderer only after golden-output comparison exists.
- files affected: `server/blueprint-v2/lab/academic-document-compiler.ts`, `docx-renderer.ts`, `academic-document-model.ts`, DOCX QA helpers.
- risk: high.
- validation tests: `test-docx-structural-qa`, `test-project-management-content`, `test-asset-equation-layer`, `test-spanish-public-text-layer`, render comparison on a controlled diagnostic run.

Actions:

- Extract model normalization.
- Extract appendix builder.
- Extract asset/equation/table numbering.
- Extract DOCX OOXML patching and link policy.

### Batch C8

- goal: Quarantine lab UI/latest artifact readers from production code.
- files affected: `app/lab/*`, `app/api/labs/*`, `components/labs/*`, `server/blueprint-v2/lab/artifact-reader.ts`.
- risk: medium.
- validation tests: typecheck; manual lab UI check; no production route changes.

Actions:

- Add lab-only naming/comments.
- Ensure production routes do not import lab artifact readers.
- Keep source selection lab until production source selection is ready.

### Batch C9

- goal: Rationalize package scripts and test locations.
- files affected: `package.json`, `scripts/test-*.ts`, possible `scripts/tests/`, docs runbook.
- risk: medium.
- validation tests: every changed package alias; `npx tsc --noEmit --pretty false`.

Actions:

- Preserve old aliases temporarily.
- Add grouped scripts or runbook tables.
- Move tests only after wrappers exist.

### Batch C10

- goal: Archive obsolete debug scripts and old lab runners after replacement is proven.
- files affected: `scripts/debug-*.mjs`, `scripts/smoke-*.mjs`, old `run-master-blueprint-*` scripts, backups.
- risk: medium.
- validation tests: full focused test suite; one full diagnostic pipeline run if runner scripts changed.

Actions:

- Mark obsolete first.
- Archive later.
- Delete only after no package aliases or docs reference them.

## Safe Before Next Intake

Safe:

- documentation updates
- git hygiene/checkpoint
- backup/artifact commit-risk review
- no-op comments or runbook labeling

Not safe:

- moving scripts
- renaming package aliases
- splitting Lab A or Lab B core files
- changing latest artifact behavior
- changing runner CLI behavior
- deleting old debug or smoke scripts

## Final Recommendation

Before the next intake, do not perform broad cleanup. The system is in a functional but delicate integration state. The highest-value cleanup is C1 plus possibly C2 if there is time: extract shared artifact/report helpers while preserving every CLI flag and artifact filename.

After another full intake validates behavior, proceed through C3-C7 in small pull-request-sized batches, each with autodiagnosis and focused tests.
