import {
  ImportedXmlComponent,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSum,
  MathSuperScript,
} from "docx";

import type { CanonicalEquationBlock } from "@/server/reporting/canonical-report-types";

type AnyMathChild = unknown;

function ommlElement(
  name: string,
  children: Array<ImportedXmlComponent | string> = [],
  attributes?: Record<string, string>,
) {
  const element = new ImportedXmlComponent(name, attributes);
  for (const child of children) {
    element.push(child);
  }
  return element;
}

function ommlRun(text: string) {
  return ommlElement("m:r", [ommlElement("m:t", [text])]);
}

function ommlArg(name: string, children: ImportedXmlComponent[]) {
  return ommlElement(name, children);
}

function ommlDelimiter(begin: string, end: string, content: ImportedXmlComponent) {
  return ommlElement("m:d", [
    ommlElement("m:dPr", [
      ommlElement("m:begChr", [], { "m:val": begin }),
      ommlElement("m:endChr", [], { "m:val": end }),
    ]),
    ommlArg("m:e", [content]),
  ]);
}

function ommlMatrix(rows: ImportedXmlComponent[][]) {
  return ommlElement("m:m", [
    ommlElement("m:mPr", [
      ommlElement("m:baseJc", [], { "m:val": "center" }),
      ommlElement("m:cGp", [], { "m:val": "180" }),
      ommlElement("m:rSp", [], { "m:val": "80" }),
    ]),
    ...rows.map((row) =>
      ommlElement(
        "m:mr",
        row.map((cell) => ommlArg("m:e", [cell])),
      ),
    ),
  ]);
}

function ommlBracketsMatrix(rows: ImportedXmlComponent[][]) {
  return ommlDelimiter("[", "]", ommlMatrix(rows));
}

function ommlCurlyVector(items: ImportedXmlComponent[]) {
  return ommlDelimiter("{", "}", ommlElement("m:m", [
    ommlElement("m:mPr", [
      ommlElement("m:baseJc", [], { "m:val": "center" }),
      ommlElement("m:rSp", [], { "m:val": "80" }),
    ]),
    ...items.map((item) => ommlElement("m:mr", [ommlArg("m:e", [item])])),
  ]));
}

function mathText(value: string) {
  return new MathRun(value);
}

function mathSub(base: string, sub: string) {
  return new MathSubScript({
    children: [new MathRun(base)],
    subScript: [new MathRun(sub)],
  });
}

function mathSup(base: string, sup: string) {
  return new MathSuperScript({
    children: [new MathRun(base)],
    superScript: [new MathRun(sup)],
  });
}

function buildStandardProfessionalMath(latex: string) {
  if (latex === String.raw`\hat{y} = \beta_0 + \beta_1 x_1 + \varepsilon`) {
    return new DocxMath({
      children: [
        new MathRun("ŷ"),
        new MathRun(" = "),
        mathSub("β", "0"),
        new MathRun(" + "),
        mathSub("β", "1"),
        new MathRun(" "),
        mathSub("x", "1"),
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
                      children: [mathSub("y", "i"), new MathRun(" - "), new MathRun("ŷᵢ")],
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

  if (latex === String.raw`R = \frac{\sigma}{\varepsilon}`) {
    return new DocxMath({
      children: [
        new MathRun("R = "),
        new MathFraction({
          numerator: [new MathRun("σ")],
          denominator: [new MathRun("ε")],
        }),
      ],
    });
  }

  if (latex === String.raw`\omega_n = \sqrt{\frac{k}{m}}`) {
    return new DocxMath({
      children: [
        mathSub("ω", "n"),
        new MathRun(" = "),
        new MathRadical({
          children: [
            new MathFraction({
              numerator: [new MathRun("k")],
              denominator: [new MathRun("m")],
            }),
          ],
        }),
      ],
    });
  }

  if (latex === String.raw`FS = \frac{R}{S}`) {
    return new DocxMath({
      children: [
        new MathRun("FS = "),
        new MathFraction({
          numerator: [new MathRun("R")],
          denominator: [new MathRun("S")],
        }),
      ],
    });
  }

  return null;
}

function buildOmmlFromKey(key: string) {
  switch (key) {
    case "tdof-matrix-motion":
      return new DocxMath({
        children: [
          ommlBracketsMatrix([
            [ommlRun("m₁"), ommlRun("0")],
            [ommlRun("0"), ommlRun("m₂")],
          ]) as unknown as AnyMathChild,
          ommlCurlyVector([ommlRun("ü₁"), ommlRun("ü₂")]) as unknown as AnyMathChild,
          ommlRun(" + ") as unknown as AnyMathChild,
          ommlBracketsMatrix([
            [ommlRun("c₁ + c₂"), ommlRun("−c₂")],
            [ommlRun("−c₂"), ommlRun("c₂")],
          ]) as unknown as AnyMathChild,
          ommlCurlyVector([ommlRun("u̇₁"), ommlRun("u̇₂")]) as unknown as AnyMathChild,
          ommlRun(" + ") as unknown as AnyMathChild,
          ommlBracketsMatrix([
            [ommlRun("k₁ + k₂"), ommlRun("−k₂")],
            [ommlRun("−k₂"), ommlRun("k₂")],
          ]) as unknown as AnyMathChild,
          ommlCurlyVector([ommlRun("u₁"), ommlRun("u₂")]) as unknown as AnyMathChild,
          ommlRun(" = ") as unknown as AnyMathChild,
          ommlCurlyVector([ommlRun("0"), ommlRun("0")]) as unknown as AnyMathChild,
        ] as unknown as any,
      });
    case "tdof-characteristic":
      return new DocxMath({
        children: [
          ommlRun("det") as unknown as AnyMathChild,
          ommlBracketsMatrix([
            [ommlRun("k₁ + k₂ − ω²m₁"), ommlRun("−k₂")],
            [ommlRun("−k₂"), ommlRun("k₂ − ω²m₂")],
          ]) as unknown as AnyMathChild,
          ommlRun(" = 0") as unknown as AnyMathChild,
        ] as unknown as any,
      });
    case "tdof-modal-transform":
      return new DocxMath({
        children: [
          ommlCurlyVector([ommlRun("u₁(t)"), ommlRun("u₂(t)")]) as unknown as AnyMathChild,
          ommlRun(" = ") as unknown as AnyMathChild,
          ommlBracketsMatrix([
            [ommlRun("φ₁₁"), ommlRun("φ₁₂")],
            [ommlRun("φ₂₁"), ommlRun("φ₂₂")],
          ]) as unknown as AnyMathChild,
          ommlCurlyVector([ommlRun("q₁(t)"), ommlRun("q₂(t)")]) as unknown as AnyMathChild,
        ] as unknown as any,
      });
    case "tdof-modal-frequencies":
      return new DocxMath({
        children: [
          ommlCurlyVector([ommlRun("ω₁"), ommlRun("ω₂")]) as unknown as AnyMathChild,
          ommlRun(" = ") as unknown as AnyMathChild,
          ommlCurlyVector([
            ommlRun("√((k₁ + 2k₂)/m₁)") ,
            ommlRun("√(k₂/m₂)"),
          ]) as unknown as AnyMathChild,
        ] as unknown as any,
      });
    default:
      return null;
  }
}

export function buildProfessionalMathForEquation(block: CanonicalEquationBlock) {
  if (block.omml_key) {
    const byKey = buildOmmlFromKey(block.omml_key);
    if (byKey) {
      return byKey;
    }
  }

  return buildStandardProfessionalMath(block.latex);
}
