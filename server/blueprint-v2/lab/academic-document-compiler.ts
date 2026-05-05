import fs from "node:fs";
import path from "node:path";

import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import {
  buildEnforcedAcademicMetadata,
} from "@/server/blueprint-v2/editorial/academic-editorial-policy";
import {
  capitalizeKeywordLine,
  sentenceStyleCapitalizePublicText,
} from "@/server/blueprint-v2/editorial/capitalization-hygiene";
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
    theoretical_framework: "Marco teorico",
    methodology: "Metodologia",
    scope_and_limitations: "Alcances y limitaciones",
    consistency_matrix: "Matriz de consistencia",
  };

  if (archetype === "indexed_paper_like") {
    return {
      ...shared,
      research_antecedents: "Antecedentes y evidencia comparada",
      state_of_the_art: "Estado del arte",
      theoretical_bases: "Bases teoricas para la propuesta",
      justification: "Justificacion",
      schedule: "Cronograma de investigacion",
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

  if (archetype === "indexed_paper_like") {
    for (const sectionKey of ["schedule", "budget", "annexes"]) {
      if (hasSection(input.sections, sectionKey)) {
        suppressed.add(sectionKey);
        annex.add(sectionKey);
      }
    }
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
        ? "El Master se renderiza como documento paper-like: cronograma/presupuesto se mueven a anexos si existen."
        : "El institucional conserva estructura universitaria y aplica reduccion Master -> plantilla institucional.",
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

function resolveReferences(evidenceLedger: EvidenceLedger): AcademicReference[] {
  return evidenceLedger.source_registry
    .filter((source) => source.eligible_for_formal_reference)
    .slice(0, 24)
    .map((source) => ({
      source_id: source.source_id,
      reference_id: source.reference_id,
      title: source.title,
      authors: source.authors,
      year: source.year,
      venue: source.venue,
      doi: source.doi,
      apa_label: formatCitationLabel(source),
      apa_reference: formatReferenceApa(source),
    }));
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
    return cleanAcademicText(input.asset.caption);
  }

  const normalizedSection = cleanAcademicText(input.sectionTitle).toLowerCase();
  if (normalizedSection.includes("metodolog")) {
    return "Representacion visual de criterios y relaciones metodologicas para la evaluacion propuesta.";
  }

  if (normalizedSection.includes("justific")) {
    return "Esquema visual de argumentos de soporte para la pertinencia academica y aplicada del proyecto.";
  }

  return "Esquema visual de conceptos y relaciones vinculados con la reutilizacion adaptativa del entorno construido.";
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

function equationFromAsset(asset: AssetPlacement): Omit<EquationLayoutPlan, "equation_number" | "source_note" | "body_reference"> | null {
  const text = cleanAcademicText(asset.text_content);
  const key = asset.asset_key.toLowerCase();

  if (/ci|consistencia|lambda|max|ahp/i.test(`${asset.caption} ${text}`) && key.includes("equation-1")) {
    return {
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      latex: "CI = \\frac{\\lambda_{max} - n}{n - 1}",
      display_text: "CI = (lambda_max - n) / (n - 1)",
      caption: "Indice de consistencia empleado para verificar la coherencia de comparaciones pareadas en AHP.",
      warnings: [
        "Formula AHP reconstruida desde la descripcion del asset; requiere validacion metodologica antes de entrega final.",
      ],
    };
  }

  if (/cr|ri|consistencia|ahp/i.test(`${asset.caption} ${text}`) && key.includes("equation-2")) {
    return {
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      latex: "CR = \\frac{CI}{RI}",
      display_text: "CR = CI / RI",
      caption: "Razon de consistencia para evaluar la aceptabilidad de la matriz de comparacion AHP.",
      warnings: [
        "Formula AHP reconstruida desde la descripcion del asset; requiere validacion metodologica antes de entrega final.",
      ],
    };
  }

  const latexMatch = text.match(/(?:\$\$?)([^$]{4,})(?:\$\$?)|\\\(([^)]{4,})\\\)/);
  const latex = cleanAcademicText(latexMatch?.[1] ?? latexMatch?.[2]);
  if (latex) {
    return {
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      section_key: asset.section_key,
      latex,
      display_text: latex.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1) / ($2)"),
      caption: cleanAcademicText(asset.caption) || "Ecuacion recuperada del corpus de evidencia.",
      warnings: [],
    };
  }

  return null;
}

function buildFigureLayoutPlan(input: {
  assetPlacements: AssetPlacement[];
  sections: AcademicSection[];
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}): FigureLayoutPlan[] {
  const seen = new Set<string>();
  const figures: FigureLayoutPlan[] = [];

  for (const asset of input.assetPlacements) {
    if (!asset.renderable || asset.render_mode !== "image" || !asset.file_path) {
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
}): EquationLayoutPlan[] {
  const seen = new Set<string>();
  const equations: EquationLayoutPlan[] = [];

  for (const asset of input.assetPlacements) {
    if (asset.render_mode !== "equation") {
      continue;
    }

    const identity = uniqueAssetIdentity(asset);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    const equation = equationFromAsset(asset);
    if (!equation) {
      continue;
    }

    const equationNumber = equations.length + 1;
    const sectionTitle = titleForSection(input.sections, asset.section_key);
    const citation = sourceCitationForAsset({ asset, sourceLookup: input.sourceLookup });
    equations.push({
      ...equation,
      equation_number: equationNumber,
      source_note: sourceNoteForAsset({ asset, sourceLookup: input.sourceLookup }),
      body_reference: `La Ecuacion ${equationNumber} resume el componente formal usado como apoyo para ${sectionTitle.toLowerCase()}${citation ? ` ${citation}` : ""}.`,
      warnings: equation.warnings,
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
    label: "Cronograma visual de investigacion",
    caption: "Cronograma referencial tipo Gantt para la ejecucion del proyecto de investigacion.",
    source_note:
      "Fuente: elaboracion propia a partir del plan de trabajo generado para el proyecto. Los meses son referenciales y deben ajustarse al calendario academico real.",
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
  const methodSummary =
    "Flujo de investigacion, revision de evidencia, diseno metodologico, analisis comparativo/evaluacion basada en evidencia y criterios preliminares. No mostrar nombres de tecnicas especificas, matrices o modelos si la metodologia todavia requiere confirmacion.";
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
  });
  const equations = buildEquationLayoutPlan({
    assetPlacements: input.assetPlacements,
    sections: input.sections,
    sourceLookup: input.sourceLookup,
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

function buildCitationAnchors(input: {
  section: RenderSectionInput;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}) {
  if (NO_INLINE_CITATION_SECTIONS.has(input.section.section_key)) {
    return [];
  }

  const sources = uniqueItems(input.section.source_ids)
    .map((sourceId) => input.sourceLookup.get(sourceId))
    .filter((source): source is EvidenceLedger["source_registry"][number] => Boolean(source))
    .slice(0, 2);

  if (sources.length === 0) {
    return [];
  }

  return sources.map((source, index): CitationAnchor => ({
    anchor_id: `${input.section.section_key}-cite-${index + 1}`,
    section_key: input.section.section_key,
    paragraph_index: index,
    source_ids: [source.source_id],
    evidence_ids: input.section.evidence_ids.slice(index, index + 1),
    original_excerpt_ids: input.section.original_excerpt_ids.slice(index, index + 1),
    rendered_citation: formatCitationLabel(source),
    reason: "Cita conservadora compilada desde fuentes soportadas por la seccion.",
  }));
}

function buildSectionBlocks(input: {
  content: string;
  citationAnchors: CitationAnchor[];
}): AcademicSectionBlock[] {
  const markdownTable = parseMarkdownTable(input.content);

  if (markdownTable.length > 0) {
    const nonTableText = cleanAcademicText(input.content)
      .split(/\n+/)
      .filter((line) => !/^\s*\|/.test(line))
      .join("\n");
    const paragraphs = splitParagraphs(nonTableText).map((text, index): AcademicSectionBlock => ({
      block_type: "paragraph",
      text,
      citation_anchor_ids: input.citationAnchors
        .filter((anchor) => anchor.paragraph_index === index)
        .map((anchor) => anchor.anchor_id),
    }));

    return [
      ...paragraphs,
      {
        block_type: "table",
        rows: markdownTable,
        layout: solveTableLayout({
          columnCount: markdownTable[0]?.length ?? 1,
          rowCount: markdownTable.length,
        }),
        caption: null,
      },
    ];
  }

  if (/^[-*]\s/m.test(input.content)) {
    return parseListItems(input.content).map((text) => ({
      block_type: "bullet",
      text,
      citation_anchor_ids: [],
    }));
  }

  return splitParagraphs(input.content).map((text, index) => ({
    block_type: "paragraph",
    text,
    citation_anchor_ids: input.citationAnchors
      .filter((anchor) => anchor.paragraph_index === index)
      .map((anchor) => anchor.anchor_id),
  }));
}

function compileSection(input: {
  section: RenderSectionInput;
  sourceLookup: Map<string, EvidenceLedger["source_registry"][number]>;
}): AcademicSection {
  const citationAnchors = buildCitationAnchors({
    section: input.section,
    sourceLookup: input.sourceLookup,
  });

  return {
    section_key: input.section.section_key,
    title: sentenceStyleCapitalizePublicText(input.section.title, "heading"),
    level: input.section.level,
    source_ids: uniqueItems(input.section.source_ids),
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

function buildMasterSectionInputs(input: {
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
}): RenderSectionInput[] {
  const draftMap = new Map(input.drafts.map((draft) => [draft.section_key, draft]));
  const sections: RenderSectionInput[] = [];

  for (const templateSection of input.masterTemplate.sections) {
    if (MASTER_SECTION_KEYS_MERGED_INTO_PARENT.has(templateSection.semantic_key)) {
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
    if (!draft && !merged?.content) {
      continue;
    }

    sections.push({
      section_key: templateSection.semantic_key,
      title: templateSection.title || draft?.title || templateSection.semantic_key,
      content: merged?.content ?? draft?.content ?? "",
      level: templateSection.level,
      source_ids:
        merged?.source_ids ??
        [
          ...(draft?.supported_source_ids ?? []),
          ...(draft?.supported_pdf_source_ids ?? []),
          ...(draft?.supported_web_source_ids ?? []),
        ],
      evidence_ids: merged?.evidence_ids ?? draft?.used_evidence_ids ?? [],
      original_excerpt_ids:
        merged?.original_excerpt_ids ?? draft?.used_original_excerpt_ids ?? [],
      asset_keys: merged?.asset_keys ?? draft?.used_asset_keys ?? [],
      evidence_support_summary:
        merged?.evidence_support_summary ?? draft?.evidence_support_summary,
      section_evidence_binding:
        merged?.section_evidence_binding ?? draft?.section_evidence_binding,
      unsupported_or_cautious_claim_warnings:
        merged?.unsupported_or_cautious_claim_warnings ??
        draft?.unsupported_or_cautious_claim_warnings ??
        [],
      warnings: merged?.warnings ?? draft?.warnings ?? [],
    });
  }

  return sections;
}

function buildUniversitySectionInputs(
  universityBlueprint: UniversityBlueprintPackage,
): RenderSectionInput[] {
  return universityBlueprint.sections.map((section: UniversityBlueprintSection) => ({
    section_key: section.section_key,
    title: section.title,
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

  return input.consolidatedAssetUsagePlan.slice(0, 30).map((plannedAsset): AssetPlacement => {
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
      caption: ledgerAsset?.caption ?? String(plannedAsset.usage_reason ?? "Asset de soporte metodologico."),
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
  const reportArchetype = resolveReportArchetype(input.variant);
  const editorialPlan = buildEditorialPlan({
    variant: input.variant,
    sections,
  });
  const branding = resolveBrandingAssets({
    variant: input.variant,
    universityBlueprint: input.universityBlueprint ?? null,
  });
  const methodSummary =
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
  });
  const metadataTitle = sentenceStyleCapitalizePublicText(enforcedMetadata.final_title, "title");
  const shortHeaderTitle = sentenceStyleCapitalizePublicText(
    enforcedMetadata.short_method_title,
    "title",
  );
  const keywordsLine = capitalizeKeywordLine(enforcedMetadata.keywords_line);
  const layoutPlan = buildAcademicDocxLayoutPlan({
    variant: input.variant,
    project: input.project,
    title: metadataTitle,
    shortHeaderTitle,
    keywordsLine,
    sections,
    assetPlacements,
    sourceLookup,
  });

  return {
    artifact_type: "academic_document_model",
    artifact_version: "v1",
    variant: input.variant,
    template_key: input.templateKey,
    template_name: input.templateName,
    citation_style: "APA7",
    report_archetype: reportArchetype,
    metadata: {
      title: metadataTitle,
      short_header_title: shortHeaderTitle,
      keywords_line: keywordsLine,
      subtitle: sentenceStyleCapitalizePublicText(input.subtitle, "sentence"),
      university: input.project.university,
      program: input.project.program,
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
    references: resolveReferences(input.evidenceLedger),
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
  return buildAcademicDocument({
    variant: "master",
    project: input.project,
    templateKey: input.masterTemplate.template_key,
    templateName: input.masterTemplate.template_name,
    subtitle: "Documento academico para proyecto de investigacion",
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
  return buildAcademicDocument({
    variant: "university",
    project: input.project,
    templateKey: input.universityBlueprint.template_key,
    templateName: input.universityBlueprint.template_name,
    subtitle:
      [input.project.degreeLevel, input.project.program].filter(Boolean).join(" - ") ||
      "Plan de tesis institucional",
    universityBlueprint: input.universityBlueprint,
    legacyBlueprint: input.legacyBlueprint,
    sectionInputs: buildUniversitySectionInputs(input.universityBlueprint),
    matrixArtifact: input.matrixArtifact,
    evidenceLedger: input.evidenceLedger,
    consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
  });
}
