import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { IntakeInput } from "@/server/projects/project-validation";
import type {
  BlueprintLaunchIntakeImprovementResult,
  BlueprintLaunchProjectGlobalContext,
  BlueprintLaunchProjectSnapshot,
} from "./step1-intake-context";

export type BlueprintLaunchSavedIntakeSnapshot = {
  savedAt: string;
  status: string;
  intake: IntakeInput;
  derivedSearchQuery: string | null;
  projectContext: {
    knowledgeAreaLabel: string | null;
  };
};

export type BlueprintLaunchSavedIntakeOriginalSnapshot = {
  savedAt: string;
  status: string;
  intake: IntakeInput;
  projectContext: {
    knowledgeAreaLabel: string | null;
  };
};

export type BlueprintLaunchKeywordGroup = {
  label: string;
  variants: string[];
};

export type BlueprintLaunchSearchMetadata = {
  planSource: "llm" | "fallback";
  plannerStatus: "llm" | "fallback";
  plannerErrorStage: string | null;
  plannerErrorMessage: string | null;
  knowledgeArea: string | null;
  subdomain: string;
  primarySystem: string;
  primaryPhenomenon: string;
  primaryGoal: string;
  normalizedTopic: string;
  intentSummary: string;
  keywordGroups: {
    necessary: BlueprintLaunchKeywordGroup[];
    complementary: BlueprintLaunchKeywordGroup[];
    optional: BlueprintLaunchKeywordGroup[];
  };
  queryPack: {
    necessaryOnly: string[];
    complementaryBoosted: string[];
    optionalBackups: string[];
  };
  focusTerms: string[];
  scoringRules: string[];
};

export type BlueprintLaunchReferenceScoreBreakdown = {
  label: "ALTO" | "MEDIO" | "MINIMO" | "BAJO";
  necessaryMatches: string[];
  complementaryMatches: string[];
  optionalMatches: string[];
  recencyBand: string;
  recencyBonus: number;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
};

export type BlueprintLaunchReferenceListItem = {
  id: string;
  selected: boolean;
  selectedOrder: number | null;
  relevanceScore: number | null;
  scoreBreakdown: BlueprintLaunchReferenceScoreBreakdown | null;
  reference: {
    id: string;
    title: string;
    translatedTitle: string | null;
    doi: string | null;
    year: number | null;
    venue: string | null;
    abstract: string | null;
    translatedAbstract: string | null;
    landingPageUrl: string | null;
    authorsJson: string[];
    sourceLanguage: string | null;
    displayLanguage: string;
    hasAutoTranslation: boolean;
    pdfUrl: string | null;
    pdfAccessible: boolean;
  };
};

export type BlueprintLaunchSearchSnapshot = {
  savedAt: string;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  metadata: BlueprintLaunchSearchMetadata | null;
  references: BlueprintLaunchReferenceListItem[];
};

export type BlueprintLaunchSelectedSourceBundleItem = {
  selectedOrder: number;
  relevanceScore: number | null;
  scoreLabel: BlueprintLaunchReferenceScoreBreakdown["label"] | null;
  reference: BlueprintLaunchReferenceListItem["reference"];
};

export type BlueprintLaunchSelectedSourceBundle = {
  savedAt: string;
  manifestPath: string;
  selectedCount: number;
  pdfLinkedCount: number;
  searchQuery: string | null;
  intakeTopic: string | null;
  sources: BlueprintLaunchSelectedSourceBundleItem[];
};

export type BlueprintLaunchSourceAccessStatus =
  | "complete_public"
  | "partial_public"
  | "metadata_only"
  | "unresolved";

export type BlueprintLaunchSourceAccessKind =
  | "pdf"
  | "web_fulltext"
  | "repository_fulltext"
  | "html_article"
  | "landing_only"
  | "abstract_only"
  | "unknown";

export type BlueprintLaunchSourceAccessAttempt = {
  step: string;
  url: string | null;
  outcome: "ok" | "redirect" | "error" | "candidate" | "skipped";
  detail: string;
};

export type BlueprintLaunchSourceAccessCandidateSummary = {
  url: string;
  label: string;
  score: number;
  origin: "seed" | "meta" | "anchor" | "regex" | "derived";
};

export type BlueprintLaunchLlmPromptRecord = {
  label: string;
  schemaName: string;
  model: string;
  trackingLabel: string;
  promptTemplate: string;
  promptText: string;
  sourceId: string | null;
  sourceTitle: string | null;
};

