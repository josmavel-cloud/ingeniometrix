#!/bin/sh
set -eu
cd /srv/ingeniometrix
# This service installation path is explicit and separate from all RC3/G4 stacks.
compose() { docker compose --env-file /etc/ingeniometrix/g5.env -f docker-compose.g5.yml "$@"; }
# Keep quiescence bounded; interrupted jobs retain B4 checkpoints/attempt history.
trap 'compose up -d app worker' EXIT
compose stop -t 120 app worker
compose run --rm -e IMX_BACKUP_QUIESCED=1 backup backup
compose up -d app worker
compose exec -T app node -e 'const fs=require("fs");const p="/app/artifacts-local/operations/backup.json";fs.writeFileSync(p+".tmp",JSON.stringify({at:new Date().toISOString(),status:"SUCCESS"}),{mode:384});fs.renameSync(p+".tmp",p)'
trap - EXIT
