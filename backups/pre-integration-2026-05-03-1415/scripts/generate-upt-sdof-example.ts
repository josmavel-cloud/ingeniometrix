import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import type {
  CanonicalAssetRef,
  CanonicalContentBlock,
  CanonicalReportDocument,
  CanonicalSectionNode,
  CanonicalTableRow,
} from "@/server/reporting/canonical-report-types";
import { buildCanonicalReportFromTemplateVersion } from "@/server/reporting/canonical-report/build-canonical-report-from-template-version";
import { writeCanonicalReportDocxFile } from "@/server/reporting/docx/render-canonical-report-docx";

const WORKSPACE_PYTHON =
  process.env.IMX_WORKSPACE_PYTHON ??
  "C:\\Users\\josma\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const DEFAULT_TEMPLATE_KEY =
  "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function paragraphBlock(id: string, text: string): CanonicalContentBlock {
  return { id, kind: "paragraph", text };
}

function bulletListBlock(id: string, items: string[]): CanonicalContentBlock {
  return { id, kind: "bullet_list", items };
}

function numberedListBlock(id: string, items: string[]): CanonicalContentBlock {
  return { id, kind: "numbered_list", items };
}

function equationBlock(
  id: string,
  latex: string,
  label: string,
): CanonicalContentBlock {
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

function rows(rows: string[][]): CanonicalTableRow[] {
  return rows.map((row) => ({
    cells: row.map((cell) => ({ text: cell })),
  }));
}

function tableBlock(input: {
  id: string;
  sequence: number;
  title: string;
  rows: string[][];
  note?: string;
}): CanonicalContentBlock {
  return {
    id: input.id,
    kind: "table",
    table: {
      caption: {
        label: `Tabla ${input.sequence}`,
        title: input.title,
        note:
          input.note ??
          "Nota. Tabla sintetica construida para validar formato, captions y lectura tecnica.",
        source_label: "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "top",
      },
      rows: rows(input.rows),
      numbered: true,
    },
  };
}

function figureBlock(input: {
  id: string;
  sequence: number;
  title: string;
  assetKey: string;
  widthPx: number;
  heightPx: number;
  note?: string;
}): CanonicalContentBlock {
  return {
    id: input.id,
    kind: "figure",
    figure: {
      caption: {
        label: `Figura ${input.sequence}`,
        title: input.title,
        note:
          input.note ??
          "Nota. Figura sintetica embebida para validar composicion grafica dentro del plan de tesis.",
        source_label: "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "bottom",
      },
      placeholder_text: "Figura sintetica SDOF.",
      numbered: true,
      image_asset_key: input.assetKey,
      image_width_px: input.widthPx,
      image_height_px: input.heightPx,
    },
  };
}

function sdofParagraph(input: {
  focus: string;
  secondary: string;
  exportCheck: string;
  implication: string;
}) {
  return [
    `Este bloque sintetico desarrolla ${input.focus} dentro de un plan de tesis orientado a Dinamica de Estructuras y al estudio de un sistema de un grado de libertad.`,
    `La redaccion enfatiza ${input.secondary} para que el documento conserve tono tecnico, continuidad argumental y un uso consistente de simbolos, tablas y ecuaciones numeradas.`,
    `Ademas, se incorpora ${input.exportCheck} con el objetivo de comprobar que la plantilla UPT resuelva correctamente captions, jerarquia de titulos, espaciado y referencias cruzadas.`,
    `El apartado remarca ${input.implication}, lo que permite revisar simultaneamente la claridad metodologica y la estabilidad del renderer DOCX ante contenido cientifico de mayor densidad.`,
    `Todo el material se mantiene sintetico, trazable y no apto para uso academico real, pero suficiente para auditar la composicion formal del documento.`,
  ].join(" ");
}

function findSection(
  sections: CanonicalSectionNode[],
  matcher: (section: CanonicalSectionNode) => boolean,
): CanonicalSectionNode | null {
  for (const section of sections) {
    if (matcher(section)) {
      return section;
    }

    const match = findSection(section.children, matcher);
    if (match) {
      return match;
    }
  }

  return null;
}

function fallbackSection(
  document: CanonicalReportDocument,
  id: string,
  title: string,
  semanticKey: string,
) {
  const section: CanonicalSectionNode = {
    id,
    title,
    level: 1,
    semantic_key: semanticKey,
    blocks: [],
    children: [],
  };
  document.body.sections.push(section);
  return section;
}

function createSdofAssets(outputDir: string) {
  const assetsDir = path.join(outputDir, "assets");
  ensureDir(assetsDir);

  const schematicPath = path.join(assetsDir, "sdof-esquema.png");
  const responsePath = path.join(assetsDir, "sdof-respuesta.png");
  const flowPath = path.join(assetsDir, "sdof-metodologia.png");

  const script = `
from PIL import Image, ImageDraw, ImageFont
import math

FONT = ImageFont.load_default()

def save_schematic(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((480, 220, 760, 430), outline="#173F5F", width=8, fill="#D9EAF7")
    draw.text((585, 305), "m", fill="#173F5F", font=FONT)
    for y in range(240, 430, 24):
        draw.line((350, y, 390, y + 12), fill="#C95D63", width=5)
        draw.line((390, y + 12, 350, y + 24), fill="#C95D63", width=5)
    draw.line((350, 220, 350, 430), fill="#173F5F", width=7)
    draw.line((350, 430, 480, 430), fill="#173F5F", width=7)
    draw.line((760, 430, 880, 430), fill="#173F5F", width=7)
    draw.line((880, 200, 880, 450), fill="#173F5F", width=7)
    draw.arc((740, 250, 920, 430), start=210, end=330, fill="#20639B", width=7)
    draw.text((250, 180), "k", fill="#173F5F", font=FONT)
    draw.text((930, 315), "c", fill="#173F5F", font=FONT)
    draw.line((620, 430, 620, 580), fill="#173F5F", width=7)
    draw.polygon([(610, 580), (630, 580), (620, 610)], fill="#173F5F")
    draw.text((638, 565), "u(t)", fill="#173F5F", font=FONT)
    draw.text((370, 80), "Sistema masa-resorte-amortiguador sintetico", fill="#0B132B", font=FONT)
    image.save(path)

def save_response(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    draw.line((120, 600, 1080, 600), fill="#333333", width=4)
    draw.line((120, 120, 120, 600), fill="#333333", width=4)
    draw.text((1020, 615), "t", fill="#0B132B", font=FONT)
    draw.text((80, 100), "r(t)", fill="#0B132B", font=FONT)
    colors = ["#1F77B4", "#D62728", "#2CA02C"]
    labels = ["u(t)", "v(t)", "a(t)"]
    offsets = [0.0, math.pi / 3.0, 2.0 * math.pi / 3.0]
    for color, label, phase in zip(colors, labels, offsets):
        points = []
        for i in range(0, 901):
            x = 120 + i
            t = i / 120.0
            y = 360 - 150 * math.exp(-0.08 * t) * math.sin(2.1 * t + phase)
            points.append((x, y))
        draw.line(points, fill=color, width=5)
        draw.text((870, 150 + 32 * offsets.index(phase)), label, fill=color, font=FONT)
    draw.text((180, 70), "Respuesta sintetica de desplazamiento, velocidad y aceleracion", fill="#0B132B", font=FONT)
    image.save(path)

def save_flow(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    coords = [
        (80, 130, 330, 230, "Supuestos"),
        (470, 130, 760, 230, "Ecuacion de movimiento"),
        (860, 130, 1110, 230, "Solucion"),
        (160, 430, 470, 540, "Validacion"),
        (620, 430, 1040, 540, "Interpretacion fisica"),
    ]
    for x1, y1, x2, y2, text in coords:
        draw.rounded_rectangle((x1, y1, x2, y2), radius=18, outline="#173F5F", width=5, fill="#EFF6FB")
        draw.text((x1 + 20, y1 + 38), text, fill="#173F5F", font=FONT)
    arrows = [
        ((330, 180), (470, 180)),
        ((760, 180), (860, 180)),
        ((250, 230), (260, 430)),
        ((620, 230), (620, 430)),
        ((980, 230), (900, 430)),
        ((470, 485), (620, 485)),
    ]
    for start, end in arrows:
        draw.line([start, end], fill="#C97C00", width=6)
        draw.ellipse((end[0]-7, end[1]-7, end[0]+7, end[1]+7), fill="#C97C00")
    draw.text((160, 70), "Ruta sintetica para deducir y analizar la respuesta del sistema SDOF", fill="#0B132B", font=FONT)
    image.save(path)

save_schematic(r"${schematicPath.replace("\\", "\\\\")}")
save_response(r"${responsePath.replace("\\", "\\\\")}")
save_flow(r"${flowPath.replace("\\", "\\\\")}")
`;

  execFileSync(WORKSPACE_PYTHON, ["-c", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const assets: CanonicalAssetRef[] = [
    {
      asset_key: "sdof-schematic",
      kind: "figure_image",
      role: "generic",
      stored_path: schematicPath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
    {
      asset_key: "sdof-response-chart",
      kind: "figure_image",
      role: "generic",
      stored_path: responsePath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
    {
      asset_key: "sdof-methodology-flow",
      kind: "figure_image",
      role: "generic",
      stored_path: flowPath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
  ];

  return assets;
}

function enrichDocument(document: CanonicalReportDocument, outputDir: string) {
  document.warnings.push(
    "Ejemplo sintetico UPT orientado a un sistema de un grado de libertad en Dinamica de Estructuras.",
  );

  document.assets.push(...createSdofAssets(outputDir));

  const sections = document.body.sections;

  const intro =
    findSection(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("INTRODUCCION") || title.includes("JUSTIFICACION");
    }) ??
    fallbackSection(document, "sdof-introduccion", "Introduccion y justificacion", "problem_statement");
  intro.blocks.push(
    paragraphBlock(
      "sdof-intro-p1",
      sdofParagraph({
        focus: "la importancia de deducir la ecuacion de movimiento de un sistema de un grado de libertad",
        secondary: "el vinculo entre idealizacion mecanica, equilibrio dinamico y lectura fisica de los terminos de masa, amortiguamiento y rigidez",
        exportCheck: "parrafos tecnicos suficientemente extensos para ocupar varias paginas sin degradar la legibilidad general",
        implication: "como una plantilla universitaria maneja texto denso junto con referencias, captions y objetos numerados",
      }),
    ),
    paragraphBlock(
      "sdof-intro-p2",
      sdofParagraph({
        focus: "la pertinencia de un caso sintetico basado en respuesta de desplazamiento, velocidad y aceleracion",
        secondary: "la necesidad de mantener una progresion didactica desde el modelo fisico hasta la expresion matematica del problema",
        exportCheck: "bloques argumentativos que prueban la continuidad tipografica del renderer y su estabilidad ante contenido cientifico",
        implication: "que el lector identifique con rapidez problema, motivacion, alcance y estructura del plan de tesis",
      }),
    ),
    figureBlock({
      id: "sdof-intro-figure",
      sequence: 1,
      title: "Esquema sintetico del sistema masa-resorte-amortiguador de un grado de libertad",
      assetKey: "sdof-schematic",
      widthPx: 1200,
      heightPx: 720,
    }),
  );

  const objectives =
    findSection(sections, (section) => normalizeTitle(section.title).includes("OBJETIV")) ??
    fallbackSection(document, "sdof-objetivos", "Objetivos", "objectives");
  objectives.blocks.push(
    paragraphBlock(
      "sdof-objectives-p1",
      sdofParagraph({
        focus: "la formulacion de objetivos en torno a la deduccion simbolica y la interpretacion fisica del sistema SDOF",
        secondary: "la correspondencia entre objetivo general, objetivos especificos y resultados intermedios del estudio",
        exportCheck: "listas numeradas que mantengan alineacion, sangrias y secuencia jerarquica estables",
        implication: "que la estructura del plan anticipe claramente la ruta analitica antes de entrar al desarrollo teorico",
      }),
    ),
    numberedListBlock("sdof-objectives-list", [
      "Deducir la ecuacion diferencial de movimiento de un sistema de un grado de libertad a partir del equilibrio dinamico.",
      "Obtener expresiones sinteticas de desplazamiento, velocidad y aceleracion para el caso de vibracion libre amortiguada.",
      "Organizar simbolos, variables y supuestos en tablas legibles y consistentes con el resto del plan.",
      "Definir un procedimiento metodologico de validacion conceptual y de interpretacion fisica del modelo.",
      "Verificar que la plantilla UPT soporte notacion matematica, figuras y captions sin errores de formato.",
    ]),
  );

  const framework =
    findSection(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("MARCO") || title.includes("ANTECEDENTE") || title.includes("BASE");
    }) ??
    fallbackSection(document, "sdof-marco", "Marco teorico", "theoretical_framework");
  framework.blocks.push(
    paragraphBlock(
      "sdof-framework-p1",
      sdofParagraph({
        focus: "los fundamentos conceptuales de vibracion libre, amortiguamiento viscoso y frecuencia natural",
        secondary: "la necesidad de definir con claridad la idealizacion del modelo, los grados de libertad y la interpretacion energetica del sistema",
        exportCheck: "un cuerpo teorico que combine argumentacion larga con ecuaciones y figuras sin perder limpieza editorial",
        implication: "que las bases teoricas sostengan tanto la deduccion matematica como la lectura ingenieril del comportamiento dinamico",
      }),
    ),
    paragraphBlock(
      "sdof-framework-p2",
      sdofParagraph({
        focus: "la relacion entre equilibrio, inercia, disipacion y recuperacion elastica",
        secondary: "el uso coherente de simbolos, subindices y referencias cruzadas propias de un texto tecnico",
        exportCheck: "la resistencia del documento frente a varias paginas de teoria sintetica con notacion especializada",
        implication: "que el lector pueda seguir la transicion desde el esquema fisico hacia la solucion analitica",
      }),
    ),
    equationBlock("sdof-framework-eq1", String.raw`m\ddot{u}(t) + c\dot{u}(t) + ku(t) = p(t)`, "1"),
    paragraphBlock(
      "sdof-framework-eq1-note",
      "La ecuacion (1) sintetiza la ley de equilibrio dinamico del sistema y sirve como punto de partida para el desarrollo del plan.",
    ),
    figureBlock({
      id: "sdof-framework-figure",
      sequence: 2,
      title: "Ruta sintetica para deducir la respuesta de desplazamiento, velocidad y aceleracion",
      assetKey: "sdof-methodology-flow",
      widthPx: 1200,
      heightPx: 720,
    }),
    tableBlock({
      id: "sdof-framework-table",
      sequence: 1,
      title: "Variables y simbolos principales del sistema SDOF",
      rows: [
        ["Simbolo", "Descripcion", "Unidad sintetica"],
        ["m", "Masa concentrada del sistema", "kg"],
        ["c", "Coeficiente de amortiguamiento viscoso", "N·s/m"],
        ["k", "Rigidez lateral equivalente", "N/m"],
        ["u(t)", "Desplazamiento generalizado", "m"],
        ["\\dot{u}(t)", "Velocidad generalizada", "m/s"],
        ["\\ddot{u}(t)", "Aceleracion generalizada", "m/s^2"],
      ],
    }),
  );

  const methodology =
    findSection(sections, (section) => normalizeTitle(section.title).includes("METODO")) ??
    fallbackSection(document, "sdof-metodologia", "Metodologia", "methodology");
  methodology.blocks.push(
    paragraphBlock(
      "sdof-methodology-p1",
      sdofParagraph({
        focus: "la secuencia metodologica para deducir y explicar la respuesta del sistema",
        secondary: "la division del trabajo entre idealizacion, formulacion, solucion y contraste interpretativo",
        exportCheck: "la coexistencia de ecuaciones, tablas y figuras numeradas dentro de un mismo bloque metodologico",
        implication: "que el plan de tesis muestre una hoja de ruta verificable incluso antes de ejecutar un estudio real",
      }),
    ),
    equationBlock("sdof-methodology-eq2", String.raw`\omega_n = \sqrt{\frac{k}{m}}`, "2"),
    paragraphBlock(
      "sdof-methodology-eq2-note",
      "La ecuacion (2) define la frecuencia natural no amortiguada y organiza la transicion hacia la forma canonica del problema.",
    ),
    equationBlock(
      "sdof-methodology-eq3",
      String.raw`u(t) = U_0 e^{-\zeta \omega_n t}\sin(\omega_d t + \phi)`,
      "3",
    ),
    paragraphBlock(
      "sdof-methodology-eq3-note",
      "La ecuacion (3) resume una expresion sintetica de desplazamiento para vibracion libre amortiguada.",
    ),
    equationBlock(
      "sdof-methodology-eq4",
      String.raw`\dot{u}(t) = U_0 e^{-\zeta \omega_n t}\left[\omega_d \cos(\omega_d t + \phi) - \zeta \omega_n \sin(\omega_d t + \phi)\right]`,
      "4",
    ),
    equationBlock(
      "sdof-methodology-eq5",
      String.raw`\ddot{u}(t) = -\frac{c}{m}\dot{u}(t) - \frac{k}{m}u(t)`,
      "5",
    ),
    tableBlock({
      id: "sdof-methodology-table",
      sequence: 2,
      title: "Secuencia sintetica para la deduccion de las respuestas cinematicas",
      rows: [
        ["Etapa", "Entrada", "Salida"],
        ["Equilibrio dinamico", "m, c, k, p(t)", "Ecuacion de movimiento"],
        ["Normalizacion", "Relacion m-k-c", "Forma estandar del sistema"],
        ["Solucion de u(t)", "Condiciones iniciales", "Respuesta de desplazamiento"],
        ["Derivacion", "u(t)", "Respuesta de velocidad"],
        ["Sustitucion/derivacion", "u(t), \\dot{u}(t)", "Respuesta de aceleracion"],
      ],
      note: "La tabla organiza el encadenamiento logico de la deduccion sintetica.",
    }),
    figureBlock({
      id: "sdof-methodology-figure",
      sequence: 3,
      title: "Respuesta sintetica de desplazamiento, velocidad y aceleracion en el tiempo",
      assetKey: "sdof-response-chart",
      widthPx: 1200,
      heightPx: 720,
    }),
    bulletListBlock("sdof-methodology-bullets", [
      "Se parte de una idealizacion lineal del sistema y de un comportamiento elasticamente recuperable.",
      "Se explicitan condiciones iniciales y parametros de amortiguamiento para estructurar la solucion.",
      "La deduccion se presenta en pasos trazables para facilitar la defensa academica del planteamiento.",
      "Cada ecuacion se cita dentro del texto para verificar consistencia editorial y legibilidad tecnica.",
    ]),
  );

  const schedule =
    findSection(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("CRONOGRAMA") || title.includes("PRESUPUESTO");
    }) ??
    fallbackSection(document, "sdof-cronograma", "Cronograma y presupuesto", "schedule");
  schedule.blocks.push(
    paragraphBlock(
      "sdof-schedule-p1",
      sdofParagraph({
        focus: "la organizacion temporal del desarrollo teorico, grafico y documental del tema SDOF",
        secondary: "la necesidad de ordenar revision bibliografica, deduccion, validacion y redaccion",
        exportCheck: "tablas anchas y captions superiores compatibles con un formato institucional reusable",
        implication: "que el plan conserve claridad operativa y trazabilidad del trabajo esperado",
      }),
    ),
    tableBlock({
      id: "sdof-schedule-table",
      sequence: 3,
      title: "Cronograma sintetico del plan de tesis sobre respuesta SDOF",
      rows: [
        ["Actividad", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5"],
        ["Revision teorica", "X", "X", "", "", ""],
        ["Deduccion y notacion", "", "X", "X", "", ""],
        ["Construccion de figuras", "", "", "X", "X", ""],
        ["Redaccion y consistencia", "", "", "", "X", "X"],
        ["Ajuste final", "", "", "", "", "X"],
      ],
    }),
    tableBlock({
      id: "sdof-budget-table",
      sequence: 4,
      title: "Presupuesto sintetico de recursos de trabajo",
      rows: [
        ["Rubro", "Cantidad", "Costo unitario", "Costo total"],
        ["Software de apoyo", "1", "S/ 480", "S/ 480"],
        ["Bibliografia y acceso", "1", "S/ 320", "S/ 320"],
        ["Movilidad academica", "5", "S/ 70", "S/ 350"],
        ["Impresion y presentacion", "3", "S/ 55", "S/ 165"],
      ],
    }),
  );

  const referencesSection =
    findSection(sections, (section) => normalizeTitle(section.title).includes("REFERENC")) ??
    fallbackSection(document, "sdof-references", "Referencias", "references");
  referencesSection.blocks.unshift(
    paragraphBlock(
      "sdof-references-intro",
      "La lista siguiente se mantiene sintetica, pero se presenta al final para validar el cierre bibliografico del documento y su consistencia con las citas internas.",
    ),
  );

  const annexTitle = "Anexo de notacion y verificaciones";
  if (!document.annexes.some((annex) => normalizeTitle(annex.title) === normalizeTitle(annexTitle))) {
    document.annexes.push({
      id: "sdof-annex-1",
      title: annexTitle,
      blocks: [
        paragraphBlock(
          "sdof-annex-p1",
          sdofParagraph({
            focus: "un anexo sintetico para glosario de simbolos y controles de exportacion",
            secondary: "la necesidad de separar apoyo documental del cuerpo central sin perder coherencia visual",
            exportCheck: "tablas adicionales y listas de verificacion en una zona final del documento",
            implication: "que el paquete generado mantenga calidad de lectura hasta el ultimo bloque",
          }),
        ),
        bulletListBlock("sdof-annex-list", [
          "Verificacion de correspondencia entre simbolos del texto y simbolos de las ecuaciones.",
          "Control de captions, notas y fuentes para tablas y figuras.",
          "Revision de consistencia entre referencias sinteticas y citas dentro del documento.",
          "Checklist de titulos, espaciado y numeracion jerarquica.",
        ]),
        tableBlock({
          id: "sdof-annex-table",
          sequence: 5,
          title: "Checklist sintetico de control editorial y tecnico",
          rows: [
            ["Control", "Estado", "Observacion"],
            ["Titulos numerados", "OK", "Se aplico numeracion jerarquica efectiva"],
            ["Ecuaciones numeradas", "OK", "Las ecuaciones aparecen citadas en el texto"],
            ["Figuras embebidas", "OK", "Tres imagenes PNG sinteticas insertadas"],
            ["Referencias finales", "OK", "Se mantiene cierre bibliografico al final"],
          ],
        }),
      ],
    });
  }
}

async function main() {
  loadEnvFile();

  const templateKey = readArg("--template-key") ?? DEFAULT_TEMPLATE_KEY;
  const outputPath =
    readArg("--output") ??
    path.join(process.cwd(), "artifacts-local", "upt-sdof-thesis-plan-example.docx");
  const outputDir = path.join(path.dirname(outputPath), `${path.parse(outputPath).name}.bundle`);

  ensureDir(outputDir);

  const result = await buildCanonicalReportFromTemplateVersion({
    templateKey,
    variantSeed: 3,
  });

  const canonicalDocument = JSON.parse(
    JSON.stringify(result.canonicalDocument),
  ) as CanonicalReportDocument;

  enrichDocument(canonicalDocument, outputDir);

  const canonicalJsonPath = path.join(outputDir, "canonical-report-document.json");
  const summaryJsonPath = path.join(outputDir, "summary.json");
  fs.writeFileSync(canonicalJsonPath, JSON.stringify(canonicalDocument, null, 2));

  await writeCanonicalReportDocxFile({
    document: canonicalDocument,
    outputPath,
  });

  fs.writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      {
        templateKey,
        outputPath,
        canonicalJsonPath,
        sectionCount: canonicalDocument.body.sections.length,
        annexCount: canonicalDocument.annexes.length,
        referenceCount: canonicalDocument.references.length,
        imageAssetCount: canonicalDocument.assets.filter((asset) => asset.kind === "figure_image")
          .length,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        outputPath,
        canonicalJsonPath,
        summaryJsonPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
