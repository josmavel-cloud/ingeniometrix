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
    "Representar el objeto central y un flujo de investigacion con 3 a 5 etapas conectadas.",
    "Mostrar herramientas, componentes, contexto de aplicacion y salida academica esperada con modulos visuales breves.",
    "Usar bloques conceptuales sutiles para problema, enfoque, analisis y entrega academica, sin saturar la portada.",
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
    "Si no hay generacion de imagen disponible, usar SVG deterministico con estructura de flujo metodologico y bloques academicos; no usar caption en la caratula ni geometria generica sin significado.",
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
  const sectionPlanSummary =
    cleanText(input.sectionPlanSummary) ||
    "plan academico con problema, objetivos, metodologia, analisis, cronograma y presupuesto";
  const keywords = keywordSummary(input.keywordsLine);
  const concept = [
    "Infografia metodologica de portada con objeto de estudio, flujo de investigacion, herramientas/componentes, contexto de aplicacion y salida academica esperada.",
    "No representa resultados ejecutados.",
  ].join(" ");
  const prompt = [
    "Crear una imagen vertical de alta calidad para caratula de tesis/propuesta como infografia metodologica academica sobria y liviana, no como portada generica ni cover decorativo.",
    `Tipo de documento: ${documentType}.`,
    `Titulo final solo como contexto semantico, no como texto largo dentro de la imagen: ${title}.`,
    `Titulo corto metodologico solo si se necesita una etiqueta breve: ${shortTitle}.`,
    `Objeto o tema central: ${objectContext}.`,
    `Area de conocimiento: ${knowledgeArea}.`,
    `Contexto de aplicacion: ${country}.`,
    keywords ? `Palabras clave semanticas: ${keywords}.` : "",
    `Metodologia o enfoque a comunicar visualmente con prudencia: ${methodology}.`,
    input.workflowSummary
      ? `Flujo o etapas de investigacion: ${cleanText(input.workflowSummary)}.`
      : "Incluir flujo visual con 3 a 5 etapas conectadas: problema, revision de evidencia, diseno metodologico, analisis/evaluacion y entrega academica.",
    "Herramientas, componentes o modulos visuales sugeridos: pocos bloques pequenos para objeto de estudio, enfoque analitico, criterios/variables, contexto y producto academico esperado.",
    `Plan seccional a sintetizar visualmente: ${sectionPlanSummary}.`,
    "Tono visual prudente: comunicar que es una propuesta metodológica, sin resultados ni rankings. Los conteos de fuentes, quality gates, metadatos internos y cualquier diagnostico visible no debe aparecer como texto.",
    "Composicion: sujeto central claro, 3 a 5 nodos conectados, flechas discretas, modulo de contexto/aplicacion y bloque final de salida academica.",
    "Jerarquia visual: sujeto central, flujo metodologico, herramientas/componentes, contexto y salida. Usar etiquetas minimas de 1 a 3 palabras; no renderizar el titulo completo, no caption, no parrafos dentro de la imagen.",
    "Estilo: limpio, profesional, sobrio, legible, academico, con diagramas/iconos/callouts sutiles; adaptable a cualquier area de conocimiento.",
    "Evitar exceso de ornamento y texto; usar iconografia conceptual y diagramacion de proceso; no crear graficos de datos falsos, citas falsas, logos, marcas, conteos de fuentes, quality gates, trazabilidad visible, nombres de matrices/modelos no confirmados ni resultados inventados.",
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
    hero_visual_caption: "",
  };
}
