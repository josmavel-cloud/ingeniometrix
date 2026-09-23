import type { MvpStep6SectionDraft, MvpStep6SectionPlanItem, MvpStep6VisualPlan } from "../step6-blueprint-docx-types";
import type { ConsistencyMatrix, ResearchDefinition, ResearchDesign } from "../research-plan-contracts";

export const LATAM_COMPACT_PROFILE_ID = "latam-compact-v1" as const;

export const LATAM_COMPACT_SECTION_ORDER = [
  "executive_summary",
  "problem_definition",
  "research_questions",
  "state_of_knowledge",
  "conceptual_framework",
  "objectives_hypotheses",
  "methodology",
  "consistency_matrix",
  "final_methodological_infographic",
  "references",
] as const;

export const LATAM_COMPACT_GENERATION_ORDER = [
  "evidence_synthesis",
  "problem_definition",
  "research_questions",
  "objectives_and_optional_hypotheses",
  "conceptual_framework",
  "research_design",
  "methodology",
  "consistency_matrix",
  "cross_section_review",
  "final_title",
  "executive_summary",
  "asset_planner",
  "final_methodological_infographic",
  "docx",
  "pdf",
] as const;

export type LatamCompactSectionKey = typeof LATAM_COMPACT_SECTION_ORDER[number];

export const LATAM_COMPACT_PROFILE = {
  id: LATAM_COMPACT_PROFILE_ID,
  version: "1.0.0",
  language: "es",
  bodyPages: { min: 7, targetMin: 9, targetMax: 11, max: 12 },
  excludedFromBodyCount: ["cover", "references"] as const,
  questionCount: { totalMin: 3, totalMax: 5, general: 1, specificMin: 2, specificMax: 4 },
  specificObjectiveCount: { min: 2, max: 4 },
  assetPolicy: {
    maxInteriorAssets: 5,
    finalInfographicAdditional: true,
    coverImageEnabled: false,
    matrixImageEnabled: false,
    extractedThirdPartyFiguresEnabled: false,
  },
  editorialCompressionRounds: 1,
  presentationRepairRounds: 1,
  citationPolicy: {
    executive_summary: "conditional",
    problem_definition: "literature_facts_only",
    research_questions: "normally_none",
    state_of_knowledge: "required_for_literature_claims",
    conceptual_framework: "required_for_literature_claims",
    objectives_hypotheses: "normally_none",
    methodology: "methodological_precedent_when_used",
    consistency_matrix: "only_when_scientifically_needed",
    final_methodological_infographic: "attribution_required",
    references: "cited_sources_only",
  },
} as const;

const LABELS: Record<LatamCompactSectionKey, string> = {
  executive_summary: "Resumen ejecutivo",
  problem_definition: "Planteamiento del problema",
  research_questions: "Preguntas de investigacion",
  state_of_knowledge: "Estado del conocimiento",
  conceptual_framework: "Marco conceptual o teorico",
  objectives_hypotheses: "Objetivos e hipotesis o proposiciones",
  methodology: "Metodologia",
  consistency_matrix: "Matriz de consistencia",
  final_methodological_infographic: "Sintesis metodologica",
  references: "Referencias",
};

type Budget = { min: number; max: number };

export function adaptiveSectionBudgets(definition?: ResearchDefinition, design?: ResearchDesign): Record<LatamCompactSectionKey, Budget> {
  const methodComplexity = Math.min(180, Math.max(0, ((design?.procedure.length ?? 1) - 3) * 30));
  const conceptComplexity = Math.min(120, Math.max(0, ((design?.constructs.length ?? 1) - 2) * 30));
  const questionComplexity = Math.min(60, Math.max(0, ((definition?.questions.length ?? 3) - 3) * 30));
  return {
    executive_summary: { min: 130, max: 180 },
    problem_definition: { min: 420, max: 560 },
    research_questions: { min: 70, max: 130 + questionComplexity },
    state_of_knowledge: { min: 750, max: 980 + conceptComplexity },
    conceptual_framework: { min: 450, max: 650 + conceptComplexity },
    objectives_hypotheses: { min: 90, max: 180 + questionComplexity },
    methodology: { min: 800, max: 1100 + methodComplexity },
    consistency_matrix: { min: 0, max: 80 },
    final_methodological_infographic: { min: 0, max: 45 },
    references: { min: 0, max: 0 },
  };
}

