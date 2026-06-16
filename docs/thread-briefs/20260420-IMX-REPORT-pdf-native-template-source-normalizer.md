# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: implementar el primer tramo del motor de ingesta de plantillas: `pdf_native_text -> normalized_document`, validado con un plan de tesis real de la PUCP.

## What Changed

- Se implemento un normalizador de assets de plantilla para priorizar logos provistos y dejar fallback de extraccion desde el documento.
- Se implemento un normalizador de PDF con texto nativo para planes de tesis.
- El normalizador detecta:
  - portada
  - bloques numerados
  - subsecciones
  - listas con bullets
  - seccion de referencias
  - tabla de cronograma en modo de baja fidelidad

## Decisions

- El primer extractor se enfoca en `pdf_native_text` porque el ejemplo PUCP provisto es texto exportado desde Word y no necesita OCR.
- Se conserva la separacion entre:
  - `source input`
  - `normalized document`
  - `template candidate`
- Si el usuario provee un logo externo, ese asset manda. Si no, el sistema deja un candidato de logo `extracted_from_document` como fallback para la portada.

## Files Touched

- `server/reporting/template-ingestion-types.ts`
- `server/reporting/template-ingestion/normalize-template-assets.ts`
- `server/reporting/template-ingestion/normalize-pdf-native-template-source.ts`

## Verification

- `npm run typecheck`
- Ejecucion funcional del normalizador sobre:
  - `C:\Users\josma\Downloads\a20214687_Cusiquispe_Plan_de_Tesis_FINAL_firmado.pdf`
  - `C:\Users\josma\Downloads\logo pucp.png`

- Artifact generado:
  - `artifacts-local/template-ingestion-debug/pucp-input.json`
  - `artifacts-local/template-ingestion-debug/pucp-normalized-document.json`

## Result

- El extractor clasifico correctamente la fuente como `thesis_plan_instance`.
- Detecto correctamente:
  - universidad: PUCP
  - escuela: Escuela de Posgrado
  - programa: Maestria en Ingenieria Civil
  - mencion: Estructuras Sismorresistentes
  - 15 bloques estructurados
  - 7 referencias agrupadas
  - logo provisto como asset preferente

## Follow-ups

- Implementar `normalized_document -> template_candidate`
- Persistir draft en base de datos
- Mejorar reconstruccion tabular del cronograma para PDF nativo
- Enriquecer heuristicas de citacion y formato cuando exista fuente normativa institucional complementaria
