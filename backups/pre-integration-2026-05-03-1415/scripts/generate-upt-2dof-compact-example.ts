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

function paragraph(id: string, text: string): CanonicalContentBlock {
  return { id, kind: "paragraph", text };
}

function list(id: string, items: string[]): CanonicalContentBlock {
  return { id, kind: "bullet_list", items };
}

function equation(
  id: string,
  latex: string,
  label: string,
  ommlKey?: string,
): CanonicalContentBlock {
  return {
    id,
    kind: "equation",
    equation: {
      latex,
      label,
      numbered: true,
      alignment: "center",
      omml_key: ommlKey ?? null,
    },
  };
}

function rows(input: string[][]): CanonicalTableRow[] {
  return input.map((row) => ({
    cells: row.map((cell) => ({ text: cell })),
  }));
}

function table(input: {
  id: string;
  sequence: number;
  title: string;
  rows: string[][];
}): CanonicalContentBlock {
  return {
    id: input.id,
    kind: "table",
    table: {
      caption: {
        label: `Tabla ${input.sequence}`,
        title: input.title,
        note: "Nota. Tabla sintetica para validar maquetacion tecnica densa.",
        source_label: "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "top",
      },
      rows: rows(input.rows),
      numbered: true,
    },
  };
}

function figure(input: {
  id: string;
  sequence: number;
  title: string;
  assetKey: string;
  widthPx: number;
  heightPx: number;
}): CanonicalContentBlock {
  return {
    id: input.id,
    kind: "figure",
    figure: {
      caption: {
        label: `Figura ${input.sequence}`,
        title: input.title,
        note: "Nota. Figura sintetica compacta para un sistema de dos grados de libertad.",
        source_label: "Fuente: elaboracion sintetica de Ingeniometrix.",
        position: "bottom",
      },
      placeholder_text: "Esquema sintetico 2GDL.",
      numbered: true,
      image_asset_key: input.assetKey,
      image_width_px: input.widthPx,
      image_height_px: input.heightPx,
    },
  };
}

