import { z } from "zod";

const text = z.string().min(1);
const list = z.array(text);
export const evidencePointerSchema = z.object({ source_id: text, evidence_id: text });
export const questionSchema = z.object({ id: text, text, kind: z.enum(["general", "specific"]) });
export const objectiveSchema = z.object({ id: text, text, question_ids: list });
export const researchDesignSchema = z.object({
  paradigm: text,
  approach: z.enum(["quantitative", "qualitative", "mixed", "theoretical", "computational", "other"]),
  design: text, unit_population_corpus: text, sampling_selection: text,
  constructs: z.array(z.object({ id: text, name: text, kind: z.enum(["variable", "category", "construct", "concept"]), dimensions_indicators: list, operational_definition: text })),
  data_material_sources: list, techniques: list, instruments: list, procedure: list,
  analysis_method: text, quality_criteria: list, ethical_considerations: list,
  assumptions: list, limitations: list, pending_decisions: list,
  methodological_support: z.array(evidencePointerSchema),
});
export type ResearchDesign = z.infer<typeof researchDesignSchema>;
export const definitionSchema = z.object({
  problem: text, questions: z.array(questionSchema).min(1), objectives: z.array(objectiveSchema).min(1),
  hypotheses_or_propositions: z.array(z.object({ text, applicable_reason: text, objective_ids: list })),
});
export type ResearchDefinition = z.infer<typeof definitionSchema>;
export const consistencyMatrixSchema = z.object({
  synthesis: z.string(),
  rows: z.array(z.object({
    question_ids: list.min(1), objective_ids: list.min(1), construct_ids: list,
    design_alignment: text, data_techniques_instruments: text, analysis_quality: text,
    rationale_evidence: z.array(evidencePointerSchema), pending_decisions: list,
  })).min(1),
});
export type ConsistencyMatrix = z.infer<typeof consistencyMatrixSchema>;

export function validateResearchDefinition(definition: ResearchDefinition) {
  const questions = new Set(definition.questions.map((q) => q.id));
  const objectives = new Set(definition.objectives.map((o) => o.id));
  if (questions.size !== definition.questions.length || objectives.size !== definition.objectives.length) throw new Error("DESIGN_DUPLICATE_ID");
  if (definition.objectives.some((o) => !o.question_ids.length || o.question_ids.some((id) => !questions.has(id)))) throw new Error("OBJECTIVE_QUESTION_MISMATCH");
  if (definition.questions.some((q) => !definition.objectives.some((o) => o.question_ids.includes(q.id)))) throw new Error("QUESTION_WITHOUT_OBJECTIVE");
  if (definition.hypotheses_or_propositions.some((h) => h.objective_ids.some((id) => !objectives.has(id)))) throw new Error("HYPOTHESIS_OBJECTIVE_MISMATCH");
}

export function normalizeConsistencyMatrix(value: unknown, definition: ResearchDefinition, design: ResearchDesign): ConsistencyMatrix {
  const matrix = consistencyMatrixSchema.parse(value);
  const questions = new Set(definition.questions.map((q) => q.id));
  const objectives = new Set(definition.objectives.map((o) => o.id));
  const constructs = new Set(design.constructs.map((c) => c.id));
  for (const row of matrix.rows) {
    if (row.question_ids.some((id) => !questions.has(id)) || row.objective_ids.some((id) => !objectives.has(id)) || row.construct_ids.some((id) => !constructs.has(id))) throw new Error("MATRIX_UNKNOWN_DESIGN_ID");
    if (row.objective_ids.some((id) => !definition.objectives.find((o) => o.id === id)!.question_ids.some((q) => row.question_ids.includes(q)))) throw new Error("MATRIX_ALIGNMENT_MISMATCH");
  }
  if (definition.objectives.some((o) => !matrix.rows.some((row) => row.objective_ids.includes(o.id)))) throw new Error("MATRIX_MISSING_OBJECTIVE");
  return matrix;
}

export function consistencyTableRows(matrix: ConsistencyMatrix, definition: ResearchDefinition, design: ResearchDesign) {
  return [["Pregunta / objetivo", "Variables, categorias o conceptos", "Diseno y produccion de informacion", "Analisis y criterios de calidad"], ...matrix.rows.map((row) => [
    [...row.question_ids.map((id) => definition.questions.find((q) => q.id === id)!.text), ...row.objective_ids.map((id) => definition.objectives.find((o) => o.id === id)!.text)].join("\n\n"),
    row.construct_ids.map((id) => { const c = design.constructs.find((item) => item.id === id)!; return `${c.name}: ${c.operational_definition}${c.dimensions_indicators.length ? `\n${c.dimensions_indicators.join("; ")}` : ""}`; }).join("\n\n") || "No aplica al diseno declarado.",
    `${row.design_alignment}\n\n${row.data_techniques_instruments}`,
    `${row.analysis_quality}${row.pending_decisions.length ? `\n\nPor definir: ${row.pending_decisions.join("; ")}` : ""}`,
  ])];
}

export const MVP_DOCUMENT_SECTIONS = ["cover", "executive_summary", "problem_definition", "state_of_knowledge", "conceptual_framework", "questions_objectives_hypotheses_when_applicable", "methodology", "consistency_matrix", "contribution_and_feasibility", "scope_limitations_and_pending_decisions", "references"] as const;
export const GENERATION_ORDER = ["evidence_synthesis", "problem_definition", "research_questions", "objectives_and_optional_hypotheses", "conceptual_framework", "research_design", "methodology", "contribution_and_feasibility", "scope_limitations_and_pending_decisions", "consistency_matrix", "cross_section_review", "final_title", "executive_summary", "hero_infographic", "docx", "pdf"] as const;
export const SECTION_BUDGETS = {
  executive_summary: [200, 260], problem_definition: [480, 600], state_of_knowledge: [750, 900], conceptual_framework: [550, 700],
  questions_objectives_hypotheses_when_applicable: [240, 380], methodology: [900, 1150], consistency_matrix: [50, 120],
  contribution_and_feasibility: [380, 480], scope_limitations_and_pending_decisions: [320, 450], references: [0, 0],
} as const;
