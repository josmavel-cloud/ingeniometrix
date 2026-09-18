# B2 — Scientific Evidence Pipeline Repair & Acceptance Closure

Fecha: 2026-09-18. Producto: Ingeniometrix. Revision realizada por Codex, no por un comite ni revisor cientifico humano.

## A. ENGINE STATUS

`ENGINE_STATUS = PASS_WITH_LIMITATIONS`

`PUBLIC_RELEASE_STATUS = BLOCKED`

La cadena canonica produce planes propuestos, con evidencia inspeccionable, procedencia y exportacion completa en las dos evaluaciones nuevas. El negativo no genera plan. No se certifica la suficiencia de una tesis terminada, la novedad universal ni validez en todas las disciplinas. Ambos positivos conservan decisiones pendientes y gate `LIMITED`; `scientific_readiness` permanece `REQUIRES_SCIENTIFIC_REVIEW`.

Limitaciones del cierre: OpenAlex estaba limitado por cuota; se uso Crossref. Ingenieria tuvo Step 2 parcial y seleccion explicita de fixture antes de recuperar evidencia adicional. Los documentos finales son reexportaciones deterministas de las respuestas **nuevas B2**, sin nuevas llamadas ni reutilizacion de planes B1. Se conservaron las versiones originales y los registros editoriales; estos ultimos no se aplicaron a la reexportacion. Hay detalles de paginacion/citacion pendientes, no perdida de contenido sustantivo.

## B. ROOT CAUSE

Run B1 examinado: `release0-engineering-2026-09-18T17-15-31-591Z`; proyecto `553a625d-95dc-4b51-8b5b-095cdc80893a`. Se contrastaron DB, ledger, registro de fuentes y registros LLM; no se dedujo accesibilidad a partir del DOI.

| Referencia B1 | DOI | Abstract presente | URL PDF descubierta |
| --- | --- | --- | --- |
| S1 / `38542cfc-66ff-4ab3-a058-9aadee7bc330` | 10.1155/2023/8392421 | Si, 1656 caracteres | https://downloads.hindawi.com/journals/schm/2023/8392421.pdf |
| S2 / `0f4061ab-63e0-4673-b0f6-82e7e504a9c9` | 10.3390/su151511624 | Si, 1705 caracteres | https://www.mdpi.com/2071-1050/15/15/11624/pdf?version=1690460184 |
| S3 / `6579d43b-77b5-412f-86a4-396ae9ef2ba4` | 10.3846/13923730.2005.9636362 | Si, 1467 caracteres | https://journals.vgtu.lt/index.php/JCEM/article/download/8925/7785 |

Para **cada una** de esas tres referencias: `SOURCE_SELECTED=YES`, `METADATA_PRESENT=YES`, `FULL_TEXT_DISCOVERED=URL_ONLY`, `FULL_TEXT_ACCESSIBLE=UNKNOWN`, `PDF_ATTEMPTED=NO`, `PDF_RESULT=NOT_RUN`, `TEXT_MATERIALIZED=NO`, `CHUNKS_CREATED=0`, `STEP5_INPUT_PRESENT=YES (abstract)`, `LLM_EXTRACTION_EXECUTED=YES`, `EVIDENCE_ITEMS_CREATED=0`, `CITATION_ANCHORS_CREATED=0`.

Causas concatenadas:

1. Step 5 buscaba una inspeccion previa pero el recorrido de aceptacion no la ejecutaba: no existia `MvpStepRun` de inspeccion. Un enlace PDF no se materializa por estar en metadata.
2. Step 5 SI recibio abstracts: no fue falta total de entrada. Las tres extracciones estructuradas y sus tres fallbacks agotaron 3500 tokens de salida y dejaron JSON truncado/invalido. El ledger registro las extracciones fallidas sin items.
3. El gate posterior admitia referencias bibliograficas sin exigir evidencia inspeccionable; tres DOI no acreditaban soporte de afirmaciones.
4. La correccion previa de DOCX no cubria todos los puntos: persistian recortes por caracteres/celdas y por presupuesto de palabras. Insertar parrafos de referencias cruzadas desplazaba anclas; una revision editorial podia cambiar coordenadas sin renovar procedencia.

Fallo adicional demostrado durante B2: OpenAlex devolvio 429 con `Retry-After=12056`; el cliente dormia horas. Se interrumpio solo el proceso B2 propio y se marco su Step 2 como fallido en la DB aislada. La continuacion uso el unico ciclo de reparacion pagado permitido.

