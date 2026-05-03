import type { BlueprintTemplateContext } from "@/server/blueprint/blueprint-types";
import type { MasterBlueprintEngineProject, MasterTemplateRuntime } from "@/server/blueprint-v2/types";
import type { UniversityBlueprintTemplateRuntimeOverride } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";

type LabTemplateSectionNode = {
  title?: string | null;
  semantic_key?: string | null;
  children?: LabTemplateSectionNode[];
};

function masterSection(input: {
  section_id: string;
  title: string;
  semantic_key: string;
  level: number;
  content_kind: string;
  required?: boolean;
  purpose?: string | null;
  instructions?: string[];
  min_words?: number | null;
  max_words?: number | null;
}) {
  return {
    section_id: input.section_id,
    title: input.title,
    semantic_key: input.semantic_key,
    path_titles: [input.title],
    level: input.level,
    content_kind: input.content_kind,
    required: input.required ?? true,
    instructions: input.instructions ?? [],
    purpose: input.purpose ?? null,
    min_words: input.min_words ?? null,
    max_words: input.max_words ?? null,
  };
}

function withHierarchyPaths<T extends ReturnType<typeof masterSection>>(sections: T[]) {
  const titleStack: string[] = [];

  return sections.map((section) => {
    titleStack[section.level - 1] = section.title;
    titleStack.length = section.level;

    return {
      ...section,
      path_titles: titleStack.slice(),
    };
  });
}

const MASTER_TEMPLATE_REQUIRED_SECTION_KEYS = [
  "abstract",
  "problem_statement",
  "research_questions",
  "general_objective",
  "specific_objectives",
  "justification",
  "theoretical_framework",
  "consistency_matrix",
  "methodology",
  "schedule",
  "references",
];

