import type {
  MasterBlueprintLabStepDefinition,
  MasterBlueprintLabStepKey,
} from "@/lib/labs/master-blueprint/types";

export const MASTER_BLUEPRINT_LAB_STEPS: MasterBlueprintLabStepDefinition[] = [
  {
    key: "master_template_runtime",
    title: "MasterTemplate runtime",
    summary: "Carga el runtime completo de MASTER_TEMPLATE_LATAM.",
    description:
      "Carga el runtime real de MASTER_TEMPLATE_LATAM desde la app principal y lo adapta al formato del blueprint v2 para depurar estructura, secciones requeridas e instrucciones completas.",
  },
  {
    key: "prompt_planning",
    title: "Prompt planning",
    summary: "Planifica prompts progresivos por seccion.",
    description:
      "Construye generation plan y prompt manifest, enlazando snippets, dependencias previas, assumptions y soporte esperado por seccion.",
  },
  {
    key: "section_generation",
    title: "Section generation",
    summary: "Genera drafts del Master por fase.",
    description:
      "Ejecuta la generacion de secciones con derivaciones deterministas y fallbacks prudentes, preservando trazabilidad a snippets, fuentes y assumptions.",
  },
  {
    key: "consistency_matrix",
    title: "Consistency matrix",
    summary: "Deriva la matriz de consistencia al final.",
    description:
      "Construye la matriz solo despues de consolidar preguntas, objetivos, metodologia y tecnicas; luego agrega el draft final de la matriz.",
  },
  {
    key: "blueprint_composition",
    title: "Blueprint composition",
    summary: "Compone el blueprint persistible final.",
    description:
      "Consolida drafts, matriz v3, reportes de validacion, procedencia, referencias y derivacion institucional sin maquillar secciones debiles.",
  },
  {
    key: "legacy_blueprint_composition",
    title: "Legacy blueprint composition",
    summary: "Compone el blueprint legado compatible.",
    description:
      "Transforma los drafts del Master y la evidencia en un `legacy_blueprint` compatible con el backend actual para facilitar comparacion y depuracion.",
  },
  {
    key: "validation",
    title: "Validation",
    summary: "Evalua calidad, trazabilidad y coherencia.",
    description:
      "Calcula el validation report, score de calidad, coherencia y trazabilidad formal sobre el blueprint legado derivado del escenario sintetico.",
  },
  {
    key: "provenance",
    title: "Provenance",
    summary: "Calcula procedencia por documento y por seccion.",
    description:
      "Expone el breakdown de procedencia desde fuentes, PDFs, websearch y assumptions, listo para comparar contra drafts y warnings.",
  },
  {
    key: "university_derivation",
    title: "University derivation",
    summary: "Deriva la version universitaria.",
    description:
      "Mapea el blueprint maestro a una plantilla universitaria sintetica para probar la etapa final sin depender del runtime institucional real.",
  },
  {
    key: "master_docx_render",
    title: "Master DOCX render",
    summary: "Genera el Word del Master Template.",
    description:
      "Renderiza el documento maestro en DOCX con portada, secciones, citas APA conservadoras, matriz horizontal, referencias y anexos de trazabilidad.",
  },
  {
    key: "university_docx_render",
    title: "University DOCX render",
    summary: "Genera el Word institucional.",
    description:
      "Renderiza el documento institucional derivado con estructura de plantilla universitaria, matriz horizontal, referencias y control de calidad.",
  },
];

export const MASTER_BLUEPRINT_LAB_STEP_KEYS = MASTER_BLUEPRINT_LAB_STEPS.map(
  (step) => step.key,
) as MasterBlueprintLabStepKey[];
