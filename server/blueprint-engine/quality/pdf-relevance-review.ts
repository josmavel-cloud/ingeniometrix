import { readFile } from "node:fs/promises";

import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";

export type PdfRelevanceClass =
  | "nuclear_direct"
  | "methodological"
  | "theoretical"
  | "contextual_background"
  | "adjacent"
  | "weak_or_replace"
  | "unusable";

export type PdfAllowedEvidenceUse =
  | "central_claim_support"
  | "method_support"
  | "theory_support"
  | "context_only"
  | "gap_only"
  | "do_not_use";

export type PdfCoverageStrength = "strong" | "partial" | "missing";

export type PdfRelevanceCoverage = {
  central_problem: PdfCoverageStrength;
  population_or_context: PdfCoverageStrength;
  main_variable_or_phenomenon: PdfCoverageStrength;
  method_or_design: PdfCoverageStrength;
  theory_or_model: PdfCoverageStrength;
  data_or_instrument: PdfCoverageStrength;
};

export type PdfRelevanceExcerptRef = {
  page?: number | null;
  section?: string | null;
  excerpt: string;
  reason: string;
};

export type PdfRelevanceReviewItem = {
  source_id: string;
  title: string;
  inspected_text_available: boolean;
  relevance_class: PdfRelevanceClass;
  allowed_evidence_use: PdfAllowedEvidenceUse;
  confidence: "high" | "medium" | "low";
  coverage: PdfRelevanceCoverage;
  matched_keyword_categories: {
    necessary: string[];
    complementary: string[];
    optional: string[];
  };
  supporting_excerpt_refs: PdfRelevanceExcerptRef[];
  warnings: string[];
  blockers: string[];
};

export type PdfRelevanceReviewResultV1 = {
  artifact_type: "pdf_relevance_review";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  review_mode: "llm_structured" | "deterministic_fallback" | "hybrid_with_deterministic_downgrade";
  llm_status: "llm" | "fallback" | "skipped";
  llm_prompt_count: number;
  llm_call_count: number;
  model: string | null;
  keyword_categories: {
    necessary: string[];
    complementary: string[];
    optional: string[];
  };
  source_count: number;
  reviewed_source_count: number;
  nuclear_direct_source_count: number;
  methodological_source_count: number;
  theoretical_source_count: number;
  contextual_or_adjacent_source_count: number;
  weak_or_unusable_source_count: number;
  source_ids_nuclear_direct: string[];
  source_ids_needing_replacement: string[];
  items: PdfRelevanceReviewItem[];
  warnings: string[];
  blockers: string[];
};

type PdfRelevanceLlmItem = {
  source_id: string;
  relevance_class: PdfRelevanceClass;
  allowed_evidence_use: PdfAllowedEvidenceUse;
  confidence: "high" | "medium" | "low";
  coverage: PdfRelevanceCoverage;
  supporting_excerpt_refs: PdfRelevanceExcerptRef[];
  warnings: string[];
  blockers: string[];
};

type PdfRelevanceLlmPlan = {
  source_reviews: PdfRelevanceLlmItem[];
  warnings: string[];
};

const STEP4B_SCHEMA_NAME = "blueprint_launch_step4b_pdf_relevance_review";
const STEP4B_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
const MAX_SAMPLE_CHARS_PER_SOURCE = 6_000;
const MAX_SOURCES_FOR_LLM = 8;

const STOPWORDS = new Set([
  "actual",
  "analisis",
  "analysis",
  "aplicacion",
  "aplicada",
  "applied",
  "area",
  "associated",
  "atencion",
  "available",
  "base",
  "context",
  "contexto",
  "datos",
  "design",
  "diseno",
  "efecto",
  "enfoque",
  "estudio",
  "evidence",
  "factor",
  "factores",
  "investigacion",
  "literatura",
  "marco",
  "method",
  "methodology",
  "metodo",
  "metodologia",
  "modelo",
  "paciente",
  "pacientes",
  "para",
  "peru",
  "peruano",
  "peruanos",
  "population",
  "problema",
  "proposal",
  "propuesta",
  "publica",
  "research",
  "resultado",
  "resultados",
  "salud",
  "servicio",
  "servicios",
  "sobre",
  "source",
  "study",
  "tema",
  "tratamiento",
  "variable",
  "variables",
]);

