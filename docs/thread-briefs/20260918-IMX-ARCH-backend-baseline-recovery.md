# IMX-ARCH Backend Baseline Recovery

Date: 2026-09-18

## Result

The active backend is
`/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core` on
`mvp/backend-core-clean`.

Recent Steps 1-6, their APIs, prompts, diagnostics and Prisma evidence models
were preserved. Step 7 was not implemented. The canonical map is frozen in
`server/mvp/release0-contracts.ts` and documented in
`docs/architecture/evidence-engine-backend-baseline.md`.

An initial non-destructive migration was generated for fresh PostgreSQL
databases. It was not applied because the configured local database was
unavailable and an existing/shared database must be compared and baselined
explicitly.

## Validation

- `npm ci`: passed under Node 20.20.2.
- Prisma generate: passed under Node 20.20.2.
- Prisma validate: passed under Node 20.20.2.
- TypeScript typecheck: passed under Node 20.20.2.
- Initial migration: passed on ephemeral PostgreSQL 16; 26 public tables.
- Release 0 contract healthcheck: 84/84 static checks passed.
- Safe in-memory scripts: 26 passed, 5 failed (four missing historical
  artifacts; one method-generation expectation mismatch).
- Dependency audit: nine known vulnerabilities; no upgrades made in B0.
- DB-backed diagnostics: not run without an isolated database.

## Boundaries

- Historical reference only:
  `/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint`.
- Parallel/legacy paths remain preserved and labeled.
- Generated artifacts remain ignored.
- Only Python bytecode cache was removed.

## Next action

Make the safe validation suite self-contained and green under Node 20 and an
isolated PostgreSQL database by replacing missing historical-artifact
dependencies with committed minimal fixtures and resolving the
method-generation gate mismatch. Step 7 is not part of that action.
