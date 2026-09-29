#!/bin/sh
set -eu
cd /srv/ingeniometrix
# This service installation path is explicit and separate from all RC3/G4 stacks.
set -a
. /etc/ingeniometrix/g5.env
set +a
case "${G5_BACKUP_REPOSITORY:-}" in
  rclone:imx-drive-crypt:*) ;;
  *) echo 'REVIEWED_CRYPT_REPOSITORY_REQUIRED' >&2; exit 1 ;;
esac
compose() { docker compose --env-file /etc/ingeniometrix/g5.env -f docker-compose.g5.yml -f docker-compose.g5-drive.yml "$@"; }
# Keep quiescence bounded; interrupted jobs retain B4 checkpoints/attempt history.
trap 'compose up -d app worker' EXIT
compose stop -t 120 app worker
compose run --rm -e IMX_BACKUP_QUIESCED=1 backup backup
compose up -d app worker
compose exec -T app node -e 'const fs=require("fs");const p="/app/artifacts-local/operations/backup.json";fs.writeFileSync(p+".tmp",JSON.stringify({at:new Date().toISOString(),status:"SUCCESS"}),{mode:384});fs.renameSync(p+".tmp",p)'
trap - EXIT
