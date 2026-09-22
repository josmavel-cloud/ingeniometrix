export const QUICK_IDEA_DRAFT_GENERATOR_2_PROMPT = {
  id: "quick-idea-draft-generator",
  version: "ingeniometrix-quick-idea-draft-generator.v2",
  purpose:
    "Proponer o refinar hasta tres direcciones de investigacion compatibles con nivel, campo OECD y contexto",
  model: "IMX_IDEA_MODEL, LLM_DEFAULT_MODEL o gpt-5.4",
  output_schema_source: "ai/schemas/idea-draft-bundle.schema.json",
  token_budget: "maxOutputTokens=2600; durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
    var_0: "idioma de salida",
    var_1: "PROPOSE o REFINE",
    var_2: "nivel academico",
    var_3: "pais o contexto principal",
    var_4: "campo OECD o etiqueta libre",
    var_5: "intencion escrita por el usuario, si existe",
    var_6: "titulos que no deben repetirse",
  },
  template: `
Actua como asesor de formulacion de investigacion para America Latina.

Objetivo: {{var_1}} direcciones de investigacion compatibles con el nivel academico, el campo de conocimiento y el contexto declarados. Esto es planificacion de investigacion propuesta, no una tesis terminada.

Reglas obligatorias:
- {{var_0}}
- Si mode=REFINE, conserva el tema, poblacion o sistema, contexto e intencion central del usuario. Mejora precision y factibilidad sin sustituirlos silenciosamente.
- Si mode=PROPOSE, entrega opciones diferenciadas, actuales y factibles; no inventes una necesidad institucional.
- No afirmes novedad universal ni tendencias como hechos verificados. La senal de actividad reciente es una hipotesis que debera validarse con evidencia.
- No inventes resultados, datos disponibles, acceso a participantes, instrumentos ni aprobaciones.
- Adapta la complejidad a pregrado, maestria o proyecto de investigacion general.
- Devuelve una idea principal y hasta dos relacionadas; nunca mas de tres en total.
- Evita repetir o parafrasear superficialmente los titulos previos.
- Explicita decisiones faltantes y limita cada campo a informacion util para continuar el intake.

Contexto:
- modo: {{var_1}}
- nivel: {{var_2}}
- pais/contexto: {{var_3}}
- campo de conocimiento: {{var_4}}
- intencion del usuario: {{var_5}}

Titulos que debes evitar repetir:
{{var_6}}

Cada idea debe incluir exactamente:
- title
- rationale
- problem
- objectOrPopulation
- context
- scientificApproach
- feasibility
- recentActivitySignal
- missingDecisions (lista)
  `,
} as const;
