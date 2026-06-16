import fs from "node:fs";
import path from "node:path";

import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import { normalizeLanguageCode } from "@/lib/language";
import {
  buildEnforcedAcademicMetadata,
} from "@/server/blueprint-v2/editorial/academic-editorial-policy";
import {
  capitalizeKeywordLine,
  capitalizePublicTableRows,
  sentenceStyleCapitalizePublicText,
} from "@/server/blueprint-v2/editorial/capitalization-hygiene";
import { normalizeAcademicDocumentPublicFields } from "@/server/blueprint-v2/editorial/public-document-normalizer";
import { buildHeroInfographicPlan } from "@/server/blueprint-v2/editorial/hero-infographic-policy";
import {
  buildPublicAppendixPlan,
  buildResearchBudgetPlan,
  buildResearchScheduleGanttRows,
  type ScheduleGanttRow,
} from "@/server/blueprint-v2/editorial/project-management-policy";
import type {
  AcademicBrandingAsset,
  AcademicDocument,
  AcademicEditorialPlan,
  AcademicReference,
  AcademicReportArchetype,
  AcademicSection,
  AcademicSectionBlock,
  AcademicDocxLayoutPlan,
  CoverVisualPlan,
  EquationLayoutPlan,
  FigureLayoutPlan,
  AssetPlacement,
  CitationAnchor,
  ScheduleVisualPlan,
  ScheduleVisualTask,
  TableLayoutDecision,
  WordStyleContract,
} from "@/server/blueprint-v2/lab/academic-document-model";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type { MethodGenerationContractV1 } from "@/server/blueprint-engine/quality/method-generation-contract";
import type { SecondaryReferenceCandidatesReport } from "@/server/blueprint-engine/quality/method-generation-contract";
import { isCentralClaimSection } from "@/server/blueprint-engine/quality/semantic-source-use-policy";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterSectionDraft,
  MasterTemplateRuntime,
  PdfAssetRecord,
  UniversityBlueprintPackage,
  UniversityBlueprintSection,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

type RenderSectionInput = {
  section_key: string;
  title: string;
  level: number;
  content: string;
  source_ids: string[];
  evidence_ids: string[];
  original_excerpt_ids: string[];
  asset_keys: string[];
  evidence_support_summary?: MasterSectionDraft["evidence_support_summary"];
  section_evidence_binding?: MasterSectionDraft["section_evidence_binding"];
  unsupported_or_cautious_claim_warnings: string[];
  warnings: string[];
};

const NO_INLINE_CITATION_SECTIONS = new Set([
  "abstract",
  "keywords",
  "references",
  "consistency_matrix",
  "schedule",
  "budget",
  "annexes",
  "general_objective",
  "specific_objectives",
  "research_questions",
  "general_research_question",
  "specific_research_questions",
  "general_hypothesis",
  "specific_hypotheses",
]);

function documentLanguage(project: MasterBlueprintEngineProject) {
  return normalizeLanguageCode(project.language) ?? "es";
}

function isEnglishProject(project: MasterBlueprintEngineProject) {
  return documentLanguage(project) === "en";
}

export function normalizeEnglishAcademicText(value: string) {
  return value
    .normalize("NFC")
    .replace(/retroalimentaci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n/gi, "feedback")
    .replace(/investigaci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n/gi, "research")
    .replace(/acad(?:e|\u00e9|e\u0301|\u00c3\u00a9)mica/gi, "academic")
    .replace(/acad(?:e|\u00e9|e\u0301|\u00c3\u00a9)mico/gi, "academic")
    .replace(/maestr(?:i|\u00ed|i\u0301|\u00c3\u00ad)a/gi, "master's program")
    .replace(/Per(?:u|\u00fa|u\u0301|\u00c3\u00ba)/g, "Peru")
    .replace(/\bretroalimentaci(?:o|\u00f3)n\b/gi, "feedback")
    .replace(/\binvestigaci(?:o|\u00f3)n\b/gi, "research")
    .replace(/\bacad(?:e|\u00e9)mica\b/gi, "academic")
    .replace(/\bacad(?:e|\u00e9)mico\b/gi, "academic")
    .replace(/\bmaestr(?:i|\u00ed)a\b/gi, "master's program")
    .replace(/\bPer(?:u|\u00fa)\b/g, "Peru")
    .replace(/\bplan de tesis institucional\b/gi, "institutional thesis plan")
    .replace(/\bplanteamiento del problema\b/gi, "problem statement")
    .replace(/\bmatriz de consistencia\b/gi, "consistency matrix")
    .replace(/\bpresupuesto preliminar\b/gi, "preliminary budget")
    .replace(/\bcronograma de investigaci(?:o|\u00f3)n\b/gi, "research schedule")
    .replace(/\belaboraci(?:o|\u00f3)n propia\b/gi, "own elaboration")
    .replace(/\bcotizaciones de proveedor\b/gi, "vendor quotations")
    .replace(/\bretroalimentaci[oó]n\b/gi, "feedback")
    .replace(/\binvestigaci[oó]n\b/gi, "research")
    .replace(/\bpropuesta\b/gi, "proposal")
    .replace(/\bestudiantes\b/gi, "students")
    .replace(/\bacad[eé]mica\b/gi, "academic")
    .replace(/\bacad[eé]mico\b/gi, "academic")
    .replace(/\bposgrado\b/gi, "graduate")
    .replace(/\bPer[uú]\b/g, "Peru")
    .replace(/\s+/g, " ")
    .trim();
}

const ENGLISH_NORMALIZATION_PROTECTED_KEYS = new Set([
  "artifact_type",
  "artifact_version",
  "citation_style",
  "content_base64",
  "file_path",
  "generated_at",
  "image_path",
  "language",
  "mime_type",
  "rendered_citation",
  "source",
  "variant",
]);

function shouldProtectEnglishNormalization(parentKey: string) {
  return (
    parentKey === "references" ||
    ENGLISH_NORMALIZATION_PROTECTED_KEYS.has(parentKey) ||
    parentKey.endsWith("_id") ||
    parentKey.endsWith("_ids") ||
    parentKey.endsWith("_key") ||
    parentKey.endsWith("_keys") ||
    parentKey.endsWith("_path") ||
    parentKey.endsWith("_at")
  );
}

export function normalizeEnglishAcademicDocument<T>(value: T, parentKey = ""): T {
  if (shouldProtectEnglishNormalization(parentKey)) {
    return value;
  }

  if (typeof value === "string") {
    return normalizeEnglishAcademicText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeEnglishAcademicDocument(item, parentKey)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeEnglishAcademicDocument(entry, key),
      ]),
    ) as T;
  }

  return value;
}

const BULLET_FRIENDLY_SECTION_KEYS = new Set([
  "research_questions",
  "general_research_question",
  "specific_research_questions",
  "objectives",
  "general_objective",
  "specific_objectives",
  "hypotheses",
  "general_hypothesis",
  "specific_hypotheses",
  "terms_definition",
  "variables_or_categories",
  "data_collection_techniques",
  "research_instruments",
  "research_procedure",
  "analysis_plan",
  "scope_and_limitations",
]);

export function cleanAcademicText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripListPrefix(value: string) {
  return value
    .replace(/^\s*[-*]\s*/, "")
    .replace(/^\s*\d+[\).\-\s]+/, "")
    .trim();
}

function splitParagraphs(value: string) {
  return cleanAcademicText(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseListItems(value: string) {
  return cleanAcademicText(value)
    .split(/\n+/)
    .map(stripListPrefix)
    .filter(Boolean);
}

function parseMarkdownTable(value: string) {
  const rows = cleanAcademicText(value)
    .split(/\n+/)
    .filter((line) => /^\s*\|/.test(line))
    .filter((line) => !/\|?\s*:?-{3,}:?\s*(\||$)/.test(line))
    .map((line) =>
      line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cleanAcademicText(cell)),
    );

  return rows.length >= 2 ? rows : [];
}

function parseDelimitedTable(value: string) {
  const rows = cleanAcademicText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.includes("\t"))
    .map((line) => line.split(/\t+/).map((cell) => cleanAcademicText(cell)))
    .filter((row) => row.length >= 2 && row.some((cell) => cell.length > 0));

  return rows.length >= 2 ? rows : [];
}

function parseAcademicTable(value: string) {
  return parseMarkdownTable(value).length > 0
    ? parseMarkdownTable(value)
    : parseDelimitedTable(value);
}

function removeTableLines(value: string) {
  return cleanAcademicText(value)
    .split(/\n+/)
    .filter((line) => !/^\s*\|/.test(line))
    .filter((line) => !line.includes("\t"))
    .join("\n");
}

function isSectionIntroLine(value: string) {
  return /^(los|las|el|la)\s+(objetivos|hipotesis|preguntas)\s+(son|se presentan|se formulan)|^a continuacion\b|^esta seccion\b|^la presente seccion\b/i.test(
    cleanAcademicText(value),
  );
}

function normalizeLogicMarkerText(value: string) {
  return cleanAcademicText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:.;,-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isLogicPlaceholderLine(value: string) {
  const normalized = normalizeLogicMarkerText(value);
  return [
    "objetivo general",
    "objetivos especificos",
    "objetivo especifico",
    "pregunta general",
    "preguntas especificas",
    "pregunta especifica",
    "hipotesis general",
    "hipotesis especificas",
    "hipotesis especifica",
  ].includes(normalized);
}

function normalizeLogicLine(value: string) {
  const stripPrefix = (text: string) =>
    text
      .replace(/^(objetivo|pregunta|hip[oó]tesis)\s+(general|espec[ií]fic[ao]s?)\s*[:.-]?\s*/i, "")
      .replace(/^(oe|pe|he|p|h)\s*\d+\s*[:.-]?\s*/i, "")
      .replace(/^espec[ií]fic[ao]\s*\d+\s*[:.-]?\s*/i, "")
      .trim();

  const stripped = stripPrefix(stripPrefix(cleanAcademicText(value)));
  return isLogicPlaceholderLine(stripped) ? "" : stripped;
}

function firstLogicItem(value: string | null | undefined) {
  return parseListItems(value ?? "")
    .map(normalizeLogicLine)
    .filter((line) => line.length > 12)
    .filter((line) => !isSectionIntroLine(line))[0] ?? null;
}

function logicListItems(value: string | null | undefined, limit = 8) {
  return parseListItems(value ?? "")
    .map(normalizeLogicLine)
    .filter((line) => line.length > 12)
    .filter((line) => !isSectionIntroLine(line))
    .slice(0, limit);
}

function controlledLogicSectionBlocks(input: {
  sectionKey: string;
  content: string;
}): AcademicSectionBlock[] | null {
  const lines = cleanAcademicText(input.content).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const markerIndex = (patterns: RegExp[]) =>
    lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
  const splitAfterMarker = (index: number, nextMarkerIndex: number) =>
    lines.slice(index + 1, nextMarkerIndex >= 0 ? nextMarkerIndex : undefined);

  const configs: Record<string, {
    generalLabel: string;
    specificLabel: string;
    generalPatterns: RegExp[];
    specificPatterns: RegExp[];
  }> = {
    objectives: {
      generalLabel: "Objetivo general",
      specificLabel: "Objetivos específicos",
      generalPatterns: [/^objetivo general\b/i],
      specificPatterns: [/^objetivos espec[ií]ficos\b/i],
    },
    hypotheses: {
      generalLabel: "Hipótesis general",
      specificLabel: "Hipótesis específicas",
      generalPatterns: [/^hip[oó]tesis general\b/i],
      specificPatterns: [/^hip[oó]tesis espec[ií]ficas\b/i],
    },
    research_questions: {
      generalLabel: "Pregunta general",
      specificLabel: "Preguntas específicas",
      generalPatterns: [/^pregunta general\b/i],
      specificPatterns: [/^preguntas espec[ií]ficas\b/i],
    },
  };
  const config = configs[input.sectionKey];
  if (!config) {
    return null;
  }

  const generalIndex = markerIndex(config.generalPatterns);
  const specificIndex = markerIndex(config.specificPatterns);
  const general =
    generalIndex >= 0
      ? firstLogicItem(splitAfterMarker(generalIndex, specificIndex).join("\n"))
      : firstLogicItem(input.content);
  const specificSource =
    specificIndex >= 0
      ? splitAfterMarker(specificIndex, -1).join("\n")
      : input.content;
  const specifics = logicListItems(specificSource)
    .filter((item) => item !== general)
    .slice(0, 6);

  if (!general && specifics.length === 0) {
    return null;
  }

  return [
    ...(general
        ? [{
          block_type: "paragraph" as const,
          text: `${sentenceStyleCapitalizePublicText(config.generalLabel, "label")}: ${sentenceStyleCapitalizePublicText(general, "sentence")}`,
          citation_anchor_ids: [],
        }]
      : []),
    ...(specifics.length > 0
      ? [{
          block_type: "paragraph" as const,
          text: `${sentenceStyleCapitalizePublicText(config.specificLabel, "label")}:`,
          citation_anchor_ids: [],
        }]
      : []),
    ...specifics.map((item, index) => ({
      block_type: "bullet" as const,
      text: `${input.sectionKey === "research_questions" ? `P${index + 1}` : input.sectionKey === "objectives" ? `OE${index + 1}` : `HE${index + 1}`}: ${sentenceStyleCapitalizePublicText(item, "sentence")}`,
      citation_anchor_ids: [],
    })),
  ];
}

function authorLastName(author: string) {
  const clean = author.replace(/\s+/g, " ").trim();
  const parts = clean.split(" ");
  return parts.at(-1) ?? clean;
}

function formatAuthorApa(author: string) {
  const parts = author.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length <= 1) {
    return author;
  }
  const lastName = parts.pop();
  const initials = parts
    .map((part) => part.charAt(0).toUpperCase())
    .filter(Boolean)
    .map((initial) => `${initial}.`)
    .join(" ");

  return `${lastName}, ${initials}`;
}

