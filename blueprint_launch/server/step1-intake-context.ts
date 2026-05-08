import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import type { IntakeInput } from "@/server/projects/project-validation";

import type { BlueprintLaunchProjectData } from "../fixtures/synthetic-intake";

export type BlueprintLaunchProjectSnapshot = {
  savedAt: string;
  projectTitle: string;
  degreeLevel: string;
  university: string;
  program: string;
  knowledgeAreaLabel: string;
  templateKey: string;
  country: string;
  language: string;
  status: string;
  mode: string;
};

export type BlueprintLaunchIntakeImprovementResult = {
  improvedAt: string;
  llmStatus: "llm" | "fallback";
  llmPrompts: Array<{
    label: string;
    schemaName: string;
    model: string;
    trackingLabel: string;
    promptTemplate: string;
    promptText: string;
  }>;
  detectedMixedLanguageFields: string[];
  preservedTerms: string[];
  changeNotes: string[];
  canonicalTopicEs: string;
  problemCoreEs: string;
  methodPreferenceEs: string | null;
  targetScopeEs: string | null;
  retrievalBriefEn: string;
  intakeImprovedEs: IntakeInput;
};

export type BlueprintLaunchProjectGlobalContext = {
  generatedAt: string;
  project: BlueprintLaunchProjectSnapshot;
  intakeOriginal: IntakeInput;
  intakeImprovedEs: IntakeInput;
  canonicalTopicEs: string;
  problemCoreEs: string;
  methodPreferenceEs: string | null;
  targetScopeEs: string | null;
  retrievalBriefEn: string;
  productRules: {
    language: "es";
    traceabilityRequired: true;
    noInventedCitations: true;
    noInventedData: true;
  };
};

type IntakeImprovementPlan = {
  detected_mixed_language_fields: string[];
  preserved_terms: string[];
  change_notes: string[];
  canonical_topic_es: string;
  problem_core_es: string;
  method_preference_es: string | null;
  target_scope_es: string | null;
  intake_improved_es: {
    topic: string;
    problemContext: string;
    researchLine: string;
    academicConstraints: string;
    targetPopulation: string;
    availableData: string;
    preferredMethodology: string;
    advisorNotes: string;
  };
};

const intakeImprovementSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detected_mixed_language_fields",
    "preserved_terms",
    "change_notes",
    "canonical_topic_es",
    "problem_core_es",
    "method_preference_es",
    "target_scope_es",
    "intake_improved_es",
  ],
  properties: {
    detected_mixed_language_fields: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 2, maxLength: 64 },
    },
    preserved_terms: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 2, maxLength: 120 },
    },
    change_notes: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 6, maxLength: 220 },
    },
    canonical_topic_es: { type: "string", minLength: 12, maxLength: 220 },
    problem_core_es: { type: "string", minLength: 12, maxLength: 260 },
    method_preference_es: {
      anyOf: [{ type: "string", minLength: 6, maxLength: 220 }, { type: "null" }],
    },
    target_scope_es: {
      anyOf: [{ type: "string", minLength: 6, maxLength: 220 }, { type: "null" }],
    },
    intake_improved_es: {
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
      ],
      properties: {
        topic: { type: "string", minLength: 1, maxLength: 1200 },
        problemContext: { type: "string", minLength: 1, maxLength: 3000 },
        researchLine: { type: "string", minLength: 1, maxLength: 800 },
        academicConstraints: { type: "string", minLength: 1, maxLength: 2000 },
        targetPopulation: { type: "string", minLength: 1, maxLength: 1600 },
        availableData: { type: "string", minLength: 1, maxLength: 2000 },
        preferredMethodology: { type: "string", minLength: 1, maxLength: 2000 },
        advisorNotes: { type: "string", minLength: 1, maxLength: 2000 },
      },
    },
  },
} satisfies Record<string, unknown>;

type RetrievalBriefPlan = {
  retrieval_brief_en: string;
};

const retrievalBriefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["retrieval_brief_en"],
  properties: {
    retrieval_brief_en: { type: "string", minLength: 24, maxLength: 360 },
  },
} satisfies Record<string, unknown>;

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function preserveFallbackIntake(intake: IntakeInput): IntakeInput {
  return {
    topic: normalizeWhitespace(intake.topic),
    problemContext: normalizeWhitespace(intake.problemContext),
    researchLine: normalizeWhitespace(intake.researchLine),
    academicConstraints: normalizeWhitespace(intake.academicConstraints),
    targetPopulation: normalizeWhitespace(intake.targetPopulation),
    availableData: normalizeWhitespace(intake.availableData),
    preferredMethodology: normalizeWhitespace(intake.preferredMethodology),
    advisorNotes: normalizeWhitespace(intake.advisorNotes),
  };
}

