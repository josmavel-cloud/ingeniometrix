# Current State: Master Blueprint Lab

Fecha de congelamiento: 2026-05-03

Este documento congela el estado operativo actual del lab `server/blueprint-v2/lab` antes de una futura refactorizacion. No describe una arquitectura ideal; describe lo que existe ahora.

## Que hace este modulo

El lab orquesta y expone un flujo experimental para construir un paquete academico trazable a partir del handoff del lab anterior `blueprint_launch`.

El flujo activo cubre:

- Paso 7: carga el `MASTER_TEMPLATE_LATAM`, inspecciona el runtime institucional y construye el contexto de importacion desde evidencia consolidada.
- Paso 8: genera el plan de prompts/secciones, olas de generacion, contexto por seccion, politica de assets y plan de citacion.
- Paso 9: genera drafts de secciones por olas usando LLM cuando esta habilitado.
- Paso 10: deriva una matriz de consistencia desde los drafts, con opcion de alineacion LLM.
- Paso 11: compone el blueprint persistible, validacion, procedencia y reduccion institucional.
- Paso 12: renderiza DOCX master.
- Paso 13: renderiza DOCX institucional.

El lab tambien tiene lectores read-only para la UI, inspecciones de runtime, QA de DOCX, saneamiento publico de textos y generacion opcional de hero image.

## Archivos principales y entry points

- `server/blueprint-v2/lab/pipeline.ts`: runner por paso para el lab 7-11.
- `server/blueprint-v2/lab/steps-5-11-runner.ts`: runner local para ejecutar desde fixtures/handoff hasta composicion base.
- `server/blueprint-v2/lab/steps-11-13-runner.ts`: runner para composicion final, derivacion institucional y render DOCX.
- `server/blueprint-v2/lab/fixture-loader.ts`: carga fixtures locales o el handoff read-only `blueprint-launch-latest`.
- `server/blueprint-v2/lab/blueprint-launch-fixture.ts`: puente read-only hacia artefactos del lab anterior.
- `server/blueprint-v2/lab/template-import-context.ts`: hidrata el contexto congelado del lab anterior para Paso 7.
- `server/blueprint-v2/lab/prompt-planning-hybrid.ts`: planner del Paso 8.
- `server/blueprint-v2/sections/section-generation-engine.ts`: motor de generacion de secciones del Paso 9.
- `server/blueprint-v2/sections/consistency-matrix-engine.ts`: matriz de consistencia del Paso 10.
- `server/blueprint-v2/compose/blueprint-composition-engine.ts`: composicion del Paso 11.
- `server/blueprint-v2/derivation/university-blueprint-derivation-engine.ts`: reduccion del Master hacia template institucional.
- `server/blueprint-v2/lab/academic-document-compiler.ts`: modelo academico intermedio para DOCX.
- `server/blueprint-v2/lab/academic-document-editorial-pass.ts`: pase LLM editorial opcional.
- `server/blueprint-v2/lab/academic-document-layout-pass.ts`: pase LLM de layout/captions/placements.
- `server/blueprint-v2/lab/academic-document-public-sanitizer.ts`: limpieza deterministica de fugas publicas de titulos de fuentes.
- `server/blueprint-v2/lab/academic-document-hero-image.ts`: generacion/cache de hero image.
- `server/blueprint-v2/lab/docx-renderer.ts`: render DOCX master/institucional.
- `server/blueprint-v2/lab/docx-qa-engine.ts`: QA estructural de paquetes DOCX.
- `server/blueprint-v2/lab/artifact-reader.ts`: lector read-only para la UI.
- `server/blueprint-v2/lab/template-runtime-inspector.ts`: inspeccion de runtime master/institucional.
- `server/blueprint-v2/lab/template-quality-contract.ts`: checks de calidad del runtime/template.
- `scripts/run-master-blueprint-lab-steps-5-11.ts`: CLI para pasos 5-11 del lab.
- `scripts/run-master-blueprint-step-10.ts`: CLI para Paso 10.
- `scripts/run-master-blueprint-steps-11-13.ts`: CLI para pasos 11-13.
- `scripts/seed-master-template-latam.ts`: semilla actual del `MASTER_TEMPLATE_LATAM` v3.
- `scripts/maintain-template-catalog-for-blueprint-lab.ts`: mantenimiento de catalogo: backup/eliminacion UPT y activacion PUCP.

## Inputs esperados

Inputs read-only heredados de `blueprint_launch`:

- `artifacts-local/blueprint_launch/lab-state.json`
- `artifacts-local/blueprint_launch/consolidated_evidence/latest-consolidated-evidence.json`
- `artifacts-local/blueprint_launch/extracted_assets/...`
- `artifacts-local/blueprint_launch/materialized_content/...`

Inputs del lab actual:

- `MasterBlueprintEngineProject`
- `SourceIntakeGateResult`
- `EvidenceAcquisitionResult`
- `PdfDownloadResult`
- `EvidencePack[]`
- `EvidenceLedger`
- `MasterTemplateRuntime`
- `MasterTemplateImportContextArtifact`
- `SectionPromptPlan`
- `MasterSectionDraft[]`
- `ConsistencyMatrixArtifact`
- `ResearchBlueprintRecord`
- `UniversityBlueprintPackage`

