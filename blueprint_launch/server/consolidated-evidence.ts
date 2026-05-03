import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchLlmPromptRecord,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSignalExtractionResult,
  ConsolidatedEvidenceArtifact,
  ConsolidatedEvidenceAssetUsagePlanItem,
  ConsolidatedEvidenceClaimCandidate,
  ConsolidatedEvidenceContextPreservationContract,
  ConsolidatedEvidenceDownstreamHandoffManifest,
  ConsolidatedEvidenceGapResolutionPlan,
  ConsolidatedEvidenceProposalFrameworkCandidate,
  ConsolidatedEvidenceProposalMethodCandidate,
  ConsolidatedEvidenceQualityComparison,
  ConsolidatedEvidenceQualityComparisonSnapshot,
  ConsolidatedEvidenceQualityGate,
  ConsolidatedEvidenceSectionDossier,
  ConsolidatedEvidenceSectionInputPacket,
  ConsolidatedEvidenceSectionReadiness,
  ConsolidatedEvidenceSourcePriority,
  ConsolidatedEvidenceUnit,
  ConsolidatedEvidenceWeakSectionCompletionPacket,
  EvidencePackArtifact,
  PdfAssetRecord,
} from "./local-playground-store";

const CANONICAL_SECTIONS = [
  { key: "background", label: "Antecedentes" },
  { key: "problem_statement", label: "Planteamiento del problema" },
  { key: "justification", label: "Justificacion" },
  { key: "theoretical_framework", label: "Marco teorico" },
  { key: "technical_framework", label: "Marco tecnico" },
  { key: "methodology", label: "Metodologia" },
  { key: "evaluation_criteria", label: "Criterios de evaluacion" },
  { key: "case_context", label: "Contexto del caso" },
  { key: "findings_support", label: "Soporte de hallazgos" },
  { key: "limitations", label: "Limitaciones" },
  { key: "future_work", label: "Lineas futuras" },
] as const;

type CanonicalSectionKey = (typeof CANONICAL_SECTIONS)[number]["key"];

type SourcePriorityInfo = ConsolidatedEvidenceSourcePriority & {
  numericScore: number;
};

type SectionEvidence = {
  key: CanonicalSectionKey;
  sourceIds: Set<string>;
  evidenceUnitIds: string[];
  assetKeys: string[];
  directQuoteCount: number;
  textUnitCount: number;
  assetCount: number;
  intakeContextCount: number;
};

type StrategyPlan = {
  dominant_methods: string[];
  dominant_frameworks: string[];
  key_findings: string[];
  evidence_gaps: string[];
  proposal_directions: string[];
  proposal_method_candidate: ConsolidatedEvidenceProposalMethodCandidate;
  proposal_framework_candidate: ConsolidatedEvidenceProposalFrameworkCandidate;
  gap_resolution_plan: ConsolidatedEvidenceGapResolutionPlan;
  asset_usage_recommendations: Array<{
    asset_key: string;
    section_key: string;
    usage_reason: string;
    handling_notes: string[];
  }>;
  followup_requirements: {
    blocking: string[];
    recommended: string[];
    optional: string[];
  };
};

type DossierPlan = {
  section_dossiers: Array<{
    section_key: string;
    drafting_strategy: string;
    evidence_unit_ids: string[];
    primary_source_ids: string[];
    claim_candidates: ConsolidatedEvidenceClaimCandidate[];
    useful_assets: string[];
    citation_plan: string[];
    assumptions_allowed: string[];
    missing_evidence: string[];
    do_not_claim: string[];
  }>;
};

type AuditPlan = {
  summary: string;
  quality_gate: {
    ready_for_steps_7_11: boolean;
    unsupported_claims: string[];
    traceability_warnings: string[];
    handoff_notes: string[];
  };
};

const STEP6_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
const STEP6_STRATEGY_SCHEMA = "blueprint_launch_step6_corpus_strategy";
const STEP6_DOSSIER_SCHEMA = "blueprint_launch_step6_section_dossiers";
const STEP6_AUDIT_SCHEMA = "blueprint_launch_step6_traceability_audit";
const ARTIFACT_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "consolidated_evidence",
);
const STATE_FILE = path.join(process.cwd(), "artifacts-local", "blueprint_launch", "lab-state.json");

const methodCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "method_family",
    "research_design",
    "application_scope_status",
    "candidate_techniques",
    "selection_rationale",
    "evidence_support_level",
    "missing_validations",
  ],
  properties: {
    method_family: { type: ["string", "null"], minLength: 4, maxLength: 180 },
    research_design: { type: ["string", "null"], minLength: 4, maxLength: 220 },
    application_scope_status: { type: "string", enum: ["fuerte", "parcial", "debil"] },
    candidate_techniques: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 4, maxLength: 180 },
    },
    selection_rationale: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 6, maxLength: 260 },
    },
    evidence_support_level: { type: "string", enum: ["alto", "medio", "bajo"] },
    missing_validations: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 4, maxLength: 260 },
    },
  },
} satisfies Record<string, unknown>;

const frameworkCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["core_framework", "supporting_frameworks", "selection_rationale", "missing_validations"],
  properties: {
    core_framework: { type: ["string", "null"], minLength: 4, maxLength: 220 },
    supporting_frameworks: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 4, maxLength: 220 },
    },
    selection_rationale: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 6, maxLength: 260 },
    },
    missing_validations: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 4, maxLength: 260 },
    },
  },
} satisfies Record<string, unknown>;

const strategySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "dominant_methods",
    "dominant_frameworks",
    "key_findings",
    "evidence_gaps",
    "proposal_directions",
    "proposal_method_candidate",
    "proposal_framework_candidate",
    "gap_resolution_plan",
    "asset_usage_recommendations",
    "followup_requirements",
  ],
  properties: {
    dominant_methods: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 4, maxLength: 220 },
    },
    dominant_frameworks: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 4, maxLength: 220 },
    },
    key_findings: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 6, maxLength: 260 },
    },
    evidence_gaps: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 6, maxLength: 260 },
    },
    proposal_directions: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 6, maxLength: 260 },
    },
    proposal_method_candidate: methodCandidateSchema,
    proposal_framework_candidate: frameworkCandidateSchema,
    gap_resolution_plan: {
      type: "object",
      additionalProperties: false,
      required: ["inferable_with_care", "blocking_gaps", "validation_actions", "do_not_claim"],
      properties: {
        inferable_with_care: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
        blocking_gaps: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
        validation_actions: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
        do_not_claim: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
      },
    },
    asset_usage_recommendations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["asset_key", "section_key", "usage_reason", "handling_notes"],
        properties: {
          asset_key: { type: "string", minLength: 3, maxLength: 260 },
          section_key: { type: "string", minLength: 3, maxLength: 80 },
          usage_reason: { type: "string", minLength: 6, maxLength: 260 },
          handling_notes: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 4, maxLength: 220 },
          },
        },
      },
    },
    followup_requirements: {
      type: "object",
      additionalProperties: false,
      required: ["blocking", "recommended", "optional"],
      properties: {
        blocking: {
          type: "array",
          maxItems: 8,
          items: { type: "string", minLength: 4, maxLength: 240 },
        },
        recommended: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 4, maxLength: 240 },
        },
        optional: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 4, maxLength: 240 },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const dossierSchema = {
  type: "object",
  additionalProperties: false,
  required: ["section_dossiers"],
  properties: {
    section_dossiers: {
      type: "array",
      maxItems: 11,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section_key",
          "drafting_strategy",
          "evidence_unit_ids",
          "primary_source_ids",
          "claim_candidates",
          "useful_assets",
          "citation_plan",
          "assumptions_allowed",
          "missing_evidence",
          "do_not_claim",
        ],
        properties: {
          section_key: { type: "string", minLength: 3, maxLength: 80 },
          drafting_strategy: { type: "string", minLength: 8, maxLength: 480 },
          evidence_unit_ids: {
            type: "array",
            maxItems: 14,
            items: { type: "string", minLength: 3, maxLength: 260 },
          },
          primary_source_ids: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 260 },
          },
          claim_candidates: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim_es", "evidence_unit_ids", "support_level"],
              properties: {
                claim_es: { type: "string", minLength: 8, maxLength: 280 },
                evidence_unit_ids: {
                  type: "array",
                  maxItems: 8,
                  items: { type: "string", minLength: 3, maxLength: 260 },
                },
                support_level: { type: "string", enum: ["fuerte", "medio", "debil"] },
              },
            },
          },
          useful_assets: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 3, maxLength: 260 },
          },
          citation_plan: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 260 },
          },
          assumptions_allowed: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 260 },
          },
          missing_evidence: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 260 },
          },
          do_not_claim: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 260 },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const auditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "quality_gate"],
  properties: {
    summary: { type: "string", minLength: 8, maxLength: 520 },
    quality_gate: {
      type: "object",
      additionalProperties: false,
      required: ["ready_for_steps_7_11", "unsupported_claims", "traceability_warnings", "handoff_notes"],
      properties: {
        ready_for_steps_7_11: { type: "boolean" },
        unsupported_claims: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
        traceability_warnings: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
        handoff_notes: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 4, maxLength: 260 },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

function hashShort(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function truncateText(value: string | null | undefined, maxLength = 520) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>, maxItems = 8) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          (value ?? "")
            .replace(/\\"/g, "\"")
            .split(/"\s*,\s*"/)
            .map((part) => part.replace(/^"+|"+$/g, "")),
        )
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, maxItems);
}

