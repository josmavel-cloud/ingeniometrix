# G5 encrypted backup and restore

`ops/g5/Dockerfile.backup` packages pg_dump/pg_restore and restic. Never custom crypto.
`backup.sh` requires RESTIC_PASSWORD + RESTIC_REPOSITORY. Default policy rejects local
repositories unless IMX_BACKUP_ALLOW_LOCAL_TEST=1 explicitly selects a mechanics test.
Production must use a verified remote repository (e.g. SFTP/S3-compatible), protected
credentials/known_hosts outside Git and a separate recovery copy of the restic password.
A URL alone does not prove a second failure domain; owner must verify actual location.

Snapshot includes custom-format DB dump, artifact volume, artifact SHA-256 manifest,
non-secret ops configuration. Plaintext dump is in tmpfs, container removed after use.
Quiesce app + worker before snapshot for DB/files consistency; requests temporarily
unavailable. Resume services in a trap. B4 job checkpoints persist; do not reset attempts.
Intended retention: 7 daily, 4 weekly, 3 monthly snapshots. Automatic pruning is
disabled; deletions require a separately reviewed maintenance operation.
Store secrets separately encrypted; they are not in the committed config directory.
Restic encrypts the repository; dump/fixture passwords are never logged.

## Isolated reproducible rehearsal

```bash
node scripts/g5-staging-ops.mjs seed
node scripts/g5-staging-ops.mjs verify
node scripts/g5-staging-ops.mjs backup-restore
```

Only imx-rc4-g5-staging and imx_g5_restore are targeted. Refuses to drop/recreate an
existing restore DB. Fixtures are artificial, not payments or scientific acceptance.
Restores DB to a separate database and binaries to a separate volume; checks password
verification/session issuance, project/version identity, DB/file hashes and unchanged
5-slot/10000-credit offline ledger. This is NOT external Google reauthentication.
No RC3/G4 data is copied, changed or deleted. Inspect private
`artifacts-local/rc4/g5/restore-result.json` for actual result.

## Automation/install

Review install paths in backup-host.sh, service and timer before enabling them.
Scheduled service is a template, NOT installed automatically. Runtime env belongs
in /etc/ingeniometrix/g5.env (0600); service code in /srv/ingeniometrix.
Initialize remote repository once (`backup init`), back up, check all data, restore
to a new isolated host, then enable timer. Configure repository-specific credentials
explicitly; Compose currently exposes only repository/password, additional S3/SFTP
secrets/mounts must be provisioned without copying application secrets.

Rollback deployment: stop app/worker, retain volumes, start previously verified image
with compatible additive schema. Do not down -v. New transfer tables can remain unused.
Rollback data only to an independently verified restore; financial ledger is append-only.
Off-machine copy, restore on replacement hardware and scheduled backup freshness alerts
remain production prerequisites until proven.

## Owner-selected Workspace / Drive destination

Owner supplied a dedicated Drive folder during G5. On 2026-09-24, read-only
permission metadata showed General access restricted: only named user permissions
were returned (owner and writer); no `anyone`, `anyoneWithLink`, or domain permission
was present. No permission changes or uploads were made. This is a safe folder ACL,
not proof that the backup credential is least-privileged.

The backup image includes rclone. Optional `docker-compose.g5-drive.yml` uses
restic's rclone transport; encryption remains in restic before transfer. Configure
a dedicated `imx-drive` remote locally through rclone OAuth or an approved service
identity. Prefer a principal granted only the dedicated folder, no domain-wide
delegation. `root_folder_id` selects a working root; it is NOT an OAuth security
boundary. `drive.file` scope alone cannot see an arbitrary preexisting folder.
Review account scopes with the owner; do not extract credentials from a connector
or reuse the app's Google login client/session. Never paste OAuth tokens in chat.

Required additional local settings: G5_RCLONE_CONFIG_DIR (protected directory),
G5_DRIVE_FOLDER_ID, IMX_BACKUP_REMOTE_REVIEWED. The override refuses a missing
config directory and backup.sh refuses unreviewed access. Store rclone.conf mode
0600 in a dedicated 0700 directory outside Git; it must allow safe token refresh.
Supply the override to every backup/check/restore command and scheduled backup
wrapper; do not use the local-repository rehearsal as proof of remote readiness.

Before configuring the remote, create/authorize a dedicated Google identity (or
approved service identity) with access only to this folder where feasible. Complete
interactive rclone OAuth setup locally; do not use the app's OIDC credentials or
the broad Google Drive connector identity as a substitute. Store the remote config
outside the repository with directory mode 0700 and file mode 0600. Separately
generate and escrow both the restic repository password and rclone-crypt recovery
secret with an independent custodian; neither belongs in Git, Drive, or chat.

