import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { MASTER_TEMPLATE_LATAM_KEY } from "@/server/reporting/template-runtime/master-template";

const MASTER_TEMPLATE_LATAM_VERSION = 3;

type SectionInput = {
  id: string;
  title: string;
  level: number;
  semantic_key: string;
  content_kind: "rich_text" | "bullet_list" | "numbered_list" | "table" | "references" | "mixed";
  required?: boolean;
  repeatable?: boolean;
  instructions: string[];
  purpose: string;
  min_words?: number | null;
  recommended_words?: number | null;
  max_words?: number | null;
  children?: Array<SectionInput | SeedSectionNode>;
};

type SeedSectionNode = {
  id: string;
  title: string;
  level: number;
  semantic_key: string;
  required: boolean;
  repeatable: boolean;
  content_kind: SectionInput["content_kind"];
  guidance: {
    purpose: string;
    instructions: string[];
    min_words: number | null;
    recommended_words: number | null;
    max_words: number | null;
    source_kind: "system_default";
  };
  children: SeedSectionNode[];
};

function isSeedSectionNode(value: SectionInput | SeedSectionNode): value is SeedSectionNode {
  return "guidance" in value;
}

function section(input: SectionInput): SeedSectionNode {
  return {
    id: input.id,
    title: input.title,
    level: input.level,
    semantic_key: input.semantic_key,
    required: input.required ?? true,
    repeatable: input.repeatable ?? false,
    content_kind: input.content_kind,
    guidance: {
      purpose: input.purpose,
      instructions: input.instructions,
      min_words: input.min_words ?? null,
      recommended_words: input.recommended_words ?? null,
      max_words: input.max_words ?? null,
      source_kind: "system_default" as const,
    },
    children: (input.children ?? []).map((child) => (isSeedSectionNode(child) ? child : section(child))),
  };
}