function deriveFallbackCanonicalTopic(intake: IntakeInput) {
  return normalizeWhitespace(intake.topic);
}

function deriveFallbackProblemCore(intake: IntakeInput) {
  return normalizeWhitespace(intake.problemContext).slice(0, 240);
}

function deriveFallbackMethodPreference(intake: IntakeInput) {
  const value = normalizeWhitespace(intake.preferredMethodology);
  return value.length > 0 ? value : null;
}

function deriveFallbackTargetScope(intake: IntakeInput) {
  const value = normalizeWhitespace(intake.targetPopulation);
  return value.length > 0 ? value : null;
}

function deriveFallbackRetrievalBriefEn(intake: IntakeInput) {
  const parts = [
    intake.topic ? `Applied academic research topic: ${intake.topic}.` : null,
    intake.problemContext ? `Problem context: ${intake.problemContext}.` : null,
    intake.researchLine ? `Research line: ${intake.researchLine}.` : null,
    intake.targetPopulation ? `Scope or study units: ${intake.targetPopulation}.` : null,
    intake.preferredMethodology ? `Preferred or tentative methodology: ${intake.preferredMethodology}.` : null,
    intake.availableData ? `Available data or expected evidence: ${intake.availableData}.` : null,
  ].filter((item): item is string => Boolean(item));

  return normalizeWhitespace(parts.join(" ")).slice(0, 320);
}