function normalizeToCanonicalSectionKey(value: string | null | undefined): CanonicalSectionKey | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const compact = raw
    .replace(/[\s\-]+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases: Record<string, CanonicalSectionKey> = {
    antecedentes: "background",
    background: "background",
    problema: "problem_statement",
    problem_statement: "problem_statement",
    planteamiento_del_problema: "problem_statement",
    problem: "problem_statement",
    justificacion: "justification",
    justification: "justification",
    marco_teorico: "theoretical_framework",
    theoretical_framework: "theoretical_framework",
    marco_tecnico: "technical_framework",
    technical_framework: "technical_framework",
    metodologia: "methodology",
    methodology: "methodology",
    marco_metodologico: "methodology",
    criterios_de_evaluacion: "evaluation_criteria",
    evaluation_criteria: "evaluation_criteria",
    case_context: "case_context",
    contexto_del_caso: "case_context",
    caso_de_estudio: "case_context",
    caso_referencial: "case_context",
    hallazgos: "findings_support",
    findings: "findings_support",
    findings_support: "findings_support",
    resultados: "findings_support",
    limitaciones: "limitations",
    limitations: "limitations",
    lineas_futuras: "future_work",
    future_work: "future_work",
    future_work_line: "future_work",
    lineas_futuras_propuesta: "future_work",
    brecha: "justification",
    sostenibilidad: "theoretical_framework",
    framework: "technical_framework",
    politica_urbana: "technical_framework",
    problema_y_contexto: "problem_statement",
  };

  return aliases[compact] ?? null;
}

function normalizeSectionKeys(values: Array<string | null | undefined>) {
  return uniqueNonEmpty(values, 12)
    .map((value) => normalizeToCanonicalSectionKey(value))
    .filter((value): value is CanonicalSectionKey => Boolean(value));
}

function getSectionLabel(sectionKey: string) {
  return CANONICAL_SECTIONS.find((section) => section.key === sectionKey)?.label ?? sectionKey;
}

function parseAssetSectionHints(asset: PdfAssetRecord) {
  if (asset.kind === "equation") {
    return ["methodology", "evaluation_criteria", "technical_framework"] as CanonicalSectionKey[];
  }

  const fromText = asset.text_content?.match(/section_hints=([a-z_,]+)/i)?.[1] ?? null;
  const mapped = fromText ? normalizeSectionKeys(fromText.split(",")) : [];
  if (mapped.length > 0) {
    return mapped;
  }

  const caption = asset.caption?.toLowerCase() ?? "";
  const fallback = new Set<CanonicalSectionKey>();

  if (asset.kind === "table") {
    fallback.add("findings_support");
  }
  if (/\bahp\b|\bmethod\b|\bprocess\b|\bhierarchy\b|\bmatrix\b|\bcriteria\b/.test(caption)) {
    fallback.add("methodology");
    fallback.add("evaluation_criteria");
  }
  if (/\bresult\b|\bcomparison\b|\branking\b|\bperformance\b/.test(caption)) {
    fallback.add("findings_support");
  }
  if (/\bframework\b|\bconcept\b|\bmodel\b|\blca\b|\blife cycle\b/.test(caption)) {
    fallback.add("technical_framework");
  }
  if (fallback.size === 0) {
    fallback.add(asset.kind === "table" ? "findings_support" : "technical_framework");
  }

  return [...fallback];
}

function buildSourcePriorities(signalExtraction: BlueprintLaunchSignalExtractionResult) {
  return signalExtraction.sources
    .map((source) => {
      let score = 0;
      score += source.topicRelevance === "directa" ? 3 : source.topicRelevance === "parcial" ? 2 : 1;
      score += source.proposalUsefulness === "alta" ? 3 : source.proposalUsefulness === "media" ? 2 : 1;
      score += source.inputMode === "pdf" ? 2 : source.inputMode === "web_text" ? 1 : 0;
      score += source.snippetCount >= 8 ? 1.2 : source.snippetCount >= 4 ? 0.6 : 0;
      score += source.assetCount > 0 ? 1 : 0;
      score += source.methodologyHints.length > 0 ? 0.7 : 0;
      score += source.frameworkHints.length > 0 ? 0.7 : 0;

      const priority = score >= 8 ? "alta" : score >= 5 ? "media" : "baja";
      const reason = `relevancia=${source.topicRelevance}; utilidad=${source.proposalUsefulness}; input=${source.inputMode}; snippets=${source.snippetCount}; assets=${source.assetCount}; metodos=${source.methodologyHints.length}; frameworks=${source.frameworkHints.length}`;

      return {
        source_id: source.sourceId,
        title: source.title,
        priority,
        reason,
        numericScore: score,
      } satisfies SourcePriorityInfo;
    })
    .sort((left, right) => right.numericScore - left.numericScore);
}

function buildSignalUnits(params: {
  packSourceId: string;
  sourceTitle: string;
  language: string | null;
  signals: Array<{ key: string; label: string; text: string | null; sectionKeys: CanonicalSectionKey[] }>;
}) {
  return params.signals
    .filter((signal) => signal.text?.trim())
    .map((signal) => ({
      evidence_id: `signal:${hashShort(`${params.packSourceId}:${signal.key}:${signal.text}`)}`,
      source_id: params.packSourceId,
      source_title: params.sourceTitle,
      unit_type: "interpreted_signal" as const,
      section_keys: signal.sectionKeys,
      label: signal.label,
      original_text: null,
      summary_es: signal.text,
      page_start: null,
      page_end: null,
      char_start: null,
      char_end: null,
      quote_hash: null,
      asset_key: null,
      asset_path: null,
      caption: null,
      original_language: params.language,
      citation_eligibility: "paraphrase_only" as const,
      confidence: 0.62,
      relevance_score: 0.7,
    }));
}

function buildEvidenceUnits(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult;
  evidencePacksArtifact: EvidencePackArtifact;
}) {
  const sourceById = new Map(input.sourceSignalExtraction.sources.map((source) => [source.sourceId, source]));
  const units: ConsolidatedEvidenceUnit[] = [];

  for (const pack of input.evidencePacksArtifact.packs) {
    const source = sourceById.get(pack.source_id);
    const sourceTitle = source?.title ?? pack.source_id;
    const language = source?.detectedLanguage ?? null;

    for (const snippet of pack.snippets) {
      const sectionKeys = normalizeSectionKeys(snippet.section_hint_keys);
      const unitType =
        snippet.extraction_kind === "interpreted_signal" ? "interpreted_signal" : "original_excerpt";
      const text = snippet.original_text ?? snippet.text;

      units.push({
        evidence_id: `snippet:${snippet.snippet_id}`,
        source_id: pack.source_id,
        source_title: sourceTitle,
        unit_type: unitType,
        section_keys: sectionKeys.length > 0 ? sectionKeys : ["background"],
        label: snippet.label,
        original_text: text,
        summary_es: snippet.interpretation_es ?? null,
        page_start: snippet.page_start ?? snippet.page_number ?? null,
        page_end: snippet.page_end ?? snippet.page_number ?? null,
        char_start: snippet.char_start ?? null,
        char_end: snippet.char_end ?? null,
        quote_hash: snippet.quote_hash ?? null,
        asset_key: null,
        asset_path: null,
        caption: null,
        original_language: snippet.original_language ?? language,
        citation_eligibility: unitType === "original_excerpt" ? "direct_quote" : "paraphrase_only",
        confidence: snippet.confidence,
        relevance_score: snippet.relevance_score ?? null,
      });
    }

    for (const asset of pack.assets) {
      units.push({
        evidence_id: `asset:${asset.asset_key}`,
        source_id: pack.source_id,
        source_title: sourceTitle,
        unit_type: asset.kind,
        section_keys: parseAssetSectionHints(asset),
        label: asset.title,
        original_text: asset.text_content,
        summary_es: asset.caption,
        page_start: asset.page_number,
        page_end: asset.page_number,
        char_start: null,
        char_end: null,
        quote_hash: null,
        asset_key: asset.asset_key,
        asset_path: asset.file_path,
        caption: asset.caption,
        original_language: language,
        citation_eligibility: "asset_reference",
        confidence: asset.extracted ? 0.76 : 0.45,
        relevance_score: asset.kind === "equation" ? 0.82 : 0.72,
      });
    }

    units.push(
      ...buildSignalUnits({
        packSourceId: pack.source_id,
        sourceTitle,
        language,
        signals: [
          {
            key: "problem",
            label: "Senal interpretativa de problema",
            text: pack.problem_signal,
            sectionKeys: ["problem_statement", "justification"],
          },
          {
            key: "method",
            label: "Senal interpretativa de metodo",
            text: pack.method_signal,
            sectionKeys: ["methodology", "evaluation_criteria"],
          },
          {
            key: "context",
            label: "Senal interpretativa de contexto",
            text: pack.context_signal,
            sectionKeys: ["background", "case_context"],
          },
          {
            key: "finding",
            label: "Senal interpretativa de hallazgo",
            text: pack.finding_signal,
            sectionKeys: ["findings_support", "justification"],
          },
          {
            key: "limitation",
            label: "Senal interpretativa de limitacion",
            text: pack.limitation_signal,
            sectionKeys: ["limitations"],
          },
          {
            key: "future",
            label: "Senal interpretativa de linea futura",
            text: pack.future_line_signal,
            sectionKeys: ["future_work"],
          },
        ],
      }),
    );
  }

  const intake = input.savedIntake.intake;
  units.push({
    evidence_id: "intake:project-context",
    source_id: "intake",
    source_title: "Intake del proyecto",
    unit_type: "intake_context",
    section_keys: ["problem_statement", "case_context", "methodology", "justification"],
    label: "Contexto declarado por el investigador",
    original_text: [
      `Tema: ${intake.topic}`,
      `Contexto/problema: ${intake.problemContext}`,
      `Linea de investigacion: ${intake.researchLine}`,
      `Poblacion o ambito: ${intake.targetPopulation}`,
      `Datos disponibles: ${intake.availableData}`,
      `Metodologia preferida: ${intake.preferredMethodology}`,
      `Notas del asesor: ${intake.advisorNotes}`,
    ].join("\n"),
    summary_es: "Contexto de partida aportado por el investigador; no debe citarse como fuente bibliografica.",
    page_start: null,
    page_end: null,
    char_start: null,
    char_end: null,
    quote_hash: null,
    asset_key: null,
    asset_path: null,
    caption: null,
    original_language: "es",
    citation_eligibility: "context_only",
    confidence: 0.9,
    relevance_score: 0.9,
  });

  return units;
}

