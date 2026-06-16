import { buildCoherenceReport } from "@/server/blueprint/blueprint-validation";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type {
  DocumentProvenanceReport,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintQualityComponentReport,
  MasterBlueprintQualityReport,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  MasterTemplateRuntime,
} from "@/server/blueprint-v2/types";
import { reviewMasterBlueprintSemantics } from "@/server/blueprint-v2/validation/blueprint-semantic-review-engine";

const QUALITY_THRESHOLD = 8;
const WEAK_CONTENT_PATTERN =
  /por precisar|por definir|version preliminar|requiere revision|revision academica|por confirmar/i;
const PLACEHOLDER_PATTERN =
  /por completar|por confirmar|nombre del tesista|nombre del asesor|programa por confirmar/i;
const METHODOLOGY_KEYWORDS = {
  design: /(enfoque|diseno|diseño|estudio|tipo de estudio|alcance|metodo|metodo mixto|cuantitativo|cualitativo|experimental|descriptivo|correlacional|exploratorio)/i,
  population: /(poblacion|población|muestra|participantes|unidad de analisis|unidad de análisis)/i,
  technique: /(encuesta|entrevista|cuestionario|observacion|observación|instrumento|recoleccion|recolección|muestreo)/i,
  analysis: /(analisis|análisis|regresion|regresión|anova|chi cuadrado|codificacion|codificación|triangulacion|triangulación|estadistico|estadístico)/i,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeScore(value: number, maxScore: number) {
  return Number.parseFloat(Math.max(0, Math.min(maxScore, value)).toFixed(2));
}

function statusWeight(status: string) {
  if (status === "pass") {
    return 1;
  }

  if (status === "warning") {
    return 0.6;
  }

  return 0.15;
}

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function lexicalOverlap(left: string, right: string) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function uniqueRatio(values: string[]) {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length === 0) {
    return 0;
  }

  return new Set(normalized).size / normalized.length;
}

function getFormalSourcesFromDrafts(input: {
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
}) {
  const usedSourceIds = new Set(
    input.drafts.flatMap((draft) => [
      ...draft.supported_source_ids,
      ...draft.supported_pdf_source_ids,
    ]),
  );

  return input.evidenceLedger.source_registry.filter(
    (source) =>
      source.eligible_for_formal_reference && usedSourceIds.has(source.source_id),
  );
}

function scoreStructure(input: {
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
  missingRequiredSectionKeys: string[];
}): MasterBlueprintQualityComponentReport {
  const requiredCount = Math.max(1, input.masterTemplate.required_section_keys.length);
  const requiredDrafts = input.drafts.filter((draft) =>
    input.masterTemplate.required_section_keys.includes(draft.section_key),
  );
  const presentRatio =
    (requiredCount - input.missingRequiredSectionKeys.length) / requiredCount;
  const usefulRatio =
    requiredDrafts.filter((draft) => draft.content.trim().length >= 80).length /
    Math.max(1, requiredDrafts.length);
  const robustRatio =
    requiredDrafts.filter((draft) => draft.content.trim().length >= 180).length /
    Math.max(1, requiredDrafts.length);
  const weakRatio =
    requiredDrafts.filter((draft) => WEAK_CONTENT_PATTERN.test(draft.content)).length /
    Math.max(1, requiredDrafts.length);
  const placeholderRatio =
    requiredDrafts.filter((draft) => PLACEHOLDER_PATTERN.test(draft.content)).length /
    Math.max(1, requiredDrafts.length);
  const score = normalizeScore(
    2 *
      clamp01(
        presentRatio * 0.4 +
          usefulRatio * 0.25 +
          robustRatio * 0.2 +
          (1 - weakRatio) * 0.1 +
          (1 - placeholderRatio) * 0.05,
      ),
    2,
  );

  return {
    key: "structure",
    label: "Cobertura estructural",
    score,
    max_score: 2,
    notes: [
      `Secciones obligatorias presentes: ${requiredCount - input.missingRequiredSectionKeys.length}/${requiredCount}.`,
      `Secciones obligatorias con contenido util: ${requiredDrafts.filter((draft) => draft.content.trim().length >= 80).length}/${Math.max(1, requiredDrafts.length)}.`,
      `Secciones obligatorias robustas: ${requiredDrafts.filter((draft) => draft.content.trim().length >= 180).length}/${Math.max(1, requiredDrafts.length)}.`,
      `Senales debiles: ${Math.round(weakRatio * 100)}%.`,
      `Placeholders visibles: ${Math.round(placeholderRatio * 100)}%.`,
      ...(input.missingRequiredSectionKeys.length > 0
        ? [`Faltan secciones obligatorias: ${input.missingRequiredSectionKeys.join(", ")}.`]
        : []),
    ],
  };
}

