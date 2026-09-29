import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = { ...process.env, ...parseEnv(readFileSync(".env.rc4-test", "utf8")), OPENAI_API_KEY: "", OPENALEX_API_KEY: "", MP_TEST_ACCESS_TOKEN: "", GOOGLE_CLIENT_SECRET: "", IMX_ENABLE_DEEP_RESEARCH: "0" };
if (!env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("ISOLATED_DB_REQUIRED");
const suites = ["rc4-g5", "rc4-g4-webhook", "rc4-g4-commercial", "rc4-g4-order-recovery", "rc4-g4-auth", "b4-resilience", "secure-pilot-release", "rc4-evidence-integrity", "rc4-prejob-budget", "rc4-prompt-registry", "rc4-scientific-decision", "rc4-background-responses", "rc4-draft-snapshots", "rc4-g2", "rc4-g3-document-profile"];
mkdirSync("artifacts-local/rc4/g5", { recursive: true });
const results = [];
for (const suite of suites) {
  const result = spawnSync("node", ["--import", "tsx", `scripts/test-${suite}.ts`], { env, encoding: "utf8", maxBuffer: 16*1024*1024 });
  writeFileSync(`artifacts-local/rc4/g5/${suite}.log`, (result.stdout || "") + (result.stderr || ""), { mode: 0o600 });
  results.push({ suite, status: result.status }); console.log(`${suite}: ${result.status === 0 ? "PASS" : "FAIL"}`);
}
writeFileSync("artifacts-local/rc4/g5/offline-results.json", JSON.stringify(results, null, 2));
if (results.some((r) => r.status !== 0)) process.exitCode = 1;
