import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const registryPath = path.join(
  workspaceRoot,
  "lib",
  "assets",
  "taxonomy-source-registry.json",
);
const outputRoot = path.join(workspaceRoot, "artifacts-local", "taxonomies");

function parseArgs(argv) {
  const options = {
    dryRun: false,
    sourceId: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--source=")) {
      options.sourceId = arg.slice("--source=".length).trim() || null;
    }
  }

  return options;
}

async function loadRegistry() {
  const raw = await readFile(registryPath, "utf8");
  return JSON.parse(raw);
}

function collectDirectTargets(registry, sourceId) {
  return registry.sources
    .filter((source) => !sourceId || source.id === sourceId)
    .flatMap((source) =>
      (source.downloadTargets ?? [])
        .filter((target) => target.downloadMode === "direct")
        .map((target) => ({
          source,
          target,
        })),
    );
}

async function downloadTarget(entry, dryRun) {
  const sourceDir = path.join(outputRoot, entry.source.id);
  const destination = path.join(sourceDir, entry.target.filename);

  if (dryRun) {
    console.log(`[dry-run] ${entry.source.id} -> ${destination}`);
    return {
      sourceId: entry.source.id,
      targetId: entry.target.id,
      destination,
      status: "planned",
    };
  }

  await mkdir(sourceDir, { recursive: true });

  const response = await fetch(entry.target.url);
  if (!response.ok) {
    throw new Error(
      `No se pudo descargar ${entry.target.url} (${response.status} ${response.statusText}).`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);

  return {
    sourceId: entry.source.id,
    targetId: entry.target.id,
    destination,
    status: "downloaded",
    bytes: buffer.byteLength,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = await loadRegistry();
  const targets = collectDirectTargets(registry, options.sourceId);

  if (targets.length === 0) {
    const hint = options.sourceId
      ? ` para source=${options.sourceId}`
      : "";
    throw new Error(`No hay targets directos registrados${hint}.`);
  }

  console.log(
    `Preparando ${targets.length} descarga(s) directas hacia ${outputRoot}`,
  );

  const results = [];
  for (const entry of targets) {
    console.log(`Descargando ${entry.source.id}:${entry.target.id}`);
    const result = await downloadTarget(entry, options.dryRun);
    results.push(result);
  }

  console.log("");
  console.log("Resumen:");
  for (const result of results) {
    const size = typeof result.bytes === "number" ? ` (${result.bytes} bytes)` : "";
    console.log(`- ${result.status}: ${result.destination}${size}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
