# Codex Handoff — Ingeniometrix WT MVP Backend Core

Date: 2026-05-12
Repo: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core`
Inspiration/lab repo: `/home/pepe/.openclaw/workspace/ingeniometrix`
Lab route: `/lab/master-blueprint`
Lab source folders:
- `/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint`
- `/home/pepe/.openclaw/workspace/ingeniometrix/components/labs/master-blueprint`
- `/home/pepe/.openclaw/workspace/ingeniometrix/server/blueprint-v2`
- `/home/pepe/.openclaw/workspace/ingeniometrix/fixtures/labs/master-blueprint`

## What is implemented in this repo

Current MVP path is a thesis-plan pipeline in:
- `server/mvp/`
- `scripts/mvp/`
- generated local artifacts under `artifacts-local/`

Recent committed milestones:
- `31a5535 docs: define mvp thesis plan content contract`
- `a84197e feat: add thesis plan readiness pack`
- `7661ee0 feat: add thesis plan blueprint pack`
- `e56715f feat: render thesis plan docx from blueprint`

Core files already committed:
- `docs/architecture/mvp-thesis-plan-content-contract.md`
- `server/mvp/thesis-plan-readiness-service.ts`
- `server/mvp/thesis-plan-blueprint-service.ts`
- `server/mvp/thesis-plan-docx-service.ts`
- `scripts/mvp/run-thesis-plan-readiness.ts`
- `scripts/mvp/run-thesis-plan-blueprint.ts`
- `scripts/mvp/run-thesis-plan-docx.ts`

Final known DOCX generated successfully with QA 100/100:
`/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core/artifacts-local/mvp-thesis-plan-docx/76a48983-0d2c-404e-b3da-0d7f3f4cc866/mvp-thesis-plan-docx-b2fa54dc-5998-4d40-ace4-14ab3f6cf98f/evaluacion-probabilistica-de-confiabilidad-sismica-form-monte-carlo-para-un-puente-vehicul-plan-tesis-ingeniometrix.docx`

Validations that had passed after Paso 5:
- `npm run typecheck`
- `npm run prisma:validate`

## Important product decisions / constraints

1. Do not skip the human intervention point.
   - Paso 1–3 must expose front-end contracts/cables.
   - After Paso 2, the UI/user chooses the final intake from evidence-informed alternatives or edits/combines one.
   - Paso 3 must run only with the selected final intake, not automatically with an internal recommendation, except diagnostics mode.

2. Source truth must be preserved.
   - Last source gate was not clean: `NEEDS_SOURCE_REPLACEMENT`.
   - Only 2 usable full-text sources out of 5; 3 were metadata-only/blocked.
   - Do not overclaim source quality.
   - Deep Research is candidate-only/not citable until verified.

3. Post-source stage intended flow:
   - discovery → human source selection → inspection/source health → post-inspection gaps → Deep Research Light repair → candidates return to selection/evidence processing.

4. Inspiration to rescue from Lab B/master-blueprint:
   - template runtime import
   - section prompt plan
   - wave-based section drafts
   - consistency matrix
   - blueprint composition
   - university reduction
   - DOCX rendering polish

5. Current direction before continuing implementation:
   - First show the complete plan and step number.
   - Then code only the agreed step.

## Current uncommitted work detected

`git status --short` currently shows:

```text
M package.json
M server/retrieval/reference-search-v2.ts
?? scripts/mvp/run-autonomous-pipeline.ts
?? scripts/mvp/run-custom-bridge-cpr-step1-3.ts
?? scripts/mvp/run-source-readiness.ts
?? scripts/mvp/run-topic-refinement-step3-diagnostics.ts
?? server/mvp/autonomous-pipeline-quality.ts
?? server/mvp/autonomous-pipeline-service.ts
?? server/mvp/bibliographic-map-service.ts
?? server/mvp/source-readiness-service.ts
?? server/mvp/topic-refinement-service.ts
```

Before changing code, inspect these files and decide whether they belong to the current plan or are experimental.

## Suggested first prompt for Codex

Use this prompt from inside the repo:

```text
Read CODEX_HANDOFF_2026-05-12.md, then inspect git status and the existing MVP files in server/mvp and scripts/mvp. Do not code yet. First give me: (1) where we are in the pipeline by step number, (2) what uncommitted files appear intentional vs experimental, (3) a complete proposed plan to continue, preserving the human intervention point after Paso 2 and the source-health truth.
```

## Commands to start

```bash
cd /home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core
codex
```

Then paste the suggested prompt above.
