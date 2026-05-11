import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Math as DocxMath,
  MathFraction,
  MathRun,
  MathSubScript,
  MathSuperScript,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
  type IRunOptions,
} from "docx";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { validateDocxPackage } from "@/server/blueprint-v2/lab/docx-qa-engine";
import {
  buildMvpApiUsageReport,
  captureMvpApiUsageSnapshot,
} from "@/server/mvp/api-usage-service";
import { withLlmUsageContext } from "@/server/llm-usage-registry";

const PROMPT_VERSION = "ingeniometrix-mvp-advanced-thesis-plan-v1";
const FONT = "Times New Roman";
const ACCENT = "8B5E34";
const DARK = "1F2937";
const LIGHT = "F3EFE8";
const BORDER = "9CA3AF";

type Source = {
  id: string;
  code: string;
  title: string;
  year: number | null;
  doi: string | null;
  venue: string | null;
  abstract: string | null;
  landingPageUrl: string | null;
  language: string | null;
  hasPdfSignal: boolean;
  isOpenAccess: boolean;
};

type ProjectWithData = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

function cm(value: number) {
  return Math.round(value * 566.93);
}

function pt(value: number) {
  return Math.round(value * 2);
}

function twip(value: number) {
  return Math.round(value * 20);
}

function clean(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 100);
}

function rawObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textRun(text: string, options: Partial<IRunOptions> = {}) {
  return new TextRun({ font: FONT, size: pt(12), text, ...options });
}

function smallRun(text: string, options: Partial<IRunOptions> = {}) {
  return new TextRun({ font: FONT, size: pt(10), text, ...options });
}

function paragraph(text: string, options: { bold?: boolean; italic?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number; indent?: boolean } = {}) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: twip(options.spacingAfter ?? 6) },
    indent: { firstLine: options.indent === false ? 0 : cm(1.25) },
    children: [textRun(text, { bold: options.bold, italics: options.italic })],
  });
}

function heading(text: string, level: 1 | 2 | 3) {
  const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({
    heading: headingLevel,
    spacing: { before: twip(level === 1 ? 16 : 10), after: twip(6) },
    indent: { firstLine: 0 },
    children: [textRun(text, { bold: true, size: pt(level === 1 ? 14 : 12), color: DARK })],
  });
}

function bullets(items: string[]) {
  return items.map((item) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { line: 360, after: twip(4) },
      indent: { firstLine: 0 },
      children: [textRun(item)],
    }),
  );
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: LIGHT } : undefined,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      left: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      right: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
    },
    children: [new Paragraph({ children: [smallRun(text, { bold: opts.header })] })],
  });
}

function tableBlock(title: string, rows: string[][], widths?: number[]) {
  const children: FileChild[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: twip(8), after: twip(4) },
      children: [textRun(title, { bold: true, size: pt(11) })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: rows.map((row, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: row.map((value, index) => cell(value, { header: rowIndex === 0, width: widths?.[index] })),
        }),
      ),
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: twip(8) },
      indent: { firstLine: 0 },
      children: [smallRun("Fuente: elaboración propia con base en el intake, fuentes seleccionadas y criterios metodológicos de investigación.", { italics: true })],
    }),
  ];
  return children;
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function cite(source: Source) {
  return `[${source.code}]`;
}

function sourceReference(source: Source) {
  return [
    source.title,
    source.year ? `(${source.year})` : "(s. f.)",
    source.venue,
    source.doi ? `https://doi.org/${source.doi}` : source.landingPageUrl,
  ].filter(Boolean).join(". ");
}

async function loadProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
      blueprintVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
}

function mapSources(project: ProjectWithData): Source[] {
  return project.projectReferences.map((projectReference, index) => {
    const reference = projectReference.reference;
    const raw = rawObject(reference.rawOpenAlexJson);
    const primaryLocation = rawObject(raw.primary_location);
    const openAccess = rawObject(raw.open_access);
    const pdfUrl = typeof primaryLocation.pdf_url === "string" ? primaryLocation.pdf_url : "";
    return {
      id: reference.id,
      code: `S${index + 1}`,
      title: reference.title,
      year: reference.year,
      doi: reference.doi,
      venue: reference.venue,
      abstract: reference.abstract,
      landingPageUrl: reference.landingPageUrl,
      language: typeof raw.language === "string" ? raw.language : null,
      hasPdfSignal: Boolean(pdfUrl || /\.pdf(?:\?|$)/i.test(reference.landingPageUrl ?? "")),
      isOpenAccess: Boolean(primaryLocation.is_oa || openAccess.is_oa),
    };
  });
}

