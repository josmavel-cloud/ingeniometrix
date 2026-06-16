import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { searchBlueprintLaunchReferences } from "@/blueprint_launch/server/local-reference-search";
import type {
  BlueprintLaunchKeywordGroup,
  BlueprintLaunchReferenceListItem,
  BlueprintLaunchSearchMetadata,
} from "@/blueprint_launch/server/local-playground-store";
import {
  buildBlueprintLaunchSearchMetadata,
  buildDeterministicBlueprintLaunchSearchMetadata,
} from "@/blueprint_launch/server/reference-search-lab";
import { extractSearchTerms } from "@/lib/text";
import { parseIntakeInput, type IntakeInput } from "@/server/projects/project-validation";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "intakes");
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts-local", "evidence-candidate-search-runs");
const DEFAULT_CASE_ID = "case-001-seismic-isolators-peruvian-buildings";
const INTAKE_KEYS = [
  "topic",
  "problemContext",
  "researchLine",
  "academicConstraints",
  "targetPopulation",
  "availableData",
  "preferredMethodology",
  "advisorNotes",
] as const;

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnvForCandidateSearch() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length) : trimmed;
      const separator = withoutExport.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      const key = withoutExport.slice(0, separator).trim();
      const value = parseEnvValue(withoutExport.slice(separator + 1));

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnvForCandidateSearch();

type IntakeKey = (typeof INTAKE_KEYS)[number];
type IntakeFixture = {
  case_id: string;
  case_name: string;
  project_id: string;
  user_id: string;
  project_context: {
    title: string;
    degree_level: string;
    university: string;
    program: string;
    knowledge_area_label: string;
    template_key: string;
    country: string;
    language: string;
  };
  intake: Record<IntakeKey, string>;
  source_policy: {
    mode: string;
    max_selected_sources: number;
    min_selected_sources: number;
    providers: string[];
    allow_public_pdf_download: boolean;
    allow_web_fulltext_capture: boolean;
    require_complete_public_content: boolean;
  };
  selected_reference_ids: string[];
  execution_options: {
    run_steps: number[];
    force_rerun: boolean;
    use_llm: boolean;
    persist_debug_prompts: boolean;
    persist_full_text: boolean;
    persist_pdfs: boolean;
    cache_namespace: string;
    prompt_version: string;
  };
  source_selection_checkpoint: {
    required: boolean;
    selection_mode: string;
    future_options: string[];
    instructions_es: string;
    selected_reference_ids: string[];
    notes_es: string;
  };
  expected_focus: string[];
  expected_risks: string[];
};

type CandidateSource = {
  candidate_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  openalex_id: string | null;
  crossref_id: string | null;
  abstract: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  open_access_status: string;
  relevance_score: number | null;
  rank: number;
  provider: "openalex" | "crossref" | "unknown";
  reasons: string[];
  warnings: string[];
  candidate_markers?: CandidateMarker[];
  selection_history?: "not_previously_seen" | "previous_candidate" | "previously_selected" | "previously_rejected";
  query_variants?: string[];
  replacement_for_source_ids?: string[];
  replacement_rationale?: string[];
  previous_rank?: number | null;
  rerank_score?: number;
};

type CandidateMarker =
  | "new_candidate"
  | "previous_candidate"
  | "previously_selected"
  | "previously_rejected"
  | "possible_replacement";

type CliArgs = {
  caseIdOrPath: string;
  expand: boolean;
  maxCandidates: number;
  queryVariant: string | null;
  avoidSelectedFrom: string | null;
  secondaryReferenceQueue: string | null;
  plannerMode: "auto" | "llm" | "off";
};

type SecondaryReferenceRecoveryQueue = {
  candidates?: Array<{
    candidate_id?: string;
    title?: string | null;
    doi?: string | null;
    year?: number | null;
    recommended_search_query?: string | null;
  }>;
};

type ExpandedQueryVariant = {
  name: string;
  query: string;
  language: "es" | "en";
  focusTerms: string[];
  rationale: string;
  category_mix?: "necessary" | "necessary_complementary" | "optional_backup";
  source_keyword_groups?: {
    necessary: string[];
    complementary: string[];
    optional: string[];
  };
};

type CandidateSearchProfile = {
  knowledgeAreaLabel: string;
  primarySystem: string;
  primaryObjectTerms: string[];
  primaryPhenomenon: string;
  primaryGoal: string;
  keywordGroups: BlueprintLaunchSearchMetadata["keywordGroups"];
  focusTerms: string[];
};

type PreviousSelectionContext = {
  avoidSelectedFrom: string | null;
  sourceCandidateRunFolder: string | null;
  selectedReferenceIds: Set<string>;
  rejectedReferenceIds: Set<string>;
  weakSourceIds: Set<string>;
  previousCandidates: CandidateSource[];
};

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForDedup(value: string | null | undefined) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .replace(/[^a-z0-9./:-]+/g, " ")
    .trim();
}

