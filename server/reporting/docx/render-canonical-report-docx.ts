import fs from "node:fs";
import path from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  type IParagraphOptions,
  type IRunOptions,
  ImageRun,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSubScript,
  MathSum,
  MathSuperScript,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from "docx";

import type {
  CanonicalAssetRef,
  CanonicalCaption,
  CanonicalContentBlock,
  CanonicalReportDocument,
  CanonicalSectionNode,
} from "@/server/reporting/canonical-report-types";
import { buildProfessionalMathForEquation } from "@/server/reporting/docx/omml-equation-builder";

const DEFAULT_FONT = "Times New Roman";
const NUMBERING_REFERENCE = "imx-decimal";

function cmToTwip(value: number) {
  return Math.round(value * 566.93);
}

function pointToHalfPoint(value: number) {
  return Math.round(value * 2);
}

function pointToTwip(value: number) {
  return Math.round(value * 20);
}

function lineSpacingToTwip(value: number) {
  return Math.round(value * 240);
}

function resolvePageSize(paperSize: string | null | undefined) {
  if ((paperSize ?? "").toUpperCase() === "A4") {
    return {
      width: 11906,
      height: 16838,
    };
  }

  return undefined;
}

function resolveHeadingLevel(level: number) {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    default:
      return HeadingLevel.HEADING_5;
  }
}

function resolveTitleRule(document: CanonicalReportDocument, level: number) {
  return (
    document.presentation.titles.find((item) => item.level === level) ?? {
      level,
      numbered: false,
      uppercase: false,
      numbering_format: "level_decimal" as const,
      spacing_before_pt: 12,
      spacing_after_pt: 6,
    }
  );
}

function resolveTitleUppercase(
  document: CanonicalReportDocument,
  level: number,
  title: string,
) {
  const rule = document.presentation.titles.find((item) => item.level === level);
  return rule?.uppercase ? title.toUpperCase() : title;
}

function baseTextRun(
  document: CanonicalReportDocument,
  text: string,
  options?: Partial<IRunOptions>,
) {
  return new TextRun({
    text,
    font: document.presentation.paragraph.font_family ?? DEFAULT_FONT,
    size: pointToHalfPoint(document.presentation.paragraph.font_size_pt ?? 12),
    ...options,
  });
}

function baseParagraph(
  document: CanonicalReportDocument,
  options: IParagraphOptions,
) {
  const paragraphRules = document.presentation.paragraph;
  return new Paragraph({
    spacing: {
      line: lineSpacingToTwip(paragraphRules.line_spacing ?? 1.5),
      before: pointToTwip(paragraphRules.space_before_pt ?? 0),
      after: pointToTwip(paragraphRules.space_after_pt ?? 6),
      ...(options.spacing ?? {}),
    },
    indent: {
      firstLine:
        paragraphRules.first_line_indent_cm != null
          ? cmToTwip(paragraphRules.first_line_indent_cm)
          : undefined,
      ...(options.indent ?? {}),
    },
    ...options,
  });
}

function captionParagraph(
  document: CanonicalReportDocument,
  caption: CanonicalCaption,
) {
  const captionRules = document.presentation.caption ?? {};
  const separator = captionRules.separator ?? ". ";
  const label = caption.label?.trim();
  const title = caption.title.trim();
  const captionText =
    label && !title.startsWith(label)
      ? captionRules.prefix_style === "label_colon_title"
        ? `${label}:${separator === ": " ? "" : " "}${title}`
        : captionRules.prefix_style === "label_title"
          ? `${label}${separator}${title}`
          : `${label}.${separator === ". " ? " " : separator}${title}`
      : title;
  return baseParagraph(document, {
    alignment: AlignmentType.CENTER,
    indent: {
      firstLine: 0,
    },
    children: [
      baseTextRun(document, captionText, {
        italics: captionRules.font_style === "italic",
        bold: captionRules.font_style === "bold",
      }),
    ],
  });
}

function noteParagraph(document: CanonicalReportDocument, text: string) {
  return baseParagraph(document, {
    alignment: AlignmentType.LEFT,
    indent: {
      firstLine: 0,
    },
    children: [
      baseTextRun(document, text, {
        italics: true,
      }),
    ],
  });
}