export type BlueprintLaunchSourceAccessResolutionItem = {
  sourceId: string;
  title: string;
  status: BlueprintLaunchSourceAccessStatus;
  kind: BlueprintLaunchSourceAccessKind;
  resolvedContentUrl: string | null;
  finalUrl: string | null;
  resolvedVia: string;
  languageDetected: string | null;
  confidence: number;
  hasCompletePublicContent: boolean;
  candidateSummary: BlueprintLaunchSourceAccessCandidateSummary[];
  attempts: BlueprintLaunchSourceAccessAttempt[];
  warnings: string[];
};

export type BlueprintLaunchSourceAccessResolutionResult = {
  savedAt: string;
  summary: string;
  completePublicCount: number;
  partialPublicCount: number;
  metadataOnlyCount: number;
  unresolvedCount: number;
  llmPromptCount: number;
  llmPrompts: BlueprintLaunchLlmPromptRecord[];
  items: BlueprintLaunchSourceAccessResolutionItem[];
};

export type BlueprintLaunchSourceIntakeGateDecision =
  | "PASS"
  | "PASS_WITH_WARNINGS"
  | "BLOCK";

export type BlueprintLaunchSourceIntakeGateResult = {
  savedAt: string;
  decision: BlueprintLaunchSourceIntakeGateDecision;
  summary: string;
  nextStepRecommendation: string;
  selectedCount: number;
  highOrMediumCount: number;
  abstractCount: number;
  doiOrLandingCount: number;
  completePublicContentCount: number;
  partialPublicContentCount: number;
  averageRelevanceScore: number;
  warnings: string[];
  blockingReasons: string[];
};

export type BlueprintLaunchEvidenceCompletionCard = {
  referenceId: string;
  title: string;
  evidenceSource: "abstract_metadata" | "metadata_only";
  llmStatus: "llm" | "fallback" | "skipped";
  detectedLanguage: string | null;
  applicabilityToProject: "directa" | "parcial" | "debil";
  usefulnessLabel: "usable" | "weak_support" | "off_topic";
  whyRelevant: string;
  supportsSectionKeys: string[];
  methodologyHints: string[];
  frameworkHints: string[];
  decisionValue: string;
  intakeCoverage: string[]; 
  methodSignals: string[];
  contextSignals: string[];
  variableSignals: string[];
  evidenceLimits: string[];
  qualityFlags: string[];
};

export type BlueprintLaunchEvidenceCompletionResult = {
  savedAt: string;
  decision: "RUN" | "SKIP";
  reason: string;
  selectedCount: number;
  completePublicContentCount: number;
  completedFromAbstractCount: number;
  completedFromMetadataCount: number;
  usableCount: number;
  weakSupportCount: number;
  offTopicCount: number;
  methodologySupportCount: number;
  frameworkSupportCount: number;
  cards: BlueprintLaunchEvidenceCompletionCard[];
};

export type BlueprintLaunchEvidencePlanningDecision = "PASS" | "PASS_WITH_WARNINGS" | "BLOCK";

export type BlueprintLaunchEvidencePlanningReadiness = "alta" | "media" | "baja";

export type BlueprintLaunchEvidencePlanningMaterializationItem = {
  sourceId: string;
  title: string;
  expectedKind: "pdf" | "web_text" | "repository_fulltext" | "unknown";
  resolverFamily:
    | "openalex_pdf"
    | "publisher_pdf"
    | "dspace"
    | "figshare"
    | "doi_redirect"
    | "html_fulltext"
    | "metadata_only"
    | "unknown";
  contentUrl: string | null;
  priority: "high" | "medium" | "low";
  languageDetected: string | null;
  accessKind: BlueprintLaunchSourceAccessKind;
  riskFlags: string[];
  validationNotes: string[];
};

