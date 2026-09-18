import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { extractSearchTerms, normalizeTitle } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

export const MVP_STEP1_KEY = "step_1_intake_normalization";
export const MVP_STEP1_PROMPT_VERSION = "ingeniometrix-step1-intake-normalization-v3";
export const DEFAULT_INTAKE_NORMALIZATION_MODEL = "gpt-5.4-nano";
const STEP1_ARTIFACT_TYPE = "mvp_step1_intake_normalization";

type Step1RetrievalHints = {
  coreConcepts: string[];
  objectTerms: string[];
  methodTerms: string[];
  localContextTerms: string[];
  excludeTerms: string[];
  en?: {
    coreConcepts: string[];
    objectTerms: string[];
    methodTerms: string[];
    localContextTerms: string[];
    excludeTerms: string[];
  };
};

export type NormalizedMvpIntake = IntakeInput & {
  normalizedTopic: string;
  knowledgeArea: {
    label: string;
    rationale: string;
    confidence: number;
  };
  retrievalHints: Step1RetrievalHints;
  safetyNotes: string[];
};

export type MvpStep1DomainProfile = {
  domain_family:
    | "ingenieria_tecnica"
    | "salud_clinica"
    | "ciencias_sociales"
    | "educacion"
    | "negocios_gestion"
    | "derecho_politica_publica"
    | "arquitectura_urbanismo"
    | "general";
  evidence_style: "technical" | "empirical" | "conceptual" | "normative" | "mixed";
  preferred_output_modes: string[];
  reasoning: string[];
};

export type MvpStep1InputQuality = {
  required_fields: Array<{
    field: keyof IntakeInput;
    present: boolean;
    min_length_ok: boolean;
  }>;
  missing_fields: Array<keyof IntakeInput>;
  completeness_score_100: number;
  ready_for_step_2: boolean;
};

export type MvpStep1FrontendSummary = {
  normalized_topic: string;
  knowledge_area_label: string;
  completeness_score_100: number;
  ready_for_step_2: boolean;
  warnings: string[];
  next_action_es: string;
};

