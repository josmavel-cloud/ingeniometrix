import { readFile } from "node:fs/promises";

import { getConfiguredLlmProvider } from "@/llm";
import type { ConsolidatedEvidenceArtifact, ConsolidatedEvidenceUnit } from "@/blueprint_launch/server/local-playground-store";
import { buildSourceHealthLookup } from "@/server/blueprint-engine/quality/section-evidence-binding";
import {
  buildAcademicEditorialPolicy,
  recommendedContentKindForSection,
  sectionPrefersBullets,
  type AcademicEditorialPolicy,
} from "@/server/blueprint-v2/editorial/academic-editorial-policy";
import type {
  MasterTemplateImportContextArtifact,
  TemplateImportSectionAlignmentEntry,
} from "@/server/blueprint-v2/lab/template-import-context";
import { planMasterTemplateSectionPrompts } from "@/server/blueprint-v2/prompts/section-prompt-planner";
import type {
  AssumptionInput,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterTemplateRuntime,
  SectionGenerationPhase,
  SectionGenerationPlanItem,
  SectionPromptManifestItem,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

const CRITICAL_SECTION_KEYS = [
  "problem_statement",
  "research_questions",
  "general_objective",
  "specific_objectives",
  "methodology",
  "variables_or_categories",
  "consistency_matrix",
] as const;

const VALID_PHASES = ["body", "logic", "framing", "references", "matrix"] as const;
const PHASE_LOCKED_SECTION_KEYS: Partial<
  Record<(typeof CRITICAL_SECTION_KEYS)[number], SectionGenerationPhase>
> = {
  problem_statement: "logic",
  research_questions: "logic",
  general_objective: "logic",
  specific_objectives: "logic",
  methodology: "body",
  variables_or_categories: "body",
  consistency_matrix: "matrix",
};

type LabPlannerMode = "deterministic" | "llm_hybrid" | "llm_orchestrated";
type GenerationWaveKey =
  | "intake_refinement"
  | "foundation"
  | "development"
  | "support_integration"
  | "refinement_and_final"
  | "citation_and_references";
type GenerationStrategy =
  | "llm_text"
  | "llm_structured"
  | "llm_revision"
  | "llm_final"
  | "blocked";
type ReadinessLevel = "alta" | "media" | "baja" | "blocked" | "unknown";
type PromptMode =
  | "intake_refinement"
  | "base_generation"
  | "adaptive_generation"
  | "asset_integration"
  | "adaptive_revision"
  | "final_synthesis"
  | "citation_insertion";
type AssetInclusionPolicy =
  | "ignore_assets"
  | "include_key_assets"
  | "include_structured_assets_only"
  | "include_visual_assets"
  | "include_equations_and_tables";
type RevisionGoal =
  | "increase_specificity"
  | "increase_coherence"
  | "increase_length"
  | "improve_citation_discipline"
  | "integrate_assets"
  | "reduce_overclaiming";

type RefinedIntakeContext = {
  refined_topic_es: string;
  normalized_problem_es: string;
  normalized_research_line_es: string | null;
  normalized_methodology_es: string | null;
  normalized_population_es: string | null;
  normalized_constraints_es: string | null;
  accepted_foreign_terms: Array<{
    term: string;
    rationale: string;
    preferred_spanish_gloss: string | null;
  }>;
  key_decisions: string[];
  ambiguity_warnings: string[];
};

type ResearchFrameLight = {
  topic_refined: string;
  problem_core: string;
  case_or_unit_of_analysis: string | null;
  study_purpose: string;
  study_question_type:
    | "descriptiva_aplicada"
    | "evaluativa_aplicada"
    | "comparativa_aplicada"
    | "propositiva_aplicada";
  methodological_orientation: string;
  expected_deliverable: string;
  scope_limits: string[];
  claims_ceiling: string;
};

type ResearchLogicContractPlan = {
  enabled: true;
  mode: "light_master_thesis_project";
  row_id_format: "P{n}/OE{n}/H{n}";
  source_sections: {
    problem: string[];
    questions: string[];
    objectives: string[];
    hypotheses: string[];
    variables_or_categories: string[];
    methodology: string[];
  };
  generation_sequence: Array<{
    section_key: string;
    must_consume: string[];
    must_emit: string[];
  }>;
  correspondence_rules: string[];
  step9_prompt_rules: string[];
  step10_llm_rules: string[];
  code_validation_rules: string[];
  docx_table_contract: {
    orientation: "landscape";
    row_count_target: "3_to_5";
    required_columns: string[];
  };
};

type SectionEvidenceHydrationPlanItem = {
  section_key: string;
  wave: GenerationWaveKey;
  priority_evidence_ids: string[];
  priority_original_excerpt_ids: string[];
  priority_snippet_ids: string[];
  priority_source_ids: string[];
  critical_asset_keys: string[];
  useful_asset_keys: string[];
  claims_allowed: string[];
  claims_to_avoid: string[];
  key_gaps: string[];
  required_structure: string[];
  min_words: number | null;
  max_words: number | null;
  required_original_fragments: string[];
  chunk_rehydration_hints: string[];
};

type MethodScopeGuidanceItem = {
  section_key: string;
  treatment:
    | "narrative_support"
    | "comparative_support"
    | "criteria_definition"
    | "category_definition"
    | "typology_definition"
    | "pre_feasibility_framework"
    | "final_synthesis";
  expected_elements: string[];
  supporting_method_signals: string[];
  avoid: string[];
};

type ClaimsAndLimitsGuidanceItem = {
  section_key: string;
  allowed_claims: string[];
  claims_to_avoid: string[];
  claims_conditioned: string[];
  validation_needs: string[];
};

type FinalSectionsGuidance = {
  late_section_keys: string[];
  abstract_rule: string;
  keywords_rule: string;
  references_rule: string;
  title_refinement_rule: string;
  final_title_instruction: string;
  short_header_title_instruction: string;
  keywords_instruction: string;
  redundancy_constraints: string[];
  bullet_policy: string;
  length_budget_rule: string;
  section_opening_rule: string;
  objective_repetition_rule: string;
  target_word_budget_by_section: Record<string, number>;
  master_target_pages: number;
  institutional_target_pages: number;
};

type SectionRetryPolicy = {
  enabled: boolean;
  max_attempts: number;
  retry_on: Array<
    | "below_min_words"
    | "above_max_words"
    | "missing_required_structure"
    | "missing_critical_assets"
    | "weak_alignment"
    | "overclaiming"
    | "low_specificity"
  >;
};

type PlanningWaveSummary = {
  wave_key: GenerationWaveKey;
  label: string;
  goal: string;
  section_keys: string[];
  ready_count: number;
  blocked_count: number;
  output_context_keys: string[];
};

type ContextBlueprint = {
  context_key: string;
  produced_by_wave: GenerationWaveKey;
  derived_from_section_keys: string[];
  description: string;
  shape:
    | "decision_list"
    | "section_summary_set"
    | "method_profile"
    | "category_schema"
    | "final_synthesis_inputs";
};

type AssetInclusionPlanItem = {
  section_key: string;
  wave: GenerationWaveKey;
  asset_policy: AssetInclusionPolicy;
  critical_asset_keys: string[];
  useful_asset_keys: string[];
  optional_asset_keys: string[];
};

type RevisionPassItem = {
  section_key: string;
  enabled: boolean;
  revision_goals: RevisionGoal[];
  trigger_conditions: string[];
  depends_on_section_keys: string[];
};

type TitleRefinementPlan = {
  enabled: true;
  wave: "refinement_and_final";
  depends_on_section_keys: string[];
  prompt_mode: "final_synthesis";
};

type CitationPlan = {
  enabled: true;
  wave: "citation_and_references";
  style_target: string | null;
  section_policies: Array<{
    section_key: string;
    citation_density_target: "none" | "low" | "medium" | "high";
    citation_mode:
      | "inline_required"
      | "inline_optional"
      | "references_only"
      | "deferred_to_docx";
    derive_from_supported_sources_only: boolean;
  }>;
  bibliography_rules: {
    include_only_used_references: true;
    deduplicate_by_reference_id: true;
    require_traceable_source_link: true;
  };
};

type ExtendedSectionGenerationPlanItem = SectionGenerationPlanItem & {
  wave: GenerationWaveKey;
  generation_strategy: GenerationStrategy;
  prompt_mode: PromptMode;
  required_context_keys: string[];
  upstream_context_keys: string[];
  readiness: ReadinessLevel;
  enough_to_draft: boolean;
  source_ids: string[];
  snippet_ids: string[];
  asset_keys: string[];
  critical_asset_keys: string[];
  useful_asset_keys: string[];
  imported_source_ids: string[];
  imported_snippet_ids: string[];
  imported_asset_keys: string[];
  assumption_ids: string[];
  support_strategy: string | null;
  retry_policy: SectionRetryPolicy;
  needs_followup_before_strong_draft: boolean;
  target_word_budget: number | null;
  editorial_constraints: string[];
  bullet_policy: string | null;
  phase_locked: boolean;
};

type ExtendedSectionPromptManifestItem = SectionPromptManifestItem & {
  wave: GenerationWaveKey;
  generation_strategy: GenerationStrategy;
  prompt_mode: PromptMode;
  readiness: ReadinessLevel;
  enough_to_draft: boolean;
  source_ids: string[];
  asset_keys: string[];
  critical_asset_keys: string[];
  useful_asset_keys: string[];
  imported_source_ids: string[];
  imported_snippet_ids: string[];
  imported_asset_keys: string[];
  assumption_ids: string[];
  required_context_keys: string[];
  upstream_context_keys: string[];
  support_strategy: string | null;
  asset_policy: AssetInclusionPolicy;
  citation_policy: {
    expected_density: "none" | "low" | "medium" | "high";
    citation_mode:
      | "inline_required"
      | "inline_optional"
      | "references_only"
      | "deferred_to_docx";
  };
  retry_policy: SectionRetryPolicy;
  needs_followup_before_strong_draft: boolean;
  target_word_budget: number | null;
  editorial_constraints: string[];
  bullet_policy: string | null;
};

type SourceContext = {
  template_key: string;
  template_version_id: string;
  source_lab: "blueprint_launch" | "lab_fixture";
  imported_topic: string;
  knowledge_area_label: string | null;
  citation_style: string | null;
};

type PlannerChecks = {
  late_sections: string[];
  weak_sections: string[];
  blocked_sections: string[];
  assumption_heavy_sections: string[];
  sections_requiring_followup: string[];
};

type ExtendedBaselinePlan = {
  generation_plan: ExtendedSectionGenerationPlanItem[];
  prompt_manifest: ExtendedSectionPromptManifestItem[];
  source_context: SourceContext;
  generation_waves: PlanningWaveSummary[];
  refined_intake_context: RefinedIntakeContext;
  research_frame_light: ResearchFrameLight;
  research_logic_contract_plan: ResearchLogicContractPlan;
  context_blueprints: ContextBlueprint[];
  section_evidence_hydration_plan: SectionEvidenceHydrationPlanItem[];
  method_scope_guidance: MethodScopeGuidanceItem[];
  claims_and_limits_guidance: ClaimsAndLimitsGuidanceItem[];
  final_sections_guidance: FinalSectionsGuidance;
  academic_editorial_policy: AcademicEditorialPolicy;
  asset_inclusion_plan: AssetInclusionPlanItem[];
  revision_pass_plan: RevisionPassItem[];
  title_refinement_plan: TitleRefinementPlan;
  citation_plan: CitationPlan;
  checks: PlannerChecks;
};

export type LabPromptPlanRefinement = {
  section_key: string;
  recommended_phase: SectionGenerationPhase | null;
  recommended_depends_on_keys: string[];
  recommended_evidence_snippet_ids: string[];
  recommended_assumption_ids: string[];
  support_strategy: string | null;
  extra_instructions: string[];
  rationale: string;
};

export type LabPromptPlan = SectionPromptPlan & {
  artifact_type: "section_planning";
  artifact_version: "v6";
  generated_at: string;
  planner_mode: LabPlannerMode;
  llm_provider: string | null;
  llm_model: string | null;
  refined_intake_context: RefinedIntakeContext;
  research_frame_light: ResearchFrameLight;
  research_logic_contract_plan: ResearchLogicContractPlan;
  baseline_prompt_plan: {
    generation_plan: ExtendedSectionGenerationPlanItem[];
    prompt_manifest: ExtendedSectionPromptManifestItem[];
  };
  source_context: SourceContext;
  generation_waves: PlanningWaveSummary[];
  context_blueprints: ContextBlueprint[];
  section_evidence_hydration_plan: SectionEvidenceHydrationPlanItem[];
  method_scope_guidance: MethodScopeGuidanceItem[];
  claims_and_limits_guidance: ClaimsAndLimitsGuidanceItem[];
  final_sections_guidance: FinalSectionsGuidance;
  academic_editorial_policy: AcademicEditorialPolicy;
  final_title_instruction: string;
  short_header_title_instruction: string;
  keywords_instruction: string;
  redundancy_constraints: string[];
  bullet_policy: string;
  target_word_budget_by_section: Record<string, number>;
  master_target_pages: number;
  institutional_target_pages: number;
  asset_inclusion_plan: AssetInclusionPlanItem[];
  revision_pass_plan: RevisionPassItem[];
  title_refinement_plan: TitleRefinementPlan;
  citation_plan: CitationPlan;
  global_observations: string[];
  merge_warnings: string[];
  llm_refinements: LabPromptPlanRefinement[];
  refined_section_keys: string[];
  checks: PlannerChecks;
};

type LlmSectionRefinement = {
  section_key: string;
  recommended_phase: string | null;
  recommended_depends_on_keys: string[];
  recommended_evidence_snippet_ids: string[];
  recommended_assumption_ids: string[];
  support_strategy: string | null;
  extra_instructions: string[];
  rationale: string;
};

type LlmPlannerResponse = {
  global_observations: string[];
  section_refinements: LlmSectionRefinement[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

async function loadReadonlyConsolidatedEvidence(
  consolidatedEvidencePath: string | null | undefined,
): Promise<ConsolidatedEvidenceArtifact | null> {
  if (!consolidatedEvidencePath) {
    return null;
  }

  try {
    const raw = await readFile(consolidatedEvidencePath, "utf8");
    const parsed = JSON.parse(raw) as ConsolidatedEvidenceArtifact;

    return parsed?.artifact_type === "consolidated_evidence" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveStudyQuestionType(input: {
  refinedIntakeContext: RefinedIntakeContext;
  templateImportContext: MasterTemplateImportContextArtifact | null;
}) {
  const joined = [
    input.refinedIntakeContext.refined_topic_es,
    input.refinedIntakeContext.normalized_problem_es,
    input.refinedIntakeContext.normalized_methodology_es ?? "",
    input.templateImportContext?.proposal_context.method_candidate?.method_family ?? "",
    input.templateImportContext?.proposal_context.framework_candidate?.core_framework ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/compar|benchmark|tipolog|casos|case/i.test(joined)) {
    return "comparativa_aplicada" as const;
  }

  if (/framework|marco|proposal|propuesta|reuse strategy|estrategia/i.test(joined)) {
    return "propositiva_aplicada" as const;
  }

  if (/criteria|criteri|ahp|assessment|evalu|factibilidad|prefactibilidad/i.test(joined)) {
    return "evaluativa_aplicada" as const;
  }

  return "descriptiva_aplicada" as const;
}

function buildResearchFrameLight(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext: RefinedIntakeContext;
}): ResearchFrameLight {
  const questionType = resolveStudyQuestionType(input);
  const methodOrientation =
    input.refinedIntakeContext.normalized_methodology_es ??
    input.templateImportContext?.proposal_context.method_candidate?.method_family ??
    input.templateImportContext?.global_generation_hints.methodology_mode_hint ??
    "enfoque aplicado con soporte bibliografico y delimitacion prudente";
  const expectedDeliverable =
    questionType === "evaluativa_aplicada"
      ? "criterios de evaluacion o prefactibilidad para orientar la propuesta"
      : questionType === "comparativa_aplicada"
        ? "comparacion tipologica y criterios aplicables al caso"
        : questionType === "propositiva_aplicada"
          ? "marco preliminar o propuesta aplicada sustentada en literatura"
          : "diagnostico aplicado y delimitado del problema";
  const scopeLimits = uniqueStrings([
    input.refinedIntakeContext.normalized_constraints_es,
    input.templateImportContext?.proposal_context.evidence_gaps[0] ?? null,
    input.templateImportContext?.proposal_context.evidence_gaps[1] ?? null,
    input.templateImportContext?.checks.missing_local_context
      ? "la validacion local y contextual del caso sigue incompleta"
      : null,
    input.templateImportContext?.checks.missing_regulatory_context
      ? "la validacion normativa local debe declararse como pendiente"
      : null,
    input.templateImportContext?.checks.missing_technique_specific_support
      ? "el soporte tecnico o metodologico especifico debe tratarse con prudencia"
      : null,
  ]).slice(0, 5);

  return {
    topic_refined: input.refinedIntakeContext.refined_topic_es,
    problem_core: input.refinedIntakeContext.normalized_problem_es,
    case_or_unit_of_analysis:
      input.refinedIntakeContext.normalized_population_es ??
      input.templateImportContext?.imported_project_context.target_population ??
      null,
    study_purpose:
      questionType === "propositiva_aplicada"
        ? "proponer un marco preliminar de analisis y decision para el caso delimitado"
        : questionType === "evaluativa_aplicada"
          ? "definir criterios y una lectura aplicada de factibilidad preliminar"
          : questionType === "comparativa_aplicada"
            ? "comparar antecedentes y extraer criterios transferibles al caso"
            : "delimitar y explicar el problema aplicado con base en literatura y contexto disponible",
    study_question_type: questionType,
    methodological_orientation: methodOrientation,
    expected_deliverable: expectedDeliverable,
    scope_limits: scopeLimits,
    claims_ceiling:
      "Solo se permite formular un proyecto de investigacion de maestria defendible: no demostrar viabilidad total, cumplimiento normativo integral, rentabilidad o validacion estructural final sin soporte directo.",
  };
}

function buildResearchLogicContractPlan(): ResearchLogicContractPlan {
  return {
    enabled: true,
    mode: "light_master_thesis_project",
    row_id_format: "P{n}/OE{n}/H{n}",
    source_sections: {
      problem: ["problem_statement", "general_research_question"],
      questions: ["research_questions", "specific_research_questions"],
      objectives: ["general_objective", "specific_objectives"],
      hypotheses: ["general_hypothesis", "specific_hypotheses"],
      variables_or_categories: ["variables_or_categories", "variables_indicators"],
      methodology: [
        "methodology",
        "methodological_approach",
        "research_design",
        "population_and_sample",
        "data_collection_techniques",
        "research_instruments",
        "analysis_plan",
      ],
    },
    generation_sequence: [
      {
        section_key: "research_questions",
        must_consume: ["problem_statement", "research_frame_light"],
        must_emit: ["pregunta_general", "P1..Pn"],
      },
      {
        section_key: "specific_objectives",
        must_consume: ["research_questions", "general_objective"],
        must_emit: ["OE1..OEn alineados con P1..Pn"],
      },
      {
        section_key: "specific_hypotheses",
        must_consume: ["specific_research_questions", "specific_objectives"],
        must_emit: ["H1..Hn alineadas con P1/OE1..Pn/OEn"],
      },
      {
        section_key: "variables_or_categories",
        must_consume: ["specific_objectives", "specific_hypotheses", "methodology"],
        must_emit: ["categorias, dimensiones, criterios o variables vinculadas por fila"],
      },
      {
        section_key: "methodology",
        must_consume: ["research_logic_contract", "research_frame_light"],
        must_emit: ["tipo, diseno, tecnica, instrumentos y plan de analisis compatibles"],
      },
      {
        section_key: "consistency_matrix",
        must_consume: ["drafts_step_9", "research_logic_contract"],
        must_emit: ["table_model horizontal para DOCX"],
      },
    ],
    correspondence_rules: [
      "Cada interrogante especifica debe tener un objetivo especifico que responda al mismo nucleo conceptual.",
      "Cada hipotesis o supuesto orientador debe corresponder a la misma fila Pn/OEn.",
      "Si el estudio es propositivo o evaluativo, variables puede representarse como categorias, criterios o dimensiones.",
      "No se deben introducir resultados, mediciones ni validaciones locales no generadas por Step 9.",
    ],
    step9_prompt_rules: [
      "Las secciones logicas deben conservar correspondencia interna P1/OE1/H1 aunque el texto final no muestre IDs tecnicos innecesarios.",
      "Objetivos, preguntas e hipotesis deben ser redactados con alcance de proyecto de maestria, no como tesis terminada.",
      "Variables/categorias y metodologia deben consumir los objetivos/preguntas ya generados.",
    ],
    step10_llm_rules: [
      "Usar LLM barato solo para redactar la matriz desde drafts Step 9.",
      "No consultar evidencia cruda ni inventar citas; Step 10 organiza contenido existente.",
      "Validar con codigo despues de la redaccion LLM.",
    ],
    code_validation_rules: [
      "validar conteos de filas",
      "validar presencia de problema, objetivo general y metodologia",
      "validar correspondencia semantica minima pregunta-objetivo-hipotesis",
      "validar ausencia de Markdown, citas visibles y duplicados",
    ],
    docx_table_contract: {
      orientation: "landscape",
      row_count_target: "3_to_5",
      required_columns: [
        "Codigo",
        "Interrogante especifica",
        "Objetivo especifico",
        "Hipotesis especifica",
        "Variable/categoria",
        "Metodo",
        "Tecnica/instrumento",
      ],
    },
  };
}

function buildGenericAllowedClaims(sectionKey: string) {
  if (["problem_statement", "justification"].includes(sectionKey)) {
    return [
      "la literatura revisada sugiere tendencias o problemas comparables",
      "el caso puede formularse como una oportunidad de investigacion aplicada",
    ];
  }

  if (["theoretical_framework", "research_antecedents", "state_of_the_art"].includes(sectionKey)) {
    return [
      "se pueden sintetizar antecedentes y marcos comparables",
      "se puede contrastar enfoques o criterios reportados en la literatura",
    ];
  }

  if (["methodology", "analysis_plan", "variables_or_categories", "evaluation_criteria"].includes(sectionKey)) {
    return [
      "se puede proponer un enfoque metodologico preliminar coherente con el alcance",
      "se pueden definir criterios, categorias o variables con soporte bibliografico suficiente",
    ];
  }

  return [
    "se puede redactar una version prudente y coherente con el soporte disponible",
  ];
}

function buildGenericClaimsToAvoid(sectionKey: string) {
  const generic = [
    "no afirmar cumplimiento normativo local sin soporte directo",
    "no afirmar viabilidad estructural o economica como hecho probado",
  ];

  if (["abstract", "keywords", "title_refined"].includes(sectionKey)) {
    return [
      "no inventar resultados ni hallazgos propios del estudio",
      ...generic,
    ];
  }

  return generic;
}

function buildClaimsAndLimitsGuidance(input: {
  generationPlan: ExtendedSectionGenerationPlanItem[];
  templateImportContext: MasterTemplateImportContextArtifact | null;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
}): ClaimsAndLimitsGuidanceItem[] {
  const globalUnsupportedClaims =
    input.templateImportContext?.imported_handoff_summary.unsupported_claims ?? [];
  const blockingFollowups =
    input.templateImportContext?.proposal_context.followup_requirements?.blocking ?? [];
  const gapDoNotClaim = input.consolidatedEvidence?.gap_resolution_plan?.do_not_claim ?? [];

  return input.generationPlan.map((section) => {
    const alignmentEntry = getAlignmentEntry(input.templateImportContext, section.section_key);
    const weakPacket = getImportedWeakSectionPacket(
      input.templateImportContext,
      section.section_key,
      alignmentEntry,
    );
    const allowedClaims = uniqueStrings([
      ...buildGenericAllowedClaims(section.section_key),
      ...(weakPacket?.inference_bridges ?? []).slice(0, 2),
    ]).slice(0, 4);
    const claimsToAvoid = uniqueStrings([
      ...buildGenericClaimsToAvoid(section.section_key),
      ...(weakPacket?.missing_evidence ?? []).map((item) => `no cerrar como hecho: ${item}`),
      ...globalUnsupportedClaims.slice(0, 2),
      ...gapDoNotClaim.slice(0, 2),
    ]).slice(0, 5);
    const claimsConditioned = uniqueStrings([
      section.needs_followup_before_strong_draft
        ? "formular conclusiones como posibilidad razonada o criterio preliminar"
        : null,
      input.templateImportContext?.checks.missing_local_context
        ? "cualquier traslado directo al caso local debe quedar condicionado a contraste contextual"
        : null,
      input.templateImportContext?.checks.missing_regulatory_context
        ? "los aspectos normativos deben presentarse como validacion pendiente"
        : null,
    ]).slice(0, 4);
    const validationNeeds = uniqueStrings([
      ...blockingFollowups.slice(0, 2),
      input.templateImportContext?.checks.missing_local_context
        ? "validacion contextual o local del caso"
        : null,
      input.templateImportContext?.checks.missing_regulatory_context
        ? "validacion normativa o regulatoria local"
        : null,
      input.templateImportContext?.checks.missing_technique_specific_support
        ? "validacion tecnica o metodologica adicional sobre el enfoque central"
        : null,
    ]).slice(0, 4);

    return {
      section_key: section.section_key,
      allowed_claims: allowedClaims,
      claims_to_avoid: claimsToAvoid,
      claims_conditioned: claimsConditioned,
      validation_needs: validationNeeds,
    };
  });
}

function buildMethodScopeGuidance(input: {
  generationPlan: ExtendedSectionGenerationPlanItem[];
  templateImportContext: MasterTemplateImportContextArtifact | null;
  researchFrameLight: ResearchFrameLight;
}): MethodScopeGuidanceItem[] {
  return input.generationPlan
    .filter(
      (section) =>
        section.wave === "support_integration" ||
        ["methodology", "analysis_plan", "variables_or_categories", "evaluation_criteria", "research_design"].includes(
          section.section_key,
        ),
    )
    .map((section) => {
      const dominantMethods = input.templateImportContext?.proposal_context.dominant_methods ?? [];
      const treatment =
        section.section_key === "variables_or_categories"
          ? "category_definition"
          : section.section_key === "analysis_plan"
            ? "comparative_support"
            : section.section_key === "evaluation_criteria"
              ? "criteria_definition"
              : input.researchFrameLight.study_question_type === "propositiva_aplicada"
                ? "pre_feasibility_framework"
                : "narrative_support";

      return {
        section_key: section.section_key,
        treatment,
        expected_elements: uniqueStrings([
          section.section_key === "methodology"
            ? "tipo de estudio, enfoque general y estrategia de analisis"
            : null,
          section.section_key === "analysis_plan"
            ? "pasos de analisis y comparacion aplicables al caso"
            : null,
          section.section_key === "variables_or_categories"
            ? "categorias, criterios o dimensiones observables"
            : null,
          section.section_key === "evaluation_criteria"
            ? "criterios de evaluacion preliminar y su fundamento"
            : null,
          "alcance metodologico compatible con un proyecto de maestria",
        ]).slice(0, 4),
        supporting_method_signals: dominantMethods.slice(0, 3),
        avoid: uniqueStrings([
          "no sobredisenar instrumentos o validaciones que no se ejecutaran en esta etapa",
          "no presentar la metodologia como demostracion empirica ya realizada",
          section.section_key === "variables_or_categories"
            ? "no hiperoperacionalizar indicadores sin soporte directo"
            : null,
        ]).slice(0, 4),
      };
    });
}

function buildFinalSectionsGuidance(
  academicEditorialPolicy: AcademicEditorialPolicy,
): FinalSectionsGuidance {
  return {
    late_section_keys: ["abstract", "keywords", "references", "title_refined"],
    abstract_rule:
      "El abstract debe sintetizar problema, objetivo, enfoque metodologico y alcance, sin inventar resultados.",
    keywords_rule: academicEditorialPolicy.keywords_rule,
    references_rule:
      "La bibliografia final debe construirse solo con referencias realmente usadas y trazables.",
    title_refinement_rule: academicEditorialPolicy.title_reformulation_rule,
    final_title_instruction: academicEditorialPolicy.final_title_instruction,
    short_header_title_instruction:
      academicEditorialPolicy.short_header_title_instruction,
    keywords_instruction: academicEditorialPolicy.keywords_instruction,
    redundancy_constraints: academicEditorialPolicy.redundancy_constraints,
    bullet_policy: academicEditorialPolicy.bullet_policy,
    length_budget_rule: academicEditorialPolicy.length_budget_rule,
    section_opening_rule: academicEditorialPolicy.section_opening_rule,
    objective_repetition_rule: academicEditorialPolicy.objective_repetition_rule,
    target_word_budget_by_section:
      academicEditorialPolicy.target_word_budget_by_section,
    master_target_pages: academicEditorialPolicy.master_target_pages,
    institutional_target_pages: academicEditorialPolicy.institutional_target_pages,
  };
}

function buildRequiredStructure(section: ExtendedSectionGenerationPlanItem) {
  return uniqueStrings([
    section.content_kind === "table" || section.generation_strategy === "llm_structured"
      ? "estructura visible por criterios, categorias o bloques comparables"
      : null,
    section.wave === "foundation"
      ? "apertura clara, delimitacion del foco y cierre prudente"
      : null,
    section.section_key === "methodology"
      ? "tipo de estudio, enfoque, tecnicas previstas y alcance"
      : null,
    section.section_key === "analysis_plan"
      ? "pasos de analisis y uso previsto de criterios o categorias"
      : null,
    section.section_key === "variables_or_categories"
      ? "categorias o variables con descripcion breve y uso analitico"
      : null,
  ]).slice(0, 4);
}

function buildSectionEvidenceHydrationPlan(input: {
  generationPlan: ExtendedSectionGenerationPlanItem[];
  templateImportContext: MasterTemplateImportContextArtifact | null;
  evidenceLedger: EvidenceLedger;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  claimsAndLimitsGuidance: ClaimsAndLimitsGuidanceItem[];
}): SectionEvidenceHydrationPlanItem[] {
  const evidenceUnits = input.consolidatedEvidence?.evidence_units ?? [];
  const sectionDossiers = input.consolidatedEvidence?.section_dossiers ?? [];
  const unitsById = new Map(evidenceUnits.map((unit) => [unit.evidence_id, unit]));
  const sourceHealthLookup = buildSourceHealthLookup(
    (input.templateImportContext?.source_priorities ?? []) as Array<Record<string, unknown>>,
  );
  const claimsBySection = new Map(
    input.claimsAndLimitsGuidance.map((item) => [item.section_key, item]),
  );
  const unitAllowedUse = (unit: ConsolidatedEvidenceUnit) =>
    sourceHealthLookup.get(unit.source_id)?.allowed_evidence_use ?? "direct_claim_support";
  const isContextOnlyUnit = (unit: ConsolidatedEvidenceUnit) =>
    unit.unit_type === "metadata_context" ||
    unit.unit_type === "intake_context" ||
    unit.citation_eligibility === "context_only" ||
    ["context_only", "gap_only", "do_not_use"].includes(unitAllowedUse(unit));
  const isSourceTextUnit = (unit: ConsolidatedEvidenceUnit) =>
    unit.unit_type === "original_excerpt" ||
    unit.citation_eligibility === "direct_quote" ||
    unit.citation_eligibility === "paraphrase_only";
  const directClaimSupportUnits = (units: ConsolidatedEvidenceUnit[]) =>
    units.filter(
      (unit) => isSourceTextUnit(unit) && !isContextOnlyUnit(unit) && unitAllowedUse(unit) === "direct_claim_support",
    );
  const cautiousSupportUnits = (units: ConsolidatedEvidenceUnit[]) =>
    units.filter(
      (unit) => isSourceTextUnit(unit) && !isContextOnlyUnit(unit) && unitAllowedUse(unit) === "cautious_support",
    );

  return input.generationPlan.map((section) => {
    const alignmentEntry = getAlignmentEntry(input.templateImportContext, section.section_key);
    const weakPacket = getImportedWeakSectionPacket(
      input.templateImportContext,
      section.section_key,
      alignmentEntry,
    );
    const mappedKeys = uniqueStrings([
      section.section_key,
      ...(alignmentEntry?.mapped_imported_section_keys ?? []),
    ]);
    const dossier =
      sectionDossiers.find((entry) => entry.section_key === section.section_key) ??
      mappedKeys
        .map((mappedKey) => sectionDossiers.find((entry) => entry.section_key === mappedKey))
        .find(Boolean) ??
      null;

    const relevantUnits = uniqueStrings([
      ...(dossier?.evidence_unit_ids ?? []),
      ...evidenceUnits
        .filter(
          (unit) =>
            unit.section_keys.some((sectionKey) => mappedKeys.includes(sectionKey)) ||
            section.source_ids.includes(unit.source_id),
        )
        .sort(
          (left, right) =>
            (right.relevance_score ?? 0) - (left.relevance_score ?? 0) ||
            right.confidence - left.confidence,
        )
        .map((unit) => unit.evidence_id),
    ])
      .map((evidenceId) => unitsById.get(evidenceId))
      .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit));

    const directUnits = directClaimSupportUnits(relevantUnits);
    const cautiousUnits = cautiousSupportUnits(relevantUnits);
    const contextUnits = relevantUnits.filter((unit) => isContextOnlyUnit(unit));
    const priorityOriginalExcerpts = directUnits.slice(0, 4);
    const priorityEvidence = uniqueStrings([
      ...directUnits.map((unit) => unit.evidence_id),
      ...cautiousUnits.map((unit) => unit.evidence_id),
      ...relevantUnits
        .filter((unit) => unit.citation_eligibility === "asset_reference")
        .map((unit) => unit.evidence_id),
      ...contextUnits.map((unit) => unit.evidence_id),
    ])
      .map((evidenceId) => unitsById.get(evidenceId))
      .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit))
      .slice(0, 8);
    const claimsGuidance = claimsBySection.get(section.section_key);

    return {
      section_key: section.section_key,
      wave: section.wave,
      priority_evidence_ids: priorityEvidence.map((unit) => unit.evidence_id),
      priority_original_excerpt_ids: priorityOriginalExcerpts.map((unit) => unit.evidence_id),
      priority_snippet_ids: section.snippet_ids.slice(0, 6),
      priority_source_ids: section.source_ids.slice(0, 5),
      critical_asset_keys: section.critical_asset_keys,
      useful_asset_keys: section.useful_asset_keys,
      claims_allowed: claimsGuidance?.allowed_claims ?? [],
      claims_to_avoid: uniqueStrings([
        ...(claimsGuidance?.claims_to_avoid ?? []),
        cautiousUnits.length > 0
          ? "No usar fuentes adyacentes como soporte directo de claims centrales sobre aisladores sismicos."
          : null,
        contextUnits.length > 0
          ? "No usar fuentes metadata/context-only como soporte de claims cuantitativos o normativos."
          : null,
      ]),
      key_gaps: uniqueStrings([
        ...(weakPacket?.missing_evidence ?? []).slice(0, 3),
        ...(dossier?.missing_evidence ?? []).slice(0, 3),
        directUnits.length === 0
          ? "La seccion no tiene evidencia directa source-text-backed; mantener redaccion cautelosa."
          : null,
      ]).slice(0, 4),
      required_structure: buildRequiredStructure(section),
      min_words: section.min_words,
      max_words: section.max_words,
      required_original_fragments: priorityOriginalExcerpts
        .map((unit) => clipText(unit.original_text ?? unit.summary_es ?? "", 260))
        .filter((text): text is string => Boolean(text))
        .slice(0, 3),
      chunk_rehydration_hints: priorityOriginalExcerpts
        .map((unit) =>
          uniqueStrings([
            unit.source_title ? `fuente: ${unit.source_title}` : null,
            unit.page_start ? `paginas: ${unit.page_start}${unit.page_end && unit.page_end !== unit.page_start ? `-${unit.page_end}` : ""}` : null,
            unit.char_start !== null && unit.char_end !== null
              ? `rango_chars: ${unit.char_start}-${unit.char_end}`
              : null,
          ]).join(" | "),
        )
        .filter(Boolean)
        .slice(0, 3),
    };
  });
}

