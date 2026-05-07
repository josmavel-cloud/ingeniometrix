# Cleanup C1 Git Hygiene Report

Date: 2026-05-07

Scope: safe checkpoint and commit hygiene boundary only. No code was moved, refactored, deleted, or optimized. Lab A and Lab B were not rerun.

## Current Branch

- Branch: `restore-labs`

## Validation Run

- Command: `npx tsc --noEmit --pretty false`
- Result: passed
- Output summary: no TypeScript errors printed

## Staged State

- Staged files: none
- `git diff --cached --name-status` returned no entries.

## High-Level Changed File Categories

### Runtime / Production-Shaped Code Changes

These appear to be implementation changes from the recent remediation and intake-2 work. They may be safe to commit only after review as intentional product changes:

- `blueprint_launch/server/*`
- `server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts`
- `server/blueprint-engine/quality/*`
- `server/blueprint-v2/editorial/*`
- `server/blueprint-v2/lab/*`
- `server/blueprint-v2/prompts/*`
- `server/blueprint-v2/sections/*`
- `server/blueprint/blueprint-service.ts`
- `server/projects/topic-suggestion-service.ts`
- `server/reporting/*`
- `lib/topic-suggestion-scoring.ts`
- `scripts/run-*.ts`
- `scripts/compare-diagnostic-runs.ts`
- `package.json`
- `tsconfig.json`

### Test and Validation Changes

These are test-only or validation scripts added/modified during the remediation sequence:

- `scripts/test-*.ts`
- `scripts/prepare-user-provided-source-pdfs.ts`

### Documentation / Handoff Reports

These are safe to commit if the project wants durable local handoff documentation:

- `INTAKE_2_IMPROVEMENTS_HANDOFF.md`
- `PIPELINE_CLEANUP_AUDIT.md`
- `STALE_FALLBACK_RUNTIME_CLEANUP_REPORT.md`
- `CLEANUP_C1_GIT_HYGIENE_REPORT.md`

### Backup / Commit-Risk Changes

This file is in a backup folder and should not be committed with runtime work:

- `backups/pre-integration-2026-05-03-1415/blueprint-v2/lab/prompt-planning-hybrid.ts`

## Files Safe to Commit

Safe to commit after normal review:

- Documentation reports:
  - `INTAKE_2_IMPROVEMENTS_HANDOFF.md`
  - `PIPELINE_CLEANUP_AUDIT.md`
  - `STALE_FALLBACK_RUNTIME_CLEANUP_REPORT.md`
  - `CLEANUP_C1_GIT_HYGIENE_REPORT.md`

Conditionally safe to commit after code review and grouped validation:

- Remediation runtime files in `blueprint_launch/server/`
- Shared quality modules in `server/blueprint-engine/quality/`
- Lab B generation/rendering/policy files in `server/blueprint-v2/`
- Pipeline and diagnostic scripts in `scripts/`
- Test scripts in `scripts/test-*.ts`
- `package.json`
- `tsconfig.json`

## Files Not Safe to Commit

Do not commit:

- `artifacts-local/`
- local user-provided PDFs
- generated DOCX/PNG/PDF/JSON diagnostic artifacts
- backup folders
- `.env` or secret-bearing files

Currently visible commit risk:

- `backups/pre-integration-2026-05-03-1415/blueprint-v2/lab/prompt-planning-hybrid.ts`

No `.env` or obvious generated PDF/DOCX/PNG files appeared in normal `git status --short -uall`. Generated files are mostly under ignored `artifacts-local/`.

## Artifacts-Local Status

`artifacts-local/` is ignored/generated local state.

Ignored file count observed under `artifacts-local/`: `39039`

Largest ignored extension groups:

- `.png`: `14443`
- `.jpg`: `11112`
- `.json`: `4402`
- `.js`: `2988`
- `.map`: `2292`
- `.ts`: `1114`
- no-extension/other: `687`
- `.md`: `438`
- `.pdf`: `361`
- `.svg`: `215`
- `.bcmap`: `168`
- `.docx`: `163`

These should remain uncommitted unless a specific artifact is deliberately promoted into `fixtures/` or `docs/` in a later task.

## Backup / Commit Risks

