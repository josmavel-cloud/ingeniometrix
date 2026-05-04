import type { ArtifactRef } from "@/server/blueprint-engine/contracts/artifact-ref";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type EvidenceHandoffReadiness = "alta" | "media" | "baja" | "blocked";
export type EvidenceHandoffQualityStatus = "pass" | "warn" | "blocked";

export type EvidenceHandoffQualityGate = {
  status: EvidenceHandoffQualityStatus;
  warnings: string[];
  blockers: string[];
};

export type EvidenceHandoffProjectContext = {
  language: "es";
  country_context: "PE" | string;
  degree_level: string;
  target_template_key?: string | null;
  master_template_key: "MASTER_TEMPLATE_LATAM";
  topic: string;
  problem_context?: string | null;
  research_line?: string | null;
  methodology_preference?: string | null;
  population_or_context?: string | null;
  constraints?: string | null;
  academic_program?: string | null;
  university?: string | null;
  advisor_or_user_notes?: string | null;
  normalized_problem_core?: string | null;
  retrieval_brief?: string | null;
};

export type SourceMaterializationRefs = {
  extracted_text_refs: ArtifactRef[];
  chunk_refs: ArtifactRef[];
  pdf_refs: ArtifactRef[];
  derived_asset_refs: ArtifactRef[];
};

export type SourceCitationMetadata = {
  citation_key?: string | null;
  apa7?: string | null;
  bibtex?: string | null;
  ris?: string | null;
  raw?: JsonValue;
};

export type SourceHandoffRecord = {
  source_id: string;
  reference_id: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  openalex_id: string | null;
  crossref_id: string | null;
  is_open_access: boolean;
  selected_order: number | null;
  eligible_for_formal_reference: boolean;
  citation_metadata: SourceCitationMetadata;
  materialization_refs: SourceMaterializationRefs;
};

export type EvidenceUnitType =
  | "original_excerpt"
  | "table"
  | "image"
  | "equation"
  | "interpreted_signal"
  | "context_only";

export type EvidenceCitationEligibility =
  | "direct_quote"
  | "paraphrase_only"
  | "asset_reference"
  | "not_citable";

export type EvidenceClaimScope =
  | "source_fact"
  | "method_context"
  | "theoretical_context"
  | "background_context"
  | "assumption_only"
  | "do_not_claim";

export type EvidenceUnitHandoffRecord = {
  evidence_id: string;
  source_id: string;
  unit_type: EvidenceUnitType;
  section_keys: string[];
  label: string;
  original_text: string | null;
  summary_es: string | null;
  page_start: number | null;
  page_end: number | null;
  char_start: number | null;
  char_end: number | null;
  quote_hash: string | null;
  asset_key?: string | null;
  asset_ref?: ArtifactRef | null;
  caption?: string | null;
  original_language: string | null;
  citation_eligibility: EvidenceCitationEligibility;
  confidence: number;
  relevance_score: number;
  claim_scope: EvidenceClaimScope;
};

export type SectionPacketHandoffRecord = {
  section_key: string;
  readiness: EvidenceHandoffReadiness;
  summary: string | null;
  source_ids: string[];
  snippet_ids: string[];
  evidence_ids: string[];
  asset_keys: string[];
  key_points: string[];
  open_questions: string[];
  missing_elements: string[];
  do_not_claim: string[];
  assumptions_allowed: string[];
  recommended_chunk_refs: ArtifactRef[];
  required_original_fragments: string[];
};

export type AssetHandoffKind = "figure" | "image" | "table" | "equation";
export type AssetExtractionOrigin = "pdf_native" | "llm_reconstructed" | "provider_metadata";

export type AssetHandoffRecord = {
  asset_key: string;
  source_id: string;
  asset_kind: AssetHandoffKind;
  title: string | null;
  caption: string | null;
  page_number: number | null;
  text_content: string | null;
  latex?: string | null;
  file_ref: ArtifactRef | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  content_hash: string | null;
  extraction_origin: AssetExtractionOrigin;
  citation_eligibility: EvidenceCitationEligibility;
  recommended_section_keys: string[];
  usage_reason: string | null;
  handling_notes: string[];
};

export type EvidenceHandoffAssumption = {
  assumption_id: string;
  statement: string;
  reason: string;
  section_keys: string[];
};

export type EvidenceHandoffProposalContext = {
  method_candidate: JsonValue;
  framework_candidate: JsonValue;
  dominant_methods: JsonValue[];
  dominant_frameworks: JsonValue[];
  key_findings: JsonValue[];
  evidence_gaps: string[];
  followup_requirements: JsonValue;
  gap_resolution_plan: JsonValue;
  context_preservation_contract?: JsonValue;
};

export type EvidenceHandoffTraceability = {
  source_artifacts: ArtifactRef[];
  immutable_snapshot_hash: string;
};

export type EvidenceEngineHandoffV1 = {
  handoff_id: string;
  handoff_version: "evidence_engine_handoff.v1";
  project_id: string;
  evidence_run_id: string;
  created_at: string;
  source_engine: "EvidenceEngine";
  source_engine_version: string;
  artifact_hash: string;
  readiness: EvidenceHandoffReadiness;
  quality_gate: EvidenceHandoffQualityGate;
  warnings: string[];
  source_snapshot: ArtifactRef[];
  project_context: EvidenceHandoffProjectContext;
  source_registry: SourceHandoffRecord[];
  evidence_units: EvidenceUnitHandoffRecord[];
  section_packets: SectionPacketHandoffRecord[];
  weak_section_packets: SectionPacketHandoffRecord[];
  source_priorities: JsonValue[];
  asset_registry: AssetHandoffRecord[];
  asset_usage_plan: JsonValue[];
  materialized_content_refs: ArtifactRef[];
  chunk_index_refs: ArtifactRef[];
  proposal_context: EvidenceHandoffProposalContext;
  assumptions: EvidenceHandoffAssumption[];
  traceability: EvidenceHandoffTraceability;
};

