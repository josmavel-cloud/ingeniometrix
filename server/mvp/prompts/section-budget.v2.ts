import { SECTION_BUDGET_PROMPT as previous } from "./section-budget.v1";
export const SECTION_BUDGET_PROMPT = {
  ...previous, version: "ingeniometrix-section-budget-v2",
  variables: [...previous.variables, "observed_words", "target_words"],
  systemPrompt: `${previous.systemPrompt}\nRespeta target_words como objetivo de redaccion, por debajo del techo max_words. En una correccion, observed_words es el conteo real de la respuesta anterior: reduce expresiones redundantes hasta target_words sin borrar decisiones ni soporte. No repitas el texto anterior si excede el techo.`,
} as const;
