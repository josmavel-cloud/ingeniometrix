# Backend-first MVP readiness

Purpose: keep Ingeniometrix Release 0 focused on a stable backend core while leaving clean connection points for the frontend.

## Local runtime baseline

- Node: use `.nvmrc` with Node 24 LTS.
- Package manager: npm.
- Database: local PostgreSQL from `compose.yml` on host port `5433`.
- Local secrets: `.env` only; never commit.

Recommended local commands:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use
npm ci
npm run db:up
npm run prisma:validate
npm run db:push
npm run typecheck
npm run build
```

## Current local env baseline

Use local Postgres first. Do not connect to the old cloud database during backend validation.

Minimum local values:

```env
POSTGRES_DB=ingeniometrix
POSTGRES_USER=ingeniometrix
POSTGRES_PASSWORD=ingeniometrix_local_dev
POSTGRES_PORT=5433
DATABASE_URL=postgresql://ingeniometrix:ingeniometrix_local_dev@localhost:5433/ingeniometrix?schema=public
DATABASE_URL_UNPOOLED=postgresql://ingeniometrix:ingeniometrix_local_dev@localhost:5433/ingeniometrix?schema=public
IMX_ARTIFACTS_DIR=./artifacts-local
```

Provider keys stay blank until testing provider-backed flows:

- `OPENAI_API_KEY`
- `OPENALEX_API_KEY`
- `CROSSREF_MAILTO`

## Backend-first scope

For Release 0, prefer backend decisions that make the frontend easy to wire later:

1. Stable API routes and payload schemas.
2. Clear project status transitions.
3. Deterministic error responses.
4. Traceability artifacts for every generated output.
5. Export endpoints that can be called by UI buttons without custom frontend logic.

Avoid for now:

- Connecting to the old cloud DB.
- Building new frontend polish before the backend flow works.
- Productizing lab-only routes before the main project flow is stable.
- Weakening academic safety gates to make demos pass.

## Frontend cable map

Main product APIs already exposed:

- `POST /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/[id]`
- `PUT /api/projects/[id]/intake`
- `GET /api/projects/[id]/references`
- `PUT /api/projects/[id]/references`
- `POST /api/projects/[id]/search`
- `GET /api/projects/[id]/topic-suggestions`
- `POST /api/projects/[id]/topic-suggestions`
- `PUT /api/projects/[id]/topic-suggestions`
- `GET /api/projects/[id]/blueprints`
- `POST /api/projects/[id]/blueprints`
- `GET /api/projects/[id]/blueprints/progress`
- `GET /api/projects/[id]/blueprints/[versionId]`
- `GET /api/projects/[id]/blueprints/[versionId]/docx`
- `GET /api/projects/[id]/blueprints/[versionId]/bibtex`
- `GET /api/projects/[id]/blueprints/[versionId]/ris`
- `GET /api/projects/[id]/blueprints/[versionId]/evidence-log`
- `POST /api/projects/[id]/blueprints/[versionId]/report-preview`
- `GET /api/topic-areas`
- `POST /api/topic-areas`

Lab/diagnostic APIs should remain internal until promoted intentionally:

- `/api/labs/*`
- `/api/blueprint-launch/*`

## Backend MVP acceptance checklist

- [ ] Local Postgres starts cleanly from `compose.yml`.
- [ ] `prisma validate` passes.
- [ ] `prisma db push` applies schema to local DB.
- [ ] `typecheck` passes on Node 24 LTS.
- [ ] `build` passes on Node 24 LTS.
- [ ] Main project API flow works with local DB.
- [ ] Search flow has graceful behavior when provider keys are missing.
- [ ] Blueprint creation has clear blocked/error state when LLM key is missing.
- [ ] Export endpoints return deterministic success/error payloads.
- [ ] Frontend can rely on status fields instead of inferring state.

## Known warnings after baseline

- `npm audit` reports 2 moderate issues through `next`/`postcss`. Do not run `npm audit fix --force`; review patch options later.
- Build still warns about a lab route import trace through `server/blueprint-v2/lab/fixture-loader.ts`. Treat as lab isolation cleanup, not a core backend blocker.
