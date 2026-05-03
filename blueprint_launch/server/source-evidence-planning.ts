import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchContentMaterializationResult,
  BlueprintLaunchEvidencePlanningMaterializationItem,
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchEvidencePlanningSectionCoverage,
  BlueprintLaunchEvidencePlanningSourceCard,
  BlueprintLaunchLlmPromptRecord,
  BlueprintLaunchLocalState,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionItem,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSourceIntakeGateResult,
} from "./local-playground-store";
import type { BlueprintLaunchProjectGlobalContext } from "./step1-intake-context";

type SectionKey = BlueprintLaunchEvidencePlanningSectionCoverage["sectionKey"];
type SourceCard = BlueprintLaunchEvidencePlanningSourceCard;

type EvidencePlanningLlmCard = {
  reference_id: string;
  topic_relevance: "directa" | "parcial" | "debil";
  proposal_usefulness: "alta" | "media" | "baja";
  source_role: string;
  supports_section_keys: SectionKey[];
  methodology_hints: string[];
  framework_hints: string[];
  extraction_focus: string[];
  expected_evidence_types: SourceCard["expectedEvidenceTypes"];
  risk_flags: string[];
  quality_flags: string[];
};

type EvidencePlanningLlmSection = {
  section_key: SectionKey;
  readiness: "alta" | "media" | "baja";
  evidence_targets: string[];
  missing_elements: string[];
};

type EvidencePlanningLlmPlan = {
  source_cards: EvidencePlanningLlmCard[];
  section_coverage: EvidencePlanningLlmSection[];
  warnings: string[];
};

const STEP3_SCHEMA_NAME = "blueprint_launch_step3_evidence_planning";
const STEP3_TRACKING_LABEL = `structured:${STEP3_SCHEMA_NAME}`;
const STEP3_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
const MAX_ABSTRACT_CHARS = 1_600;
const MAX_SOURCES_FOR_PROMPT = 10;
const SECTION_KEYS: SectionKey[] = [
  "background",
  "problem_statement",
  "justification",
  "objectives",
  "methodology",
  "theoretical_or_technical_framework",
  "proposal_scope",
  "limitations",
];

const evidencePlanningSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source_cards", "section_coverage", "warnings"],
  properties: {
    source_cards: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "reference_id",
          "topic_relevance",
          "proposal_usefulness",
          "source_role",
          "supports_section_keys",
          "methodology_hints",
          "framework_hints",
          "extraction_focus",
          "expected_evidence_types",
          "risk_flags",
          "quality_flags",
        ],
        properties: {
          reference_id: { type: "string", minLength: 2, maxLength: 220 },
          topic_relevance: { type: "string", enum: ["directa", "parcial", "debil"] },
          proposal_usefulness: { type: "string", enum: ["alta", "media", "baja"] },
          source_role: { type: "string", minLength: 8, maxLength: 240 },
          supports_section_keys: {
            type: "array",
            maxItems: 8,
            items: { type: "string", enum: SECTION_KEYS },
          },
          methodology_hints: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 4, maxLength: 140 },
          },
          framework_hints: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 4, maxLength: 140 },
          },
          extraction_focus: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 160 },
          },
          expected_evidence_types: {
            type: "array",
            maxItems: 5,
            items: {
              type: "string",
              enum: ["text", "equations", "tables", "figures", "references"],
            },
          },
          risk_flags: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          quality_flags: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
        },
      },
    },
    section_coverage: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section_key", "readiness", "evidence_targets", "missing_elements"],
        properties: {
          section_key: { type: "string", enum: SECTION_KEYS },
          readiness: { type: "string", enum: ["alta", "media", "baja"] },
          evidence_targets: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 180 },
          },
          missing_elements: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 4, maxLength: 180 },
          },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 4, maxLength: 220 },
    },
  },
} satisfies Record<string, unknown>;

function stripHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string | null | undefined, maxLength: number) {
  const text = stripHtml(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function resolveConfiguredLlmStatus() {
  const providerName = process.env.LLM_PROVIDER?.trim().toLowerCase() ?? "openai";

  if (providerName !== "openai") {
    return {
      ok: false,
      reason: `Planificacion LLM omitida: proveedor no soportado en Release 0 (${providerName}).`,
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      reason:
        "Planificacion LLM omitida porque el proveedor local no tiene credenciales cargadas; se uso plan deterministico.",
    };
  }

  return { ok: true, reason: null };
}

function resolveAccessFamily(
  access: BlueprintLaunchSourceAccessResolutionItem | undefined,
): BlueprintLaunchEvidencePlanningMaterializationItem["resolverFamily"] {
  const url = access?.resolvedContentUrl?.toLowerCase() ?? "";
  const via = access?.resolvedVia?.toLowerCase() ?? "";
  const labels = access?.candidateSummary.map((item) => item.label.toLowerCase()).join(" ") ?? "";

  if (url.includes("ndownloader.figshare.com") || labels.includes("figshare")) {
    return "figshare";
  }

  if (
    url.includes("/server/api/core/bitstreams/") ||
    url.includes("/bitstreams/") ||
    labels.includes("dspace") ||
    url.includes("repository.")
  ) {
    return "dspace";
  }

  if (via.includes("openalex_pdf")) {
    return "openalex_pdf";
  }

  if (via.includes("doi")) {
    return "doi_redirect";
  }

  if (access?.kind === "web_fulltext" || access?.kind === "html_article") {
    return "html_fulltext";
  }

  if (access?.kind === "pdf") {
    return "publisher_pdf";
  }

  if (access?.kind === "abstract_only" || access?.kind === "landing_only") {
    return "metadata_only";
  }

  return "unknown";
}

function expectedKindFromAccess(
  access: BlueprintLaunchSourceAccessResolutionItem | undefined,
): BlueprintLaunchEvidencePlanningMaterializationItem["expectedKind"] {
  if (!access?.hasCompletePublicContent) {
    return "unknown";
  }

  if (access.kind === "pdf") {
    return "pdf";
  }

  if (access.kind === "repository_fulltext") {
    return "repository_fulltext";
  }

  if (access.kind === "web_fulltext" || access.kind === "html_article") {
    return "web_text";
  }

  return "unknown";
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function inferSectionKeys(text: string): SectionKey[] {
  const lower = text.toLowerCase();
  const sections: SectionKey[] = ["background"];

  if (includesAny(lower, ["vacancy", "underuse", "housing", "crisis", "emission", "demolition"])) {
    sections.push("problem_statement", "justification");
  }

  if (includesAny(lower, ["framework", "criteria", "multi-criteria", "assessment", "case study", "typological"])) {
    sections.push("methodology");
  }

  if (includesAny(lower, ["adaptive reuse", "regenerative", "ecosystem", "biomimicry", "historic", "sustainable"])) {
    sections.push("theoretical_or_technical_framework");
  }

  if (includesAny(lower, ["toronto", "building", "urban", "masterplan", "hospital", "commercial"])) {
    sections.push("proposal_scope");
  }

  if (includesAny(lower, ["limitation", "constraint", "barrier", "regulation", "ambition"])) {
    sections.push("limitations");
  }

  sections.push("objectives");
  return [...new Set(sections)];
}

function inferMethodologyHints(text: string) {
  const lower = text.toLowerCase();
  const hints: string[] = [];

  if (includesAny(lower, ["multi-criteria", "multicriteria", "criteria", "assessment"])) {
    hints.push("Usar criterios de evaluacion y matriz multicriterio para comparar alternativas de reutilizacion.");
  }

  if (includesAny(lower, ["framework", "case study", "comparative", "precedent"])) {
    hints.push("Construir un framework aplicado y validarlo contra precedentes o casos comparables.");
  }

  if (includesAny(lower, ["vacancy", "underuse", "existing urban buildings"])) {
    hints.push("Caracterizar subutilizacion, vacancia y condiciones tipologicas del edificio existente.");
  }

  if (includesAny(lower, ["emission", "carbon", "demolition"])) {
    hints.push("Incluir criterios de impacto ambiental, carbono embebido o reduccion de emisiones.");
  }

  return hints;
}

function inferFrameworkHints(text: string) {
  const lower = text.toLowerCase();
  const hints: string[] = [];

  if (lower.includes("adaptive reuse")) {
    hints.push("Reutilizacion adaptativa como marco tecnico principal.");
  }

  if (includesAny(lower, ["regenerative", "ecosystem", "biomimicry"])) {
    hints.push("Diseno regenerativo, servicios ecosistemicos y biomimesis como soporte teorico complementario.");
  }

  if (includesAny(lower, ["sustainable", "emission", "carbon"])) {
    hints.push("Sostenibilidad, reduccion de emisiones y ciclo de vida como criterios de justificacion.");
  }

  if (includesAny(lower, ["historic", "heritage"])) {
    hints.push("Valor historico y conservacion como condicion para definir compatibilidad de nuevo uso.");
  }

  return hints;
}

function inferExtractionFocus(text: string, accessKind: string) {
  const lower = text.toLowerCase();
  const focus = [
    "Extraer definiciones, argumentos y citas trazables para secciones teoricas.",
    "Identificar criterios, variables o dimensiones que puedan convertirse en matriz de evaluacion.",
  ];

  if (accessKind === "pdf") {
    focus.push("Detectar tablas, figuras, ecuaciones o diagramas relevantes antes de extraer assets.");
  }

  if (includesAny(lower, ["method", "methodology", "criteria", "assessment", "framework"])) {
    focus.push("Buscar el procedimiento metodologico, criterios de decision y limites de aplicacion.");
  }

  if (includesAny(lower, ["results", "findings", "case study"])) {
    focus.push("Separar hallazgos transferibles de resultados dependientes del caso original.");
  }

  return focus;
}

function inferExpectedEvidenceTypes(text: string, expectedKind: string) {
  const lower = text.toLowerCase();
  const types: SourceCard["expectedEvidenceTypes"] = ["text", "references"];

  if (expectedKind === "pdf") {
    types.push("figures", "tables");
  }

  if (includesAny(lower, ["equation", "formula", "model", "index"])) {
    types.push("equations");
  }

  return [...new Set(types)];
}

function buildRiskFlags(input: {
  access: BlueprintLaunchSourceAccessResolutionItem | undefined;
  resolverFamily: BlueprintLaunchEvidencePlanningMaterializationItem["resolverFamily"];
  scoreLabel: string | null;
}) {
  const flags: string[] = [];

  if (!input.access?.hasCompletePublicContent) {
    flags.push("no_complete_public_content");
  }

  if ((input.access?.warnings.length ?? 0) > 0) {
    flags.push("access_warnings_present");
  }

  if (input.resolverFamily === "figshare") {
    flags.push("head_may_fail_use_get_range");
  }

  if (input.access?.confidence && input.access.confidence < 0.75) {
    flags.push("low_access_confidence");
  }

  if (input.scoreLabel === "BAJO" || input.scoreLabel === "MINIMO") {
    flags.push("low_relevance_score");
  }

  return flags;
}

function buildMaterializationPlanItem(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  access: BlueprintLaunchSourceAccessResolutionItem | undefined;
}): BlueprintLaunchEvidencePlanningMaterializationItem {
  const resolverFamily = resolveAccessFamily(input.access);
  const expectedKind = expectedKindFromAccess(input.access);
  const riskFlags = buildRiskFlags({
    access: input.access,
    resolverFamily,
    scoreLabel: input.source.scoreLabel,
  });
  const validationNotes = [
    input.access?.hasCompletePublicContent
      ? "Contenido completo resuelto por Paso 2; Paso 4 debe descargar o capturar desde esta URL."
      : "No hay contenido completo resuelto; Paso 4 no debe materializar esta fuente.",
  ];

  if (resolverFamily === "figshare") {
    validationNotes.push("Validar con GET Range porque HEAD puede devolver 403.");
  }

  if (resolverFamily === "dspace") {
    validationNotes.push("Priorizar bitstream ORIGINAL o content API; evitar PDFs de ayuda, licencia o copyright.");
  }

  return {
    sourceId: input.source.reference.id,
    title: input.source.reference.title,
    expectedKind,
    resolverFamily,
    contentUrl: input.access?.resolvedContentUrl ?? null,
    priority:
      input.source.scoreLabel === "ALTO" || input.source.scoreLabel === "MEDIO"
        ? "high"
        : expectedKind === "pdf"
          ? "medium"
          : "low",
    languageDetected: input.access?.languageDetected ?? input.source.reference.sourceLanguage,
    accessKind: input.access?.kind ?? "unknown",
    riskFlags,
    validationNotes,
  };
}

function buildDeterministicCard(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  access: BlueprintLaunchSourceAccessResolutionItem | undefined;
  planItem: BlueprintLaunchEvidencePlanningMaterializationItem;
}) {
  const abstract = truncate(input.source.reference.abstract, MAX_ABSTRACT_CHARS);
  const text = `${input.source.reference.title} ${abstract}`;
  const supportsSectionKeys = inferSectionKeys(text);
  const methodologyHints = inferMethodologyHints(text);
  const frameworkHints = inferFrameworkHints(text);
  const extractionFocus = inferExtractionFocus(text, input.planItem.expectedKind);
  const directSignals = ["adaptive reuse", "existing building", "vacancy", "underuse", "building"]
    .filter((token) => text.toLowerCase().includes(token)).length;
  const topicRelevance =
    input.source.scoreLabel === "ALTO" || directSignals >= 2
      ? "directa"
      : input.source.scoreLabel === "MEDIO" || directSignals >= 1
        ? "parcial"
        : "debil";
  const proposalUsefulness =
    input.planItem.expectedKind === "pdf" && topicRelevance !== "debil"
      ? "alta"
      : input.access?.hasCompletePublicContent
        ? "media"
        : "baja";

  return {
    sourceId: input.source.reference.id,
    title: input.source.reference.title,
    year: input.source.reference.year,
    scoreLabel: input.source.scoreLabel,
    relevanceScore: input.source.relevanceScore,
    detectedLanguage: input.planItem.languageDetected,
    accessStatus: input.access?.status ?? "unresolved",
    accessKind: input.access?.kind ?? "unknown",
    resolverFamily: input.planItem.resolverFamily,
    contentUrl: input.planItem.contentUrl,
    topicRelevance,
    proposalUsefulness,
    sourceRole:
      topicRelevance === "directa"
        ? "Fuente principal para sostener criterios, antecedentes o marco aplicado de la propuesta."
        : "Fuente complementaria para contexto, justificacion o contraste metodologico.",
    supportsSectionKeys,
    methodologyHints,
    frameworkHints,
    extractionFocus,
    expectedEvidenceTypes: inferExpectedEvidenceTypes(text, input.planItem.expectedKind),
    riskFlags: input.planItem.riskFlags,
    qualityFlags: [
      input.access?.hasCompletePublicContent ? "contenido_completo_resuelto" : "sin_contenido_completo",
      input.source.scoreLabel ? `score_${input.source.scoreLabel.toLowerCase()}` : "score_no_disponible",
    ],
  } satisfies SourceCard;
}

function readinessFromCount(count: number) {
  if (count >= 2) {
    return "media";
  }

  return "baja";
}

function defaultTargetsForSection(sectionKey: SectionKey) {
  const targets: Record<SectionKey, string[]> = {
    background: [
      "Antecedentes de reutilizacion adaptativa y edificios existentes.",
      "Conceptos base sobre subutilizacion, vacancia o regeneracion urbana.",
    ],
    problem_statement: [
      "Evidencia sobre presion habitacional, obsolescencia o impacto de demolicion.",
      "Senales que conecten edificios existentes con oportunidad de reconversion.",
    ],
    justification: [
      "Argumentos ambientales, urbanos, economicos o sociales que justifiquen la propuesta.",
      "Beneficios potenciales frente a demolicion o nueva construccion.",
    ],
    objectives: [
      "Variables, criterios y alcance que ayuden a formular objetivos verificables.",
      "Relaciones entre tecnica propuesta, tipo de edificio y resultado esperado.",
    ],
    methodology: [
      "Criterios de evaluacion, matriz multicriterio, analisis comparado o estudio de caso.",
      "Procedimientos transferibles para seleccionar tecnica, alcance y restricciones.",
    ],
    theoretical_or_technical_framework: [
      "Definiciones y marcos tecnicos: reutilizacion adaptativa, sostenibilidad, servicios ecosistemicos.",
      "Teorias o conceptos que sostengan la decision metodologica posterior.",
    ],
    proposal_scope: [
      "Condiciones de aplicabilidad para edificios comerciales tipo B/C y contexto urbano.",
      "Variables de alcance, restricciones y criterios de seleccion tipologica.",
    ],
    limitations: [
      "Limites de transferencia entre casos internacionales y Toronto.",
      "Restricciones normativas, estructurales, economicas o de disponibilidad de datos.",
    ],
  };

  return targets[sectionKey];
}

function defaultMissingForSection(sectionKey: SectionKey, count: number) {
  if (count >= 4) {
    return [];
  }

  const missing: Record<SectionKey, string[]> = {
    background: ["Faltan extractos textuales extensos de antecedentes clave."],
    problem_statement: ["Falta evidencia especifica que conecte el problema con edificios tipo B/C en Toronto."],
    justification: ["Faltan datos comparables de impacto economico, carbono o factibilidad local."],
    objectives: ["Falta convertir senales de evidencia en objetivos medibles y delimitados."],
    methodology: ["Falta seleccionar tecnica metodologica final y operacionalizar variables."],
    theoretical_or_technical_framework: ["Faltan definiciones trazables y citas textuales para conceptos centrales."],
    proposal_scope: ["Falta delimitar alcance local, normativa y criterios de elegibilidad del edificio."],
    limitations: ["Falta explicitar limites por transferencia geografica, normativa y disponibilidad de datos."],
  };

  return missing[sectionKey];
}

function buildSectionCoverage(cards: SourceCard[]) {
  return SECTION_KEYS.map((sectionKey) => {
    const sourceIds = cards
      .filter((card) => card.supportsSectionKeys.includes(sectionKey))
      .map((card) => card.sourceId);

    return {
      sectionKey,
      readiness: readinessFromCount(sourceIds.length),
      readinessBasis: "metadata_potential",
      candidateSourceCount: sourceIds.length,
      sourceIds,
      evidenceTargets: defaultTargetsForSection(sectionKey),
      missingElements: defaultMissingForSection(sectionKey, sourceIds.length),
    } satisfies BlueprintLaunchEvidencePlanningSectionCoverage;
  });
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildDownstreamState(input: {
  state: BlueprintLaunchLocalState;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
}) {
  const reasons: string[] = [];
  const sourceAccessTime = parseDate(input.sourceAccessResolution.savedAt);
  const contentMaterialization = input.state.contentMaterialization;
  const sourceSignalExtraction = input.state.sourceSignalExtraction;
  const evidencePacksArtifact = input.state.evidencePacksArtifact;
  const consolidatedEvidenceArtifact = input.state.consolidatedEvidenceArtifact;
  const accessById = new Map(input.sourceAccessResolution.items.map((item) => [item.sourceId, item]));

  const contentIsOlder =
    Boolean(contentMaterialization && sourceAccessTime) &&
    (parseDate(contentMaterialization?.savedAt) ?? 0) < (sourceAccessTime ?? 0);
  const materializedUrlMismatch =
    contentMaterialization?.items.some((item) => {
      const access = accessById.get(item.sourceId);
      return Boolean(access?.resolvedContentUrl && item.resolvedContentUrl !== access.resolvedContentUrl);
    }) ?? false;
  const contentMaterializationIsStale = Boolean(contentMaterialization) && (contentIsOlder || materializedUrlMismatch);

  if (contentIsOlder) {
    reasons.push("contentMaterialization fue generado antes de la resolucion de acceso actual.");
  }

  if (materializedUrlMismatch) {
    reasons.push("contentMaterialization contiene URLs distintas a las resueltas actualmente en Paso 2.");
  }

  const sourceSignalExtractionIsStale =
    Boolean(sourceSignalExtraction && sourceAccessTime) &&
    (parseDate(sourceSignalExtraction?.savedAt) ?? 0) < (sourceAccessTime ?? 0);
  const evidencePacksArtifactIsStale =
    Boolean(evidencePacksArtifact && sourceAccessTime) &&
    (parseDate(evidencePacksArtifact?.generated_at) ?? 0) < (sourceAccessTime ?? 0);
  const consolidatedEvidenceArtifactIsStale =
    Boolean(consolidatedEvidenceArtifact && sourceAccessTime) &&
    (parseDate(consolidatedEvidenceArtifact?.generated_at) ?? 0) < (sourceAccessTime ?? 0);

  if (sourceSignalExtractionIsStale) {
    reasons.push("sourceSignalExtraction fue generado antes de la resolucion de acceso actual.");
  }

  if (evidencePacksArtifactIsStale) {
    reasons.push("evidencePacksArtifact fue generado antes de la resolucion de acceso actual.");
  }

  if (consolidatedEvidenceArtifactIsStale) {
    reasons.push("consolidatedEvidenceArtifact fue generado antes de la resolucion de acceso actual.");
  }

  return {
    invalidatedDuringRun: Boolean(
      contentMaterializationIsStale ||
        sourceSignalExtractionIsStale ||
        evidencePacksArtifactIsStale ||
        consolidatedEvidenceArtifactIsStale,
    ),
    contentMaterializationIsStale,
    sourceSignalExtractionIsStale,
    evidencePacksArtifactIsStale,
    consolidatedEvidenceArtifactIsStale,
    staleReasons: reasons,
    sourceAccessSavedAt: input.sourceAccessResolution.savedAt,
    contentMaterializationSavedAt: contentMaterialization?.savedAt ?? null,
    sourceSignalExtractionSavedAt: sourceSignalExtraction?.savedAt ?? null,
    evidencePacksGeneratedAt: evidencePacksArtifact?.generated_at ?? null,
    consolidatedEvidenceGeneratedAt: consolidatedEvidenceArtifact?.generated_at ?? null,
  };
}

function buildPromptTemplate() {
  return `
Actua como planificador academico de evidencia para una investigacion aplicada de posgrado en {{knowledge_area}}.

Objetivo:
- preparar el plan del siguiente paso de materializacion y extraccion
- decidir que debe buscarse en cada fuente completa antes de descargar y procesar PDFs o texto web
- mapear fuentes a secciones de tesis/propuesta sin inventar evidencia
- detectar vacios que los pasos posteriores deben cubrir con extractos, tablas, figuras, ecuaciones o referencias

Reglas:
- responde en espanol
- no inventes datos, resultados ni citas
- usa solo el contexto del proyecto, metadata, abstracts y resolucion de acceso disponible
- conserva terminos tecnicos consolidados si mejoran precision
- prioriza utilidad para: marco teorico, metodologia, justificacion, objetivos, problema, alcance y limitaciones
- si una fuente tiene PDF completo, no extraigas aun el contenido; solo planifica que buscar despues
- si hay ambiguedad, declarala como risk_flag o missing_element

Contexto del proyecto:
- area: {{knowledge_area}}
- tema canonico: {{canonical_topic_es}}
- nucleo del problema: {{problem_core_es}}
- preferencia metodologica: {{method_preference_es}}
- alcance objetivo: {{target_scope_es}}
- retrieval brief: {{retrieval_brief_en}}
- intake mejorado: {{intake_improved_json}}

Gate y resolucion:
- gate: {{gate_json}}
- fuentes: {{sources_json}}
`.trim();
}

function renderPromptTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function buildPlanningPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult;
}) {
  const accessById = new Map(input.sourceAccessResolution.items.map((item) => [item.sourceId, item]));
  const sources = input.bundle.sources.slice(0, MAX_SOURCES_FOR_PROMPT).map((source) => {
    const access = accessById.get(source.reference.id);

    return {
      reference_id: source.reference.id,
      title: source.reference.title,
      year: source.reference.year,
      score_label: source.scoreLabel,
      relevance_score: source.relevanceScore,
      abstract: truncate(source.reference.abstract, MAX_ABSTRACT_CHARS),
      doi: source.reference.doi,
      landing_page: source.reference.landingPageUrl,
      access_status: access?.status ?? null,
      access_kind: access?.kind ?? null,
      resolved_content_url: access?.resolvedContentUrl ?? null,
      resolved_via: access?.resolvedVia ?? null,
      language_detected: access?.languageDetected ?? source.reference.sourceLanguage ?? null,
      candidate_labels: access?.candidateSummary.map((candidate) => candidate.label).slice(0, 5) ?? [],
      warnings: access?.warnings ?? [],
    };
  });
  const template = buildPromptTemplate();
  const promptText = renderPromptTemplate(template, {
    knowledge_area:
      input.projectGlobalContext?.project.knowledgeAreaLabel ??
      input.savedIntake.projectContext.knowledgeAreaLabel ??
      "disciplina no especificada",
    canonical_topic_es: input.projectGlobalContext?.canonicalTopicEs ?? input.savedIntake.intake.topic ?? "null",
    problem_core_es:
      input.projectGlobalContext?.problemCoreEs ?? input.savedIntake.intake.problemContext ?? "null",
    method_preference_es:
      input.projectGlobalContext?.methodPreferenceEs ?? input.savedIntake.intake.preferredMethodology ?? "null",
    target_scope_es:
      input.projectGlobalContext?.targetScopeEs ?? input.savedIntake.intake.targetPopulation ?? "null",
    retrieval_brief_en: input.projectGlobalContext?.retrievalBriefEn ?? "null",
    intake_improved_json: JSON.stringify(input.savedIntake.intake, null, 2),
    gate_json: JSON.stringify(input.sourceIntakeGate, null, 2),
    sources_json: JSON.stringify(sources, null, 2),
  });

  return { template, promptText };
}

