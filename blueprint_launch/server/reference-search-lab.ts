import { buildSearchQuery, extractSearchTerms, normalizeTitle } from "@/lib/text";
import { getConfiguredLlmProvider } from "@/llm";
import type { IntakeInput } from "@/server/projects/project-validation";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import type {
  BlueprintLaunchKeywordGroup,
  BlueprintLaunchSearchMetadata,
} from "./local-playground-store";

type KeywordGroupSchemaItem = {
  label: string;
  variants: string[];
};

type LabKeywordPlan = {
  knowledge_area_source_es: string;
  knowledge_area_canonical_en: string;
  subdomain: string;
  primary_system: string;
  primary_phenomenon: string;
  primary_goal: string;
  normalized_topic: string;
  intent_summary: string;
  keyword_groups: {
    necessary: KeywordGroupSchemaItem[];
    complementary: KeywordGroupSchemaItem[];
    optional: KeywordGroupSchemaItem[];
  };
  query_pack: {
    necessary_only: string[];
    complementary_boosted: string[];
    optional_backups: string[];
  };
  focus_terms: string[];
};

const blueprintLaunchKeywordPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "knowledge_area_source_es",
    "knowledge_area_canonical_en",
    "subdomain",
    "primary_system",
    "primary_phenomenon",
    "primary_goal",
    "normalized_topic",
    "intent_summary",
    "keyword_groups",
    "query_pack",
    "focus_terms",
  ],
  properties: {
    knowledge_area_source_es: { type: "string", minLength: 3, maxLength: 120 },
    knowledge_area_canonical_en: { type: "string", minLength: 3, maxLength: 120 },
    subdomain: { type: "string", minLength: 3, maxLength: 160 },
    primary_system: { type: "string", minLength: 3, maxLength: 160 },
    primary_phenomenon: { type: "string", minLength: 3, maxLength: 160 },
    primary_goal: { type: "string", minLength: 3, maxLength: 160 },
    normalized_topic: { type: "string", minLength: 8, maxLength: 220 },
    intent_summary: { type: "string", minLength: 12, maxLength: 320 },
    keyword_groups: {
      type: "object",
      additionalProperties: false,
      required: ["necessary", "complementary", "optional"],
      properties: {
        necessary: { type: "array", minItems: 2, maxItems: 6, items: keywordGroupItemSchema() },
        complementary: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: keywordGroupItemSchema(),
        },
        optional: { type: "array", maxItems: 6, items: keywordGroupItemSchema() },
      },
    },
    query_pack: {
      type: "object",
      additionalProperties: false,
      required: ["necessary_only", "complementary_boosted", "optional_backups"],
      properties: {
        necessary_only: { type: "array", minItems: 1, maxItems: 4, items: queryStringSchema() },
        complementary_boosted: {
          type: "array",
          maxItems: 4,
          items: queryStringSchema(),
        },
        optional_backups: {
          type: "array",
          maxItems: 3,
          items: queryStringSchema(),
        },
      },
    },
    focus_terms: {
      type: "array",
      minItems: 4,
      maxItems: 14,
      items: { type: "string", minLength: 3, maxLength: 60 },
    },
  },
} satisfies Record<string, unknown>;

function keywordGroupItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "variants"],
    properties: {
      label: { type: "string", minLength: 3, maxLength: 60 },
      variants: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 3, maxLength: 80 },
      },
    },
  };
}

function queryStringSchema() {
  return { type: "string", minLength: 8, maxLength: 160 };
}