export type BlueprintLaunchEvidencePlanningSourceCard = {
  sourceId: string;
  title: string;
  year: number | null;
  scoreLabel: BlueprintLaunchReferenceScoreBreakdown["label"] | null;
  relevanceScore: number | null;
  detectedLanguage: string | null;
  accessStatus: BlueprintLaunchSourceAccessStatus;
  accessKind: BlueprintLaunchSourceAccessKind;
  resolverFamily: BlueprintLaunchEvidencePlanningMaterializationItem["resolverFamily"];
  contentUrl: string | null;
  topicRelevance: "directa" | "parcial" | "debil";
  proposalUsefulness: "alta" | "media" | "baja";
  sourceRole: string;
  supportsSectionKeys: string[];
  methodologyHints: string[];
  frameworkHints: string[];
  extractionFocus: string[];
  expectedEvidenceTypes: Array<"text" | "equations" | "tables" | "figures" | "references">;
  riskFlags: string[];
  qualityFlags: string[];
};

export type BlueprintLaunchEvidencePlanningSectionCoverage = {
  sectionKey:
    | "background"
    | "problem_statement"
    | "justification"
    | "objectives"
    | "methodology"
    | "theoretical_or_technical_framework"
    | "proposal_scope"
    | "limitations";
  readiness: BlueprintLaunchEvidencePlanningReadiness;
  readinessBasis: "metadata_potential" | "llm_planned" | "extracted_evidence";
  candidateSourceCount: number;
  sourceIds: string[];
  evidenceTargets: string[];
  missingElements: string[];
};

export type BlueprintLaunchEvidencePlanningDownstreamState = {
  invalidatedDuringRun: boolean;
  contentMaterializationIsStale: boolean;
  sourceSignalExtractionIsStale: boolean;
  evidencePacksArtifactIsStale: boolean;
  consolidatedEvidenceArtifactIsStale: boolean;
  staleReasons: string[];
  sourceAccessSavedAt: string | null;
  contentMaterializationSavedAt: string | null;
  sourceSignalExtractionSavedAt: string | null;
  evidencePacksGeneratedAt: string | null;
  consolidatedEvidenceGeneratedAt: string | null;
};

export type BlueprintLaunchEvidencePlanningResult = {
  savedAt: string;
  decision: BlueprintLaunchEvidencePlanningDecision;
  summary: string;
  llmStatus: "llm" | "fallback" | "skipped";
  llmPromptCount: number;
  llmCallCount: number;
  llmPrompts: BlueprintLaunchLlmPromptRecord[];
  sourceCount: number;
  completePublicContentCount: number;
  pdfPlanCount: number;
  webPlanCount: number;
  blockedSourceCount: number;
  materializationPlan: BlueprintLaunchEvidencePlanningMaterializationItem[];
  sourceCards: BlueprintLaunchEvidencePlanningSourceCard[];
  sectionCoverage: BlueprintLaunchEvidencePlanningSectionCoverage[];
  downstreamState: BlueprintLaunchEvidencePlanningDownstreamState;
  nextStepRecommendation: string;
  operationalWarnings: string[];
  evidenceWarnings: string[];
  warnings: string[];
};

export type BlueprintLaunchContentMaterializationItem = {
  sourceId: string;
  title: string;
  accessKind: BlueprintLaunchSourceAccessKind;
  resolvedContentUrl: string | null;
  materializationStatus: "downloaded" | "captured" | "skipped" | "failed";
  storedKind: "pdf" | "html" | "text" | "unknown";
  localPrimaryPath: string | null;
  localTextPath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  languageDetected: string | null;
  resolverFamily?: BlueprintLaunchEvidencePlanningMaterializationItem["resolverFamily"];
  expectedKind?: BlueprintLaunchEvidencePlanningMaterializationItem["expectedKind"];
  validationChecks?: string[];
  warnings: string[];
};

export type BlueprintLaunchContentMaterializationResult = {
  savedAt: string;
  summary: string;
  runDir: string | null;
  manifestPath: string | null;
  latestManifestPath: string | null;
  attemptedCount: number;
  materializedCount: number;
  pdfCount: number;
  webCount: number;
  failedCount: number;
  skippedCount: number;
  totalByteSize: number;
  readyForStep5: boolean;
  items: BlueprintLaunchContentMaterializationItem[];
};

export type EvidenceSnippet = {
  snippet_id: string;
  source_id: string | null;
  origin: "source" | "pdf" | "websearch" | "assumption_backed" | "intake";
  label: string;
  text: string;
  extraction_kind?:
    | "metadata"
    | "intake"
    | "original_excerpt"
    | "llm_selected_original"
    | "interpreted_signal";
  original_text?: string;
  interpretation_es?: string | null;
  source_chunk_id?: string | null;
  page_number?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  char_start?: number | null;
  char_end?: number | null;
  original_language?: string | null;
  quote_hash?: string | null;
  text_char_count?: number;
  section_hint_keys: string[];
  relevance_score?: number | null;
  confidence: number;
};