After authorized local credential setup and ACL verification, use a unique,
versioned repository path through `imx-drive-crypt`, for example
`rclone:imx-drive-crypt:staging/YYYY/MM/DD/<backup-id>`. The Drive overlay now
requires an explicit `G5_BACKUP_REPOSITORY`; set it to the reviewed crypt path
and verify it before init, backup, check, or restore. The historical base remote
is rejected by `backup.sh`.

Sources: [restic rclone backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#other-services-via-rclone),
[Drive scopes/root configuration](https://rclone.org/drive/).

[Restic repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
documents encrypted repositories and remote backend configuration.

### External encrypted backup/restore acceptance (2026-09-24)

Owner confirmed independent custody of the rclone crypt password/password2 and
Restic repository password. The host rclone config was mode 0600; the dedicated
Drive folder had previously been verified restricted. The `imx_backup` database
role was confirmed non-superuser and without database-create, insert, or update
privileges. There were no active generation jobs. Only the isolated G5 staging app
and worker were briefly quiesced; both returned healthy and staging readiness was
200 afterward. No live database writes, payments, or LLM calls were made.

Verified encrypted repository:

- Backup ID: `ed5d7458-5586-441d-8990-60da933cd6da`
- Remote: `imx-drive-crypt:staging/2026/09/24/ed5d7458-5586-441d-8990-60da933cd6da`
- Restic snapshot: `62703b86`
- Created: `2026-09-24T15:31:47Z`
- Manifest SHA-256: `21d71550fe57301aa662eb14540089ef9c0c21a48c5f6a5044cef19d704b2e0b`
- Restic processed 94,668,534 logical bytes in 56 files and packed 79,961 bytes;
  rclone reported 6 remote files / 83,887 bytes including remote metadata overhead.
- Restic `check --read-data` passed. A fresh restore was downloaded from this Drive
  repository into tmpfs and restored to a temporary PostgreSQL 16 container on
  `network none`; no live storage or DB was used.
- Database object counts and migration inventory matched. Counts: 2 users, 3
  projects, 3 drafts, 1 BlueprintVersion, 0 jobs, 1 GeneratedArtifact, 0 purchases,
  1 entitlement, 0 reservations, 2 ledger entries, 0 payment events, 13 migrations.
  Negative entitlement balances, negative ledger available-after values, active
  jobs, and unfinished migrations: all zero. One user/project/version join resolved.
- All 6 private-storage file hashes passed. Temporary restore container, socket
  volume, and decrypted tmpfs data were removed; the remote snapshot was preserved.

Operational deviation: an earlier attempt exposed that the Drive Compose overlay
hard-codes `rclone:imx-drive:restic-g5`. Before detecting the override, one separate
Restic-encrypted repository and snapshot was created at that base-remote path. It
was not used for the accepted restore and was not deleted, in accordance with the
no-delete instruction. Restic encrypts its repository contents, but the rclone
crypt layer was not applied to that extra copy. Review/remove that exact repository
only under a separately authorized cleanup; do not confuse it with the accepted
crypt snapshot above. No plaintext database or artifact data was uploaded.

Provisional pilot retention: daily 7, weekly 4, monthly 3. This is the intended
schedule, not an enabled pruning schedule. RC4 production hardening removed
automatic `forget` from `backup.sh`; routine backups do not delete snapshots.
Review a separate dry-run policy against the exact crypt repository before ever
enabling retention. Do not run pruning as part of release preparation.

### Fresh RC4 staging recovery point (2026-09-29)

The new reviewed crypt repository is
`rclone:imx-drive-crypt:staging/2026/09/29/dfcc70f0-c868-4821-92ac-e17aad32968c`.
Snapshot `e7ad123d` was created at `2026-09-29T13:19:30Z` after quiescing
only the staging app and worker. Restic processed 91.244 MiB logical in 20
files; `check --read-data` passed. A fresh remote restore into tmpfs verified
all eight private artifact hashes and restored the dump into a temporary
PostgreSQL 16 container with no network. The restored database had five users,
11 projects, 45 project references, zero EvidenceSets and 15 finished migrations;
there were no unfinished migrations. Temporary decrypted data and the database
container were removed. The staging app and worker resumed healthy. This is a
staging recovery point, not a backup of a yet-undeployed production database.

The external staging monitor treats the most recent successful backup marker older
than 26 hours, or a missing/invalid marker, as stale/unknown. It does not prune or
delete backup data. Retention scheduling remains a separate, explicitly reviewed
maintenance change using daily 7, weekly 4, monthly 3; cleanup of the extra
`rclone:imx-drive:restic-g5` repository still requires owner authorization.
`CLEANUP_AUTHORIZATION_REQUIRED = YES`; do not delete or prune that repository
without separate owner approval.

For recovery, restore the exact versioned crypt repository using the protected
rclone config plus the independently escrowed rclone crypt and Restic recovery
secrets; use the matching Postgres major version (16 here), then validate the
manifest SHA-256, migration inventory, artifact hashes, and ledger checks before
starting app/worker processes. Recovery secrets are not stored in this repository.
