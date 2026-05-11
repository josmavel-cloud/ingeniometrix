# MVP Backend Reuse Inventory

Date: 2026-05-11  
Branch/worktree: `mvp/backend-core-clean`

Purpose: classify existing code as reusable, refactor candidate, or defer/lab-only before building the clean backend core.

## Keep / inspect first

These look closest to the Release 0 product path and should be inspected before rewriting from scratch.

### Core product APIs

- `app/api/projects/route.ts`
- `app/api/projects/[id]/route.ts`
- `app/api/projects/[id]/intake/route.ts`
- `app/api/projects/[id]/search/route.ts`
- `app/api/projects/[id]/references/route.ts`
- `app/api/projects/[id]/blueprints/route.ts`
- `app/api/projects/[id]/blueprints/[versionId]/route.ts`
- `app/api/projects/[id]/blueprints/[versionId]/docx/route.ts`
- `app/api/projects/[id]/blueprints/[versionId]/bibtex/route.ts`
- `app/api/projects/[id]/blueprints/[versionId]/ris/route.ts`
- `app/api/projects/[id]/blueprints/[versionId]/evidence-log/route.ts`
- `app/api/projects/[id]/blueprints/progress/route.ts`
- `app/api/topic-areas/route.ts`

### Product services

- `server/projects/project-service.ts`
- `server/projects/project-validation.ts`
- `server/projects/idea-draft-service.ts`
- `server/projects/topic-area-service.ts`
- `server/projects/topic-suggestion-service.ts`
- `server/audit/audit-service.ts`
- `server/auth/session.ts`

### Retrieval / source search

- `server/retrieval/openalex-client.ts`
- `server/retrieval/crossref-client.ts`
- `server/retrieval/reference-search-v2.ts`
- `server/retrieval/reference-service.ts`
- `server/retrieval/search-query-planner.ts`
- `server/retrieval/reference-access.ts`

### Blueprint v1/product path

- `server/blueprint/blueprint-service.ts`
- `server/blueprint/blueprint-engine.ts`
- `server/blueprint/blueprint-types.ts`
- `server/blueprint/blueprint-validation.ts`
- `server/blueprint/blueprint-readiness.ts`
- `server/blueprint/blueprint-export.ts`
- `server/blueprint/blueprint-prompt.ts`
- `server/blueprint/blueprint-errors.ts`

### Export/reporting candidates

- `server/reporting/blueprint-report/*`
- `server/reporting/docx/render-canonical-report-docx.ts`
- `server/reporting/docx/omml-equation-builder.ts`
- `server/reporting/reporting-engine.ts`

### Shared helpers/assets

- `lib/prisma.ts`
- `lib/project-status.ts`
- `lib/research-workflow.ts`
- `lib/peru-universities.ts`
- `lib/degree-levels.ts`
- `lib/intake-presets.ts`
- `ai/schemas/research-blueprint.schema.json`
- `ai/schemas/research-blueprint-core.schema.json`
- `ai/schemas/evidence-log.schema.json`

## Refactor / harvest carefully

Useful ideas exist here, but modules may be too broad or diagnostic-heavy for the clean core.

- `server/blueprint-engine/contracts/*`
- `server/blueprint-engine/quality/citation-semantics.ts`
- `server/blueprint-engine/quality/production-safety.ts`
- `server/blueprint-engine/quality/source-health.ts`
- `server/blueprint-engine/quality/source-sufficiency.ts`
- `server/blueprint-engine/quality/semantic-source-use-policy.ts`
- `server/blueprint-engine/quality/section-evidence-binding.ts`
- `server/blueprint-v2/editorial/*`
- `server/blueprint-v2/sections/*`
- `server/blueprint-v2/validation/*`
- `llm/provider.ts`
- `llm/providers/openai.ts`

Rule: do not import these into the clean MVP path until a specific function is isolated and covered by a small script/test.

## Defer / lab-only for now

Keep as reference. Do not make Release 0 depend on these yet.

- `app/lab/*`
- `app/api/labs/*`
- `app/api/blueprint-launch/*`
- `blueprint_launch/*`
- `server/blueprint-v2/lab/*`
- `server/blueprint-v2/orchestrator/*`
- `scripts/run-lab-*`
- `scripts/run-master-blueprint-*`
- `scripts/run-evidence-*` diagnostic runners
- `scripts/compare-diagnostic-runs.ts`
- `artifacts-local/*`
- `backups/*`

## First files to read before coding the E2E runner

1. `prisma/schema.prisma`
2. `lib/prisma.ts`
3. `server/auth/session.ts`
4. `server/projects/project-service.ts`
5. `server/projects/project-validation.ts`
6. `server/retrieval/reference-service.ts`
7. `server/retrieval/reference-search-v2.ts`
8. `server/blueprint/blueprint-service.ts`
9. `server/blueprint/blueprint-export.ts`
10. `app/api/projects/[id]/blueprints/route.ts`

## Open questions for implementation

- Can the existing Prisma schema support the E2E backend slice without schema changes?
- Does the current auth/session layer support a deterministic local test user?
- Do project APIs require frontend-specific assumptions that should move into services?
- Can source search run in mock mode without OpenAlex/Crossref/OpenAI keys?
- Does blueprint generation have a deterministic fallback, or do we need an explicit mock adapter?
- Are BibTeX/RIS/evidence-log exports generated from DB records or from blueprint JSON only?
- Should DOCX be MVP core or internal/manual for Release 0?

## Immediate next action

Create `scripts/mvp/run-backend-core-e2e.ts` only after reading the first-file list above. The first version should use mock providers if real provider keys are missing, so the backend can be tested deterministically.
