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
Retention: 7 daily, 4 weekly, 6 monthly snapshots; prune only in deliberate maintenance.
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

Owner supplied a dedicated Drive folder during G5. Metadata inspection found
`anyone: writer`; no backup was uploaded and permissions were not changed by Codex.
Owner must change General access to Restricted, keep only approved principals,
and arrange an independent recovery custodian/key before production data upload.
Re-read folder permissions after the change; a public editable folder is not ready.

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

After authorized local credential setup and ACL verification: initialize one new
`restic-g5` repository in the folder, quiesce only G5 app/worker, back up, check, and
restore from that REMOTE repository into a new isolated DB/volume. Compare hashes
and ledger again. Remote copy/restore remain NOT_RUN. Existing local repo is preserved.

Sources: [restic rclone backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#other-services-via-rclone),
[Drive scopes/root configuration](https://rclone.org/drive/).

[Restic repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
documents encrypted repositories and remote backend configuration.

Rechecked 2026-09-24: Drive ACL remains `anyone:writer`; external backup, remote
object verification and restore-from-remote remain NOT RUN. The previous restic
restore is an isolated same-host rehearsal only, not an off-machine backup. No
remote credentials were discovered or printed.