export function buildMasterTemplateLatamRuntimeFixture(): MasterTemplateRuntime {
  return {
    template_key: "MASTER_TEMPLATE_LATAM",
    template_name: "MasterTemplate - LATAM Research Plan",
    template_version_id: "lab-master-template-latam-v3",
    methodology_mode: "mixed",
    citation_style: "APA7",
    required_section_keys: MASTER_TEMPLATE_REQUIRED_SECTION_KEYS,
    guidance_notes: [
      "Lab fixture: snapshot local del MASTER_TEMPLATE_LATAM para depurar pasos 5-11 sin depender de Prisma.",
    ],
    sections: withHierarchyPaths([
      masterSection({
        section_id: "summary",
        title: "Resumen",
        semantic_key: "abstract",
        level: 1,
        content_kind: "rich_text",
        purpose: "Sintetizar problema, objetivo, metodologia y aporte esperado.",
        instructions: ["Incluye problema, objetivo general, metodologia y aporte esperado."],
        min_words: 180,
        max_words: 350,
      }),
      masterSection({
        section_id: "keywords",
        title: "Palabras clave",
        semantic_key: "keywords",
        level: 2,
        content_kind: "bullet_list",
      }),
      masterSection({
        section_id: "introduction",
        title: "Introduccion",
        semantic_key: "introduction",
        level: 1,
        content_kind: "rich_text",
        min_words: 200,
        max_words: 600,
      }),
      masterSection({
        section_id: "problem",
        title: "Planteamiento del problema",
        semantic_key: "problem_statement",
        level: 1,
        content_kind: "rich_text",
        min_words: 300,
        max_words: 900,
      }),
      masterSection({
        section_id: "research_questions",
        title: "Formulacion del problema",
        semantic_key: "research_questions",
        level: 2,
        content_kind: "mixed",
      }),
      masterSection({
        section_id: "general_question",
        title: "Problema general",
        semantic_key: "general_research_question",
        level: 3,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "specific_questions",
        title: "Problemas especificos",
        semantic_key: "specific_research_questions",
        level: 3,
        content_kind: "bullet_list",
      }),
      masterSection({
        section_id: "justification",
        title: "Justificacion",
        semantic_key: "justification",
        level: 1,
        content_kind: "mixed",
        min_words: 220,
        max_words: 700,
      }),
      masterSection({
        section_id: "theoretical_justification",
        title: "Justificacion teorica",
        semantic_key: "theoretical_justification",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "practical_justification",
        title: "Justificacion practica",
        semantic_key: "practical_justification",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "methodological_justification",
        title: "Justificacion metodologica",
        semantic_key: "methodological_justification",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "objectives",
        title: "Objetivos",
        semantic_key: "objectives",
        level: 1,
        content_kind: "mixed",
      }),
      masterSection({
        section_id: "general_objective",
        title: "Objetivo general",
        semantic_key: "general_objective",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "specific_objectives",
        title: "Objetivos especificos",
        semantic_key: "specific_objectives",
        level: 2,
        content_kind: "numbered_list",
      }),
      masterSection({
        section_id: "hypotheses",
        title: "Hipotesis",
        semantic_key: "hypotheses",
        level: 1,
        content_kind: "mixed",
        required: false,
      }),
      masterSection({
        section_id: "general_hypothesis",
        title: "Hipotesis general",
        semantic_key: "general_hypothesis",
        level: 2,
        content_kind: "rich_text",
        required: false,
      }),
      masterSection({
        section_id: "specific_hypotheses",
        title: "Hipotesis especificas",
        semantic_key: "specific_hypotheses",
        level: 2,
        content_kind: "bullet_list",
        required: false,
      }),
      masterSection({
        section_id: "theoretical_framework",
        title: "Marco teorico",
        semantic_key: "theoretical_framework",
        level: 1,
        content_kind: "mixed",
        min_words: 500,
        max_words: 1800,
      }),
      masterSection({
        section_id: "antecedents",
        title: "Antecedentes de la investigacion",
        semantic_key: "research_antecedents",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "state_of_the_art",
        title: "Estado del arte",
        semantic_key: "state_of_the_art",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "theoretical_bases",
        title: "Bases teoricas",
        semantic_key: "theoretical_bases",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "terms_definition",
        title: "Definicion de terminos",
        semantic_key: "terms_definition",
        level: 2,
        content_kind: "bullet_list",
      }),
      masterSection({
        section_id: "consistency_matrix",
        title: "Matriz de consistencia",
        semantic_key: "consistency_matrix",
        level: 1,
        content_kind: "table",
      }),
      masterSection({
        section_id: "variables_categories",
        title: "Variables, dimensiones e indicadores o categorias de analisis",
        semantic_key: "variables_or_categories",
        level: 1,
        content_kind: "mixed",
      }),
      masterSection({
        section_id: "methodology",
        title: "Metodologia",
        semantic_key: "methodology",
        level: 1,
        content_kind: "mixed",
        min_words: 450,
        max_words: 1600,
      }),
      masterSection({
        section_id: "methodological_approach",
        title: "Enfoque, tipo y nivel",
        semantic_key: "methodological_approach",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "research_design",
        title: "Diseno de investigacion",
        semantic_key: "research_design",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "population_sample",
        title: "Poblacion y muestra",
        semantic_key: "population_and_sample",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "techniques",
        title: "Tecnicas e instrumentos",
        semantic_key: "data_collection_techniques",
        level: 2,
        content_kind: "mixed",
      }),
      masterSection({
        section_id: "instruments",
        title: "Instrumentos",
        semantic_key: "research_instruments",
        level: 3,
        content_kind: "bullet_list",
      }),
      masterSection({
        section_id: "procedure",
        title: "Procedimiento",
        semantic_key: "research_procedure",
        level: 2,
        content_kind: "numbered_list",
      }),
      masterSection({
        section_id: "analysis_plan",
        title: "Plan de analisis",
        semantic_key: "analysis_plan",
        level: 2,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "ethics",
        title: "Aspectos eticos",
        semantic_key: "ethics",
        level: 1,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "scope_limits",
        title: "Alcances y limitaciones",
        semantic_key: "scope_and_limitations",
        level: 1,
        content_kind: "rich_text",
      }),
      masterSection({
        section_id: "schedule",
        title: "Cronograma",
        semantic_key: "schedule",
        level: 1,
        content_kind: "table",
      }),
      masterSection({
        section_id: "budget",
        title: "Presupuesto",
        semantic_key: "budget",
        level: 1,
        content_kind: "table",
        required: false,
      }),
      masterSection({
        section_id: "references",
        title: "Referencias bibliograficas",
        semantic_key: "references",
        level: 1,
        content_kind: "references",
      }),
      masterSection({
        section_id: "annexes",
        title: "Anexos",
        semantic_key: "annexes",
        level: 1,
        content_kind: "mixed",
        required: false,
      }),
    ]),
  };
}

function collectSemanticKeys(nodes: LabTemplateSectionNode[], keys = new Set<string>()) {
  for (const node of nodes) {
    if (typeof node.semantic_key === "string" && node.semantic_key.trim().length > 0) {
      keys.add(node.semantic_key);
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      collectSemanticKeys(node.children, keys);
    }
  }

  return Array.from(keys);
}