function formatCitationLabel(source: EvidenceLedger["source_registry"][number]) {
  const year = source.year ?? "s.f.";
  if (source.authors.length === 0) {
    return `(${year})`;
  }

  if (source.authors.length === 1) {
    return `(${authorLastName(source.authors[0])}, ${year})`;
  }

  if (source.authors.length === 2) {
    return `(${authorLastName(source.authors[0])} & ${authorLastName(source.authors[1])}, ${year})`;
  }

  return `(${authorLastName(source.authors[0])} et al., ${year})`;
}

function formatReferenceApa(source: EvidenceLedger["source_registry"][number]) {
  const authors =
    source.authors.length > 0
      ? source.authors.slice(0, 8).map(formatAuthorApa).join(", ")
      : "Autor no disponible";
  const year = source.year ?? "s.f.";
  const venue = source.venue ? ` ${source.venue}.` : "";
  const doi = source.doi ? ` https://doi.org/${source.doi.replace(/^https?:\/\/doi.org\//i, "")}` : "";

  return `${authors} (${year}). ${source.title}.${venue}${doi}`;
}

function buildSourceLookup(evidenceLedger: EvidenceLedger) {
  const lookup = new Map<string, EvidenceLedger["source_registry"][number]>();
  for (const source of evidenceLedger.source_registry) {
    lookup.set(source.source_id, source);
    if (source.reference_id) {
      lookup.set(source.reference_id, source);
    }
  }
  return lookup;
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeForSimilarity(value: string) {
  return cleanAcademicText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordsForSimilarity(value: string) {
  return normalizeForSimilarity(value)
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .slice(0, 450);
}

function sectionText(section: AcademicSection) {
  return section.blocks
    .map((block) => {
      if (block.block_type === "table") {
        return block.rows.flat().join(" ");
      }

      return block.text;
    })
    .join(" ");
}

function jaccardSimilarity(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = Array.from(leftSet).filter((word) => rightSet.has(word)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : Number((intersection / union).toFixed(3));
}

function resolveReportArchetype(variant: "master" | "university"): AcademicReportArchetype {
  return variant === "master" ? "indexed_paper_like" : "institutional_thesis_project";
}

function hasSection(sections: AcademicSection[], sectionKey: string) {
  return sections.some((section) => section.section_key === sectionKey);
}

function buildTitleOverrides(archetype: AcademicReportArchetype) {
  const shared: Record<string, string> = {
    problem_statement: "Planteamiento del problema",
    theoretical_framework: "Marco teórico",
    methodology: "Metodología",
    scope_and_limitations: "Alcances y limitaciones",
    consistency_matrix: "Matriz de consistencia",
  };

  if (archetype === "indexed_paper_like") {
    return {
      ...shared,
      research_antecedents: "Antecedentes y evidencia comparada",
      state_of_the_art: "Estado del arte",
      theoretical_bases: "Bases teóricas para la propuesta",
      justification: "Justificación",
      schedule: "Cronograma de investigación",
      budget: "Presupuesto referencial",
    };
  }

  return shared;
}

function buildEditorialPlan(input: {
  variant: "master" | "university";
  sections: AcademicSection[];
}): AcademicEditorialPlan {
  const archetype = resolveReportArchetype(input.variant);
  const titleOverrides = buildTitleOverrides(archetype);
  const suppressed = new Set<string>(["references"]);
  const annex = new Set<string>(["references"]);

  if (hasSection(input.sections, "variables_or_categories")) {
    suppressed.add("variables_indicators");
    suppressed.add("categories_subcategories");
  }
  if (hasSection(input.sections, "objectives")) {
    suppressed.add("general_objective");
    suppressed.add("specific_objectives");
  }
  if (hasSection(input.sections, "hypotheses")) {
    suppressed.add("general_hypothesis");
    suppressed.add("specific_hypotheses");
  }
  if (hasSection(input.sections, "research_questions")) {
    suppressed.add("general_research_question");
    suppressed.add("specific_research_questions");
  }

  if (hasSection(input.sections, "annexes")) {
    suppressed.add("annexes");
  }

  if (hasSection(input.sections, "schedule")) {
    suppressed.add("schedule");
    annex.add("schedule");
  }

  const duplicatePairs: AcademicEditorialPlan["duplicate_pairs"] = [];
  const wordCache = new Map(
    input.sections.map((section) => [section.section_key, wordsForSimilarity(sectionText(section))]),
  );

  for (let leftIndex = 0; leftIndex < input.sections.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < input.sections.length; rightIndex += 1) {
      const left = input.sections[leftIndex];
      const right = input.sections[rightIndex];
      if (!left || !right) {
        continue;
      }

      const similarity = jaccardSimilarity(
        wordCache.get(left.section_key) ?? [],
        wordCache.get(right.section_key) ?? [],
      );

      if (similarity < 0.62) {
        continue;
      }

      const action = similarity >= 0.78 ? "review" : "keep_both";

      duplicatePairs.push({
        left_section_key: left.section_key,
        right_section_key: right.section_key,
        similarity,
        action,
        reason:
          action === "keep_both"
            ? "Solapamiento moderado; se conserva porque puede aportar detalle distinto."
            : action === "review"
              ? "Solapamiento alto; conviene revisar/fusionar con LLM editorial antes de entrega final."
            : "Solapamiento detectado; se conserva la jerarquia y se deja trazado para revision editorial.",
      });
    }
  }

  const mainBodySectionKeys = input.sections
    .map((section) => section.section_key)
    .filter((sectionKey) => sectionKey !== "consistency_matrix")
    .filter((sectionKey) => !suppressed.has(sectionKey));

  return {
    artifact_type: "academic_editorial_plan",
    artifact_version: "v1",
    source: "deterministic_preflight",
    archetype,
    main_body_section_keys: mainBodySectionKeys,
    annex_section_keys: Array.from(annex),
    suppressed_section_keys: Array.from(suppressed),
    title_overrides: titleOverrides,
    duplicate_pairs: duplicatePairs,
    quality_warnings: [
      duplicatePairs.some((pair) => pair.action === "review")
        ? "Se detectaron secciones con solapamiento alto; usar pase LLM editorial para fusionar antes del documento final."
        : "",
      archetype === "indexed_paper_like"
        ? "El Master se renderiza como documento paper-like: el cronograma se mueve al anexo academico si existe."
        : "El institucional conserva estructura universitaria y aplica reduccion Master -> plantilla institucional; el cronograma se mueve al anexo academico si existe.",
    ].filter(Boolean),
  };
}

function mimeTypeFromPath(filePath: string | null | undefined) {
  const ext = path.extname(filePath ?? "").toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".gif") {
    return "image/gif";
  }

  if (ext === ".bmp") {
    return "image/bmp";
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }

  return null;
}

function buildMasterBrandingAsset(): AcademicBrandingAsset {
  const candidates = [
    path.join(process.cwd(), "public", "brand", "ingeniometrix-lockup-640.png"),
    path.join(process.cwd(), "public", "brand", "ingeniometrix-lockup.png"),
    path.join(process.cwd(), "public", "brand", "ingeniometrix-mark-512.png"),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

  return {
    role: "master_logo",
    label: "Ingeniometrix",
    asset_key: "ingeniometrix_master_logo",
    available: Boolean(filePath),
    file_path: filePath,
    content_base64: null,
    mime_type: mimeTypeFromPath(filePath) ?? "image/png",
    width_px: null,
    height_px: null,
    warnings: filePath ? [] : ["No se encontro logo local de Ingeniometrix para la portada Master."],
  };
}

function buildInstitutionBrandingAsset(
  universityBlueprint: UniversityBlueprintPackage | null,
): AcademicBrandingAsset {
  const sourceLogo = universityBlueprint?.branding_assets?.find(
    (asset) => asset.role === "institution_logo",
  );
  const available = Boolean(sourceLogo?.file_path || sourceLogo?.content_base64);

  return {
    role: "institution_logo",
    label: sourceLogo?.label ?? "Logo institucional",
    asset_key: sourceLogo?.asset_key ?? "institution_logo_missing",
    available,
    file_path: sourceLogo?.file_path ?? null,
    content_base64: sourceLogo?.content_base64 ?? null,
    mime_type: sourceLogo?.mime_type ?? mimeTypeFromPath(sourceLogo?.file_path) ?? null,
    width_px: sourceLogo?.width_px ?? null,
    height_px: sourceLogo?.height_px ?? null,
    warnings: available
      ? sourceLogo?.warnings ?? []
      : [
          "La plantilla institucional no expuso un logo renderizable; se mantiene la portada con texto institucional.",
          ...(sourceLogo?.warnings ?? []),
        ],
  };
}

function resolveBrandingAssets(input: {
  variant: "master" | "university";
  universityBlueprint?: UniversityBlueprintPackage | null;
}) {
  return input.variant === "master"
    ? [buildMasterBrandingAsset()]
    : [buildInstitutionBrandingAsset(input.universityBlueprint ?? null)];
}

function resolveReferences(input: {
  evidenceLedger: EvidenceLedger;
  preferredSourceIds: string[];
  secondaryReferenceReport?: SecondaryReferenceCandidatesReport | null;
}): AcademicReference[] {
  const sourceById = new Map<string, EvidenceLedger["source_registry"][number]>();
  for (const source of input.evidenceLedger.source_registry) {
    sourceById.set(source.source_id, source);
    if (source.reference_id) {
      sourceById.set(source.reference_id, source);
    }
  }

  const preferred = uniqueItems(
    input.preferredSourceIds
      .map((sourceId) => sourceById.get(sourceId)?.source_id ?? null)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );
  const eligible = input.evidenceLedger.source_registry
    .filter((source) => source.eligible_for_formal_reference)
    .map((source) => source.source_id);
  const orderedIds = uniqueItems([...preferred, ...eligible]).slice(0, 40);

  const primaryReferences = orderedIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is EvidenceLedger["source_registry"][number] => Boolean(source))
    .map((source) => ({
      source_id: source.source_id,
      reference_id: source.reference_id,
      reference_kind: "primary_recovered" as const,
      cited_through_source_id: null,
      evidence_id: null,
      recovery_status: "recovered_source",
      title: source.title,
      authors: source.authors,
      year: source.year,
      venue: source.venue,
      doi: source.doi,
      apa_label: formatCitationLabel(source),
      apa_reference: formatReferenceApa(source),
    }));

  const secondaryReferences = (input.secondaryReferenceReport?.candidates ?? [])
    .slice(0, 25)
    .map((candidate, index): AcademicReference => ({
      source_id: `secondary:${index + 1}`,
      reference_id: null,
      reference_kind: "secondary_unrecovered" as const,
      cited_through_source_id: candidate.source_id,
      evidence_id: candidate.evidence_id,
      recovery_status: "detected_in_recovered_pdf_not_yet_recovered",
      title: sentenceStyleCapitalizePublicText(
        `Referencia secundaria detectada: ${candidate.marker}`,
        "heading",
      ),
      authors: ["Pendiente de recuperación"],
      year: null,
      venue: "Pendiente de validación",
      doi: null,
      apa_label: "(Fuente secundaria pendiente)",
      apa_reference:
        `Referencia secundaria detectada en evidencia recuperada (${candidate.marker}). ` +
        "Uso restringido: no citar como fuente primaria hasta su recuperación y validación.",
    }));

  return [...primaryReferences, ...secondaryReferences];
}

function titleForSection(sections: AcademicSection[], sectionKey: string) {
  return sections.find((section) => section.section_key === sectionKey)?.title ?? sectionKey;
}

function isGenericAssetCaption(value: string) {
  const normalized = normalizeForSimilarity(value);
  return (
    !normalized ||
    normalized.includes("asset util") ||
    normalized.includes("asset de soporte") ||
    normalized.includes("marco tecnico")
  );
}

function sourceNoteForAsset(input: {
  asset: AssetPlacement;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}) {
  const source = input.sourceLookup.get(input.asset.source_id);
  if (!source) {
    return "Fuente: evidencia documental recuperada en el corpus del proyecto.";
  }

  return `Fuente: adaptado de ${formatCitationLabel(source)}.`;
}

function sourceCitationForAsset(input: {
  asset: AssetPlacement;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}) {
  const source = input.sourceLookup.get(input.asset.source_id);
  return source ? formatCitationLabel(source) : "";
}

function academicFigureCaption(input: {
  asset: AssetPlacement;
  sectionTitle: string;
}) {
  if (!isGenericAssetCaption(input.asset.caption)) {
    return sentenceStyleCapitalizePublicText(cleanAcademicText(input.asset.caption), "caption");
  }

  const normalizedSection = cleanAcademicText(input.sectionTitle).toLowerCase();
  if (normalizedSection.includes("metodolog")) {
    return "Representaci\u00f3n visual de criterios y relaciones metodol\u00f3gicas para la evaluaci\u00f3n propuesta.";
  }

  if (normalizedSection.includes("justific")) {
    return "Esquema visual de argumentos de soporte para la pertinencia acad\u00e9mica y aplicada del proyecto.";
  }

  return "Esquema visual de conceptos, variables y relaciones metodol\u00f3gicas vinculadas con la secci\u00f3n.";
}

function academicFigureReference(input: {
  figureNumber: number;
  sectionTitle: string;
}) {
  return `La Figura ${input.figureNumber} se incorpora como apoyo visual para sintetizar elementos clave de ${input.sectionTitle.toLowerCase()} y orientar la lectura del argumento.`;
}

function uniqueAssetIdentity(asset: AssetPlacement) {
  return `${asset.source_id}|${asset.asset_key}`;
}

function assetLooksLikeEquation(asset: AssetPlacement) {
  const text = `${asset.render_mode} ${asset.caption} ${asset.text_content ?? ""}`.toLowerCase();
  const normalized = normalizeForSimilarity(text);

  return (
    asset.render_mode === "equation" ||
    /\becuacion\b|formula|equation/.test(normalized) ||
    /\becuaci[oó]n\b|formula|f[oó]rmula|equation/.test(text) ||
    (/[=]/.test(text) && /\\[a-z]+|[_^]/i.test(text))
  );
}

function sectionOrderLookup(sections: AcademicSection[], mainBodySectionKeys?: string[]) {
  const bodyKeys = new Set(mainBodySectionKeys ?? sections.map((section) => section.section_key));
  const order = new Map<string, number>();
  let index = 0;

  for (const section of sections) {
    if (!bodyKeys.has(section.section_key)) {
      continue;
    }
    order.set(section.section_key, index);
    index += 1;
  }

  for (const section of sections) {
    if (order.has(section.section_key)) {
      continue;
    }
    order.set(section.section_key, 1000 + index);
    index += 1;
  }

  return order;
}

function sortAssetsByDocumentOrder(input: {
  assetPlacements: AssetPlacement[];
  sections: AcademicSection[];
  mainBodySectionKeys?: string[];
}) {
  const order = sectionOrderLookup(input.sections, input.mainBodySectionKeys);

  return input.assetPlacements.slice().sort((left, right) => {
    const leftOrder = order.get(left.section_key) ?? 9999;
    const rightOrder = order.get(right.section_key) ?? 9999;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftAnchor = left.paragraph_anchor ?? 999;
    const rightAnchor = right.paragraph_anchor ?? 999;
    if (leftAnchor !== rightAnchor) {
      return leftAnchor - rightAnchor;
    }

    return `${left.source_id}|${left.asset_key}`.localeCompare(`${right.source_id}|${right.asset_key}`);
  });
}

function readableEquationText(value: string) {
  return cleanAcademicText(value)
    .replace(/\$\$/g, "")
    .replace(/\\\(|\\\)/g, "")
    .replace(
      /\\begin\{(?:bmatrix|pmatrix|matrix|array|cases)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix|matrix|array|cases)\}/g,
      "matriz o arreglo formal recuperado de la fuente original",
    )
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\sum_\{?([^{}]+)\}?\^\{?([^{}]+)\}?/g, "sum($1..$2)")
    .replace(/\\hat\{([^{}]+)\}/g, "$1 estimado")
    .replace(/\\left|\\right/g, "")
    .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g, "")
    .replace(/\\(?:mathrm|mathbf|text)\{([^{}]+)\}/g, "$1")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/\b(?:begin|end)?(?:bmatrix|pmatrix|matrix|array|cases)\b/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEquationLatex(value: string) {
  return cleanAcademicText(value)
    .replace(/^\$\$?|\$\$?$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function equationHasRawLatexCommand(value: string) {
  return /\\[a-zA-Z]+/.test(value) || /\$\$?/.test(value) || /\\begin|\\end/.test(value);
}

function isNativeEquationRenderable(value: string) {
  const latex = normalizeEquationLatex(value);
  if (!latex) {
    return false;
  }

  if (/\\begin|\\end|\\int|\\sum|\\prod|\\matrix|\\cases|\\left|\\right/i.test(latex)) {
    return false;
  }

  const allowedCommands = latex.match(/\\[a-zA-Z]+/g) ?? [];
  return allowedCommands.every((command) =>
    ["\\frac", "\\lambda", "\\alpha", "\\beta", "\\gamma", "\\delta", "\\theta", "\\omega", "\\sigma"].includes(command),
  );
}

function resolveEquationRenderStrategy(input: {
  latex: string;
  filePath: string | null | undefined;
}): EquationLayoutPlan["render_strategy"] {
  if (isNativeEquationRenderable(input.latex)) {
    return "docx_math_native";
  }

  if (input.filePath) {
    return "source_equation_image";
  }

  if (cleanAcademicText(input.latex)) {
    return "generated_equation_image";
  }

  return "blocked_no_professional_render";
}

function sourceContextForEquation(asset: AssetPlacement) {
  const caption = cleanAcademicText(asset.caption);
  const text = readableEquationText(cleanAcademicText(asset.text_content));
  const context = [caption, text && text !== caption ? text : ""].filter(Boolean).join(" ");

  if (!context) {
    return "No se recupero contexto textual suficiente de la fuente original para esta ecuacion.";
  }

  return clipText(context, 420) ?? "No se recupero contexto textual suficiente de la fuente original para esta ecuacion.";
}

function hasSourceContextForEquation(asset: AssetPlacement) {
  return Boolean(cleanAcademicText(asset.caption) || cleanAcademicText(asset.text_content));
}

function equationPurposeFromAsset(input: {
  asset: AssetPlacement;
  sectionTitle: string;
}) {
  const caption = cleanAcademicText(input.asset.caption);
  const sourceContext = sourceContextForEquation(input.asset);
  if (caption) {
    return sentenceStyleCapitalizePublicText(
      `Prop\u00f3sito acad\u00e9mico: explicar en ${input.sectionTitle} el componente formal que la fuente original presenta como "${caption}". Contexto fuente: ${sourceContext}`,
      "sentence",
    );
  }

  return sentenceStyleCapitalizePublicText(
    `Prop\u00f3sito acad\u00e9mico: registrar en ${input.sectionTitle} un componente formal recuperado de la fuente original. Contexto fuente: ${sourceContext}`,
    "sentence",
  );
}

function equationSectionExplanation(input: {
  asset: AssetPlacement;
  sectionTitle: string;
  equationNumber: number;
}) {
  const sourceContext = sourceContextForEquation(input.asset);
  return sentenceStyleCapitalizePublicText(
    `La Ecuaci\u00f3n ${input.equationNumber} se incorpora en ${input.sectionTitle} porque el material recuperado de la fuente la presenta en este contexto: ${sourceContext}`,
    "sentence",
  );
}

function extractEquationSymbolNotes(value: string) {
  const symbolCandidateText = value
    .replace(
      /\\begin\{(?:bmatrix|pmatrix|matrix|array|cases)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix|matrix|array|cases)\}/g,
      "",
    )
    .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g, "");
  const ignored = new Set([
    "frac",
    "sqrt",
    "sum",
    "text",
    "mathrm",
    "mathbf",
    "left",
    "right",
    "begin",
    "end",
    "sin",
    "cos",
    "tan",
    "log",
    "ln",
    "exp",
    "matrix",
    "bmatrix",
    "pmatrix",
    "array",
    "cases",
    "beginb",
    "endbma",
    "trix",
    "matri",
  ]);
  const matches = symbolCandidateText.match(/\\[a-zA-Z]+(?:_\{?[A-Za-z0-9]+\}?)?|[A-Za-z]{1,6}(?:_\{?[A-Za-z0-9]+\}?|\^\{?[A-Za-z0-9]+\}?)?/g) ?? [];
  const symbols = uniqueItems(
    matches
      .map((match) => match.replace(/[{}]/g, ""))
      .filter((match) => match.length > 0)
      .filter((match) => !ignored.has(match.replace(/^\\/, "").toLowerCase()))
      .filter((match) => !/(?:begin|end)?(?:bmatrix|pmatrix|matrix|array|cases)/i.test(match))
      .filter((match) => !/^[a-z]{7,}$/i.test(match)),
  ).slice(0, 10);

  return symbols.map((symbol) => ({
    symbol,
    description:
      "Descripci\u00f3n no recuperada de la fuente original; no se infiere autom\u00e1ticamente para evitar inventar significado.",
    unit: null,
    source_backed: false,
    evidence_id: null,
    status: "not_recovered" as const,
  }));
}

