import { SCIENTIFIC_PLAN_PROMPT as previous, SCIENTIFIC_TASKS as tasks } from "./scientific-plan.v2";

const scopeRule = " No infieras ausencia de estudios ni ausencia de comparaciones en un articulo/corpus a partir de extractos seleccionados o abstracts. Expresa la limitacion como lo que NO SE HA PODIDO VERIFICAR con los extractos disponibles, no como algo que los articulos no contienen. Una brecha local por investigar es una propuesta, no un hallazgo de la busqueda. Esta limitacion del proceso no debe atribuirse como hallazgo a una cita bibliografica.";
export const SCIENTIFIC_PLAN_PROMPT = { ...previous, version: "ingeniometrix-scientific-plan-v3", systemPrompt: previous.systemPrompt + scopeRule } as const;
export const SCIENTIFIC_TASKS = {
  ...tasks,
  evidence_synthesis: tasks.evidence_synthesis + scopeRule,
  problem_definition: tasks.problem_definition + scopeRule,
  contribution_and_feasibility: tasks.contribution_and_feasibility + scopeRule,
  scope_limitations_and_pending_decisions: tasks.scope_limitations_and_pending_decisions + scopeRule,
  cross_section_review: tasks.cross_section_review + ` Distingue una afirmacion negativa sobre contenido de articulos (requiere inspeccion suficiente) de una limitacion declarada de los extractos disponibles (puede justificarse por coverage y la evidencia entregada, sin que un articulo deba afirmar su propia ausencia).
No traduzcas automaticamente palabras academicas a jerga prohibida: una corrida de simulacion o un modelo cientifico son conceptos metodologicos legitimos; lo prohibido son identificadores/estados de ejecucion del backend y nombres del modelo LLM. Valora su contexto semantico. No declares bloqueo por una palabra aislada.`,
} as const;