function resolveWaveOrder(
  wave: GenerationWaveKey,
  index: number,
  generationPriority: "early" | "middle" | "late" = "middle",
) {
  const base =
    wave === "intake_refinement"
      ? 50
      : wave === "foundation"
      ? 100
      : wave === "development"
        ? 200
        : wave === "support_integration"
          ? 300
          : wave === "refinement_and_final"
            ? 400
            : 500;
  const offset =
    generationPriority === "early" ? 0 : generationPriority === "middle" ? 20 : 40;

  return base + offset + index;
}

function resolveWaveLabel(wave: GenerationWaveKey) {
  switch (wave) {
    case "intake_refinement":
      return "Intake refinement";
    case "foundation":
      return "Foundation";
    case "development":
      return "Development";
    case "support_integration":
      return "Support integration";
    case "refinement_and_final":
      return "Refinement and final";
    case "citation_and_references":
      return "Citation and references";
  }
}

function resolveWaveGoal(wave: GenerationWaveKey) {
  switch (wave) {
    case "intake_refinement":
      return "Normalizar el intake, fijar lenguaje en espanol y aclarar alcance, metodo y terminos ambiguos.";
    case "foundation":
      return "Fijar el nucleo conceptual del documento con problema, preguntas, objetivos y justificacion.";
    case "development":
      return "Desarrollar marco teorico, metodologia y secciones dependientes a partir del nucleo ya estabilizado.";
    case "support_integration":
      return "Integrar unicamente assets criticos y soporte estructurado donde realmente fortalecen la seccion.";
    case "refinement_and_final":
      return "Corregir calidad, refinar el titulo y cerrar secciones de sintesis final.";
    case "citation_and_references":
      return "Insertar citas de forma prudente, consolidar referencias usadas y preparar la bibliografia final.";
  }
}