function resolveParagraphAlignment(document: CanonicalReportDocument) {
  switch (document.presentation.paragraph.alignment) {
    case "center":
      return AlignmentType.CENTER;
    case "left":
      return AlignmentType.LEFT;
    case "justify":
    default:
      return AlignmentType.JUSTIFIED;
  }
}

function formatSectionTitle(input: {
  document: CanonicalReportDocument;
  section: CanonicalSectionNode;
  counters: number[];
}) {
  const { document, section, counters } = input;
  const titleRule = resolveTitleRule(document, section.level);
  const targetIndex = section.level - 1;

  while (counters.length <= targetIndex) {
    counters.push(0);
  }
  counters[targetIndex] += 1;
  for (let index = targetIndex + 1; index < counters.length; index += 1) {
    counters[index] = 0;
  }

  const baseTitle = resolveTitleUppercase(document, section.level, section.title);
  const alreadyNumbered = /^\d+(\.\d+)*\s+/.test(baseTitle);
  if (!titleRule.numbered || alreadyNumbered) {
    return {
      text: baseTitle,
      spacingBeforePt: titleRule.spacing_before_pt ?? 12,
      spacingAfterPt: titleRule.spacing_after_pt ?? 6,
    };
  }

  const visibleCounters =
    titleRule.numbering_format === "level_decimal"
      ? counters.slice(0, targetIndex + 1).filter((value) => value > 0)
      : [counters[targetIndex]];

  return {
    text: `${visibleCounters.join(".")}. ${baseTitle}`,
    spacingBeforePt: titleRule.spacing_before_pt ?? 12,
    spacingAfterPt: titleRule.spacing_after_pt ?? 6,
  };
}

function resolveAssetByKey(document: CanonicalReportDocument, assetKey: string | null) {
  if (!assetKey) {
    return null;
  }

  return document.assets.find((asset) => asset.asset_key === assetKey) ?? null;
}

function imageTypeFromAsset(asset: CanonicalAssetRef) {
  const mime = asset.mime_type?.toLowerCase() ?? "";
  if (mime.includes("png")) {
    return "png" as const;
  }

  if (mime.includes("gif")) {
    return "gif" as const;
  }

  if (mime.includes("bmp")) {
    return "bmp" as const;
  }

  return "jpg" as const;
}

