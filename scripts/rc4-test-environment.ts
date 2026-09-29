import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";

async function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  if (!root.endsWith("/ingeniometrix-wt-rc4")) throw new Error("RC4 worktree required");
  const file = ".env.rc4-test";
  execFileSync("git", ["check-ignore", "-q", file]);
  try { await access(file); console.log("Isolated env exists; preserved. Start/check imx-rc4-validation explicitly."); return; } catch { /* new environment */ }
  const containers = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n");
  if (containers.includes("imx-rc4-validation")) throw new Error("Existing container without matching local env; inspect, never overwrite");
  const password = randomBytes(32).toString("hex");
  const url = `postgresql://rc4:${password}@127.0.0.1:55440/imx_b4_validation_rc4?schema=public`;
  execFileSync("docker", ["run", "-d", "--name", "imx-rc4-validation", "--label", "imx.scope=rc4-isolated-test", "-p", "127.0.0.1:55440:5432", "-v", "imx-rc4-validation-data:/var/lib/postgresql/data", "-e", "POSTGRES_USER=rc4", "-e", "POSTGRES_DB=imx_b4_validation_rc4", "-e", "POSTGRES_PASSWORD", "postgres:16"], { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: "pipe" });
  await writeFile(file, `DATABASE_URL=${url}\nDATABASE_URL_UNPOOLED=${url}\nIMX_AUTHLESS_WORKSPACE=0\nIMX_ENABLE_DEEP_RESEARCH=0\nAPP_ORIGIN=http://127.0.0.1:3304\n`, { mode: 0o600, flag: "wx" });
  console.log("RC4 isolated DB created on loopback:55440; credentials in ignored mode-600 env. RC3 untouched.");
}
main().catch(() => { console.error("RC4 environment setup failed; inspect the isolated container and env without printing secrets."); process.exitCode = 1; });