## C. CHANGES

| Archivos | Cambio necesario |
| --- | --- |
| `server/mvp/evidence-continuity.ts` | Nivel determinista, verificacion literal, huella del intake, seleccion/proyecto/Step 5 y elegibilidad compartida por gate y consumidor. |
| `server/mvp/source-inspection-service.ts` | Integrar disponibilidad honesta; GET y firma PDF, intentos/timeout acotados, abstract valido como fallback; conteo de inspecciones independiente de descarga exitosa. |
| `server/mvp/evidence-materialization-service.ts`, `evidence-materialization-types.ts` | Ejecutar inspeccion en la misma cadena; entradas de extraccion correlacionadas; no consumir texto de una identidad incompatible; evidencia segun texto realmente enviado; verificar extractos, conservar fallos. |
| `server/mvp/prompts/step5-source-evidence-extraction.v3.ts`, `server/retrieval/retrieval-llm-json.ts` | Prompt versionado con extracto literal, maximo seis items y salida acotada a 8000; soporte del limite en helper. |
| `server/mvp/step6-blueprint-docx-service.ts` | Bloqueo previo al LLM sin evidencia; anclas por fuente+item, indices estables, rechazar revision incompatible; no truncar; tablas y proyeccion estructurada fieles al plan, sin adoptar variables de otros estudios ni inventar cronograma. Hash/version de DOCX. |
| `server/mvp/canonical-docx-download.ts`, `app/api/projects/[id]/blueprints/[versionId]/docx/route.ts` | Descargar el artefacto de esa version/proyecto, verificar manifiesto/hash; no sustituir una version MVP rota por otro generador. Se preserva autorizacion existente, no se modifica auth. |
| `llm/providers/openai.ts`, `server/llm-usage-registry.ts` | Timeout con cancelacion SDK, sin doble retry oculto; reserva preventiva de coste opcional; captura de solicitud efectiva para fixtures; registrar modelo efectivo y tarifa de snapshot. |
| `server/mvp/intake-normalization-service.ts` | Corregir `required.en` del JSON Schema estricto, sin cambiar prompt ni modelo. |
| `server/retrieval/{openalex-client,crossref-client,reference-search-v2}.ts` | Timeout HTTP; no esperar horas por cuota; usar fallback Crossref existente y registrar degradacion. |
| `scripts/mvp/{run-release0-scientific-acceptance,repair-b2-docx-from-records,review-b2-artifacts,write-b2-prompt-inventory}.ts` | Evaluacion aislada, exportacion reproducible desde respuestas B2, comparacion contra DB/artefactos y prompts completos. |
| `scripts/test-b2-{evidence-continuity,docx-integrity,canonical-download,provider-boundaries}.ts`, `package.json` | Cuatro suites nuevas; sin dependencias nuevas. |

Sin cambios de frontend, autenticacion, schema Prisma, modelos de aplicacion, migraciones, dependencias, infraestructura ni backend historico. No se introdujeron DOI, universidades o IDs de validacion en logica productiva.

## D. SOURCE INSPECTION

| Caso | Seleccionadas | Inspeccionadas | PDF materializado | Solo abstract para extraccion | Solo metadata | Inutilizables |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ingenieria | 3 | 3 | 1 | 2 | 0 | 0 |
| Cualitativo | 3 | 3 | 2 | 1 | 0 | 0 |

| Caso/fuente | DOI | Evidencia efectivamente consumida | Resultado de acceso |
| --- | --- | --- | --- |
| Ingenieria S1 | 10.70609/g-tech.v10i2.9398 | PDF_FULLTEXT, 26 chunks materializados | PDF publico recuperado e identificado |
| Ingenieria S2 | 10.4028/www.scientific.net/amm.234.96 | ABSTRACT_METADATA | PDF HTTP 403; sin eludir restriccion |
| Ingenieria S3 | 10.4028/www.scientific.net/amr.594-597.1771 | ABSTRACT_METADATA | PDF HTTP 403; sin eludir restriccion |
| Cualitativo S1 | 10.17323/jle.2025.19854 | PDF_FULLTEXT | PDF publico recuperado e identificado |
| Cualitativo S2 | 10.5296/jpag.v15i3.23475 | PDF_FULLTEXT | PDF publico recuperado e identificado |
| Cualitativo S3 | 10.3390/educsci15050577 | ABSTRACT_METADATA | No se materializo; ultimo intento registrado HTTP 400 |