const METHOD_TERMS = [
  "method",
  "methods",
  "methodology",
  "study design",
  "cross sectional",
  "cohort",
  "survey",
  "interview",
  "regression",
  "protocol",
  "instrument",
  "validation",
  "sample",
  "population",
  "metodo",
  "metodologia",
  "diseno",
  "transversal",
  "cohorte",
  "encuesta",
  "entrevista",
  "regresion",
  "instrumento",
  "validacion",
  "muestra",
  "poblacion",
];

const THEORY_TERMS = [
  "theory",
  "framework",
  "conceptual",
  "model",
  "construct",
  "guideline",
  "teoria",
  "marco",
  "conceptual",
  "modelo",
  "constructo",
  "guia",
];

const VARIABLE_TERMS = [
  "variable",
  "indicator",
  "outcome",
  "exposure",
  "factor",
  "measure",
  "scale",
  "score",
  "dimension",
  "covariate",
  "indicador",
  "resultado",
  "exposicion",
  "medicion",
  "escala",
  "puntaje",
  "dimension",
  "covariable",
];

const pdfRelevanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source_reviews", "warnings"],
  properties: {
    source_reviews: {
      type: "array",
      maxItems: MAX_SOURCES_FOR_LLM,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_id",
          "relevance_class",
          "allowed_evidence_use",
          "confidence",
          "coverage",
          "supporting_excerpt_refs",
          "warnings",
          "blockers",
        ],
        properties: {
          source_id: { type: "string", minLength: 2, maxLength: 220 },
          relevance_class: {
            type: "string",
            enum: [
              "nuclear_direct",
              "methodological",
              "theoretical",
              "contextual_background",
              "adjacent",
              "weak_or_replace",
              "unusable",
            ],
          },
          allowed_evidence_use: {
            type: "string",
            enum: [
              "central_claim_support",
              "method_support",
              "theory_support",
              "context_only",
              "gap_only",
              "do_not_use",
            ],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          coverage: {
            type: "object",
            additionalProperties: false,
            required: [
              "central_problem",
              "population_or_context",
              "main_variable_or_phenomenon",
              "method_or_design",
              "theory_or_model",
              "data_or_instrument",
            ],
            properties: {
              central_problem: { type: "string", enum: ["strong", "partial", "missing"] },
              population_or_context: { type: "string", enum: ["strong", "partial", "missing"] },
              main_variable_or_phenomenon: { type: "string", enum: ["strong", "partial", "missing"] },
              method_or_design: { type: "string", enum: ["strong", "partial", "missing"] },
              theory_or_model: { type: "string", enum: ["strong", "partial", "missing"] },
              data_or_instrument: { type: "string", enum: ["strong", "partial", "missing"] },
            },
          },
          supporting_excerpt_refs: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["excerpt", "reason"],
              properties: {
                page: { type: ["number", "null"] },
                section: { type: ["string", "null"], maxLength: 80 },
                excerpt: { type: "string", minLength: 12, maxLength: 420 },
                reason: { type: "string", minLength: 8, maxLength: 240 },
              },
            },
          },
          warnings: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 220 },
          },
          blockers: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 220 },
          },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 4, maxLength: 220 },
    },
  },
} satisfies Record<string, unknown>;

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>, max = 40) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .slice(0, max);
}

function extractTerms(value: string | null | undefined, max = 16) {
  return unique(
    normalize(value)
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
    max,
  );
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function buildPdfRelevanceKeywordCategories(input: {
  intake: Record<string, unknown>;
  knowledgeAreaLabel?: string | null;
}) {
  const topic = stringFromRecord(input.intake, "topic");
  const problem = stringFromRecord(input.intake, "problemContext");
  const population = stringFromRecord(input.intake, "targetPopulation");
  const researchLine = stringFromRecord(input.intake, "researchLine");
  const methodology = stringFromRecord(input.intake, "preferredMethodology");
  const availableData = stringFromRecord(input.intake, "availableData");
  const constraints = stringFromRecord(input.intake, "academicConstraints");
  const notes = stringFromRecord(input.intake, "advisorNotes");

  return {
    necessary: unique(
      [
        ...extractTerms(topic, 12),
        ...extractTerms(problem, 12),
        ...extractTerms(population, 8),
      ],
      20,
    ),
    complementary: unique(
      [
        ...extractTerms(researchLine, 10),
        ...extractTerms(methodology, 10),
        ...extractTerms(availableData, 10),
      ],
      18,
    ),
    optional: unique(
      [
        ...extractTerms(input.knowledgeAreaLabel, 8),
        ...extractTerms(constraints, 8),
        ...extractTerms(notes, 8),
      ],
      14,
    ),
  };
}

function strengthFromMatches(matches: string[], denominator: number): PdfCoverageStrength {
  if (matches.length === 0) {
    return "missing";
  }

  if (matches.length >= 3 || (denominator > 0 && matches.length / denominator >= 0.45)) {
    return "strong";
  }

  return "partial";
}

function containsTerms(text: string, terms: string[]) {
  const haystack = normalize(text);
  return terms.filter((term) => haystack.includes(normalize(term)));
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;:])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);
}