function getAlignmentEntry(
  templateImportContext: MasterTemplateImportContextArtifact | null | undefined,
  sectionKey: string,
) {
  return (
    templateImportContext?.section_alignment_map.find(
      (entry) => entry.section_key === sectionKey,
    ) ?? null
  );
}

function getImportedSectionPacket(
  templateImportContext: MasterTemplateImportContextArtifact | null | undefined,
  sectionKey: string,
  alignmentEntry: TemplateImportSectionAlignmentEntry | null,
) {
  if (!templateImportContext) {
    return null;
  }

  return (
    templateImportContext.section_input_packets.find(
      (packet) => packet.section_key === sectionKey,
    ) ??
    (alignmentEntry?.mapped_imported_section_keys ?? [])
      .map((mappedKey) =>
        templateImportContext.section_input_packets.find(
          (packet) => packet.section_key === mappedKey,
        ),
      )
      .find(Boolean) ??
    null
  );
}

function getImportedWeakSectionPacket(
  templateImportContext: MasterTemplateImportContextArtifact | null | undefined,
  sectionKey: string,
  alignmentEntry: TemplateImportSectionAlignmentEntry | null,
) {
  if (!templateImportContext) {
    return null;
  }

  return (
    templateImportContext.weak_section_completion_packets.find(
      (packet) => packet.section_key === sectionKey,
    ) ??
    (alignmentEntry?.mapped_imported_section_keys ?? [])
      .map((mappedKey) =>
        templateImportContext.weak_section_completion_packets.find(
          (packet) => packet.section_key === mappedKey,
        ),
      )
      .find(Boolean) ??
    null
  );
}

function buildSourcePriorityMap(
  templateImportContext: MasterTemplateImportContextArtifact | null | undefined,
) {
  const scoreByPriority = {
    alta: 3,
    media: 2,
    baja: 1,
  } as const;

  return new Map(
    (templateImportContext?.source_priorities ?? []).map((item) => [
      item.source_id,
      scoreByPriority[item.priority] ?? 0,
    ]),
  );
}

function prioritizeSourceIds(sourceIds: string[], sourcePriorityMap: Map<string, number>) {
  return uniqueStrings(sourceIds).sort((left, right) => {
    const leftScore = sourcePriorityMap.get(left) ?? 0;
    const rightScore = sourcePriorityMap.get(right) ?? 0;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.localeCompare(right);
  });
}

function buildTemplateConstraintKeys(input: {
  masterTemplate: MasterTemplateRuntime;
  sectionKey: string;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
}) {
  return uniqueStrings([
    input.masterTemplate.required_section_keys.includes(input.sectionKey)
      ? "template_required_section"
      : null,
    input.masterTemplate.methodology_mode &&
    input.alignmentEntry?.method_relevance !== "low"
      ? "template_methodology_mode"
      : null,
    input.masterTemplate.guidance_notes.length > 0 ? "template_guidance_notes" : null,
  ]);
}

function resolveWave(
  sectionKey: string,
  alignmentEntry: TemplateImportSectionAlignmentEntry | null,
  phase: SectionGenerationPhase,
): GenerationWaveKey {
  if (sectionKey === "references") {
    return "citation_and_references";
  }

  if (sectionKey === "abstract" || sectionKey === "keywords" || sectionKey === "annexes") {
    return "refinement_and_final";
  }

  if (
    [
      "problem_statement",
      "research_questions",
      "general_objective",
      "specific_objectives",
      "justification",
    ].includes(sectionKey)
  ) {
    return "foundation";
  }

  if (
    [
      "methodology",
      "methodological_approach",
      "research_design",
      "data_collection_techniques",
      "research_instruments",
      "research_procedure",
      "analysis_plan",
      "variables_or_categories",
      "variables_indicators",
      "categories_subcategories",
    ].includes(sectionKey)
  ) {
    return "support_integration";
  }

  if (
    [
      "scope_and_limitations",
      "ethics",
      "schedule",
      "budget",
      "hypotheses",
      "general_hypothesis",
      "specific_hypotheses",
    ].includes(sectionKey)
  ) {
    return "refinement_and_final";
  }

  switch (alignmentEntry?.generation_role) {
    case "context":
      return "foundation";
    case "support":
      return "development";
    case "method":
      return "support_integration";
    case "closure":
      return "refinement_and_final";
    case "final":
      return "citation_and_references";
    default:
      if (alignmentEntry?.generation_priority === "early") {
        return "foundation";
      }

      if (alignmentEntry?.generation_priority === "late") {
        return phase === "references"
          ? "citation_and_references"
          : "refinement_and_final";
      }

      return phase === "logic"
        ? "foundation"
        : phase === "body"
          ? "development"
        : phase === "references"
            ? "citation_and_references"
            : "refinement_and_final";
  }
}

function resolveGenerationStrategy(input: {
  sectionKey: string;
  contentKind: string;
  wave: GenerationWaveKey;
  readiness: ReadinessLevel;
}) {
  if (input.readiness === "blocked") {
    return "blocked" as const;
  }

  if (input.wave === "citation_and_references") {
    return "llm_final" as const;
  }

  if (input.wave === "refinement_and_final") {
    return "llm_final" as const;
  }

  if (
    input.sectionKey === "variables_or_categories" ||
    input.sectionKey === "variables_indicators" ||
    input.sectionKey === "categories_subcategories" ||
    input.contentKind === "table"
  ) {
    return "llm_structured" as const;
  }

  return "llm_text" as const;
}

function resolvePromptMode(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  generationStrategy: GenerationStrategy;
}) {
  if (input.wave === "intake_refinement") {
    return "intake_refinement" as const;
  }

  if (input.wave === "foundation") {
    return "base_generation" as const;
  }

  if (input.wave === "development") {
    return "adaptive_generation" as const;
  }

  if (input.wave === "support_integration") {
    return "asset_integration" as const;
  }

  if (input.wave === "citation_and_references") {
    return "citation_insertion" as const;
  }

  if (input.generationStrategy === "llm_final") {
    return "final_synthesis" as const;
  }

  return "adaptive_revision" as const;
}

function buildUpstreamContextKeys(input: {
  wave: GenerationWaveKey;
  dependsOnKeys: string[];
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
}) {
  const base =
    input.wave === "foundation"
      ? ["refined_intake_context"]
      : input.wave === "development"
        ? ["refined_intake_context", "foundation_context"]
        : input.wave === "support_integration"
          ? ["refined_intake_context", "foundation_context", "development_context"]
            : input.wave === "refinement_and_final"
              ? ["foundation_context", "development_context", "support_integration_context"]
            : ["development_context", "refined_title", "references_working_set"];

  return uniqueStrings([
    ...base,
    ...input.dependsOnKeys,
    input.alignmentEntry?.method_relevance !== "low"
      ? "proposal_method_candidate"
      : null,
    input.alignmentEntry?.framework_relevance !== "low"
      ? "proposal_framework_candidate"
      : null,
  ]);
}

function buildContextBlueprints(masterTemplate: MasterTemplateRuntime): ContextBlueprint[] {
  const foundationKeys = masterTemplate.sections
    .filter((section) =>
      [
        "problem_statement",
        "research_questions",
        "general_objective",
        "specific_objectives",
        "justification",
      ].includes(section.semantic_key),
    )
    .map((section) => section.semantic_key);
  const developmentKeys = masterTemplate.sections
    .filter((section) =>
      [
        "introduction",
        "theoretical_framework",
        "research_antecedents",
        "state_of_the_art",
        "theoretical_bases",
        "methodology",
        "analysis_plan",
        "variables_or_categories",
      ].includes(section.semantic_key),
    )
    .map((section) => section.semantic_key);

  return [
    {
      context_key: "foundation_context",
      produced_by_wave: "foundation",
      derived_from_section_keys: foundationKeys,
      description: "Resumen compacto del problema, preguntas, objetivos y delimitaciones estabilizadas.",
      shape: "decision_list",
    },
    {
      context_key: "development_context",
      produced_by_wave: "development",
      derived_from_section_keys: developmentKeys,
      description: "Resumen compacto del marco, metodo, categorias y criterios de analisis ya decididos.",
      shape: "method_profile",
    },
    {
      context_key: "support_integration_context",
      produced_by_wave: "support_integration",
      derived_from_section_keys: masterTemplate.sections
        .filter((section) =>
          ["methodology", "analysis_plan", "variables_or_categories"].includes(
            section.semantic_key,
          ),
        )
        .map((section) => section.semantic_key),
      description: "Registro de assets criticos y decisiones de integracion estructurada por seccion.",
      shape: "category_schema",
    },
    {
      context_key: "final_synthesis_inputs",
      produced_by_wave: "refinement_and_final",
      derived_from_section_keys: [
        "problem_statement",
        "general_objective",
        "methodology",
        "scope_and_limitations",
      ],
      description: "Insumos sinteticos para abstract, keywords y refinamiento del titulo.",
      shape: "final_synthesis_inputs",
    },
  ];
}

function buildAssetClassification(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  evidenceLedger: EvidenceLedger;
  assetKeys: string[];
}) {
  const assets = input.assetKeys
    .map((assetKey) => input.evidenceLedger.assets.find((asset) => asset.asset_key === assetKey))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

  if (assets.length === 0) {
    return {
      asset_policy: "ignore_assets" as AssetInclusionPolicy,
      critical_asset_keys: [] as string[],
      useful_asset_keys: [] as string[],
      optional_asset_keys: [] as string[],
    };
  }

  const critical: string[] = [];
  const useful: string[] = [];
  const optional: string[] = [];

  for (const asset of assets) {
    const isStructured = asset.kind === "table" || asset.kind === "equation";
    const isMethodSection =
      input.wave === "support_integration" ||
      ["methodology", "analysis_plan", "variables_or_categories"].includes(input.sectionKey);

    if (isMethodSection && isStructured) {
      critical.push(asset.asset_key);
      continue;
    }

    if (input.wave === "development" && isStructured) {
      useful.push(asset.asset_key);
      continue;
    }

    if (asset.kind === "image" && ["introduction", "theoretical_framework"].includes(input.sectionKey)) {
      useful.push(asset.asset_key);
      continue;
    }

    optional.push(asset.asset_key);
  }

  const assetPolicy: AssetInclusionPolicy =
    critical.length > 0
      ? "include_equations_and_tables"
      : useful.some((assetKey) =>
            assets.some((asset) => asset.asset_key === assetKey && asset.kind === "image"),
          )
        ? "include_visual_assets"
        : useful.length > 0
          ? "include_key_assets"
          : "ignore_assets";

  return {
    asset_policy: assetPolicy,
    critical_asset_keys: critical.slice(0, 3),
    useful_asset_keys: useful.slice(0, 4),
    optional_asset_keys: optional.slice(0, 4),
  };
}

function buildRetryPolicy(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  minWords: number | null;
  criticalAssetCount: number;
  weakPacket:
    | MasterTemplateImportContextArtifact["weak_section_completion_packets"][number]
    | null;
  isRequiredSection: boolean;
}) {
  const missingEvidence = input.weakPacket?.missing_evidence.length ?? 0;
  const inferableWithCare =
    input.weakPacket?.draftability_status === "inferable_with_care";
  const blockedByMissingEvidence =
    input.weakPacket?.draftability_status === "blocked_by_missing_evidence";
  const baseAttempts = input.wave === "foundation" ? 3 : 2;

  return {
    enabled: input.wave !== "citation_and_references",
    max_attempts: Math.min(
      baseAttempts + (input.isRequiredSection || inferableWithCare ? 1 : 0),
      4,
    ),
    retry_on: uniqueStrings([
      input.minWords && input.minWords > 0 ? "below_min_words" : null,
      input.wave === "support_integration" ? "missing_critical_assets" : null,
      ["problem_statement", "justification", "methodology", "theoretical_framework"].includes(
        input.sectionKey,
      )
        ? "low_specificity"
        : null,
      input.criticalAssetCount > 0 ? "missing_required_structure" : null,
      missingEvidence > 0 || inferableWithCare ? "overclaiming" : null,
      blockedByMissingEvidence ? "low_specificity" : null,
      "weak_alignment",
    ]) as SectionRetryPolicy["retry_on"],
  } satisfies SectionRetryPolicy;
}

function buildRevisionGoals(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  criticalAssetCount: number;
  needsFollowup: boolean;
}) {
  const goals = uniqueStrings([
    ["problem_statement", "justification", "theoretical_framework"].includes(input.sectionKey)
      ? "increase_specificity"
      : null,
    ["methodology", "analysis_plan", "variables_or_categories"].includes(input.sectionKey)
      ? "increase_coherence"
      : null,
    input.criticalAssetCount > 0 ? "integrate_assets" : null,
    input.needsFollowup ? "reduce_overclaiming" : null,
    input.wave === "refinement_and_final" ? "improve_citation_discipline" : null,
  ]) as RevisionGoal[];

  return goals.length > 0 ? goals : (["increase_coherence"] as RevisionGoal[]);
}

function buildCitationPolicyForSection(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
}) {
  if (input.sectionKey === "references") {
    return {
      expected_density: "none" as const,
      citation_mode: "references_only" as const,
    };
  }

  if (["general_objective", "specific_objectives", "research_questions", "keywords"].includes(input.sectionKey)) {
    return {
      expected_density: "low" as const,
      citation_mode: "deferred_to_docx" as const,
    };
  }

  if (
    ["theoretical_framework", "research_antecedents", "state_of_the_art", "theoretical_bases"].includes(
      input.sectionKey,
    )
  ) {
    return {
      expected_density: "high" as const,
      citation_mode: "deferred_to_docx" as const,
    };
  }

  if (input.wave === "citation_and_references") {
    return {
      expected_density: "medium" as const,
      citation_mode: "deferred_to_docx" as const,
    };
  }

  return {
    expected_density: "medium" as const,
    citation_mode: "deferred_to_docx" as const,
  };
}

