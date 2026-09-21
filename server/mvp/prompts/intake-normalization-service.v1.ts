// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const INTAKE_NORMALIZATION_SERVICE_1_PROMPT = {
  id: "intake-normalization-service-buildPrompt",
  version: "ingeniometrix-intake-normalization-service.v1-1",
  purpose: "buildPrompt (intake-normalization-service)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/mvp/intake-normalization-service.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "originalLines.map((line) => `- ${line}`).join(\"\\n\")"
},
  template: `
Normaliza este intake academico para su uso en el pipeline de investigación.

Objetivos:
- conservar la intención del usuario
- corregir ambiguedades y redundancias menores
- dejar el texto en español claro para el siguiente paso de producto
- derivar pistas de recuperación reutilizables.

Reglas:
- no inventes datos, resultados, ubicaciones exactas, normas especificas ni conclusiones
- emite los campos textuales de UI en español tecnico y claro
- si falta información, usa formulaciones prudentes sin inventar
- conserva advertencias eticas o tecnicas relevantes
    - incluye una version de pistas de recuperación en ingles para consultas de búsqueda en providers: retrievalHints.en
    - mantener coherencia con los campos en español del bloque principal
    - no traduzcas \`knowledgeArea.label\` ni \`normalizedTopic\` al inglés

Intake original:
{{var_0}}
`,
} as const;
