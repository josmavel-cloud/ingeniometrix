import { SCIENTIFIC_PLAN_PROMPT as previous, SCIENTIFIC_TASKS as tasks } from "./scientific-plan.v4";

export const SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT = {
  ...previous,
  id: "scientific-plan-latam-compact",
  version: "ingeniometrix-scientific-plan-latam-compact-v1",
  purpose: "Redactar el perfil academico compacto latinoamericano sin reabrir el diseno cientifico aprobado.",
  systemPrompt: `${previous.systemPrompt}
Aplica el perfil latam-compact-v1. El cuerpo debe ser compacto y profesional, no una memoria del sistema. Integra limitaciones cientificamente esenciales en el problema o la metodologia; no crees secciones separadas de contribucion, factibilidad, alcance, cronograma, presupuesto ni decisiones pendientes.
Politica de citas por seccion: el resumen no cita salvo afirmacion factual inevitable; la formulacion original del problema puede ir sin cita, pero todo hecho derivado de literatura debe citarse; preguntas y objetivos no citan; estado del conocimiento y marco conceptual citan toda afirmacion bibliografica; metodologia cita solo precedentes metodologicos realmente usados. Nunca elimines el soporte de una afirmacion para cumplir esta politica: reformula como propuesta o conserva la cita.
La salida es un plan de investigacion, no resultados ejecutados. Redacta parrafos breves, evita listas ornamentales y no dupliques el mismo antecedente entre secciones.`,
} as const;

export const SCIENTIFIC_TASKS_LATAM_COMPACT = {
  ...tasks,
  problem_definition: `${tasks.problem_definition} Integra de forma breve la delimitacion y las limitaciones esenciales que condicionan el problema.`,
  methodology: `${tasks.methodology} Integra en esta seccion las condiciones de factibilidad, supuestos y limitaciones metodologicas esenciales, sin crear apartados independientes.`,
  executive_summary: `${tasks.executive_summary} Mantenlo autocontenido y normalmente sin citas; no conviertas antecedentes en resultados propios.`,
} as const;
