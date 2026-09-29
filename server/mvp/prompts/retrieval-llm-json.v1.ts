// Mechanically externalized without changing rendered instructions. Behavioural improvements require a new version.
export const RETRIEVAL_LLM_JSON_1_PROMPT = {
  id: "retrieval-llm-json-buildJsonOnlyPrompt",
  version: "ingeniometrix-retrieval-llm-json.v1-1",
  purpose: "buildJsonOnlyPrompt (retrieval-llm-json)",
  model: "configured by caller; unchanged",
  output_schema_source: "server/retrieval/retrieval-llm-json.ts",
  token_budget: "caller / durable pre-job policy",
  actual_roles: "single concatenated Responses input",
  variables: {
  "var_0": "prompt"
},
  template: `{{var_0}}

Responde exclusivamente con un objeto JSON valido.
- no uses markdown
- no uses bloques de codigo
- no agregues texto antes ni despues del JSON
- si un campo no puede completarse con precision, devuelve null, un arreglo vacio o una formulacion prudente
`,
} as const;
