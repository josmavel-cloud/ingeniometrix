# Ingeniometrix MVP Handoff

## Acceso GitHub

- Repo GitHub URL: `https://github.com/josmavel-cloud/ingeniometrix`
- Branch de trabajo independiente: `codex/lab-a-b-diagnostic-pipeline`
- URL directa del branch: `https://github.com/josmavel-cloud/ingeniometrix/tree/codex/lab-a-b-diagnostic-pipeline`
- URL para crear PR si se decide integrar: `https://github.com/josmavel-cloud/ingeniometrix/pull/new/codex/lab-a-b-diagnostic-pipeline`
- Repo local usado para este handoff: `C:\projects\ingeniometrix`

Para tomar control desde otra PC limpia:

```bash
git clone https://github.com/josmavel-cloud/ingeniometrix.git
cd ingeniometrix
git fetch origin
git switch --track origin/codex/lab-a-b-diagnostic-pipeline
npm install
npx tsc --noEmit --pretty false
```

Si el repo ya existe localmente:

```bash
cd ingeniometrix
git fetch origin
git switch codex/lab-a-b-diagnostic-pipeline || git switch --track origin/codex/lab-a-b-diagnostic-pipeline
npm install
npx tsc --noEmit --pretty false
```

Archivos que el nuevo agente debe leer primero:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `INTAKE_2_IMPROVEMENTS_HANDOFF.md`
4. `PIPELINE_CLEANUP_AUDIT.md`
5. `CLEANUP_C1_GIT_HYGIENE_REPORT.md`

## Stack

Stack objetivo y observado en `package.json`:

- Runtime: Node.js `20.x`.
- Package manager: npm.
- Frontend: Next.js App Router `next@16.2.4`, React `19.2.5`, TypeScript.
- UI: React components under `components/`; lab UI under `components/labs/`; icons with `lucide-react`; animation support with `framer-motion`.
- Styling: Tailwind CSS `4.2.2`.
- Backend/orchestration: Node.js + TypeScript modules under `server/` and Lab A modules under `blueprint_launch/server/`.
- Local scripts/runners: `tsx@4.21.0` scripts under `scripts/`.
- Validation/contracts: `zod@4.4.2`.
- ORM/database target: Prisma `6.19.3` + PostgreSQL. The diagnostic branch did not change DB schema.
- Local DB orchestration target: Docker Compose for Postgres when DB is needed.
- Retrieval providers: OpenAlex + Crossref for candidate source search.
- LLM provider: OpenAI via `openai@6.34.0` and `OPENAI_API_KEY`.
- Deep Research fallback: OpenAI Responses API, default model currently expected as `o4-mini-deep-research` when configured.
- Image generation: OpenAI image model through `OPENAI_IMAGE_MODEL`, expected default `gpt-image-2` in the current diagnostic path.
- DOCX export: `docx@9.6.1`, with Lab B renderer under `server/blueprint-v2/lab/`.
- Local generated artifacts: `artifacts-local/`; do not commit generated artifacts.

Important npm commands:

```bash
npm install
npx tsc --noEmit --pretty false
npm run dev
npm run db:up
npm run db:down
```

Important diagnostic commands:

```bash
npx tsx scripts/run-evidence-candidate-search.ts --case case-003-medicine-public-health --expand --max-candidates 15
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case case-003-medicine-public-health
npx tsx scripts/run-lab-b-full-diagnostic-docx.ts --handoff <path-to-evidence-handoff-v1.json> --allow-degraded-handoff --skip-hero-image
```

## Que hace el producto

Ingeniometrix es un asistente academico etico para estudiantes de maestria, posgrado o profesionales en Peru. El MVP ayuda a convertir un intake estructurado en una propuesta academica trazable:

- normaliza el intake;
- busca fuentes candidatas;
- exige seleccion humana de fuentes;
- resuelve acceso/materializacion cuando es posible;
- extrae evidencia;
- consolida un handoff de evidencia;
- prepara insumos de Blueprint Engine;
- genera reportes diagnosticos y DOCX;
- mantiene trazabilidad, dashboards de calidad, costos y readiness.

Reglas de producto no negociables:

- no inventar citas;
- no inventar datos;
- no inventar resultados;
- no ocultar limitaciones;
- no tratar el producto como generador automatico de tesis;
- toda salida significativa debe estar trazada a fuentes recuperadas o declarada como supuesto.

## Estado actual

Branch activo:

```text
codex/lab-a-b-diagnostic-pipeline
```

Estado del pipeline:

- El branch esta en estado experimental/diagnostico, no production-ready.
- Lab A y Lab B corren localmente con guardas de trazabilidad, contaminacion, source health, citation semantics, telemetry y production readiness.
- El pipeline puede producir DOCX diagnosticos, pero las compuertas de produccion deben seguir bloqueando handoffs degradados, evidencia insuficiente o fuentes no revisadas.
- El Method Selection Layer existe como capa hibrida/LLM asistida y debe mantenerse evidence-bound.
- El fallback Deep Research rapido existe solo como discovery/supplement, no como evidencia citable directa.