export function latamCompactSectionPlan(definition?: ResearchDefinition, design?: ResearchDesign): MvpStep6SectionPlanItem[] {
  const budgets = adaptiveSectionBudgets(definition, design);
  return LATAM_COMPACT_SECTION_ORDER.map((sectionKey, index) => ({
    section_key: sectionKey,
    title: LABELS[sectionKey],
    level: 1,
    order: index + 1,
    priority: "required",
    purpose: LABELS[sectionKey],
    min_words: budgets[sectionKey].min,
    max_words: budgets[sectionKey].max,
    output_modes: sectionKey === "references" ? ["references"] : sectionKey === "consistency_matrix" ? ["native_table"] : sectionKey === "final_methodological_infographic" ? ["figure_supported"] : ["narrative"],
    evidence_section_keys: [],
    required_source_count: ["state_of_knowledge", "conceptual_framework"].includes(sectionKey) ? 1 : 0,
    allowed_claim_types: ["proposed_research", "supported_literature"],
    claims_to_avoid: ["fabricated_findings", "untraceable_claims"],
    asset_policy: {
      allow_figures: ["state_of_knowledge", "conceptual_framework", "methodology", "final_methodological_infographic"].includes(sectionKey),
      allow_equations: ["conceptual_framework", "methodology"].includes(sectionKey),
      allow_tables: ["state_of_knowledge", "methodology", "consistency_matrix"].includes(sectionKey),
      max_assets: sectionKey === "consistency_matrix" || sectionKey === "final_methodological_infographic" ? 1 : 2,
    },
    fallback_policy: "Conservar el contenido cientifico y declarar las decisiones pendientes sin inventarlas.",
  }));
}

export function validateLatamCompactDefinition(definition: ResearchDefinition) {
  const generalQuestions = definition.questions.filter((question) => question.kind === "general");
  const specificQuestions = definition.questions.filter((question) => question.kind === "specific");
  if (definition.questions.length < 3 || definition.questions.length > 5) throw new Error("LATAM_COMPACT_QUESTION_COUNT");
  if (generalQuestions.length !== 1 || specificQuestions.length < 2 || specificQuestions.length > 4) throw new Error("LATAM_COMPACT_QUESTION_SHAPE");
  const generalObjectives = definition.objectives.filter((objective) => objective.question_ids.includes(generalQuestions[0]!.id));
  const specificObjectives = definition.objectives.filter((objective) => objective.question_ids.some((id) => specificQuestions.some((question) => question.id === id)));
  if (generalObjectives.length !== 1 || specificObjectives.length < 2 || specificObjectives.length > 4) throw new Error("LATAM_COMPACT_OBJECTIVE_SHAPE");
  for (const question of specificQuestions) {
    const mapped = definition.objectives.filter((objective) => objective.question_ids.includes(question.id));
    if (mapped.length !== 1) throw new Error("LATAM_COMPACT_SPECIFIC_ALIGNMENT");
  }
  return { totalQuestions: definition.questions.length, specificObjectives: specificObjectives.length };
}

export function pageProfileStatus(bodyPages: number | null) {
  if (bodyPages === null) return "UNMEASURED" as const;
  if (bodyPages < LATAM_COMPACT_PROFILE.bodyPages.min) return "UNDER_MIN" as const;
  if (bodyPages >= LATAM_COMPACT_PROFILE.bodyPages.targetMin && bodyPages <= LATAM_COMPACT_PROFILE.bodyPages.targetMax) return "WITHIN_TARGET" as const;
  if (bodyPages <= LATAM_COMPACT_PROFILE.bodyPages.max) return "WITHIN_ALLOWED_RANGE" as const;
  return "OVER_MAX" as const;
}

export function validateCompactCitationPolicy(drafts: MvpStep6SectionDraft[]) {
  const byKey = new Map(drafts.map((draft) => [draft.section_key, draft]));
  for (const key of ["research_questions", "objectives_hypotheses"]) {
    if ((byKey.get(key)?.citation_anchors.length ?? 0) > 0) throw new Error(`LATAM_COMPACT_UNEXPECTED_CITATION:${key}`);
  }
  for (const key of ["state_of_knowledge", "conceptual_framework"]) {
    const draft = byKey.get(key);
    if (draft?.blocks.some((block) => block.kind === "paragraph") && draft.citation_anchors.length === 0) throw new Error(`LATAM_COMPACT_MISSING_LITERATURE_CITATION:${key}`);
  }
  if (drafts.flatMap((draft) => draft.citation_anchors).some((anchor) => !anchor.source_id || !anchor.evidence_id)) throw new Error("LATAM_COMPACT_UNTRACEABLE_CITATION");
  return true;
}

