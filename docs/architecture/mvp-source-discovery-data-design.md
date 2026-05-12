# MVP Source Discovery — diseño inicial de datos

Objetivo: sostener el flujo `intake normalizado → discovery por tandas → selección humana → inspección`, sin sobrediseñar la base todavía.

## Decisión inicial

Por ahora **no agregamos tablas nuevas obligatorias**. Usamos el esquema existente y dejamos artefactos/audit logs versionados para iterar rápido.

## Persistencia actual reutilizada

- `Project`
  - `title`: tópico normalizado visible.
  - `topicAreaLabel`: área de conocimiento normalizada.
  - `status`: estado grueso del flujo.
- `Intake`
  - almacena el intake normalizado que alimenta discovery.
  - el before/after queda en audit log para no perder el original.
- `Reference`
  - metadata bibliográfica normalizada.
  - `rawOpenAlexJson` / `rawCrossrefJson` conservan payload original y señales como idioma/PDF.
- `ProjectReference`
  - vínculo candidato-proyecto.
  - `relevanceScore`, selección humana y orden.
- `AuditLog`
  - `MVP_INTAKE_NORMALIZED`: before/after, modelo, área de conocimiento.
  - `SEARCH_COMPLETED`: snapshot de búsqueda, query packs, score breakdown, provider breakdown.
  - `REFERENCES_SELECTED`: selección humana.
- `artifacts-local/llm-usage/registry.json`
  - tokens por modelo/proyecto/run/stage.

## Tablas candidatas futuras

Cuando pasemos a producción, conviene extraer de `AuditLog` a tablas explícitas:

1. `ProjectIntakeNormalization`
   - `projectId`, `runId`, `model`, `originalJson`, `normalizedJson`, `knowledgeArea`, `createdAt`.
2. `SourceDiscoveryRun`
   - `projectId`, `runId`, `batchKind` (`initial|more`), `algorithmVersion`, `status`, `tokenSummaryJson`.
3. `SourceCandidate`
   - `discoveryRunId`, `referenceId`, `lane`, `rank`, `score`, `scoreBreakdownJson`, `pdfAvailable`, `recommendationReason`, `cautionReason`.
4. `SourceSelectionEvent`
   - `projectId`, `selectedReferenceIdsJson`, `visibleCandidateIdsJson`, `actor`, `createdAt`.

## Regla de producto

- Discovery inicial devuelve solo 5 candidatos.
- El segundo lote se dispara por llamada explícita del frontend y usa búsqueda más exhaustiva.
- Deep Research no participa en esta etapa.
- Cada candidato debe indicar si hay PDF probable/disponible.
- Tokens se guardan por modelo; costos pueden calcularse/reportarse después.
