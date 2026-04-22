import type { EffectiveTemplateElementRules } from "@/server/reporting/template-ingestion-types";
import type { SyntheticFigureBlock } from "@/server/reporting/synthetic-document-types";

import { generateSyntheticCaption } from "./generate-synthetic-caption";

export function generateSyntheticFigure(input: {
  rules: EffectiveTemplateElementRules;
  sectionTitle: string;
  sequence: number;
}) {
  const { rules, sectionTitle, sequence } = input;

  return {
    caption: generateSyntheticCaption({
      rules,
      kind: "figure",
      title: `Placeholder sintetico para ${sectionTitle.toLowerCase()}`,
      sequence,
    }),
    placeholder_text:
      "Figura sintetica de prueba. Reemplazar por visual real solo al integrar el pipeline canonico.",
    numbered: rules.figure.numbering,
  } satisfies SyntheticFigureBlock;
}