export type MvpStep1Result = {
  artifact_type: "mvp_step1_intake_normalization";
  artifact_version: "v1";
  step_key: typeof MVP_STEP1_KEY;
  prompt_version: string;
  project_id: string;
  run_id: string;
  status: "completed" | "partially_completed" | "failed";
  artifact_dir: string;
  artifact_manifest_path: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  source: "llm" | "fallback";
  model: string | null;
  provider: Provider;
  original: IntakeInput;
  normalized: NormalizedMvpIntake;
  input_quality: MvpStep1InputQuality;
  domain_profile: MvpStep1DomainProfile;
  frontend_summary: MvpStep1FrontendSummary;
  warnings: string[];
  errors: string[];
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type Step1ExecutionContext = {
  runId: string;
  artifactDir: string;
  artifactManifestPath: string;
  startedAtIso: string;
  requestedModel: string;
};

const normalizedIntakeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "topic",
    "problemContext",
    "researchLine",
    "academicConstraints",
    "targetPopulation",
    "availableData",
    "preferredMethodology",
    "advisorNotes",
    "normalizedTopic",
    "knowledgeArea",
    "retrievalHints",
    "safetyNotes",
  ],
  properties: {
    topic: { type: "string", minLength: 8, maxLength: 260 },
    problemContext: { type: "string", minLength: 20, maxLength: 1800 },
    researchLine: { type: "string", minLength: 8, maxLength: 420 },
    academicConstraints: { type: "string", minLength: 8, maxLength: 900 },
    targetPopulation: { type: "string", minLength: 8, maxLength: 520 },
    availableData: { type: "string", minLength: 8, maxLength: 700 },
    preferredMethodology: { type: "string", minLength: 8, maxLength: 520 },
    advisorNotes: { type: "string", minLength: 8, maxLength: 700 },
    normalizedTopic: { type: "string", minLength: 8, maxLength: 340 },
    knowledgeArea: {
      type: "object",
      additionalProperties: false,
      required: ["label", "rationale", "confidence"],
      properties: {
        label: { type: "string", minLength: 4, maxLength: 120 },
        rationale: { type: "string", minLength: 8, maxLength: 360 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    retrievalHints: {
      type: "object",
      additionalProperties: false,
      required: ["coreConcepts", "objectTerms", "methodTerms", "localContextTerms", "excludeTerms"],
      properties: {
        coreConcepts: { type: "array", minItems: 3, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        objectTerms: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        methodTerms: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        localContextTerms: { type: "array", minItems: 0, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        excludeTerms: { type: "array", minItems: 0, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        en: {
          type: "object",
          additionalProperties: false,
          required: ["coreConcepts", "objectTerms", "methodTerms", "localContextTerms", "excludeTerms"],
          properties: {
            coreConcepts: { type: "array", minItems: 3, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
            objectTerms: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
            methodTerms: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
            localContextTerms: { type: "array", minItems: 0, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
            excludeTerms: { type: "array", minItems: 0, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
          },
        },
      },
    },
    safetyNotes: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 8, maxLength: 220 } },
  },
} satisfies Record<string, unknown>;

const REQUIRED_FIELDS: Array<{ field: keyof IntakeInput; minLength: number }> = [
  { field: "topic", minLength: 8 },
  { field: "problemContext", minLength: 20 },
  { field: "researchLine", minLength: 8 },
  { field: "academicConstraints", minLength: 8 },
  { field: "targetPopulation", minLength: 8 },
  { field: "availableData", minLength: 8 },
  { field: "preferredMethodology", minLength: 8 },
  { field: "advisorNotes", minLength: 8 },
];

function compact(value: string | undefined, fallback: string) {
  const normalized = (value ?? fallback).replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown, fallback: string, maxLength?: number) {
  if (typeof value !== "string") return compact(fallback, fallback);
  return compact(value, fallback).slice(0, maxLength ?? 260);
}

function pickNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return value;
}

function sanitizeStringList(value: unknown, maxItems: number, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback.slice(0, maxItems);
  }

  return unique(value.map((item) => (typeof item === "string" ? item : String(item)))).slice(0, maxItems);
}

function normalizeKnowledgeArea(record: unknown, topicFallback: string, input: IntakeInput) {
  const knowledgeAreaRecord = asRecord(record) ?? {};
  const label = pickString(knowledgeAreaRecord.label, inferKnowledgeAreaLabel(input), 120);
  const rationale = pickString(
    knowledgeAreaRecord.rationale,
    `Clasificacion basada en los campos del intake original para "${topicFallback}".`,
    360,
  );
  const confidence = pickNumber(knowledgeAreaRecord.confidence, topicFallback.length > 8 ? 0.73 : 0.55);

  return {
    label,
    rationale,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function normalizeRetrievalHints(input: unknown, fallback: ReturnType<typeof buildFallbackRetrievalHints>) {
  const hints = asRecord(input) ?? {};
  const coreConcepts = sanitizeStringList(hints.coreConcepts, 10, fallback.coreConcepts);
  const objectTerms = sanitizeStringList(hints.objectTerms, 10, fallback.objectTerms);
  const methodTerms = sanitizeStringList(hints.methodTerms, 10, fallback.methodTerms);
  const localContextTerms = sanitizeStringList(hints.localContextTerms, 10, fallback.localContextTerms);
  const excludeTerms = sanitizeStringList(hints.excludeTerms, 10, fallback.excludeTerms);
  const en = normalizeStringRecordsForEnglish(asRecord(hints.en), fallback.en);

  return {
    coreConcepts: coreConcepts.length > 0 ? coreConcepts : fallback.coreConcepts,
    objectTerms: objectTerms.length > 0 ? objectTerms : fallback.objectTerms,
    methodTerms: methodTerms.length > 0 ? methodTerms : fallback.methodTerms,
    localContextTerms: localContextTerms.length > 0 ? localContextTerms : fallback.localContextTerms,
    excludeTerms: excludeTerms.length > 0 ? excludeTerms : fallback.excludeTerms,
    en: en ?? buildEnglishHintSet({
      coreConcepts: coreConcepts.length > 0 ? coreConcepts : fallback.coreConcepts,
      objectTerms: objectTerms.length > 0 ? objectTerms : fallback.objectTerms,
      methodTerms: methodTerms.length > 0 ? methodTerms : fallback.methodTerms,
      localContextTerms: localContextTerms.length > 0 ? localContextTerms : fallback.localContextTerms,
      excludeTerms: excludeTerms.length > 0 ? excludeTerms : fallback.excludeTerms,
    }),
  };
}

function normalizeStringRecordsForEnglish(value: unknown, fallback: Step1RetrievalHints["en"]) {
  if (!value) {
    return null;
  }

  const record = asRecord(value) ?? {};
  return {
    coreConcepts: sanitizeStringList(record.coreConcepts, 10, fallback?.coreConcepts ?? []),
    objectTerms: sanitizeStringList(record.objectTerms, 10, fallback?.objectTerms ?? []),
    methodTerms: sanitizeStringList(record.methodTerms, 10, fallback?.methodTerms ?? []),
    localContextTerms: sanitizeStringList(record.localContextTerms, 10, fallback?.localContextTerms ?? []),
    excludeTerms: sanitizeStringList(record.excludeTerms, 10, fallback?.excludeTerms ?? []),
  };
}

function sanitizeNormalizedIntake(raw: unknown, input: IntakeInput): {
  normalized: NormalizedMvpIntake;
  repaired: boolean;
  repairs: string[];
} {
  const record = asRecord(raw);

  const normalizedTopicSource = record && typeof record.normalizedTopic === "string"
    ? record.normalizedTopic
    : undefined;
  const normalizedTopic = pickString(
    normalizedTopicSource,
    compact(input.topic, "Tema de investigación pendiente de normalización."),
    340,
  );
  const knowledgeAreaFallback = normalizeKnowledgeArea(record?.knowledgeArea, normalizedTopic, input);

  const fallbackHints = buildFallbackRetrievalHints(input);
  const retrievalHints = normalizeRetrievalHints(record?.retrievalHints, fallbackHints);

  const normalized: NormalizedMvpIntake = {
    topic: pickString(record?.topic, input.topic ?? "", 260),
    problemContext: pickString(record?.problemContext, input.problemContext ?? "", 1800),
    researchLine: pickString(record?.researchLine, input.researchLine ?? "", 420),
    academicConstraints: pickString(record?.academicConstraints, input.academicConstraints ?? "", 900),
    targetPopulation: pickString(record?.targetPopulation, input.targetPopulation ?? "", 520),
    availableData: pickString(record?.availableData, input.availableData ?? "", 700),
    preferredMethodology: pickString(record?.preferredMethodology, input.preferredMethodology ?? "", 520),
    advisorNotes: pickString(record?.advisorNotes, input.advisorNotes ?? "", 700),
    normalizedTopic,
    knowledgeArea: knowledgeAreaFallback,
    retrievalHints,
    safetyNotes: sanitizeStringList(record?.safetyNotes, 6, [
      "Declarar limitaciones y suposiciones de forma explícita.",
      "No afirmar resultados técnicos no verificados con evidencia.",
      "Mantener trazabilidad y separar inferencia especulativa de hallazgo verificable.",
    ]).slice(0, 6),
  };

  const repairs: string[] = [];
  const requiredFields: Array<{
    field: keyof NormalizedMvpIntake;
    ok: boolean;
  }> = [
    { field: "topic", ok: normalized.topic.length >= 8 },
    { field: "problemContext", ok: compact(normalized.problemContext, input.problemContext ?? "").length >= 20 },
    { field: "researchLine", ok: compact(normalized.researchLine, input.researchLine ?? "").length >= 8 },
    { field: "academicConstraints", ok: compact(normalized.academicConstraints, input.academicConstraints ?? "").length >= 8 },
    { field: "targetPopulation", ok: compact(normalized.targetPopulation, input.targetPopulation ?? "").length >= 8 },
    { field: "availableData", ok: compact(normalized.availableData, input.availableData ?? "").length >= 8 },
    { field: "preferredMethodology", ok: compact(normalized.preferredMethodology, input.preferredMethodology ?? "").length >= 8 },
    { field: "advisorNotes", ok: compact(normalized.advisorNotes, input.advisorNotes ?? "").length >= 8 },
    { field: "normalizedTopic", ok: normalized.normalizedTopic.length >= 8 },
    { field: "knowledgeArea", ok: normalized.knowledgeArea.label.length >= 4 && normalized.knowledgeArea.rationale.length >= 8 },
    { field: "retrievalHints", ok: normalized.retrievalHints.coreConcepts.length >= 3 && normalized.retrievalHints.methodTerms.length >= 1 },
    { field: "safetyNotes", ok: normalized.safetyNotes.length >= 1 },
  ];

  if (!record || requiredFields.some((item) => !item.ok)) {
    const missing = requiredFields.filter((item) => !item.ok).map((item) => item.field);
    repairs.push(
      `Salida LLM parcial; se completaron/ajustaron campos por reglas de robustez: ${missing.join(", ")}.`,
    );
  }

  const fullyComplete = requiredFields.every((item) => item.ok);
  const shouldRepair = !fullyComplete || !record || requiredFields.some((item) => item.ok === false);
  const repaired = shouldRepair || !record;

  if (repaired) {
    normalized.retrievalHints = normalizeRetrievalHints(
      normalized.retrievalHints,
      fallbackHints,
    );
  }

  return { normalized, repaired, repairs };
}

function appendUnique(target: string[], values: Array<string | null | undefined>) {
  const merged = unique([...target, ...values]);
  target.splice(0, target.length, ...merged);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalizeForLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SPANISH_TO_EN_TERM_MAP: Record<string, string> = {
  "evaluacion": "evaluation",
  "comparativa": "comparative",
  "comparacion": "comparative",
  "disipacion": "dissipation",
  "sismica": "seismic",
  "desempeno": "performance",
  "estructural": "structural",
  "concreto": "concrete",
  "armado": "reinforced",
  "mediana": "mid-rise",
  "altura": "height",
  "control": "control",
  "pasivo": "passive",
  "vibraciones": "vibrations",
  "amortiguadores": "dampers",
  "histereticos": "hysteretic",
  "aislamiento": "isolation",
  "modelamiento": "structural modeling",
  "analisis": "analysis",
  "dinamico": "dynamic",
  "linea": "line",
  "lineas": "lines",
  "metodologia": "methodology",
  "metodologias": "methodologies",
  "estrategias": "strategies",
  "sistem": "system",
};

const SPANISH_EN_HINT_STOPWORDS = new Set([
  "de", "la", "el", "las", "los", "en", "un", "una", "unos", "unas",
  "para", "por", "y", "con", "sin", "sobre", "del", "al", "a", "que", "si", "su", "sus",
]);

const SPANISH_EN_PHRASE_MAP: Record<string, string> = {
  "control pasivo": "passive control",
  "disipacion sismica": "seismic damping",
  "disipacion de energia": "energy dissipation",
  "aislamiento sismico": "seismic isolation",
  "desempeno estructural": "structural performance",
  "analisis dinamico": "dynamic analysis",
  "modelamiento estructural": "structural modeling",
};

function buildEnglishHintSet(hints: Step1RetrievalHints): Step1RetrievalHints["en"] {
  if (!hints) {
    return {
      coreConcepts: [],
      objectTerms: [],
      methodTerms: [],
      localContextTerms: [],
      excludeTerms: [],
    };
  }

  const translate = (value: string) => {
    const normalized = normalizeForLookup(value);
    if (!normalized) return value;
    if (SPANISH_EN_PHRASE_MAP[normalized]) {
      return SPANISH_EN_PHRASE_MAP[normalized];
    }

    const tokens = normalized.split(" ");
    const translatedTokens = tokens
      .filter((token) => token.length > 1 && !SPANISH_EN_HINT_STOPWORDS.has(token))
      .map((token) => SPANISH_TO_EN_TERM_MAP[token] ?? token);

    return unique(translatedTokens).join(" ").trim() || value;
  };

  return {
    coreConcepts: unique(hints.coreConcepts.map(translate)).slice(0, 10),
    objectTerms: unique(hints.objectTerms.map(translate)).slice(0, 10),
    methodTerms: unique(hints.methodTerms.map(translate)).slice(0, 10),
    localContextTerms: unique(hints.localContextTerms.map(translate)).slice(0, 10),
    excludeTerms: unique(hints.excludeTerms.map(translate)).slice(0, 10),
  };
}

function buildFallbackRetrievalHints(input: IntakeInput) {
  const spanish = buildFallbackHints(input);
  return {
    ...spanish,
    en: buildEnglishHintSet(spanish),
  };
}

function buildInputQuality(input: IntakeInput): MvpStep1InputQuality {
  const required_fields = REQUIRED_FIELDS.map(({ field, minLength }) => {
    const value = typeof input[field] === "string" ? (input[field] as string).trim() : "";
    return {
      field,
      present: value.length > 0,
      min_length_ok: value.length >= minLength,
    };
  });
  const satisfied = required_fields.filter((item) => item.min_length_ok).length;
  const missing_fields = required_fields
    .filter((item) => !item.min_length_ok)
    .map((item) => item.field);
  const completeness_score_100 = Math.round((satisfied / required_fields.length) * 100);

  return {
    required_fields,
    missing_fields,
    completeness_score_100,
    ready_for_step_2: missing_fields.length === 0,
  };
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function inferDomainProfile(input: IntakeInput, normalized: NormalizedMvpIntake): MvpStep1DomainProfile {
  const safeKnowledgeAreaLabel = normalized.knowledgeArea?.label ?? inferKnowledgeAreaLabel(input);
  const safeCoreConcepts = Array.isArray(normalized.retrievalHints?.coreConcepts) ? normalized.retrievalHints.coreConcepts : [];
  const safeMethodTerms = Array.isArray(normalized.retrievalHints?.methodTerms) ? normalized.retrievalHints.methodTerms : [];

  const joined = normalizeTitle(
    [
      input.topic,
      input.problemContext,
      input.researchLine,
      input.preferredMethodology,
      input.availableData,
      safeKnowledgeAreaLabel,
      safeCoreConcepts.join(" "),
      safeMethodTerms.join(" "),
    ].filter(Boolean).join(" "),
  );

  const domain_family = includesAny(joined, [/ingenier/i, /estructura/i, /sism/i, /model/i, /algorithm/i, /control/i, /dynamic/i, /simulation/i])
    ? "ingenieria_tecnica"
    : includesAny(joined, [/salud/i, /clinical/i, /hospital/i, /patient/i, /diagnos/i, /medic/i])
      ? "salud_clinica"
      : includesAny(joined, [/social/i, /community/i, /policy/i, /govern/i, /municip/i])
        ? "ciencias_sociales"
        : includesAny(joined, [/educa/i, /school/i, /learning/i, /pedagog/i])
          ? "educacion"
          : includesAny(joined, [/business/i, /market/i, /management/i, /operat/i, /productiv/i, /finance/i])
            ? "negocios_gestion"
            : includesAny(joined, [/normativ/i, /regulator/i, /legal/i, /contratacion/i, /doctrin/i])
              ? "derecho_politica_publica"
              : includesAny(joined, [/architect/i, /urban/i, /built environment/i, /territor/i])
                ? "arquitectura_urbanismo"
                : "general";

  const evidence_style = includesAny(joined, [/normativ/i, /regulator/i, /codigo/i, /ley/i])
    ? "normative"
    : includesAny(joined, [/equation/i, /simulation/i, /dynamic/i, /finite element/i, /structural/i, /seismic/i, /technical/i])
      ? "technical"
      : includesAny(joined, [/survey/i, /sample/i, /interview/i, /correl/i, /experimental/i, /quasi/i])
        ? "empirical"
        : includesAny(joined, [/framework/i, /teori/i, /concept/i])
          ? "conceptual"
          : "mixed";

  return {
    domain_family,
    evidence_style,
    preferred_output_modes: unique([
      "normalized_intake",
      evidence_style === "technical" ? "criteria_table" : null,
      evidence_style === "empirical" ? "comparative" : null,
      normalized.retrievalHints.methodTerms.length > 0 ? "method_hint_set" : null,
      normalized.retrievalHints.localContextTerms.length > 0 ? "local_context_hint_set" : null,
    ]),
    reasoning: unique([
      `domain_family inferido: ${domain_family}`,
      `evidence_style inferido: ${evidence_style}`,
      safeKnowledgeAreaLabel ? `knowledge_area: ${safeKnowledgeAreaLabel}` : null,
    ]),
  };
}

function buildFallbackHints(input: IntakeInput) {
  const topicTerms = extractSearchTerms(input.topic, { maxTerms: 8, minLength: 4 });
  const problemTerms = extractSearchTerms(input.problemContext, { maxTerms: 6, minLength: 4 });
  const methodTerms = extractSearchTerms(input.preferredMethodology, { maxTerms: 6, minLength: 4 });
  const contextTerms = extractSearchTerms(
    [input.targetPopulation, input.availableData, input.advisorNotes].filter(Boolean).join(" "),
    { maxTerms: 6, minLength: 4 },
  );

  return {
    coreConcepts: unique([...topicTerms, ...problemTerms]).slice(0, 8),
    objectTerms: unique([
      ...extractSearchTerms(input.targetPopulation, { maxTerms: 5, minLength: 4 }),
      ...extractSearchTerms(input.topic, { maxTerms: 5, minLength: 4 }),
    ]).slice(0, 6),
    methodTerms: unique([
      ...methodTerms,
      ...extractSearchTerms(input.researchLine, { maxTerms: 4, minLength: 4 }),
    ]).slice(0, 6),
    localContextTerms: contextTerms.slice(0, 6),
    excludeTerms: unique([
      input.topic ? "revisión general sin ajuste directo de tema" : null,
      input.advisorNotes ? "resultados promisorios sin evidencia de método" : null,
    ]),
  };
}

function inferKnowledgeAreaLabel(input: IntakeInput) {
  const joined = normalizeTitle(
    [
      input.topic,
      input.problemContext,
      input.researchLine,
      input.preferredMethodology,
      input.advisorNotes,
    ].filter(Boolean).join(" "),
  );

  if (includesAny(joined, [/ingenier/i, /estructura/i, /sism/i, /dynamic/i, /simulation/i, /technical/i])) {
    return "Ingenieria y analisis tecnico";
  }

  if (includesAny(joined, [/salud/i, /clinical/i, /hospital/i, /patient/i, /diagnos/i])) {
    return "Salud y analisis clinico";
  }

  if (includesAny(joined, [/educa/i, /learning/i, /pedagog/i, /school/i])) {
    return "Educacion e innovacion pedagogica";
  }

  if (includesAny(joined, [/business/i, /management/i, /market/i, /finance/i, /operat/i])) {
    return "Negocios, gestion y operaciones";
  }

  if (includesAny(joined, [/social/i, /community/i, /policy/i, /govern/i])) {
    return "Ciencias sociales y politica publica";
  }

  if (includesAny(joined, [/legal/i, /normativ/i, /regulator/i, /ley/i])) {
    return "Derecho, regulacion y politica publica";
  }

  return "Area de conocimiento por clasificar";
}

function fallbackNormalize(input: IntakeInput): NormalizedMvpIntake {
  const hints = buildFallbackRetrievalHints(input);
  const normalizedTopic = compact(input.topic, "Tema de investigacion pendiente de normalizacion.");
  const knowledgeLabel = inferKnowledgeAreaLabel(input);

  return {
    topic: compact(input.topic, normalizedTopic),
    problemContext: compact(input.problemContext, "Contexto pendiente de mayor precision por parte del usuario."),
    researchLine: compact(input.researchLine, "Linea de investigacion pendiente de precision."),
    academicConstraints: compact(
      input.academicConstraints,
      "Mantener trazabilidad academica, declarar supuestos y no afirmar resultados no verificados.",
    ),
    targetPopulation: compact(input.targetPopulation, "Unidad de analisis pendiente de precision."),
    availableData: compact(input.availableData, "Datos disponibles pendientes de especificacion."),
    preferredMethodology: compact(input.preferredMethodology, "Metodologia pendiente de mayor definicion."),
    advisorNotes: compact(input.advisorNotes, "Priorizar fuentes verificables y declarar limitaciones."),
    normalizedTopic,
    knowledgeArea: {
      label: knowledgeLabel,
      rationale: "Clasificacion deterministica por terminos del intake y pistas de recuperacion.",
      confidence: hints.coreConcepts.length >= 3 ? 0.72 : 0.55,
    },
    retrievalHints: {
      coreConcepts: hints.coreConcepts.length >= 3 ? hints.coreConcepts : unique([normalizedTopic, ...hints.coreConcepts]).slice(0, 3),
      objectTerms: hints.objectTerms.length >= 1 ? hints.objectTerms : [compact(input.targetPopulation, "unidad de analisis")],
      methodTerms: hints.methodTerms.length >= 1 ? hints.methodTerms : ["metodologia de investigacion"],
      localContextTerms: hints.localContextTerms,
      excludeTerms: hints.excludeTerms,
      en: hints.en,
    },
    safetyNotes: unique([
      input.academicConstraints,
      "No inventar datos, resultados, ubicaciones exactas ni conclusiones tecnicas no verificadas.",
      "El intake normalizado no reemplaza validacion humana ni evaluacion profesional del caso.",
    ]).slice(0, 6),
  };
}

function buildPrompt(input: IntakeInput) {
  const originalLines = [
    `topic: ${input.topic}`,
    `problemContext: ${input.problemContext ?? ""}`,
    `researchLine: ${input.researchLine ?? ""}`,
    `academicConstraints: ${input.academicConstraints ?? ""}`,
    `targetPopulation: ${input.targetPopulation ?? ""}`,
    `availableData: ${input.availableData ?? ""}`,
    `preferredMethodology: ${input.preferredMethodology ?? ""}`,
    `advisorNotes: ${input.advisorNotes ?? ""}`,
  ];

  return `
Normaliza este intake academico para su uso en el pipeline de investigación.

Objetivos:
- conservar la intención del usuario
- corregir ambiguedades y redundancias menores
- dejar el texto en español claro para el siguiente paso de producto
- derivar pistas de recuperación reutilizables.

Reglas:
- no inventes datos, resultados, ubicaciones exactas, normas especificas ni conclusiones
- emite los campos textuales de UI en español tecnico y claro
- si falta información, usa formulaciones prudentes sin inventar
- conserva advertencias eticas o tecnicas relevantes
    - incluye una version de pistas de recuperación en ingles para consultas de búsqueda en providers: retrievalHints.en
    - mantener coherencia con los campos en español del bloque principal
    - no traduzcas \`knowledgeArea.label\` ni \`normalizedTopic\` al inglés

Intake original:
${originalLines.map((line) => `- ${line}`).join("\n")}
`.trim();
}

function buildFrontendSummary(input: {
  normalized: NormalizedMvpIntake;
  inputQuality: MvpStep1InputQuality;
  warnings: string[];
}) {
  return {
    normalized_topic: input.normalized.normalizedTopic,
    knowledge_area_label: input.normalized.knowledgeArea.label,
    completeness_score_100: input.inputQuality.completeness_score_100,
    ready_for_step_2: input.inputQuality.ready_for_step_2,
    warnings: input.warnings.slice(0, 6),
    next_action_es: input.inputQuality.ready_for_step_2
      ? "Paso 1 listo. Puede continuar al refinamiento con evidencia del Paso 2."
      : "Completa los campos faltantes o revisa el intake normalizado antes de pasar al Paso 2.",
  } satisfies MvpStep1FrontendSummary;
}

async function persistNormalizedProjectState(input: {
  projectId: string;
  normalized: NormalizedMvpIntake;
}) {
  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title: input.normalized.normalizedTopic,
      topicAreaLabel: input.normalized.knowledgeArea.label,
      intake: {
        update: {
          topic: input.normalized.topic,
          problemContext: input.normalized.problemContext,
          researchLine: input.normalized.researchLine,
          academicConstraints: input.normalized.academicConstraints,
          targetPopulation: input.normalized.targetPopulation,
          availableData: input.normalized.availableData,
          preferredMethodology: input.normalized.preferredMethodology,
          advisorNotes: input.normalized.advisorNotes,
        },
      },
    },
  });
}

function buildStep1ExecutionContext(input: { projectId: string; runId?: string; model?: string }) {
  const runId = input.runId ?? `mvp-step1-intake-${randomUUID()}`;
  return {
    runId,
    artifactDir: path.join(process.cwd(), "artifacts-local", "mvp-step1-intake", input.projectId, runId),
    artifactManifestPath: path.join(process.cwd(), "artifacts-local", "mvp-step1-intake", input.projectId, runId, "step1-intake-normalization.json"),
    startedAtIso: new Date().toISOString(),
    requestedModel: input.model ?? process.env.INTAKE_NORMALIZATION_MODEL?.trim() ?? DEFAULT_INTAKE_NORMALIZATION_MODEL,
  } satisfies Step1ExecutionContext;
}

export async function normalizeIntakeForMvpProject(input: {
  userId: string;
  projectId: string;
  model?: string;
  runId?: string;
  persistNormalizedToProject?: boolean;
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    include: { intake: true },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const execution = buildStep1ExecutionContext({
    projectId: input.projectId,
    runId: input.runId,
    model: input.model,
  });
  await mkdir(execution.artifactDir, { recursive: true });

  const original: IntakeInput = {
    topic: project.intake?.topic ?? project.topicSeedText ?? project.title,
    problemContext: project.intake?.problemContext ?? undefined,
    researchLine: project.intake?.researchLine ?? undefined,
    academicConstraints: project.intake?.academicConstraints ?? undefined,
    targetPopulation: project.intake?.targetPopulation ?? undefined,
    availableData: project.intake?.availableData ?? undefined,
    preferredMethodology: project.intake?.preferredMethodology ?? undefined,
    advisorNotes: project.intake?.advisorNotes ?? undefined,
  };
  const inputQuality = buildInputQuality(original);
  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_STEP1_KEY,
    status: "RUNNING",
    model: execution.requestedModel,
    promptVersion: MVP_STEP1_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({ original, input_quality: inputQuality }),
    warningsJson: asStepRunJson(
      inputQuality.missing_fields.map((field) => `Campo incompleto para Paso 1: ${field}`),
    ),
    artifactDir: execution.artifactDir,
    artifactManifestPath: execution.artifactManifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_STEP1_INTAKE_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: execution.runId,
      step_run_id: stepRun.id,
      step_key: MVP_STEP1_KEY,
      started_at: execution.startedAtIso,
      artifact_dir: execution.artifactDir,
      prompt_version: MVP_STEP1_PROMPT_VERSION,
      input_quality: inputQuality,
    }),
  });

  if (!project.intake) {
    const completedAt = new Date();
    const errors = ["Proyecto sin intake persistido para normalizar."];
    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider: Provider.SYSTEM,
      errorsJson: asStepRunJson(errors),
      artifactDir: execution.artifactDir,
      artifactManifestPath: execution.artifactManifestPath,
      finishedAt: completedAt,
    });
    await logAuditEvent({
      eventType: "MVP_STEP1_INTAKE_FAILED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: execution.runId,
        errors,
        completed_at: completedAt.toISOString(),
      }),
    });
    throw new Error(errors[0]);
  }

  const usageBefore = await captureMvpApiUsageSnapshot();
  const warnings = unique([
    ...inputQuality.missing_fields.map((field) => `Campo incompleto para Paso 1: ${field}`),
  ]);
  const errors: string[] = [];
  let normalizedRaw: unknown;
  let normalized: NormalizedMvpIntake;
  let source: "llm" | "fallback" = "llm";
  let provider: Provider = Provider.OPENAI;

  try {
    normalizedRaw = await generateStructuredObjectWithTextFallback<NormalizedMvpIntake>({
      provider: getConfiguredLlmProvider(),
      prompt: buildPrompt(original),
      schemaName: "mvp_intake_normalization",
      schema: normalizedIntakeSchema,
      model: execution.requestedModel,
      trackingAttribution: {
        projectId: input.projectId,
        userId: input.userId,
        runId: execution.runId,
        stage: "intake",
        source: "normalizeIntakeForMvpProject",
      },
    });
  } catch (error) {
    source = "fallback";
    provider = Provider.SYSTEM;
    normalizedRaw = fallbackNormalize(original);
    appendUnique(warnings, ["Se activo fallback deterministico para normalizacion del intake."]);
    appendUnique(errors, [error instanceof Error ? error.message : "Fallo desconocido en normalizacion LLM."]);
  }

  const sanitized = sanitizeNormalizedIntake(normalizedRaw, original);
  normalized = sanitized.normalized;
  if (sanitized.repaired) {
    appendUnique(warnings, sanitized.repairs);
  }

  normalized.retrievalHints = {
    ...normalized.retrievalHints,
    en: normalized.retrievalHints.en ?? buildEnglishHintSet(normalized.retrievalHints),
  };

  const domainProfile = inferDomainProfile(original, normalized);
  if (input.persistNormalizedToProject !== false) {
    await persistNormalizedProjectState({ projectId: input.projectId, normalized });
  }

  const completedAt = new Date();
  const durationMs = Math.max(0, completedAt.getTime() - Date.parse(execution.startedAtIso));
  const status = source === "fallback" || !inputQuality.ready_for_step_2 || sanitized.repaired
    ? "partially_completed"
    : "completed";
  const frontendSummary = buildFrontendSummary({ normalized, inputQuality, warnings });
  const apiUsageReport = await buildMvpApiUsageReport({
    before: usageBefore,
    label: "mvp_step1_intake_normalization",
    filter: { projectId: input.projectId, runId: execution.runId },
  });

  const result: MvpStep1Result = {
    artifact_type: STEP1_ARTIFACT_TYPE,
    artifact_version: "v1",
    step_key: MVP_STEP1_KEY,
    prompt_version: MVP_STEP1_PROMPT_VERSION,
    project_id: input.projectId,
    run_id: execution.runId,
    status,
    artifact_dir: execution.artifactDir,
    artifact_manifest_path: execution.artifactManifestPath,
    started_at: execution.startedAtIso,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    source,
    model: source === "llm" ? execution.requestedModel : null,
    provider,
    original,
    normalized,
    input_quality: inputQuality,
    domain_profile: domainProfile,
    frontend_summary: frontendSummary,
    warnings,
    errors,
    api_usage: {
      run_id: execution.runId,
      report: apiUsageReport,
    },
  };

  await writeFile(execution.artifactManifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(execution.artifactDir, "api-usage-report.json"), `${JSON.stringify(apiUsageReport, null, 2)}\n`, "utf8");

  await updateMvpStepRun(stepRun.id, {
    status: status === "completed" ? "COMPLETED" : "PARTIALLY_COMPLETED",
    provider,
    model: source === "llm" ? execution.requestedModel : null,
    promptVersion: MVP_STEP1_PROMPT_VERSION,
    outputSnapshotJson: asStepRunJson({
      status,
      source,
      normalized,
      input_quality: inputQuality,
      domain_profile: domainProfile,
      frontend_summary: frontendSummary,
      api_usage_delta: apiUsageReport.filtered_delta,
    }),
    warningsJson: asStepRunJson(warnings),
    errorsJson: asStepRunJson(errors),
    fallbackUsed: source === "fallback",
    artifactDir: execution.artifactDir,
    artifactManifestPath: execution.artifactManifestPath,
    finishedAt: completedAt,
  });

  await logAuditEvent({
    eventType: "MVP_STEP1_INTAKE_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: execution.runId,
      step_run_id: stepRun.id,
      status,
      source,
      model: source === "llm" ? execution.requestedModel : null,
      prompt_version: MVP_STEP1_PROMPT_VERSION,
      started_at: execution.startedAtIso,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      artifact_dir: execution.artifactDir,
      artifact_manifest_path: execution.artifactManifestPath,
      warnings,
      errors,
      input_quality: inputQuality,
      api_usage_delta: apiUsageReport.filtered_delta,
    }),
  });

  return result;
}