function normalizeUrlForDedup(value: string | null | undefined) {
  const normalized = normalizeForDedup(value);
  return normalized.replace(/[?#].*$/, "").replace(/\/+$/, "");
}

function candidateDedupKeys(candidate: CandidateSource) {
  const keys: string[] = [];
  const doi = normalizeForDedup(candidate.doi);
  const openalexId = normalizeForDedup(candidate.openalex_id);
  const title = normalizeForDedup(candidate.title);
  const landingUrl = normalizeUrlForDedup(candidate.landing_page_url);
  const pdfUrl = normalizeUrlForDedup(candidate.pdf_url);

  if (doi) keys.push(`doi:${doi}`);
  if (openalexId) keys.push(`openalex:${openalexId}`);
  if (title) keys.push(`title:${title}`);
  if (landingUrl) keys.push(`url:${landingUrl}`);
  if (pdfUrl) keys.push(`url:${pdfUrl}`);

  return keys;
}

function candidatePrimaryDedupKey(candidate: CandidateSource) {
  return candidateDedupKeys(candidate)[0] ?? `candidate:${normalizeForDedup(candidate.candidate_id)}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function plannerStatusFromSearchSummary(summary: {
  metadata: unknown;
} | null) {
  const metadata = asRecord(summary?.metadata);
  const baseMetadata = asRecord(metadata.base_search_metadata);
  const firstMetadata = asRecord(metadata.first_snapshot_metadata);
  const directMetadata = metadata;
  const plannerStatus =
    String(baseMetadata.plannerStatus ?? firstMetadata.plannerStatus ?? directMetadata.plannerStatus ?? "")
      .trim()
      .toLowerCase() || "unknown";
  const planSource =
    String(baseMetadata.planSource ?? firstMetadata.planSource ?? directMetadata.planSource ?? "")
      .trim()
      .toLowerCase() || "unknown";

  return {
    plannerStatus,
    planSource,
    llmUsed: plannerStatus === "llm" || planSource === "llm",
  };
}

function sameMembers(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key as (typeof expected)[number]))
  );
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let caseIdOrPath = DEFAULT_CASE_ID;
  let expand = false;
  let maxCandidates = 10;
  let queryVariant: string | null = null;
  let avoidSelectedFrom: string | null = null;
  let secondaryReferenceQueue: string | null = null;
  let plannerMode: CliArgs["plannerMode"] = "auto";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--case" && next) {
      caseIdOrPath = next;
      index += 1;
      continue;
    }

    if (arg === "--expand") {
      expand = true;
      continue;
    }

    if (arg === "--max-candidates" && next) {
      maxCandidates = parsePositiveInt(next, maxCandidates);
      index += 1;
      continue;
    }

    if (arg === "--query-variant" && next) {
      queryVariant = next;
      index += 1;
      continue;
    }

    if (arg === "--avoid-selected-from" && next) {
      avoidSelectedFrom = next;
      index += 1;
      continue;
    }

    if (arg === "--secondary-reference-queue" && next) {
      secondaryReferenceQueue = path.isAbsolute(next) ? next : path.join(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--use-llm-planner") {
      plannerMode = "llm";
      continue;
    }

    if (arg === "--no-llm-planner") {
      plannerMode = "off";
    }
  }

  return {
    caseIdOrPath,
    expand,
    maxCandidates,
    queryVariant,
    avoidSelectedFrom,
    secondaryReferenceQueue,
    plannerMode,
  };
}

function fixturePathFor(caseIdOrPath: string) {
  if (caseIdOrPath.endsWith(".json")) {
    return path.isAbsolute(caseIdOrPath) ? caseIdOrPath : path.join(process.cwd(), caseIdOrPath);
  }

  const direct = path.join(FIXTURE_DIR, `${caseIdOrPath}.json`);
  try {
    readFileSync(direct, "utf8");
    return direct;
  } catch {
    const found = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith(".json"))
      .find((name) => name.startsWith(caseIdOrPath));

    if (!found) {
      throw new Error(`No intake fixture found for case: ${caseIdOrPath}`);
    }

    return path.join(FIXTURE_DIR, found);
  }
}

function readFixture(filePath: string): IntakeFixture {
  return JSON.parse(readFileSync(filePath, "utf8")) as IntakeFixture;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function validateFixture(fixture: IntakeFixture) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const intakeKeys = Object.keys(asRecord(fixture.intake));

  if (!sameMembers(intakeKeys, INTAKE_KEYS)) {
    blockers.push(`Intake fields must exactly match: ${INTAKE_KEYS.join(", ")}.`);
  }

  for (const key of INTAKE_KEYS) {
    if (typeof fixture.intake?.[key] !== "string" || fixture.intake[key].trim().length === 0) {
      blockers.push(`Missing or empty intake.${key}.`);
    }
  }

  if (!fixture.case_id || !fixture.case_name || !fixture.project_id || !fixture.user_id) {
    blockers.push("Fixture must include case_id, case_name, project_id, and user_id.");
  }

  if (!fixture.source_selection_checkpoint?.required) {
    blockers.push("source_selection_checkpoint.required must be true.");
  }

  if (fixture.source_selection_checkpoint?.selection_mode !== "manual_pending") {
    warnings.push("source_selection_checkpoint.selection_mode is not manual_pending.");
  }

  if (fixture.execution_options?.use_llm !== false) {
    blockers.push("execution_options.use_llm must be false for this candidate-search stage.");
  }

  if (!fixture.source_policy?.providers?.includes("openalex")) {
    warnings.push("source_policy.providers does not include openalex.");
  }

  if (!fixture.source_policy?.providers?.includes("crossref")) {
    warnings.push("source_policy.providers does not include crossref.");
  }

  return { blockers, warnings };
}

function buildDeterministicNormalizedIntakeContext(fixture: IntakeFixture, intake: IntakeInput) {
  const labASearchInput = buildLabASearchInput(fixture, intake);

  return {
    normalized_at: new Date().toISOString(),
    normalization_mode: "deterministic_parse_only",
    llm_used: false,
    project: {
      project_id: fixture.project_id,
      title: fixture.project_context.title,
      degree_level: fixture.project_context.degree_level,
      university: fixture.project_context.university,
      program: fixture.project_context.program,
      knowledge_area_label: fixture.project_context.knowledge_area_label,
      template_key: fixture.project_context.template_key,
      country: fixture.project_context.country,
      language: fixture.project_context.language,
    },
    intake_original: fixture.intake,
    intake_normalized: {
      topic: normalizeWhitespace(intake.topic),
      problemContext: normalizeWhitespace(intake.problemContext),
      researchLine: normalizeWhitespace(intake.researchLine),
      academicConstraints: normalizeWhitespace(intake.academicConstraints),
      targetPopulation: normalizeWhitespace(intake.targetPopulation),
      availableData: normalizeWhitespace(intake.availableData),
      preferredMethodology: normalizeWhitespace(intake.preferredMethodology),
      advisorNotes: normalizeWhitespace(intake.advisorNotes),
    },
    lab_a_search_input: labASearchInput,
    lab_a_search_knowledge_area_label: buildLabASearchKnowledgeAreaLabel(fixture, intake),
    canonical_topic_es: normalizeWhitespace(intake.topic),
    problem_core_es: normalizeWhitespace(intake.problemContext).slice(0, 260),
    method_preference_es: normalizeWhitespace(intake.preferredMethodology) || null,
    target_scope_es: normalizeWhitespace(intake.targetPopulation) || null,
    product_rules: {
      language: "es",
      traceability_required: true,
      no_invented_citations: true,
      no_invented_data: true,
    },
  };
}

function buildLabASearchInput(_fixture: IntakeFixture, intake: IntakeInput): IntakeInput {
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

function buildLabASearchKnowledgeAreaLabel(fixture: IntakeFixture, _intake: IntakeInput) {
  return fixture.project_context.knowledge_area_label;
}
function keywordGroupTerms(groups: BlueprintLaunchKeywordGroup[], limit: number) {
  return uniqueStrings(
    groups.flatMap((group) => [
      group.variants[0] ?? group.label,
      group.variants[1] ?? "",
    ]),
  ).slice(0, limit);
}

function slugForVariant(value: string) {
  return normalizeForDedup(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

function buildQueryFromParts(parts: string[]) {
  return normalizeWhitespace(uniqueStrings(parts).join(" "));
}

function buildVariant(
  input: {
    name: string;
    query: string;
    focusTerms: string[];
    rationale: string;
    categoryMix: ExpandedQueryVariant["category_mix"];
    keywordGroups: BlueprintLaunchSearchMetadata["keywordGroups"];
  },
): ExpandedQueryVariant {
  return {
    name: input.name,
    query: input.query,
    language: "en",
    focusTerms: input.focusTerms,
    rationale: input.rationale,
    category_mix: input.categoryMix,
    source_keyword_groups: {
      necessary: input.keywordGroups.necessary.map((group) => group.label),
      complementary: input.keywordGroups.complementary.map((group) => group.label),
      optional: input.keywordGroups.optional.map((group) => group.label),
    },
  };
}

function ensurePrimarySystemVariant(
  primarySystem: string,
  necessaryTerms: string[],
) {
  const normalizedSystem = normalizeForDedup(primarySystem);
  const normalizedNecessary = normalizeForDedup(necessaryTerms.join(" "));

  if (!normalizedSystem || normalizedNecessary.includes(normalizedSystem)) {
    return necessaryTerms;
  }

  return uniqueStrings([primarySystem, ...necessaryTerms]).slice(0, 5);
}

export function buildExpandedQueryVariantsFromMetadata(input: {
  metadata: BlueprintLaunchSearchMetadata;
  fixture: IntakeFixture;
  intake: IntakeInput;
}): ExpandedQueryVariant[] {
  const keywordGroups = input.metadata.keywordGroups;
  const necessaryTerms = ensurePrimarySystemVariant(
    input.metadata.primarySystem,
    keywordGroupTerms(keywordGroups.necessary, 5),
  );
  const complementaryTerms = keywordGroupTerms(keywordGroups.complementary, 4);
  const optionalTerms = keywordGroupTerms(keywordGroups.optional, 3);
  const intakeTerms = extractSearchTerms(
    [
      input.fixture.project_context.knowledge_area_label,
      input.intake.topic,
      input.intake.problemContext,
      input.intake.researchLine,
      input.intake.availableData,
      input.intake.preferredMethodology,
    ].join(" "),
    { maxTerms: 10, minLength: 5 },
  );

  const variants = [
    buildVariant({
      name: `necessary-core-${slugForVariant(input.metadata.primarySystem || input.metadata.normalizedTopic)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        ...necessaryTerms.slice(0, 4),
      ]),
      focusTerms: uniqueStrings([...necessaryTerms, input.metadata.primarySystem]).slice(0, 8),
      rationale:
        "Expande desde las categorias necesarias del intake actual: objeto/sistema, fenomeno y proposito central.",
      categoryMix: "necessary",
      keywordGroups,
    }),
    buildVariant({
      name: `necessary-goal-${slugForVariant(input.metadata.primaryGoal || input.metadata.primaryPhenomenon)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        input.metadata.primaryPhenomenon,
        input.metadata.primaryGoal,
        ...necessaryTerms.slice(0, 2),
      ]),
      focusTerms: uniqueStrings([
        input.metadata.primarySystem,
        input.metadata.primaryPhenomenon,
        input.metadata.primaryGoal,
        ...necessaryTerms,
      ]).slice(0, 8),
      rationale:
        "Combina las categorias necesarias con el objetivo tecnico/metodologico del intake actual.",
      categoryMix: "necessary",
      keywordGroups,
    }),
    buildVariant({
      name: `necessary-complementary-${slugForVariant(complementaryTerms[0] ?? input.metadata.normalizedTopic)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        ...necessaryTerms.slice(0, 3),
        ...complementaryTerms.slice(0, 2),
      ]),
      focusTerms: uniqueStrings([...necessaryTerms, ...complementaryTerms]).slice(0, 8),
      rationale:
        "Cruza categorias necesarias con complementarias para priorizar fuentes tecnicas mas especificas.",
      categoryMix: "necessary_complementary",
      keywordGroups,
    }),
    buildVariant({
      name: `complementary-method-${slugForVariant(complementaryTerms.slice(1, 3).join(" ") || input.metadata.intentSummary)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        ...complementaryTerms,
        ...necessaryTerms.slice(0, 2),
      ]),
      focusTerms: uniqueStrings([...complementaryTerms, ...necessaryTerms]).slice(0, 8),
      rationale:
        "Refuerza variables, herramientas, criterios o tecnologia que el intake marca como complementarios.",
      categoryMix: "necessary_complementary",
      keywordGroups,
    }),
    buildVariant({
      name: `intake-method-${slugForVariant(intakeTerms.slice(0, 5).join(" ") || input.metadata.normalizedTopic)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        ...necessaryTerms.slice(0, 2),
        ...intakeTerms.slice(0, 5),
      ]),
      focusTerms: uniqueStrings([...necessaryTerms, ...intakeTerms]).slice(0, 8),
      rationale:
        "Usa terminos extraidos del intake actual como apoyo debil, sin reemplazar las categorias necesarias.",
      categoryMix: "necessary_complementary",
      keywordGroups,
    }),
    buildVariant({
      name: `optional-backup-${slugForVariant(optionalTerms.join(" ") || input.metadata.normalizedTopic)}`,
      query: buildQueryFromParts([
        input.metadata.primarySystem,
        ...necessaryTerms.slice(0, 2),
        ...optionalTerms,
      ]),
      focusTerms: uniqueStrings([...necessaryTerms.slice(0, 2), ...optionalTerms]).slice(0, 8),
      rationale:
        "Busqueda de respaldo: conserva categorias necesarias y agrega terminos opcionales del intake actual.",
      categoryMix: "optional_backup",
      keywordGroups,
    }),
  ];

  const byName = new Map<string, ExpandedQueryVariant>();
  for (const variant of variants) {
    if (!variant.query || normalizeForDedup(variant.query).length < 8) {
      continue;
    }
    byName.set(variant.name, variant);
  }

  return [...byName.values()];
}

