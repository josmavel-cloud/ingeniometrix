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
for (const name of ["server", "prisma", "lib/prisma.ts", "node_modules/@prisma/client"]) {
  if (await stat(path.join(root, name)).then(() => true).catch(() => false)) throw new Error(`Forbidden package content: ${name}`);
}
console.log(`PASS frontend boundary: ${traces} production traces; no private/backend dependencies.`);