function buildSectionEvidenceMap(evidenceUnits: ConsolidatedEvidenceUnit[]) {
  const sectionMap = new Map<CanonicalSectionKey, SectionEvidence>(
    CANONICAL_SECTIONS.map((section) => [
      section.key,
      {
        key: section.key,
        sourceIds: new Set<string>(),
        evidenceUnitIds: [],
        assetKeys: [],
        directQuoteCount: 0,
        textUnitCount: 0,
        assetCount: 0,
        intakeContextCount: 0,
      },
    ]),
  );

  for (const unit of evidenceUnits) {
    for (const sectionKey of normalizeSectionKeys(unit.section_keys)) {
      const section = sectionMap.get(sectionKey);
      if (!section) {
        continue;
      }

      if (unit.source_id !== "intake") {
        section.sourceIds.add(unit.source_id);
      }
      section.evidenceUnitIds.push(unit.evidence_id);

      if (unit.citation_eligibility === "direct_quote") {
        section.directQuoteCount += 1;
      }
      if (["original_excerpt", "interpreted_signal", "intake_context"].includes(unit.unit_type)) {
        section.textUnitCount += 1;
      }
      if (["image", "table", "equation"].includes(unit.unit_type)) {
        section.assetCount += 1;
      }
      if (unit.asset_key) {
        section.assetKeys.push(unit.asset_key);
      }
      if (unit.unit_type === "intake_context") {
        section.intakeContextCount += 1;
      }
    }
  }

  return sectionMap;
}

function computeReadiness(sectionKey: CanonicalSectionKey, section: SectionEvidence): ConsolidatedEvidenceSectionReadiness {
  const sourceCount = section.sourceIds.size;
  const snippetCount = section.textUnitCount;
  const assetCount = section.assetCount;
  const missing: string[] = [];
  let enoughToDraft = false;

  if (sectionKey === "background") {
    enoughToDraft = sourceCount >= 2 && snippetCount >= 3;
  } else if (sectionKey === "problem_statement") {
    enoughToDraft = sourceCount >= 2 && snippetCount >= 3;
  } else if (sectionKey === "justification") {
    enoughToDraft = sourceCount >= 2 && (snippetCount >= 3 || assetCount >= 1);
  } else if (sectionKey === "theoretical_framework") {
    enoughToDraft = sourceCount >= 2 && snippetCount >= 3;
  } else if (sectionKey === "technical_framework") {
    enoughToDraft = sourceCount >= 2 && (snippetCount >= 3 || assetCount >= 2);
  } else if (sectionKey === "methodology") {
    enoughToDraft = sourceCount >= 2 && (snippetCount >= 3 || assetCount >= 2);
  } else if (sectionKey === "evaluation_criteria") {
    enoughToDraft = sourceCount >= 1 && (section.directQuoteCount >= 1 || assetCount >= 2);
  } else if (sectionKey === "case_context") {
    enoughToDraft = section.intakeContextCount >= 1 || (sourceCount >= 1 && snippetCount >= 1);
  } else if (sectionKey === "findings_support") {
    enoughToDraft = sourceCount >= 2 && (snippetCount >= 3 || assetCount >= 2);
  } else if (sectionKey === "limitations") {
    enoughToDraft = sourceCount >= 1 && snippetCount >= 1;
  } else if (sectionKey === "future_work") {
    enoughToDraft = sourceCount >= 1 && snippetCount >= 1;
  }

  if (sourceCount === 0 && sectionKey !== "case_context") {
    missing.push("Sin fuentes bibliograficas claramente asociadas.");
  } else if (sourceCount === 1 && !["evaluation_criteria", "case_context"].includes(sectionKey)) {
    missing.push("Cobertura por fuente aun fragil.");
  }
  if (snippetCount === 0 && sectionKey !== "evaluation_criteria") {
    missing.push("Faltan unidades textuales trazables.");
  }
  if (section.directQuoteCount === 0 && !["case_context", "evaluation_criteria"].includes(sectionKey)) {
    missing.push("Faltan extractos originales citables.");
  }
  if (sectionKey === "case_context" && section.intakeContextCount > 0) {
    missing.push("El contexto del caso proviene del intake y requiere validacion local.");
  }
  if (["technical_framework", "methodology", "evaluation_criteria"].includes(sectionKey) && assetCount === 0) {
    missing.push("Faltan assets, tablas o ecuaciones de apoyo.");
  }

  const readiness =
    enoughToDraft && missing.length <= 1
      ? "alta"
      : section.evidenceUnitIds.length > 0
        ? "media"
        : "baja";

  return {
    section_key: sectionKey,
    readiness,
    enough_to_draft: enoughToDraft,
    source_count: sourceCount,
    snippet_count: snippetCount,
    asset_count: assetCount,
    missing_elements: uniqueNonEmpty(missing, 6),
    recommended_source_ids: [...section.sourceIds].slice(0, 5),
  };
}

function buildCoverageMap(sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[]) {
  const ready = sectionReadinessMap.filter((item) => item.readiness === "alta").map((item) => item.section_key);
  const partial = sectionReadinessMap.filter((item) => item.readiness === "media").map((item) => item.section_key);
  const low = sectionReadinessMap.filter((item) => item.readiness === "baja").map((item) => item.section_key);

  return {
    overall_readiness: ready.length >= 8 ? "alta" : ready.length >= 5 ? "media" : "baja",
    ready_section_count: ready.length,
    partial_section_count: partial.length,
    low_section_count: low.length,
    section_keys_ready: ready,
    section_keys_partial: partial,
    section_keys_low: low,
  } satisfies ConsolidatedEvidenceArtifact["coverage_map"];
}

function unitSortScore(unit: ConsolidatedEvidenceUnit, sourcePriorityMap: Map<string, SourcePriorityInfo>) {
  const sourceScore = sourcePriorityMap.get(unit.source_id)?.numericScore ?? 0;
  const citationBonus =
    unit.citation_eligibility === "direct_quote"
      ? 1.1
      : unit.citation_eligibility === "asset_reference"
        ? 0.9
        : unit.citation_eligibility === "context_only"
          ? 0.2
          : 0.45;
  return sourceScore + unit.confidence + (unit.relevance_score ?? 0) + citationBonus;
}

function buildSectionSeedPackets(params: {
  evidenceUnits: ConsolidatedEvidenceUnit[];
  sourcePriorities: SourcePriorityInfo[];
  sectionMap: Map<CanonicalSectionKey, SectionEvidence>;
}) {
  const sourcePriorityMap = new Map(params.sourcePriorities.map((source) => [source.source_id, source]));
  const unitsById = new Map(params.evidenceUnits.map((unit) => [unit.evidence_id, unit]));

  return CANONICAL_SECTIONS.map((section) => {
    const evidence = params.sectionMap.get(section.key) as SectionEvidence;
    const sortedUnits = evidence.evidenceUnitIds
      .map((id) => unitsById.get(id))
      .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit))
      .sort((left, right) => unitSortScore(right, sourcePriorityMap) - unitSortScore(left, sourcePriorityMap));
    const assets = sortedUnits.filter((unit) => unit.asset_key);

    return {
      section_key: section.key,
      section_label_es: section.label,
      source_ids: [...evidence.sourceIds].slice(0, 6),
      evidence_unit_ids: sortedUnits.slice(0, 18).map((unit) => unit.evidence_id),
      asset_keys: assets.slice(0, 6).map((unit) => unit.asset_key as string),
      top_units: sortedUnits.slice(0, 10).map((unit) => compactEvidenceUnit(unit, 480)),
    };
  });
}

