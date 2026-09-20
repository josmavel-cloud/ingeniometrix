# Ingeniometrix

Ingeniometrix is an ethical academic research-assistance MVP for Spanish-speaking maestria/posgrado users in Peru. Release 0 helps a user create a traceable thesis-plan proposal from structured intake, selected sources, inspected evidence and owner-scoped exports.

Canonical release:

- Branch: `release/secure-pilot`
- Commit: `5442a9ba29abed0aabaa4b882e4ca5a0ca057760`
- Status: secure pilot package validated locally; external deployment not yet performed.

## Release 0 Does

- Password login and opaque DB-backed sessions.
- Owner-scoped projects, intake and source selection.
- OpenAlex/Crossref discovery and enrichment.
- Evidence inspection/materialization and sufficiency checks.
- Scientific thesis-plan generation with versioned prompts.
- Visual deliverables, consistency matrix, DOCX/PDF, BibTeX, RIS and `evidence-log.json`.
- DB-backed generation jobs with retries, heartbeat and recovery.
- Private DB-backed final artifact storage.

Deep Research code exists but is disabled for the secure pilot with `IMX_ENABLE_DEEP_RESEARCH=0`.

## Stack

- Next.js 16, React 19, TypeScript.
- Node.js 20.x runtime.
- PostgreSQL 16.
- Prisma.
- Docker Compose for release assembly.
- LibreOffice, Poppler, Python and PyMuPDF for document/PDF processing.
- OpenAI application models configured through local wrappers and versioned prompts.

## Run Locally

For the secure pilot container shape:

```bash
docker compose --env-file .env.release -f docker-compose.release.yml build
docker compose --env-file .env.release -f docker-compose.release.yml up -d db
docker compose --env-file .env.release -f docker-compose.release.yml run --rm migrate
docker compose --env-file .env.release -f docker-compose.release.yml up -d app worker
```

For host-side development:

```bash
npm install
npm run prisma:validate
npm run typecheck
npm run dev
```

Do not use `db push` against pilot or production data.

## Documentation

Start here:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [AGENTS.md](AGENTS.md)
- [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
- [EVIDENCE_ENGINE.md](docs/architecture/EVIDENCE_ENGINE.md)
- [DATA_MODEL_AND_ARTIFACTS.md](docs/architecture/DATA_MODEL_AND_ARTIFACTS.md)
- [LLM_AND_PROMPT_REGISTRY.md](docs/architecture/LLM_AND_PROMPT_REGISTRY.md)
- [REPOSITORY_AND_RELEASE_MAP.md](docs/architecture/REPOSITORY_AND_RELEASE_MAP.md)
- [deployment.md](docs/runbooks/deployment.md)

Historical reports in `docs/quality/` are evidence for how the release was validated; they are not the first source of truth for future work.
