import type { Intake, Project, Reference } from "@prisma/client";

import { extractSearchTerms, normalizeTitle } from "@/lib/text";

import type {
  BlueprintAssumptionDetail,
  BlueprintCitationPlanSection,
  BlueprintReferenceInsight,
  BlueprintTemplateContext,
  ResearchBlueprintCore,
  ResearchBlueprintRecord,
} from "./blueprint-types";

type SelectedProjectReference = {
  selectedOrder: number | null;
  reference: Reference;
};

type CitationPlanInput = {
  blueprint: ResearchBlueprintCore;
  intake: Intake;
  referenceInsights: BlueprintReferenceInsight[];
};

type SectionDefinition = {
  key: string;
  title: string;
  templateSemanticKeys: string[];
  buildText: (blueprint: ResearchBlueprintCore) => string;
  intakeText: (intake: Intake) => string;
  focus: "problem" | "justification" | "objectives" | "questions" | "methodology" | "analysis";
};

const MAX_SUPPORTING_REFERENCES = 3;

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    key: "problem_statement",
    title: "Problema de investigacion",
    templateSemanticKeys: ["research_problem", "problem_statement"],
    buildText: (blueprint) => blueprint.problem_statement,
    intakeText: (intake) => intake.problemContext ?? "",
    focus: "problem",
  },
  {
    key: "problem_delimitation",
    title: "Delimitacion del problema",
    templateSemanticKeys: ["research_problem", "problem_statement"],
    buildText: (blueprint) => blueprint.problem_delimitation,
    intakeText: (intake) => [intake.problemContext, intake.academicConstraints].filter(Boolean).join(" "),
    focus: "problem",
  },
  {
    key: "justification",
    title: "Justificacion",
    templateSemanticKeys: ["justification"],
    buildText: (blueprint) => blueprint.justification,
    intakeText: (intake) => [intake.problemContext, intake.advisorNotes].filter(Boolean).join(" "),
    focus: "justification",
  },
  {
    key: "general_objective",
    title: "Objetivo general",
    templateSemanticKeys: ["general_objective", "objectives"],
    buildText: (blueprint) => blueprint.general_objective,
    intakeText: (intake) => [intake.topic, intake.researchLine].filter(Boolean).join(" "),
    focus: "objectives",
  },
  {
    key: "specific_objectives",
    title: "Objetivos especificos",
    templateSemanticKeys: ["specific_objectives", "objectives"],
    buildText: (blueprint) => blueprint.specific_objectives.join(" "),
    intakeText: (intake) => [intake.topic, intake.advisorNotes].filter(Boolean).join(" "),
    focus: "objectives",
  },
  {
    key: "research_questions",
    title: "Preguntas de investigacion",
    templateSemanticKeys: [
      "research_questions",
      "main_research_question",
      "specific_research_questions",
    ],
    buildText: (blueprint) => blueprint.research_questions.join(" "),
    intakeText: (intake) => [intake.problemContext, intake.topic].filter(Boolean).join(" "),
    focus: "questions",
  },
  {
    key: "proposed_methodology",
    title: "Metodologia propuesta",
    templateSemanticKeys: ["methodology"],
    buildText: (blueprint) => blueprint.proposed_methodology,
    intakeText: (intake) => [intake.preferredMethodology, intake.availableData].filter(Boolean).join(" "),
    focus: "methodology",
  },
  {
    key: "population_and_sample",
    title: "Poblacion y muestra",
    templateSemanticKeys: ["methodology"],
    buildText: (blueprint) => blueprint.population_and_sample,
    intakeText: (intake) => intake.targetPopulation ?? "",
    focus: "methodology",
  },
  {
    key: "data_collection_techniques",
    title: "Tecnicas de recoleccion",
    templateSemanticKeys: ["methodology"],
    buildText: (blueprint) => blueprint.data_collection_techniques.join(" "),
    intakeText: (intake) => [intake.availableData, intake.preferredMethodology].filter(Boolean).join(" "),
    focus: "methodology",
  },
  {
    key: "analysis_plan",
    title: "Plan de analisis",
    templateSemanticKeys: ["methodology"],
    buildText: (blueprint) => blueprint.analysis_plan,
    intakeText: (intake) => [intake.preferredMethodology, intake.availableData].filter(Boolean).join(" "),
    focus: "analysis",
  },
  {
    key: "consistency_matrix",
    title: "Matriz de consistencia",
    templateSemanticKeys: ["consistency_matrix"],
    buildText: (blueprint) =>
      blueprint.consistency_matrix
        .map((item) => `${item.objective} ${item.question} ${item.method} ${item.technique}`)
        .join(" "),
    intakeText: (intake) =>
      [intake.topic, intake.problemContext, intake.preferredMethodology].filter(Boolean).join(" "),
    focus: "analysis",
  },
];

function normalizeSentenceWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(value: string | null | undefined) {
  return normalizeSentenceWhitespace(value ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);
}

function limitWords(value: string | null | undefined, maxWords = 24) {
  if (!value) {
    return null;
  }

  const words = normalizeSentenceWhitespace(value).split(" ");
  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function findSentenceByPatterns(
  value: string | null | undefined,
  patterns: RegExp[],
  fallbackIndex = 0,
) {
  const sentences = splitSentences(value);
  const matched = sentences.find((sentence) => patterns.some((pattern) => pattern.test(sentence)));
  return limitWords(matched ?? sentences[fallbackIndex] ?? null);
}

function buildEvidenceStrength(reference: Reference) {
  if (reference.abstract?.trim() && reference.doi?.trim()) {
    return "high" as const;
  }

  if (
    reference.abstract?.trim() ||
    (reference.doi?.trim() && reference.year !== null && reference.year !== undefined)
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

function countTermOverlap(left: string[], right: string[]) {
  const leftSet = new Set(left);
  return right.filter((term) => leftSet.has(term)).length;
}

export async function loadBlueprintTemplateContext(project: Project) {
  return {
    template_key: project.templateKey,
    template_name: project.templateKey,
    selected_by_user: true,
    source: "project_selection",
    template_family: null,
    university: project.university,
    program: project.program,
    degree_level: project.degreeLevel,
    required_section_keys: [],
    available_semantic_keys: [],
    guidance_notes: [
      "No se cargo una plantilla runtime publicada; se usara la templateKey del proyecto como restriccion base del MVP.",
    ],
  } satisfies BlueprintTemplateContext;
}

export function buildReferenceInsights(
  selectedReferences: SelectedProjectReference[],
): BlueprintReferenceInsight[] {
  return selectedReferences.map((item) => {
    const reference = item.reference;
    const abstract = reference.abstract ?? "";

    return {
      reference_id: reference.id,
      title: reference.title,
      doi: reference.doi ?? null,
      year: reference.year ?? null,
      venue: reference.venue ?? null,
      abstract_available: abstract.trim().length > 0,
      evidence_strength: buildEvidenceStrength(reference),
      topic_focus: [
        ...extractSearchTerms(reference.title, { maxTerms: 5, minLength: 4 }),
        ...extractSearchTerms(abstract, { maxTerms: 5, minLength: 4 }),
      ].slice(0, 6),
      problem_signal: findSentenceByPatterns(abstract, [
        /problem|challenge|gap|need|issue|barrier|brecha|problema|desafio|necesidad/i,
      ]),
      method_signal: findSentenceByPatterns(abstract, [
        /method|methodology|approach|design|survey|interview|sample|case study|mixed|qualitative|quantitative|metodolog|diseno|encuesta|entrevista|muestra/i,
      ]),
      population_or_context_signal: findSentenceByPatterns(
        abstract,
        [
          /students|teachers|patients|users|firms|companies|universit|hospital|school|pymes|empresas|docentes|pacientes|usuarios|lima|peru/i,
        ],
        1,
      ),
      main_finding_signal: findSentenceByPatterns(abstract, [
        /result|finding|found|show|demonstrate|suggest|indicate|conclude|results|hallazgo|resultado|conclusion|demuestra|sugiere|indica/i,
      ]),
      limitation_signal: findSentenceByPatterns(abstract, [
        /limitation|limited|constraint|scope|restrict|limita|limitacion|restriccion|alcance/i,
      ]),
      future_line_signal: findSentenceByPatterns(abstract, [
        /future research|future work|further research|recommend|recommended|linea futura|futuras investigaciones|trabajo futuro|recomienda/i,
      ]),
    };
  });
}

function buildReferenceSupportScore(
  section: SectionDefinition,
  sectionText: string,
  insight: BlueprintReferenceInsight,
) {
  const sectionTerms = extractSearchTerms(sectionText, {
    maxTerms: 12,
    minLength: 4,
  });
  const topicOverlap = countTermOverlap(insight.topic_focus, sectionTerms);
  const problemOverlap = countTermOverlap(
    extractSearchTerms(insight.problem_signal, { maxTerms: 6, minLength: 4 }),
    sectionTerms,
  );
  const methodOverlap = countTermOverlap(
    extractSearchTerms(insight.method_signal, { maxTerms: 6, minLength: 4 }),
    sectionTerms,
  );
  const populationOverlap = countTermOverlap(
    extractSearchTerms(insight.population_or_context_signal, {
      maxTerms: 6,
      minLength: 4,
    }),
    sectionTerms,
  );
  const findingOverlap = countTermOverlap(
    extractSearchTerms(insight.main_finding_signal, { maxTerms: 6, minLength: 4 }),
    sectionTerms,
  );
  const futureOverlap = countTermOverlap(
    extractSearchTerms(insight.future_line_signal, { maxTerms: 6, minLength: 4 }),
    sectionTerms,
  );

  if (section.focus === "methodology" || section.focus === "analysis") {
    return topicOverlap + methodOverlap * 3 + populationOverlap * 2 + findingOverlap;
  }

  if (section.focus === "objectives" || section.focus === "questions") {
    return topicOverlap * 2 + problemOverlap * 2 + futureOverlap + findingOverlap;
  }

  if (section.focus === "justification") {
    return topicOverlap * 2 + problemOverlap * 2 + findingOverlap * 2 + futureOverlap;
  }

  return topicOverlap * 2 + problemOverlap * 3 + findingOverlap;
}

function resolveSupportLevel(input: {
  supportingReferenceIds: string[];
  topScore: number;
  hasIntakeSupport: boolean;
}) {
  if (input.supportingReferenceIds.length > 0 && input.topScore >= 5) {
    return "direct" as const;
  }

  if (input.supportingReferenceIds.length > 0 && input.topScore >= 2) {
    return "partial" as const;
  }

  if (input.hasIntakeSupport) {
    return "intake_only" as const;
  }

  return "assumption" as const;
}

function buildEvidenceSource(input: {
  supportLevel: BlueprintCitationPlanSection["support_level"];
  supportingReferenceIds: string[];
  hasIntakeSupport: boolean;
}) {
  if (input.supportingReferenceIds.length > 0 && input.hasIntakeSupport) {
    return "mixed" as const;
  }

  if (input.supportingReferenceIds.length > 0) {
    return "references" as const;
  }

  if (input.hasIntakeSupport && input.supportLevel === "intake_only") {
    return "intake" as const;
  }

  return "assumptions" as const;
}

export function buildCitationPlan(input: CitationPlanInput): BlueprintCitationPlanSection[] {
  return SECTION_DEFINITIONS.map((section) => {
    const sectionText = normalizeSentenceWhitespace(section.buildText(input.blueprint));
    const intakeText = normalizeSentenceWhitespace(section.intakeText(input.intake));
    const scoredInsights = input.referenceInsights
      .map((insight) => ({
        referenceId: insight.reference_id,
        score: buildReferenceSupportScore(section, sectionText, insight),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    const supportingReferenceIds = scoredInsights
      .slice(0, MAX_SUPPORTING_REFERENCES)
      .map((item) => item.referenceId);
    const topScore = scoredInsights[0]?.score ?? 0;
    const hasIntakeSupport =
      countTermOverlap(
        extractSearchTerms(sectionText, { maxTerms: 10, minLength: 4 }),
        extractSearchTerms(intakeText, { maxTerms: 10, minLength: 4 }),
      ) > 0;
    const supportLevel = resolveSupportLevel({
      supportingReferenceIds,
      topScore,
      hasIntakeSupport,
    });
    const notes: string[] = [];

    if (supportingReferenceIds.length > 0) {
      notes.push(
        `La seccion conserva soporte bibliografico en ${supportingReferenceIds.length} referencia(s) seleccionada(s).`,
      );
    }

    if (supportLevel === "intake_only") {
      notes.push("La seccion depende principalmente del intake estructurado del usuario.");
    } else if (supportLevel === "assumption") {
      notes.push("La seccion requiere assumptions explicitas o revision manual por falta de soporte suficiente.");
    }

    return {
      section_key: section.key,
      section_title: section.title,
      support_level: supportLevel,
      evidence_source: buildEvidenceSource({
        supportLevel,
        supportingReferenceIds,
        hasIntakeSupport,
      }),
      supported_reference_ids: supportingReferenceIds,
      notes,
      template_semantic_keys: section.templateSemanticKeys,
    };
  });
}

function buildAssumptionReason(statement: string) {
  const normalized = normalizeTitle(statement);

  if (normalized.includes("metodolog")) {
    return "Falto precision suficiente para fijar la metodologia con mayor certeza.";
  }

  if (normalized.includes("poblacion") || normalized.includes("muestra")) {
    return "La delimitacion de poblacion o muestra sigue incompleta en el intake o en la evidencia.";
  }

  if (normalized.includes("linea")) {
    return "La linea de investigacion no pudo precisarse completamente con los insumos actuales.";
  }

  return "Se declaro de forma explicita para no inventar contenido no respaldado.";
}

export function buildAssumptionDetails(input: {
  assumptions: string[];
  citationPlan: BlueprintCitationPlanSection[];
}) {
  const fallbackAffectedSections = input.citationPlan
    .filter((item) => item.support_level === "assumption" || item.support_level === "intake_only")
    .map((item) => item.section_key);

  return input.assumptions.map((statement, index) => {
    const statementTerms = extractSearchTerms(statement, {
      maxTerms: 8,
      minLength: 4,
    });
    const matchedSections = input.citationPlan
      .filter((section) => {
        const sectionTerms = extractSearchTerms(section.section_title, {
          maxTerms: 6,
          minLength: 4,
        });
        return countTermOverlap(statementTerms, sectionTerms) > 0;
      })
      .map((section) => section.section_key);

    return {
      assumption_id: `assumption_${index + 1}`,
      statement,
      reason: buildAssumptionReason(statement),
      affected_sections:
        matchedSections.length > 0 ? matchedSections : fallbackAffectedSections.slice(0, 4),
    } satisfies BlueprintAssumptionDetail;
  });
}

export function buildBlueprintEngineWarnings(input: {
  templateContext: BlueprintTemplateContext;
  referenceInsights: BlueprintReferenceInsight[];
  citationPlan: BlueprintCitationPlanSection[];
}) {
  const warnings = [...input.templateContext.guidance_notes];
  const referencesWithoutAbstract = input.referenceInsights.filter(
    (insight) => !insight.abstract_available,
  ).length;
  const weakSections = input.citationPlan.filter(
    (section) => section.support_level === "intake_only" || section.support_level === "assumption",
  );

  if (referencesWithoutAbstract > 0) {
    warnings.push(
      `${referencesWithoutAbstract} referencia(s) seleccionada(s) no tienen abstract; los insights derivados pueden ser mas limitados.`,
    );
  }

  if (weakSections.length > 0) {
    warnings.push(
      `${weakSections.length} seccion(es) del blueprint quedaron con soporte debil y requieren revision manual o mejores fuentes.`,
    );
  }

  return warnings;
}

export function buildEnrichedBlueprintRecord(input: {
  blueprint: ResearchBlueprintCore;
  templateContext: BlueprintTemplateContext;
  referenceInsights: BlueprintReferenceInsight[];
  citationPlan: BlueprintCitationPlanSection[];
}) {
  const assumptionsDetailed = buildAssumptionDetails({
    assumptions: input.blueprint.assumptions,
    citationPlan: input.citationPlan,
  });
  const engineWarnings = buildBlueprintEngineWarnings({
    templateContext: input.templateContext,
    referenceInsights: input.referenceInsights,
    citationPlan: input.citationPlan,
  });

  return {
    ...input.blueprint,
    reference_insights: input.referenceInsights,
    citation_plan: input.citationPlan,
    template_context: input.templateContext,
    assumptions_detailed: assumptionsDetailed,
    engine_warnings: engineWarnings,
  } satisfies ResearchBlueprintRecord;
}
