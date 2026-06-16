import path from "node:path";

import {
  DegreeLevel,
  ProjectStatus,
  Provider,
  TemplateKey,
  TopicOriginType,
  TopicSelectionStatus,
  University,
  type TemplateKey as TemplateKeyValue,
  type University as UniversityValue,
} from "@prisma/client";

import {
  readBlueprintLaunchLocalState,
  type BlueprintLaunchReferenceListItem,
  type BlueprintLaunchSelectedSourceBundleItem,
} from "@/blueprint_launch/server/local-playground-store";
import type {
  LoadedMasterBlueprintLabFixtureSet,
  MasterBlueprintLabFixtureSet,
} from "@/server/blueprint-v2/lab/types";
import type {
  AssumptionInput,
  BlueprintSourceRecord,
  EvidenceSnippet,
  ExtractedEvidencePack,
  MasterBlueprintEngineProject,
  PdfDownloadResult,
} from "@/server/blueprint-v2/types";

const BLUEPRINT_LAUNCH_CASE_NAME = "blueprint-launch-latest";

type BlueprintLaunchProjectContext = {
  university: UniversityValue;
  program: string;
  templateKey: TemplateKeyValue;
};

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstSentence(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/.+?[.!?](?:\s|$)/);
  return (match?.[0] ?? normalized).trim();
}

