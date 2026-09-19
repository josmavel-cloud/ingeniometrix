import { normalizeLanguageCode } from "@/lib/language";

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
  language?: string | null;
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

function isEnglish(value: string | null | undefined) {
  return normalizeLanguageCode(value) === "en";
}

function contextLabel(countryContext: string | null | undefined, language?: string | null) {
  const normalized = cleanText(countryContext).toLowerCase();
  if (normalized === "pe" || normalized.includes("peru")) {
    return isEnglish(language) ? "Peruvian context" : "contexto peruano";
  }

  return cleanText(countryContext) ||
    (isEnglish(language) ? "declared application context" : "contexto de aplicacion declarado");
}

function keywordSummary(value: string | null | undefined) {
  return cleanText(value)
    .split(";")
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
}

function negativePrompt(language?: string | null) {
  if (!isEnglish(language)) {
    return heroInfographicPolicy.negative_guidance.join(" ");
  }

  return [
    "Do not create a generic stock cover.",
    "Do not use sensational poster style.",
    "Do not invent data charts, results, figures, or validations.",
    "Do not name specific methods, matrices, models, or techniques unless confirmed for the cover.",
    "Do not include long embedded text, logos, citations, DOIs, or source names.",
    "Do not show backend routes, hashes, prompts, quality gates, source counts, or internal metadata.",
    "Do not use recognizable people or watermarks.",
  ].join(" ");
}

export function buildHeroInfographicPlan(
  input: HeroInfographicPromptInput,
): HeroInfographicPlan {
  const english = isEnglish(input.language);
  const documentType =
    input.variant === "university"
      ? english ? "institutional thesis plan" : "plan de tesis institucional"
      : english ? "master academic paper/project document" : "documento academico master tipo paper/proyecto";
  const title = cleanText(input.finalTitle) ||
    (english ? "Applied research project" : "Proyecto de investigacion aplicada");
  const shortTitle = cleanText(input.shortMethodTitle) || clip(title, 84);
  const objectContext =
    cleanText(input.topicOrObject) ||
    keywordSummary(input.keywordsLine) ||
    (english ? "declared study object" : "objeto de estudio declarado");
  const methodology =
    cleanText(input.methodology) ||
    cleanText(input.workflowSummary) ||
    (english ? "proposed academic methodology" : "metodologia academica propuesta");
  const knowledgeArea =
    cleanText(input.knowledgeArea) ||
    (english ? "declared academic area" : "area academica declarada");
  const country = contextLabel(input.countryContext, input.language);
  const sectionPlanSummary =
    cleanText(input.sectionPlanSummary) ||
    (english
      ? "academic plan with problem, objectives, methodology, analysis, schedule, and budget"
      : "plan academico con problema, objetivos, metodologia, analisis, cronograma y presupuesto");
  const keywords = keywordSummary(input.keywordsLine);
  const concept = english
    ? [
        "Methodological cover infographic with the study object, research workflow, tools/components, application context, and expected academic output.",
        "It does not represent executed results.",
      ].join(" ")
    : [
        "Infografia metodologica de portada con objeto de estudio, flujo de investigacion, herramientas/componentes, contexto de aplicacion y salida academica esperada.",
        "No representa resultados ejecutados.",
      ].join(" ");
  const prompt = (english
    ? [
        "Create a high-quality vertical image for a thesis/proposal cover as a sober, lightweight academic methodological infographic, not a generic cover or decorative poster.",
        `Document type: ${documentType}.`,
        `Final title only as semantic context, not as long text inside the image: ${title}.`,
        `Short methodological title only if a brief label is needed: ${shortTitle}.`,
        `Central object or topic: ${objectContext}.`,
        `Knowledge area: ${knowledgeArea}.`,
        `Application context: ${country}.`,
        keywords ? `Semantic keywords: ${keywords}.` : "",
        `Methodology or approach to communicate visually with caution: ${methodology}.`,
        input.workflowSummary
          ? `Research workflow or stages: ${cleanText(input.workflowSummary)}.`
          : "Include a visual flow with 3 to 5 connected stages: problem, evidence review, methodological design, analysis/evaluation, and academic deliverable.",
        "Suggested tools, components, or visual modules: a few small blocks for study object, analytical approach, criteria/variables, context, and expected academic product.",
        `Section plan to synthesize visually: ${sectionPlanSummary}.`,
        "Prudent visual tone: communicate that this is a methodological proposal, without results or rankings. Source counts, quality gates, internal metadata, and visible diagnostics must not appear as text.",
        "Composition: clear central subject, 3 to 5 connected nodes, subtle arrows, context/application module, and final academic output block.",
        "Visual hierarchy: central subject, methodological flow, tools/components, context, and output. Use minimal labels of 1 to 3 words; do not render the full title, captions, or paragraphs inside the image.",
        "Style: clean, professional, sober, legible, academic, with subtle diagrams/icons/callouts; adaptable to any knowledge area.",
        "Avoid excessive ornament and text; use conceptual iconography and process layout; do not create false data charts, false citations, logos, brands, source counts, quality gates, visible traceability, unconfirmed matrix/model names, or invented results.",
      ]
    : [
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
        "Tono visual prudente: comunicar que es una propuesta metodologica, sin resultados ni rankings. Los conteos de fuentes, quality gates, metadatos internos y cualquier diagnostico visible no debe aparecer como texto.",
        "Composicion: sujeto central claro, 3 a 5 nodos conectados, flechas discretas, modulo de contexto/aplicacion y bloque final de salida academica.",
        "Jerarquia visual: sujeto central, flujo metodologico, herramientas/componentes, contexto y salida. Usar etiquetas minimas de 1 a 3 palabras; no renderizar el titulo completo, no caption, no parrafos dentro de la imagen.",
        "Estilo: limpio, profesional, sobrio, legible, academico, con diagramas/iconos/callouts sutiles; adaptable a cualquier area de conocimiento.",
        "Evitar exceso de ornamento y texto; usar iconografia conceptual y diagramacion de proceso; no crear graficos de datos falsos, citas falsas, logos, marcas, conteos de fuentes, quality gates, trazabilidad visible, nombres de matrices/modelos no confirmados ni resultados inventados.",
      ])
    .filter(Boolean)
    .join(" ");

  return {
    hero_visual_type: "methodological_infographic_cover",
    source_handoff_id: cleanText(input.handoffId) || null,
    source_evidence_run_id: cleanText(input.evidenceRunId) || null,
    source_snapshot_hash: cleanText(input.snapshotHash) || null,
    deterministic_template_asset: true,
    title: english ? "Project methodological infographic" : "Infografia metodologica del proyecto",
    subtitle: shortTitle,
    concept,
    method_summary: methodology,
    prompt,
    negative_prompt: negativePrompt(input.language),
    hero_prompt_summary: clip(
      `${shortTitle}; ${objectContext}; ${methodology}; ${knowledgeArea}; ${country}`,
      260,
    ),
    hero_visual_caption: "",
  };
}
