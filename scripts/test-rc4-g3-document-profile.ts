import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { LlmProvider } from "@/llm/provider";
import { compactAssetPlanSchema, planAndRenderCompactAssets, renderFinalMethodologicalInfographic } from "@/server/mvp/compact-asset-planner";
import {
  LATAM_COMPACT_PROFILE,
  LATAM_COMPACT_SECTION_ORDER,
  latamCompactSectionPlan,
  pageProfileStatus,
  predictedLayoutBudget,
  validateCompactCitationPolicy,
  validateLatamCompactDefinition,
} from "@/server/mvp/document-profiles/latam-compact-v1";
import { consistencyMatrixSchema, researchDesignSchema, type ResearchDefinition } from "@/server/mvp/research-plan-contracts";
import { appendDeterministicCitationLabels } from "@/server/mvp/scientific-plan-generation";
import { generationBudget } from "@/server/mvp/generation-budgets";
import {
  APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT,
  APPROVED_SCIENTIFIC_PLAN_PROMPT,
} from "@/server/mvp/prompts/scientific-plan-approved.v1";
import type { MvpStep5EvidenceLedger } from "@/server/mvp/evidence-materialization-types";
import type { MvpStep6SectionDraft } from "@/server/mvp/step6-blueprint-docx-types";

const definition: ResearchDefinition = {
  problem: "Implementar un sistema geoespacial que preserve la trazabilidad de ordenadas espectrales sin anticipar resultados.",
  questions: [
    { id: "PG", text: "¿Como implementar y validar el sistema propuesto?", kind: "general" },
    { id: "PE1", text: "¿Que datos y reglas requiere?", kind: "specific" },
    { id: "PE2", text: "¿Como implementar las funciones?", kind: "specific" },
    { id: "PE3", text: "¿Como verificar su correspondencia?", kind: "specific" },
  ],
  objectives: [
    { id: "OG", text: "Implementar y validar el sistema.", question_ids: ["PG"] },
    { id: "OE1", text: "Caracterizar datos y reglas.", question_ids: ["PE1"] },
    { id: "OE2", text: "Implementar las funciones.", question_ids: ["PE2"] },
    { id: "OE3", text: "Verificar correspondencia.", question_ids: ["PE3"] },
  ],
  hypotheses_or_propositions: [],
};
const design = researchDesignSchema.parse({ paradigm: "Pragmatico", approach: "computational", design: "Desarrollo aplicado y evaluacion tecnica", unit_population_corpus: "Capas geoespaciales documentadas", sampling_selection: "Seleccion por cobertura y compatibilidad", constructs: [{ id: "C1", name: "Trazabilidad espectral", kind: "construct", dimensions_indicators: ["parametros", "fuente"], operational_definition: "Correspondencia verificable con el insumo" }], data_material_sources: ["Ordenadas espectrales documentadas"], techniques: ["Transformacion geoespacial"], instruments: [], procedure: ["Verificar insumos", "Construir capas", "Implementar visor", "Ejecutar pruebas"], analysis_method: "Comparacion de valores y metadatos contra los insumos", quality_criteria: ["Fidelidad numerica", "Trazabilidad"], ethical_considerations: [], assumptions: [], limitations: ["Cobertura por confirmar"], pending_decisions: ["Ambito exacto"], methodological_support: [{ source_id: "S1", evidence_id: "E1" }] });
const matrix = consistencyMatrixSchema.parse({ synthesis: "Las preguntas y objetivos conservan una correspondencia uno a uno.", rows: definition.questions.map((question, index) => ({ question_ids: [question.id], objective_ids: [definition.objectives[index].id], construct_ids: ["C1"], design_alignment: "Etapa correspondiente del desarrollo propuesto", data_techniques_instruments: "Datos documentados y transformacion geoespacial", analysis_quality: "Comparacion y trazabilidad", rationale_evidence: [{ source_id: "S1", evidence_id: "E1" }], pending_decisions: [] })) });
const ledger = { semantic_extractions: [{ evidence_basis: "PDF_FULLTEXT", evidence_items: [{ source_id: "S1", evidence_id: "E1", traceable_summary_es: "Las ordenadas espectrales permiten construir representaciones cartograficas.", support_verified: true, allowed_use: "theory_or_method_support", gaps: [] }] }], source_registry: [{ source_id: "S1", reference_id: "R1", title: "Fuente", authors: ["Autora Ejemplo"], year: 2025 }], references: [{ reference_id: "R1", formatted_reference: "Ejemplo (2025). Fuente." }] } as unknown as MvpStep5EvidenceLedger;