function excerptRefsForMatches(text: string, terms: string[]) {
  const normalizedTerms = terms.map(normalize).filter(Boolean);
  const sentences = splitSentences(text);
  const refs: PdfRelevanceExcerptRef[] = [];

  for (const sentence of sentences) {
    const normalizedSentence = normalize(sentence);
    const matched = normalizedTerms.filter((term) => normalizedSentence.includes(term));
    if (matched.length === 0) {
      continue;
    }

    refs.push({
      page: null,
      section: null,
      excerpt: sentence.length > 360 ? `${sentence.slice(0, 357)}...` : sentence,
      reason: `Coincide con terminos del intake: ${matched.slice(0, 4).join(", ")}.`,
    });

    if (refs.length >= 3) {
      break;
    }
  }

  return refs;
}

function hasNegatedCentralCoverage(text: string, terms: string[]) {
  const haystack = normalize(text);
  const normalizedTerms = terms.map(normalize).filter(Boolean);
  const negationMarkers = [
    "does not",
    "do not",
    "did not",
    "not evaluate",
    "not assess",
    "not address",
    "no evalua",
    "no aborda",
    "no analiza",
    "no estudia",
    "sin evaluar",
    "sin abordar",
  ];

  return normalizedTerms.some((term) =>
    negationMarkers.some((marker) => {
      const markerIndex = haystack.indexOf(marker);
      if (markerIndex < 0) {
        return false;
      }

      const windowText = haystack.slice(markerIndex, markerIndex + 220);
      return windowText.includes(term);
    }),
  );
}

async function readSampleText(item: BlueprintLaunchLimitedInspectionItem) {
  if (!item.localSampleTextPath) {
    return item.inspectionSummary;
  }

  try {
    const text = await readFile(item.localSampleTextPath, "utf8");
    return text.slice(0, MAX_SAMPLE_CHARS_PER_SOURCE);
  } catch {
    return item.inspectionSummary;
  }
}

function isUsableInspection(item: BlueprintLaunchLimitedInspectionItem) {
  return item.status === "inspected" && item.textCharCount >= 500 && item.identityStatus !== "mismatch";
}

function defaultCoverage(): PdfRelevanceCoverage {
  return {
    central_problem: "missing",
    population_or_context: "missing",
    main_variable_or_phenomenon: "missing",
    method_or_design: "missing",
    theory_or_model: "missing",
    data_or_instrument: "missing",
  };
}

function inferAllowedUse(relevanceClass: PdfRelevanceClass): PdfAllowedEvidenceUse {
  if (relevanceClass === "nuclear_direct") return "central_claim_support";
  if (relevanceClass === "methodological") return "method_support";
  if (relevanceClass === "theoretical") return "theory_support";
  if (relevanceClass === "contextual_background" || relevanceClass === "adjacent") return "context_only";
  if (relevanceClass === "weak_or_replace") return "gap_only";
  return "do_not_use";
}

function normalizeGeneratedRelevanceClass(value: unknown, fallback: PdfRelevanceClass): PdfRelevanceClass {
  return [
    "nuclear_direct",
    "methodological",
    "theoretical",
    "contextual_background",
    "adjacent",
    "weak_or_replace",
    "unusable",
  ].includes(String(value))
    ? (value as PdfRelevanceClass)
    : fallback;
}

function normalizeGeneratedAllowedUse(value: unknown, relevanceClass: PdfRelevanceClass): PdfAllowedEvidenceUse {
  return [
    "central_claim_support",
    "method_support",
    "theory_support",
    "context_only",
    "gap_only",
    "do_not_use",
  ].includes(String(value))
    ? (value as PdfAllowedEvidenceUse)
    : inferAllowedUse(relevanceClass);
}

