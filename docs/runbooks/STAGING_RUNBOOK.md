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
BACKEND_API_ORIGIN (frontend) and UPLOAD_ORIGIN = https://api-staging.ingeniometrix.com.
Backend's server-component fallback remains local. Rebuild frontend after origin changes.
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
Before enabling named tunnel/Vercel, complete DNS approval, off-machine repository,
Google callback setup and the production launch checklist. No production cutover here.