function compactEvidenceUnit(unit: ConsolidatedEvidenceUnit, textMax = 520) {
  return {
    evidence_id: unit.evidence_id,
    type: unit.unit_type,
    source_id: unit.source_id,
    source_title: unit.source_title,
    section_keys: unit.section_keys,
    label: unit.label,
    citation_eligibility: unit.citation_eligibility,
    page: unit.page_start === unit.page_end ? unit.page_start : `${unit.page_start ?? "n/d"}-${unit.page_end ?? "n/d"}`,
    quote_hash: unit.quote_hash,
    asset_key: unit.asset_key,
    asset_path: unit.asset_path,
    caption: truncateText(unit.caption, 220),
    text: truncateText(unit.original_text ?? unit.summary_es, textMax),
  };
}

function compactEvidenceIdCatalog(unit: ConsolidatedEvidenceUnit) {
  return {
    evidence_id: unit.evidence_id,
    type: unit.unit_type,
    source_id: unit.source_id,
    section_keys: unit.section_keys,
    label: unit.label,
    citation_eligibility: unit.citation_eligibility,
    page:
      unit.page_start === unit.page_end
        ? unit.page_start
        : `${unit.page_start ?? "n/d"}-${unit.page_end ?? "n/d"}`,
    quote_hash: unit.quote_hash,
    asset_key: unit.asset_key,
    has_original_text: Boolean(unit.original_text?.trim()),
    has_asset_path: Boolean(unit.asset_path?.trim()),
  };
}

function buildAuditEvidenceCatalog(units: ConsolidatedEvidenceUnit[]) {
  return units.map((unit) => ({
    ...compactEvidenceIdCatalog(unit),
    confidence: unit.confidence,
    relevance_score: unit.relevance_score,
  }));
}

function countPromptChars(prompts: BlueprintLaunchLlmPromptRecord[]) {
  return prompts.reduce((sum, prompt) => sum + prompt.promptText.length, 0);
}

function fillPrompt(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function buildStrategyPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  sourcePriorities: SourcePriorityInfo[];
  sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[];
  evidenceUnits: ConsolidatedEvidenceUnit[];
}) {
  const template = `
Eres un metodologo de investigacion academica aplicada. Tu tarea es consolidar un corpus ya recuperado para decidir una ruta metodologica tentativa y preparar datos para redaccion posterior.

Reglas:
- responde en espanol
- no inventes fuentes, datos locales, resultados ni consenso
- diferencia evidencia directa, inferencia prudente y vacios
- puedes proponer una tecnica aunque el ambito local aun requiera validacion
- prioriza utilidad para tesis: problema, justificacion, marco teorico, marco tecnico, metodologia, criterios, limitaciones y lineas futuras
- si una evidencia es "context_only", usala solo como contexto del investigador, no como cita
- si una evidencia es "asset_reference", puede sustentar una tabla, ecuacion o figura, pero requiere explicacion textual posterior
- este prompt esta compactado para costo/tiempo; el corpus completo se conserva en archivos y debe rehidratarse por IDs/rutas en las siguientes olas LLM

Proyecto:
{{PROJECT_CONTEXT}}

Fuentes priorizadas:
{{SOURCE_PRIORITIES}}

Readiness por seccion:
{{SECTION_READINESS}}

Evidence units compactas:
{{EVIDENCE_UNITS}}
`.trim();

  return {
    template,
    promptText: fillPrompt(template, {
      PROJECT_CONTEXT: JSON.stringify(
        {
          area: input.savedIntake.projectContext.knowledgeAreaLabel,
          topic: input.savedIntake.intake.topic,
          problem_context: input.savedIntake.intake.problemContext,
          research_line: input.savedIntake.intake.researchLine,
          target_population: input.savedIntake.intake.targetPopulation,
          available_data: input.savedIntake.intake.availableData,
          preferred_methodology: input.savedIntake.intake.preferredMethodology,
        },
        null,
        2,
      ),
      SOURCE_PRIORITIES: JSON.stringify(input.sourcePriorities, null, 2),
      SECTION_READINESS: JSON.stringify(input.sectionReadinessMap, null, 2),
      EVIDENCE_UNITS: JSON.stringify(
        input.evidenceUnits.map((unit) => compactEvidenceUnit(unit, 260)),
        null,
        2,
      ),
    }),
  };
}

function buildDossierPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  strategyPlan: StrategyPlan;
  sectionSeedPackets: ReturnType<typeof buildSectionSeedPackets>;
  evidenceUnits: ConsolidatedEvidenceUnit[];
}) {
  const template = `
Eres un editor academico senior. Debes construir dossiers por seccion para que otra etapa redacte secciones completas sin perder trazabilidad.

Reglas:
- responde en espanol
- cada claim debe tener evidence_unit_ids existentes
- no uses evidence_unit_ids que no aparezcan en los paquetes
- no redactes la seccion final; solo prepara el dossier de partida
- marca supuestos permitidos y afirmaciones prohibidas
- si una seccion depende del intake, declaralo como contexto no citable
- incluye assets solo cuando agreguen valor metodologico, teorico, tecnico o de criterios
- no intentes agotar todo el corpus en este prompt; prepara un dossier inicial y deja que las dos olas siguientes rehidraten texto completo usando los IDs y rutas del handoff

Tema:
{{PROJECT_CONTEXT}}

Estrategia global ya propuesta:
{{STRATEGY_PLAN}}

Paquetes base por seccion:
{{SECTION_SEED_PACKETS}}

Catalogo de IDs validos de evidence units:
{{EVIDENCE_ID_CATALOG}}
`.trim();

  return {
    template,
    promptText: fillPrompt(template, {
      PROJECT_CONTEXT: JSON.stringify(
        {
          topic: input.savedIntake.intake.topic,
          problem_context: input.savedIntake.intake.problemContext,
          preferred_methodology: input.savedIntake.intake.preferredMethodology,
        },
        null,
        2,
      ),
      STRATEGY_PLAN: JSON.stringify(input.strategyPlan, null, 2),
      SECTION_SEED_PACKETS: JSON.stringify(input.sectionSeedPackets, null, 2),
      EVIDENCE_ID_CATALOG: JSON.stringify(input.evidenceUnits.map(compactEvidenceIdCatalog), null, 2),
    }),
  };
}

function buildAuditPrompt(input: {
  strategyPlan: StrategyPlan;
  dossiers: ConsolidatedEvidenceSectionDossier[];
  evidenceUnits: ConsolidatedEvidenceUnit[];
}) {
  const template = `
Eres un auditor de trazabilidad academica. Revisa si el paquete consolidado puede pasar a redaccion de secciones.

Reglas:
- responde en espanol
- identifica claims sin evidencia suficiente
- identifica advertencias de trazabilidad
- indica notas concretas para el siguiente lab
- no agregues nuevas fuentes ni nuevos datos
- audita trazabilidad por IDs, elegibilidad y claims; no necesitas re-leer texto completo aqui porque el quality gate deterministico valida existencia de IDs y rutas

Estrategia:
{{STRATEGY_PLAN}}

Dossiers:
{{DOSSIERS}}

Catalogo auditable de evidence units:
{{EVIDENCE_AUDIT_CATALOG}}
`.trim();

  return {
    template,
    promptText: fillPrompt(template, {
      STRATEGY_PLAN: JSON.stringify(input.strategyPlan, null, 2),
      DOSSIERS: JSON.stringify(input.dossiers, null, 2),
      EVIDENCE_AUDIT_CATALOG: JSON.stringify(buildAuditEvidenceCatalog(input.evidenceUnits), null, 2),
    }),
  };
}