function scoreCoherence(input: {
  coherenceReport: ReturnType<typeof buildCoherenceReport>;
  legacyBlueprint: ResearchBlueprintRecord;
}): MasterBlueprintQualityComponentReport {
  const checks = [
    input.coherenceReport.problem_objective_alignment,
    input.coherenceReport.objective_question_alignment,
    input.coherenceReport.objective_method_alignment,
    input.coherenceReport.population_method_alignment,
    input.coherenceReport.technique_analysis_alignment,
    input.coherenceReport.citation_traceability,
  ].filter(Boolean);
  const statusAverage = average(checks.map((check) => statusWeight(check.status)));
  const problemObjectiveOverlap = lexicalOverlap(
    input.legacyBlueprint.problem_statement,
    input.legacyBlueprint.general_objective,
  );
  const objectivesQuestionsOverlap = average(
    input.legacyBlueprint.specific_objectives.map((objective, index) =>
      lexicalOverlap(objective, input.legacyBlueprint.research_questions[index] ?? ""),
    ),
  );
  const lexicalAverage = average([
    problemObjectiveOverlap,
    objectivesQuestionsOverlap,
  ]);
  const score = normalizeScore(
    2 * clamp01(statusAverage * 0.7 + lexicalAverage * 0.3),
    2,
  );

  return {
    key: "coherence",
    label: "Coherencia academica",
    score,
    max_score: 2,
    notes: [
      ...checks.map(
        (check, index) => `${index + 1}. ${check.status.toUpperCase()}: ${check.notes}`,
      ),
      `Solapamiento problema-objetivo: ${(problemObjectiveOverlap * 100).toFixed(0)}%.`,
      `Solapamiento objetivos-preguntas: ${(objectivesQuestionsOverlap * 100).toFixed(0)}%.`,
    ],
  };
}

function scoreTraceability(input: {
  formalReferenceIds: string[];
  invalidReferenceIds: string[];
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
}): MasterBlueprintQualityComponentReport {
  const eligibleFormalSources = input.evidenceLedger.source_registry.filter((source) =>
    source.eligible_for_formal_reference,
  );
  const usedFormalSourceIds = new Set(
    getFormalSourcesFromDrafts({
      drafts: input.drafts,
      evidenceLedger: input.evidenceLedger,
    }).map((source) => source.source_id),
  );
  const validRatio =
    input.formalReferenceIds.length === 0
      ? 0
      : (input.formalReferenceIds.length - input.invalidReferenceIds.length) /
        input.formalReferenceIds.length;
  const registryCoverage = clamp01(eligibleFormalSources.length / 5);
  const usedCoverage =
    input.formalReferenceIds.length === 0
      ? 0
      : input.formalReferenceIds.filter((referenceId) => usedFormalSourceIds.has(referenceId))
          .length / input.formalReferenceIds.length;
  const richness = clamp01(new Set(input.formalReferenceIds).size / 4);
  const score = normalizeScore(
    2 * clamp01(validRatio * 0.55 + registryCoverage * 0.15 + usedCoverage * 0.2 + richness * 0.1),
    2,
  );

  return {
    key: "traceability",
    label: "Trazabilidad formal",
    score,
    max_score: 2,
    notes: [
      `Referencias formales declaradas: ${input.formalReferenceIds.length}.`,
      `Fuentes formales elegibles: ${eligibleFormalSources.length}.`,
      `Referencias usadas en secciones: ${input.formalReferenceIds.filter((referenceId) => usedFormalSourceIds.has(referenceId)).length}/${Math.max(1, input.formalReferenceIds.length)}.`,
      ...(input.invalidReferenceIds.length > 0
        ? [`Referencias fuera del registro: ${input.invalidReferenceIds.join(", ")}.`]
        : ["No se detectaron referencias formales invalidas."]),
    ],
  };
}

