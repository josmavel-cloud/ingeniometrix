# B4: coste y recuperacion acotados

Estado: candidato en `fix/mvp-cost-resilience`, sobre RC2. No desplegado.
Implementacion: `server/mvp/job-execution-context.ts`, `execution-policy.ts`
y `server/blueprint-v2/jobs/blueprint-job-service.ts`.

## Invariantes

| Invariante | Control productivo | Regresion |
| --- | --- | --- |
| A: vida finita | Fallos y leases vencidos incrementan `BlueprintJob.attempts`; ningun avance/resume lo borra. Maximo tres recuperaciones/fallos; hasta tres ejecuciones por checkpoint compatible. | Agotamiento y resume concurrente |
| B: coste persistente | Reserva SQL antes de pagar, serializada con `FOR UPDATE` del job; uso desconocido conserva la reserva. | Segundo proceso vuelve a encontrar el mismo limite |
| C: presentacion no regenera ciencia valida | Checkpoints por fase cientifica, revision, visuales, DOCX y PDF; hashes de entrada/salida y archivos. | Fallo PDF sintetico tras 13 fases; recuperacion agrega cero llamadas cientificas |
| D: polling observacional | Ambos componentes solo leen progreso; `shouldNudge=false`. | 61 observaciones equivalentes a 10 minutos; intentos/coste/llamadas invariables |
| E: resume idempotente | No modifica jobs activos, backoff, leases ni terminales; el worker ya controla la recuperacion autorizada. | 12 solicitudes concurrentes; sin duplicados |
| F: presentacion degradable | Diagrama con etiquetas resumidas y geometria adaptativa; fallo visual conserva borradores originales; compresion rechazada conserva citas/texto. | Etiquetas espanolas largas; regresiones B3 |
| G: techo preventivo | Gasto comprometido + cota de llamada + reserva restante no supera hard; soft excluye trabajo opcional. | Reservas concurrentes y coste desconocido |
| H: integridad cientifica | Modelos cientificos sin downgrade, esquemas/citas intactos; evidencia insuficiente bloquea antes de pagar. | B2/B3 y negativo B4 |

`startedAt` identifica la concesion del worker y no cambia con el heartbeat.
Reservas, checkpoints y publicacion comprueban esa concesion. Una llamada ya
en vuelo puede liquidar su uso aun si perdio el lease; no puede autorizar otra.
Una version se crea junto con su referencia de checkpoint en una transaccion.

Los jobs anteriores a B4 no se recuperan automaticamente: carecen de libro de
reservas SQL reconciliado. Tampoco se permite que el boton de generar cree otro
job con las mismas entradas de uno fallido para eludir su presupuesto.
Entradas distintas permiten un nuevo trabajo explicitamente solicitado.

## Persistencia y consumidores

No se agrega schema ni migracion. Se reutiliza `BlueprintJobStage`:

| Registro | Productor | Consumidor | Retencion |
| --- | --- | --- | --- |
| `control:cost.outputJson` | Adaptador Responses/Images/Deep Research | Circuit breaker; informe de uso por job | Privado, autoritativo, no temporal |
| `checkpoint:EVIDENCE` | Worker/Step 5 | Generacion y recuperacion | Privado; referencia al resultado materializado |
| `checkpoint:RESEARCH_DESIGN`, `SECTION_DRAFTS:*`, `CONSISTENCY_MATRIX`, `SCIENTIFIC_REVIEW` | Generador cientifico | Fases posteriores; recuperacion | JSON estructurado privado, autoritativo para reutilizacion compatible |
| `checkpoint:EDITORIAL:*` | Compresor opcional | Misma seccion; revision posterior | Un intento por entrada compatible, no trabajo obligatorio |
| `checkpoint:VISUALS`, `DOCX`, `PDF`, `FINAL_EXPORT` | Renderizadores | Exportacion y reintento de presentacion | Metadatos y SHA-256; archivos pesados en volumen privado |
| `checkpoint:BLUEPRINT_VERSION` | Transaccion de publicacion | Recuperacion de la misma version | Retener con el job/version |
| `metadataJson.executions` | Worker | Diagnostico de fallos/duracion | Auditoria; duracion interrumpida desconocida es null, no espera de polling |
| `application-budget.json` | Step 6 | Auditoria local | Copia del libro SQL, no autoridad; no borrar durante aceptacion |
| `*.layout.json`, `pre-layout-thesis-plan.docx`, `layout-compaction.json` | Presentacion | Diagnostico de labels/paginacion | Audit-only; `CLEANUP_CANDIDATE: MONITOR` para futura politica de retencion |

Un checkpoint conserva fingerprint, intentos, estado, resultado, hash de
resultado, hashes de archivos y fecha. El coste se obtiene de las entradas
`control:cost` con el mismo `stage`; no se suma dos veces en checkpoints padres.
JSON se serializa con claves ordenadas: PostgreSQL JSONB reordena objetos.
Se invalidan entradas/cambios de prompt, schema, modelo, perfil o hashes.
Las fases cientificas no dependen de timestamps de render ni del nuevo StepRun.

## Politica de errores

| Clase | Auto retry | Salida |
| --- | --- | --- |
| SCIENTIFIC_INSUFFICIENCY | No | Solicitar evidencia/revision; no certificar |
| PROVIDER_TRANSIENT | Si, dentro de limites | Backoff; reutilizar checkpoints; cada llamada paga se reserva |
| PROVIDER_NONRETRYABLE | No | Revisar cuota/credencial/configuracion |
| STRUCTURED_OUTPUT | No a nivel de job | Revisar respuesta invalida; no aceptar JSON incorrecto |
| PRESENTATION | No a nivel de job | Fallback determinista o revision de exportacion conservando ciencia |
| INFRASTRUCTURE_TRANSIENT | Si, dentro de limites | Recuperacion acotada |
| INFRASTRUCTURE_FATAL / desconocido | No | Revision tecnica |
| COST_LIMIT | No | Trabajo conservado; requiere autorizacion externa |
| USER_ACTION_REQUIRED | No | No ejecutar nuevas llamadas |

