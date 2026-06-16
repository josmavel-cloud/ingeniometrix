import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterTemplateRuntime,
  SectionGenerationPhase,
  SectionGenerationPlanItem,
  SectionPromptManifestItem,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";
import { buildSectionPrompt } from "@/server/blueprint-v2/prompts/section-prompt-builder";

const BODY_PHASE_KEYS = new Set([
  "theoretical_framework",
  "research_antecedents",
  "state_of_the_art",
  "theoretical_bases",
  "terms_definition",
  "variables_or_categories",
  "quantitative_variables",
  "qualitative_categories",
  "methodology",
  "methodological_approach",
  "research_design",
  "population_and_sample",
  "data_collection_techniques",
  "research_instruments",
  "research_procedure",
  "analysis_plan",
  "ethics",
  "scope_and_limitations",
  "schedule",
  "budget",
]);
const LOGIC_PHASE_KEYS = new Set([
  "problem_statement",
  "research_questions",
  "general_research_question",
  "specific_research_questions",
  "objectives",
  "general_objective",
  "specific_objectives",
  "hypotheses",
  "general_hypothesis",
  "specific_hypotheses",
  "justification",
  "theoretical_justification",
  "practical_justification",
  "methodological_justification",
]);
const FRAMING_PHASE_KEYS = new Set([
  "abstract",
  "keywords",
  "introduction",
  "annexes",
]);
const REFERENCE_PHASE_KEYS = new Set(["references"]);

function resolvePhase(sectionKey: string): SectionGenerationPhase {
  if (BODY_PHASE_KEYS.has(sectionKey)) {
    return "body";
  }

  if (LOGIC_PHASE_KEYS.has(sectionKey)) {
    return "logic";
  }

  if (REFERENCE_PHASE_KEYS.has(sectionKey)) {
    return "references";
  }

  if (sectionKey === "consistency_matrix") {
    return "matrix";
  }

  return "framing";
}

function resolveOrder(phase: SectionGenerationPhase, index: number) {
  const base =
    phase === "body" ? 100 : phase === "logic" ? 200 : phase === "framing" ? 300 : phase === "references" ? 350 : 400;
  return base + index;
}

function selectEvidenceSnippetIds(sectionKey: string, evidenceLedger: EvidenceLedger) {
  const relatedHints =
    sectionKey === "general_objective"
      ? ["problem_statement", "justification"]
      : sectionKey === "specific_objectives"
        ? ["problem_statement", "justification", "analysis_plan", "methodology"]
        : sectionKey === "general_research_question"
          ? ["problem_statement", "general_objective"]
          : sectionKey === "specific_research_questions" || sectionKey === "research_questions"
            ? ["specific_objectives", "analysis_plan", "methodology"]
            : sectionKey === "methodology"
              ? ["methodological_approach", "research_design", "analysis_plan"]
              : [];

  return evidenceLedger.snippets
    .filter(
      (snippet) =>
        snippet.section_hint_keys.includes(sectionKey) ||
        relatedHints.some((hint) => snippet.section_hint_keys.includes(hint)),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 8)
    .map((snippet) => snippet.snippet_id);
}

function buildDependencies(sectionKey: string) {
  switch (sectionKey) {
    case "problem_statement":
    case "research_questions":
    case "general_objective":
    case "specific_objectives":
    case "justification":
      return ["theoretical_framework", "methodology"];
    case "abstract":
    case "introduction":
    case "references":
      return ["problem_statement", "general_objective", "methodology"];
    case "consistency_matrix":
      return [
        "problem_statement",
        "research_questions",
        "general_objective",
        "specific_objectives",
        "methodology",
      ];
    default:
      return [];
  }
}

export function planMasterTemplateSectionPrompts(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
}): SectionPromptPlan {
  const generationPlan = input.masterTemplate.sections.map((section, index) => {
    const phase = resolvePhase(section.semantic_key);

    return {
      section_key: section.semantic_key,
      title: section.title,
      phase,
      order: resolveOrder(phase, index),
      depends_on_keys: buildDependencies(section.semantic_key),
      instructions: section.instructions,
      purpose: section.purpose,
      content_kind: section.content_kind,
      required: section.required,
      min_words: section.min_words,
      max_words: section.max_words,
    } satisfies SectionGenerationPlanItem;
  });

  const promptManifest = generationPlan
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const evidenceSnippetIds = selectEvidenceSnippetIds(section.section_key, input.evidenceLedger);
      const supportingSourceIds = Array.from(
        new Set(
          evidenceSnippetIds
            .map((snippetId) =>
              input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
            )
            .flatMap((snippet) => (snippet?.source_id ? [snippet.source_id] : [])),
        ),
      );
      const supportingPdfSourceIds = supportingSourceIds.filter((sourceId) =>
        input.evidenceLedger.evidence_packs.some(
          (pack) =>
            pack.source_id === sourceId &&
            pack.snippets.some((snippet) => snippet.origin === "pdf"),
        ),
      );
      const supportingWebSourceIds = supportingSourceIds.filter((sourceId) =>
        input.evidenceLedger.source_registry.some(
          (source) => source.source_id === sourceId && source.origin === "websearch_source",
        ),
      );
      const supportingAssumptionIds = input.evidenceLedger.assumptions
        .filter((assumption) => assumption.section_keys.includes(section.section_key))
        .map((assumption) => assumption.assumption_id);
      const manifestItem = {
        section_key: section.section_key,
        title: section.title,
        phase: section.phase,
        evidence_snippet_ids: evidenceSnippetIds,
        supporting_source_ids: supportingSourceIds,
        supporting_pdf_source_ids: supportingPdfSourceIds,
        supporting_web_source_ids: supportingWebSourceIds,
        supporting_assumption_ids: supportingAssumptionIds,
      } satisfies Omit<SectionPromptManifestItem, "prompt">;

      return {
        ...manifestItem,
        prompt: buildSectionPrompt({
          project: input.project,
          section,
          templateSection: input.masterTemplate.sections.find(
            (templateSection) => templateSection.semantic_key === section.section_key,
          ),
          evidenceLedger: input.evidenceLedger,
          priorSections: [],
          manifestItem,
        }),
      } satisfies SectionPromptManifestItem;
    });

  return {
    generation_plan: generationPlan,
    prompt_manifest: promptManifest,
  };
}