function buildCommonUniversitySections(): LabTemplateSectionNode[] {
  return [
    { title: "Resumen", semantic_key: "abstract" },
    { title: "Palabras clave", semantic_key: "keywords" },
    { title: "Introduccion", semantic_key: "introduction" },
    {
      title: "Planteamiento del problema",
      semantic_key: "problem_statement",
      children: [
        {
          title: "Formulacion del problema",
          semantic_key: "research_questions",
          children: [
            { title: "Problema general", semantic_key: "general_research_question" },
            { title: "Problemas especificos", semantic_key: "specific_research_questions" },
          ],
        },
      ],
    },
    {
      title: "Objetivos",
      semantic_key: "objectives",
      children: [
        { title: "Objetivo general", semantic_key: "general_objective" },
        { title: "Objetivos especificos", semantic_key: "specific_objectives" },
      ],
    },
    {
      title: "Justificacion",
      semantic_key: "justification",
      children: [
        { title: "Justificacion teorica", semantic_key: "theoretical_justification" },
        { title: "Justificacion practica", semantic_key: "practical_justification" },
        { title: "Justificacion metodologica", semantic_key: "methodological_justification" },
      ],
    },
    {
      title: "Marco teorico",
      semantic_key: "theoretical_framework",
      children: [
        { title: "Antecedentes", semantic_key: "research_antecedents" },
        { title: "Estado del arte", semantic_key: "state_of_the_art" },
        { title: "Bases teoricas", semantic_key: "theoretical_bases" },
        { title: "Terminos", semantic_key: "terms_definition" },
      ],
    },
    { title: "Matriz de consistencia", semantic_key: "consistency_matrix" },
    {
      title: "Metodologia",
      semantic_key: "methodology",
      children: [
        { title: "Enfoque", semantic_key: "methodological_approach" },
        { title: "Diseno", semantic_key: "research_design" },
        { title: "Poblacion y muestra", semantic_key: "population_and_sample" },
        {
          title: "Tecnicas e instrumentos",
          semantic_key: "data_collection_techniques",
          children: [{ title: "Instrumentos", semantic_key: "research_instruments" }],
        },
        { title: "Procedimiento", semantic_key: "research_procedure" },
        { title: "Plan de analisis", semantic_key: "analysis_plan" },
      ],
    },
    { title: "Aspectos eticos", semantic_key: "ethics" },
    { title: "Alcances y limitaciones", semantic_key: "scope_and_limitations" },
    { title: "Cronograma", semantic_key: "schedule" },
    { title: "Referencias", semantic_key: "references" },
    { title: "Anexos", semantic_key: "annexes" },
  ];
}

function buildLabUniversityTemplateRuntime(input: {
  templateKey: string;
  templateName: string;
  versionId: string;
}): UniversityBlueprintTemplateRuntimeOverride {
  return {
    templateKey: input.templateKey,
    templateName: input.templateName,
    versionId: input.versionId,
    templateCandidate: {
      sections: buildCommonUniversitySections(),
    },
  };
}

export function getLabUniversityTemplateRuntime(
  project: MasterBlueprintEngineProject,
): UniversityBlueprintTemplateRuntimeOverride {
  switch (project.templateKey) {
    case "UPC_POSGRADO":
      return buildLabUniversityTemplateRuntime({
        templateKey: "UPC_POSGRADO",
        templateName: "Lab - UPC Posgrado",
        versionId: "lab-upc-posgrado-v1",
      });
    case "UCV_POSGRADO":
      return buildLabUniversityTemplateRuntime({
        templateKey: "UCV_POSGRADO",
        templateName: "Lab - UCV Posgrado",
        versionId: "lab-ucv-posgrado-v1",
      });
    case "USMP_POSGRADO":
      return buildLabUniversityTemplateRuntime({
        templateKey: "USMP_POSGRADO",
        templateName: "Lab - USMP Posgrado",
        versionId: "lab-usmp-posgrado-v1",
      });
    default:
      return buildLabUniversityTemplateRuntime({
        templateKey: "GENERIC_POSGRADO_PE",
        templateName: "Lab - Generic Posgrado PE",
        versionId: "lab-generic-posgrado-pe-v1",
      });
  }
}

export function buildLabBlueprintTemplateContext(
  project: MasterBlueprintEngineProject,
): BlueprintTemplateContext {
  const runtime = getLabUniversityTemplateRuntime(project);
  const semanticKeys = collectSemanticKeys(runtime.templateCandidate.sections);

  return {
    template_key: runtime.templateKey,
    template_name: runtime.templateName,
    selected_by_user: true,
    source: "template_runtime",
    template_family: "Lab fixture institucional para depurar derivacion universitaria.",
    university: project.university,
    program: project.program,
    degree_level: project.degreeLevel,
    required_section_keys: semanticKeys,
    available_semantic_keys: semanticKeys,
    guidance_notes: [
      "Lab fixture: runtime universitario sintetico usado para derivar el blueprint sin depender de Prisma.",
    ],
  };
}