function createCoverImage(input: { outputPath: string; title: string; subtitle: string }) {
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  const script = String.raw`
from PIL import Image, ImageDraw, ImageFont
import sys, textwrap, math
out,title,subtitle=sys.argv[1:4]
w,h=1200,1600
img=Image.new('RGB',(w,h),(246,241,232))
d=ImageDraw.Draw(img)
for y in range(h):
    r=int(246-(y/h)*35); g=int(241-(y/h)*42); b=int(232-(y/h)*55)
    d.line([(0,y),(w,y)],fill=(r,g,b))
# abstract truss bridge and seismic wave
accent=(139,94,52); dark=(31,41,55); muted=(92,100,112)
d.rectangle([70,70,w-70,h-70],outline=accent,width=5)
base_y=1010
for x in range(145,1056,130):
    d.line([(x,base_y),(x+130,base_y)],fill=dark,width=7)
    d.line([(x,base_y),(x+65,base_y-135)],fill=dark,width=6)
    d.line([(x+65,base_y-135),(x+130,base_y)],fill=dark,width=6)
for x in range(145,1056,130):
    d.ellipse([x-8,base_y-8,x+8,base_y+8],fill=accent)
for i in range(0,1000,8):
    x=100+i; y=1160+int(math.sin(i/52)*26)
    d.ellipse([x,y,x+4,y+4],fill=accent)
try:
    font_title=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',54)
    font_sub=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',31)
    font_small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',24)
except Exception:
    font_title=font_sub=font_small=None
d.text((100,130),'INGENIOMETRIX',font=font_small,fill=accent)
d.text((100,168),'Plan de tesis · Ingeniería Civil',font=font_small,fill=muted)
y=300
for line in textwrap.wrap(title, width=31):
    d.text((100,y),line,font=font_title,fill=dark)
    y+=68
y+=20
for line in textwrap.wrap(subtitle, width=52):
    d.text((100,y),line,font=font_sub,fill=muted)
    y+=44
d.text((100,1395),'Confiabilidad estructural · puente metálico · amenaza sísmica',font=font_small,fill=accent)
d.text((100,1435),'Documento generado con trazabilidad de fuentes y control metodológico',font=font_small,fill=muted)
img.save(out)
`;
  execFileSync("python3", ["-c", script, input.outputPath, input.title, input.subtitle], { stdio: "pipe" });
}

