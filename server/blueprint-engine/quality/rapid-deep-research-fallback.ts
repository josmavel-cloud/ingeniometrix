import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";

import type {
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import { recordLlmUsage } from "@/server/llm-usage-registry";
import type { DeepResearchLightArtifactsV1 } from "@/server/blueprint-engine/quality/deep-research-light";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

export const RAPID_DEEP_RESEARCH_PROMPT_VERSION = "rapid_deep_research_fallback.v5_evidence_candidates";
export const DEFAULT_RAPID_DEEP_RESEARCH_MODEL = "o4-mini-deep-research";
export const DEFAULT_RAPID_DEEP_RESEARCH_MAX_TOOL_CALLS = 6;
const DEFAULT_CACHE_ROOT = path.join(process.cwd(), "artifacts-local", "rapid-deep-research-cache");

export type RapidDeepResearchGapCategory =
  | "direct_nuclear_sources"
  | "method_or_study_design"
  | "theory_or_model"
  | "variables_or_indicators"
  | "secondary_reference_recovery";

export type RapidDeepResearchCandidateSource = {
  candidate_id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  url: string | null;
  provider: "openai_deep_research";
  gap_covered: RapidDeepResearchGapCategory[];
  why_relevant_es: string;
  evidence_note_es: string;
  confidence: "high" | "medium" | "low";
  citable_status: "candidate_only_not_citable_yet";
  must_pass_source_selection: true;
  must_pass_evidence_engine: true;
  warnings: string[];
};

export type RapidDeepResearchEvidenceType =
  | "method_definition"
  | "theory_support"
  | "model_support"
  | "variable_definition"
  | "empirical_finding"
  | "instrument"
  | "guideline"
  | "limitation"
  | "secondary_reference"
  | "other";

export type RapidDeepResearchReferenceType =
  | "journal_article"
  | "review"
  | "guideline"
  | "book_chapter"
  | "thesis"
  | "report"
  | "other";

export type RapidDeepResearchEvidenceCandidate = {
  evidence_candidate_id: string;
  evidence_need_id: RapidDeepResearchGapCategory;
  gap_addressed: string;
  candidate_evidence: {
    evidence_type: RapidDeepResearchEvidenceType;
    claim_or_use: string;
    excerpt_or_summary: string;
    exact_quote_if_available: string | null;
    page_or_section_if_available: string | null;
  };
  reference: {
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    doi: string | null;
    url: string | null;
    source_type: RapidDeepResearchReferenceType;
  };
  why_relevant: string;
  confidence: "high" | "medium" | "low";
  validation_status: "candidate_pending_local_verification";
  must_pass_source_selection: true;
  must_pass_pdf_or_source_inspection: true;
  must_pass_evidence_engine: true;
  warnings: string[];
};

export type RapidDeepResearchRequestV1 = {
  artifact_type: "rapid_deep_research_request";
  artifact_version: "v1";
  generated_at: string;
  prompt_version: typeof RAPID_DEEP_RESEARCH_PROMPT_VERSION;
  case_id: string | null;
  model: string;
  max_tool_calls: number;
  background: true;
  tool_policy: {
    web_search_preview: true;
    search_context_size: "medium";
  };
  current_context: {
    intake_topic: string | null;
    search_query: string | null;
    selected_sources: Array<{
      source_id: string;
      title: string;
      doi: string | null;
      year: number | null;
    }>;
    post_inspection_decision: PostInspectionSourceSufficiencyReportV1["decision"];
    missing_evidence_categories: string[];
    usable_source_count: number;
    direct_usable_source_count: number;
    method_signal_source_count: number;
    theory_signal_source_count: number;
    variable_signal_source_count: number;
    secondary_reference_candidate_count: number;
    inspected_source_summaries: Array<{
      source_id: string;
      title: string;
      status: string;
      identity_status: string;
      text_char_count: number;
      method_signals: string[];
      theory_signals: string[];
      variable_signals: string[];
      warnings: string[];
    }>;
    deterministic_search_families: Array<{
      category: RapidDeepResearchGapCategory;
      queries: string[];
      expected_source_role: string;
    }>;
  };
  prompt_text: string;
};

export type RapidDeepResearchRawOutput = {
  status?: string;
  summary_es?: string;
  evidence_candidates?: Array<{
    evidence_candidate_id?: string | null;
    evidence_need_id?: string | null;
    gap_addressed?: string | null;
    candidate_evidence?: {
      evidence_type?: string | null;
      claim_or_use?: string | null;
      excerpt_or_summary?: string | null;
      exact_quote_if_available?: string | null;
      page_or_section_if_available?: string | null;
    } | null;
    reference?: {
      title?: string | null;
      authors?: string[] | null;
      year?: number | null;
      venue?: string | null;
      doi?: string | null;
      url?: string | null;
      source_type?: string | null;
    } | null;
    why_relevant?: string | null;
    confidence?: string | null;
    validation_status?: string | null;
    must_pass_source_selection?: boolean | null;
    must_pass_pdf_or_source_inspection?: boolean | null;
    must_pass_evidence_engine?: boolean | null;
    warnings?: string[] | null;
  }>;
  candidates?: Array<{
    title?: string | null;
    authors?: string[] | null;
    year?: number | null;
    doi?: string | null;
    url?: string | null;
    gap_covered?: string[] | null;
    why_relevant_es?: string | null;
    evidence_note_es?: string | null;
    confidence?: string | null;
    warnings?: string[] | null;
  }>;
  warnings?: string[] | null;
};

export type RapidDeepResearchValidationReportV1 = {
  artifact_type: "rapid_deep_research_validation_report";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  accepted_evidence_candidate_count: number;
  accepted_candidate_count: number;
  rejected_candidate_count: number;
  rejected_candidates: Array<{
    title: string | null;
    reasons: string[];
  }>;
  warnings: string[];
  blockers: string[];
};

export type RapidDeepResearchResultV1 = {
  artifact_type: "rapid_deep_research_result";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  status: "completed" | "unavailable" | "cache_hit" | "failed_validation" | "failed";
  model: string;
  prompt_version: typeof RAPID_DEEP_RESEARCH_PROMPT_VERSION;
  max_tool_calls: number;
  cache_key: string;
  cache_hit: boolean;
  response_id: string | null;
  openai_called: boolean;
  candidates: RapidDeepResearchCandidateSource[];
  summary_es: string | null;
  warnings: string[];
  blockers: string[];
  usage: {
    provider: "openai" | "none";
    model: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_cad: number;
    duration_ms: number;
  } | null;
  raw_output_excerpt?: string | null;
};

type ResponseLike = {
  id?: string | null;
  status?: string | null;
  output_text?: string | null;
  output?: unknown;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    output_tokens?: number;
  } | null;
};