Inspeccion exacta: ingenieria `f832ada8-63c2-4dde-8b7d-d9d02ac2423a`; cualitativo `898e8232-3452-4254-a2e2-43fc5237810f`. Los informes originales pueden tener un contador menor porque contaban descargas; `items` conserva las tres inspecciones. El contador quedo corregido para ejecuciones posteriores. PDF_FULLTEXT describe el origen: el LLM consume los chunks seleccionados, no necesariamente cada pagina del articulo.

## E. EVIDENCE PIPELINE

| Caso | Items extraidos | Extracto literal verificado | Habilitados para afirmaciones | Anclas validas | Secciones narrativas con evidencia |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ingenieria | 16 | 16 | 16 | 61 | 12 |
| Cualitativo | 18 | 11 | 9 | 40 | 12 |

En cualitativo se excluyeron siete items sin coincidencia literal; otros dos son `gap_only`, no soporte de afirmaciones. Se preservan para auditoria, no se maquillan como evidencia util. Ambas ejecuciones tienen 13 secciones incluyendo referencias. Todos los IDs de cita inspeccionados resuelven a la fuente y al item correctos.

El gate distingue disponibilidad, calidad declarada de extraccion y uso permitido; no cuenta DOI como evidencia. `support_verified` significa que el extracto existe en la entrada, **no** que una coincidencia textual pruebe por si sola toda la inferencia cientifica. La revision semantica sigue siendo necesaria. No se detectaron citas inventadas ni afirmaciones fuertes sin soporte en la muestra revisada; no se afirma una verificacion semantica exhaustiva de cada oracion.

Muestra de comprobacion afirmacion -> soporte (texto completo y coordenadas en `claim-to-evidence.json`):

| Caso/seccion | Afirmacion revisada | Referencia/item | Nivel y soporte | Dictamen |
| --- | --- | --- | --- | --- |
| Ingenieria/metodologia | El antecedente compara base fija y retrofit aislado con analisis temporal no lineal | S1:E1 | PDF, explica comparacion y ASCE 41-17 | PASS; antecedente, no resultado propio |
| Ingenieria/metodologia | Registros escalados y aplicados en dos direcciones | S1:E2 | PDF, Surabaya y direcciones X/Y | PASS; no trasladar amenaza/numeros a Peru |
| Ingenieria/marco teorico | Cortante, deriva y rotulas como indicadores reportados | S1:E4 | PDF, lista de parametros de respuesta | PASS; adopcion local aun propuesta |
| Ingenieria/antecedentes | Amortiguadores viscosos y deslizadores actuan en paralelo | S2:E2 | Abstract describe la configuracion | PASS_WITH_LIMITATIONS; no afirmar eficacia comparativa independiente |
| Ingenieria/metodologia | Analisis 3D no lineal y acelerogramas bidireccionales | S3:E4 | Abstract lo declara expresamente | PASS_WITH_LIMITATIONS; no se leyo ese texto completo |
| Cualitativo/antecedentes | Entrevistas, observacion y marco de andamiaje | S1:E2 | PDF, procedimientos declarados | PASS; no convertirlo en protocolo propio ya ejecutado |
| Cualitativo/marco teorico | Feedback continuo y apoyos individualizados | S1:E5 | Extracto respalda feedback; texto completo complementa apoyo individual | PASS_WITH_LIMITATIONS; no es evidencia causal transportable |
| Cualitativo/metodologia | Existe antecedente de estudio de caso cualitativo | S2:E1 | PDF, diseno cualitativo declarado | PASS; no determina por si solo el diseno final local |
| Cualitativo/antecedentes | Elogios/feedback y motivacion son hallazgos reportados en ese contexto | S2:E6 | PDF, hallazgo contextual declarado | PASS_WITH_LIMITATIONS; no generalizacion rural peruana ni causalidad experimental |
| Cualitativo/marco teorico | Feedback frecuente y accesible | S3:E6 | Abstract explicito | PASS_WITH_LIMITATIONS; nivel abstract |

## F. SCIENTIFIC ACCEPTANCE

