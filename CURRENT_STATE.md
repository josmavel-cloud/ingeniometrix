# Current State

STATUS: CURRENT - Release 0 secure pilot handoff.

## Current Canonical Release

- Product: `Ingeniometrix`
- Branch: `release/secure-pilot`
- Commit: `5442a9ba29abed0aabaa4b882e4ca5a0ca057760`
- Release worktree: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-release0`
- Backend engine lineage: `be9c72bf849496721741c987aa90d1a914d82315`
- Frontend lineage: `7f6b615ea8b57c661f5d55cdf94f12152d195aa4`
- Backend baseline ancestor: `341a524bac2e1e370316ceff5ca57ad073d216ab`

Do not resume MVP development from the historical `master-blueprint` workspace.

## What Works

- Authenticated project workspace.
- Structured intake and topic/project flow.
- OpenAlex/Crossref source discovery and enrichment.
- Human source selection.
- Source inspection, materialization, evidence extraction and sufficiency checks.
- Canonical Step 5 -> Step 6 scientific plan generation.
- Research design, consistency matrix, visual deliverables, DOCX, PDF, BibTeX, RIS and evidence log.
- DB-backed generation jobs with bounded retries, heartbeat and stale-lock recovery.
- Owner-scoped private artifact downloads from `GeneratedArtifact.content`.
- Containerized release shape: `app`, `worker`, `migrate`, `db`.

## What Has Been Validated

- Security: `PASS`.
- Integration: `PASS`.
- Recoverability: `PASS`.
- Scientific engine: B2/B3 `PASS_WITH_LIMITATIONS`.
- Visual product closure: `PASS_WITH_LIMITATIONS`.
- Secure pilot local E2E: login -> project -> intake -> evidence fixture -> human selection -> job -> result -> DOCX/PDF download -> logout.
- Two-user isolation for read, mutate, generate and download.
- Worker restart/stale-lock recovery.
- Fresh DB migration and isolated baseline adoption.
- Runtime image and Docker Compose startup.

## What Has Not Been Deployed

- No protected external preview URL was deployed.
- No production/shared database was mutated.
- No push or tag was created for the release freeze.
- A real paid production smoke on the target host remains pending.

## Current Security Status

Secure pilot controls are implemented: scrypt password hashes, opaque hashed sessions, expiry/revocation/logout, login throttling, same-origin mutation checks, worker bearer secret, owner-scoped project/artifact access and private DB artifact storage.

Remaining prerequisite: run the release on an authorized host with TLS, durable backups and injected secrets.

## Current Scientific Engine Status

The validated engine can produce scientifically traceable thesis-plan proposals with limitations. It must not be represented as human scientific review or as a thesis generator.

Known limitations:

- Deep Research is disabled in the secure pilot.
- B3 reported scientific/editorial limitations such as page-target overrun and wording requiring advisor review.
- Microsoft Word visual validation was not performed; LibreOffice/PDF validation was.

## Current Frontend Status

The approved frontend lineage is merged into the release commit. It integrates the existing Next.js application with the canonical project/intake/source/generation/download flow. It is not a rewrite.

## Current Backend Status

The release branch contains the canonical engine, secure pilot auth/session controls, DB-backed jobs and private artifact persistence. The historical lab/master-blueprint code is reference-only and must not be used as source of truth for new work.

## Deep Research Status

Implemented as an optional candidate-discovery fallback, but disabled in Release 0 with:

```text
IMX_ENABLE_DEEP_RESEARCH=0
```

It is not part of the validated default production path.

## Known External Prerequisites

- Authorized Linux/Docker host.
- TLS/domain or protected preview endpoint.
- Secret injection outside Git.
- Persistent PostgreSQL and artifact-volume backup procedure.
- Staging E2E with real pilot configuration before user access.

## Next Recommended Action

Deploy the secure pilot to an authorized protected Linux/Docker host and run the documented staging E2E before giving users access.
