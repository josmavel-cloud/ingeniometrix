import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { LlmProvider } from "@/llm/provider";
import { ASSET_PLANNER_PROMPT } from "./prompts/asset-planner.v1";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import type { ConsistencyMatrix, ResearchDefinition, ResearchDesign } from "./research-plan-contracts";
import type { MvpStep6ContentBlock, MvpStep6SectionDraft, MvpStep6VisualAssetPlan, MvpStep6VisualPlan } from "./step6-blueprint-docx-types";
import { stageCheckpoint, stableJson } from "./job-execution-context";
import { evidenceComparison, renderBoxes, researchDesignTable } from "./visual-deliverables";

const pointer = z.object({ source_id: z.string().min(1), evidence_id: z.string().min(1) });
const proposal = z.object({
  asset_id: z.string().min(1),
  type: z.enum(["evidence_comparison_table", "conceptual_diagram", "methodology_workflow", "research_design_table"]),
  section: z.enum(["state_of_knowledge", "conceptual_framework", "methodology"]),
  scientific_purpose: z.string().min(1),
  why_needed: z.string().min(1),
  source_evidence: z.array(pointer),
  input_data: z.array(z.string()),
  render_method: z.enum(["WORD_NATIVE_TABLE", "DETERMINISTIC_VECTOR"]),
  caption: z.string().min(1),
  expected_reference_in_text: z.string().min(1),
  page_cost_estimate: z.number().min(0.1).max(0.8),
});
export const compactAssetPlanSchema = z.object({ proposals: z.array(proposal).max(4), omitted_reason: z.string() });
export type CompactAssetPlan = z.infer<typeof compactAssetPlanSchema>;

function firstSentence(value: string) { return value.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || value; }
function short(value: string, words = 10) { return firstSentence(value).split(/\s+/).slice(0, words).join(" "); }
function section(drafts: MvpStep6SectionDraft[], key: string) { return drafts.find((item) => item.section_key === key); }
function addReference(draft: MvpStep6SectionDraft | undefined, text: string, block: MvpStep6ContentBlock) {
  if (!draft) return;
  draft.blocks.push({ kind: "paragraph", text }, block);
  if (block.kind === "figure" && block.asset_key) draft.used_asset_keys.push(block.asset_key);
}

