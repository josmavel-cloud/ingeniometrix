import { SCIENTIFIC_PLAN_PROMPT as previous, SCIENTIFIC_TASKS as tasks } from "./scientific-plan.v1";

export const SCIENTIFIC_PLAN_PROMPT = {
  ...previous, version: "ingeniometrix-scientific-plan-v2",
  systemPrompt: previous.systemPrompt + `
Contrato de citas: cada parrafo narrativo usa citations:[{source_id,evidence_id}]; los parentesis autor-ano en text son su presentacion publica, no sustituyen ni invalidan el array. ResearchDesign tiene un array methodological_support global, NO soporta enlaces por campo. Sus demas campos expresan decisiones propuestas, no hallazgos bibliograficos.
No agregues tecnicas, instrumentos ni constructos despues de estabilizar ResearchDesign. Si instruments esta vacio, no inventes fichas, cuestionarios, guias ni plantillas con nombres nuevos al redactar la metodologia. Las decisiones pendientes declaradas pueden seguir pendientes.
La pertinencia metodologica depende del contenido del extracto, no de section_key: no uses un procedimiento de otra finalidad como justificacion del diseno elegido. Una hipotesis de comparacion computacional no implica automaticamente prueba de significacion ni muestreo estadistico; si no se plantea inferencia, declaralo.
Las limitaciones del corpus se refieren solo a lo recuperado, nunca a todo el campo. Evita citas redundantes o entre corchetes; usa una unica citation_label por fuente pertinente.`,
} as const;

export const SCIENTIFIC_TASKS = {
  ...tasks,
  research_design: tasks.research_design + " Usa methodological_support solo para precedentes directamente pertinentes al metodo propuesto, aunque section_key sea distinto. No cites monitoreo, medicion o tecnicas ajenas como soporte de un diseno diferente. En los campos estructurados describe exclusivamente decisiones del estudio propuesto; concentra las citas bibliograficas en methodological_support. Declara todos los instrumentos realmente propuestos en instruments; si no aplica, conserva array vacio.",
  methodology: tasks.methodology + " No introduzcas instrumentos ausentes de research_design.instruments ni tecnicas distintas. Si se requieren, dejalos explicitamente pendientes, sin incorporarlos como parte ya decidida del procedimiento.",
  cross_section_review: tasks.cross_section_review + ` Evalua el contrato REAL: los parrafos tienen arrays citations, ResearchDesign tiene methodological_support global. No llames inventada a una cita autor-ano si su fuente/identificador existe y el extracto respalda la afirmacion. No exijas campos que el schema no contiene. Distingue falta de evidencia de una decision metodologica propuesta explicitamente.
La trazabilidad de calculos o datos es terminologia academica valida; solo son jerga de software IDs, rutas, nombres de modelos y estados del motor. Mencionar una matriz como instrumento no equivale a ensenar que es una matriz. Una hipotesis comparativa no exige por si sola inferencia estadistica; exige que el plan aclare su alcance. Para cada critical_issue identifica seccion, afirmacion concreta y contradiccion/extracto que prueba el problema; no conviertas advertencias especulativas en bloqueos. Mantiene bloqueos por invencion, cambio de intencion, atribucion no respaldada y contradicciones operativas reales.`,
} as const;
