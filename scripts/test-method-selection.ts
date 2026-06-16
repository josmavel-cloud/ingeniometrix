import type { LlmProvider, StructuredObjectInput, TextGenerationInput } from "@/llm/provider";
import type {
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
  JsonValue,
  SourceHandoffRecord,
} from "@/server/blueprint-engine/contracts";
import { buildReducedEvidencePackFromHandoff } from "@/server/blueprint-engine/quality/evidence-budget";
import {
  buildMethodSelectionEvidenceContext,
  buildMethodSelectionForHandoff,
  computeMethodSelectionCacheKey,
  renderMethodSelectionReport,
  validateAndNormalizeMethodSelectionArtifact,
  type CandidateType,
  type DataRequirementCandidate,
  type DisciplineMethodRequirement,
  type KnowledgeAreaRoute,
  type MethodCandidate,
  type MethodSelectionArtifactV1,
  type MethodSelectionLlmOutputV1,
  type StudyStrategyCandidate,
  type VariableIndicatorCandidate,
} from "@/server/blueprint-engine/quality/method-selection";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

async function runTest(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function source(sourceId: string, title: string, raw: Record<string, JsonValue> = {}): SourceHandoffRecord {
  return {
    source_id: sourceId,
    reference_id: sourceId,
    title,
    authors: [],
    year: 2025,
    venue: "Synthetic Journal",
    doi: null,
    landing_page_url: null,
    pdf_url: null,
    openalex_id: null,
    crossref_id: null,
    is_open_access: true,
    selected_order: 1,
    eligible_for_formal_reference: true,
    citation_metadata: { raw },
    materialization_refs: {
      extracted_text_refs: [],
      chunk_refs: [],
      pdf_refs: [],
      derived_asset_refs: [],
    },
  };
}

function evidenceUnit(input: {
  evidenceId: string;
  sourceId: string;
  sectionKeys: string[];
  text: string;
  unitType?: EvidenceUnitHandoffRecord["unit_type"];
  citationEligibility?: EvidenceUnitHandoffRecord["citation_eligibility"];
  claimScope?: EvidenceUnitHandoffRecord["claim_scope"];
  assetKey?: string | null;
}): EvidenceUnitHandoffRecord {
  return {
    evidence_id: input.evidenceId,
    source_id: input.sourceId,
    unit_type: input.unitType ?? "original_excerpt",
    section_keys: input.sectionKeys,
    label: `Synthetic evidence ${input.evidenceId}`,
    original_text: input.unitType === "context_only" ? null : input.text,
    summary_es: input.text,
    page_start: 1,
    page_end: 1,
    char_start: input.unitType === "context_only" ? null : 12,
    char_end: input.unitType === "context_only" ? null : 180,
    quote_hash: input.unitType === "context_only" ? null : `hash-${input.evidenceId}`,
    asset_key: input.assetKey ?? null,
    asset_ref: null,
    caption: input.unitType === "table" || input.unitType === "equation" ? input.text : null,
    original_language: "es",
    citation_eligibility: input.citationEligibility ?? "direct_quote",
    confidence: 0.88,
    relevance_score: 0.9,
    claim_scope: input.claimScope ?? "source_fact",
  };
}

function sectionPacket(sectionKey: string, units: EvidenceUnitHandoffRecord[]) {
  return {
    section_key: sectionKey,
    readiness: "media" as const,
    summary: "Synthetic section packet for method selection diagnostics.",
    source_ids: Array.from(new Set(units.map((unit) => unit.source_id))),
    snippet_ids: [],
    evidence_ids: units.map((unit) => unit.evidence_id),
    asset_keys: units.map((unit) => unit.asset_key).filter((key): key is string => Boolean(key)),
    key_points: ["Method, design, variables, data, and validation signals are summarized here."],
    open_questions: [],
    missing_elements: [],
    do_not_claim: [],
    assumptions_allowed: [],
    recommended_chunk_refs: [],
    required_original_fragments: [],
  };
}

function rawHealth(route: "direct" | "metadata" | "adjacent" = "direct") {
  if (route === "metadata") {
    return {
      source_health_classification: {
        source_health: "metadata_only",
        topic_fit: "weak",
        allowed_evidence_use: "context_only",
      },
    };
  }
  if (route === "adjacent") {
    return {
      source_health_classification: {
        source_health: "usable_full_text",
        topic_fit: "adjacent",
        allowed_evidence_use: "cautious_support",
      },
    };
  }
  return {
    source_health_classification: {
      source_health: "usable_full_text",
      topic_fit: "direct",
      allowed_evidence_use: "direct_claim_support",
    },
  };
}

function syntheticHandoff(input: {
  route: KnowledgeAreaRoute;
  projectId?: string;
  topic?: string;
  qualityStatus?: "pass" | "warn" | "blocked";
  metadataOnly?: boolean;
}): EvidenceEngineHandoffV1 {
  const sourceId = `${input.route}-source-a`;
  const secondSourceId = `${input.route}-source-b`;
  const sourceMode = input.metadataOnly ? "metadata" : "direct";
  const units = [
    evidenceUnit({
      evidenceId: `${input.route}-chunk-method-a`,
      sourceId,
      sectionKeys: ["methodology", "analysis_plan"],
      text:
        "The recovered source describes a research design, analytical procedure, variables or constructs, data needs, and validation requirements for the study.",
    }),
    evidenceUnit({
      evidenceId: `${input.route}-chunk-framework-b`,
      sourceId: secondSourceId,
      sectionKeys: ["theoretical_framework", "variables_or_categories"],
      text:
        "The recovered source explains a supporting framework, relevant indicators, expected inputs, outputs, assumptions, and limits of interpretation.",
    }),
    evidenceUnit({
      evidenceId: `${input.route}-context-only-c`,
      sourceId,
      sectionKeys: ["background_context"],
      text: "Context-only weak prior.",
      unitType: "context_only",
      citationEligibility: "not_citable",
      claimScope: "do_not_claim",
    }),
  ];

  return {
    handoff_id: `handoff-${input.route}`,
    handoff_version: "evidence_engine_handoff.v1",
    project_id: input.projectId ?? `project-${input.route}`,
    evidence_run_id: `run-${input.route}`,
    created_at: "2026-05-05T00:00:00.000Z",
    source_engine: "EvidenceEngine",
    source_engine_version: "test",
    artifact_hash: `artifact-${input.route}`,
    readiness: input.qualityStatus === "blocked" ? "blocked" : "media",
    quality_gate: {
      status: input.qualityStatus ?? "warn",
      warnings: input.qualityStatus === "pass" ? [] : ["Synthetic degraded gate for test."],
      blockers: input.qualityStatus === "blocked" ? ["Synthetic blocker."] : [],
    },
    warnings: [],
    source_snapshot: [],
    project_context: {
      language: "es",
      country_context: "PE",
      degree_level: "posgrado",
      master_template_key: "MASTER_TEMPLATE_LATAM",
      topic: input.topic ?? `Synthetic neutral topic for ${input.route}`,
      academic_program: `Synthetic neutral program for ${input.route}`,
      problem_context: "Synthetic problem context without domain-specific production assumptions.",
      methodology_preference: "Synthetic preferred methodology as weak prior only.",
    },
    source_registry: [
      source(sourceId, `Synthetic source A for ${input.route}`, rawHealth(sourceMode)),
      source(secondSourceId, `Synthetic source B for ${input.route}`, rawHealth("direct")),
    ],
    evidence_units: units,
    section_packets: [
      sectionPacket("methodology", units.filter((unit) => unit.section_keys.includes("methodology"))),
      sectionPacket(
        "theoretical_framework",
        units.filter((unit) => unit.section_keys.includes("theoretical_framework")),
      ),
      sectionPacket(
        "variables_or_categories",
        units.filter((unit) => unit.section_keys.includes("variables_or_categories")),
      ),
    ],
    weak_section_packets: [],
    source_priorities: [
      { source_id: sourceId, reason: input.metadataOnly ? "input=abstract_metadata" : "input=pdf" },
      { source_id: secondSourceId, reason: "input=pdf" },
    ],
    asset_registry: [],
    asset_usage_plan: [],
    materialized_content_refs: [],
    chunk_index_refs: [],
    proposal_context: {
      method_candidate: null,
      framework_candidate: null,
      dominant_methods: [],
      dominant_frameworks: [],
      key_findings: [],
      evidence_gaps: [],
      followup_requirements: null,
      gap_resolution_plan: null,
    },
    assumptions: [],
    traceability: {
      source_artifacts: [],
      immutable_snapshot_hash: `snapshot-${input.route}`,
    },
  };
}

function candidate(input: {
  id: string;
  label: string;
  type: CandidateType;
  route: KnowledgeAreaRoute;
  sourceIds: string[];
  evidenceIds: string[];
  role?: MethodCandidate["method_role"];
  confidence?: MethodCandidate["confidence"];
  evidenceStrength?: MethodCandidate["evidence_strength"];
}): MethodCandidate {
  return {
    candidate_id: input.id,
    label_es: input.label,
    label_en: null,
    candidate_type: input.type,
    knowledge_area_family: input.route,
    method_role: input.role ?? "primary",
    strategy_family: input.route === "engineering" ? "simulation" : "evidence_based_evaluation",
    fit_score: 82,
    confidence: input.confidence ?? "high",
    evidence_strength: input.evidenceStrength ?? "direct_source_backed",
    topic_fit: "direct",
    source_ids: input.sourceIds,
    evidence_ids: input.evidenceIds,
    original_excerpt_ids: input.evidenceIds,
    section_keys: ["methodology"],
    positive_signals: ["source_backed_method_signal"],
    negative_signals: [],
    assumptions: [],
    limitations: [],
    warnings: [],
  };
}

function strategy(route: KnowledgeAreaRoute, sourceIds: string[], evidenceIds: string[]): StudyStrategyCandidate {
  return {
    strategy_id: `strategy-${route}`,
    label_es: `Synthetic selected strategy for ${route}`,
    strategy_family: route === "engineering" ? "simulation" : "evidence_based_evaluation",
    confidence: "high",
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    rationale: "Selected from supplied synthetic evidence only.",
    warnings: [],
  };
}

function variable(
  route: KnowledgeAreaRoute,
  sourceIds: string[],
  evidenceIds: string[],
): VariableIndicatorCandidate {
  return {
    candidate_id: `variable-${route}`,
    label_es: `Synthetic variable or construct for ${route}`,
    construct_or_variable: "synthetic_variable",
    role: route === "engineering" ? "parameter" : "construct",
    unit: route === "engineering" ? "synthetic_unit" : null,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    status: "source_backed",
    warnings: [],
  };
}

function dataRequirement(
  route: KnowledgeAreaRoute,
  sourceIds: string[],
  evidenceIds: string[],
): DataRequirementCandidate {
  return {
    requirement_id: `data-${route}`,
    label_es: `Synthetic data requirement for ${route}`,
    data_source_type: "synthetic_current_run_data",
    required_for: "method execution planning",
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    status: "source_backed",
    warnings: [],
  };
}

function requirement(input: {
  route: KnowledgeAreaRoute;
  type: DisciplineMethodRequirement["requirement_type"];
  sourceIds: string[];
  evidenceIds: string[];
  status?: DisciplineMethodRequirement["status"];
  equation?: string | null;
  software?: string[];
}): DisciplineMethodRequirement {
  return {
    requirement_id: `requirement-${input.route}-${input.type}`,
    knowledge_area_family: input.route,
    requirement_type: input.type,
    label_es: `Synthetic ${input.type} requirement for ${input.route}`,
    method_family: `synthetic_${input.route}_method_family`,
    status: input.status ?? "source_backed",
    variables: [],
    instruments_or_protocols: input.route === "engineering" ? [] : ["synthetic_protocol"],
    required_inputs: ["synthetic_input"],
    output_indicators: ["synthetic_output"],
    equation_latex: input.equation ?? null,
    software_or_tools: input.software ?? [],
    source_ids: input.sourceIds,
    evidence_ids: input.evidenceIds,
    asset_keys: [],
    use_policy:
      input.type === "equation_or_formula"
        ? "declare_pending_validation"
        : input.route === "engineering"
          ? "describe_model_only"
          : "describe_protocol_only",
    warnings: [],
  };
}

function llmOutputForRoute(route: KnowledgeAreaRoute, input: {
  sourceIds: string[];
  evidenceIds: string[];
  invalidEvidenceId?: boolean;
  inventedEquation?: boolean;
}): MethodSelectionLlmOutputV1 {
  const evidenceIds = input.invalidEvidenceId ? ["invalid-evidence-id"] : input.evidenceIds;
  const sourceIds = input.sourceIds;
  const primary = candidate({
    id: `method-${route}`,
    label: `Synthetic primary method for ${route}`,
    type: "method",
    route,
    sourceIds,
    evidenceIds,
  });
  const reqs: DisciplineMethodRequirement[] = [];
  if (route === "engineering") {
    reqs.push(
      requirement({
        route,
        type: "analytical_model",
        sourceIds,
        evidenceIds,
      }),
      requirement({
        route,
        type: "equation_or_formula",
        sourceIds: input.inventedEquation ? [] : sourceIds,
        evidenceIds: input.inventedEquation ? [] : evidenceIds,
        status: input.inventedEquation ? "source_backed" : "required_but_missing",
        equation: input.inventedEquation ? "synthetic_formula_without_source" : null,
      }),
      requirement({
        route,
        type: "software_or_tool",
        sourceIds,
        evidenceIds,
        software: ["synthetic_supported_tool"],
      }),
      requirement({
        route,
        type: "validation_strategy",
        sourceIds,
        evidenceIds,
      }),
    );
  } else {
    reqs.push(
      requirement({
        route,
        type: route === "medicine_public_health" ? "research_design" : "instrument_or_protocol",
        sourceIds,
        evidenceIds,
      }),
      requirement({
        route,
        type: "validation_strategy",
        sourceIds,
        evidenceIds,
      }),
    );
  }

  return {
    status: "selected",
    knowledge_area_route: {
      route,
      confidence: "high",
      route_evidence_ids: evidenceIds,
      route_source_ids: sourceIds,
      modern_methodology_families: [`synthetic_${route}_family`],
      borrowed_method_warnings: [],
    },
    selected_strategy: strategy(route, sourceIds, evidenceIds),
    primary_method: primary,
    alternative_methods: [
      candidate({
        id: `alternative-${route}`,
        label: `Synthetic alternative method for ${route}`,
        type: "method",
        route,
        sourceIds,
        evidenceIds,
        role: "alternative",
        confidence: "medium",
      }),
    ],
    theories: [
      candidate({
        id: `theory-${route}`,
        label: `Synthetic theory for ${route}`,
        type: "theory",
        route,
        sourceIds,
        evidenceIds,
        role: "supporting",
      }),
    ],
    techniques: [
      candidate({
        id: `technique-${route}`,
        label: `Synthetic technique for ${route}`,
        type: "technique",
        route,
        sourceIds,
        evidenceIds,
        role: "supporting",
      }),
    ],
    models: route === "engineering"
      ? [
          candidate({
            id: `model-${route}`,
            label: `Synthetic model for ${route}`,
            type: "model",
            route,
            sourceIds,
            evidenceIds,
            role: "supporting",
          }),
        ]
      : [],
    tools_software: route === "engineering"
      ? [
          candidate({
            id: `tool-${route}`,
            label: "Synthetic supported tool",
            type: "tool_software",
            route,
            sourceIds,
            evidenceIds,
            role: "supporting",
          }),
        ]
      : [],
    variables_indicators: [variable(route, sourceIds, evidenceIds)],
    data_requirements: [dataRequirement(route, sourceIds, evidenceIds)],
    discipline_method_requirements: reqs,
    method_evidence_bindings: [
      {
        binding_id: `binding-${route}`,
        target_type: "method",
        target_id: primary.candidate_id,
        evidence_ids: evidenceIds,
        source_ids: sourceIds,
        support_level: "direct_source_backed",
        warnings: [],
      },
    ],
    section_integration_plan: {
      title_guidance: "Read-only guidance for future title use.",
      abstract_guidance: "Read-only guidance for future abstract use.",
      objectives_guidance: "Read-only guidance for future objectives use.",
      theoretical_framework_guidance: "Read-only guidance for future framework use.",
      methodology_guidance: "Read-only guidance for future methodology use.",
      keywords_guidance: "Read-only guidance for future keywords use.",
      hero_infographic_guidance: "Read-only guidance for future visual workflow use.",
      gantt_budget_guidance: "Read-only guidance for future project-management use.",
      warnings: [],
    },
    generation_constraints: {
      artifact_is_read_only: true,
      do_not_feed_generation_yet: true,
      claim_ceiling: "Read-only diagnostic artifact.",
      planned_vs_executed_rule: "Do not present planned work as executed.",
      no_invented_requirements_rule: "Do not invent requirements.",
      source_support_rule: "Use current evidence ids and source ids only.",
      warnings: [],
    },
    scoring_summary: {
      score_version: "method_fit_score.v1",
      winning_score: 82,
      confidence: "high",
      score_explanation: ["Synthetic source-backed route output."],
      competing_candidate_count: 1,
      weak_evidence_penalties: [],
    },
    assumptions: [],
    limitations: [],
    warnings: [],
    blockers: [],
  };
}

class MockProvider implements LlmProvider {
  readonly name = "mock";

  constructor(private readonly payload: MethodSelectionLlmOutputV1) {}

  async generateStructuredObject<T>(_input: StructuredObjectInput): Promise<T> {
    return this.payload as T;
  }

  async generateText(_input: TextGenerationInput): Promise<string> {
    return "";
  }

  async generateTextDetailed() {
    return {
      text: "",
      usage: {
        provider: "mock",
        model: "mock-model",
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costCad: 0,
        durationMs: 0,
      },
    };
  }
}

async function runRoute(route: KnowledgeAreaRoute, options: {
  metadataOnly?: boolean;
  qualityStatus?: "pass" | "warn" | "blocked";
  invalidEvidenceId?: boolean;
  inventedEquation?: boolean;
} = {}) {
  const handoff = syntheticHandoff({
    route,
    metadataOnly: options.metadataOnly,
    qualityStatus: options.qualityStatus ?? "pass",
  });
  const reduced = buildReducedEvidencePackFromHandoff(handoff);
  const sourceIds = handoff.source_registry.map((source) => source.source_id);
  const evidenceIds = handoff.evidence_units
    .filter((unit) => unit.unit_type !== "context_only")
    .map((unit) => unit.evidence_id);
  const result = await buildMethodSelectionForHandoff({
    handoff,
    reducedEvidencePack: reduced,
    options: {
      caseId: `synthetic-${route}`,
      provider: new MockProvider(
        llmOutputForRoute(route, {
          sourceIds,
          evidenceIds,
          invalidEvidenceId: options.invalidEvidenceId,
          inventedEquation: options.inventedEquation,
        }),
      ),
      model: "mock-model",
      cacheRoot: null,
      collectUsage: false,
    },
  });
  return { handoff, reduced, result };
}

async function main() {
  const results = await Promise.all([
    runTest("engineering fixture routes to engineering but engineering is not fallback", async () => {
      const fallbackHandoff = syntheticHandoff({ route: "education" });
      const fallbackReduced = buildReducedEvidencePackFromHandoff(fallbackHandoff);
      const fallback = await buildMethodSelectionForHandoff({
        handoff: fallbackHandoff,
        reducedEvidencePack: fallbackReduced,
        options: { provider: null, cacheRoot: null, collectUsage: false },
      });
      assert(fallback.artifact.knowledge_area_route.route === "unknown", "fallback should not default to engineering");
      const { result } = await runRoute("engineering");
      assert(result.artifact.knowledge_area_route.route === "engineering", "engineering route was not selected");
    }),
    runTest("engineering route activates equation/model/tool/validation requirements", async () => {
      const { result } = await runRoute("engineering");
      const types = new Set(result.artifact.discipline_method_requirements.map((item) => item.requirement_type));
      assert(types.has("analytical_model"), "missing analytical model requirement");
      assert(types.has("equation_or_formula"), "missing equation/formula requirement");
      assert(types.has("software_or_tool"), "missing software/tool requirement");
      assert(types.has("validation_strategy"), "missing validation requirement");
    }),
    runTest("engineering requirement without source-backed equation is marked required_but_missing", async () => {
      const { result } = await runRoute("engineering");
      const equation = result.artifact.discipline_method_requirements.find(
        (item) => item.requirement_type === "equation_or_formula",
      );
      assert(Boolean(equation), "equation requirement missing");
      assert(equation?.status === "required_but_missing", `equation status was ${equation?.status}`);
      assert(equation?.equation_latex === null, "equation formula should not be invented");
    }),
    runTest("non-engineering routes do not force equation requirements", async () => {
      for (const route of ["medicine_public_health", "education", "business", "social_science"] as const) {
        const { result } = await runRoute(route);
        assert(result.artifact.knowledge_area_route.route === route, `${route} was not selected`);
        assert(
          !result.artifact.discipline_method_requirements.some(
            (item) => item.requirement_type === "equation_or_formula",
          ),
          `${route} should not force equation requirements`,
        );
      }
    }),
    runTest("metadata-only evidence cannot select production-ready method", async () => {
      const { result } = await runRoute("business", { metadataOnly: true });
      assert(
        result.artifact.status !== "selected" || result.artifact.primary_method?.confidence !== "high",
        "metadata-only support should be downgraded",
      );
      assert(
        result.validationReport.metadata_only_primary_support_count > 0 ||
          result.artifact.warnings.some((warning) => warning.includes("metadata")),
        "metadata-only warning was not emitted",
      );
    }),
    runTest("degraded handoff creates provisional or blocked status", async () => {
      const { result } = await runRoute("education", { qualityStatus: "blocked" });
      assert(result.artifact.status === "blocked", `status was ${result.artifact.status}`);
      assert(result.artifact.scoring_summary.confidence === "blocked", "confidence should be blocked");
    }),
    runTest("method/theory/technique/tool/model/variable/data source are distinguished", async () => {
      const { result } = await runRoute("engineering");
      assert(result.artifact.primary_method?.candidate_type === "method", "primary method type incorrect");
      assert(result.artifact.theories[0]?.candidate_type === "theory", "theory type incorrect");
      assert(result.artifact.techniques[0]?.candidate_type === "technique", "technique type incorrect");
      assert(result.artifact.models[0]?.candidate_type === "model", "model type incorrect");
      assert(result.artifact.tools_software[0]?.candidate_type === "tool_software", "tool type incorrect");
      assert(result.artifact.variables_indicators.length > 0, "variable missing");
      assert(result.artifact.data_requirements.length > 0, "data requirement missing");
    }),
    runTest("selected strategy uses evidence ids and not only intake prior", async () => {
      const { result } = await runRoute("public_policy");
      assert(
        (result.artifact.selected_strategy?.evidence_ids.length ?? 0) > 0,
        "strategy should include evidence ids",
      );
      assert(
        result.artifact.selected_strategy?.evidence_ids.every((id) => id.includes("chunk")) ?? false,
        "strategy should be tied to source-backed synthetic evidence",
      );
    }),
    runTest("report does not contain unrelated synthetic fixture marker", async () => {
      const { result } = await runRoute("education", {
        qualityStatus: "pass",
      });
      const report = renderMethodSelectionReport(result.artifact, result.validationReport);
      assert(!report.includes("fixture-marker-from-other-route"), "report leaked unrelated fixture marker");
    }),
    runTest("route-specific requirements are activated only for detected route", async () => {
      const { result } = await runRoute("environmental");
      assert(result.artifact.knowledge_area_route.route === "environmental", "wrong route");
      assert(
        result.artifact.discipline_method_requirements.every(
          (item) => item.knowledge_area_family === "environmental",
        ),
        "requirement route mismatch",
      );
    }),
    runTest("LLM output with invalid evidence id is downgraded", async () => {
      const { result } = await runRoute("law", { invalidEvidenceId: true });
      assert(result.validationReport.invalid_evidence_ids.includes("invalid-evidence-id"), "invalid id not recorded");
      assert(
        result.artifact.warnings.some((warning) => warning.includes("invalid_evidence_ids_removed")) ||
          result.validationReport.validation_downgrades.length > 0,
        "invalid evidence id should produce warning or downgrade",
      );
    }),
    runTest("LLM output inventing an equation is downgraded to required_but_missing", async () => {
      const { result } = await runRoute("engineering", { inventedEquation: true });
      const equation = result.artifact.discipline_method_requirements.find(
        (item) => item.requirement_type === "equation_or_formula",
      );
      assert(equation?.status === "required_but_missing", `equation status was ${equation?.status}`);
      assert(equation?.equation_latex === null, "invented equation should be removed");
      assert(result.validationReport.invented_requirement_count > 0, "invented requirement not counted");
    }),
    runTest("LLM unavailable produces safe insufficient or blocked artifact", async () => {
      const handoff = syntheticHandoff({ route: "humanities", qualityStatus: "warn" });
      const reduced = buildReducedEvidencePackFromHandoff(handoff);
      const result = await buildMethodSelectionForHandoff({
        handoff,
        reducedEvidencePack: reduced,
        options: { provider: null, cacheRoot: null, collectUsage: false },
      });
      assert(
        result.artifact.status === "insufficient_evidence" || result.artifact.status === "blocked",
        `fallback status was ${result.artifact.status}`,
      );
      assert(result.artifact.warnings.includes("method_selection_llm_unavailable"), "missing unavailable warning");
    }),
    runTest("cache key changes when reduced evidence context changes", () => {
      const handoff = syntheticHandoff({ route: "interdisciplinary" });
      const reducedA = buildReducedEvidencePackFromHandoff(handoff);
      const contextA = buildMethodSelectionEvidenceContext({ handoff, reducedEvidencePack: reducedA });
      const reducedB = {
        ...reducedA,
        warnings: [...reducedA.warnings, "synthetic_extra_reduction_warning"],
      };
      const contextB = buildMethodSelectionEvidenceContext({ handoff, reducedEvidencePack: reducedB });
      const keyA = computeMethodSelectionCacheKey({ context: contextA, model: "mock-model" });
      const keyB = computeMethodSelectionCacheKey({ context: contextB, model: "mock-model" });
      assert(keyA !== keyB, "cache key should change when reduced evidence context changes");
    }),
    runTest("validator rejects source ids outside current handoff", () => {
      const handoff = syntheticHandoff({ route: "education" });
      const reduced = buildReducedEvidencePackFromHandoff(handoff);
      const context = buildMethodSelectionEvidenceContext({ handoff, reducedEvidencePack: reduced });
      const output = llmOutputForRoute("education", {
        sourceIds: ["foreign-source-id"],
        evidenceIds: [handoff.evidence_units[0].evidence_id],
      });
      const artifact: MethodSelectionArtifactV1 = {
        artifact_type: "method_selection_artifact",
        artifact_version: "v1",
        generated_at: "2026-05-05T00:00:00.000Z",
        project_id: handoff.project_id,
        case_id: null,
        handoff_id: handoff.handoff_id,
        evidence_run_id: handoff.evidence_run_id,
        immutable_snapshot_hash: handoff.traceability.immutable_snapshot_hash,
        evidence_quality_context: context.evidence_quality_context,
        ...output,
      };
      const validated = validateAndNormalizeMethodSelectionArtifact({
        artifact,
        handoff,
        reducedEvidencePack: reduced,
        telemetry: {
          method_selection_llm_called: false,
          cache_hit: false,
          model: "mock",
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          estimated_cost_usd: 0,
          estimated_cost_cad: 0,
          duration_ms: null,
          cache_key: "cache",
        },
      });
      assert(validated.validationReport.invalid_source_ids.includes("foreign-source-id"), "foreign source not rejected");
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