function buildMasterTemplateSections() {
  return [
    section({
      id: "summary",
      title: "Resumen",
      level: 1,
      semantic_key: "abstract",
      content_kind: "rich_text",
      purpose: "Sintetizar el problema, el objetivo, el enfoque metodologico y el aporte esperado del plan de investigacion.",
      instructions: [
        "Redacta un resumen autonomo y comprensible sin depender del resto del documento.",
        "Incluye problema, objetivo general, metodologia principal y contribucion esperada.",
        "Evita citas, tablas y figuras dentro del resumen.",
      ],
      min_words: 180,
      recommended_words: 250,
      max_words: 350,
      children: [
        section({
          id: "keywords",
          title: "Palabras clave",
          level: 2,
          semantic_key: "keywords",
          content_kind: "bullet_list",
          purpose: "Registrar terminos de recuperacion bibliografica y clasificacion tematica del estudio.",
          instructions: [
            "Incluye entre tres y cinco palabras clave representativas del tema.",
            "Usa terminos tecnicos o disciplinares reconocibles por buscadores academicos.",
          ],
          min_words: 3,
          recommended_words: 5,
          max_words: 15,
        }),
      ],
    }),
    section({
      id: "introduction",
      title: "Introduccion",
      level: 1,
      semantic_key: "introduction",
      content_kind: "rich_text",
      purpose: "Presentar el tema, el contexto y la motivacion general del plan de tesis.",
      instructions: [
        "Situa el tema en su contexto academico, profesional o social.",
        "Anticipa brevemente la estructura del plan y la relevancia del problema.",
      ],
      min_words: 200,
      recommended_words: 350,
      max_words: 600,
    }),
    section({
      id: "problem",
      title: "Planteamiento del problema",
      level: 1,
      semantic_key: "problem_statement",
      content_kind: "rich_text",
      purpose: "Describir de manera delimitada la situacion problematica que motiva la investigacion.",
      instructions: [
        "Describe el problema con base en evidencia, contexto y delimitaciones concretas.",
        "Explica a quien afecta, en que contexto ocurre y por que merece investigarse.",
      ],
      min_words: 300,
      recommended_words: 500,
      max_words: 900,
      children: [
        section({
          id: "research_questions",
          title: "Formulacion del problema",
          level: 2,
          semantic_key: "research_questions",
          content_kind: "mixed",
          purpose: "Traducir el problema en preguntas investigables y coherentes con la metodologia.",
          instructions: [
            "Formula una pregunta general alineada con el objetivo general.",
            "Formula preguntas especificas alineadas con los objetivos especificos.",
          ],
          min_words: 40,
          recommended_words: 80,
          max_words: 180,
          children: [
            section({
              id: "general_question",
              title: "Problema general",
              level: 3,
              semantic_key: "general_research_question",
              content_kind: "rich_text",
              purpose: "Expresar la pregunta principal que guiará la investigacion.",
              instructions: [
                "Redacta una sola pregunta general clara, precisa y delimitada.",
                "Asegura que la pregunta pueda responderse con la metodologia propuesta.",
              ],
              min_words: 10,
              recommended_words: 20,
              max_words: 35,
            }),
            section({
              id: "specific_questions",
              title: "Problemas especificos",
              level: 3,
              semantic_key: "specific_research_questions",
              content_kind: "bullet_list",
              purpose: "Desagregar la pregunta principal en interrogantes operativas y complementarias.",
              instructions: [
                "Formula preguntas especificas secuenciales y sin superposiciones.",
                "Cada pregunta especifica debe aportar a responder la pregunta general.",
              ],
              min_words: 20,
              recommended_words: 60,
              max_words: 160,
            }),
          ],
        }),
      ],
    }),
    section({
      id: "justification",
      title: "Justificacion",
      level: 1,
      semantic_key: "justification",
      content_kind: "mixed",
      purpose: "Sustentar por que la investigacion es relevante y valiosa.",
      instructions: [
        "Argumenta la relevancia teorica, practica, metodologica y social o profesional del estudio.",
        "Explicita el aporte esperado y a quienes beneficiaria.",
      ],
      min_words: 220,
      recommended_words: 400,
      max_words: 700,
      children: [
        section({
          id: "theoretical_justification",
          title: "Justificacion teorica",
          level: 2,
          semantic_key: "theoretical_justification",
          content_kind: "rich_text",
          purpose: "Explicar el aporte del estudio al conocimiento de la disciplina.",
          instructions: [
            "Precisa que vacio o discusion teorica ayudara a esclarecer la investigacion.",
          ],
          min_words: 60,
          recommended_words: 100,
          max_words: 180,
        }),
        section({
          id: "practical_justification",
          title: "Justificacion practica",
          level: 2,
          semantic_key: "practical_justification",
          content_kind: "rich_text",
          purpose: "Explicar la utilidad aplicada, profesional o de toma de decisiones del estudio.",
          instructions: [
            "Describe que problema practico, operativo o profesional se espera atender.",
          ],
          min_words: 60,
          recommended_words: 100,
          max_words: 180,
        }),
        section({
          id: "methodological_justification",
          title: "Justificacion metodologica",
          level: 2,
          semantic_key: "methodological_justification",
          content_kind: "rich_text",
          purpose: "Explicar si el estudio aporta adaptaciones, instrumentos, procedimientos o modelos metodologicos.",
          instructions: [
            "Describe si la investigacion propone o adapta instrumentos, enfoques o procedimientos.",
          ],
          min_words: 40,
          recommended_words: 80,
          max_words: 160,
        }),
      ],
    }),
    section({
      id: "objectives",
      title: "Objetivos",
      level: 1,
      semantic_key: "objectives",
      content_kind: "mixed",
      purpose: "Definir con claridad lo que se busca lograr con la investigacion.",
      instructions: [
        "Divide siempre los objetivos en objetivo general y objetivos especificos.",
        "Usa verbos en infinitivo, evita objetivos vagos y asegura coherencia metodologica.",
      ],
      min_words: 60,
      recommended_words: 120,
      max_words: 220,
      children: [
        section({
          id: "general_objective",
          title: "Objetivo general",
          level: 2,
          semantic_key: "general_objective",
          content_kind: "rich_text",
          purpose: "Expresar el logro central del estudio.",
          instructions: [
            "Formula un unico objetivo general alineado con el problema general.",
            "Delimita el resultado central que se busca alcanzar.",
          ],
          min_words: 12,
          recommended_words: 20,
          max_words: 35,
        }),
        section({
          id: "specific_objectives",
          title: "Objetivos especificos",
          level: 2,
          semantic_key: "specific_objectives",
          content_kind: "numbered_list",
          purpose: "Desagregar el objetivo general en metas operativas y secuenciales.",
          instructions: [
            "Formula entre tres y cinco objetivos especificos, secuenciales y observables.",
            "Cada objetivo especifico debe contribuir directamente al objetivo general.",
          ],
          min_words: 30,
          recommended_words: 80,
          max_words: 180,
        }),
      ],
    }),
    section({
      id: "hypotheses",
      title: "Hipotesis",
      level: 1,
      semantic_key: "hypotheses",
      content_kind: "mixed",
      required: false,
      purpose: "Expresar respuestas tentativas verificables cuando el enfoque y el diseno lo requieran.",
      instructions: [
        "Incluye esta seccion solo cuando la logica del estudio requiera hipotesis contrastables.",
        "Alinea las hipotesis con el objetivo general, las variables y el diseno metodologico.",
      ],
      min_words: 30,
      recommended_words: 80,
      max_words: 180,
      children: [
        section({
          id: "general_hypothesis",
          title: "Hipotesis general",
          level: 2,
          semantic_key: "general_hypothesis",
          content_kind: "rich_text",
          required: false,
          purpose: "Formular la afirmacion central contrastable del estudio.",
          instructions: [
            "Redacta una sola hipotesis general, clara y contrastable.",
          ],
          min_words: 12,
          recommended_words: 20,
          max_words: 35,
        }),
        section({
          id: "specific_hypotheses",
          title: "Hipotesis especificas",
          level: 2,
          semantic_key: "specific_hypotheses",
          content_kind: "bullet_list",
          required: false,
          purpose: "Desagregar la hipotesis general en proposiciones derivadas si el diseno lo requiere.",
          instructions: [
            "Formula hipotesis especificas alineadas con objetivos especificos o componentes del modelo.",
          ],
          min_words: 20,
          recommended_words: 60,
          max_words: 160,
        }),
      ],
    }),
    section({
      id: "theoretical_framework",
      title: "Marco teorico",
      level: 1,
      semantic_key: "theoretical_framework",
      content_kind: "mixed",
      purpose: "Fundamentar teorica y empiricamente la investigacion.",
      instructions: [
        "Integra antecedentes, bases teoricas, conceptos y el estado del arte relevante.",
        "Mantén una relacion explicita entre la literatura revisada y el problema del estudio.",
      ],
      min_words: 500,
      recommended_words: 900,
      max_words: 1800,
      children: [
        section({
          id: "antecedents",
          title: "Antecedentes de la investigacion",
          level: 2,
          semantic_key: "research_antecedents",
          content_kind: "rich_text",
          purpose: "Sintetizar estudios previos pertinentes y comparables.",
          instructions: [
            "Resume investigaciones previas relevantes, comparando contexto, metodo y hallazgos.",
          ],
          min_words: 180,
          recommended_words: 350,
          max_words: 700,
        }),
        section({
          id: "state_of_the_art",
          title: "Estado del arte",
          level: 2,
          semantic_key: "state_of_the_art",
          content_kind: "rich_text",
          purpose: "Ubicar la discusion mas reciente, las tendencias y los vacios del tema.",
          instructions: [
            "Analiza tendencias, debates y vacios recientes directamente vinculados al estudio.",
          ],
          min_words: 220,
          recommended_words: 400,
          max_words: 800,
        }),
        section({
          id: "theoretical_bases",
          title: "Bases teoricas",
          level: 2,
          semantic_key: "theoretical_bases",
          content_kind: "rich_text",
          purpose: "Explicar las teorias, modelos o enfoques conceptuales que sustentan el estudio.",
          instructions: [
            "Explica los modelos o teorias centrales con relacion directa al problema y a los objetivos.",
          ],
          min_words: 160,
          recommended_words: 300,
          max_words: 700,
        }),
        section({
          id: "terms_definition",
          title: "Definicion de terminos o marco conceptual",
          level: 2,
          semantic_key: "terms_definition",
          content_kind: "bullet_list",
          purpose: "Precisar conceptos clave, siglas y definiciones operativas.",
          instructions: [
            "Define terminos tecnicos, siglas o categorias fundamentales para interpretar el estudio.",
          ],
          min_words: 30,
          recommended_words: 100,
          max_words: 240,
        }),
      ],
    }),
    section({
      id: "consistency_matrix",
      title: "Matriz de consistencia",
      level: 1,
      semantic_key: "consistency_matrix",
      content_kind: "table",
      purpose: "Alinear problema, objetivos, hipotesis, variables o categorias y metodologia en una sola vista trazable.",
      instructions: [
        "Construye una tabla que relacione problema general, problemas especificos, objetivo general, objetivos especificos, hipotesis, variables o categorias, tecnica e instrumento y estrategia metodologica.",
        "Asegura que cada fila muestre coherencia vertical entre pregunta, objetivo, hipotesis y evidencia esperada.",
        "Usa como columnas base: problema general, problemas especificos, objetivo general, objetivos especificos, hipotesis, variables o categorias, metodologia, tecnica o instrumento.",
      ],
      min_words: 40,
      recommended_words: 120,
      max_words: 220,
    }),
    section({
      id: "variables_categories",
      title: "Variables, dimensiones e indicadores o categorias de analisis",
      level: 1,
      semantic_key: "variables_or_categories",
      content_kind: "mixed",
      purpose: "Modelar el objeto de estudio de forma operacional u observacional segun el enfoque.",
      instructions: [
        "Si el estudio es cuantitativo, presenta variables, dimensiones e indicadores en formato tabular.",
        "Si el estudio es cualitativo, presenta categorias, subcategorias y criterios de observacion.",
      ],
      min_words: 80,
      recommended_words: 160,
      max_words: 320,
    }),
    section({
      id: "methodology",
      title: "Metodologia",
      level: 1,
      semantic_key: "methodology",
      content_kind: "mixed",
      purpose: "Explicar como se ejecutara la investigacion y como se obtendra evidencia valida para responder al problema.",
      instructions: [
        "Describe el enfoque, tipo, diseno, unidad de analisis, tecnicas, instrumentos, procedimiento y analisis.",
        "Asegura que cada decision metodologica sea coherente con los objetivos y el tipo de evidencia requerida.",
      ],
      min_words: 450,
      recommended_words: 800,
      max_words: 1600,
      children: [
        section({
          id: "methodological_approach",
          title: "Enfoque, tipo y nivel de investigacion",
          level: 2,
          semantic_key: "methodological_approach",
          content_kind: "rich_text",
          purpose: "Clasificar la investigacion segun su logica metodologica y alcance.",
          instructions: [
            "Especifica enfoque, tipo, nivel y justificacion de esa eleccion.",
          ],
          min_words: 80,
          recommended_words: 140,
          max_words: 260,
        }),
        section({
          id: "research_design",
          title: "Diseño de investigacion",
          level: 2,
          semantic_key: "research_design",
          content_kind: "rich_text",
          purpose: "Definir la estructura del estudio, sus comparaciones, temporalidad y logica de analisis.",
          instructions: [
            "Describe el diseno metodologico con suficiente detalle para reproducir la ruta de trabajo.",
          ],
          min_words: 80,
          recommended_words: 140,
          max_words: 260,
        }),
        section({
          id: "population_sample",
          title: "Poblacion, muestra o unidades de analisis",
          level: 2,
          semantic_key: "population_and_sample",
          content_kind: "rich_text",
          purpose: "Definir con precision la unidad empirica del estudio y los criterios de inclusion.",
          instructions: [
            "Explica poblacion, muestra, unidad de analisis y criterios de seleccion.",
          ],
          min_words: 80,
          recommended_words: 140,
          max_words: 260,
        }),
        section({
          id: "techniques_instruments",
          title: "Tecnicas e instrumentos de recoleccion",
          level: 2,
          semantic_key: "data_collection_techniques",
          content_kind: "mixed",
          purpose: "Precisar como se obtendran los datos o evidencias.",
          instructions: [
            "Describe tecnicas, instrumentos, validacion y forma de aplicacion.",
          ],
          min_words: 80,
          recommended_words: 140,
          max_words: 260,
          children: [
            section({
              id: "instruments",
              title: "Instrumentos",
              level: 3,
              semantic_key: "research_instruments",
              content_kind: "bullet_list",
              purpose: "Identificar instrumentos, formatos o recursos concretos de recoleccion.",
              instructions: [
                "Lista instrumentos y relaciona cada uno con la tecnica correspondiente.",
              ],
              min_words: 20,
              recommended_words: 50,
              max_words: 120,
            }),
          ],
        }),
        section({
          id: "procedure",
          title: "Procedimiento",
          level: 2,
          semantic_key: "research_procedure",
          content_kind: "numbered_list",
          purpose: "Describir la secuencia operativa del trabajo de investigacion.",
          instructions: [
            "Explica paso a paso la ejecucion prevista desde la recoleccion hasta el cierre analitico.",
          ],
          min_words: 60,
          recommended_words: 120,
          max_words: 260,
        }),
        section({
          id: "analysis_plan",
          title: "Plan de analisis de datos o informacion",
          level: 2,
          semantic_key: "analysis_plan",
          content_kind: "rich_text",
          purpose: "Explicar como se transformaran los datos en evidencia interpretable.",
          instructions: [
            "Describe tecnicas analiticas, pruebas, criterios de interpretacion o estrategias de codificacion.",
          ],
          min_words: 80,
          recommended_words: 140,
          max_words: 280,
        }),
      ],
    }),
    section({
      id: "ethics",
      title: "Aspectos eticos",
      level: 1,
      semantic_key: "ethics",
      content_kind: "rich_text",
      purpose: "Declarar consideraciones eticas, de confidencialidad y uso responsable de datos y fuentes.",
      instructions: [
        "Explica consentimientos, confidencialidad, manejo de datos y resguardo etico si corresponde.",
      ],
      min_words: 60,
      recommended_words: 120,
      max_words: 220,
    }),
    section({
      id: "scope_limits",
      title: "Alcances y limitaciones",
      level: 1,
      semantic_key: "scope_and_limitations",
      content_kind: "rich_text",
      purpose: "Delimitar el campo de aplicacion de los hallazgos y reconocer restricciones del estudio.",
      instructions: [
        "Especifica que cubre y que no cubre el estudio, asi como restricciones previsibles.",
      ],
      min_words: 60,
      recommended_words: 120,
      max_words: 220,
    }),
    section({
      id: "schedule",
      title: "Cronograma",
      level: 1,
      semantic_key: "schedule",
      content_kind: "table",
      purpose: "Planificar las actividades del estudio en una secuencia temporal verificable.",
      instructions: [
        "Organiza actividades, responsables y periodos de ejecucion en formato tabular.",
      ],
      min_words: 20,
      recommended_words: 60,
      max_words: 120,
    }),
    section({
      id: "budget",
      title: "Presupuesto",
      level: 1,
      semantic_key: "budget",
      content_kind: "table",
      required: false,
      purpose: "Estimar recursos y costos necesarios para ejecutar el estudio cuando la institucion lo requiera.",
      instructions: [
        "Detalla rubros, costos, cantidades y fuente de financiamiento si aplica.",
      ],
      min_words: 20,
      recommended_words: 60,
      max_words: 120,
    }),
    section({
      id: "references",
      title: "Referencias bibliograficas",
      level: 1,
      semantic_key: "references",
      content_kind: "references",
      purpose: "Registrar de manera normalizada todas las fuentes efectivamente citadas.",
      instructions: [
        "Incluye solo las referencias citadas en el documento.",
        "Mantén consistencia con el estilo de citacion configurado para la plantilla u overlay institucional.",
      ],
      min_words: 20,
      recommended_words: 120,
      max_words: 400,
    }),
    section({
      id: "annexes",
      title: "Anexos",
      level: 1,
      semantic_key: "annexes",
      content_kind: "mixed",
      required: false,
      repeatable: true,
      purpose: "Reunir instrumentos, tablas ampliadas, fichas, formatos y soportes complementarios.",
      instructions: [
        "Incluye solo anexos necesarios para comprender, verificar o ejecutar el estudio.",
      ],
      min_words: 20,
      recommended_words: 80,
      max_words: 200,
    }),
  ];
}