| Dimension | Ingenieria | Cualitativo | Hallazgo concreto |
| --- | --- | --- | --- |
| A. Problema | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Se conserva contexto peruano; busqueda acotada no establece brecha local definitiva. |
| B. Preguntas | PASS | PASS | Comparacion de respuestas vs interpretacion de experiencias; no intercambio de paradigmas. |
| C. Objetivos | PASS | PASS | Objetivos presentes completos en seccion y matriz; no resultados anticipados. |
| D. Metodo | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Simulacion comparativa no experimental; caso cualitativo interpretativo, caso unico/multicaso pendiente. |
| E. Trazabilidad | PASS | PASS | DB, ledger, fuente+item, ancla, version y DOCX comprobados. |
| F. Soporte de citas | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Muestra anterior respaldada; no revision exhaustiva. Ingenieria tiene dos Cancellara/Angelis 2012 sin sufijos a/b en texto, desambiguados por DOI/IDs en evidencia. |
| G. Factibilidad | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Ingenieria: software, parametros y registros por confirmar. Cualitativo: acceso, caso, participantes y etica pendientes. |
| H. Limites/supuestos | PASS | PASS | No se inventan aprobaciones, datos recogidos ni resultados; limitaciones explicitas. |
| I. Consistencia | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Se repararon tablas que confundian constructos ajenos con variables propias; matriz proyecta texto real, aun requiere revision del asesor. |
| J. Contaminacion | PASS | PASS | Sin contenido de otros proyectos en muestras; estrechamiento de ingenieria corresponde a opcion seleccionada expresamente por el fixture. |
| K. Documento | PASS_WITH_LIMITATIONS | PASS_WITH_LIMITATIONS | Texto sustantivo completo; detalles visuales indicados abajo. |

Ingenieria: `PASS_WITH_LIMITATIONS`. Cualitativo: `PASS_WITH_LIMITATIONS`; no impone hipotesis, muestra numerica fija, prueba estadistica ni experimento. Las tecnicas y analisis son propuestas, no instrumentos validados por decreto.

Insuficiente: `PASS`. Proyecto `a8a77161-72fb-4885-98bc-650dc7254af5`, run `release0-b2-negative-2026-09-18T20-34-45-150Z`. Step 1 identifica cuatro faltantes y no habilita continuacion; cero blueprints y cero llamadas pagadas. Invocacion directa Step 6 tambien se bloquea por falta de ledger, con clave API disponible y sin usar proveedor. Pruebas offline cubren ademas ledger vacio/solo metadata y evidencia no verificada.

## G. DOCX VALIDATION

| Comprobacion | Ingenieria final v4 | Cualitativo final v3 |
| --- | --- | --- |
| Paginas reales LibreOffice/PDF | 16 | 15 |
| Textos completos XML comparados con estructura | 154/154 | 151/151 |
| Textos contiguos en PDF tras normalizar encabezados | 152/154 | 148/151 |
| Cobertura secuencial de tokens en PDF | 154/154 | 151/151 |
| Texto sustantivo ausente detectado | 0 | 0 |
| Citas/anclas preservadas | 61 | 40 |
| Descarga canonica vs muestra, con version DB/hash | Identica | Identica |
| Inspeccion visual | RUN, muestreo | RUN, muestreo |

Se renderizo con LibreOffice existente, sin instalar paquetes. Se compararon texto estructurado, XML y texto renderizado; las diferencias no contiguas restantes son intercalacion de columnas/celdas, no texto eliminado. Se inspeccionaron visualmente metodologia/tablas y finales de matriz: ingenieria paginas 11, 13, 14, 15; cualitativo 6, 8, 13, 14. No se afirma inspeccion visual humana ni de todas las paginas.

Limitaciones visuales: matrices continúan en pagina siguiente conservando objetivos; espacios blancos amplios; encabezado largo; resumen grafico opcional no se renderiza satisfactoriamente en LibreOffice. Su contenido sustantivo esta en el texto. Ingenieria excede el objetivo orientativo de 15 paginas en una pagina. No se recorto texto para hacer verde ese limite. Citas autor-anio repetidas requieren acabado editorial; APA7 completo no se certifica.

Los checks de coherencia/estimacion incluidos en el paquete original se retienen como historial, no como medicion de las reexportaciones; las mediciones autoritativas actuales estan en `document-evidence-review.json`, `rendered-text-validation.json` y este informe.

Rutas exactas de entregables finales:

```text
/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core/artifacts-local/release0-scientific-validation/b2/engineering/release0-b2-engineering-2026-09-18T20-40-44-865Z/thesis-plan-complete-v4.docx
/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core/artifacts-local/release0-scientific-validation/b2/qualitative/release0-b2-qualitative-2026-09-18T20-46-45-009Z/thesis-plan-complete-v3.docx
```

