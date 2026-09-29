import { SCIENTIFIC_PLAN_PROMPT as previous, SCIENTIFIC_TASKS } from "./scientific-plan.v3";
export { SCIENTIFIC_TASKS };
export const SCIENTIFIC_PLAN_PROMPT = {
  ...previous,
  version: "ingeniometrix-scientific-plan-v4",
  systemPrompt: `${previous.systemPrompt}\nEl perfil section_budget declara objetivos editoriales y limites de salida. Redacta con concision, sin repetir antecedentes en cada seccion. Conserva citas, razonamiento metodologico y decisiones pendientes. No inventes contenido para llenar un presupuesto. Las secciones previas pueden incluir solo las pertinentes; stable_definition y research_design son la autoridad del diseno.`,
} as const;
