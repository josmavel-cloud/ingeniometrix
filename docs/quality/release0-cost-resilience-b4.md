# B4: candidato de coste y recuperacion

Fecha: 2026-09-21. Rama `fix/mvp-cost-resilience` desde
`b68c783f383e6c5362ae367eeb25b055cf2ab8ce` (RC2).
Release/tag originales no modificados. Sin push, deployment ni llamadas pagadas.
Cambios locales sin commit; no se ha promovido este candidato.

## Causa confirmada

El polling de lista interpretaba inactividad de 4 segundos como razon para
POST /resume; ese servicio borraba attempts y backoff, incluso en trabajos
fallidos. Un error de diagrama o de longitud PDF invalidaba Step 6 completo.
La recuperacion solo reutilizaba Step6 terminado con blueprint_version_id,
no las 13 fases cientificas ya generadas antes del render.

Lectura final de DB/registro privado, sin modificar el incidente:

- Proyecto real: `20d20b7b-6d48-477c-a8ee-b1dd403fc0b9`.
- Job: `b711099f-7a75-4097-9a0f-f3acfc0b9bf4`, FAILED, attempts=3/max=3.
- Step 5: completado una vez; cuatro referencias seleccionadas/cuatro cards.
- Step 6: ocho fallos, tres overflow de diagrama y cinco de presupuesto PDF.
- Trece fases cientificas repetidas ocho veces cada una.
- Registro texto/vision: 202 llamadas, input 1,463,958, cache 59,136,
  output 257,625, total 1,721,583; USD 5.832219 estimados.
- Step 5: 7 llamadas / USD 0.087562. Step 6: 195 / USD 5.744657.
- Estas cifras NO incluyen necesariamente todas las solicitudes Images: el
  registro no las cubre y sidecars sobrescritos no permiten afirmar coste total.
- Tiempo registrado en StepRuns: inspeccion 8,919 ms; Step5 95,907 ms;
  Step6 fallidos 2,568,309 ms. No sumar espera de navegador/backoff como ejecucion.

La cifra inicial del encargo (185 llamadas/USD 5.285663) era una captura anterior.
Principales entradas repetidas: revision 153,878 tokens; resumen 151,495;
titulo 150,942; matriz 126,622. Metodologia recibio 95,349. La eliminacion de
repeticiones y checkpoints aborda el mayor multiplicador; no un downgrade ciego.

## Cambios productivos

- Progreso y ambos componentes: sin auto-resume; estado activo distinto de fallo.
- Endpoints HTTP directos `mvp/step-5` y `mvp/step-6`: 409 sin contexto de job
  persistente. Ningun componente actual los consume. Cierra la elusion del
  presupuesto sin cambiar autenticacion ni el endpoint canonico de generacion.
- Job service: contadores acumulativos, reclamacion/encolado serializados,
  fencing de lease, recuperacion limitada, terminales no revividos, historial
  de ejecucion, mensajes publicos y publicacion idempotente.
- `job-execution-context.ts`: reservas persistentes y checkpoints en tablas
  existentes; evidencia, diseno, secciones, matriz, revision, visuales, DOCX/PDF.
- `execution-policy.ts`: clasificacion central y limites configurables.
- Adaptadores OpenAI/Images/Deep Research: reserva antes de transporte y uso
  reportado despues; errores desconocidos conservan coste preventivo.
- `openai-cost-bound.ts`: texto/vision acotados por separado y tarifa de
  contexto largo; no contar base64 como tokens de texto.
- `generation-budgets.ts` y `scientific-plan.v4.ts`: salidas por fase y menos
  contexto repetido; sin cambiar modelos cientificos ni evidencia/matriz.
- Visuales: geometria adaptativa y labels deterministas con texto completo
  retenido; fallback de presentacion sin rehacer ciencia.
- DOCX/PDF: compactacion solo de espacios, soft 18, guarda 24, advertencias
  editoriales separadas del gate cientifico. PDF fuera de guarda conservado
  para revision, no reintento cientifico automatico.
- Compose y `.env.example`: configuracion de coste/paginacion, sin secretos.

Prisma/schema/migraciones, autenticacion y arquitectura cientifica: sin cambios.
Los cambios de frontend son solo estado/polling, no rediseno.

## Calibracion

| Fuente historica | Coste observado | Alcance |
| --- | ---: | --- |
| B2 ingenieria continuacion | 0.56140810 | Texto; no comparar imagenes |
| B2 cualitativo | 0.48738925 | Texto |
| B3 cualitativo final | 0.8209522 | Texto/condensacion + imagen |
| Cierre visual, smoke productivo | 0.849513 | Texto/vision + imagenes |

Fuentes: informes B2, B3 y `release0-visual-acceptance.md` del repositorio.
Son cuatro observaciones heterogeneas, no una distribucion estadistica: no se
publica P50 ni SLA. Mayor camino normal comparable documentado: USD 0.849513.
Target 1.25, soft 1.50 y hard 2.00 dan aproximadamente 47%, 77% y 135% de margen
sobre ese caso. Son defaults provisionales configurables, no precio universal.
El incidente roto no es baseline. El subpresupuesto Deep Research 0.50 NO
financia su cota actual 1.67; permanece desactivado/bloqueado antes de pagar.

## Validacion

- 48/48 suites `test:*` pasaron en la base B4 aislada, sin claves API.
- Suite B4 ampliada: 34 comprobaciones agrupadas PASS.
- Incluye simulacion de 10 minutos de polling, resume concurrente, agotamiento,
  presupuesto atomico, persistencia en proceso nuevo, invalidacion de checkpoints,
  perdida de lease, publicacion unica, negativo sin evidencia, diagramas largos,
  preservacion XML al compactar y sizing preventivo de vision.
