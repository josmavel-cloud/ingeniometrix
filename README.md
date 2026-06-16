# Ingeniometrix

Ingeniometrix is the company/workspace repo for building `Ingeniometrix`, an ethical thesis-planning.

## Current Product

- product name: `Ingeniometrix`
- company/workspace name: `Ingeniometrix`
- Release 0 focus: reproducible technical MVP with traceability
- Release 0.5 focus: minimal monetization layer

## Current Codebase State

Implemented now:

- auth minima
- project workspace
- structured intake flow
- OpenAlex + Crossref search and enrichment
- manual source selection
- blueprint generation with schema validation
- coherence report
- audit trail
- local debug runners for provider and workflow checks

Not implemented yet:

- payment system
- subscriptions
- LaTeX rendering pipeline
- DOCX/BibTeX/RIS export packaging
- production-grade test suite

## Repo Layout

- `app/`: Next.js routes and API handlers
- `components/`: UI and user-facing flows
- `server/`: orchestration for auth, projects, retrieval, blueprint, audit
- `lib/`: catalogs, helpers, Prisma client, workflow-level utilities
- `llm/`: provider abstraction and OpenAI implementation
- `ai/schemas/`: structured output schemas
- `prisma/`: database schema
- `scripts/`: local dev and debug scripts
- `blueprint_launch/`: isolated workspace for the independent blueprint launch track
- `docs/`: Codex workflow docs, ADRs, runbooks, checklists, thread briefs
- `docs/prompts/`: reusable chat starters and operating prompts
- `artifacts-local/`: local debug outputs, intentionally untracked

## Codex Operating Docs

Read these in order before doing substantial work:

1. `AGENTS.md`
2. `docs/architecture/codex-workflow-blueprint.md`
3. `docs/runbooks/debugging.md`
4. `docs/runbooks/worktrees.md`
5. `docs/thread-briefs/`

## Quick Start

From the repo root:

```bash
chmod +x bootstrap.sh setup-dev.sh
./bootstrap.sh
./setup-dev.sh
```

Start local services:

```bash
docker compose up -d
```

Run the app:

```bash
npm install
npm run dev
```

## Useful Commands

```bash
npm run typecheck
npm run build
npm run prisma:validate
npm run db:push
npm run debug:providers
npm run debug:workflow
npm run smoke:deployment
```

## Debug Artifacts

- local debug output now goes to `artifacts-local/`
- keep committed `artifacts/` minimal
- large debug runs should not be used as permanent documentation

## Local Infrastructure

Release 0 uses:

- Postgres in Docker Compose
- app and scripts on host

Not used yet:

- Redis
- Kubernetes
- local Supabase stack
- Nginx
- Caddy

## Environment Files

- `.env.example`: placeholders only
- `.env`: local and uncommitted

## Release Flow

### Release 0

- reproducible repo
- local Postgres
- project and intake flow
- source search and selection
- validated blueprint
- traceable outputs

### Release 0.5

- simple landing
- payment
- delivery email

### Release 1

- subscriptions
- revisions
- PDF export
- more providers
- larger product expansion

## Operating Principles

- keep scope brutally small
- prefer deterministic steps
- document durable decisions once, then reference them
- isolate debugging from product planning
- use separate threads and worktrees per subsystem when Git is available
