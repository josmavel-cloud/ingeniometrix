export type BlueprintReferenceSnapshot = {
  reference_id: string;
  title: string;
  doi?: string | null;
};

export type BlueprintReadinessSnapshot = {
  readiness_status: "ready" | "assisted";
  missing_intake_fields: string[];
  warnings: string[];
  evidence_summary: {
    selected_reference_count: number;
    abstracts_available_count: number;
    problem_signal_count: number;
    method_signal_count: number;
    population_signal_count: number;
  };
};

export type BlueprintContextCompletion = {
  research_line: string;
  problem_frame: string;
  population_frame: string;
  methodology_frame: string;
  analysis_frame: string;
  assumptions: string[];
  rationale: string;
};

export type BlueprintAntecedentSummary = {
  reference_id: string;
  title: string;
  authors: string;
  year: number | null;
  download_url: string | null;
  summary: string;
  technical_solution: string;
  unresolved_gap: string;
};

export type BlueprintAntecedentSynthesis = {
  summaries: BlueprintAntecedentSummary[];
  gap_overview: string;
  objective_guidance: string[];
};

export type BlueprintReferenceInsight = {
  reference_id: string;
  title: string;
  doi: string | null;
  year: number | null;
  venue: string | null;
  abstract_available: boolean;
  is_recent: boolean;
  evidence_strength: "high" | "medium" | "low";
  topic_focus: string[];
  problem_signal: string | null;
  method_signal: string | null;
  population_or_context_signal: string | null;
  technical_solution_signal: string | null;
  main_finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
};

export type BlueprintCitationSupportLevel =
  | "direct"
  | "partial"
  | "intake_only"
  | "assumption";

export type BlueprintCitationEvidenceSource =
  | "references"
  | "intake"
  | "mixed"
  | "assumptions";

export type BlueprintCitationPlanSection = {
  section_key: string;
  section_title: string;
  support_level: BlueprintCitationSupportLevel;
  evidence_source: BlueprintCitationEvidenceSource;
  supported_reference_ids: string[];
  notes: string[];
  template_semantic_keys: string[];
};

export type BlueprintTemplateContext = {
  template_key: string;
  template_name: string;
  selected_by_user: boolean;
  source: "template_runtime" | "project_selection";
  template_family: string | null;
  university: string;
  program: string;
  degree_level: string;
  required_section_keys: string[];
  available_semantic_keys: string[];
  guidance_notes: string[];
};

export type BlueprintAssumptionDetail = {
  assumption_id: string;
  statement: string;
  reason: string;
  affected_sections: string[];
};

export type ResearchBlueprintCore = {
  project_title: string;
  template_key: string;
  degree_level:
    | "PREGRADO"
    | "POSGRADO"
    | "ESPECIALIZACION"
    | "MAESTRIA"
    | "DOCTORADO";
  university: string;
  program: string;
  research_line: string;
  problem_statement: string;
  problem_delimitation: string;
  justification: string;
  general_objective: string;
  specific_objectives: string[];
  research_questions: string[];
  hypotheses_or_guiding_questions: string[];
  key_constructs_or_variables: string[];
  proposed_methodology: string;
  population_and_sample: string;
  data_collection_techniques: string[];
  analysis_plan: string;
  consistency_matrix: Array<{
    objective: string;
    question: string;
    method: string;
    technique: string;
  }>;
  work_plan: Array<{
    phase: string;
    duration: string;
  }>;
  assumptions: string[];
  limitations: string[];
  references_used: BlueprintReferenceSnapshot[];
};

export type ResearchBlueprintRecord = ResearchBlueprintCore & {
  reference_insights?: BlueprintReferenceInsight[];
  citation_plan?: BlueprintCitationPlanSection[];
  template_context?: BlueprintTemplateContext;
  assumptions_detailed?: BlueprintAssumptionDetail[];
  engine_warnings?: string[];
  readiness_snapshot?: BlueprintReadinessSnapshot;
  context_completion?: BlueprintContextCompletion | null;
  antecedent_synthesis?: BlueprintAntecedentSynthesis | null;
};
