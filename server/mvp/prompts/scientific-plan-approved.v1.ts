import { SCIENTIFIC_PLAN_PROMPT as rc3 } from "./scientific-plan.v4";
import { SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT } from "./scientific-plan-latam-compact.v1";

const APPROVED_DESIGN_INSTRUCTIONS = `
El contexto incluye un diseño confirmado por el investigador. Conserva literalmente stable_definition.problem cuando el schema solicite el campo problem. No vuelvas a elegir ni sustituyas preguntas, objetivos, hipótesis, población, datos ni metodología. Desarrolla narrativamente sus implicaciones sin añadir compromisos no confirmados.
La aprobación no vuelve verdadera una contradicción: en cross_section_review identifica cualquier incompatibilidad crítica de evidencia o diseño con una acción localizada. No la ocultes apelando a la autoridad del diseño. Una limitación o decisión pendiente se presenta como tal; no fabriques su resolución.`;

export const APPROVED_SCIENTIFIC_PLAN_PROMPT = {
  ...rc3,
  version: "ingeniometrix-scientific-plan-approved-v1",
  systemPrompt: `${rc3.systemPrompt}${APPROVED_DESIGN_INSTRUCTIONS}`,
} as const;

export const APPROVED_SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT = {
  ...SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT,
  version: "ingeniometrix-scientific-plan-approved-latam-compact-v1",
  systemPrompt: `${SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT.systemPrompt}${APPROVED_DESIGN_INSTRUCTIONS}`,
} as const;
