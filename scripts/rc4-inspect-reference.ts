// Read-only incident capture. Domain/run IDs live in this diagnostic, never production.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const project = "501ca19d-eaa6-4783-a89f-b95c959e0baa";
  const job = "1349d6a7-0144-441b-87d0-b075e0fe5e87";
  const sql = `BEGIN READ ONLY;
SELECT json_build_object('job', (SELECT row_to_json(j) FROM "BlueprintJob" j WHERE id='${job}'),
'stages', (SELECT json_agg(s) FROM "BlueprintJobStage" s WHERE "jobId"='${job}'),
'versions', (SELECT json_agg(v) FROM "BlueprintVersion" v WHERE "projectId"='${project}'),
'selection', (SELECT json_agg(r) FROM "ProjectReference" r WHERE "projectId"='${project}' AND selected));
COMMIT;`;
  const raw = execFileSync("docker", ["exec", "-i", "imx-rc2-manual-db-1", "sh", "-c", 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -t -A -q -v ON_ERROR_STOP=1'], { input: sql, maxBuffer: 20 * 1024 * 1024, encoding: "utf8" });
  const snapshot = JSON.parse(raw);
  const dir = path.resolve("artifacts-local/rc4/reference");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, "snapshot.json"), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  const ledger = snapshot.stages.find((s: any) => s.stageKey === "checkpoint:EVIDENCE").outputJson.value;
  const chunks: Record<string, unknown> = {};
  for (const materialization of ledger.pdf_materializations ?? []) {
    const file = materialization.chunks_path;
    if (typeof file !== "string" || !file.startsWith(`/app/artifacts-local/`) || file.includes("..")) continue;
    chunks[materialization.reference_id ?? materialization.source_id] = JSON.parse(execFileSync("docker", ["exec", "imx-rc2-manual-app-1", "cat", file], { maxBuffer: 20 * 1024 * 1024, encoding: "utf8" }));
  }
  await writeFile(path.join(dir, "chunks.json"), JSON.stringify(chunks, null, 2), { mode: 0o600 });
  for (const source of ledger.source_registry) {
    if (!/^S\d+$/.test(source.source_id)) throw new Error("Invalid source ID");
    const file = `${ledger.artifact_dir}/${source.source_id}-extraction-input.json`;
    if (!file.startsWith("/app/artifacts-local/") || file.includes("..")) throw new Error("Invalid artifact path");
    const contents = execFileSync("docker", ["exec", "imx-rc2-manual-app-1", "cat", file], { maxBuffer: 10 * 1024 * 1024 });
    await writeFile(path.join(dir, `${source.source_id}-extraction-input.json`), contents, { mode: 0o600 });
  }
  console.log(JSON.stringify({ project, job, snapshot: path.join(dir, "snapshot.json"), selected: snapshot.selection.length, materializationKeys: (ledger.pdf_materializations ?? []).map((m: any) => Object.keys(m)), sources: ledger.semantic_extractions.map((e: any) => ({ source: e.source_id, basis: e.evidence_basis, items: e.evidence_items.length, verified: e.evidence_items.filter((i: any) => i.support_verified).length })) }, null, 2));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
