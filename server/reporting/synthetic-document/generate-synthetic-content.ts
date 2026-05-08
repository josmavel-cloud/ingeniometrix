import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import type {
  SyntheticAnnex,
  SyntheticContentBlock,
  SyntheticReferenceEntry,
  SyntheticSectionNode,
  SyntheticTemplateDocument,
} from "@/server/reporting/synthetic-document-types";
import type { TemplateCandidateSection } from "@/server/reporting/template-ingestion-types";

import { generateSyntheticEquation } from "./generate-synthetic-equation";
import { generateSyntheticFigure } from "./generate-synthetic-figure";
import {
  buildSyntheticInlineCitation,
  generateSyntheticReferences,
} from "./generate-synthetic-references";
import { generateSyntheticTable } from "./generate-synthetic-table";

type GenerationState = {
  tableSequence: number;
  figureSequence: number;
  equationSequence: number;
  usedFigures: number;
  usedEquationTable: boolean;
  references: SyntheticReferenceEntry[];
  variantSeed: number;
};

const SYNTHETIC_STUDENT_NAMES = [
  "Tesista de Prueba",
  "Andrea Quispe Salazar",
  "Luis Fernando Torres Rojas",
  "Mariela Huaman Castro",
  "Carlos Paredes Rivera",
];
const SYNTHETIC_ADVISOR_NAMES = [
  "Asesor de Prueba",
  "Dra. Rosa Vargas Medina",
  "Mg. Javier Flores Soto",
  "Dr. Lucia Ramos Caceres",
  "Ing. Diego Cruz Salinas",
];
const SYNTHETIC_LOCATIONS = [
  "Lima, abril de 2026",
  "Arequipa, mayo de 2026",
  "Trujillo, junio de 2026",
  "Tacna, julio de 2026",
  "Piura, agosto de 2026",
];
const SYNTHETIC_PURPOSES = [
  "Seccion sintetica orientada a validar estructura, jerarquia y consistencia academica.",
  "Seccion sintetica para comprobar instrucciones de contenido y exportacion estable.",
  "Bloque sintetico destinado a verificar una redaccion tecnica minima y trazable.",
  "Contenido controlado para revisar formato, continuidad narrativa y citas de prueba.",
  "Texto sintetico generado para tensionar la plantilla sin usar insumos academicos reales.",
];
const SYNTHETIC_INSTRUCTION_SUFFIXES = [
  "Se prioriza una redaccion breve, clara y compatible con revision academica.",
  "El bloque mantiene un tono expositivo y sirve para tensionar el renderer.",
  "La salida conserva un estilo formal y una longitud manejable para pruebas.",
  "La formulacion se mantiene neutral para facilitar comparaciones entre variantes.",
  "El contenido se mantiene intencionalmente generico para validar el pipeline.",
];
const SYNTHETIC_SUPPORT_SENTENCES = [
  "Para esta variante se explicita la relacion entre problema, objetivo, metodo y evidencia documental con el fin de estresar la consistencia de la plantilla.",
  "El desarrollo enfatiza trazabilidad, continuidad argumental y compatibilidad con futuras exportaciones a DOCX, BibTeX, RIS y registros auxiliares del proyecto.",
  "Tambien se incorpora vocabulario tecnico de investigacion aplicada para comprobar que los titulos, subtitulos y bloques de apoyo conserven legibilidad academica.",
  "Cada parrafo se mantiene sintetico pero suficiente para revisar espaciado, saltos de pagina, jerarquia tipografica y anclaje de citas de prueba.",
  "La redaccion conserva un tono descriptivo y metadatos verificables de prueba para no confundir este material con un documento academico real.",
];

