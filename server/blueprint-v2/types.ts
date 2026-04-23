import type { Intake, Project, ProjectReference, Reference } from "@prisma/client";

import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

export type MasterBlueprintEngineProject = Project & {
  intake: Intake;
  projectReferences: Array<
    ProjectReference & {
      reference: Reference;
    }
  >;
  blueprintVersions?: Array<{
    versionNumber: number;
  }>;
};

export type BlueprintRunStageKey =
  | "preparing"
  | "gating_sources"
  | "acquiring_evidence"
  | "downloading_pdfs"
  | "extracting_evidence"
  | "planning_sections"
  | "generating_sections"
  | "building_matrix"
  | "composing_blueprint"
  | "validating_blueprint"
  | "deriving_university_blueprint"
  | "persisting"
  | "completed"
  | "failed";

export type BlueprintRunStage = {
  stageKey: BlueprintRunStageKey;
  label: string;
  progress: number;
  createdAt: string;
};

export type BlueprintRunManifest = {
  engine_name: "MasterBlueprintEngine";
  engine_version: string;
  run_id: string;
  project_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  master_template_key: string;
  master_template_version_id: string | null;
  selected_template_key: string;
  stages: BlueprintRunStage[];
};

export type BlueprintSourceOrigin =
  | "selected_source"
  | "provider_expansion"
  | "websearch_source";

export type BlueprintSourceRecord = {
  source_id: string;
  reference_id: string | null;
  origin: BlueprintSourceOrigin;
  label: string;
  title: string;
  normalized_title: string;
  doi: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  query: string | null;
  snippet: string | null;
  selected_order: number | null;
  citation_count: number | null;
  is_open_access: boolean;
  raw_openalex_json: unknown | null;
  raw_crossref_json: unknown | null;
  eligible_for_formal_reference: boolean;
};

export type SourceIntakeGateResult = {
  minimum_required_sources: number;
  selected_source_count: number;
  missing_source_count: number;
  fallback_required: boolean;
  coverage_warnings: string[];
  selected_sources: BlueprintSourceRecord[];
};

export type SourceAcquisitionDecision = {
  source_id: string;
  accepted: boolean;
  reason: string;
  origin: BlueprintSourceOrigin;
  query: string | null;
};

export type EvidenceAcquisitionResult = {
  target_source_count: number;
  source_registry: BlueprintSourceRecord[];
  provider_expansion_sources: BlueprintSourceRecord[];
  websearch_sources: BlueprintSourceRecord[];
  decisions: SourceAcquisitionDecision[];
  warnings: string[];
};

export type PdfDownloadStatus = "downloaded" | "skipped" | "failed";
export type PdfAccessStrategy =
  | "direct_pdf_url"
  | "landing_page_discovery"
  | "doi_resolution"
  | "open_access_fallback"
  | "websearch_pdf_url";

export type PdfDownloadRecord = {
  source_id: string;
  title: string;
  pdf_url: string | null;
  resolved_pdf_url: string | null;
  access_strategy: PdfAccessStrategy | null;
  http_status: number | null;
  status: PdfDownloadStatus;
  reason: string | null;
  stored_file_path: string | null;
  file_size_bytes: number | null;
};

export type PdfDownloadResult = {
  records: PdfDownloadRecord[];
  warnings: string[];
};

export type PdfAssetRecord = {
  source_id: string;
  asset_key: string;
  title: string;
  kind: "image" | "equation" | "table";
  caption: string | null;
  page_number: number | null;
  file_path: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  text_content: string | null;
  extraction_origin: "pdf_native" | "llm_reconstructed";
  extracted: boolean;
};

export type EvidenceSnippet = {
  snippet_id: string;
  source_id: string | null;
  origin: "source" | "pdf" | "websearch" | "assumption_backed" | "intake";
  label: string;
  text: string;
  section_hint_keys: string[];
  confidence: number;
};

export type ExtractedEvidencePack = {
  source_id: string;
  problem_signal: string | null;
  method_signal: string | null;
  context_signal: string | null;
  finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
  abstract_summary: string | null;
  pdf_summary: string | null;
  pdf_sections: {
    abstract: string | null;
    methodology: string | null;
    results: string | null;
    conclusions: string | null;
    limitations: string | null;
    future_work: string | null;
  };
  snippets: EvidenceSnippet[];
  assets: PdfAssetRecord[];
};

export type AssumptionInput = {
  assumption_id: string;
  statement: string;
  reason: string;
  section_keys: string[];
};

export type EvidenceLedger = {
  source_registry: BlueprintSourceRecord[];
  evidence_packs: ExtractedEvidencePack[];
  assets: PdfAssetRecord[];
  assumptions: AssumptionInput[];
  snippets: EvidenceSnippet[];
  warnings: string[];
};

export type MasterTemplateSectionRuntime = {
  section_id: string;
  title: string;
  semantic_key: string;
  path_titles: string[];
  level: number;
  content_kind: string;
  required: boolean;
  instructions: string[];
  purpose: string | null;
  min_words: number | null;
  max_words: number | null;
};

