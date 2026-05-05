export type HeroInfographicPolicy = {
  artifact_type: "hero_infographic_policy";
  artifact_version: "v1";
  visual_type: "methodological_infographic_cover";
  rule: string;
  required_semantic_inputs: string[];
  composition_guidance: string[];
  negative_guidance: string[];
  fallback_rule: string;
};

export type HeroInfographicPromptInput = {
  finalTitle?: string | null;
  shortMethodTitle?: string | null;
  keywordsLine?: string | null;
  knowledgeArea?: string | null;
  countryContext?: string | null;
  topicOrObject?: string | null;
  methodology?: string | null;
  workflowSummary?: string | null;
  evidenceSummary?: string | null;
  sourceHealthSummary?: string | null;
  sectionPlanSummary?: string | null;
  handoffId?: string | null;
  evidenceRunId?: string | null;
  snapshotHash?: string | null;
  variant?: "master" | "university";
};

export type HeroInfographicPlan = {
  hero_visual_type: "methodological_infographic_cover";
  source_handoff_id?: string | null;
  source_evidence_run_id?: string | null;
  source_snapshot_hash?: string | null;
  deterministic_template_asset: true;
  title: string;
  subtitle: string;
  concept: string;
  method_summary: string;
  prompt: string;
  negative_prompt: string;
  hero_prompt_summary: string;
  hero_visual_caption: string;
};

