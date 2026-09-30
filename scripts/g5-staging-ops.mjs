import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
const configuration = parseEnv(readFileSync(".env.g5-staging", "utf8"));
const env = { ...process.env, ...configuration };
const root = process.cwd();
const project = "imx-rc4-g5-staging";
const composeArgs = ["compose", "--env-file", ".env.g5-staging", "-f", "docker-compose.g5.yml"];
const redact = (s) => Object.entries(configuration).filter(([k]) => /PASSWORD|SECRET/.test(k)).reduce((text, [, v]) => v ? text.replaceAll(v, "[REDACTED]") : text, s);
function run(args, options = {}) {
  const result = spawnSync("docker", args, { env, encoding: "utf8", maxBuffer: 32*1024*1024, ...options });
  const output = redact((result.stdout || "") + (result.stderr || ""));
  if (result.status !== 0) throw new Error(output.slice(-3000));
  return output;
}
function fixture(restore = false, seed = false) {
  const database = restore ? "imx_g5_restore" : "imx_g5_staging";
  const fixtureEnv = { ...env, DATABASE_URL: `postgresql://imx_app:${env.APP_DB_PASSWORD}@db:5432/${database}`, G5_FIXTURE_ROOT: restore ? "/restore/artifacts" : "/app/artifacts-local" };
  return run(["run", "--rm", "--user", "1000:1000", "--network", `${project}_data`, "-e", "DATABASE_URL", "-e", "G5_FIXTURE_ROOT",
    "-v", `${project}_g5_artifacts:/app/artifacts-local`, ...(restore ? ["-v", `${project}_g5_restore:/restore:ro`] : []),
    "-v", `${root}/scripts/g5-staging-fixture.ts:/app/scripts/g5-staging-fixture.ts:ro`, "-v", `${root}/scripts/test-rc4-g5.ts:/app/scripts/test-rc4-g5.ts:ro`,
    "--entrypoint", "node", "imx-rc4-g5-migration:local", "--import", "tsx", "scripts/g5-staging-fixture.ts", ...(seed ? ["--seed"] : [])], { env: fixtureEnv });
}
const operation = process.argv[2];
try {
  if (operation === "seed" || operation === "verify") console.log(fixture(false, operation === "seed"));
  else if (operation === "verify-restore") console.log(fixture(true));
  else if (operation === "backup-restore") {
    // Local encrypted repository validates mechanics, never counts as off-machine backup.
    run([...composeArgs, "stop", "-t", "120", "app", "worker"]);
    try {
      const init = spawnSync("docker", [...composeArgs, "run", "--rm", "backup", "init"], { env, encoding: "utf8" });
      if (init.status !== 0 && !String(init.stderr).includes("already initialized")) throw new Error("BACKUP_INIT_FAILED");
      run([...composeArgs, "run", "--rm", "-e", "IMX_BACKUP_QUIESCED=1", "backup", "backup"]);
      run([...composeArgs, "run", "--rm", "backup", "check"]);
    } finally { run([...composeArgs, "up", "-d", "app", "worker"]); }
    run(["volume", "create", `${project}_g5_restore`]);
    run(["run", "--rm", "-e", "RESTIC_PASSWORD", "-e", "RESTIC_REPOSITORY=/repository", "-v", `${project}_g5_backup_test:/repository:ro`, "-v", `${project}_g5_restore:/restore`,
      "--entrypoint", "restic", "imx-rc4-g5-backup:local", "--no-lock", "restore", "latest", "--target", "/restore"]);
    // Never drop a database: refuse repeat restore into an existing DB.
    run([...composeArgs, "exec", "-T", "db", "createdb", "-U", "postgres", "-O", "imx_migrate", "imx_g5_restore"]);
    run([...composeArgs, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "imx_g5_restore", "-v", "ON_ERROR_STOP=1", "-c", "REVOKE ALL ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO imx_migrate; GRANT USAGE ON SCHEMA public TO imx_app, imx_worker, imx_backup;"]);
    run(["run", "--rm", "--network", `${project}_data`, "-e", "PGPASSWORD", "-v", `${project}_g5_restore:/restore:ro`, "--entrypoint", "pg_restore", "imx-rc4-g5-backup:local",
      "--exit-on-error", "--no-owner", "--no-acl", "-h", "db", "-U", "imx_migrate", "-d", "imx_g5_restore", "/restore/scratch/database.dump"], { env: { ...env, PGPASSWORD: env.MIGRATION_PASSWORD } });
    run([...composeArgs, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "imx_g5_restore", "-v", "ON_ERROR_STOP=1", "-c", "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO imx_app, imx_worker; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO imx_app, imx_worker; GRANT SELECT ON ALL TABLES IN SCHEMA public TO imx_backup;"]);
    run([...composeArgs, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "imx_g5_restore", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("ops/g5/runtime-grants.sql", "utf8") });
    console.log(fixture(true));
    mkdirSync("artifacts-local/rc4/g5", { recursive: true });
    writeFileSync("artifacts-local/rc4/g5/restore-result.json", JSON.stringify({ at: new Date().toISOString(), encryptedRepository: true, restore: "PASS", offMachineCopy: false, database: "imx_g5_restore", realPayments: 0 }, null, 2));
    console.log("PASS encrypted backup + isolated restore; EXTERNAL_COPY=NOT_CONFIGURED");
  } else throw new Error("Use seed, verify, verify-restore, backup-restore");
} catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