export type RapidDeepResearchFallbackArtifactsV1 = {
  request: RapidDeepResearchRequestV1;
  result: RapidDeepResearchResultV1;
  evidenceCandidates: {
    artifact_type: "deep_research_evidence_candidates";
    artifact_version: "v1";
    generated_at: string;
    case_id: string | null;
    evidence_candidate_count: number;
    candidates: RapidDeepResearchEvidenceCandidate[];
    warnings: string[];
  };
  candidateSources: {
    artifact_type: "rapid_deep_research_candidate_sources";
    artifact_version: "v1";
    generated_at: string;
    case_id: string | null;
    candidate_count: number;
    candidates: RapidDeepResearchCandidateSource[];
    warnings: string[];
  };
  validationReport: RapidDeepResearchValidationReportV1;
};

function unique<T>(values: Array<T | null | undefined>, keyFn: (value: T) => string = String) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const key = keyFn(value).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .replace(/[^a-z0-9./:-]+/g, " ")
    .trim();
}

function clip(value: string | null | undefined, max = 600) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function safeId(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "rapid-candidate";
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRapidDeepResearchModel(model?: string | null) {
  return (
    model?.trim() ||
    process.env.OPENAI_DEEP_RESEARCH_MODEL?.trim() ||
    DEFAULT_RAPID_DEEP_RESEARCH_MODEL
  );
}

function resolveMaxToolCalls(value?: number | null) {
  if (Number.isFinite(value) && value && value > 0) return Math.max(1, Math.floor(value));
  const envValue = Number.parseInt(process.env.OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS ?? "", 10);
  return Number.isFinite(envValue) && envValue > 0
    ? envValue
    : DEFAULT_RAPID_DEEP_RESEARCH_MAX_TOOL_CALLS;
}

function candidateDedupeKey(candidate: RapidDeepResearchCandidateSource) {
  return candidate.doi
    ? `doi:${normalize(candidate.doi)}`
    : candidate.url
      ? `url:${normalize(candidate.url)}`
      : `title:${normalize(candidate.title)}:${candidate.year ?? "unknown"}`;
}

function isGapCategory(value: string): value is RapidDeepResearchGapCategory {
  return [
    "direct_nuclear_sources",
    "method_or_study_design",
    "theory_or_model",
    "variables_or_indicators",
    "secondary_reference_recovery",
  ].includes(value);
}

function isEvidenceType(value: string): value is RapidDeepResearchEvidenceType {
  return [
    "method_definition",
    "theory_support",
    "model_support",
    "variable_definition",
    "empirical_finding",
    "instrument",
    "guideline",
    "limitation",
    "secondary_reference",
    "other",
  ].includes(value);
}

function isReferenceType(value: string): value is RapidDeepResearchReferenceType {
  return [
    "journal_article",
    "review",
    "guideline",
    "book_chapter",
    "thesis",
    "report",
    "other",
  ].includes(value);
}

function defaultEvidenceTypeForGap(gap: RapidDeepResearchGapCategory): RapidDeepResearchEvidenceType {
  if (gap === "method_or_study_design") return "method_definition";
  if (gap === "theory_or_model") return "theory_support";
  if (gap === "variables_or_indicators") return "variable_definition";
  if (gap === "secondary_reference_recovery") return "secondary_reference";
  return "empirical_finding";
}

function evidenceNeedLabel(gap: RapidDeepResearchGapCategory) {
  if (gap === "direct_nuclear_sources") {
    return "Evidencia nuclear directa para el problema central del intake actual.";
  }
  if (gap === "method_or_study_design") {
    return "Evidencia sobre metodo, diseno de estudio, instrumento o estrategia de validacion aplicable.";
  }
  if (gap === "theory_or_model") {
    return "Evidencia sobre teoria, marco conceptual, modelo o fundamento explicativo.";
  }
  if (gap === "variables_or_indicators") {
    return "Evidencia sobre variables, indicadores, medicion, criterios o resultados esperados.";
  }
  return "Recuperacion de referencia secundaria detectada en fuentes inspeccionadas.";
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch =
    trimmed.match(/```json\s*([\s\S]*?)```/i) ??
    trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  throw new Error("No se encontro JSON valido en la respuesta Rapid Deep Research.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectTextFields(value: unknown, target: string[], depth = 0) {
  if (depth > 5) return;
  if (typeof value === "string") return;
  if (Array.isArray(value)) {
    for (const item of value) collectTextFields(item, target, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  const type = typeof value.type === "string" ? value.type : "";
  const text = typeof value.text === "string" ? value.text : null;
  if (text && (depth <= 4 || ["output_text", "text", "message"].some((marker) => type.includes(marker) || type === marker))) {
    target.push(text);
  }

  if (Array.isArray(value.content)) collectTextFields(value.content, target, depth + 1);
  if (Array.isArray(value.summary)) collectTextFields(value.summary, target, depth + 1);
  if (Array.isArray(value.output)) collectTextFields(value.output, target, depth + 1);
}

function extractResponseOutputText(response: ResponseLike) {
  if (response.output_text?.trim()) return response.output_text;
  const pieces: string[] = [];
  collectTextFields(response.output, pieces);
  return unique(pieces).join("\n\n");
}

function parseRapidDeepResearchOutput(input: {
  outputText: string;
  fallbackGapCategories: RapidDeepResearchGapCategory[];
}): {
  raw: RapidDeepResearchRawOutput;
  warnings: string[];
} {
  try {
    return {
      raw: JSON.parse(extractJsonObject(input.outputText)) as RapidDeepResearchRawOutput,
      warnings: [],
    };
  } catch {
    const candidates = extractCandidatesFromNonJsonOutput({
      outputText: input.outputText,
      fallbackGapCategories: input.fallbackGapCategories,
    });
    return {
      raw: {
        status: candidates.length > 0 ? "completed" : "insufficient_results",
        summary_es:
          candidates.length > 0
            ? "La respuesta no vino en JSON; se extrajeron candidatos de DOI/URL de forma deterministica."
            : "La respuesta no vino en JSON y no se detectaron candidatos con DOI/URL.",
        candidates,
        warnings: ["rapid_deep_research_returned_non_json_deterministic_extraction_used"],
      },
      warnings: ["rapid_deep_research_returned_non_json_deterministic_extraction_used"],
    };
  }
}

function extractCandidatesFromNonJsonOutput(input: {
  outputText: string;
  fallbackGapCategories: RapidDeepResearchGapCategory[];
}): NonNullable<RapidDeepResearchRawOutput["candidates"]> {
  const lines = input.outputText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const candidates: NonNullable<RapidDeepResearchRawOutput["candidates"]> = [];
  const used = new Set<string>();
  const fallbackGaps = input.fallbackGapCategories.length > 0
    ? input.fallbackGapCategories
    : ["direct_nuclear_sources" as const];

  for (const [index, line] of lines.entries()) {
    const doi = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i.exec(line)?.[0]?.replace(/[.,;)\]]+$/, "") ?? null;
    const url = /https?:\/\/[^\s)\]]+/i.exec(line)?.[0]?.replace(/[.,;)\]]+$/, "") ?? null;
    if (!doi && !url) continue;

    const previousLine = lines[Math.max(0, index - 1)] ?? "";
    const titleSource = line
      .replace(/https?:\/\/[^\s)\]]+/gi, "")
      .replace(/\bdoi\s*:\s*\S+/gi, "")
      .replace(doi ?? "", "")
      .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
      .replace(/\s+-\s+$/, "")
      .trim();
    const title = titleSource.length >= 16
      ? titleSource
      : previousLine.length >= 16
        ? previousLine.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()
        : `Rapid Deep Research candidate ${candidates.length + 1}`;
    const key = doi ? `doi:${normalize(doi)}` : `url:${normalize(url)}`;
    if (used.has(key)) continue;
    used.add(key);

    candidates.push({
      title: clip(title, 240),
      authors: [],
      year: Number.parseInt(/\b(19|20)\d{2}\b/.exec(line)?.[0] ?? "", 10) || null,
      doi,
      url,
      gap_covered: fallbackGaps.slice(0, 3),
      why_relevant_es:
        "Candidato extraido de una respuesta no estructurada de Deep Research; requiere revision y procesamiento.",
      evidence_note_es:
        "No es evidencia citable hasta pasar por seleccion de fuentes y Evidence Engine.",
      confidence: "low",
      warnings: ["non_json_output_candidate_needs_manual_review"],
    });
  }

  return candidates.slice(0, 12);
}