export type EvidenceSourceChunk = {
  chunk_id: string;
  source_id: string;
  page_start: number | null;
  page_end: number | null;
  char_start: number | null;
  char_end: number | null;
  original_language: string | null;
  original_text: string;
  text_char_count: number;
  quote_hash: string;
  section_hint_keys: string[];
  relevance_score: number;
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

export type ExtractedEvidencePack = {
  source_id: string;
  source_text_path?: string | null;
  source_chunks_path?: string | null;
  source_text_char_count?: number;
  source_chunk_count?: number;
  selected_original_snippet_count?: number;
  interpreted_signal_count?: number;
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

export type EvidencePackArtifact = {
  artifact_type: "evidence_packs";
  artifact_version: "v1";
  generated_at: string;
  extraction_mode: "rule_based" | "llm_structured" | "hybrid";
  project_context: {
    project_title: string;
    intake_topic: string;
  };
  packs: ExtractedEvidencePack[];
  warnings: string[];
};

export type BlueprintLaunchSignalExtractionSource = {
  sourceId: string;
  title: string;
  inputMode: "pdf" | "web_text" | "abstract_metadata";
  primaryPath: string | null;
  secondaryPath: string | null;
  extractedTextPath: string | null;
  sourceChunksPath: string | null;
  sourceChunkCount: number;
  pageCount: number | null;
  textCharCount: number;
  detectedLanguage: string | null;
  sourceOverview: string | null;
  topicRelevance: "directa" | "parcial" | "debil";
  proposalUsefulness: "alta" | "media" | "baja";
  supportsSectionKeys: string[];
  methodologyHints: string[];
  frameworkHints: string[];
  problemSignal: string | null;
  methodSignal: string | null;
  contextSignal: string | null;
  findingSignal: string | null;
  limitationSignal: string | null;
  futureLineSignal: string | null;
  abstractSummary: string | null;
  pdfSummary: string | null;
  pdfSectionsAvailable: string[];
  snippetCount: number;
  originalSnippetCount: number;
  interpretedSignalCount: number;
  assetCount: number;
  equationAssetCount: number;
  tableAssetCount: number;
  imageAssetCount: number;
  warnings: string[];
};

export type BlueprintLaunchSignalExtractionResult = {
  savedAt: string;
  extractionMode: "rule_based" | "llm_structured" | "hybrid";
  llmStatus: "llm" | "fallback" | "skipped" | "hybrid";
  llmPromptCount: number;
  llmCallCount: number;
  llmPrompts: BlueprintLaunchLlmPromptRecord[];
  runDir: string | null;
  readyForStep6: boolean;
  summary: string;
  sourceCount: number;
  textExtractionCount: number;
  totalTextCharCount: number;
  pdfInputCount: number;
  webInputCount: number;
  abstractOnlyCount: number;
  totalSnippetCount: number;
  totalAssetCount: number;
  equationAssetCount: number;
  tableAssetCount: number;
  imageAssetCount: number;
  sources: BlueprintLaunchSignalExtractionSource[];
  warnings: string[];
};

export type ConsolidatedEvidenceSectionReadiness = {
  section_key: string;
  readiness: "alta" | "media" | "baja";
  enough_to_draft: boolean;
  source_count: number;
  snippet_count: number;
  asset_count: number;
  missing_elements: string[];
  recommended_source_ids: string[];
};

export type ConsolidatedEvidenceSectionInputPacket = {
  section_key: string;
  summary: string;
  source_ids: string[];
  snippet_ids: string[];
  asset_keys: string[];
  key_points: string[];
  open_questions: string[];
};

export type ConsolidatedEvidenceSourcePriority = {
  source_id: string;
  title: string;
  priority: "alta" | "media" | "baja";
  reason: string;
};

export type ConsolidatedEvidenceProposalMethodCandidate = {
  method_family: string | null;
  research_design: string | null;
  application_scope_status: "fuerte" | "parcial" | "debil";
  candidate_techniques: string[];
  selection_rationale: string[];
  evidence_support_level: "alto" | "medio" | "bajo";
  missing_validations: string[];
};

export type ConsolidatedEvidenceProposalFrameworkCandidate = {
  core_framework: string | null;
  supporting_frameworks: string[];
  selection_rationale: string[];
  missing_validations: string[];
};

export type ConsolidatedEvidenceWeakSectionCompletionPacket = {
  section_key: string;
  draftability_status:
    | "directly_supported"
    | "inferable_with_care"
    | "blocked_by_missing_evidence";
  evidence_backed_points: string[];
  inference_bridges: string[];
  assumptions_needed: string[];
  missing_evidence: string[];
};

export type ConsolidatedEvidenceUnit = {
  evidence_id: string;
  source_id: string;
  source_title: string;
  unit_type:
    | "original_excerpt"
    | "interpreted_signal"
    | "table"
    | "equation"
    | "image"
    | "intake_context";
  section_keys: string[];
  label: string;
  original_text: string | null;
  summary_es: string | null;
  page_start: number | null;
  page_end: number | null;
  char_start: number | null;
  char_end: number | null;
  quote_hash: string | null;
  asset_key: string | null;
  asset_path: string | null;
  caption: string | null;
  original_language: string | null;
  citation_eligibility:
    | "direct_quote"
    | "paraphrase_only"
    | "asset_reference"
    | "context_only";
  confidence: number;
  relevance_score: number | null;
};

export type ConsolidatedEvidenceClaimCandidate = {
  claim_es: string;
  evidence_unit_ids: string[];
  support_level: "fuerte" | "medio" | "debil";
};

export type ConsolidatedEvidenceSectionDossier = {
  section_key: string;
  section_label_es: string;
  readiness: "alta" | "media" | "baja";
  drafting_strategy: string;
  evidence_unit_ids: string[];
  primary_source_ids: string[];
  claim_candidates: ConsolidatedEvidenceClaimCandidate[];
  useful_assets: string[];
  citation_plan: string[];
  assumptions_allowed: string[];
  missing_evidence: string[];
  do_not_claim: string[];
};

export type ConsolidatedEvidenceAssetUsagePlanItem = {
  asset_key: string;
  source_id: string;
  section_key: string;
  asset_kind: "image" | "equation" | "table";
  usage_reason: string;
  handling_notes: string[];
};

export type ConsolidatedEvidenceGapResolutionPlan = {
  inferable_with_care: string[];
  blocking_gaps: string[];
  validation_actions: string[];
  do_not_claim: string[];
};

export type ConsolidatedEvidenceDownstreamHandoffManifest = {
  state_file: string;
  consolidated_evidence_artifact_path: string | null;
  latest_consolidated_evidence_artifact_path: string | null;
  source_signal_extraction_run_dir: string | null;
  read_only_input_paths: string[];
  next_lab_should_read: string[];
  next_lab_should_not_modify: string[];
  usage_notes_es: string[];
};

export type ConsolidatedEvidenceQualityGate = {
  status: "pass" | "warn" | "block";
  ready_for_steps_7_11: boolean;
  checks: Array<{
    check_key: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }>;
  unsupported_claims: string[];
  traceability_warnings: string[];
  handoff_notes: string[];
};

export type ConsolidatedEvidenceContextPreservationContract = {
  policy: "lossless_artifact_storage_prompt_compaction_only";
  full_context_is_preserved: boolean;
  prompt_compaction_is_reversible: boolean;
  next_llm_waves_must_hydrate_from_paths: boolean;
  source_count: number;
  source_chunk_count: number;
  full_text_char_count: number;
  evidence_unit_count: number;
  direct_quote_count: number;
  asset_reference_count: number;
  preserved_path_count: number;
  hydration_notes_es: string[];
};

export type ConsolidatedEvidenceQualityComparisonSnapshot = {
  generated_at: string | null;
  artifact_path: string | null;
  evidence_unit_count: number;
  direct_quote_count: number;
  asset_reference_count: number;
  interpreted_signal_count: number;
  source_count: number;
  section_dossier_count: number;
  ready_section_count: number;
  partial_section_count: number;
  low_section_count: number;
  prompt_char_count: number;
  llm_call_count: number;
  sections: Array<{
    section_key: string;
    evidence_unit_count: number;
    direct_quote_count: number;
    asset_count: number;
    missing_evidence_count: number;
    claim_count: number;
  }>;
};

export type ConsolidatedEvidenceQualityComparison = {
  baseline_available: boolean;
  status: "pass" | "warn" | "regression";
  baseline: ConsolidatedEvidenceQualityComparisonSnapshot | null;
  current: ConsolidatedEvidenceQualityComparisonSnapshot;
  deltas: {
    evidence_unit_count: number;
    direct_quote_count: number;
    asset_reference_count: number;
    source_count: number;
    ready_section_count: number;
    prompt_char_count: number;
    llm_call_count: number;
  };
  warnings: string[];
};

export type ConsolidatedEvidenceArtifact = {
  artifact_type: "consolidated_evidence";
  artifact_version: "v1" | "v2";
  generated_at: string;
  consolidation_mode: "rule_based" | "llm_structured" | "hybrid";
  llm_status?: "llm" | "fallback" | "skipped" | "hybrid";
  llm_prompt_count?: number;
  llm_call_count?: number;
  llm_prompts?: BlueprintLaunchLlmPromptRecord[];
  summary?: string;
  run_dir?: string | null;
  artifact_path?: string | null;
  latest_artifact_path?: string | null;
  project_context: {
    project_title: string;
    intake_topic: string;
  };
  coverage_map: {
    overall_readiness: "alta" | "media" | "baja";
    ready_section_count: number;
    partial_section_count: number;
    low_section_count: number;
    section_keys_ready: string[];
    section_keys_partial: string[];
    section_keys_low: string[];
  };
  dominant_methods: string[];
  dominant_frameworks: string[];
  key_findings: string[];
  evidence_gaps: string[];
  proposal_directions: string[];
  proposal_method_candidate: ConsolidatedEvidenceProposalMethodCandidate;
  proposal_framework_candidate: ConsolidatedEvidenceProposalFrameworkCandidate;
  section_readiness_map: ConsolidatedEvidenceSectionReadiness[];
  section_input_packets: ConsolidatedEvidenceSectionInputPacket[];
  weak_section_completion_packets: ConsolidatedEvidenceWeakSectionCompletionPacket[];
  source_priorities: ConsolidatedEvidenceSourcePriority[];
  followup_requirements: {
    blocking: string[];
    recommended: string[];
    optional: string[];
  };
  evidence_units?: ConsolidatedEvidenceUnit[];
  section_dossiers?: ConsolidatedEvidenceSectionDossier[];
  methodology_decision_packet?: ConsolidatedEvidenceProposalMethodCandidate;
  framework_decision_packet?: ConsolidatedEvidenceProposalFrameworkCandidate;
  asset_usage_plan?: ConsolidatedEvidenceAssetUsagePlanItem[];
  gap_resolution_plan?: ConsolidatedEvidenceGapResolutionPlan;
  downstream_handoff_manifest?: ConsolidatedEvidenceDownstreamHandoffManifest;
  quality_gate?: ConsolidatedEvidenceQualityGate;
  context_preservation_contract?: ConsolidatedEvidenceContextPreservationContract;
  quality_comparison?: ConsolidatedEvidenceQualityComparison;
  warnings: string[];
};

export type BlueprintLaunchLocalState = {
  projectSnapshot: BlueprintLaunchProjectSnapshot | null;
  savedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot | null;
  intakeImprovementResult: BlueprintLaunchIntakeImprovementResult | null;
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot | null;
  searchSnapshot: BlueprintLaunchSearchSnapshot | null;
  selectedSourcesBundle: BlueprintLaunchSelectedSourceBundle | null;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult | null;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult | null;
  evidenceCompletion: BlueprintLaunchEvidenceCompletionResult | null;
  evidencePlanning: BlueprintLaunchEvidencePlanningResult | null;
  contentMaterialization: BlueprintLaunchContentMaterializationResult | null;
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult | null;
  evidencePacksArtifact: EvidencePackArtifact | null;
  consolidatedEvidenceArtifact: ConsolidatedEvidenceArtifact | null;
};

const STATE_DIR = path.join(process.cwd(), "artifacts-local", "blueprint_launch");
const STATE_FILE = path.join(STATE_DIR, "lab-state.json");

async function ensureStateDir() {
  await mkdir(STATE_DIR, { recursive: true });
}

export async function readBlueprintLaunchLocalState(): Promise<BlueprintLaunchLocalState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<BlueprintLaunchLocalState>;
    const savedIntake = parsed.savedIntake
      ? {
          ...parsed.savedIntake,
          projectContext: {
            knowledgeAreaLabel: parsed.savedIntake.projectContext?.knowledgeAreaLabel ?? null,
          },
        }
      : null;

    return {
      projectSnapshot: parsed.projectSnapshot ?? null,
      savedIntakeOriginal: parsed.savedIntakeOriginal ?? null,
      intakeImprovementResult: parsed.intakeImprovementResult ?? null,
      projectGlobalContext: parsed.projectGlobalContext ?? null,
      savedIntake,
      searchSnapshot: parsed.searchSnapshot ?? null,
      selectedSourcesBundle: parsed.selectedSourcesBundle ?? null,
      sourceAccessResolution: parsed.sourceAccessResolution ?? null,
      sourceIntakeGate: parsed.sourceIntakeGate ?? null,
      evidenceCompletion: parsed.evidenceCompletion ?? null,
      evidencePlanning: parsed.evidencePlanning ?? null,
      contentMaterialization: parsed.contentMaterialization ?? null,
      sourceSignalExtraction: parsed.sourceSignalExtraction ?? null,
      evidencePacksArtifact: parsed.evidencePacksArtifact ?? null,
      consolidatedEvidenceArtifact: parsed.consolidatedEvidenceArtifact ?? null,
    };
  } catch {
    return {
      projectSnapshot: null,
      savedIntakeOriginal: null,
      intakeImprovementResult: null,
      projectGlobalContext: null,
      savedIntake: null,
      searchSnapshot: null,
      selectedSourcesBundle: null,
      sourceAccessResolution: null,
      sourceIntakeGate: null,
      evidenceCompletion: null,
      evidencePlanning: null,
      contentMaterialization: null,
      sourceSignalExtraction: null,
      evidencePacksArtifact: null,
      consolidatedEvidenceArtifact: null,
    };
  }
}