function buildTemplateCandidate() {
  const sections = buildMasterTemplateSections();

  return {
    derived_from_source_id: "master-template-latam-v3",
    template_key_guess: MASTER_TEMPLATE_LATAM_KEY,
    template_family:
      "Plantilla maestra LATAM para plan de tesis y proyecto de investigacion, transversal a disciplinas, compatible con overlays institucionales y con estilo editorial tecnico sobrio",
    language: "es-PE",
    institution: {
      university_name: "Institucion academica LATAM",
      school_name: "Posgrado o unidad academica",
      program_name: "Programa academico",
      mention: null,
      degree_level: "POSGRADO",
      discipline_area: "Multidisciplinario",
    },
    methodology_mode: "mixed",
    citation_style: "APA7",
    review_status: "reviewed",
    logo_policy: {
      strategy: "provided_asset_first",
      primary_asset_key: "mastertemplate-ingeniometrix-logo",
      placement: "cover_top",
      alignment: "center",
    },
    cover_template: {
      document_label: "PLAN DE TESIS",
      fields: [
        { key: "master_brand_logo", label: "Logo MasterTemplate", value_type: "asset", required: true },
        { key: "institution_logo", label: "Logo institucional", value_type: "asset", required: false },
        { key: "university_name", label: "Universidad o institucion", value_type: "text", required: true },
        { key: "school_name", label: "Facultad, escuela o unidad academica", value_type: "text", required: false },
        { key: "program_name", label: "Programa", value_type: "text", required: true },
        { key: "degree_level", label: "Grado", value_type: "text", required: true },
        { key: "document_label", label: "Tipo de documento", value_type: "text", required: true },
        { key: "project_title", label: "Titulo", value_type: "text", required: true },
        { key: "author_name", label: "Autor o tesista", value_type: "person_name", required: true },
        { key: "advisor_name", label: "Asesor", value_type: "person_name", required: true },
        { key: "co_advisor_name", label: "Coasesor", value_type: "person_name", required: false },
        { key: "city_country", label: "Ciudad y pais", value_type: "location", required: true },
        { key: "submission_date", label: "Fecha", value_type: "date", required: true },
      ],
    },
    sections,
    element_rules: {
      page: {
        paper_size: "A4",
        margin_left_cm: 3,
        margin_right_cm: 2.5,
        margin_top_cm: 2.5,
        margin_bottom_cm: 2.5,
        page_numbering: true,
        page_number_position: "bottom_center",
      },
      titles: [
        { level: 1, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 12, spacing_after_pt: 6 },
        { level: 2, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 10, spacing_after_pt: 5 },
        { level: 3, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 8, spacing_after_pt: 4 },
      ],
      paragraph: {
        font_family: "Times New Roman",
        font_size_pt: 10,
        line_spacing: 1.15,
        alignment: "justify",
        space_before_pt: 0,
        space_after_pt: 3,
        first_line_indent_cm: 0.75,
      },
      equation: {
        numbering: true,
        alignment: "center",
        reference_style: "parenthetical",
        numbering_format: "plain",
        label_prefix: "Ecuacion",
      },
      table: {
        caption_position: "top",
        allow_vertical_lines: false,
        numbering: true,
        source_note_required: true,
        note_position: "bottom",
        numbering_format: "plain",
        label: "Tabla",
      },
      figure: {
        caption_position: "bottom",
        numbering: true,
        source_note_required: true,
        note_position: "bottom",
        numbering_format: "plain",
        label: "Figura",
      },
      caption: {
        prefix_style: "label_period_title",
        separator: ". ",
        font_style: "bold",
      },
      citation: {
        numbering: false,
        inline_style: "author_year",
      },
      reference_list: {
        numbering: false,
        ordering: "alphabetical",
        heading_title: "Referencias bibliograficas",
        require_cited_only: true,
        doi_policy: "preferred",
      },
    },
    validations: {
      required_section_keys: [
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
      ],
      requires_logo: false,
      requires_references: true,
      human_review_required: false,
    },
    warnings: [
      "MasterTemplate es una base canonica LATAM y debe especializarse mediante overlays institucionales cuando existan reglas universitarias explicitas.",
      "La seccion de hipotesis y la de presupuesto son opcionales y deben habilitarse segun el enfoque y el reglamento de la institucion.",
      "Se integraron convenciones editoriales tecnicas aplicables desde un paper de ingenieria: cuerpo compacto, captions consistentes, ecuaciones profesionales y tablas sobrias.",
    ],
  };
}

