# Ingeniometrix MVP Backend Core Plan

Branch/worktree: `mvp/backend-core-clean`  
Source reference branch: `codex/lab-a-b-diagnostic-pipeline`  
Goal: rebuild the Release 0 backend as a small, testable core while preserving useful existing work as reference material.

## Product boundary

Ingeniometrix Release 0 is not a thesis generator. It is an ethical, Spanish-first academic planning assistant for Peru-focused postgraduate users.

The backend must support this promise:

> Convert a structured intake into a traceable academic proposal package using recovered sources, explicit assumptions, human source selection, and exportable evidence logs.

Release 0 should be useful even if some advanced Lab A/B diagnostics remain internal.

## Backend-first principles

1. Build the backend flow before frontend polish.
2. Keep API contracts stable and explicit.
3. Prefer simple state transitions over hidden orchestration.
4. Every generated artifact must have provenance.
5. Provider failures must produce clear blocked/degraded states, not silent fake output.
6. Do not connect to the old cloud database while validating the core.
7. Do not weaken academic safety gates just to make demos pass.
8. Keep lab/diagnostic routes internal until intentionally promoted.

## Clean architecture layers

### 1. Domain layer

Small TypeScript modules with plain types and validation rules.

Core concepts:

- `User`
- `Project`
- `Intake`
- `SourceCandidate`
- `SourceSelection`
- `EvidenceNote`
- `Blueprint`
- `ExportArtifact`
- `AuditEvent`

Primary domain statuses:

- project: `DRAFT`, `INTAKE_READY`, `SOURCES_READY`, `SOURCES_SELECTED`, `BLUEPRINT_READY`, `EXPORT_READY`, `BLOCKED`
- source: `CANDIDATE`, `SELECTED`, `REJECTED`, `UNAVAILABLE`, `INSUFFICIENT`
- blueprint: `PENDING`, `GENERATING`, `READY`, `FAILED`, `BLOCKED_NEEDS_SOURCES`, `BLOCKED_NEEDS_LLM`
- export: `PENDING`, `READY`, `FAILED`

### 2. Database layer

Use Prisma with local PostgreSQL first.

Initial rule: keep the existing Prisma schema as reference, but do not assume it is final. Before large edits, map which models are truly needed for Release 0.

Release 0 minimum storage needs:

- user/session minimum
- projects
- intake
- source candidates
- selected/rejected sources
- blueprint versions
- export artifacts
- audit events

### 3. Service layer

Services should be framework-agnostic and callable by API routes and scripts.

Proposed services:

- `projectService`
  - create project
  - list projects
  - get project
  - update status
- `intakeService`
  - validate intake
  - persist intake
  - derive search query hints
- `sourceSearchService`
  - query OpenAlex/Crossref adapters
  - normalize candidates
  - dedupe candidates
  - persist candidates
- `sourceSelectionService`
  - record selected/rejected sources
  - enforce minimum selection rules
- `blueprintService`
  - build deterministic prompt/input package
  - call LLM adapter only when configured
  - validate generated blueprint schema
  - persist blueprint version
- `exportService`
  - generate `evidence_log.json`
  - generate BibTeX
  - generate RIS
  - generate DOCX when renderer is stable
- `auditService`
  - append immutable-ish events for user/system/provider actions

### 4. Provider adapter layer

Keep providers behind small interfaces.

Adapters:

- `OpenAlexSearchAdapter`
- `CrossrefSearchAdapter`
- `OpenAIBlueprintAdapter`
- `DocxExportAdapter`
- `BibtexExportAdapter`
- `RisExportAdapter`

All adapters return normalized typed results plus provider metadata. They must never write directly to DB.

### 5. API layer

Next.js route handlers should be thin wrappers over services.

Primary frontend cables:

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id/intake`
- `POST /api/projects/:id/search`
- `GET /api/projects/:id/references`
- `PUT /api/projects/:id/references`
- `POST /api/projects/:id/blueprints`
- `GET /api/projects/:id/blueprints`
- `GET /api/projects/:id/blueprints/:versionId`
- `GET /api/projects/:id/blueprints/:versionId/evidence-log`
- `GET /api/projects/:id/blueprints/:versionId/bibtex`
- `GET /api/projects/:id/blueprints/:versionId/ris`
- `GET /api/projects/:id/blueprints/:versionId/docx`

Response contract principle:

```ts
type ApiResult<T> =
  | { ok: true; data: T; warnings?: ApiWarning[] }
  | { ok: false; error: ApiError; warnings?: ApiWarning[] };
```

Use this style consistently in new/rewritten backend paths.

### 6. CLI/test harness layer

Before connecting frontend, create a backend-only runner that proves the flow.

Target script:

```bash
npx tsx scripts/mvp/run-backend-core-e2e.ts
```

Flow:

1. create or reuse test user
2. create project
3. save intake
4. run source search with mock provider or real providers if configured
5. select sources
6. generate blueprint using mock or real LLM if configured
7. generate evidence log
8. print project/version IDs and artifact paths

Exit criteria:

- script exits 0
- DB contains expected records
- project status reaches at least `BLUEPRINT_READY` or a clear blocked status
- no frontend required

## Release 0 backend acceptance criteria

- [ ] Clean local DB can be created from Prisma.
- [ ] Backend E2E runner passes with mock providers.
- [ ] Backend E2E runner degrades clearly without provider keys.
- [ ] Source search works with OpenAlex/Crossref when configured.
- [ ] Human source selection is persisted.
- [ ] Blueprint generation validates schema before persistence.
- [ ] Evidence log export is deterministic.
- [ ] BibTeX and RIS exports are deterministic.
- [ ] DOCX export either works or is explicitly marked post-MVP/internal.
- [ ] API responses use stable success/error shape.
- [ ] Frontend contract is documented in `docs/api/mvp-frontend-contract.md`.

## What to reuse from current repo

Reuse only after inspection and minimal tests:

- Prisma enum/model ideas.
- Retrieval normalization from `server/retrieval`.
- Existing project/intake APIs if service boundaries are clear.
- Export helpers for BibTeX/RIS/DOCX if isolated.
- Ethical guardrails and traceability checks.
- Zod schemas that are simple and product-facing.

## What not to carry into the MVP core yet

Keep as reference/internal lab:

- `/app/lab/*`
- `/app/api/labs/*`
- `/blueprint_launch/*`
- large diagnostic runners under `scripts/run-lab-*`
- mutable `latest` artifact readers
- degraded handoff compatibility logic
- old artifacts/fixtures as production dependencies
- Deep Research fallback as citable evidence

## First implementation sequence

1. Inventory current backend modules and classify keep/refactor/defer.
2. Add `scripts/mvp/run-backend-core-e2e.ts` with mock adapters first.
3. Confirm local DB write/read for project + intake.
4. Add source candidate persistence and selection.
5. Add deterministic blueprint stub and evidence log export.
6. Replace mocks with real OpenAlex/Crossref adapters where safe.
7. Add real LLM adapter only after schema validation is locked.
8. Document frontend contract.

## Decision log

- 2026-05-11: Work happens in `mvp/backend-core-clean` worktree; frozen diagnostic branch remains reference only.
- 2026-05-11: Use local PostgreSQL first; do not connect to old cloud database.
- 2026-05-11: Backend-first execution; frontend wiring comes after service/API contracts are stable.
