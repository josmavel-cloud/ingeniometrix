import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchEvidenceCompletionResult,
  BlueprintLaunchSavedIntakeSnapshot,
  BlueprintLaunchSelectedSourceBundle,
  EvidencePackArtifact,
  EvidenceSnippet,
  ExtractedEvidencePack,
} from "./local-playground-store";

type PackSignalSchema = {
  source_id: string;
  problem_signal: string | null;
  method_signal: string | null;
  context_signal: string | null;
  finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
  abstract_summary: string | null;
};

type PackSignalPlan = {
  packs: PackSignalSchema[];
};

const packSignalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["packs"],
  properties: {
    packs: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_id",
          "problem_signal",
          "method_signal",
          "context_signal",
          "finding_signal",
          "limitation_signal",
          "future_line_signal",
          "abstract_summary",
        ],
        properties: {
          source_id: { type: "string", minLength: 2, maxLength: 220 },
          problem_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          method_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          context_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          finding_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          limitation_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          future_line_signal: { anyOf: [{ type: "string", minLength: 8, maxLength: 220 }, { type: "null" }] },
          abstract_summary: { anyOf: [{ type: "string", minLength: 8, maxLength: 420 }, { type: "null" }] },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

function buildPrompt(input: {
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  bundle: BlueprintLaunchSelectedSourceBundle;
  evidenceCompletion: BlueprintLaunchEvidenceCompletionResult | null;
}) {
  const cardsBySourceId = new Map(
    (input.evidenceCompletion?.cards ?? []).map((card) => [card.referenceId, card]),
  );
  const sources = input.bundle.sources.map((item) => ({
    source_id: item.reference.id,
    title: item.reference.title,
    doi: item.reference.doi,
    year: item.reference.year,
    venue: item.reference.venue,
    abstract: item.reference.abstract,
    pdf_accessible: item.reference.pdfAccessible,
    relevance_score: item.relevanceScore,
    score_label: item.scoreLabel,
    evidence_completion: cardsBySourceId.get(item.reference.id) ?? null,
  }));

  return `
Eres un analista academico que extrae evidencia estructurada por fuente para un blueprint trazable.

Objetivo:
- trabajar por source_id
- usar solo intake, abstract, metadata y evidence completion disponible
- no inventar resultados ni detalles no visibles
- responder en espanol
- si una senal no se puede sostener, devolver null

Devuelve solo estas senales por fuente:
- problem_signal
- method_signal
- context_signal
- finding_signal
- limitation_signal
- future_line_signal
- abstract_summary

Intake:
- tema: ${input.savedIntake.intake.topic}
- contexto: ${input.savedIntake.intake.problemContext}
- linea: ${input.savedIntake.intake.researchLine}
- poblacion: ${input.savedIntake.intake.targetPopulation}
- metodologia: ${input.savedIntake.intake.preferredMethodology}
- notas del asesor: ${input.savedIntake.intake.advisorNotes}

Fuentes:
${JSON.stringify(sources, null, 2)}
`.trim();
}

function truncateText(value: string | null | undefined, maxLength = 320) {
  const text = value?.trim() ?? "";

  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildSnippet(
  input: Omit<EvidenceSnippet, "snippet_id"> & { suffix: string },
): EvidenceSnippet {
  return {
    snippet_id: `${input.source_id ?? "global"}-${input.suffix}`,
    source_id: input.source_id,
    origin: input.origin,
    label: input.label,
    text: input.text,
    section_hint_keys: input.section_hint_keys,
    confidence: input.confidence,
  };
}

function buildBaseSnippets(input: {
  sourceId: string;
  title: string;
  abstract: string | null;
  intakeTopic: string;
  evidenceCompletionCard: BlueprintLaunchEvidenceCompletionResult["cards"][number] | null;
}): EvidenceSnippet[] {
  const snippets: EvidenceSnippet[] = [
    buildSnippet({
      suffix: "title",
      source_id: input.sourceId,
      origin: "source",
      label: "Titulo de la fuente",
      text: input.title,
      section_hint_keys: ["context", "problem"],
      confidence: 0.9,
    }),
    buildSnippet({
      suffix: "intake-topic",
      source_id: input.sourceId,
      origin: "intake",
      label: "Tema del intake",
      text: input.intakeTopic,
      section_hint_keys: ["problem", "context"],
      confidence: 0.95,
    }),
  ];

  const abstractSnippet = truncateText(input.abstract, 360);

  if (abstractSnippet) {
    snippets.push(
      buildSnippet({
        suffix: "abstract",
        source_id: input.sourceId,
        origin: "source",
        label: "Resumen visible",
        text: abstractSnippet,
        section_hint_keys: ["problem", "method", "finding", "limitations"],
        confidence: 0.82,
      }),
    );
  }

  if (input.evidenceCompletionCard?.whyRelevant) {
    snippets.push(
      buildSnippet({
        suffix: "completion",
        source_id: input.sourceId,
        origin: "source",
        label: "Razon de relevancia",
        text: truncateText(input.evidenceCompletionCard.whyRelevant, 260) ?? input.evidenceCompletionCard.whyRelevant,
        section_hint_keys: ["problem", "context", "future_work"],
        confidence: input.evidenceCompletionCard.llmStatus === "llm" ? 0.74 : 0.58,
      }),
    );
  }

  return snippets;
}

function buildFallbackSignals(input: {
  sourceId: string;
  title: string;
  abstract: string | null;
  evidenceCompletionCard: BlueprintLaunchEvidenceCompletionResult["cards"][number] | null;
}): PackSignalSchema {
  return {
    source_id: input.sourceId,
    problem_signal: input.evidenceCompletionCard?.whyRelevant ?? truncateText(input.title, 180),
    method_signal:
      input.evidenceCompletionCard?.methodSignals.join(", ") || null,
    context_signal:
      input.evidenceCompletionCard?.contextSignals.join(", ") || null,
    finding_signal: truncateText(input.abstract, 220),
    limitation_signal:
      input.evidenceCompletionCard?.evidenceLimits.join(", ") || null,
    future_line_signal:
      input.evidenceCompletionCard?.intakeCoverage.join(", ") || null,
    abstract_summary: truncateText(input.abstract, 320),
  };
}

export async function buildBlueprintLaunchEvidencePacksArtifact(input: {
  projectTitle: string;
  savedIntake: BlueprintLaunchSavedIntakeSnapshot;
  bundle: BlueprintLaunchSelectedSourceBundle;
  evidenceCompletion: BlueprintLaunchEvidenceCompletionResult | null;
}): Promise<EvidencePackArtifact> {
  const completionCardsBySourceId = new Map(
    (input.evidenceCompletion?.cards ?? []).map((card) => [card.referenceId, card]),
  );
  const warnings: string[] = [];
  const fallbackSignals = input.bundle.sources.map((source) =>
    buildFallbackSignals({
      sourceId: source.reference.id,
      title: source.reference.title,
      abstract: source.reference.abstract,
      evidenceCompletionCard: completionCardsBySourceId.get(source.reference.id) ?? null,
    }),
  );

  let signalPacks = fallbackSignals;
  let extractionMode: EvidencePackArtifact["extraction_mode"] = "rule_based";

  try {
    const provider = getConfiguredLlmProvider();
    const generated = await generateStructuredObjectWithTextFallback<PackSignalPlan>({
      provider,
      prompt: buildPrompt(input),
      schemaName: "blueprint_launch_evidence_packs",
      schema: packSignalSchema,
    });
    signalPacks = input.bundle.sources.map((source) => {
      const generatedPack = generated.packs.find((item) => item.source_id === source.reference.id);

      return generatedPack
        ? generatedPack
        : buildFallbackSignals({
            sourceId: source.reference.id,
            title: source.reference.title,
            abstract: source.reference.abstract,
            evidenceCompletionCard: completionCardsBySourceId.get(source.reference.id) ?? null,
          });
    });
    extractionMode = "hybrid";
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Fallo la extraccion LLM estructurada; se uso fallback rule_based: ${error.message}`
        : "Fallo la extraccion LLM estructurada; se uso fallback rule_based.",
    );
  }

  const packs: ExtractedEvidencePack[] = input.bundle.sources.map((source) => {
    const signalPack =
      signalPacks.find((item) => item.source_id === source.reference.id) ??
      buildFallbackSignals({
        sourceId: source.reference.id,
        title: source.reference.title,
        abstract: source.reference.abstract,
        evidenceCompletionCard: completionCardsBySourceId.get(source.reference.id) ?? null,
      });
    const completionCard = completionCardsBySourceId.get(source.reference.id) ?? null;
    const snippets = buildBaseSnippets({
      sourceId: source.reference.id,
      title: source.reference.title,
      abstract: source.reference.abstract,
      intakeTopic: input.savedIntake.intake.topic,
      evidenceCompletionCard: completionCard,
    });

    if (!source.reference.pdfAccessible) {
      warnings.push(`No hay PDF descargado para ${source.reference.id}; pdf_summary y pdf_sections quedan null.`);
    }

    if (!source.reference.abstract?.trim()) {
      warnings.push(`La fuente ${source.reference.id} no tiene abstract visible; la extraccion se apoya solo en metadata.`);
    }

    return {
      source_id: source.reference.id,
      problem_signal: signalPack.problem_signal,
      method_signal: signalPack.method_signal,
      context_signal: signalPack.context_signal,
      finding_signal: signalPack.finding_signal,
      limitation_signal: signalPack.limitation_signal,
      future_line_signal: signalPack.future_line_signal,
      abstract_summary: signalPack.abstract_summary,
      pdf_summary: null,
      pdf_sections: {
        abstract: null,
        methodology: null,
        results: null,
        conclusions: null,
        limitations: null,
        future_work: null,
      },
      snippets,
      assets: [],
    } satisfies ExtractedEvidencePack;
  });

  return {
    artifact_type: "evidence_packs",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    extraction_mode: extractionMode,
    project_context: {
      project_title: input.projectTitle,
      intake_topic: input.savedIntake.intake.topic,
    },
    packs,
    warnings: Array.from(new Set(warnings)),
  };
}