export const heroInfographicPolicy: HeroInfographicPolicy = {
  artifact_type: "hero_infographic_policy",
  artifact_version: "v1",
  visual_type: "methodological_infographic_cover",
  rule:
    "La portada debe funcionar como infografia metodologica academica: comunica tema, objeto de estudio, enfoque, flujo de trabajo y contexto sin decorar ni prometer resultados.",
  required_semantic_inputs: [
    "final_title",
    "short_method_title",
    "keywords",
    "knowledge_area",
    "country_or_application_context",
    "methodology_or_workflow",
    "research_object_or_topic",
  ],
  composition_guidance: [
    "Usar composicion limpia y vertical adecuada para portada de tesis o propuesta.",
    "Representar el objeto central y un flujo de investigacion con 4 a 6 etapas conectadas.",
    "Mostrar herramientas, componentes, contexto de aplicacion y salida academica esperada como modulos visuales breves.",
    "Usar bloques conceptuales sutiles para problema, evidencia, enfoque, analisis, validacion pendiente y entrega academica.",
    "Adaptar iconografia y tono al area de conocimiento sin convertirlo en publicidad.",
    "Mantener lectura profesional, sobria y academica.",
  ],
  negative_guidance: [
    "No crear portada generica de stock.",
    "No usar estilo poster sensacionalista.",
    "No inventar graficos de datos, resultados, cifras o validaciones.",
    "No nombrar metodos, matrices, modelos o tecnicas especificas si no estan confirmados para la portada.",
    "No incluir texto largo embebido, logos, citas bibliograficas, DOIs ni nombres de fuentes.",
    "No mostrar backend, rutas, hashes, prompts, quality gates, conteos de fuentes ni metadatos internos.",
    "No usar personas reconocibles ni marcas de agua.",
  ],
  fallback_rule:
    "Si no hay generacion de imagen disponible, usar SVG deterministico con estructura de flujo metodologico, bloques academicos y caption; no usar geometria generica sin significado.",
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clip(value: string, maxLength: number) {
  const text = cleanText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function contextLabel(countryContext: string | null | undefined) {
  const normalized = cleanText(countryContext).toLowerCase();
  if (normalized === "pe" || normalized.includes("peru")) {
    return "contexto peruano";
  }

  return cleanText(countryContext) || "contexto de aplicacion declarado";
}

function keywordSummary(value: string | null | undefined) {
  return cleanText(value)
    .split(";")
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
}

export function buildHeroInfographicPlan(
  input: HeroInfographicPromptInput,
): HeroInfographicPlan {
  const documentType =
    input.variant === "university"
      ? "plan de tesis institucional"
      : "documento academico master tipo paper/proyecto";
  const title = cleanText(input.finalTitle) || "Proyecto de investigacion aplicada";
  const shortTitle = cleanText(input.shortMethodTitle) || clip(title, 84);
  const objectContext =
    cleanText(input.topicOrObject) ||
    keywordSummary(input.keywordsLine) ||
    "objeto de estudio declarado";
  const methodology =
    cleanText(input.methodology) ||
    cleanText(input.workflowSummary) ||
    "metodologia academica propuesta";
  const knowledgeArea = cleanText(input.knowledgeArea) || "area academica declarada";
  const country = contextLabel(input.countryContext);
  const evidenceSummary =
    cleanText(input.evidenceSummary) ||
    "evidencia, limitaciones y trazabilidad representadas de forma prudente";
  const sourceHealthSummary =
    cleanText(input.sourceHealthSummary) ||
    "salud de fuentes representada solo como precaucion metodologica, sin exponer diagnosticos internos";
  const sectionPlanSummary =
    cleanText(input.sectionPlanSummary) ||
    "plan academico con problema, objetivos, metodologia, analisis, cronograma y presupuesto";
  const keywords = keywordSummary(input.keywordsLine);
  const concept = [
    "Infografia metodologica de portada con objeto de estudio, flujo de investigacion, herramientas/componentes, contexto de aplicacion y salida academica esperada.",
    "No representa resultados ejecutados.",
  ].join(" ");
  const prompt = [
    "Crear una imagen vertical de alta calidad para portada de tesis/propuesta como infografia metodologica academica, no como portada generica ni cover decorativo.",
    `Tipo de documento: ${documentType}.`,
    `Titulo final: ${title}.`,
    `Titulo corto metodologico: ${shortTitle}.`,
    `Objeto o tema central: ${objectContext}.`,
    `Area de conocimiento: ${knowledgeArea}.`,
    `Contexto de aplicacion: ${country}.`,
    keywords ? `Palabras clave semanticas: ${keywords}.` : "",
    `Metodologia o enfoque a comunicar visualmente con prudencia: ${methodology}.`,
    input.workflowSummary
      ? `Flujo o etapas de investigacion: ${cleanText(input.workflowSummary)}.`
      : "Incluir flujo visual con 4 a 6 etapas conectadas: problema, revision de evidencia, diseno metodologico, analisis/evaluacion, validacion pendiente y entrega academica.",
    `Herramientas, componentes o modulos visuales sugeridos: bloques pequenos para objeto de estudio, enfoque analitico, criterios/variables, contexto y producto academico esperado.`,
    `Plan seccional a sintetizar visualmente: ${sectionPlanSummary}.`,
    `Resumen de soporte/limitaciones de evidencia: ${evidenceSummary}.`,
    `Senal interna de prudencia sobre fuentes: ${sourceHealthSummary}. Esta senal solo debe modular el tono visual; no debe aparecer como texto, conteo, quality gate ni diagnostico visible en la imagen.`,
    "Composicion: sujeto central claro, 4 a 6 nodos o paneles conectados, flechas o ruta metodologica sutil, modulo de contexto/aplicacion y bloque final de salida academica.",
    "Visual hierarchy: titulo conceptual corto, sujeto central, flujo metodologico, herramientas/componentes, contexto, salida. Usar etiquetas muy breves si aparecen; no parrafos dentro de la imagen.",
    "Estilo: limpio, profesional, sobrio, legible, academico, con diagramas/iconos/callouts sutiles; adaptable a ingenieria, salud, educacion, negocios, gestion ambiental, psicologia o politicas publicas.",
    "Evitar exceso de ornamento; usar iconografia conceptual y diagramacion de proceso; no crear graficos de datos falsos, citas falsas, logos, marcas, conteos de fuentes, quality gates, nombres de matrices/modelos no confirmados ni resultados inventados.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    hero_visual_type: "methodological_infographic_cover",
    source_handoff_id: cleanText(input.handoffId) || null,
    source_evidence_run_id: cleanText(input.evidenceRunId) || null,
    source_snapshot_hash: cleanText(input.snapshotHash) || null,
    deterministic_template_asset: true,
    title: "Infografia metodologica del proyecto",
    subtitle: shortTitle,
    concept,
    method_summary: methodology,
    prompt,
    negative_prompt: heroInfographicPolicy.negative_guidance.join(" "),
    hero_prompt_summary: clip(
      `${shortTitle}; ${objectContext}; ${methodology}; ${knowledgeArea}; ${country}`,
      260,
    ),
    hero_visual_caption:
      "Infografia metodologica de portada basada en el titulo, el enfoque de investigacion y el contexto declarado.",
  };
}
