// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT = {
  id: "quick-idea-draft-generator-generateQuickIdeaDraft",
  version: "ingeniometrix-quick-idea-draft-generator.v1-1",
  purpose: "generateQuickIdeaDraft (quick-idea-draft-generator)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/projects/quick-idea-draft-generator.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "getLanguageInstruction(language)",
  "var_1": "input.university",
  "var_2": "input.universityContext",
  "var_3": "input.degreeLevel",
  "var_4": "input.program",
  "var_5": "input.areaLabel ?? \"No especificada\"",
  "var_6": "input.seedText",
  "var_7": "existingIdeas"
},
  template: `
Actua como un asesor experto en formulacion rapida de temas de tesis aplicados para programas universitarios en Peru.

Tu tarea en esta etapa es generar solo ideas generales de tema, no el intake ni la metodologia completa.

Reglas:
- {{var_0}}
- no inventes resultados
- no generes una tesis completa
- genera formulaciones cortas, claras, defendibles y actuales
- prioriza tendencias aplicadas y problemas observables
- usa la universidad solo como contexto academico y territorial
- no la uses como filtro rigido
- la idea principal debe ser nueva respecto de las ya generadas
- evita repetir, parafrasear demasiado o cambiar solo una palabra
- los temas relacionados deben seguir cerca de la idea semilla y del area

Contexto:
- universidad: {{var_1}}
- contexto universitario: {{var_2}}
- nivel: {{var_3}}
- programa: {{var_4}}
- area: {{var_5}}
- idea semilla: {{var_6}}

Ideas ya generadas que debes evitar repetir:
{{var_7}}

Devuelve:
- 1 generatedIdea principal
- hasta 4 relatedIdeas cercanas
    `,
} as const;