function buildRequiredContextKeys(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  masterTemplate: MasterTemplateRuntime;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
  sectionPacketExists: boolean;
  weakPacketExists: boolean;
}) {
  return uniqueStrings([
    "template_import_context",
    "evidence_ledger",
    "research_frame_light",
    "claims_and_limits_guidance",
    "section_evidence_hydration_plan",
    ...(input.wave === "intake_refinement" ? ["saved_intake"] : []),
    ...(input.wave === "foundation" ? ["refined_intake_context"] : []),
    ...(input.wave === "development"
      ? ["refined_intake_context", "foundation_context"]
      : []),
    ...(input.wave === "support_integration"
      ? ["refined_intake_context", "foundation_context", "development_context"]
      : []),
    ...(input.wave === "refinement_and_final"
      ? ["foundation_context", "development_context", "support_integration_context"]
      : []),
    ...(input.wave === "citation_and_references"
      ? ["final_synthesis_inputs", "references_working_set"]
      : []),
    ...(input.wave === "support_integration" ? ["method_scope_guidance"] : []),
    ...(input.wave === "refinement_and_final" || input.wave === "citation_and_references"
      ? ["final_sections_guidance"]
      : []),
    ...buildTemplateConstraintKeys({
      masterTemplate: input.masterTemplate,
      sectionKey: input.sectionKey,
      alignmentEntry: input.alignmentEntry,
    }),
    ...(input.sectionPacketExists ? ["section_input_packet"] : []),
    ...(input.weakPacketExists ? ["weak_section_completion_packet"] : []),
    ...(input.alignmentEntry?.needs_followup_before_strong_draft
      ? ["followup_requirements"]
      : []),
  ]);
}

function buildDefaultSupportStrategy(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
  strategy: GenerationStrategy;
  sectionPacket:
    | MasterTemplateImportContextArtifact["section_input_packets"][number]
    | null;
  weakPacket:
    | MasterTemplateImportContextArtifact["weak_section_completion_packets"][number]
    | null;
  templateImportContext: MasterTemplateImportContextArtifact | null;
}) {
  const anchors: string[] = [];

  if (input.sectionPacket?.summary) {
    anchors.push(`apoyarse en el packet de seccion: ${clipText(input.sectionPacket.summary, 120)}`);
  }

  if (input.strategy === "llm_structured") {
    anchors.push("mantener estructura, criterios y trazabilidad por bloque");
  }

  if (input.alignmentEntry?.framework_relevance === "high") {
    const framework = input.templateImportContext?.proposal_context.dominant_frameworks[0];
    anchors.push(
      framework
        ? `dar prioridad al marco dominante "${framework}"`
        : "dar prioridad al marco teorico dominante",
    );
  }

  if (input.alignmentEntry?.method_relevance === "high") {
    const method = input.templateImportContext?.proposal_context.dominant_methods[0];
    anchors.push(
      method
        ? `mantener coherencia con el metodo dominante "${method}"`
        : "mantener coherencia metodologica fuerte",
    );
  }

  if (input.alignmentEntry?.needs_followup_before_strong_draft) {
    anchors.push("declarar vacios y no sobreafirmar");
  }

  if (input.weakPacket?.missing_evidence.length) {
    anchors.push(
      `dejar visible la falta de evidencia en ${input.weakPacket.missing_evidence
        .slice(0, 2)
        .join(" y ")}`,
    );
  }

  if (input.strategy === "llm_final" || input.strategy === "llm_revision") {
    anchors.unshift("derivar desde secciones ya consolidadas");
  }

  if (anchors.length > 0) {
    return anchors.join("; ");
  }

  if (input.alignmentEntry?.readiness === "alta") {
    return "priorizar snippets y fuentes recomendadas del estado importado";
  }

  return "priorizar intake y soporte compatible con gaps explicitos";
}

function buildRelatedHintKeys(sectionKey: string, dependsOnKeys: string[]) {
  const defaults =
    sectionKey === "general_objective"
      ? ["problem_statement", "justification"]
      : sectionKey === "specific_objectives"
        ? ["problem_statement", "justification", "analysis_plan", "methodology"]
        : sectionKey === "research_questions"
          ? ["general_objective", "specific_objectives", "analysis_plan", "methodology"]
          : sectionKey === "methodology"
            ? ["methodological_approach", "research_design", "analysis_plan"]
            : sectionKey === "consistency_matrix"
              ? [
                  "problem_statement",
                  "research_questions",
                  "general_objective",
                  "specific_objectives",
                  "methodology",
                  "variables_or_categories",
                ]
              : sectionKey === "variables_or_categories"
                ? ["methodology", "analysis_plan", "research_design"]
                : [];

  return uniqueStrings([sectionKey, ...dependsOnKeys, ...defaults]);
}

function selectCandidateSnippetIds(input: {
  sectionKey: string;
  dependsOnKeys: string[];
  evidenceLedger: EvidenceLedger;
  baselineSnippetIds: string[];
  sectionPacketSnippetIds: string[];
  preferredSourceIds?: string[];
  sourcePriorityMap: Map<string, number>;
}) {
  const relatedHintKeys = buildRelatedHintKeys(input.sectionKey, input.dependsOnKeys);
  const hintedSnippetIds = input.evidenceLedger.snippets
    .filter((snippet) =>
      relatedHintKeys.some((sectionKey) => snippet.section_hint_keys.includes(sectionKey)),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 10)
    .map((snippet) => snippet.snippet_id);
  const sourceSnippetIds = input.evidenceLedger.snippets
    .filter((snippet) => snippet.source_id && (input.preferredSourceIds ?? []).includes(snippet.source_id))
    .sort((left, right) => {
      const leftScore = left.source_id
        ? (input.sourcePriorityMap.get(left.source_id) ?? 0)
        : 0;
      const rightScore = right.source_id
        ? (input.sourcePriorityMap.get(right.source_id) ?? 0)
        : 0;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return right.confidence - left.confidence;
    })
    .slice(0, 10)
    .map((snippet) => snippet.snippet_id);

  return uniqueStrings([
    ...input.sectionPacketSnippetIds,
    ...input.baselineSnippetIds,
    ...sourceSnippetIds,
    ...hintedSnippetIds,
  ]).slice(0, 12);
}

function selectCandidateAssumptionIds(input: {
  sectionKey: string;
  dependsOnKeys: string[];
  assumptions: AssumptionInput[];
  baselineAssumptionIds: string[];
}) {
  const relatedHintKeys = buildRelatedHintKeys(input.sectionKey, input.dependsOnKeys);
  const assumptionIds = input.assumptions
    .filter((assumption) =>
      assumption.section_keys.some((sectionKey) => relatedHintKeys.includes(sectionKey)),
    )
    .map((assumption) => assumption.assumption_id);

  return uniqueStrings([...input.baselineAssumptionIds, ...assumptionIds]).slice(0, 8);
}

function buildCurrentAssetKeys(input: {
  evidenceLedger: EvidenceLedger;
  preferredSourceIds: string[];
  sectionPacketAssetKeys: string[];
  importedAssetKeys: string[];
  sourcePriorityMap: Map<string, number>;
}) {
  const currentAssetKeys = input.evidenceLedger.assets
    .filter((asset) => input.preferredSourceIds.includes(asset.source_id))
    .sort((left, right) => {
      const leftStructured = left.kind === "table" || left.kind === "equation" ? 1 : 0;
      const rightStructured = right.kind === "table" || right.kind === "equation" ? 1 : 0;

      if (rightStructured !== leftStructured) {
        return rightStructured - leftStructured;
      }

      const leftScore = input.sourcePriorityMap.get(left.source_id) ?? 0;
      const rightScore = input.sourcePriorityMap.get(right.source_id) ?? 0;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return left.asset_key.localeCompare(right.asset_key);
    })
    .map((asset) => asset.asset_key);

  return uniqueStrings([
    ...input.sectionPacketAssetKeys,
    ...input.importedAssetKeys,
    ...currentAssetKeys,
  ]).slice(0, 10);
}

function buildPromptPlanningSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      global_observations: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
      },
      section_refinements: {
        type: "array",
        maxItems: CRITICAL_SECTION_KEYS.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section_key: {
              type: "string",
              enum: [...CRITICAL_SECTION_KEYS],
            },
            recommended_phase: {
              type: ["string", "null"],
              enum: [...VALID_PHASES, null],
            },
            recommended_depends_on_keys: {
              type: "array",
              items: { type: "string" },
              maxItems: 6,
            },
            recommended_evidence_snippet_ids: {
              type: "array",
              items: { type: "string" },
              maxItems: 8,
            },
            recommended_assumption_ids: {
              type: "array",
              items: { type: "string" },
              maxItems: 5,
            },
            support_strategy: {
              type: ["string", "null"],
            },
            extra_instructions: {
              type: "array",
              items: { type: "string" },
              maxItems: 4,
            },
            rationale: {
              type: "string",
            },
          },
          required: [
            "section_key",
            "recommended_phase",
            "recommended_depends_on_keys",
            "recommended_evidence_snippet_ids",
            "recommended_assumption_ids",
            "support_strategy",
            "extra_instructions",
            "rationale",
          ],
        },
      },
    },
    required: ["global_observations", "section_refinements"],
  } satisfies Record<string, unknown>;
}

function buildRefinedIntakeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      refined_topic_es: { type: "string" },
      normalized_problem_es: { type: "string" },
      normalized_research_line_es: { type: ["string", "null"] },
      normalized_methodology_es: { type: ["string", "null"] },
      normalized_population_es: { type: ["string", "null"] },
      normalized_constraints_es: { type: ["string", "null"] },
      accepted_foreign_terms: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            term: { type: "string" },
            rationale: { type: "string" },
            preferred_spanish_gloss: { type: ["string", "null"] },
          },
          required: ["term", "rationale", "preferred_spanish_gloss"],
        },
      },
      key_decisions: {
        type: "array",
        maxItems: 8,
        items: { type: "string" },
      },
      ambiguity_warnings: {
        type: "array",
        maxItems: 6,
        items: { type: "string" },
      },
    },
    required: [
      "refined_topic_es",
      "normalized_problem_es",
      "normalized_research_line_es",
      "normalized_methodology_es",
      "normalized_population_es",
      "normalized_constraints_es",
      "accepted_foreign_terms",
      "key_decisions",
      "ambiguity_warnings",
    ],
  } satisfies Record<string, unknown>;
}

function buildDeterministicRefinedIntakeContext(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
}): RefinedIntakeContext {
  const topic = input.project.intake.topic.trim();
  const acceptedTerms = uniqueStrings([
    input.project.intake.preferredMethodology?.includes("framework") ? "framework" : null,
  ]).map((term) => ({
    term,
    rationale: "Termino tecnico conservado por uso disciplinar frecuente en el corpus importado.",
    preferred_spanish_gloss:
      term === "framework"
        ? "marco de evaluacion"
        : null,
  }));

  return {
    refined_topic_es: topic,
    normalized_problem_es:
      input.project.intake.problemContext?.trim() ||
      input.templateImportContext?.imported_project_context.problem_context ||
      topic,
    normalized_research_line_es:
      input.project.intake.researchLine?.trim() ||
      input.templateImportContext?.imported_project_context.research_line ||
      null,
    normalized_methodology_es:
      input.project.intake.preferredMethodology?.trim() ||
      input.templateImportContext?.imported_project_context.preferred_methodology ||
      null,
    normalized_population_es:
      input.project.intake.targetPopulation?.trim() ||
      input.templateImportContext?.imported_project_context.target_population ||
      null,
    normalized_constraints_es:
      input.project.intake.academicConstraints?.trim() ||
      input.templateImportContext?.imported_project_context.academic_constraints ||
      null,
    accepted_foreign_terms: acceptedTerms,
    key_decisions: uniqueStrings([
      input.project.intake.preferredMethodology
        ? `Se preserva como ancla metodologica: ${input.project.intake.preferredMethodology}`
        : null,
      input.templateImportContext?.proposal_context.method_candidate?.method_family
        ? `Metodo candidato importado: ${input.templateImportContext.proposal_context.method_candidate.method_family}`
        : null,
      input.templateImportContext?.proposal_context.framework_candidate?.core_framework
        ? `Framework candidato importado: ${input.templateImportContext.proposal_context.framework_candidate.core_framework}`
        : null,
    ]).slice(0, 6),
    ambiguity_warnings: uniqueStrings([
      topic.match(/[A-Za-z]{4,} [A-Za-z-]{4,}/)
        ? "El intake conserva terminos en ingles que deben revisarse y glosarse en espanol si se usan en el documento."
        : null,
      input.templateImportContext?.proposal_context.evidence_gaps?.[0] ?? null,
    ]).slice(0, 4),
  };
}

function buildIntakeRefinementPrompt(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
}) {
  return [
    "Eres un normalizador academico especializado en formular proyectos de investigacion en espanol.",
    "Debes afinar el intake del proyecto en espanol academico, preservando solo terminos tecnicos en ingles cuando sean realmente aceptados por la disciplina.",
    "",
    "Reglas obligatorias:",
    "- responde solo con el objeto estructurado pedido",
    "- no inventes datos",
    "- no inventes restricciones inexistentes",
    "- conserva el significado del intake original",
    "- si mantienes un termino en ingles, explica brevemente por que se conserva y da glosa preferida en espanol si aplica",
    "",
    "Intake original:",
    `- topic: ${input.project.intake.topic}`,
    `- problem_context: ${input.project.intake.problemContext ?? "NO_DISPONIBLE"}`,
    `- research_line: ${input.project.intake.researchLine ?? "NO_DISPONIBLE"}`,
    `- preferred_methodology: ${input.project.intake.preferredMethodology ?? "NO_DISPONIBLE"}`,
    `- target_population: ${input.project.intake.targetPopulation ?? "NO_DISPONIBLE"}`,
    `- available_data: ${input.project.intake.availableData ?? "NO_DISPONIBLE"}`,
    `- academic_constraints: ${input.project.intake.academicConstraints ?? "NO_DISPONIBLE"}`,
    `- advisor_notes: ${input.project.intake.advisorNotes ?? "NO_DISPONIBLE"}`,
    "",
    "Contexto importado util:",
    buildSlimImportedContext(input.templateImportContext),
  ].join("\n");
}

function buildSlimProjectContext(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext?: RefinedIntakeContext | null;
}) {
  return uniqueStrings([
    `- area: ${input.templateImportContext?.imported_project_context.knowledge_area_label ?? "NO_DISPONIBLE"}`,
    `- tema: ${input.refinedIntakeContext?.refined_topic_es ?? input.project.intake.topic}`,
    input.refinedIntakeContext?.normalized_problem_es || input.project.intake.problemContext
      ? `- problema: ${input.refinedIntakeContext?.normalized_problem_es ?? input.project.intake.problemContext}`
      : null,
    input.refinedIntakeContext?.normalized_research_line_es || input.project.intake.researchLine
      ? `- linea de investigacion: ${input.refinedIntakeContext?.normalized_research_line_es ?? input.project.intake.researchLine}`
      : null,
    input.refinedIntakeContext?.normalized_methodology_es || input.project.intake.preferredMethodology
      ? `- metodologia preferida: ${input.refinedIntakeContext?.normalized_methodology_es ?? input.project.intake.preferredMethodology}`
      : null,
    input.project.intake.availableData
      ? `- datos disponibles: ${input.project.intake.availableData}`
      : null,
    input.refinedIntakeContext?.normalized_population_es || input.project.intake.targetPopulation
      ? `- poblacion o unidades de analisis: ${input.refinedIntakeContext?.normalized_population_es ?? input.project.intake.targetPopulation}`
      : null,
    input.refinedIntakeContext?.normalized_constraints_es || input.project.intake.academicConstraints
      ? `- restricciones academicas: ${input.refinedIntakeContext?.normalized_constraints_es ?? input.project.intake.academicConstraints}`
      : null,
    input.project.intake.advisorNotes
      ? `- notas del asesor: ${input.project.intake.advisorNotes}`
      : null,
  ]).join("\n");
}

function buildPromptProjectContext(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext?: RefinedIntakeContext | null;
}) {
  return uniqueStrings([
    `- area: ${input.templateImportContext?.imported_project_context.knowledge_area_label ?? "NO_DISPONIBLE"}`,
    `- tema: ${clipText(
      input.refinedIntakeContext?.refined_topic_es ?? input.project.intake.topic,
      180,
    )}`,
    input.refinedIntakeContext?.normalized_problem_es || input.project.intake.problemContext
      ? `- problema: ${clipText(
          input.refinedIntakeContext?.normalized_problem_es ??
            input.project.intake.problemContext ??
            "",
          260,
        )}`
      : null,
    input.refinedIntakeContext?.normalized_methodology_es || input.project.intake.preferredMethodology
      ? `- metodologia preferida: ${clipText(
          input.refinedIntakeContext?.normalized_methodology_es ??
            input.project.intake.preferredMethodology ??
            "",
          220,
        )}`
      : null,
    input.refinedIntakeContext?.normalized_population_es || input.project.intake.targetPopulation
      ? `- unidad o caso: ${clipText(
          input.refinedIntakeContext?.normalized_population_es ??
            input.project.intake.targetPopulation ??
            "",
          180,
        )}`
      : null,
    input.refinedIntakeContext?.normalized_constraints_es || input.project.intake.academicConstraints
      ? `- restriccion principal: ${clipText(
          input.refinedIntakeContext?.normalized_constraints_es ??
            input.project.intake.academicConstraints ??
            "",
          180,
        )}`
      : null,
  ]).join("\n");
}

