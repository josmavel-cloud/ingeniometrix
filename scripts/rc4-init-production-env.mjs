import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const file = ".env.production";
const configDir = process.argv[2] && resolve(process.argv[2]);
if (!configDir) throw new Error("PROTECTED_RCLONE_CONFIG_DIRECTORY_REQUIRED");
execFileSync("git", ["check-ignore", "--quiet", file]);
const configFile = join(configDir, "rclone.conf");
for (const path of [configDir, configFile]) {
  if ((statSync(path).mode & 0o077) !== 0) throw new Error("RCLONE_CONFIG_PERMISSIONS");
}
const config = readFileSync(configFile, "utf8");
let section = "", folderId = "", cryptConfigured = false;
for (const line of config.split(/\r?\n/)) {
  const header = line.match(/^\[([^\]]+)\]\s*$/);
  if (header) {
    section = header[1];
    if (section === "imx-drive-crypt") cryptConfigured = true;
  } else if (section === "imx-drive") {
    folderId = line.match(/^root_folder_id\s*=\s*(\S+)\s*$/)?.[1] ?? folderId;
  }
}
if (!folderId || !cryptConfigured) throw new Error("CANONICAL_CRYPT_REMOTE_NOT_CONFIGURED");

const secretNames = ["POSTGRES_PASSWORD", "MIGRATION_PASSWORD", "APP_DB_PASSWORD",
  "WORKER_DB_PASSWORD", "BACKUP_DB_PASSWORD", "BLUEPRINT_WORKER_SECRET",
  "IMX_MONITORING_TOKEN", "RESTIC_PASSWORD"];
const entries = secretNames.map(name => [name, randomBytes(32).toString("hex")]);
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
entries.push(
  ["RC4_PRODUCTION_ENV", "1"],
  ["PUBLIC_APP_ORIGIN", "https://ingeniometrix.com"],
  ["UPLOAD_ORIGIN", "https://api.ingeniometrix.com"],
  ["RC4_PRODUCTION_PROXY_PORT", "3311"],
  ["G5_RCLONE_CONFIG_DIR", configDir],
  ["G5_DRIVE_FOLDER_ID", folderId],
  ["G5_BACKUP_REPOSITORY", `rclone:imx-drive-crypt:production/${date}/${randomUUID()}`],
  ["IMX_BACKUP_REMOTE_REVIEWED", "0"],
  ["IMX_BACKUP_ALLOW_LOCAL_TEST", "0"],
  ["IMX_CONVERSATIONAL_INTAKE", "1"],
  ["GOOGLE_CLIENT_ID", ""],
  ["GOOGLE_CLIENT_SECRET", ""],
  ["OPENAI_API_KEY", ""],
  ["OPENALEX_API_KEY", ""],
  ["CROSSREF_MAILTO", ""],
);
writeFileSync(file, entries.map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
  { flag: "wx", mode: 0o600 });
if ((statSync(file).mode & 0o777) !== 0o600) throw new Error("PRODUCTION_ENV_PERMISSIONS");
console.log(JSON.stringify({ created: file, secretNames, externalValuesPending:
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY", "OPENALEX_API_KEY"],
  backupRemoteReviewed: false }));