function buildFallbackStrategy(sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[]): StrategyPlan {
  const weakSections = sectionReadinessMap.filter((item) => item.readiness !== "alta");
  const methodology = sectionReadinessMap.find((item) => item.section_key === "methodology");
  const criteria = sectionReadinessMap.find((item) => item.section_key === "evaluation_criteria");

  return {
    dominant_methods: ["Revision documental de literatura recuperada", "Evaluacion multicriterio como ruta candidata"],
    dominant_frameworks: ["Adaptive reuse de edificaciones existentes", "Sostenibilidad y decision-making en entorno construido"],
    key_findings: [],
    evidence_gaps: weakSections
      .map((item) => `${item.section_key}: ${item.missing_elements.join(" ")}`)
      .slice(0, 10),
    proposal_directions: [
      "Evaluar la aplicacion de una tecnica multicriterio para orientar decisiones de reutilizacion adaptativa.",
      "Usar el corpus recuperado para fundamentar criterios, variables y limites antes de redactar secciones.",
    ],
    proposal_method_candidate: {
      method_family: criteria?.asset_count ? "Evaluacion multicriterio / MCDM" : "Revision documental aplicada",
      research_design: methodology?.readiness === "alta" ? "Investigacion aplicada con soporte documental" : "Diseno exploratorio-documental con validacion pendiente",
      application_scope_status: criteria?.asset_count ? "parcial" : "debil",
      candidate_techniques: criteria?.asset_count ? ["AHP", "matriz multicriterio", "analisis comparativo de criterios"] : [],
      selection_rationale: [
        "La evidencia recuperada incluye criterios, tablas, marcos y/o ecuaciones asociadas a decisiones de adaptive reuse.",
      ],
      evidence_support_level: criteria?.asset_count ? "medio" : "bajo",
      missing_validations: uniqueNonEmpty(
        weakSections.flatMap((item) => item.missing_elements),
        8,
      ),
    },
    proposal_framework_candidate: {
      core_framework: "Adaptive reuse de edificaciones existentes",
      supporting_frameworks: ["decision-making multicriterio", "sostenibilidad del entorno construido"],
      selection_rationale: [
        "Las fuentes se concentran en reutilizacion adaptativa, vacancia/subutilizacion, sostenibilidad y criterios de decision.",
      ],
      missing_validations: uniqueNonEmpty(
        weakSections.flatMap((item) => item.missing_elements),
        8,
      ),
    },
    gap_resolution_plan: {
      inferable_with_care: ["Se puede formular la logica metodologica con evidencia documental y declarar validaciones pendientes."],
      blocking_gaps: weakSections
        .filter((item) => item.readiness === "baja")
        .map((item) => `Reforzar ${item.section_key}.`)
        .slice(0, 8),
      validation_actions: ["Validar el ambito local, disponibilidad de datos y criterios con el investigador."],
      do_not_claim: ["No afirmar resultados locales ni desempeno de una tecnica sin datos del caso."],
    },
    asset_usage_recommendations: [],
    followup_requirements: {
      blocking: weakSections
        .filter((item) => item.readiness === "baja")
        .map((item) => `Reforzar ${item.section_key}: ${item.missing_elements.join(" ")}`)
        .slice(0, 8),
      recommended: weakSections
        .filter((item) => item.readiness === "media")
        .map((item) => `Aclarar ${item.section_key}: ${item.missing_elements.join(" ")}`)
        .slice(0, 12),
      optional: [],
    },
  };
}

function buildFallbackDossiers(params: {
  sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[];
  sectionSeedPackets: ReturnType<typeof buildSectionSeedPackets>;
  strategyPlan: StrategyPlan;
}) {
  return params.sectionSeedPackets.map((packet) => {
    const readiness = params.sectionReadinessMap.find((item) => item.section_key === packet.section_key);
    const evidenceIds = packet.evidence_unit_ids.slice(0, 10);
    const assets = packet.asset_keys.slice(0, 5);
    const missing = readiness?.missing_elements ?? [];

    return {
      section_key: packet.section_key,
      section_label_es: packet.section_label_es,
      readiness: readiness?.readiness ?? "baja",
      drafting_strategy:
        evidenceIds.length > 0
          ? `Redactar ${packet.section_label_es} usando primero evidencia directa y luego inferencias prudentes declaradas.`
          : `No redactar ${packet.section_label_es} sin reforzar evidencia.`,
      evidence_unit_ids: evidenceIds,
      primary_source_ids: packet.source_ids,
      claim_candidates: evidenceIds.length
        ? [
            {
              claim_es: `La seccion ${packet.section_label_es} cuenta con evidencia inicial para desarrollar una argumentacion trazable.`,
              evidence_unit_ids: evidenceIds.slice(0, 3),
              support_level: readiness?.readiness === "alta" ? "fuerte" : "medio",
            },
          ]
        : [],
      useful_assets: assets,
      citation_plan: evidenceIds.length
        ? ["Usar extractos originales como respaldo principal; usar senales interpretativas solo para orientar redaccion."]
        : [],
      assumptions_allowed:
        packet.section_key === "case_context"
          ? ["El contexto declarado por el investigador puede usarse como dato de partida no bibliografico."]
          : [],
      missing_evidence: missing,
      do_not_claim: params.strategyPlan.gap_resolution_plan.do_not_claim,
    } satisfies ConsolidatedEvidenceSectionDossier;
  });
}

function normalizeDossiers(params: {
  generated: DossierPlan | null;
  fallback: ConsolidatedEvidenceSectionDossier[];
  evidenceUnitIds: Set<string>;
  assetKeys: Set<string>;
}) {
  const generatedByKey = new Map(
    (params.generated?.section_dossiers ?? []).map((dossier) => [
      normalizeToCanonicalSectionKey(dossier.section_key),
      dossier,
    ]),
  );

  return params.fallback.map((fallback) => {
    const generated = generatedByKey.get(fallback.section_key as CanonicalSectionKey);
    if (!generated) {
      return fallback;
    }

    const evidenceUnitIds = uniqueNonEmpty(
      [...generated.evidence_unit_ids, ...fallback.evidence_unit_ids],
      14,
    ).filter((id) => params.evidenceUnitIds.has(id));
    const claimCandidates = (generated.claim_candidates ?? [])
      .map((claim) => ({
        claim_es: claim.claim_es,
        evidence_unit_ids: uniqueNonEmpty(claim.evidence_unit_ids, 8).filter((id) =>
          params.evidenceUnitIds.has(id),
        ),
        support_level: claim.support_level,
      }))
      .filter((claim) => claim.claim_es && claim.evidence_unit_ids.length > 0)
      .slice(0, 6);

    return {
      ...fallback,
      drafting_strategy: generated.drafting_strategy || fallback.drafting_strategy,
      evidence_unit_ids: evidenceUnitIds.length > 0 ? evidenceUnitIds : fallback.evidence_unit_ids,
      primary_source_ids: uniqueNonEmpty([...generated.primary_source_ids, ...fallback.primary_source_ids], 6),
      claim_candidates: claimCandidates.length > 0 ? claimCandidates : fallback.claim_candidates,
      useful_assets: uniqueNonEmpty([...generated.useful_assets, ...fallback.useful_assets], 8).filter(
        (assetKey) => params.assetKeys.has(assetKey),
      ),
      citation_plan: uniqueNonEmpty([...generated.citation_plan, ...fallback.citation_plan], 8),
      assumptions_allowed: uniqueNonEmpty(
        [...generated.assumptions_allowed, ...fallback.assumptions_allowed],
        8,
      ),
      missing_evidence: uniqueNonEmpty([...generated.missing_evidence, ...fallback.missing_evidence], 8),
      do_not_claim: uniqueNonEmpty([...generated.do_not_claim, ...fallback.do_not_claim], 8),
    } satisfies ConsolidatedEvidenceSectionDossier;
  });
}

function buildSectionInputPackets(dossiers: ConsolidatedEvidenceSectionDossier[]): ConsolidatedEvidenceSectionInputPacket[] {
  return dossiers.map((dossier) => ({
    section_key: dossier.section_key,
    summary: dossier.drafting_strategy,
    source_ids: dossier.primary_source_ids,
    snippet_ids: dossier.evidence_unit_ids.filter((id) => id.startsWith("snippet:")).slice(0, 8),
    asset_keys: dossier.useful_assets,
    key_points: dossier.claim_candidates.map((claim) => claim.claim_es).slice(0, 6),
    open_questions: dossier.missing_evidence,
  }));
}

function buildWeakPackets(
  sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[],
  dossiers: ConsolidatedEvidenceSectionDossier[],
): ConsolidatedEvidenceWeakSectionCompletionPacket[] {
  const dossiersByKey = new Map(dossiers.map((dossier) => [dossier.section_key, dossier]));

  return sectionReadinessMap
    .filter((section) => section.readiness !== "alta")
    .map((section) => {
      const dossier = dossiersByKey.get(section.section_key);

      return {
        section_key: section.section_key,
        draftability_status:
          section.readiness === "media" ? "inferable_with_care" : "blocked_by_missing_evidence",
        evidence_backed_points: dossier?.claim_candidates.map((claim) => claim.claim_es).slice(0, 6) ?? [],
        inference_bridges: dossier?.assumptions_allowed ?? [],
        assumptions_needed: dossier?.assumptions_allowed ?? [],
        missing_evidence: uniqueNonEmpty(
          [...(dossier?.missing_evidence ?? []), ...section.missing_elements],
          8,
        ),
      };
    });
}

