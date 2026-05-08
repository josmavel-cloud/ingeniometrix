import assert from "node:assert/strict";

import type {
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import { buildDeepResearchLightArtifacts } from "@/server/blueprint-engine/quality/deep-research-light";
import {
  buildRapidDeepResearchCacheKey,
  buildRapidDeepResearchPrompt,
  buildRapidDeepResearchRequest,
  DEFAULT_RAPID_DEEP_RESEARCH_MODEL,
  runRapidDeepResearchFallback,
  validateRapidDeepResearchOutput,
} from "@/server/blueprint-engine/quality/rapid-deep-research-fallback";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";
import { parseArgs } from "@/scripts/run-evidence-selected-sources-steps-2-6";

function bundle(): BlueprintLaunchSelectedSourceBundle {
  return {
    savedAt: "2026-01-01T00:00:00.000Z",
    manifestPath: "synthetic-selection.json",
    selectedCount: 2,
    pdfLinkedCount: 2,
    searchQuery: "neutral condition adherence adult patients",
    intakeTopic: "Neutral condition and adherence among adult patients",
    sources: [
      {
        selectedOrder: 1,
        relevanceScore: 85,
        scoreLabel: "ALTO",
        reference: {
          id: "src-neutral-1",
          title: "Neutral condition adherence among adult patients",
          translatedTitle: null,
          doi: "10.1000/current.selected",
          year: 2024,
          venue: "Current Source Journal",
          abstract: "Selected current source.",
          translatedAbstract: null,
          landingPageUrl: "https://example.test/current",
          authorsJson: ["Current Author"],
          sourceLanguage: "en",
          displayLanguage: "en",
          hasAutoTranslation: false,
          pdfUrl: "https://example.test/current.pdf",
          pdfAccessible: true,
        },
      },
      {
        selectedOrder: 2,
        relevanceScore: 74,
        scoreLabel: "MEDIO",
        reference: {
          id: "src-neutral-2",
          title: "Neutral measurement indicators in clinical services",
          translatedTitle: null,
          doi: null,
          year: 2023,
          venue: "Measurement Journal",
          abstract: "Selected current source.",
          translatedAbstract: null,
          landingPageUrl: "https://example.test/measurement",
          authorsJson: ["Measure Author"],
          sourceLanguage: "en",
          displayLanguage: "en",
          hasAutoTranslation: false,
          pdfUrl: "https://example.test/measurement.pdf",
          pdfAccessible: true,
        },
      },
    ],
  };
}

function item(overrides: Partial<BlueprintLaunchLimitedInspectionItem> = {}): BlueprintLaunchLimitedInspectionItem {
  return {
    sourceId: "src-neutral-1",
    title: "Neutral condition adherence among adult patients",
    plannedContentUrl: "https://example.test/current.pdf",
    status: "inspected",
    inspectedKind: "pdf",
    localPrimaryPath: null,
    localSampleTextPath: null,
    byteSize: 1000,
    pageCount: 8,
    sampledPageCount: 6,
    textCharCount: 3000,
    sampleTextCharCount: 1500,
    identityStatus: "matched",
    titleTokenMatchRatio: 0.8,
    doiMatched: true,
    methodSignalCount: 0,
    theorySignalCount: 0,
    variableSignalCount: 0,
    equationCandidateCount: 0,
    tableCandidateCount: 0,
    figureCandidateCount: 0,
    secondaryReferenceCandidateCount: 0,
    secondaryReferenceCandidates: [],
    inspectionSummary: "Neutral inspected text.",
    methodSignals: [],
    theorySignals: [],
    variableSignals: [],
    warnings: [],
    ...overrides,
  };
}

function limitedInspection(): BlueprintLaunchLimitedSourceInspectionResult {
  const items = [
    item({
      secondaryReferenceCandidateCount: 1,
      secondaryReferenceCandidates: [
        "Reference Author. 2022. Neutral adherence measurement framework. doi:10.1000/recovered.framework",
      ],
    }),
    item({
      sourceId: "src-neutral-2",
      title: "Neutral measurement indicators in clinical services",
      methodSignalCount: 1,
      methodSignals: ["study design"],
    }),
  ];
  return {
    artifact_type: "limited_source_inspection",
    artifact_version: "v1",
    savedAt: "2026-01-01T00:00:00.000Z",
    summary: "Synthetic inspection.",
    runDir: null,
    attemptedCount: items.length,
    inspectedCount: items.length,
    usableInspectionCount: items.length,
    failedCount: 0,
    skippedCount: 0,
    postInspectionDecision: "NEEDS_DEEP_RESEARCH_LIGHT",
    postInspectionReasons: ["Missing theory and variables."],
    sourceIdsForFullExtraction: ["src-neutral-1", "src-neutral-2"],
    sourceIdsNeedingReplacement: [],
    sourceIdsNeedingManualReview: [],
    sourceIdsForDeepResearchLight: ["src-neutral-1", "src-neutral-2"],
    secondaryReferenceCandidateCount: 1,
    items,
    warnings: [],
  };
}

function postReport(overrides: Partial<PostInspectionSourceSufficiencyReportV1> = {}): PostInspectionSourceSufficiencyReportV1 {
  return {
    artifact_type: "post_inspection_source_sufficiency",
    artifact_version: "v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    case_id: "case-neutral",
    decision: "NEEDS_DEEP_RESEARCH_LIGHT",
    selected_source_count: 2,
    inspected_source_count: 2,
    usable_source_count: 2,
    direct_usable_source_count: 1,
    contextual_or_partial_source_count: 1,
    method_signal_source_count: 1,
    theory_signal_source_count: 0,
    variable_signal_source_count: 0,
    equation_candidate_count: 0,
    table_candidate_count: 0,
    figure_candidate_count: 0,
    secondary_reference_candidate_count: 1,
    source_ids_ready_for_full_extraction: ["src-neutral-1", "src-neutral-2"],
    source_ids_needing_replacement: [],
    source_ids_needing_manual_review: [],
    source_ids_for_deep_research_light: ["src-neutral-1", "src-neutral-2"],
    missing_evidence_categories: ["theory_or_model", "variables_or_indicators"],
    recommendations: [],
    reasons: ["Synthetic missing categories."],
    warnings: [],
    blockers: ["Post-inspection evidence categories remain incomplete."],
    ...overrides,
  };
}

function buildRequest() {
  const deepLight = buildDeepResearchLightArtifacts({
    caseId: "case-neutral",
    intake: { topic: "Neutral condition and adherence among adult patients" },
    bundle: bundle(),
    limitedInspection: limitedInspection(),
    postInspectionSufficiency: postReport(),
    referenceCandidateOutputPath: "synthetic/deep-research-light-reference-candidates.json",
  });
  return buildRapidDeepResearchRequest({
    caseId: "case-neutral",
    bundle: bundle(),
    limitedInspection: limitedInspection(),
    postInspectionSufficiency: postReport(),
    deepResearchLight: deepLight,
  });
}

function testFlagParsing() {
  assert.equal(parseArgs(["--case", "case-neutral"]).rapidDeepResearchFallback, false);
  assert.equal(
    parseArgs(["--case", "case-neutral", "--rapid-deep-research-fallback"]).rapidDeepResearchFallback,
    true,
  );
}

function testRequestAndPromptAreCurrentContextOnly() {
  const request = buildRequest();
  assert.equal(request.model, DEFAULT_RAPID_DEEP_RESEARCH_MODEL);
  assert.equal(request.max_tool_calls, 6);
  assert.equal(request.background, true);
  assert.ok(request.prompt_text.includes("Actua como especialista en recuperacion bibliografica academica"));
  assert.equal(request.prompt_text.includes("Eres un investigador academico de apoyo para Ingeniometrix"), false);
  assert.ok(request.prompt_text.includes("No redactes marco teorico"));
  assert.ok(request.prompt_text.includes("evidence_candidates"));
  assert.ok(request.prompt_text.includes("candidate_pending_local_verification"));
  const prompt = buildRapidDeepResearchPrompt(request.current_context).toLowerCase();
  for (const forbidden of ["adaptive reuse", "toronto", "mass timber", "seismic isolators", "shaking table"]) {
    assert.equal(prompt.includes(forbidden), false, `Unexpected stale term in prompt: ${forbidden}`);
  }
}

function testValidationRejectsWeakCandidates() {
  const { candidates, validationReport } = validateRapidDeepResearchOutput({
    caseId: "case-neutral",
    selectedSources: bundle().sources,
    raw: {
      candidates: [
        {
          title: "No URL source",
          gap_covered: ["theory_or_model"],
          confidence: "high",
        },
        {
          title: "Neutral condition adherence among adult patients",
          doi: "10.1000/current.selected",
          gap_covered: ["theory_or_model"],
          confidence: "high",
        },
        {
          title: "Valid neutral framework article",
          doi: "10.1000/valid.framework",
          gap_covered: ["theory_or_model", "variables_or_indicators"],
          why_relevant_es: "Puede cubrir teoria y medicion.",
          evidence_note_es: "Debe pasar por seleccion y Evidence Engine.",
          confidence: "medium",
        },
      ],
    },
  });
  assert.equal(candidates.length, 1);
  assert.equal(validationReport.accepted_evidence_candidate_count, 1);
  assert.equal(candidates[0]?.citable_status, "candidate_only_not_citable_yet");
  assert.equal(validationReport.rejected_candidate_count, 2);
}

function testEvidenceCandidateSchemaValidation() {
  const { candidates, evidenceCandidates, validationReport } = validateRapidDeepResearchOutput({
    caseId: "case-neutral",
    selectedSources: bundle().sources,
    raw: {
      evidence_candidates: [
        {
          evidence_candidate_id: "dr-ev-001",
          evidence_need_id: "method_or_study_design",
          gap_addressed: "Falta evidencia sobre el diseno aplicable.",
          candidate_evidence: {
            evidence_type: "method_definition",
            claim_or_use: "Puede orientar la seleccion metodologica si se valida localmente.",
            excerpt_or_summary: "La fuente candidata discute un diseno neutral.",
            exact_quote_if_available: null,
            page_or_section_if_available: null,
          },
          reference: {
            title: "Neutral study design reference",
            authors: ["Design Author"],
            year: 2025,
            venue: "Neutral Journal",
            doi: "10.1000/design.reference",
            url: "https://example.test/design-reference",
            source_type: "journal_article",
          },
          why_relevant: "Cubre un vacio de diseno.",
          confidence: "high",
          validation_status: "candidate_pending_local_verification",
          must_pass_source_selection: true,
          must_pass_pdf_or_source_inspection: true,
          must_pass_evidence_engine: true,
          warnings: [],
        },
        {
          evidence_need_id: "theory_or_model",
          candidate_evidence: {
            evidence_type: "theory_support",
            claim_or_use: "No debe pasar porque falta validacion local.",
            excerpt_or_summary: "Invalid.",
          },
          reference: {
            title: "Invalid verification status reference",
            doi: "10.1000/invalid.status",
          },
          validation_status: "source_backed",
          must_pass_source_selection: true,
          must_pass_pdf_or_source_inspection: true,
          must_pass_evidence_engine: true,
        },
      ],
    },
  });

  assert.equal(evidenceCandidates.length, 1);
  assert.equal(candidates.length, 1);
  assert.equal(evidenceCandidates[0]?.validation_status, "candidate_pending_local_verification");
  assert.equal(evidenceCandidates[0]?.must_pass_pdf_or_source_inspection, true);
  assert.equal(validationReport.rejected_candidate_count, 1);
}

async function testUnavailableWithoutApiKey() {
  const artifacts = await runRapidDeepResearchFallback({
    apiKey: "",
    request: buildRequest(),
    selectedSources: bundle().sources,
    cacheRoot: null,
  });
  assert.equal(artifacts.result.status, "unavailable");
  assert.equal(artifacts.result.openai_called, false);
  assert.equal(artifacts.result.blockers.includes("rapid_deep_research_unavailable_missing_openai_api_key"), true);
}

async function testMockedCallProducesDiscoveryOnlyCandidates() {
  const artifacts = await runRapidDeepResearchFallback({
    apiKey: "test-key",
    request: buildRequest(),
    selectedSources: bundle().sources,
    cacheRoot: null,
    createResponse: async () => ({
      id: "resp_test",
      output_text: JSON.stringify({
        status: "completed",
        summary_es: "Se encontraron candidatos neutros.",
        candidates: [
          {
            title: "Valid neutral clinical framework",
            authors: ["A. Neutral"],
            year: 2024,
            doi: "10.1000/valid.neutral",
            url: "https://example.test/valid-neutral",
            gap_covered: ["theory_or_model"],
            why_relevant_es: "Puede cubrir el marco teorico faltante.",
            evidence_note_es: "Candidato no citable hasta seleccion y procesamiento.",
            confidence: "medium",
          },
        ],
      }),
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens: 50,
      },
    }),
  });
  assert.equal(artifacts.result.status, "completed");
  assert.equal(artifacts.result.openai_called, true);
  assert.equal(artifacts.evidenceCandidates.evidence_candidate_count, 1);
  assert.equal(
    artifacts.evidenceCandidates.candidates[0]?.validation_status,
    "candidate_pending_local_verification",
  );
  assert.equal(artifacts.candidateSources.candidate_count, 1);
  assert.equal(artifacts.candidateSources.candidates[0]?.must_pass_evidence_engine, true);
}

