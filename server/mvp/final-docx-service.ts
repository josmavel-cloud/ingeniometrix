import path from "node:path";

import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import type {
  CanonicalContentBlock,
  CanonicalReportDocument,
  CanonicalSectionNode,
} from "@/server/reporting/canonical-report-types";
import { writeCanonicalReportDocxFile } from "@/server/reporting/docx/render-canonical-report-docx";

const FINAL_PROMPT_VERSION = "ingeniometrix-mvp-final-docx-v1";

function asObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function truncate(value: string | null | undefined, max = 420) {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90);
}

function paragraph(id: string, value: string): CanonicalContentBlock {
  return { id, kind: "paragraph", text: value };
}

function bullets(id: string, items: string[]): CanonicalContentBlock {
  return { id, kind: "bullet_list", items };
}

function table(
  id: string,
  title: string,
  rows: string[][],
  note?: string,
): CanonicalContentBlock {
  return {
    id,
    kind: "table",
    table: {
      caption: {
        label: "Tabla",
        title,
        note,
        source_label: "Elaboración propia con base en las fuentes seleccionadas e intake del proyecto.",
        position: "top",
      },
      numbered: true,
      rows: rows.map((cells) => ({ cells: cells.map((cell) => ({ text: cell })) })),
    },
  };
}

function equation(id: string, latex: string, label: string): CanonicalContentBlock {
  return {
    id,
    kind: "equation",
    equation: {
      latex,
      label,
      numbered: true,
      alignment: "center",
    },
  };
}

type SelectedSource = {
  sourceId: string;
  citationId: string;
  order: number;
  title: string;
  year: number | null;
  doi: string | null;
  venue: string | null;
  abstract: string | null;
  landingPageUrl: string | null;
  citationCount: number | null;
  language: string | null;
  hasPdfSignal: boolean;
  isOpenAccess: boolean;
};

function sourceLabel(source: SelectedSource) {
  return `[${source.citationId}]`;
}

function sourceText(source: SelectedSource) {
  const parts = [
    source.title,
    source.year ? `(${source.year})` : "(s. f.)",
    source.venue ? source.venue : null,
    source.doi ? `doi:${source.doi}` : null,
    !source.doi && source.landingPageUrl ? source.landingPageUrl : null,
  ].filter(Boolean);
  return parts.join(". ");
}

function buildReferenceQuality(source: SelectedSource) {
  const signals = [
    source.doi ? "DOI disponible" : "sin DOI en OpenAlex",
    source.hasPdfSignal ? "PDF/señal de texto completo disponible" : "sin PDF verificado en descubrimiento",
    source.isOpenAccess ? "acceso abierto reportado" : "acceso abierto no confirmado",
    source.abstract ? "resumen disponible" : "sin resumen disponible",
    source.citationCount != null ? `${source.citationCount} citas OpenAlex` : null,
  ].filter(Boolean);
  return `${sourceLabel(source)} ${signals.join("; ")}.`;
}

function buildEvidenceFindings(sources: SelectedSource[]) {
  return sources.map((source) => {
    const summary = truncate(source.abstract, 360) || "La fuente fue seleccionada por alineación temática y debe inspeccionarse a texto completo antes de citar hallazgos específicos.";
    return `${sourceLabel(source)} ${summary}`;
  });
}