function renderCover(input: { project: ProjectWithData; coverPath: string }) {
  const { project } = input;
  const intake = project.intake!;
  const image = fs.readFileSync(input.coverPath);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: twip(10) },
      children: [
        new ImageRun({ type: "png", data: image, transformation: { width: 390, height: 520 } }),
      ],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [textRun(project.university, { bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [textRun(project.program)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: twip(16), after: twip(8) }, children: [textRun(clean(intake.topic), { bold: true, size: pt(14) })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [textRun("Plan de tesis institucional para revision academica — entregable único Ingeniometrix", { italics: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: twip(24) }, children: [smallRun(`Fecha de generación: ${new Date().toISOString().slice(0, 10)}`)] }),
    pageBreak(),
  ];
}

function methodologySections(project: ProjectWithData, sources: Source[]) {
  const intake = project.intake!;
  const localSources = sources.filter((source) => source.language === "es");
  const methodSources = sources.filter((source) => /FORM|confiabilidad|reliability|probabil|Bayesian|neural|truss/i.test(source.title));
  const bridge = intake.targetPopulation || "puente vehicular esencial de armadura metálica tipo Warren en zona sísmica del Perú";
  const sourceList = sources.map(cite).join(", ");
  const localList = localSources.map(cite).join(" y ") || sourceList;
  const methodList = methodSources.map(cite).join(", ") || sourceList;

  const children: FileChild[] = [];
  children.push(heading("Declaración de alcance académico", 1));
  children.push(paragraph("Este documento es un plan de tesis autocontenido y trazable. No sustituye la inspección estructural profesional, la evaluación normativa oficial ni la asesoría de un director de tesis. Su propósito es convertir el intake y las fuentes seleccionadas en una ruta metodológica defendible, verificable y suficientemente detallada para iniciar una investigación aplicada."));
  children.push(paragraph(`La evidencia seleccionada se usa con dos roles diferenciados: las fuentes locales y regionales ${localList} sustentan pertinencia contextual en puentes de acero y monitoreo; las fuentes metodológicas ${methodList} aportan soporte para confiabilidad, modelamiento probabilístico, sistemas de armaduras y monitoreo estructural.`));
  children.push(pageBreak());

  children.push(new TableOfContents("Tabla de contenido", { hyperlink: false, headingStyleRange: "1-3" }));
  children.push(pageBreak());

  children.push(heading("Resumen", 1));
  children.push(paragraph(`La propuesta plantea evaluar la confiabilidad estructural de ${bridge}, integrando revisión documental, caracterización técnica, modelamiento estructural y estimación probabilística de seguridad. El problema se aborda desde la necesidad de priorizar decisiones sobre infraestructura vial esencial bajo incertidumbre de demanda, capacidad resistente, deterioro y amenaza sísmica.`));
  children.push(paragraph("El plan adopta un enfoque cuantitativo aplicado, con diseño no experimental y estudio de caso. Se propone construir un modelo estructural base, definir variables aleatorias críticas, establecer funciones de estado límite y estimar indicadores como probabilidad de falla e índice de confiabilidad. El producto esperado no es una tesis redactada completa, sino un proyecto de investigación listo para revisión académica, con matriz de consistencia, operacionalización, cronograma, presupuesto, riesgos y anexos de trazabilidad."));
  children.push(paragraph("Palabras clave: confiabilidad estructural; puente metálico; armadura Warren; amenaza sísmica; FORM; monitoreo estructural.", { italic: true }));

  children.push(heading("Abstract", 1));
  children.push(paragraph("This thesis plan proposes a traceable methodological route to assess the structural reliability of an essential Warren-type steel truss bridge located in a seismic area of Peru. The study combines documentary inspection, structural modelling, probabilistic variables and reliability indicators. It is designed as an academic planning document rather than a definitive engineering diagnosis."));
  children.push(pageBreak());

  children.push(heading("Capítulo I. Planteamiento del problema", 1));
  children.push(heading("Realidad problemática", 2));
  children.push(paragraph(clean(intake.problemContext) || "La infraestructura vial esencial requiere criterios de evaluación que superen verificaciones puramente determinísticas cuando existen incertidumbres relevantes de carga, deterioro, capacidad resistente y amenaza sísmica."));
  children.push(paragraph(`En puentes metálicos de armadura, la respuesta global depende de la interacción entre barras, conexiones, apoyos, tablero y condiciones de servicio. La literatura seleccionada muestra que la confiabilidad estructural apoyada en monitoreo e instrumentación puede orientar decisiones de evaluación y rehabilitación en puentes de acero ${localList}.`));
  children.push(heading("Formulación del problema", 2));
  children.push(paragraph(`Problema general: ¿Cómo evaluar de manera trazable la confiabilidad estructural de ${bridge}, considerando incertidumbres de demanda, capacidad, deterioro y amenaza sísmica?`, { bold: true }));
  children.push(...bullets([
    "¿Qué información técnica mínima debe recopilarse para caracterizar la condición estructural y de servicio del puente?",
    "¿Qué variables deben modelarse como aleatorias y cuáles pueden mantenerse como supuestos determinísticos en una primera etapa?",
    "¿Qué función de estado límite e indicadores permiten interpretar la seguridad estructural del puente?",
    "¿Cómo traducir los resultados probabilísticos en recomendaciones académicamente justificadas para mantenimiento, reforzamiento o estudios posteriores?",
  ]));
  children.push(heading("Justificación", 2));
  children.push(...tableBlock("Tabla 1. Justificación del estudio", [
    ["Dimensión", "Justificación"],
    ["Teórica", "Integra confiabilidad estructural, desempeño sísmico y comportamiento de armaduras metálicas en un marco verificable."],
    ["Práctica", "Ayuda a priorizar decisiones sobre infraestructura esencial con base en indicadores de riesgo y seguridad."],
    ["Metodológica", "Propone una secuencia reproducible: inventario, modelo, variables aleatorias, estado límite, confiabilidad e interpretación."],
    ["Social", "La continuidad operativa de puentes esenciales incide en conectividad, emergencia y movilidad regional."],
  ], [18, 82]));
  children.push(heading("Objetivos", 2));
  children.push(paragraph(`Objetivo general: Desarrollar un procedimiento de evaluación de confiabilidad estructural para ${bridge}, mediante modelamiento estructural y análisis probabilístico de demanda, capacidad y deterioro.`));
  children.push(...bullets([
    "Caracterizar el sistema estructural, las condiciones de servicio y la información disponible del puente.",
    "Identificar variables aleatorias críticas asociadas a resistencia, demanda, deterioro, conexiones y amenaza sísmica.",
    "Definir funciones de estado límite e indicadores de confiabilidad aplicables a elementos y sistema estructural.",
    "Proponer criterios de interpretación de resultados para priorizar acciones técnicas y estudios complementarios.",
  ]));
  children.push(heading("Hipótesis y supuestos de trabajo", 2));
  children.push(paragraph("Hipótesis general: La evaluación probabilística de confiabilidad permite identificar de forma más transparente los componentes y escenarios críticos de un puente metálico esencial que una verificación determinística aislada, siempre que los supuestos y la calidad de datos sean explícitos."));
  children.push(...bullets([
    "H1: La variabilidad de demanda vehicular y sísmica influye significativamente en el margen de seguridad estimado.",
    "H2: La incorporación de deterioro y condiciones reales de elementos metálicos modifica la priorización de componentes críticos.",
    "H3: Un modelo con trazabilidad de fuentes y supuestos mejora la utilidad académica de la propuesta frente a una simulación no documentada.",
  ]));

  children.push(heading("Capítulo II. Marco teórico", 1));
  children.push(heading("Antecedentes", 2));
  children.push(paragraph(`Los antecedentes regionales recuperados ${localList} son especialmente valiosos porque tratan confiabilidad estructural, monitoreo, capacidad de carga y puentes de acero en contextos latinoamericanos. Estos trabajos demuestran que la instrumentación, pruebas de carga, identificación dinámica y simulación numérica pueden articularse para apoyar decisiones sobre puentes existentes.`));
  children.push(paragraph(`Las fuentes internacionales ${methodList} complementan el marco mediante métodos de confiabilidad de sistemas, FORM, análisis probabilístico de armaduras y enfoques bayesianos de detección de daño. Su rol en este plan es metodológico: aportan principios transferibles, no sustituyen la verificación local del puente peruano.`));
  children.push(...tableBlock("Tabla 2. Antecedentes y uso en la investigación", [
    ["Fuente", "Aporte usado en el plan", "Nivel de uso"],
    ...sources.map((source) => [cite(source), source.language === "es" ? "Pertinencia contextual: puentes de acero, confiabilidad, capacidad o monitoreo en LATAM." : "Soporte metodológico: confiabilidad, FORM, sistema de armadura, detección probabilística o SHM.", source.language === "es" ? "Contextual-metodológico" : "Metodológico-complementario"]),
  ], [12, 62, 26]));
  children.push(heading("Bases teóricas", 2));
  children.push(paragraph("La confiabilidad estructural representa la seguridad mediante variables aleatorias y funciones de estado límite. En lugar de preguntar únicamente si una resistencia nominal supera una demanda nominal, estima el margen de seguridad frente a incertidumbres de materiales, geometría, cargas, deterioro, modelo y amenaza sísmica."));
  children.push(paragraph("Una armadura Warren distribuye esfuerzos axiales en barras diagonales y cordones, por lo que la evaluación debe distinguir entre falla de elementos, falla de conexión, pérdida de redundancia y desempeño global del sistema. En zona sísmica, la incertidumbre de demanda exige escenarios compatibles con la amenaza local, ductilidad esperada, condiciones de apoyo y continuidad operativa."));
  children.push(equationLimitState());
  children.push(paragraph("La función g(X) define el margen de seguridad. Si g(X) ≤ 0 se considera que el estado límite se alcanza o supera. En el caso del puente, R(X) puede representar resistencia axial, capacidad de conexión, capacidad de apoyo o capacidad global; S(X) puede representar carga viva, demanda sísmica, efecto combinado o demanda amplificada por deterioro."));
  children.push(equationReliabilityIndex());
  children.push(paragraph("El índice β resume la distancia probabilística al estado límite. Debe interpretarse con cuidado: un β alto sugiere menor probabilidad de falla, pero su validez depende de la calidad de datos, calibración del modelo, distribución de variables y consistencia de hipótesis."));
  children.push(heading("Definición de términos", 2));
  children.push(...tableBlock("Tabla 3. Términos clave", [
    ["Término", "Definición operativa"],
    ["Confiabilidad estructural", "Probabilidad de que un sistema cumpla una función estructural bajo condiciones e incertidumbres definidas."],
    ["Estado límite", "Condición que separa desempeño aceptable de falla o incumplimiento funcional."],
    ["Índice β", "Medida probabilística asociada al margen de seguridad frente al estado límite."],
    ["Puente esencial", "Infraestructura cuya continuidad resulta crítica para movilidad, emergencia o conectividad territorial."],
    ["FORM", "Método de confiabilidad de primer orden para aproximar la probabilidad de falla mediante linealización en el punto de diseño."],
  ], [28, 72]));

  children.push(heading("Capítulo III. Metodología", 1));
  children.push(heading("Enfoque, tipo y diseño", 2));
  children.push(paragraph("El estudio se plantea con enfoque cuantitativo aplicado, alcance explicativo-propositivo y diseño no experimental de estudio de caso. No manipula físicamente el puente; organiza datos existentes, inspección documental, modelamiento y análisis probabilístico para evaluar escenarios de confiabilidad."));
  children.push(...tableBlock("Tabla 4. Diseño metodológico", [
    ["Componente", "Decisión"],
    ["Enfoque", "Cuantitativo con soporte documental y técnico"],
    ["Tipo", "Aplicado, porque busca una ruta para toma de decisiones sobre infraestructura"],
    ["Diseño", "No experimental, transversal y de estudio de caso"],
    ["Unidad de análisis", bridge],
    ["Método central", "Modelamiento estructural + confiabilidad FORM/Monte Carlo según disponibilidad de datos"],
  ], [28, 72]));
  children.push(heading("Variables, dimensiones e indicadores", 2));
  children.push(...tableBlock("Tabla 5. Operacionalización preliminar", [
    ["Variable/categoría", "Dimensiones", "Indicadores", "Fuente de datos"],
    ["Confiabilidad estructural", "Elemento / sistema", "β, Pf, margen g(X)", "Modelo estructural y análisis probabilístico"],
    ["Demanda", "Carga viva, sismo, combinaciones", "Efectos internos, aceleración, desplazamiento", "Aforos, norma, amenaza sísmica"],
    ["Capacidad", "Material, sección, conexión", "Resistencia axial, flexión, capacidad de conexión", "Planos, ensayos, inspección"],
    ["Deterioro", "Corrosión, daño, pérdida de sección", "Reducción de capacidad, condición visual", "Inspección, mantenimiento, monitoreo"],
  ], [20, 26, 26, 28]));
  children.push(heading("Procedimiento técnico", 2));
  children.push(...tableBlock("Tabla 6. Algoritmo metodológico propuesto", [
    ["Paso", "Actividad", "Control de calidad"],
    ["1", "Recolectar planos, inspecciones, aforos, información sísmica y mantenimiento", "Registrar fuente, fecha, confiabilidad y vacíos"],
    ["2", "Construir modelo estructural base de la armadura Warren", "Verificar geometría, apoyos, cargas y elementos críticos"],
    ["3", "Definir variables aleatorias y distribuciones", "Justificar con datos, literatura o supuestos conservadores"],
    ["4", "Formular funciones de estado límite por elemento y sistema", "Revisar coherencia con modos de falla plausibles"],
    ["5", "Estimar β y Pf mediante FORM y contraste con simulación", "Comparar sensibilidad y estabilidad de resultados"],
    ["6", "Interpretar escenarios y formular recomendaciones", "Diferenciar hallazgo académico de diagnóstico técnico definitivo"],
  ], [10, 58, 32]));
  children.push(equationProbabilityFailure());
  children.push(paragraph("La probabilidad de falla debe calcularse para escenarios definidos y no como valor absoluto universal. En una primera versión académica, se recomienda contrastar FORM con una simulación Monte Carlo acotada para verificar sensibilidad de variables dominantes."));
  children.push(heading("Técnicas e instrumentos", 2));
  children.push(...tableBlock("Tabla 7. Técnicas e instrumentos", [
    ["Técnica", "Instrumento", "Resultado esperado"],
    ["Revisión documental", "Ficha de extracción de planos, normas, mantenimiento y literatura", "Inventario técnico trazable"],
    ["Inspección técnica/documental", "Lista de verificación de elementos, conexiones y deterioro", "Condición preliminar del sistema"],
    ["Modelamiento estructural", "Modelo analítico o numérico documentado", "Demandas y respuestas internas"],
    ["Análisis probabilístico", "Matriz de variables y script de confiabilidad", "β, Pf, sensibilidad y escenarios"],
  ], [25, 38, 37]));

  children.push(heading("Capítulo IV. Administración del proyecto", 1));
  children.push(heading("Cronograma referencial", 2));
  children.push(...tableBlock("Tabla 8. Cronograma tipo Gantt", [
    ["Fase", "M1", "M2", "M3", "M4", "M5", "M6", "Entregable"],
    ["Revisión e intake técnico", "●", "", "", "", "", "", "Protocolo y matriz de fuentes"],
    ["Inventario y variables", "●", "●", "", "", "", "", "Diccionario de datos"],
    ["Modelo estructural", "", "●", "●", "", "", "", "Modelo base validado"],
    ["Confiabilidad", "", "", "●", "●", "", "", "β/Pf por escenario"],
    ["Discusión y recomendaciones", "", "", "", "●", "●", "", "Capítulos de resultados"],
    ["Revisión final", "", "", "", "", "●", "●", "Documento final"],
  ], [24, 8, 8, 8, 8, 8, 8, 28]));
  children.push(heading("Presupuesto referencial", 2));
  children.push(...tableBlock("Tabla 9. Presupuesto preliminar", [
    ["Rubro", "Descripción", "Estimación"],
    ["Información técnica", "Copias, digitalización, planos, normas y registros", "Medio"],
    ["Trabajo de campo", "Visita, registro fotográfico, seguridad y transporte", "Medio-alto"],
    ["Ensayos/monitoreo", "Si se requiere validación material o dinámica", "Variable"],
    ["Software/modelamiento", "Herramientas de análisis estructural y confiabilidad", "Medio"],
    ["Revisión experta", "Asesoría estructural/metodológica", "Medio"],
  ], [24, 52, 24]));

  children.push(heading("Capítulo V. Matriz de consistencia", 1));
  children.push(paragraph("La matriz se presenta en sección horizontal para preservar legibilidad. Cada fila vincula problema, objetivo, hipótesis, variables, indicadores, método y evidencia mínima requerida."));

  return children;
}

function equationLimitState() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: twip(8), after: twip(6) },
    children: [
      new DocxMath({ children: [new MathRun("g(X) = R(X) - S(X)")] }),
      textRun("   (Ecuación 1)", { italics: true }),
    ],
  });
}

