import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { searchBlueprintLaunchReferences } from "@/blueprint_launch/server/local-reference-search";
import type { BlueprintLaunchReferenceListItem } from "@/blueprint_launch/server/local-playground-store";
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
};

type ExpandedQueryVariant = {
  name: string;
  query: string;
  language: "es" | "en";
  focusTerms: string[];
  rationale: string;
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
    }
  }

  return {
    caseIdOrPath,
    expand,
    maxCandidates,
    queryVariant,
    avoidSelectedFrom,
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

function hasAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function appendSearchTerms(value: string | undefined, terms: string[]) {
  const normalized = normalizeWhitespace(value);
  const suffix = terms.filter((term) => !normalized.toLowerCase().includes(term.toLowerCase()));
  return normalizeWhitespace([normalized, ...suffix].join(" "));
}

function buildLabASearchInput(fixture: IntakeFixture, intake: IntakeInput): IntakeInput {
  const blob = [
    fixture.project_context.knowledge_area_label,
    intake.topic,
    intake.problemContext,
    intake.researchLine,
    intake.targetPopulation,
    intake.preferredMethodology,
  ]
    .filter(Boolean)
    .join(" ");

  if (hasAny(blob, ["aislador", "aislamiento sismico", "aislamiento sísmico"])) {
    return {
      ...intake,
      topic: appendSearchTerms(intake.topic, [
        "seismic isolation",
        "base isolation",
        "isolated buildings",
        "Peru",
      ]),
      problemContext: appendSearchTerms(intake.problemContext, [
        "seismic performance",
        "reinforced concrete buildings",
        "seismic design",
      ]),
      researchLine: appendSearchTerms(intake.researchLine, [
        "seismic isolation",
        "base-isolated structures",
      ]),
      targetPopulation: appendSearchTerms(intake.targetPopulation, [
        "Peruvian buildings",
        "medium-rise buildings",
        "high seismic hazard",
      ]),
      availableData: appendSearchTerms(intake.availableData, [
        "base isolation case studies",
        "performance-based seismic evaluation",
        "seismic codes",
      ]),
      preferredMethodology: appendSearchTerms(intake.preferredMethodology, [
        "comparative review",
        "multi-criteria assessment",
        "seismic isolation criteria",
      ]),
    };
  }

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

function buildLabASearchKnowledgeAreaLabel(fixture: IntakeFixture, intake: IntakeInput) {
  const blob = [
    fixture.project_context.knowledge_area_label,
    intake.topic,
    intake.problemContext,
    intake.researchLine,
    intake.targetPopulation,
  ]
    .filter(Boolean)
    .join(" ");

  if (hasAny(blob, ["aislador", "aislamiento sismico", "aislamiento sísmico"])) {
    return "Seismic isolation and base-isolated buildings";
  }

  return fixture.project_context.knowledge_area_label;
}

function buildExpandedQueryVariants(): ExpandedQueryVariant[] {
  return [
    {
      name: "seismic-isolation-buildings-peru",
      query: "seismic isolation buildings Peru",
      language: "en",
      focusTerms: ["seismic isolation", "buildings", "Peru", "performance"],
      rationale: "Busca evidencia internacional indexada que mencione edificios y Peru.",
    },
    {
      name: "base-isolation-reinforced-concrete-buildings",
      query: "base isolation reinforced concrete buildings",
      language: "en",
      focusTerms: ["base isolation", "reinforced concrete", "buildings", "seismic design"],
      rationale: "Amplia la busqueda tecnica hacia edificios de concreto armado.",
    },
    {
      name: "aisladores-sismicos-edificios-peru",
      query: "aisladores sismicos edificios Peru",
      language: "es",
      focusTerms: ["aisladores sismicos", "edificios", "Peru", "concreto armado"],
      rationale: "Busca resultados en espanol con terminos usados por tesistas y revistas regionales.",
    },
    {
      name: "aislamiento-sismico-edificaciones-peruanas",
      query: "aislamiento sismico edificaciones peruanas",
      language: "es",
      focusTerms: ["aislamiento sismico", "edificaciones peruanas", "desempeno"],
      rationale: "Refuerza el enfoque local peruano y de edificaciones.",
    },
    {
      name: "seismic-isolation-latin-america-buildings",
      query: "seismic isolation Latin America buildings",
      language: "en",
      focusTerms: ["seismic isolation", "Latin America", "buildings", "implementation"],
      rationale: "Busca evidencia regional cuando Peru directo no tenga suficiente cobertura.",
    },
    {
      name: "base-isolation-cost-benefit-buildings",
      query: "base isolation cost-benefit buildings",
      language: "en",
      focusTerms: ["base isolation", "cost-benefit", "buildings", "decision criteria"],
      rationale: "Busca fuentes para reemplazar vacios economicos y de decision multicriterio.",
    },
    {
      name: "desempeno-sismico-edificios-con-aisladores",
      query: "desempeno sismico edificios con aisladores",
      language: "es",
      focusTerms: ["desempeno sismico", "edificios", "aisladores", "reduccion de demanda"],
      rationale: "Busca evidencia tecnica de desempeno en espanol.",
    },
    {
      name: "fragility-seismic-performance-isolated-buildings",
      query: "fragility seismic performance isolated buildings",
      language: "en",
      focusTerms: ["fragility", "seismic performance", "isolated buildings", "risk"],
      rationale: "Busca evidencia cuantitativa de desempeno y fragilidad.",
    },
    {
      name: "implementation-barriers-seismic-isolation-developing-countries",
      query: "implementation barriers seismic isolation developing countries",
      language: "en",
      focusTerms: ["implementation barriers", "seismic isolation", "developing countries", "adoption"],
      rationale: "Busca evidencia para barreras normativas, economicas y constructivas.",
    },
  ];
}

function selectExpandedQueryVariants(requested: string | null) {
  const variants = buildExpandedQueryVariants();

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

async function runWithoutLlmPlanner<T>(work: () => Promise<T>) {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousProvider = process.env.LLM_PROVIDER;

  delete process.env.OPENAI_API_KEY;
  process.env.LLM_PROVIDER = "openai";

  try {
    return await work();
  } finally {
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }

    if (previousProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = previousProvider;
    }
  }
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

function candidateDomainFitScore(candidate: CandidateSource) {
  const blob = normalizeForDedup(
    [candidate.title, candidate.abstract, candidate.venue].filter(Boolean).join(" "),
  );
  let score = 0;

  if (/\b(aislador|aisladores|aislamiento sismico|base isolation|seismic isolation|isolated building|isolated buildings|base-isolated)\b/.test(blob)) {
    score += 24;
  }
  if (/\b(disipador|disipadores|amortiguador|amortiguadores|damper|dampers|viscous damper|seismic control)\b/.test(blob)) {
    score += 12;
  }
  if (/\b(sismico|sismica|sismicos|seismic|earthquake)\b/.test(blob)) {
    score += 8;
  }
  if (/\b(edificio|edificios|edificacion|edificaciones|building|buildings|concreto armado|reinforced concrete|estructura|estructuras)\b/.test(blob)) {
    score += 8;
  }
  if (/\b(desempeno|performance|fragility|fragilidad|cost|costo|benefit|beneficio|norma|code|barrier|barrera)\b/.test(blob)) {
    score += 4;
  }

  return score;
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
    const domainFitScore = candidateDomainFitScore(candidate);
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
            ? "Tiene mejor score de relevancia que el set bloqueado."
            : "",
          domainFitScore >= 24
            ? "Mantiene ajuste tematico con aislamiento, control sismico o edificios."
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
}) {
  const searchIntake = buildLabASearchInput(input.fixture, input.intake);
  const searchKnowledgeAreaLabel = buildLabASearchKnowledgeAreaLabel(input.fixture, input.intake);
  const discoveredCandidates: CandidateSource[] = [];
  const attemptedQueries: string[] = [];
  const queryVariants = input.expand ? selectExpandedQueryVariants(input.queryVariant) : [];
  let searchQuery: string | null = null;
  let totalResults = 0;
  let metadata: unknown = null;

  if (!input.expand) {
    const snapshot = await runWithoutLlmPlanner(() =>
      searchBlueprintLaunchReferences({
        intake: searchIntake,
        knowledgeAreaLabel: searchKnowledgeAreaLabel,
        desiredTotal: input.fixture.source_policy.max_selected_sources,
      }),
    );

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
    };
  }

  for (const variant of queryVariants) {
    const variantIntake = buildVariantSearchInput({
      fixture: input.fixture,
      intake: input.intake,
      variant,
    });
    const snapshot = await runWithoutLlmPlanner(() =>
      searchBlueprintLaunchReferences({
        intake: variantIntake,
        knowledgeAreaLabel: `${searchKnowledgeAreaLabel} / ${variant.query}`,
        desiredTotal: input.maxCandidates,
      }),
    );

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
  });

  return {
    candidates,
    attemptedQueries,
    searchQuery,
    totalResults,
    metadata: {
      first_snapshot_metadata: metadata,
      expanded_query_variants: queryVariants,
      previous_candidate_run_folder: input.previousContext.sourceCandidateRunFolder,
      avoid_selected_from: input.previousContext.avoidSelectedFrom,
    },
    queryVariants,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const args = parseArgs();
  const fixturePath = fixturePathFor(args.caseIdOrPath);
  const fixture = readFixture(fixturePath);
  const outputFolder = candidateFilesOutput(fixture.case_id);
  const previousContext = loadPreviousSelectionContext(args.avoidSelectedFrom);
  const fixtureValidation = validateFixture(fixture);
  let normalizedIntakeContext: unknown = null;
  let candidateSources: CandidateSource[] = [];
  let candidateSummaryMarkdown = "";
  let sourceSelectionTemplate: unknown = null;
  let queryVariants: ExpandedQueryVariant[] = [];
  const errors: string[] = [];
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
    });

    candidateSources = searchResult.candidates;
    queryVariants = searchResult.queryVariants;
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
  writeJsonFile(path.join(outputFolder, "candidate-sources.json"), {
    case_id: fixture.case_id,
    generated_at: new Date().toISOString(),
    search_mode: args.expand ? "expanded_replacement_search" : "initial_candidate_search",
    max_candidates_requested: args.maxCandidates,
    query_variant: args.queryVariant,
    avoid_selected_from: previousContext.avoidSelectedFrom,
    previous_candidate_run_folder: previousContext.sourceCandidateRunFolder,
    live_provider_calls: {
      openalex: fixture.source_policy.providers.includes("openalex"),
      crossref: fixture.source_policy.providers.includes("crossref"),
      openai: false,
      pdf_download: false,
      pdf_extraction: false,
    },
    search_snapshot_summary: searchSnapshotSummary,
    expanded_query_variants: queryVariants,
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
    openai_called: false,
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
    warnings: fixtureValidation.warnings,
    errors,
    output_folder: outputFolder,
  };

  writeJsonFile(path.join(outputFolder, "run-summary.json"), runSummary);
  console.log(JSON.stringify(runSummary, null, 2));

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
