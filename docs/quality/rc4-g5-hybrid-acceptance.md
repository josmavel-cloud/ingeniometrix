# RC4 G5 hybrid acceptance

STATUS: BLOCKED (external acceptance); local implementation validated.
Date: 2026-09-23 America/Toronto. Base: `b6f0cf8a1917f39eb34650805a5f63f52782539a`.
Branch: `feat/rc4-scientific-commercial`. No push or production cutover.

## Implemented boundary

Vercel frontend contains UI and typed HTTP adapters only. Ubuntu owns sessions,
Prisma, projects, jobs, commercial ledger, providers, rendering and private storage.
Existing G1-G4 semantics remain in their existing services; no new scientific,
Google or Mercado Pago provider calls. New transfer tables are additive.

Same-origin API rewrites/SSR forward the opaque host-only session. Direct uploads
use exact Origin plus a one-use session/project/draft/size-scoped capability;
downloads use a short-lived one-use capability. Quarantine is not evidence approval.
Public backend ingress is Caddy on loopback 3310, not the app or PostgreSQL port.
Named tunnel configuration is prepared, not installed/connected.

## Observed validation

| Check | Result / scope |
| --- | --- |
| Relevant offline suites | 15/15 PASS: G5, G4 webhook/commercial/recovery/auth, B4 resilience, secure pilot, RC4 evidence/prejob/prompts/design/background/draft/G2/G3 |
| G5 service/security | 30 assertions PASS: two users, quota, ownership, expiry, race/replay, revocation, exact origins, invalid PDF/path, 30 MiB bound |
| HTTP hybrid boundary | 29 assertions PASS: password login/reload/logout, SSR through HTTP, same-origin proxy, direct 30 MiB upload, authenticated PDF redirect/download/hash, replay denial, private routes blocked |
| Fresh migrations | All 12 migrations applied in isolated imx_g5_staging |
| Existing RC4 migration | Additive transfer migration applied in isolated RC4 validation database |
| Prisma / TypeScript | PASS |
| Backend / worker | Release Docker production build + worker bundle PASS, Node 24.21.0 in app/worker |
| Frontend isolation | Generated standalone UI package builds with 53 installed packages; 24 production traces PASS without Prisma/private/backend dependencies |
| PostgreSQL roles | Separate migration/app/worker/backup; runtime non-superuser, CREATE/disable-trigger attempts denied; ledger mutations restricted |
| Encrypted restore | Restic backup restored into separate DB and artifact volume; password/session, project/version, DB/file SHA-256 and offline ledger verified |
| Restart | Isolated app + idle worker restarted; health and persisted fixture verified after restart |
| Tunnel/Drive preparation | Named ingress validates offline; rclone available in backup image; unreviewed remote access guard rejects without network |
| Observability | Internal liveness/readiness, worker heartbeat, disk/queue/job duration/cost operator query; rejected webhook counters explicitly UNKNOWN until log sink installed |
| External provider use | Paid LLM calls 0; payments 0; Google/MP acceptance NOT_RUN in G5 |

Private reproducibility evidence: `artifacts-local/rc4/g5/offline-results.json`,
individual suite logs, `http-result.json`, `restore-result.json`.
Offline fixture has synthetic PDF and dev entitlement; it is NOT a generated thesis,
Google login, real sandbox purchase, or scientific staging acceptance.

## Issues found and resolved locally

- PostgreSQL initial migration creates public schema: migration role needed database
  CREATE (not superuser). First empty staging migration attempt was marked rolled
  back after verifying it contained no product data, then all migrations passed.
  Initializer now grants that privilege reproducibly. Historical DBs were untouched.
- Next proxy clones/truncates request bodies at 10 MB. Exact direct-upload route is
  excluded from middleware; it independently requires exact Origin and capability.
  Full 31,457,280-byte HTTP upload then passed through Caddy and Next.
- Caddy directive sorting originally forwarded an internal path (backend denied 401).
  Explicit route ordering now denies it at ingress with 404, verified by HTTP test.
- App image creates private/operations directories with node ownership. Worker
  heartbeat writes are serialized. Restore applies the same restricted grants.

## G5.1 staging connection checkpoint (2026-09-23)

The owner-authorized RC4 feature branch is linked to the Vercel project above. Six
branch-scoped Preview variables were configured: `IMX_RUNTIME_ROLE=frontend`,
`PUBLIC_APP_ORIGIN`, `APP_ORIGIN`, and `AUTH_ORIGIN` use
`https://staging.ingeniometrix.com`; `BACKEND_API_ORIGIN` and `UPLOAD_ORIGIN` use
`https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000`. The values were applied only
to Preview for `feat/rc4-scientific-commercial`; Vercel Production was not changed.