function equationReliabilityIndex() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: twip(8), after: twip(6) },
    children: [
      new DocxMath({
        children: [
          new MathSubScript({ children: [new MathRun("β")], subScript: [new MathRun("FORM")] }),
          new MathRun(" = "),
          new MathFraction({ numerator: [new MathRun("μ_g")], denominator: [new MathRun("σ_g")] }),
        ],
      }),
      textRun("   (Ecuación 2)", { italics: true }),
    ],
  });
}

function equationProbabilityFailure() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: twip(8), after: twip(6) },
    children: [
      new DocxMath({
        children: [
          new MathSubScript({ children: [new MathRun("P")], subScript: [new MathRun("f")] }),
          new MathRun(" = P[g(X) ≤ 0] ≈ Φ(-β)"),
        ],
      }),
      textRun("   (Ecuación 3)", { italics: true }),
    ],
  });
}

function matrixRows(project: ProjectWithData) {
  const intake = project.intake!;
  const object = intake.targetPopulation || "puente vehicular esencial de armadura metálica tipo Warren";
  return [
    ["Problema", "Objetivo", "Hipótesis", "Variable/categoría", "Indicadores", "Método", "Evidencia requerida"],
    [
      `Incertidumbre sobre la confiabilidad de ${object}`,
      "Evaluar confiabilidad estructural del sistema y componentes críticos",
      "La evaluación probabilística identifica escenarios críticos no visibles en una verificación determinística simple",
      "Confiabilidad estructural",
      "β, Pf, g(X)",
      "FORM + contraste Monte Carlo",
      "Modelo estructural, cargas, resistencia, deterioro",
    ],
    [
      "Datos incompletos sobre demanda, capacidad y deterioro",
      "Caracterizar variables aleatorias y supuestos",
      "La calidad de datos modifica la estabilidad del índice de confiabilidad",
      "Demanda/capacidad/deterioro",
      "Distribuciones, media, desviación, escenarios",
      "Inventario + sensibilidad",
      "Planos, inspección, literatura, normas",
    ],
    [
      "Necesidad de priorizar intervención o estudios adicionales",
      "Traducir resultados en criterios de decisión",
      "Los escenarios de menor β orientan prioridades técnicas",
      "Riesgo técnico",
      "Ranking de elementos y escenarios",
      "Análisis comparativo",
      "Resultados del modelo y criterio experto",
    ],
  ];
}