function buildSlimImportedContext(
  templateImportContext: MasterTemplateImportContextArtifact | null,
) {
  if (!templateImportContext) {
    return "NO_DISPONIBLE";
  }

  return uniqueStrings([
    templateImportContext.proposal_context.method_candidate?.method_family
      ? `- metodo candidato: ${templateImportContext.proposal_context.method_candidate.method_family}`
      : null,
    templateImportContext.proposal_context.framework_candidate?.core_framework
      ? `- framework candidato: ${templateImportContext.proposal_context.framework_candidate.core_framework}`
      : null,
    templateImportContext.proposal_context.dominant_methods.length > 0
      ? `- metodos dominantes: ${templateImportContext.proposal_context.dominant_methods
          .slice(0, 3)
          .join(" | ")}`
      : null,
    templateImportContext.proposal_context.dominant_frameworks.length > 0
      ? `- frameworks dominantes: ${templateImportContext.proposal_context.dominant_frameworks
          .slice(0, 3)
          .join(" | ")}`
      : null,
    templateImportContext.proposal_context.key_findings.length > 0
      ? `- hallazgos clave del corpus: ${templateImportContext.proposal_context.key_findings
          .slice(0, 3)
          .join(" | ")}`
      : null,
    (templateImportContext.proposal_context.evidence_gaps ?? []).length > 0
      ? `- gaps clave: ${templateImportContext.proposal_context.evidence_gaps.slice(0, 4).join(" | ")}`
      : null,
    (templateImportContext.proposal_context.followup_requirements?.blocking ?? []).length > 0
      ? `- followups bloqueantes: ${templateImportContext.proposal_context.followup_requirements?.blocking
          .slice(0, 4)
          .join(" | ")}`
      : null,
  ]).join("\n");
}

function buildPromptImportedContext(
  templateImportContext: MasterTemplateImportContextArtifact | null,
) {
  if (!templateImportContext) {
    return "NO_DISPONIBLE";
  }

  return uniqueStrings([
    templateImportContext.proposal_context.method_candidate?.method_family
      ? `- metodo candidato: ${clipText(
          templateImportContext.proposal_context.method_candidate.method_family,
          120,
        )}`
      : null,
    templateImportContext.proposal_context.framework_candidate?.core_framework
      ? `- framework candidato: ${clipText(
          templateImportContext.proposal_context.framework_candidate.core_framework,
          140,
        )}`
      : null,
    templateImportContext.proposal_context.dominant_methods.length > 0
      ? `- metodos dominantes: ${templateImportContext.proposal_context.dominant_methods
          .slice(0, 2)
          .map((item) => clipText(item, 120) ?? item)
          .join(" | ")}`
      : null,
    templateImportContext.proposal_context.dominant_frameworks.length > 0
      ? `- frameworks dominantes: ${templateImportContext.proposal_context.dominant_frameworks
          .slice(0, 2)
          .map((item) => clipText(item, 120) ?? item)
          .join(" | ")}`
      : null,
    templateImportContext.proposal_context.evidence_gaps.length > 0
      ? `- gaps clave: ${templateImportContext.proposal_context.evidence_gaps
          .slice(0, 2)
          .map((item) => clipText(item, 140) ?? item)
          .join(" | ")}`
      : null,
  ]).join("\n");
}

function buildTemplateConstraintLines(input: {
  masterTemplate: MasterTemplateRuntime;
  sectionKey: string;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
}) {
  return uniqueStrings([
    input.masterTemplate.methodology_mode &&
    input.alignmentEntry?.method_relevance !== "low"
      ? `- modo metodologico del template: ${input.masterTemplate.methodology_mode}`
      : null,
    input.masterTemplate.required_section_keys.includes(input.sectionKey)
      ? "- esta seccion es obligatoria en el template y no debe quedar debil"
      : null,
    ...input.masterTemplate.guidance_notes
      .slice(0, 2)
      .map((note) => `- guidance global del template: ${clipText(note, 120) ?? note}`),
  ]).join("\n");
}

