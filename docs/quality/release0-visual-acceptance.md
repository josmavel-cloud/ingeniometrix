# Ingeniometrix — Visual Thesis-Plan Deliverable Closure

Fecha: 2026-09-19
Baseline: `341a524bac2e1e370316ceff5ca57ad073d216ab`
Branch: `mvp/backend-core-clean`

## Estado

- `SCIENTIFIC_REGRESSION_STATUS = PASS`
- `VISUAL_PRODUCT_STATUS = PASS_WITH_LIMITATIONS`
- `PRODUCTION_STATUS = BLOCKED`

El cierre preserva el contenido científico B3 y agrega los entregables visuales a la ruta productiva de Step 6. No constituye revisión científica humana. La limitación visual es de extensión: ingeniería queda en 17 páginas de cuerpo y cualitativo en 18; ambos cumplen el máximo duro de 18, pero exceden el objetivo preferido de 12–16.

## Implementación productiva

`server/mvp/visual-deliverables.ts` construye un `VisualPlan` a partir de `ResearchDefinition`, `ResearchDesign`, la matriz validada y el ledger inspeccionado. Step 6 lo ejecuta antes de construir referencias cruzadas y antes del DOCX/PDF. Los cambios no dependen de datos de ingeniería, educación, universidades ni IDs de validación.

Entregables por documento:

1. Hero original con GPT Image 2.5 y QA sobre píxeles.
2. Diagrama conceptual declarativo y determinista.
3. Flujo metodológico declarativo y determinista.
4. Tabla editable de comparación de evidencia inspeccionada.
5. Tabla editable de diseño adaptada al paradigma.
6. Imagen de matriz validada.
7. Matriz completa en tabla Word editable.

No se añadieron ecuaciones: en ambos diseños se clasificaron `NOT_APPLICABLE` porque la evidencia aceptada no aportaba una ecuación verificable necesaria para expresar el método. No se generó matemática decorativa.

## Secuencia de matriz

Secuencia ejecutada y registrada:

`matriz estructurada validada -> backdrop visual sin texto -> superposición determinista desde la matriz -> QA visual de píxeles -> tabla Word nativa completa -> inserción imagen primero/tabla después`

La imagen es una proyección visual de las relaciones, nombres y terminología. La tabla editable conserva el contenido íntegro. Ambas registran el mismo `matrix_hash`; no se reconstruye verdad científica desde píxeles ni se usa OCR.

## Hero y control visual

El `PublicVisualBrief` contiene únicamente sujeto, método propuesto, relaciones visuales permitidas y etiquetas públicas. No recibe ledgers crudos, IDs de pregunta/objetivo/constructo, rutas, anclas ni modelos. La QA usa la imagen real como `input_image`, no un regex sobre el prompt. Ingeniería y cualitativo aprobaron en la primera solicitud; reparaciones de imagen: 0.

Modelos y prompts:

- Hero/matriz: `gpt-image-2.5-sunburst`, `quality=high`; hero `1024x1024`, matriz `1536x1024`.
- QA visual: `gpt-5.4-mini` (modelo real reportado: `gpt-5.4-mini-2026-03-17`), JSON schema estricto, `max_output_tokens=900`.
- Texto científico del smoke: configuración B3 existente; no se cambió la política de modelos de texto.
- Prompts: `hero-infographic.v2`, `consistency-matrix-visual.v1`, `visual-quality-assurance.v1`.

Inventarios completos de plantillas, arreglos de roles, parámetros y prompts resueltos:

- Ingeniería: `artifacts-local/release0-visual-acceptance/engineering/PROMPTS_USED.md`
- Cualitativo: `artifacts-local/release0-visual-acceptance/qualitative/PROMPTS_USED.md`

## Aceptación congelada B3

Los dos rerenders verificaron igualdad de `project_id`, `blueprint_version_id` y hashes SHA-256 del paquete y ledger antes de reutilizar el contenido. No hicieron nueva adquisición de evidencia.

### Ingeniería

- DOCX: `artifacts-local/release0-visual-acceptance/engineering/final-thesis-plan.docx`
- PDF: `artifacts-local/release0-visual-acceptance/engineering/final-thesis-plan.pdf`
- Resultado: `artifacts-local/release0-visual-acceptance/engineering/acceptance-result.json`
- Contact sheet: `artifacts-local/release0-visual-acceptance/engineering/contact-sheet-132152acd89d.png`
- 19 páginas totales; 17 de cuerpo; todas renderizadas e inspeccionadas.
- Hero: página 1.
- Tabla comparativa: página 5.
- Diagrama conceptual: página 7.
- Workflow y tabla de diseño: página 11.
- Matriz visual primero y tabla editable después: página 12 en adelante.

### Cualitativo

- DOCX: `artifacts-local/release0-visual-acceptance/qualitative/final-thesis-plan.docx`
- PDF: `artifacts-local/release0-visual-acceptance/qualitative/final-thesis-plan.pdf`
- Resultado: `artifacts-local/release0-visual-acceptance/qualitative/acceptance-result.json`
- Contact sheet: `artifacts-local/release0-visual-acceptance/qualitative/contact-sheet-1354c2c7ff6a.png`
- 20 páginas totales; 18 de cuerpo; todas renderizadas e inspeccionadas.
- Hero: página 1.
- Tabla comparativa: página 4.
- Diagrama conceptual: página 6.
- Workflow y tabla de diseño: página 10.
- Matriz visual primero y tabla editable después: página 12 en adelante.

