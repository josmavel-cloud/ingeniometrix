import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchEvidenceCompletionCard,
  BlueprintLaunchEvidenceCompletionResult,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
} from "./local-playground-store";

type EvidenceCompletionCardSchema = {
  reference_id: string;
  detected_language: string | null;
  applicability_to_project: "directa" | "parcial" | "debil";
  usefulness_label: "usable" | "weak_support" | "off_topic";
  why_relevant: string;
  supports_section_keys: string[];
  methodology_hints: string[];
  framework_hints: string[];
  decision_value: string;
  intake_coverage: string[];
  method_signals: string[];
  context_signals: string[];
  variable_signals: string[];
  evidence_limits: string[];
  quality_flags: string[];
};

type EvidenceCompletionPlan = {
  cards: EvidenceCompletionCardSchema[];
};

const evidenceCompletionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "reference_id",
          "detected_language",
          "applicability_to_project",
          "usefulness_label",
          "why_relevant",
          "supports_section_keys",
          "methodology_hints",
          "framework_hints",
          "decision_value",
          "intake_coverage",
          "method_signals",
          "context_signals",
          "variable_signals",
          "evidence_limits",
          "quality_flags",
        ],
        properties: {
          reference_id: { type: "string", minLength: 2, maxLength: 200 },
          detected_language: {
            anyOf: [{ type: "string", minLength: 2, maxLength: 32 }, { type: "null" }],
          },
          applicability_to_project: {
            type: "string",
            enum: ["directa", "parcial", "debil"],
          },
          usefulness_label: {
            type: "string",
            enum: ["usable", "weak_support", "off_topic"],
          },
          why_relevant: { type: "string", minLength: 10, maxLength: 360 },
          supports_section_keys: {
            type: "array",
            maxItems: 5,
            items: {
              type: "string",
              enum: [
                "background",
                "problem_statement",
                "justification",
                "methodology",
                "theoretical_or_technical_framework",
              ],
            },
          },
          methodology_hints: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          framework_hints: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          decision_value: { type: "string", minLength: 10, maxLength: 240 },
          intake_coverage: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 80 },
          },
          method_signals: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          context_signals: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          variable_signals: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
          evidence_limits: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 140 },
          },
          quality_flags: {
            type: "array",
            maxItems: 6,
            items: { type: "string", minLength: 3, maxLength: 120 },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

function countCardsByPredicate(
  cards: BlueprintLaunchEvidenceCompletionCard[],
  predicate: (card: BlueprintLaunchEvidenceCompletionCard) => boolean,
) {
  return cards.filter(predicate).length;
}

function summarizeCards(cards: BlueprintLaunchEvidenceCompletionCard[]) {
  return {
    usableCount: countCardsByPredicate(cards, (card) => card.usefulnessLabel === "usable"),
    weakSupportCount: countCardsByPredicate(
      cards,
      (card) => card.usefulnessLabel === "weak_support",
    ),
    offTopicCount: countCardsByPredicate(cards, (card) => card.usefulnessLabel === "off_topic"),
    methodologySupportCount: countCardsByPredicate(
      cards,
      (card) =>
        card.supportsSectionKeys.includes("methodology") || card.methodologyHints.length > 0,
    ),
    frameworkSupportCount: countCardsByPredicate(
      cards,
      (card) =>
        card.supportsSectionKeys.includes("theoretical_or_technical_framework") ||
        card.frameworkHints.length > 0,
    ),
  };
}

function detectLanguageFromSource(
  source: BlueprintLaunchSelectedSourceBundle["sources"][number],
) {
  const sourceLanguage = source.reference.sourceLanguage?.trim() ?? "";
  return sourceLanguage || "en";
}

function buildPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
}) {
  const accessBySourceId = new Map(
    input.sourceAccessResolution.items.map((item) => [item.sourceId, item]),
  );
  const sources = input.bundle.sources
    .filter((item) => {
      const access = accessBySourceId.get(item.reference.id);
      return !access?.hasCompletePublicContent;
    })
    .map((item) => ({
      reference_id: item.reference.id,
      title: item.reference.title,
      doi: item.reference.doi,
      year: item.reference.year,
      venue: item.reference.venue,
      abstract: item.reference.abstract,
      landing_page: item.reference.landingPageUrl,
      score_label: item.scoreLabel,
      relevance_score: item.relevanceScore,
      detected_language: item.reference.sourceLanguage ?? null,
      resolved_access: accessBySourceId.get(item.reference.id) ?? null,
    }));

  return `
Eres un analista academico que prepara evidencia compensatoria para una tesis.

Objetivo:
- trabajar solo con fuentes seleccionadas que NO tienen contenido publico completo resuelto
- usar unicamente el intake, el titulo, el abstract y la metadata disponible
- producir tarjetas utiles para decidir como usar o descartar cada fuente en una propuesta de tesis

Reglas:
- responde siempre en espanol
- no inventes resultados ni detalles metodologicos no visibles
- si la fuente es debil o esta fuera de foco, dilo de forma explicita
- piensa en utilidad para secciones de tesis, metodologia posible y marco teorico o tecnico
- "methodology_hints" y "framework_hints" deben ser prudentes: solo sugerencias respaldadas por abstract o metadata
- "supports_section_keys" solo puede incluir: background, problem_statement, justification, methodology, theoretical_or_technical_framework

Contexto del proyecto:
- area del conocimiento: ${input.savedIntake.projectContext.knowledgeAreaLabel ?? "No definida"}
- tema: ${input.savedIntake.intake.topic}
- contexto: ${input.savedIntake.intake.problemContext}
- linea: ${input.savedIntake.intake.researchLine}
- poblacion: ${input.savedIntake.intake.targetPopulation}
- metodologia preferida: ${input.savedIntake.intake.preferredMethodology}
- notas del asesor: ${input.savedIntake.intake.advisorNotes}

Fuentes a completar:
${JSON.stringify(sources, null, 2)}
`.trim();
}