function buildSections(input: {
  project: { title: string; program: string; country: string; language: string };
  intake: {
    topic: string;
    problemContext: string | null;
    researchLine: string | null;
    targetPopulation: string | null;
    availableData: string | null;
    preferredMethodology: string | null;
    academicConstraints: string | null;
    advisorNotes: string | null;
  };
  sources: SelectedSource[];
}): CanonicalSectionNode[] {
  const { intake, sources } = input;
  const primaryLocal = sources.filter((source) => source.language === "es").slice(0, 2);
  const methodSources = sources.filter((source) => /FORM|reliability|confiabilidad|Bayesian|probabilistic|probabil/i.test(source.title));
  const sourceRefs = sources.map(sourceLabel).join(", ");
  const evidenceFindings = buildEvidenceFindings(sources);

  return [
    {
      id: "sec-resumen",
      title: "Resumen ejecutivo",
      level: 1,
      semantic_key: "executive_summary",
      blocks: [
        paragraph(
          "resumen-1",
          `Este documento presenta un plan académico trazable para estudiar ${intake.topic}. El alcance se formula como una guía de investigación aplicada, no como una tesis completa ni como sustituto de asesoría metodológica, estructural o normativa. La propuesta integra evidencia local y técnica seleccionada por el usuario (${sourceRefs}) y organiza el problema, objetivos, método, matriz de consistencia y ruta de ejecución para un entregable defendible.`,
        ),
        paragraph(
          "resumen-2",
          `La decisión metodológica recomendada es una evaluación de confiabilidad estructural con inspección documental, modelamiento estructural, definición probabilística de variables críticas y estimación de indicadores de seguridad/reliability index. La validación debe apoyarse en datos disponibles, monitoreo o registros técnicos cuando existan, y debe dejar explícitas las hipótesis que no puedan verificarse en campo.`,
        ),
      ],
      children: [],
    },
    {
      id: "sec-introduccion",
      title: "Planteamiento del problema",
      level: 1,
      semantic_key: "problem_statement",
      blocks: [
        paragraph(
          "intro-contexto",
          intake.problemContext ||
            "El problema se ubica en la necesidad de evaluar de manera probabilística la seguridad y desempeño de infraestructura vial esencial sometida a incertidumbres de demanda, capacidad, deterioro y amenaza sísmica.",
        ),
        paragraph(
          "intro-gap",
          `Las fuentes locales seleccionadas muestran que la confiabilidad estructural aplicada a puentes en acero puede apoyar decisiones de diagnóstico, rehabilitación y priorización institucional ${primaryLocal.map(sourceLabel).join(" y ") || sourceRefs}. Sin embargo, para el caso de un puente vehicular esencial tipo Warren en zona sísmica peruana, el reto académico consiste en conectar esa evidencia con un protocolo reproducible, datos disponibles y supuestos explícitos.`,
        ),
        table("tabla-problema", "Síntesis del problema investigable", [
          ["Elemento", "Formulación operativa"],
          ["Objeto de estudio", intake.targetPopulation || "Puente vehicular esencial de armadura metálica tipo Warren"],
          ["Fenómeno crítico", "Confiabilidad estructural bajo incertidumbre de cargas, capacidad, deterioro y demanda sísmica"],
          ["Brecha", "Falta de una ruta trazable que conecte inspección, modelamiento, variables probabilísticas e indicadores de confiabilidad para toma de decisiones"],
          ["Producto académico", "Plan de investigación con matriz de consistencia, método, variables, cronograma y evidencia base"],
        ]),
      ],
      children: [],
    },
    {
      id: "sec-objetivos",
      title: "Objetivos y preguntas de investigación",
      level: 1,
      semantic_key: "objectives",
      blocks: [
        paragraph(
          "objetivo-general",
          `Objetivo general: Diseñar una estrategia metodológica para evaluar la confiabilidad estructural de ${intake.targetPopulation || "un puente vehicular esencial de armadura metálica tipo Warren"}, integrando evidencia documental, parámetros estructurales relevantes e incertidumbres asociadas a desempeño sísmico y capacidad resistente.`,
        ),
        bullets("objetivos-especificos", [
          "Caracterizar el sistema estructural, condiciones de servicio, exposición sísmica y datos disponibles para el caso de estudio.",
          "Identificar variables aleatorias críticas de demanda, capacidad, deterioro e incertidumbre de modelamiento.",
          "Definir un esquema de análisis de confiabilidad aplicable a elementos y/o sistema estructural, priorizando trazabilidad y reproducibilidad.",
          "Establecer criterios de interpretación para apoyar decisiones de mantenimiento, rehabilitación o estudios posteriores.",
        ]),
        table("tabla-preguntas", "Preguntas orientadoras", [
          ["Nivel", "Pregunta"],
          ["General", "¿Cómo estructurar una evaluación de confiabilidad para un puente metálico esencial tipo Warren en zona sísmica?"],
          ["Específica 1", "¿Qué información mínima se requiere para caracterizar demanda, capacidad y estado estructural?"],
          ["Específica 2", "¿Qué variables deben tratarse probabilísticamente y cuáles pueden mantenerse como supuestos determinísticos iniciales?"],
          ["Específica 3", "¿Cómo traducir los resultados de confiabilidad en decisiones técnicas y académicamente justificadas?"],
        ]),
      ],
      children: [],
    },
    {
      id: "sec-evidencia",
      title: "Base de evidencia seleccionada",
      level: 1,
      semantic_key: "evidence_base",
      blocks: [
        paragraph(
          "evidencia-alcance",
          "La evidencia se usa como soporte de planificación académica. Las afirmaciones sustantivas deben verificarse en texto completo durante una inspección documental extendida antes de pasar a una versión final citable. En esta versión MVP, cada fuente queda marcada por su aporte principal y por señales de salud bibliográfica.",
        ),
        table("tabla-fuentes", "Fuentes seleccionadas y uso previsto", [
          ["ID", "Fuente", "Uso previsto"],
          ...sources.map((source) => [
            sourceLabel(source),
            `${source.title}${source.year ? ` (${source.year})` : ""}`,
            source.language === "es"
              ? "Contexto latinoamericano/local sobre puentes en acero, monitoreo, capacidad y confiabilidad"
              : /FORM|SYSREL|system reliability/i.test(source.title)
                ? "Soporte metodológico para confiabilidad de sistemas, FORM y modelamiento probabilístico"
                : "Soporte complementario para monitoreo, daño, incertidumbre y diagnóstico de armaduras metálicas",
          ]),
        ]),
        table("tabla-salud", "Inspección limitada/source health", [
          ["ID", "Señales verificadas"],
          ...sources.map((source) => [sourceLabel(source), buildReferenceQuality(source)]),
        ]),
        bullets("hallazgos-evidencia", evidenceFindings),
      ],
      children: [],
    },
    {
      id: "sec-marco",
      title: "Marco conceptual y técnico propuesto",
      level: 1,
      semantic_key: "conceptual_framework",
      blocks: [
        paragraph(
          "marco-1",
          `La confiabilidad estructural permite representar explícitamente incertidumbres de resistencia, demanda, deterioro y modelo. En puentes metálicos, la evidencia seleccionada sugiere que la evaluación puede beneficiarse de monitoreo, pruebas de carga, identificación dinámica, modelos probabilísticos y análisis de sistema ${sources.slice(0, 3).map(sourceLabel).join(", ")}.`,
        ),
        paragraph(
          "marco-2",
          "Para un puente tipo Warren, el marco debe distinguir entre desempeño global del sistema y desempeño de elementos críticos: cordones, diagonales, montantes, conexiones, apoyos y tablero. Esta distinción evita que una verificación aislada de un elemento se interprete como seguridad integral del puente.",
        ),
        equation("eq-limite", String.raw`g(X)=R(X)-S(X)`, "Función de estado límite básica"),
        paragraph(
          "marco-3",
          "Donde R(X) representa capacidad resistente aleatoria y S(X) representa demanda aleatoria. La falla se asocia con g(X) ≤ 0. El índice de confiabilidad β o la probabilidad de falla Pf deben interpretarse según el nivel de información disponible y las consecuencias de servicio de la infraestructura esencial.",
        ),
      ],
      children: [],
    },
    {
      id: "sec-metodologia",
      title: "Diseño metodológico recomendado",
      level: 1,
      semantic_key: "methodology",
      blocks: [
        paragraph(
          "metodo-1",
          intake.preferredMethodology ||
            "Se recomienda un enfoque cuantitativo, aplicado y explicativo, articulado como estudio de caso con modelamiento estructural y análisis probabilístico de confiabilidad.",
        ),
        table("tabla-metodo", "Ruta metodológica", [
          ["Fase", "Actividad", "Salida verificable"],
          ["1. Delimitación", "Definir tramo, tipología, criticidad vial, amenaza sísmica y unidad de análisis", "Ficha técnica del caso y criterios de alcance"],
          ["2. Inventario de datos", "Reunir planos, inspecciones, aforos, materiales, cargas, registros de mantenimiento y fuentes normativas", "Matriz de disponibilidad y calidad de datos"],
          ["3. Modelo estructural", "Construir o adaptar modelo analítico/numérico; identificar elementos críticos", "Modelo documentado y supuestos de frontera"],
          ["4. Variables aleatorias", "Asignar distribuciones o rangos a resistencia, demanda, deterioro, conexión y demanda sísmica", "Diccionario probabilístico de variables"],
          ["5. Confiabilidad", "Aplicar FORM, simulación Monte Carlo u otro método justificado según datos y complejidad", "β, Pf o métricas equivalentes por elemento/sistema"],
          ["6. Interpretación", "Comparar escenarios y priorizar decisiones técnicas", "Recomendaciones de mantenimiento, refuerzo o estudios adicionales"],
        ]),
        paragraph(
          "metodo-2",
          `Las fuentes metodológicas seleccionadas ${methodSources.map(sourceLabel).join(", ") || sourceRefs} justifican trabajar con modelos probabilísticos y, cuando sea pertinente, con métodos de confiabilidad de primer orden o enfoques bayesianos/SHM. La elección final debe depender de la disponibilidad de datos y de la exigencia institucional del programa académico.`,
        ),
      ],
      children: [],
    },
    {
      id: "sec-matriz",
      title: "Matriz de consistencia preliminar",
      level: 1,
      semantic_key: "consistency_matrix",
      blocks: [
        table("tabla-consistencia", "Matriz de consistencia", [
          ["Problema", "Objetivo", "Variable/categoría", "Indicador", "Fuente de datos"],
          ["Incertidumbre sobre seguridad estructural", "Evaluar confiabilidad del sistema/elementos", "Confiabilidad estructural", "β, Pf, margen de seguridad", "Modelo estructural, inspección, literatura"],
          ["Datos incompletos de demanda y capacidad", "Caracterizar variables críticas", "Demanda/capacidad", "Cargas, resistencia, deterioro, amenaza sísmica", "Planos, ensayos, aforos, normas"],
          ["Necesidad de priorización técnica", "Interpretar resultados para decisión", "Riesgo técnico", "Escenario base vs. escenarios de intervención", "Resultados de análisis y juicio experto"],
        ]),
      ],
      children: [],
    },
    {
      id: "sec-plan",
      title: "Plan de trabajo, riesgos y controles éticos",
      level: 1,
      semantic_key: "work_plan",
      blocks: [
        table("tabla-cronograma", "Cronograma referencial", [
          ["Mes", "Actividad principal", "Entregable"],
          ["1", "Revisión documental, alcance y ficha del puente", "Protocolo y matriz de fuentes"],
          ["2", "Inventario técnico y definición de variables", "Matriz de datos y supuestos"],
          ["3", "Modelo estructural base y escenarios", "Modelo calibrado preliminar"],
          ["4", "Análisis de confiabilidad", "Resultados β/Pf por escenario"],
          ["5", "Discusión, sensibilidad y recomendaciones", "Capítulos de resultados/discusión"],
          ["6", "Revisión, trazabilidad y entrega", "Documento académico final"],
        ]),
        bullets("riesgos", [
          "Riesgo de datos insuficientes: mitigar con escenarios, supuestos explícitos y análisis de sensibilidad.",
          "Riesgo de extrapolar fuentes de otros países: distinguir evidencia contextual de evidencia metodológica.",
          "Riesgo ético de presentar resultados no verificados como diagnóstico real: rotular el producto como planificación académica hasta completar inspección técnica formal.",
          "Riesgo de dependencia excesiva del modelo: mantener trazabilidad fuente-sección y revisión humana experta.",
        ]),
      ],
      children: [],
    },
    {
      id: "sec-conclusiones",
      title: "Conclusiones operativas",
      level: 1,
      semantic_key: "operational_conclusions",
      blocks: [
        bullets("conclusiones", [
          "El caso es académicamente viable si se delimita como evaluación de confiabilidad aplicada y no como diagnóstico definitivo de seguridad sin datos de campo.",
          "La combinación de fuentes locales en español y fuentes metodológicas internacionales mejora la pertinencia: las primeras conectan con puentes en acero y monitoreo regional; las segundas aportan métodos probabilísticos transferibles.",
          "Antes de una versión final institucional, se recomienda ampliar inspección de texto completo, normalizar citas DOI/URL y completar datos técnicos del puente específico.",
        ]),
      ],
      children: [],
    },
  ];
}