function equationFromAsset(
  asset: AssetPlacement,
  sectionTitle: string,
): Omit<EquationLayoutPlan, "equation_number" | "source_note" | "body_reference"> | null {
  const text = cleanAcademicText(asset.text_content);
  const normalized = text.toLowerCase();
  const isPlaceholderOnly =
    normalized.includes("conservar latex y renderizarlo en la etapa de redaccion") &&
    !/[=]/.test(text) &&
    !/\\[a-z]+/i.test(text);
  const candidateText = isPlaceholderOnly ? "" : text;

  const latexMatch = candidateText.match(/(?:\$\$?)([^$]{4,})(?:\$\$?)|\\\(([^)]{4,})\\\)/);
  const latex = cleanAcademicText(latexMatch?.[1] ?? latexMatch?.[2]);
  const displayMathMatch = candidateText.match(/([A-Za-z][A-Za-z0-9_\-+\s]{0,60}=\s*[^.;\n]{3,260})/);
  const displayMath = cleanAcademicText(displayMathMatch?.[1]);
  const inlineLatexLike =
    !latex &&
    /\\[a-z]+/i.test(candidateText) &&
    /[=]/.test(candidateText)
      ? candidateText
      : "";

  if (latex || displayMath || inlineLatexLike) {
    const resolvedLatex =
      latex ||
      inlineLatexLike ||
      displayMath ||
      "\\text{Ecuaci\u00f3n con respaldo de fuente en imagen; ver soporte visual}";
    const resolvedDisplay =
      latex || inlineLatexLike ? readableEquationText(resolvedLatex) : displayMath;
    const normalizedLatex = normalizeEquationLatex(resolvedLatex);
    const renderStrategy = resolveEquationRenderStrategy({
      latex: normalizedLatex,
      filePath: asset.file_path,
    });
    const sourceContextSummary = sourceContextForEquation(asset);
    const sourceGrounded = hasSourceContextForEquation(asset);
    return {
      artifact_type: "professional_equation_model",
      artifact_version: "v1",
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      latex: normalizedLatex,
      source_latex: resolvedLatex,
      normalized_latex: normalizedLatex,
      display_text: resolvedDisplay,
      source_image_path: asset.file_path ?? null,
      generated_image_path: null,
      render_strategy: renderStrategy,
      professional_render_available: renderStrategy !== "blocked_no_professional_render",
      source_grounded_explanation_available: sourceGrounded,
      caption:
        sentenceStyleCapitalizePublicText(cleanAcademicText(asset.caption), "caption") ||
        "Ecuaci\u00f3n recuperada del corpus de evidencia.",
      purpose: equationPurposeFromAsset({ asset, sectionTitle }),
      source_context_summary: sourceContextSummary,
      section_explanation: "",
      variable_notes: extractEquationSymbolNotes(displayMath || resolvedLatex),
      file_path: asset.file_path ?? null,
      limitations: [
        "Las variables y unidades solo se consideran definidas cuando aparecen en la fuente original recuperada.",
      ],
      warnings: [
        renderStrategy === "generated_equation_image"
          ? "La ecuación requiere fallback visual generado porque el formato no es seguro para math nativo DOCX."
          : null,
        renderStrategy === "source_equation_image"
          ? "La ecuación se insertará como imagen de la fuente para evitar exponer código LaTeX crudo."
          : null,
      ].filter((warning): warning is string => Boolean(warning)),
      blockers: renderStrategy === "blocked_no_professional_render"
        ? ["No hay render profesional disponible para esta ecuacion."]
        : [],
    };
  }

  if (asset.file_path) {
    const sourceContextSummary = sourceContextForEquation(asset);
    const sourceGrounded = hasSourceContextForEquation(asset);
    return {
      artifact_type: "professional_equation_model",
      artifact_version: "v1",
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      latex: "\\text{Ecuaci\u00f3n con respaldo de fuente en imagen; ver soporte visual}",
      source_latex: null,
      normalized_latex: null,
      display_text: cleanAcademicText(asset.caption) || "Ecuaci\u00f3n con respaldo de fuente en imagen.",
      source_image_path: asset.file_path,
      generated_image_path: null,
      render_strategy: "source_equation_image",
      professional_render_available: true,
      source_grounded_explanation_available: sourceGrounded,
      caption:
        cleanAcademicText(asset.caption) ||
        "Ecuaci\u00f3n detectada en asset visual con respaldo de fuente; pendiente de transcripci\u00f3n formal.",
      purpose: equationPurposeFromAsset({ asset, sectionTitle }),
      source_context_summary: sourceContextSummary,
      section_explanation: "",
      variable_notes: extractEquationSymbolNotes(asset.text_content ?? asset.caption),
      limitations: [
        "La ecuacion se conserva como imagen de la fuente porque no se recupero una transcripcion formal confiable.",
      ],
      file_path: asset.file_path,
      warnings: [
        "Ecuaci\u00f3n renderizada desde imagen con respaldo de fuente por falta de transcripci\u00f3n LaTeX.",
      ],
      blockers: [],
    };
  }

  return null;
}

