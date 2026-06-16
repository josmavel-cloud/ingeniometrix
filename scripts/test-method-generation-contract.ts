import {
  buildMethodGenerationContract,
  buildSecondaryReferenceCandidatesReport,
  buildSemanticConsistencyReport,
} from "@/server/blueprint-engine/quality/method-generation-contract";
import { DEFAULT_EVIDENCE_BUDGET_POLICY, type ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import type {
  MethodCandidate,
  MethodSelectionArtifactV1,
  StudyStrategyCandidate,
} from "@/server/blueprint-engine/quality/method-selection";
import { buildSpanishPublicTextQaReport } from "@/server/blueprint-v2/editorial/spanish-public-text-qa";
import { buildConsistencyMatrixArtifactFromSections } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

async function runTest(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function strategy(): StudyStrategyCandidate {
  return {
    strategy_id: "strategy-1",
    label_es: "Evaluación aplicada con diseño comparativo",
    strategy_family: "method_comparison",
    confidence: "medium",
    evidence_ids: ["ev-1"],
    source_ids: ["src-1"],
    rationale: "Synthetic source-backed rationale.",
    warnings: [],
  };
}

function candidate(candidateType: MethodCandidate["candidate_type"], label: string): MethodCandidate {
  return {
    candidate_id: `${candidateType}-1`,
    label_es: label,
    label_en: null,
    candidate_type: candidateType,
    knowledge_area_family: "interdisciplinary",
    method_role: "primary",
    strategy_family: "method_comparison",
    fit_score: 0.78,
    confidence: "medium",
    evidence_strength: "direct_source_backed",
    topic_fit: "direct",
    source_ids: ["src-1"],
    evidence_ids: ["ev-1"],
    original_excerpt_ids: ["ev-1"],
    section_keys: ["methodology"],
    positive_signals: ["source-backed methodological signal"],
    negative_signals: [],
    assumptions: [],
    limitations: [],
    warnings: [],
  };
}

function methodArtifact(): MethodSelectionArtifactV1 {
  return {
    artifact_type: "method_selection_artifact",
    artifact_version: "v1",
    generated_at: "2026-05-05T00:00:00.000Z",
    project_id: "project-neutral",
    case_id: "case-neutral",
    handoff_id: "handoff-neutral",
    evidence_run_id: "run-neutral",
    immutable_snapshot_hash: "hash-neutral",
    status: "selected",
    evidence_quality_context: {
      production_eligible: true,
      diagnostic_compatible: true,
      degraded_handoff: false,
      quality_gate_status: "pass",
      source_count: 2,
      usable_full_text_source_count: 2,
      metadata_only_source_count: 0,
      unresolved_source_count: 0,
      adjacent_source_count: 0,
      evidence_unit_count: 4,
      reduced_evidence_unit_count: 4,
      true_source_backed_direct_quote_count: 2,
      warnings: [],
      blockers: [],
    },
    knowledge_area_route: {
      route: "interdisciplinary",
      confidence: "medium",
      route_evidence_ids: ["ev-1"],
      route_source_ids: ["src-1"],
      modern_methodology_families: ["comparative evaluation"],
      borrowed_method_warnings: [],
    },
    selected_strategy: strategy(),
    primary_method: candidate("method", "Marco de evaluación comparativa"),
    alternative_methods: [candidate("method", "Estudio de caso aplicado")],
    theories: [candidate("theory", "Teoría de decisión multicriterio")],
    techniques: [candidate("technique", "Matriz de criterios ponderados")],
    models: [candidate("model", "Modelo analítico comparativo")],
    tools_software: [candidate("tool_software", "Hoja de cálculo verificable")],
    variables_indicators: [
      {
        candidate_id: "var-1",
        label_es: "Indicador de desempeño",
        construct_or_variable: "desempeño",
        role: "indicator",
        unit: null,
        evidence_ids: ["ev-1"],
        source_ids: ["src-1"],
        status: "source_backed",
        warnings: [],
      },
    ],
    data_requirements: [
      {
        requirement_id: "data-1",
        label_es: "Datos comparables de entrada",
        data_source_type: "secondary_source",
        required_for: "evaluation",
        evidence_ids: ["ev-1"],
        source_ids: ["src-1"],
        status: "source_backed",
        warnings: [],
      },
    ],
    discipline_method_requirements: [
      {
        requirement_id: "req-1",
        knowledge_area_family: "interdisciplinary",
        requirement_type: "variable_indicator_matrix",
        label_es: "Matriz de variables e indicadores",
        method_family: "comparative_evaluation",
        status: "source_backed",
        variables: [],
        instruments_or_protocols: ["Protocolo de comparación"],
        required_inputs: ["Datos comparables"],
        output_indicators: ["Indicador de desempeño"],
        equation_latex: null,
        software_or_tools: ["Hoja de cálculo verificable"],
        source_ids: ["src-1"],
        evidence_ids: ["ev-1"],
        asset_keys: [],
        use_policy: "describe_design_only",
        warnings: [],
      },
    ],
    method_evidence_bindings: [],
    section_integration_plan: {
      title_guidance: "El título debe integrar método, objeto, alcance y problema.",
      abstract_guidance: "El resumen debe declarar la estrategia prevista.",
      objectives_guidance: "Los objetivos deben usar verbos coherentes con la evaluación.",
      theoretical_framework_guidance: "El marco debe centrar la teoría detectada.",
      methodology_guidance: "La metodología debe separar estrategia, técnica, instrumento y datos.",
      keywords_guidance: "Las palabras clave deben incluir método, objeto y variable.",
      hero_infographic_guidance: "La portada debe mostrar flujo metodológico.",
      gantt_budget_guidance: "El cronograma y presupuesto deben seguir la estrategia.",
      warnings: [],
    },
    generation_constraints: {
      artifact_is_read_only: true,
      do_not_feed_generation_yet: true,
      claim_ceiling: "No afirmar resultados.",
      planned_vs_executed_rule: "Distinguir plan de ejecución.",
      no_invented_requirements_rule: "No inventar requisitos.",
      source_support_rule: "Usar solo evidencia trazable.",
      warnings: [],
    },
    scoring_summary: {
      score_version: "method_fit_score.v1",
      winning_score: 0.78,
      confidence: "medium",
      score_explanation: ["Synthetic source-backed score."],
      competing_candidate_count: 1,
      weak_evidence_penalties: [],
    },
    assumptions: [],
    limitations: [],
    warnings: [],
    blockers: [],
  } as unknown as MethodSelectionArtifactV1;
}

function reducedPack(): ReducedEvidencePackV1 {
  return {
    artifact_type: "reduced_evidence_pack",
    artifact_version: "v1",
    generated_at: "2026-05-05T00:00:00.000Z",
    handoff_id: "handoff-neutral",
    project_id: "project-neutral",
    immutable_snapshot_hash: "hash-neutral",
    policy: DEFAULT_EVIDENCE_BUDGET_POLICY,
    original_counts: {
      sources: 1,
      evidence_units: 1,
      asset_refs: 0,
      true_source_backed_direct_quotes: 1,
    },
    reduced_counts: {
      sources: 1,
      evidence_units: 1,
      asset_refs: 0,
      section_keys: 1,
      true_source_backed_direct_quotes: 1,
    },
    source_distribution: [],
    section_distribution: [],
    evidence_units: [
      {
        evidence_id: "ev-1",
        source_id: "src-1",
        section_keys: ["methodology"],
        unit_type: "original_excerpt",
        citation_eligibility: "direct_quote",
        claim_scope: "source_fact",
        evidence_use: "direct",
        score: 100,
        included_reason: "strong direct evidence",
        original_text: "The selected framework cites (Neutral, 2024) as a background work.",
        summary_es: "Resumen metodológico neutral.",
        asset_key: null,
        traceability: {
          original_evidence_id: "ev-1",
          source_id: "src-1",
          asset_key: null,
          quote_hash: "hash-ev-1",
        },
      },
    ],
    asset_refs: [],
    excluded_evidence_summary: [],
    warnings: [],
  };
}

function academicDoc(title: string, methodologyText: string): AcademicDocument {
  return {
    variant: "master",
    citation_style: "APA7",
    report_archetype: "indexed_paper_like",
    metadata: {
      title,
      short_header_title: "Evaluación comparativa aplicada",
      keywords_line: "Evaluación comparativa; matriz de criterios; indicador de desempeño; datos comparables",
      subtitle: "Documento académico",
      university: null,
      program: null,
      generated_at: "2026-05-05T00:00:00.000Z",
    },
    branding: [],
    style_contract: {} as never,
    editorial_plan: {} as never,
    layout_plan: {
      cover_visual: {},
      schedule_visual: null,
      schedule_gantt_rows: [],
      budget_rows: [],
      appendix_public_items: [],
      figures: [],
      equations: [],
      warnings: [],
    } as never,
    matrix: {} as never,
    matrix_layout: {} as never,
    sections: [
      {
        section_key: "theoretical_framework",
        title: "Marco teórico",
        level: 1,
        source_ids: ["src-1"],
        evidence_ids: ["ev-1"],
        original_excerpt_ids: ["ev-1"],
        asset_keys: [],
        citation_anchors: [],
        blocks: [{ block_type: "paragraph", text: "La teoría de decisión multicriterio orienta el marco.", citation_anchor_ids: [] }],
        warnings: [],
      },
      {
        section_key: "methodology",
        title: "Metodología",
        level: 1,
        source_ids: ["src-1"],
        evidence_ids: ["ev-1"],
        original_excerpt_ids: ["ev-1"],
        asset_keys: [],
        citation_anchors: [],
        blocks: [{ block_type: "paragraph", text: methodologyText, citation_anchor_ids: [] }],
        warnings: [],
      },
    ],
    references: [],
    asset_placements: [],
    public_sanitization_passes: [],
    warnings: [],
  } as unknown as AcademicDocument;
}

function draft(sectionKey: string, content: string): MasterSectionDraft {
  return {
    section_key: sectionKey,
    title: sectionKey,
    phase: "draft",
    content,
    content_kind: "paragraph",
    support_level: "reference_supported",
    supported_source_ids: ["src-1"],
    supported_pdf_source_ids: ["src-1"],
    supported_web_source_ids: [],
    supported_assumption_ids: [],
    evidence_snippet_ids: ["ev-1"],
    warnings: [],
    prompt: "synthetic",
  } as unknown as MasterSectionDraft;
}

async function main() {
  const artifact = methodArtifact();
  const contract = buildMethodGenerationContract(artifact);
  const pack = reducedPack();
  const secondaryRefs = buildSecondaryReferenceCandidatesReport(pack);
  const handoff = {
    handoff_id: "handoff-neutral",
    project_id: "project-neutral",
    asset_registry: [],
  } as unknown as EvidenceEngineHandoffV1;

  const goodDocument = academicDoc(
    "Marco de evaluación comparativa para un objeto de estudio aplicado",
    "La metodología se estructura como marco de evaluación comparativa con matriz de criterios ponderados.",
  );
  const weakDocument = academicDoc(
    "Título sin método visible",
    "La sección describe actividades generales sin método visible.",
  );
  const spanishQaDocument = academicDoc(
    "proyecto de investigacion aplicada",
    "La metodologia se describe en un workflow con output preliminar.",
  );
  const matrix = buildConsistencyMatrixArtifactFromSections([
    draft("general_research_question", "¿Cómo evaluar el problema central?"),
    draft("general_objective", "Evaluar el problema central mediante criterios trazables."),
    draft("methodology", "Estudio aplicado con diseño comparativo y matriz de criterios."),
    draft("population_and_sample", "Unidades de análisis documentales."),
    draft("specific_objectives", "- Evaluar criterio uno.\n- Evaluar criterio dos."),
    draft("specific_research_questions", "- ¿Cómo evaluar criterio uno?"),
    draft("specific_hypotheses", "- El criterio uno será relevante.\n- El criterio dos será relevante."),
  ]);
  const goodSemantic = buildSemanticConsistencyReport({
    handoff,
    reducedEvidencePack: pack,
    methodContract: contract,
    matrixArtifact: null,
    academicDocuments: [goodDocument],
    secondaryReferenceReport: secondaryRefs,
  });
  const weakSemantic = buildSemanticConsistencyReport({
    handoff,
    reducedEvidencePack: pack,
    methodContract: contract,
    matrixArtifact: null,
    academicDocuments: [weakDocument],
    secondaryReferenceReport: null,
  });
  const spanishQa = buildSpanishPublicTextQaReport({
    documents: [{ label: "synthetic", document: spanishQaDocument }],
  });

  const results: TestResult[] = [
    await runTest("method contract exposes generation guidance", () => {
      assert(contract.primary_method_label === "Marco de evaluación comparativa", "primary method missing");
      assert(contract.prompt_guidance.methodology.includes("metodología"), "methodology guidance missing");
      assert(contract.keyword_terms.length >= 4, "keyword terms not propagated");
    }),
    await runTest("secondary references are detected but not promoted", () => {
      assert(secondaryRefs.candidate_count === 1, "secondary reference not detected");
      assert(secondaryRefs.candidates[0]?.use_policy === "do_not_cite_as_primary_until_recovered", "bad secondary ref policy");
    }),
    await runTest("semantic report passes when title and methods surface contract", () => {
      assert(goodSemantic.title_mentions_method === true, "title does not mention method");
      assert(goodSemantic.methodology_mentions_method === true, "methodology does not mention method");
    }),
    await runTest("semantic report warns when method contract is absent from public text", () => {
      assert(weakSemantic.warnings.includes("title_does_not_reflect_selected_method_contract"), "missing title warning");
      assert(weakSemantic.warnings.includes("methodology_does_not_surface_method_contract"), "missing methodology warning");
    }),
    await runTest("matrix mismatched questions/objectives is blocked", () => {
      assert(matrix.status === "blocked", `expected blocked matrix, got ${matrix.status}`);
      assert(matrix.validation.blocked_reasons.some((item) => item.includes("preguntas especificas")), "missing question mismatch blocker");
    }),
    await runTest("Spanish public text QA flags English labels and missing accents", () => {
      assert(!spanishQa.passed, "Spanish QA should fail synthetic bad text");
      assert(spanishQa.findings.some((finding) => finding.kind === "english_public_label"), "missing English label finding");
      assert(spanishQa.findings.some((finding) => finding.kind === "missing_spanish_accent"), "missing accent finding");
    }),
  ];

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