async function testBackgroundPollingIsSupported() {
  let retrieved = false;
  const artifacts = await runRapidDeepResearchFallback({
    apiKey: "test-key",
    request: buildRequest(),
    selectedSources: bundle().sources,
    cacheRoot: null,
    pollIntervalMs: 1,
    maxPollMs: 1000,
    createResponse: async () => ({
      id: "resp_background",
      status: "in_progress",
    }),
    retrieveResponse: async () => {
      retrieved = true;
      return {
        id: "resp_background",
        status: "completed",
        output_text: JSON.stringify({
          status: "completed",
          summary_es: "Se encontro evidencia candidata.",
          evidence_candidates: [
            {
              evidence_candidate_id: "dr-ev-bg",
              evidence_need_id: "variables_or_indicators",
              gap_addressed: "Falta evidencia sobre indicadores.",
              candidate_evidence: {
                evidence_type: "variable_definition",
                claim_or_use: "Puede orientar indicadores si se valida.",
                excerpt_or_summary: "Fuente candidata sobre indicadores neutros.",
              },
              reference: {
                title: "Neutral indicators reference",
                doi: "10.1000/background.indicators",
                source_type: "journal_article",
              },
              why_relevant: "Cubre indicadores.",
              confidence: "medium",
              validation_status: "candidate_pending_local_verification",
              must_pass_source_selection: true,
              must_pass_pdf_or_source_inspection: true,
              must_pass_evidence_engine: true,
            },
          ],
        }),
        usage: {
          input_tokens: 120,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens: 60,
        },
      };
    },
  });

  assert.equal(retrieved, true);
  assert.equal(artifacts.result.status, "completed");
  assert.equal(artifacts.evidenceCandidates.evidence_candidate_count, 1);
}