function buildFigureLayoutPlan(input: {
  assetPlacements: AssetPlacement[];
  sections: AcademicSection[];
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
  mainBodySectionKeys?: string[];
}): FigureLayoutPlan[] {
  const seen = new Set<string>();
  const figures: FigureLayoutPlan[] = [];

  for (const asset of sortAssetsByDocumentOrder(input)) {
    if (!asset.renderable || asset.render_mode !== "image" || !asset.file_path || assetLooksLikeEquation(asset)) {
      continue;
    }

    const identity = uniqueAssetIdentity(asset);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    const sectionTitle = titleForSection(input.sections, asset.section_key);
    const figureNumber = figures.length + 1;
    figures.push({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      figure_number: figureNumber,
      caption: academicFigureCaption({ asset, sectionTitle }),
      source_note: sourceNoteForAsset({ asset, sourceLookup: input.sourceLookup }),
      body_reference: academicFigureReference({ figureNumber, sectionTitle }),
      file_path: asset.file_path,
      warnings: asset.warnings,
    });
  }

  return figures.slice(0, 12);
}

function buildEquationLayoutPlan(input: {
  assetPlacements: AssetPlacement[];
  sections: AcademicSection[];
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
  mainBodySectionKeys?: string[];
}): EquationLayoutPlan[] {
  const seen = new Set<string>();
  const equations: EquationLayoutPlan[] = [];

  for (const asset of sortAssetsByDocumentOrder(input)) {
    if (!assetLooksLikeEquation(asset)) {
      continue;
    }

    const identity = uniqueAssetIdentity(asset);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    const sectionTitle = titleForSection(input.sections, asset.section_key);
    const equation = equationFromAsset(asset, sectionTitle);
    if (!equation) {
      continue;
    }

    const equationNumber = equations.length + 1;
    const citation = sourceCitationForAsset({ asset, sourceLookup: input.sourceLookup });
    equations.push({
      ...equation,
      equation_number: equationNumber,
      source_note: sourceNoteForAsset({ asset, sourceLookup: input.sourceLookup }),
      section_explanation: equationSectionExplanation({ asset, sectionTitle, equationNumber }),
      body_reference: sentenceStyleCapitalizePublicText(
        `La Ecuaci\u00f3n ${equationNumber} resume el componente formal usado para explicar variables, par\u00e1metros o relaciones de ${sectionTitle.toLowerCase()}${citation ? ` ${citation}` : ""}.`,
        "sentence",
      ),
      warnings: [
        ...equation.warnings,
        ...equation.variable_notes
          .filter((note) => note.status !== "source_backed")
          .map((note) => `equation_variable_description_missing:${note.symbol}`),
        equationHasRawLatexCommand(equation.display_text)
          ? "raw_latex_removed_from_public_display_text"
          : null,
      ].filter((warning): warning is string => Boolean(warning)),
    });
  }

  return equations;
}

function monthFromScheduleText(value: string) {
  const match = value.match(/mes\s+(\d+)/i);
  const month = match ? Number(match[1]) : null;
  return Number.isFinite(month) && month !== null ? Math.max(1, Math.min(12, month)) : null;
}

function phaseFromScheduleText(value: string): ScheduleVisualTask["phase"] {
  const normalized = normalizeForSimilarity(value);
  if (/metodolog|instrument|analisis|muestra|recoleccion/.test(normalized)) {
    return "metodologia";
  }
  if (/redaccion|borrador|documento|marco teorico/.test(normalized)) {
    return "redaccion";
  }
  if (/revision|observacion|ajuste/.test(normalized)) {
    return "revision";
  }
  if (/cierre|final|exportacion|referencias/.test(normalized)) {
    return "cierre";
  }
  return "planificacion";
}

function dependencyForScheduleTask(index: number) {
  if (index <= 0) {
    return "Aprobacion del plan de trabajo";
  }

  return `Actividad ${index}`;
}

function deliverableForScheduleTask(value: string) {
  const normalized = normalizeForSimilarity(value);
  if (/problema|pregunta|objetivo|delimitacion/.test(normalized)) {
    return "Problema, preguntas y objetivos ajustados";
  }
  if (/revision|antecedente|teor/.test(normalized)) {
    return "Matriz de antecedentes y marco teorico";
  }
  if (/metodolog|instrument|muestra|variable|categoria/.test(normalized)) {
    return "Diseno metodologico e instrumentos preliminares";
  }
  if (/matriz|consistencia|analisis/.test(normalized)) {
    return "Matriz de consistencia revisada";
  }
  if (/presupuesto|cronograma|gestion/.test(normalized)) {
    return "Plan de gestion del proyecto";
  }
  if (/cierre|final|exportacion|referencia/.test(normalized)) {
    return "Documento final revisado";
  }

  return "Avance verificable del proyecto";
}

const FALLBACK_SCHEDULE_TASKS: ScheduleVisualTask[] = [
  {
    task: "Delimitacion del problema, preguntas y objetivos",
    start_month: 1,
    end_month: 1,
    phase: "planificacion",
    dependency: "Aprobacion del plan de trabajo",
    deliverable: "Problema, preguntas y objetivos ajustados",
  },
  {
    task: "Revision teorica y organizacion de antecedentes",
    start_month: 2,
    end_month: 2,
    phase: "redaccion",
    dependency: "Actividad 1",
    deliverable: "Matriz de antecedentes y marco teorico",
  },
  {
    task: "Ajuste metodologico e instrumentos de analisis",
    start_month: 3,
    end_month: 3,
    phase: "metodologia",
    dependency: "Actividad 2",
    deliverable: "Diseno metodologico e instrumentos preliminares",
  },
  {
    task: "Integracion del borrador y matriz de consistencia",
    start_month: 4,
    end_month: 4,
    phase: "redaccion",
    dependency: "Actividad 3",
    deliverable: "Matriz de consistencia revisada",
  },
  {
    task: "Revision academica y normalizacion de referencias",
    start_month: 5,
    end_month: 5,
    phase: "revision",
    dependency: "Actividad 4",
    deliverable: "Borrador academico revisado",
  },
  {
    task: "Cierre, control de trazabilidad y exportacion final",
    start_month: 6,
    end_month: 6,
    phase: "cierre",
    dependency: "Actividad 5",
    deliverable: "Documento final y anexos academicos",
  },
];

function scheduleTaskFromText(value: string, index: number): ScheduleVisualTask | null {
  const month = monthFromScheduleText(value);
  if (!month) {
    return null;
  }

  const task = cleanAcademicText(value.replace(/^\s*Mes\s+\d+\s*:\s*/i, ""));

  return {
    task,
    start_month: month,
    end_month: month,
    phase: phaseFromScheduleText(value),
    dependency: dependencyForScheduleTask(index),
    deliverable: deliverableForScheduleTask(task),
  };
}

function scheduleTaskFromGanttRow(row: ScheduleGanttRow): ScheduleVisualTask {
  return {
    task: row.task,
    start_month: row.start_month,
    end_month: row.end_month,
    phase: row.phase,
    dependency: row.dependencies,
    deliverable: row.deliverable,
    duration: row.duration,
    assumption: row.assumption,
  };
}

function scheduleTasksFromTableRows(rows: string[][]): ScheduleVisualTask[] {
  const header = rows[0]?.map((cell) => normalizeForSimilarity(cell)) ?? [];
  const monthColumns = header
    .map((label, index) => ({ index, month: Number(label.match(/\bm(?:es)?\s*(\d+)\b/)?.[1] ?? NaN) }))
    .filter((item) => Number.isFinite(item.month) && item.month >= 1);

  return rows.slice(1).flatMap((row, rowIndex) => {
    const task = cleanAcademicText(row[0] ?? "");
    if (!task) {
      return [];
    }

    const activeMonths = monthColumns
      .filter(({ index }) => /x|si|yes|1|●|✓|✔/i.test(row[index] ?? ""))
      .map(({ month }) => month);
    const fallbackMonth = rowIndex + 1;
    const startMonth = activeMonths.length > 0 ? Math.min(...activeMonths) : fallbackMonth;
    const endMonth = activeMonths.length > 0 ? Math.max(...activeMonths) : fallbackMonth;

    return [
      {
        task,
        start_month: Math.max(1, Math.min(12, startMonth)),
        end_month: Math.max(1, Math.min(12, endMonth)),
        phase: phaseFromScheduleText(task),
        dependency: dependencyForScheduleTask(rowIndex),
        deliverable: deliverableForScheduleTask(task),
      },
    ];
  });
}

