# Rapid Deep Research Fallback Implementation Report

## Executive Summary

Se implemento un fallback explicito y no invasivo para llamar al modulo Deep Research de OpenAI en modo rapido, solo cuando el Evidence Engine ya inspecciono fuentes/PDFs y detecto vacios reales.

Este fallback no reemplaza source selection, no convierte candidatos en evidencia citable y no cambia elegibilidad de produccion. Su salida queda marcada como descubrimiento: todo candidato debe volver a seleccion humana y luego pasar por Evidence Engine.

Estado de validacion: `npx tsc --noEmit --pretty false` paso y los tests focales/regresion pasaron.

## Official API Basis

La implementacion sigue la guia oficial de OpenAI Deep Research:

- Guia: https://platform.openai.com/docs/guides/deep-research
- Modelo rapido recomendado para este MVP: `o4-mini-deep-research`
- Modelo mas fuerte, no usado por defecto: `o3-deep-research`
- Herramienta requerida: `web_search_preview`
- Control de costo/alcance: `max_tool_calls`

Nota tecnica: la documentacion y tipos instalados del SDK difieren en `max_tool_calls`; el runtime lo soporta, pero el overload TypeScript local no lo expone. Se aislo el cast en una unica llamada.

## Files Changed

### `server/blueprint-engine/quality/rapid-deep-research-fallback.ts`

Nuevo modulo principal.

Responsabilidades:

- construir `rapid-deep-research-request`;
- generar prompt controlado;
- llamar Responses API con `web_search_preview`;
- validar candidatos devueltos;
- marcar candidatos como no citables;
- cachear por hash de contexto;
- registrar uso/costo en `llm-usage-registry`;
- renderizar reporte Markdown.

### `scripts/run-evidence-selected-sources-steps-2-6.ts`

Agregado flag:

```bash
--rapid-deep-research-fallback
```

Cuando Step 4B/Deep Research light deterministico detecta gaps, y el flag esta presente, el runner escribe:

- `rapid-deep-research-request.json`
- `rapid-deep-research-result.json`
- `rapid-deep-research-candidate-sources.json`
- `rapid-deep-research-validation-report.json`
- `rapid-deep-research-report.md`

Sin flag, no llama a OpenAI.

### `server/llm-usage-registry.ts`

Agregados precios de referencia para:

- `o4-mini-deep-research`
- `o3-deep-research`

Esto permite que la telemetria estime costos del fallback.

### `scripts/test-rapid-deep-research-fallback.ts`

Nuevo test sintetico neutral.

Cubre:

- el flag no se activa por defecto;
- el prompt usa solo contexto actual;
- candidatos sin DOI/URL son rechazados;
- candidatos duplicados con fuentes seleccionadas son rechazados;
- ausencia de API key produce fallback seguro;
- llamada mockeada produce candidatos discovery-only;
- cache key cambia si cambian gaps.

### `package.json`

Agregado:

```json
"test:rapid-deep-research-fallback": "tsx scripts/test-rapid-deep-research-fallback.ts"
```

## Runtime Behavior

Default:

- no llama OpenAI;
- no usa Deep Research;
- solo produce artefactos deterministas de Deep Research light.

Con flag:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts \
  --case <case_id> \
  --rapid-deep-research-fallback
```

El fallback se ejecuta solo si ya hay gaps reales post-inspeccion:

- `NEEDS_DEEP_RESEARCH_LIGHT`
- categorias faltantes;
- referencias secundarias detectadas.

## Planned LLM Call

Modelo default:

```ts
o4-mini-deep-research
```

Override:

```bash
OPENAI_DEEP_RESEARCH_MODEL=<model>
```

Parametros:

```ts
{
  model: "o4-mini-deep-research",
  store: false,
  background: false,
  input: request.prompt_text,
  tools: [
    {
      type: "web_search_preview",
      search_context_size: "medium",
      search_content_types: ["text"]
    }
  ],
  max_tool_calls: 6,
  max_output_tokens: 8000
}
```

Override de tool calls:

```bash
OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS=6
```

## Prompt Planned For LLM

El prompt esta en:

`buildRapidDeepResearchPrompt`

Resumen exacto de politica:

```text
Eres un investigador academico de apoyo para Ingeniometrix.

Objetivo: hacer una busqueda Deep Research rapida SOLO para encontrar referencias candidatas que puedan cubrir vacios reales detectados despues de inspeccionar fuentes/PDFs del intake actual.