function renderCover(document: CanonicalReportDocument) {
  const children: FileChild[] = [];
  const logoField = document.cover.fields.find((field) => field.value_type === "asset") ?? null;
  const logoAsset = resolveAssetByKey(document, logoField?.value ?? null);

  if (logoAsset?.stored_path && fs.existsSync(logoAsset.stored_path)) {
    const imageBuffer = fs.readFileSync(logoAsset.stored_path);
    const originalWidth = logoAsset.width_px ?? 240;
    const originalHeight = logoAsset.height_px ?? 120;
    const maxWidth = 150;
    const scaledWidth = globalThis.Math.min(maxWidth, originalWidth);
    const scaledHeight = globalThis.Math.max(
      1,
      globalThis.Math.round((scaledWidth / originalWidth) * originalHeight),
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new ImageRun({
            type: imageTypeFromAsset(logoAsset),
            data: imageBuffer,
            transformation: {
              width: scaledWidth,
              height: scaledHeight,
            },
          }),
        ],
      }),
    );
  }

  if (document.cover.document_label) {
    children.push(
      baseParagraph(document, {
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          baseTextRun(document, document.cover.document_label.toUpperCase(), {
            bold: true,
          }),
        ],
      }),
    );
  }

  for (const field of document.cover.fields) {
    if (field.value_type === "asset" || !field.value) {
      continue;
    }

    children.push(
      baseParagraph(document, {
        alignment: AlignmentType.CENTER,
        children: [baseTextRun(document, field.value, { bold: field.key === "university_name" })],
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  return children;
}

function latexToReadableText(value: string) {
  return value
    .replace(/\\hat\{y\}/g, "ŷ")
    .replace(/\\beta_0/g, "β0")
    .replace(/\\beta_1/g, "β1")
    .replace(/x_1/g, "x1")
    .replace(/\\varepsilon/g, "ε")
    .replace(/\\sqrt\{/g, "sqrt(")
    .replace(/\\frac\{1\}\{n\}/g, "1/n")
    .replace(/\\sum_\{i=1\}\^\{n\}/g, "Σ(i=1..n)")
    .replace(/\\sum/g, "Σ")
    .replace(/\(y_i-\\hat\{y\}_i\)\^2/g, "(yi-ŷi)^2")
    .replace(/y_i/g, "yi")
    .replace(/\\hat\{y\}_i/g, "ŷi")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\sigma/g, "σ")
    .replace(/\\varepsilon/g, "ε")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function buildMathForEquation(latex: string) {
  if (latex === String.raw`\hat{y} = \beta_0 + \beta_1 x_1 + \varepsilon`) {
    return new DocxMath({
      children: [
        new MathRun("ŷ"),
        new MathRun(" = "),
        new MathSubScript({
          children: [new MathRun("β")],
          subScript: [new MathRun("0")],
        }),
        new MathRun(" + "),
        new MathSubScript({
          children: [new MathRun("β")],
          subScript: [new MathRun("1")],
        }),
        new MathRun(" "),
        new MathSubScript({
          children: [new MathRun("x")],
          subScript: [new MathRun("1")],
        }),
        new MathRun(" + ε"),
      ],
    });
  }

  if (latex === String.raw`RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^2}`) {
    return new DocxMath({
      children: [
        new MathRun("RMSE = "),
        new MathRadical({
          children: [
            new MathFraction({
              numerator: [new MathRun("1")],
              denominator: [new MathRun("n")],
            }),
            new MathSum({
              subScript: [new MathRun("i=1")],
              superScript: [new MathRun("n")],
              children: [
                new MathSuperScript({
                  children: [
                    new MathRoundBrackets({
                      children: [
                        new MathSubScript({
                          children: [new MathRun("y")],
                          subScript: [new MathRun("i")],
                        }),
                        new MathRun(" - "),
                        new MathSubScript({
                          children: [new MathRun("ŷ")],
                          subScript: [new MathRun("i")],
                        }),
                      ],
                    }),
                  ],
                  superScript: [new MathRun("2")],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  return null;
}

function renderTable(document: CanonicalReportDocument, block: CanonicalContentBlock) {
  if (!block.table) {
    return [];
  }
  const tableBlock = block.table;

  const table = new Table({
    margins: {
      top: 80,
      bottom: 80,
    },
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    layout: TableLayoutType.FIXED,
    rows: block.table.rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.cells.map(
            (cell) =>
              new TableCell({
                shading: rowIndex === 0
                  ? {
                      fill: "EDEDED",
                    }
                  : undefined,
                margins: {
                  top: 100,
                  bottom: 100,
                  left: 100,
                  right: 100,
                },
                borders: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: rowIndex === 0 ? 10 : 4,
                    color: "666666",
                  },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: rowIndex === 0 || rowIndex === tableBlock.rows.length - 1 ? 10 : 4,
                    color: "666666",
                  },
                  left: document.presentation.table.allow_vertical_lines
                    ? { style: BorderStyle.SINGLE, size: 4, color: "808080" }
                    : undefined,
                  right: document.presentation.table.allow_vertical_lines
                    ? { style: BorderStyle.SINGLE, size: 4, color: "808080" }
                    : undefined,
                },
                children: [
                  baseParagraph(document, {
                    alignment: rowIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                    indent: {
                      firstLine: 0,
                    },
                    children: [
                      baseTextRun(document, latexToReadableText(cell.text), {
                        bold: rowIndex === 0,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });

  const children: FileChild[] = [];
  if (block.table.caption.position === "top") {
    children.push(captionParagraph(document, block.table.caption));
  }

  if (block.table.caption.note && document.presentation.table.note_position === "top") {
    children.push(noteParagraph(document, block.table.caption.note));
  }

  children.push(table);

  if (block.table.caption.position === "bottom") {
    children.push(captionParagraph(document, block.table.caption));
  }

  if (block.table.caption.note && document.presentation.table.note_position !== "top") {
    children.push(noteParagraph(document, block.table.caption.note));
  }

  if (block.table.caption.source_label) {
    children.push(noteParagraph(document, block.table.caption.source_label));
  }

  return children;
}

function buildFigureImage(document: CanonicalReportDocument, block: CanonicalContentBlock) {
  if (!block.figure?.image_asset_key) {
    return null;
  }

  const asset = resolveAssetByKey(document, block.figure.image_asset_key);
  if (!asset?.stored_path || !fs.existsSync(asset.stored_path)) {
    return null;
  }

  const imageBuffer = fs.readFileSync(asset.stored_path);
  const originalWidth = block.figure.image_width_px ?? asset.width_px ?? 960;
  const originalHeight = block.figure.image_height_px ?? asset.height_px ?? 540;
  const safeWidth = globalThis.Math.max(1, originalWidth);
  const safeHeight = globalThis.Math.max(1, originalHeight);
  const maxWidth = 440;
  const scaledWidth = globalThis.Math.min(maxWidth, safeWidth);
  const scaledHeight = globalThis.Math.max(
    1,
    globalThis.Math.round((scaledWidth / safeWidth) * safeHeight),
  );

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 180 },
    children: [
      new ImageRun({
        type: imageTypeFromAsset(asset),
        data: imageBuffer,
        transformation: {
          width: scaledWidth,
          height: scaledHeight,
        },
      }),
    ],
  });
}

function renderFigure(document: CanonicalReportDocument, block: CanonicalContentBlock) {
  if (!block.figure) {
    return [];
  }

  const placeholderTable = new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 240, bottom: 240, left: 240, right: 240 },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
            },
            children: [
              baseParagraph(document, {
                alignment: AlignmentType.CENTER,
                children: [
                  baseTextRun(document, block.figure.placeholder_text, {
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const children: FileChild[] = [];
  if (block.figure.caption.position === "top") {
    children.push(captionParagraph(document, block.figure.caption));
  }

  if (block.figure.caption.note && document.presentation.figure.note_position === "top") {
    children.push(noteParagraph(document, block.figure.caption.note));
  }

  children.push(buildFigureImage(document, block) ?? placeholderTable);

  if (block.figure.caption.position === "bottom") {
    children.push(captionParagraph(document, block.figure.caption));
  }

  if (block.figure.caption.note && document.presentation.figure.note_position !== "top") {
    children.push(noteParagraph(document, block.figure.caption.note));
  }

  if (block.figure.caption.source_label) {
    children.push(noteParagraph(document, block.figure.caption.source_label));
  }

  return children;
}

function renderEquation(document: CanonicalReportDocument, block: CanonicalContentBlock) {
  if (!block.equation) {
    return [];
  }

  const mathBlock = buildProfessionalMathForEquation(block.equation) ?? buildMathForEquation(block.equation.latex);
  const labelText =
    block.equation.numbered && block.equation.label ? ` (${block.equation.label})` : "";

  return [
    baseParagraph(document, {
      alignment:
        block.equation.alignment === "left" ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: mathBlock
        ? labelText
          ? [mathBlock, baseTextRun(document, labelText)]
          : [mathBlock]
        : [baseTextRun(document, `${latexToReadableText(block.equation.latex)}${labelText}`)],
    }),
  ];
}

function renderReferences(document: CanonicalReportDocument, block: CanonicalContentBlock) {
  if (!block.references) {
    return [];
  }

  return block.references.map((reference, index) =>
    baseParagraph(document, {
      numbering: document.presentation.reference_list.numbering
        ? {
            reference: NUMBERING_REFERENCE,
            level: 0,
          }
        : false,
      children: [
        baseTextRun(
          document,
          document.presentation.reference_list.numbering
            ? reference.text
            : document.presentation.reference_list.ordering === "manual"
              ? `${index + 1}. ${reference.text}`
              : reference.text,
        ),
      ],
    }),
  );
}

function renderBlock(document: CanonicalReportDocument, block: CanonicalContentBlock): FileChild[] {
  switch (block.kind) {
    case "paragraph":
      return [
        baseParagraph(document, {
          alignment: resolveParagraphAlignment(document),
          children: [baseTextRun(document, block.text ?? "")],
        }),
      ];
    case "bullet_list":
      return (block.items ?? []).map((item) =>
        baseParagraph(document, {
          indent: {
            firstLine: 0,
          },
          bullet: {
            level: 0,
          },
          children: [baseTextRun(document, item)],
        }),
      );
    case "numbered_list":
      return (block.items ?? []).map((item) =>
        baseParagraph(document, {
          indent: {
            firstLine: 0,
          },
          numbering: {
            reference: NUMBERING_REFERENCE,
            level: 0,
          },
          children: [baseTextRun(document, item)],
        }),
      );
    case "table":
      return renderTable(document, block);
    case "figure":
      return renderFigure(document, block);
    case "equation":
      return renderEquation(document, block);
    case "reference_list":
      return renderReferences(document, block);
    case "placeholder_note":
      return [
        noteParagraph(document, block.text ?? ""),
      ];
    default:
      return [];
  }
}

function renderSection(
  document: CanonicalReportDocument,
  section: CanonicalSectionNode,
  counters: number[],
): FileChild[] {
  const children: FileChild[] = [];
  const title = formatSectionTitle({
    document,
    section,
    counters,
  });

  children.push(
    baseParagraph(document, {
      heading: resolveHeadingLevel(section.level),
      indent: {
        firstLine: 0,
      },
      spacing: {
        before: pointToTwip(title.spacingBeforePt),
        after: pointToTwip(title.spacingAfterPt),
      },
      children: [
        baseTextRun(document, title.text, {
          bold: true,
        }),
      ],
    }),
  );

  for (const block of section.blocks) {
    children.push(...renderBlock(document, block));
  }

  for (const child of section.children) {
    children.push(...renderSection(document, child, counters));
  }

  return children;
}

function renderAnnexes(document: CanonicalReportDocument) {
  const children: FileChild[] = [];

  for (const annex of document.annexes) {
    children.push(
      baseParagraph(document, {
        heading: HeadingLevel.HEADING_1,
        indent: {
          firstLine: 0,
        },
        children: [baseTextRun(document, annex.title, { bold: true })],
      }),
    );

    for (const block of annex.blocks) {
      children.push(...renderBlock(document, block));
    }
  }

  return children;
}

export function renderCanonicalReportDocxDocument(document: CanonicalReportDocument) {
  const pageSize = resolvePageSize(document.presentation.page.paper_size);
  const titleCounters: number[] = [];

  return new Document({
    creator: "Ingeniometrix",
    title: document.cover.document_label ?? document.document_id,
    description: "Documento DOCX generado desde el modelo canónico de Ingeniometrix.",
    numbering: {
      config: [
        {
          reference: NUMBERING_REFERENCE,
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: pageSize,
            margin: {
              left: cmToTwip(document.presentation.page.margin_left_cm ?? 3),
              right: cmToTwip(document.presentation.page.margin_right_cm ?? 2.5),
              top: cmToTwip(document.presentation.page.margin_top_cm ?? 2.5),
              bottom: cmToTwip(document.presentation.page.margin_bottom_cm ?? 2.5),
            },
          },
        },
        children: [
          ...renderCover(document),
          ...document.body.sections.flatMap((section) => renderSection(document, section, titleCounters)),
          ...renderAnnexes(document),
        ],
      },
    ],
  });
}

export async function renderCanonicalReportDocxBuffer(document: CanonicalReportDocument) {
  const doc = renderCanonicalReportDocxDocument(document);
  return Packer.toBuffer(doc);
}

export async function writeCanonicalReportDocxFile(input: {
  document: CanonicalReportDocument;
  outputPath: string;
}) {
  const buffer = await renderCanonicalReportDocxBuffer(input.document);
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buffer);
  return input.outputPath;
}