Responses tiene SDK retries=0; wrapper hasta dos retries transitorios como
maximo, cada uno reservado. No reintenta cuota agotada, permisos, coste o errores
arbitrarios. Las fases son hasta tres ejecuciones, pero una fase editorial solo
una. El job conserva su contador incluso cuando una fase termina bien.

## Presupuestos y limites conocidos

Variables configurables, propagadas por Compose:
`IMX_JOB_TARGET_USD`, `IMX_JOB_SOFT_USD`, `IMX_JOB_HARD_USD`,
`IMX_JOB_MANDATORY_RESERVE_USD`, `IMX_JOB_DEEP_RESEARCH_USD`,
`IMX_BODY_TARGET_MIN_PAGES`, `IMX_BODY_TARGET_MAX_PAGES`,
`IMX_BODY_SOFT_MAX_PAGES`, `IMX_RENDER_SANITY_MAX_BODY_PAGES`,
`IMX_MAX_EDITORIAL_COMPRESSION_ROUNDS` y, solo para plantillas verificadas,
`IMX_TEMPLATE_HARD_MAX_BODY_PAGES_JSON`.
Defaults provisionales: 1.25 / 1.50 / 2.00 USD, reserva restante 0.25 USD;
0.05 para titulo/resumen finales. El libro guarda la politica inicial: cambiar
variables no modifica silenciosamente el permiso de un job existente.

Estos margenes no garantizan que todo intake termine por ese precio: cada
llamada se vuelve a comprobar; si el contenido legitimo no cabe, se pausa sin
recortar ciencia. La reserva restante es una estimacion conservadora operativa,
no una prediccion exacta de futuras facturas. Uso real son tokens reportados;
USD son estimados, no cobros informados por el proveedor. Error sin usage no es
cero. Sobrepasar la estimacion de una llamada bloquea llamadas posteriores.

Deep Research sigue OFF. Su cota actual de una llamada con herramientas es
USD 1.67, superior al subpresupuesto provisional 0.50: incluso activado por error
se bloquea antes de pagar. Habilitarlo requiere presupuesto explicito y prueba
separada; no se promete investigacion profunda por USD 0.50.

## Modelos y contexto

No se bajan modelos sin evaluacion cientifica. Extraccion/vision y compresion
mantienen mini; ResearchDesign, secciones, matriz y revision mantienen GPT-5.4.
`generation-budgets.ts` centraliza el perfil de fases. Nuevo prompt:
`prompts/scientific-plan.v4.ts`, instrucciones editoriales con limites; la API
recibe un unico input concatenado y JSON Schema estricto, no roles ficticios.
No se cambia el prompt de matriz ni de evidencia.

Tope de salida: 1500 titulo, 3500 revision, 4500 narrativa habitual,
5000 matriz, 6000 ResearchDesign, 6500 metodologia. Contextos previos se eligen
por fase; revision ve todas las secciones. Titulo/resumen usan el documento
estabilizado sin reenviar extractos crudos. Evidencia y texto previo tienen
guardas de 60000/50000 caracteres; exceso requiere revision, no truncacion.
No se ha validado todavia una nueva salida pagada con este perfil B4.

La skill OpenAI Docs se uso para comprobar tarifas y sizing de vision. Se
reserva texto por bytes UTF-8 + margen; para vision se fija `detail=high` y se
reserva por patches, no por bytes base64. Los modelos 5.4 documentan hasta 2500
patches y multiplicador 1.2; se reserva 3001 tokens por imagen, incluyendo margen
de redondeo. Modelos/detail sin cota conocida se rechazan. GPT-5.4 de contexto
largo incorpora la tarifa ampliada. Fuentes consultadas el 2026-09-21:
[vision](https://developers.openai.com/api/docs/guides/images-vision),
[GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4),
[mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

## Paginacion y publicacion

El perfil generico separa objetivo (12-15 paginas), umbral blando (18), limite
duro institucional y sanidad de render. No tiene limite academico duro por
defecto. Un documento valido por encima de 18 recibe `ABOVE_SOFT_MAX`, se
compacta deterministamente una vez y se publica con una advertencia breve.

Solo una plantilla institucional verificada puede aportar
`hardMaxBodyPages=N`; superarlo produce `TEMPLATE_LIMIT_EXCEEDED` y requiere
accion del usuario, sin regenerar ciencia. `RENDER_SANITY_FAILURE` es distinto:
detecta paginas sustantivas repetidas, crecimiento extremo incompatible con
los presupuestos de seccion, PDF invalido o una guarda de emergencia alta y
configurable (80 por defecto) contra corrupcion/runaway. Esa guarda no es una
regla universitaria.

El job admite como maximo una operacion editorial pagada por intento de
publicacion. El prompt actual trabaja por seccion, por lo que no se introdujo
un batching nuevo durante B4.3; las secciones restantes conservan texto y
reciben warning. Tras renderizar solo se compacta espaciado de forma
determinista, sin tocar fuentes, interlineado, imagenes, citas ni contenido.
La recuperacion `PRESENTATION_ONLY` exige checkpoints compatibles y prohíbe
cualquier nueva reserva pagada; solo `FINAL_EXPORT`, `DOCX` y `PDF` pueden
recalcularse deterministamente.