Estado Git importante:

- Commit tecnico grande ya fue subido al branch.
- Este handoff debe vivir en el mismo branch.
- Hay archivos locales generados y backups que no deben commitearse.

## Que funciona

Candidate search:

- `scripts/run-evidence-candidate-search.ts` puede ejecutar busqueda expandida.
- La expansion por categorias evita usar terminos de intakes anteriores como fallback semantico.
- Produce `candidate-sources.json`, `candidate-sources-summary.md`, `source-selection-template.json` y `run-summary.json`.

Source Selection UI:

- Ruta local: `http://localhost:3000/lab/evidence-source-selection`
- Si Next usa otro puerto: `http://localhost:3001/lab/evidence-source-selection`
- Lee runs desde `artifacts-local/evidence-candidate-search-runs/`.
- Guarda `source-selection.json` en el run folder.

Evidence Engine / Lab A:

- Runner principal: `scripts/run-evidence-selected-sources-steps-2-6.ts`.
- Respeta seleccion humana.
- Bloquea si Step 2 o Step 3 no pasan, salvo modo diagnostico explicito.
- Soporta PDFs provistos por usuario con manifest local.
- Produce source health, citation semantics, reduced evidence pack, telemetry, dashboard y production readiness.

User-provided PDFs:

- Script: `scripts/prepare-user-provided-source-pdfs.ts`.
- Test: `scripts/test-user-provided-pdf-import.ts`.
- Los PDFs locales se registran con checksum, tamano, MIME y provenance.
- `allowed_for_production` queda `false` hasta revision humana futura.

Lab B:

- Runner full diagnostic: `scripts/run-lab-b-full-diagnostic-docx.ts`.
- Produce DOCX diagnosticos master/institucional cuando recibe handoff compatible.
- Mantiene warning propagation, freshness/stale scan, telemetry y dashboards.
- Produce method selection artifacts cuando hay handoff/reduced pack.

Guardas:

- Production safety.
- Fresh-run isolation.
- Stale-content scan.
- Citation semantics.
- Source health.
- Section evidence binding.
- Evidence budget/reduced pack.
- Run telemetry.
- Production readiness report.

## Que falta

Antes de MVP Release 0:

- Revisar una nueva corrida completa con un intake fresco y fuentes suficientes.
- Afinar separacion entre fuentes nucleares, fuentes secundarias y fuentes de background.
- Integrar flujo de subida/asociacion de PDFs proporcionados por usuario en UI real.
- Mantener Deep Research como fallback opcional y no-citable hasta que sus fuentes pasen por seleccion y Evidence Engine.
- Consolidar scripts diagnosticos en estructura mas limpia.
- Decidir cuales fixtures se quedan como benchmarks y cuales deben archivarse.
- Integrar persistencia real cuando el pipeline local este estable.
- Preparar deploy solo despues de estabilizar candidate search + source selection + evidence handoff.

No hacer todavia:

- No debilitar compuertas de produccion.
- No usar outputs diagnosticos como production-valid.
- No commitear `artifacts-local/`.
- No commitear PDFs de usuario.
- No commitear `.env`.
- No mover masivamente archivos sin una tanda de cleanup validada.

## Como correr localmente

Instalar:

```bash
npm install
```

Typecheck:

```bash
npx tsc --noEmit --pretty false
```

Levantar app:

```bash
npm run dev
```

Abrir UI lab de seleccion de fuentes:

```text
http://localhost:3000/lab/evidence-source-selection
```

Si el puerto 3000 esta ocupado:

```text
http://localhost:3001/lab/evidence-source-selection
```

Candidate search:

```bash
npx tsx scripts/run-evidence-candidate-search.ts --case <case_id> --expand --max-candidates 15
```

Evidence Engine con fuentes seleccionadas:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case <case_id>
```

Preparar PDFs proporcionados por usuario:

```bash
npx tsx scripts/prepare-user-provided-source-pdfs.ts --case <case_id> --evidence-run-folder <evidence-run-folder> --pdf-folder <folder-with-pdfs>
```

Evidence Engine usando manifest de PDFs locales:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case <case_id> --user-provided-pdf-manifest <path-to-user-provided-source-pdfs.json>
```

Lab B full diagnostic:

```bash
npx tsx scripts/run-lab-b-full-diagnostic-docx.ts --handoff <path-to-evidence-handoff-v1.json> --allow-degraded-handoff --skip-hero-image
```

Con hero image diagnostico:

```bash
npx tsx scripts/run-lab-b-full-diagnostic-docx.ts --handoff <path-to-evidence-handoff-v1.json> --allow-degraded-handoff
```

## Variables de entorno necesarias

Crear `.env` local. No commitear.

Minimo para flujos LLM:

```text
OPENAI_API_KEY=...
```

Modelos/config recomendados o esperados por el trabajo diagnostico:

