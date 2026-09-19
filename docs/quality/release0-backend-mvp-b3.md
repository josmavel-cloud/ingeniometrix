# B3 — Final Backend MVP Completion

Fecha: 2026-09-18 (Toronto; ultimas verificaciones 2026-09-19 UTC).

`BACKEND_MVP_STATUS = PASS_WITH_LIMITATIONS`

`PUBLIC_RELEASE_STATUS = BLOCKED`

El recorrido canonico genera planes de investigacion propuestos, matriz editable, DOCX/PDF y bibliografia con evidencia inspeccionable. No es certificacion cientifica universal ni revision humana. Los documentos conservan decisiones criticas por resolver: **no se declara que puedan presentarse sin revision del investigador/asesor**. Ingenieria cumple el maximo de 18 paginas de cuerpo, pero no el objetivo 12–15. Deep Research esta implementado y probado con dobles offline; no se valido una ejecucion pagada de esa rama.

## 1. Baseline y alcance

- Repo: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core`.
- Branch: `mvp/backend-core-clean`.
- HEAD inicial: `96e6a513f648acc4f1375a995d9cc76991240886`; arbol inicialmente limpio y baseline presente. No reset/cambio de branch.
- Commit final: el commit local que incorpora este informe; consultar `git log -1 --format='%H %s'`. Artefactos de evaluacion excluidos de Git. Sin push/deploy.
- Cero cambios de frontend/auth/backend historico; sin migraciones ni cambios de schema Prisma. DB aislada existente `imx-b1-validation-20260918-a`, puerto 55434, conservada.
- Se preservaron 43 suites B2. Sharp 0.35.4, ya instalado transitivamente, se declaro dependencia directa para el fallback PNG; sin upgrade masivo.

## 2. Pipeline y documento

Intake → normalizacion → refinamiento informado → seleccion de direccion/fuentes → inspeccion determinista → Step 5/materializacion/extractos verificados → cobertura por dimension → expansion condicional → generacion estructurada → revision cruzada → titulo → resumen → una solicitud de infografia → DOCX → PDF desde DOCX.

Orden interno exacto: sintesis de evidencia, problema, preguntas, objetivos/hipotesis aplicables, marco conceptual, ResearchDesign, metodologia, contribucion/factibilidad, limites/pendientes, matriz, revision cruzada, titulo, resumen, imagen, DOCX, PDF. Se siguio la instruccion especifica de generar titulo y luego resumen tras la revision. No se genera siguiendo el orden de presentacion.

Orden visible: portada, resumen ejecutivo, problema, estado del conocimiento, marco conceptual, preguntas/objetivos/hipotesis aplicables, metodologia, matriz, contribucion/factibilidad, alcances/limitaciones/decisiones pendientes, referencias. Sin cronograma/presupuesto ni IDs/modelos/diagnosticos del backend. Logo Ingeniometrix; tablas nativas, encabezados/paginacion, referencias separadas. No se recortan cadenas para cumplir presupuesto.

ResearchDesign representa paradigma/enfoque/diseno, unidad/corpus, seleccion, variables o conceptos/categorias, dimensiones cuando aplican, materiales, tecnicas, instrumentos, procedimiento, analisis, calidad, etica y pendientes. Arrays pueden estar vacios cuando corresponde; no obliga hipotesis, n ni pruebas estadisticas.

Matriz: llamada dedicada gpt-5.4 → JSON Schema estricto/Zod → validacion de IDs pregunta/objetivo/constructo y cobertura de todos los objetivos → tabla Word de cuatro columnas. No parsing por puntuacion. Incluye sintesis de coherencia, no tutorial. 5 filas de diseno en ingenieria; 6 en cualitativo. La tabla conserva definiciones completas; esto produce una matriz extensa.

## 3. Cambios intencionales

| Archivos/modulos | Finalidad |
| --- | --- |
| `server/mvp/research-plan-contracts.ts`, `scientific-plan-generation.ts` | Contratos polimorficos, DAG de 13 llamadas, schema/IDs/citas, revision que bloquea defectos criticos. |
| `server/mvp/prompts/scientific-plan.v{1,2,3}.ts`, `consistency-matrix.v1.ts` | Instrucciones versionadas fuera de servicios. v2 corrige referencias a campos inexistentes e instrumentos no estabilizados; v3 limita afirmaciones de ausencia y distingue simulacion de jerga de backend. |
| `section-budget.ts`, `prompts/section-budget.v{1,2}.ts` | Condensacion acotada mini, conservando todas las parejas fuente/evidencia; maximo dos intentos. Objetivo por seccion es blando, limite real del PDF es duro. |
| `evidence-coverage.ts`, `citation-chaining.ts`, `research-fallback.ts`, `prompts/research-discovery.v1.ts` | Seis dimensiones, descubrimiento sin promocion automatica a evidencia, expansion limitada y Deep Research condicional. |
| `scientific-assets.ts`, tipos/servicio Step 5 y helpers Python | Geometria nativa/vectorial, captions, procedencia y rechazo de regiones inferidas/clipped/fragmentarias. |
| `application-budget.ts`, `llm/providers/openai.ts` | Reserva antes de cada llamada, uso real separado, fallo de cota bloquea llamadas siguientes; uso desconocido conserva reserva. |
| `final-infographic.ts`, `prompts/hero-infographic.v1.ts` | Una imagen high; fallback PNG determinista, contexto sin IDs internos, metadatos/coste. |
| Servicio/tipos Step 6, `pdf-export.ts`, `canonical-pdf-download.ts`, rutas backend DOCX/PDF | Render canonico, altura real de imagen, caption unido a imagen, PDF LibreOffice, version/hash y descargas sin sustitucion. |
| `scripts/test-b3-*`, `scripts/mvp/python/test_b3_pdf_geometry.py` | Regresiones offline de contratos, cobertura, limites, assets, DOCX/PDF. |
| Scripts `run-release0-scientific-acceptance`, `repair/finalize/review/summarize/close-b3-*` | Fixtures aislados, checkpoints solo B3, inventario efectivo, cierre editorial/visual/semantico auditable. |

Defectos reproducidos durante B3: instrumentos narrativos no presentes en ResearchDesign; revision que confundia la palabra cientifica "corrida" con jerga; inferencia excesiva sobre ausencia de estudios desde extractos; objetivos de palabras incumplidos por el modelo; imagen recortada por altura de parrafo en LibreOffice; recortes de tabla que incorporaban parrafos ajenos; imagen remota de ingenieria con IDs internos C2/C3. Se preservaron los intentos fallidos y sus costes. Los cierres reutilizan respuestas nuevas B3 y vuelven a revisar el texto condensado; las ultimas reexportaciones son deterministas, con nuevas versiones y sin llamadas pagadas.

## 4. Fuentes, continuidad y resultado cientifico

| Caso | Seleccionadas/inspeccionadas | PDF / abstract / metadata-only | Items utilizables | Anclas | Cuerpo / total | Resultado |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Ingenieria | 3 / 3 | 1 / 2 / 0 | 11 | 113 | 16 / 18 | PASS_WITH_LIMITATIONS |
| Cualitativo | 3 / 3 | 1 / 2 / 0 | 9 | 94 | 15 / 17 | PASS_WITH_LIMITATIONS |
| Intake insuficiente | 0 / 0 | 0 / 0 / 0 | 0 | 0 | No generado | PASS: bloqueado sin LLM |

Los contadores de extractos literalmente verificados son 12 y 11; incluyen respectivamente 1 y 2 `gap_only`, excluidos de afirmaciones. No confundirlos con los 11/9 items utilizables. Todo PDF se obtuvo por acceso publico, sin eludir protecciones. `PDF_FULLTEXT` significa chunks recuperados del PDF, no lectura exhaustiva de cada pagina por el modelo.

Ingenieria: DOI `10.3390/app10248980` (Gino et al., abstract), `10.3390/su151511624` (Belbachir et al., PDF) y `10.3390/app7060628` (Suarez et al., abstract). Proyecto `adfc6589-84fa-4e6c-89d9-c2cbef685dec`; version final `3557d585-7d6d-4fb0-9ef5-de2220498243`.

Cualitativo: DOI `10.15366/riee2014.7.1.001` (Sanchez/Mendoza, abstract), `10.3390/educsci15010058` (Burner et al., abstract), `10.3390/educsci11060279` (Barana et al., PDF). Proyecto `9c0a1d06-6cca-4230-8f85-a7ab77ddbc9c`; version final `e8e93e91-512e-4e85-ae1b-038e81207870`.

Se verificaron las 207 anclas contra chunks/abstracts reales y ambas exportaciones. Revision semantica acotada de 12 pares parrafo/fuente en ingenieria y 9 en cualitativo: no cita inventada ni afirmacion fuerte sin soporte detectada en esa muestra. Un parrafo puede requerir varias evidencias; un ID correcto o coincidencia literal no certifica todas sus inferencias.

Ejemplos: ingenieria/metodologia S1:E3 respalda antecedentes de analisis dinamico no lineal; S2:E4 respalda propiedades HDRB, no parametros adoptados ni superioridad en Peru; S3:E5 respalda funcion disipativa. Cualitativo/estado del conocimiento S3:E1 respalda la definicion formativa; S1:E2 respalda antecedente cualitativo con entrevistas/observacion, no valida automaticamente analisis tematico reflexivo; S2:E6 preserva agencia docente y no introduce IA como intervencion local. Se retiro S2:E1 `context_only` del respaldo metodologico estructurado, conservandolo como contexto narrativo de lo que reporta el antecedente.

En ambos: problema y factibilidad PASS_WITH_LIMITATIONS; alineacion preguntas/objetivos PASS; metodologia PASS_WITH_LIMITATIONS por decisiones pendientes; trazabilidad PASS; soporte semantico muestreado PASS_WITH_LIMITATIONS; limitaciones PASS; consistencia interna PASS; contaminacion de dominio PASS; documento PASS_WITH_LIMITATIONS. Cualitativo conserva enfoque interpretativo, cero hipotesis y ningun tamano muestral inventado. No se imponen variables/pruebas estadisticas. Negativo pide restricciones, poblacion, datos y notas del asesor; cero versiones/coste.

## 5. Chaining, suficiencia y fallback

Cobertura: problema, conocimiento, conceptos, precedente metodologico, contexto/sistema y medicion/analisis. Solo items inspeccionables/verificados; metadata/gaps no bastan. `context_only` no satisface respaldo metodologico. El mapa determinista por seccion es un control estructural, no evaluacion semantica universal.

Ambos positivos LIMITED, no INSUFFICIENT: 10 candidatos DOI de bibliografia por caso, profundidad 1, ninguno promovido ni inspeccionado adicionalmente porque no se requirio expansion. Candidatos no aparecen automaticamente en referencias. Configuracion acotada: `IMX_CITATION_CHAIN_DEPTH` <=1, `IMX_CHAIN_CANDIDATES_PER_SOURCE` <=10, `IMX_ADDITIONAL_INSPECTED_SOURCES` <=10.

Tier 2 usa OpenAlex/Crossref y encadenamiento, preservando selecciones/rechazos humanos; suplementos quedan etiquetados. Solo si sigue INSUFFICIENT: Responses `o4-mini-deep-research`, web_search_preview, 1 respuesta, maximo 3 herramientas, 5000 tokens, 120 s, 5 candidatos. Preferencia academica/institucional. DOI resuelto por Crossref, deduplicacion e inspeccion/Step 5 obligatorios. No incorpora como evidencia el texto de Deep Research. Reserva conservadora de esa llamada US$1.67; posteriores extracciones tambien reservan presupuesto. La rama pagada **NOT_RUN**, no se presenta como validada en vivo.

## 6. Assets, imagen y documento

Inventarios: 25 candidatos por positivo. Python inspecciona texto/imagenes/tablas/ecuaciones, agrega clusters vectoriales y captions. La aceptacion exige objeto/crop nativo, bbox dentro de pagina, caption real, ausencia de flags y pertinencia explicita. No acepta mera region inferida alrededor de una mencion. Procedencia conserva referencia/DOI/PDF/pagina/bbox/caption/metodo; confianza calibrada desconocida se registra null, no un numero inventado.

Ingenieria: 0 assets cientificos insertados; las tablas propuestas por extraccion eran crops inferidos, uno mezclado con parrafos. Se rechazaron, no se maquillaron. Cualitativo: 1 figura nativa de Barana et al., p. 6 del PDF, como antecedente conceptual; no es resultado del estudio propuesto. Caption/fuente se mantienen unidos al objeto. El caption original ingles se conserva, incluida su numeracion: hay duplicacion editorial de "Figura 1 / Figure 1" pendiente, no perdida de contenido.

Se hicieron exactamente dos solicitudes Images, una por positivo, `gpt-image-2.5-sunburst`, quality=high, 1024x1024, n=1, sin retry. Ingenieria: el PNG pago contenia C2/C3 y fue rechazado en inspeccion visual; documento usa fallback determinista limpio, original conservado. Cualitativo usa la imagen real, ampliada para legibilidad; contiene mas texto del ideal, sin cifras/resultados inventados. Contexto futuro de imagen excluye IDs internos. Prompt completo solicitado, modelo/uso/coste y original estan en PROMPTS_USED.md y sidecars, no ocultos tras una plantilla ficticia.

DOCX/PDF: 84 textos de ingenieria y 87 cualitativos cotejados completos, incluidas celdas, Unicode y citas; cero faltantes y cero tails perdidos en PDF. Descargas canonicas byte-identicas a esas versiones; hashes alterados y proyecto ajeno rechazados. LibreOffice abre DOCX y produce PDF; no prueba en Microsoft Word. Inspeccion visual de todas las paginas en hojas de contacto y detalle de portadas/matrices/figura; imagenes dentro de pagina, sin clipping detectado. Persisten matrices extensas y algunas paginas con poco contenido en ingenieria. Hay una imprecision terminologica que requiere revision editorial antes de presentar: "amortiguadores histericos" debe ser "amortiguadores histereticos"; no cambia la evidencia del mecanismo disipativo, pero impide describir la redaccion como impecable. Ninguna reduccion de tipografia para ajustar paginas.

## 7. Modelos, prompts y coste

Codex y modelos de aplicacion son distintos. Aplicacion mantiene: nano para intake/plan de busqueda; mini para refinamiento/extraccion y condensacion editorial; gpt-5.4 para 13 etapas de plan/matriz/revision/titulo/resumen. Snapshots observados: nano/mini `2026-03-17`, gpt-5.4 `2026-03-05`. No aumento de modelo para compensar defectos deterministas. Nuevos prompts estan en `server/mvp/prompts/`; Deep Research no ejecutado se distingue del inventario usado.

Inventario completo, con mensajes efectivos, templates, variables, schemas y parametros:
`artifacts-local/release0-scientific-validation/b3/PROMPTS_USED.md`.

Textos: Responses recibe **un input concatenado**, no roles system/developer separados; JSON Schema estricto, sin reasoning/temperature explicitos; limits por schema en inventario. SDK y wrapper con retries=0 en aceptacion; condensacion hasta dos llamadas independientes reservadas. Esquemas completos en request.text.format.schema. La guia openai-docs se uso para verificar API/modelos/parametros/precios, no para elegir un modelo nuevo por el modelo de Codex.

Precios consultados antes de ejecucion: GPT-5.4 2.50/0.25/15, mini 0.75/0.075/4.50, nano 0.20/0.02/1.25 USD por millon input/cache/output. Sunburst texto input 5, imagen output 30; 1756 tokens output por imagen high 1024. [Precios](https://developers.openai.com/api/docs/pricing), [imagen](https://developers.openai.com/api/docs/guides/image-generation), [Deep Research](https://developers.openai.com/api/docs/guides/deep-research).

| Metrica de toda la aceptacion B3, incluidos fallos/reparaciones | Resultado |
| --- | ---: |
| Llamadas texto / imagen | 71 / 2 |
| Tokens texto input / output / cached | 610693 / 111023 / 15104 |
| Total tokens texto | 721716 |
| Tokens imagen input / output | 1973 / 3512 |
| Total tokens incluidos imagenes | 727201 |
| Uso no reportado por proveedor | 0 llamadas |
| Texto, incluidos intentos descartados | US$2.3473696 |
| Imagenes | US$0.115225 |
| Total aceptacion | US$2.4625946 |

`NORMAL_PATH_COST = US$0.7643922` texto del caso cualitativo fresco + condensacion/revision final; con su imagen US$0.8209522. No es promesa de coste fijo para todo intake.

`DEEP_RESEARCH_FALLBACK_COST = US$0 observado (NOT_RUN); reserva por llamada US$1.67, mas inspeccion/extraccion dentro del hard cap`.

`IMAGE_COST = US$0.115225` (ingenieria 0.058665; cualitativo 0.056560).

`TOTAL_ACCEPTANCE_COST = US$2.4625946` estimado sobre tokens reportados, no factura. Ingenieria completa con reparaciones: US$1.6416424. No llamadas pagadas durante reexportaciones. No se contaron checkpoints copiados como nuevas llamadas.

Duracion backend activa acumulada por MvpStepRun: ingenieria 680199 ms, cualitativo 429078 ms; 1109277 ms total (18 min 29 s), incluidos fallos/reparaciones, excluyendo lectura humana/polling/pausas. Intervalos de llamadas de texto: 890356 ms, no sumarlos otra vez al backend. Detalle por run/timestamps: `backend-duration.json`; uso y coste: `usage-summary.json` y `provider-call-inventory.json`.

## 8. Checks ejecutados

- 43/43 suites heredadas PASS en Node 20.20.2/Docker sin red y DB/API no disponibles.
- 2/2 suites nuevas TypeScript PASS: contratos/cobertura/costos/limites/crops y generacion mock completa con DOCX/PDF real. Total 45/45 suites.
- 3/3 unittest Python PASS: vectores/caption, rechazo de encabezado, DOI solo de bibliografia.
- Prisma validate PASS; tsc --noEmit --incremental false PASS; produccion npm run build PASS, codigo 0, 61 paginas estaticas.
- Positivos nuevos completos B3 y cierres dirigidos; negativo nuevo bloqueado, US$0. No outputs B1/B2 como prueba de B3.
- Integridad de export/citas/ownership/hash y revision semantica/visual descritas arriba. No prueba humana cientifica, Microsoft Word, Deep Research live ni E2E frontend.

Logs: `artifacts-local/b3-offline/final-existing-suites.json`, `final-build.log`, `build-tracing-review.json`; regresiones export `regression-*`. Los warnings no se suprimieron. RELEASE_BLOCKING: tracing empaqueta evidencia local (ruta PDF: 2287 paths artifacts-local, cero .env en ese manifest). IMPORTANT: nueve warnings de tracing, fallback de plantilla legacy por DB offline durante build, runtime Node20 EOL, LIMITADOS cientificos/objetivo de paginas y Deep Research sin acceptance live. POST_RELEASE: duplicacion de captions/citas, espaciado/paginacion fina; no falsificar contenido para corregirlos.

## 9. Datos y consumidores

| Entidad/artefacto | Productor → consumidor → siguiente | Uso |
| --- | --- | --- |
| Project/Intake + huella | intake → Steps 1–5 → validacion de continuidad Step 6 | Requerido, no temporal |
| ProjectReference.selected/selectionReason | usuario o suplemento etiquetado → inspeccion → Step 5 | Requerido; elecciones humanas preservadas |
| ProjectSourceMaterialization + PDF/chunks | inspeccion/Step 5 → extractos y candidatos → cobertura/plan | DB metadata; filesystem pesado |
| ProjectEvidenceCard/Ledger, support_verified/allowed_use | Step 5 → cobertura/prompts → anclas y evidencia export | Requerido; gaps excluidos, retenidos para auditoria |
| ResearchDefinition/ResearchDesign/matriz JSON | DAG → metodologia/revision → tabla, titulo/resumen/hero | Artefactos versionados y paquete; sin nuevas tablas |
| Bbox/native_extraction_method/caption | geometria PDF → gate asset → figura/procedencia | Requerido; metodo nativo agregado opcional, compatible con registros previos |
| Discovery candidates | bibliografia/busqueda → resolucion/inspeccion condicional | No evidencia; si no hay expansion, audit-only |
| BlueprintVersion/manifest/hash | plan/export → descargas canonicas | Requerido; mismo proyecto/version/DOCX/PDF/bibliografia/log |
| MvpStepRun y registro LLM | backend/proveedor → diagnosticos/aceptacion | Audit/retention; no se confunde con contenido academico |
| Uso imagen y reserva de coste | Images/AsyncLocalStorage → sidecar/presupuesto | Audit-only correlacionado por run; imagen no tiene registro SQL LLM independiente |

CLEANUP_CANDIDATES (no eliminados): `.libreoffice-profile-*`, previews y hojas contacto = CLEAN_AFTER_ACCEPTANCE, temporales de diagnostico; copias de checkpoints/provider-calls = MONITOR, retencion necesaria y deduplicacion por response.id; candidatos sin expansion = MONITOR, audit-only, no huerfanos confirmados; `summary_hero_image` skipped y helpers antiguos no canonicos = CLEAN_BEFORE_PRODUCTION, compatibilidad/futuro consumidor, no ejecutar ni eliminar en B3. PDFs/texto/chunks existentes se reutilizan; no almacenamiento redundante nuevo de PDF en DB.

## 10. Entregables exactos

Raiz absoluta:
`/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core/artifacts-local/release0-scientific-validation/b3/`

Ingenieria: `final/engineering-export/final-thesis-plan.docx` y `final/engineering-export/final-thesis-plan.pdf`.

Cualitativo: `final/qualitative-delivery/final-thesis-plan.docx` y `final/qualitative-delivery/final-thesis-plan.pdf`.

En cada directorio final: `bibliography.bib`, `bibliography.ris`, `evidence-log.json`, `evidence-ledger.json`, `case-result.json`, `document-evidence-review.json`, `claim-to-evidence.json`, `scientific-review.json`, `visual-geometry.json` y renders. `case-result.json` identifica el directorio canonico de la version en `artifacts-local/mvp-step6-blueprint-docx/`. Las rutas PDF fuente, chunks y assets estan en evidence-ledger.json y asset-quality.json, no en el documento publico. Inventario completo unico: `b3/PROMPTS_USED.md`.

## 11. PRODUCTION_HARDENING_BLOCKERS

1. Sesion userId sin firma y acceso por email sin verificacion. Ownership existe, pero identidad no confiable. No se modifico auth.
2. Evidencia/artefactos privados locales, no durables; manifiestos de build incluyen artifacts-local. Deben excluirse/protegerse antes de empaquetar/publicar.
3. Jobs HTTP no recuperables; limites locales no sustituyen cola, recuperacion, cancelacion y control concurrente de presupuesto.
4. Rutas lab/legacy siguen accesibles y coexisten generadores antiguos fuera del camino canonico. No cleanup B3.
5. Estrategia de adopcion/migracion de DB existente y runtime LTS soportado; Node20 se uso por reproducibilidad, no es runtime productivo recomendado. Ver [ciclo de Node.js](https://nodejs.org/en/about/previous-releases).
6. Empaquetar/verificar LibreOffice, PyMuPDF y fuentes, almacenamiento/secretos/cuotas y E2E autenticado en entorno objetivo. No deployment realizado.

## 12. Unica siguiente accion

Production hardening + integracion frontend/backend + E2E + deployment, cerrando los bloqueos anteriores antes de publicar. No implementado en B3.
