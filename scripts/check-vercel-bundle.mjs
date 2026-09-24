import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(process.argv[2] || "missing");
if (!root.startsWith(path.resolve("dist") + path.sep)) throw new Error("Generated frontend package required");
let traces = 0;
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { await scan(file); continue; }
    if (!file.endsWith(".nft.json")) continue;
    traces++;
    for (const dependency of JSON.parse(await readFile(file, "utf8")).files || []) {
      const resolved = path.resolve(path.dirname(file), dependency);
      if (!resolved.startsWith(root + path.sep)) throw new Error("Frontend trace escapes deployment package");
      const rel = path.relative(root, resolved);
      if (/^(server|prisma|llm|ai|artifacts-local|scripts)\//.test(rel) || /node_modules\/(?:@prisma|prisma|openai|openid-client|docx|jszip)\//.test(rel) || /(?:^|\/)\.env/.test(rel)) throw new Error(`Backend/private leak: ${rel}`);
    }
  }
}
await scan(path.join(root, ".next"));
if (!traces) throw new Error("No production traces found");
const output = path.join(root, ".vercel/output");
if (await stat(output).then(() => true).catch(() => false)) {
  async function scanVercel(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) { await scanVercel(file); continue; }
      if (!file.endsWith(".vc-config.json")) continue;
      const config = JSON.parse(await readFile(file, "utf8"));
      const paths = Object.entries(config.filePathMap || {}).flatMap(([source, destination]) => [source, String(destination)]);
      if (paths.some((value) => /(?:^|\/)\.env(?:\.|$)/.test(value))) throw new Error(`Environment file in Vercel function trace: ${path.relative(root, file)}`);
    }
  }
  await scanVercel(output);
}
for (const name of ["server", "prisma", "lib/prisma.ts", "node_modules/@prisma/client"]) {
  if (await stat(path.join(root, name)).then(() => true).catch(() => false)) throw new Error(`Forbidden package content: ${name}`);
}
console.log(`PASS frontend boundary: ${traces} production traces; no private/backend dependencies.`);
