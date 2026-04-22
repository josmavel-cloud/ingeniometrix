import { normalizeTitle } from "@/lib/text";
import type {
  CanonicalContentBlock,
  CanonicalSectionNode,
} from "@/server/reporting/canonical-report-types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type { TemplateCandidateSection } from "@/server/reporting/template-ingestion-types";

type SectionMappingContext = {
  blueprint: ResearchBlueprintRecord;
  references: Array<{ id: string; text: string; synthetic?: boolean }>;
  warnings: string[];
};

const BLUEPRINT_RELEVANT_SECTION_KEYS = new Set([
  "planteamiento_del_problema_situacion_problematica",
  "planteamiento_del_problema_situacion_problematicica",
  "research_problem",
  "problem_statement",
  "descripcion_de_la_situacion_problematica",
  "planteamiento_del_problema_formulacion",
  "research_questions",
  "main_research_question",
  "specific_research_questions",
  "formulacion_del_problema",
  "objetivos_de_la_investigacion",
  "objectives",
  "general_objective",
  "justificacion_de_la_investigacion",
  "justification",
  "importancia_de_la_investigacion",
  "viabilidad_de_la_investigacion",
  "antecedentes_de_la_investigacion",
  "problem_background",
  "bases_teoricas",
  "theoretical_bases",
  "scientific_theoretical_bases",
  "theoretical_framework",
  "definicion_de_terminos_basicos",
  "definiciones_conceptuales",
  "key_constructs_or_variables",
  "hipotesis",
  "hypotheses",
  "general_hypothesis",
  "specific_hypotheses",
  "variables_y_definicion_operacional",
  "variables_indicators",
  "diseno_metodologico",
  "methodology",
  "proposed_methodology",
  "diseno_muestral",
  "population_and_sample",
  "procedimiento_de_muestreo",
  "tecnicas_de_recoleccion_de_datos",
  "data_collection_techniques",
  "tecnicas_estadisticas",
  "analysis_plan",
  "consistency_matrix",
  "matriz_de_consistencia",
  "cronograma",
  "schedule",
  "work_plan",
  "references",
  "referencias",
  "aspectos_eticos",
  "ethics",
]);

function normalizeSemanticKey(value: string | null | undefined) {
  return normalizeTitle(value).replace(/\s+/g, "_");
}

function maybeParagraph(id: string, text: string | null | undefined) {
  if (!text?.trim()) {
    return [];
  }

  return [
    {
      id,
      kind: "paragraph",
      text: text.trim(),
    } satisfies CanonicalContentBlock,
  ];
}