Risk: medium.

Reason: a backup file is modified and visible in normal git status. It could be accidentally included by a broad command such as `git add -A`.

Risk file:

```text
backups/pre-integration-2026-05-03-1415/blueprint-v2/lab/prompt-planning-hybrid.ts
```

Recommendation:

- Do not include `backups/` in cleanup/runtime commits.
- Do not run `git add -A` for this checkpoint.
- If this backup change is accidental and the user approves discarding it later, handle it in a separate explicit action. This C1 report does not discard it.

## Recommended Commit Groups

### Commit Group 1 - Documentation and audit checkpoint

Purpose: durable handoff and cleanup planning only.

Suggested files:

```text
INTAKE_2_IMPROVEMENTS_HANDOFF.md
PIPELINE_CLEANUP_AUDIT.md
STALE_FALLBACK_RUNTIME_CLEANUP_REPORT.md
CLEANUP_C1_GIT_HYGIENE_REPORT.md
```

Suggested commit message:

```text
docs: add intake 2 handoff and cleanup audit checkpoint
```

### Commit Group 2 - Shared production safety and evidence quality layer

Purpose: commit stable shared quality modules and their tests together.

Suggested files include:

```text
server/blueprint-engine/quality/
server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts
scripts/test-production-safety-and-contamination-guards.ts
scripts/test-citation-semantics.ts
scripts/test-source-health.ts
scripts/test-evidence-budget.ts
scripts/test-run-telemetry.ts
scripts/test-production-readiness-dashboard.ts
scripts/test-fresh-run-isolation.ts
scripts/test-method-selection.ts
scripts/test-method-generation-contract.ts
scripts/test-secondary-reference-recovery.ts
scripts/test-semantic-source-use-policy.ts
scripts/test-source-sufficiency.ts
scripts/test-user-provided-pdf-import.ts
scripts/prepare-user-provided-source-pdfs.ts
package.json
```

Suggested commit message:

```text
feat: add pipeline safety quality and evidence diagnostics
```

### Commit Group 3 - Lab A integration and candidate/source workflow

Purpose: commit Lab A compatibility, selected-source execution, candidate expansion, manual PDF import integration, and related tests.

Suggested files include:

```text
blueprint_launch/server/
scripts/run-evidence-candidate-search.ts
scripts/run-evidence-selected-sources-steps-2-6.ts
scripts/run-blueprint-launch-steps-1-6.ts
scripts/test-candidate-search-keyword-expansion.ts
scripts/test-stale-fallback-cleanup.ts
scripts/test-selected-source-runner-block-gate.ts
package.json
```

Suggested commit message:

```text
feat: harden evidence engine diagnostic source workflow
```

### Commit Group 4 - Lab B generation, DOCX, editorial, and method integration

Purpose: commit Lab B output quality improvements and diagnostics.

Suggested files include:

```text
server/blueprint-v2/
server/reporting/
scripts/run-lab-b-diagnostic-ingestion.ts
scripts/run-lab-b-full-diagnostic-docx.ts
scripts/compare-diagnostic-runs.ts
scripts/test-academic-editorial-policy.ts
scripts/test-academic-structure-layer.ts
scripts/test-asset-equation-layer.ts
scripts/test-citation-reference-layer.ts
scripts/test-docx-structural-qa.ts
scripts/test-editorial-output-enforcement.ts
scripts/test-hero-infographic-policy.ts
scripts/test-project-management-content.ts
scripts/test-section-evidence-binding.ts
scripts/test-spanish-public-text-layer.ts
scripts/test-template-runtime-offline.ts
package.json
tsconfig.json
```

Suggested commit message:

```text
feat: improve lab b diagnostic academic document quality
```

### Commit Group 5 - Ancillary topic/project service updates

Purpose: keep service changes separate from pipeline-heavy commits.

Suggested files:

```text
lib/topic-suggestion-scoring.ts
server/blueprint/blueprint-service.ts
server/projects/topic-suggestion-service.ts
server/reporting/synthetic-document/generate-synthetic-content.ts
scripts/generate-upt-2dof-compact-example.ts
```

Suggested commit message:

```text
chore: update topic and synthetic document support utilities
```

## Recommended Tag Name

