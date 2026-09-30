import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const required = [
  "PUBLIC_APP_ORIGIN", "UPLOAD_ORIGIN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "OPENAI_API_KEY", "OPENALEX_API_KEY", "POSTGRES_PASSWORD", "MIGRATION_PASSWORD",
  "APP_DB_PASSWORD", "WORKER_DB_PASSWORD", "BACKUP_DB_PASSWORD", "BLUEPRINT_WORKER_SECRET",
  "RESTIC_PASSWORD", "IMX_MONITORING_TOKEN", "G5_RCLONE_CONFIG_DIR",
  "G5_DRIVE_FOLDER_ID", "G5_BACKUP_REPOSITORY", "RC4_PRODUCTION_PROXY_PORT",
];

function publicHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password &&
      !/^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname) &&
      !/(^|[.\-])(staging|test|localhost)([.\-]|$)/i.test(url.hostname);
  } catch { return false; }
}

export function productionEnvProblems(env, fileMode, rcloneMode, configMode) {
  const problems = required.filter(key => !env[key]?.trim()).map(key => `MISSING_${key}`);
  if (env.RC4_PRODUCTION_ENV !== "1") problems.push("PRODUCTION_INTENT_REQUIRED");
  if (!publicHttpsOrigin(env.PUBLIC_APP_ORIGIN)) problems.push("PUBLIC_ORIGIN_INVALID");
  if (!publicHttpsOrigin(env.UPLOAD_ORIGIN)) problems.push("UPLOAD_ORIGIN_INVALID");
  if (env.PUBLIC_APP_ORIGIN === env.UPLOAD_ORIGIN) problems.push("ORIGINS_NOT_SEPARATED");
  if (env.G5_BACKUP_REPOSITORY && !/^rclone:imx-drive-crypt:production\//.test(env.G5_BACKUP_REPOSITORY)) {
    problems.push("PRODUCTION_CRYPT_REPOSITORY_REQUIRED");
  }
  if (env.IMX_BACKUP_REMOTE_REVIEWED !== "1") problems.push("BACKUP_ACCESS_REVIEW_REQUIRED");
  if (env.DATABASE_URL?.includes("staging") || env.DATABASE_URL_UNPOOLED?.includes("staging")) {
    problems.push("STAGING_DATABASE_REFERENCE");
  }
  const port = Number(env.RC4_PRODUCTION_PROXY_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3310) problems.push("PRODUCTION_PROXY_PORT_INVALID");
  if (fileMode !== null && (fileMode & 0o077) !== 0) problems.push("ENV_FILE_PERMISSIONS");
  if (rcloneMode !== null && (rcloneMode & 0o077) !== 0) problems.push("RCLONE_DIRECTORY_PERMISSIONS");
  if (configMode !== null && (configMode & 0o077) !== 0) problems.push("RCLONE_CONFIG_PERMISSIONS");
  return [...new Set(problems)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error("PRODUCTION_ENV_PATH_REQUIRED");
  const env = parseEnv(readFileSync(path, "utf8"));
  const mode = (file) => { try { return statSync(file).mode & 0o777; } catch { return null; } };
  const dir = env.G5_RCLONE_CONFIG_DIR;
  const problems = productionEnvProblems(env, mode(path), dir ? mode(dir) : null,
    dir ? mode(join(dir, "rclone.conf")) : null);
  if (dir && (mode(dir) === null || mode(join(dir, "rclone.conf")) === null)) problems.push("RCLONE_CONFIG_MISSING");
  console.log(JSON.stringify({ productionConfigurationReady: problems.length === 0, problems }));
  if (problems.length) process.exitCode = 1;
}