```text
OPENAI_MODEL=...
OPENAI_DEEP_RESEARCH_MODEL=o4-mini-deep-research
OPENAI_IMAGE_MODEL=gpt-image-2
```

DB local si se necesita:

```text
DATABASE_URL=postgresql://...
```

Notas:

- Sin `OPENAI_API_KEY`, algunas capas deben caer en modo fallback/blocked/insufficient evidence.
- No escribir secretos en documentacion, tests o artifacts versionados.

## Bugs conocidos

- Algunas fuentes con PDF publico fallan por 403, Cloudflare, CAPTCHA o bloqueo editorial.
- La solucion MVP prevista es asociar PDFs proporcionados por usuario, no automatizar CAPTCHA ni browser scraping.
- Puede haber candidatos secundarios demasiado generales si las referencias de los PDFs son amplias.
- Deep Research rapido debe tratarse como discovery-only hasta que las fuentes pasen por seleccion humana y Evidence Engine.
- Artifacts locales no viajan con Git; otro agente debe regenerarlos o recibirlos por canal externo si los necesita.
- Existe un cambio local en backup bajo `backups/pre-integration-2026-05-03-1415/...`; no es runtime y no debe incluirse en commits de producto.
- El pipeline todavia necesita otra validacion con intake fresco antes de llamarlo listo para MVP.

## Prioridad para lanzar el MVP

1. Validar un intake nuevo end-to-end con fuentes suficientes y sin contaminacion.
2. Mantener source selection humana como checkpoint obligatorio.
3. Robustecer asociacion de PDFs proporcionados por usuario.
4. Mantener production readiness estricto y explicable.
5. Reducir scripts diagnosticos a wrappers mas limpios sin perder trazabilidad.
6. Preparar persistencia/deploy solo cuando el pipeline local sea estable.

## Rutas clave

Lab A / Evidence Engine:

- `blueprint_launch/server/`
- `scripts/run-evidence-candidate-search.ts`
- `scripts/run-evidence-selected-sources-steps-2-6.ts`
- `scripts/prepare-user-provided-source-pdfs.ts`

Shared contracts / quality:

- `server/blueprint-engine/contracts/`
- `server/blueprint-engine/adapters/`
- `server/blueprint-engine/quality/`

Lab B / Blueprint and DOCX:

- `server/blueprint-v2/lab/`
- `server/blueprint-v2/sections/`
- `server/blueprint-v2/compose/`
- `scripts/run-lab-b-full-diagnostic-docx.ts`

Lab-only UI:

- `app/lab/evidence-source-selection/page.tsx`
- `app/api/labs/evidence-source-selection/`
- `components/labs/evidence-source-selection/`

Fixtures:

- `fixtures/intakes/`

Generated local artifacts:

- `artifacts-local/`

## Tests sugeridos antes de seguir

Run basico:

```bash
npx tsc --noEmit --pretty false
```

Core guard tests:

```bash
npx tsx scripts/test-candidate-search-keyword-expansion.ts
npx tsx scripts/test-stale-fallback-cleanup.ts
npx tsx scripts/test-fresh-run-isolation.ts
npx tsx scripts/test-method-selection.ts
npx tsx scripts/test-source-health.ts
npx tsx scripts/test-citation-semantics.ts
npx tsx scripts/test-production-safety-and-contamination-guards.ts
```

Evidence and readiness tests:

```bash
npx tsx scripts/test-user-provided-pdf-import.ts
npx tsx scripts/test-evidence-budget.ts
npx tsx scripts/test-run-telemetry.ts
npx tsx scripts/test-production-readiness-dashboard.ts
```

Lab B/reporting tests:

```bash
npx tsx scripts/test-section-evidence-binding.ts
npx tsx scripts/test-editorial-output-enforcement.ts
npx tsx scripts/test-docx-structural-qa.ts
npx tsx scripts/test-project-management-content.ts
npx tsx scripts/test-hero-infographic-policy.ts
```

## Commit hygiene

Do commit:

- source code;
- docs;
- tests;
- fixtures intentionally versioned;
- package scripts.

Do not commit:

- `.env`;
- secrets;
- `artifacts-local/`;
- user-provided PDFs;
- generated DOCX/PNG/PDF/JSON diagnostics unless intentionally promoted to fixtures;
- backup folders unless explicitly reviewed.

Recommended next agent command to inspect status:

```bash
git status --short
git log --oneline -5
```

## Indicacion corta para el siguiente agente

Trabaja en el branch `codex/lab-a-b-diagnostic-pipeline` del repo `https://github.com/josmavel-cloud/ingeniometrix`. Lee `AGENTS.md` y este `HANDOFF.md` primero. No debilites compuertas de produccion. No uses artifacts viejos como fuente semantica. Continua con un intake nuevo o con una tanda pequena de cleanup, validando con `npx tsc --noEmit --pretty false` y los tests guard relevantes antes de correr pipelines largos.