function clipText(value: string | null | undefined, maxLength = 320) {
  const text = value?.replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function buildProjectContext(knowledgeAreaLabel: string | null): BlueprintLaunchProjectContext {
  const normalized = (knowledgeAreaLabel ?? "").toLowerCase();

  if (normalized.includes("estructur")) {
    return {
      university: University.UPC,
      program: "Maestria en Ingenieria Civil con mencion en Estructuras",
      templateKey: TemplateKey.UPC_POSGRADO,
    };
  }

  if (normalized.includes("civil")) {
    return {
      university: University.UPC,
      program: "Maestria en Ingenieria Civil",
      templateKey: TemplateKey.UPC_POSGRADO,
    };
  }

  if (normalized.includes("operacion")) {
    return {
      university: University.UPC,
      program: "Maestria en Gestion de Operaciones",
      templateKey: TemplateKey.UPC_POSGRADO,
    };
  }

  return {
    university: University.UPC,
    program: "Maestria de laboratorio",
    templateKey: TemplateKey.UPC_POSGRADO,
  };
}

function getSelectedBundleItems(state: Awaited<ReturnType<typeof readBlueprintLaunchLocalState>>) {
  if (state.selectedSourcesBundle?.sources?.length) {
    return state.selectedSourcesBundle.sources;
  }

  return (state.searchSnapshot?.references ?? [])
    .filter((item) => item.selected && item.selectedOrder !== null)
    .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
    .map((item) => ({
      selectedOrder: item.selectedOrder ?? 0,
      relevanceScore: item.relevanceScore,
      scoreLabel: item.scoreBreakdown?.label ?? null,
      reference: item.reference,
    })) as BlueprintLaunchSelectedSourceBundleItem[];
}

function buildSelectedSourceRecord(
  item: BlueprintLaunchSelectedSourceBundleItem,
  sourceId: string,
): BlueprintSourceRecord {
  return {
    source_id: sourceId,
    reference_id: item.reference.id,
    origin: "selected_source",
    label: "Fuente seleccionada desde blueprint-launch",
    title: item.reference.title,
    normalized_title: normalizeTitle(item.reference.title),
    doi: item.reference.doi,
    authors: item.reference.authorsJson,
    year: item.reference.year,
    venue: item.reference.venue,
    abstract: item.reference.abstract,
    landing_page_url: item.reference.landingPageUrl,
    pdf_url: item.reference.pdfAccessible ? item.reference.pdfUrl : null,
    query: null,
    snippet: clipText(item.reference.abstract, 220),
    selected_order: item.selectedOrder,
    citation_count: null,
    is_open_access: item.reference.pdfAccessible,
    raw_openalex_json: null,
    raw_crossref_json: null,
    eligible_for_formal_reference: true,
  };
}

function buildProviderExpansionSource(
  item: BlueprintLaunchReferenceListItem,
  sourceId: string,
  query: string | null,
): BlueprintSourceRecord {
  return {
    source_id: sourceId,
    reference_id: item.reference.id,
    origin: "provider_expansion",
    label: "Fuente complementada desde blueprint-launch",
    title: item.reference.title,
    normalized_title: normalizeTitle(item.reference.title),
    doi: item.reference.doi,
    authors: item.reference.authorsJson,
    year: item.reference.year,
    venue: item.reference.venue,
    abstract: item.reference.abstract,
    landing_page_url: item.reference.landingPageUrl,
    pdf_url: item.reference.pdfAccessible ? item.reference.pdfUrl : null,
    query,
    snippet: clipText(item.reference.abstract, 220),
    selected_order: null,
    citation_count: null,
    is_open_access: item.reference.pdfAccessible,
    raw_openalex_json: null,
    raw_crossref_json: null,
    eligible_for_formal_reference: true,
  };
}

function buildWebContextSource(input: {
  sourceId: string;
  query: string | null;
  snippet: string | null;
}): BlueprintSourceRecord {
  return {
    source_id: input.sourceId,
    reference_id: null,
    origin: "websearch_source",
    label: "Contexto derivado desde blueprint-launch",
    title: "[SINTETICA] Contexto de busqueda reciente en blueprint-launch",
    normalized_title: "sintetica contexto de busqueda reciente en blueprint launch",
    doi: null,
    authors: [],
    year: null,
    venue: "Contexto local de laboratorio",
    abstract: null,
    landing_page_url: null,
    pdf_url: null,
    query: input.query,
    snippet: input.snippet,
    selected_order: null,
    citation_count: null,
    is_open_access: true,
    raw_openalex_json: null,
    raw_crossref_json: null,
    eligible_for_formal_reference: false,
  };
}

function buildEvidencePack(source: BlueprintSourceRecord, intakeTopic: string): ExtractedEvidencePack {
  const titleSnippet: EvidenceSnippet = {
    snippet_id: `${source.source_id}:title`,
    source_id: source.source_id,
    origin: source.origin === "websearch_source" ? "websearch" : "source",
    label: "Titulo del antecedente",
    text: source.title,
    section_hint_keys: ["research_antecedents", "state_of_the_art", "justification"],
    confidence: 0.76,
  };
  const abstractSentence = firstSentence(source.abstract ?? source.snippet);
  const abstractSnippet: EvidenceSnippet | null = abstractSentence
    ? {
        snippet_id: `${source.source_id}:abstract`,
        source_id: source.source_id,
        origin: source.origin === "websearch_source" ? "websearch" : "source",
        label: "Resumen del antecedente",
        text: abstractSentence,
        section_hint_keys: ["problem_statement", "methodology", "research_antecedents"],
        confidence: source.origin === "websearch_source" ? 0.42 : 0.82,
      }
    : null;

  return {
    source_id: source.source_id,
    problem_signal: abstractSentence,
    method_signal: source.origin === "websearch_source" ? null : clipText(source.abstract, 260),
    context_signal:
      source.origin === "websearch_source"
        ? source.snippet
        : `La referencia se vincula con ${intakeTopic.toLowerCase()}.`,
    finding_signal: null,
    limitation_signal:
      source.pdf_url === null
        ? "La referencia no aporta PDF accesible en el ultimo estado de blueprint-launch."
        : null,
    future_line_signal: null,
    abstract_summary: clipText(source.abstract, 420),
    pdf_summary: null,
    pdf_sections: {
      abstract: null,
      methodology: null,
      results: null,
      conclusions: null,
      limitations: null,
      future_work: null,
    },
    snippets: [titleSnippet, ...(abstractSnippet ? [abstractSnippet] : [])],
    assets: [],
  };
}

function buildAssumptions(savedIntakeTopic: string): AssumptionInput[] {
  return [
    {
      assumption_id: "assumption:institution_context",
      statement:
        "La configuracion institucional del caso se deriva localmente para el laboratorio y puede diferir del siguiente entorno productivo.",
      reason:
        "blueprint-launch guarda el intake y las fuentes recientes, pero no fija una universidad operativa definitiva para steps 5-11.",
      section_keys: ["introduction", "problem_statement", "university_context"],
    },
    {
      assumption_id: "assumption:no_pdf_links",
      statement:
        "La ausencia de PDFs accesibles en las fuentes seleccionadas obliga a priorizar metadata, abstracts y assumptions explicitas para sostener el caso.",
      reason:
        "El ultimo estado de blueprint-launch reporta `pdfLinkedCount = 0` en las fuentes seleccionadas.",
      section_keys: ["research_antecedents", "methodology", "scope_and_limitations"],
    },
    {
      assumption_id: "assumption:topic_scope",
      statement: `El lab conserva como foco principal ${savedIntakeTopic.toLowerCase()}.`,
      reason:
        "El escenario se reconstruye a partir del ultimo intake guardado en blueprint-launch y no de un proyecto persistido de produccion.",
      section_keys: ["introduction", "general_objective", "specific_objectives"],
    },
  ];
}

export async function loadBlueprintLaunchLatestFixtureSet(): Promise<LoadedMasterBlueprintLabFixtureSet> {
  const state = await readBlueprintLaunchLocalState();
  const savedIntake = state.savedIntake;
  const selectedItems = getSelectedBundleItems(state);
  const searchSnapshot = state.searchSnapshot;

  if (!savedIntake) {
    throw new Error("No hay intake reciente en blueprint-launch para materializar el lab.");
  }

  if (selectedItems.length === 0) {
    throw new Error("No hay fuentes seleccionadas recientes en blueprint-launch para materializar el lab.");
  }

  const context = buildProjectContext(savedIntake.projectContext.knowledgeAreaLabel);
  const timestamp = new Date();
  const projectId = "lab-project-blueprint-launch-latest";
  const intakeSearchQuery = savedIntake.derivedSearchQuery ?? searchSnapshot?.searchQuery ?? null;
  const selectedSources = selectedItems.map((item, index) =>
    buildSelectedSourceRecord(item, `launch-selected-source-${String(index + 1).padStart(3, "0")}`),
  );
  const providerCandidate = (searchSnapshot?.references ?? []).find((item) => !item.selected) ?? null;
  const providerSource = providerCandidate
    ? buildProviderExpansionSource(
        providerCandidate,
        "launch-provider-source-004",
        searchSnapshot?.searchQuery ?? savedIntake.derivedSearchQuery ?? null,
      )
    : null;
  const webContextSource = buildWebContextSource({
    sourceId: "launch-web-source-005",
    query: searchSnapshot?.searchQuery ?? savedIntake.derivedSearchQuery ?? null,
    snippet: clipText(
      searchSnapshot?.metadata?.intentSummary ?? savedIntake.intake.problemContext ?? null,
      260,
    ),
  });
  const sourceRegistry = [
    ...selectedSources,
    ...(providerSource ? [providerSource] : []),
    webContextSource,
  ];
  const selectedSourceCount = selectedSources.length;
  const minimumRequiredSources = 3;
  const fallbackRequired =
    selectedSourceCount < minimumRequiredSources ||
    selectedSources.every((source) => source.pdf_url === null);

  const sourceGate = {
    minimum_required_sources: minimumRequiredSources,
    selected_source_count: selectedSourceCount,
    missing_source_count: Math.max(0, minimumRequiredSources - selectedSourceCount),
    fallback_required: fallbackRequired,
    coverage_warnings: [
      ...(selectedSources.every((source) => source.pdf_url === null)
        ? ["El ultimo bundle de blueprint-launch no aporta PDFs accesibles en las fuentes seleccionadas."]
        : []),
      "El lab usa el ultimo estado materializado de blueprint-launch y no depende del flujo en vivo.",
    ],
    selected_sources: selectedSources,
  } satisfies MasterBlueprintLabFixtureSet["sourceGate"];

  const acquisition = {
    target_source_count: 5,
    source_registry: sourceRegistry,
    provider_expansion_sources: providerSource ? [providerSource] : [],
    websearch_sources: [webContextSource],
    decisions: [
      ...(providerSource
        ? [
            {
              source_id: providerSource.source_id,
              accepted: true,
              reason:
                "Se incorpora la mejor referencia no seleccionada del ultimo search snapshot para ampliar el contexto del lab.",
              origin: "provider_expansion" as const,
              query: providerSource.query,
            },
          ]
        : []),
      {
        source_id: webContextSource.source_id,
        accepted: true,
        reason:
          "Se incorpora un soporte contextual derivado del intent summary mas reciente de blueprint-launch.",
        origin: "websearch_source" as const,
        query: webContextSource.query,
      },
    ],
    warnings: [
      ...(selectedSources.every((source) => source.pdf_url === null)
        ? ["Ninguna fuente seleccionada desde blueprint-launch tiene PDF accesible en el ultimo estado guardado."]
        : []),
    ],
  } satisfies MasterBlueprintLabFixtureSet["acquisition"];

  const pdfDownloads: PdfDownloadResult = {
    records: sourceRegistry.map((source) => ({
      source_id: source.source_id,
      title: source.title,
      pdf_url: source.pdf_url,
      resolved_pdf_url: source.pdf_url,
      access_strategy: source.pdf_url ? "direct_pdf_url" : null,
      http_status: source.pdf_url ? 200 : null,
      status: source.pdf_url ? "downloaded" : "skipped",
      reason: source.pdf_url ? null : "El ultimo artifact de blueprint-launch no incluye PDF accesible para esta fuente.",
      stored_file_path: null,
      file_size_bytes: null,
    })),
    warnings: [
      ...(selectedSources.every((source) => source.pdf_url === null)
        ? ["El lab continua sin PDFs descargados porque blueprint-launch aun no materializo enlaces PDF accesibles."]
        : []),
    ],
  };

  const evidencePacks = sourceRegistry.map((source) =>
    buildEvidencePack(source, savedIntake.intake.topic),
  );
  const assumptions = buildAssumptions(savedIntake.intake.topic);
  const snippets = evidencePacks.flatMap((pack) => pack.snippets);
  const evidenceLedger = {
    source_registry: sourceRegistry,
    evidence_packs: evidencePacks,
    assets: [],
    assumptions,
    snippets,
    warnings: [
      "Evidencia reconstruida desde el ultimo estado de blueprint-launch usando metadata, abstracts y contexto local.",
    ],
  } satisfies MasterBlueprintLabFixtureSet["evidenceLedger"];

  const project: MasterBlueprintEngineProject = {
    id: projectId,
    userId: "lab-user-blueprint-launch",
    catalogTopicId: null,
    title: savedIntake.intake.topic,
    status: ProjectStatus.SOURCES_SELECTED,
    country: "PE",
    language: "es",
    degreeLevel: DegreeLevel.MAESTRIA,
    university: context.university,
    program: context.program,
    templateKey: context.templateKey,
    topicOriginType: TopicOriginType.CUSTOM,
    topicSelectionStatus: TopicSelectionStatus.SELECTED,
    topicSeedText: savedIntake.intake.topic,
    topicAreaId: null,
    topicAreaLabel: savedIntake.projectContext.knowledgeAreaLabel ?? "Laboratorio blueprint-launch",
    selectedTopicSuggestionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    intake: {
      id: "lab-intake-blueprint-launch-latest",
      projectId,
      topic: savedIntake.intake.topic,
      problemContext: savedIntake.intake.problemContext ?? null,
      researchLine: savedIntake.intake.researchLine ?? null,
      academicConstraints: savedIntake.intake.academicConstraints ?? null,
      targetPopulation: savedIntake.intake.targetPopulation ?? null,
      availableData: savedIntake.intake.availableData ?? null,
      preferredMethodology: savedIntake.intake.preferredMethodology ?? null,
      advisorNotes: savedIntake.intake.advisorNotes ?? null,
      searchQuery: intakeSearchQuery,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    projectReferences: selectedItems.map((item, index) => ({
      id: `lab-project-reference-launch-${String(index + 1).padStart(3, "0")}`,
      projectId,
      referenceId: item.reference.id,
      sourceProvider: Provider.OPENALEX,
      relevanceScore: item.relevanceScore ?? 0,
      selected: true,
      selectedOrder: item.selectedOrder,
      selectionReason: "Fuente seleccionada en el ultimo artifact de blueprint-launch.",
      createdAt: timestamp,
      updatedAt: timestamp,
      reference: {
        id: item.reference.id,
        doi: item.reference.doi,
        openAlexId: item.reference.id.startsWith("https://openalex.org/")
          ? item.reference.id
          : null,
        crossrefId: null,
        title: item.reference.title,
        normalizedTitle: normalizeTitle(item.reference.title),
        authorsJson: item.reference.authorsJson,
        abstract: item.reference.abstract,
        venue: item.reference.venue,
        year: item.reference.year,
        workType: "article",
        landingPageUrl: item.reference.landingPageUrl,
        citationCount: null,
        rawOpenAlexJson: null,
        rawCrossrefJson: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })),
    blueprintVersions: [{ versionNumber: 0 }],
  };

  const fixtures: MasterBlueprintLabFixtureSet = {
    project,
    sourceGate,
    acquisition,
    pdfDownloads,
    evidencePacks,
    evidenceLedger,
  };

  return {
    caseName: BLUEPRINT_LAUNCH_CASE_NAME,
    fixtureDir: path.join(process.cwd(), "artifacts-local", "blueprint_launch"),
    ...fixtures,
  };
}
