// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const REFERENCE_TRANSLATION_SERVICE_1_PROMPT = {
  id: "reference-translation-service-buildLanguageDetectionPrompt",
  version: "ingeniometrix-reference-translation-service.v1-1",
  purpose: "buildLanguageDetectionPrompt (reference-translation-service)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/retrieval/reference-translation-service.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "referencesBlock"
},
  template: `
Eres Ingeniometrix y tu tarea es detectar el idioma principal de referencias academicas.

Reglas:
- decide el idioma principal del titulo y abstract juntos
- si el contenido esta principalmente en espanol responde es
- si esta principalmente en ingles responde en
- usa pt, fr, de o it cuando aplique claramente
- usa other solo si el idioma no puede mapearse con confianza razonable
- no traduzcas
- no inventes contenido
- confidence debe reflejar cuan claro es el idioma desde el texto

Referencias:
{{var_0}}
`,
} as const;

export const REFERENCE_TRANSLATION_SERVICE_2_PROMPT = {
  id: "reference-translation-service-buildTranslationPrompt",
  version: "ingeniometrix-reference-translation-service.v1-2",
  purpose: "buildTranslationPrompt (reference-translation-service)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/retrieval/reference-translation-service.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "input.targetLanguage",
  "var_1": "referencesBlock"
},
  template: `
Eres Ingeniometrix y tu tarea es traducir metadatos bibliograficos al idioma del usuario.

Reglas:
- traduce al idioma objetivo {{var_0}}
- conserva el sentido academico
- no inventes informacion
- no resumas
- si el abstract no existe, devuelve null
- si el titulo ya esta practicamente en el idioma objetivo, puedes devolverlo con cambios minimos
- devuelve una traduccion natural y util para interfaz de usuario

Referencias:
{{var_1}}
`,
} as const;