function buildFallbackCard(
  source: BlueprintLaunchSelectedSourceBundle["sources"][number],
): BlueprintLaunchEvidenceCompletionCard {
  const hasAbstract = Boolean(source.reference.abstract?.trim());
  const detectedLanguage = detectLanguageFromSource(source);

  return {
    referenceId: source.reference.id,
    title: source.reference.title,
    evidenceSource: hasAbstract ? "abstract_metadata" : "metadata_only",
    llmStatus: "fallback",
    detectedLanguage,
    applicabilityToProject: hasAbstract ? "parcial" : "debil",
    usefulnessLabel: hasAbstract ? "weak_support" : "off_topic",
    whyRelevant: hasAbstract
      ? "La fuente conserva utilidad parcial porque el abstract permite ubicar su aporte tematico, aunque no hay contenido completo disponible."
      : "La fuente solo aporta metadata basica y no ofrece evidencia suficiente para sostener decisiones fuertes en la propuesta.",
    supportsSectionKeys: hasAbstract ? ["background", "justification"] : [],
    methodologyHints: hasAbstract ? ["Usar solo como antecedente o referencia contextual preliminar"] : [],
    frameworkHints: hasAbstract ? ["Aporta orientacion conceptual general desde abstract"] : [],
    decisionValue: hasAbstract
      ? "Sirve como apoyo debil para antecedentes mientras no exista contenido completo."
      : "Conviene mantenerla como referencia secundaria o descartarla si aparecen fuentes mas directas.",
    intakeCoverage: [source.reference.venue ?? "Cobertura general del tema"].slice(0, 1),
    methodSignals: hasAbstract ? ["Metodo no estructurado inferido desde abstract"] : [],
    contextSignals: [
      source.reference.year ? `Publicacion ${source.reference.year}` : "Contexto temporal no identificado",
    ],
    variableSignals: [],
    evidenceLimits: hasAbstract
      ? [
          "Sin contenido publico completo resuelto",
          "La interpretacion depende del abstract y metadata",
        ]
      : [
          "Sin contenido publico completo resuelto",
          "Sin abstract suficiente para extraer senales finas",
        ],
    qualityFlags: hasAbstract
      ? ["requiere_contenido_completo", "usar_con_cautela"]
      : ["metadata_only", "posible_fuera_de_foco"],
  };
}