function buildSectionImportedContextLines(input: {
  section:
    | ExtendedSectionGenerationPlanItem
    | { section_key: string; imported_source_ids?: string[]; imported_asset_keys?: string[] };
  templateImportContext: MasterTemplateImportContextArtifact | null;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
}) {
  const sectionPacket = getImportedSectionPacket(
    input.templateImportContext,
    input.section.section_key,
    input.alignmentEntry,
  );
  const weakPacket = getImportedWeakSectionPacket(
    input.templateImportContext,
    input.section.section_key,
    input.alignmentEntry,
  );
  const sourcePriorities = input.templateImportContext?.source_priorities.filter((item) =>
    (input.section.imported_source_ids ?? []).includes(item.source_id),
  );

  return uniqueStrings([
    sectionPacket?.summary
      ? `- resumen del packet importado: ${clipText(sectionPacket.summary, 160) ?? sectionPacket.summary}`
      : null,
    sectionPacket?.key_points.length
      ? `- puntos respaldados a priorizar: ${sectionPacket.key_points
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    sectionPacket?.open_questions.length
      ? `- preguntas abiertas a no cerrar sin evidencia: ${sectionPacket.open_questions
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    weakPacket?.evidence_backed_points.length
      ? `- puntos con soporte fuerte: ${weakPacket.evidence_backed_points
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    weakPacket?.inference_bridges.length
      ? `- puentes inferenciales permitidos con prudencia: ${weakPacket.inference_bridges
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    weakPacket?.assumptions_needed.length
      ? `- assumptions que podrian ser necesarias: ${weakPacket.assumptions_needed
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    weakPacket?.missing_evidence.length
      ? `- evidencia faltante a declarar si persiste: ${weakPacket.missing_evidence
          .slice(0, 2)
          .map((item) => clipText(item, 100) ?? item)
          .join(" | ")}`
      : null,
    sourcePriorities && sourcePriorities.length > 0
      ? `- fuentes priorizadas por consolidado: ${sourcePriorities
          .slice(0, 2)
          .map((item) => `${item.title} (${item.priority})`)
          .join(" | ")}`
      : null,
    input.alignmentEntry?.notes.length
      ? `- notas de alineacion: ${input.alignmentEntry.notes
          .slice(0, 2)
          .map((item) => clipText(item, 120) ?? item)
          .join(" | ")}`
      : null,
  ]).join("\n");
}

function buildPromptPriorityBlock(title: string, lines: Array<string | null | undefined>) {
  const compactLines = uniqueStrings(lines).slice(0, 5);

  return compactLines.length > 0 ? [title, ...compactLines].join("\n") : `${title}\nNO_DISPONIBLE`;
}

function buildCompactEvidenceLines(input: {
  manifestItem: Omit<SectionPromptManifestItem, "prompt">;
  evidenceLedger: EvidenceLedger;
}) {
  return input.manifestItem.evidence_snippet_ids
    .map((snippetId) =>
      input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
    )
    .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet))
    .slice(0, 3)
    .map((snippet, index) =>
      [
        `Evidencia ${index + 1}:`,
        `origen: ${snippet.origin}`,
        `label: ${snippet.label}`,
        `texto: ${clipText(snippet.text, 320) ?? snippet.text}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildCompactAssetLines(input: {
  evidenceLedger: EvidenceLedger;
  criticalAssetKeys: string[];
  usefulAssetKeys: string[];
}) {
  const prioritizedAssetKeys = uniqueStrings([
    ...input.criticalAssetKeys,
    ...input.usefulAssetKeys,
  ]);

  return prioritizedAssetKeys
    .map((assetKey) => input.evidenceLedger.assets.find((asset) => asset.asset_key === assetKey))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    .slice(0, 2)
    .map((asset, index) =>
      [
        `Asset ${index + 1}:`,
        `kind: ${asset.kind}`,
        `title: ${asset.title}`,
        `caption: ${asset.caption ?? "NO_DISPONIBLE"}`,
        `page_number: ${asset.page_number ?? "NO_DISPONIBLE"}`,
        `text_content: ${clipText(asset.text_content ?? "", 180) || "NO_DISPONIBLE"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildSectionInstructions(input: {
  section: MasterTemplateRuntime["sections"][number];
  masterTemplate: MasterTemplateRuntime;
  alignmentEntry: TemplateImportSectionAlignmentEntry | null;
  sectionPacket:
    | MasterTemplateImportContextArtifact["section_input_packets"][number]
    | null;
  weakPacket:
    | MasterTemplateImportContextArtifact["weak_section_completion_packets"][number]
    | null;
}) {
  return uniqueStrings([
    ...input.section.instructions,
    input.sectionPacket?.key_points.length
      ? `Prioriza estos puntos respaldados: ${input.sectionPacket.key_points
          .slice(0, 3)
          .join("; ")}.`
      : null,
    input.sectionPacket?.open_questions.length
      ? `No cierres estos vacios sin evidencia: ${input.sectionPacket.open_questions
          .slice(0, 2)
          .join("; ")}.`
      : null,
    input.weakPacket?.missing_evidence.length
      ? `Si persiste la falta de soporte, declaro como limite: ${input.weakPacket.missing_evidence
          .slice(0, 2)
          .join("; ")}.`
      : null,
    input.masterTemplate.methodology_mode &&
    input.alignmentEntry?.method_relevance !== "low"
      ? `Mantener coherencia con el modo metodologico del template: ${input.masterTemplate.methodology_mode}.`
      : null,
    input.alignmentEntry?.notes.length
      ? `Atiende estas notas de alineacion: ${input.alignmentEntry.notes
          .slice(0, 2)
          .join("; ")}.`
      : null,
  ]);
}

function buildSectionRoleInstruction(input: {
  sectionKey: string;
  wave: GenerationWaveKey;
  generationStrategy: GenerationStrategy;
  promptMode: PromptMode;
}) {
  if (input.generationStrategy === "llm_structured") {
    return "Eres un redactor academico especializado en estructurar secciones metodologicas y analiticas con tablas, categorias, criterios o bloques comparables.";
  }

  if (input.promptMode === "citation_insertion") {
    return "Eres un editor academico especializado en insertar citas breves, prudentes y trazables dentro de texto ya estabilizado, sin inventar referencias.";
  }

  if (input.promptMode === "adaptive_revision") {
    return "Eres un revisor academico. Debes mejorar una seccion ya delineada sin reescribirla desde cero y sin perder trazabilidad.";
  }

  if (input.wave === "foundation") {
    return "Eres un redactor academico especializado en delimitar problemas, preguntas, objetivos y justificaciones de investigacion aplicada.";
  }

  if (input.wave === "development") {
    return "Eres un redactor academico especializado en antecedentes, marcos teoricos y marcos tecnicos trazables.";
  }

  if (input.wave === "support_integration") {
    return "Eres un redactor academico especializado en metodologia, criterios de evaluacion y operacionalizacion prudente.";
  }

  if (input.wave === "refinement_and_final") {
    return "Eres un sintetizador academico. Debes cerrar una seccion final solo a partir de contenido ya consolidado.";
  }

  return "Eres un redactor academico. Debes producir una seccion de plan de investigacion en espanol, con prudencia y trazabilidad.";
}

function buildLabSectionPrompt(input: {
  project: MasterBlueprintEngineProject;
  section: ExtendedSectionGenerationPlanItem;
  masterTemplate: MasterTemplateRuntime;
  templateSection: MasterTemplateRuntime["sections"][number] | undefined;
  evidenceLedger: EvidenceLedger;
  priorSections: Array<{ section_key: string; title: string; content: string }>;
  manifestItem: Omit<SectionPromptManifestItem, "prompt">;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext: RefinedIntakeContext;
  researchFrameLight: ResearchFrameLight;
  sectionEvidenceHydrationPlan: SectionEvidenceHydrationPlanItem | null;
  methodScopeGuidance: MethodScopeGuidanceItem | null;
  claimsAndLimitsGuidance: ClaimsAndLimitsGuidanceItem | null;
  finalSectionsGuidance: FinalSectionsGuidance;
  supportStrategy: string | null;
}) {
  const alignmentEntry = getAlignmentEntry(
    input.templateImportContext,
    input.section.section_key,
  );
  const evidenceLines = buildCompactEvidenceLines({
    manifestItem: input.manifestItem,
    evidenceLedger: input.evidenceLedger,
  });
  const assetLines = buildCompactAssetLines({
    evidenceLedger: input.evidenceLedger,
    criticalAssetKeys: input.section.critical_asset_keys,
    usefulAssetKeys: input.section.useful_asset_keys,
  });
  const priorSectionBlock = input.priorSections
    .slice(0, 3)
    .map((section) => `${section.title}:\n${clipText(section.content, 320) ?? section.content}`)
    .join("\n\n");
  const researchFrameLines = uniqueStrings([
    `- proposito del estudio: ${input.researchFrameLight.study_purpose}`,
    `- tipo de pregunta: ${input.researchFrameLight.study_question_type}`,
    `- orientacion metodologica: ${input.researchFrameLight.methodological_orientation}`,
    input.researchFrameLight.case_or_unit_of_analysis
      ? `- caso o unidad de analisis: ${input.researchFrameLight.case_or_unit_of_analysis}`
      : null,
    `- entregable esperado: ${input.researchFrameLight.expected_deliverable}`,
    `- techo de claims: ${input.researchFrameLight.claims_ceiling}`,
    input.researchFrameLight.scope_limits[0]
      ? `- limites de alcance: ${input.researchFrameLight.scope_limits.slice(0, 3).join(" | ")}`
      : null,
  ]).join("\n");
  const evidenceHydrationLines = input.sectionEvidenceHydrationPlan
    ? uniqueStrings([
        input.sectionEvidenceHydrationPlan.priority_evidence_ids.length > 0
          ? `- evidence_ids prioritarios: ${input.sectionEvidenceHydrationPlan.priority_evidence_ids.join(", ")}`
          : null,
        input.sectionEvidenceHydrationPlan.priority_original_excerpt_ids.length > 0
          ? `- original_excerpt_ids prioritarios: ${input.sectionEvidenceHydrationPlan.priority_original_excerpt_ids.join(", ")}`
          : null,
        input.sectionEvidenceHydrationPlan.priority_source_ids.length > 0
          ? `- source_ids prioritarios: ${input.sectionEvidenceHydrationPlan.priority_source_ids.join(", ")}`
          : null,
        input.sectionEvidenceHydrationPlan.required_structure.length > 0
          ? `- estructura requerida: ${input.sectionEvidenceHydrationPlan.required_structure.join(" | ")}`
          : null,
        input.sectionEvidenceHydrationPlan.key_gaps.length > 0
          ? `- gaps clave: ${input.sectionEvidenceHydrationPlan.key_gaps.join(" | ")}`
          : null,
        input.sectionEvidenceHydrationPlan.required_original_fragments.length > 0
          ? `- fragmentos originales a priorizar: ${input.sectionEvidenceHydrationPlan.required_original_fragments.join(" || ")}`
          : null,
        input.sectionEvidenceHydrationPlan.chunk_rehydration_hints.length > 0
          ? `- pistas de rehidratacion: ${input.sectionEvidenceHydrationPlan.chunk_rehydration_hints.join(" || ")}`
          : null,
      ]).join("\n")
    : "NO_DISPONIBLE";
  const methodScopeLines = input.methodScopeGuidance
    ? uniqueStrings([
        `- tratamiento metodologico ligero: ${input.methodScopeGuidance.treatment}`,
        input.methodScopeGuidance.expected_elements.length > 0
          ? `- elementos esperados: ${input.methodScopeGuidance.expected_elements.join(" | ")}`
          : null,
        input.methodScopeGuidance.supporting_method_signals.length > 0
          ? `- senales metodologicas de soporte: ${input.methodScopeGuidance.supporting_method_signals.join(" | ")}`
          : null,
        input.methodScopeGuidance.avoid.length > 0
          ? `- evitar: ${input.methodScopeGuidance.avoid.join(" | ")}`
          : null,
      ]).join("\n")
    : "NO_APLICA";
  const claimsAndLimitsLines = input.claimsAndLimitsGuidance
    ? uniqueStrings([
        input.claimsAndLimitsGuidance.allowed_claims.length > 0
          ? `- claims permitidos: ${input.claimsAndLimitsGuidance.allowed_claims.join(" | ")}`
          : null,
        input.claimsAndLimitsGuidance.claims_to_avoid.length > 0
          ? `- claims a evitar: ${input.claimsAndLimitsGuidance.claims_to_avoid.join(" | ")}`
          : null,
        input.claimsAndLimitsGuidance.claims_conditioned.length > 0
          ? `- claims condicionados: ${input.claimsAndLimitsGuidance.claims_conditioned.join(" | ")}`
          : null,
        input.claimsAndLimitsGuidance.validation_needs.length > 0
          ? `- validaciones pendientes: ${input.claimsAndLimitsGuidance.validation_needs.join(" | ")}`
          : null,
      ]).join("\n")
    : "NO_DISPONIBLE";
  const finalSectionsLines = input.finalSectionsGuidance.late_section_keys.includes(
    input.section.section_key,
  )
    ? uniqueStrings([
        input.section.section_key === "abstract"
          ? `- regla abstract: ${input.finalSectionsGuidance.abstract_rule}`
          : null,
        input.section.section_key === "keywords"
          ? `- regla keywords: ${input.finalSectionsGuidance.keywords_instruction}`
          : null,
        input.section.section_key === "references"
          ? `- regla referencias: ${input.finalSectionsGuidance.references_rule}`
          : null,
        input.section.section_key === "title_refined"
          ? `- regla titulo: ${input.finalSectionsGuidance.final_title_instruction}`
          : null,
        input.section.section_key === "title_refined"
          ? `- regla encabezado corto: ${input.finalSectionsGuidance.short_header_title_instruction}`
          : null,
      ]).join("\n")
    : "NO_APLICA";
  const editorialPolicyLines = uniqueStrings([
    input.finalSectionsGuidance.section_opening_rule,
    input.finalSectionsGuidance.objective_repetition_rule,
    input.section.target_word_budget
      ? `Presupuesto objetivo de palabras: ${input.section.target_word_budget}.`
      : input.finalSectionsGuidance.length_budget_rule,
    input.section.bullet_policy,
    ...input.section.editorial_constraints,
  ]).join("\n");

  return [
    buildSectionRoleInstruction({
      sectionKey: input.section.section_key,
      wave: input.section.wave,
      generationStrategy: input.section.generation_strategy,
      promptMode: input.section.prompt_mode,
    }),
    "No redactas una tesis completa. Solo debes producir la seccion solicitada.",
    "",
    "Reglas obligatorias:",
    "- no inventes citas",
    "- no inventes datos",
    "- no inventes resultados",
    "- si la evidencia no alcanza, redacta una version prudente y explicita la incertidumbre dentro del contenido",
    "- usa el intake como ancla del caso y la evidencia como soporte",
    "- si una fuente es comparativa o de otro contexto, usala solo como antecedente y no como descripcion directa del caso",
    "- no menciones metadatos del engine, ids ni porcentajes de procedencia dentro del contenido final",
    "- no repitas el titulo de la seccion en la primera frase",
    "- evita aperturas genericas como 'La presente seccion' o 'Este apartado'",
    "",
    "Caso actual:",
    buildPromptProjectContext({
      project: input.project,
      templateImportContext: input.templateImportContext,
      refinedIntakeContext: input.refinedIntakeContext,
    }),
    "",
    "Intake refinado util:",
    `- tema refinado: ${input.refinedIntakeContext.refined_topic_es}`,
    `- problema normalizado: ${input.refinedIntakeContext.normalized_problem_es}`,
    `- metodologia normalizada: ${input.refinedIntakeContext.normalized_methodology_es ?? "NO_DISPONIBLE"}`,
    input.refinedIntakeContext.accepted_foreign_terms.length > 0
      ? `- terminos tecnicos aceptados: ${input.refinedIntakeContext.accepted_foreign_terms
          .map((term) => `${term.term}${term.preferred_spanish_gloss ? ` (${term.preferred_spanish_gloss})` : ""}`)
          .join(" | ")}`
      : null,
    "",
    buildPromptPriorityBlock("Marco ligero del estudio:", researchFrameLines.split("\n")),
    "",
    buildPromptPriorityBlock(
      "Contexto consolidado util:",
      buildPromptImportedContext(input.templateImportContext).split("\n"),
    ),
    "",
    buildPromptPriorityBlock(
      "Restricciones utiles del template:",
      buildTemplateConstraintLines({
        masterTemplate: input.masterTemplate,
        sectionKey: input.section.section_key,
        alignmentEntry,
      }).split("\n"),
    ),
    "",
    buildPromptPriorityBlock(
      "Contexto importado especifico de la seccion:",
      buildSectionImportedContextLines({
        section: input.section,
        templateImportContext: input.templateImportContext,
        alignmentEntry,
      }).split("\n"),
    ),
    "",
    buildPromptPriorityBlock(
      "Plan de hidratacion de evidencia para esta seccion:",
      evidenceHydrationLines.split("\n"),
    ),
    "",
    buildPromptPriorityBlock("Guia metodologica ligera de la seccion:", methodScopeLines.split("\n")),
    "",
    buildPromptPriorityBlock("Claims y limites de la seccion:", claimsAndLimitsLines.split("\n")),
    "",
    buildPromptPriorityBlock("Reglas de cierre para secciones finales:", finalSectionsLines.split("\n")),
    "",
    buildPromptPriorityBlock("Politica editorial Batch 2A:", editorialPolicyLines.split("\n")),
    "",
    "Seccion objetivo:",
    `- section_key: ${input.section.section_key}`,
    `- title: ${input.section.title}`,
    `- phase: ${input.section.phase}`,
    `- wave: ${input.section.wave}`,
    `- strategy: ${input.section.generation_strategy}`,
    `- prompt_mode: ${input.section.prompt_mode}`,
    `- support_strategy: ${input.supportStrategy ?? "NO_DISPONIBLE"}`,
    `- purpose: ${input.templateSection?.purpose ?? input.section.purpose ?? "NO_ESPECIFICADO"}`,
    `- content_kind: ${input.section.content_kind}`,
    `- min_words: ${input.section.min_words ?? "NO_ESPECIFICADO"}`,
    `- max_words: ${input.section.max_words ?? "NO_ESPECIFICADO"}`,
    `- target_word_budget: ${input.section.target_word_budget ?? "NO_ESPECIFICADO"}`,
    `- readiness: ${input.section.readiness}`,
    `- upstream_context_keys: ${input.section.upstream_context_keys.join(", ") || "NO_DISPONIBLE"}`,
    `- retry_policy: ${input.section.retry_policy.enabled ? `${input.section.retry_policy.max_attempts} intentos / ${input.section.retry_policy.retry_on.join(", ")}` : "disabled"}`,
    input.section.needs_followup_before_strong_draft
      ? "- advertencia: hay followups pendientes; manten prudencia y no sobreafirmes"
      : null,
    "- instrucciones:",
    ...(input.section.instructions.length > 0
      ? input.section.instructions.map((instruction) => `  - ${instruction}`)
      : ["  - Redacta una version academica coherente con el plan."]),
    "",
    "Dependencias previas utiles:",
    priorSectionBlock ||
      (input.section.depends_on_keys.length > 0
        ? `SECCIONES A HEREDAR EN OLA POSTERIOR: ${input.section.depends_on_keys.join(", ")}`
        : "NO_DISPONIBLE"),
    "",
    "Evidencia disponible para esta seccion:",
    evidenceLines || "NO_DISPONIBLE",
    "",
    "Assets estructurados criticos para esta seccion:",
    assetLines ||
      (input.section.critical_asset_keys.length > 0
        ? `ASSETS CRITICOS ESPERADOS: ${input.section.critical_asset_keys.join(", ")}`
        : "NO_DISPONIBLE"),
    "",
    `Devuelve unicamente el contenido final de la seccion "${input.section.title}".`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildPlannerPrompt(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  baseline: ExtendedBaselinePlan;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext: RefinedIntakeContext;
}) {
  const sectionsBlock = CRITICAL_SECTION_KEYS.map((sectionKey) => {
    const planItem = input.baseline.generation_plan.find((item) => item.section_key === sectionKey);
    const manifestItem = input.baseline.prompt_manifest.find(
      (item) => item.section_key === sectionKey,
    );
    const templateSection = input.masterTemplate.sections.find(
      (section) => section.semantic_key === sectionKey,
    );
    const alignmentEntry = getAlignmentEntry(input.templateImportContext, sectionKey);
    const snippetLines = (manifestItem?.evidence_snippet_ids ?? [])
      .map((snippetId) =>
        input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
      )
      .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet))
      .map(
        (snippet) =>
          `- ${snippet.snippet_id} | origin=${snippet.origin} | hints=${snippet.section_hint_keys.join(",")} | label=${snippet.label} | text=${clipText(snippet.text, 240) ?? snippet.text}`,
      )
      .join("\n");
    const assumptionLines = (manifestItem?.supporting_assumption_ids ?? [])
      .map((assumptionId) =>
        input.evidenceLedger.assumptions.find(
          (assumption) => assumption.assumption_id === assumptionId,
        ),
      )
      .filter((assumption): assumption is NonNullable<typeof assumption> => Boolean(assumption))
      .map(
        (assumption) =>
          `- ${assumption.assumption_id} | sections=${assumption.section_keys.join(",")} | statement=${assumption.statement}`,
      )
      .join("\n");

    return [
      `Seccion: ${sectionKey}`,
      `- title: ${planItem?.title ?? templateSection?.title ?? sectionKey}`,
      `- baseline_phase: ${planItem?.phase ?? "NO_DISPONIBLE"}`,
      `- wave: ${planItem?.wave ?? "NO_DISPONIBLE"}`,
      `- generation_strategy: ${planItem?.generation_strategy ?? "NO_DISPONIBLE"}`,
      `- prompt_mode: ${planItem?.prompt_mode ?? "NO_DISPONIBLE"}`,
      `- readiness: ${planItem?.readiness ?? "NO_DISPONIBLE"}`,
      `- baseline_depends_on: ${(planItem?.depends_on_keys ?? []).join(", ") || "ninguna"}`,
      `- required_context_keys: ${(planItem?.required_context_keys ?? []).join(", ") || "ninguna"}`,
      `- upstream_context_keys: ${(planItem?.upstream_context_keys ?? []).join(", ") || "ninguna"}`,
      `- support_strategy: ${planItem?.support_strategy ?? "NO_DISPONIBLE"}`,
      `- purpose: ${templateSection?.purpose ?? planItem?.purpose ?? "NO_DISPONIBLE"}`,
      `- content_kind: ${planItem?.content_kind ?? templateSection?.content_kind ?? "NO_DISPONIBLE"}`,
      `- required: ${planItem?.required ? "si" : "no"}`,
      `- instructions: ${(planItem?.instructions ?? []).join(" | ") || "ninguna"}`,
      `- imported_source_ids: ${(planItem?.imported_source_ids ?? []).join(", ") || "ninguna"}`,
      `- imported_asset_keys: ${(planItem?.imported_asset_keys ?? []).join(", ") || "ninguna"}`,
      `- current_source_ids: ${(planItem?.source_ids ?? []).join(", ") || "ninguna"}`,
      `- current_asset_keys: ${(planItem?.asset_keys ?? []).join(", ") || "ninguna"}`,
      `- critical_asset_keys: ${(planItem?.critical_asset_keys ?? []).join(", ") || "ninguna"}`,
      `- template_constraints:\n${buildTemplateConstraintLines({
        masterTemplate: input.masterTemplate,
        sectionKey,
        alignmentEntry,
      }) || "- ninguna"}`,
      `- imported_section_context:\n${buildSectionImportedContextLines({
        section: {
          section_key: sectionKey,
          imported_source_ids: planItem?.imported_source_ids,
          imported_asset_keys: planItem?.imported_asset_keys,
        },
        templateImportContext: input.templateImportContext,
        alignmentEntry,
      }) || "- ninguna"}`,
      `- retry_policy: ${planItem?.retry_policy?.enabled ? `${planItem.retry_policy.max_attempts} intentos / ${planItem.retry_policy.retry_on.join(", ")}` : "disabled"}`,
      `- candidate_snippets:\n${snippetLines || "- ninguno"}`,
      `- candidate_assumptions:\n${assumptionLines || "- ninguna"}`,
    ].join("\n");
  }).join("\n\n");

  return [
    "Eres el planificador academico de secciones progresivas para un proyecto de investigacion de maestria.",
    "Tu funcion no es redactar la tesis, sino decidir que evidencia, dependencias y estrategia de generacion conviene priorizar para secciones criticas del template.",
    "",
    "Reglas obligatorias:",
    "- no inventes citas",
    "- no inventes datos",
    "- no inventes resultados",
    "- no inventes snippet_ids ni assumption_ids",
    "- usa solo ids ya presentes en el baseline",
    "- prioriza el estado importado desde blueprint_launch",
    "- si la evidencia es debil, deja la seccion mas prudente y explicita followups",
    "- consistency_matrix debe quedar como salida tardia y depender de objetivos, preguntas, metodologia y categorias",
    "- no adelantes abstract, keywords ni references",
    "",
    "Caso actual:",
    buildPromptProjectContext({
      project: input.project,
      templateImportContext: input.templateImportContext,
      refinedIntakeContext: input.refinedIntakeContext,
    }),
    "",
    "Intake refinado util:",
    `- tema refinado: ${input.refinedIntakeContext.refined_topic_es}`,
    `- problema normalizado: ${input.refinedIntakeContext.normalized_problem_es}`,
    `- metodologia normalizada: ${input.refinedIntakeContext.normalized_methodology_es ?? "NO_DISPONIBLE"}`,
    "",
    "Marco ligero del estudio:",
    `- proposito: ${input.baseline.research_frame_light.study_purpose}`,
    `- tipo de pregunta: ${input.baseline.research_frame_light.study_question_type}`,
    `- orientacion metodologica: ${input.baseline.research_frame_light.methodological_orientation}`,
    `- entregable esperado: ${input.baseline.research_frame_light.expected_deliverable}`,
    `- techo de claims: ${input.baseline.research_frame_light.claims_ceiling}`,
    "",
    "Contexto consolidado util:",
    buildPromptImportedContext(input.templateImportContext),
    "",
    "Secciones criticas a refinar:",
    sectionsBlock,
    "",
    "Devuelve observaciones globales y un refinement por seccion critica solo cuando aporte algo util.",
    "recommended_phase puede quedar null si el baseline ya es correcto.",
    "support_strategy debe ser una frase corta del tipo 'priorizar intake y snippets metodologicos'.",
    "extra_instructions debe ser una lista breve y accionable para enriquecer el prompt de esa seccion.",
  ].join("\n");
}

function buildPromptManifestItem(input: {
  project: MasterBlueprintEngineProject;
  section: ExtendedSectionGenerationPlanItem;
  evidenceLedger: EvidenceLedger;
  masterTemplate: MasterTemplateRuntime;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext: RefinedIntakeContext;
  researchFrameLight: ResearchFrameLight;
  sectionEvidenceHydrationPlan: SectionEvidenceHydrationPlanItem[];
  methodScopeGuidance: MethodScopeGuidanceItem[];
  claimsAndLimitsGuidance: ClaimsAndLimitsGuidanceItem[];
  finalSectionsGuidance: FinalSectionsGuidance;
  evidenceSnippetIds: string[];
  assumptionIds: string[];
  sourceIds: string[];
  assetKeys: string[];
  importedSourceIds: string[];
  importedSnippetIds: string[];
  importedAssetKeys: string[];
  supportStrategy: string | null;
}): ExtendedSectionPromptManifestItem {
  const supportingSourceIds = Array.from(
    new Set(
      input.evidenceSnippetIds
        .map((snippetId) =>
          input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
        )
        .flatMap((snippet) => (snippet?.source_id ? [snippet.source_id] : [])),
    ),
  );
  const supportingPdfSourceIds = supportingSourceIds.filter((sourceId) =>
    input.evidenceLedger.evidence_packs.some(
      (pack) =>
        pack.source_id === sourceId &&
        pack.snippets.some((snippet) => snippet.origin === "pdf"),
    ),
  );
  const supportingWebSourceIds = supportingSourceIds.filter((sourceId) =>
    input.evidenceLedger.source_registry.some(
      (source) => source.source_id === sourceId && source.origin === "websearch_source",
    ),
  );
  const manifestItem = {
    section_key: input.section.section_key,
    title: input.section.title,
    phase: input.section.phase,
    evidence_snippet_ids: input.evidenceSnippetIds,
    supporting_source_ids: supportingSourceIds,
    supporting_pdf_source_ids: supportingPdfSourceIds,
    supporting_web_source_ids: supportingWebSourceIds,
    supporting_assumption_ids: input.assumptionIds,
  } satisfies Omit<SectionPromptManifestItem, "prompt">;

  return {
    ...manifestItem,
    prompt: buildLabSectionPrompt({
      project: input.project,
      section: input.section,
      masterTemplate: input.masterTemplate,
      templateSection: input.masterTemplate.sections.find(
        (templateSection) => templateSection.semantic_key === input.section.section_key,
      ),
      evidenceLedger: input.evidenceLedger,
      priorSections: [],
      manifestItem,
      templateImportContext: input.templateImportContext,
      refinedIntakeContext: input.refinedIntakeContext,
      researchFrameLight: input.researchFrameLight,
      sectionEvidenceHydrationPlan:
        input.sectionEvidenceHydrationPlan.find(
          (item) => item.section_key === input.section.section_key,
        ) ?? null,
      methodScopeGuidance:
        input.methodScopeGuidance.find(
          (item) => item.section_key === input.section.section_key,
        ) ?? null,
      claimsAndLimitsGuidance:
        input.claimsAndLimitsGuidance.find(
          (item) => item.section_key === input.section.section_key,
        ) ?? null,
      finalSectionsGuidance: input.finalSectionsGuidance,
      supportStrategy: input.supportStrategy,
    }),
    wave: input.section.wave,
    generation_strategy: input.section.generation_strategy,
    prompt_mode: input.section.prompt_mode,
    readiness: input.section.readiness,
    enough_to_draft: input.section.enough_to_draft,
    source_ids: uniqueStrings([...input.section.source_ids, ...input.sourceIds]),
    asset_keys: uniqueStrings([...input.section.asset_keys, ...input.assetKeys]),
    critical_asset_keys: input.section.critical_asset_keys,
    useful_asset_keys: input.section.useful_asset_keys,
    imported_source_ids: uniqueStrings([
      ...input.section.imported_source_ids,
      ...input.importedSourceIds,
    ]),
    imported_snippet_ids: uniqueStrings([
      ...input.section.imported_snippet_ids,
      ...input.importedSnippetIds,
    ]),
    imported_asset_keys: uniqueStrings([
      ...input.section.imported_asset_keys,
      ...input.importedAssetKeys,
    ]),
    assumption_ids: input.assumptionIds,
    required_context_keys: input.section.required_context_keys,
    upstream_context_keys: input.section.upstream_context_keys,
    support_strategy: input.supportStrategy,
    asset_policy:
      input.section.critical_asset_keys.length > 0
        ? "include_equations_and_tables"
        : input.section.asset_keys.length > 0
          ? "include_key_assets"
          : "ignore_assets",
    citation_policy: buildCitationPolicyForSection({
      sectionKey: input.section.section_key,
      wave: input.section.wave,
    }),
    retry_policy: input.section.retry_policy,
    needs_followup_before_strong_draft: input.section.needs_followup_before_strong_draft,
    target_word_budget: input.section.target_word_budget,
    editorial_constraints: input.section.editorial_constraints,
    bullet_policy: input.section.bullet_policy,
  };
}

function buildPlanChecks(
  generationPlan: ExtendedSectionGenerationPlanItem[],
): PlannerChecks {
  return {
    late_sections: generationPlan
      .filter(
        (item) =>
          item.wave === "refinement_and_final" ||
          item.wave === "citation_and_references",
      )
      .map((item) => item.section_key),
    weak_sections: generationPlan
      .filter((item) => item.readiness === "baja")
      .map((item) => item.section_key),
    blocked_sections: generationPlan
      .filter((item) => item.readiness === "blocked")
      .map((item) => item.section_key),
    assumption_heavy_sections: generationPlan
      .filter(
        (item) =>
          item.assumption_ids.length > 0 &&
          item.assumption_ids.length >= item.snippet_ids.length,
      )
      .map((item) => item.section_key),
    sections_requiring_followup: generationPlan
      .filter((item) => item.needs_followup_before_strong_draft)
      .map((item) => item.section_key),
  };
}

function buildGenerationWaveSummary(
  generationPlan: ExtendedSectionGenerationPlanItem[],
  contextBlueprints: ContextBlueprint[],
): PlanningWaveSummary[] {
  const waveKeys: GenerationWaveKey[] = [
    "intake_refinement",
    "foundation",
    "development",
    "support_integration",
    "refinement_and_final",
    "citation_and_references",
  ];

  return waveKeys.map((waveKey) => {
    const items = generationPlan.filter((item) => item.wave === waveKey);

    return {
      wave_key: waveKey,
      label: resolveWaveLabel(waveKey),
      goal: resolveWaveGoal(waveKey),
      section_keys: items.map((item) => item.section_key),
      ready_count: items.filter((item) => item.enough_to_draft).length,
      blocked_count: items.filter((item) => item.readiness === "blocked").length,
      output_context_keys: contextBlueprints
        .filter((context) => context.produced_by_wave === waveKey)
        .map((context) => context.context_key),
    };
  });
}

function buildSourceContext(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  templateImportContext: MasterTemplateImportContextArtifact | null;
}): SourceContext {
  return {
    template_key: input.masterTemplate.template_key,
    template_version_id: input.masterTemplate.template_version_id,
    source_lab: input.templateImportContext ? "blueprint_launch" : "lab_fixture",
    imported_topic:
      input.templateImportContext?.imported_project_context.topic ??
      input.project.intake.topic,
    knowledge_area_label:
      input.templateImportContext?.imported_project_context.knowledge_area_label ?? null,
    citation_style: input.masterTemplate.citation_style,
  };
}

function buildBaselineGlobalObservations(
  templateImportContext: MasterTemplateImportContextArtifact | null,
  baseline: ExtendedBaselinePlan,
) {
  if (!templateImportContext) {
    return [
      "El planner del lab esta corriendo sin estado importado contextual. Se conserva un baseline determinista enriquecido solo con el ledger local.",
    ];
  }

  return uniqueStrings([
    `Estado importado desde ${templateImportContext.source_snapshot.source_lab} con ${templateImportContext.imported_evidence_context.selected_source_count} fuentes seleccionadas y ${templateImportContext.imported_evidence_context.materialized_pdf_count} PDFs materializados.`,
    templateImportContext.proposal_context.method_candidate?.method_family
      ? `Metodo candidato importado: ${templateImportContext.proposal_context.method_candidate.method_family}.`
      : null,
    templateImportContext.proposal_context.framework_candidate?.core_framework
      ? `Framework candidato importado: ${templateImportContext.proposal_context.framework_candidate.core_framework}.`
      : null,
    baseline.checks.blocked_sections.length > 0
      ? `Secciones bloqueadas para draft fuerte: ${baseline.checks.blocked_sections.join(", ")}.`
      : null,
    baseline.checks.sections_requiring_followup.length > 0
      ? `Secciones con followup requerido: ${baseline.checks.sections_requiring_followup.join(", ")}.`
      : null,
    "El paso 8 planifica y prioriza evidencia; la rehidratacion extensa de chunks y textos completos queda reservada para el paso 9.",
    templateImportContext.warnings[0] ?? null,
  ]).slice(0, 6);
}

function buildAssetInclusionPlan(
  generationPlan: ExtendedSectionGenerationPlanItem[],
): AssetInclusionPlanItem[] {
  return generationPlan.map((item) => ({
    section_key: item.section_key,
    wave: item.wave,
    asset_policy:
      item.critical_asset_keys.length > 0
        ? "include_equations_and_tables"
        : item.useful_asset_keys.length > 0
          ? "include_key_assets"
          : "ignore_assets",
    critical_asset_keys: item.critical_asset_keys,
    useful_asset_keys: item.useful_asset_keys,
    optional_asset_keys: uniqueStrings(
      item.asset_keys.filter(
        (assetKey) =>
          !item.critical_asset_keys.includes(assetKey) &&
          !item.useful_asset_keys.includes(assetKey),
      ),
    ),
  }));
}

function buildRevisionPassPlan(
  generationPlan: ExtendedSectionGenerationPlanItem[],
): RevisionPassItem[] {
  return generationPlan.map((item) => ({
    section_key: item.section_key,
    enabled:
      item.wave === "refinement_and_final" ||
      ["problem_statement", "justification", "methodology", "theoretical_framework"].includes(
        item.section_key,
      ),
    revision_goals: buildRevisionGoals({
      sectionKey: item.section_key,
      wave: item.wave,
      criticalAssetCount: item.critical_asset_keys.length,
      needsFollowup: item.needs_followup_before_strong_draft,
    }),
    trigger_conditions: uniqueStrings([
      item.min_words && item.min_words > 0 ? "below_min_words" : null,
      item.critical_asset_keys.length > 0 ? "missing_critical_assets" : null,
      item.needs_followup_before_strong_draft ? "reduce_overclaiming" : null,
    ]),
    depends_on_section_keys: item.depends_on_keys,
  }));
}

function buildTitleRefinementPlan(): TitleRefinementPlan {
  return {
    enabled: true,
    wave: "refinement_and_final",
    depends_on_section_keys: ["problem_statement", "general_objective", "methodology"],
    prompt_mode: "final_synthesis",
  };
}

function buildCitationPlan(
  generationPlan: ExtendedSectionGenerationPlanItem[],
  masterTemplate: MasterTemplateRuntime,
): CitationPlan {
  return {
    enabled: true,
    wave: "citation_and_references",
    style_target: masterTemplate.citation_style,
    section_policies: generationPlan.map((item) => ({
      section_key: item.section_key,
      citation_density_target: buildCitationPolicyForSection({
        sectionKey: item.section_key,
        wave: item.wave,
      }).expected_density,
      citation_mode: buildCitationPolicyForSection({
        sectionKey: item.section_key,
        wave: item.wave,
      }).citation_mode,
      derive_from_supported_sources_only: true,
    })),
    bibliography_rules: {
      include_only_used_references: true,
      deduplicate_by_reference_id: true,
      require_traceable_source_link: true,
    },
  };
}

function buildExtendedBaselinePlan(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  refinedIntakeContext: RefinedIntakeContext;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
}): ExtendedBaselinePlan {
  const rawBaseline = planMasterTemplateSectionPrompts({
    project: input.project,
    masterTemplate: input.masterTemplate,
    evidenceLedger: input.evidenceLedger,
  });
  const basePlanByKey = new Map(
    rawBaseline.generation_plan.map((item) => [item.section_key, item]),
  );
  const baseManifestByKey = new Map(
    rawBaseline.prompt_manifest.map((item) => [item.section_key, item]),
  );

  const contextBlueprints = buildContextBlueprints(input.masterTemplate);
  const sourcePriorityMap = buildSourcePriorityMap(input.templateImportContext);
  const projectCountryContext =
    (input.project as { country?: string | null; countryContext?: string | null })
      .country ??
    (input.project as { country?: string | null; countryContext?: string | null })
      .countryContext ??
    "PE";
  const academicEditorialPolicy = buildAcademicEditorialPolicy({
    country_context: projectCountryContext,
    knowledge_area_label:
      input.templateImportContext?.imported_project_context
        .knowledge_area_label ?? null,
    template_key: input.masterTemplate.template_key,
  });
  const researchFrameLight = buildResearchFrameLight({
    project: input.project,
    templateImportContext: input.templateImportContext,
    refinedIntakeContext: input.refinedIntakeContext,
  });
  const researchLogicContractPlan = buildResearchLogicContractPlan();
  const generationPlan = input.masterTemplate.sections.map((section, index) => {
    const basePlan = basePlanByKey.get(section.semantic_key);
    const baseManifest = baseManifestByKey.get(section.semantic_key);
    const alignmentEntry = getAlignmentEntry(input.templateImportContext, section.semantic_key);
    const sectionPacket = getImportedSectionPacket(
      input.templateImportContext,
      section.semantic_key,
      alignmentEntry,
    );
    const weakPacket = getImportedWeakSectionPacket(
      input.templateImportContext,
      section.semantic_key,
      alignmentEntry,
    );
    const phase =
      basePlan?.phase ??
      (section.semantic_key === "consistency_matrix" ? "matrix" : "framing");
    const wave = resolveWave(section.semantic_key, alignmentEntry, phase);
    const phaseLocked =
      Boolean(
        PHASE_LOCKED_SECTION_KEYS[
          section.semantic_key as (typeof CRITICAL_SECTION_KEYS)[number]
        ],
      ) || section.semantic_key === "references";
    const sourceIds = prioritizeSourceIds(
      [
        ...(sectionPacket?.source_ids ?? []),
      ...(alignmentEntry?.fixture_source_ids ?? []),
      ...(baseManifest?.supporting_source_ids ?? []),
      ],
      sourcePriorityMap,
    );
    const snippetIds = selectCandidateSnippetIds({
      sectionKey: section.semantic_key,
      dependsOnKeys: basePlan?.depends_on_keys ?? [],
      evidenceLedger: input.evidenceLedger,
      baselineSnippetIds: baseManifest?.evidence_snippet_ids ?? [],
      sectionPacketSnippetIds: sectionPacket?.snippet_ids ?? [],
      preferredSourceIds: sourceIds,
      sourcePriorityMap,
    });
    const assumptionIds = selectCandidateAssumptionIds({
      sectionKey: section.semantic_key,
      dependsOnKeys: basePlan?.depends_on_keys ?? [],
      assumptions: input.evidenceLedger.assumptions,
      baselineAssumptionIds: baseManifest?.supporting_assumption_ids ?? [],
    });
    const assetKeys = buildCurrentAssetKeys({
      evidenceLedger: input.evidenceLedger,
      preferredSourceIds: sourceIds,
      sectionPacketAssetKeys: sectionPacket?.asset_keys ?? [],
      importedAssetKeys: alignmentEntry?.recommended_asset_keys ?? [],
      sourcePriorityMap,
    });
    const assetClassification = buildAssetClassification({
      sectionKey: section.semantic_key,
      wave,
      evidenceLedger: input.evidenceLedger,
      assetKeys,
    });
    const targetWordBudget =
      academicEditorialPolicy.target_word_budget_by_section[
        section.semantic_key
      ] ?? null;
    const bulletPolicy = sectionPrefersBullets(section.semantic_key)
      ? academicEditorialPolicy.bullet_usage_rule
      : null;
    const strategy = resolveGenerationStrategy({
      sectionKey: section.semantic_key,
      contentKind: section.content_kind,
      wave,
      readiness: alignmentEntry?.readiness ?? "unknown",
    });

    return {
      section_key: section.semantic_key,
      title: section.title,
      phase,
      wave,
      order: resolveWaveOrder(
        wave,
        index,
        alignmentEntry?.generation_priority ?? "middle",
      ),
      generation_strategy: strategy,
      prompt_mode: resolvePromptMode({
        sectionKey: section.semantic_key,
        wave,
        generationStrategy: strategy,
      }),
      depends_on_keys: basePlan?.depends_on_keys ?? [],
      required_context_keys: buildRequiredContextKeys({
        sectionKey: section.semantic_key,
        wave,
        masterTemplate: input.masterTemplate,
        alignmentEntry,
        sectionPacketExists: Boolean(sectionPacket),
        weakPacketExists: Boolean(weakPacket),
      }),
      upstream_context_keys: buildUpstreamContextKeys({
        wave,
        dependsOnKeys: basePlan?.depends_on_keys ?? [],
        alignmentEntry,
      }),
      readiness: alignmentEntry?.readiness ?? "unknown",
      enough_to_draft:
        alignmentEntry?.enough_to_draft ??
        (strategy !== "blocked" && snippetIds.length > 0),
      source_ids: sourceIds,
      snippet_ids: snippetIds,
      asset_keys: assetKeys,
      critical_asset_keys: assetClassification.critical_asset_keys,
      useful_asset_keys: assetClassification.useful_asset_keys,
      imported_source_ids: alignmentEntry?.imported_source_ids ?? [],
      imported_snippet_ids: alignmentEntry?.recommended_snippet_ids ?? [],
      imported_asset_keys: alignmentEntry?.recommended_asset_keys ?? [],
      assumption_ids: assumptionIds,
      support_strategy: buildDefaultSupportStrategy({
        sectionKey: section.semantic_key,
        wave,
        alignmentEntry,
        strategy,
        sectionPacket,
        weakPacket,
        templateImportContext: input.templateImportContext,
      }),
      instructions: buildSectionInstructions({
        section,
        masterTemplate: input.masterTemplate,
        alignmentEntry,
        sectionPacket,
        weakPacket,
      }),
      purpose: section.purpose,
      content_kind: recommendedContentKindForSection(
        section.semantic_key,
        section.content_kind,
      ),
      required: section.required,
      min_words: section.min_words,
      max_words:
        targetWordBudget && section.max_words
          ? Math.min(section.max_words, targetWordBudget)
          : (targetWordBudget ?? section.max_words),
      target_word_budget: targetWordBudget,
      editorial_constraints: uniqueStrings([
        academicEditorialPolicy.section_opening_rule,
        academicEditorialPolicy.objective_repetition_rule,
        ...(section.semantic_key === "keywords"
          ? [academicEditorialPolicy.keywords_instruction]
          : []),
        ...(section.semantic_key === "title_refined"
          ? [
              academicEditorialPolicy.final_title_instruction,
              academicEditorialPolicy.short_header_title_instruction,
            ]
          : []),
        ...(bulletPolicy ? [bulletPolicy] : []),
        ...academicEditorialPolicy.redundancy_constraints.slice(0, 3),
      ]),
      bullet_policy: bulletPolicy,
      retry_policy: buildRetryPolicy({
        sectionKey: section.semantic_key,
        wave,
        minWords: section.min_words,
        criticalAssetCount: assetClassification.critical_asset_keys.length,
        weakPacket,
        isRequiredSection:
          section.required ||
          input.masterTemplate.required_section_keys.includes(section.semantic_key),
      }),
      needs_followup_before_strong_draft:
        alignmentEntry?.needs_followup_before_strong_draft ??
        (assumptionIds.length > 0 ||
          weakPacket?.draftability_status === "inferable_with_care" ||
          weakPacket?.draftability_status === "blocked_by_missing_evidence"),
      phase_locked: phaseLocked,
    } satisfies ExtendedSectionGenerationPlanItem;
  });
  const claimsAndLimitsGuidance = buildClaimsAndLimitsGuidance({
    generationPlan,
    templateImportContext: input.templateImportContext,
    consolidatedEvidence: input.consolidatedEvidence,
  });
  const methodScopeGuidance = buildMethodScopeGuidance({
    generationPlan,
    templateImportContext: input.templateImportContext,
    researchFrameLight,
  });
  const finalSectionsGuidance = buildFinalSectionsGuidance(
    academicEditorialPolicy,
  );
  const sectionEvidenceHydrationPlan = buildSectionEvidenceHydrationPlan({
    generationPlan,
    templateImportContext: input.templateImportContext,
    evidenceLedger: input.evidenceLedger,
    consolidatedEvidence: input.consolidatedEvidence,
    claimsAndLimitsGuidance,
  });

  const promptManifest = generationPlan
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((section) =>
      buildPromptManifestItem({
        project: input.project,
        section,
        evidenceLedger: input.evidenceLedger,
        masterTemplate: input.masterTemplate,
        templateImportContext: input.templateImportContext,
        refinedIntakeContext: input.refinedIntakeContext,
        researchFrameLight,
        sectionEvidenceHydrationPlan,
        methodScopeGuidance,
        claimsAndLimitsGuidance,
        finalSectionsGuidance,
        evidenceSnippetIds: section.snippet_ids,
        assumptionIds: section.assumption_ids,
        sourceIds: section.source_ids,
        assetKeys: section.asset_keys,
        importedSourceIds: section.imported_source_ids,
        importedSnippetIds: section.imported_snippet_ids,
        importedAssetKeys: section.imported_asset_keys,
        supportStrategy: section.support_strategy,
      }),
    );

  const checks = buildPlanChecks(generationPlan);

  return {
    generation_plan: generationPlan,
    prompt_manifest: promptManifest,
    source_context: buildSourceContext(input),
    refined_intake_context: input.refinedIntakeContext,
    research_frame_light: researchFrameLight,
    research_logic_contract_plan: researchLogicContractPlan,
    context_blueprints: contextBlueprints,
    section_evidence_hydration_plan: sectionEvidenceHydrationPlan,
    method_scope_guidance: methodScopeGuidance,
    claims_and_limits_guidance: claimsAndLimitsGuidance,
    final_sections_guidance: finalSectionsGuidance,
    academic_editorial_policy: academicEditorialPolicy,
    asset_inclusion_plan: buildAssetInclusionPlan(generationPlan),
    revision_pass_plan: buildRevisionPassPlan(generationPlan),
    title_refinement_plan: buildTitleRefinementPlan(),
    citation_plan: buildCitationPlan(generationPlan, input.masterTemplate),
    generation_waves: buildGenerationWaveSummary(generationPlan, contextBlueprints),
    checks,
  };
}

function buildDeterministicResult(
  baseline: ExtendedBaselinePlan,
  input: {
    mergeWarnings?: string[];
    globalObservations?: string[];
  } = {},
): LabPromptPlan {
  return {
    artifact_type: "section_planning",
    artifact_version: "v6",
    generated_at: new Date().toISOString(),
    generation_plan: baseline.generation_plan,
    prompt_manifest: baseline.prompt_manifest,
    planner_mode: "deterministic",
    llm_provider: null,
    llm_model: null,
    refined_intake_context: baseline.refined_intake_context,
    research_frame_light: baseline.research_frame_light,
    research_logic_contract_plan: baseline.research_logic_contract_plan,
    baseline_prompt_plan: {
      generation_plan: baseline.generation_plan,
      prompt_manifest: baseline.prompt_manifest,
    },
    source_context: baseline.source_context,
    generation_waves: baseline.generation_waves,
    context_blueprints: baseline.context_blueprints,
    section_evidence_hydration_plan: baseline.section_evidence_hydration_plan,
    method_scope_guidance: baseline.method_scope_guidance,
    claims_and_limits_guidance: baseline.claims_and_limits_guidance,
    final_sections_guidance: baseline.final_sections_guidance,
    academic_editorial_policy: baseline.academic_editorial_policy,
    final_title_instruction:
      baseline.academic_editorial_policy.final_title_instruction,
    short_header_title_instruction:
      baseline.academic_editorial_policy.short_header_title_instruction,
    keywords_instruction: baseline.academic_editorial_policy.keywords_instruction,
    redundancy_constraints:
      baseline.academic_editorial_policy.redundancy_constraints,
    bullet_policy: baseline.academic_editorial_policy.bullet_policy,
    target_word_budget_by_section:
      baseline.academic_editorial_policy.target_word_budget_by_section,
    master_target_pages: baseline.academic_editorial_policy.master_target_pages,
    institutional_target_pages:
      baseline.academic_editorial_policy.institutional_target_pages,
    asset_inclusion_plan: baseline.asset_inclusion_plan,
    revision_pass_plan: baseline.revision_pass_plan,
    title_refinement_plan: baseline.title_refinement_plan,
    citation_plan: baseline.citation_plan,
    global_observations: input.globalObservations ?? [],
    merge_warnings: input.mergeWarnings ?? [],
    llm_refinements: [],
    refined_section_keys: [],
    checks: baseline.checks,
  };
}

function sanitizeRefinements(input: {
  refinements: LlmSectionRefinement[];
  masterTemplate: MasterTemplateRuntime;
  baseline: ExtendedBaselinePlan;
  evidenceLedger: EvidenceLedger;
}) {
  const mergeWarnings: string[] = [];
  const allowedSectionKeys = new Set(input.masterTemplate.sections.map((section) => section.semantic_key));
  const allowedSnippetIds = new Set(input.evidenceLedger.snippets.map((snippet) => snippet.snippet_id));
  const allowedAssumptionIds = new Set(
    input.evidenceLedger.assumptions.map((assumption) => assumption.assumption_id),
  );
  const sanitized = input.refinements
    .filter((refinement) => {
      if (!CRITICAL_SECTION_KEYS.includes(refinement.section_key as (typeof CRITICAL_SECTION_KEYS)[number])) {
        mergeWarnings.push(
          `El planner LLM devolvio una seccion fuera del contrato: ${refinement.section_key}.`,
        );
        return false;
      }

      if (!allowedSectionKeys.has(refinement.section_key)) {
        mergeWarnings.push(
          `La seccion ${refinement.section_key} no existe en el template runtime cargado.`,
        );
        return false;
      }

      return true;
    })
    .map((refinement) => {
      const planItem = input.baseline.generation_plan.find(
        (item) => item.section_key === refinement.section_key,
      );
      const validDependsOnKeys = uniqueStrings(refinement.recommended_depends_on_keys).filter(
        (sectionKey) => allowedSectionKeys.has(sectionKey) && sectionKey !== refinement.section_key,
      );
      const invalidSnippetIds = uniqueStrings(refinement.recommended_evidence_snippet_ids).filter(
        (snippetId) => !allowedSnippetIds.has(snippetId),
      );
      const invalidAssumptionIds = uniqueStrings(refinement.recommended_assumption_ids).filter(
        (assumptionId) => !allowedAssumptionIds.has(assumptionId),
      );

      if (invalidSnippetIds.length > 0) {
        mergeWarnings.push(
          `La seccion ${refinement.section_key} devolvio snippet_ids no validos: ${invalidSnippetIds.join(", ")}.`,
        );
      }

      if (invalidAssumptionIds.length > 0) {
        mergeWarnings.push(
          `La seccion ${refinement.section_key} devolvio assumption_ids no validos: ${invalidAssumptionIds.join(", ")}.`,
        );
      }

      const recommendedPhase =
        refinement.recommended_phase &&
        VALID_PHASES.includes(refinement.recommended_phase as (typeof VALID_PHASES)[number])
          ? (refinement.recommended_phase as SectionGenerationPhase)
          : null;
      const lockedPhase =
        PHASE_LOCKED_SECTION_KEYS[
          refinement.section_key as (typeof CRITICAL_SECTION_KEYS)[number]
        ] ?? null;

      if (refinement.recommended_phase && !recommendedPhase) {
        mergeWarnings.push(
          `La seccion ${refinement.section_key} devolvio un phase invalido: ${refinement.recommended_phase}.`,
        );
      }

      if (lockedPhase && recommendedPhase && recommendedPhase !== lockedPhase) {
        mergeWarnings.push(
          `La seccion ${refinement.section_key} intento moverse a ${recommendedPhase}, pero el lab la mantiene en ${lockedPhase}.`,
        );
      }

      return {
        section_key: refinement.section_key,
        recommended_phase: lockedPhase ?? recommendedPhase,
        recommended_depends_on_keys: uniqueStrings([
          ...(planItem?.depends_on_keys ?? []),
          ...validDependsOnKeys,
        ]),
        recommended_evidence_snippet_ids: uniqueStrings(
          refinement.recommended_evidence_snippet_ids,
        ).filter((snippetId) => allowedSnippetIds.has(snippetId)),
        recommended_assumption_ids: uniqueStrings(refinement.recommended_assumption_ids).filter(
          (assumptionId) => allowedAssumptionIds.has(assumptionId),
        ),
        support_strategy: refinement.support_strategy?.trim() ?? null,
        extra_instructions: uniqueStrings(refinement.extra_instructions).slice(0, 4),
        rationale: refinement.rationale?.trim() || "Sin rationale explicita.",
      } satisfies LabPromptPlanRefinement;
    });

  return {
    refinements: sanitized,
    mergeWarnings,
  };
}

async function buildRefinedIntakeContextWithLlm(input: {
  project: MasterBlueprintEngineProject;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  provider: ReturnType<typeof getConfiguredLlmProvider>;
  modelName: string;
}) {
  return input.provider.generateStructuredObject<RefinedIntakeContext>({
    schemaName: "lab_refined_intake_context",
    schema: buildRefinedIntakeSchema(),
    model: input.modelName,
    prompt: buildIntakeRefinementPrompt({
      project: input.project,
      templateImportContext: input.templateImportContext,
    }),
  });
}

export async function planMasterTemplateSectionPromptsForLab(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  templateImportContext?: Record<string, unknown>;
  allowLlm?: boolean;
}): Promise<LabPromptPlan> {
  const templateImportContext =
    (input.templateImportContext as MasterTemplateImportContextArtifact | null | undefined) ??
    null;
  const deterministicRefinedIntakeContext = buildDeterministicRefinedIntakeContext({
    project: input.project,
    templateImportContext,
  });
  let refinedIntakeContext = deterministicRefinedIntakeContext;
  let providerName: string | null = null;
  let modelName: string | null = null;
  const consolidatedEvidence = await loadReadonlyConsolidatedEvidence(
    templateImportContext?.source_snapshot.latest_consolidated_evidence_path ??
      templateImportContext?.source_snapshot.downstream_handoff_manifest_path ??
      null,
  );

  if (input.allowLlm) {
    try {
      const provider = getConfiguredLlmProvider();
      providerName = provider.name;
      modelName = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
      refinedIntakeContext = await buildRefinedIntakeContextWithLlm({
        project: input.project,
        templateImportContext,
        provider,
        modelName,
      });
    } catch {
      refinedIntakeContext = deterministicRefinedIntakeContext;
    }
  }

  const baseline = buildExtendedBaselinePlan({
    project: input.project,
    masterTemplate: input.masterTemplate,
    evidenceLedger: input.evidenceLedger,
    templateImportContext,
    refinedIntakeContext,
    consolidatedEvidence,
  });
  const baselineObservations = buildBaselineGlobalObservations(
    templateImportContext,
    baseline,
  );

  if (!input.allowLlm) {
    return buildDeterministicResult(baseline, {
      globalObservations: [
        ...baselineObservations,
        "Planner LLM desactivado para esta corrida del lab. Se conserva el baseline contextual.",
        "El intake refinado se resolvio con fallback determinista local.",
      ].slice(0, 6),
    });
  }

  try {
    const provider = getConfiguredLlmProvider();
    providerName = provider.name;
    modelName = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
    const llmResponse = await provider.generateStructuredObject<LlmPlannerResponse>({
      schemaName: "lab_prompt_planning_refinements",
      schema: buildPromptPlanningSchema(),
      model: modelName,
      prompt: buildPlannerPrompt({
        project: input.project,
        masterTemplate: input.masterTemplate,
        evidenceLedger: input.evidenceLedger,
        baseline,
        templateImportContext,
        refinedIntakeContext,
      }),
    });
    const sanitized = sanitizeRefinements({
      refinements: llmResponse.section_refinements ?? [],
      masterTemplate: input.masterTemplate,
      baseline,
      evidenceLedger: input.evidenceLedger,
    });
    const refinementMap = new Map(
      sanitized.refinements.map((refinement) => [refinement.section_key, refinement]),
    );
    const sectionIndexes = new Map(
      input.masterTemplate.sections.map((section, index) => [section.semantic_key, index]),
    );
    const generationPlan = baseline.generation_plan.map((section) => {
      const refinement = refinementMap.get(section.section_key);

      if (!refinement) {
        return section;
      }

      const phase = refinement.recommended_phase ?? section.phase;

      return {
        ...section,
        phase,
        order: resolveWaveOrder(
          section.wave,
          sectionIndexes.get(section.section_key) ?? 0,
        ),
        depends_on_keys:
          refinement.recommended_depends_on_keys.length > 0
            ? refinement.recommended_depends_on_keys
            : section.depends_on_keys,
        snippet_ids: uniqueStrings([
          ...section.snippet_ids,
          ...refinement.recommended_evidence_snippet_ids,
        ]).slice(0, 12),
        assumption_ids: uniqueStrings([
          ...section.assumption_ids,
          ...refinement.recommended_assumption_ids,
        ]).slice(0, 8),
        instructions: uniqueStrings([
          ...section.instructions,
          ...refinement.extra_instructions,
        ]),
        support_strategy: refinement.support_strategy ?? section.support_strategy,
      } satisfies ExtendedSectionGenerationPlanItem;
    });
    const claimsAndLimitsGuidance = buildClaimsAndLimitsGuidance({
      generationPlan,
      templateImportContext,
      consolidatedEvidence,
    });
    const methodScopeGuidance = buildMethodScopeGuidance({
      generationPlan,
      templateImportContext,
      researchFrameLight: baseline.research_frame_light,
    });
    const finalSectionsGuidance = buildFinalSectionsGuidance(
      baseline.academic_editorial_policy,
    );
    const sectionEvidenceHydrationPlan = buildSectionEvidenceHydrationPlan({
      generationPlan,
      templateImportContext,
      evidenceLedger: input.evidenceLedger,
      consolidatedEvidence,
      claimsAndLimitsGuidance,
    });
    const promptManifest = generationPlan
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((section) => {
        const refinement = refinementMap.get(section.section_key);

        return buildPromptManifestItem({
          project: input.project,
          section,
        evidenceLedger: input.evidenceLedger,
        masterTemplate: input.masterTemplate,
        templateImportContext,
        refinedIntakeContext,
        researchFrameLight: baseline.research_frame_light,
        sectionEvidenceHydrationPlan,
        methodScopeGuidance,
        claimsAndLimitsGuidance,
        finalSectionsGuidance,
        evidenceSnippetIds: section.snippet_ids,
        assumptionIds: section.assumption_ids,
        sourceIds: section.source_ids,
          assetKeys: section.asset_keys,
          importedSourceIds: section.imported_source_ids,
          importedSnippetIds: section.imported_snippet_ids,
          importedAssetKeys: section.imported_asset_keys,
          supportStrategy: refinement?.support_strategy ?? section.support_strategy,
        });
      });
    const checks = buildPlanChecks(generationPlan);

    return {
      artifact_type: "section_planning",
      artifact_version: "v6",
      generated_at: new Date().toISOString(),
      generation_plan: generationPlan,
      prompt_manifest: promptManifest,
      planner_mode: "llm_orchestrated",
      llm_provider: providerName,
      llm_model: modelName,
      refined_intake_context: refinedIntakeContext,
      research_frame_light: baseline.research_frame_light,
      research_logic_contract_plan: baseline.research_logic_contract_plan,
      baseline_prompt_plan: {
        generation_plan: baseline.generation_plan,
        prompt_manifest: baseline.prompt_manifest,
      },
      source_context: baseline.source_context,
      generation_waves: buildGenerationWaveSummary(generationPlan, baseline.context_blueprints),
      context_blueprints: baseline.context_blueprints,
      section_evidence_hydration_plan: sectionEvidenceHydrationPlan,
      method_scope_guidance: methodScopeGuidance,
      claims_and_limits_guidance: claimsAndLimitsGuidance,
      final_sections_guidance: finalSectionsGuidance,
      academic_editorial_policy: baseline.academic_editorial_policy,
      final_title_instruction:
        baseline.academic_editorial_policy.final_title_instruction,
      short_header_title_instruction:
        baseline.academic_editorial_policy.short_header_title_instruction,
      keywords_instruction:
        baseline.academic_editorial_policy.keywords_instruction,
      redundancy_constraints:
        baseline.academic_editorial_policy.redundancy_constraints,
      bullet_policy: baseline.academic_editorial_policy.bullet_policy,
      target_word_budget_by_section:
        baseline.academic_editorial_policy.target_word_budget_by_section,
      master_target_pages:
        baseline.academic_editorial_policy.master_target_pages,
      institutional_target_pages:
        baseline.academic_editorial_policy.institutional_target_pages,
      asset_inclusion_plan: buildAssetInclusionPlan(generationPlan),
      revision_pass_plan: buildRevisionPassPlan(generationPlan),
      title_refinement_plan: baseline.title_refinement_plan,
      citation_plan: baseline.citation_plan,
      global_observations: uniqueStrings([
        ...baselineObservations,
        "El planner multi-ola del lab activo intake_refinement, foundation, development, support_integration, refinement_and_final y citation_and_references.",
        ...llmResponse.global_observations,
      ]).slice(0, 6),
      merge_warnings: sanitized.mergeWarnings,
      llm_refinements: sanitized.refinements,
      refined_section_keys: sanitized.refinements.map((refinement) => refinement.section_key),
      checks,
    };
  } catch (error) {
    return {
      ...buildDeterministicResult(baseline, {
        mergeWarnings: [
          `No se pudo ejecutar el planner LLM del lab: ${error instanceof Error ? error.message : "error no identificado"}.`,
        ],
        globalObservations: [
          ...baselineObservations,
          "Se reutilizo el baseline contextual para mantener el flujo reproducible.",
          "El intake refinado usa fallback local por falla del proveedor.",
        ].slice(0, 6),
      }),
      llm_provider: providerName,
      llm_model: modelName,
    };
  }
}