function scoreEvidenceSupport(input: {
  evidenceLedger: EvidenceLedger;
  provenanceReport: DocumentProvenanceReport;
  pdfDownloadedCount: number;
}): MasterBlueprintQualityComponentReport {
  const formalSources = input.evidenceLedger.source_registry.filter((source) =>
    source.eligible_for_formal_reference,
  );
  const packs = input.evidenceLedger.evidence_packs.filter((pack) =>
    formalSources.some((source) => source.source_id === pack.source_id),
  );
  const abstractCoverage =
    formalSources.filter((source) => source.abstract?.trim()).length /
    Math.max(1, formalSources.length);
  const pdfSignalCoverage = input.pdfDownloadedCount / Math.max(1, formalSources.length);
  const extractedPdfCoverage =
    packs.filter((pack) => pack.pdf_summary?.trim() || pack.assets.length > 0).length /
    Math.max(1, formalSources.length);
  const assetCoverage =
    clamp01(input.evidenceLedger.assets.length / Math.max(3, formalSources.length));
  const provenanceShare =
    (input.provenanceReport.from_sources_pct + input.provenanceReport.from_pdfs_pct) / 100;
  const score = normalizeScore(
    2 *
      clamp01(
        abstractCoverage * 0.25 +
          pdfSignalCoverage * 0.2 +
          extractedPdfCoverage * 0.2 +
          assetCoverage * 0.15 +
          provenanceShare * 0.2,
      ),
    2,
  );

  return {
    key: "evidence_support",
    label: "Soporte evidencial",
    score,
    max_score: 2,
    notes: [
      `Fuentes formales: ${formalSources.length}.`,
      `Con abstract: ${formalSources.filter((source) => source.abstract?.trim()).length}.`,
      `PDF descargados: ${input.pdfDownloadedCount}.`,
      `Packs con evidencia PDF usable: ${packs.filter((pack) => pack.pdf_summary?.trim() || pack.assets.length > 0).length}.`,
      `Assets estructurados: ${input.evidenceLedger.assets.length}.`,
      `Provenance desde fuentes/PDF: ${input.provenanceReport.from_sources_pct + input.provenanceReport.from_pdfs_pct}%.`,
    ],
  };
}

function scoreObjectiveQuality(input: {
  legacyBlueprint: ResearchBlueprintRecord;
}): MasterBlueprintQualityComponentReport {
  const specificObjectives = input.legacyBlueprint.specific_objectives;
  const specificQuestions = input.legacyBlueprint.research_questions;
  const matrixRows = input.legacyBlueprint.consistency_matrix.length;
  const generalObjective = input.legacyBlueprint.general_objective.trim();
  const generalPresent = generalObjective.length > 20 ? 1 : generalObjective.length > 0 ? 0.5 : 0;
  const objectiveCountFit =
    specificObjectives.length >= 3 && specificObjectives.length <= 5
      ? 1
      : specificObjectives.length >= 2
        ? 0.7
        : specificObjectives.length >= 1
          ? 0.45
          : 0;
  const alignmentRatio =
    specificObjectives.length === 0
      ? 0
      : Math.min(specificQuestions.length, matrixRows, specificObjectives.length) /
        specificObjectives.length;
  const uniqueness = average([
    uniqueRatio(specificObjectives),
    uniqueRatio(specificQuestions),
  ]);
  const specificity =
    average(
      specificObjectives.map((objective) =>
        clamp01(
          (objective.trim().length >= 60 ? 0.6 : objective.trim().length / 100) +
            lexicalOverlap(input.legacyBlueprint.problem_statement, objective) * 0.4,
        ),
      ),
    ) || 0;
  const score = normalizeScore(
    clamp01(
      generalPresent * 0.2 +
        objectiveCountFit * 0.2 +
        alignmentRatio * 0.25 +
        uniqueness * 0.15 +
        specificity * 0.2,
    ),
    1,
  );

  return {
    key: "objective_quality",
    label: "Calidad de objetivos y preguntas",
    score,
    max_score: 1,
    notes: [
      `Objetivo general presente: ${generalPresent > 0 ? "si" : "no"}.`,
      `Objetivos especificos: ${specificObjectives.length}.`,
      `Preguntas: ${specificQuestions.length}.`,
      `Filas de matriz: ${matrixRows}.`,
      `Unicidad promedio: ${(uniqueness * 100).toFixed(0)}%.`,
      `Especificidad promedio: ${(specificity * 100).toFixed(0)}%.`,
    ],
  };
}