function buildAssetUsagePlan(params: {
  strategyPlan: StrategyPlan;
  evidenceUnits: ConsolidatedEvidenceUnit[];
  dossiers: ConsolidatedEvidenceSectionDossier[];
}) {
  const assetUnitsByKey = new Map(
    params.evidenceUnits
      .filter((unit) => unit.asset_key)
      .map((unit) => [unit.asset_key as string, unit]),
  );
  const plan: ConsolidatedEvidenceAssetUsagePlanItem[] = [];

  for (const recommendation of params.strategyPlan.asset_usage_recommendations) {
    const asset = assetUnitsByKey.get(recommendation.asset_key);
    const sectionKey = normalizeToCanonicalSectionKey(recommendation.section_key);
    if (!asset || !sectionKey || !asset.asset_key) {
      continue;
    }
    plan.push({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: sectionKey,
      asset_kind: asset.unit_type as "image" | "equation" | "table",
      usage_reason: recommendation.usage_reason,
      handling_notes: uniqueNonEmpty(recommendation.handling_notes, 5),
    });
  }

  for (const dossier of params.dossiers) {
    for (const assetKey of dossier.useful_assets) {
      if (plan.some((item) => item.asset_key === assetKey && item.section_key === dossier.section_key)) {
        continue;
      }
      const asset = assetUnitsByKey.get(assetKey);
      if (!asset?.asset_key || !["image", "equation", "table"].includes(asset.unit_type)) {
        continue;
      }
      plan.push({
        asset_key: asset.asset_key,
        source_id: asset.source_id,
        section_key: dossier.section_key,
        asset_kind: asset.unit_type as "image" | "equation" | "table",
        usage_reason: `Asset util para ${getSectionLabel(dossier.section_key)}.`,
        handling_notes: [
          asset.unit_type === "equation"
            ? "Conservar LaTeX y renderizarlo en la etapa de redaccion."
            : asset.unit_type === "table"
              ? "Usar como tabla/contexto; verificar estructura antes de publicacion."
              : "Usar imagen recortada; revisar legibilidad antes del documento final.",
        ],
      });
    }
  }

  return plan.slice(0, 30);
}

function buildHandoffManifest(params: {
  artifactPath: string;
  latestArtifactPath: string;
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult;
  evidenceUnits: ConsolidatedEvidenceUnit[];
}) {
  const readOnlyInputPaths = uniqueNonEmpty(
    [
      STATE_FILE,
      params.artifactPath,
      params.latestArtifactPath,
      params.sourceSignalExtraction.runDir,
      ...params.sourceSignalExtraction.sources.flatMap((source) => [
        source.primaryPath,
        source.secondaryPath,
        source.extractedTextPath,
        source.sourceChunksPath,
      ]),
      ...params.evidenceUnits.map((unit) => unit.asset_path),
    ],
    240,
  );

  return {
    state_file: STATE_FILE,
    consolidated_evidence_artifact_path: params.artifactPath,
    latest_consolidated_evidence_artifact_path: params.latestArtifactPath,
    source_signal_extraction_run_dir: params.sourceSignalExtraction.runDir,
    read_only_input_paths: readOnlyInputPaths,
    next_lab_should_read: [
      "consolidatedEvidenceArtifact.evidence_units",
      "consolidatedEvidenceArtifact.section_dossiers",
      "consolidatedEvidenceArtifact.methodology_decision_packet",
      "consolidatedEvidenceArtifact.framework_decision_packet",
      "consolidatedEvidenceArtifact.asset_usage_plan",
      "consolidatedEvidenceArtifact.gap_resolution_plan",
      "consolidatedEvidenceArtifact.quality_gate",
    ],
    next_lab_should_not_modify: [
      "artifacts-local/blueprint_launch/materialized_content",
      "artifacts-local/blueprint_launch/extracted_assets",
      "artifacts-local/blueprint_launch/consolidated_evidence",
      "artifacts-local/blueprint_launch/lab-state.json",
    ],
    usage_notes_es: [
      "Los pasos 7-11 deben leer este artefacto como insumo de partida, no volver a recuperar PDFs.",
      "Las unidades con citation_eligibility=context_only no son citas bibliograficas.",
      "Las senales interpreted_signal orientan redaccion, pero las citas deben priorizar original_excerpt o asset_reference.",
      "Los assets con ruta local pueden renderizarse mediante /api/blueprint-launch/assets?path=...",
    ],
  } satisfies ConsolidatedEvidenceDownstreamHandoffManifest;
}

function buildQualityGate(params: {
  auditPlan: AuditPlan | null;
  sectionReadinessMap: ConsolidatedEvidenceSectionReadiness[];
  dossiers: ConsolidatedEvidenceSectionDossier[];
  evidenceUnits: ConsolidatedEvidenceUnit[];
}) {
  const evidenceUnitIds = new Set(params.evidenceUnits.map((unit) => unit.evidence_id));
  const checks: ConsolidatedEvidenceQualityGate["checks"] = [];
  const traceabilityWarnings: string[] = [...(params.auditPlan?.quality_gate.traceability_warnings ?? [])];

  checks.push({
    check_key: "evidence_units_present",
    status: params.evidenceUnits.length > 0 ? "pass" : "fail",
    message: `Evidence units: ${params.evidenceUnits.length}.`,
  });

  const missingEvidenceReferences = params.dossiers.flatMap((dossier) =>
    dossier.claim_candidates.flatMap((claim) =>
      claim.evidence_unit_ids.filter((id) => !evidenceUnitIds.has(id)).map((id) => `${dossier.section_key}:${id}`),
    ),
  );
  checks.push({
    check_key: "claim_evidence_ids_exist",
    status: missingEvidenceReferences.length === 0 ? "pass" : "fail",
    message:
      missingEvidenceReferences.length === 0
        ? "Todos los claims mantienen IDs de evidencia existentes."
        : `Claims con IDs inexistentes: ${missingEvidenceReferences.slice(0, 8).join(", ")}.`,
  });

  const sectionsWithoutEvidence = params.dossiers
    .filter((dossier) => dossier.section_key !== "case_context" && dossier.evidence_unit_ids.length === 0)
    .map((dossier) => dossier.section_key);
  checks.push({
    check_key: "sections_have_evidence",
    status: sectionsWithoutEvidence.length === 0 ? "pass" : "warn",
    message:
      sectionsWithoutEvidence.length === 0
        ? "Todas las secciones tienen unidades de evidencia o contexto."
        : `Secciones sin evidencia: ${sectionsWithoutEvidence.join(", ")}.`,
  });

  const imageAssetsMissingFiles = params.evidenceUnits
    .filter((unit) => unit.unit_type === "image" && (!unit.asset_path || !existsSync(unit.asset_path)))
    .map((unit) => unit.asset_key ?? unit.evidence_id);
  checks.push({
    check_key: "image_asset_paths_exist",
    status: imageAssetsMissingFiles.length === 0 ? "pass" : "warn",
    message:
      imageAssetsMissingFiles.length === 0
        ? "Todas las imagenes seleccionadas tienen ruta local legible."
        : `Imagenes sin ruta local valida: ${imageAssetsMissingFiles.slice(0, 8).join(", ")}.`,
  });

  const lowSections = params.sectionReadinessMap
    .filter((section) => section.readiness === "baja")
    .map((section) => section.section_key);
  checks.push({
    check_key: "low_readiness_sections",
    status: lowSections.length === 0 ? "pass" : "warn",
    message:
      lowSections.length === 0
        ? "No quedan secciones con readiness baja."
        : `Secciones con readiness baja: ${lowSections.join(", ")}.`,
  });

  const unsupportedClaims = params.auditPlan?.quality_gate.unsupported_claims ?? [];
  if (unsupportedClaims.length > 0) {
    checks.push({
      check_key: "audit_unsupported_claims",
      status: "warn",
      message: `Auditoria LLM encontro ${unsupportedClaims.length} claim(s) debiles o sin soporte.`,
    });
  }

  const status = checks.some((check) => check.status === "fail")
    ? "block"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    status,
    ready_for_steps_7_11:
      status !== "block" &&
      params.dossiers.length === CANONICAL_SECTIONS.length &&
      (params.auditPlan?.quality_gate.ready_for_steps_7_11 ?? true),
    checks,
    unsupported_claims: unsupportedClaims,
    traceability_warnings: uniqueNonEmpty(traceabilityWarnings, 16),
    handoff_notes: uniqueNonEmpty(params.auditPlan?.quality_gate.handoff_notes ?? [], 16),
  } satisfies ConsolidatedEvidenceQualityGate;
}

function buildContextPreservationContract(params: {
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult;
  evidenceUnits: ConsolidatedEvidenceUnit[];
  handoffManifest: ConsolidatedEvidenceDownstreamHandoffManifest;
}): ConsolidatedEvidenceContextPreservationContract {
  const directQuoteCount = params.evidenceUnits.filter(
    (unit) => unit.citation_eligibility === "direct_quote",
  ).length;
  const assetReferenceCount = params.evidenceUnits.filter(
    (unit) => unit.citation_eligibility === "asset_reference",
  ).length;

  return {
    policy: "lossless_artifact_storage_prompt_compaction_only",
    full_context_is_preserved: true,
    prompt_compaction_is_reversible: true,
    next_llm_waves_must_hydrate_from_paths: true,
    source_count: params.sourceSignalExtraction.sourceCount,
    source_chunk_count: params.sourceSignalExtraction.sources.reduce(
      (sum, source) => sum + source.sourceChunkCount,
      0,
    ),
    full_text_char_count: params.sourceSignalExtraction.totalTextCharCount,
    evidence_unit_count: params.evidenceUnits.length,
    direct_quote_count: directQuoteCount,
    asset_reference_count: assetReferenceCount,
    preserved_path_count: params.handoffManifest.read_only_input_paths.length,
    hydration_notes_es: [
      "Las optimizaciones del Paso 6 solo compactan prompts; no eliminan PDFs, texto plano, chunks, assets ni evidence_units.",
      "Las olas LLM posteriores deben usar section_dossiers como indice y rehidratar texto completo desde sourceChunksPath, extractedTextPath y asset_path.",
      "Las unidades interpreted_signal orientan lectura, pero las citas deben salir de original_excerpt o asset_reference.",
    ],
  };
}