The frontend-only package built and deployed Ready as Preview at
`https://ingeniometrix-lz6wbofh7-josmavel-clouds-projects.vercel.app` (deployment
`CJJxDGJWGUXqGjruHjmmTDrnp8RJ`). Bundle check passed with 23 production traces and
no Prisma, database credentials, worker, private-storage or LibreOffice modules.
Via Vercel's protected-deployment-aware curl, `/` and `/workspace` returned 200;
the same-origin `/api/ui/session` and an authenticated owner-only detail request
also returned 200 through the Ubuntu Caddy backend. Password-fixture login and
logout both returned 200. This proves the Vercel rewrite and backend session path,
not an end-user Google browser login. Vercel Deployment Protection remains on.
Direct Funnel liveness/readiness both returned 200. The same-origin Preview path
`/api/health/ready` returned 404, so readiness monitoring should use the backend
origin; this route discrepancy remains to investigate before relying on a Vercel
health proxy.

The Ubuntu app's `UPLOAD_ORIGIN` and Vercel Preview `UPLOAD_ORIGIN` both target the
Funnel origin. Direct upload and artifact-download capabilities therefore continue
to bypass Vercel, with existing one-use authorization and exact-Origin checks. The
30 MiB upload was already accepted through Funnel in the preceding checkpoint; it
was not repeated here. No Mercado Pago webhook configuration or order was changed.

Wix remains authoritative and the public custom hostname
`staging.ingeniometrix.com` still does not resolve. Therefore the Ready Preview
deployment URL is a diagnostic endpoint, not yet an approved browser staging origin:
Deployment Protection and the app's exact `APP_ORIGIN`/CSRF policy prevent treating
its `vercel.app` hostname as interchangeable with the custom domain. No DNS, Google
Console, Cloudflare or Production setting was changed. Exact Google callback for the
intended custom origin is
`https://staging.ingeniometrix.com/api/auth/google/callback`; it is not yet externally
verified. Intended sandbox webhook endpoint is
`https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000/api/payments/mercado-pago/webhook`.

## Not validated / external prerequisites

1. Custom staging-domain resolution and browser acceptance remain blocked on the
   owner-authorized Wix staging record and the domain association/Preview protection
   path. No DNS or Production setting was changed.
2. Cloudflare binary exists, but no named identity/management authorization available.
   Only staging and api-staging DNS adds are owner-approved, after destinations are
   verified. No DNS writes; root, api, Tailscale and G4 Quick Tunnel preserved.
3. Off-machine repository not configured. Owner supplied a Simetrika Drive folder;
   read-only connector metadata confirms `anyone: writer`. Upload is paused until
   owner restricts access and authorizes local rclone credentials/recovery ownership.
   Optional Drive/restic configuration is prepared, no remote backup write performed.
   Restic rehearsal used an encrypted repository on the SAME host: not a backup
   failure domain. Timer/service are templates, not installed; no backup-age alert.
4. External staging Google reload/logout/relogin, payment sandbox, scientific plan,
   downloads and tunnel restart NOT_RUN. Host reboot and in-flight scientific worker
   interruption NOT_RUN here; existing B4 regression coverage is not a live G5 test.
5. Admin MFA not implemented. G4 privileged commercial controls remain disabled.
6. New upload transport quarantines PDFs; antivirus/relevance processing, automatic
   interrupted-upload reconciliation and cleanup policy remain pending. A 30 MiB
   syntactically valid padded PDF tests transport capacity, not malicious PDF safety.
7. Independent monitoring/log alerts, off-host restore and full Docker firewall/external scan
   pending. Preexisting unrelated containers publish 3308 and 55438 broadly; preserved
   under task scope, not certified safe by G5. UFW is active; new listeners bind only
   loopback. This is not an external exposure audit. Home Ubuntu is not highly available.

Core boundary/storage commit: `6ce07e1afa02b0281b7b7f4b1bd1d4b6a8aee8cd`.
Operations/tests/handoff are in the accompanying G5 operations commit. No push.

Production cutover: NO. Real payments: NO. Price/merchant/legal/refund/production
webhook/admin-MFA prerequisites from G4 remain in force.

## G5.2 external staging close attempt (2026-09-24)

**Decision: BLOCKED; no production cutover.** This checkpoint preserves prior
acceptance and does not repeat Google login, payment, upload, Funnel-restart or
paid-provider tests.