function scoreMethodologyClarity(input: {
  drafts: MasterSectionDraft[];
  legacyBlueprint: ResearchBlueprintRecord;
}): MasterBlueprintQualityComponentReport {
  const methodologyText = [
    input.drafts.find((draft) => draft.section_key === "methodology")?.content,
    input.drafts.find((draft) => draft.section_key === "methodological_approach")?.content,
    input.legacyBlueprint.proposed_methodology,
  ]
    .filter(Boolean)
    .join("\n");
  const analysisText = [
    input.drafts.find((draft) => draft.section_key === "analysis_plan")?.content,
    input.legacyBlueprint.analysis_plan,
  ]
    .filter(Boolean)
    .join("\n");
  const populationText = input.legacyBlueprint.population_and_sample;
  const weakSignals = [methodologyText, analysisText, populationText].filter((value) =>
    WEAK_CONTENT_PATTERN.test(value),
  ).length;
  const designSignal = METHODOLOGY_KEYWORDS.design.test(methodologyText) ? 1 : 0;
  const populationSignal = METHODOLOGY_KEYWORDS.population.test(populationText) ? 1 : 0;
  const techniqueSignal = METHODOLOGY_KEYWORDS.technique.test(methodologyText) ? 1 : 0;
  const analysisSignal = METHODOLOGY_KEYWORDS.analysis.test(analysisText) ? 1 : 0;
  const lengthSignal = clamp01(
    Math.min(methodologyText.trim().length, 260) / 260,
  );
  const score = normalizeScore(
    clamp01(
      designSignal * 0.28 +
        populationSignal * 0.22 +
        techniqueSignal * 0.18 +
        analysisSignal * 0.18 +
        lengthSignal * 0.2 -
        weakSignals * 0.08,
    ),
    1,
  );

  return {
    key: "methodology_clarity",
    label: "Claridad metodologica",
    score,
    max_score: 1,
    notes: [
      `Senal de diseno: ${designSignal ? "si" : "no"}.`,
      `Senal de poblacion/muestra: ${populationSignal ? "si" : "no"}.`,
      `Senal de tecnicas/instrumentos: ${techniqueSignal ? "si" : "no"}.`,
      `Senal de analisis: ${analysisSignal ? "si" : "no"}.`,
      `Senales debiles: ${weakSignals}.`,
    ],
  };
}

async function buildQualityReport(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
  legacyBlueprint: ResearchBlueprintRecord;
  evidenceLedger: EvidenceLedger;
  missingRequiredSectionKeys: string[];
  invalidReferenceIds: string[];
  formalReferenceIds: string[];
  coherenceReport: ReturnType<typeof buildCoherenceReport>;
  provenanceReport: DocumentProvenanceReport;
  warnings: string[];
  pdfDownloadedCount: number;
}): Promise<MasterBlueprintQualityReport> {
  const components = [
    scoreStructure({
      masterTemplate: input.masterTemplate,
      drafts: input.drafts,
      missingRequiredSectionKeys: input.missingRequiredSectionKeys,
    }),
    scoreCoherence({
      coherenceReport: input.coherenceReport,
      legacyBlueprint: input.legacyBlueprint,
    }),
    scoreTraceability({
      formalReferenceIds: input.formalReferenceIds,
      invalidReferenceIds: input.invalidReferenceIds,
      drafts: input.drafts,
      evidenceLedger: input.evidenceLedger,
    }),
    scoreEvidenceSupport({
      evidenceLedger: input.evidenceLedger,
      provenanceReport: input.provenanceReport,
      pdfDownloadedCount: input.pdfDownloadedCount,
    }),
    scoreObjectiveQuality({ legacyBlueprint: input.legacyBlueprint }),
    scoreMethodologyClarity({
      drafts: input.drafts,
      legacyBlueprint: input.legacyBlueprint,
    }),
  ] satisfies MasterBlueprintQualityComponentReport[];
  const deterministicScore10 = normalizeScore(
    components.reduce((total, component) => total + component.score, 0),
    10,
  );
  const semanticReview = await reviewMasterBlueprintSemantics({
    project: input.project,
    legacyBlueprint: input.legacyBlueprint,
    evidenceLedger: input.evidenceLedger,
  });
  const semanticScore10 = semanticReview?.score_10 ?? null;
  const combinedScore10 = normalizeScore(
    semanticScore10 === null
      ? deterministicScore10
      : deterministicScore10 * 0.75 + semanticScore10 * 0.25,
    10,
  );
  const hardFailures: string[] = [];

  if (input.missingRequiredSectionKeys.length > 0) {
    hardFailures.push(
      `Faltan secciones obligatorias: ${input.missingRequiredSectionKeys.join(", ")}.`,
    );
  }

  if (input.invalidReferenceIds.length > 0) {
    hardFailures.push(
      `La trazabilidad formal es invalida para: ${input.invalidReferenceIds.join(", ")}.`,
    );
  }

  if (input.formalReferenceIds.length === 0) {
    hardFailures.push("El blueprint no declaro referencias formales utilizables.");
  }

  if (semanticReview?.recommendation === "reject" && (semanticScore10 ?? 0) < 6) {
    hardFailures.push(
      `La revision semantica rechazo el blueprint con ${semanticScore10}/10.`,
    );
  }

  if (combinedScore10 < QUALITY_THRESHOLD) {
    hardFailures.push(
      `El score global ${combinedScore10}/10 no alcanza el minimo requerido de ${QUALITY_THRESHOLD}/10.`,
    );
  }

  return {
    threshold: QUALITY_THRESHOLD,
    passed: hardFailures.length === 0,
    deterministic_score_10: deterministicScore10,
    semantic_score_10: semanticScore10,
    score_10: combinedScore10,
    hard_failures: hardFailures,
    soft_warnings: [
      ...input.warnings,
      ...(semanticReview?.warnings ?? []),
    ],
    components,
    semantic_review: semanticReview,
  };
}

