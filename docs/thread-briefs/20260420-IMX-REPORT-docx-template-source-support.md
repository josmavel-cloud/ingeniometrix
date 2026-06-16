# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: optimizar el extractor backend con un segundo caso real de plan de tesis en DOCX.

## What Changed

- Se agrego soporte backend para `docx` como fuente de plantilla.
- El normalizador DOCX ahora aprovecha:
  - estilos `Heading 1/2/3`
  - `List Paragraph`
  - indices automaticos de tablas/figuras/anexos
  - portada no numerada

- Se amplio el derivador de `template_candidate` para mas bloques academicos:
  - datos generales
  - area y linea de investigacion
  - formulacion del problema
  - preguntas principal y especificas
  - variables e indicadores
  - marco teorico y antecedentes
  - lugar de investigacion
  - anexos

## Decisions

- Los indices automaticos del DOCX no deben formar parte del cuerpo normalizado de la plantilla.
- En DOCX, la jerarquia de secciones debe apoyarse primero en estilos de Word y solo luego en heuristicas de mayusculas.
- `List Paragraph` puede representar tanto listas como subtitulos menores; por eso se deja warning de revision humana.

## Files Touched

- `server/reporting/template-ingestion-types.ts`
- `server/reporting/template-ingestion/normalize-docx-template-source.ts`
- `server/reporting/template-ingestion/extract-template-from-source.ts`
- `server/reporting/template-ingestion/derive-template-candidate.ts`

## Verification

- `npm run typecheck`

## Follow-ups

- Ejecutar el pipeline sobre el DOCX de Tacna cuando se quiera validar la salida normalizada real.
- Enriquecer la deteccion de captions, ecuaciones y tablas para documentos DOCX tecnicos.