function shortTechnicalParagraph(topic: string) {
  return [
    `Este bloque sintetico resume ${topic} dentro de un plan de tesis tecnico y compacto.`,
    "La finalidad es tensionar la plantilla con notacion matricial, captions y tablas profesionales, manteniendo una longitud breve y claramente no academica.",
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
    const child = findSection(section.children, matcher);
    if (child) {
      return child;
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

function create2DofAsset(outputDir: string) {
  const assetsDir = path.join(outputDir, "assets");
  ensureDir(assetsDir);
  const imagePath = path.join(assetsDir, "dos-gdl-esquema.png");

  const script = `
from PIL import Image, ImageDraw, ImageFont
FONT = ImageFont.load_default()
image = Image.new("RGB", (1200, 700), "white")
draw = ImageDraw.Draw(image)
draw.text((220, 60), "Sistema sintetico de dos grados de libertad", fill="#0B132B", font=FONT)
draw.rectangle((320, 180, 520, 320), outline="#173F5F", width=8, fill="#D9EAF7")
draw.rectangle((700, 140, 900, 280), outline="#173F5F", width=8, fill="#D9EAF7")
draw.text((405, 240), "m1", fill="#173F5F", font=FONT)
draw.text((785, 200), "m2", fill="#173F5F", font=FONT)
for y in range(180, 320, 24):
    draw.line((190, y, 240, y + 12), fill="#C95D63", width=5)
    draw.line((240, y + 12, 190, y + 24), fill="#C95D63", width=5)
draw.line((190, 180, 190, 320), fill="#173F5F", width=7)
draw.line((520, 250, 700, 210), fill="#C95D63", width=6)
draw.line((520, 260, 700, 220), fill="#C95D63", width=6)
draw.line((700, 280, 980, 280), fill="#173F5F", width=7)
draw.line((980, 120, 980, 320), fill="#173F5F", width=7)
draw.text((135, 145), "k1, c1", fill="#173F5F", font=FONT)
draw.text((560, 180), "k2, c2", fill="#173F5F", font=FONT)
draw.line((420, 320, 420, 520), fill="#173F5F", width=6)
draw.line((800, 280, 800, 520), fill="#173F5F", width=6)
draw.polygon([(410, 520), (430, 520), (420, 548)], fill="#173F5F")
draw.polygon([(790, 520), (810, 520), (800, 548)], fill="#173F5F")
draw.text((438, 500), "u1(t)", fill="#173F5F", font=FONT)
draw.text((818, 500), "u2(t)", fill="#173F5F", font=FONT)
image.save(r"${imagePath.replace("\\", "\\\\")}")
`;

  execFileSync(WORKSPACE_PYTHON, ["-c", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return {
    asset_key: "two-dof-schematic",
    kind: "figure_image",
    role: "generic",
    stored_path: imagePath,
    mime_type: "image/png",
    width_px: 1200,
    height_px: 700,
  } satisfies CanonicalAssetRef;
}

function enrich(document: CanonicalReportDocument, outputDir: string) {
  document.assets.push(create2DofAsset(outputDir));

  const intro =
    findSection(document.body.sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("INTRODUCCION") || title.includes("JUSTIFICACION");
    }) ??
    fallbackSection(document, "two-dof-intro", "Introduccion y justificacion", "problem_statement");
  intro.blocks = [
    paragraph(
      "two-dof-intro-p1",
      shortTechnicalParagraph(
        "la formulacion matricial de un sistema de dos grados de libertad en dinamica de estructuras",
      ),
    ),
    figure({
      id: "two-dof-intro-figure",
      sequence: 1,
      title: "Esquema sintetico del sistema de dos grados de libertad",
      assetKey: "two-dof-schematic",
      widthPx: 1200,
      heightPx: 700,
    }),
  ];
  intro.children = [];

  const theory =
    findSection(document.body.sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("MARCO") || title.includes("BASE") || title.includes("ANTECEDENTE");
    }) ??
    fallbackSection(document, "two-dof-theory", "Marco teorico", "theoretical_framework");
  theory.blocks = [
    paragraph(
      "two-dof-theory-p1",
      shortTechnicalParagraph(
        "los supuestos de linealidad, masas concentradas y amortiguamiento viscoso asociados al modelo 2GDL",
      ),
    ),
    table({
      id: "two-dof-theory-table",
      sequence: 1,
      title: "Variables y simbolos del sistema 2GDL",
      rows: [
        ["Simbolo", "Descripcion"],
        ["m1, m2", "Masas concentradas"],
        ["k1, k2", "Rigideces equivalentes"],
        ["c1, c2", "Amortiguamientos viscosos"],
        ["u1(t), u2(t)", "Desplazamientos generalizados"],
        ["ω1, ω2", "Frecuencias naturales modales"],
      ],
    }),
  ];
  theory.children = [];

  const methodology =
    findSection(document.body.sections, (section) => normalizeTitle(section.title).includes("METODO")) ??
    fallbackSection(document, "two-dof-method", "Metodologia", "methodology");
  methodology.blocks = [
    paragraph(
      "two-dof-method-p1",
      shortTechnicalParagraph(
        "la deduccion compacta de las matrices de masa, amortiguamiento y rigidez, asi como de la ecuacion modal del sistema",
      ),
    ),
    equation(
      "two-dof-eq1",
      String.raw`\mathbf{M}\ddot{\mathbf{u}} + \mathbf{C}\dot{\mathbf{u}} + \mathbf{K}\mathbf{u} = \mathbf{0}`,
      "1",
      "tdof-matrix-motion",
    ),
    paragraph(
      "two-dof-eq1-note",
      "La ecuacion (1) resume el equilibrio dinamico matricial del sistema.",
    ),
    equation(
      "two-dof-eq2",
      String.raw`\det(\mathbf{K} - \omega^2\mathbf{M}) = 0`,
      "2",
      "tdof-characteristic",
    ),
    paragraph(
      "two-dof-eq2-note",
      "La ecuacion (2) expresa la condicion caracteristica del sistema.",
    ),
    equation(
      "two-dof-eq3",
      String.raw`\mathbf{u}(t) = \mathbf{\Phi}\mathbf{q}(t)`,
      "3",
      "tdof-modal-transform",
    ),
    equation(
      "two-dof-eq4",
      String.raw`\{\omega_1,\omega_2\} = f(\mathbf{M},\mathbf{K})`,
      "4",
      "tdof-modal-frequencies",
    ),
    table({
      id: "two-dof-method-table-1",
      sequence: 2,
      title: "Matrices sinteticas del sistema 2GDL",
      rows: [
        ["Matriz", "Forma sintetica"],
        ["[M]", "[[m1, 0], [0, m2]]"],
        ["[C]", "[[c1 + c2, -c2], [-c2, c2]]"],
        ["[K]", "[[k1 + k2, -k2], [-k2, k2]]"],
      ],
    }),
    table({
      id: "two-dof-method-table-2",
      sequence: 3,
      title: "Secuencia de deduccion del modelo",
      rows: [
        ["Etapa", "Salida sintetica"],
        ["Equilibrio en cada masa", "Sistema acoplado de ecuaciones diferenciales"],
        ["Ensamblaje matricial", "Ecuacion global del sistema"],
        ["Problema caracteristico", "Frecuencias y modos naturales"],
        ["Transformacion modal", "Sistema desacoplado"],
      ],
    }),
  ];
  methodology.children = [];

  const schedule =
    findSection(document.body.sections, (section) => {
      const title = normalizeTitle(section.title);
      return title.includes("CRONOGRAMA") || title.includes("PRESUPUESTO");
    }) ??
    fallbackSection(document, "two-dof-schedule", "Cronograma y recursos", "schedule");
  schedule.blocks = [
    table({
      id: "two-dof-schedule-table",
      sequence: 4,
      title: "Cronograma sintetico del estudio compacto",
      rows: [
        ["Actividad", "Sem 1", "Sem 2", "Sem 3", "Sem 4"],
        ["Revision teorica", "X", "X", "", ""],
        ["Deduccion matricial", "", "X", "X", ""],
        ["Consolidacion tabular", "", "", "X", ""],
        ["Redaccion final", "", "", "", "X"],
      ],
    }),
    table({
      id: "two-dof-budget-table",
      sequence: 5,
      title: "Recursos sinteticos requeridos",
      rows: [
        ["Rubro", "Costo sintetico"],
        ["Software de apoyo", "S/ 420"],
        ["Bibliografia", "S/ 280"],
        ["Impresion", "S/ 95"],
      ],
    }),
  ];
  schedule.children = [];

  const references =
    findSection(document.body.sections, (section) => normalizeTitle(section.title).includes("REFERENC")) ??
    fallbackSection(document, "two-dof-references", "Referencias", "references");
  references.children = [];

  document.body.sections = [intro, theory, methodology, schedule, references];
  document.annexes = [];
}

async function main() {
  loadEnvFile();

  const templateKey = readArg("--template-key") ?? DEFAULT_TEMPLATE_KEY;
  const outputPath =
    readArg("--output") ??
    path.join(process.cwd(), "artifacts-local", "upt-2dof-compact-example.docx");
  const outputDir = path.join(path.dirname(outputPath), `${path.parse(outputPath).name}.bundle`);
  ensureDir(outputDir);

  const result = await buildCanonicalReportFromTemplateVersion({
    templateKey,
    variantSeed: 2,
  });
  const canonicalDocument = JSON.parse(
    JSON.stringify(result.canonicalDocument),
  ) as CanonicalReportDocument;

  enrich(canonicalDocument, outputDir);

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