export function buildRapidDeepResearchPrompt(context: RapidDeepResearchRequestV1["current_context"]) {
  const evidenceNeeds = unique([
    ...context.missing_evidence_categories,
    ...context.deterministic_search_families.map((family) => family.category),
  ])
    .filter(isGapCategory)
    .map((gap) => ({
      evidence_need_id: gap,
      gap_addressed: evidenceNeedLabel(gap),
    }));

  return `
Actua como especialista en recuperacion bibliografica academica y verificacion de evidencia.

Objetivo: hacer una busqueda Deep Research rapida SOLO para encontrar evidencia candidata y su referencia verificable asociada para cubrir vacios reales detectados despues de inspeccionar fuentes/PDFs del intake actual.

Reglas estrictas:
- No redactes marco teorico, metodologia ni contenido final.
- No inventes referencias, DOI, URL, datos, instrumentos, ecuaciones, resultados, paginas ni citas textuales.
- No trates ninguna evidencia candidata como evidencia citable.
- Toda evidencia candidata debe tener una referencia verificable con titulo y DOI o URL.
- Usa pocas busquedas web: prioriza 2 a 4 busquedas, luego devuelve el JSON final.
- Reserva presupuesto de salida para responder el JSON; no expliques tu proceso.
- Clasifica que vacio cubre cada evidencia usando solo estas categorias: direct_nuclear_sources, method_or_study_design, theory_or_model, variables_or_indicators, secondary_reference_recovery.
- Si una referencia fue citada dentro de un PDF pero no la localizas externamente, no la incluyas como candidato recuperado.
- Usa candidate_pending_local_verification para todo resultado.
- Todo resultado debe pasar seleccion humana, inspeccion de PDF/fuente y Evidence Engine antes de citarse.
- Si no puedes verificar una referencia, no la incluyas.
- Devuelve JSON valido, sin markdown ni texto fuera del JSON.
- La salida debe estar en espanol salvo titulos originales de fuentes.

Contexto actual, no usar nada fuera de este intake:
${JSON.stringify(context, null, 2)}

Vacios de evidencia que puedes cubrir:
${JSON.stringify(evidenceNeeds, null, 2)}

Devuelve exactamente este objeto JSON:
{
  "status": "completed" | "insufficient_results",
  "summary_es": "resumen breve de que vacios se pudieron cubrir o no",
  "evidence_candidates": [
    {
      "evidence_candidate_id": "dr-ev-001",
      "evidence_need_id": "method_or_study_design",
      "gap_addressed": "vacio especifico que cubre",
      "candidate_evidence": {
        "evidence_type": "method_definition",
        "claim_or_use": "uso prudente que podria sustentar si se valida localmente",
        "excerpt_or_summary": "resumen breve de la evidencia localizada",
        "exact_quote_if_available": null,
        "page_or_section_if_available": null
      },
      "reference": {
        "title": "titulo de la fuente",
        "authors": ["autor 1"],
        "year": 2024,
        "venue": "revista, guia, libro o repositorio si se conoce",
        "doi": "10.xxxx/xxxxx o null",
        "url": "https://... o null",
        "source_type": "journal_article"
      },
      "why_relevant": "por que podria cubrir el vacio",
      "confidence": "high" | "medium" | "low",
      "validation_status": "candidate_pending_local_verification",
      "must_pass_source_selection": true,
      "must_pass_pdf_or_source_inspection": true,
      "must_pass_evidence_engine": true,
      "warnings": ["advertencias si aplica"]
    }
  ],
  "warnings": ["advertencias generales"]
}
`.trim();
}

