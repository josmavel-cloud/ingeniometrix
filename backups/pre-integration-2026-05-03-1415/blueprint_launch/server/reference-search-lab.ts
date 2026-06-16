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

function containsAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
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

function structuralControlFallback(intake: IntakeInput, knowledgeAreaLabel: string | null) {
  const blob = normalizeTitle(
    [
      knowledgeAreaLabel,
      intake.topic,
      intake.problemContext,
      intake.targetPopulation,
      intake.preferredMethodology,
      intake.researchLine,
      intake.availableData,
      intake.advisorNotes,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const necessary: BlueprintLaunchKeywordGroup[] = [];
  const complementary: BlueprintLaunchKeywordGroup[] = [];
  const optional: BlueprintLaunchKeywordGroup[] = [];

  if (
    containsAny(blob, [
      "mesa vibratoria",
      "shaking table",
      "vibrating table",
      "mesa sismica",
    ])
  ) {
    pushGroup(necessary, "experimental platform", [
      "shaking table",
      "vibrating table",
      "seismic shaking table",
      "earthquake simulator table",
    ]);
  }

  if (
    containsAny(blob, [
      "sistema de control",
      "control",
      "control multivariable",
      "tracking",
      "seguimiento",
    ])
  ) {
    pushGroup(necessary, "control system", [
      "control system",
      "control design",
      "multivariable control",
      "tracking control",
    ]);
  }

  if (
    containsAny(blob, [
      "simular sismos",
      "simulacion sismica",
      "earthquake simulation",
      "seismic simulation",
    ])
  ) {
    pushGroup(necessary, "simulation target", [
      "earthquake simulation",
      "seismic simulation",
      "seismic reproduction",
      "ground motion reproduction",
    ]);
  }

  if (
    containsAny(blob, [
      "varios grados de libertad",
      "multigrado",
      "multi degree of freedom",
      "mdof",
    ])
  ) {
    pushGroup(necessary, "dynamic architecture", [
      "multi degree of freedom",
      "MDOF",
      "multi-axis",
      "multi-DOF",
    ]);
  }

  if (
    containsAny(blob, [
      "laboratorios de estructuras",
      "laboratorio de estructuras",
      "structural laboratory",
      "earthquake engineering laboratory",
    ])
  ) {
    pushGroup(complementary, "experimental environment", [
      "structural laboratory",
      "earthquake engineering laboratory",
      "experimental structural testing",
    ]);
  }

  if (
    containsAny(blob, [
      "escala natural",
      "cuasi natural",
      "full scale",
      "especimenes",
      "specimen",
    ])
  ) {
    pushGroup(complementary, "specimen type", [
      "full-scale specimen",
      "full-scale building specimen",
      "large-scale specimen",
      "two-story building specimen",
    ]);
  }

  if (
    containsAny(blob, [
      "servo-hidraul",
      "electrohidraul",
      "actuadores",
      "servovalvulas",
    ])
  ) {
    pushGroup(complementary, "actuation technology", [
      "servo-hydraulic actuator",
      "electrohydraulic actuator",
      "hydraulic actuator",
      "servo valve",
    ]);
  }

  if (
    containsAny(blob, [
      "error de tracking",
      "fidelidad",
      "seguimiento",
      "desplazamientos",
      "aceleraciones",
      "fuerzas",
    ])
  ) {
    pushGroup(complementary, "performance metrics", [
      "tracking error",
      "acceleration tracking",
      "displacement tracking",
      "control performance",
    ]);
  }

  if (
    containsAny(blob, [
      "sudamerica",
      "south america",
      "alta intensidad sismica",
      "high seismic intensity",
      "alta demanda sismica",
    ])
  ) {
    pushGroup(optional, "regional context", [
      "South America",
      "high seismic intensity",
      "seismic hazard region",
    ]);
  }

  if (
    containsAny(blob, [
      "2 pisos",
      "two story",
      "two-story",
      "edificios",
      "building",
    ])
  ) {
    pushGroup(optional, "structural scope", [
      "two-story building",
      "low-rise building",
      "building specimen",
    ]);
  }

  if (
    containsAny(blob, [
      "simulacion numerica",
      "validacion virtual",
      "space states",
      "control robusto",
    ])
  ) {
    pushGroup(optional, "numerical validation", [
      "numerical simulation",
      "virtual validation",
      "state-space control",
      "robust control",
    ]);
  }

  return {
    subdomain: "Experimental control systems for seismic simulation",
    primarySystem: "multi-degree-of-freedom shaking table",
    primaryPhenomenon: "earthquake simulation",
    primaryGoal: "control design for accurate seismic reproduction",
    keywordGroups: {
      necessary: necessary.slice(0, 6),
      complementary: complementary.slice(0, 6),
      optional: optional.slice(0, 6),
    },
  };
}

function buildTranslatedSeedTerms(intake: IntakeInput, areaKey: string) {
  const blob = normalizeTitle(
    [
      intake.topic,
      intake.problemContext,
      intake.targetPopulation,
      intake.preferredMethodology,
      intake.researchLine,
      intake.availableData,
      intake.advisorNotes,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const seeds: Record<string, string[]> = {
    systems_engineering: [
      "machine learning",
      "explainable AI",
      "customer churn",
      "B2B SaaS",
      "industrial IoT",
      "zero trust",
      "access control",
      "network segmentation",
    ],
    medicine: [
      "prognostic model",
      "critical care",
      "sepsis",
      "biomarkers",
      "radiomics",
      "glioblastoma",
      "magnetic resonance imaging",
      "survival prediction",
    ],
    education: [
      "reading comprehension",
      "metacognitive strategy",
      "secondary education",
      "AI-assisted feedback",
      "academic writing",
      "formative assessment",
      "higher education",
    ],
    business_administration: [
      "supply chain resilience",
      "perishable food logistics",
      "microfinance",
      "default risk",
      "delinquency",
      "credit scoring",
      "operational resilience",
    ],
    psychology: [
      "burnout",
      "nursing staff",
      "organizational support",
      "executive function",
      "inhibitory control",
      "ADHD adolescents",
      "occupational health",
      "neuropsychological assessment",
    ],
    law: [
      "compliance",
      "consumer protection",
      "data privacy",
      "algorithmic accountability",
      "public procurement",
      "regulatory enforcement",
      "administrative law",
    ],
    architecture_and_urbanism: [
      "adaptive reuse",
      "mass timber",
      "housing crisis",
      "commercial buildings",
      "urban regeneration",
      "affordable housing",
      "zoning policy",
    ],
    environmental_engineering: [
      "wastewater treatment",
      "constructed wetlands",
      "heavy metal removal",
      "air quality monitoring",
      "emission inventory",
      "environmental risk assessment",
    ],
    economics: [
      "inflation expectations",
      "labor informality",
      "household welfare",
      "monetary policy",
      "productivity",
      "panel data",
    ],
    communications: [
      "digital journalism",
      "misinformation",
      "media literacy",
      "audience engagement",
      "political communication",
      "social media",
    ],
    public_health: [
      "vaccination coverage",
      "health promotion",
      "epidemiological surveillance",
      "primary care",
      "maternal health",
      "community intervention",
    ],
  };

  const areaSeeds = seeds[areaKey] ?? [];

  return areaSeeds.filter((seed) => {
    const normalizedSeed = normalizeTitle(seed);
    const seedTokens = normalizedSeed.split(" ");

    return seedTokens.some((token) => token.length >= 4 && blob.includes(token));
  });
}

function genericFallback(intake: IntakeInput, knowledgeAreaLabel: string | null) {
  const resolvedArea = resolveKnowledgeArea(knowledgeAreaLabel);
  const topicTerms = extractSearchTerms(intake.topic, { maxTerms: 14, minLength: 4 });
  const problemTerms = extractSearchTerms(intake.problemContext ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const populationTerms = extractSearchTerms(intake.targetPopulation ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const methodologyTerms = extractSearchTerms(intake.preferredMethodology ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const researchTerms = extractSearchTerms(intake.researchLine ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const translatedSeeds = buildTranslatedSeedTerms(intake, resolvedArea.key);
  const blendedCore = uniqueNormalized([
    ...translatedSeeds,
    ...topicTerms.slice(0, 4),
    ...populationTerms.slice(0, 4),
  ]);
  const blendedSupport = uniqueNormalized([
    ...methodologyTerms.slice(0, 4),
    ...problemTerms.slice(0, 4),
    ...researchTerms.slice(0, 4),
    ...translatedSeeds.slice(2),
  ]);

  const necessary: BlueprintLaunchKeywordGroup[] = [];
  const complementary: BlueprintLaunchKeywordGroup[] = [];
  const optional: BlueprintLaunchKeywordGroup[] = [];

  pushGroup(necessary, "core phenomenon", [
    translatedSeeds[0] ?? blendedCore.slice(0, 3).join(" "),
    translatedSeeds[1] ?? blendedCore.slice(0, 2).join(" "),
  ]);
  pushGroup(necessary, "primary object", [
    translatedSeeds[2] ?? blendedCore.slice(1, 4).join(" "),
    blendedCore.slice(2, 5).join(" "),
  ]);
  pushGroup(necessary, "technical approach", [
    translatedSeeds[3] ?? blendedSupport.slice(0, 3).join(" "),
    blendedSupport.slice(1, 4).join(" "),
  ]);
  pushGroup(complementary, "methodology", [
    translatedSeeds[4] ?? blendedSupport.slice(0, 3).join(" "),
    blendedSupport.slice(2, 5).join(" "),
  ]);
  pushGroup(complementary, "contextual scope", [
    translatedSeeds[5] ?? blendedSupport.slice(3, 6).join(" "),
    blendedCore.slice(3, 6).join(" "),
  ]);
  pushGroup(optional, "knowledge area", [
    resolvedArea.canonicalEn,
    translatedSeeds[6] ?? blendedSupport.slice(4, 7).join(" "),
  ]);
  pushGroup(optional, "secondary context", [
    translatedSeeds[7] ?? blendedCore.slice(4, 7).join(" "),
    blendedSupport.slice(5, 8).join(" "),
  ]);

  return {
    subdomain:
      translatedSeeds.slice(0, 3).join(" ") ||
      blendedSupport.slice(0, 4).join(" ") ||
      "domain-specific academic retrieval",
    primarySystem:
      translatedSeeds[1] ||
      blendedCore.slice(0, 4).join(" ") ||
      "primary system not identified",
    primaryPhenomenon:
      translatedSeeds[0] ||
      blendedCore.slice(1, 5).join(" ") ||
      "primary phenomenon not identified",
    primaryGoal:
      translatedSeeds[3] ||
      blendedSupport.slice(0, 5).join(" ") ||
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
  const knowledgeAreaBlob = normalizeTitle(
    [resolvedArea.sourceEs, input.intake.researchLine].filter(Boolean).join(" "),
  );
  const domainFallback =
    containsAny(knowledgeAreaBlob, [
      "ingenieria estructural",
      "estructuras",
      "dinamica estructural",
      "earthquake engineering",
    ]) || containsAny(normalizeTitle(input.intake.topic), ["mesa vibratoria", "shaking table"])
      ? structuralControlFallback(input.intake, resolvedArea.sourceEs)
      : genericFallback(input.intake, resolvedArea.sourceEs);

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
      necessaryOnly: uniqueNormalized(generatedPlan.query_pack.necessary_only).slice(0, 4),
      complementaryBoosted: uniqueNormalized(
        generatedPlan.query_pack.complementary_boosted,
      ).slice(0, 4),
      optionalBackups: uniqueNormalized(generatedPlan.query_pack.optional_backups).slice(0, 3),
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