function maybeBulletList(id: string, items: string[] | null | undefined) {
  const cleaned = (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  if (cleaned.length === 0) {
    return [];
  }

  return [
    {
      id,
      kind: "bullet_list",
      items: cleaned,
    } satisfies CanonicalContentBlock,
  ];
}

function maybeNumberedList(id: string, items: string[] | null | undefined) {
  const cleaned = (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  if (cleaned.length === 0) {
    return [];
  }

  return [
    {
      id,
      kind: "numbered_list",
      items: cleaned,
    } satisfies CanonicalContentBlock,
  ];
}

function buildReferenceInsightItems(blueprint: ResearchBlueprintRecord) {
  return (blueprint.reference_insights ?? []).slice(0, 6).map((insight) => {
    const fragments = [
      insight.title,
      insight.method_signal ? `Metodo: ${insight.method_signal}` : null,
      insight.main_finding_signal ? `Hallazgo: ${insight.main_finding_signal}` : null,
      insight.future_line_signal ? `Linea futura: ${insight.future_line_signal}` : null,
    ].filter((item): item is string => Boolean(item));

    return fragments.join(" ");
  });
}

function buildConsistencyTable(blueprint: ResearchBlueprintRecord) {
  if (!Array.isArray(blueprint.consistency_matrix) || blueprint.consistency_matrix.length === 0) {
    return [];
  }

  return [
    {
      id: "consistency-matrix-table",
      kind: "table",
      table: {
        caption: {
          title: "Matriz de consistencia",
          position: "top",
        },
        numbered: true,
        rows: [
          {
            cells: [
              { text: "Objetivo" },
              { text: "Pregunta" },
              { text: "Metodo" },
              { text: "Tecnica" },
            ],
          },
          ...blueprint.consistency_matrix.map((item) => ({
            cells: [
              { text: item.objective },
              { text: item.question },
              { text: item.method },
              { text: item.technique },
            ],
          })),
        ],
      },
    } satisfies CanonicalContentBlock,
  ];
}

function buildWorkPlanTable(blueprint: ResearchBlueprintRecord) {
  if (!Array.isArray(blueprint.work_plan) || blueprint.work_plan.length === 0) {
    return [];
  }

  return [
    {
      id: "work-plan-table",
      kind: "table",
      table: {
        caption: {
          title: "Cronograma de trabajo",
          position: "top",
        },
        numbered: true,
        rows: [
          {
            cells: [{ text: "Fase" }, { text: "Duracion" }],
          },
          ...blueprint.work_plan.map((item) => ({
            cells: [{ text: item.phase }, { text: item.duration }],
          })),
        ],
      },
    } satisfies CanonicalContentBlock,
  ];
}

function buildVariablesTable(blueprint: ResearchBlueprintRecord) {
  if (!Array.isArray(blueprint.key_constructs_or_variables) || blueprint.key_constructs_or_variables.length === 0) {
    return [];
  }

  return [
    {
      id: "variables-table",
      kind: "table",
      table: {
        caption: {
          title: "Constructos o variables clave",
          position: "top",
        },
        numbered: true,
        rows: [
          {
            cells: [{ text: "Constructo / variable" }, { text: "Uso en el blueprint" }],
          },
          ...blueprint.key_constructs_or_variables.map((item) => ({
            cells: [{ text: item }, { text: "Elemento central para la formulacion del estudio." }],
          })),
        ],
      },
    } satisfies CanonicalContentBlock,
  ];
}

function buildPlaceholderForRequiredSection(section: TemplateCandidateSection, warnings: string[]) {
  warnings.push(`La seccion requerida "${section.title}" no tuvo contenido suficiente en el blueprint y se marco como pendiente de revision.`);
  return [
    {
      id: `${section.id}-placeholder`,
      kind: "placeholder_note",
      text: "Contenido pendiente de revision manual por falta de soporte suficiente en el blueprint o en la evidencia seleccionada.",
    } satisfies CanonicalContentBlock,
  ];
}

function isBlueprintRelevantSection(section: TemplateCandidateSection) {
  const semanticKey = normalizeSemanticKey(section.semantic_key ?? section.title);
  return BLUEPRINT_RELEVANT_SECTION_KEYS.has(semanticKey);
}

function buildBlocksForSection(
  section: TemplateCandidateSection,
  context: SectionMappingContext,
) {
  const semanticKey = normalizeSemanticKey(section.semantic_key ?? section.title);
  const { blueprint } = context;

  if (
    [
      "planteamiento_del_problema_situacion_problematica",
      "planteamiento_del_problema_situacion_problematicica",
      "research_problem",
      "problem_statement",
      "descripcion_de_la_situacion_problematica",
    ].includes(semanticKey)
  ) {
    return [
      ...maybeParagraph(`${section.id}-problem`, blueprint.problem_statement),
      ...maybeParagraph(`${section.id}-delimitation`, blueprint.problem_delimitation),
    ];
  }

  if (
    [
      "planteamiento_del_problema_formulacion",
      "research_questions",
      "main_research_question",
      "specific_research_questions",
      "formulacion_del_problema",
    ].includes(semanticKey)
  ) {
    return maybeNumberedList(`${section.id}-questions`, blueprint.research_questions);
  }

  if (["objetivos_de_la_investigacion", "objectives", "general_objective"].includes(semanticKey)) {
    return [
      ...maybeParagraph(`${section.id}-general-objective`, blueprint.general_objective),
      ...maybeBulletList(`${section.id}-specific-objectives`, blueprint.specific_objectives),
    ];
  }

  if (
    [
      "justificacion_de_la_investigacion",
      "justification",
      "importancia_de_la_investigacion",
      "viabilidad_de_la_investigacion",
    ].includes(semanticKey)
  ) {
    return maybeParagraph(`${section.id}-justification`, blueprint.justification);
  }

  if (["antecedentes_de_la_investigacion", "problem_background"].includes(semanticKey)) {
    return maybeBulletList(`${section.id}-background`, buildReferenceInsightItems(blueprint));
  }

  if (
    [
      "bases_teoricas",
      "theoretical_bases",
      "scientific_theoretical_bases",
      "theoretical_framework",
    ].includes(semanticKey)
  ) {
    return [
      ...maybeParagraph(`${section.id}-research-line`, blueprint.research_line),
      ...maybeBulletList(`${section.id}-constructs`, blueprint.key_constructs_or_variables),
    ];
  }

  if (
    ["definicion_de_terminos_basicos", "definiciones_conceptuales", "key_constructs_or_variables"].includes(
      semanticKey,
    )
  ) {
    return maybeBulletList(`${section.id}-terms`, blueprint.key_constructs_or_variables);
  }

  if (["hipotesis", "hypotheses", "general_hypothesis", "specific_hypotheses"].includes(semanticKey)) {
    return maybeNumberedList(`${section.id}-hypotheses`, blueprint.hypotheses_or_guiding_questions);
  }

  if (["variables_y_definicion_operacional", "variables_indicators"].includes(semanticKey)) {
    return buildVariablesTable(blueprint);
  }

  if (
    ["diseno_metodologico", "methodology", "proposed_methodology"].includes(semanticKey)
  ) {
    return [
      ...maybeParagraph(`${section.id}-methodology`, blueprint.proposed_methodology),
      ...maybeParagraph(`${section.id}-population`, blueprint.population_and_sample),
      ...maybeBulletList(`${section.id}-techniques`, blueprint.data_collection_techniques),
      ...maybeParagraph(`${section.id}-analysis`, blueprint.analysis_plan),
    ];
  }

  if (["diseno_muestral", "population_and_sample", "procedimiento_de_muestreo"].includes(semanticKey)) {
    return maybeParagraph(`${section.id}-sample`, blueprint.population_and_sample);
  }

  if (["tecnicas_de_recoleccion_de_datos", "data_collection_techniques"].includes(semanticKey)) {
    return maybeBulletList(`${section.id}-data-techniques`, blueprint.data_collection_techniques);
  }

  if (["tecnicas_estadisticas", "analysis_plan"].includes(semanticKey)) {
    return maybeParagraph(`${section.id}-analysis-plan`, blueprint.analysis_plan);
  }

  if (["consistency_matrix", "matriz_de_consistencia"].includes(semanticKey)) {
    return buildConsistencyTable(blueprint);
  }

  if (["cronograma", "schedule", "work_plan"].includes(semanticKey)) {
    return buildWorkPlanTable(blueprint);
  }

  if (["references", "referencias"].includes(semanticKey)) {
    return context.references.length > 0
      ? [
          {
            id: `${section.id}-references`,
            kind: "reference_list",
            references: context.references,
          } satisfies CanonicalContentBlock,
        ]
      : [];
  }

  if (["aspectos_eticos", "ethics"].includes(semanticKey)) {
    return [
      {
        id: `${section.id}-ethics-note`,
        kind: "placeholder_note",
        text: "Los aspectos eticos requieren definicion complementaria y revision manual antes de exportar una version academica final.",
      } satisfies CanonicalContentBlock,
    ];
  }

  return [];
}

function shouldKeepSection(section: CanonicalSectionNode) {
  return section.blocks.length > 0 || section.children.length > 0;
}

export function mapBlueprintSectionToTemplate(
  section: TemplateCandidateSection,
  context: SectionMappingContext,
): CanonicalSectionNode | null {
  const blocks = buildBlocksForSection(section, context);
  const children = (section.children ?? [])
    .map((child) => mapBlueprintSectionToTemplate(child, context))
    .filter((child): child is CanonicalSectionNode => Boolean(child));

  const effectiveBlocks =
    blocks.length > 0
      ? blocks
      : section.required && children.length === 0 && isBlueprintRelevantSection(section)
        ? buildPlaceholderForRequiredSection(section, context.warnings)
        : [];

  const mapped = {
    id: section.id,
    title: section.title,
    level: section.level,
    semantic_key: section.semantic_key ?? null,
    blocks: effectiveBlocks,
    children,
  } satisfies CanonicalSectionNode;

  return shouldKeepSection(mapped) ? mapped : null;
}
