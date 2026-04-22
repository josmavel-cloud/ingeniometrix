import type { EffectiveTemplateElementRules } from "@/server/reporting/template-ingestion-types";
import type { SyntheticTableBlock } from "@/server/reporting/synthetic-document-types";

import { generateSyntheticCaption } from "./generate-synthetic-caption";

function rowsForSemanticKey(semanticKey: string | null | undefined) {
  switch (semanticKey) {
    case "methodology":
      return [
        ["Parametro", "Expresion sintetica", "Interpretacion"],
        ["Indice de rigidez", "K = F / \\Delta", "Relacion carga-desplazamiento"],
        ["Error medio", "RMSE = \\sqrt{\\frac{1}{n}\\sum (y_i-\\hat{y}_i)^2}", "Ajuste del modelo"],
        ["Factor de seguridad", "FS = R / S", "Capacidad frente a demanda"],
      ];
    case "schedule":
      return [
        ["Actividad", "Mes 1", "Mes 2", "Mes 3"],
        ["Recoleccion de informacion", "X", "", ""],
        ["Analisis", "", "X", ""],
        ["Redaccion", "", "", "X"],
      ];
    case "budget":
      return [
        ["Recurso", "Cantidad", "Costo estimado"],
        ["Software", "1", "S/ 500"],
        ["Movilidad", "4", "S/ 240"],
        ["Impresion", "2", "S/ 60"],
      ];
    case "variables_indicators":
      return [
        ["Variable", "Dimension", "Indicador"],
        ["Variable de prueba A", "Dimension 1", "Indicador 1"],
        ["Variable de prueba B", "Dimension 2", "Indicador 2"],
      ];
    case "consistency_matrix":
      return [
        ["Problema", "Objetivo", "Metodo"],
        ["Problema sintetico", "Objetivo sintetico", "Metodo sintetico"],
        ["Problema especifico", "Objetivo especifico", "Tecnica sintetica"],
      ];
    default:
      return [
        ["Campo", "Valor 1", "Valor 2"],
        ["Fila 1", "Dato sintetico A", "Dato sintetico B"],
        ["Fila 2", "Dato sintetico C", "Dato sintetico D"],
      ];
  }
}

export function generateSyntheticTable(input: {
  rules: EffectiveTemplateElementRules;
  sectionTitle: string;
  sectionSemanticKey?: string | null;
  sequence: number;
}) {
  const { rules, sectionTitle, sectionSemanticKey, sequence } = input;
  const rows = rowsForSemanticKey(sectionSemanticKey);

  return {
    caption: generateSyntheticCaption({
      rules,
      kind: "table",
      title: `Estructura sintetica para ${sectionTitle.toLowerCase()}`,
      sequence,
    }),
    rows: rows.map((row) => ({
      cells: row.map((cell) => ({
        text: cell,
        })),
    })),
    numbered: rules.table.numbering,
  } satisfies SyntheticTableBlock;
}