function buildScheduleVisualPlan(input: {
  project: MasterBlueprintEngineProject;
  sections: AcademicSection[];
  scheduleGanttRows: ScheduleGanttRow[];
}): ScheduleVisualPlan | null {
  const sections = input.sections;
  const schedule = sections.find((section) => section.section_key === "schedule");

  const tasks = schedule
    ? schedule.blocks
        .flatMap((block, index) => {
          if (block.block_type === "table") {
            return scheduleTasksFromTableRows(block.rows);
          }

          if (block.block_type === "bullet" || block.block_type === "paragraph") {
            return scheduleTaskFromText(block.text, index);
          }

          return null;
        })
        .filter((task): task is ScheduleVisualTask => Boolean(task))
    : [];

  const policyTasks = input.scheduleGanttRows.map(scheduleTaskFromGanttRow);
  const resolvedTasks = tasks.length > 0 ? tasks : policyTasks.length > 0 ? policyTasks : FALLBACK_SCHEDULE_TASKS;

  return {
    label: "Cronograma visual de investigación",
    caption: "Cronograma referencial tipo Gantt para la ejecución del proyecto de investigación.",
    source_note:
      "Fuente: elaboración propia a partir del plan de trabajo generado para el proyecto. Los meses son referenciales y deben ajustarse al calendario académico real.",
    tasks: resolvedTasks,
  };
}

function sectionTextForKey(sections: AcademicSection[], patterns: RegExp[]) {
  const section = sections.find((candidate) =>
    patterns.some((pattern) => pattern.test(candidate.section_key) || pattern.test(candidate.title)),
  );

  return section ? clipText(sectionText(section), 520) : "";
}

function buildCoverVisualPlan(input: {
  project: MasterBlueprintEngineProject;
  variant: "master" | "university";
  title: string;
  shortHeaderTitle?: string | null;
  keywordsLine?: string | null;
  sections: AcademicSection[];
}): CoverVisualPlan {
  const runScope = input.project as {
    evidence_handoff_id?: string | null;
    evidence_run_id?: string | null;
    immutable_snapshot_hash?: string | null;
  };
  const topic =
    cleanAcademicText(input.project.intake?.topic) ||
    cleanAcademicText(input.project.topicAreaLabel ?? input.title);
  const methodContract = getMethodGenerationContract(input.project);
  const methodSummary =
    methodContract?.prompt_guidance.hero ||
    methodContract?.method_summary_for_generation ||
    "Flujo de investigación, revisión de evidencia, diseño metodológico, análisis comparativo/evaluación basada en evidencia y criterios preliminares. No mostrar nombres de técnicas específicas, matrices o modelos si la metodología todavía requiere confirmación.";
  const countryContext =
    (input.project as { country?: string | null }).country ??
    (input.project.intake as { country?: string | null } | null)?.country ??
    "PE";
  const workflowSummary = "problema, revision de evidencia, diseno metodologico, analisis/evaluacion y entrega academica";
  const sectionPlanSummary = input.sections
    .slice(0, 8)
    .map((section) => section.title)
    .filter(Boolean)
    .join("; ");
  const sourceHealthSummary =
    "usar tono prudente por limitaciones de evidencia sin mostrar conteos, quality gates ni diagnosticos internos";
  const plan = buildHeroInfographicPlan({
    finalTitle: input.title,
    shortMethodTitle: input.shortHeaderTitle,
    keywordsLine: input.keywordsLine,
    knowledgeArea: input.project.topicAreaLabel,
    countryContext,
    topicOrObject: topic,
    methodology: methodSummary,
    workflowSummary,
    sectionPlanSummary,
    sourceHealthSummary,
    handoffId: runScope.evidence_handoff_id,
    evidenceRunId: runScope.evidence_run_id,
    snapshotHash: runScope.immutable_snapshot_hash,
    variant: input.variant,
    language: documentLanguage(input.project),
  });

  return {
    hero_visual_type: plan.hero_visual_type,
    source_handoff_id: plan.source_handoff_id,
    source_evidence_run_id: plan.source_evidence_run_id,
    source_snapshot_hash: plan.source_snapshot_hash,
    deterministic_template_asset: plan.deterministic_template_asset,
    title: sentenceStyleCapitalizePublicText(plan.title, "title"),
    subtitle: sentenceStyleCapitalizePublicText(plan.subtitle, "title"),
    concept: sentenceStyleCapitalizePublicText(plan.concept, "sentence"),
    method_summary: sentenceStyleCapitalizePublicText(plan.method_summary, "sentence"),
    prompt: plan.prompt,
    hero_prompt_summary: sentenceStyleCapitalizePublicText(plan.hero_prompt_summary, "sentence"),
    hero_visual_caption: sentenceStyleCapitalizePublicText(plan.hero_visual_caption, "caption"),
    negative_prompt: plan.negative_prompt,
    image_path: null,
    image_model: null,
    image_generation_status: "not_requested",
    image_generation_warnings: [],
    image_layout: {
      width_px: 1024,
      height_px: 1536,
      min_first_page_height_pct: 60,
    },
    palette: {
      background: "F6F1EA",
      primary: "1F2937",
      accent: "7A4E2A",
      muted: "C9B8A7",
    },
  };
}

function buildAcademicDocxLayoutPlan(input: {
  variant: "master" | "university";
  project: MasterBlueprintEngineProject;
  title: string;
  shortHeaderTitle?: string | null;
  keywordsLine?: string | null;
  sections: AcademicSection[];
  assetPlacements: AssetPlacement[];
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
  mainBodySectionKeys?: string[];
}): AcademicDocxLayoutPlan {
  const countryContext =
    (input.project as { country?: string | null }).country ??
    (input.project.intake as { country?: string | null } | null)?.country ??
    "PE";
  const methodology = cleanAcademicText(input.project.intake?.preferredMethodology);
  const knowledgeArea = cleanAcademicText(input.project.topicAreaLabel);
  const scheduleGanttRows = buildResearchScheduleGanttRows({
    methodology,
    knowledgeArea,
    countryContext,
  }).map((row) => ({
    ...row,
    task: sentenceStyleCapitalizePublicText(row.task, "label"),
    dependencies: sentenceStyleCapitalizePublicText(row.dependencies, "label"),
    deliverable: sentenceStyleCapitalizePublicText(row.deliverable, "label"),
    assumption: row.assumption
      ? sentenceStyleCapitalizePublicText(row.assumption, "sentence")
      : row.assumption,
  }));
  const rawBudgetPlan = buildResearchBudgetPlan({
    methodology,
    knowledgeArea,
    countryContext,
  });
  const budgetPlan = {
    ...rawBudgetPlan,
    rows: rawBudgetPlan.rows.map((row) => ({
      ...row,
      category: sentenceStyleCapitalizePublicText(row.category.replace(/_/g, " "), "label"),
      item: sentenceStyleCapitalizePublicText(row.item, "label"),
      unit: sentenceStyleCapitalizePublicText(row.unit, "label"),
      assumption: sentenceStyleCapitalizePublicText(row.assumption, "sentence"),
    })),
    assumptions: rawBudgetPlan.assumptions.map((assumption) =>
      sentenceStyleCapitalizePublicText(assumption, "sentence"),
    ),
  };
  const rawAppendixPlan = buildPublicAppendixPlan({
    hasMatrix: true,
    hasScheduleBudget: true,
    hasVariables: input.sections.some((section) =>
      /variable|categoria|dimension/i.test(`${section.section_key} ${section.title}`),
    ),
    hasSourceSelection: true,
    hasInstruments: input.sections.some((section) =>
      /instrument|protocolo|tecnica/i.test(`${section.section_key} ${section.title}`),
    ),
  });
  const appendixPlan = {
    ...rawAppendixPlan,
    public_items: rawAppendixPlan.public_items.map((item) => ({
      ...item,
      title: sentenceStyleCapitalizePublicText(item.title, "heading"),
      purpose: sentenceStyleCapitalizePublicText(item.purpose, "sentence"),
    })),
  };
  const figures = buildFigureLayoutPlan({
    assetPlacements: input.assetPlacements,
    sections: input.sections,
    sourceLookup: input.sourceLookup,
    mainBodySectionKeys: input.mainBodySectionKeys,
  });
  const equations = buildEquationLayoutPlan({
    assetPlacements: input.assetPlacements,
    sections: input.sections,
    sourceLookup: input.sourceLookup,
    mainBodySectionKeys: input.mainBodySectionKeys,
  });
  const renderedAssetIdentities = new Set([
    ...figures.map((figure) => `${figure.source_id}|${figure.asset_key}`),
    ...equations.map((equation) => `${equation.source_id}|${equation.asset_key}`),
  ]);
  const suppressedAssetKeys = input.assetPlacements
    .filter((asset) => !renderedAssetIdentities.has(uniqueAssetIdentity(asset)))
    .map((asset) => asset.asset_key);
  const textAssetCount = input.assetPlacements.filter(
    (asset) => asset.render_mode === "text_fallback" || (!asset.renderable && asset.render_mode !== "equation"),
  ).length;

  return {
    artifact_type: "academic_docx_layout_plan",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    source: "deterministic_preflight",
    figures,
    equations,
    schedule_visual: buildScheduleVisualPlan({
      project: input.project,
      sections: input.sections,
      scheduleGanttRows,
    }),
    schedule_gantt_rows: scheduleGanttRows,
    budget_rows: budgetPlan.rows,
    budget_total_range: budgetPlan.total_estimated_range,
    appendix_public_items: appendixPlan.public_items,
    appendix_internal_items: appendixPlan.internal_items_excluded,
    cover_visual: buildCoverVisualPlan({
      project: input.project,
      variant: input.variant,
      title: input.title,
      shortHeaderTitle: input.shortHeaderTitle,
      keywordsLine: input.keywordsLine,
      sections: input.sections,
    }),
    suppressed_asset_keys: uniqueItems(suppressedAssetKeys),
    public_annex_policy: {
      include_internal_traceability: false,
      omitted_internal_fields: [
        "OpenAlex URL",
        "source_id",
        "asset_key",
        "file_path",
        "hash",
        "runtime backend",
      ],
    },
    warnings: [
      textAssetCount > 0
        ? `${textAssetCount} assets textuales o no renderizables fueron excluidos del DOCX academico y se conservan solo en JSON/UI.`
        : "",
      equations.length === 0 && input.assetPlacements.some((asset) => asset.render_mode === "equation")
        ? "Se detectaron assets de ecuacion sin LaTeX/formula suficiente; no se insertaron para evitar inventar contenido."
        : "",
    ].filter(Boolean),
  };
}