function mergeLlmCards(input: {
  deterministicCards: SourceCard[];
  generated: EvidencePlanningLlmPlan | null;
}) {
  if (!input.generated) {
    return input.deterministicCards;
  }

  return input.deterministicCards.map((card) => {
    const generatedCard = input.generated?.source_cards.find((item) => item.reference_id === card.sourceId);

    if (!generatedCard) {
      return card;
    }

    return {
      ...card,
      topicRelevance: generatedCard.topic_relevance,
      proposalUsefulness: generatedCard.proposal_usefulness,
      sourceRole: generatedCard.source_role,
      supportsSectionKeys: generatedCard.supports_section_keys,
      methodologyHints: generatedCard.methodology_hints,
      frameworkHints: generatedCard.framework_hints,
      extractionFocus: generatedCard.extraction_focus,
      expectedEvidenceTypes: generatedCard.expected_evidence_types,
      riskFlags: [...new Set([...card.riskFlags, ...generatedCard.risk_flags])],
      qualityFlags: [...new Set([...card.qualityFlags, ...generatedCard.quality_flags])],
    };
  });
}

function mergeLlmSections(input: {
  deterministicSections: BlueprintLaunchEvidencePlanningSectionCoverage[];
  generated: EvidencePlanningLlmPlan | null;
  cards: SourceCard[];
}) {
  if (!input.generated) {
    return input.deterministicSections;
  }

  return input.deterministicSections.map((section) => {
    const generatedSection = input.generated?.section_coverage.find(
      (item) => item.section_key === section.sectionKey,
    );

    if (!generatedSection) {
      return section;
    }

    const sourceIds = input.cards
      .filter((card) => card.supportsSectionKeys.includes(section.sectionKey))
      .map((card) => card.sourceId);

    return {
      ...section,
      readiness: generatedSection.readiness,
      readinessBasis: "llm_planned" as const,
      candidateSourceCount: sourceIds.length,
      sourceIds,
      evidenceTargets: generatedSection.evidence_targets,
      missingElements: generatedSection.missing_elements,
    };
  });
}

