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

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
  return {
    id,
    kind: "paragraph",
    text,
  };
}

function numberedListBlock(id: string, items: string[]): CanonicalContentBlock {
  return {
    id,
    kind: "numbered_list",
    items,
  };
}

function bulletListBlock(id: string, items: string[]): CanonicalContentBlock {
  return {
    id,
    kind: "bullet_list",
    items,
  };
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

function tableRows(rows: string[][]): CanonicalTableRow[] {
  return rows.map((row) => ({
    cells: row.map((cell) => ({
      text: cell,
    })),
  }));
}

function tableBlock(input: {
  id: string;
  sequence: number;
  title: string;
  rows: string[][];
  note?: string;
  sourceLabel?: string;
}): CanonicalContentBlock {
  return {
    id: input.id,
    kind: "table",
    table: {
      caption: {
        label: `Tabla ${input.sequence}`,
        title: input.title,
        note: input.note ?? null,
        source_label: input.sourceLabel ?? "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "top",
      },
      rows: tableRows(input.rows),
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
        note: input.note ?? null,
        source_label: "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "bottom",
      },
      placeholder_text: "Figura sintetica de apoyo.",
      numbered: true,
      image_asset_key: input.assetKey,
      image_width_px: input.widthPx,
      image_height_px: input.heightPx,
    },
  };
}

function composeAcademicParagraph(input: {
  topic: string;
  emphasis: string;
  method: string;
  implication: string;
  traceability: string;
}) {
  return [
    `Este bloque sintetico desarrolla ${input.topic} desde la perspectiva de un plan de tesis de maestria en ingenieria civil con mencion en estructuras.`,
    `Se enfatiza ${input.emphasis} para comprobar que la plantilla sostenga una argumentacion continua, una jerarquia de subtitulos estable y un espaciado compatible con lectura academica.`,
    `Asimismo, se incorpora ${input.method} con el fin de tensionar el tratamiento conjunto de parrafos, tablas, figuras, ecuaciones y referencias sin recurrir a resultados reales.`,
    `La redaccion tambien remarca ${input.implication}, lo que permite observar como el renderer resuelve transiciones entre narrativa tecnica, bloques numerados y material grafico incrustado.`,
    `Finalmente, se conserva ${input.traceability} para que el documento siga siendo claramente sintetico, trazable y no utilizable como producto academico final.`,
  ].join(" ");
}