export function buildAssetLayoutPlanForDiagnostics(input: {
  sections: AcademicSection[];
  assetPlacements: AssetPlacement[];
  sourceLookup?: Map<string, EvidenceLedger["source_registry"][number]>;
  mainBodySectionKeys?: string[];
}) {
  const sourceLookup =
    input.sourceLookup ?? new Map<string, EvidenceLedger["source_registry"][number]>();
  const figures = buildFigureLayoutPlan({
    assetPlacements: input.assetPlacements,
    sections: input.sections,
    sourceLookup,
    mainBodySectionKeys: input.mainBodySectionKeys,
  }).map((figure) => ({
    ...figure,
    caption: sentenceStyleCapitalizePublicText(figure.caption, "caption"),
    source_note: sentenceStyleCapitalizePublicText(figure.source_note, "sentence"),
    body_reference: sentenceStyleCapitalizePublicText(figure.body_reference, "sentence"),
  }));
  const equations = buildEquationLayoutPlan({
    assetPlacements: input.assetPlacements,
    sections: input.sections,
    sourceLookup,
    mainBodySectionKeys: input.mainBodySectionKeys,
  }).map((equation) => ({
    ...equation,
    caption: sentenceStyleCapitalizePublicText(equation.caption, "caption"),
    purpose: sentenceStyleCapitalizePublicText(equation.purpose, "sentence"),
    source_note: sentenceStyleCapitalizePublicText(equation.source_note, "sentence"),
    body_reference: sentenceStyleCapitalizePublicText(equation.body_reference, "sentence"),
    variable_notes: equation.variable_notes.map((note) => ({
      ...note,
      description: sentenceStyleCapitalizePublicText(note.description, "sentence"),
    })),
  }));

  return {
    figures,
    equations,
  };
}

export function resolveWordStyleContract(): WordStyleContract {
  return {
    title: "Title",
    subtitle: "Subtitle",
    heading1: "Heading1",
    heading2: "Heading2",
    heading3: "Heading3",
    heading4: "Heading4",
    heading5: "Heading5",
    body: "Normal",
    caption: "Caption",
    table: "IMXTable",
    tableHeader: "IMXTableHeader",
    matrixCell: "IMXMatrixCell",
    reference: "Bibliography",
    annexHeading: "Heading1",
  };
}

export function solveTableLayout(input: {
  columnCount: number;
  columnWidthsPct?: number[];
  forceLandscape?: boolean;
  rowCount?: number;
}): TableLayoutDecision {
  const columnCount = Math.max(1, input.columnCount);
  const landscape = Boolean(input.forceLandscape || columnCount > 5);
  const defaultWidth = Number((100 / columnCount).toFixed(2));

  return {
    orientation: landscape ? "landscape" : "portrait",
    column_widths_pct:
      input.columnWidthsPct?.length === columnCount
        ? input.columnWidthsPct
        : Array.from({ length: columnCount }, () => defaultWidth),
    font_size_pt: landscape || columnCount > 4 ? 7.5 : 8.5,
    repeat_header: true,
    allow_wrap: true,
    split_strategy: (input.rowCount ?? 0) > 18 ? "chunked_by_rows" : "single_table",
  };
}

function citationParagraphIndexes(paragraphCount: number, citationCount: number) {
  const safeParagraphCount = Math.max(1, paragraphCount);
  const safeCitationCount = Math.max(0, citationCount);
  if (safeCitationCount === 0) {
    return [];
  }

  if (safeCitationCount === 1) {
    return [0];
  }

  return Array.from({ length: safeCitationCount }, (_, index) => {
    const denominator = Math.max(1, safeCitationCount - 1);
    return Math.min(
      safeParagraphCount - 1,
      Math.round((index * (safeParagraphCount - 1)) / denominator),
    );
  });
}

function citationTargetCountForSection(input: {
  sectionKey: string;
  content: string;
}) {
  if (/^[-*]\s/m.test(input.content)) {
    return Math.max(1, parseListItems(input.content).length);
  }

  if (BULLET_FRIENDLY_SECTION_KEYS.has(input.sectionKey)) {
    const sentenceCount = splitParagraphs(input.content).flatMap((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 18),
    ).length;

    if (sentenceCount >= 3) {
      return sentenceCount;
    }
  }

  return Math.max(1, splitParagraphs(input.content).length);
}

function splitInlineBulletItems(content: string) {
  return content
    .replace(/\s+-\s+(?=[A-ZÁÉÍÓÚÑ¿])/g, "\n- ")
    .split(/\r?\n/)
    .flatMap((line) =>
      line
        .split(/\n(?=-\s+)/)
        .map((item) => item.trim()),
    )
    .map(stripListPrefix)
    .map((item) => item.trim())
    .filter((item) => item.length > 18);
}

function isSourceAllowedForPublicSection(input: {
  sectionKey: string;
  source: EvidenceLedger["source_registry"][number] | undefined;
}) {
  if (!input.source || !isCentralClaimSection(input.sectionKey)) {
    return Boolean(input.source);
  }

  const source = input.source as EvidenceLedger["source_registry"][number] & {
    source_health?: string | null;
    topic_fit?: string | null;
    allowed_evidence_use?: string | null;
  };
  const sourceHealth = String(source.source_health ?? "").toLowerCase();
  const topicFit = String(source.topic_fit ?? "").toLowerCase();
  const allowedUse = String(source.allowed_evidence_use ?? "").toLowerCase();

  if (["metadata_only", "unresolved", "unextractable_pdf", "wrong_document_suspected"].includes(sourceHealth)) {
    return false;
  }
  if (["adjacent", "background", "weak"].includes(topicFit)) {
    return false;
  }
  if (["cautious_support", "context_only", "gap_only", "do_not_use"].includes(allowedUse)) {
    return false;
  }

  return true;
}

function filterSourceIdsForPublicSection(input: {
  sectionKey: string;
  sourceIds: string[];
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}) {
  return uniqueItems(input.sourceIds).filter((sourceId) =>
    isSourceAllowedForPublicSection({
      sectionKey: input.sectionKey,
      source: input.sourceLookup.get(sourceId),
    }),
  );
}

function buildCitationAnchors(input: {
  section: RenderSectionInput;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}) {
  if (NO_INLINE_CITATION_SECTIONS.has(input.section.section_key)) {
    return [];
  }

  const sources = filterSourceIdsForPublicSection({
    sectionKey: input.section.section_key,
    sourceIds: input.section.source_ids,
    sourceLookup: input.sourceLookup,
  })
    .map((sourceId) => input.sourceLookup.get(sourceId))
    .filter((source): source is EvidenceLedger["source_registry"][number] => Boolean(source))
    .slice(0, 4);

  if (sources.length === 0) {
    return [];
  }

  const paragraphCount = citationTargetCountForSection({
    sectionKey: input.section.section_key,
    content: input.section.content,
  });
  const paragraphIndexes = citationParagraphIndexes(paragraphCount, sources.length);

  return sources.map((source, index): CitationAnchor => ({
    anchor_id: `${input.section.section_key}-cite-${index + 1}`,
    section_key: input.section.section_key,
    paragraph_index: paragraphIndexes[index] ?? Math.min(index, paragraphCount - 1),
    source_ids: [source.source_id],
    evidence_ids: input.section.evidence_ids.slice(index, index + 1),
    original_excerpt_ids: input.section.original_excerpt_ids.slice(index, index + 1),
    rendered_citation: formatCitationLabel(source),
    reason: "Cita conservadora compilada desde fuentes soportadas por la secci\u00f3n.",
  }));
}

function buildSectionBlocks(input: {
  sectionKey: string;
  content: string;
  citationAnchors: CitationAnchor[];
}): AcademicSectionBlock[] {
  const controlledLogicBlocks = controlledLogicSectionBlocks({
    sectionKey: input.sectionKey,
    content: input.content,
  });
  if (controlledLogicBlocks) {
    return controlledLogicBlocks;
  }

  const markdownTable = parseAcademicTable(input.content);

  if (markdownTable.length > 0) {
    const nonTableText = removeTableLines(input.content);
    const paragraphs = splitParagraphs(nonTableText).map((text, index): AcademicSectionBlock => ({
      block_type: "paragraph",
      text: sentenceStyleCapitalizePublicText(text, "sentence"),
      citation_anchor_ids: input.citationAnchors
        .filter((anchor) => anchor.paragraph_index === index)
        .map((anchor) => anchor.anchor_id),
    }));

    return [
      ...paragraphs,
      {
        block_type: "table",
        rows: capitalizePublicTableRows(markdownTable),
        layout: solveTableLayout({
          columnCount: markdownTable[0]?.length ?? 1,
          rowCount: markdownTable.length,
        }),
        caption: null,
      },
    ];
  }

  if (/^[-*]\s/m.test(input.content)) {
    return parseListItems(input.content).map((text, index) => ({
      block_type: "bullet",
      text: sentenceStyleCapitalizePublicText(text, "sentence"),
      citation_anchor_ids: input.citationAnchors
        .filter((anchor) => anchor.paragraph_index === index)
        .map((anchor) => anchor.anchor_id),
    }));
  }

  const paragraphs = splitParagraphs(input.content);
  if (BULLET_FRIENDLY_SECTION_KEYS.has(input.sectionKey)) {
    const inlineBulletItems = splitInlineBulletItems(input.content);
    if (inlineBulletItems.length >= 3) {
      return inlineBulletItems.slice(0, 20).map((text, index) => ({
        block_type: "bullet",
        text: sentenceStyleCapitalizePublicText(text, "sentence"),
        citation_anchor_ids: input.citationAnchors
          .filter((anchor) => anchor.paragraph_index === index)
          .map((anchor) => anchor.anchor_id),
      }));
    }
  }

  if (BULLET_FRIENDLY_SECTION_KEYS.has(input.sectionKey) && paragraphs.length > 0) {
    const sentenceLikeItems = paragraphs
      .flatMap((paragraph) =>
        paragraph
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter((sentence) => sentence.length > 18),
      )
      .slice(0, 20);
    if (sentenceLikeItems.length >= 3) {
      return sentenceLikeItems.map((text, index) => ({
        block_type: "bullet",
        text: sentenceStyleCapitalizePublicText(text, "sentence"),
        citation_anchor_ids: input.citationAnchors
          .filter((anchor) => anchor.paragraph_index === index)
          .map((anchor) => anchor.anchor_id),
      }));
    }
  }

  return paragraphs.map((text, index) => ({
    block_type: "paragraph",
    text: sentenceStyleCapitalizePublicText(text, "sentence"),
    citation_anchor_ids: input.citationAnchors
      .filter((anchor) => anchor.paragraph_index === index)
      .map((anchor) => anchor.anchor_id),
  }));
}

export function buildAcademicSectionBlocksForDiagnostics(input: {
  sectionKey: string;
  content: string;
}) {
  return buildSectionBlocks({
    sectionKey: input.sectionKey,
    content: input.content,
    citationAnchors: [],
  });
}

export function buildCitationReferenceLayerForDiagnostics(input: {
  sectionKey: string;
  title: string;
  content: string;
  sourceRegistry: EvidenceLedger["source_registry"];
  sourceIds?: string[];
  secondaryReferenceReport?: SecondaryReferenceCandidatesReport | null;
}) {
  const evidenceLedger: EvidenceLedger = {
    source_registry: input.sourceRegistry,
    evidence_packs: [],
    assets: [],
    assumptions: [],
    snippets: [],
    warnings: [],
  };
  const sourceLookup = buildSourceLookup(evidenceLedger);
  const section: RenderSectionInput = {
    section_key: input.sectionKey,
    title: input.title,
    level: 1,
    content: input.content,
    source_ids: input.sourceIds ?? input.sourceRegistry.map((source) => source.source_id),
    evidence_ids: [],
    original_excerpt_ids: [],
    asset_keys: [],
    unsupported_or_cautious_claim_warnings: [],
    warnings: [],
  };
  const citationAnchors = buildCitationAnchors({
    section,
    sourceLookup,
  });

  return {
    citation_anchors: citationAnchors,
    blocks: buildSectionBlocks({
      sectionKey: input.sectionKey,
      content: input.content,
      citationAnchors,
    }),
    references: resolveReferences({
      evidenceLedger,
      preferredSourceIds: section.source_ids,
      secondaryReferenceReport: input.secondaryReferenceReport,
    }),
  };
}

function getMethodGenerationContract(project: MasterBlueprintEngineProject) {
  return (project as MasterBlueprintEngineProject & {
    method_generation_contract?: MethodGenerationContractV1 | null;
  }).method_generation_contract ?? null;
}

function getSecondaryReferenceReport(project: MasterBlueprintEngineProject) {
  return (project as MasterBlueprintEngineProject & {
    secondary_reference_candidates_report?: SecondaryReferenceCandidatesReport | null;
  }).secondary_reference_candidates_report ?? null;
}