- Primera pasada: 47/48. La discrepancia del contrato editorial se corrigio
  preservando el rechazo estricto de perdida de citas; original conservado por
  el generador. No se omitio ni debilito esa asercion.
- Prisma validate, TypeScript, build Next.js y bundle del worker: PASS.
- `test:secure-pilot`: aislamiento de dos usuarios, recuperacion, artefactos
  durables y proveedor no disponible: PASS. Fixture actualizada con HTTP 503
  explicito; ya no se clasifican excepciones arbitrarias como transitorias.
- Nuevas aceptaciones pagadas: 0. Gasto de esta tarea: USD 0.
- No se ha ejecutado E2E de navegador ni una nueva revision cientifica humana.
- La DB B4 fue detenida al cerrar, sin eliminar datos. App/DB manuales siguen
  running; su worker sigue exited. Treinta archivos intencionales modificados
  o nuevos, incluyendo tres documentos; sin cambios en schema/auth.

Export sintetico offline (no es un plan cientifico nuevo):
`artifacts-local/b3-offline/regression-oxJ0st/final-thesis-plan.docx` y `.pdf`,
seis paginas totales/cuatro de cuerpo; texto completo y citas comprobados.
Visuales offline: `artifacts-local/visual-offline/regression-mA3Trc/`, siete
assets y matriz visual antes de tabla editable. No equivale a una nueva
inspeccion visual humana de un caso real.

## Inventario de llamadas del job

| Llamada/fase | Clase | Modelo efectivo/configuracion conservada | Cambio B4 |
| --- | --- | --- | --- |
| Extraccion de fuente Step5 | EVIDENCE_EXTRACTION | IMX_STEP5_EXTRACTION_MODEL / LLM_FAST_MODEL; mini en incidente | Reserva persistente; sin downgrade |
| Localizacion visual Step5 / OCR ecuacion | OPTIONAL / MECHANICAL | IMX_STEP5_VISION_MODEL / fast; mini en incidente | Reserva de vision por patches |
| Sintesis de evidencia | ROUTINE_DRAFTING | GPT-5.4 | v3 -> v4, checkpoint y salida 4500 |
| Problema / preguntas / objetivos | SCIENTIFIC_REASONING | GPT-5.4 | v4, checkpoints y salida 4500 por fase |
| Marco conceptual | ROUTINE_DRAFTING | GPT-5.4 | v4, contexto selectivo y salida 4500 |
| ResearchDesign | SCIENTIFIC_REASONING | GPT-5.4 | v4, checkpoint y salida 6000 |
| Metodologia | SCIENTIFIC_REASONING | GPT-5.4 | v4, conserva problema/diseno/antecedentes; salida 6500 |
| Contribucion / limitaciones | ROUTINE_DRAFTING | GPT-5.4 | v4, contexto selectivo y salida 4500 |
| Matriz | SCIENTIFIC_REASONING | GPT-5.4, consistency-matrix.v1 | Checkpoint; salida 5000 existente |
| Revision transversal | SCIENTIFIC_REVIEW | GPT-5.4 | v4; todas las secciones; salida 3500 |
| Titulo / resumen | MECHANICAL / ROUTINE_DRAFTING | GPT-5.4 | v4; documento estable sin extractos repetidos; salidas 1500/4500 |
| Compresion por seccion | OPTIONAL / REPAIR | GPT-5.4-mini, section-budget.v2 | Una llamada por entrada; rechazo de perdida de citas y original conservado |
| QA de hero/matriz | OPTIONAL | IMX_VISUAL_QA_MODEL / mini, visual-qa.v1 | high explicito; reserva persistente |
| Hero / composicion matriz visual | OPTIONAL | gpt-image-2.5-sunburst, high | Reserva persistente, fallback transparente |
| Deep Research | OPTIONAL, DISABLED | o4-mini-deep-research | Subpresupuesto persistente; OFF y sin llamada |

Intake/refinamiento/descubrimiento anteriores al job no se rerutearon. Nano no
se introduce en una llamada cientifica sin evaluacion. `PROMPTS_USED.md` de cada
ejecucion conserva los templates completos y schema real del generador;
en B4 solo se generaron inventarios de mocks, no de aceptacion pagada.

## Limites y estado

`IMPLEMENTATION_STATUS = CANDIDATE_WITH_LIMITATIONS`.
`LIVE_SCIENTIFIC_ACCEPTANCE = NOT_RUN`.
`INCIDENT_RECOVERED = NO` (intencional; estado preservado).

Pendiente demostrar el perfil de tokens/coste con un plan real nuevo antes de
promover. No existe aun UI para ampliar presupuesto; un bloqueado no se
reanuda a escondidas. El margen de trabajo restante es estimado, no prediccion
exacta de todo contenido futuro. Para paginas sobrantes se mantiene el unico
pase editorial previo a revision; no se agrega otro pase LLM posterior.
Los limites persistentes aplican al camino de jobs canonico; endpoints HTTP
de Step5/6 no permiten ejecutar fuera de el. Scripts locales de laboratorio
y pasos anteriores de descubrimiento, fuera del job, no constituyen este contrato.

Detalles/retencion/failure policy: [arquitectura B4](../architecture/COST_AND_RECOVERY_B4.md).
Operacion segura: [runbook B4](../runbooks/b4-cost-recovery.md).

Siguiente accion unica: aceptacion real controlada de un proyecto NUEVO con
este candidato, maximo USD 2.50, antes de promover o reiniciar el piloto.