function buildCanonicalDocument(input: {
  project: Awaited<ReturnType<typeof loadProjectForFinalDocx>>;
  sources: SelectedSource[];
}): CanonicalReportDocument {
  const { project, sources } = input;
  if (!project?.intake) {
    throw new Error("Proyecto sin intake para generar DOCX final.");
  }

  const intake = project.intake;
  const title = intake.topic || project.title;
  const now = new Date();
  const references = sources.map((source) => ({
    id: source.citationId,
    text: sourceText(source),
    synthetic: false,
  }));

  return {
    document_id: `imx-final-${project.id}`,
    document_kind: "thesis_plan",
    derivation: {
      template_version_id: "mvp-direct-canonical-v1",
      template_key: "INGENIOMETRIX_MVP_UNICO",
      template_family: "ingeniometrix_mvp_backend_first",
      source_kind: "blueprint",
      synthetic: false,
    },
    language: project.language || "es",
    institution: {
      university_name: project.university ?? "",
      school_name: null,
      program_name: project.program,
      mention: null,
      degree_level: project.degreeLevel,
      discipline_area: intake.researchLine ?? project.program,
    },
    presentation: {
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
        { level: 1, numbered: true, uppercase: true, numbering_format: "level_decimal", spacing_before_pt: 16, spacing_after_pt: 8 },
        { level: 2, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 12, spacing_after_pt: 6 },
        { level: 3, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 10, spacing_after_pt: 4 },
      ],
      paragraph: {
        font_family: "Times New Roman",
        font_size_pt: 12,
        line_spacing: 1.5,
        alignment: "justify",
        space_before_pt: 0,
        space_after_pt: 6,
        first_line_indent_cm: 1.25,
      },
      equation: {
        numbering: true,
        alignment: "center",
        reference_style: "parenthetical",
        numbering_format: "plain",
        label_prefix: "Ecuación",
      },
      table: {
        caption_position: "top",
        allow_vertical_lines: true,
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
        font_style: "inherit",
      },
      citation: {
        numbering: true,
        inline_style: "numeric",
      },
      reference_list: {
        numbering: true,
        ordering: "citation_order",
        heading_title: "Referencias",
        require_cited_only: true,
        doi_policy: "preferred",
      },
    },
    cover: {
      document_label: "Plan de investigación Ingeniometrix",
      fields: [
        { key: "university_name", label: "Universidad", value_type: "text", value: project.university },
        { key: "program", label: "Programa", value_type: "text", value: project.program },
        { key: "title", label: "Título", value_type: "text", value: title },
        { key: "document_type", label: "Tipo", value_type: "text", value: "Entregable único DOCX — MVP backend" },
        { key: "date", label: "Fecha", value_type: "date", value: now.toISOString().slice(0, 10) },
      ],
    },
    body: {
      sections: [
        ...buildSections({
          project,
          intake,
          sources,
        }),
        {
          id: "sec-referencias",
          title: "Referencias",
          level: 1,
          semantic_key: "references",
          blocks: [
            {
              id: "referencias-lista",
              kind: "reference_list",
              references,
            },
          ],
          children: [],
        },
      ],
    },
    references,
    annexes: [
      {
        id: "annex-traceability",
        title: "Anexo A. Trazabilidad de generación",
        blocks: [
          table("tabla-trazabilidad", "Registro mínimo de trazabilidad", [
            ["Campo", "Valor"],
            ["Proyecto", project.id],
            ["Prompt/version", FINAL_PROMPT_VERSION],
            ["Fuentes seleccionadas", sources.map(sourceLabel).join(", ")],
            ["Restricción ética", "Documento de planificación académica; requiere revisión experta antes de uso institucional"],
          ]),
        ],
      },
    ],
    assets: [],
    warnings: [
      "MVP backend-first: DOCX generado como único entregable Ingeniometrix, sin dependencia runtime de Lab A/B.",
      "Las fuentes sin DOI o sin PDF verificado requieren inspección bibliográfica adicional antes de citación final.",
    ],
  };
}