function compileSection(input: {
  section: RenderSectionInput;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}): AcademicSection {
  const publicSourceIds = filterSourceIdsForPublicSection({
    sectionKey: input.section.section_key,
    sourceIds: input.section.source_ids,
    sourceLookup: input.sourceLookup,
  });
  const sectionForCitations = {
    ...input.section,
    source_ids: publicSourceIds,
  };
  const citationAnchors = buildCitationAnchors({
    section: sectionForCitations,
    sourceLookup: input.sourceLookup,
  });

  return {
    section_key: input.section.section_key,
    title: sentenceStyleCapitalizePublicText(input.section.title, "heading"),
    level: input.section.level,
    source_ids: publicSourceIds,
    evidence_ids: uniqueItems(input.section.evidence_ids),
    original_excerpt_ids: uniqueItems(input.section.original_excerpt_ids),
    asset_keys: uniqueItems(input.section.asset_keys),
    evidence_support_summary: input.section.evidence_support_summary,
    support_tier: input.section.section_evidence_binding?.support_tier,
    section_evidence_binding_score:
      input.section.section_evidence_binding?.section_evidence_binding_score,
    unsupported_or_cautious_claim_warnings:
      input.section.unsupported_or_cautious_claim_warnings,
    citation_anchors: citationAnchors,
    blocks: buildSectionBlocks({
      sectionKey: input.section.section_key,
      content: input.section.content,
      citationAnchors,
    }),
    warnings: input.section.warnings,
  };
}

const MASTER_SECTION_KEYS_MERGED_INTO_PARENT = new Set([
  "variables_indicators",
  "categories_subcategories",
]);

function childSectionsMergedIntoAvailableParents(sectionKeys: Set<string>) {
  const merged = new Set(MASTER_SECTION_KEYS_MERGED_INTO_PARENT);

  if (sectionKeys.has("objectives")) {
    merged.add("general_objective");
    merged.add("specific_objectives");
  }
  if (sectionKeys.has("hypotheses")) {
    merged.add("general_hypothesis");
    merged.add("specific_hypotheses");
  }
  if (sectionKeys.has("research_questions")) {
    merged.add("general_research_question");
    merged.add("specific_research_questions");
  }

  return merged;
}

function mergeDraftsForSection(input: {
  primaryDraft: MasterSectionDraft | null;
  mergedDrafts: MasterSectionDraft[];
}) {
  const drafts = [
    input.primaryDraft,
    ...input.mergedDrafts,
  ].filter((draft): draft is MasterSectionDraft => Boolean(draft));

  return {
    content: uniqueItems(drafts.map((draft) => cleanAcademicText(draft.content))).join("\n\n"),
    source_ids: uniqueItems(
      drafts.flatMap((draft) => [
        ...draft.supported_source_ids,
        ...draft.supported_pdf_source_ids,
        ...draft.supported_web_source_ids,
      ]),
    ),
    evidence_ids: uniqueItems(drafts.flatMap((draft) => draft.used_evidence_ids ?? [])),
    original_excerpt_ids: uniqueItems(
      drafts.flatMap((draft) => draft.used_original_excerpt_ids ?? []),
    ),
    asset_keys: uniqueItems(drafts.flatMap((draft) => draft.used_asset_keys ?? [])),
    evidence_support_summary:
      drafts.find((draft) => draft.evidence_support_summary)?.evidence_support_summary,
    section_evidence_binding:
      drafts.find((draft) => draft.section_evidence_binding)?.section_evidence_binding,
    unsupported_or_cautious_claim_warnings: uniqueItems(
      drafts.flatMap((draft) => draft.unsupported_or_cautious_claim_warnings ?? []),
    ),
    warnings: uniqueItems(drafts.flatMap((draft) => draft.warnings ?? [])),
  };
}

function buildControlledLogicContent(input: {
  sectionKey: string;
  draftMap: Map<string, MasterSectionDraft>;
}) {
  const configs: Record<string, {
    generalKey: string;
    specificKey: string;
    generalLabel: string;
    specificLabel: string;
  }> = {
    objectives: {
      generalKey: "general_objective",
      specificKey: "specific_objectives",
      generalLabel: "Objetivo general",
      specificLabel: "Objetivos especificos",
    },
    hypotheses: {
      generalKey: "general_hypothesis",
      specificKey: "specific_hypotheses",
      generalLabel: "Hipotesis general",
      specificLabel: "Hipotesis especificas",
    },
    research_questions: {
      generalKey: "general_research_question",
      specificKey: "specific_research_questions",
      generalLabel: "Pregunta general",
      specificLabel: "Preguntas especificas",
    },
  };
  const config = configs[input.sectionKey];

  if (!config) {
    return null;
  }

  const parentDraft = input.draftMap.get(input.sectionKey) ?? null;
  const generalDraft = input.draftMap.get(config.generalKey) ?? null;
  const specificDraft = input.draftMap.get(config.specificKey) ?? null;
  const general =
    firstLogicItem(generalDraft?.content) ??
    firstLogicItem(parentDraft?.content);
  const specifics =
    logicListItems(specificDraft?.content).length > 0
      ? logicListItems(specificDraft?.content)
      : logicListItems(parentDraft?.content).filter((item) => item !== general);

  if (!general && specifics.length === 0) {
    return null;
  }

  return [
    general
      ? `${sentenceStyleCapitalizePublicText(config.generalLabel, "label")}:\n${sentenceStyleCapitalizePublicText(general, "sentence")}`
      : null,
    specifics.length > 0
      ? [
          `${sentenceStyleCapitalizePublicText(config.specificLabel, "label")}:`,
          ...specifics.slice(0, 6).map((item, index) => {
            const prefix =
              input.sectionKey === "research_questions"
                ? `P${index + 1}`
                : input.sectionKey === "objectives"
                  ? `OE${index + 1}`
                  : `HE${index + 1}`;
            return `- ${prefix}: ${sentenceStyleCapitalizePublicText(item, "sentence")}`;
          }),
        ].join("\n")
      : null,
  ].filter((item): item is string => Boolean(item)).join("\n\n");
}

function controlledLogicChildKeys(sectionKey: string) {
  if (sectionKey === "objectives") {
    return ["general_objective", "specific_objectives"];
  }
  if (sectionKey === "hypotheses") {
    return ["general_hypothesis", "specific_hypotheses"];
  }
  if (sectionKey === "research_questions") {
    return ["general_research_question", "specific_research_questions"];
  }
  return [];
}

function buildMasterSectionInputs(input: {
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
}): RenderSectionInput[] {
  const draftMap = new Map(input.drafts.map((draft) => [draft.section_key, draft]));
  const templateKeys = new Set(input.masterTemplate.sections.map((section) => section.semantic_key));
  const mergedIntoParent = childSectionsMergedIntoAvailableParents(templateKeys);
  const sections: RenderSectionInput[] = [];

  for (const templateSection of input.masterTemplate.sections) {
    if (mergedIntoParent.has(templateSection.semantic_key)) {
      continue;
    }

    const draft = draftMap.get(templateSection.semantic_key);
    const merged =
      templateSection.semantic_key === "variables_or_categories"
        ? mergeDraftsForSection({
            primaryDraft: draft ?? null,
            mergedDrafts: [
              draftMap.get("variables_indicators"),
              draftMap.get("categories_subcategories"),
            ].filter((item): item is MasterSectionDraft => Boolean(item)),
          })
        : null;
    const controlledLogicContent = buildControlledLogicContent({
      sectionKey: templateSection.semantic_key,
      draftMap,
    });
    const controlledLogicMerged = controlledLogicContent
      ? mergeDraftsForSection({
          primaryDraft: draft ?? null,
          mergedDrafts: controlledLogicChildKeys(templateSection.semantic_key)
            .map((key) => draftMap.get(key))
            .filter((item): item is MasterSectionDraft => Boolean(item)),
        })
      : null;
    if (!draft && !merged?.content && !controlledLogicContent) {
      continue;
    }

    sections.push({
      section_key: templateSection.semantic_key,
      title: templateSection.title || draft?.title || templateSection.semantic_key,
      content: controlledLogicContent ?? merged?.content ?? draft?.content ?? "",
      level: templateSection.level,
      source_ids:
        controlledLogicMerged?.source_ids ??
        merged?.source_ids ??
        [
          ...(draft?.supported_source_ids ?? []),
          ...(draft?.supported_pdf_source_ids ?? []),
          ...(draft?.supported_web_source_ids ?? []),
        ],
      evidence_ids:
        controlledLogicMerged?.evidence_ids ?? merged?.evidence_ids ?? draft?.used_evidence_ids ?? [],
      original_excerpt_ids:
        controlledLogicMerged?.original_excerpt_ids ??
        merged?.original_excerpt_ids ??
        draft?.used_original_excerpt_ids ??
        [],
      asset_keys: controlledLogicMerged?.asset_keys ?? merged?.asset_keys ?? draft?.used_asset_keys ?? [],
      evidence_support_summary:
        controlledLogicMerged?.evidence_support_summary ??
        merged?.evidence_support_summary ?? draft?.evidence_support_summary,
      section_evidence_binding:
        controlledLogicMerged?.section_evidence_binding ??
        merged?.section_evidence_binding ?? draft?.section_evidence_binding,
      unsupported_or_cautious_claim_warnings:
        controlledLogicMerged?.unsupported_or_cautious_claim_warnings ??
        merged?.unsupported_or_cautious_claim_warnings ??
        draft?.unsupported_or_cautious_claim_warnings ??
        [],
      warnings: controlledLogicMerged?.warnings ?? merged?.warnings ?? draft?.warnings ?? [],
    });
  }

  return sections;
}

function localizedUniversitySectionTitle(section: UniversityBlueprintSection, language: string) {
  if (language !== "en") {
    return section.title;
  }

  const titles: Record<string, string> = {
    abstract: "Abstract",
    keywords: "Keywords",
    introduction: "Introduction",
    problem_statement: "Problem statement",
    research_questions: "Research questions",
    general_research_question: "General research question",
    specific_research_questions: "Specific research questions",
    objectives: "Objectives",
    general_objective: "General objective",
    specific_objectives: "Specific objectives",
    hypotheses: "Hypotheses",
    general_hypothesis: "General hypothesis",
    specific_hypotheses: "Specific hypotheses",
    justification: "Justification",
    theoretical_justification: "Theoretical justification",
    practical_justification: "Practical justification",
    methodological_justification: "Methodological justification",
    theoretical_framework: "Theoretical framework",
    research_antecedents: "Research background",
    state_of_the_art: "State of the art",
    theoretical_bases: "Theoretical foundations",
    terms_definition: "Definition of terms",
    consistency_matrix: "Consistency matrix",
    variables_or_categories: "Variables, dimensions, and indicators or analysis categories",
    methodology: "Methodology",
    methodological_approach: "Approach, type, and level",
    research_design: "Research design",
    population_and_sample: "Population and sample",
    data_collection_techniques: "Data collection techniques and instruments",
    research_instruments: "Research instruments",
    research_procedure: "Procedure",
    analysis_plan: "Data or information analysis plan",
    ethics: "Ethical aspects",
    scope_and_limitations: "Scope and limitations",
    schedule: "Schedule",
    budget: "Budget",
    references: "References",
    annexes: "Appendices",
  };

  return titles[section.section_key] ?? section.title;
}

function buildUniversitySectionInputs(
  universityBlueprint: UniversityBlueprintPackage,
  language = "es",
): RenderSectionInput[] {
  return universityBlueprint.sections.map((section: UniversityBlueprintSection) => ({
    section_key: section.section_key,
    title: localizedUniversitySectionTitle(section, language),
    content: section.content,
    level: section.level ?? (section.section_key.includes("_") ? 2 : 1),
    source_ids: section.source_ids ?? [],
    evidence_ids: section.evidence_snippet_ids ?? [],
    original_excerpt_ids: [],
    asset_keys: section.used_asset_keys ?? [],
    evidence_support_summary: undefined,
    section_evidence_binding: undefined,
    unsupported_or_cautious_claim_warnings: section.warnings ?? [],
    warnings: section.warnings ?? [],
  }));
}

