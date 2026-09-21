import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  const root = path.resolve("artifacts-local/rc4/offline", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const env = { ...process.env, OPENAI_API_KEY: "", OPENALEX_API_KEY: "", IMX_ENABLE_DEEP_RESEARCH: "0" };
  const results: { name: string; status: string; exit: number | null; duration_ms: number; log: string }[] = [];
  for (const name of Object.keys(pkg.scripts).filter((key) => key.startsWith("test:"))) {
    const started = Date.now();
    const result = spawnSync("npm", ["run", name], { env, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
    const log = path.join(root, `${name.replace(/:/g, "-")}.log`);
    await writeFile(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`, { mode: 0o600 });
    results.push({ name, status: result.status === 0 ? "PASS" : "FAIL", exit: result.status, duration_ms: Date.now() - started, log });
    console.log(`${name}: ${results.at(-1)!.status}`);
  }
  await writeFile(path.join(root, "results.json"), JSON.stringify({ paid_calls_authorized: false, results }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ total: results.length, passed: results.filter((r) => r.status === "PASS").length, failed: results.filter((r) => r.status !== "PASS"), root }));
  if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
