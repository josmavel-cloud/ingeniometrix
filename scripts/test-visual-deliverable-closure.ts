import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { publicVisualBrief } from "@/server/mvp/final-infographic-v2";
import type { MvpStep6SectionDraft } from "@/server/mvp/step6-blueprint-docx-types";
import { buildVisualDeliverables, evidenceComparison, matrixVisualRows, researchDesignTable } from "@/server/mvp/visual-deliverables";
import { definition, design, ledger, matrix } from "./test-b3-scientific-contracts";

function draft(section_key: string, order: number): MvpStep6SectionDraft {
  return { section_key, title: section_key, level: 1, order, status: "generated", generation_source: "deterministic", word_count: 0, generation_wave: "deterministic", blocks: [], citation_anchors: [], used_source_ids: ["S1"], used_evidence_ids: ["E3"], used_snippet_ids: [], used_asset_keys: [], assumptions: [], limitations: [], warnings: [] };
}

async function main() {
  await mkdir("artifacts-local/visual-offline", { recursive: true });
  const artifactDir = await mkdtemp(path.join(process.cwd(), "artifacts-local/visual-offline/regression-"));
  const drafts = [draft("state_of_knowledge", 1), draft("conceptual_framework", 2), draft("methodology", 3), draft("consistency_matrix", 4)];
  drafts[3].blocks.push({ kind: "paragraph", text: matrix.synthesis }, { kind: "table", title: "Matriz de consistencia editable", rows: [["pendiente"]], source_note: "Fuente: elaboración propia." });
  const passQuality = { pass: true, relevant: true, readable: true, no_internal_identifiers: true, no_invented_results: true, no_clipping: true, matrix_representation: true, issues: [] };
  let matrixAttribution: unknown = null; let heroAttribution: unknown = null;
  const output = await buildVisualDeliverables({
    provider: {} as never, definition, design, matrix, ledger, usedSourceIds: ["S1"], drafts, artifactDir, projectId: "synthetic", runId: "visual-regression",
    heroOutputPath: path.join(artifactDir, "hero.png"),
    imageGeneratorOverride: async ({ outputPath }) => { await sharp({ create: { width: 1536, height: 1024, channels: 4, background: "#edf4f2" } }).png().toFile(outputPath); return { usage: null, estimated_cost_usd: 0, duration_ms: 1 }; },
    visionValidatorOverride: async (input) => { matrixAttribution = input.trackingAttribution; return passQuality; },
    heroGeneratorOverride: async ({ outputPath, trackingAttribution }) => {
      heroAttribution = trackingAttribution;
      await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#edf4f2" } }).png().toFile(outputPath);
      return { plan: { prompt_version: "fixture", placement: "cover", visual_type: "methodological_infographic_cover", prompt: "fixture", negative_prompt: "", summary: "fixture", image_path: outputPath, image_model: "fixture", status: "generated", warnings: [] }, brief: publicVisualBrief(definition, design), attempts: [{ path: outputPath, quality: passQuality }], initialRequests: 1, repairRequests: 0, accepted: true } as never;
    },
  });
  const matrixDraft = drafts.find((item) => item.section_key === "consistency_matrix")!;
  const imageIndex = matrixDraft.blocks.findIndex((item) => item.kind === "figure" && item.asset_key === "original:consistency-matrix-visual");
  const tableIndex = matrixDraft.blocks.findIndex((item) => item.kind === "table");
  assert.ok(imageIndex >= 0 && tableIndex > imageIndex, "matrix image must precede editable matrix table");
  const table = matrixDraft.blocks[tableIndex]; assert.equal(table.kind, "table");
  if (table.kind === "table") { assert.ok(table.rows[1][0].includes(definition.questions[0].text)); assert.ok(table.rows[1][0].includes(definition.objectives[0].text)); }
  assert.equal(output.visualPlan.matrix_hash, (output.visualPlan.assets.find((item) => item.asset_id === "consistency-matrix-image")!.content_specification as { semantic_authority_hash: string }).semantic_authority_hash);
  assert.deepEqual(output.visualPlan.matrix_sequence, ["validate_structured_matrix", "generate_visual_backdrop", "compose_exact_semantic_overlay", "validate_visual_pixels", "render_editable_native_table", "insert_image_first_table_second"]);
  for (const id of ["hero-infographic", "conceptual-system-diagram", "methodology-workflow", "evidence-comparison-table", "research-design-table", "consistency-matrix-image", "consistency-matrix-table"]) assert.ok(output.visualPlan.assets.some((item) => item.asset_id === id), id);
  assert.equal(output.visualPlan.image_requests.initial, 2); assert.ok(output.visualPlan.image_requests.repairs <= 1);
  assert.deepEqual(matrixAttribution, { projectId: "synthetic", runId: "visual-regression", stage: "blueprint_generation", source: "buildVisualDeliverables", promptVersion: "ingeniometrix-visual-deliverables-v1" });
  assert.deepEqual(heroAttribution, matrixAttribution);
  assert.equal(output.visualPlan.assets.find((item) => item.asset_id === "equations")?.status, "not_applicable");
  assert.equal((researchDesignTable(design) as Extract<ReturnType<typeof researchDesignTable>, { kind: "table" }>).rows[0][2], "Fuentes/interpretación o decisión pendiente");
  assert.equal((evidenceComparison(ledger, ["S1"]) as Extract<ReturnType<typeof evidenceComparison>, { kind: "table" }>).rows[1][0], "Ana (2026)");
  assert.equal(matrixVisualRows(matrix, definition, design)[0][0], "Pregunta 1");
  assert.ok(!JSON.stringify(publicVisualBrief(definition, design)).includes("Q1"));
  for (const asset of output.visualPlan.assets.flatMap((item) => item.output_paths).filter((file) => file.endsWith(".png"))) assert.ok((await readFile(asset)).length > 100);
  await writeFile(path.join(artifactDir, "result.json"), `${JSON.stringify({ status: "PASS", visual_plan: output.visualPlan }, null, 2)}\n`);
  // Regression RC4: a fallback bitmap has not passed pixel QA just because its
  // source table was valid. Keep the editable table and omit the rejected image.
  const rejectedDir = path.join(artifactDir, "rejected");
  const rejectedDrafts = [draft("consistency_matrix", 1)];
  rejectedDrafts[0].blocks.push({ kind: "table", title: "Matriz editable", rows: [["fixture"]], source_note: "Elaboración propia" });
  const rejected = await buildVisualDeliverables({ provider: {} as never, definition, design, matrix, ledger, usedSourceIds: ["S1"], drafts: rejectedDrafts, artifactDir: rejectedDir, projectId: "synthetic", runId: "qa-rejection", heroOutputPath: path.join(rejectedDir, "hero.png"),
    imageGeneratorOverride: async ({ outputPath }) => { await sharp({ create: { width: 1536, height: 1024, channels: 4, background: "#edf4f2" } }).png().toFile(outputPath); return { usage: null, estimated_cost_usd: 0, duration_ms: 1 }; },
    visionValidatorOverride: async () => ({ ...passQuality, pass: false, issues: ["Unreadable fixture"] }),
    heroGeneratorOverride: async () => ({ plan: output.heroImage, accepted: false, attempts: [], initialRequests: 0, repairRequests: 0 }) as never,
  });
  assert.equal(rejected.visualPlan.assets.find((asset) => asset.asset_id === "consistency-matrix-image")?.status, "failed");
  assert.ok(!rejectedDrafts[0].blocks.some((block) => block.kind === "figure"));
  assert.ok(rejectedDrafts[0].blocks.some((block) => block.kind === "table"));
  console.log(JSON.stringify({ status: "PASS visual deliverable closure", artifactDir, required_assets: 7, matrix_order: "image_first_table_second" }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