function mapGeneratedCard(
  source: BlueprintLaunchSelectedSourceBundle["sources"][number],
  generatedCard: EvidenceCompletionCardSchema,
): BlueprintLaunchEvidenceCompletionCard {
  return {
    referenceId: source.reference.id,
    title: source.reference.title,
    evidenceSource: source.reference.abstract?.trim() ? "abstract_metadata" : "metadata_only",
    llmStatus: "llm",
    detectedLanguage: generatedCard.detected_language,
    applicabilityToProject: generatedCard.applicability_to_project,
    usefulnessLabel: generatedCard.usefulness_label,
    whyRelevant: generatedCard.why_relevant,
    supportsSectionKeys: generatedCard.supports_section_keys,
    methodologyHints: generatedCard.methodology_hints,
    frameworkHints: generatedCard.framework_hints,
    decisionValue: generatedCard.decision_value,
    intakeCoverage: generatedCard.intake_coverage,
    methodSignals: generatedCard.method_signals,
    contextSignals: generatedCard.context_signals,
    variableSignals: generatedCard.variable_signals,
    evidenceLimits: generatedCard.evidence_limits,
    qualityFlags: generatedCard.quality_flags,
  };
}

export async function completeBlueprintLaunchEvidence(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  bundle: BlueprintLaunchSelectedSourceBundle;
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult;
}): Promise<BlueprintLaunchEvidenceCompletionResult> {
  const completePublicContentCount = input.sourceAccessResolution.completePublicCount;
  const selectedCount = input.bundle.selectedCount;

  if (completePublicContentCount >= 2) {
    return {
      savedAt: new Date().toISOString(),
      decision: "SKIP",
      reason: "Hay al menos 2 fuentes con contenido publico completo resuelto; no hace falta completar evidencia en este paso.",
      selectedCount,
      completePublicContentCount,
      completedFromAbstractCount: 0,
      completedFromMetadataCount: 0,
      usableCount: 0,
      weakSupportCount: 0,
      offTopicCount: 0,
      methodologySupportCount: 0,
      frameworkSupportCount: 0,
      cards: [],
    };
  }

  const accessBySourceId = new Map(
    input.sourceAccessResolution.items.map((item) => [item.sourceId, item]),
  );
  const candidates = input.bundle.sources.filter((item) => {
    const access = accessBySourceId.get(item.reference.id);
    return !access?.hasCompletePublicContent;
  });

  if (candidates.length === 0) {
    return {
      savedAt: new Date().toISOString(),
      decision: "SKIP",
      reason: "No hay fuentes sin contenido publico completo por completar en este paso.",
      selectedCount,
      completePublicContentCount,
      completedFromAbstractCount: 0,
      completedFromMetadataCount: 0,
      usableCount: 0,
      weakSupportCount: 0,
      offTopicCount: 0,
      methodologySupportCount: 0,
      frameworkSupportCount: 0,
      cards: [],
    };
  }

  const fallbackCards = candidates.map(buildFallbackCard);

  try {
    const provider = getConfiguredLlmProvider();
    const generated = await generateStructuredObjectWithTextFallback<EvidenceCompletionPlan>({
      provider,
      prompt: buildPrompt(input),
      schemaName: "blueprint_launch_evidence_completion_v2",
      schema: evidenceCompletionSchema,
    });
    const cards = candidates.map((source) => {
      const generatedCard = generated.cards.find((item) => item.reference_id === source.reference.id);
      return generatedCard ? mapGeneratedCard(source, generatedCard) : buildFallbackCard(source);
    });
    const summary = summarizeCards(cards);

    return {
      savedAt: new Date().toISOString(),
      decision: "RUN",
      reason: "Hay menos de 2 fuentes con contenido publico completo resuelto; se completo evidencia orientada a secciones, metodologia y marco tecnico usando abstracts y metadata.",
      selectedCount,
      completePublicContentCount,
      completedFromAbstractCount: cards.filter((item) => item.evidenceSource === "abstract_metadata").length,
      completedFromMetadataCount: cards.filter((item) => item.evidenceSource === "metadata_only").length,
      ...summary,
      cards,
    };
  } catch {
    const summary = summarizeCards(fallbackCards);

    return {
      savedAt: new Date().toISOString(),
      decision: "RUN",
      reason: "Hay menos de 2 fuentes con contenido publico completo resuelto; se completo evidencia con fallback orientado a secciones usando abstracts y metadata.",
      selectedCount,
      completePublicContentCount,
      completedFromAbstractCount: fallbackCards.filter((item) => item.evidenceSource === "abstract_metadata").length,
      completedFromMetadataCount: fallbackCards.filter((item) => item.evidenceSource === "metadata_only").length,
      ...summary,
      cards: fallbackCards,
    };
  }
}
