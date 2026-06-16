# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: completar el algoritmo backend del extractor de plantillas sin ejecutarlo todavia.

## What Changed

- Se agrego el contrato semantico `template-source-semantic-analysis`.
- Se implemento el prompt builder para analisis semantico con OpenAI sobre `normalized_document`.
- Se implemento el analizador LLM estructurado.
- Se implemento el derivador `normalized_document + semantic_analysis -> template_candidate`.
- Se implemento el orquestador backend del pipeline completo de extraccion.

## Decisions

- El extractor queda dividido en fases claras:
  - extraccion determinista
  - analisis semantico con OpenAI
  - derivacion de plantilla candidata
  - salida orquestada del pipeline

- El analisis con OpenAI es una capa de enriquecimiento, no un reemplazo del parser determinista.

- Si el LLM falla y `llmRequired` es falso, el pipeline sigue con extraccion determinista y agrega warnings de degradacion.

## Files Touched

- `ai/schemas/template-source-semantic-analysis.schema.json`
- `server/reporting/template-ingestion-types.ts`
- `server/reporting/template-ingestion/build-template-source-analysis-prompt.ts`
- `server/reporting/template-ingestion/analyze-template-source-with-llm.ts`
- `server/reporting/template-ingestion/derive-template-candidate.ts`
- `server/reporting/template-ingestion/extract-template-from-source.ts`

## Verification

- `npm run typecheck`

## Follow-ups

- Ejecutar el pipeline completo sobre la muestra PUCP cuando se quiera validar salida semantica real.
- Persistir draft en base de datos.
- Agregar un endpoint o script dedicado para correr el extractor de forma controlada.