Reglas estrictas:
- No redactes marco teorico, metodologia ni contenido final.
- No inventes referencias, DOI, URL, datos, instrumentos, ecuaciones ni resultados.
- No trates los candidatos como evidencia citable.
- Todo candidato debe tener titulo y DOI o URL.
- Clasifica que vacio cubre cada candidato usando solo estas categorias: direct_nuclear_sources, method_or_study_design, theory_or_model, variables_or_indicators, secondary_reference_recovery.
- Si una referencia fue citada dentro de un PDF pero no la localizas externamente, no la incluyas como candidato recuperado.
- Devuelve JSON valido, sin markdown ni texto fuera del JSON.
- La salida debe estar en espanol salvo titulos originales de fuentes.
```

Salida esperada:

```json
{
  "status": "completed",
  "summary_es": "resumen breve",
  "candidates": [
    {
      "title": "titulo de la fuente",
      "authors": ["autor"],
      "year": 2024,
      "doi": "10.xxxx/xxxxx o null",
      "url": "https://... o null",
      "gap_covered": ["method_or_study_design"],
      "why_relevant_es": "por que podria cubrir el vacio",
      "evidence_note_es": "candidato, no evidencia hasta seleccion y procesamiento",
      "confidence": "high | medium | low",
      "warnings": []
    }
  ],
  "warnings": []
}
```

## Validation Policy

El validador rechaza candidatos si:

- no tienen titulo;
- no tienen DOI ni URL;
- no cubren un gap valido;
- duplican fuente ya seleccionada por DOI/titulo;
- no pueden ser clasificados como candidatos no citables.

Todo candidato aceptado se normaliza con:

```ts
citable_status: "candidate_only_not_citable_yet"
must_pass_source_selection: true
must_pass_evidence_engine: true
provider: "openai_deep_research"
```

## Cost And Cache Policy

Cache key:

- `case_id`;
- prompt version;
- modelo;
- `max_tool_calls`;
- contexto post-inspeccion;
- gaps;
- fuentes seleccionadas;
- familias deterministicas de busqueda.

Cache folder:

```text
artifacts-local/rapid-deep-research-cache/
```

Si el cache coincide, no llama OpenAI.

## Diagnostics / Iteration

Primera iteracion:

- Se implemento Responses API con `max_tool_calls`.
- TypeScript fallo porque el SDK local no expone `max_tool_calls` en el overload de `responses.create`.

Correccion:

- Se aislo un cast TypeScript solo en esa llamada.
- La semantica sigue la documentacion oficial y no afecta otros clientes OpenAI.

Segunda iteracion:

- Se agregaron tests de flag, request, prompt, validacion, no API key, mock de respuesta y cache key.
- Se corrio typecheck y regresiones.

Tercera iteracion:

- En el primer run real, OpenAI devolvio: `Deep research models only support search_context_size 'medium'.`
- Se corrigio `search_context_size` de `low` a `medium` para Deep Research.

Cuarta iteracion:

- En el segundo run real, Deep Research produjo tokens pero no `output_text`; el texto venia en `response.output`.
- Se agrego extraccion desde `output[].content[]` y se subio el prompt/cache version a `rapid_deep_research_fallback.v2`.

Quinta iteracion:

- Se observo que Deep Research puede agotar el presupuesto de herramientas sin respuesta final extraible.
- Se subio el default de `max_tool_calls` de 4 a 6 y el prompt/cache version a `rapid_deep_research_fallback.v3`.
- Se agrego `raw_output_excerpt` para diagnosticar respuestas sin texto extraible sin depender de `store:true`.

Sexta iteracion:

- El run real mostro `status: incomplete` con `incomplete_details.reason = max_output_tokens`.
- Se subio `max_output_tokens` de 3500 a 8000 y se agrego instruccion para usar pocas busquedas y reservar salida para JSON final.
- Se subio el prompt/cache version a `rapid_deep_research_fallback.v4`.

## Commands Run

```bash
npx tsc --noEmit --pretty false
npx tsx scripts/test-rapid-deep-research-fallback.ts
npx tsx scripts/test-deep-research-light.ts
npx tsx scripts/test-post-inspection-source-sufficiency.ts
npx tsx scripts/test-limited-source-inspection.ts
npx tsx scripts/test-source-evidence-planning-gates.ts
npx tsx scripts/test-candidate-search-keyword-expansion.ts
npx tsx scripts/test-stale-fallback-cleanup.ts
npx tsx scripts/test-fresh-run-isolation.ts
npx tsx scripts/test-method-selection.ts
npx tsx scripts/test-source-health.ts
npx tsx scripts/test-citation-semantics.ts
npx tsx scripts/test-production-safety-and-contamination-guards.ts
```

Resultado: todos pasaron.

## Remaining Limitations

- Todavia no convierte candidatos Deep Research en un `source-selection-template.json` cargable por UI.
- Todavia no se ejecuto una llamada real en case-003.
- Deep Research puede devolver referencias utiles, pero no deben usarse hasta que pasen por source selection y Evidence Engine.
- Si la razon de bloqueo es identidad dudosa de PDF, el fallback no deberia usarse para saltarse revision manual.

## Recommended Next Step

Ejecutar el intake actual con:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts \
  --case case-003-medicine-public-health \
  --rapid-deep-research-fallback
```

Luego inspeccionar:

- `rapid-deep-research-candidate-sources.json`
- `rapid-deep-research-validation-report.json`
- `rapid-deep-research-report.md`

Si los candidatos son buenos, la siguiente tanda debe convertirlos a un checkpoint compatible con source selection UI.
