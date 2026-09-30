# RC4 production-pilot release preparation

This is a release-candidate procedure, not authority to deploy production.
Use `docker-compose.g5.yml`, `docker-compose.g5-drive.yml`, and
`docker-compose.rc4-production.yml` (in that order) with a separate protected
production env file. The overlays change the Compose project
and database to `imx-rc4-production` / `imx_rc4_production`; it does not reuse
staging volumes or staging credentials. Run
`node ops/g5/production-env-preflight.mjs /path/to/production.env` before
evaluating Compose or starting any container. Never use a staging env file.

## Private predeploy provisioning (2026-09-29)

On the Ubuntu host, `scripts/rc4-init-production-env.mjs` exclusively created
the ignored `.env.production` file with mode 0600. It generated distinct
PostgreSQL superuser/migration/app/worker/backup passwords, a worker secret,
a monitoring token, and a Restic password. It left Google, OpenAI, and OpenAlex
credentials empty and set `IMX_BACKUP_REMOTE_REVIEWED=0`. The application uses
random database-backed session and transfer tokens; it has no separate static
session or artifact-signing secret to provision.

The `imx-rc4-production` Compose project has its own PostgreSQL 16 database
`imx_rc4_production`, internal `data` network, `g5_db` volume, and private
`g5_artifacts` volume. Only `db` is running. Its application schema has not
been migrated; do not start `app`, `worker`, `migrate`, `db-grants`, or `proxy`
in this preparation step. The production override pins the already built RC
runtime and migration images, without rebuilding from a dirty worktree. Caddy
uses `ops/g5/Caddyfile.production`, accepts only the production API host, and
would bind the host at `127.0.0.1:3311` after activation. The production DB
publishes no host port.

The protected existing `imx-drive-crypt` transport responded to a read-only
probe. `.env.production` names a new `production/` Restic repository with an
independent password. The repository has not been initialized and no backup
has been created. Review the shared rclone account's scope and recovery custody
before changing `IMX_BACKUP_REMOTE_REVIEWED` to 1. Do not use the staging
snapshot as a production recovery point.

Wix is authoritative for DNS. There is no `api.ingeniometrix.com` record and
no configured Cloudflare named tunnel on this host. Staging uses a Tailscale
Funnel URL with its own TLS name. A direct A record or CNAME to that Tailscale
name would not establish a valid certificate for `api.ingeniometrix.com`.
The owner must choose and configure a TLS ingress that presents the production
API hostname and forwards only to `http://127.0.0.1:3311`; then use the DNS
target supplied by that ingress. Keep the proxy stopped until that is ready.

The Google server callback is derived from `APP_ORIGIN` and is exactly
`https://ingeniometrix.com/api/auth/google/callback`. This server-side OIDC
flow does not require a Google JavaScript origin. If the Google Console asks
for one, enter `https://ingeniometrix.com`. Create or update a production
OAuth web client and inject `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only
in the protected backend environment.

Set these non-secret Vercel Production variables for the frontend-only package:

| Name | Value |
| --- | --- |
| `IMX_RUNTIME_ROLE` | `frontend` |
| `PUBLIC_APP_ORIGIN`, `APP_ORIGIN`, `AUTH_ORIGIN` | `https://ingeniometrix.com` |
| `BACKEND_API_ORIGIN`, `UPLOAD_ORIGIN` | `https://api.ingeniometrix.com` after TLS ingress exists |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | `https://ingeniometrix.com` |

Do not place database, Google client secret, provider API keys, worker secret,
Restic password, rclone credentials, or monitoring token in Vercel. Set the
production monitor's GitHub Actions URL variables and its secret only after
the API hostname is live. Before final deployment, add the four missing
external backend credentials to `.env.production`, review the backup account,
run the preflight, create and verify the production recovery point, then run
the approved migrations. The preflight currently fails closed on those pending
requirements by design.

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
