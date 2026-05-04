import { getConfiguredLlmProvider } from "@/llm";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintSemanticCriterionReport,
  MasterBlueprintSemanticReviewReport,
} from "@/server/blueprint-v2/types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

const SEMANTIC_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "recommendation",
    "problem_objective_alignment_score",
    "problem_objective_alignment_notes",
    "objective_specificity_score",
    "objective_specificity_notes",
    "research_question_quality_score",
    "research_question_quality_notes",
    "methodology_design_score",
    "methodology_design_notes",
    "evidence_grounding_score",
    "evidence_grounding_notes",
    "academic_prudence_score",
    "academic_prudence_notes",
  ],
  properties: {
    summary: { type: "string", minLength: 20, maxLength: 600 },
    recommendation: {
      type: "string",
      enum: ["approve", "review", "reject"],
    },
    problem_objective_alignment_score: { type: "number", minimum: 0, maximum: 5 },
    problem_objective_alignment_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
    objective_specificity_score: { type: "number", minimum: 0, maximum: 5 },
    objective_specificity_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
    research_question_quality_score: { type: "number", minimum: 0, maximum: 5 },
    research_question_quality_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
    methodology_design_score: { type: "number", minimum: 0, maximum: 5 },
    methodology_design_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
    evidence_grounding_score: { type: "number", minimum: 0, maximum: 5 },
    evidence_grounding_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
    academic_prudence_score: { type: "number", minimum: 0, maximum: 5 },
    academic_prudence_notes: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 4, maxLength: 240 },
    },
  },
} as const;

type SemanticReviewPayload = {
  summary: string;
  recommendation: "approve" | "review" | "reject";
  problem_objective_alignment_score: number;
  problem_objective_alignment_notes: string[];
  objective_specificity_score: number;
  objective_specificity_notes: string[];
  research_question_quality_score: number;
  research_question_quality_notes: string[];
  methodology_design_score: number;
  methodology_design_notes: string[];
  evidence_grounding_score: number;
  evidence_grounding_notes: string[];
  academic_prudence_score: number;
  academic_prudence_notes: string[];
};

function clampScore5(value: number) {
  return Number.parseFloat(Math.max(0, Math.min(5, value)).toFixed(2));
}

function buildCriteria(payload: SemanticReviewPayload): MasterBlueprintSemanticCriterionReport[] {
  return [
    {
      key: "problem_objective_alignment",
      label: "Alineacion problema-objetivos",
      score_5: clampScore5(payload.problem_objective_alignment_score),
      notes: payload.problem_objective_alignment_notes,
    },
    {
      key: "objective_specificity",
      label: "Especificidad de objetivos",
      score_5: clampScore5(payload.objective_specificity_score),
      notes: payload.objective_specificity_notes,
    },
    {
      key: "research_question_quality",
      label: "Calidad de preguntas",
      score_5: clampScore5(payload.research_question_quality_score),
      notes: payload.research_question_quality_notes,
    },
    {
      key: "methodology_design",
      label: "Claridad metodologica",
      score_5: clampScore5(payload.methodology_design_score),
      notes: payload.methodology_design_notes,
    },
    {
      key: "evidence_grounding",
      label: "Anclaje en evidencia",
      score_5: clampScore5(payload.evidence_grounding_score),
      notes: payload.evidence_grounding_notes,
    },
    {
      key: "academic_prudence",
      label: "Prudencia academica",
      score_5: clampScore5(payload.academic_prudence_score),
      notes: payload.academic_prudence_notes,
    },
  ];
}

