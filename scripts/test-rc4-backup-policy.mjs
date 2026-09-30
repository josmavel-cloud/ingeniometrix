import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const script = readFileSync("ops/g5/backup.sh", "utf8");
assert(!/restic\s+(forget|prune)\b/.test(script), "backup cannot delete snapshots automatically");
const result = spawnSync("sh", ["ops/g5/backup.sh", "check"], { encoding: "utf8",
  env: { PATH: process.env.PATH, RESTIC_PASSWORD: "fixture",
    RESTIC_REPOSITORY: "rclone:imx-drive:restic-g5", IMX_BACKUP_REMOTE_REVIEWED: "1",
    RCLONE_CONFIG: "/etc/hosts" } });
assert.notEqual(result.status, 0);
assert.match(result.stderr, /UNREVIEWED_BASE_DRIVE_REPOSITORY/);
console.log("PASS RC4 backup policy: base Drive rejected before network, no automatic retention deletion");
