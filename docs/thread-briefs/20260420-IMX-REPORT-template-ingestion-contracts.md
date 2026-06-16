# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: definir los contratos canónicos para la ingesta de plantillas de tesis antes de implementar el extractor sobre un plan real de la PUCP.

## What Changed

- Se agregó un schema para el documento normalizado extraído desde una fuente de plantilla o desde una instancia real de plan de tesis.
- Se agregó un schema para la plantilla candidata derivada de esa fuente.
- Se agregaron tipos TypeScript y exports de schema para reutilizarlos luego en el extractor, persistencia y revisión humana.

## Decisions

- Separar claramente:
  - `normalized_document`: lo que el extractor lee y normaliza desde la fuente
  - `template_candidate`: la estructura de plantilla inferida que luego se revisa y persiste

- Soportar desde el inicio dos tipos de fuente:
  - guías o manuales institucionales
  - instancias reales de planes de tesis, como el ejemplo PUCP recibido

- Modelar assets como candidatos normalizados, no incrustados.
  Esto permite priorizar el logo provisto por el usuario y usar la extracción desde el PDF solo como fallback.

- Mantener revisión humana obligatoria en esta etapa.
  El contrato ya contempla warnings e inferencias, porque un plan concreto no siempre declara reglas formales de citación o límites de palabras.

## Files Touched

- `ai/schemas/normalized-template-source-document.schema.json`
- `ai/schemas/template-candidate.schema.json`
- `server/reporting/template-ingestion-types.ts`

## Verification

- `npm run typecheck`
- Validación sintáctica de ambos archivos JSON

## Follow-ups

- Implementar el extractor `pdf_native_text -> normalized_document`
- Implementar el derivador `normalized_document -> template_candidate`
- Diseñar la persistencia draft en base de datos para la plantilla candidata y sus assets
