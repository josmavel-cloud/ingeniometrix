# Thread Brief

- Thread: `IMX-DATA-db-and-storage-strategy`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: inspect the current Prisma and data flow setup, decide what should stay local for Release 0, and define the earliest justified point for managed Postgres or managed file storage.

## What Changed

- Documented the current persistence split: core product data lives in PostgreSQL through Prisma, while debug and workflow artifacts live on the local filesystem under `artifacts-local/`.
- Captured the main schema-management gap: the repo validates Prisma successfully, but schema rollout is still based on `prisma db push` rather than checked-in migrations.
- Defined explicit "move later" gates for managed Postgres and managed file storage so Release 0 can stay operationally simple without blocking a later hosted path.

## Decisions

- Keep PostgreSQL local for Release 0 development and local verification.
  The repo already points to local Docker Compose Postgres through `DATABASE_URL`, and the app/server flow reads and writes directly through Prisma. This matches the locked stack and avoids early infra churn.

- Keep core traceability data in PostgreSQL, not in filesystem blobs.
  The current schema already persists the durable audit and reconstruction surfaces needed for Release 0:
  - project and intake state
  - retrieved references and selected references
  - raw provider payload snapshots for OpenAlex and Crossref
  - blueprint JSON and coherence report JSON
  - audit events

- Keep debug and workflow artifacts local for now.
  Provider debug dumps and workflow-runner outputs already write to `artifacts-local/` via `IMX_ARTIFACTS_DIR`. Those outputs are operational evidence, not product records, and do not justify managed storage yet.

- Keep generated export files local when the export pipeline lands.
  Release 0 exports should be written to a deterministic local path such as `artifacts-local/exports/<projectId>/<versionNumber>/` on the app host. Do not store DOCX or package binaries inside PostgreSQL, and do not add object storage until exports actually need to be fetched from another machine or retained outside the local host lifecycle.

- Do not force a Supabase migration for Release 0.
  Supabase does not currently remove an active blocker:
  - auth is still local and minimal
  - storage buckets are not yet required by the product flow
  - the current app already assumes plain Prisma plus PostgreSQL

- Tighten schema management before any hosted database move.
  The first justified data-layer improvement is not managed Postgres. It is replacing ad hoc `db push` rollout with checked-in Prisma migrations so schema changes become reproducible across local, staging, and later hosted environments.

- Earliest justified point for managed Postgres:
  move only when a shared non-local runtime is required, ideally at staging or pre-Release-0.5 deployment, and only after all of these are true:
  - `npm run build` and the local workflow are stable
  - the export package shape is defined
  - Prisma migrations are committed and repeatable
  - deployment smoke checks need a remotely reachable database

- Earliest justified point for managed file storage:
  move only when the app must serve or retain export packages outside the local host, such as:
  - staged or production downloads from a hosted app
  - delivery email or asynchronous export pickup
  - multi-machine operators needing the same export artifacts
  - retention requirements that exceed local-host durability

- If managed Postgres is needed later, keep the choice narrow.
  Prefer whichever managed Postgres option keeps plain Prisma, standard connection strings, and low operational overhead. Supabase becomes reasonable only if its buckets or auth materially reduce implementation work at that moment.

## Files Touched

- `docs/thread-briefs/20260420-IMX-DATA-db-and-storage-strategy.md`

## Verification

- Reviewed workflow and scope rules in:
  - `AGENTS.md`
  - `docs/architecture/codex-workflow-blueprint.md`
  - `docs/runbooks/debugging.md`
  - `docs/runbooks/worktrees.md`
- Reviewed current data and storage implementation in:
  - `prisma/schema.prisma`
  - `lib/prisma.ts`
  - `server/projects/project-service.ts`
  - `server/retrieval/reference-service.ts`
  - `server/blueprint/blueprint-service.ts`
  - `server/audit/audit-service.ts`
  - `scripts/lib/artifact-paths.mjs`
  - `scripts/debug-workflow-runner.mjs`
  - `compose.yml`
  - `.env.example`
  - `package.json`
  - `scripts/migrate.sh`
- Confirmed the current Prisma schema validates successfully with `npm run prisma:validate`.
- Confirmed there is no checked-in Prisma migrations directory yet; `prisma/` currently contains only `schema.prisma`.

## Follow-ups

- Add checked-in Prisma migrations before the first staging or hosted database rollout.
- When export implementation starts, add a small export manifest model or metadata contract before introducing object storage.
- Keep debug artifacts and user-facing export artifacts separate under local paths so future retention policy stays easy to change.