function splitGeneratedQuery(value: string) {
  return value
    .split(/\\?["']?\s*,\s*\\?["']?/g)
    .map((part) => part.replace(/\\+"/g, "").replace(/^["']+|["']+$/g, "").trim())
    .filter(Boolean);
}

function sanitizeGeneratedQueries(values: Array<string | null | undefined>, limit: number) {
  return uniqueNormalized(
    values.flatMap((value) => (value ? splitGeneratedQuery(value) : [])),
  ).slice(0, limit);
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const normalized = normalizeTitle(value);

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function uniqueVariants(values: string[]) {
  return uniqueNormalized(values).slice(0, 4);
}

function buildKeywordGroup(label: string, variants: string[]) {
  return {
    label,
    variants: uniqueVariants(variants),
  };
}

function pushGroup(
  target: BlueprintLaunchKeywordGroup[],
  label: string,
  variants: string[],
) {
  const group = buildKeywordGroup(label, variants);

  if (group.variants.length === 0) {
    return;
  }

  const normalizedLabel = normalizeTitle(label);

  if (target.some((item) => normalizeTitle(item.label) === normalizedLabel)) {
    return;
  }

  target.push(group);
}

type KnowledgeAreaMapping = {
  key: string;
  canonicalEn: string;
  aliases: string[];
};

const KNOWLEDGE_AREA_MAPPINGS: KnowledgeAreaMapping[] = [
  {
    key: "structural_engineering",
    canonicalEn: "Structural Engineering",
    aliases: ["ingenieria estructural", "structural engineering", "estructuras"],
  },
  {
    key: "systems_engineering",
    canonicalEn: "Systems Engineering",
    aliases: ["ingenieria de sistemas", "systems engineering", "software engineering"],
  },
  {
    key: "medicine",
    canonicalEn: "Medicine",
    aliases: ["medicina", "medicine", "clinical medicine"],
  },
  {
    key: "education",
    canonicalEn: "Education",
    aliases: ["educacion", "education", "pedagogy"],
  },
  {
    key: "business_administration",
    canonicalEn: "Business Administration",
    aliases: ["administracion", "business administration", "management"],
  },
  {
    key: "psychology",
    canonicalEn: "Psychology",
    aliases: ["psicologia", "psychology"],
  },
  {
    key: "law",
    canonicalEn: "Law",
    aliases: ["derecho", "law", "legal studies"],
  },
  {
    key: "architecture_and_urbanism",
    canonicalEn: "Architecture and Urbanism",
    aliases: ["arquitectura", "urbanismo", "architecture", "urban planning"],
  },
  {
    key: "environmental_engineering",
    canonicalEn: "Environmental Engineering",
    aliases: ["ingenieria ambiental", "environmental engineering"],
  },
  {
    key: "economics",
    canonicalEn: "Economics",
    aliases: ["economia", "economics"],
  },
  {
    key: "communications",
    canonicalEn: "Communications",
    aliases: ["comunicacion", "communications", "media studies"],
  },
  {
    key: "public_health",
    canonicalEn: "Public Health",
    aliases: ["salud publica", "public health"],
  },
];

function resolveKnowledgeArea(knowledgeAreaLabel: string | null) {
  const normalized = normalizeTitle(knowledgeAreaLabel ?? "");
  const match =
    KNOWLEDGE_AREA_MAPPINGS.find((item) =>
      item.aliases.some((alias) => normalized.includes(normalizeTitle(alias))),
    ) ?? null;

  return {
    key: match?.key ?? "generic",
    canonicalEn: match?.canonicalEn ?? "General Academic Research",
    sourceEs: knowledgeAreaLabel?.trim() || "No definida",
  };
}

function buildQueryPack(keywordGroups: BlueprintLaunchSearchMetadata["keywordGroups"]) {
  const necessaryBase = keywordGroups.necessary.map((group) => group.variants[0]).filter(Boolean);
  const necessaryAlternate = keywordGroups.necessary
    .map((group) => group.variants[1] ?? group.variants[0])
    .filter(Boolean);

  const necessaryOnly = uniqueNormalized([
    buildSearchQuery(necessaryBase),
    buildSearchQuery(necessaryAlternate),
    buildSearchQuery([
      necessaryBase[0],
      necessaryBase[1],
      necessaryBase[2],
      keywordGroups.necessary[3]?.variants[1] ?? keywordGroups.necessary[3]?.variants[0] ?? null,
    ]),
  ]).slice(0, 4);

  const complementaryBoosted = uniqueNormalized(
    keywordGroups.complementary.slice(0, 4).map((group) =>
      buildSearchQuery([...necessaryBase, group.variants[0]]),
    ),
  ).slice(0, 4);

  const optionalBackups = uniqueNormalized(
    keywordGroups.optional.slice(0, 3).map((group) =>
      buildSearchQuery([necessaryBase[0], necessaryBase[1], group.variants[0]]),
    ),
  ).slice(0, 3);

  return {
    necessaryOnly,
    complementaryBoosted,
    optionalBackups,
  };
}

function buildTranslatedSeedTerms(_intake: IntakeInput, _areaKey: string) {
  return [] as string[];
}

type CurrentTermRule = {
  sourcePatterns: RegExp[];
  variants: string[];
  areaKeys?: string[];
};

const CURRENT_TERM_TRANSLATION_RULES: CurrentTermRule[] = [
  {
    sourcePatterns: [/enfermedad renal cronica/i, /enfermedad renal crónica/i],
    variants: ["chronic kidney disease", "chronic renal disease", "CKD"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/adherencia terapeutica/i, /adherencia terapéutica/i],
    variants: ["therapeutic adherence", "treatment adherence", "medication adherence"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/adherencia farmacologica/i, /adherencia farmacológica/i],
    variants: ["medication adherence", "pharmacological adherence", "treatment adherence"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/adherencia al tratamiento/i],
    variants: ["treatment adherence", "medication adherence", "therapeutic adherence"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/pacientes adultos/i, /adultos/i],
    variants: ["adult patients", "adult population"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/servicios de salud/i, /servicios salud/i],
    variants: ["health services", "healthcare services"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/salud publica/i, /salud pública/i],
    variants: ["public health", "population health"],
    areaKeys: ["medicine", "public_health"],
  },
  {
    sourcePatterns: [/factores asociados/i],
    variants: ["associated factors", "determinants", "predictors"],
  },
  {
    sourcePatterns: [/transversal/i],
    variants: ["cross-sectional study", "observational cross-sectional design"],
  },
  {
    sourcePatterns: [/revision aplicada/i, /revisión aplicada/i, /revision de literatura/i, /revisión de literatura/i],
    variants: ["literature review", "applied literature review"],
  },
  {
    sourcePatterns: [/peru/i, /perú/i, /peruan/i],
    variants: ["Peru", "Peruvian health services"],
  },
  {
    sourcePatterns: [/latinoamerican/i, /america latina/i, /américa latina/i],
    variants: ["Latin America", "Latin American context"],
  },
];

function extractCurrentTranslatedTerms(input: {
  intake: IntakeInput;
  areaKey: string;
}) {
  const currentText = [
    input.intake.topic,
    input.intake.problemContext,
    input.intake.researchLine,
    input.intake.targetPopulation,
    input.intake.availableData,
    input.intake.preferredMethodology,
    input.intake.advisorNotes,
  ].join(" ");

  return uniqueNormalized(
    CURRENT_TERM_TRANSLATION_RULES.flatMap((rule) => {
      if (rule.areaKeys && !rule.areaKeys.includes(input.areaKey)) {
        return [];
      }

      return rule.sourcePatterns.some((pattern) => pattern.test(currentText)) ? rule.variants : [];
    }),
  );
}

function extractCurrentPhrases(value: string | null | undefined, maxPhrases: number) {
  const terms = extractSearchTerms(value ?? "", { maxTerms: 18, minLength: 4 });
  const phrases: string[] = [];

  for (let index = 0; index < terms.length; index += 1) {
    const tri = terms.slice(index, index + 3).join(" ");
    const bi = terms.slice(index, index + 2).join(" ");

    if (tri.split(" ").length === 3) phrases.push(tri);
    if (bi.split(" ").length === 2) phrases.push(bi);
  }

  return uniqueNormalized(phrases).slice(0, maxPhrases);
}

function isWeakGenericPhrase(value: string | null | undefined) {
  const normalized = normalizeTitle(value ?? "");

  return (
    normalized === "factores asociados" ||
    normalized === "revision aplicada" ||
    normalized === "literatura propuesta" ||
    normalized === "aplicada literatura" ||
    normalized === "propuesta enfermedad" ||
    normalized === "pacientes adultos" ||
    normalized === "tratamiento pacientes" ||
    normalized.split(" ").length < 2
  );
}

function strongTerms(values: Array<string | null | undefined>, limit: number) {
  return uniqueNormalized(values.filter((value) => !isWeakGenericPhrase(value))).slice(0, limit);
}

function firstMatching(values: string[], patterns: RegExp[]) {
  return values.find((value) => patterns.some((pattern) => pattern.test(value))) ?? null;
}

function buildDomainAwareFallbackTerms(intake: IntakeInput, areaKey: string) {
  const translatedTerms = extractCurrentTranslatedTerms({ intake, areaKey });
  const topicPhrases = extractCurrentPhrases(intake.topic, 10);
  const populationPhrases = extractCurrentPhrases(intake.targetPopulation, 8);
  const methodologyPhrases = extractCurrentPhrases(intake.preferredMethodology, 8);
  const problemPhrases = extractCurrentPhrases(intake.problemContext, 8);
  const researchPhrases = extractCurrentPhrases(intake.researchLine, 8);
  const availableDataPhrases = extractCurrentPhrases(intake.availableData, 8);
  const allCurrentPhrases = strongTerms(
    [
      ...translatedTerms,
      ...topicPhrases,
      ...populationPhrases,
      ...methodologyPhrases,
      ...problemPhrases,
      ...researchPhrases,
      ...availableDataPhrases,
    ],
    30,
  );
  const conditionOrObject =
    firstMatching(translatedTerms, [/disease/i, /condition/i, /system/i, /platform/i, /model/i]) ??
    topicPhrases.find((phrase) => /enfermedad|renal|cronica|crónica|pacient|sistema|plataforma|modelo/.test(phrase)) ??
    allCurrentPhrases[0] ??
    null;
  const phenomenon =
    firstMatching(translatedTerms, [/adherence/i, /determinants/i, /predictors/i, /associated factors/i]) ??
    topicPhrases.find((phrase) => /adherencia|factores|asociados|control|gestion|gestión|evaluacion|evaluación/.test(phrase)) ??
    allCurrentPhrases[1] ??
    conditionOrObject;
  const population =
    firstMatching(translatedTerms, [/adult patients/i, /population/i, /health services/i]) ??
    populationPhrases[0] ??
    problemPhrases.find((phrase) => /servicios|poblacion|población|pacientes|adultos/.test(phrase)) ??
    allCurrentPhrases[2] ??
    null;
  const method =
    firstMatching(translatedTerms, [/cross-sectional/i, /literature review/i, /observational/i]) ??
    methodologyPhrases[0] ??
    allCurrentPhrases[3] ??
    null;
  const context =
    firstMatching(translatedTerms, [/peru/i, /latin america/i, /health services/i]) ??
    problemPhrases.find((phrase) => /peru|perú|latin|servicios|contexto/.test(phrase)) ??
    allCurrentPhrases[4] ??
    null;

  return {
    translatedTerms,
    allCurrentPhrases,
    conditionOrObject,
    phenomenon,
    population,
    method,
    context,
  };
}
function genericFallback(intake: IntakeInput, knowledgeAreaLabel: string | null) {
  const resolvedArea = resolveKnowledgeArea(knowledgeAreaLabel);
  const fallbackTerms = buildDomainAwareFallbackTerms(intake, resolvedArea.key);
  const translatedSeeds = buildTranslatedSeedTerms(intake, resolvedArea.key);
  const currentTerms = strongTerms(
    [...fallbackTerms.translatedTerms, ...translatedSeeds, ...fallbackTerms.allCurrentPhrases],
    30,
  );

  const necessary: BlueprintLaunchKeywordGroup[] = [];
  const complementary: BlueprintLaunchKeywordGroup[] = [];
  const optional: BlueprintLaunchKeywordGroup[] = [];

  pushGroup(necessary, "condition or object", [
    fallbackTerms.conditionOrObject ?? currentTerms[0],
    currentTerms.find((term) => term !== fallbackTerms.conditionOrObject) ?? currentTerms[1],
  ]);
  pushGroup(necessary, "central phenomenon", [
    fallbackTerms.phenomenon ?? currentTerms[1],
    currentTerms.find((term) => term !== fallbackTerms.phenomenon && /adherence|associated|determinants|predictors|factores|adherencia/i.test(term)) ??
      currentTerms[2],
  ]);
  pushGroup(necessary, "population or setting", [
    fallbackTerms.population ?? currentTerms[2],
    fallbackTerms.context ?? currentTerms[3],
  ]);
  pushGroup(complementary, "methodology", [
    fallbackTerms.method ?? currentTerms[3],
    currentTerms.find((term) => /cross-sectional|observational|review|revision|transversal|literature/i.test(term)) ?? currentTerms[4],
  ]);
  pushGroup(complementary, "contextual scope", [
    fallbackTerms.context ?? currentTerms[4],
    currentTerms.find((term) => /peru|peruvian|latin|health services|servicios/i.test(term)) ?? currentTerms[5],
  ]);
  pushGroup(optional, "knowledge area", [
    resolvedArea.canonicalEn,
    currentTerms[6],
  ]);
  pushGroup(optional, "secondary context", [
    currentTerms[7],
    currentTerms[8],
  ]);

  return {
    subdomain:
      currentTerms.slice(0, 3).join(" ") ||
      "domain-specific academic retrieval",
    primarySystem:
      fallbackTerms.conditionOrObject ||
      currentTerms[0] ||
      "primary system not identified",
    primaryPhenomenon:
      fallbackTerms.phenomenon ||
      currentTerms[1] ||
      "primary phenomenon not identified",
    primaryGoal:
      fallbackTerms.method ||
      currentTerms[2] ||
      "retrieval planning for academic sources",
    keywordGroups: {
      necessary: necessary.filter((group) => group.variants.length > 0).slice(0, 6),
      complementary: complementary.filter((group) => group.variants.length > 0).slice(0, 6),
      optional: optional.filter((group) => group.variants.length > 0).slice(0, 6),
    },
  };
}

function buildFallbackMetadata(input: {
  intake: IntakeInput;
  knowledgeAreaLabel: string | null;
  plannerErrorStage?: string | null;
  plannerErrorMessage?: string | null;
}): BlueprintLaunchSearchMetadata {
  const resolvedArea = resolveKnowledgeArea(input.knowledgeAreaLabel);
  const domainFallback = genericFallback(input.intake, resolvedArea.sourceEs);

  const keywordGroups = domainFallback.keywordGroups;
  const queryPack = buildQueryPack(keywordGroups);
  const normalizedTopic =
    buildSearchQuery(keywordGroups.necessary.map((group) => group.variants[0]).slice(0, 4)) ||
    input.intake.topic;
  const intentSummary =
    buildSearchQuery([
      domainFallback.primarySystem,
      domainFallback.primaryGoal,
      keywordGroups.complementary[0]?.variants[0] ?? null,
    ]) || input.intake.topic;
  const focusTerms = uniqueNormalized([
    ...keywordGroups.necessary.flatMap((group) => group.variants),
    ...keywordGroups.complementary.flatMap((group) => group.variants),
  ]).slice(0, 14);

  return {
    planSource: "fallback",
    plannerStatus: "fallback",
    plannerErrorStage: input.plannerErrorStage ?? null,
    plannerErrorMessage: input.plannerErrorMessage ?? null,
    knowledgeArea: resolvedArea.canonicalEn,
    subdomain: domainFallback.subdomain,
    primarySystem: domainFallback.primarySystem,
    primaryPhenomenon: domainFallback.primaryPhenomenon,
    primaryGoal: domainFallback.primaryGoal,
    normalizedTopic,
    intentSummary,
    keywordGroups,
    queryPack,
    focusTerms,
    scoringRules: [
      "HIGH: matches necessary and complementary keyword groups.",
      "MEDIUM: matches only necessary keyword groups.",
      "MINIMAL: matches only optional keyword groups.",
      "Within the HIGH group, recency weighs more: 2023-2026 +6, 2020-2022 +3, 2017-2019 +1.",
    ],
  };
}

function buildPrompt(input: { intake: IntakeInput; knowledgeAreaLabel: string | null }) {
  return `
You are a senior academic literature retrieval specialist for master's thesis planning.
Your task is to read a structured intake written in Spanish and produce an English-first retrieval plan for OpenAlex.

Mandatory anchor:
- the knowledge area from the previous project step is: ${input.knowledgeAreaLabel ?? "No definida"}
- you must use that knowledge area as the main domain constraint
- do not drift into a different discipline
- the intake remains in Spanish, but every retrieval-facing value must be in English

Required reasoning order:
1. identify the specific subdomain inside the provided knowledge area
2. identify the primary system, artifact, or platform being studied
3. identify the main phenomenon or process being simulated, predicted, or controlled
4. identify the main technical goal
5. only then derive keyword groups and query pack

Keyword group rules:
- necessary: core concepts that must dominate the first search pass
- complementary: useful refiners that improve precision and technical quality
- optional: non-essential terms that may be discarded if they add noise
- labels and variants must both be in English
- keyword groups should reflect the actual technical system, not generic academic wording
- if the topic is about an experimental platform or control system, make that explicit in the necessary groups
- avoid transliterated Spanish terms in the final keyword groups and query pack

Query pack rules:
- necessary_only: queries using only the necessary groups
- complementary_boosted: queries that add one complementary group to the necessary core
- optional_backups: a few safe backup queries
- each query must be concise and should not use OR, parentheses, or boolean syntax
- prefer terms likely to appear in titles and abstracts

Return JSON with this exact structure:
- knowledge_area_source_es
- knowledge_area_canonical_en
- subdomain
- primary_system
- primary_phenomenon
- primary_goal
- normalized_topic
- intent_summary
- keyword_groups.necessary
- keyword_groups.complementary
- keyword_groups.optional
- query_pack.necessary_only
- query_pack.complementary_boosted
- query_pack.optional_backups
- focus_terms

Intake:
- topic_es: ${input.intake.topic}
- problem_context_es: ${input.intake.problemContext}
- target_population_es: ${input.intake.targetPopulation}
- preferred_methodology_es: ${input.intake.preferredMethodology}
- research_line_es: ${input.intake.researchLine}
- available_data_es: ${input.intake.availableData}
- academic_constraints_es: ${input.intake.academicConstraints}
- advisor_notes_es: ${input.intake.advisorNotes}
`.trim();
}

function sanitizeKeywordGroups(
  groups: LabKeywordPlan["keyword_groups"],
): BlueprintLaunchSearchMetadata["keywordGroups"] {
  return {
    necessary: groups.necessary.map((group) => buildKeywordGroup(group.label, group.variants)),
    complementary: groups.complementary.map((group) =>
      buildKeywordGroup(group.label, group.variants),
    ),
    optional: groups.optional.map((group) => buildKeywordGroup(group.label, group.variants)),
  };
}

export async function buildBlueprintLaunchSearchMetadata(input: {
  intake: IntakeInput;
  knowledgeAreaLabel: string | null;
}): Promise<BlueprintLaunchSearchMetadata> {
  const fallbackMetadata = buildFallbackMetadata(input);

  try {
    const provider = getConfiguredLlmProvider();
    const generatedPlan = await generateStructuredObjectWithTextFallback<LabKeywordPlan>({
      provider,
      prompt: buildPrompt(input),
      schemaName: "blueprint_launch_keyword_plan",
      schema: blueprintLaunchKeywordPlanSchema,
    });

    const keywordGroups = sanitizeKeywordGroups(generatedPlan.keyword_groups);
    const queryPack = {
      necessaryOnly: sanitizeGeneratedQueries(generatedPlan.query_pack.necessary_only, 4),
      complementaryBoosted: sanitizeGeneratedQueries(
        generatedPlan.query_pack.complementary_boosted,
        4,
      ),
      optionalBackups: sanitizeGeneratedQueries(generatedPlan.query_pack.optional_backups, 3),
    };

    return {
      planSource: "llm",
      plannerStatus: "llm",
      plannerErrorStage: null,
      plannerErrorMessage: null,
      knowledgeArea:
        generatedPlan.knowledge_area_canonical_en?.trim() ||
        resolveKnowledgeArea(input.knowledgeAreaLabel).canonicalEn,
      subdomain: generatedPlan.subdomain?.trim() || fallbackMetadata.subdomain,
      primarySystem: generatedPlan.primary_system?.trim() || fallbackMetadata.primarySystem,
      primaryPhenomenon:
        generatedPlan.primary_phenomenon?.trim() || fallbackMetadata.primaryPhenomenon,
      primaryGoal: generatedPlan.primary_goal?.trim() || fallbackMetadata.primaryGoal,
      normalizedTopic:
        generatedPlan.normalized_topic?.trim() || fallbackMetadata.normalizedTopic,
      intentSummary:
        generatedPlan.intent_summary?.trim() || fallbackMetadata.intentSummary,
      keywordGroups: {
        necessary:
          keywordGroups.necessary.length > 0
            ? keywordGroups.necessary
            : fallbackMetadata.keywordGroups.necessary,
        complementary:
          keywordGroups.complementary.length > 0
            ? keywordGroups.complementary
            : fallbackMetadata.keywordGroups.complementary,
        optional:
          keywordGroups.optional.length > 0
            ? keywordGroups.optional
            : fallbackMetadata.keywordGroups.optional,
      },
      queryPack: {
        necessaryOnly:
          queryPack.necessaryOnly.length > 0
            ? queryPack.necessaryOnly
            : fallbackMetadata.queryPack.necessaryOnly,
        complementaryBoosted:
          queryPack.complementaryBoosted.length > 0
            ? queryPack.complementaryBoosted
            : fallbackMetadata.queryPack.complementaryBoosted,
        optionalBackups:
          queryPack.optionalBackups.length > 0
            ? queryPack.optionalBackups
            : fallbackMetadata.queryPack.optionalBackups,
      },
      focusTerms: uniqueNormalized([
        ...generatedPlan.focus_terms,
        ...fallbackMetadata.focusTerms,
      ]).slice(0, 14),
      scoringRules: fallbackMetadata.scoringRules,
    };
  } catch (error) {
    return buildFallbackMetadata({
      ...input,
      plannerErrorStage: "llm_generation",
      plannerErrorMessage: error instanceof Error ? error.message : "Fallo no identificado del planner.",
    });
  }
}

export function buildDeterministicBlueprintLaunchSearchMetadata(input: {
  intake: IntakeInput;
  knowledgeAreaLabel: string | null;
  plannerErrorStage?: string | null;
  plannerErrorMessage?: string | null;
}) {
  return buildFallbackMetadata(input);
}
