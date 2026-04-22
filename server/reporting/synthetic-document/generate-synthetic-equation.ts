import type { EffectiveTemplateElementRules } from "@/server/reporting/template-ingestion-types";
import type { SyntheticEquationBlock } from "@/server/reporting/synthetic-document-types";

function equationForSemanticKey(semanticKey: string | null | undefined, sequence: number) {
  switch (semanticKey) {
    case "methodology":
      return sequence % 2 === 0
        ? String.raw`RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^2}`
        : String.raw`\hat{y} = \beta_0 + \beta_1 x_1 + \varepsilon`;
    case "scientific_theoretical_bases":
    case "theoretical_bases":
      return String.raw`R = \frac{\sigma}{\varepsilon}`;
    default:
      return String.raw`I_{syn} = \sum_{i=1}^{n} w_i x_i`;
  }
}

export function generateSyntheticEquation(input: {
  rules: EffectiveTemplateElementRules;
  sectionSemanticKey?: string | null;
  sequence: number;
}) {
  const { rules, sectionSemanticKey, sequence } = input;
  const numberingLabel = rules.equation.numbering
    ? rules.equation.numbering_format === "level_decimal"
      ? `1.${sequence}`
      : `${sequence}`
    : null;

  return {
    latex: equationForSemanticKey(sectionSemanticKey, sequence),
    label: numberingLabel,
    numbered: rules.equation.numbering,
    alignment: rules.equation.alignment,
  } satisfies SyntheticEquationBlock;
}