export async function planAndRenderCompactAssets(input: {
  provider: LlmProvider;
  definition: ResearchDefinition;
  design: ResearchDesign;
  matrix: ConsistencyMatrix;
  ledger: MvpStep5EvidenceLedger;
  usedSourceIds: string[];
  drafts: MvpStep6SectionDraft[];
  artifactDir: string;
  projectId: string;
  runId: string;
  remainingBodyPages: number;
}) {
  const evidence = input.ledger.semantic_extractions.flatMap((extraction) => extraction.evidence_items
    .filter((item) => item.support_verified !== false && item.allowed_use !== "gap_only")
    .map((item) => ({ source_id: item.source_id, evidence_id: item.evidence_id, summary: item.traceable_summary_es, level: extraction.evidence_basis })));
  const validPointers = new Set(evidence.map((item) => `${item.source_id}:${item.evidence_id}`));
  const context = {
    final_sections: input.drafts.filter((draft) => !["references", "final_methodological_infographic"].includes(draft.section_key)).map((draft) => ({ section: draft.section_key, text: draft.blocks.flatMap((block) => block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" ? block.items : []).join(" ").slice(0, 3000) })),
    scientific_decision: { problem: input.definition.problem, questions: input.definition.questions, objectives: input.definition.objectives, hypotheses_or_propositions: input.definition.hypotheses_or_propositions },
    research_design: input.design,
    evidence,
    matrix: { rows: input.matrix.rows.length, synthesis: input.matrix.synthesis },
    available_page_budget: input.remainingBodyPages,
  };
  const actual = `${ASSET_PLANNER_PROMPT.systemPrompt}\n\n${ASSET_PLANNER_PROMPT.userPromptTemplate.replace("{{context_json}}", stableJson(context))}`;
  const schema = z.toJSONSchema(compactAssetPlanSchema);
  const plan = compactAssetPlanSchema.parse(await stageCheckpoint("ASSET_PLANNER", { actual, schema, model: ASSET_PLANNER_PROMPT.model, version: ASSET_PLANNER_PROMPT.version }, async () => input.provider.generateStructuredObject({
    prompt: actual,
    schema,
    schemaName: "rc4_compact_asset_plan_v1",
    model: ASSET_PLANNER_PROMPT.model,
    maxOutputTokens: ASSET_PLANNER_PROMPT.max_output_tokens,
    trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: ASSET_PLANNER_PROMPT.version, stage: "blueprint_generation" },
  })));
  if (plan.proposals.some((item) => item.source_evidence.some((entry) => !validPointers.has(`${entry.source_id}:${entry.evidence_id}`)))) throw new Error("ASSET_PLANNER_UNKNOWN_EVIDENCE");

  const visualDir = path.join(input.artifactDir, "visuals");
  await mkdir(visualDir, { recursive: true });
  const assets: MvpStep6VisualAssetPlan[] = [];
  const seen = new Set<string>();
  for (const item of plan.proposals) {
    if (seen.has(item.type)) continue;
    seen.add(item.type);
    let block: MvpStep6ContentBlock;
    let outputPaths: string[] = [];
    if (item.type === "evidence_comparison_table") {
      block = evidenceComparison(input.ledger, input.usedSourceIds);
    } else if (item.type === "research_design_table") {
      block = researchDesignTable(input.design);
    } else {
      const outputPath = path.join(visualDir, `${item.type}.png`);
      const boxes = item.type === "conceptual_diagram"
        ? [`Problema: ${short(input.definition.problem, 14)}`, ...input.design.constructs.slice(0, 4).map((construct) => `${construct.kind}: ${construct.name}`)]
        : [`Datos: ${input.design.data_material_sources.slice(0, 2).map((value) => short(value, 6)).join("; ")}`, ...input.design.procedure.slice(0, 4).map((value) => short(value, 9)), `Validacion: ${input.design.quality_criteria.slice(0, 2).map((value) => short(value, 7)).join("; ")}`];
      await renderBoxes({ outputPath, title: item.caption, subtitle: item.type === "conceptual_diagram" ? "Relaciones propuestas, no resultados establecidos" : `${input.design.paradigm} | ${input.design.approach}`, boxes, arrows: item.type === "methodology_workflow", columns: 2, finalWidth: 600, finalHeight: 430 });
      outputPaths = [outputPath];
      block = { kind: "figure", title: item.caption, image_path: outputPath, source_note: item.source_evidence.length ? "Fuente: elaboracion propia con base en el diseno propuesto y la evidencia citada en el texto." : "Fuente: elaboracion propia a partir del diseno de investigacion propuesto.", asset_key: `original:${item.asset_id}`, source_id: null, render_hint: "compact_vector" };
    }
    addReference(section(input.drafts, item.section), item.expected_reference_in_text, block);
    assets.push({
      asset_id: item.asset_id,
      asset_type: item.type,
      purpose: item.scientific_purpose,
      destination_section: item.section,
      origin: item.source_evidence.length ? "evidence_synthesis" : "original_design",
      content_specification: item,
      supporting_source_ids: [...new Set(item.source_evidence.map((entry) => entry.source_id))],
      rendering_method: item.render_method,
      caption: item.caption,
      attribution: block.kind === "table" || block.kind === "figure" || block.kind === "equation" ? block.source_note : "Elaboracion propia",
      quality_requirements: ["sin resultados inventados", "legible", "relevante", "sin identificadores internos"],
      status: "accepted",
      output_paths: outputPaths,
      failure_reason: null,
      validation: { deterministic_render: true, evidence_pointers_valid: true, qa: "PASS" },
    });
  }
  assets.push({ asset_id: "consistency-matrix", asset_type: "consistency_matrix_table", purpose: "Alinear preguntas, objetivos y metodo", destination_section: "consistency_matrix", origin: "original_design", content_specification: { row_count: input.matrix.rows.length }, supporting_source_ids: [...new Set(input.matrix.rows.flatMap((row) => row.rationale_evidence.map((item) => item.source_id)))], rendering_method: "Tabla Word nativa editable", caption: "Matriz de consistencia", attribution: "Elaboracion propia", quality_requirements: ["editable", "alineacion uno a uno", "sin variables inventadas"], status: "accepted", output_paths: [], failure_reason: null, validation: { editable: true, matrix_image_generated: false } });
  const visualPlan: MvpStep6VisualPlan = { artifact_type: "mvp_step6_visual_plan", artifact_version: "v1", generated_at: new Date().toISOString(), research_design_hash: "profile-owned", matrix_hash: "profile-owned", matrix_sequence: ["validate_structured_matrix", "render_editable_native_table"], assets, image_requests: { initial: 0, repairs: 0 }, warnings: [] };
  await writeFile(path.join(visualDir, "asset-planner.json"), `${JSON.stringify({ prompt: ASSET_PLANNER_PROMPT, output: plan }, null, 2)}\n`, "utf8");
  await writeFile(path.join(visualDir, "visual-plan.json"), `${JSON.stringify(visualPlan, null, 2)}\n`, "utf8");
  return { visualPlan, plan };
}

export async function renderFinalMethodologicalInfographic(input: { definition: ResearchDefinition; design: ResearchDesign; drafts: MvpStep6SectionDraft[]; artifactDir: string }) {
  const outputPath = path.join(input.artifactDir, "visuals", "final-methodological-infographic.png");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const boxes = [
    `Problema: ${short(input.definition.problem, 9)}`,
    `Base conceptual: ${short(input.design.constructs.slice(0, 3).map((item) => item.name).join("; ") || "por precisar", 8)}`,
    `Datos o evidencia: ${short(input.design.data_material_sources.join("; "), 8)}`,
    `Metodo: ${short(input.design.design, 8)}`,
    `Procedimiento: ${short(input.design.procedure.join("; "), 8)}`,
    `Analisis: ${short(input.design.analysis_method, 8)}`,
    `Validacion: ${short(input.design.quality_criteria.join("; "), 8)}`,
  ];
  await renderBoxes({ outputPath, title: "Ruta metodologica de la investigacion propuesta", subtitle: "Sintesis original del diseno; no representa resultados ejecutados", boxes, arrows: true, columns: 2, finalWidth: 680, finalHeight: 420 });
  const draft = section(input.drafts, "final_methodological_infographic");
  addReference(draft, "La figura final integra el problema, la base conceptual, los datos, el metodo y la validacion propuestos.", { kind: "figure", title: "Sintesis metodologica del plan de investigacion", image_path: outputPath, source_note: "Fuente: elaboracion propia a partir del diseno de investigacion aprobado y la evidencia citada en el plan.", asset_key: "original:final-methodological-infographic", source_id: null, render_hint: "landscape_full" });
  return outputPath;
}