export function predictedLayoutBudget(plan: MvpStep6SectionPlanItem[]) {
  const wordsPerPage = 430;
  return {
    wordsPerPage,
    bodyPages: Number((plan.filter((section) => section.section_key !== "references").reduce((sum, section) => sum + Math.round((section.min_words + section.max_words) / 2), 0) / wordsPerPage + 2.35).toFixed(2)),
    reservations: [
      { label: "Matriz nativa editable", pages: 1.35 },
      { label: "Assets interiores", pages: 0.55 },
      { label: "Infografia metodologica final", pages: 0.45 },
    ],
  };
}

export function reviewLatamCompactDocument(input: {
  definition: ResearchDefinition;
  design: ResearchDesign;
  matrix: ConsistencyMatrix;
  drafts: MvpStep6SectionDraft[];
  visuals?: MvpStep6VisualPlan;
}) {
  const critical: string[] = [];
  const warnings: string[] = [];
  try { validateLatamCompactDefinition(input.definition); } catch (error) { critical.push(String(error)); }
  try { validateCompactCitationPolicy(input.drafts); } catch (error) { critical.push(String(error)); }
  const order = [...input.drafts].sort((a, b) => a.order - b.order).map((draft) => draft.section_key);
  if (order.join("|") !== LATAM_COMPACT_SECTION_ORDER.join("|")) critical.push("DOCUMENT_SECTION_ORDER_CHANGED");
  const matrixQuestionIds = new Set(input.matrix.rows.flatMap((row) => row.question_ids));
  const matrixObjectiveIds = new Set(input.matrix.rows.flatMap((row) => row.objective_ids));
  for (const question of input.definition.questions) if (!matrixQuestionIds.has(question.id)) critical.push(`MATRIX_MISSING_QUESTION:${question.id}`);
  for (const objective of input.definition.objectives) if (!matrixObjectiveIds.has(objective.id)) critical.push(`MATRIX_MISSING_OBJECTIVE:${objective.id}`);
  if (!input.design.procedure.length || !input.design.analysis_method || !input.design.quality_criteria.length) critical.push("METHODOLOGY_INCOMPLETE_AFTER_EDITING");
  const visibleText = input.drafts.flatMap((draft) => draft.blocks.flatMap((block) => block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" ? block.items : [])).join(" ");
  if (/\b(?:los resultados (?:demostraron|muestran)|se demostró|se comprobó|se encontró que)\b/i.test(visibleText)) critical.push("APPARENT_COMPLETED_FINDING_DETECTED");
  const usedAssetKeys = new Set(input.drafts.flatMap((draft) => draft.used_asset_keys));
  if (input.visuals?.assets.some((asset) => asset.status !== "accepted" && usedAssetKeys.has(`original:${asset.asset_id}`))) critical.push("QA_FAILED_ASSET_REFERENCED");
  if (!input.visuals?.assets.some((asset) => asset.asset_type === "consistency_matrix_table" && asset.status === "accepted")) critical.push("EDITABLE_MATRIX_MISSING");
  if (!input.visuals?.assets.some((asset) => asset.asset_type === "final_methodological_infographic" && asset.status === "accepted")) critical.push("FINAL_INFOGRAPHIC_MISSING");
  if (input.design.pending_decisions.length) warnings.push("El diseño conserva decisiones pendientes para resolución por el investigador.");
  return {
    artifact_type: "rc4_g3_final_document_review",
    artifact_version: "v1",
    status: critical.length ? "FAIL" : warnings.length ? "PASS_WITH_LIMITATIONS" : "PASS",
    checks: {
      intent_and_approved_design_preserved: critical.every((item) => item !== "METHODOLOGY_INCOMPLETE_AFTER_EDITING"),
      question_objective_matrix_alignment: !critical.some((item) => item.startsWith("MATRIX_MISSING_")),
      citation_policy: !critical.some((item) => item.includes("CITATION")),
      no_apparent_fabricated_findings: !critical.includes("APPARENT_COMPLETED_FINDING_DETECTED"),
      editable_matrix: !critical.includes("EDITABLE_MATRIX_MISSING"),
      final_infographic: !critical.includes("FINAL_INFOGRAPHIC_MISSING"),
    },
    critical_issues: critical,
    warnings,
  } as const;
}
