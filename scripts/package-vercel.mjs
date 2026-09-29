import { readFile, writeFile, mkdir, cp, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Build artefact generation only. Never copy the worktree wholesale to Vercel.
const root = process.cwd();
const target = path.join(root, "dist", `vercel-${Date.now()}`);
const seen = new Set();
const allowedPackages = new Set(["next", "react", "react-dom", "framer-motion", "lucide-react", "zod", "sharp", "tailwindcss", "@tailwindcss/postcss"]);
async function resolveFile(base) {
  for (const suffix of ["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"]) {
    try { if ((await stat(base + suffix)).isFile()) return base + suffix; } catch {}
  }
  throw new Error(`Unresolved frontend import: ${base}`);
}
async function copyModule(file) {
  const rel = path.relative(root, file);
  if (seen.has(rel)) return;
  if (rel.startsWith("..") || /^(server|prisma|scripts|llm|ai|artifacts|artifacts-local|node_modules)\//.test(rel) || rel === "lib/prisma.ts" || rel.startsWith("app/api/")) throw new Error(`Backend leak: ${rel}`);
  seen.add(rel);
  const content = await readFile(file);
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const src = ts.createSourceFile(file, content.toString(), ts.ScriptTarget.Latest, true);
    const imports = [];
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(src) === "require")) {
        if (!ts.isStringLiteral(node.arguments[0])) throw new Error(`Unbounded dynamic import: ${rel}`);
        imports.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    }
    visit(src);
    for (const specifier of imports) {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        await copyModule(await resolveFile(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier)));
      } else {
        const pkg = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!allowedPackages.has(pkg)) throw new Error(`Forbidden dependency ${specifier} in ${rel}`);
      }
    }
    if (/process\.env\.(DATABASE|MP_|GOOGLE_CLIENT_SECRET|OPENAI|ARTIFACT)/.test(content.toString())) throw new Error(`Backend configuration leak: ${rel}`);
  }
  await mkdir(path.dirname(path.join(target, rel)), { recursive: true });
  await writeFile(path.join(target, rel), content);
}
async function appFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["api", "lab", "preview", "blueprint-launch"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await appFiles(file); else await copyModule(file);
  }
}
await appFiles(path.join(root, "app"));
for (const file of ["next.config.ts", "proxy.ts", "postcss.config.mjs"]) await copyModule(path.join(root, file));
for (const rel of execFileSync("git", ["ls-files", "-z", "public"], { encoding: "utf8" }).split("\0").filter(Boolean)) {
  await mkdir(path.dirname(path.join(target, rel)), { recursive: true });
  await cp(path.join(root, rel), path.join(target, rel));
}
const original = JSON.parse(await readFile("package.json", "utf8"));
const manifest = { name: "ingeniometrix-frontend", version: original.version, private: true, engines: original.engines,
  scripts: { build: "next build", start: "next start" },
  dependencies: Object.fromEntries(Object.entries(original.dependencies).filter(([name]) => allowedPackages.has(name))),
  devDependencies: Object.fromEntries(Object.entries(original.devDependencies).filter(([name]) => ["typescript", "@types/node", "@types/react", "@types/react-dom"].includes(name))) };
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
lock.name = manifest.name; lock.packages[""] = { ...lock.packages[""], ...manifest }; delete lock.packages[""].scripts;
await writeFile(path.join(target, "package.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(target, "package-lock.json"), JSON.stringify(lock, null, 2));
await cp("tsconfig.json", path.join(target, "tsconfig.json"));
await writeFile(path.join(target, "vercel.json"), JSON.stringify({ framework: "nextjs", buildCommand: "npm run build", installCommand: "npm ci" }));
await writeFile(path.join(target, ".vercelignore"), ".env*\nnode_modules\n.next\n");
const moduleHash = createHash("sha256");
for (const rel of [...seen].sort()) moduleHash.update(rel).update("\0").update(await readFile(path.join(target, rel))).update("\0");
await writeFile(path.join(target, "boundary-manifest.json"), JSON.stringify({
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  moduleGraphSha256: moduleHash.digest("hex"), files: [...seen].sort(), backendModules: 0,
}, null, 2));
console.log(target);