function selectExpandedQueryVariants(variants: ExpandedQueryVariant[], requested: string | null) {

  if (!requested) {
    return variants;
  }

  const selected = variants.filter((variant) => variant.name === requested);
  if (selected.length === 0) {
    throw new Error(
      `Unknown --query-variant ${requested}. Available: ${variants.map((variant) => variant.name).join(", ")}.`,
    );
  }

  return selected;
}

function loadSecondaryReferenceQueue(filePath: string | null): SecondaryReferenceRecoveryQueue | null {
  return filePath ? readJsonIfExists<SecondaryReferenceRecoveryQueue>(filePath) : null;
}

function buildSecondaryReferenceQueryVariants(queue: SecondaryReferenceRecoveryQueue | null): ExpandedQueryVariant[] {
  const variants: ExpandedQueryVariant[] = [];
  for (const [index, candidate] of (queue?.candidates ?? []).slice(0, 8).entries()) {
    const query = normalizeWhitespace(
      candidate.recommended_search_query ||
        [candidate.title, candidate.year ? String(candidate.year) : null, candidate.doi].filter(Boolean).join(" "),
    );
    if (query.length < 8) continue;
    const focusTerms = extractSearchTerms(query, { maxTerms: 8 });
    variants.push({
      name: `secondary-reference-${index + 1}-${slugForVariant(candidate.candidate_id || candidate.title || query)}`,
      query,
      language: "en",
      focusTerms,
      rationale:
        "Referencia secundaria detectada en PDFs recuperados del intake actual; debe buscarse como nueva candidata y no citarse hasta recuperacion/seleccion.",
      category_mix: "optional_backup",
      source_keyword_groups: {
        necessary: focusTerms,
        complementary: [],
        optional: [],
      },
    });
  }
  return variants;
}

function buildVariantSearchInput(input: {
  fixture: IntakeFixture;
  intake: IntakeInput;
  variant: ExpandedQueryVariant;
}) {
  const base = buildLabASearchInput(input.fixture, input.intake);
  const focus = input.variant.focusTerms.join(" ");

  return {
    ...base,
    topic: normalizeWhitespace(`${input.variant.query}. ${base.topic}`),
    problemContext: normalizeWhitespace(`${base.problemContext} ${input.variant.query}`),
    researchLine: normalizeWhitespace(`${input.variant.query}. ${base.researchLine}`),
    targetPopulation: normalizeWhitespace(`${base.targetPopulation} ${focus}`),
    availableData: normalizeWhitespace(`${base.availableData} ${focus}`),
    preferredMethodology: normalizeWhitespace(
      `${base.preferredMethodology} comparative assessment evidence synthesis ${focus}`,
    ),
  } satisfies IntakeInput;
}

function buildCandidateSearchProfile(metadata: BlueprintLaunchSearchMetadata): CandidateSearchProfile {
  const primarySystemTokens = normalizeForDedup(metadata.primarySystem)
    .split(/\s+/)
    .filter((term) => term.length > 2);
  const tailObject =
    primarySystemTokens.length >= 2
      ? primarySystemTokens.slice(-2).join(" ")
      : primarySystemTokens.join(" ");

  return {
    knowledgeAreaLabel: metadata.knowledgeArea ?? "General Academic Research",
    primarySystem: metadata.primarySystem,
    primaryObjectTerms: uniqueStrings([
      metadata.primarySystem,
      tailObject,
      primarySystemTokens.length >= 3 ? primarySystemTokens.slice(-3).join(" ") : "",
    ]).filter((term) => normalizeForDedup(term).length >= 5),
    primaryPhenomenon: metadata.primaryPhenomenon,
    primaryGoal: metadata.primaryGoal,
    keywordGroups: metadata.keywordGroups,
    focusTerms: metadata.focusTerms,
  };
}

function termsForContaminationScan(value: string) {
  return extractSearchTerms(value, { maxTerms: 80, minLength: 4 });
}

const GENERIC_EXPANSION_TERMS = new Set([
  "actual",
  "apoyo",
  "backup",
  "categorias",
  "category",
  "complementary",
  "complementarias",
  "core",
  "current",
  "desde",
  "expande",
  "focus",
  "fuentes",
  "intake",
  "method",
  "necesarias",
  "necessary",
  "optional",
  "prioritizar",
  "query",
  "respaldo",
  "search",
  "source",
  "terminos",
  "variant",
]);