export async function writeBlueprintLaunchLocalState(
  state: BlueprintLaunchLocalState,
) {
  await ensureStateDir();
  await writeFile(`${STATE_FILE}`, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function saveBlueprintLaunchIntakeSnapshot(
  snapshot: BlueprintLaunchSavedIntakeSnapshot,
) {
  await writeBlueprintLaunchLocalState({
    projectSnapshot: null,
    savedIntakeOriginal: null,
    intakeImprovementResult: null,
    projectGlobalContext: null,
    savedIntake: snapshot,
    searchSnapshot: null,
    selectedSourcesBundle: null,
    sourceAccessResolution: null,
    sourceIntakeGate: null,
    evidenceCompletion: null,
    evidencePlanning: null,
    contentMaterialization: null,
    sourceSignalExtraction: null,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
  });
}

export async function saveBlueprintLaunchStep1State(input: {
  projectSnapshot: BlueprintLaunchProjectSnapshot;
  savedIntakeOriginal: BlueprintLaunchSavedIntakeOriginalSnapshot;
  intakeImprovementResult: BlueprintLaunchIntakeImprovementResult;
  projectGlobalContext: BlueprintLaunchProjectGlobalContext;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  preserveExistingArtifacts?: boolean;
}) {
  const current = input.preserveExistingArtifacts
    ? await readBlueprintLaunchLocalState()
    : null;
  await writeBlueprintLaunchLocalState({
    projectSnapshot: input.projectSnapshot,
    savedIntakeOriginal: input.savedIntakeOriginal,
    intakeImprovementResult: input.intakeImprovementResult,
    projectGlobalContext: input.projectGlobalContext,
    savedIntake: input.savedIntake,
    searchSnapshot: current?.searchSnapshot ?? null,
    selectedSourcesBundle: current?.selectedSourcesBundle ?? null,
    sourceAccessResolution: current?.sourceAccessResolution ?? null,
    sourceIntakeGate: current?.sourceIntakeGate ?? null,
    evidenceCompletion: current?.evidenceCompletion ?? null,
    evidencePlanning: current?.evidencePlanning ?? null,
    contentMaterialization: current?.contentMaterialization ?? null,
    sourceSignalExtraction: current?.sourceSignalExtraction ?? null,
    evidencePacksArtifact: current?.evidencePacksArtifact ?? null,
    consolidatedEvidenceArtifact: current?.consolidatedEvidenceArtifact ?? null,
  });
}

export async function saveBlueprintLaunchSearchSnapshot(
  snapshot: BlueprintLaunchSearchSnapshot,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    searchSnapshot: snapshot,
    selectedSourcesBundle: null,
    sourceAccessResolution: null,
    sourceIntakeGate: null,
    evidenceCompletion: null,
    evidencePlanning: null,
    contentMaterialization: null,
    sourceSignalExtraction: null,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
    savedIntake: current.savedIntake
      ? {
          ...current.savedIntake,
          derivedSearchQuery: snapshot.searchQuery,
        }
      : current.savedIntake,
  });
}

