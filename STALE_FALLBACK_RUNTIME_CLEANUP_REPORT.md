# Stale Fallback Runtime Cleanup Report

Generated: 2026-05-07  
Scope: targeted cleanup only; no pipeline rerun.

## Summary

The highest-risk stale fallback issue was topic-specific semantic text inside reusable runtime paths. The cleanup removed or neutralized old fallback terms from generation/search/planning paths while leaving intentional guard markers, tests, fixtures, docs, artifacts, and backups unchanged.

Runtime generation files now covered by `scripts/test-stale-fallback-cleanup.ts`:

- `blueprint_launch/server/source-evidence-planning.ts`
- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/source-signal-extraction.ts`
- `blueprint_launch/server/step1-intake-context.ts`
- `blueprint_launch/server/reference-search-lab.ts`
- `scripts/run-evidence-candidate-search.ts`
- `server/blueprint-v2/lab/domain-generation-profile.ts`

## Findings And Actions

| ID | File path | Term/content found | Classification | Runtime risk | Action | Changed |
|---|---|---|---|---|---|---|
| SF-001 | `blueprint_launch/server/source-evidence-planning.ts` | `adaptive reuse`, `Toronto`, `vacancy`, `underuse`, reutilizacion/vacancia fallback targets | Runtime contamination risk | High | Replaced section inference, methodology hints, framework hints, evidence targets, and missing-elements with neutral current-intake language. | Yes |
| SF-002 | `blueprint_launch/server/consolidated-evidence.ts` | fallback strategy emitted adaptive reuse, multicriteria reuse, vacancy/subutilization claims | Runtime contamination risk | High | Replaced fallback strategy/framework/method/proposal directions with neutral corpus-derived placeholders and validation-pending language. | Yes |
| SF-003 | `scripts/run-evidence-candidate-search.ts` | case-specific seismic isolation augmentation and knowledge-area override | Runtime contamination risk | High | Removed hardcoded case-specific search augmentation. Candidate search now uses current fixture/intake and keyword-category metadata only. | Yes |
| SF-004 | `blueprint_launch/server/reference-search-lab.ts` | hardcoded structural/shaking-table fallback and domain seed examples including adaptive reuse/mass timber | Runtime contamination risk | High | Removed structural-control fallback, disabled static domain seed examples, and forced fallback metadata to derive from current intake terms only. | Yes |
| SF-005 | `blueprint_launch/server/source-signal-extraction.ts` | scoring patterns weighted adaptive reuse, vacancy, demolition, mass timber, housing | Runtime contamination risk | Medium | Replaced with generic method/problem/variable/result/theory patterns. | Yes |
| SF-006 | `blueprint_launch/server/step1-intake-context.ts` | preserved terms included `mass timber`, `adaptive reuse` | Runtime contamination risk | Medium | Reduced preserved terms to generic methods only: `AHP`, `PRISMA`. | Yes |
| SF-007 | `server/blueprint-v2/lab/domain-generation-profile.ts` | domain classifier included `adaptive reuse` and `housing` as route triggers | Runtime contamination risk | Medium | Replaced architecture/urbanism route triggers with generic built-environment/spatial/territorial terms. | Yes |
| SF-008 | `server/blueprint-engine/quality/fresh-run-isolation.ts` | known old topic markers including adaptive reuse/mass timber/vacancia/Toronto | Acceptable guard marker | Low | Left intact because these are detector markers, not generation text. Test asserts this remains allowed only in detection module. | No |
| SF-009 | `scripts/test-*` | case-specific terms in synthetic tests | Test-only fixture | Low | Left intact unless imported into runtime; tests are allowed to contain stale markers and domain fixtures. | No |
| SF-010 | `blueprint_launch/fixtures/*`, `blueprint_launch/benchmarks/*` | synthetic old-topic fixtures and benchmark cases | Fixture/benchmark | Low to medium | Left intact for now. Recommended future cleanup: label them clearly or move stale fixtures out of default test paths. | No |
| SF-011 | `backups/pre-integration-2026-05-03-1415/...` | backup file modified before this task | Backup file | Medium if committed by accident | Not touched by this cleanup. Recommended: exclude or revert backup changes before commit. | No |
| SF-012 | `server/llm-usage-registry.ts`, `blueprint_launch/server/debug-run-store.ts` | `America/Toronto` timezone / Bank of Canada usage metadata | Package/timezone command/runtime utility | Low | Left intact; not semantic academic fallback content. | No |
| SF-013 | `artifacts-local/**` | many previous run/source/topic strings | Artifact/local output | None for runtime if not consumed | Not touched. Artifact folders must not be committed. | No |

## Runtime Terms Removed Or Neutralized

Removed/neutralized from reusable generation/search/planning paths:

- `adaptive reuse`
- `mass timber`
- `overbuild`
- `office-to-residential`
- `seismic isolation`
- `base isolation`
- `Peruvian buildings`
- `aisladores`
- `mesa vibratoria`
- `shaking table`
- `reutilizacion adaptativa`
- `vacancia`
- `subutilizacion`
- `parque edificado`
- selected case/source IDs and source-specific DOI patterns from runtime fallback checks

## Terms Intentionally Left

Left because they are not semantic generation fallbacks:

- Stale marker strings inside `server/blueprint-engine/quality/fresh-run-isolation.ts`.
- Domain-specific strings inside test fixtures.
- Domain-specific strings inside benchmark/synthetic fixtures.
- Local artifact content under `artifacts-local`.
- `America/Toronto` timezone utility strings.
- Backup file content under `backups/`.

## Verification Added

Added:

- `scripts/test-stale-fallback-cleanup.ts`
- package script: `test:stale-fallback-cleanup`

The test checks:

- runtime generation files do not contain stale topic/source fallback terms;
- candidate search no longer injects old case-specific search presets;
- Lab A evidence planning fallback contains neutral current-intake wording;
- consolidated evidence fallback no longer emits old topic-specific claims;
- stale-content guard markers remain allowed in the detection module.

## Remaining Cleanup Risks

- Some test and fixture files still contain old topics by design. They should not be imported into runtime behavior.
- The backup file under `backups/pre-integration-2026-05-03-1415/...` remains dirty in Git status and should not be committed without review.
- Candidate search still depends on current metadata quality; if the LLM planner is unavailable, fallback is now neutral but may be less domain-rich than the previous hardcoded examples.
- A future cleanup should add a repo-wide policy test that separates runtime, fixture, guard, docs, and artifacts more formally.