function renderLandscapeMatrix(project: ProjectWithData) {
  return [
    heading("Matriz de consistencia metodológica", 1),
    ...tableBlock("Tabla 10. Matriz de consistencia", matrixRows(project), [16, 16, 18, 14, 12, 12, 12]),
  ];
}

function renderFinalSections(project: ProjectWithData, sources: Source[]) {
  const children: FileChild[] = [];
  children.push(heading("Capítulo VI. Riesgos, ética y trazabilidad", 1));
  children.push(...tableBlock("Tabla 11. Riesgos de investigación y mitigación", [
    ["Riesgo", "Impacto", "Mitigación"],
    ["Datos técnicos incompletos", "Resultados poco robustos", "Escenarios explícitos, análisis de sensibilidad y declaración de supuestos"],
    ["Extrapolación de literatura extranjera", "Baja pertinencia local", "Separar fuentes contextuales de fuentes metodológicas"],
    ["Confusión entre plan académico y diagnóstico real", "Riesgo ético/técnico", "Rotular el documento como plan y requerir revisión profesional"],
    ["Modelo no calibrado", "Conclusiones débiles", "Validar con monitoreo, pruebas de carga o revisión experta si están disponibles"],
  ], [28, 28, 44]));
  children.push(paragraph("El tratamiento ético del estudio exige no presentar estimaciones preliminares como dictamen estructural. Las salidas del modelo deben acompañarse de límites de validez, fuentes usadas, supuestos y recomendaciones de verificación."));

  children.push(heading("Conclusiones del plan", 1));
  children.push(...bullets([
    "El tema es viable como plan de tesis aplicado si se delimita a confiabilidad estructural y no a certificación definitiva del puente.",
    "La estructura metodológica propuesta conecta problema, objetivos, hipótesis, variables, procedimiento, matriz, cronograma y presupuesto de forma defendible.",
    "La combinación de evidencia regional en español y fuentes metodológicas internacionales mejora pertinencia y rigor.",
    "La siguiente iteración debe inspeccionar texto completo de las fuentes sin DOI/PDF verificado y completar datos reales del puente específico.",
  ]));

  children.push(heading("Referencias", 1));
  sources.forEach((source) => children.push(paragraph(sourceReference(source), { indent: false })));

  children.push(heading("Anexo A. Registro de salud de fuentes", 1));
  children.push(...tableBlock("Tabla 12. Source health y uso trazable", [
    ["Fuente", "Idioma", "DOI", "Acceso/PDF", "Uso"],
    ...sources.map((source) => [
      cite(source),
      source.language ?? "n/d",
      source.doi ?? "Sin DOI registrado",
      `${source.isOpenAccess ? "OA" : "OA no confirmado"}; ${source.hasPdfSignal ? "PDF/señal disponible" : "PDF no verificado"}`,
      source.language === "es" ? "Contexto regional y pertinencia" : "Método, confiabilidad o monitoreo estructural",
    ]),
  ], [12, 10, 28, 25, 25]));

  children.push(heading("Anexo B. Registro de ecuaciones y assets regenerados", 1));
  children.push(...tableBlock("Tabla 13. Ecuaciones profesionales insertadas", [
    ["ID", "Ecuación", "Propósito", "Estado"],
    ["E1", "g(X)=R(X)-S(X)", "Función de estado límite", "Render nativo DOCX Math"],
    ["E2", "β=μg/σg", "Índice de confiabilidad aproximado", "Render nativo DOCX Math"],
    ["E3", "Pf=P[g(X)≤0]≈Φ(-β)", "Probabilidad de falla", "Render nativo DOCX Math"],
  ], [12, 28, 40, 20]));
  children.push(paragraph("La carátula visual fue generada como asset local reproducible del pipeline avanzado. Las ecuaciones se regeneraron como objetos matemáticos nativos de Word, evitando pegar fórmulas como texto plano."));
  return children;
}