Read-only probes: Vercel staging `/` and `/workspace` returned HTTP 200; Ubuntu
Funnel liveness and readiness returned HTTP 200. The latest signed Mercado Pago
diagnostic was 2026-09-24 05:16:15 UTC and returned HTTP 200 as
`VALID_UNSUPPORTED_NOTIFICATION` (`type=stop_delivery_op_wh`, `action=Created`).
Signature and request-ID headers were present and verification passed. That branch
does not invoke order processing, so Purchase, PaymentEvent, entitlement and credit
deltas were zero. Retained Caddy logs do not prove whether that request traversed
Vercel; it is not recorded as a Vercel-proxy webhook acceptance. No simulator,
payment or order was initiated in this checkpoint.

G5 offline validator: 15/15 PASS. Isolated G4 auth/commercial/webhook/order-recovery
and B4 resilience tests passed; Prisma validation, TypeScript, full Next build,
frontend-only package build/boundary check (24 traces), full build, worker bundle and
`git diff --check` passed. G4 DB tests used only `imx_b4_validation_rc4`; staging
ledger was not changed. Builds retain existing broad `artifacts-local` tracing
warnings. External provider acceptances were not repeated.

The owner-provided Drive folder still grants `anyone:writer`; it is not an acceptable
remote recovery target. No remote backup or restore-from-remote was performed. Host
`rclone`, `restic`, `gh` and `vercel` CLIs/remotes are unavailable. The previous
same-host encrypted restore remains a local rehearsal only. External monitoring is
not installed; there are no off-host alerts for web/API, worker heartbeat, backup
age or disk. The local operator health command could not run on the host because its
DB URL is injected into the app container, not the shell.

No authenticated staging session was available for this run. Consequently no fresh
project, paid scientific generation, artifact download, commercial settlement,
in-flight worker restart or external two-user isolation test was performed. This
avoids raw DB grants, admin-user creation and repeated OAuth/payment acceptance.
Prior idle-worker restart and local G5 ownership tests remain evidence only for
their original scope.

Resume prerequisites: restrict the Drive folder to approved principals; configure a
least-privilege rclone identity and independently held restic recovery key; provide
an authorized staging user session path and off-host monitoring/notification access.
G5 remains BLOCKED until remote backup and restore, monitoring, one controlled
scientific staging journey, download/settlement and external two-user isolation are
evidenced.

## G5.3 infrastructure prerequisite recheck (2026-09-24)

**Decision: BLOCKED; do not start the final paid staging E2E.** Source and remote
feature branch were both `e2a5b4b4d68c6328150071717b24695e67ca6467`; the worktree was
clean at start. This checkpoint changes only the four documentation files listed
below. No provider, payment, LLM, DB, or service mutation was performed.

| Check | Result | Evidence |
|---|---|---|
| Drive folder exposure | RESTRICTED | Drive permission metadata contained only named user owner/writer permissions; no anyone/link/domain permission. |
| Backup identity/config | NOT READY | No host `rclone.conf`, dedicated remote identity, or `/etc/ingeniometrix/g5.env`; no remote alias could be verified. Existing backup container image includes rclone/restic. |
| External encrypted backup | NOT RUN | No upload made; therefore no remote object/size/manifest evidence. |
| Restore from remote | NOT RUN | Same-host encrypted rehearsal is not an external restore. |
| External monitoring | NOT READY | `gh` CLI/workflow-secret write path unavailable; no protected operational endpoint (`/api/health/operational` returned 404). |
| Current staging probes | DEGRADED | Vercel `/` 200, `/workspace` 500; Funnel `/api/health/live` and `/api/health/ready` 200. |
| Failure/recovery + stale-backup tests | NOT RUN | No active external workflow exists to observe these conditions. |
| Local validation | PASS | Prisma validation with ephemeral placeholder URLs, typecheck, frontend build, full build, and worker bundle. The existing broad `artifacts-local` tracing warnings remain. |

No product/runtime files or services were changed; these G5.3 documentation notes
are the only worktree changes, and no commit/push was made. Before backup,
configure a dedicated least-privilege identity for the restricted folder, protected
rclone config, `imx-drive`/`imx-drive-crypt`, and independently escrowed crypt/restic
recovery secrets. Before monitoring, add a protected aggregate health contract and
monitoring credential, configure the GitHub Actions secret through repository
settings, and enable/verify the workflow from the repository's default branch. The
staging `/workspace` 500 should be diagnosed separately before final E2E.

## Reproduction and next action

Follow [STAGING_RUNBOOK](../runbooks/STAGING_RUNBOOK.md),
[VERCEL_BOUNDARY](../architecture/VERCEL_BOUNDARY.md),
[BACKUP_RESTORE](../runbooks/BACKUP_RESTORE.md) and
[PRODUCTION_LAUNCH_CHECKLIST](../runbooks/PRODUCTION_LAUNCH_CHECKLIST.md).
The Preview is deployed, but first resolve and verify the custom staging origin in
Wix/Vercel before Google browser acceptance. Do not deploy the repository root or
expose database/provider secrets to Vercel.