function buildNormalizedDocument() {
  return {
    source_id: "master-template-latam-v3",
    source_type: "manual",
    document_kind: "template_guide",
    language: "es-PE",
    institution: {
      university_name: "Institucion academica LATAM",
      school_name: "Posgrado o unidad academica",
      program_name: "Programa academico",
      mention: null,
      degree_level: "POSGRADO",
      discipline_area: "Multidisciplinario",
      confidence: 1,
    },
    assets: [
      {
        asset_key: "mastertemplate-ingeniometrix-logo",
        kind: "logo",
        source_strategy: "provided_file",
        source_path: path.resolve(process.cwd(), "public/brand/ingeniometrix-lockup-320.png"),
        mime_type: "image/png",
        width_px: 320,
        height_px: 61,
        has_transparency: true,
        confidence: 1,
      },
    ],
    cover: {
      raw_text: "MasterTemplate LATAM",
      university_name: "Institucion academica LATAM",
      school_name: "Posgrado o unidad academica",
      program_name: "Programa academico",
      document_label: "PLAN DE TESIS",
      author_lines: [],
      advisor_lines: [],
      place_label: "Ciudad, Pais",
      date_label: "Mes y anio",
      logo_asset_key: "mastertemplate-ingeniometrix-logo",
      page_span: {
        start_page: 1,
        end_page: 1,
      },
    },
    blocks: buildMasterTemplateSections().map((item) => ({
      id: item.id,
      type: item.level === 1 ? "section" : "subsection",
      label: item.title,
      ordinal: null,
      level: item.level,
      semantic_key: item.semantic_key,
      raw_text: item.guidance.purpose,
      normalized_text: item.guidance.instructions.join(" "),
      page_span: {
        start_page: 1,
        end_page: 1,
      },
      confidence: 1,
    })),
    warnings: [
      "Registro manual sintetizado desde criterios metodologicos y editoriales del MVP.",
    ],
  };
}