function findSectionByMatcher(
  sections: CanonicalSectionNode[],
  matcher: (section: CanonicalSectionNode) => boolean,
): CanonicalSectionNode | null {
  for (const section of sections) {
    if (matcher(section)) {
      return section;
    }

    const childMatch = findSectionByMatcher(section.children, matcher);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function createFallbackSection(
  document: CanonicalReportDocument,
  input: {
    id: string;
    title: string;
    semanticKey?: string | null;
    blocks?: CanonicalContentBlock[];
  },
) {
  const section: CanonicalSectionNode = {
    id: input.id,
    title: input.title,
    level: 1,
    semantic_key: input.semanticKey ?? null,
    blocks: input.blocks ?? [],
    children: [],
  };
  document.body.sections.push(section);
  return section;
}

function createSyntheticFigureAssets(outputDir: string) {
  const assetsDir = path.join(outputDir, "assets");
  ensureDir(assetsDir);

  const diagramPath = path.join(assetsDir, "figura-diagrama-metodologico.png");
  const chartPath = path.join(assetsDir, "figura-avance-fases.png");
  const modelPath = path.join(assetsDir, "figura-modelo-estructural.png");

  const script = `
from PIL import Image, ImageDraw, ImageFont

FONT = ImageFont.load_default()

def save_flowchart(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    boxes = [
        ((80, 120, 320, 220), "Problema"),
        ((440, 120, 760, 220), "Objetivos"),
        ((840, 120, 1120, 220), "Variables"),
        ((160, 400, 470, 520), "Metodo"),
        ((560, 400, 1040, 520), "Resultados esperados"),
    ]
    for coords, text in boxes:
        draw.rounded_rectangle(coords, radius=18, outline="#1F3A93", width=5, fill="#EAF2FF")
        draw.text((coords[0] + 24, coords[1] + 42), text, fill="#0B1F44", font=FONT)
    arrows = [
        ((320, 170), (440, 170)),
        ((760, 170), (840, 170)),
        ((270, 220), (315, 400)),
        ((650, 220), (650, 400)),
        ((900, 220), (860, 400)),
        ((470, 460), (560, 460)),
    ]
    for start, end in arrows:
        draw.line([start, end], fill="#C97C00", width=7)
        draw.ellipse((end[0] - 8, end[1] - 8, end[0] + 8, end[1] + 8), fill="#C97C00")
    image.save(path)

def save_bar_chart(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    draw.line((120, 600, 1080, 600), fill="#333333", width=4)
    draw.line((120, 120, 120, 600), fill="#333333", width=4)
    phases = [
        ("Recoleccion", 140),
        ("Modelado", 260),
        ("Analisis", 330),
        ("Validacion", 250),
        ("Redaccion", 300),
    ]
    x = 180
    colors = ["#274690", "#576CA8", "#302B63", "#6A8CAF", "#9EC1CF"]
    for index, (label, height) in enumerate(phases):
        draw.rectangle((x, 600 - height, x + 110, 600), fill=colors[index], outline="#1C2541")
        draw.text((x, 615), label, fill="#0B132B", font=FONT)
        draw.text((x + 28, 600 - height - 24), str(height), fill="#0B132B", font=FONT)
        x += 170
    draw.text((140, 60), "Distribucion sintetica del esfuerzo por fase", fill="#0B132B", font=FONT)
    image.save(path)

def save_structural_model(path):
    image = Image.new("RGB", (1200, 720), "white")
    draw = ImageDraw.Draw(image)
    for x in range(180, 1081, 180):
        draw.line((x, 180, x, 560), fill="#1F3A93", width=10)
    for y in [180, 300, 420, 540]:
        draw.line((180, y, 1080, y), fill="#C97C00", width=8)
    draw.line((180, 540, 630, 120), fill="#556B2F", width=8)
    draw.line((1080, 540, 630, 120), fill="#556B2F", width=8)
    draw.text((180, 70), "Esquema sintetico de pórtico y cubierta", fill="#0B132B", font=FONT)
    draw.text((210, 585), "Base", fill="#0B132B", font=FONT)
    draw.text((620, 90), "Nudo superior", fill="#0B132B", font=FONT)
    image.save(path)

save_flowchart(r"${diagramPath.replace("\\", "\\\\")}")
save_bar_chart(r"${chartPath.replace("\\", "\\\\")}")
save_structural_model(r"${modelPath.replace("\\", "\\\\")}")
`;

  execFileSync(WORKSPACE_PYTHON, ["-c", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const assets: CanonicalAssetRef[] = [
    {
      asset_key: "synthetic-methodology-diagram",
      kind: "figure_image",
      role: "generic",
      stored_path: diagramPath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
    {
      asset_key: "synthetic-phase-chart",
      kind: "figure_image",
      role: "generic",
      stored_path: chartPath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
    {
      asset_key: "synthetic-structural-model",
      kind: "figure_image",
      role: "generic",
      stored_path: modelPath,
      mime_type: "image/png",
      width_px: 1200,
      height_px: 720,
    },
  ];

  return assets;
}

function enrichDocument(document: CanonicalReportDocument, outputDir: string) {
  document.warnings.push(
    "Ejemplo sintetico extendido para revisar maquetacion de aproximadamente diez paginas.",
  );

  const syntheticAssets = createSyntheticFigureAssets(outputDir);
  document.assets.push(...syntheticAssets);

  const sections = document.body.sections;

  const problemSection =
    findSectionByMatcher(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("INTRODUCCION") || title.includes("JUSTIFICACION");
    }) ??
    createFallbackSection(document, {
      id: "synthetic-problem-section",
      title: "Introduccion y justificacion",
      semanticKey: "problem_statement",
    });
  problemSection.blocks.push(
    paragraphBlock(
      "synthetic-problem-p1",
      composeAcademicParagraph({
        topic: "la delimitacion del problema y su relevancia institucional",
        emphasis: "la necesidad de describir contexto, brecha y justificacion en una sola secuencia argumental",
        method: "una explicacion escalonada del escenario, de los actores involucrados y de los criterios de priorizacion del estudio",
        implication: "como un plan de tesis tecnico puede exponer valor academico sin prometer resultados todavia inexistentes",
        traceability: "la advertencia expresa de que todo el contenido es sintetico y solo sirve para pruebas de formato",
      }),
    ),
    paragraphBlock(
      "synthetic-problem-p2",
      composeAcademicParagraph({
        topic: "la pertinencia del caso de uso para programas de posgrado en estructuras",
        emphasis: "la coherencia entre motivacion, alcance preliminar y preguntas de investigacion",
        method: "una narrativa que menciona diagnostico, restricciones operativas y criterios de evaluacion del desempeño estructural",
        implication: "como el lector puede anticipar el sentido del estudio antes de entrar a los apartados de objetivos y metodologia",
        traceability: "un lenguaje prudente que evita conclusiones definitivas y mantiene trazabilidad de prueba",
      }),
    ),
    figureBlock({
      id: "synthetic-problem-figure",
      sequence: 1,
      title: "Relacion sintetica entre problema, objetivos y resultados esperados",
      assetKey: "synthetic-methodology-diagram",
      widthPx: 1200,
      heightPx: 720,
      note: "La figura valida la insercion de una imagen PNG con caption y nota en el cuerpo principal.",
    }),
  );

  const objectivesSection =
    findSectionByMatcher(sections, (section) => normalizeTitle(section.title).includes("OBJETIV")) ??
    createFallbackSection(document, {
      id: "synthetic-objectives-section",
      title: "Objetivos",
      semanticKey: "objectives",
    });
  objectivesSection.blocks.push(
    paragraphBlock(
      "synthetic-objectives-p1",
      composeAcademicParagraph({
        topic: "la articulacion entre objetivo general y objetivos especificos",
        emphasis: "la progresion logica entre formulacion, modelado, validacion y comunicacion de hallazgos esperados",
        method: "verbos de investigacion aplicados a una secuencia razonable de trabajo academico",
        implication: "que la plantilla pueda mostrar listas numeradas sin perder continuidad ni claridad tipografica",
        traceability: "una separacion nitida entre contenido sintetico y estructura reusable de la plantilla",
      }),
    ),
    numberedListBlock("synthetic-objectives-list", [
      "Caracterizar el problema tecnico de manera consistente con el alcance del plan de tesis.",
      "Definir variables, supuestos y criterios de evaluacion para un escenario controlado de prueba.",
      "Proponer un esquema metodologico con etapas, insumos, salidas y mecanismos de validacion.",
      "Establecer productos intermedios que faciliten trazabilidad entre tablas, figuras y anexos.",
      "Verificar la robustez del renderer DOCX frente a un documento academico sintetico de mayor longitud.",
    ]),
  );

  const theorySection =
    findSectionByMatcher(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("ESTADO DEL ARTE") || title.includes("MARCO");
    }) ??
    createFallbackSection(document, {
      id: "synthetic-theory-section",
      title: "Estado del arte",
      semanticKey: "theoretical_framework",
    });
  theorySection.blocks.push(
    paragraphBlock(
      "synthetic-theory-p1",
      composeAcademicParagraph({
        topic: "la revision sintetica de antecedentes y bases conceptuales",
        emphasis: "la necesidad de enlazar estudios previos, categorias analiticas y criterios de comparacion",
        method: "un repaso estructurado de enfoques, variables y tecnicas de medicion que suelen aparecer en planes de tesis de ingenieria",
        implication: "que el documento muestre subtitulos, citas y figuras dentro de un flujo narrativo continuo",
        traceability: "referencias sinteticas claramente marcadas y ajenas a cualquier afirmacion empirica real",
      }),
    ),
    paragraphBlock(
      "synthetic-theory-p2",
      composeAcademicParagraph({
        topic: "la necesidad de definir un marco conceptual operativo",
        emphasis: "la consistencia terminologica entre rigidez, demanda, capacidad, incertidumbre y validacion",
        method: "parrafos suficientemente largos para tensionar saltos de pagina, espaciado y continuidad visual",
        implication: "que el lector pueda distinguir sin ambiguedad el cierre de una idea y la transicion hacia la siguiente",
        traceability: "expresiones claramente sinteticas que no suplantan bibliografia real",
      }),
    ),
    equationBlock("synthetic-theory-eq1", String.raw`R = \frac{\sigma}{\varepsilon}`, "eq:rigidez"),
    figureBlock({
      id: "synthetic-theory-figure",
      sequence: 2,
      title: "Distribucion sintetica del esfuerzo por fases de revision y modelado",
      assetKey: "synthetic-phase-chart",
      widthPx: 1200,
      heightPx: 720,
      note: "La figura prueba el comportamiento del renderer con un grafico raster embebido.",
    }),
  );

  const methodologySection =
    findSectionByMatcher(sections, (section) => normalizeTitle(section.title).includes("METODO")) ??
    createFallbackSection(document, {
      id: "synthetic-methodology-section",
      title: "Metodologia",
      semanticKey: "methodology",
    });
  methodologySection.blocks.push(
    paragraphBlock(
      "synthetic-methodology-p1",
      composeAcademicParagraph({
        topic: "la definicion de una ruta metodologica reproducible",
        emphasis: "la secuencia entre levantamiento de informacion, formulacion del modelo y contraste de escenarios",
        method: "subetapas claramente descritas para observar como el documento distribuye contenido denso en varias paginas",
        implication: "la necesidad de que ecuaciones, tablas y figuras convivan sin deformar margenes ni captions",
        traceability: "marcadores sinteticos que permiten distinguir assets de prueba y contenido no academico",
      }),
    ),
    paragraphBlock(
      "synthetic-methodology-p2",
      composeAcademicParagraph({
        topic: "la operacionalizacion de las variables y de los indicadores de desempeno",
        emphasis: "la definicion de supuestos, restricciones y criterios de interpretacion antes del analisis final",
        method: "una combinacion de descripcion textual, formulacion simbolica y tablas comparativas de apoyo",
        implication: "que la plantilla preserve legibilidad cuando un mismo apartado concentra narrativa y notacion matematica",
        traceability: "una redaccion controlada que no introduce datos reales ni conclusiones verificables",
      }),
    ),
    equationBlock(
      "synthetic-methodology-eq1",
      String.raw`\hat{y} = \beta_0 + \beta_1 x_1 + \varepsilon`,
      "eq:modelo-lineal",
    ),
    equationBlock(
      "synthetic-methodology-eq2",
      String.raw`RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^2}`,
      "eq:rmse",
    ),
    equationBlock(
      "synthetic-methodology-eq3",
      String.raw`FS = \frac{R}{S}`,
      "eq:factor-seguridad",
    ),
    tableBlock({
      id: "synthetic-methodology-table-1",
      sequence: 3,
      title: "Matriz sintetica de variables, indicadores y expresiones de prueba",
      rows: [
        ["Variable", "Indicador", "Expresion", "Observacion"],
        ["Rigidez lateral", "Desplazamiento maximo", "K = F / \\Delta", "Relacion carga-desplazamiento"],
        ["Ajuste del modelo", "Error cuadratico", "RMSE = \\sqrt{\\frac{1}{n}\\sum (y_i-\\hat{y}_i)^2}", "Control de dispersion"],
        ["Seguridad", "Indice demanda-capacidad", "FS = R / S", "Capacidad frente a solicitacion"],
        ["Sensibilidad", "Cambio relativo", "\\Delta R / R", "Comparacion entre escenarios"],
      ],
      note: "La tabla incorpora expresiones de ejemplo para comprobar el saneamiento del texto matematico dentro de celdas.",
    }),
    figureBlock({
      id: "synthetic-methodology-figure",
      sequence: 3,
      title: "Esquema sintetico de modelo estructural y relaciones entre elementos",
      assetKey: "synthetic-structural-model",
      widthPx: 1200,
      heightPx: 720,
      note: "La imagen ilustra un soporte grafico de prueba en una seccion con ecuaciones y tablas.",
    }),
  );

  const scheduleSection =
    findSectionByMatcher(sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("CRONOGRAMA") || title.includes("PRESUPUESTO");
    }) ??
    createFallbackSection(document, {
      id: "synthetic-schedule-section",
      title: "Cronograma y presupuesto",
      semanticKey: "schedule",
    });
  scheduleSection.blocks.push(
    paragraphBlock(
      "synthetic-schedule-p1",
      composeAcademicParagraph({
        topic: "la programacion de actividades y la prevision de recursos",
        emphasis: "la necesidad de presentar una secuencia temporal creible y un presupuesto resumido",
        method: "tablas sinteticas que distribuyen actividades, entregables y costos por bloque de trabajo",
        implication: "que el documento soporte informacion tabular consecutiva sin colapsar caption, notas ni saltos de pagina",
        traceability: "un etiquetado expreso que mantiene el caracter ficticio del ejemplo",
      }),
    ),
    tableBlock({
      id: "synthetic-schedule-table",
      sequence: 4,
      title: "Cronograma sintetico de actividades por etapa",
      rows: [
        ["Actividad", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5"],
        ["Revision documental", "X", "X", "", "", ""],
        ["Modelado y supuestos", "", "X", "X", "", ""],
        ["Analisis comparativo", "", "", "X", "X", ""],
        ["Redaccion y ajuste", "", "", "", "X", "X"],
        ["Cierre y anexos", "", "", "", "", "X"],
      ],
      note: "El cronograma se usa para validar tablas anchas y continuidad visual en paginas sucesivas.",
    }),
    tableBlock({
      id: "synthetic-budget-table",
      sequence: 5,
      title: "Presupuesto sintetico resumido",
      rows: [
        ["Rubro", "Cantidad", "Costo unitario", "Costo total"],
        ["Software especializado", "1", "S/ 650", "S/ 650"],
        ["Levantamiento y movilidad", "6", "S/ 90", "S/ 540"],
        ["Impresion y encuadernado", "3", "S/ 45", "S/ 135"],
        ["Reserva de contingencia", "1", "S/ 250", "S/ 250"],
      ],
    }),
  );

  const annexTitle = "Anexos de prueba";
  const annexExists = document.annexes.some(
    (annex) => normalizeTitle(annex.title) === normalizeTitle(annexTitle),
  );
  if (!annexExists) {
    document.annexes.push({
      id: "synthetic-annex-1",
      title: annexTitle,
      blocks: [
        paragraphBlock(
          "synthetic-annex-p1",
          composeAcademicParagraph({
            topic: "un apendice sintetico para validar continuidad del paquete final",
            emphasis: "la persistencia de estilos de titulo, parrafo y notas fuera del cuerpo principal",
            method: "listas y tablas adicionales con densidad suficiente para estresar la exportacion",
            implication: "que la navegacion del lector siga siendo clara al pasar de secciones a anexos",
            traceability: "la etiqueta explicita de material sintetico no academico",
          }),
        ),
        bulletListBlock("synthetic-annex-bullets", [
          "Lista de supuestos de prueba para el caso estructural sintetico.",
          "Resumen de criterios de seleccion de variables y escenarios.",
          "Inventario de captions, ecuaciones y figuras usadas en la maqueta.",
          "Notas de control para revisar coherencia del export DOCX.",
        ]),
        tableBlock({
          id: "synthetic-annex-table",
          sequence: 6,
          title: "Checklist sintetico de validacion del documento",
          rows: [
            ["Control", "Estado", "Observacion"],
            ["Portada con logo", "OK", "Mantiene proporcion del asset institucional"],
            ["Ecuaciones renderizadas", "OK", "Sin LaTeX crudo en la salida"],
            ["Figuras embebidas", "OK", "PNG insertado con caption y nota"],
            ["Tablas extensas", "OK", "Se conservan bordes y cabeceras"],
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
    path.join(process.cwd(), "artifacts-local", "extended-thesis-plan-example-pucp.docx");
  const outputDir = path.join(
    path.dirname(outputPath),
    `${path.parse(outputPath).name}.bundle`,
  );

  ensureDir(outputDir);

  const result = await buildCanonicalReportFromTemplateVersion({
    templateKey,
    variantSeed: 4,
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