function normalizeGeneratedConfidence(value: unknown, fallback: PdfRelevanceReviewItem["confidence"]) {
  return ["high", "medium", "low"].includes(String(value))
    ? (value as PdfRelevanceReviewItem["confidence"])
    : fallback;
}

function deterministicReviewItem(input: {
  item: BlueprintLaunchLimitedInspectionItem;
  sampleText: string;
  keywordCategories: ReturnType<typeof buildPdfRelevanceKeywordCategories>;
}): PdfRelevanceReviewItem {
  const necessaryMatches = containsTerms(input.sampleText, input.keywordCategories.necessary);
  const complementaryMatches = containsTerms(input.sampleText, input.keywordCategories.complementary);
  const optionalMatches = containsTerms(input.sampleText, input.keywordCategories.optional);
  const methodMatches = containsTerms(input.sampleText, METHOD_TERMS);
  const theoryMatches = containsTerms(input.sampleText, THEORY_TERMS);
  const variableMatches = containsTerms(input.sampleText, VARIABLE_TERMS);
  const inspected = isUsableInspection(input.item);
  const warnings = [...input.item.warnings];
  const blockers: string[] = [];
  const negatedCentralCoverage = hasNegatedCentralCoverage(input.sampleText, input.keywordCategories.necessary);

  if (!inspected) {
    blockers.push("No hay texto inspeccionado util o la identidad documental no es aceptable.");
  }

  const coverage: PdfRelevanceCoverage = inspected
    ? {
        central_problem: strengthFromMatches(necessaryMatches, input.keywordCategories.necessary.length),
        population_or_context: strengthFromMatches(
          containsTerms(input.sampleText, input.keywordCategories.necessary.slice(-8)),
          Math.min(input.keywordCategories.necessary.length, 8),
        ),
        main_variable_or_phenomenon: strengthFromMatches(
          necessaryMatches.slice(0, 8),
          Math.min(input.keywordCategories.necessary.length, 8),
        ),
        method_or_design: strengthFromMatches(methodMatches, METHOD_TERMS.length),
        theory_or_model: strengthFromMatches(theoryMatches, THEORY_TERMS.length),
        data_or_instrument: strengthFromMatches(variableMatches, VARIABLE_TERMS.length),
      }
    : defaultCoverage();

  let relevanceClass: PdfRelevanceClass = "unusable";
  if (inspected) {
    if (
      !negatedCentralCoverage &&
      coverage.central_problem === "strong" &&
      coverage.main_variable_or_phenomenon !== "missing" &&
      coverage.population_or_context !== "missing"
    ) {
      relevanceClass = "nuclear_direct";
    } else if (coverage.method_or_design === "strong" && coverage.central_problem !== "missing") {
      relevanceClass = "methodological";
    } else if (coverage.theory_or_model === "strong" && coverage.central_problem !== "missing") {
      relevanceClass = "theoretical";
    } else if (necessaryMatches.length > 0 || complementaryMatches.length > 1) {
      relevanceClass = "contextual_background";
    } else if (optionalMatches.length > 0) {
      relevanceClass = "adjacent";
    } else {
      relevanceClass = "weak_or_replace";
    }
  }

  const confidence =
    relevanceClass === "nuclear_direct" && necessaryMatches.length >= 4
      ? "high"
      : relevanceClass === "unusable" || relevanceClass === "weak_or_replace"
        ? "low"
        : "medium";

  if (relevanceClass !== "nuclear_direct") {
    warnings.push("La fuente no cubre de forma fuerte el nucleo del intake en la muestra inspeccionada.");
  }

  if (negatedCentralCoverage) {
    warnings.push("La muestra inspeccionada contiene una negacion o exclusion del nucleo del intake; no se clasifica como nuclear.");
  }

  return {
    source_id: input.item.sourceId,
    title: input.item.title,
    inspected_text_available: inspected,
    relevance_class: relevanceClass,
    allowed_evidence_use: inferAllowedUse(relevanceClass),
    confidence,
    coverage,
    matched_keyword_categories: {
      necessary: necessaryMatches,
      complementary: complementaryMatches,
      optional: optionalMatches,
    },
    supporting_excerpt_refs: excerptRefsForMatches(input.sampleText, [
      ...necessaryMatches,
      ...complementaryMatches,
    ]),
    warnings: unique(warnings, 12),
    blockers: unique(blockers, 8),
  };
}

