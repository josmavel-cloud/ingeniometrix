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

## Not validated / external prerequisites

1. Vercel project supplied: `https://vercel.com/josmavel-clouds-projects/ingeniometrix`.
   CLI 59.26.0 reports Logged out. No project settings or domain aliases changed.
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

## Reproduction and next action

Follow [STAGING_RUNBOOK](../runbooks/STAGING_RUNBOOK.md),
[VERCEL_BOUNDARY](../architecture/VERCEL_BOUNDARY.md),
[BACKUP_RESTORE](../runbooks/BACKUP_RESTORE.md) and
[PRODUCTION_LAUNCH_CHECKLIST](../runbooks/PRODUCTION_LAUNCH_CHECKLIST.md).
Authorize local Vercel access for the identified project; never share tokens in chat.
Then verify exact staging destinations before any approved DNS addition. Do not
deploy the repository root or expose database/provider secrets to Vercel.
