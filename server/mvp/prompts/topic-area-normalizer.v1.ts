// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const TOPIC_AREA_NORMALIZER_1_PROMPT = {
  id: "topic-area-normalizer-normalizeTopicAreaSemantically",
  version: "ingeniometrix-topic-area-normalizer.v1-1",
  purpose: "normalizeTopicAreaSemantically (topic-area-normalizer)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/projects/topic-area-normalizer.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "rawLabel",
  "var_1": "catalogEntries"
},
  template: `
Actua como un clasificador semantico rapido para areas o carreras de investigacion en Peru.

Objetivo:
- corregir o normalizar el texto ingresado por el usuario
- asignarlo a una carrera del catalogo si existe cercania semantica suficiente
- si no existe una carrera claramente equivalente, conserva una etiqueta limpia y deja el canonico en null

Reglas:
- no inventes ids fuera del catalogo
- no fuerces una carrera si la relacion no es razonable
- corrige errores obvios de redaccion, tildes o formulacion
- responde solo con el esquema solicitado

Texto del usuario:
- {{var_0}}

Catalogo disponible:
{{var_1}}
    `,
} as const;