export function applySelectionState(
  references: BlueprintLaunchReferenceListItem[],
  selectedReferenceIds: string[],
) {
  let order = 1;
  const selectedSet = new Set(selectedReferenceIds);

  return references.map((item) => {
    const selected = selectedSet.has(item.reference.id);

    return {
      ...item,
      selected,
      selectedOrder: selected ? order++ : null,
    };
  });
}

export async function updateBlueprintLaunchSelectedReferences(
  selectedReferenceIds: string[],
) {
  const current = await readBlueprintLaunchLocalState();

  if (!current.searchSnapshot) {
    throw new Error("Todavia no hay una busqueda local para guardar.");
  }

  const updatedReferences = applySelectionState(
    current.searchSnapshot.references,
    selectedReferenceIds,
  );

  const nextSnapshot: BlueprintLaunchSearchSnapshot = {
    ...current.searchSnapshot,
    references: updatedReferences,
    savedAt: new Date().toISOString(),
  };

  await writeBlueprintLaunchLocalState({
    ...current,
    searchSnapshot: nextSnapshot,
    sourceAccessResolution: null,
    sourceIntakeGate: null,
    evidenceCompletion: null,
    evidencePlanning: null,
    contentMaterialization: null,
    sourceSignalExtraction: null,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
  });

  return nextSnapshot;
}

