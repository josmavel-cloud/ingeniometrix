import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";
import { ActorType, ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import type {
  CanonicalContentBlock,
  CanonicalReportDocument,
  CanonicalSectionNode,
} from "@/server/reporting/canonical-report-types";
import { writeCanonicalReportDocxFile } from "@/server/reporting/docx/render-canonical-report-docx";
import {
  runMvpThesisPlanBlueprint,
  type ThesisPlanBlueprint,
  type ThesisPlanBlueprintSection,
} from "@/server/mvp/thesis-plan-blueprint-service";

export type ThesisPlanDocxQa = {
  artifact_type: "mvp_thesis_plan_docx_qa";
  artifact_version: "v1";
  generated_at: string;
  docx_path: string;
  passed: boolean;
  score_100: number;
  metrics: {
    section_count: number;
    table_count: number;
    reference_count: number;
    annex_count: number;
    equation_count: number;
    warning_count: number;
    word_estimate: number;
  };
  checks: Record<string, boolean>;
  failures: string[];
  warnings: string[];
};

export type ThesisPlanDocxResult = {
  artifact_type: "mvp_thesis_plan_docx";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  blueprint_run_id: string;
  blueprint_version_id: string | null;
  docx_path: string;
  canonical_json_path: string;
  qa_report_path: string;
  qa: ThesisPlanDocxQa;
  warnings: string[];
};

type LatestBlueprintVersion = NonNullable<Awaited<ReturnType<typeof loadLatestBlueprintVersion>>>;

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "plan-tesis";
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function para(id: string, text: string): CanonicalContentBlock {
  return { id, kind: "paragraph", text };
}

function bullets(id: string, items: string[]): CanonicalContentBlock {
  return { id, kind: "bullet_list", items };
}

function placeholder(id: string, text: string): CanonicalContentBlock {
  return { id, kind: "placeholder_note", text };
}

function table(id: string, title: string, rows: string[][], note?: string): CanonicalContentBlock {
  return {
    id,
    kind: "table",
    table: {
      numbered: true,
      caption: {
        label: "Tabla",
        title,
        note,
        source_label: "Fuente: elaboración propia con base en intake, readiness pack y fuentes seleccionadas.",
        position: "top",
      },
      rows: rows.map((row) => ({ cells: row.map((cell) => ({ text: cell })) })),
    },
  };
}

function equation(id: string, latex: string, label: string): CanonicalContentBlock {
  return {
    id,
    kind: "equation",
    equation: { latex, label, numbered: true, alignment: "center" },
  };
}

function refText(ref: ThesisPlanBlueprint["references"][number]) {
  const year = ref.year ? ` (${ref.year})` : " (s. f.)";
  const doi = ref.doi ? ` https://doi.org/${ref.doi}` : "";
  const venue = ref.venue ? ` ${ref.venue}.` : "";
  return `${ref.code}. ${ref.title}.${year}.${venue}${doi}`.replace(/\s+/g, " ").trim();
}

function sourcesByIds(blueprint: ThesisPlanBlueprint, ids: string[]) {
  const set = new Set(ids);
  return blueprint.references.filter((reference) => set.has(reference.source_id));
}

function citationList(blueprint: ThesisPlanBlueprint, ids: string[]) {
  const codes = sourcesByIds(blueprint, ids).map((reference) => reference.code);
  return codes.length ? codes.join(", ") : blueprint.references.slice(0, 3).map((reference) => reference.code).join(", ");
}

function sectionParagraphs(section: ThesisPlanBlueprintSection, blueprint: ThesisPlanBlueprint) {
  const ctx = blueprint.project_context;
  const cites = citationList(blueprint, section.source_ids);
  const topic = ctx.topic;
  const method = ctx.preferred_methodology || "un diseño metodológico aplicado, trazable y verificable";
  const target = ctx.target_population || "la unidad de análisis definida en el proyecto";
  const data = ctx.available_data || "datos documentales, técnicos y/o supuestos explícitos por validar";

  switch (section.key) {
    case "executive_summary":
      return [
        `Este plan de tesis propone estudiar ${topic}. El documento organiza el problema, los objetivos, el marco teórico preliminar, la metodología y los controles de trazabilidad necesarios para discutir la propuesta con un asesor académico. La base bibliográfica se apoya en fuentes seleccionadas y enriquecidas mediante OpenAlex, incluyendo abstracts, referencias cruzadas, trabajos relacionados y señales de disponibilidad de texto completo (${cites}).`,
        `El enfoque metodológico previsto es ${method}. Para el estado actual del MVP, el plan puede formularse con evidencia suficiente porque existen fuentes con abstracts, señales de texto completo y una red bibliográfica amplia. No obstante, el marco teórico final deberá completarse con lectura de full text para las fuentes centrales marcadas como pendientes.`,
      ];
    case "problem_statement":
      return [
        clean(ctx.problem_context) || `El problema se ubica en la necesidad de evaluar de manera rigurosa ${target}, considerando incertidumbres técnicas, disponibilidad de datos y criterios de decisión académicamente verificables.`,
        `La brecha investigativa consiste en articular la literatura sobre confiabilidad estructural, modelos probabilísticos, fatiga/sismo y evaluación de puentes con un procedimiento aplicable al caso definido. Las fuentes seleccionadas muestran valor teórico y metodológico, pero deben traducirse en variables, fases y criterios de análisis coherentes (${cites}).`,
        `Pregunta general propuesta: ¿cómo estructurar un plan metodológico para evaluar la confiabilidad estructural de ${target}, usando ${data} y manteniendo trazabilidad entre problema, objetivos, variables, método y evidencia?`,
      ];
    case "justification":
      return [
        `La justificación teórica radica en conectar conceptos de confiabilidad estructural, incertidumbre, demanda, capacidad y probabilidad de falla con una unidad de análisis concreta. Esta articulación permite convertir literatura técnica en un marco preliminar de investigación, sin afirmar todavía resultados empíricos no obtenidos.`,
        `La justificación metodológica se sostiene en que ${method} permite ordenar variables, supuestos, datos requeridos y criterios de interpretación. La propuesta favorece reproducibilidad porque cada decisión queda vinculada con fuentes, intake y advertencias de evidencia.`,
        `La justificación práctica se relaciona con la posible utilidad del plan para orientar diagnósticos, priorización, mantenimiento o investigaciones posteriores sobre infraestructura esencial. El documento mantiene alcance académico: no sustituye inspección profesional, diseño normativo ni dictamen estructural.`,
      ];
    case "objectives":
      return [
        `El objetivo general es diseñar una ruta metodológica para evaluar ${topic}, integrando evidencia bibliográfica, datos disponibles, variables críticas y criterios de confiabilidad.`,
        `Los objetivos específicos deben permitir: caracterizar el caso de estudio; identificar variables de demanda, capacidad y condición; definir el procedimiento de análisis; interpretar indicadores; y documentar limitaciones, riesgos y necesidades de full text para fases posteriores.`,
      ];
    case "hypotheses_or_assumptions":
      return [
        `Como plan preliminar, se recomienda formular supuestos de trabajo antes que conclusiones fuertes. Un supuesto central es que la confiabilidad estructural de ${target} puede evaluarse mediante una combinación de revisión documental, definición probabilística de variables y cálculo de indicadores de seguridad.`,
        `Si el enfoque se formaliza como cuantitativo, la hipótesis podrá expresar que la incorporación explícita de incertidumbres de demanda y capacidad modifica la estimación de seguridad respecto a una evaluación determinista. Si el enfoque se mantiene aplicado/metodológico, el criterio de éxito será la consistencia y reproducibilidad del procedimiento.`,
      ];
    case "preliminary_theoretical_framework":
      return [
        `El marco teórico preliminar debe organizar tres núcleos: confiabilidad estructural, evaluación de puentes metálicos y métodos probabilísticos de análisis. En esta etapa se permite usar abstracts y red bibliográfica para delimitar conceptos, tendencias y brechas, siempre que se marque qué fuentes requieren lectura completa posterior (${cites}).`,
        `Las fuentes con rol teórico y estado del arte ayudan a ubicar antecedentes sobre fatiga, confiabilidad y sensibilidad. Las fuentes metodológicas apoyan la selección de técnicas como FORM, simulación Monte Carlo, muestreo o enfoques bayesianos cuando correspondan al alcance del proyecto.`,
        `Advertencia editorial: este apartado no debe presentarse como marco teórico final. Antes de redactar una tesis final, las fuentes centrales cerradas o abstract-only deberán obtenerse por vías autorizadas, reemplazarse o reclasificarse como contexto.`,
      ];
    case "variables_or_constructs":
      return [
        `Las variables/categorías preliminares deben derivarse del problema y del método: confiabilidad estructural, demanda, capacidad, condición estructural, incertidumbre y criterio de desempeño. Cada variable requiere definición conceptual, definición operacional, dimensión, indicador y fuente de datos.`,
        `El objetivo de esta sección no es cerrar definitivamente el modelo, sino construir una matriz revisable que permita discutir factibilidad con el asesor y detectar datos faltantes.`,
      ];
    case "methodology":
      return [
        `La metodología propuesta se estructura como investigación aplicada con componente documental, analítico y de modelamiento. El procedimiento debe iniciar con revisión bibliográfica y depuración de fuentes, continuar con caracterización del caso y definición de variables, y culminar con análisis de confiabilidad e interpretación de resultados.`,
        `El diseño debe explicar cómo ${data} se transformarán en entradas para el análisis. También debe documentar supuestos, escenarios, límites de validez y criterios de control. Las fuentes metodológicas seleccionadas orientan esta fase (${cites}).`,
        `Para mantener rigor, el plan debe incluir validación interna mediante matriz de consistencia, revisión de sensibilidad, trazabilidad de fuentes y advertencias sobre datos no confirmados.`,
      ];
    case "consistency_matrix":
      return [
        `La matriz de consistencia verifica que el problema, objetivos, hipótesis o supuestos, variables, indicadores y método se sostengan mutuamente. En el DOCX se incluye una versión inicial que deberá revisarse con el asesor antes de ejecutar la tesis.`,
      ];
    case "schedule":
      return [
        `El cronograma distribuye actividades en fases secuenciales y parcialmente solapadas: revisión bibliográfica, caracterización de datos, definición de variables, análisis, validación, discusión y redacción. Es una línea base revisable.`,
      ];
    case "budget_resources":
      return [
        `El presupuesto se presenta con supuestos preliminares porque el costo real depende del acceso a datos, software, ensayos, bibliografía y asesoría. No deben inventarse montos exactos si la universidad o el usuario no los proporcionan.`,
      ];
    case "risks_ethics_limitations":
      return [
        `Los riesgos principales son disponibilidad limitada de datos, falta de full text en fuentes centrales, complejidad del modelo y sobreinterpretación de resultados. Cada riesgo debe asociarse con mitigación: reemplazo de fuentes, supuestos explícitos, simplificación del alcance y revisión con asesor.`,
        `Ética y alcance: el documento es un plan de tesis y no constituye diagnóstico estructural ni recomendación de intervención. Cualquier decisión técnica sobre infraestructura real requiere validación profesional, datos verificables y cumplimiento normativo.`,
      ];
    case "references":
      return [
        `Las referencias listadas corresponden a las fuentes seleccionadas y enriquecidas para el plan. Pueden ampliarse con referencias cruzadas del graph OpenAlex o Deep Research ligero si el asesor solicita mayor cobertura teórica o metodológica.`,
      ];
    case "traceability_annexes":
      return [
        `Los anexos de trazabilidad documentan el rol de cada fuente, profundidad de evidencia, advertencias y uso permitido. Esta capa evita confundir abstract, metadata, full text y lectura final.`,
      ];
    default:
      return [
        `Esta sección cumple el propósito definido en el contrato académico: ${section.purpose}. Debe redactarse manteniendo trazabilidad con intake, readiness pack y fuentes seleccionadas.`,
      ];
  }
}

function blocksForSection(section: ThesisPlanBlueprintSection, blueprint: ThesisPlanBlueprint): CanonicalContentBlock[] {
  const blocks: CanonicalContentBlock[] = sectionParagraphs(section, blueprint).map((text, index) => para(`${section.key}-p${index + 1}`, text));
  if (section.required_content.length > 0) {
    blocks.push(bullets(`${section.key}-required`, section.required_content.map((item) => `Contenido requerido: ${item}.`)));
  }

  const tables = blueprint.core_tables;
  if (section.key === "objectives") blocks.push(table("tbl-objectives", "Objetivos del plan de tesis", tables.objectives));
  if (section.key === "variables_or_constructs") blocks.push(table("tbl-variables", "Matriz preliminar de variables/categorías", tables.variables));
  if (section.key === "methodology") {
    blocks.push(table("tbl-methodology", "Fases metodológicas preliminares", tables.methodology_phases));
    blocks.push(equation("eq-factor-safety", String.raw`FS = \frac{R}{S}`, "1"));
    blocks.push(equation("eq-response-ratio", String.raw`R = \frac{\sigma}{\varepsilon}`, "2"));
    blocks.push(equation("eq-natural-frequency", String.raw`\omega_n = \sqrt{\frac{k}{m}}`, "3"));
  }
  if (section.key === "consistency_matrix") blocks.push(table("tbl-consistency", "Matriz de consistencia preliminar", tables.consistency_matrix));
  if (section.key === "schedule") blocks.push(table("tbl-schedule", "Cronograma referencial tipo Gantt", tables.schedule));
  if (section.key === "budget_resources") blocks.push(table("tbl-budget", "Presupuesto y recursos preliminares", tables.budget));
  if (section.key === "risks_ethics_limitations") blocks.push(table("tbl-risks", "Riesgos, impacto y mitigación", tables.risks));
  if (section.key === "references") {
    blocks.push({ kind: "reference_list", id: "refs-selected", references: blueprint.references.map((ref) => ({ id: ref.source_id, text: refText(ref) })) });
  }
  if (section.warnings.length > 0) blocks.push(placeholder(`${section.key}-warnings`, `Advertencia: ${section.warnings.join(" ")}`));
  return blocks;
}

function buildCanonicalDocument(blueprint: ThesisPlanBlueprint): CanonicalReportDocument {
  const sections: CanonicalSectionNode[] = blueprint.sections.map((section) => ({
    id: `sec-${section.key}`,
    title: section.title,
    level: 1,
    semantic_key: section.key,
    blocks: blocksForSection(section, blueprint),
    children: [],
  }));

  return {
    document_id: blueprint.run_id,
    document_kind: "thesis_plan",
    derivation: {
      template_version_id: blueprint.persisted_blueprint_version_id ?? blueprint.run_id,
      template_key: "INGENIOMETRIX_MVP_THESIS_PLAN",
      template_family: "ingeniometrix-mvp",
      source_kind: "blueprint",
      synthetic: false,
      not_for_academic_use: false,
    },
    language: "es",
    institution: {
      university_name: blueprint.project_context.university,
      program_name: blueprint.project_context.program,
      degree_level: blueprint.project_context.degree_level,
      discipline_area: blueprint.project_context.research_line,
    },
    presentation: {
      page: { paper_size: "A4", margin_left_cm: 3, margin_right_cm: 2.5, margin_top_cm: 2.5, margin_bottom_cm: 2.5, page_numbering: true, page_number_position: "bottom_center" },
      titles: [{ level: 1, numbered: true, uppercase: false, numbering_format: "level_decimal", spacing_before_pt: 14, spacing_after_pt: 8 }],
      paragraph: { font_family: "Times New Roman", font_size_pt: 12, line_spacing: 1.5, alignment: "justify", space_after_pt: 6, first_line_indent_cm: 1.25 },
      equation: { numbering: true, alignment: "center", reference_style: "parenthetical", numbering_format: "plain", label_prefix: "E" },
      table: { caption_position: "top", allow_vertical_lines: true, numbering: true, source_note_required: true, note_position: "bottom", numbering_format: "plain", label: "Tabla" },
      figure: { caption_position: "bottom", numbering: true, source_note_required: true, note_position: "bottom", numbering_format: "plain", label: "Figura" },
      caption: { prefix_style: "label_period_title", separator: " ", font_style: "bold" },
      citation: { numbering: true, inline_style: "numeric" },
      reference_list: { numbering: false, ordering: "manual", heading_title: "Referencias", require_cited_only: false, doi_policy: "preferred" },
    },
    cover: {
      document_label: "Plan de tesis preliminar Ingeniometrix",
      fields: [
        { key: "university_name", label: "Universidad", value_type: "text", value: blueprint.project_context.university },
        { key: "program", label: "Programa", value_type: "text", value: blueprint.project_context.program },
        { key: "title", label: "Título", value_type: "text", value: blueprint.project_context.title },
        { key: "topic", label: "Tema", value_type: "text", value: blueprint.project_context.topic },
        { key: "date", label: "Fecha", value_type: "date", value: new Date().toISOString().slice(0, 10) },
      ],
    },
    body: { sections },
    references: blueprint.references.map((ref) => ({ id: ref.source_id, text: refText(ref) })),
    annexes: [
      {
        id: "annex-traceability",
        title: "Anexo A. Trazabilidad de fuentes y uso permitido",
        blocks: [
          table("tbl-traceability", "Matriz de trazabilidad de fuentes", blueprint.core_tables.traceability),
          placeholder("traceability-warning", blueprint.warnings.join(" ") || "Sin advertencias adicionales."),
        ],
      },
    ],
    assets: [],
    warnings: blueprint.warnings,
  };
}

async function loadLatestBlueprintVersion(projectId: string) {
  return prisma.blueprintVersion.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

function decodeXmlText(value: string) {
  return value
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<w:p[\s\S]*?>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function qaDocx(docxPath: string, blueprint: ThesisPlanBlueprint): Promise<ThesisPlanDocxQa> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) failures.push("No se encontró word/document.xml.");
  const text = decodeXmlText(documentXml ?? "");
  const tableCount = (documentXml?.match(/<w:tbl[\s>]/g) ?? []).length;
  const equationCount = (documentXml?.match(/<m:oMath/g) ?? []).length;
  const sectionCount = blueprint.sections.filter((section) => text.includes(section.title)).length;
  const referenceCount = blueprint.references.filter((reference) => text.includes(reference.title.slice(0, Math.min(30, reference.title.length)))).length;
  const wordEstimate = text.split(/\s+/).filter(Boolean).length;
  const checks = {
    zip_readable: true,
    has_document_xml: Boolean(documentXml),
    has_cover_text: /Plan de tesis preliminar Ingeniometrix/i.test(text),
    min_section_count_pass: sectionCount >= 15,
    min_table_count_pass: tableCount >= 8,
    has_references: text.includes("Referencias") && referenceCount >= 5,
    has_traceability_annex: text.includes("Anexo A") && text.includes("Trazabilidad"),
    has_equations: equationCount >= 3,
    has_warnings_policy: text.includes("full text") || text.includes("marco teórico final"),
    no_markdown_fences: !text.includes("```)"),
    sufficient_word_estimate: wordEstimate >= 1800,
  };
  for (const [key, passed] of Object.entries(checks)) if (!passed) failures.push(`Check falló: ${key}`);
  if (blueprint.warnings.length > 0) warnings.push(...blueprint.warnings);
  const passedCount = Object.values(checks).filter(Boolean).length;
  return {
    artifact_type: "mvp_thesis_plan_docx_qa",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    docx_path: docxPath,
    passed: failures.length === 0,
    score_100: Math.round((passedCount / Object.keys(checks).length) * 100),
    metrics: { section_count: sectionCount, table_count: tableCount, reference_count: referenceCount, annex_count: text.includes("Anexo A") ? 1 : 0, equation_count: equationCount, warning_count: blueprint.warnings.length, word_estimate: wordEstimate },
    checks,
    failures,
    warnings,
  };
}

export async function runMvpThesisPlanDocx(input: { userId: string; projectId: string; runId?: string }) {
  const runId = input.runId ?? `mvp-thesis-plan-docx-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-thesis-plan-docx", input.projectId, runId);
  await mkdir(artifactDir, { recursive: true });

  let latest = await loadLatestBlueprintVersion(input.projectId);
  if (!latest) {
    const blueprint = await runMvpThesisPlanBlueprint({ userId: input.userId, projectId: input.projectId });
    if (!blueprint.persisted_blueprint_version_id) throw new Error("No se pudo persistir blueprint para DOCX.");
    latest = await loadLatestBlueprintVersion(input.projectId) as LatestBlueprintVersion;
  }

  const blueprint = latest.blueprintJson as unknown as ThesisPlanBlueprint;
  const canonical = buildCanonicalDocument(blueprint);
  const canonicalJsonPath = path.join(artifactDir, "canonical-thesis-plan-document.json");
  const docxPath = path.join(artifactDir, `${slug(blueprint.project_context.title)}-plan-tesis-ingeniometrix.docx`);
  await writeFile(canonicalJsonPath, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
  await writeCanonicalReportDocxFile({ document: canonical, outputPath: docxPath });
  const qa = await qaDocx(docxPath, blueprint);
  const qaReportPath = path.join(artifactDir, "docx-qa-report.json");
  await writeFile(qaReportPath, `${JSON.stringify(qa, null, 2)}\n`, "utf8");

  await prisma.blueprintVersion.update({ where: { id: latest.id }, data: { exportStatus: qa.passed ? ExportStatus.READY : ExportStatus.FAILED } });
  await prisma.project.update({ where: { id: input.projectId }, data: { status: qa.passed ? ProjectStatus.EXPORT_READY : ProjectStatus.BLUEPRINT_READY } });
  await logAuditEvent({
    eventType: "MVP_THESIS_PLAN_DOCX_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: { run_id: runId, artifact_dir: artifactDir, blueprint_version_id: latest.id, docx_path: docxPath, qa_passed: qa.passed, qa_score_100: qa.score_100 } as Prisma.InputJsonValue,
  });

  return {
    artifact_type: "mvp_thesis_plan_docx" as const,
    artifact_version: "v1" as const,
    generated_at: new Date().toISOString(),
    project_id: input.projectId,
    run_id: runId,
    artifact_dir: artifactDir,
    blueprint_run_id: blueprint.run_id,
    blueprint_version_id: latest.id,
    docx_path: docxPath,
    canonical_json_path: canonicalJsonPath,
    qa_report_path: qaReportPath,
    qa,
    warnings: blueprint.warnings,
  } satisfies ThesisPlanDocxResult;
}