En cada directorio estan `evidence-ledger.json`, `claim-to-evidence.json`, `scientific-review.json`, `document-evidence-review.json`, `rendered-text-validation.json`, `provider-calls/` y `rendered/`. Evidencia exportada: `evidence_log-complete-v4.json`/`references-complete-v4.{bib,ris}` en ingenieria, y equivalentes `v3` en cualitativo. Los IDs finales son `c7189bb4-c2b5-42bc-bcd1-6ebaa77c2898` y `df9c9c83-6c1a-4d8d-8c71-f5dd2e76bf69`. No se reemplazan al descargar por un "latest".

## H. PROMPTS USED

Inventario completo, no abreviado:

```text
/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core/artifacts-local/release0-scientific-validation/b2/PROMPTS_USED.md
```

Incluye los 42 call IDs, proposito, modelo configurado/efectivo, versiones, instrucciones/plantillas completas, variables, esquema o referencia exacta y solicitudes reales. El proveedor recibe **un string `input` concatenado**, no roles system/user separados. Responses API, `store:false`, schema estricto, reasoning/temperature no suministrados. Salida 8000; editorial 16000; retries SDK/wrapper cero en evaluacion. El helper permite un fallback JSON textual acotado; no se uso en B2.

Unico cambio de texto de prompt: `ingeniometrix-step5-source-evidence-extraction-v2` -> `v3`; mismo mini. Motivo: truncamiento demostrado y necesidad de soporte literal inspeccionable. Variables: intake, plan de secciones, registro de fuente, nivel, chunks, activos y salud. Schema v3 agrega `supporting_excerpt`, maximo seis items. Step 1 mantiene v3 (correccion de schema, no texto); Step 2 v2; secciones Step 6 v2; editorial/titulo v1, sin cambio. Discovery conserva su plantilla inline existente; no se anadio prompt hardcodeado ni se migro legacy.

## I. MODELS

| Llamada | Configurado | Efectivo | Motivo de conservar |
| --- | --- | --- | --- |
| Step 1 y plan de consultas | gpt-5.4-nano | gpt-5.4-nano-2026-03-17 | Estructuracion/consultas; no fallo de capacidad demostrado. |
| Step 2, extraccion Step 5 y editorial Step 6 | gpt-5.4-mini | gpt-5.4-mini-2026-03-17 | Extraccion/revision con schema y verificacion; el fallo era limite/salida, no necesidad de modelo mayor. |
| Secciones y titulo Step 6 | gpt-5.4 | gpt-5.4-2026-03-05 | Redaccion de plan ya configurada. |

El inventario por llamada es autoridad ante esta agrupacion. Ningun modelo de aplicacion se cambio por el modelo de Codex.

## J. USAGE

| Ejecucion | Llamadas | Input | Output | Cache input reportado | Total tokens | USD estimado | Duracion backend |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Ingenieria intento inicial, interrumpido en retrieval | 2 | 2155 | 2678 | 0 | 4833 | 0.00378315 | Registro individual; espera de cuota separada |
| Ingenieria continuacion dirigida | 20 | 161799 | 35709 | 23296 | 197508 | 0.56140810 | 294.753 s |
| Cualitativo | 20 | 154953 | 33908 | 21504 | 188861 | 0.48738925 | 265.983 s |
| Negativo / reexportaciones offline | 0 | 0 | 0 | 0 | 0 | 0 | Sin generacion LLM |
| Total B2 | 42 | 318907 | 72295 | 44800 | 391202 | **1.05258050** | No sumar intervencion humana ni espera abortada |

Tokens provienen del proveedor; coste es estimacion, no factura. Ninguna respuesta pagada carecio de usage. Cero retries/fallbacks LLM observados; fallback de **retrieval** a Crossref si ocurrio. La revision editorial pagada se conserva, aunque se descarto para las versiones recuperadas. No hubo tercera evaluacion positiva: dos proyectos, una continuacion dirigida del primero y un negativo; reexportaciones sin API.

Timestamps UTC: ingenieria inicial desde `20:34:28.543`; continuacion `20:40:44.865` a `20:45:39.618`; cualitativo `20:46:45.009` a `20:51:10.992`. El `started_at` heredado del caso ingenieria incluye el primer intento; **no** restarlo del final para calcular latencia. Sus dos llamadas iniciales duraron aproximadamente 22 s; la espera de 429 interrumpida no es ejecucion exitosa ni latencia LLM.

