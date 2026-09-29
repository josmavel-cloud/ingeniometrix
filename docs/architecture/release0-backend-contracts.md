# Release 0 Backend Contracts

## Objetivo

Este documento congela el contrato backend minimo para cerrar Release 0 sin abrir alcance.
La fuente ejecutable del contrato vive en `server/mvp/release0-contracts.ts`.

El pipeline canonico es:

```text
Step 1 Intake inicial
  -> Step 2 Refinamiento con evidencia
  -> Step 3 Fuentes
  -> Step 4 Fuentes adicionales
  -> Step 5 Source Health / Evidencia y assets
  -> Step 6 Blueprint
  -> Step 7 Exports
```

## Reglas De Produccion

- El intake actual solo puede ser fixture o ejemplo.
- Los outputs publicos deben estar en espanol.
- No se inventan citas, datos ni resultados.
- Todo output significativo debe ser trazable a fuentes recuperadas.
- Cada step debe registrar `MvpStepRun` o una brecha explicita hasta que se cierre Release 0.
- Los artifacts pesados viven en filesystem/object-storage-ready; la metadata reusable vive en Postgres/Prisma.
- Los diagnosticos pueden escribir en `artifacts-local/`, pero no son outputs de producto.

## Contrato Comun De Ejecucion

Cada step debe exponer o persistir:

- `projectId`
- `runId` o `stepRunId`
- `stepKey`
- `status`
- `startedAt`
- `finishedAt`
- `durationMs`
- `provider`
- `model`
- `promptVersion`
- `retryCount`
- `fallbackUsed`
- `inputHash`
- `outputHash`
- `inputSnapshotJson`
- `outputSnapshotJson`
- `warningsJson`
- `errorsJson`
- `artifactDir`
- `artifactManifestPath`

## Artifacts Oficiales Por Step

### Step 1 - Intake inicial

Produce:

- `normalized_intake`
- `step1_artifact_manifest`

Consume:

- `Project`
- `Intake`

Estado: implementado.

### Step 2 - Refinamiento con evidencia

Produce:

- `refinement_options`
- `selected_refinement_option`

Consume:

- `normalized_intake`
- `Reference`
- `ProjectReference`

Estado: implementado con API backend MVP propia en `app/api/projects/[id]/mvp/step-2/route.ts`.

### Step 3 - Fuentes

Produce:

- `first_source_batch`
- `selected_sources`

Consume:

- `selected_refinement_option`
- `ProjectReference`
- `Reference`

Estado: implementado.

### Step 4 - Fuentes adicionales

Produce:

- `additional_source_batch`
- `expanded_selected_sources`

Consume:

- `first_source_batch`
- `selected_refinement_option`

Estado: implementado con contrato propio.

Decision para cierre:

- Step 4 reutiliza internamente la logica de seleccion de fuentes, pero registra `step_4_additional_sources`.
- La ruta backend productiva vive en `app/api/projects/[id]/mvp/step-4/route.ts`.
- El diagnostico integrado `mvp:steps1-4:diagnose` valida que Step 4 tenga run propio y handoff claro hacia Step 5.

### Step 5 - Source Health / Evidencia y assets

Produce:

- `evidence_ledger`
- `source_assets`
- `asset_inspection_pdf` solo diagnostico

Consume:

- `selected_sources`
- `Reference`
- `ProjectReference`

Estado: implementado.

Contrato clave:

- Step 6 no debe leer PDFs crudos como fuente primaria.
- Step 6 debe consumir `ProjectEvidenceLedger`, `ProjectEvidenceCard`, `ProjectSourceAsset` y artifacts declarados de Step 5.

### Step 6 - Blueprint

Produce:

- `blueprint_docx`
- `blueprint_package`
- `blueprint_version`

Consume:

- `evidence_ledger`
- `references`
- `curated_assets`
- `semantic_extractions`

Estado: implementado y validado por diagnostico backend productivo.

Validacion backend:

- `mvp:step6:blueprint-docx:diagnose` valida escritura DOCX, paquete blueprint, version persistida, presupuesto de paginas, ausencia de fragmentos truncados, ausencia de metadata interna visible, ausencia de LaTeX crudo visible y referencias cruzadas no colgantes.
- El documento sigue requiriendo revision humana final antes de entrega institucional, pero la brecha backend productiva queda cerrada.

### Step 7 - Exports

Debe producir:

- `docx`
- `bibtex`
- `ris`
- `evidence_log_json`
- `export_manifest_json`

Consume:

- `blueprint_docx`
- `blueprint_package`
- `blueprint_version`
- `evidence_ledger`

Estado: planeado para Release 0. Existen rutas legacy individuales para BibTeX, RIS, DOCX y evidence log, pero falta un servicio productivo de paquete final con `MvpStepRun`, manifest y hashes.

## Modelos Prisma Centrales

- `User`
- `Project`
- `Intake`
- `Reference`
- `ProjectReference`
- `BlueprintVersion`
- `AuditLog`
- `MvpStepRun`
- `ProjectTemplateContentPlan`
- `ProjectEvidenceLedger`
- `ProjectEvidenceCard`
- `ProjectSourceMaterialization`
- `ProjectSourceAsset`

## Gaps Bloqueantes Antes De Cerrar Release 0

1. Implementar Step 7 como paquete final, no solo rutas sueltas.
2. Agregar comando E2E `mvp:pipeline:release0` cuando Step 7 este cerrado.
3. Validar que cada cita del DOCX aparezca en BibTeX, RIS y `evidence_log.json`.

## Diagnostico

Ejecutar:

```bash
npm run mvp:release0:contracts:diagnose
npm run mvp:steps1-4:diagnose
```

El diagnostico escribe:

```text
artifacts-local/mvp-release0-contracts/<run-id>/release0-contract-diagnostic.json
artifacts-local/mvp-release0-contracts/<run-id>/release0-contract-diagnostic.md
```

`baseline_ok=true` significa que el contrato base existe y calza con archivos, scripts y Prisma.
`ready_for_release0_close=true` solo debe ocurrir cuando no queden gaps criticos ni importantes.