export function buildRapidDeepResearchRequest(input: {
  caseId?: string | null;
  bundle: BlueprintLaunchSelectedSourceBundle;
  limitedInspection: BlueprintLaunchLimitedSourceInspectionResult;
  postInspectionSufficiency: PostInspectionSourceSufficiencyReportV1;
  deepResearchLight?: DeepResearchLightArtifactsV1 | null;
  model?: string | null;
  maxToolCalls?: number | null;
}): RapidDeepResearchRequestV1 {
  const model = resolveRapidDeepResearchModel(input.model);
  const maxToolCalls = resolveMaxToolCalls(input.maxToolCalls);
  const families = input.deepResearchLight?.searchPlan.query_families ?? [];
  const currentContext: RapidDeepResearchRequestV1["current_context"] = {
    intake_topic: input.bundle.intakeTopic ?? null,
    search_query: input.bundle.searchQuery ?? null,
    selected_sources: input.bundle.sources.map((source) => ({
      source_id: source.reference.id,
      title: source.reference.title,
      doi: source.reference.doi,
      year: source.reference.year,
    })),
    post_inspection_decision: input.postInspectionSufficiency.decision,
    missing_evidence_categories: input.postInspectionSufficiency.missing_evidence_categories,
    usable_source_count: input.postInspectionSufficiency.usable_source_count,
    direct_usable_source_count: input.postInspectionSufficiency.direct_usable_source_count,
    method_signal_source_count: input.postInspectionSufficiency.method_signal_source_count,
    theory_signal_source_count: input.postInspectionSufficiency.theory_signal_source_count,
    variable_signal_source_count: input.postInspectionSufficiency.variable_signal_source_count,
    secondary_reference_candidate_count:
      input.postInspectionSufficiency.secondary_reference_candidate_count,
    inspected_source_summaries: input.limitedInspection.items.map((item) => ({
      source_id: item.sourceId,
      title: item.title,
      status: item.status,
      identity_status: item.identityStatus,
      text_char_count: item.textCharCount,
      method_signals: item.methodSignals.slice(0, 8),
      theory_signals: item.theorySignals.slice(0, 8),
      variable_signals: item.variableSignals.slice(0, 8),
      warnings: item.warnings.slice(0, 8),
    })),
    deterministic_search_families: families.map((family) => ({
      category: family.category,
      queries: family.queries.slice(0, 4),
      expected_source_role: family.expected_source_role,
    })),
  };

  return {
    artifact_type: "rapid_deep_research_request",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    prompt_version: RAPID_DEEP_RESEARCH_PROMPT_VERSION,
    case_id: input.caseId ?? null,
    model,
    max_tool_calls: maxToolCalls,
    background: true,
    tool_policy: {
      web_search_preview: true,
      search_context_size: "medium",
    },
    current_context: currentContext,
    prompt_text: buildRapidDeepResearchPrompt(currentContext),
  };
}