function draft(sectionKey: string): MvpStep6SectionDraft {
  return { section_key: sectionKey, title: sectionKey, level: 1, order: LATAM_COMPACT_SECTION_ORDER.indexOf(sectionKey as never) + 1, status: "generated", generation_source: "system", word_count: 5, generation_wave: "core", blocks: [{ kind: "paragraph", text: "Contenido cientifico propuesto." }], citation_anchors: [], used_source_ids: [], used_evidence_ids: [], used_snippet_ids: [], used_asset_keys: [], assumptions: [], limitations: [], warnings: [] };
}

async function main() {
  assert.equal(LATAM_COMPACT_PROFILE.bodyPages.min, 7);
  assert.equal(LATAM_COMPACT_PROFILE.bodyPages.max, 12);
  assert.equal(LATAM_COMPACT_PROFILE.assetPolicy.maxInteriorAssets, 5);
  assert.equal(LATAM_COMPACT_PROFILE.assetPolicy.matrixImageEnabled, false);
  assert.equal(LATAM_COMPACT_PROFILE.assetPolicy.coverImageEnabled, false);
  assert.equal(APPROVED_SCIENTIFIC_PLAN_PROMPT.version, "ingeniometrix-scientific-plan-approved-v1");
  assert.equal(APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT.version, "ingeniometrix-scientific-plan-approved-latam-compact-v1");
  assert.deepEqual(generationBudget("problem_definition", "legacy-release0").target_words, 480);
  assert.deepEqual(generationBudget("problem_definition", "latam-compact-v1").target_words, 420);
  assert.deepEqual(latamCompactSectionPlan(definition, design).map((item) => item.section_key), LATAM_COMPACT_SECTION_ORDER);
  assert.ok(!LATAM_COMPACT_SECTION_ORDER.some((key) => /budget|schedule|contribution|scope_limitations/.test(key)));
  assert.deepEqual(validateLatamCompactDefinition(definition), { totalQuestions: 4, specificObjectives: 3 });
  assert.throws(() => validateLatamCompactDefinition({ ...definition, questions: definition.questions.slice(0, 2), objectives: definition.objectives.slice(0, 2) }), /QUESTION_COUNT/);
  assert.throws(() => validateLatamCompactDefinition({ ...definition, objectives: definition.objectives.map((item, index) => index === 2 ? { ...item, question_ids: ["PE1"] } : item) }), /SPECIFIC_ALIGNMENT|QUESTION_WITHOUT/);
  assert.equal(pageProfileStatus(6), "UNDER_MIN");
  assert.equal(pageProfileStatus(9), "WITHIN_TARGET");
  assert.equal(pageProfileStatus(12), "WITHIN_ALLOWED_RANGE");
  assert.equal(pageProfileStatus(13), "OVER_MAX");
  assert.ok(predictedLayoutBudget(latamCompactSectionPlan(definition, design)).bodyPages <= 12);
  assert.equal(
    appendDeterministicCitationLabels(
      "La evidencia respalda la representación espacial (Ejemplo et al., 2025; Otra, 2024).",
      ["(Ejemplo et al., 2025)", "(Otra, 2024)"],
    ),
    "La evidencia respalda la representación espacial (Ejemplo et al., 2025) (Otra, 2024).",
  );
  assert.equal(
    appendDeterministicCitationLabels(
      "Antecedentes: (Ejemplo et al., 2025); (Otra, 2024).",
      ["(Ejemplo et al., 2025)", "(Otra, 2024)", "(Ejemplo et al., 2025)"],
    ),
    "Antecedentes: (Ejemplo et al., 2025) (Otra, 2024).",
  );

  const drafts = LATAM_COMPACT_SECTION_ORDER.map(draft);
  for (const key of ["state_of_knowledge", "conceptual_framework"]) {
    const target = drafts.find((item) => item.section_key === key)!;
    target.citation_anchors.push({ section_key: key, block_id: `${key}:p1`, paragraph_index: 0, sentence_index: null, source_id: "S1", evidence_id: "E1", snippet_id: null, citation_label: "(Ejemplo, 2025)", claim_summary: "Contenido" });
  }
  assert.equal(validateCompactCitationPolicy(drafts), true);
  const badCitations = structuredClone(drafts); badCitations.find((item) => item.section_key === "research_questions")!.citation_anchors.push(badCitations.find((item) => item.section_key === "state_of_knowledge")!.citation_anchors[0]);
  assert.throws(() => validateCompactCitationPolicy(badCitations), /UNEXPECTED_CITATION/);

  const provider = { name: "fixture", generateStructuredObject: async () => compactAssetPlanSchema.parse({ proposals: [
    { asset_id: "evidence-table", type: "evidence_comparison_table", section: "state_of_knowledge", scientific_purpose: "Comparar evidencia", why_needed: "Aclara nivel y limites", source_evidence: [{ source_id: "S1", evidence_id: "E1" }], input_data: ["evidence"], render_method: "WORD_NATIVE_TABLE", caption: "Comparacion de evidencia", expected_reference_in_text: "La Tabla 1 compara el material inspeccionado.", page_cost_estimate: 0.4 },
    { asset_id: "workflow", type: "methodology_workflow", section: "methodology", scientific_purpose: "Explicar secuencia", why_needed: "Integra datos y validacion", source_evidence: [], input_data: ["research_design"], render_method: "DETERMINISTIC_VECTOR", caption: "Flujo metodologico propuesto", expected_reference_in_text: "La Figura 1 resume el flujo metodologico propuesto.", page_cost_estimate: 0.5 },
  ], omitted_reason: "No se requieren otros assets." }), generateText: async () => "", generateTextDetailed: async () => ({ text: "", usage: {} as never }) } as LlmProvider;
  const root = await mkdtemp(path.join(os.tmpdir(), "imx-g3-"));
  const rendered = await planAndRenderCompactAssets({ provider, definition, design, matrix, ledger, usedSourceIds: ["S1"], drafts, artifactDir: root, projectId: "P1", runId: "R1", remainingBodyPages: 3 });
  assert.equal(rendered.visualPlan.assets.filter((asset) => asset.asset_type === "consistency_matrix_table").length, 1);
  assert.equal(rendered.visualPlan.assets.some((asset) => asset.asset_type === "consistency_matrix_image"), false);
  assert.equal(rendered.visualPlan.assets.some((asset) => asset.asset_type === "source_asset"), false);
  assert.ok(rendered.visualPlan.assets.length <= 5);
  const infographic = await renderFinalMethodologicalInfographic({ definition, design, drafts, artifactDir: root });
  assert.ok((await readFile(infographic)).length > 1000);
  const finalDraft = drafts.find((item) => item.section_key === "final_methodological_infographic")!;
  assert.equal(finalDraft.blocks.some((block) => block.kind === "figure"), true);
  assert.equal(finalDraft.order < drafts.find((item) => item.section_key === "references")!.order, true);
  assert.ok(rendered.visualPlan.assets.every((asset) => asset.status !== "rejected" && asset.status !== "failed"));
  console.log("PASS RC4 G3 profile: structure, counts, citations, page contract, native matrix and evidence-driven assets.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