Inputs de BD:

- `MASTER_TEMPLATE_LATAM`, actualmente version `3`, `ACTIVE`, `REVIEWED`.
- `PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL`, actualmente `ACTIVE`, `REVIEWED`.

## Outputs producidos

Los runs se escriben en:

- `artifacts-local/blueprint-v2-lab/steps-5-11/<case>/<run>/`

Artefactos principales:

- `00-fixture-summary.json`
- `10-section-prompt-plan.json`
- `20-master-section-drafts.json`
- `30-consistency-matrix.json`
- `31-consistency-matrix-artifact.json`
- `40-legacy-blueprint.json`
- `50-provenance-report.json`
- `60-validation-report.json`
- `70-university-blueprint.json`
- `71-university-reduction-plan.json`
- `80-lab-result.json`
- `90-package-quality-summary.json`
- `110-blueprint-composition-artifact.json`
- `115-master-academic-document-model.json`
- `120-master-docx-manifest.json`
- `121-master-docx-qa-report.json`
- `12-master-docx-preview.docx`
- `130-university-docx-manifest.json`
- `131-university-docx-qa-report.json`
- `135-university-academic-document-model.json`
- `13-university-docx-preview.docx`
- `cover-hero-*.png`

UI read-only principal:

- `/lab/master-blueprint/final`

## APIs externas usadas

- OpenAI Responses API: generacion estructurada/texto para secciones, matriz, reduccion institucional y pases editoriales.
- OpenAI Images API: hero image de portada cuando `OPENAI_API_KEY` esta disponible.
- PostgreSQL via Prisma: catalogo de templates y carga de runtimes.
- Sistema de archivos local: lectura de handoff, assets, artefactos y DOCX.

No se debe modificar el lab anterior:

- `blueprint_launch`
- `app/api/blueprint-launch`
- `artifacts-local/blueprint_launch`

## Variables de entorno requeridas

Requeridas para ejecucion completa con LLM y BD:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `LLM_PROVIDER=openai`

Recomendadas/opcionales:

- `DATABASE_URL_UNPOOLED`
- `LLM_DEFAULT_MODEL` default actual: `gpt-5.4`
- `LLM_FAST_MODEL` default actual: `gpt-5.4-mini`
- `LLM_REQUEST_TIMEOUT_MS` default actual: `120000`
- `LLM_REQUEST_MAX_RETRIES` default actual: `1`
- `OPENAI_IMAGE_MODEL` default actual: `gpt-image-2`
- `NODE_ENV`

El smoke test `scripts/smoke-master-blueprint-lab-current-state.ts` no llama LLM ni Images API. Si `DATABASE_URL` esta disponible, valida tambien runtime/template desde BD; con `--skip-db` puede ejecutarse solo contra artefactos locales.

## Estado actual de templates

- `MASTER_TEMPLATE_LATAM` esta en version `3`, `ACTIVE`, `REVIEWED`.
- La jerarquia canonica actual mantiene contenedores visibles:
  - `Planteamiento del problema > Formulacion del problema > Problema general / Problemas especificos`
  - `Justificacion > Justificacion teorica / practica / metodologica`
  - `Objetivos > Objetivo general / Objetivos especificos`
  - `Hipotesis > Hipotesis general / Hipotesis especificas`
  - `Marco teorico > Antecedentes / Estado del arte / Bases teoricas / Definicion de terminos`
- `Variables, dimensiones e indicadores o categorias de analisis` quedo como una sola seccion canonica en la BD v3.
- UPT fue eliminado de BD despues de backup.
- PUCP quedo como template institucional activo para el lab.

Backup UPT generado:

- `artifacts-local/template-maintenance/upt-template-backup-2026-05-03T16-54-59-676Z.json`

## Bugs conocidos o areas fragiles

- Los artefactos DOCX existentes pueden no reflejar cambios recientes en BD hasta rerun de pasos 11-13.
- El lab depende de artefactos locales grandes en `artifacts-local`; si se limpian, la UI read-only y smoke test pueden fallar.
- Los assets heredados dependen de rutas fisicas materializadas por el lab anterior.
- La generacion LLM puede ser costosa y lenta; los runners deben reutilizar cache/artefactos cuando sea posible.
- La generacion de hero image depende de `OPENAI_API_KEY`; si falla, el DOCX usa SVG deterministico.
- La QA de DOCX es estructural. No hay render visual pagina por pagina si LibreOffice/`soffice` no esta disponible.
- La reduccion institucional PUCP es compacta; puede requerir nueva corrida de pasos 11-13 para que la UI muestre la estructura institucional final.
- El resolver institucional ahora filtra por templates `ACTIVE` y versiones `REVIEWED`; fixtures viejos o templates en `DRAFT` dejaran de participar en seleccion productiva.
- El package actual no debe usarse para completar una tesis; solo produce un plan/proyecto trazable con vacios y supuestos declarados.