async function loadProjectForFinalDocx(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
      blueprintVersions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });
}

function mapSelectedSources(
  project: NonNullable<Awaited<ReturnType<typeof loadProjectForFinalDocx>>>,
): SelectedSource[] {
  return project.projectReferences.map((projectReference, index) => {
    const reference = projectReference.reference;
    const raw = asObject(reference.rawOpenAlexJson);
    const primaryLocation = asObject(raw?.primary_location);
    const openAccess = asObject(raw?.open_access);
    return {
      sourceId: reference.id,
      citationId: `S${index + 1}`,
      order: projectReference.selectedOrder ?? index + 1,
      title: reference.title,
      year: reference.year,
      doi: reference.doi,
      venue: reference.venue,
      abstract: reference.abstract,
      landingPageUrl: reference.landingPageUrl,
      citationCount: reference.citationCount,
      language: text(raw?.language, null as unknown as string) || null,
      hasPdfSignal: Boolean(text(primaryLocation?.pdf_url) || /\.pdf(\?|$)/i.test(reference.landingPageUrl ?? "")),
      isOpenAccess: Boolean(primaryLocation?.is_oa || openAccess?.is_oa),
    };
  });
}

export async function runMvpFinalDocxPipeline(input: {
  userId: string;
  projectId: string;
  outputRoot?: string;
}) {
  const project = await loadProjectForFinalDocx(input.userId, input.projectId);
  if (!project || !project.intake) {
    throw new Error("Proyecto no encontrado o sin intake.");
  }
  if (project.projectReferences.length === 0) {
    throw new Error("No hay fuentes seleccionadas para generar el entregable final.");
  }

  const sources = mapSelectedSources(project);
  const canonicalDocument = buildCanonicalDocument({ project, sources });
  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
  const blueprintJson = {
    kind: "ingeniometrix_mvp_final_blueprint",
    prompt_version: FINAL_PROMPT_VERSION,
    title: project.intake.topic || project.title,
    sections: canonicalDocument.body.sections.map((section) => ({
      id: section.id,
      title: section.title,
      semantic_key: section.semantic_key,
    })),
    references_used: sources.map((source) => ({
      reference_id: source.sourceId,
      citation_id: source.citationId,
      title: source.title,
      doi: source.doi,
    })),
    source_health: sources.map((source) => ({
      citation_id: source.citationId,
      doi: source.doi,
      language: source.language,
      has_pdf_signal: source.hasPdfSignal,
      is_open_access: source.isOpenAccess,
      landing_page_url: source.landingPageUrl,
    })),
    engine_warnings: canonicalDocument.warnings,
  };
  const coherenceReport = {
    status: "mvp_ready",
    checks: [
      { key: "selected_sources", ok: sources.length >= 3, detail: `${sources.length} fuentes seleccionadas.` },
      { key: "traceability", ok: true, detail: "Todas las fuentes usadas provienen de ProjectReference.selected." },
      { key: "single_docx", ok: true, detail: "Se genera un único DOCX Ingeniometrix." },
    ],
  };

  const blueprintVersion = await prisma.blueprintVersion.create({
    data: {
      projectId: project.id,
      versionNumber,
      model: "mvp-deterministic-canonical-v1",
      promptVersion: FINAL_PROMPT_VERSION,
      intakeSnapshotJson: {
        topic: project.intake.topic,
        problemContext: project.intake.problemContext,
        researchLine: project.intake.researchLine,
        academicConstraints: project.intake.academicConstraints,
        targetPopulation: project.intake.targetPopulation,
        availableData: project.intake.availableData,
        preferredMethodology: project.intake.preferredMethodology,
        advisorNotes: project.intake.advisorNotes,
        searchQuery: project.intake.searchQuery,
      },
      selectedReferencesSnapshotJson: project.projectReferences.map((item, index) => ({
        project_reference_id: item.id,
        selected_order: item.selectedOrder ?? index + 1,
        reference_id: item.reference.id,
        citation_id: `S${index + 1}`,
        title: item.reference.title,
        doi: item.reference.doi,
        authors: item.reference.authorsJson,
        year: item.reference.year,
        venue: item.reference.venue,
        abstract: item.reference.abstract,
      })),
      blueprintJson: blueprintJson as Prisma.InputJsonValue,
      coherenceReportJson: coherenceReport as Prisma.InputJsonValue,
      exportStatus: ExportStatus.READY,
    },
  });

  const outputDir = input.outputRoot ?? path.join(process.cwd(), "artifacts-local", "mvp-final-docx", project.id);
  const outputPath = path.join(
    outputDir,
    `${slugify(project.intake.topic || project.title || project.id)}-ingeniometrix.docx`,
  );
  await writeCanonicalReportDocxFile({ document: canonicalDocument, outputPath });

  await prisma.project.update({
    where: { id: project.id },
    data: { status: ProjectStatus.EXPORT_READY },
  });

  await logAuditEvent({
    eventType: "MVP_FINAL_DOCX_GENERATED",
    actorType: "SYSTEM",
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: project.id,
    payloadJson: {
      blueprintVersionId: blueprintVersion.id,
      outputPath,
      promptVersion: FINAL_PROMPT_VERSION,
      sourceCount: sources.length,
    },
  });

  return {
    ok: true,
    projectId: project.id,
    blueprintVersionId: blueprintVersion.id,
    outputPath,
    sourceCount: sources.length,
    warnings: canonicalDocument.warnings,
  };
}