function buildQualityComparisonSnapshot(
  artifact: ConsolidatedEvidenceArtifact,
): ConsolidatedEvidenceQualityComparisonSnapshot {
  const units = artifact.evidence_units ?? [];
  const unitById = new Map(units.map((unit) => [unit.evidence_id, unit]));
  const sourceIds = new Set(units.map((unit) => unit.source_id));
  const sections = (artifact.section_dossiers ?? []).map((dossier) => {
    const dossierUnits = dossier.evidence_unit_ids
      .map((id) => unitById.get(id))
      .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit));

    return {
      section_key: dossier.section_key,
      evidence_unit_count: dossierUnits.length,
      direct_quote_count: dossierUnits.filter((unit) => unit.citation_eligibility === "direct_quote").length,
      asset_count: dossier.useful_assets.length,
      missing_evidence_count: dossier.missing_evidence.length,
      claim_count: dossier.claim_candidates.length,
    };
  });

  return {
    generated_at: artifact.generated_at ?? null,
    artifact_path: artifact.artifact_path ?? null,
    evidence_unit_count: units.length,
    direct_quote_count: units.filter((unit) => unit.citation_eligibility === "direct_quote").length,
    asset_reference_count: units.filter((unit) => unit.citation_eligibility === "asset_reference").length,
    interpreted_signal_count: units.filter((unit) => unit.citation_eligibility === "paraphrase_only").length,
    source_count: sourceIds.size,
    section_dossier_count: artifact.section_dossiers?.length ?? 0,
    ready_section_count: artifact.coverage_map.ready_section_count,
    partial_section_count: artifact.coverage_map.partial_section_count,
    low_section_count: artifact.coverage_map.low_section_count,
    prompt_char_count: countPromptChars(artifact.llm_prompts ?? []),
    llm_call_count: artifact.llm_call_count ?? 0,
    sections,
  };
}

async function readPreviousConsolidatedArtifact(latestArtifactPath: string) {
  if (!existsSync(latestArtifactPath)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(latestArtifactPath, "utf8")) as ConsolidatedEvidenceArtifact;
  } catch {
    return null;
  }
}

async function readComparisonBaselineArtifact(latestArtifactPath: string) {
  const latest = await readPreviousConsolidatedArtifact(latestArtifactPath);

  if (
    latest?.quality_comparison?.status === "regression" &&
    latest.quality_comparison.baseline?.artifact_path &&
    existsSync(latest.quality_comparison.baseline.artifact_path)
  ) {
    return readPreviousConsolidatedArtifact(latest.quality_comparison.baseline.artifact_path);
  }

  return latest;
}

function buildQualityComparison(input: {
  baseline: ConsolidatedEvidenceArtifact | null;
  current: ConsolidatedEvidenceArtifact;
}): ConsolidatedEvidenceQualityComparison {
  const current = buildQualityComparisonSnapshot(input.current);
  const baseline = input.baseline ? buildQualityComparisonSnapshot(input.baseline) : null;

  if (!baseline) {
    return {
      baseline_available: false,
      status: "warn",
      baseline: null,
      current,
      deltas: {
        evidence_unit_count: 0,
        direct_quote_count: 0,
        asset_reference_count: 0,
        source_count: 0,
        ready_section_count: 0,
        prompt_char_count: 0,
        llm_call_count: 0,
      },
      warnings: ["No habia baseline anterior para comparar calidad."],
    };
  }

  const deltas = {
    evidence_unit_count: current.evidence_unit_count - baseline.evidence_unit_count,
    direct_quote_count: current.direct_quote_count - baseline.direct_quote_count,
    asset_reference_count: current.asset_reference_count - baseline.asset_reference_count,
    source_count: current.source_count - baseline.source_count,
    ready_section_count: current.ready_section_count - baseline.ready_section_count,
    prompt_char_count: current.prompt_char_count - baseline.prompt_char_count,
    llm_call_count: current.llm_call_count - baseline.llm_call_count,
  };
  const warnings: string[] = [];

  if (deltas.evidence_unit_count < 0) {
    warnings.push(`Evidence units bajaron ${Math.abs(deltas.evidence_unit_count)} frente al baseline.`);
  }
  if (deltas.direct_quote_count < 0) {
    warnings.push(`Extractos originales citables bajaron ${Math.abs(deltas.direct_quote_count)} frente al baseline.`);
  }
  if (deltas.asset_reference_count < 0) {
    warnings.push(`Assets citables bajaron ${Math.abs(deltas.asset_reference_count)} frente al baseline.`);
  }
  if (deltas.source_count < 0) {
    warnings.push(`Fuentes representadas bajaron ${Math.abs(deltas.source_count)} frente al baseline.`);
  }
  if (deltas.ready_section_count < 0) {
    warnings.push(`Secciones listas bajaron ${Math.abs(deltas.ready_section_count)} frente al baseline.`);
  }

  for (const baselineSection of baseline.sections) {
    const currentSection = current.sections.find(
      (section) => section.section_key === baselineSection.section_key,
    );
    if (!currentSection) {
      warnings.push(`La seccion ${baselineSection.section_key} no aparece en el nuevo dossier.`);
      continue;
    }
    if (currentSection.direct_quote_count < baselineSection.direct_quote_count) {
      warnings.push(
        `La seccion ${baselineSection.section_key} bajo de ${baselineSection.direct_quote_count} a ${currentSection.direct_quote_count} extractos directos.`,
      );
    }
  }

  const globalRegression =
    deltas.evidence_unit_count < 0 ||
    deltas.direct_quote_count < 0 ||
    deltas.asset_reference_count < 0 ||
    deltas.source_count < 0 ||
    deltas.ready_section_count < 0 ||
    warnings.some((warning) => /no aparece/i.test(warning));
  const status = globalRegression ? "regression" : warnings.length > 0 ? "warn" : "pass";

  return {
    baseline_available: true,
    status,
    baseline,
    current,
    deltas,
    warnings,
  };
}

