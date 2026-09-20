# Architecture

STATUS: CURRENT - Release 0 secure pilot.

## Shape

```text
Browser
  -> Next.js pages/components
  -> Next.js API routes
  -> PostgreSQL via Prisma
  -> DB-backed job queue
  -> Worker process
  -> Evidence Engine + exporters
  -> GeneratedArtifact private downloads

External providers:
  OpenAlex, Crossref, OpenAI

Runtime dependencies:
  LibreOffice, Poppler, Python, PyMuPDF
```

Release 0 preserves one Next.js application. The deployable container image has three roles: `app`, `worker` and `migrate`. PostgreSQL is the durable source for users, sessions, projects, jobs, provenance and final private artifacts. A private volume is used for intermediate document/PDF processing files.

## Browser / UI

The UI is in `app/` and `components/`. Current user-facing flows include workspace/login, projects, topic/intake, source search/selection, generation progress and export/download panels. Frontend and backend are same-origin in the release shape.

## API Routes

Production-relevant API routes live under `app/api/`:

- `auth/session` and `auth/logout`
- `projects`
- `projects/[id]`
- `projects/[id]/intake`
- `projects/[id]/search`
- `projects/[id]/references`
- `projects/[id]/source-selection`
- `projects/[id]/blueprints`
- `projects/[id]/blueprints/progress`
- `projects/[id]/blueprints/[versionId]/docx|pdf|bibtex|ris|evidence-log`
- `internal/blueprint-jobs/[jobId]/run-stage`

Project APIs call `requireCurrentUser()` and service-layer ownership checks. The internal worker route requires a bearer secret.

## Authentication / Session

Auth code is in `server/auth/`.

- `User.passwordHash` stores scrypt password hashes.
- `UserSession.tokenHash` stores SHA-256 of opaque random session tokens.
- Cookie: `imx_session`, HttpOnly, SameSite Strict, Secure in production.
- Logout revokes the persisted session.
- `AuthThrottle` records login failures by hashed email/IP key.
- Non-production authless workspace exists only when `IMX_AUTHLESS_WORKSPACE=1`; Release 0 keeps it disabled.

Security headers are configured in `next.config.ts`.

## PostgreSQL

Prisma schema is in `prisma/schema.prisma`. Migration history:

- `20260918000000_baseline`
- `20260919000000_secure_pilot`

The secure pilot migration is additive.

## Worker / Jobs

Jobs are implemented in `server/blueprint-v2/jobs/blueprint-job-service.ts` and run with `scripts/run-release-worker.ts`.

Stages:

1. `materializing_evidence`
2. `generating_plan`
3. `persisting_artifacts`
4. `completed`

`BlueprintJob` records owner, project, stage, attempts, locks, heartbeat and recoverable stage data. `BlueprintJobStage` records per-stage state. Stale locks are reclaimed and completed artifacts are persisted idempotently.

## Artifact Storage

Final DOCX, PDF, BibTeX, RIS and evidence log are stored privately in PostgreSQL as `GeneratedArtifact.content`, with owner, project, version, job, MIME type, byte size and SHA-256. Intermediate files remain in `IMX_ARTIFACTS_DIR` or the release private volume.

Private artifacts must not be placed under public static assets or committed.

## Evidence Engine

The current canonical path is in `server/mvp/` with supporting code in `server/retrieval/`, `server/blueprint-v2/` and `server/reporting/`. See `EVIDENCE_ENGINE.md`.

## Trust Boundaries

- Browser is untrusted.
- Intake, retrieved text, abstracts, PDFs and provider data are untrusted content.
- LLM outputs are untrusted until schema/deterministic validation passes.
- Worker route is internal and bearer-protected.
- Owner boundary is `userId + projectId`; downloads also require matching `blueprintVersionId` and artifact owner.
- Heavy/private artifacts are not public web assets.

## Deployment

Use `docker-compose.release.yml`:

- `db`: PostgreSQL 16.
- `migrate`: one-shot Prisma migration image.
- `app`: Next.js HTTP runtime.
- `worker`: release worker polling PostgreSQL.

Serverless-only deployment is not verified for Release 0 because document generation requires LibreOffice, Poppler, Python/PyMuPDF, persistent job execution and private storage.