export async function saveBlueprintLaunchSelectedSourcesBundle(
  bundle: BlueprintLaunchSelectedSourceBundle,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    selectedSourcesBundle: bundle,
  });
}

export async function saveBlueprintLaunchSourceAccessResolution(
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    sourceAccessResolution,
    evidenceCompletion: null,
    evidencePlanning: null,
    contentMaterialization: null,
    sourceSignalExtraction: null,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
  });
}

export async function saveBlueprintLaunchSourceIntakeGate(
  gate: BlueprintLaunchSourceIntakeGateResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    sourceIntakeGate: gate,
  });
}

export async function saveBlueprintLaunchEvidenceCompletion(
  evidenceCompletion: BlueprintLaunchEvidenceCompletionResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    evidenceCompletion,
  });
}

export async function saveBlueprintLaunchEvidencePlanning(
  evidencePlanning: BlueprintLaunchEvidencePlanningResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    evidenceCompletion: null,
    evidencePlanning,
    contentMaterialization: evidencePlanning.downstreamState.contentMaterializationIsStale
      ? null
      : current.contentMaterialization,
    sourceSignalExtraction: evidencePlanning.downstreamState.sourceSignalExtractionIsStale
      ? null
      : current.sourceSignalExtraction,
    evidencePacksArtifact: evidencePlanning.downstreamState.evidencePacksArtifactIsStale
      ? null
      : current.evidencePacksArtifact,
    consolidatedEvidenceArtifact: evidencePlanning.downstreamState.consolidatedEvidenceArtifactIsStale
      ? null
      : current.consolidatedEvidenceArtifact,
  });
}

export async function saveBlueprintLaunchContentMaterialization(
  contentMaterialization: BlueprintLaunchContentMaterializationResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    contentMaterialization,
    sourceSignalExtraction: null,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
  });
}

export async function saveBlueprintLaunchSourceSignalExtraction(
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    sourceSignalExtraction,
    evidencePacksArtifact: null,
    consolidatedEvidenceArtifact: null,
  });
}

export async function saveBlueprintLaunchEvidencePacksArtifact(
  evidencePacksArtifact: EvidencePackArtifact,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    evidencePacksArtifact,
    consolidatedEvidenceArtifact: null,
  });
}

export async function saveBlueprintLaunchConsolidatedEvidenceArtifact(
  consolidatedEvidenceArtifact: ConsolidatedEvidenceArtifact,
) {
  const current = await readBlueprintLaunchLocalState();

  await writeBlueprintLaunchLocalState({
    ...current,
    consolidatedEvidenceArtifact,
  });
}