function downgradeIfUnsupported(input: {
  deterministic: PdfRelevanceReviewItem;
  generated: PdfRelevanceLlmItem | null;
}): PdfRelevanceReviewItem {
  const deterministic = input.deterministic;
  const generated = input.generated;

  if (!generated) {
    return deterministic;
  }

  const generatedWarnings = Array.isArray(generated.warnings) ? generated.warnings : [];
  const generatedBlockers = Array.isArray(generated.blockers) ? generated.blockers : [];
  const generatedExcerptRefs = Array.isArray(generated.supporting_excerpt_refs)
    ? generated.supporting_excerpt_refs
    : [];
  const warnings = unique([...deterministic.warnings, ...generatedWarnings], 16);
  const blockers = unique([...deterministic.blockers, ...generatedBlockers], 10);
  let relevanceClass = normalizeGeneratedRelevanceClass(generated.relevance_class, deterministic.relevance_class);
  let allowedEvidenceUse = normalizeGeneratedAllowedUse(generated.allowed_evidence_use, relevanceClass);
  let confidence = normalizeGeneratedConfidence(generated.confidence, deterministic.confidence);

  if (!deterministic.inspected_text_available) {
    relevanceClass = "unusable";
    allowedEvidenceUse = "do_not_use";
    confidence = "low";
    blockers.push("La salida LLM fue degradada porque no existe texto PDF inspeccionado util.");
  }

  if (
    relevanceClass === "nuclear_direct" &&
    deterministic.coverage.central_problem !== "strong"
  ) {
    relevanceClass =
      deterministic.relevance_class === "methodological" || deterministic.relevance_class === "theoretical"
        ? deterministic.relevance_class
        : "contextual_background";
    allowedEvidenceUse = inferAllowedUse(relevanceClass);
    confidence = "low";
    warnings.push(
      "La salida LLM fue degradada: una fuente no puede ser nuclear sin cobertura fuerte del problema central en el texto inspeccionado.",
    );
  }

  if (relevanceClass === "nuclear_direct" && generatedExcerptRefs.length === 0) {
    relevanceClass = "contextual_background";
    allowedEvidenceUse = "context_only";
    confidence = "low";
    warnings.push("La salida LLM fue degradada: nuclear_direct requiere excerptos de soporte.");
  }

  return {
    ...deterministic,
    relevance_class: relevanceClass,
    allowed_evidence_use: allowedEvidenceUse,
    confidence,
    coverage: generated.coverage ?? deterministic.coverage,
    supporting_excerpt_refs:
      generatedExcerptRefs.length > 0
        ? generatedExcerptRefs
        : deterministic.supporting_excerpt_refs,
    warnings: unique(warnings, 16),
    blockers: unique(blockers, 10),
  };
}

function buildPrompt(input: {
  intake: Record<string, unknown>;
  knowledgeAreaLabel?: string | null;
  keywordCategories: ReturnType<typeof buildPdfRelevanceKeywordCategories>;
  contexts: Array<{
    source_id: string;
    title: string;
    status: string;
    identity_status: string;
    text_char_count: number;
    sample_text: string;
  }>;
}) {
  return [
    "Actua como revisor academico de relevancia fuente-PDF para Ingeniometrix.",
    "",
    "Objetivo:",
    "- evaluar la relevancia academica real de cada fuente usando solo los extractos PDF/texto inspeccionados;",
    "- distinguir fuente nuclear, metodologica, teorica, contextual, adyacente, debil o inutilizable;",
    "- no decidir desde metadata, titulo externo, score de busqueda ni abstract externo si el texto inspeccionado no lo respalda.",
    "",
    "Reglas:",
    "- responde solo JSON estructurado segun el schema;",
    "- no inventes datos, resultados, metodos, instrumentos ni citas;",
    "- una fuente nuclear_direct debe cubrir de forma clara el problema central, poblacion/contexto y fenomeno/variable principal;",
    "- si una fuente solo comparte area general, clasificala como contextual_background o adjacent;",
    "- si no hay texto inspeccionado util, clasificala como unusable;",
    "- incluye excerptos breves tomados del texto proporcionado para justificar nuclear_direct, methodological o theoretical;",
    "- las fuentes sin excerptos de soporte no pueden ser nuclear_direct;",
    "- metadata y DOI solo sirven para identidad, no para probar relevancia real.",
    "",
    `Area/conocimiento: ${input.knowledgeAreaLabel ?? "no especificada"}`,
    `Intake actual: ${JSON.stringify(input.intake, null, 2)}`,
    `Categorias de keywords necesarias: ${JSON.stringify(input.keywordCategories.necessary)}`,
    `Categorias de keywords complementarias: ${JSON.stringify(input.keywordCategories.complementary)}`,
    `Categorias de keywords opcionales: ${JSON.stringify(input.keywordCategories.optional)}`,
    "",
    `Fuentes inspeccionadas: ${JSON.stringify(input.contexts, null, 2)}`,
  ].join("\n");
}