async function writeConsolidatedArtifact(artifact: ConsolidatedEvidenceArtifact, artifactPath: string, latestArtifactPath: string) {
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(latestArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export async function consolidateBlueprintLaunchEvidence(input: {
  projectTitle: string;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  sourceSignalExtraction: BlueprintLaunchSignalExtractionResult;
  evidencePacksArtifact: EvidencePackArtifact;
}): Promise<ConsolidatedEvidenceArtifact> {
  const generatedAt = new Date().toISOString();
  const runDir = path.join(ARTIFACT_ROOT, `run-${buildTimestampToken(generatedAt)}`);
  const artifactPath = path.join(runDir, "consolidated-evidence.json");
  const latestArtifactPath = path.join(ARTIFACT_ROOT, "latest-consolidated-evidence.json");
  const previousArtifact = await readComparisonBaselineArtifact(latestArtifactPath);
  const sourcePriorities = buildSourcePriorities(input.sourceSignalExtraction);
  const sourcePriorityMap = new Map(sourcePriorities.map((source) => [source.source_id, source]));
  const evidenceUnits = buildEvidenceUnits(input).sort(
    (left, right) => unitSortScore(right, sourcePriorityMap) - unitSortScore(left, sourcePriorityMap),
  );
  const evidenceUnitIds = new Set(evidenceUnits.map((unit) => unit.evidence_id));
  const assetKeys = new Set(evidenceUnits.map((unit) => unit.asset_key).filter((value): value is string => Boolean(value)));
  const sectionMap = buildSectionEvidenceMap(evidenceUnits);
  const sectionReadinessMap = CANONICAL_SECTIONS.map((section) =>
    computeReadiness(section.key, sectionMap.get(section.key) as SectionEvidence),
  );
  const sectionSeedPackets = buildSectionSeedPackets({
    evidenceUnits,
    sourcePriorities,
    sectionMap,
  });
  const llmPrompts: BlueprintLaunchLlmPromptRecord[] = [];
  const warnings = [...input.sourceSignalExtraction.warnings, ...input.evidencePacksArtifact.warnings];
  let llmCallCount = 0;
  let successfulLlmCount = 0;
  let strategyPlan = buildFallbackStrategy(sectionReadinessMap);
  let generatedDossierPlan: DossierPlan | null = null;
  let auditPlan: AuditPlan | null = null;
  let provider: ReturnType<typeof getConfiguredLlmProvider> | null = null;

  try {
    provider = getConfiguredLlmProvider();
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Paso 6 sin LLM; se uso fallback deterministico: ${error.message}`
        : "Paso 6 sin LLM; se uso fallback deterministico.",
    );
  }

  if (provider) {
    const strategyPrompt = buildStrategyPrompt({
      savedIntake: input.savedIntake,
      sourcePriorities,
      sectionReadinessMap,
      evidenceUnits,
    });
    llmPrompts.push({
      label: "Paso 6 estrategia global del corpus",
      schemaName: STEP6_STRATEGY_SCHEMA,
      model: STEP6_MODEL,
      trackingLabel: `structured:${STEP6_STRATEGY_SCHEMA}`,
      promptTemplate: strategyPrompt.template,
      promptText: strategyPrompt.promptText,
      sourceId: null,
      sourceTitle: null,
    });
    try {
      llmCallCount += 1;
      strategyPlan = await generateStructuredObjectWithTextFallback<StrategyPlan>({
        provider,
        prompt: strategyPrompt.promptText,
        schemaName: STEP6_STRATEGY_SCHEMA,
        schema: strategySchema,
        model: STEP6_MODEL,
      });
      successfulLlmCount += 1;
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Fallo LLM de estrategia Paso 6; se uso fallback: ${error.message}`
          : "Fallo LLM de estrategia Paso 6; se uso fallback.",
      );
    }

    const dossierPrompt = buildDossierPrompt({
      savedIntake: input.savedIntake,
      strategyPlan,
      sectionSeedPackets,
      evidenceUnits,
    });
    llmPrompts.push({
      label: "Paso 6 dossiers por seccion",
      schemaName: STEP6_DOSSIER_SCHEMA,
      model: STEP6_MODEL,
      trackingLabel: `structured:${STEP6_DOSSIER_SCHEMA}`,
      promptTemplate: dossierPrompt.template,
      promptText: dossierPrompt.promptText,
      sourceId: null,
      sourceTitle: null,
    });
    try {
      llmCallCount += 1;
      generatedDossierPlan = await generateStructuredObjectWithTextFallback<DossierPlan>({
        provider,
        prompt: dossierPrompt.promptText,
        schemaName: STEP6_DOSSIER_SCHEMA,
        schema: dossierSchema,
        model: STEP6_MODEL,
      });
      successfulLlmCount += 1;
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Fallo LLM de dossiers Paso 6; se uso fallback: ${error.message}`
          : "Fallo LLM de dossiers Paso 6; se uso fallback.",
      );
    }
  }

  const fallbackDossiers = buildFallbackDossiers({
    sectionReadinessMap,
    sectionSeedPackets,
    strategyPlan,
  });
  const sectionDossiers = normalizeDossiers({
    generated: generatedDossierPlan,
    fallback: fallbackDossiers,
    evidenceUnitIds,
    assetKeys,
  });

  if (provider) {
    const auditPrompt = buildAuditPrompt({
      strategyPlan,
      dossiers: sectionDossiers,
      evidenceUnits,
    });
    llmPrompts.push({
      label: "Paso 6 auditoria de trazabilidad",
      schemaName: STEP6_AUDIT_SCHEMA,
      model: STEP6_MODEL,
      trackingLabel: `structured:${STEP6_AUDIT_SCHEMA}`,
      promptTemplate: auditPrompt.template,
      promptText: auditPrompt.promptText,
      sourceId: null,
      sourceTitle: null,
    });
    try {
      llmCallCount += 1;
      auditPlan = await generateStructuredObjectWithTextFallback<AuditPlan>({
        provider,
        prompt: auditPrompt.promptText,
        schemaName: STEP6_AUDIT_SCHEMA,
        schema: auditSchema,
        model: STEP6_MODEL,
      });
      successfulLlmCount += 1;
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Fallo LLM de auditoria Paso 6; se uso quality gate deterministico: ${error.message}`
          : "Fallo LLM de auditoria Paso 6; se uso quality gate deterministico.",
      );
    }
  }

  const sectionInputPackets = buildSectionInputPackets(sectionDossiers);
  const weakSectionCompletionPackets = buildWeakPackets(sectionReadinessMap, sectionDossiers);
  const assetUsagePlan = buildAssetUsagePlan({
    strategyPlan,
    evidenceUnits,
    dossiers: sectionDossiers,
  });
  const handoffManifest = buildHandoffManifest({
    artifactPath,
    latestArtifactPath,
    sourceSignalExtraction: input.sourceSignalExtraction,
    evidenceUnits,
  });
  const qualityGate = buildQualityGate({
    auditPlan,
    sectionReadinessMap,
    dossiers: sectionDossiers,
    evidenceUnits,
  });
  const contextPreservationContract = buildContextPreservationContract({
    sourceSignalExtraction: input.sourceSignalExtraction,
    evidenceUnits,
    handoffManifest,
  });
  const llmStatus =
    successfulLlmCount === 0
      ? provider
        ? "fallback"
        : "skipped"
      : successfulLlmCount === llmPrompts.length
        ? "llm"
        : "hybrid";
  const consolidationMode = successfulLlmCount > 0 ? "hybrid" : "rule_based";
  const summary =
    auditPlan?.summary ??
    `Paso 6 consolidado: ${evidenceUnits.length} evidence unit(s), ${sectionDossiers.length} dossier(s), readiness global ${buildCoverageMap(sectionReadinessMap).overall_readiness}.`;

  const artifact: ConsolidatedEvidenceArtifact = {
    artifact_type: "consolidated_evidence",
    artifact_version: "v2",
    generated_at: generatedAt,
    consolidation_mode: consolidationMode,
    llm_status: llmStatus,
    llm_prompt_count: llmPrompts.length,
    llm_call_count: llmCallCount,
    llm_prompts: llmPrompts,
    summary,
    run_dir: runDir,
    artifact_path: artifactPath,
    latest_artifact_path: latestArtifactPath,
    project_context: {
      project_title: input.projectTitle,
      intake_topic: input.savedIntake.intake.topic,
    },
    coverage_map: buildCoverageMap(sectionReadinessMap),
    dominant_methods: uniqueNonEmpty(strategyPlan.dominant_methods, 10),
    dominant_frameworks: uniqueNonEmpty(strategyPlan.dominant_frameworks, 10),
    key_findings: uniqueNonEmpty(strategyPlan.key_findings, 12),
    evidence_gaps: uniqueNonEmpty(strategyPlan.evidence_gaps, 10),
    proposal_directions: uniqueNonEmpty(strategyPlan.proposal_directions, 10),
    proposal_method_candidate: {
      method_family: strategyPlan.proposal_method_candidate.method_family ?? null,
      research_design: strategyPlan.proposal_method_candidate.research_design ?? null,
      application_scope_status:
        strategyPlan.proposal_method_candidate.application_scope_status ?? "debil",
      candidate_techniques: uniqueNonEmpty(strategyPlan.proposal_method_candidate.candidate_techniques, 8),
      selection_rationale: uniqueNonEmpty(strategyPlan.proposal_method_candidate.selection_rationale, 8),
      evidence_support_level:
        strategyPlan.proposal_method_candidate.evidence_support_level ?? "bajo",
      missing_validations: uniqueNonEmpty(strategyPlan.proposal_method_candidate.missing_validations, 8),
    },
    proposal_framework_candidate: {
      core_framework: strategyPlan.proposal_framework_candidate.core_framework ?? null,
      supporting_frameworks: uniqueNonEmpty(strategyPlan.proposal_framework_candidate.supporting_frameworks, 8),
      selection_rationale: uniqueNonEmpty(strategyPlan.proposal_framework_candidate.selection_rationale, 8),
      missing_validations: uniqueNonEmpty(strategyPlan.proposal_framework_candidate.missing_validations, 8),
    },
    section_readiness_map: sectionReadinessMap,
    section_input_packets: sectionInputPackets,
    weak_section_completion_packets: weakSectionCompletionPackets,
    source_priorities: sourcePriorities.map(({ numericScore, ...source }) => source),
    followup_requirements: {
      blocking: uniqueNonEmpty(strategyPlan.followup_requirements.blocking, 8),
      recommended: uniqueNonEmpty(strategyPlan.followup_requirements.recommended, 12),
      optional: uniqueNonEmpty(strategyPlan.followup_requirements.optional, 12),
    },
    evidence_units: evidenceUnits,
    section_dossiers: sectionDossiers,
    methodology_decision_packet: strategyPlan.proposal_method_candidate,
    framework_decision_packet: strategyPlan.proposal_framework_candidate,
    asset_usage_plan: assetUsagePlan,
    gap_resolution_plan: strategyPlan.gap_resolution_plan,
    downstream_handoff_manifest: handoffManifest,
    quality_gate: qualityGate,
    context_preservation_contract: contextPreservationContract,
    quality_comparison: undefined,
    warnings: uniqueNonEmpty(warnings, 30),
  };
  artifact.quality_comparison = buildQualityComparison({
    baseline: previousArtifact,
    current: artifact,
  });

  await writeConsolidatedArtifact(artifact, artifactPath, latestArtifactPath);

  return artifact;
}
