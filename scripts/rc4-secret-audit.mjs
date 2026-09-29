import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";

const envFiles = process.argv.slice(2);
const candidates = [];
for (const path of envFiles) {
  const env = parseEnv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(env)) {
    if (/PASSWORD|SECRET|TOKEN|API_KEY|CLIENT_ID|FOLDER_ID/.test(key) && value.length >= 12 &&
      !/^(replace|placeholder|fixture|test-)/i.test(value)) candidates.push({ key, value });
  }
}
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const matches = [];
for (const path of tracked) {
  try {
    if (statSync(path).size > 2_000_000) continue;
    const content = readFileSync(path, "utf8");
    for (const { key, value } of candidates) if (content.includes(value)) matches.push({ key, path });
  } catch { /* missing generated/tracked file is not a secret match */ }
}
console.log(JSON.stringify({ candidateSecretNamesChecked: [...new Set(candidates.map(item => item.key))],
  trackedMatches: matches }));
if (matches.length) process.exitCode = 1;