El asset fuente `S3-A008` (captura de Möbius Assessment) conservaba geometría y procedencia, pero no superó la nueva puerta final de relevancia directa para el estudio rural (`subject_overlap_terms=[]`). Fue excluido del documento y registrado como `rejected`; no se redujo el umbral para conservarlo.

La inspección visual de las 39 páginas finales confirmó: heroes pertinentes, matrices legibles, diagramas sin clipping, tablas completas, citas conservadas, ausencia de identificadores internos y ausencia de contaminación cuantitativa en el caso cualitativo.

## Smoke productivo

Se ejecutó una única generación nueva de Step 6 sobre la base PostgreSQL aislada existente; no se repitió recuperación de fuentes.

- Run: `release0-visual-production-smoke-2026-09-19T02-23-03-915Z`
- Resultado: `artifacts-local/release0-visual-acceptance/production-smoke/result.json`
- DOCX: `artifacts-local/mvp-step6-blueprint-docx/adfc6589-84fa-4e6c-89d9-c2cbef685dec/release0-visual-production-smoke-2026-09-19T02-23-03-915Z/final-thesis-plan.docx`
- PDF: `artifacts-local/mvp-step6-blueprint-docx/adfc6589-84fa-4e6c-89d9-c2cbef685dec/release0-visual-production-smoke-2026-09-19T02-23-03-915Z/final-thesis-plan.pdf`
- Resultado técnico: `completed`; 20 páginas totales/18 de cuerpo; 2 solicitudes iniciales de imagen; 0 reparaciones; siete entregables aceptados.
- Duración backend: 340,836 ms.
- Texto/visión: 26 llamadas globales durante la ventana, 212,524 tokens y USD 0.750143; 24 llamadas quedaron correlacionadas al run (206,319 tokens, USD 0.745062).
- Imágenes: USD 0.099370.
- Coste smoke: USD 0.849513.

El smoke reveló que las dos llamadas de QA visual conservaban uso y sidecars, pero no heredaban `runId` en el registry global porque ocurrían después del contexto de generación científica. La implementación quedó corregida con atribución explícita `projectId/runId/stage/promptVersion` y regresión offline; no se repitió el full run por el límite de una ejecución fresca.

## Uso y coste total de la tarea

- Imágenes de los dos rerenders congelados: USD 0.199835.
- QA visual conocido durante desarrollo/rerender: 12 llamadas, 37,689 tokens, USD 0.019622.
- Smoke productivo texto/visión: USD 0.750143.
- Smoke productivo imágenes: USD 0.099370.
- `TOTAL_KNOWN_PROVIDER_COST_USD = 1.068970`.
- Una llamada QA fallida no devolvió uso; no se registra como cero. Reserva preventiva máxima asociada: USD 1.239995.
- `TOTAL_TASK_UPPER_BOUND_USD = 2.308965`, inferior al máximo USD 8.00.
- Reparaciones de imagen: 0; coste de reparación: USD 0.

## Validación técnica

- 46/46 suites offline: PASS (43 B2, 2 B3, 1 visual nueva).
- TypeScript directo: PASS.
- Prisma validate: PASS.
- Build Next.js/Node 20.20.2 en modo offline controlado: PASS.
- El build con `.env` literal falló primero por PostgreSQL `localhost:5433` inaccesible desde el contenedor y `NODE_ENV` no estándar; no fue un defecto de compilación. Con `NODE_ENV=production` y datasource offline controlado compiló, typecheckeó, prerenderizó 61/61 páginas y finalizó. La consulta de plantilla que intenta acceder al datasource durante el prerender se degradó sin impedir el build.
- Warnings persistentes: 9 avisos Turbopack de trazado amplio de filesystem y warnings React legacy de keys en el primer intento. Son anteriores y quedan fuera de este cierre; el tracing amplio es `IMPORTANT` para producción.

## Continuidad y limpieza posterior

- `VisualPlan` produce y consume cada activo, conserva fuentes internas y solo publica atribución académica.
- `consistency_matrix_image` y `consistency_matrix_table` consumen la misma matriz y hash.
- `heroReuse` permanece para finalizadores históricos y puede omitir el VisualPlan: `CLEAN_AFTER_ACCEPTANCE`.
- `final-infographic.ts`/prompt v1 permanece para compatibilidad de pruebas; Step 6 canónico usa v2: `CLEAN_BEFORE_PRODUCTION`.
- Los sidecars y renders permanecen fuera de Git como evidencia de aceptación: `AUDIT_ONLY`.

## Bloqueadores de production hardening

- Cookie de sesión/userId sin firma y login por email sin verificación.
- Ausencia de verificación integral de ownership/aislamiento en rutas legacy.
- Artifacts locales no durables.
- Jobs HTTP no recuperables/cola no durable.
- Estrategia de adopción de migraciones para base existente pendiente.
- Rutas lab/legacy aún expuestas o sin protección definitiva.
- Trazado amplio de filesystem puede empaquetar `artifacts-local` y aumentar el bundle.

## Runtime de integración

Node 20.20.2, PostgreSQL/Prisma, `OPENAI_API_KEY` con acceso a `gpt-image-2.5-sunburst` y al modelo visión configurado, Sharp, LibreOffice, `pdftotext`/`pdftoppm` y almacenamiento escribible para `artifacts-local`. No hubo cambios frontend, auth, schema DB, deployment ni push.

## Siguiente acción

Congelar el motor documental en este commit y entregar el hash y los requisitos runtime a **production hardening + integración frontend/backend + E2E + deployment**.
