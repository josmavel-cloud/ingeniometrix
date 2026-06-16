# Deployment Runbook

## Goal

Get Ingeniometrix to a clean first remote baseline, then to a real staging deployment with the smallest possible amount of new infrastructure.

## Current Recommendation

Do not deploy production yet.

Use this order:

1. create the first baseline commit on `main`
2. push `main` to the remote repository
3. create and push a persistent `staging` branch
4. connect the repo to Vercel
5. provision a staging Postgres database reachable from Vercel
6. set Preview environment variables in Vercel
7. apply Prisma migrations to staging
8. run smoke checks against the Vercel preview deployment
9. only then consider production deployment or Linux server delegation

## Branch Workflow

Use this minimal branch model for Release 0:

- `main`: default branch, protected, clean integration baseline
- `staging`: persistent preview branch for Vercel staging validation
- short-lived branches: `feat/*`, `bug/*`, `chore/*`

After the first baseline push, create worktrees only when the task is long-running or high-risk, following `docs/runbooks/worktrees.md`.

## Shortest Path To First Baseline Push

Assumptions:

- Git is already initialized locally
- the repository has no commits yet
- `.env` stays local-only
- ignored directories such as `node_modules/`, `.next/`, `artifacts/` contents, and `artifacts-local/` contents are not part of the baseline

Local verification before the first commit:

- `npm run typecheck`
- `npm run prisma:validate`
- `npm run build`
- `npm run smoke:deployment:workspace`

Baseline push commands:

```bash
git status --short
git add .
git commit -m "chore: baseline release-0 workspace"
git remote add origin <git-remote-url>
git push -u origin main
git checkout -b staging
git push -u origin staging
git checkout main
```

Immediately after the push:

- set `main` as protected on the Git host
- require pull requests for follow-up changes
- keep `staging` unprotected for fast preview iteration if the team is still solo
- use feature branches plus worktrees for parallel subsystem work

## Vercel Recommendation

Use Vercel with framework auto-detection for this repo.

Do not add `vercel.json` yet unless one of these becomes necessary:

- custom headers or rewrites
- non-default build output behavior
- monorepo routing

The current repo should deploy with Vercel's default Next.js settings.

## Staging Database Requirement

Meaningful staging requires a managed Postgres instance.

Reason:

- the authenticated workspace flow uses Prisma-backed routes
- Vercel cannot reach the local Docker Postgres running on the developer machine
- a preview deployment without remote Postgres only validates the public shell, not the actual Ingeniometrix workflow

Preferred staging choices:

- Prisma Postgres through the Vercel Marketplace
- Neon or another managed Postgres provider with a standard Postgres URL
- another managed Postgres provider with a standard connection string

Do not move to Supabase just for staging unless you also need its other platform features.

Connection variables:

- `DATABASE_URL`: runtime pooled/serverless connection string used by the Next.js app and Prisma Client.
- `DATABASE_URL_UNPOOLED`: direct or unpooled connection used by Prisma schema commands because `schema.prisma` sets `directUrl = env("DATABASE_URL_UNPOOLED")`.
- If the provider only gives one URL, set both variables to the same URL for Release 0.
- Local Docker keeps Postgres on host port `5433`; Vercel does not use local DB ports.
- Local Next.js can run on `3004` for testing; Vercel serves over HTTPS and does not use `APP_PORT`.

## Vercel Staging Steps

1. Create a private remote repository and push `main` and `staging`.
2. Import the repository into Vercel as a new project.
3. Keep the framework preset as Next.js.
4. Set the production branch to `main`.
5. Use the `staging` branch for preview validation.
6. Provision a managed Postgres database for staging.
7. Add Preview environment variables in Vercel:
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
   - `OPENAI_API_KEY`
   - `OPENALEX_API_KEY` if used
   - `CROSSREF_MAILTO`
   - `LLM_PROVIDER`
   - `LLM_DEFAULT_MODEL`
   - `LLM_FAST_MODEL`
   - optional: `LLM_REQUEST_TIMEOUT_MS`
   - optional: `LLM_REQUEST_MAX_RETRIES`
8. Do not set local-only values that Vercel already manages or does not need:
   - `APP_PORT`
   - `POSTGRES_PORT`
   - `NODE_ENV`
   - `IMX_ARTIFACTS_DIR`
9. From a machine with access to the staging database URL, apply committed migrations:

```bash
DATABASE_URL="<staging-database-url>" \
DATABASE_URL_UNPOOLED="<staging-direct-or-same-url>" \
npm run db:migrate:deploy
```

10. Create or refresh the backend-only user:

```bash
DATABASE_URL="<staging-database-url>" \
DATABASE_URL_UNPOOLED="<staging-direct-or-same-url>" \
ADMIN_USER_EMAIL="josmavel@gmail.com" \
ADMIN_USER_PASSWORD="<strong-password>" \
ADMIN_USER_NAME="Josmavel" \
ADMIN_ASSIGN_ALL_PROJECTS=0 \
npm run admin:user
```

11. Trigger a `staging` deployment by pushing the branch or redeploying it in Vercel.

## Staging Smoke Test

The repo includes `scripts/smoke-deployment.mjs`.

Local usage:

```bash
npm run smoke:deployment
npm run smoke:deployment:workspace
```

Preview usage against Vercel:

```bash
npm run smoke:deployment -- --base-url=https://<staging-deployment-url>
npm run smoke:deployment:workspace -- --base-url=https://<staging-deployment-url>
```

The workspace smoke should confirm all of these:

- `/` returns `200`
- `/projects` redirects to auth before login
- `/api/auth/session` returns `200` and sets the session cookie
- authenticated `/projects` returns `200`
- authenticated `/api/projects` returns `200`

If the preview smoke fails:

1. inspect the Vercel deployment logs
2. verify Preview env vars
3. verify the staging database connection
4. rerun `npm run db:migrate:status` and `npm run db:migrate:deploy` against staging if schema drift is suspected
5. rerun the smoke script against the fresh deployment URL

## Migration Policy

Release 0 now has a first committed migration:

```text
prisma/migrations/0001_release0_initial/migration.sql
```

Use this policy from here forward:

- local schema experiments can use `npm run db:push` only on throwaway local databases
- staging and production use `npm run db:migrate:deploy`
- every Prisma schema change that should ship must create a new migration
- never run `db push` against production
- do not run migrations from Vercel serverless request handlers

The current developer database may already have this schema because it was created with `db push`.
Do not apply `0001_release0_initial` on top of that existing database unless it has first been
baselined with Prisma Migrate. For Release 0 staging, the cleanest path is a fresh managed Postgres
database and then `npm run db:migrate:deploy`.

For Vercel, the deployment should build the app; database migrations should be run from a controlled machine or CI job with the right environment variables.

## Release Gate Before Production

Do not promote beyond staging until all of these are true:

- baseline Git workflow is in place
- `main` and `staging` are both pushed
- staging database connectivity is stable
- preview smoke passes
- no local-only dependency is required for core app flow

## Linux Server Use

Use the Linux server later for:

- long-running debug runs
- export generation experiments
- batch validation
- preproduction environment checks

Do not make it the primary public deployment target before the Vercel staging flow is stable.