Suggested tag after the reviewed commit groups are committed and tests pass:

```text
checkpoint-intake-2-pipeline-cleanup-c1-2026-05-07
```

## Exact Suggested Git Add Commands

Documentation-only checkpoint:

```powershell
git add -- INTAKE_2_IMPROVEMENTS_HANDOFF.md PIPELINE_CLEANUP_AUDIT.md STALE_FALLBACK_RUNTIME_CLEANUP_REPORT.md CLEANUP_C1_GIT_HYGIENE_REPORT.md
```

Safety/quality group, after review:

```powershell
git add -- server/blueprint-engine/quality server/blueprint-engine/adapters/current-lab-a-handoff-adapter.ts scripts/test-production-safety-and-contamination-guards.ts scripts/test-citation-semantics.ts scripts/test-source-health.ts scripts/test-evidence-budget.ts scripts/test-run-telemetry.ts scripts/test-production-readiness-dashboard.ts scripts/test-fresh-run-isolation.ts scripts/test-method-selection.ts scripts/test-method-generation-contract.ts scripts/test-secondary-reference-recovery.ts scripts/test-semantic-source-use-policy.ts scripts/test-source-sufficiency.ts scripts/test-user-provided-pdf-import.ts scripts/prepare-user-provided-source-pdfs.ts package.json
```

Lab A/source workflow group, after review:

```powershell
git add -- blueprint_launch/server scripts/run-evidence-candidate-search.ts scripts/run-evidence-selected-sources-steps-2-6.ts scripts/run-blueprint-launch-steps-1-6.ts scripts/test-candidate-search-keyword-expansion.ts scripts/test-stale-fallback-cleanup.ts scripts/test-selected-source-runner-block-gate.ts package.json
```

Lab B/DOCX group, after review:

```powershell
git add -- server/blueprint-v2 server/reporting scripts/run-lab-b-diagnostic-ingestion.ts scripts/run-lab-b-full-diagnostic-docx.ts scripts/compare-diagnostic-runs.ts scripts/test-academic-editorial-policy.ts scripts/test-academic-structure-layer.ts scripts/test-asset-equation-layer.ts scripts/test-citation-reference-layer.ts scripts/test-docx-structural-qa.ts scripts/test-editorial-output-enforcement.ts scripts/test-hero-infographic-policy.ts scripts/test-project-management-content.ts scripts/test-section-evidence-binding.ts scripts/test-spanish-public-text-layer.ts scripts/test-template-runtime-offline.ts package.json tsconfig.json
```

Ancillary service group, after review:

```powershell
git add -- lib/topic-suggestion-scoring.ts server/blueprint/blueprint-service.ts server/projects/topic-suggestion-service.ts server/reporting/synthetic-document/generate-synthetic-content.ts scripts/generate-upt-2dof-compact-example.ts
```

## Exact Suggested Git Reset Commands If Needed

If backup files are accidentally staged:

```powershell
git reset -- backups/pre-integration-2026-05-03-1415/blueprint-v2/lab/prompt-planning-hybrid.ts
```

If generated artifacts are accidentally staged:

```powershell
git reset -- artifacts-local
```

If local PDF/DOCX/PNG outputs are accidentally staged from any local artifact folder:

```powershell
git reset -- '*.pdf' '*.docx' '*.png' '*.jpg' '*.jpeg'
```

If `.env` or secret files are accidentally staged:

```powershell
git reset -- .env .env.* 
```

If a broad `git add -A` accidentally stages everything, unstage all first and re-add intentionally:

```powershell
git reset --
```

Then use the explicit `git add -- ...` commands above.

## Recommended Next Commit Command

For C1 only, the safest next commit is documentation-only:

```powershell
git add -- INTAKE_2_IMPROVEMENTS_HANDOFF.md PIPELINE_CLEANUP_AUDIT.md STALE_FALLBACK_RUNTIME_CLEANUP_REPORT.md CLEANUP_C1_GIT_HYGIENE_REPORT.md
git commit -m "docs: add intake 2 handoff and cleanup audit checkpoint"
```

Do not include `backups/`, `artifacts-local/`, local PDFs, generated DOCX/PNG/PDF files, or `.env` files.