async function testNonJsonResponseCanStillYieldLowConfidenceCandidates() {
  const artifacts = await runRapidDeepResearchFallback({
    apiKey: "test-key",
    request: buildRequest(),
    selectedSources: bundle().sources,
    cacheRoot: null,
    createResponse: async () => ({
      id: "resp_non_json",
      output_text:
        "Potential source: Neutral adherence theory and measurement in adult care. DOI: 10.1000/nonjson.valid https://example.test/nonjson",
      usage: {
        input_tokens: 80,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 40,
      },
    }),
  });

  assert.equal(artifacts.result.status, "completed");
  assert.equal(artifacts.candidateSources.candidate_count, 1);
  assert.equal(artifacts.candidateSources.candidates[0]?.confidence, "low");
  assert.ok(artifacts.result.warnings.includes("rapid_deep_research_returned_non_json_deterministic_extraction_used"));
}

async function testResponseOutputArrayTextIsParsed() {
  const artifacts = await runRapidDeepResearchFallback({
    apiKey: "test-key",
    request: buildRequest(),
    selectedSources: bundle().sources,
    cacheRoot: null,
    createResponse: async () => ({
      id: "resp_output_array",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                status: "completed",
                summary_es: "Salida en output array.",
                candidates: [
                  {
                    title: "Output array neutral source",
                    doi: "10.1000/output.array",
                    url: "https://example.test/output-array",
                    gap_covered: ["direct_nuclear_sources"],
                    confidence: "low",
                  },
                ],
              }),
            },
          ],
        },
      ],
      usage: {
        input_tokens: 90,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 45,
      },
    }),
  });

  assert.equal(artifacts.result.status, "completed");
  assert.equal(artifacts.candidateSources.candidate_count, 1);
  assert.equal(artifacts.candidateSources.candidates[0]?.doi, "10.1000/output.array");
}

function testCacheKeyChangesWhenGapsChange() {
  const requestA = buildRequest();
  const requestB = buildRapidDeepResearchRequest({
    caseId: "case-neutral",
    bundle: bundle(),
    limitedInspection: limitedInspection(),
    postInspectionSufficiency: postReport({
      missing_evidence_categories: ["method_or_study_design"],
    }),
    deepResearchLight: null,
  });
  assert.notEqual(buildRapidDeepResearchCacheKey(requestA), buildRapidDeepResearchCacheKey(requestB));
}

async function main() {
  testFlagParsing();
  testRequestAndPromptAreCurrentContextOnly();
  testValidationRejectsWeakCandidates();
  testEvidenceCandidateSchemaValidation();
  await testUnavailableWithoutApiKey();
  await testMockedCallProducesDiscoveryOnlyCandidates();
  await testBackgroundPollingIsSupported();
  await testNonJsonResponseCanStillYieldLowConfidenceCandidates();
  await testResponseOutputArrayTextIsParsed();
  testCacheKeyChangesWhenGapsChange();
  console.log("test-rapid-deep-research-fallback: pass");
}

void main();