function pickVariant<T>(values: T[], seed: number, offset = 0) {
  return values[(seed + offset) % values.length];
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isAnnexSection(section: TemplateCandidateSection) {
  return (
    section.semantic_key === "annexes" ||
    normalizeKey(section.title).includes("ANEX") ||
    normalizeKey(section.title).includes("APENDICE")
  );
}

function hasReferenceRequirement(runtime: LoadedTemplateVersionRuntime) {
  return (
    runtime.templateCandidate.validations.requires_references === true ||
    runtime.templateCandidate.sections.some(
      (section) => section.semantic_key === "references" || normalizeKey(section.title) === "REFERENCIAS",
    )
  );
}

function hasReferenceSection(runtime: LoadedTemplateVersionRuntime) {
  return runtime.templateCandidate.sections.some(
    (section) => section.semantic_key === "references" || normalizeKey(section.title) === "REFERENCIAS",
  );
}

function buildCoverValue(
  key: string,
  runtime: LoadedTemplateVersionRuntime,
  variantSeed: number,
) {
  switch (key) {
    case "institution_logo":
      return runtime.templateCandidate.logo_policy.primary_asset_key ?? null;
    case "university_name":
      return runtime.templateCandidate.institution.university_name;
    case "school_name":
      return runtime.templateCandidate.institution.school_name ?? "Escuela de prueba";
    case "program_name":
      return runtime.templateCandidate.institution.program_name ?? "Programa de prueba";
    case "document_label":
      return runtime.templateCandidate.cover_template.document_label ?? "Documento sintetico de prueba";
    case "student_name":
      return pickVariant(SYNTHETIC_STUDENT_NAMES, variantSeed);
    case "advisor_name":
      return pickVariant(SYNTHETIC_ADVISOR_NAMES, variantSeed);
    case "co_advisor_name":
      return pickVariant(SYNTHETIC_ADVISOR_NAMES, variantSeed + 1);
    case "place_and_date":
      return pickVariant(SYNTHETIC_LOCATIONS, variantSeed);
    default:
      return "Valor sintetico";
  }
}

function buildParagraphText(input: {
  section: TemplateCandidateSection;
  referenceCitation: string | null;
  variantSeed: number;
  paragraphIndex?: number;
}) {
  const { section, referenceCitation, variantSeed, paragraphIndex = 0 } = input;
  const purpose =
    section.guidance?.purpose ??
    pickVariant(SYNTHETIC_PURPOSES, variantSeed, section.level + paragraphIndex);
  const firstInstruction =
    section.guidance?.instructions?.[paragraphIndex] ??
    section.guidance?.instructions?.[0] ??
    `Contenido de prueba para validar ${section.title.toLowerCase()}.`;
  const suffix = pickVariant(
    SYNTHETIC_INSTRUCTION_SUFFIXES,
    variantSeed,
    section.level + paragraphIndex,
  );
  const supportSentence = pickVariant(
    SYNTHETIC_SUPPORT_SENTENCES,
    variantSeed,
    section.level + paragraphIndex,
  );
  const citationSuffix = referenceCitation ? ` ${referenceCitation}.` : "";

  return `${purpose} ${firstInstruction} ${supportSentence} ${suffix}${citationSuffix}`.trim();
}

function shouldIncludeEquation(section: TemplateCandidateSection, state: GenerationState) {
  if (state.equationSequence >= 4) {
    return false;
  }

  return (
    section.semantic_key === "methodology" ||
    ["scientific_theoretical_bases", "theoretical_bases"].includes(section.semantic_key ?? "")
  );
}

function shouldIncludeFigure(section: TemplateCandidateSection, state: GenerationState) {
  if (state.usedFigures >= 2) {
    return false;
  }

  return [
    "problem_statement",
    "theoretical_framework",
    "problem_background",
    "methodology",
  ].includes(section.semantic_key ?? "");
}

function shouldIncludeEquationTable(section: TemplateCandidateSection, state: GenerationState) {
  if (state.usedEquationTable) {
    return false;
  }

  return section.semantic_key === "methodology";
}

function buildParagraphBlocks(input: {
  section: TemplateCandidateSection;
  runtime: LoadedTemplateVersionRuntime;
  state: GenerationState;
  count: number;
  baseId: string;
}) {
  const { section, runtime, state, count, baseId } = input;
  const rules = runtime.effectiveElementRules;

  return Array.from({ length: count }, (_, index) => {
    const citation =
      state.references.length > 0
        ? buildSyntheticInlineCitation({
            rules,
            referenceIndex: (index + state.figureSequence + state.equationSequence) % state.references.length,
            variantSeed: state.variantSeed,
          })
        : null;

    return {
      id: `${baseId}-${index + 1}`,
      kind: "paragraph" as const,
      text: buildParagraphText({
        section,
        referenceCitation: citation,
        variantSeed: state.variantSeed,
        paragraphIndex: index,
      }),
    };
  });
}

function buildBaseBlocks(
  section: TemplateCandidateSection,
  runtime: LoadedTemplateVersionRuntime,
  state: GenerationState,
): SyntheticContentBlock[] {
  const rules = runtime.effectiveElementRules;

  switch (section.content_kind) {
    case "bullet_list":
      return [
        {
          id: `${section.id}-list`,
          kind: "bullet_list",
          items: [
            `Punto sintetico 1 para ${section.title.toLowerCase()}.`,
            `Punto sintetico 2 para ${section.title.toLowerCase()}.`,
            `Punto sintetico 3 para ${section.title.toLowerCase()}.`,
          ],
        },
      ];
    case "numbered_list":
      return [
        {
          id: `${section.id}-list`,
          kind: "numbered_list",
          items: [
            `Paso sintetico 1 para ${section.title.toLowerCase()}.`,
            `Paso sintetico 2 para ${section.title.toLowerCase()}.`,
            `Paso sintetico 3 para ${section.title.toLowerCase()}.`,
          ],
        },
      ];
    case "table":
      state.tableSequence += 1;
      return [
        {
          id: `${section.id}-table`,
          kind: "table",
          table: generateSyntheticTable({
            rules,
            sectionTitle: section.title,
            sectionSemanticKey: section.semantic_key,
            sequence: state.tableSequence,
          }),
        },
      ];
    case "references":
      return [
        {
          id: `${section.id}-references`,
          kind: "reference_list",
          references: state.references,
        },
      ];
    case "mixed":
      return buildParagraphBlocks({
        section,
        runtime,
        state,
        count: 2,
        baseId: `${section.id}-paragraph`,
      });
    case "rich_text":
    default:
      return buildParagraphBlocks({
        section,
        runtime,
        state,
        count:
          section.level === 1 &&
          ["methodology", "theoretical_framework", "problem_statement"].includes(
            section.semantic_key ?? "",
          )
            ? 3
            : 2,
        baseId: `${section.id}-paragraph`,
      });
  }
}

function buildSectionNode(
  section: TemplateCandidateSection,
  runtime: LoadedTemplateVersionRuntime,
  state: GenerationState,
): SyntheticSectionNode {
  const rules = runtime.effectiveElementRules;
  const referenceCitation =
    state.references.length > 0
      ? buildSyntheticInlineCitation({
          rules,
          referenceIndex: (state.figureSequence + state.equationSequence) % state.references.length,
          variantSeed: state.variantSeed,
        })
      : null;

  const blocks = buildBaseBlocks(section, runtime, state).map((block) => {
    if (block.kind === "paragraph") {
      return {
        ...block,
        text: buildParagraphText({
          section,
          referenceCitation,
          variantSeed: state.variantSeed,
        }),
      };
    }

    if (block.kind === "table") {
      return {
        ...block,
        table: generateSyntheticTable({
          rules,
          sectionTitle: section.title,
          sectionSemanticKey: section.semantic_key,
          sequence: state.tableSequence,
        }),
      };
    }

    return block;
  });

  if (shouldIncludeFigure(section, state)) {
    state.figureSequence += 1;
    state.usedFigures += 1;
    blocks.push({
      id: `${section.id}-figure`,
      kind: "figure",
      figure: generateSyntheticFigure({
        rules,
        sectionTitle: section.title,
        sequence: state.figureSequence,
      }),
    });
    blocks.push({
      id: `${section.id}-figure-citation`,
      kind: "paragraph",
      text: `La ${runtime.effectiveElementRules.figure.label.toLowerCase()} ${state.figureSequence} sintetiza el apoyo visual de esta seccion y permite validar su referencia directa dentro del texto.`,
    });
  }

  if (shouldIncludeEquation(section, state)) {
    const equationSequence = state.equationSequence + 1;
    blocks.push({
      id: `${section.id}-equation-${equationSequence}`,
      kind: "equation",
      equation: generateSyntheticEquation({
        rules,
        sectionSemanticKey: section.semantic_key,
        sequence: equationSequence,
      }),
    });
    state.equationSequence += 1;
    blocks.push({
      id: `${section.id}-equation-note-${equationSequence}`,
      kind: "paragraph",
      text: `La ecuacion (${equationSequence}) se incorpora como bloque sintetico para comprobar numeracion, alineacion y menciones cruzadas en una seccion tecnica.`,
    });
  }

  if (section.semantic_key === "methodology" && state.equationSequence < 2) {
    const equationSequence = state.equationSequence + 1;
    blocks.push({
      id: `${section.id}-equation-${equationSequence}`,
      kind: "equation",
      equation: generateSyntheticEquation({
        rules,
        sectionSemanticKey: section.semantic_key,
        sequence: equationSequence,
      }),
    });
    state.equationSequence += 1;
    blocks.push({
      id: `${section.id}-equation-note-${equationSequence}`,
      kind: "paragraph",
      text: `La ecuacion (${equationSequence}) complementa la secuencia metodologica y tensiona el render cuando conviven formulas, parrafos y tablas.`,
    });
  }

  if (shouldIncludeEquationTable(section, state)) {
    state.tableSequence += 1;
    state.usedEquationTable = true;
    blocks.push({
      id: `${section.id}-equation-table`,
      kind: "table",
      table: generateSyntheticTable({
        rules,
        sectionTitle: `${section.title} - expresiones de ejemplo`,
        sectionSemanticKey: "methodology",
        sequence: state.tableSequence,
      }),
    });
    blocks.push({
      id: `${section.id}-equation-table-citation`,
      kind: "paragraph",
      text: `La ${runtime.effectiveElementRules.table.label.toLowerCase()} ${state.tableSequence} resume expresiones y parametros sinteticos para comprobar caption, nota y lectura tabular.`,
    });
  }

  if (
    ["schedule", "budget", "variables_indicators", "consistency_matrix"].includes(
      section.semantic_key ?? "",
    ) &&
    !blocks.some((block) => block.kind === "table")
  ) {
    state.tableSequence += 1;
    blocks.push({
      id: `${section.id}-support-table`,
      kind: "table",
      table: generateSyntheticTable({
        rules,
        sectionTitle: section.title,
        sectionSemanticKey: section.semantic_key,
        sequence: state.tableSequence,
      }),
    });
  }

  return {
    id: section.id,
    title: section.title,
    level: section.level,
    semantic_key: section.semantic_key ?? null,
    blocks,
    children: section.children?.map((child) => buildSectionNode(child, runtime, state)) ?? [],
  };
}

function flattenAnnexBlocks(
  section: TemplateCandidateSection,
  runtime: LoadedTemplateVersionRuntime,
  state: GenerationState,
) {
  const sectionNode = buildSectionNode(section, runtime, state);
  const blocks = [...sectionNode.blocks];

  for (const child of sectionNode.children) {
    blocks.push({
      id: `${child.id}-placeholder`,
      kind: "placeholder_note",
      text: `Subseccion sintetica incluida en anexo: ${child.title}.`,
    });
    blocks.push(...child.blocks);
  }

  return blocks;
}

export function generateSyntheticContent(
  runtime: LoadedTemplateVersionRuntime,
  input?: {
    variantSeed?: number;
  },
) {
  const variantSeed = input?.variantSeed ?? 1;
  const references = hasReferenceRequirement(runtime)
    ? generateSyntheticReferences({
        citationStyle: runtime.templateCandidate.citation_style,
        variantSeed,
      })
    : [];

  const state: GenerationState = {
    tableSequence: 0,
    figureSequence: 0,
    equationSequence: 0,
    usedFigures: 0,
    usedEquationTable: false,
    references,
    variantSeed,
  };

  const mainSections = runtime.templateCandidate.sections.filter((section) => !isAnnexSection(section));
  const annexSections = runtime.templateCandidate.sections.filter((section) => isAnnexSection(section));
  const generatedSections = mainSections.map((section) => buildSectionNode(section, runtime, state));

  if (
    references.length > 0 &&
    runtime.effectiveElementRules.reference_list.heading_title &&
    !hasReferenceSection(runtime)
  ) {
    generatedSections.push({
      id: "synthetic-references-fallback",
      title: runtime.effectiveElementRules.reference_list.heading_title,
      level: 1,
      semantic_key: "references",
      blocks: [
        {
          id: "synthetic-references-fallback-block",
          kind: "reference_list",
          references,
        },
      ],
      children: [],
    });
  }

  return {
    derived_from_template_version_id: runtime.versionId,
    template_key: runtime.templateKey,
    template_family: runtime.templateCandidate.template_family,
    language: runtime.templateCandidate.language,
    institution: runtime.templateCandidate.institution,
    synthetic_flags: {
      synthetic: true,
      for_testing_only: true,
      not_for_academic_use: true,
    },
    cover: {
      document_label: runtime.templateCandidate.cover_template.document_label ?? null,
      fields: runtime.templateCandidate.cover_template.fields.map((field) => ({
        key: field.key,
        label: field.label,
        value_type: field.value_type,
        value: buildCoverValue(field.key, runtime, variantSeed),
      })),
    },
    sections: generatedSections,
    references,
    annexes: annexSections.map(
      (section) =>
        ({
          id: section.id,
          title: section.title,
          blocks: flattenAnnexBlocks(section, runtime, state),
        }) satisfies SyntheticAnnex,
    ),
    warnings: [
      "Documento sintetico de prueba. No usar como insumo academico real.",
      "Los bloques de figuras, ecuaciones, tablas y referencias son placeholders controlados por la plantilla.",
      `Variante sintetica generada con semilla ${variantSeed}.`,
      ...runtime.runtimeWarnings,
    ],
  } satisfies SyntheticTemplateDocument;
}