Antes de pagar se limito salida/retries y se activo reserva preventiva por solicitud (bytes UTF-8 + schema + margen, sin asumir cache). Cap USD 2.20 por proceso positivo; antes de continuacion y segundo positivo, el gasto inicial conocido + ambos caps era USD 4.40378315, menor que USD 5. No se ejecuto otra reparacion pagada. El cap por proceso es proteccion de evaluacion, no presupuesto multiworker de produccion.

Precios oficiales consultados: [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano). USD/M input/cache/output: 2.50/0.25/15; 0.75/0.075/4.50; 0.20/0.02/1.25. La skill openai-docs se uso para comprobar politica/precios, no para imponer un cambio de modelo.

## K. TEST RESULTS

- **43/43 suites PASS**: las 39 existentes y cuatro nuevas, sin saltar fallos. Ejecucion final Node 20.20.2 en Docker `--network none`, DB inaccesible deliberadamente y sin API de pago.
- Nuevas suites: continuidad/evidencia 22 assertions; DOCX 12; descarga canonica 5; limites proveedor 4. Cubren full text, abstract, metadata, inutilizable, suficiente/limitada/insuficiente, ambos paradigmas, referencias/intake/run equivocados, textos largos/multilinea/acentos/citas, hash/version, cuota y cap de coste.
- `prisma validate`: PASS. `tsc --noEmit --incremental false`: PASS. `npm run build`: PASS, Node 20.20.2, codigo de salida 0.
- Logs: `artifacts-local/release0-scientific-validation/b2-offline/results.json`, logs por suite y `b2-build-final.log`.
- Primer build en host encontro `.next/trace` con permisos de una ejecucion anterior; build en el contenedor existente lo resolvio. No se oculto error de compilacion ni se instalo runtime.
- Build registra consulta de plantilla legacy a DB intencionalmente inaccesible, con fallback; no invalida compilacion ni exportacion canonica evaluada. No demuestra despliegue operativo.

Warnings: `RELEASE_BLOCKING` para empaquetado que arrastra artefactos privados (ver M); `IMPORTANT` para cuota OpenAlex, plantilla GENERIC/APA fallback, cobertura/decisiones pendientes, pagina 16 y ambiguedad autor-anio; `POST_RELEASE` para formato duplicado de citas, espacios, resumen grafico opcional y aviso javaldx del renderer. No se suprimieron warnings para aprobar.

## L. DATABASE / CONTINUITY

DB usada: contenedor aislado `imx-b1-validation-20260918-a`, loopback `55434`, database `imx_b1`. Se preservo; no se escribio DB compartida ni se aplico migracion. El volumen es temporal: conservar estos artefactos antes de destruir el contenedor.

| Entidad/campo/artefacto | Productor -> consumidor -> siguiente consumidor | Requerido / auditoria / temporal |
| --- | --- | --- |
| Intake + huella de ocho campos sustantivos | Seleccion/intake -> Step 5 -> validacion Step 6 | Requerido; cambios invalidan ledger. No depende de timestamp ni consulta derivada. |
| `ProjectReference.selected`, referenceId | Decision del investigador (fixture en test) -> inspeccion -> Step 5/Step 6 | Requerido; conjunto exacto comparado. |
| `MvpStepRun` e inspeccion `step_run_id` | Inspeccion de ese run -> ledger `source_inspection_step_run_id` -> auditoria/Step 5 | Requerido para procedencia. |
| PDF/text/chunks, identidad y nivel | Inspeccion/materializacion -> extraccion -> extracto verificable | Heavy artifacts en filesystem; no prueba de lectura si solo URL. |
| `S*-extraction-input.json` | Step 5 -> verificacion literal -> diagnostico claim-to-evidence | Auditoria reproducible; no fuente global/latest. |
| `ProjectEvidenceCard`, ledger y registro de fuentes | Step 5 -> ledger validado -> contexto Step 6 | Ledger es autoridad para esta ruta; cards mantienen estado de evidencia existente. |
| `supporting_excerpt`, `support_verified`, `allowed_use`, `quality_decision` | Extraccion/normalizacion -> gate compartido -> citas/contexto | Requerido; evidencia excluida se retiene como auditoria. |
| project_id/run_id/step_run_id/intake_fingerprint/reference_id | Pasos correlacionados -> manifiestos -> version/exportacion | Requerido; carga Step 5 acotada al proyecto y comprobada contra intake/seleccion actual, nunca latest global. |
| `BlueprintVersion` snapshots, `step6_docx` path/hash/IDs | Step 6 -> API descarga -> DOCX exacto/bibliografia/evidence log | Requerido; versiones recuperadas nuevas, originales preservadas. |
| Usage/audit/provider-calls | Proveedor -> registro de tokens/diagnosticos -> inventario/revision B2 | Auditoria; provider-calls completo habilitado solo en fixtures locales. |

