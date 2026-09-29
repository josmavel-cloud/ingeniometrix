# RC4 production-pilot release preparation

This is a release-candidate procedure, not authority to deploy production.
Use `docker-compose.g5.yml`, `docker-compose.g5-drive.yml`, and
`docker-compose.rc4-production.yml` (in that order) with a separate protected
production env file. The overlays change the Compose project
and database to `imx-rc4-production` / `imx_rc4_production`; it does not reuse
staging volumes or staging credentials. Run
`node ops/g5/production-env-preflight.mjs /path/to/production.env` before
evaluating Compose or starting any container. Never use a staging env file.

The pilot enables Google OIDC, research definition, OpenAlex Sources, human
selection, source preparation, optional private PDFs, immutable EvidenceSet,
ScientificDesign and DOCX. Astra web discovery and convergence, Deep Research,
privileged admin functions, and payments remain disabled. The production overlay
forces their runtime flags off. Checkout returns no offer when the launch guard
is disabled; historical purchases remain read-only. No admin web route is shipped;
operator CLI access remains outside the public proxy until MFA is implemented.

The intended public origin is `https://ingeniometrix.com`, with the prepared
Google callback `https://ingeniometrix.com/api/auth/google/callback`. The
production backend origin is the existing `api.ingeniometrix.com` namespace,
subject to owner-controlled DNS/TLS cutover in the deployment task. A safe HTTPS
Vercel production origin may be used if the custom domain is not yet activated;
the exact OIDC callback must then match that chosen origin. Never reuse staging
OAuth callback, database, backup path or payment webhook.

Before deployment, provision production-only secrets outside Git, check rotation
of every production-exposed credential, verify Google callback registration,
and run the preflight. Rehearse ordered Prisma migrations on a fresh or restored
isolated PostgreSQL 16 database. Apply production migrations only after a fresh
encrypted remote backup and a restore plan have been verified. The EvidenceSet
immutability trigger and uniqueness indexes must remain present. Do not use
`prisma db push` or drop/recreate a production database.

The canonical backup repository must be a reviewed path under
`rclone:imx-drive-crypt:production/`; the base `imx-drive:restic-g5` repository
is explicitly rejected. `backup.sh` now checks all Restic data and does not run
retention automatically. Intended retention is 7 daily, 4 weekly and 3 monthly;
review a separate dry run before ever enabling deletion. A successful marker is
published only after backup and check. Validate restore on a separate PostgreSQL
instance and storage location. Do not overwrite staging or production during a
drill.

For monitoring, set production web/backend HTTPS origins as GitHub Actions vars
and a separate `PRODUCTION_MONITOR_TOKEN` secret matching the backend token.
The workflow checks web, API readiness, worker heartbeat, backup age and free
storage every 15 minutes after it reaches the default branch. Verify an actual
successful run and alert delivery during production cutover; a checked-in
workflow alone is not an active monitor.

Rollback means retaining all production volumes and switching to the previously
verified runtime image only when the schema remains compatible. For incompatible
data changes, restore a separately verified snapshot after owner approval;
commercial ledgers are append-only and must not be silently rewound. Never run
`docker compose down -v` or delete the accidental legacy Restic repository as
part of rollback.