export type MasterTemplateRuntime = {
  template_key: string;
  template_name: string;
  template_version_id: string;
  methodology_mode: string | null;
  citation_style: string | null;
  required_section_keys: string[];
  sections: MasterTemplateSectionRuntime[];
  guidance_notes: string[];
};

export type SectionGenerationPhase =
  | "body"
  | "logic"
  | "framing"
  | "references"
  | "matrix";

export type SectionGenerationPlanItem = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  order: number;
  depends_on_keys: string[];
  instructions: string[];
  purpose: string | null;
  content_kind: string;
  required: boolean;
  min_words: number | null;
  max_words: number | null;
};

export type SectionPromptManifestItem = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  prompt: string;
  evidence_snippet_ids: string[];
  supporting_source_ids: string[];
  supporting_pdf_source_ids: string[];
  supporting_web_source_ids: string[];
  supporting_assumption_ids: string[];
};

export type SectionPromptPlan = {
  generation_plan: SectionGenerationPlanItem[];
  prompt_manifest: SectionPromptManifestItem[];
};

export type SectionSupportLevel =
  | "reference_supported"
  | "pdf_supported"
  | "web_supported"
  | "intake_supported"
  | "assumption_backed";

export type MasterSectionDraft = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  content: string;
  content_kind: string;
  support_level: SectionSupportLevel;
  supported_source_ids: string[];
  supported_pdf_source_ids: string[];
  supported_web_source_ids: string[];
  supported_assumption_ids: string[];
  evidence_snippet_ids: string[];
  warnings: string[];
  prompt: string;
};

export type ConsistencyMatrixRow = {
  objective: string;
  question: string;
  method: string;
  technique: string;
};

export type SectionProvenanceBreakdown = {
  section_key: string;
  word_count: number;
  from_sources_pct: number;
  from_pdfs_pct: number;
  from_websearch_pct: number;
  from_assumption_backed_pct: number;
};

export type DocumentProvenanceReport = {
  from_sources_pct: number;
  from_pdfs_pct: number;
  from_websearch_pct: number;
  from_assumption_backed_pct: number;
  section_breakdown: SectionProvenanceBreakdown[];
};

export type MasterBlueprintValidationReport = {
  required_sections_present: boolean;
  missing_required_section_keys: string[];
  warnings: string[];
  reference_traceability_ok: boolean;
  formal_reference_ids: string[];
  quality_report: MasterBlueprintQualityReport;
};

export type MasterBlueprintQualityComponentKey =
  | "structure"
  | "coherence"
  | "traceability"
  | "evidence_support"
  | "objective_quality"
  | "methodology_clarity";

export type MasterBlueprintQualityComponentReport = {
  key: MasterBlueprintQualityComponentKey;
  label: string;
  score: number;
  max_score: number;
  notes: string[];
};

export type MasterBlueprintSemanticCriterionKey =
  | "problem_objective_alignment"
  | "objective_specificity"
  | "research_question_quality"
  | "methodology_design"
  | "evidence_grounding"
  | "academic_prudence";

export type MasterBlueprintSemanticCriterionReport = {
  key: MasterBlueprintSemanticCriterionKey;
  label: string;
  score_5: number;
  notes: string[];
};

export type MasterBlueprintSemanticReviewReport = {
  model: string | null;
  score_10: number | null;
  summary: string | null;
  recommendation: "approve" | "review" | "reject" | "skipped";
  criteria: MasterBlueprintSemanticCriterionReport[];
  warnings: string[];
};

export type MasterBlueprintQualityReport = {
  threshold: number;
  passed: boolean;
  deterministic_score_10: number;
  semantic_score_10: number | null;
  score_10: number;
  hard_failures: string[];
  soft_warnings: string[];
  components: MasterBlueprintQualityComponentReport[];
  semantic_review: MasterBlueprintSemanticReviewReport | null;
};

export type UniversityBlueprintSection = {
  section_key: string;
  title: string;
  content: string;
  derived_from_master_keys: string[];
  generated_for_template: boolean;
};

export type UniversityBlueprintPackage = {
  template_key: string;
  template_name: string;
  template_version_id: string;
  sections: UniversityBlueprintSection[];
  warnings: string[];
};

export type MasterBlueprintPackage = {
  manifest: BlueprintRunManifest;
  source_gate: SourceIntakeGateResult;
  acquisition: EvidenceAcquisitionResult;
  pdf_downloads: PdfDownloadResult;
  evidence_ledger: EvidenceLedger;
  master_template: MasterTemplateRuntime;
  section_prompt_plan: SectionPromptPlan;
  master_section_drafts: MasterSectionDraft[];
  consistency_matrix: ConsistencyMatrixRow[];
  provenance_report: DocumentProvenanceReport;
  validation_report: MasterBlueprintValidationReport;
  legacy_blueprint: ResearchBlueprintRecord;
  university_blueprint: UniversityBlueprintPackage;
};
