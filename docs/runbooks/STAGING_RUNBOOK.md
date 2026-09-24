# RC4 G5 staging runbook

Do not run against RC3 or external G4 acceptance. Branch feat/rc4-scientific-commercial.
Read [hybrid architecture](../architecture/HYBRID_DEPLOYMENT.md) and current G5 report.

```bash
node scripts/g5-init-local.mjs
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml config --quiet
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml build app migrate backup
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml up -d db
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml run --rm migrate
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml run --rm db-grants
docker compose --env-file .env.g5-staging -f docker-compose.g5.yml up -d app worker proxy
```

Initializer creates exclusively a new ignored 0600 env, never overwrites. It supplies
random local DB/worker/backup secrets and loopback origins, no paid/provider secrets.
Passwords generated in URL-safe hex; externally provisioned DB passwords must be
URL-encoded when interpolated into database URLs. Required secret names:
POSTGRES_PASSWORD, MIGRATION_PASSWORD, APP_DB_PASSWORD, WORKER_DB_PASSWORD,
BACKUP_DB_PASSWORD, BLUEPRINT_WORKER_SECRET. Backup needs RESTIC_PASSWORD/RESTIC_REPOSITORY.
DB name fixed imx_g5_staging, ports only G5_PROXY_PORT loopback; no DB published port.

External staging (only after credentials/owner approval):
PUBLIC_APP_ORIGIN / APP_ORIGIN / AUTH_ORIGIN = https://staging.ingeniometrix.com;
Vercel Preview/Pre-Production variables are branch-scoped to
feat/rc4-scientific-commercial:
IMX_RUNTIME_ROLE=frontend;
PUBLIC_APP_ORIGIN / APP_ORIGIN / AUTH_ORIGIN = https://staging.ingeniometrix.com;
BACKEND_API_ORIGIN / UPLOAD_ORIGIN =
https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000.
Ordinary browser API calls use Vercel's same-origin rewrite to BACKEND_API_ORIGIN.
Direct PDF upload and artifact download capabilities use UPLOAD_ORIGIN. The API
origin is the Ubuntu staging Caddy ingress through Tailscale Funnel; the port is
public only through Funnel. Vercel Production variables are unchanged. Rebuild
frontend after origin changes. The api-staging.ingeniometrix.com Cloudflare named
tunnel remains a future option and has no DNS record in Wix.
IMX_PAYMENT_MODE=sandbox, IMX_PAYMENT_ACCOUNT_CONTEXT=test_user;
production price/payment disabled, authless/deep research OFF. Add only test provider
credentials if the external acceptance needs them. No production keys.

## Google owner configuration

Exact staging callback: `https://staging.ingeniometrix.com/api/auth/google/callback`.
Prepared production callback (NOT activated): `https://ingeniometrix.com/api/auth/google/callback`.
Preserve G4: `https://pepe-thinkpad-t470s.tailbcdf27.ts.net:8448/api/auth/google/callback`.
Server OIDC does not use browser Google JS SDK; no JS-origin list is needed by this
implementation. If console requires an app origin, use the exact public HTTPS origin.
Keep OAuth test users/test publishing mode. Owner performs login/reload/logout/relogin.

## Acceptance / stopping

Offline: `node scripts/g5-offline-validation.mjs`, Prisma validate, typecheck, builds.
Boundary: package-vercel + check-vercel-bundle. Local HTTP test needs the generated
frontend listening only on 127.0.0.1:3311 with matching local origins.
`node --import tsx scripts/test-g5-http.ts` uses only synthetic fixture + local routes.
Never label it Google/scientific/provider acceptance.

Stop only G5: `docker compose --env-file .env.g5-staging -f docker-compose.g5.yml stop`.
Keep volumes. Do not stop RC3/G4, tunnel or Tailscale services.
The 2026-09-24 G5.2 probe received Vercel HTTP 200 from the custom staging domain;
do not change DNS unless that mapping is rechecked and a specific record change is
authorized.
For Google staging login, authorize the callback above in Google Console. Funnel
public API readiness is available at /api/health/ready; it exposes only a sanitized
status. Off-machine backup/restore and external monitoring remain separate blockers.
No production cutover here.

G5.2 recheck (2026-09-24): staging origin `/` and `/workspace` returned 200; direct
Funnel liveness/readiness returned 200. Do not infer an authenticated user session
from an unauthenticated workspace-shell response. External backup/restore, alerting,
the controlled paid scientific journey and external two-user acceptance remain
pending; no paid generation or payment was initiated for this checkpoint.