function makeHeaderFooter(title: string) {
  return {
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smallRun(title.slice(0, 90), { color: "5E6470" })] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smallRun("Ingeniometrix · "), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: pt(10) })] })] }),
    },
  };
}

export async function runAdvancedThesisDocxPipeline(input: { userId: string; projectId: string; outputRoot?: string }) {
  const runId = `mvp-advanced-docx-${randomUUID()}`;
  const usageBefore = await captureMvpApiUsageSnapshot();
  const project = await loadProject(input.userId, input.projectId);
  if (!project?.intake) {
    throw new Error("Proyecto no encontrado o sin intake.");
  }
  if (project.projectReferences.length < 3) {
    throw new Error("Se requieren al menos 3 fuentes seleccionadas para el plan avanzado.");
  }
  const sources = mapSources(project);
  const title = clean(project.intake.topic || project.title);
  const outputDir = input.outputRoot ?? path.join(process.cwd(), "artifacts-local", "mvp-advanced-docx", project.id, new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(outputDir, { recursive: true });
  const coverPath = path.join(outputDir, "cover-hero.png");
  createCoverImage({ outputPath: coverPath, title, subtitle: "Plan de tesis estructurado con metodología, evidencia y trazabilidad" });

  const common = makeHeaderFooter("Plan de tesis Ingeniometrix");
  const doc = new Document({
    creator: "Ingeniometrix",
    title,
    description: "Plan de tesis avanzado generado por Ingeniometrix MVP.",
    styles: {
      paragraphStyles: [
        { id: "Normal", name: "Normal", run: { font: FONT, size: pt(12) }, paragraph: { spacing: { line: 360, after: twip(6) } } },
      ],
    },
    numbering: { config: [{ reference: "default-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        properties: { page: { margin: { top: cm(2.4), bottom: cm(2.4), left: cm(3), right: cm(2.5) } } },
        ...common,
        children: [...renderCover({ project, coverPath }), ...methodologySections(project, sources)],
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: cm(1.8), bottom: cm(1.8), left: cm(1.5), right: cm(1.5) },
          },
        },
        ...common,
        children: renderLandscapeMatrix(project),
      },
      {
        properties: { page: { margin: { top: cm(2.4), bottom: cm(2.4), left: cm(3), right: cm(2.5) } } },
        ...common,
        children: renderFinalSections(project, sources),
      },
    ],
  });

  const outputPath = path.join(outputDir, `${slug(title)}-plan-tesis-ingeniometrix-avanzado.docx`);
  const buffer = await withLlmUsageContext(
    {
      projectId: project.id,
      userId: input.userId,
      runId,
      stage: "docx_generation",
      source: "runAdvancedThesisDocxPipeline",
    },
    () => Packer.toBuffer(doc),
  );
  fs.writeFileSync(outputPath, buffer);

  const qa = await validateDocxPackage({
    docxPath: outputPath,
    minTableCount: 10,
    minSectionCount: 3,
    forbiddenSourceTitles: [],
  });
  const qaPath = path.join(outputDir, "docx-qa-report.json");
  fs.writeFileSync(qaPath, JSON.stringify(qa, null, 2));
  const usageReport = await buildMvpApiUsageReport({
    before: usageBefore,
    label: "mvp_advanced_thesis_docx_pipeline",
    filter: { projectId: project.id, runId },
  });
  const usagePath = path.join(outputDir, "api-usage-report.json");
  fs.writeFileSync(usagePath, JSON.stringify(usageReport, null, 2));

  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
  const blueprintVersion = await prisma.blueprintVersion.create({
    data: {
      projectId: project.id,
      versionNumber,
      model: "mvp-advanced-deterministic-plus-assets-v1",
      promptVersion: PROMPT_VERSION,
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
        reference_id: item.reference.id,
        citation_id: `S${index + 1}`,
        selected_order: item.selectedOrder ?? index + 1,
        title: item.reference.title,
        doi: item.reference.doi,
        authors: item.reference.authorsJson,
        year: item.reference.year,
        venue: item.reference.venue,
        abstract: item.reference.abstract,
      })),
      blueprintJson: {
        kind: "advanced_thesis_plan",
        prompt_version: PROMPT_VERSION,
        title,
        sections: ["problema", "marco_teorico", "metodologia", "matriz", "cronograma", "presupuesto", "referencias", "anexos"],
        references_used: sources.map((source) => ({ reference_id: source.id, citation_id: source.code, title: source.title, doi: source.doi })),
        assets: [{ kind: "cover_hero", path: coverPath }, { kind: "native_equations", count: 3 }],
        qa: { passed: qa.passed, score_100: qa.score_100, failures: qa.failures },
        api_usage_delta: usageReport.delta,
        api_usage_filtered_delta: usageReport.filtered_delta,
        api_usage_run_id: runId,
      } as Prisma.InputJsonValue,
      coherenceReportJson: {
        status: qa.passed ? "advanced_ready" : "advanced_ready_with_warnings",
        qa_report_path: qaPath,
        qa_score_100: qa.score_100,
        failures: qa.failures,
        warnings: qa.warnings,
        api_usage_report_path: usagePath,
        api_usage_delta: usageReport.delta,
        api_usage_filtered_delta: usageReport.filtered_delta,
        api_usage_run_id: runId,
      } as Prisma.InputJsonValue,
      exportStatus: ExportStatus.READY,
    },
  });

  await prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.EXPORT_READY } });
  await logAuditEvent({
    eventType: "MVP_ADVANCED_THESIS_DOCX_GENERATED",
    actorType: "SYSTEM",
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: project.id,
    payloadJson: {
      outputPath,
      qaPath,
      usagePath,
      qaScore: qa.score_100,
      blueprintVersionId: blueprintVersion.id,
      apiUsageDelta: usageReport.delta,
      apiUsageFilteredDelta: usageReport.filtered_delta,
      apiUsageRunId: runId,
    },
  });

  return {
    ok: true,
    projectId: project.id,
    blueprintVersionId: blueprintVersion.id,
    outputPath,
    coverPath,
    qaPath,
    usagePath,
    apiUsageRunId: runId,
    apiUsage: usageReport,
    qa,
  };
}