export function buildRapidDeepResearchCacheKey(request: RapidDeepResearchRequestV1) {
  return sha256Json({
    prompt_version: request.prompt_version,
    case_id: request.case_id,
    model: request.model,
    max_tool_calls: request.max_tool_calls,
    current_context: request.current_context,
  });
}

export function validateRapidDeepResearchOutput(input: {
  caseId?: string | null;
  raw: RapidDeepResearchRawOutput;
  selectedSources: BlueprintLaunchSelectedSourceBundle["sources"];
}): {
  candidates: RapidDeepResearchCandidateSource[];
  evidenceCandidates: RapidDeepResearchEvidenceCandidate[];
  validationReport: RapidDeepResearchValidationReportV1;
} {
  const selectedKeys = new Set(
    input.selectedSources.flatMap((source) =>
      unique([
        source.reference.doi ? `doi:${normalize(source.reference.doi)}` : null,
        `title:${normalize(source.reference.title)}`,
      ]),
    ),
  );
  const rejected: RapidDeepResearchValidationReportV1["rejected_candidates"] = [];
  const acceptedEvidence: RapidDeepResearchEvidenceCandidate[] = [];

  const normalizedInputs = [
    ...(input.raw.evidence_candidates ?? []).map((candidate) => {
      const evidenceNeedId = isGapCategory(candidate.evidence_need_id ?? "")
        ? candidate.evidence_need_id as RapidDeepResearchGapCategory
        : null;
      return {
        title: candidate.reference?.title ?? null,
        authors: candidate.reference?.authors ?? [],
        year: candidate.reference?.year ?? null,
        venue: candidate.reference?.venue ?? null,
        doi: candidate.reference?.doi ?? null,
        url: candidate.reference?.url ?? null,
        sourceType: candidate.reference?.source_type ?? null,
        gap: evidenceNeedId,
        gapAddressed: candidate.gap_addressed ?? null,
        evidenceType: candidate.candidate_evidence?.evidence_type ?? null,
        claimOrUse: candidate.candidate_evidence?.claim_or_use ?? null,
        excerptOrSummary: candidate.candidate_evidence?.excerpt_or_summary ?? null,
        exactQuote: candidate.candidate_evidence?.exact_quote_if_available ?? null,
        pageOrSection: candidate.candidate_evidence?.page_or_section_if_available ?? null,
        whyRelevant: candidate.why_relevant ?? null,
        confidence: candidate.confidence ?? null,
        validationStatus: candidate.validation_status ?? null,
        mustPassSourceSelection: candidate.must_pass_source_selection,
        mustPassPdfOrSourceInspection: candidate.must_pass_pdf_or_source_inspection,
        mustPassEvidenceEngine: candidate.must_pass_evidence_engine,
        warnings: candidate.warnings ?? [],
      };
    }),
    ...(input.raw.candidates ?? []).map((candidate) => {
      const gaps = unique(candidate.gap_covered ?? []).filter(isGapCategory);
      const gap = gaps[0] ?? null;
      return {
        title: candidate.title ?? null,
        authors: candidate.authors ?? [],
        year: candidate.year ?? null,
        venue: null,
        doi: candidate.doi ?? null,
        url: candidate.url ?? null,
        sourceType: "journal_article",
        gap,
        gapAddressed: gap ? evidenceNeedLabel(gap) : null,
        evidenceType: gap ? defaultEvidenceTypeForGap(gap) : null,
        claimOrUse: candidate.why_relevant_es ?? null,
        excerptOrSummary: candidate.evidence_note_es ?? null,
        exactQuote: null,
        pageOrSection: null,
        whyRelevant: candidate.why_relevant_es ?? null,
        confidence: candidate.confidence ?? null,
        validationStatus: "candidate_pending_local_verification",
        mustPassSourceSelection: true,
        mustPassPdfOrSourceInspection: true,
        mustPassEvidenceEngine: true,
        warnings: candidate.warnings ?? [],
      };
    }),
  ];

  for (const candidate of normalizedInputs) {
    const reasons: string[] = [];
    const title = clip(candidate.title, 240);
    const doi = clip(candidate.doi, 160) || null;
    const url = clip(candidate.url, 300) || null;
    const gap = candidate.gap && isGapCategory(candidate.gap) ? candidate.gap : null;

    if (!title) reasons.push("missing_title");
    if (!doi && !url) reasons.push("missing_doi_or_url");
    if (!gap) reasons.push("missing_valid_evidence_need_id");
    if (candidate.validationStatus !== "candidate_pending_local_verification") {
      reasons.push("invalid_validation_status");
    }
    if (candidate.mustPassSourceSelection !== true) reasons.push("must_pass_source_selection_not_true");
    if (candidate.mustPassPdfOrSourceInspection !== true) {
      reasons.push("must_pass_pdf_or_source_inspection_not_true");
    }
    if (candidate.mustPassEvidenceEngine !== true) reasons.push("must_pass_evidence_engine_not_true");

    const duplicateKeys = unique([doi ? `doi:${normalize(doi)}` : null, title ? `title:${normalize(title)}` : null]);
    if (duplicateKeys.some((key) => selectedKeys.has(key))) {
      reasons.push("already_selected_source_candidate");
    }

    if (reasons.length > 0) {
      rejected.push({ title: title || null, reasons });
      continue;
    }

    const validGap = gap ?? "direct_nuclear_sources";
    const year = Number.isFinite(candidate.year) ? Math.trunc(candidate.year as number) : null;
    const confidence =
      candidate.confidence === "high" || candidate.confidence === "medium" || candidate.confidence === "low"
        ? candidate.confidence
        : "low";
    const evidenceType = isEvidenceType(candidate.evidenceType ?? "")
      ? candidate.evidenceType as RapidDeepResearchEvidenceType
      : defaultEvidenceTypeForGap(validGap);
    const sourceType = isReferenceType(candidate.sourceType ?? "")
      ? candidate.sourceType as RapidDeepResearchReferenceType
      : "other";

    acceptedEvidence.push({
      evidence_candidate_id: `dr-ev-${safeId(doi ?? url ?? title)}`,
      evidence_need_id: validGap,
      gap_addressed: clip(candidate.gapAddressed, 500) || evidenceNeedLabel(validGap),
      candidate_evidence: {
        evidence_type: evidenceType,
        claim_or_use:
          clip(candidate.claimOrUse, 700) ||
          "Uso potencial pendiente de verificacion local; no debe citarse todavia.",
        excerpt_or_summary:
          clip(candidate.excerptOrSummary, 900) ||
          "Resumen candidato pendiente de seleccion, recuperacion e inspeccion local.",
        exact_quote_if_available: clip(candidate.exactQuote, 900) || null,
        page_or_section_if_available: clip(candidate.pageOrSection, 160) || null,
      },
      reference: {
        title,
        authors: unique((candidate.authors ?? []).map((author) => clip(author, 120))).slice(0, 12),
        year,
        venue: clip(candidate.venue, 180) || null,
        doi,
        url,
        source_type: sourceType,
      },
      why_relevant: clip(candidate.whyRelevant, 700) || "Puede cubrir un vacio detectado por el gate de suficiencia.",
      confidence,
      validation_status: "candidate_pending_local_verification",
      must_pass_source_selection: true,
      must_pass_pdf_or_source_inspection: true,
      must_pass_evidence_engine: true,
      warnings: unique([
        ...(candidate.warnings ?? []),
        "candidate_pending_local_verification",
        "not_citable_until_selected_and_processed_by_evidence_engine",
      ]).map((warning) => clip(warning, 220)),
    });
  }

  const dedupedEvidence = unique(
    acceptedEvidence,
    (candidate) =>
      candidate.reference.doi
        ? `doi:${normalize(candidate.reference.doi)}`
        : candidate.reference.url
          ? `url:${normalize(candidate.reference.url)}`
          : `title:${normalize(candidate.reference.title)}:${candidate.reference.year ?? "unknown"}`,
  ).slice(0, 12);
  const candidates = dedupedEvidence.map((candidate): RapidDeepResearchCandidateSource => ({
      candidate_id: `rapid-dr-${safeId(candidate.reference.doi ?? candidate.reference.url ?? candidate.reference.title)}`,
      title: candidate.reference.title,
      authors: candidate.reference.authors,
      year: candidate.reference.year,
      doi: candidate.reference.doi,
      url: candidate.reference.url,
      provider: "openai_deep_research",
      gap_covered: [candidate.evidence_need_id],
      why_relevant_es: candidate.why_relevant,
      evidence_note_es:
        `${candidate.candidate_evidence.claim_or_use} No es evidencia citable hasta pasar por seleccion e inspeccion local.`,
      confidence: candidate.confidence,
      citable_status: "candidate_only_not_citable_yet",
      must_pass_source_selection: true,
      must_pass_evidence_engine: true,
      warnings: unique([...candidate.warnings, "candidate_only_not_citable_yet"]).map((warning) =>
        clip(warning, 220),
      ),
    }));
  const validationReport: RapidDeepResearchValidationReportV1 = {
    artifact_type: "rapid_deep_research_validation_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.caseId ?? null,
    accepted_evidence_candidate_count: dedupedEvidence.length,
    accepted_candidate_count: candidates.length,
    rejected_candidate_count: rejected.length,
    rejected_candidates: rejected,
    warnings:
      dedupedEvidence.length > 0
        ? ["Deep Research evidence candidates are discovery-only and remain non-citable."]
        : ["No validated Deep Research evidence candidates were accepted."],
    blockers: dedupedEvidence.length === 0 ? ["No accepted evidence candidates with title and DOI/URL."] : [],
  };

  return { candidates, evidenceCandidates: dedupedEvidence, validationReport };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unavailableArtifacts(input: {
  request: RapidDeepResearchRequestV1;
  cacheKey: string;
  reason: string;
  validationReport?: RapidDeepResearchValidationReportV1;
}): RapidDeepResearchFallbackArtifactsV1 {
  const validationReport =
    input.validationReport ?? {
      artifact_type: "rapid_deep_research_validation_report" as const,
      artifact_version: "v1" as const,
      generated_at: new Date().toISOString(),
      case_id: input.request.case_id,
      accepted_evidence_candidate_count: 0,
      accepted_candidate_count: 0,
      rejected_candidate_count: 0,
      rejected_candidates: [],
      warnings: [],
      blockers: [input.reason],
    };
  const result: RapidDeepResearchResultV1 = {
    artifact_type: "rapid_deep_research_result",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.request.case_id,
    status: "unavailable",
    model: input.request.model,
    prompt_version: input.request.prompt_version,
    max_tool_calls: input.request.max_tool_calls,
    cache_key: input.cacheKey,
    cache_hit: false,
    response_id: null,
    openai_called: false,
    candidates: [],
    summary_es: null,
    warnings: [input.reason],
    blockers: [input.reason],
    usage: null,
    raw_output_excerpt: null,
  };
  return {
    request: input.request,
    result,
    validationReport,
    evidenceCandidates: {
      artifact_type: "deep_research_evidence_candidates",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      case_id: input.request.case_id,
      evidence_candidate_count: 0,
      candidates: [],
      warnings: [input.reason],
    },
    candidateSources: {
      artifact_type: "rapid_deep_research_candidate_sources",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      case_id: input.request.case_id,
      candidate_count: 0,
      candidates: [],
      warnings: [input.reason],
    },
  };
}

export async function runRapidDeepResearchFallback(input: {
  apiKey?: string | null;
  request: RapidDeepResearchRequestV1;
  selectedSources: BlueprintLaunchSelectedSourceBundle["sources"];
  cacheRoot?: string | null;
  createResponse?: (request: RapidDeepResearchRequestV1) => Promise<ResponseLike>;
  retrieveResponse?: (responseId: string) => Promise<ResponseLike>;
  pollIntervalMs?: number | null;
  maxPollMs?: number | null;
}): Promise<RapidDeepResearchFallbackArtifactsV1> {
  const cacheKey = buildRapidDeepResearchCacheKey(input.request);
  const cacheRoot = input.cacheRoot === null ? null : input.cacheRoot ?? DEFAULT_CACHE_ROOT;
  const cacheFile = cacheRoot ? path.join(cacheRoot, `${cacheKey}.json`) : null;
  const cached = cacheFile ? await readJsonIfExists<RapidDeepResearchFallbackArtifactsV1>(cacheFile) : null;
  if (cached) {
    return {
      ...cached,
      result: {
        ...cached.result,
        status: "cache_hit",
        cache_hit: true,
        openai_called: false,
      },
    };
  }

  const apiKey = input.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey && !input.createResponse) {
    return unavailableArtifacts({
      request: input.request,
      cacheKey,
      reason: "rapid_deep_research_unavailable_missing_openai_api_key",
    });
  }

  const startedAt = Date.now();
  try {
    const client = input.createResponse ? null : new OpenAI({ apiKey: apiKey ?? "" });
    let response = input.createResponse
      ? await input.createResponse(input.request)
      : await client!.responses.create({
          model: input.request.model,
          store: true,
          background: true,
          input: [
            {
              role: "developer",
              content:
                "Actua como especialista en recuperacion bibliografica academica y verificacion de evidencia. Devuelve solo JSON valido segun el esquema pedido por el usuario. No generes contenido final ni evidencia citable.",
            },
            {
              role: "user",
              content: input.request.prompt_text,
            },
          ],
          tools: [
            {
              type: "web_search_preview",
              search_context_size: "medium",
              search_content_types: ["text"],
            },
          ],
          max_tool_calls: input.request.max_tool_calls,
          max_output_tokens: 8000,
        } as unknown as Parameters<OpenAI["responses"]["create"]>[0]) as ResponseLike;

    const pollIntervalMs = Math.max(1000, input.pollIntervalMs ?? 10_000);
    const maxPollMs = Math.max(pollIntervalMs, input.maxPollMs ?? 10 * 60_000);
    while (
      response.id &&
      (response.status === "queued" || response.status === "in_progress") &&
      Date.now() - startedAt < maxPollMs
    ) {
      await sleep(pollIntervalMs);
      response = input.retrieveResponse
        ? await input.retrieveResponse(response.id)
        : await client!.responses.retrieve(response.id) as ResponseLike;
    }

    if (response.status === "queued" || response.status === "in_progress") {
      throw new Error("rapid_deep_research_timeout_waiting_for_background_response");
    }

    const outputText = extractResponseOutputText(response);
    const rawResponseExcerpt = clip(
      outputText ||
        JSON.stringify({
          output: response.output ?? null,
          status: (response as { status?: unknown }).status ?? null,
          incomplete_details: (response as { incomplete_details?: unknown }).incomplete_details ?? null,
          error: (response as { error?: unknown }).error ?? null,
        }),
      1800,
    ) || null;
    const usageResult = await recordLlmUsage({
      provider: "openai",
      model: input.request.model,
      operation: "rapid_deep_research_fallback",
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });
    const parsed = parseRapidDeepResearchOutput({
      outputText,
      fallbackGapCategories: unique([
        ...input.request.current_context.missing_evidence_categories,
        ...input.request.current_context.deterministic_search_families.map((family) => family.category),
      ]).filter(isGapCategory),
    });
    const raw = parsed.raw;
    const { candidates, evidenceCandidates, validationReport } = validateRapidDeepResearchOutput({
      caseId: input.request.case_id,
      raw,
      selectedSources: input.selectedSources,
    });
    const result: RapidDeepResearchResultV1 = {
      artifact_type: "rapid_deep_research_result",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      case_id: input.request.case_id,
      status: validationReport.blockers.length > 0 ? "failed_validation" : "completed",
      model: input.request.model,
      prompt_version: input.request.prompt_version,
      max_tool_calls: input.request.max_tool_calls,
      cache_key: cacheKey,
      cache_hit: false,
      response_id: response.id ?? null,
      openai_called: true,
      candidates,
      summary_es: clip(raw.summary_es, 1200) || null,
      warnings: unique([
        outputText ? null : "rapid_deep_research_response_had_no_extractable_text_output",
        ...parsed.warnings,
        ...(raw.warnings ?? []),
        ...validationReport.warnings,
      ]).map((warning) => clip(warning, 260)),
      blockers: validationReport.blockers,
      usage: {
        provider: "openai",
        model: input.request.model,
        input_tokens: usageResult.callRecord.inputTokens,
        cached_input_tokens: usageResult.callRecord.cachedInputTokens,
        output_tokens: usageResult.callRecord.outputTokens,
        total_tokens: usageResult.callRecord.totalTokens,
        estimated_cost_usd: usageResult.callRecord.costUsd,
        estimated_cost_cad: usageResult.callRecord.costCad,
        duration_ms: Date.now() - startedAt,
      },
      raw_output_excerpt: rawResponseExcerpt,
    };
    const artifacts: RapidDeepResearchFallbackArtifactsV1 = {
      request: input.request,
      result,
      validationReport,
      evidenceCandidates: {
        artifact_type: "deep_research_evidence_candidates",
        artifact_version: "v1",
        generated_at: new Date().toISOString(),
        case_id: input.request.case_id,
        evidence_candidate_count: evidenceCandidates.length,
        candidates: evidenceCandidates,
        warnings: result.warnings,
      },
      candidateSources: {
        artifact_type: "rapid_deep_research_candidate_sources",
        artifact_version: "v1",
        generated_at: new Date().toISOString(),
        case_id: input.request.case_id,
        candidate_count: candidates.length,
        candidates,
        warnings: result.warnings,
      },
    };

    if (cacheFile) {
      await writeJson(cacheFile, artifacts);
    }

    return artifacts;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "rapid_deep_research_failed_unknown_error";
    const failed = unavailableArtifacts({
      request: input.request,
      cacheKey,
      reason,
    });
    return {
      ...failed,
      result: {
        ...failed.result,
        status: "failed",
      },
    };
  }
}