export async function validateMasterBlueprintPackage(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  drafts: MasterSectionDraft[];
  legacyBlueprint: ResearchBlueprintRecord;
  provenanceReport: DocumentProvenanceReport;
  pdfDownloadedCount: number;
}): Promise<{
  validationReport: MasterBlueprintValidationReport;
  coherenceReport: ReturnType<typeof buildCoherenceReport>;
}> {
  const generatedSectionKeys = new Set(input.drafts.map((draft) => draft.section_key));
  const missingRequiredSectionKeys = input.masterTemplate.required_section_keys.filter(
    (sectionKey) => !generatedSectionKeys.has(sectionKey),
  );
  const formalReferenceIds = input.legacyBlueprint.references_used.map(
    (reference) => reference.reference_id,
  );
  const allowedFormalReferenceIds = new Set(
    input.evidenceLedger.source_registry
      .filter((source) => source.eligible_for_formal_reference)
      .map((source) => source.source_id),
  );
  const invalidReferenceIds = formalReferenceIds.filter(
    (referenceId) => !allowedFormalReferenceIds.has(referenceId),
  );
  const warnings = [
    ...input.evidenceLedger.warnings,
    ...(missingRequiredSectionKeys.length > 0
      ? [
          `Faltan secciones obligatorias del MasterTemplate: ${missingRequiredSectionKeys.join(", ")}.`,
        ]
      : []),
    ...(invalidReferenceIds.length > 0
      ? [
          `Se detectaron referencias formales fuera del registro de evidencia: ${invalidReferenceIds.join(", ")}.`,
        ]
      : []),
  ];

  const coherenceReport = buildCoherenceReport(
    input.legacyBlueprint,
    input.project.intake,
    input.evidenceLedger.source_registry
      .filter((source) => source.eligible_for_formal_reference)
      .map((source) => ({ id: source.source_id })),
  );
  const qualityReport = await buildQualityReport({
    project: input.project,
    masterTemplate: input.masterTemplate,
    drafts: input.drafts,
    legacyBlueprint: input.legacyBlueprint,
    evidenceLedger: input.evidenceLedger,
    missingRequiredSectionKeys,
    invalidReferenceIds,
    formalReferenceIds,
    coherenceReport,
    provenanceReport: input.provenanceReport,
    warnings,
    pdfDownloadedCount: input.pdfDownloadedCount,
  });

  return {
    validationReport: {
      required_sections_present: missingRequiredSectionKeys.length === 0,
      missing_required_section_keys: missingRequiredSectionKeys,
      warnings,
      reference_traceability_ok: invalidReferenceIds.length === 0,
      formal_reference_ids: formalReferenceIds,
      quality_report: qualityReport,
    },
    coherenceReport,
  };
}
