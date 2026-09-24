#!/bin/sh
set -eu
umask 077
: "${RESTIC_PASSWORD:?required}"
: "${RESTIC_REPOSITORY:?required}"
case "$RESTIC_REPOSITORY" in
  rclone:*)
    # This acknowledgement follows an actual folder ACL/account review, not just
    # possessing a public link. Credentials stay outside the repository/app.
    [ "${IMX_BACKUP_REMOTE_REVIEWED:-0}" = 1 ] || { echo 'REMOTE_ACCESS_REVIEW_REQUIRED' >&2; exit 1; }
    [ -f "${RCLONE_CONFIG:-/missing}" ] || { echo 'RCLONE_CONFIGURATION_REQUIRED' >&2; exit 1; }
    ;;
  sftp:*|s3:*|b2:*|azure:*|gs:*|rest:https:*) ;;
  *) [ "${IMX_BACKUP_ALLOW_LOCAL_TEST:-0}" = 1 ] || { echo 'OFF_MACHINE_BACKUP_REQUIRED' >&2; exit 1; } ;;
esac
case "${1:-backup}" in
  init) exec restic init ;;
  check) exec restic check --read-data ;;
  restore) exec restic restore "${2:?snapshot id required}" --target /scratch/restore ;;
  backup)
    # Caller must quiesce app/worker first; no cross-resource live snapshot claim.
    [ "${IMX_BACKUP_QUIESCED:-0}" = 1 ] || { echo 'QUIESCE_REQUIRED' >&2; exit 1; }
    pg_dump --format=custom --no-owner --no-acl --file=/scratch/database.dump
    find /artifacts -type f ! -name '*.part' ! -name '*.tmp' -exec sha256sum '{}' \; > /scratch/artifacts.sha256
    restic backup --tag imx-g5 --exclude '*.part' --exclude '*.tmp' /scratch/database.dump /scratch/artifacts.sha256 /artifacts /config
    restic check
    restic forget --tag imx-g5 --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6
    ;;
  *) echo 'UNKNOWN_BACKUP_OPERATION' >&2; exit 1 ;;
esac
