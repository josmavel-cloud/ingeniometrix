# Secure Pilot Deployment

STATUS: CURRENT - Release 0 secure pilot.

Canonical release branch: `release/secure-pilot`

Canonical release commit: `5442a9ba29abed0aabaa4b882e4ca5a0ca057760`

## Supported shape

Release 0 runs as one container image with three roles:

- `app`: Next.js HTTP application;
- `worker`: database-backed canonical Step 5/Step 6 worker;
- `migrate`: one-shot Prisma migration task.

PostgreSQL is the durable source for users, sessions, jobs, provenance and final private artifacts. A shared private volume keeps intermediate PDF/DOCX processing files. This release requires a Linux container with LibreOffice, Poppler, Python and PyMuPDF; a serverless-only Vercel deployment is not the supported document-generation runtime.

## Required environment names

Never commit their values:

- `POSTGRES_PASSWORD`
- `BLUEPRINT_WORKER_SECRET`
- `APP_ORIGIN`
- `OPENAI_API_KEY`
- `CROSSREF_MAILTO`

Optional/configurable:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PORT`
- `APP_PORT`
- `OPENALEX_API_KEY`
- `LLM_PROVIDER`, `LLM_DEFAULT_MODEL`, `LLM_FAST_MODEL`
- `BLUEPRINT_MAX_ATTEMPTS`, `BLUEPRINT_STALE_LOCK_MS`, `BLUEPRINT_HEARTBEAT_MS`, `BLUEPRINT_WORKER_POLL_MS`
- `IMX_SESSION_MAX_AGE_SECONDS`

For the pilot, keep `IMX_AUTHLESS_WORKSPACE=0` and `IMX_ENABLE_DEEP_RESEARCH=0`.

## Build and start

Create an ignored `.env.release` from `.env.example`, then:

```bash
docker compose --env-file .env.release -f docker-compose.release.yml build
docker compose --env-file .env.release -f docker-compose.release.yml up -d db
docker compose --env-file .env.release -f docker-compose.release.yml run --rm migrate
docker compose --env-file .env.release -f docker-compose.release.yml up -d app worker
docker compose --env-file .env.release -f docker-compose.release.yml ps
```

## Accepted pilot dependency risk

The Release 0 pilot accepts the `deepmerge-ts` / Prisma advisory
`GHSA-ggr8-5vv4-36mx` as **ACCEPTED PILOT RISK - MIGRATION TOOLCHAIN ONLY**.
The current lockfile pins `deepmerge-ts` 7.1.5, and npm audit reports the
recursive-object stack-exhaustion advisory through `@prisma/config` and Prisma.
Do not add a major-version override as part of this release.

Required mitigations:

- Run migrations only from the trusted release checkout and reviewed
  configuration; the `migrate` service has no public port and runs as a
  one-shot container (`docker compose run --rm migrate`).
- Do not expose the migration container as an application service or accept
  Prisma configuration from user requests. The release migration command uses
  checked-in Prisma schema/migrations and injected database environment.
- Keep the lockfile unchanged except for reviewed dependency updates, and
  recheck the advisory before expanding beyond the assisted pilot.

The runtime image removes Prisma CLI/config and `deepmerge-ts`; this mitigation
does not remove them from the build/migration image. npm audit may also report
separate development-tool findings, which must be reviewed independently.

Provision pilot users from the same image:

```bash
docker compose --env-file .env.release -f docker-compose.release.yml run --rm \
  -e ADMIN_USER_EMAIL -e ADMIN_USER_PASSWORD -e ADMIN_USER_NAME \
  migrate npm run admin:user
```

## Migration and adoption

Migration order is:

1. `20260918000000_baseline`
2. `20260919000000_secure_pilot`

For a new empty database, run `npm run db:migrate:deploy` once.

For an existing database that already matches the baseline but has no Prisma migration record:

1. restore it into an isolated database;
2. compare it with the baseline and run application smoke tests;
3. mark only the verified baseline:

```bash
DATABASE_URL="$RESTORED_DATABASE_URL" \
DATABASE_URL_UNPOOLED="$RESTORED_DATABASE_URL" \
npm run prisma:generate

DATABASE_URL="$RESTORED_DATABASE_URL" \
DATABASE_URL_UNPOOLED="$RESTORED_DATABASE_URL" \
npx prisma migrate resolve --applied 20260918000000_baseline

DATABASE_URL="$RESTORED_DATABASE_URL" \
DATABASE_URL_UNPOOLED="$RESTORED_DATABASE_URL" \
npm run db:migrate:deploy
```

Do not resolve a migration without first verifying the restored schema. Never use `db push` against pilot or production data.

## Backup and recovery

The PostgreSQL backup includes final artifacts because `GeneratedArtifact.content` is private DB storage.

```bash
mkdir -p backups
docker compose --env-file .env.release -f docker-compose.release.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/ingeniometrix-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.release -f docker-compose.release.yml exec -T worker \
  tar -czf - -C /app/artifacts-local . \
  > "backups/artifacts-$(date -u +%Y%m%dT%H%M%SZ).tgz"
```

Test recovery on a different database and volume:

```bash
createdb "$RESTORE_DATABASE"
pg_restore --clean --if-exists --no-owner -d "$RESTORE_DATABASE" backups/<backup>.dump
DATABASE_URL="$RESTORE_DATABASE_URL" DATABASE_URL_UNPOOLED="$RESTORE_DATABASE_URL" npm run db:migrate:status
```

## Rollback

1. Stop `app` and `worker`; do not roll back while jobs are running.
2. Preserve a fresh DB dump and artifact-volume snapshot.
3. Restore the last verified DB dump and volume snapshot.
4. start the previous image by immutable tag/commit;
5. verify login, ownership isolation, job state and downloads before reopening access.

Prisma migrations are forward-only. Do not hand-edit or destructively reverse the secure-pilot migration on a live database.

## Operational checks

```bash
docker compose --env-file .env.release -f docker-compose.release.yml logs --tail=200 app worker
docker compose --env-file .env.release -f docker-compose.release.yml exec app libreoffice --version
docker compose --env-file .env.release -f docker-compose.release.yml exec app pdftotext -v
docker compose --env-file .env.release -f docker-compose.release.yml exec app python3 -c 'import fitz; print(fitz.__version__)'
```

If a worker stops, restart only `worker`. Queued/waiting jobs and stale locks remain in PostgreSQL and are reclaimed. Repeated downloads read the owner-scoped DB artifact; they do not depend on the original browser request or an old local path.