function buildPrompt(input: {
  project: MasterBlueprintEngineProject;
  legacyBlueprint: ResearchBlueprintRecord;
  evidenceLedger: EvidenceLedger;
}) {
  const formalSources = input.evidenceLedger.source_registry
    .filter((source) => source.eligible_for_formal_reference)
    .slice(0, 6)
    .map((source, index) => {
      const pack = input.evidenceLedger.evidence_packs.find(
        (item) => item.source_id === source.source_id,
      );

      return [
        `${index + 1}. ${source.title}`,
        `   Anio: ${source.year ?? "NO_DISPONIBLE"}`,
        `   Abstract: ${source.abstract?.trim() || "NO_DISPONIBLE"}`,
        `   Problema: ${pack?.problem_signal ?? "NO_DISPONIBLE"}`,
        `   Metodo: ${pack?.method_signal ?? "NO_DISPONIBLE"}`,
        `   Hallazgo: ${pack?.finding_signal ?? "NO_DISPONIBLE"}`,
        `   Limitacion: ${pack?.limitation_signal ?? "NO_DISPONIBLE"}`,
      ].join("\n");
    });

  return [
    "Eres Ingeniometrix y actuas como revisor academico estricto para un blueprint de investigacion.",
    "Evalua calidad semantica real, no formato. No inventes defectos ni elogios.",
    "Usa escala 0 a 5 por criterio, donde 5 es excelente y 0 es inaceptable.",
    "Debes juzgar si el problema conduce logicamente al objetivo general, si los objetivos especificos son concretos, si las preguntas son investigables, si la metodologia esta clara, si el blueprint se apoya de verdad en la evidencia recuperada y si mantiene prudencia academica.",
    "Proyecto e intake:",
    `- Titulo: ${input.project.title}`,
    `- Tema intake: ${input.project.intake.topic}`,
    `- Problema intake: ${input.project.intake.problemContext || "NO_DISPONIBLE"}`,
    `- Poblacion: ${input.project.intake.targetPopulation || "NO_DISPONIBLE"}`,
    `- Metodologia preferida: ${input.project.intake.preferredMethodology || "NO_DISPONIBLE"}`,
    "",
    "Blueprint resultante:",
    `- Problema: ${input.legacyBlueprint.problem_statement}`,
    `- Objetivo general: ${input.legacyBlueprint.general_objective}`,
    `- Objetivos especificos: ${input.legacyBlueprint.specific_objectives.join(" | ") || "NO_DISPONIBLE"}`,
    `- Preguntas: ${input.legacyBlueprint.research_questions.join(" | ") || "NO_DISPONIBLE"}`,
    `- Metodologia propuesta: ${input.legacyBlueprint.proposed_methodology}`,
    `- Analisis: ${input.legacyBlueprint.analysis_plan}`,
    `- Supuestos: ${input.legacyBlueprint.assumptions.join(" | ") || "NO_DISPONIBLE"}`,
    "",
    "Antecedentes y evidencia formal usada:",
    formalSources.join("\n\n") || "NO_DISPONIBLE",
    "",
    "Devuelve una evaluacion severa pero justa. Si el contenido es genericamente aceptable pero metodologicamente flojo, eso debe reflejarse en la nota.",
  ].join("\n");
}

export async function reviewMasterBlueprintSemantics(input: {
  project: MasterBlueprintEngineProject;
  legacyBlueprint: ResearchBlueprintRecord;
  evidenceLedger: EvidenceLedger;
}): Promise<MasterBlueprintSemanticReviewReport | null> {
  try {
    const provider = getConfiguredLlmProvider();
    const payload = await provider.generateStructuredObject<SemanticReviewPayload>({
      prompt: buildPrompt(input),
      schemaName: "master_blueprint_semantic_review",
      schema: SEMANTIC_REVIEW_SCHEMA,
    });
    const criteria = buildCriteria(payload);
    const average5 =
      criteria.reduce((total, criterion) => total + criterion.score_5, 0) /
      Math.max(1, criteria.length);

    return {
      model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
      score_10: Number.parseFloat((average5 * 2).toFixed(2)),
      summary: payload.summary,
      recommendation: payload.recommendation,
      criteria,
      warnings: [],
    };
  } catch (error) {
    return {
      model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
      score_10: null,
      summary: null,
      recommendation: "skipped",
      criteria: [],
      warnings: [
        error instanceof Error
          ? `La revision semantica con LLM no estuvo disponible: ${error.message}`
          : "La revision semantica con LLM no estuvo disponible.",
      ],
    };
  }
}