Proyectos nuevos: ingenieria `abdd026d-38d6-40ac-b9dc-6533d77864c6`, Step 5 `ca7c351d-51bd-4cb3-883a-1bcefb47a6d6`, Step 6 `784cdad0-2d12-4757-bcc1-a8bde9fb44ed`; cualitativo `611ef455-e264-4ebb-8529-b7c8dfc72629`, Step 5 `10667ba4-1fe5-49e9-958d-1965d3ee36fe`, Step 6 `b7850d18-995b-48c2-97c0-0ea647d7ef59`. Descarga comprobada contra **version persistida**, no solo un objeto simulado. HTTP autenticado completo no se ejercito.

CLEANUP_CANDIDATES (no eliminados): `loadLatestSourceInspection` sin consumidor tras integrar inspeccion: `CLEAN_AFTER_ACCEPTANCE`; duplicados PDF/sample/fulltext entre fases: `CLEAN_BEFORE_PRODUCTION`, retencion/procedencia, no borrar como basura; versiones intermedias, provider-calls y assets/layout no usados por esta exportacion: `MONITOR`, auditoria deliberada; `llm_wave_plan` con ejecucion posterior no implementada: `MONITOR`, consumidor futuro, no orfandad confirmada. No se redisenio almacenamiento.

## M. PRODUCTION HARDENING BLOCKERS

Confirmados por inspeccion, no corregidos en B2:

1. Cookie de sesion basada en userId sin firma; login por email sin verificacion (`server/auth/session.ts`, `app/api/auth/session/route.ts`). Checks de ownership existen, pero identidad falsificable impide seguridad publica.
2. Artefactos y registros locales no durables; DB de validacion temporal no es infraestructura productiva.
3. Trabajos largos HTTP no recuperables/cola no durable. Timeouts de proveedores no equivalen a jobs recuperables.
4. Rutas legacy/lab siguen presentes. File tracing del build alcanza `artifacts-local`: NFT examinados incluian miles de archivos, entre ellos 3307 artefactos en Step 5 y 1111 en Step 6/descarga en la medicion previa. No publicar ese paquete con evidencia privada. Ejecucion local canonica funciona; empaquetado/despliegue seguro no validado.
5. Falta estrategia de adopcion/migracion para DB existente, runtime productivo soportado, secretos/proveedores/cuotas y aislamiento integral de evidencia. Node 20 se uso para reproducir el baseline; no se certifica su soporte futuro de produccion.

No se declaro seguridad publica a partir de tests offline. Dependencias y hardening amplio permanecen fuera de B2; ver tambien B1. Cero push/deploy.

## N. GIT

Repositorio: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core`.
Branch: `mvp/backend-core-clean`.
HEAD antes: `4ef41361c6ebffe0a80636a7326cf91a015ab1b5`, confirmado en historia y sin cambios locales al iniciar.
HEAD despues: el commit local que contiene este informe (`git log -1 --format=%H -- docs/quality/release0-scientific-acceptance-b2.md`); hash exacto en entrega final. Mensaje previsto: `fix(engine): close scientific evidence pipeline gaps`.
Solo cambios intencionales de C y este informe; evidencia grande excluida de Git en `artifacts-local/`. Sin secretos, frontend, dependencias ni legacy ajeno en el commit. Revision de diff y estado limpio al entregar, salvo artefactos ignorados conservados.

## O. NEXT ACTION

Una sola accion: **production hardening + integracion frontend/backend**, manteniendo las limitaciones cientificas visibles y usando estos casos como regresion; no ejecutada en B2.

RECOMMENDED_CODEX_MODEL = gpt-5.6-sol
REASONING_EFFORT = high
WHY = El siguiente trabajo es ingenieria de produccion acotada con contratos y regresiones disponibles; no hay evidencia que justifique Astra para ese alcance.