async function buildBrandAssetPayload() {
  const filePath = path.resolve(process.cwd(), "public/brand/ingeniometrix-lockup-320.png");
  const fileData = readFileSync(filePath);
  const fileHash = createHash("sha256").update(fileData).digest("hex");

  return {
    assetKey: "mastertemplate-ingeniometrix-logo",
    kind: "LOGO" as const,
    sourceStrategy: "PROVIDED_FILE" as const,
    originalFilePath: filePath,
    storedFilePath: null,
    fileName: path.basename(filePath),
    mimeType: "image/png",
    fileHash,
    fileData: new Uint8Array(fileData) as unknown as Uint8Array<ArrayBuffer>,
    widthPx: 320,
    heightPx: 61,
    hasTransparency: true,
    metadataJson: {
      role: "master_brand_logo",
      description: "Logo de Ingeniometrix usado como branding fallback en la portada del MasterTemplate.",
    } as Prisma.InputJsonValue,
  };
}

async function seedMasterTemplateLatam() {
  const templateCandidate = buildTemplateCandidate();
  const normalizedDocument = buildNormalizedDocument();
  const brandAsset = await buildBrandAssetPayload();

  const template = await prisma.template.upsert({
    where: {
      key: MASTER_TEMPLATE_LATAM_KEY,
    },
    update: {
      name: "MasterTemplate - LATAM Research Plan",
      ownerType: "SYSTEM",
      status: "ACTIVE",
      universityName: "Institucion academica LATAM",
      schoolName: "Posgrado o unidad academica",
      programName: "Programa academico",
      mention: null,
      degreeLevel: "POSGRADO",
      disciplineArea: "Multidisciplinario",
      templateFamily:
        "Plantilla maestra LATAM para plan de tesis y proyecto de investigacion, transversal a disciplinas, compatible con overlays institucionales y con estilo editorial tecnico sobrio",
    },
    create: {
      key: MASTER_TEMPLATE_LATAM_KEY,
      name: "MasterTemplate - LATAM Research Plan",
      ownerType: "SYSTEM",
      status: "ACTIVE",
      universityName: "Institucion academica LATAM",
      schoolName: "Posgrado o unidad academica",
      programName: "Programa academico",
      mention: null,
      degreeLevel: "POSGRADO",
      disciplineArea: "Multidisciplinario",
      templateFamily:
        "Plantilla maestra LATAM para plan de tesis y proyecto de investigacion, transversal a disciplinas, compatible con overlays institucionales y con estilo editorial tecnico sobrio",
    },
  });

  const existingVersion = await prisma.templateVersion.findFirst({
    where: {
      templateId: template.id,
      versionNumber: MASTER_TEMPLATE_LATAM_VERSION,
    },
    include: {
      sources: true,
      assets: true,
    },
  });

  if (existingVersion) {
    await prisma.templateSource.deleteMany({
      where: {
        templateVersionId: existingVersion.id,
      },
    });
    await prisma.templateAsset.deleteMany({
      where: {
        templateVersionId: existingVersion.id,
      },
    });

    await prisma.templateVersion.update({
      where: {
        id: existingVersion.id,
      },
      data: {
        schemaVersion: "v1",
        language: "es-PE",
        methodologyMode: "mixed",
        citationStyle: "APA7",
        documentKind: "TEMPLATE_GUIDE",
        reviewStatus: "REVIEWED",
        templateFamily: templateCandidate.template_family,
        templateKeyGuess: MASTER_TEMPLATE_LATAM_KEY,
        universityName: "Institucion academica LATAM",
        schoolName: "Posgrado o unidad academica",
        programName: "Programa academico",
        mention: null,
        degreeLevel: "POSGRADO",
        disciplineArea: "Multidisciplinario",
        normalizedDocumentJson: normalizedDocument as unknown as Prisma.InputJsonValue,
        semanticAnalysisJson: Prisma.JsonNull,
        templateCandidateJson: templateCandidate as unknown as Prisma.InputJsonValue,
        sources: {
          create: {
            sourceId: "master-template-latam-v3",
            sourceType: "MANUAL",
            documentKind: "TEMPLATE_GUIDE",
            originalFilePath: null,
            storedFilePath: null,
            fileName: "MASTER_TEMPLATE_LATAM",
            mimeType: "application/json",
            fileHash: null,
            fileData: null,
            metadataJson: {
              source_kind: "manual_seed",
              notes: [
                "Plantilla maestra sintetizada para el MVP de reporting.",
              ],
            } as Prisma.InputJsonValue,
          },
        },
        assets: {
          create: brandAsset,
        },
      },
    });
  } else {
    await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: MASTER_TEMPLATE_LATAM_VERSION,
        schemaVersion: "v1",
        language: "es-PE",
        methodologyMode: "mixed",
        citationStyle: "APA7",
        documentKind: "TEMPLATE_GUIDE",
        reviewStatus: "REVIEWED",
        templateFamily: templateCandidate.template_family,
        templateKeyGuess: MASTER_TEMPLATE_LATAM_KEY,
        universityName: "Institucion academica LATAM",
        schoolName: "Posgrado o unidad academica",
        programName: "Programa academico",
        mention: null,
        degreeLevel: "POSGRADO",
        disciplineArea: "Multidisciplinario",
        normalizedDocumentJson: normalizedDocument as unknown as Prisma.InputJsonValue,
        semanticAnalysisJson: Prisma.JsonNull,
        templateCandidateJson: templateCandidate as unknown as Prisma.InputJsonValue,
        sources: {
          create: {
            sourceId: "master-template-latam-v3",
            sourceType: "MANUAL",
            documentKind: "TEMPLATE_GUIDE",
            originalFilePath: null,
            storedFilePath: null,
            fileName: "MASTER_TEMPLATE_LATAM",
            mimeType: "application/json",
            fileHash: null,
            fileData: null,
            metadataJson: {
              source_kind: "manual_seed",
              notes: [
                "Plantilla maestra sintetizada para el MVP de reporting.",
              ],
            } as Prisma.InputJsonValue,
          },
        },
        assets: {
          create: brandAsset,
        },
      },
    });
  }

  const output = await prisma.template.findUnique({
    where: {
      key: MASTER_TEMPLATE_LATAM_KEY,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "desc",
        },
        include: {
          sources: true,
          assets: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        key: output?.key,
        status: output?.status,
        versionId: output?.versions[0]?.id ?? null,
        sourceCount: output?.versions[0]?.sources.length ?? 0,
        assetCount: output?.versions[0]?.assets.length ?? 0,
      },
      null,
      2,
    ),
  );
}

seedMasterTemplateLatam()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