export function renderRapidDeepResearchReport(artifacts: RapidDeepResearchFallbackArtifactsV1) {
  return [
    "# Fallback rapido de Deep Research",
    "",
    `- case_id: ${artifacts.request.case_id ?? "unknown"}`,
    `- status: ${artifacts.result.status}`,
    `- model: ${artifacts.request.model}`,
    `- prompt_version: ${artifacts.request.prompt_version}`,
    `- max_tool_calls: ${artifacts.request.max_tool_calls}`,
    `- openai_called: ${artifacts.result.openai_called}`,
    `- cache_hit: ${artifacts.result.cache_hit}`,
    `- evidence_candidate_count: ${artifacts.evidenceCandidates.evidence_candidate_count}`,
    `- source_candidate_count: ${artifacts.candidateSources.candidate_count}`,
    `- policy: solo descubrimiento; no citable hasta seleccion de fuentes, inspeccion local y Evidence Engine`,
    "",
    "## Politica del prompt",
    "",
    "El prompt solicita evidencia candidata con referencia verificable asociada. No solicita contenido academico final y exige titulo mas DOI o URL.",
    "",
    "## Evidencia candidata",
    ...(artifacts.evidenceCandidates.candidates.length
      ? artifacts.evidenceCandidates.candidates.map((candidate, index) =>
          [
            `${index + 1}. ${candidate.reference.title}`,
            `   - evidence_need_id: ${candidate.evidence_need_id}`,
            `   - evidence_type: ${candidate.candidate_evidence.evidence_type}`,
            `   - claim_or_use: ${candidate.candidate_evidence.claim_or_use}`,
            `   - doi: ${candidate.reference.doi ?? "not_detected"}`,
            `   - url: ${candidate.reference.url ?? "not_detected"}`,
            `   - validation_status: ${candidate.validation_status}`,
            `   - why: ${candidate.why_relevant}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Fuentes candidatas derivadas",
    ...(artifacts.candidateSources.candidates.length
      ? artifacts.candidateSources.candidates.map((candidate, index) =>
          [
            `${index + 1}. ${candidate.title}`,
            `   - doi: ${candidate.doi ?? "not_detected"}`,
            `   - url: ${candidate.url ?? "not_detected"}`,
            `   - gaps: ${candidate.gap_covered.join("; ")}`,
            `   - confidence: ${candidate.confidence}`,
            `   - citable_status: ${candidate.citable_status}`,
            `   - why: ${candidate.why_relevant_es}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Validacion",
    `- accepted_evidence_candidate_count: ${artifacts.validationReport.accepted_evidence_candidate_count}`,
    `- accepted_candidate_count: ${artifacts.validationReport.accepted_candidate_count}`,
    `- rejected_candidate_count: ${artifacts.validationReport.rejected_candidate_count}`,
    ...(artifacts.validationReport.rejected_candidates.length
      ? artifacts.validationReport.rejected_candidates.map((candidate) =>
          `- rejected: ${candidate.title ?? "untitled"} (${candidate.reasons.join("; ")})`,
        )
      : ["- rejected: none"]),
    "",
    "## Advertencias",
    ...(artifacts.result.warnings.length ? artifacts.result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Bloqueos",
    ...(artifacts.result.blockers.length ? artifacts.result.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
  ].join("\n");
}
