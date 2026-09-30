import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const file = ".env.g5-staging";
execFileSync("git", ["check-ignore", "--quiet", file]);
const secrets = ["POSTGRES_PASSWORD", "MIGRATION_PASSWORD", "APP_DB_PASSWORD", "WORKER_DB_PASSWORD", "BACKUP_DB_PASSWORD", "BLUEPRINT_WORKER_SECRET", "RESTIC_PASSWORD"];
const lines = secrets.map((name) => `${name}=${randomBytes(32).toString("hex")}`);
lines.push("PUBLIC_APP_ORIGIN=http://127.0.0.1:3311", "UPLOAD_ORIGIN=http://127.0.0.1:3310", "G5_PROXY_PORT=3310", "IMX_BACKUP_ALLOW_LOCAL_TEST=1");
// Exclusive creation: never replace existing secrets or copy external G4 secrets.
await writeFile(file, lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
console.log("G5 isolated env created; provider credentials omitted; mode 600.");
