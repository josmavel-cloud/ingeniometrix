import { readFile, writeFile, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";

const target = ".env.g5-staging-external";
execFileSync("git", ["check-ignore", "--quiet", target]);
const base = parseEnv(await readFile(".env.g5-staging", "utf8"));
const commercial = parseEnv(await readFile(".env.rc4-external", "utf8"));
// Reuse only the already-authorized local provider credential, never copy another
// release's DB/session/worker credentials into the isolated G5 environment.
const generation = parseEnv(await readFile("../ingeniometrix-wt-release0/.env.release", "utf8"));
const requiredBase = ["POSTGRES_PASSWORD", "MIGRATION_PASSWORD", "APP_DB_PASSWORD", "WORKER_DB_PASSWORD", "BACKUP_DB_PASSWORD", "BLUEPRINT_WORKER_SECRET", "RESTIC_PASSWORD"];
const requiredExternal = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MP_TEST_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "MP_TEST_MERCHANT_ID", "MP_APPLICATION_ID"];
for (const name of requiredBase) if (!base[name]?.trim()) throw new Error(`MISSING_BASE_${name}`);
for (const name of requiredExternal) if (!commercial[name]?.trim()) throw new Error(`MISSING_EXTERNAL_${name}`);
if (!generation.OPENAI_API_KEY?.trim()) throw new Error("MISSING_OPENAI_API_KEY");
const values = {
  ...Object.fromEntries(requiredBase.map((name) => [name, base[name]])),
  ...Object.fromEntries(requiredExternal.map((name) => [name, commercial[name]])),
  OPENAI_API_KEY: generation.OPENAI_API_KEY,
  OPENALEX_API_KEY: generation.OPENALEX_API_KEY || "",
  CROSSREF_MAILTO: generation.CROSSREF_MAILTO || "",
  PUBLIC_APP_ORIGIN: "https://staging.ingeniometrix.com",
  UPLOAD_ORIGIN: "https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000",
  G5_PROXY_PORT: base.G5_PROXY_PORT || "3310",
  IMX_BACKUP_ALLOW_LOCAL_TEST: "1",
};
await writeFile(target, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
await chmod(target, 0o600);
console.log(JSON.stringify({ file: target, permissions: "600", gitIgnored: true,
  google: "CONFIGURED", mercadoPagoSandbox: "CONFIGURED", openai: "CONFIGURED",
  openAlex: values.OPENALEX_API_KEY ? "CONFIGURED" : "OPTIONAL_NOT_SET",
  crossref: values.CROSSREF_MAILTO ? "CONFIGURED" : "OPTIONAL_NOT_SET",
  appOrigin: values.PUBLIC_APP_ORIGIN, uploadOrigin: values.UPLOAD_ORIGIN }));