function renderPromptTemplate(
  template: string,
  replacements: Record<string, string>,
) {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export function buildBlueprintLaunchStep1PromptTemplate() {
  return `
Actua como editor academico y normalizador de intake para investigacion aplicada de nivel {{degree_level_lower}} en el area de {{knowledge_area}}. Debes mejorar un intake de investigacion en espanol sin cambiar su significado.

Reglas:
- responde en espanol
- corrige redaccion, ortografia y cohesiona los campos
- traduce al espanol cualquier fragmento en ingles, salvo acronimos, nombres propios y terminos tecnicos realmente consolidados en {{knowledge_area}}
- por defecto prefiere la formulacion en espanol aunque exista jerga en ingles
- si conservas un termino tecnico no traducido, debe ser porque mejora la claridad disciplinar y sigue siendo comun en el area
- no preserves automaticamente palabras como distressed; traduce ese tipo de expresiones a equivalentes naturales en espanol segun el contexto
- no inventes datos, fuentes, resultados ni alcances nuevos
- conserva el enfoque, el problema, la poblacion y la metodologia preferida
- preserva acronimos y expresiones tecnicas consolidadas solo si realmente ayudan a la precision en el area del intake actual
- usa todos los campos del intake y el contexto disciplinar minimo
- prioriza una formulacion clara, viable y adecuada para tesis o trabajo academico de posgrado

Contexto minimo:
- nivel academico: {{degree_level}}
- area disciplinar: {{knowledge_area}}
- idioma de salida principal: {{output_language}}

Intake original:
- topic: {{topic}}
- problemContext: {{problem_context}}
- researchLine: {{research_line}}
- academicConstraints: {{academic_constraints}}
- targetPopulation: {{target_population}}
- availableData: {{available_data}}
- preferredMethodology: {{preferred_methodology}}
- advisorNotes: {{advisor_notes}}

Ademas:
- canonical_topic_es: una formulacion corta, clara y academica del tema
- problem_core_es: una formulacion corta del nucleo del problema
- method_preference_es: una formulacion breve de la preferencia metodologica, o null si no hay
- target_scope_es: una formulacion breve del alcance/poblacion, o null si no hay
- intake_improved_es: version mejorada y consistente del intake completo en espanol
`.trim();
}

export function buildBlueprintLaunchStep1Prompt(input: {
  project: BlueprintLaunchProjectData;
  intake: IntakeInput;
}) {
  return renderPromptTemplate(buildBlueprintLaunchStep1PromptTemplate(), {
    degree_level_lower: input.project.degreeLevel.toLowerCase(),
    degree_level: input.project.degreeLevel,
    knowledge_area: input.project.knowledgeAreaLabel,
    output_language: input.project.language,
    topic: input.intake.topic ?? "",
    problem_context: input.intake.problemContext ?? "",
    research_line: input.intake.researchLine ?? "",
    academic_constraints: input.intake.academicConstraints ?? "",
    target_population: input.intake.targetPopulation ?? "",
    available_data: input.intake.availableData ?? "",
    preferred_methodology: input.intake.preferredMethodology ?? "",
    advisor_notes: input.intake.advisorNotes ?? "",
  });
}

export function buildBlueprintLaunchRetrievalBriefPromptTemplate() {
  return `
Actua como estratega de retrieval academico para investigacion aplicada en {{knowledge_area}}. Debes redactar un unico brief corto en ingles tecnico limpio para busqueda bibliografica.

Reglas:
- responde solo el campo retrieval_brief_en
- el texto final debe estar completamente en ingles tecnico claro
- no mezcles idiomas
- no uses caracteres de alfabetos no latinos
- no uses markdown
- no inventes resultados ni datos nuevos
- resume el tema, el problema, el alcance y la orientacion metodologica
- mantente entre 180 y 320 caracteres
- evita cierre truncado; termina con una frase completa

Contexto sintetizado:
- canonical_topic_es: {{canonical_topic_es}}
- problem_core_es: {{problem_core_es}}
- method_preference_es: {{method_preference_es}}
- target_scope_es: {{target_scope_es}}
- topic_original: {{topic_original}}
- target_population_original: {{target_population_original}}
`.trim();
}

export function buildBlueprintLaunchRetrievalBriefPrompt(input: {
  project: BlueprintLaunchProjectData;
  intakeOriginal: IntakeInput;
  canonicalTopicEs: string;
  problemCoreEs: string;
  methodPreferenceEs: string | null;
  targetScopeEs: string | null;
}) {
  return renderPromptTemplate(buildBlueprintLaunchRetrievalBriefPromptTemplate(), {
    knowledge_area: input.project.knowledgeAreaLabel,
    canonical_topic_es: input.canonicalTopicEs,
    problem_core_es: input.problemCoreEs,
    method_preference_es: input.methodPreferenceEs ?? "null",
    target_scope_es: input.targetScopeEs ?? "null",
    topic_original: input.intakeOriginal.topic ?? "",
    target_population_original: input.intakeOriginal.targetPopulation ?? "",
  });
}

function sanitizeRetrievalBriefEn(value: string) {
  const normalized = normalizeWhitespace(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  return normalized.slice(0, 360);
}

function looksContaminatedRetrievalBrief(value: string) {
  return /[^\u0000-\u024F]/u.test(value);
}

export async function improveBlueprintLaunchIntake(params: {
  project: BlueprintLaunchProjectData;
  intake: IntakeInput;
}): Promise<BlueprintLaunchIntakeImprovementResult> {
  const improvedAt = new Date().toISOString();
  const fallbackIntake = preserveFallbackIntake(params.intake);
  const promptTemplate = buildBlueprintLaunchStep1PromptTemplate();
  const promptText = buildBlueprintLaunchStep1Prompt(params);
  const model = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
  const schemaName = "blueprint_launch_step1_intake_improvement";
  const trackingLabel = `structured:${schemaName}`;
  const retrievalSchemaName = "blueprint_launch_step1_retrieval_brief";
  const retrievalTrackingLabel = `structured:${retrievalSchemaName}`;

  try {
    const provider = getConfiguredLlmProvider();
    const plan = await generateStructuredObjectWithTextFallback<IntakeImprovementPlan>({
      provider,
      prompt: promptText,
      schemaName,
      schema: intakeImprovementSchema,
      model,
    });
    const retrievalPromptTemplate = buildBlueprintLaunchRetrievalBriefPromptTemplate();
    const retrievalPromptText = buildBlueprintLaunchRetrievalBriefPrompt({
      project: params.project,
      intakeOriginal: params.intake,
      canonicalTopicEs: normalizeWhitespace(plan.canonical_topic_es),
      problemCoreEs: normalizeWhitespace(plan.problem_core_es),
      methodPreferenceEs: plan.method_preference_es
        ? normalizeWhitespace(plan.method_preference_es)
        : null,
      targetScopeEs: plan.target_scope_es ? normalizeWhitespace(plan.target_scope_es) : null,
    });
    const retrievalPlan = await generateStructuredObjectWithTextFallback<RetrievalBriefPlan>({
      provider,
      prompt: retrievalPromptText,
      schemaName: retrievalSchemaName,
      schema: retrievalBriefSchema,
      model,
    });
    const retrievalBriefEn = sanitizeRetrievalBriefEn(retrievalPlan.retrieval_brief_en);

    return {
      improvedAt,
      llmStatus: "llm",
      llmPrompts: [
        {
          label: "Mejora del intake y canonicalizacion",
          schemaName,
          model,
          trackingLabel,
          promptTemplate,
          promptText,
        },
        {
          label: "Generacion de retrieval brief en ingles",
          schemaName: retrievalSchemaName,
          model,
          trackingLabel: retrievalTrackingLabel,
          promptTemplate: retrievalPromptTemplate,
          promptText: retrievalPromptText,
        },
      ],
      detectedMixedLanguageFields: plan.detected_mixed_language_fields,
      preservedTerms: plan.preserved_terms,
      changeNotes: plan.change_notes,
      canonicalTopicEs: normalizeWhitespace(plan.canonical_topic_es),
      problemCoreEs: normalizeWhitespace(plan.problem_core_es),
      methodPreferenceEs: plan.method_preference_es ? normalizeWhitespace(plan.method_preference_es) : null,
      targetScopeEs: plan.target_scope_es ? normalizeWhitespace(plan.target_scope_es) : null,
      retrievalBriefEn: looksContaminatedRetrievalBrief(retrievalBriefEn)
        ? deriveFallbackRetrievalBriefEn(fallbackIntake)
        : retrievalBriefEn,
      intakeImprovedEs: preserveFallbackIntake(plan.intake_improved_es),
    };
  } catch {
    return {
      improvedAt,
      llmStatus: "fallback",
      llmPrompts: [
        {
          label: "Mejora del intake y canonicalizacion",
          schemaName,
          model,
          trackingLabel,
          promptTemplate,
          promptText,
        },
      ],
      detectedMixedLanguageFields: [],
      preservedTerms: ["AHP", "PRISMA"],
      changeNotes: [
        "Se mantuvo el intake original con limpieza de espacios por falta de LLM disponible.",
      ],
      canonicalTopicEs: deriveFallbackCanonicalTopic(fallbackIntake),
      problemCoreEs: deriveFallbackProblemCore(fallbackIntake),
      methodPreferenceEs: deriveFallbackMethodPreference(fallbackIntake),
      targetScopeEs: deriveFallbackTargetScope(fallbackIntake),
      retrievalBriefEn: deriveFallbackRetrievalBriefEn(fallbackIntake),
      intakeImprovedEs: fallbackIntake,
    };
  }
}

export function buildBlueprintLaunchProjectSnapshot(
  project: BlueprintLaunchProjectData,
): BlueprintLaunchProjectSnapshot {
  return {
    savedAt: new Date().toISOString(),
    projectTitle: project.title,
    degreeLevel: project.degreeLevel,
    university: project.university,
    program: project.program,
    knowledgeAreaLabel: project.knowledgeAreaLabel,
    templateKey: project.templateKey,
    country: project.country,
    language: project.language,
    status: project.status,
    mode: project.mode,
  };
}

export function buildBlueprintLaunchProjectGlobalContext(input: {
  projectSnapshot: BlueprintLaunchProjectSnapshot;
  intakeOriginal: IntakeInput;
  intakeImprovementResult: BlueprintLaunchIntakeImprovementResult;
}): BlueprintLaunchProjectGlobalContext {
  return {
    generatedAt: new Date().toISOString(),
    project: input.projectSnapshot,
    intakeOriginal: input.intakeOriginal,
    intakeImprovedEs: input.intakeImprovementResult.intakeImprovedEs,
    canonicalTopicEs: input.intakeImprovementResult.canonicalTopicEs,
    problemCoreEs: input.intakeImprovementResult.problemCoreEs,
    methodPreferenceEs: input.intakeImprovementResult.methodPreferenceEs,
    targetScopeEs: input.intakeImprovementResult.targetScopeEs,
    retrievalBriefEn: input.intakeImprovementResult.retrievalBriefEn,
    productRules: {
      language: "es",
      traceabilityRequired: true,
      noInventedCitations: true,
      noInventedData: true,
    },
  };
}