function buildSummary(input: {
  decision: BlueprintLaunchEvidencePlanningResult["decision"];
  sourceCount: number;
  completePublicContentCount: number;
  pdfPlanCount: number;
  webPlanCount: number;
  staleCount: number;
}) {
  return `Paso 3 ${input.decision}: ${input.sourceCount} fuente(s) planificadas, ${input.completePublicContentCount} con contenido completo, ${input.pdfPlanCount} PDF(s), ${input.webPlanCount} fuente(s) web/repositorio y ${input.staleCount} artefacto(s) downstream obsoleto(s).`;
}

export async function planBlueprintLaunchEvidence(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult;
  state: BlueprintLaunchLocalState;
}): Promise<BlueprintLaunchEvidencePlanningResult> {
  const accessById = new Map(input.sourceAccessResolution.items.map((item) => [item.sourceId, item]));
  const materializationPlan = input.bundle.sources.map((source) =>
    buildMaterializationPlanItem({
      source,
      access: accessById.get(source.reference.id),
    }),
  );
  const deterministicCards = input.bundle.sources.map((source) => {
    const access = accessById.get(source.reference.id);
    const planItem = materializationPlan.find((item) => item.sourceId === source.reference.id);

    return buildDeterministicCard({
      source,
      access,
      planItem: planItem ?? buildMaterializationPlanItem({ source, access }),
    });
  });
  const { template, promptText } = buildPlanningPrompt(input);
  const llmPrompts: BlueprintLaunchLlmPromptRecord[] = [
    {
      label: "Planificacion de evidencia y materializacion",
      schemaName: STEP3_SCHEMA_NAME,
      model: STEP3_MODEL,
      trackingLabel: STEP3_TRACKING_LABEL,
      promptTemplate: template,
      promptText,
      sourceId: null,
      sourceTitle: null,
    },
  ];
  const llmStatus = resolveConfiguredLlmStatus();
  let generated: EvidencePlanningLlmPlan | null = null;
  let resultLlmStatus: BlueprintLaunchEvidencePlanningResult["llmStatus"] = "skipped";
  let llmCallCount = 0;
  const operationalWarnings: string[] = [];
  const evidenceWarnings: string[] = [];

  if (!llmStatus.ok) {
    operationalWarnings.push(llmStatus.reason ?? "Planificacion LLM omitida por configuracion local.");
  } else {
    try {
      const provider = getConfiguredLlmProvider();
      llmCallCount = 1;
      generated = await generateStructuredObjectWithTextFallback<EvidencePlanningLlmPlan>({
        provider,
        prompt: promptText,
        schemaName: STEP3_SCHEMA_NAME,
        schema: evidencePlanningSchema,
        model: STEP3_MODEL,
      });
      resultLlmStatus = "llm";
      evidenceWarnings.push(...generated.warnings);
    } catch (error) {
      resultLlmStatus = "fallback";
      operationalWarnings.push(
        error instanceof Error
          ? `Fallo la planificacion LLM; se uso fallback deterministico: ${error.message}`
          : "Fallo la planificacion LLM; se uso fallback deterministico.",
      );
    }
  }

  const sourceCards = mergeLlmCards({ deterministicCards, generated });
  const deterministicSections = buildSectionCoverage(sourceCards);
  const sectionCoverage = mergeLlmSections({
    deterministicSections,
    generated,
    cards: sourceCards,
  });
  const downstreamState = buildDownstreamState({
    state: input.state,
    sourceAccessResolution: input.sourceAccessResolution,
  });
  const blockedSourceCount = materializationPlan.filter((item) => item.expectedKind === "unknown").length;
  const pdfPlanCount = materializationPlan.filter((item) => item.expectedKind === "pdf").length;
  const webPlanCount = materializationPlan.filter(
    (item) => item.expectedKind === "web_text" || item.expectedKind === "repository_fulltext",
  ).length;
  const staleCount = [
    downstreamState.contentMaterializationIsStale,
    downstreamState.sourceSignalExtractionIsStale,
    downstreamState.evidencePacksArtifactIsStale,
    downstreamState.consolidatedEvidenceArtifactIsStale,
  ].filter(Boolean).length;
  const decision =
    input.sourceIntakeGate.decision === "BLOCK" || blockedSourceCount > 0
      ? "BLOCK"
      : evidenceWarnings.length > 0 || staleCount > 0
        ? "PASS_WITH_WARNINGS"
        : "PASS";
  const completePublicContentCount = input.sourceAccessResolution.completePublicCount;

  return {
    savedAt: new Date().toISOString(),
    decision,
    summary: buildSummary({
      decision,
      sourceCount: input.bundle.selectedCount,
      completePublicContentCount,
      pdfPlanCount,
      webPlanCount,
      staleCount,
    }),
    llmStatus: resultLlmStatus,
    llmPromptCount: llmPrompts.length,
    llmCallCount,
    llmPrompts,
    sourceCount: input.bundle.selectedCount,
    completePublicContentCount,
    pdfPlanCount,
    webPlanCount,
    blockedSourceCount,
    materializationPlan,
    sourceCards,
    sectionCoverage,
    downstreamState,
    nextStepRecommendation:
      decision === "BLOCK"
        ? "Volver al Paso 2 y resolver acceso completo antes de materializar."
        : "Continuar al Paso 4: descargar PDFs y capturar textos completos usando este plan.",
    operationalWarnings,
    evidenceWarnings,
    warnings: [...operationalWarnings, ...evidenceWarnings, ...downstreamState.staleReasons],
  };
}