export function inspectExpandedQueryContamination(input: {
  fixture: IntakeFixture;
  intake: IntakeInput;
  metadata: BlueprintLaunchSearchMetadata;
  variants: ExpandedQueryVariant[];
}) {
  const currentTerms = new Set(
    termsForContaminationScan(
      [
        input.fixture.case_id,
        input.fixture.case_name,
        input.fixture.project_context.title,
        input.fixture.project_context.program,
        input.fixture.project_context.knowledge_area_label,
        input.intake.topic,
        input.intake.problemContext,
        input.intake.researchLine,
        input.intake.targetPopulation,
        input.intake.availableData,
        input.intake.preferredMethodology,
        input.metadata.knowledgeArea,
        input.metadata.subdomain,
        input.metadata.primarySystem,
        input.metadata.primaryPhenomenon,
        input.metadata.primaryGoal,
        input.metadata.normalizedTopic,
        input.metadata.intentSummary,
        input.metadata.focusTerms.join(" "),
        input.metadata.keywordGroups.necessary.flatMap((group) => group.variants).join(" "),
        input.metadata.keywordGroups.complementary.flatMap((group) => group.variants).join(" "),
        input.metadata.keywordGroups.optional.flatMap((group) => group.variants).join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const variant of input.variants) {
    const variantTerms = termsForContaminationScan(
      [
        variant.name,
        variant.query,
        variant.focusTerms.join(" "),
        variant.rationale,
      ].join(" "),
    ).filter((term) => !GENERIC_EXPANSION_TERMS.has(term));
    const currentOverlap = variantTerms.filter((term) => currentTerms.has(term));
    const foreignTerms = variantTerms.filter((term) => !currentTerms.has(term));

    if (currentOverlap.length === 0 && foreignTerms.length >= 3) {
      blockers.push(
        `Expanded query variant ${variant.name} has no overlap with current intake keywords. Foreign terms: ${foreignTerms.slice(0, 8).join(", ")}.`,
      );
      continue;
    }

    if (foreignTerms.length > Math.max(currentOverlap.length * 2, 6)) {
      warnings.push(
        `Expanded query variant ${variant.name} has many terms not present in the current intake/category plan: ${foreignTerms.slice(0, 8).join(", ")}.`,
      );
    }
  }

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warn" : "pass",
    blockers,
    warnings,
  };
}

function hasOpenAiPlannerKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function buildCandidateSearchMetadata(input: {
  intake: IntakeInput;
  knowledgeAreaLabel: string | null;
  plannerMode: CliArgs["plannerMode"];
}) {
  if (input.plannerMode === "off") {
    return buildDeterministicBlueprintLaunchSearchMetadata(input);
  }

  if (input.plannerMode === "auto" && !hasOpenAiPlannerKey()) {
    return buildDeterministicBlueprintLaunchSearchMetadata({
      ...input,
      plannerErrorStage: "llm_planner_unavailable",
      plannerErrorMessage:
        "OPENAI_API_KEY no esta disponible; se uso fallback deterministico actual-intake.",
    });
  }

  return buildBlueprintLaunchSearchMetadata({
    intake: input.intake,
    knowledgeAreaLabel: input.knowledgeAreaLabel,
  });
}

function buildVariantSearchMetadata(input: {
  baseMetadata: BlueprintLaunchSearchMetadata;
  variant: ExpandedQueryVariant;
}): BlueprintLaunchSearchMetadata {
  return {
    ...input.baseMetadata,
    normalizedTopic: input.variant.query,
    intentSummary: normalizeWhitespace(
      [input.baseMetadata.intentSummary, input.variant.query].filter(Boolean).join(" "),
    ).slice(0, 320),
    queryPack: {
      necessaryOnly: [input.variant.query],
      complementaryBoosted: [],
      optionalBackups: [],
    },
    focusTerms: uniqueStrings([
      ...input.variant.focusTerms,
      ...input.baseMetadata.focusTerms,
    ]).slice(0, 14),
  };
}

function providerFor(referenceId: string, doi: string | null): CandidateSource["provider"] {
  if (referenceId.includes("openalex.org")) return "openalex";
  if (doi || /^10\.\d{4,9}\//.test(referenceId)) return "crossref";
  return "unknown";
}

function abstractSnippet(value: string | null, maxLength = 420) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "Sin resumen disponible.";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function mentionsPeru(candidate: BlueprintLaunchReferenceListItem) {
  const blob = [candidate.reference.title, candidate.reference.abstract, candidate.reference.venue]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(peru|peruvian|peruano|peruana|peruanos|peruanas|lima)\b/.test(blob);
}

function candidateReasons(item: BlueprintLaunchReferenceListItem) {
  const reasons: string[] = [];
  const breakdown = item.scoreBreakdown;

  if (breakdown?.label) reasons.push(`Relevancia ${breakdown.label}.`);
  if (breakdown?.necessaryMatches.length) {
    reasons.push(`Coincide con necesarios: ${breakdown.necessaryMatches.join(", ")}.`);
  }
  if (breakdown?.complementaryMatches.length) {
    reasons.push(`Coincide con complementarios: ${breakdown.complementaryMatches.join(", ")}.`);
  }
  if (breakdown?.matchedQuery) {
    reasons.push(`Consulta: ${breakdown.matchedQuery}.`);
  }
  if (item.reference.abstract) reasons.push("Incluye resumen util para triaje.");
  if (item.reference.pdfUrl) reasons.push("Tiene URL de PDF candidata.");

  return reasons;
}

function candidateWarnings(item: BlueprintLaunchReferenceListItem) {
  const warnings: string[] = [];

  if (!item.reference.pdfUrl) warnings.push("Sin PDF detectado en metadatos.");
  if (item.reference.pdfUrl && !item.reference.pdfAccessible) {
    warnings.push("PDF detectado, pero no verificado como accesible por HEAD/GET corto.");
  }
  if (!item.reference.abstract) warnings.push("Sin resumen disponible.");
  if (item.scoreBreakdown?.label === "BAJO" || item.scoreBreakdown?.label === "MINIMO") {
    warnings.push(`Coincidencia ${item.scoreBreakdown.label.toLowerCase()}.`);
  }
  if (!mentionsPeru(item)) warnings.push("No parece especifico de Peru; requiere revision humana.");

  return warnings;
}

function mapCandidate(item: BlueprintLaunchReferenceListItem, rank: number): CandidateSource {
  const reference = item.reference;
  const provider = providerFor(reference.id, reference.doi);

  return {
    candidate_id: reference.id,
    title: reference.title,
    authors: reference.authorsJson,
    year: reference.year,
    venue: reference.venue,
    doi: reference.doi,
    openalex_id: provider === "openalex" ? reference.id : null,
    crossref_id: provider === "crossref" ? reference.doi ?? reference.id : null,
    abstract: reference.abstract,
    landing_page_url: reference.landingPageUrl,
    pdf_url: reference.pdfUrl,
    open_access_status: reference.pdfUrl
      ? reference.pdfAccessible
        ? "pdf_url_accessible"
        : "pdf_url_unverified"
      : reference.landingPageUrl
        ? "landing_page_only"
        : "metadata_only",
    relevance_score: item.relevanceScore,
    rank,
    provider,
    reasons: candidateReasons(item),
    warnings: candidateWarnings(item),
  };
}

function normalizeCandidateSource(value: CandidateSource): CandidateSource {
  return {
    candidate_id: value.candidate_id,
    title: value.title,
    authors: Array.isArray(value.authors) ? value.authors : [],
    year: typeof value.year === "number" ? value.year : null,
    venue: value.venue ?? null,
    doi: value.doi ?? null,
    openalex_id: value.openalex_id ?? null,
    crossref_id: value.crossref_id ?? null,
    abstract: value.abstract ?? null,
    landing_page_url: value.landing_page_url ?? null,
    pdf_url: value.pdf_url ?? null,
    open_access_status: value.open_access_status ?? "metadata_only",
    relevance_score: typeof value.relevance_score === "number" ? value.relevance_score : null,
    rank: typeof value.rank === "number" ? value.rank : 999,
    provider: value.provider ?? "unknown",
    reasons: Array.isArray(value.reasons) ? value.reasons : [],
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
    candidate_markers: value.candidate_markers,
    selection_history: value.selection_history,
    query_variants: value.query_variants,
    replacement_for_source_ids: value.replacement_for_source_ids,
    replacement_rationale: value.replacement_rationale,
    previous_rank: value.previous_rank ?? null,
    rerank_score: value.rerank_score,
  };
}

function readCandidateSourcesFromFolder(folder: string | null) {
  if (!folder) {
    return [];
  }

  const artifact = readJsonIfExists<{ candidates?: CandidateSource[] }>(
    path.join(folder, "candidate-sources.json"),
  );
  return (artifact?.candidates ?? []).map(normalizeCandidateSource);
}

function loadPreviousSelectionContext(avoidSelectedFrom: string | null): PreviousSelectionContext {
  if (!avoidSelectedFrom) {
    return {
      avoidSelectedFrom: null,
      sourceCandidateRunFolder: null,
      selectedReferenceIds: new Set(),
      rejectedReferenceIds: new Set(),
      weakSourceIds: new Set(),
      previousCandidates: [],
    };
  }

  const resolvedRunFolder = path.resolve(avoidSelectedFrom);
  const runSummary = readJsonIfExists<{
    source_candidate_run_folder?: string;
    selected_reference_ids?: string[];
  }>(path.join(resolvedRunFolder, "run-summary.json"));
  const sourceSelection = readJsonIfExists<{
    run_folder?: string;
    selected_reference_ids?: string[];
    rejected_reference_ids?: string[];
  }>(path.join(resolvedRunFolder, "source-selection.json"));
  const replacementReport = readJsonIfExists<{
    low_relevance_source_ids?: string[];
    missing_or_weak_public_content_source_ids?: string[];
    wrong_pdf_risk_source_ids?: string[];
  }>(path.join(resolvedRunFolder, "source-replacement-report.json"));
  const candidateRunFolder =
    runSummary?.source_candidate_run_folder ??
    sourceSelection?.run_folder ??
    (existsSync(path.join(resolvedRunFolder, "candidate-sources.json")) ? resolvedRunFolder : null);

  return {
    avoidSelectedFrom: resolvedRunFolder,
    sourceCandidateRunFolder: candidateRunFolder ? path.resolve(candidateRunFolder) : null,
    selectedReferenceIds: new Set([
      ...(runSummary?.selected_reference_ids ?? []),
      ...(sourceSelection?.selected_reference_ids ?? []),
    ]),
    rejectedReferenceIds: new Set(sourceSelection?.rejected_reference_ids ?? []),
    weakSourceIds: new Set([
      ...(replacementReport?.low_relevance_source_ids ?? []),
      ...(replacementReport?.missing_or_weak_public_content_source_ids ?? []),
      ...(replacementReport?.wrong_pdf_risk_source_ids ?? []),
    ]),
    previousCandidates: readCandidateSourcesFromFolder(candidateRunFolder ? path.resolve(candidateRunFolder) : null),
  };
}

function candidateMentionsPeruOrLatinAmerica(candidate: CandidateSource) {
  const blob = normalizeForDedup(
    [candidate.title, candidate.abstract, candidate.venue].filter(Boolean).join(" "),
  );
  return /\b(peru|peruvian|peruano|peruana|peruanos|peruanas|lima|latin america|latinoamerica|america latina|chile|mexico|colombia|ecuador)\b/.test(
    blob,
  );
}

function candidateMatchesGroup(blob: string, group: BlueprintLaunchKeywordGroup) {
  return group.variants.some((variant) => {
    const normalized = normalizeForDedup(variant);
    return normalized.length > 0 && blob.includes(normalized);
  });
}

function candidateKeywordFit(candidate: CandidateSource, profile: CandidateSearchProfile | null) {
  const blob = normalizeForDedup(
    [candidate.title, candidate.abstract, candidate.venue].filter(Boolean).join(" "),
  );

  if (!profile) {
    return {
      score: 0,
      necessaryMatches: [] as string[],
      complementaryMatches: [] as string[],
      optionalMatches: [] as string[],
      focusTermMatches: [] as string[],
    };
  }

  const necessaryMatches = profile.keywordGroups.necessary
    .filter((group) => candidateMatchesGroup(blob, group))
    .map((group) => group.label);
  const complementaryMatches = profile.keywordGroups.complementary
    .filter((group) => candidateMatchesGroup(blob, group))
    .map((group) => group.label);
  const optionalMatches = profile.keywordGroups.optional
    .filter((group) => candidateMatchesGroup(blob, group))
    .map((group) => group.label);
  const primaryObjectMatches = profile.primaryObjectTerms.filter((term) => {
    const normalized = normalizeForDedup(term);
    return normalized.length > 0 && blob.includes(normalized);
  });
  const focusTermMatches = profile.focusTerms
    .filter((term) => {
      const normalized = normalizeForDedup(term);
      return normalized.length > 0 && blob.includes(normalized);
    })
    .slice(0, 8);

  return {
    score:
      necessaryMatches.length * 12 +
      complementaryMatches.length * 8 +
      optionalMatches.length * 3 +
      Math.min(focusTermMatches.length * 2, 8) +
      (primaryObjectMatches.length > 0 ? 42 : -18),
    necessaryMatches,
    complementaryMatches,
    optionalMatches,
    primaryObjectMatches,
    focusTermMatches,
  };
}

function candidateDomainFitScore(candidate: CandidateSource, profile: CandidateSearchProfile | null) {
  const keywordFit = candidateKeywordFit(candidate, profile);
  if (profile) {
    return keywordFit.score;
  }

  return 0;
}

function candidateHasPublicAccessSignal(candidate: CandidateSource) {
  return Boolean(candidate.pdf_url) || candidate.open_access_status !== "metadata_only";
}

function mergeCandidate(existing: CandidateSource, incoming: CandidateSource) {
  const existingScore = existing.relevance_score ?? -1;
  const incomingScore = incoming.relevance_score ?? -1;
  const preferred = incomingScore > existingScore ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;

  return {
    ...preferred,
    authors: preferred.authors.length > 0 ? preferred.authors : secondary.authors,
    year: preferred.year ?? secondary.year,
    venue: preferred.venue ?? secondary.venue,
    doi: preferred.doi ?? secondary.doi,
    openalex_id: preferred.openalex_id ?? secondary.openalex_id,
    crossref_id: preferred.crossref_id ?? secondary.crossref_id,
    abstract: preferred.abstract ?? secondary.abstract,
    landing_page_url: preferred.landing_page_url ?? secondary.landing_page_url,
    pdf_url: preferred.pdf_url ?? secondary.pdf_url,
    open_access_status:
      preferred.open_access_status !== "metadata_only"
        ? preferred.open_access_status
        : secondary.open_access_status,
    reasons: uniqueStrings([...existing.reasons, ...incoming.reasons]),
    warnings: uniqueStrings([...existing.warnings, ...incoming.warnings]),
    candidate_markers: uniqueStrings([
      ...(existing.candidate_markers ?? []),
      ...(incoming.candidate_markers ?? []),
    ]) as CandidateMarker[],
    query_variants: uniqueStrings([
      ...(existing.query_variants ?? []),
      ...(incoming.query_variants ?? []),
    ]),
    replacement_for_source_ids: uniqueStrings([
      ...(existing.replacement_for_source_ids ?? []),
      ...(incoming.replacement_for_source_ids ?? []),
    ]),
    replacement_rationale: uniqueStrings([
      ...(existing.replacement_rationale ?? []),
      ...(incoming.replacement_rationale ?? []),
    ]),
    previous_rank: existing.previous_rank ?? incoming.previous_rank ?? null,
  } satisfies CandidateSource;
}

function buildMergedCandidateSet(input: {
  previousContext: PreviousSelectionContext;
  discoveredCandidates: CandidateSource[];
  maxCandidates: number;
  profile: CandidateSearchProfile | null;
}) {
  const byKey = new Map<string, CandidateSource>();
  const keyAlias = new Map<string, string>();

  function upsert(candidate: CandidateSource) {
    const keys = candidateDedupKeys(candidate);
    const existingKey = keys.map((key) => keyAlias.get(key)).find(Boolean);
    const primaryKey = existingKey ?? candidatePrimaryDedupKey(candidate);
    const existing = byKey.get(primaryKey);
    const next = existing ? mergeCandidate(existing, candidate) : candidate;

    byKey.set(primaryKey, next);
    for (const key of keys) {
      keyAlias.set(key, primaryKey);
    }
  }

  for (const previous of input.previousContext.previousCandidates) {
    upsert({
      ...previous,
      previous_rank: previous.rank,
      candidate_markers: uniqueStrings([
        ...(previous.candidate_markers ?? []),
        "previous_candidate",
      ]) as CandidateMarker[],
      query_variants: uniqueStrings([...(previous.query_variants ?? []), "previous-run"]),
    });
  }

  for (const discovered of input.discoveredCandidates) {
    upsert(discovered);
  }

  const selectedKeys = new Set<string>();
  const rejectedKeys = new Set<string>();

  for (const candidate of input.previousContext.previousCandidates) {
    const ids = [candidate.candidate_id, candidate.doi, candidate.openalex_id, candidate.crossref_id]
      .filter((value): value is string => Boolean(value))
      .map(normalizeForDedup);

    if (ids.some((id) => input.previousContext.selectedReferenceIds.has(id) || input.previousContext.selectedReferenceIds.has(candidate.candidate_id))) {
      for (const key of candidateDedupKeys(candidate)) selectedKeys.add(key);
    }
    if (ids.some((id) => input.previousContext.rejectedReferenceIds.has(id) || input.previousContext.rejectedReferenceIds.has(candidate.candidate_id))) {
      for (const key of candidateDedupKeys(candidate)) rejectedKeys.add(key);
    }
  }

  const weakIds = input.previousContext.weakSourceIds;
  const selectedIds = input.previousContext.selectedReferenceIds;
  const rejectedIds = input.previousContext.rejectedReferenceIds;

  const enriched = [...byKey.values()].map((candidate) => {
    const keys = candidateDedupKeys(candidate);
    const directIds = [candidate.candidate_id, candidate.doi, candidate.openalex_id, candidate.crossref_id]
      .filter((value): value is string => Boolean(value));
    const isSelected =
      directIds.some((id) => selectedIds.has(id)) ||
      directIds.map(normalizeForDedup).some((id) => selectedIds.has(id)) ||
      keys.some((key) => selectedKeys.has(key));
    const isRejected =
      directIds.some((id) => rejectedIds.has(id)) ||
      directIds.map(normalizeForDedup).some((id) => rejectedIds.has(id)) ||
      keys.some((key) => rejectedKeys.has(key));
    const isPrevious = (candidate.candidate_markers ?? []).includes("previous_candidate");
    const keywordFit = candidateKeywordFit(candidate, input.profile);
    const domainFitScore = candidateDomainFitScore(candidate, input.profile);
    const possibleReplacement =
      !isSelected &&
      !isRejected &&
      domainFitScore >= 16 &&
      (candidateHasPublicAccessSignal(candidate) ||
        candidateMentionsPeruOrLatinAmerica(candidate) ||
        (candidate.relevance_score ?? 0) >= 35);
    const markers = uniqueStrings([
      ...(candidate.candidate_markers ?? []),
      isPrevious ? "previous_candidate" : "new_candidate",
      isSelected ? "previously_selected" : "",
      isRejected ? "previously_rejected" : "",
      possibleReplacement ? "possible_replacement" : "",
    ]) as CandidateMarker[];
    const replacementFor = possibleReplacement
      ? [...weakIds]
      : [];
    const replacementRationale = possibleReplacement
      ? uniqueStrings([
          candidateHasPublicAccessSignal(candidate)
            ? "Tiene senal de acceso publico o PDF en metadatos."
            : "",
          candidateMentionsPeruOrLatinAmerica(candidate)
            ? "Menciona Peru, America Latina o un contexto regional comparable."
            : "",
          (candidate.relevance_score ?? 0) >= 35
            ? "Tiene score de relevancia suficiente para revision humana."
            : "",
          keywordFit.necessaryMatches.length > 0
            ? `Coincide con categorias necesarias: ${keywordFit.necessaryMatches.join(", ")}.`
            : "",
          keywordFit.complementaryMatches.length > 0
            ? `Coincide con categorias complementarias: ${keywordFit.complementaryMatches.join(", ")}.`
            : "",
        ])
      : [];
    const rerankScore =
      (candidate.relevance_score ?? 0) +
      domainFitScore +
      (markers.includes("new_candidate") ? 20 : -4) +
      (markers.includes("possible_replacement") ? 10 : 0) +
      (candidateHasPublicAccessSignal(candidate) ? 6 : 0) +
      (candidateMentionsPeruOrLatinAmerica(candidate) ? 5 : 0) +
      (isSelected ? -100 : 0) +
      (isRejected ? -60 : 0) +
      (domainFitScore < 16 ? -40 : 0) +
      (!candidate.abstract ? -4 : 0);

    return {
      ...candidate,
      candidate_markers: markers,
      selection_history: isSelected
        ? "previously_selected"
        : isRejected
          ? "previously_rejected"
          : isPrevious
            ? "previous_candidate"
            : "not_previously_seen",
      replacement_for_source_ids: replacementFor,
      replacement_rationale: replacementRationale,
      rerank_score: Number(rerankScore.toFixed(3)),
    } satisfies CandidateSource;
  });

  return enriched
    .sort((left, right) => (right.rerank_score ?? 0) - (left.rerank_score ?? 0))
    .slice(0, input.maxCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function renderCandidateSummaryMarkdown(input: {
  fixture: IntakeFixture;
  candidates: CandidateSource[];
  attemptedQueries: string[];
  searchQuery: string | null;
  expand: boolean;
  queryVariants?: ExpandedQueryVariant[];
  avoidSelectedFrom?: string | null;
}) {
  const replacementCandidates = input.candidates.filter((candidate) =>
    candidate.candidate_markers?.includes("possible_replacement"),
  );
  const lines: string[] = [
    `# Candidate source summary`,
    ``,
    `Case: ${input.fixture.case_id}`,
    `Topic: ${input.fixture.intake.topic}`,
    `Search query: ${input.searchQuery ?? "n/a"}`,
    `Attempted queries: ${input.attemptedQueries.join("; ") || "n/a"}`,
    `Expanded mode: ${input.expand ? "yes" : "no"}`,
    input.avoidSelectedFrom ? `Avoid/down-rank selected from: ${input.avoidSelectedFrom}` : "",
    ``,
  ].filter((line) => line !== "");

  if (input.expand) {
    lines.push(
      `## Top replacement candidates`,
      ``,
    );

    if (replacementCandidates.length === 0) {
      lines.push(`No replacement candidates were clearly identified.`, ``);
    } else {
      for (const candidate of replacementCandidates.slice(0, 10)) {
        lines.push(
          `### ${candidate.rank}. ${candidate.title}`,
          ``,
          `- Candidate id: ${candidate.candidate_id}`,
          `- Markers: ${candidate.candidate_markers?.join(", ") ?? "none"}`,
          `- Replaces/reviews weak sources: ${
            candidate.replacement_for_source_ids?.join(", ") || "general source-set replacement"
          }`,
          `- Why it may replace weak sources: ${
            candidate.replacement_rationale?.join(" ") || candidate.reasons.join(" ") || "Requires human review."
          }`,
          `- Public full-text/PDF signal: ${candidate.pdf_url ?? candidate.open_access_status}`,
          `- Peru/Latin America relevance: ${
            candidateMentionsPeruOrLatinAmerica(candidate) ? "yes or regional signal detected" : "not obvious"
          }`,
          `- Warnings: ${candidate.warnings.join(" ") || "None."}`,
          ``,
        );
      }
    }

    lines.push(`## Query variants`, ``);
    for (const variant of input.queryVariants ?? []) {
      lines.push(`- ${variant.name}: ${variant.query} (${variant.rationale})`);
    }
    lines.push(``);
  }

  lines.push(
    `## Ranked candidates`,
    ``,
  );

  for (const candidate of input.candidates) {
    lines.push(
      `### ${candidate.rank}. ${candidate.title}`,
      ``,
      `- Candidate id: ${candidate.candidate_id}`,
      `- Markers: ${candidate.candidate_markers?.join(", ") ?? "new_candidate"}`,
      `- Selection history: ${candidate.selection_history ?? "not_previously_seen"}`,
      `- Year: ${candidate.year ?? "n/a"}`,
      `- Provider: ${candidate.provider}`,
      `- DOI/link: ${candidate.doi ?? candidate.landing_page_url ?? "n/a"}`,
      `- PDF: ${candidate.pdf_url ?? "not detected"}`,
      `- Score/rank: ${candidate.relevance_score ?? "n/a"}`,
      `- Abstract snippet: ${abstractSnippet(candidate.abstract)}`,
      `- Why useful: ${candidate.reasons.join(" ") || "Requires human review."}`,
      `- Warnings: ${candidate.warnings.join(" ") || "None."}`,
      ``,
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildSourceSelectionTemplate(fixture: IntakeFixture, candidates: CandidateSource[]) {
  return {
    case_id: fixture.case_id,
    selection_status: "pending",
    instructions_es:
      "Revise las fuentes candidatas antes de continuar con resolucion de acceso, materializacion, extraccion y consolidacion. Seleccione solo fuentes pertinentes, trazables y con contenido publico suficiente cuando sea posible.",
    selected_reference_ids: [],
    rejected_reference_ids: [],
    notes_es:
      "Este archivo es una plantilla para el checkpoint humano. No hay fuentes seleccionadas automaticamente en esta etapa.",
    candidates: candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      title: candidate.title,
      year: candidate.year,
      doi: candidate.doi,
      provider: candidate.provider,
      rank: candidate.rank,
      candidate_markers: candidate.candidate_markers ?? ["new_candidate"],
      selection_history: candidate.selection_history ?? "not_previously_seen",
      replacement_rationale: candidate.replacement_rationale ?? [],
    })),
  };
}

function candidateFilesOutput(caseId: string) {
  const timestamp = timestampForPath();
  const outputFolder = path.join(OUTPUT_ROOT, caseId, timestamp);
  mkdirSync(outputFolder, { recursive: true });
  return outputFolder;
}

async function collectCandidates(input: {
  fixture: IntakeFixture;
  intake: IntakeInput;
  expand: boolean;
  maxCandidates: number;
  queryVariant: string | null;
  previousContext: PreviousSelectionContext;
  secondaryReferenceQueue?: SecondaryReferenceRecoveryQueue | null;
  plannerMode: CliArgs["plannerMode"];
}) {
  const searchIntake = buildLabASearchInput(input.fixture, input.intake);
  const searchKnowledgeAreaLabel = buildLabASearchKnowledgeAreaLabel(input.fixture, input.intake);
  const baseMetadata = await buildCandidateSearchMetadata({
    intake: searchIntake,
    knowledgeAreaLabel: searchKnowledgeAreaLabel,
    plannerMode: input.plannerMode,
  });
  const searchProfile = buildCandidateSearchProfile(baseMetadata);
  const discoveredCandidates: CandidateSource[] = [];
  const attemptedQueries: string[] = [];
  const baseQueryVariants = input.expand
    ? selectExpandedQueryVariants(
        buildExpandedQueryVariantsFromMetadata({
          metadata: baseMetadata,
          fixture: input.fixture,
          intake: input.intake,
        }),
        input.queryVariant,
      )
    : [];
  const secondaryReferenceQueryVariants = input.expand
    ? buildSecondaryReferenceQueryVariants(input.secondaryReferenceQueue ?? null)
    : [];
  const queryVariants = [...baseQueryVariants, ...secondaryReferenceQueryVariants];
  const contaminationReport = input.expand
    ? inspectExpandedQueryContamination({
        fixture: input.fixture,
        intake: input.intake,
        metadata: baseMetadata,
        variants: baseQueryVariants,
      })
    : { status: "pass", blockers: [] as string[], warnings: [] as string[] };
  let searchQuery: string | null = null;
  let totalResults = 0;
  let metadata: unknown = null;

  if (contaminationReport.blockers.length > 0) {
    throw new Error(
      `Expanded query contamination blocked search: ${contaminationReport.blockers.join(" ")}`,
    );
  }

  if (!input.expand) {
    const snapshot = await searchBlueprintLaunchReferences({
      intake: searchIntake,
      knowledgeAreaLabel: searchKnowledgeAreaLabel,
      desiredTotal: input.fixture.source_policy.max_selected_sources,
      searchMetadataOverride: baseMetadata,
    });

    return {
      candidates: snapshot.references.map((item, index) => ({
        ...mapCandidate(item, index + 1),
        candidate_markers: ["new_candidate"] as CandidateMarker[],
        selection_history: "not_previously_seen" as const,
      })),
      attemptedQueries: snapshot.attemptedQueries,
      searchQuery: snapshot.searchQuery,
      totalResults: snapshot.totalResults,
      metadata: snapshot.metadata,
      queryVariants,
      contaminationReport,
    };
  }

  for (const variant of queryVariants) {
    const variantIntake = buildVariantSearchInput({
      fixture: input.fixture,
      intake: input.intake,
      variant,
    });
    const snapshot = await searchBlueprintLaunchReferences({
      intake: variantIntake,
      knowledgeAreaLabel: `${searchKnowledgeAreaLabel} / ${variant.query}`,
      desiredTotal: input.maxCandidates,
      searchMetadataOverride: buildVariantSearchMetadata({
        baseMetadata,
        variant,
      }),
    });

    searchQuery = searchQuery ?? snapshot.searchQuery;
    metadata = metadata ?? snapshot.metadata;
    totalResults += snapshot.totalResults;
    attemptedQueries.push(...snapshot.attemptedQueries.map((query) => `${variant.name}: ${query}`));
    discoveredCandidates.push(
      ...snapshot.references.map((item, index) => ({
        ...mapCandidate(item, index + 1),
        candidate_markers: ["new_candidate"] as CandidateMarker[],
        selection_history: "not_previously_seen" as const,
        query_variants: [variant.name],
        reasons: uniqueStrings([
          ...candidateReasons(item),
          `Variante expandida: ${variant.name}.`,
          variant.rationale,
        ]),
      })),
    );
  }

  const candidates = buildMergedCandidateSet({
    previousContext: input.previousContext,
    discoveredCandidates,
    maxCandidates: input.maxCandidates,
    profile: searchProfile,
  });

  return {
    candidates,
    attemptedQueries,
    searchQuery,
    totalResults,
    metadata: {
      first_snapshot_metadata: metadata,
      base_search_metadata: baseMetadata,
      expanded_query_variants: queryVariants,
      secondary_reference_query_variants: secondaryReferenceQueryVariants,
      expanded_query_contamination_report: contaminationReport,
      previous_candidate_run_folder: input.previousContext.sourceCandidateRunFolder,
      avoid_selected_from: input.previousContext.avoidSelectedFrom,
    },
    queryVariants,
    contaminationReport,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const args = parseArgs();
  const fixturePath = fixturePathFor(args.caseIdOrPath);
  const fixture = readFixture(fixturePath);
  const outputFolder = candidateFilesOutput(fixture.case_id);
  const previousContext = loadPreviousSelectionContext(args.avoidSelectedFrom);
  const secondaryReferenceQueue = loadSecondaryReferenceQueue(args.secondaryReferenceQueue);
  const fixtureValidation = validateFixture(fixture);
  let normalizedIntakeContext: unknown = null;
  let candidateSources: CandidateSource[] = [];
  let candidateSummaryMarkdown = "";
  let sourceSelectionTemplate: unknown = null;
  let queryVariants: ExpandedQueryVariant[] = [];
  const errors: string[] = [];
  const searchWarnings: string[] = [];
  let searchSnapshotSummary: {
    search_query: string | null;
    attempted_queries: string[];
    total_results: number;
    metadata: unknown;
  } | null = null;

  writeJsonFile(path.join(outputFolder, "intake-fixture.json"), fixture);

  try {
    if (fixtureValidation.blockers.length > 0) {
      throw new Error(`Fixture validation failed: ${fixtureValidation.blockers.join(" ")}`);
    }

    const intake = parseIntakeInput(fixture.intake);
    normalizedIntakeContext = buildDeterministicNormalizedIntakeContext(fixture, intake);
    writeJsonFile(
      path.join(outputFolder, "normalized-intake-context.json"),
      normalizedIntakeContext,
    );

    const searchResult = await collectCandidates({
      fixture,
      intake,
      expand: args.expand,
      maxCandidates: args.maxCandidates,
      queryVariant: args.queryVariant,
      previousContext,
      secondaryReferenceQueue,
      plannerMode: args.plannerMode,
    });

    candidateSources = searchResult.candidates;
    queryVariants = searchResult.queryVariants;
    searchWarnings.push(...searchResult.contaminationReport.warnings);
    candidateSummaryMarkdown = renderCandidateSummaryMarkdown({
      fixture,
      candidates: candidateSources,
      attemptedQueries: searchResult.attemptedQueries,
      searchQuery: searchResult.searchQuery,
      expand: args.expand,
      queryVariants,
      avoidSelectedFrom: previousContext.avoidSelectedFrom,
    });
    sourceSelectionTemplate = buildSourceSelectionTemplate(fixture, candidateSources);
    searchSnapshotSummary = {
      search_query: searchResult.searchQuery,
      attempted_queries: searchResult.attemptedQueries,
      total_results: searchResult.totalResults,
      metadata: searchResult.metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown candidate search error.";
    errors.push(message);

    if (!normalizedIntakeContext) {
      try {
        const intake = parseIntakeInput(fixture.intake);
        normalizedIntakeContext = buildDeterministicNormalizedIntakeContext(fixture, intake);
      } catch {
        normalizedIntakeContext = {
          normalization_mode: "failed",
          llm_used: false,
        };
      }
    }

    candidateSummaryMarkdown = [
      "# Candidate source summary",
      "",
      `Case: ${fixture.case_id}`,
      "",
      "Candidate search failed gracefully.",
      "",
      `Error: ${message}`,
      "",
    ].join("\n");
    sourceSelectionTemplate = buildSourceSelectionTemplate(fixture, []);
  }

  writeJsonFile(path.join(outputFolder, "normalized-intake-context.json"), normalizedIntakeContext);
  const plannerStatus = plannerStatusFromSearchSummary(searchSnapshotSummary);
  writeJsonFile(path.join(outputFolder, "candidate-sources.json"), {
    case_id: fixture.case_id,
    generated_at: new Date().toISOString(),
    search_mode: args.expand ? "expanded_replacement_search" : "initial_candidate_search",
    max_candidates_requested: args.maxCandidates,
    query_variant: args.queryVariant,
    avoid_selected_from: previousContext.avoidSelectedFrom,
    secondary_reference_queue_path: args.secondaryReferenceQueue,
    secondary_reference_queue_candidate_count: secondaryReferenceQueue?.candidates?.length ?? 0,
    previous_candidate_run_folder: previousContext.sourceCandidateRunFolder,
    live_provider_calls: {
      openalex: fixture.source_policy.providers.includes("openalex"),
      crossref: fixture.source_policy.providers.includes("crossref"),
      openai: plannerStatus.llmUsed,
      pdf_download: false,
      pdf_extraction: false,
    },
    planner_mode: args.plannerMode,
    planner_status: plannerStatus.plannerStatus,
    planner_plan_source: plannerStatus.planSource,
    llm_planner_available: hasOpenAiPlannerKey(),
    search_snapshot_summary: searchSnapshotSummary,
    expanded_query_variants: queryVariants,
    expanded_query_contamination_warnings: searchWarnings,
    candidate_counts: {
      total: candidateSources.length,
      new_candidates: candidateSources.filter((candidate) =>
        candidate.candidate_markers?.includes("new_candidate"),
      ).length,
      previous_candidates: candidateSources.filter((candidate) =>
        candidate.candidate_markers?.includes("previous_candidate"),
      ).length,
      previously_selected: candidateSources.filter((candidate) =>
        candidate.candidate_markers?.includes("previously_selected"),
      ).length,
      possible_replacements: candidateSources.filter((candidate) =>
        candidate.candidate_markers?.includes("possible_replacement"),
      ).length,
    },
    candidates: candidateSources,
  });
  writeFileSync(
    path.join(outputFolder, "candidate-sources-summary.md"),
    candidateSummaryMarkdown,
    "utf8",
  );
  writeJsonFile(path.join(outputFolder, "source-selection-template.json"), sourceSelectionTemplate);

  const runSummary = {
    run_id: `evidence-candidate-search-${fixture.case_id}-${path.basename(outputFolder)}`,
    case_id: fixture.case_id,
    case_name: fixture.case_name,
    project_id: fixture.project_id,
    user_id: fixture.user_id,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: errors.length > 0 ? "failed_gracefully" : "completed",
    search_mode: args.expand ? "expanded_replacement_search" : "initial_candidate_search",
    expanded: args.expand,
    max_candidates_requested: args.maxCandidates,
    query_variant: args.queryVariant,
    avoid_selected_from: previousContext.avoidSelectedFrom,
    previous_candidate_run_folder: previousContext.sourceCandidateRunFolder,
    secondary_reference_queue_path: args.secondaryReferenceQueue,
    secondary_reference_queue_candidate_count: secondaryReferenceQueue?.candidates?.length ?? 0,
    intake_validation_status: fixtureValidation.blockers.length === 0 ? "pass" : "blocked",
    source_selection_required: fixture.source_selection_checkpoint.required,
    source_selection_status: "pending",
    candidate_count: candidateSources.length,
    new_candidate_count: candidateSources.filter((candidate) =>
      candidate.candidate_markers?.includes("new_candidate"),
    ).length,
    previous_candidate_count: candidateSources.filter((candidate) =>
      candidate.candidate_markers?.includes("previous_candidate"),
    ).length,
    possible_replacement_count: candidateSources.filter((candidate) =>
      candidate.candidate_markers?.includes("possible_replacement"),
    ).length,
    providers_requested: fixture.source_policy.providers,
    openai_called: plannerStatus.llmUsed,
    planner_mode: args.plannerMode,
    planner_status: plannerStatus.plannerStatus,
    planner_plan_source: plannerStatus.planSource,
    llm_planner_available: hasOpenAiPlannerKey(),
    live_retrieval_called: errors.length > 0 ? "attempted" : "completed",
    steps_executed: ["intake_parse", "deterministic_intake_context", "candidate_source_search"],
    steps_not_executed: [
      "source_materialization",
      "pdf_download",
      "pdf_extraction",
      "step_5_extraction",
      "step_6_consolidation",
      "lab_b_generation",
      "docx_rendering",
    ],
    warnings: uniqueStrings([...fixtureValidation.warnings, ...searchWarnings]),
    errors,
    output_folder: outputFolder,
  };

  writeJsonFile(path.join(outputFolder, "run-summary.json"), runSummary);
  console.log(JSON.stringify(runSummary, null, 2));

  if (errors.length > 0) {
    process.exit(1);
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(__filename)) {
  main();
}
