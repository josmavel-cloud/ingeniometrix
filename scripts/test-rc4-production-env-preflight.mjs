import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { productionEnvProblems } from "../ops/g5/production-env-preflight.mjs";

const valid = {
  RC4_PRODUCTION_ENV: "1", PUBLIC_APP_ORIGIN: "https://ingeniometrix.com",
  UPLOAD_ORIGIN: "https://api.ingeniometrix.com", GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture", OPENAI_API_KEY: "fixture", OPENALEX_API_KEY: "fixture",
  POSTGRES_PASSWORD: "fixture", MIGRATION_PASSWORD: "fixture", APP_DB_PASSWORD: "fixture",
  WORKER_DB_PASSWORD: "fixture", BACKUP_DB_PASSWORD: "fixture", BLUEPRINT_WORKER_SECRET: "fixture",
  RESTIC_PASSWORD: "fixture", IMX_MONITORING_TOKEN: "fixture", G5_RCLONE_CONFIG_DIR: "/protected",
  G5_DRIVE_FOLDER_ID: "fixture", G5_BACKUP_REPOSITORY: "rclone:imx-drive-crypt:production/2026/09/29/fixture",
  RC4_PRODUCTION_PROXY_PORT: "3311", IMX_BACKUP_REMOTE_REVIEWED: "1",
};
assert.deepEqual(productionEnvProblems(valid, 0o600, 0o700, 0o600), []);
const unsafe = { ...valid, PUBLIC_APP_ORIGIN: "https://staging.ingeniometrix.com",
  G5_BACKUP_REPOSITORY: "rclone:imx-drive:restic-g5", DATABASE_URL: "postgresql://user@db/imx_g5_staging",
  RC4_PRODUCTION_PROXY_PORT: "3310", IMX_BACKUP_REMOTE_REVIEWED: "0" };
const problems = productionEnvProblems(unsafe, 0o644, 0o775, 0o644);
for (const problem of ["PUBLIC_ORIGIN_INVALID", "PRODUCTION_CRYPT_REPOSITORY_REQUIRED",
  "STAGING_DATABASE_REFERENCE", "PRODUCTION_PROXY_PORT_INVALID", "BACKUP_ACCESS_REVIEW_REQUIRED",
  "ENV_FILE_PERMISSIONS", "RCLONE_DIRECTORY_PERMISSIONS", "RCLONE_CONFIG_PERMISSIONS"]) {
  assert(problems.includes(problem), problem);
}
const compose = spawnSync("docker", ["compose", "--profile", "operations", "--env-file", "/dev/null", "-f", "docker-compose.g5.yml",
  "-f", "docker-compose.g5-drive.yml", "-f", "docker-compose.rc4-production.yml", "config", "--format", "json"],
{ encoding: "utf8", env: { ...process.env, ...valid, G5_PROXY_PORT: "3310" } });
assert.equal(compose.status, 0, compose.stderr);
const config = JSON.parse(compose.stdout);
assert.equal(config.name, "imx-rc4-production");
assert.equal(config.services.db.environment.POSTGRES_DB, "imx_rc4_production");
assert(config.services.db.healthcheck.test.includes("pg_isready -U postgres -d imx_rc4_production"));
assert.equal(config.services.app.image, "imx-rc4-production-rc:2c8b091");
assert.equal(config.services.worker.image, "imx-rc4-production-rc:2c8b091");
assert.equal(config.services.migrate.image, "imx-rc4-production-migration:2c8b091");
assert.equal(config.services.app.build, undefined);
assert.equal(config.services.migrate.build, undefined);
assert.equal(config.services.app.environment.IMX_PAYMENT_MODE, "disabled");
assert.equal(config.services.app.environment.IMX_ENABLE_ASTRA_WEB_DISCOVERY, "0");
assert.equal(config.services.app.environment.IMX_ENABLE_DEEP_RESEARCH, "0");
assert.equal(config.services.backup.environment.RESTIC_REPOSITORY, valid.G5_BACKUP_REPOSITORY);
assert.equal(config.services.proxy.ports.length, 1);
assert.equal(config.services.proxy.ports[0].published, "3311");
console.log("PASS RC4 production environment preflight: isolated origins, crypt repository, secrets presence and permissions");