function canUseLlm() {
  return (process.env.LLM_PROVIDER?.trim().toLowerCase() ?? "openai") === "openai" &&
    Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function generateLlmReview(input: {
  prompt: string;
  model: string;
}): Promise<PdfRelevanceLlmPlan | null> {
  if (!canUseLlm()) {
    return null;
  }

  const provider = getConfiguredLlmProvider();
  return generateStructuredObjectWithTextFallback<PdfRelevanceLlmPlan>({
    provider,
    prompt: input.prompt,
    schemaName: STEP4B_SCHEMA_NAME,
    schema: pdfRelevanceSchema,
    model: input.model,
  });
}

function buildSummaryFields(items: PdfRelevanceReviewItem[]) {
  const nuclear = items.filter((item) => item.relevance_class === "nuclear_direct");
  const methodological = items.filter((item) => item.relevance_class === "methodological");
  const theoretical = items.filter((item) => item.relevance_class === "theoretical");
  const contextual = items.filter((item) =>
    item.relevance_class === "contextual_background" || item.relevance_class === "adjacent",
  );
  const weak = items.filter((item) =>
    item.relevance_class === "weak_or_replace" || item.relevance_class === "unusable",
  );

  return {
    nuclear,
    methodological,
    theoretical,
    contextual,
    weak,
  };
}

export async function reviewPdfRelevanceFromLimitedInspection(input: {
  caseId?: string | null;
  intake: Record<string, unknown>;
  knowledgeAreaLabel?: string | null;
  limitedInspection: BlueprintLaunchLimitedSourceInspectionResult;
  selectedSourceBundle?: BlueprintLaunchSelectedSourceBundle | null;
  model?: string | null;
  allowLlm?: boolean;
}): Promise<PdfRelevanceReviewResultV1> {
  const keywordCategories = buildPdfRelevanceKeywordCategories({
    intake: input.intake,
    knowledgeAreaLabel: input.knowledgeAreaLabel,
  });
  const samples = await Promise.all(
    input.limitedInspection.items.map(async (item) => ({
      item,
      sampleText: await readSampleText(item),
    })),
  );
  const deterministicItems = samples.map(({ item, sampleText }) =>
    deterministicReviewItem({ item, sampleText, keywordCategories }),
  );
  const contexts = samples
    .slice(0, MAX_SOURCES_FOR_LLM)
    .map(({ item, sampleText }) => ({
      source_id: item.sourceId,
      title: item.title,
      status: item.status,
      identity_status: item.identityStatus,
      text_char_count: item.textCharCount,
      sample_text: sampleText.slice(0, MAX_SAMPLE_CHARS_PER_SOURCE),
    }));
  const model = input.model?.trim() || STEP4B_MODEL;
  const prompt = buildPrompt({
    intake: input.intake,
    knowledgeAreaLabel: input.knowledgeAreaLabel,
    keywordCategories,
    contexts,
  });
  let generated: PdfRelevanceLlmPlan | null = null;
  let llmStatus: PdfRelevanceReviewResultV1["llm_status"] = "skipped";
  let llmCallCount = 0;
  const warnings: string[] = [];

  if (input.allowLlm !== false) {
    try {
      generated = await generateLlmReview({ prompt, model });
      if (generated) {
        if (!Array.isArray(generated.source_reviews)) {
          throw new Error("La salida LLM no contiene source_reviews como arreglo.");
        }
        llmStatus = "llm";
        llmCallCount = 1;
        warnings.push(...(Array.isArray(generated.warnings) ? generated.warnings : []));
      } else {
        llmStatus = "skipped";
        warnings.push("Revision LLM de relevancia PDF omitida por configuracion; se uso fallback deterministico.");
      }
    } catch (error) {
      llmStatus = "fallback";
      warnings.push(
        error instanceof Error
          ? `Fallo revision LLM de relevancia PDF; se uso fallback deterministico: ${error.message}`
          : "Fallo revision LLM de relevancia PDF; se uso fallback deterministico.",
      );
    }
  }

  const generatedById = new Map((generated?.source_reviews ?? []).map((item) => [item.source_id, item]));
  const items = deterministicItems.map((item) =>
    downgradeIfUnsupported({
      deterministic: item,
      generated: generatedById.get(item.source_id) ?? null,
    }),
  );
  const summary = buildSummaryFields(items);
  const blockers = unique(items.flatMap((item) => item.blockers), 20);
  const reviewMode =
    llmStatus === "llm"
      ? "hybrid_with_deterministic_downgrade"
      : "deterministic_fallback";

  return {
    artifact_type: "pdf_relevance_review",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.caseId ?? null,
    review_mode: reviewMode,
    llm_status: llmStatus,
    llm_prompt_count: input.allowLlm === false ? 0 : 1,
    llm_call_count: llmCallCount,
    model: input.allowLlm === false ? null : model,
    keyword_categories: keywordCategories,
    source_count: input.limitedInspection.items.length,
    reviewed_source_count: items.length,
    nuclear_direct_source_count: summary.nuclear.length,
    methodological_source_count: summary.methodological.length,
    theoretical_source_count: summary.theoretical.length,
    contextual_or_adjacent_source_count: summary.contextual.length,
    weak_or_unusable_source_count: summary.weak.length,
    source_ids_nuclear_direct: summary.nuclear.map((item) => item.source_id),
    source_ids_needing_replacement: summary.weak.map((item) => item.source_id),
    items,
    warnings: unique([...warnings, ...items.flatMap((item) => item.warnings)], 40),
    blockers,
  };
}

export function renderPdfRelevanceReviewReport(report: PdfRelevanceReviewResultV1) {
  const lines = [
    "# PDF High-Level Relevance Review",
    "",
    `- case_id: ${report.case_id ?? "unknown"}`,
    `- review_mode: ${report.review_mode}`,
    `- llm_status: ${report.llm_status}`,
    `- nuclear_direct_source_count: ${report.nuclear_direct_source_count}`,
    `- methodological_source_count: ${report.methodological_source_count}`,
    `- theoretical_source_count: ${report.theoretical_source_count}`,
    `- contextual_or_adjacent_source_count: ${report.contextual_or_adjacent_source_count}`,
    `- weak_or_unusable_source_count: ${report.weak_or_unusable_source_count}`,
    "",
    "## Keyword Categories",
    "",
    `- necessary: ${report.keyword_categories.necessary.join(", ") || "none"}`,
    `- complementary: ${report.keyword_categories.complementary.join(", ") || "none"}`,
    `- optional: ${report.keyword_categories.optional.join(", ") || "none"}`,
    "",
    "## Sources",
    "",
  ];

  for (const item of report.items) {
    lines.push(
      `### ${item.source_id}`,
      "",
      `- title: ${item.title}`,
      `- relevance_class: ${item.relevance_class}`,
      `- allowed_evidence_use: ${item.allowed_evidence_use}`,
      `- confidence: ${item.confidence}`,
      `- inspected_text_available: ${item.inspected_text_available}`,
      `- coverage: ${JSON.stringify(item.coverage)}`,
      `- necessary matches: ${item.matched_keyword_categories.necessary.join(", ") || "none"}`,
      "",
    );

    if (item.supporting_excerpt_refs.length > 0) {
      lines.push("Supporting excerpts:", "");
      for (const ref of item.supporting_excerpt_refs) {
        lines.push(`- ${ref.excerpt} (${ref.reason})`);
      }
      lines.push("");
    }

    if (item.warnings.length > 0) {
      lines.push("Warnings:", "", ...item.warnings.map((warning) => `- ${warning}`), "");
    }
    if (item.blockers.length > 0) {
      lines.push("Blockers:", "", ...item.blockers.map((blocker) => `- ${blocker}`), "");
    }
  }

  return `${lines.join("\n")}\n`;
}