function renderModeForAsset(asset: PdfAssetRecord): AssetPlacement["render_mode"] {
  if (asset.kind === "image") {
    return asset.file_path ? "image" : "text_fallback";
  }

  if (asset.kind === "equation") {
    return asset.file_path ? "image" : "equation";
  }

  return asset.file_path ? "image" : "table";
}

function normalizeAssetSectionKey(sectionKey: string) {
  const normalized = sectionKey.trim();
  const sectionMap: Record<string, string> = {
    technical_framework: "theoretical_framework",
    evaluation_criteria: "methodology",
    asset_plan: "annexes",
  };

  return sectionMap[normalized] ?? normalized;
}

function compileAssetPlacements(input: {
  evidenceLedger: EvidenceLedger;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
}) {
  const assetsByKey = new Map(input.evidenceLedger.assets.map((asset) => [asset.asset_key, asset]));
  const assetsByCompositeKey = new Map(
    input.evidenceLedger.assets.map((asset) => [`${asset.source_id}|${asset.asset_key}`, asset]),
  );
  const plannedIdentities = new Set(
    input.consolidatedAssetUsagePlan.map((plannedAsset) =>
      `${String(plannedAsset.source_id ?? "unknown-source").trim()}|${String(plannedAsset.asset_key ?? "asset").trim()}`,
    ),
  );
  const technicalAssetSupplements = input.evidenceLedger.assets
    .filter((asset) => asset.kind === "equation" || asset.kind === "table")
    .filter((asset) => !plannedIdentities.has(`${asset.source_id}|${asset.asset_key}`))
    .map((asset) => ({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.kind === "equation" ? "theoretical_framework" : "methodology",
      usage_reason: asset.caption ?? asset.title,
    }));
  const plannedAssets = [
    ...input.consolidatedAssetUsagePlan,
    ...technicalAssetSupplements,
  ].slice(0, 40);

  return plannedAssets.map((plannedAsset): AssetPlacement => {
    const assetKey = String(plannedAsset.asset_key ?? "asset").trim();
    const plannedSourceId = String(plannedAsset.source_id ?? "unknown-source").trim();
    const ledgerAsset =
      assetsByCompositeKey.get(`${plannedSourceId}|${assetKey}`) ?? assetsByKey.get(assetKey);
    const sectionKey = normalizeAssetSectionKey(String(plannedAsset.section_key ?? "annexes"));
    const renderMode = ledgerAsset ? renderModeForAsset(ledgerAsset) : "text_fallback";
    const warnings = [
      !ledgerAsset ? "Asset planificado sin registro materializado en EvidenceLedger." : null,
      ledgerAsset && !ledgerAsset.file_path ? "Asset sin file_path renderizable; se mantiene como referencia textual." : null,
    ].filter((warning): warning is string => Boolean(warning));

    return {
      asset_key: assetKey,
      source_id: ledgerAsset?.source_id ?? String(plannedAsset.source_id ?? "unknown-source"),
      section_key: sectionKey,
      placement: renderMode === "image" ? "after_paragraph" : "annex",
      paragraph_anchor: renderMode === "image" ? 0 : null,
      caption: ledgerAsset?.caption ?? String(plannedAsset.usage_reason ?? "Apoyo visual de soporte metodológico."),
      render_mode: renderMode,
      renderable: Boolean(ledgerAsset?.file_path),
      file_path: ledgerAsset?.file_path ?? null,
      text_content: ledgerAsset?.text_content ?? null,
      warnings,
    };
  });
}

function buildMatrixLayout(matrixArtifact: ConsistencyMatrixArtifact) {
  const tableModel = matrixArtifact.table_model;
  return solveTableLayout({
    columnCount: tableModel?.columns.length ?? 7,
    columnWidthsPct: tableModel?.columns.map((column) => column.width_pct),
    forceLandscape: true,
    rowCount: (tableModel?.body_rows.length ?? 0) + 1,
  });
}

function buildAcademicDocument(input: {
  variant: "master" | "university";
  project: MasterBlueprintEngineProject;
  templateKey: string;
  templateName: string;
  subtitle: string;
  universityBlueprint?: UniversityBlueprintPackage | null;
  legacyBlueprint: ResearchBlueprintRecord;
  sectionInputs: RenderSectionInput[];
  matrixArtifact: ConsistencyMatrixArtifact;
  evidenceLedger: EvidenceLedger;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
}): AcademicDocument {
  const sourceLookup = buildSourceLookup(input.evidenceLedger);
  const sections = input.sectionInputs.map((section) =>
    compileSection({
      section,
      sourceLookup,
    }),
  );
  const assetPlacements = compileAssetPlacements({
    evidenceLedger: input.evidenceLedger,
    consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
  });
  const usedSourceIds = uniqueItems([
    ...sections.flatMap((section) => section.source_ids),
    ...sections.flatMap((section) =>
      section.citation_anchors.flatMap((anchor) => anchor.source_ids),
    ),
    ...assetPlacements.map((asset) => asset.source_id),
    ...input.evidenceLedger.evidence_packs.map((pack) => pack.source_id),
    ...input.evidenceLedger.assets.map((asset) => asset.source_id),
  ]);
  const reportArchetype = resolveReportArchetype(input.variant);
  const editorialPlan = buildEditorialPlan({
    variant: input.variant,
    sections,
  });
  const branding = resolveBrandingAssets({
    variant: input.variant,
    universityBlueprint: input.universityBlueprint ?? null,
  });
  const methodContract = getMethodGenerationContract(input.project);
  const methodSummary =
    methodContract?.method_summary_for_generation ||
    cleanAcademicText(input.project.intake?.preferredMethodology) ||
    sectionTextForKey(sections, [/method/i, /metodolog/i, /design/i, /diseno/i]) ||
    null;
  const scopeSummary =
    cleanAcademicText(input.project.intake?.targetPopulation) ||
    sectionTextForKey(sections, [/population/i, /poblacion/i, /sample/i, /muestra/i]) ||
    null;
  const enforcedMetadata = buildEnforcedAcademicMetadata({
    current_title: input.legacyBlueprint.project_title,
    method_or_technique: methodSummary,
    object_of_study:
      cleanAcademicText(input.project.intake?.topic) ||
      input.legacyBlueprint.project_title,
    scope_or_sample: scopeSummary,
    problem_or_purpose: cleanAcademicText(input.project.intake?.problemContext),
    country_context:
      (input.project as { country?: string | null; countryContext?: string | null })
        .country ??
      (input.project as { country?: string | null; countryContext?: string | null })
        .countryContext ??
      "PE",
    knowledge_area_label: input.project.topicAreaLabel,
    keywords: methodContract?.keyword_terms ?? null,
  });
  const language = documentLanguage(input.project);
  const metadataTitle = sentenceStyleCapitalizePublicText(
    language === "en"
      ? normalizeEnglishAcademicText(
          cleanAcademicText(input.project.title) ||
            cleanAcademicText(input.legacyBlueprint.project_title) ||
            enforcedMetadata.final_title,
        )
      : enforcedMetadata.final_title,
    "title",
  );
  const shortHeaderTitle = sentenceStyleCapitalizePublicText(
    language === "en"
      ? normalizeEnglishAcademicText(
          cleanAcademicText(input.project.title) ||
            enforcedMetadata.short_method_title,
        )
      : enforcedMetadata.short_method_title,
    "title",
  );
  const keywordsLine =
    language === "en"
      ? normalizeEnglishAcademicText(capitalizeKeywordLine(enforcedMetadata.keywords_line))
      : capitalizeKeywordLine(enforcedMetadata.keywords_line);
  const layoutPlan = buildAcademicDocxLayoutPlan({
    variant: input.variant,
    project: input.project,
    title: metadataTitle,
    shortHeaderTitle,
    keywordsLine,
    sections,
    assetPlacements,
    sourceLookup,
    mainBodySectionKeys: editorialPlan.main_body_section_keys,
  });

  const document: AcademicDocument = {
    artifact_type: "academic_document_model",
    artifact_version: "v1",
    variant: input.variant,
    language,
    template_key: input.templateKey,
    template_name: input.templateName,
    citation_style: "APA7",
    report_archetype: reportArchetype,
    metadata: {
      title: metadataTitle,
      short_header_title: shortHeaderTitle,
      keywords_line: keywordsLine,
      subtitle: sentenceStyleCapitalizePublicText(input.subtitle, "sentence"),
      university: sentenceStyleCapitalizePublicText(input.project.university, "label"),
      program: sentenceStyleCapitalizePublicText(input.project.program, "label"),
      generated_at: new Date().toISOString(),
    },
    branding,
    editorial_plan: editorialPlan,
    llm_editorial_passes: [],
    public_sanitization_passes: [],
    llm_layout_passes: [],
    layout_plan: layoutPlan,
    style_contract: resolveWordStyleContract(),
    sections,
    matrix: input.matrixArtifact,
    matrix_layout: buildMatrixLayout(input.matrixArtifact),
    references: resolveReferences({
      evidenceLedger: input.evidenceLedger,
      preferredSourceIds: usedSourceIds,
      secondaryReferenceReport: getSecondaryReferenceReport(input.project),
    }),
    asset_placements: assetPlacements,
    qa_policy: {
      require_landscape_matrix: true,
      require_references: true,
      require_traceability_annex: true,
      forbid_markdown_markers: true,
    },
    warnings: uniqueItems([
      ...input.evidenceLedger.warnings,
      ...assetPlacements.flatMap((placement) => placement.warnings),
      ...branding.flatMap((asset) => asset.warnings),
      ...editorialPlan.quality_warnings,
      ...enforcedMetadata.warnings.map((warning) => `Editorial metadata: ${warning}`),
      ...layoutPlan.warnings,
    ]),
  };

  const publicDocument = normalizeAcademicDocumentPublicFields(document);

  return language === "en"
    ? normalizeEnglishAcademicDocument(publicDocument)
    : publicDocument;
}

export function buildMasterAcademicDocument(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
  matrixArtifact: ConsistencyMatrixArtifact;
  evidenceLedger: EvidenceLedger;
  legacyBlueprint: ResearchBlueprintRecord;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
}) {
  const english = isEnglishProject(input.project);
  return buildAcademicDocument({
    variant: "master",
    project: input.project,
    templateKey: input.masterTemplate.template_key,
    templateName: input.masterTemplate.template_name,
    subtitle: english
      ? "Academic document for a research project"
      : "Documento academico para proyecto de investigacion",
    legacyBlueprint: input.legacyBlueprint,
    sectionInputs: buildMasterSectionInputs({
      masterTemplate: input.masterTemplate,
      drafts: input.drafts,
    }),
    matrixArtifact: input.matrixArtifact,
    evidenceLedger: input.evidenceLedger,
    consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
  });
}

export function buildUniversityAcademicDocument(input: {
  project: MasterBlueprintEngineProject;
  universityBlueprint: UniversityBlueprintPackage;
  matrixArtifact: ConsistencyMatrixArtifact;
  evidenceLedger: EvidenceLedger;
  legacyBlueprint: ResearchBlueprintRecord;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
}) {
  const english = isEnglishProject(input.project);
  return buildAcademicDocument({
    variant: "university",
    project: input.project,
    templateKey: input.universityBlueprint.template_key,
    templateName: input.universityBlueprint.template_name,
    subtitle:
      [input.project.degreeLevel, input.project.program].filter(Boolean).join(" - ") ||
      (english ? "Institutional thesis plan" : "Plan de tesis institucional"),
    universityBlueprint: input.universityBlueprint,
    legacyBlueprint: input.legacyBlueprint,
    sectionInputs: buildUniversitySectionInputs(
      input.universityBlueprint,
      documentLanguage(input.project),
    ),
    matrixArtifact: input.matrixArtifact,
    evidenceLedger: input.evidenceLedger,
    consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
  });
}
