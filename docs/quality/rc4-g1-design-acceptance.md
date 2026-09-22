# RC4 G1: evaluación del selector científico

G1_STATUS: PASS. Los cuatro casos cumplen el gate del selector científico, con
limitaciones explícitas y decisiones de usuario bloqueantes donde corresponden.
Esta evaluación no certifica una tesis ni sustituye revisión humana.
Base G2: `7edc5b0ded59eed1bdd772b6dd04b06a66983363`; incluye `5abe888`.
Worktree RC4, rama `feat/rc4-scientific-commercial`. RC3 no se modifica.

## Diseño de la evaluación

Rúbrica congelada antes de llamadas: [15 dimensiones](rc4-g1-design-rubric.v1.md).
Entradas privadas con hashes en `artifacts-local/rc4/scientific-design-evaluation-v1/manifest.json`.
Cada archivo `<case>.input.json` conserva intake, campos avanzados, nivel/taxonomía,
intención, restricciones, fuentes y evidencia con nivel y procedencia. No hay nueva
recuperación, imágenes, documentos, Deep Research ni datos inventados para completar
el acceso. El caso aplicado reutiliza evidencia educativa, no evidencia geoespacial.

El geoespacial usa el intake de la versión RC3
`0ff500fc-7e85-4958-b43c-705ca800027e`, proyecto
`501ca19d-eaa6-4783-a89f-b95c959e0baa`, job
`1349d6a7-0144-441b-87d0-b075e0fe5e87` y su checkpoint EVIDENCE.
El diseño/metodología RC3 se conservan solo para comparación; no se envían como autoridad.
La reextracción mejorada de S5 de G1a NO se incorpora al paquete comparativo.

## Comparación geoespacial sobre la misma evidencia

RC3: FAIL para preservación de intención y clasificación mixta.
RC4: PASS_WITH_LIMITATIONS como propuesta condicional; NO listo para ejecución.
El crítico independiente bloquea aprobación. No se creó un diseño estable aprobado.

| Dimensión | RC3 persistido | RC4 A1 | Mejora / evidencia |
| --- | --- | --- | --- |
| Intención | O1: delimitar propuesta viable; O7 deja opcional el prototipo | OG: implementar y validar; OE2: sistema ejecutable | Sí; `definition.objectives` |
| Alcance | Puede reducirse a propuesta o visualización existente | Ejecutable obligatorio; territorio/público pendientes de aprobación | Sí, sin certificar cobertura nacional; `pending_user_decisions` |
| Teoría/marco | Pragmático y conceptos espectrales, escasa distinción operativa | Encuadre pragmático propuesto; software no es método; principios espectrales con límites | Parcial; no exige teoría nominal y faltan definiciones locales |
| Método | Revisión y diseño flexible sin producto estabilizado | Desarrollo incremental con preparación geoespacial y pruebas | Sí, pero propuesta operativa sin precedente informático inspeccionado |
| Combinación | Secuencia narrativa | Inventario -> paquete -> ejecutable -> validación; seis entregas explícitas | Sí; `components`, `method_handoffs`; falta entrega separada del conjunto independiente de referencia |
| Datos | Acceso y significado espectral sin confirmar | Requisitos PENDING y verificación de archivos/licencias/parámetros | Mejor explicitación, no mejora real de disponibilidad |
| Validación | Coherencia, transparencia, adecuación | Fidelidad numérica/espacial, pruebas funcionales, tolerancias previas | Sí; `quality_criteria`, `procedure[3]`, `analysis_method`; umbrales y oráculo pendientes |
| Ejecutabilidad | Puede concluir sin implementación | Ocho acciones hasta entrega del ejecutable e informe | Mejora condicional; crítico `executable=false` |
| Métodos mixtos | `approach=mixed` por documental + técnico | `approach=computational`, explícitamente no mixto | Sí; no inventa componente cualitativo |
| Incertidumbre | Supuestos y decisiones en texto | Cinco preguntas bloqueantes, disponibilidad tipada, crítica accionable | Sí; no convierte incertidumbre en hechos |
| Pregunta/objetivo/método | Siete pares centrados en delimitar | Cuatro pares PG/OG y PE1-3/OE1-3 alineados con preparar, implementar y validar | Sí; `definition` y procedimientos |

No puede atribuirse causalmente toda mejora a Astra: cambiaron contratos, contexto y
validadores. Tampoco se afirma superioridad general a partir de un solo caso.

## Soporte de decisiones inspeccionado

| Decisión / cita | Material realmente disponible | Evaluación |
| --- | --- | --- |
| Geo: mapas de aceleración espectral, S1/E2 | Abstract con mapas de spectral acceleration | Soporta concepto; NO valida desarrollo incremental |
| Geo: períodos/amortiguamiento, S2/E5 | Abstract con rangos de períodos y amortiguamiento de otro contexto | Soporta que esos parámetros importan; NO impone sus valores a Perú |
| Geo: UHS mediante Sa, S4/E3 | Abstract del estudio de Ática | Soporta concepto espectral; NO acredita datos peruanos |
| Geo: desarrollo del visor y protocolo de pruebas | Componentes con `support=[]`, declarados propuestas en assumptions | Insuficiente para afirmar método validado; critic lo advierte |

No se detectan citas inventadas en esos ejemplos. Punteros válidos no convierten
automáticamente la propuesta informática en una decisión metodológica sustentada.

## Continuidad geoespacial

| Fuente | Seleccionada | Inspeccionada / extraída | Verificada | En paquete | Citada por diseño | Exclusión |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Sí | Sí / 6 | 6 abstract | Sí | Sí | — |
| S2 | Sí | Sí / 6 | 6 abstract | Sí | Sí | — |
| S3 | Sí | Sí / 6 | 6 abstract | Sí | No | CONSIDERED_NOT_REFERENCED_IN_DECISION |
| S4 | Sí | Sí / 3 | 3 abstract | Sí | Sí | — |
| S5 | Sí | Sí / 6 | 0 full text | No | No | NO_VERIFIED_NON_GAP_EVIDENCE |

La tabla de uso/exclusión se deriva de los punteros del resultado guardado; el campo
`source_decisions` se añadió después de iniciada esa ejecución, por lo que NO se afirma
que estuviera persistido en su checkpoint original. Nuevas ejecuciones sí lo incluyen.
El paquete contiene 19 extractos elegibles por presupuesto. Las exclusiones de ítems
se conservan además de las de fuente. S5 no desaparece: el PDF existe, pero los seis
ítems originales no estaban verificados. Esta evaluación no corrige retroactivamente
esa evidencia ni sostiene que un PDF disponible haya sido usado como soporte.

## Fallo observado y reparación acotada

La respuesta geoespacial v2 agotó 8192 tokens (5178 de razonamiento) y dejó JSON
incompleto. Se contabilizó la llamada fallida. Una única reparación recuperó la misma
alternativa, seguida de un único crítico. No hubo segundo selector.
La producción conserva ahora el sobre de respuesta incompleta para que reiniciar no
repita el selector pagado. Reparación de formato y reparación científica comparten el
mismo máximo de una. El crítico no vuelve a ejecutarse para autoaprobar una reparación.

El selector v3 conserva requisitos y eleva el máximo a 12288, solicitando una alternativa
concisa por defecto. Geoespacial ejecutó v2 + reparación v1, NO una segunda evaluación
v3. Los otros casos comprueban v3. Se declara esta limitación de candidato evolutivo.

## Implementación y contratos

Véase [productores/consumidores y prompts](../architecture/RC4_SCIENTIFIC_DECISION.md).
Los cambios se limitan a intención compacta, esquema científico v2, DAG/entregas,
efectos de alcance, disponibilidad de datos, fuentes excluidas, crítico/repair acotados,
respuesta incompleta tipada, versiones/hash de política y visualización del impacto.
No se cambian modelos de redacción, Prisma, auth, pagos ni perfil documental G3.

Inventario completo privado: `artifacts-local/rc4/scientific-design-evaluation-v1/PROMPTS_USED.md`.
Requests resueltos y respuestas por caso: `<case>/*.request.json`, `*.output.json`,
`provider-calls/`, `dispatches.json`, `result.json`. No se incorporan a Git.

## Resultados finales y regla de parada

| Caso | Ejecución | Evaluación científica | Aprobación de diseño |
| --- | --- | --- | --- |
| Geoespacial | Selector incompleto, una recuperación, crítico completo | PASS_WITH_LIMITATIONS: mejora explícita frente a RC3 | Bloqueada por datos, alcance y validación pendientes |
| Cualitativo | Selector v3 completo; crítico v2 incompleto | No aceptado: propuesta preserva paradigma, evaluación independiente incompleta | No hay bundle final ni aprobación |
| Aplicado educativo | NOT_RUN | NOT_EVALUATED | No se creó job pagado |
| Insuficiente | Bloqueo determinístico antes de proveedor | PASS | Ningún diseño fabricado |

Se detuvieron las llamadas pagadas tras la segunda truncación, esta vez en el crítico.
No se gastó el presupuesto restante repitiendo el patrón ni se ejecutó el caso aplicado.
El crítico cualitativo consumió 3865 tokens de razonamiento de un máximo total de 4096;
quedó incompleto durante la lista de hallazgos. Error persistido:
`STRUCTURED_OUTPUT_INCOMPLETE: max_output_tokens`.

La revisión directa de la propuesta cualitativa confirma: enfoque interpretativo,
categorías/conceptos, entrevistas/documentos, análisis temático reflexivo, sin hipótesis
estadísticas, tamaño muestral fijo ni validación cuantitativa. No hay contaminación
geoespacial. S1/E2 solo describe un precedente cualitativo preescolar con teoría
fundamentada; NO prueba análisis temático reflexivo. S3/E1 sí sustenta la definición
conceptual de uso formativo de evidencia, no la eficacia ni el método completo. Estas
fronteras están expresamente declaradas en assumptions/transfer_limits.

Limitación adicional de alcance: A1 fija un caso institucional único, declara
`scope_effect=preserves`, pero al final pregunta si el usuario acepta ese caso único.
El intake admitía caso o casos múltiples sin decidir. No es sustitución de la intención
interpretativa, pero la delimitación debe representarse de forma consistente como
propuesta pendiente y con su impacto; no basta dejarla en una aclaración separada.
El fragmento del crítico también lo detecta, pero NO se trata como dictamen completo.
No se hizo una reparación científica de esta alternativa ni una segunda crítica.

### Rúbrica aplicada a las salidas efectivamente disponibles

P = PASS; L = PASS_WITH_LIMITATIONS; F = FAIL. Cualitativo: revisión directa del
selector solamente, NO aceptación independiente. Aplicado: todas NOT_EVALUATED.

| Dimensión | Geo | Cualitativo | Razón/ubicación de salida |
| --- | --- | --- | --- |
| INTENT_PRESERVATION | P | P | `definition`: implementar vs comprender experiencias |
| SCOPE_APPROPRIATENESS | L | L | Territorio y recursos pendientes; caso único requiere aceptación |
| THEORY_FRAMEWORK_FIT | L | P | Geo necesita definiciones técnicas locales; cualitativo distingue principio S3/E1 de método |
| METHOD_FIT | L | P | Geo métodos propuestos sin precedente técnico; cualitativo coherente con preferencias del intake |
| METHOD_INTEGRATION | L | P | Geo falta entrega independiente explícita; cualitativo entrevistas/documentos -> análisis temático |
| MIXED_METHODS_VALIDITY | P | P | Computational / qualitative, sin mixto ficticio |
| DATA_FEASIBILITY | L | L | Acceso PENDING/PROPOSED; sin muestras ni permisos inventados |
| PROCEDURAL_EXECUTABILITY | L | L | Acciones concretas condicionadas por acceso/alcance |
| VALIDATION_STRATEGY | L | P | Geo tolerancias/oráculo pendientes; cualitativo reflexividad, divergencias y trazabilidad |
| EVIDENCE_SUPPORT | L | L | Conceptos/precedentes parciales; no equivalen a soporte del método completo |
| TRANSFERABILITY | P | P | No traslada Japón/Grecia ni preescolar/Noruega automáticamente a Perú |
| UNCERTAINTY_DISCLOSURE | P | L | Preguntas bloqueantes; cualitativo delimita un caso antes de aceptar esa elección |
| QUESTION_OBJECTIVE_METHOD_ALIGNMENT | P | P | Geo 4 pares; cualitativo 3 pares, sin hipótesis forzadas |
| COMPLEXITY_DISCIPLINE | L | P | Geo volumen/cobertura nacional aún desconocidos; cualitativo acotado y sin sofisticación ornamental |
| NOVELTY_DISCIPLINE | P | P | Ninguna novedad universal ni ausencia de estudios afirmada |

El estado insuficiente pasa preservación de incertidumbre/seguridad; no se califica
un método, teoría o validación inexistente. El gate completo falla por evaluación
interrumpida y control de alcance cualitativo aún no demostrado satisfactoriamente.

### Fuentes del caso cualitativo

Las tres fueron seleccionadas, inspeccionadas, extraídas y consideradas en el paquete
(9 ítems elegibles). S1 abstract y S3 full text se citan para decisiones; S2 abstract
no se cita en punteros y queda CONSIDERED_NOT_REFERENCED_IN_DECISION. Su contexto
noruego con IA se menciona expresamente como límite de transferencia, no como soporte
local. La contabilidad se deriva del selector persistido porque el crítico falló antes
de crear el bundle. No hay fuente desaparecida sin razón ni promoción de metadata.

## Coste, tokens y persistencia

USD es estimación conservadora a partir del uso reportado por el proveedor, no factura.
Tasas verificadas en documentación oficial: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol).
Reserva máxima por job USD2, reserva obligatoria restante USD0.25, máximo global USD8;
solo tres casos podían pagar, máximo efectivo USD6. No se rebajaron los límites B4.
Uso ausente nunca se registró como cero; aquí las cinco respuestas sí reportaron uso.

| Caso / llamada | Modelo | Input | Cached | Cache-write | Output (incluye razonamiento) | USD estimado |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Geo selector v2 incompleto | gpt-6-astra/high | 6549 | 0 | 6546 | 8192 | 0.4914625 |
| Geo única reparación de salida | gpt-6-astra/high | 9271 | 0 | 9268 | 5939 | 0.4128375 |
| Geo crítico v2 | gpt-5.6-sol/high | 8229 | 0 | 8226 | 3759 | 0.1163250 |
| Cualitativo selector v3 | gpt-6-astra/high | 4958 | 0 | 4955 | 7684 | 0.4461750 |
| Cualitativo crítico v2 incompleto | gpt-5.6-sol/high | 6446 | 0 | 6443 | 4096 | 0.1141500 |
| TOTAL | 5 llamadas | 35453 | 0 | 35438 | 29670 | 1.5809500 |

Total tokens: 65123. Geo USD1.020625; cualitativo USD0.560325; insuficiente USD0.
Tiempo backend medido: geo 358795 ms (dos segmentos, excluye pausa entre ellos),
cualitativo 230478 ms, insuficiente 13 ms; total 589286 ms. No incluye revisión humana.
Entradas `control:cost` mantienen uso incluso si el JSON no es utilizable; su status
completed indica contabilidad del request, NO éxito científico ni completitud del JSON.
Máximo selector/crítico/repair: geo 1/1/1, cualitativo 1/1/0, insuficiente 0/0/0.

| Caso | Proyecto aislado | Job aislado |
| --- | --- | --- |
| Geo | 8259b889-459d-489c-b0bc-1ea30ff1114a | 7698879b-890c-440c-a941-2caa08bcf275 |
| Cualitativo | ca5eb70b-899b-4f7b-ae5a-cfdaa586c0fa | 3b7d6abc-5823-4945-999d-f1c15cc03dac |
| Insuficiente | c4f96561-7e37-4feb-a8f4-ec122df5c87a | 27b3cd1d-b837-4e6c-93d4-16135983a033 |

La DB es exclusivamente `127.0.0.1:55440/imx_b4_validation_rc4`. No se arrancó worker
general: se ejercitó el servicio productivo del selector con jobs y presupuestos
persistentes aislados. La integración canónica pause/approve/drafting se prueba offline.
NO se afirma una generación E2E, navegación real ni validación documental G3.

## Verificación técnica y límites pendientes

54/54 suites offline PASS antes del segundo caso pagado y en la comprobación final,
con proveedores bloqueados. Prisma validate, TypeScript, build app y build worker
PASS. Logs privados en la raíz de evaluación; suite final en
`artifacts-local/rc4/offline/2026-09-22T03-28-38-763Z`.
G2, snapshots, B4, ownership y decisión científica siguen verdes. Pruebas añadidas:
intención/campos avanzados, software frente a método, DAG y entregas, alcance declarado,
mixto válido/inválido, datos sin acceso confirmado, fuente excluida con motivo,
crítico único, reparación única y recuperación de salida sin segundo selector.
La advertencia preexistente de Next sobre el patrón dinámico `artifacts-local` sigue
visible; no se modificó empaquetado ni se suprimió. No es error de compilación, pero
requiere mantener la exclusión de artifacts privados en integración/deployment.

Auth/Prisma/pagos/G3/modelos de redacción: sin cambios. Esquemas Zod científicos:
extensión v2; v1 histórico legible. Producción usa v3 para completar la respuesta,
pero la completitud del crítico high/4096 NO está resuelta. No promocionar este gate.
Coste del diseño más redacción completa bajo el cap B4 aún requiere evaluación futura,
no se presume suficiente presupuesto porque el gate aislado quepa en USD2.

### Archivos de este gate

| Archivos | Propósito |
| --- | --- |
| `server/mvp/scientific-decision-contracts.ts` | Intención compacta, contrato v2, grafo, alcance, disponibilidad, contabilidad de fuentes |
| `server/mvp/scientific-decision-service.ts` | Selector/crítico únicos, reparación acotada, sobre persistente de salida incompleta |
| `server/mvp/prompts/scientific-design-selector.v2.ts` | Requisitos semánticos evaluados inicialmente |
| `server/mvp/prompts/scientific-design-selector.v3.ts` | Concisión y capacidad de salida corregida tras truncación real |
| `server/mvp/prompts/scientific-design-critic.v2.ts` | Cobertura científica ampliada, soporte textual y transferencia |
| `server/mvp/prompts/scientific-design-repair.v1.ts` | Reparación de alternativas defectuosas, no regeneración general |
| `server/mvp/prompts/scientific-design-output-repair.v1.ts` | Recuperación única de JSON incompleto del selector |
| `llm/structured-output-error.ts`, `llm/providers/openai.ts` | Reconocer respuesta incompleta después de registrar uso |
| `server/mvp/execution-policy.ts` | Clasificar ese fallo sin autorizar retry genérico |
| `server/projects/generation-input-snapshot.ts` | Hash de prompts actualizado; compatibilidad G1, no refactor G2 |
| `components/projects/scientific-design-approval.tsx` | Exponer pérdida/ganancia y razón del cambio de alcance |
| `scripts/test-rc4-scientific-decision.ts` | Regresiones offline de los contratos y límites |
| `scripts/evaluate-rc4-scientific-design.ts` | Entradas congeladas, límites, llamadas y evidencia privada reproducible |
| `docs/quality/rc4-g1-design-rubric.v1.md` | Rúbrica previa a llamadas |
| `docs/quality/rc4-g1-design-acceptance.md` | Este informe, resultados y parada |
| `docs/architecture/RC4_SCIENTIFIC_DECISION.md` | Productores/consumidores/autoridad y políticas |
| `docs/architecture/LLM_AND_PROMPT_REGISTRY.md` | Registro de llamadas RC4 y sus límites actuales |
| `docs/quality/rc4-g1-scientific-decision.md` | Encabezado histórico, sin reescribir evidencia anterior |
| `HANDOFF_RC4.md` | Estado real del gate y siguiente trabajo acotado |

Total: 20 archivos. Artifacts privados y credenciales no se incluyen en Git.

NEXT_ACTION: corregir y validar de forma acotada la completitud del crítico y la
declaración de alcance cualitativa, conservando entradas congeladas y sin avanzar a G3.

## G1.1 — cierre de crítico y semántica de alcance (2026-09-22)

Esta sección es la actualización autoritativa de G1. No modifica los artifacts crudos
anteriores. Las representaciones derivadas están en
`artifacts-local/rc4/scientific-design-evaluation-g1-1/` y conservan hashes de sus
entradas. Geoespacial no volvió a llamar selector ni crítico.

### Diagnóstico exacto de la truncación

| Campo | Valor observado |
| --- | --- |
| Modelo / razonamiento | `gpt-5.6-sol` / `high` |
| Máximo configurado | 4096 output tokens |
| Razonamiento | 3865 tokens |
| Salida visible calculada | 231 tokens |
| Salida total | 4096 tokens |
| Estado / motivo | `incomplete` / `max_output_tokens` |
| Parseo | Rechazado antes de certificación; el fragmento no es un dictamen |

El proveedor informó explícitamente la incompletitud. La producción ahora persiste un
sobre `COMPLETE | INCOMPLETE_TOKEN_LIMIT | INCOMPLETE_PROVIDER | INVALID_SCHEMA |
FAILED`; solo `COMPLETE` puede avanzar. `INCOMPLETE_TOKEN_LIMIT` permite una única
recuperación del crítico, nunca del selector. El nuevo crítico v3 usa un esquema compacto,
`high` y 8192 tokens; no pide ensayo ni cadena de razonamiento. La reserva preventiva
incluye el techo completo. `medium` no se adoptó: una recuperación `high` completó el
caso con margen (4073/8192 tokens totales) y dictamen científicamente accionable.

### Semántica de alcance y confirmación

El contrato diferencia `PRESERVED`, `CLARIFIED`, `NARROWED`, `EXPANDED`,
`MATERIAL_CHANGE_PROPOSED` y `PENDING_USER_DECISION`. La confirmación es separada,
revision-specific y auditable. Una delimitación pendiente nunca se migra como reducción
confirmada. `PENDING_USER_DECISION` exige pregunta concreta, `REPAIR_REQUIRED` y bloquea
la estabilización de `ResearchDesign`. La migración de outputs G1 es determinística,
derivada y no reescribe el JSON original.

### Evaluación de cierre

| Caso | Selector completo | Crítico completo | Intención | Alcance | Teoría/marco | Método e integración | Mixto | Datos / validación / ejecución | Confirmación | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Geoespacial | Sí, almacenado | Sí, migrado offline | Preservada | Decisiones explícitas | L | Mejora frente a RC3; condicional | Correcto: computational | L / L / L | Requerida antes de estabilizar | PASS_WITH_LIMITATIONS |
| Cualitativo | Sí, reutilizado; 0 nuevas llamadas | Sí, recuperación única | Preservada | `PENDING_USER_DECISION`; no estrechamiento confirmado | L | Cualitativo interpretativo preservado; sin hipótesis ni muestra numérica | Correcto: qualitative | F por acceso/evidencia; validación P; ejecución F | Requerida y bloqueante | PASS_WITH_LIMITATIONS como evaluación; diseño aún no aprobable |
| Aplicado educativo | No: timeout de transporte | No ejecutado | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | FAIL |
| Insuficiente | Bloqueo determinístico | No corresponde | No se inventa intención | Pendiente | No inventada | No inventado | No inventado | Información faltante explícita | Requerida | PASS |

El caso aplicado no es una copia del cualitativo: propone diseñar y evaluar técnicamente
un protocolo para actividades matemáticas digitales, sin participantes ni inferencia
causal, frente al estudio interpretativo de experiencias docentes rurales. Mantiene el
mismo corpus congelado para evitar ventaja por recuperación. Su única llamada Astra
agotó 240 segundos sin JSON, respuesta parcial ni ID recuperable en el audit local.
No se hizo una segunda llamada porque `MAX_SELECTOR_CALLS_NEW=1`. El crítico aplicado
no se despachó. Por tanto no existe evidencia para descartar sobreajuste y G1 no pasa.

### Fuentes y continuidad cualitativa

S1, S2 y S3 permanecen seleccionadas, inspeccionadas, extraídas y consideradas. S1 y
S3 justifican decisiones; S2 queda `CONSIDERED_NOT_REFERENCED_IN_DECISION` con motivo
explícito. El crítico señala que los extractos no sustentan por sí solos secundaria
rural peruana, estudio de caso ni análisis temático reflexivo. No hay promoción de
metadata a soporte sustantivo ni caída silenciosa de fuentes.

### Presupuesto y uso nuevo

Preflight máximo para las tres llamadas: USD1.5706425 frente a USD3.00. Dos llamadas
se despacharon; no hubo transport retries, Deep Research, imágenes ni documentos.

| Llamada | Modelo | Input | Cached | Output | Tokens totales | Costo |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Recuperación crítica cualitativa | Sol/high | 7258 | 0 | 4073 | 11331 | USD0.117750 estimado por uso reportado |
| Selector aplicado | Astra/high | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN; reserva máxima USD0.9490875 retenida |

Uso conocido total: 11331 tokens. El total real no puede calcularse porque la llamada
Astra terminó por timeout sin usage. El costo conocido es USD0.117750; costo comprometido
conservador USD1.0668375. No se registra el uso faltante como cero. La tercera llamada
autorizada no se despachó porque no existía selector aplicado que criticar.

### Verificación G1.1

- 54/54 suites offline PASS: `artifacts-local/rc4/offline/2026-09-22T03-59-33-207Z`.
- Prisma validate PASS; TypeScript PASS; app build PASS; worker build PASS.
- G2, B4, ownership, decisión/aprobación y caso insuficiente siguen verdes.
- Build conserva las dos advertencias conocidas de tracing amplio de `artifacts-local`.
- Prisma, auth, pagos, modelos y documentos G3 no cambiaron.

G1.1 no crea commit porque la condición explícita era commit solo después de aceptación.
Las mejoras quedan revisables en el working tree; no hay push ni deploy.

G1.1_NEXT_ACTION_SUPERSEDED: autorizar una única repetición aislada del selector aplicado
con transporte recuperable y, solo si completa, ejecutar su crítico.

## G1.2 — transporte persistente y cierre aplicado (2026-09-22)

G1.2 no repitió geoespacial, cualitativo ni insuficiente. Los cambios G1.1 se congelaron
primero en `7ba51f308685182f83b6eda7ac873558d1b9ac0d`.

### Diagnóstico del timeout anterior

- endpoint: `POST /v1/responses`;
- modelo: `gpt-6-astra`, razonamiento `high`, máximo 12288 output tokens;
- modo anterior: foreground, sin streaming ni background;
- timeout cliente: 240000 ms, impuesto por `LLM_REQUEST_TIMEOUT_MS` al SDK;
- error local: `APIConnectionTimeoutError` (`Request timed out.`); el SDK abortó la solicitud;
- timeout del servidor/proveedor: UNKNOWN; no hubo respuesta terminal observable;
- input estimado: 26775 tokens; reserva máxima USD0.9490875;
- `response_id`, JSON parcial y usage: no capturados.

No se interpreta ese evento como fallo de Astra. Su usage continúa UNKNOWN y su reserva
máxima no se libera ni se presenta como factura. El nuevo transporte usa un intento lógico
determinístico, un único create `background=true`, persistencia inmediata del `response_id`
y retrieval adaptativo 2–15 s durante un máximo local de 900 s. Reinicio y polling reutilizan
el mismo ID. `queued`, `in_progress`, `completed`, `failed`, `cancelled`, `incomplete`, ventana
local agotada y reinicio fueron cubiertos offline; la API no documenta `expired` como estado
de Responses y no se inventó esa semántica.

### Resultado aplicado y revisión científica

`response_id`: `resp_075c8835959c2ef7006ab20b066e6487d29cd5eb771c502394`.
Selector Astra y crítico Sol terminaron COMPLETE. Hubo un create de selector, un crítico,
cero recuperaciones y cero Deep Research. El dictamen conserva el alcance documental y
la evaluación técnica sin estudiantes ni inferencia causal. Distingue principio, técnica,
instrumento y métodos; no llama “mixto” al uso de proporciones descriptivas, no impone una
teoría nombrada y no introduce validación ingenieril impropia.

El caso es `PASS_WITH_LIMITATIONS` como evaluación del selector, no como diseño ejecutable.
El crítico devuelve `REPAIR_REQUIRED`: exige cerrar nivel/actividades/entorno/criterios/
evaluadores, sustentar o declarar como normativos los criterios específicos y separar
escenarios de confirmación. Ese bloqueo es el comportamiento científicamente correcto.

Las tres fuentes seleccionadas fueron inspeccionadas, extraídas y consideradas. S3/E1
(`PDF_FULLTEXT`) sustenta únicamente el principio formativo. S1 y S2 quedan explícitamente
`CONSIDERED_NOT_REFERENCED_IN_DECISION`; no desaparecen ni se promueven sus abstracts a
soporte sustantivo.

### Matriz final de aceptación

| Caso | Selector | Crítico | Intención | Alcance | Teoría/marco | Método/integración | Mixto | Datos/validación/ejecución | Confirmación | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Geoespacial | COMPLETE almacenado | COMPLETE migrado offline | Preservada frente a RC3 | Condicional; decisiones explícitas | PWL | PWL, mejor que RC3 | Correcto: computational | PWL/PWL/PWL | Requerida | PASS_WITH_LIMITATIONS |
| Cualitativo | COMPLETE reutilizado | COMPLETE, recuperación G1.1 | Preservada | PENDING_USER_DECISION | PWL | Cualitativo preservado | Correcto: qualitative | FAIL/PASS/FAIL hasta resolver acceso | Bloqueante | PASS_WITH_LIMITATIONS como selector |
| Aplicado educativo | COMPLETE | COMPLETE, sin recuperación | Preservada | PRESERVED | PASS | PASS/PASS | Correcto: no mixed | PWL/PWL/FAIL hasta decisiones | Bloqueante | PASS_WITH_LIMITATIONS como selector |
| Insuficiente | Bloqueo determinístico | No corresponde | No inventada | Pendiente | No inventado | No inventado | No inventado | Faltantes explícitos | Requerida | PASS |

No hay clasificación mixta inválida, cambio oculto de alcance, fuente seleccionada sin
estado terminal ni respuesta incompleta aceptada. La generalidad cruzada queda demostrada
para este conjunto pequeño; no equivale a validación universal ni revisión humana.

### Uso, coste y verificación

| Llamada nueva G1.2 | Input | Cached | Output | Total | Costo estimado |
| --- | ---: | ---: | ---: | ---: | ---: |
| Astra selector | 4621 | 0 | 6172 | 10793 | USD0.3663625 |
| Sol critic | 6468 | 0 | 4306 | 10774 | USD0.1184600 |
| Total nuevo | 11089 | 0 | 10478 | 21567 | USD0.4848225 |

Preflight máximo nuevo: USD2.136035, por debajo de USD3.00. Compromiso conservador
total: USD0.9490875 anterior UNKNOWN + USD0.4848225 nuevo conocido = USD1.4339100.
No se reservó ni cobró la recuperación crítica no utilizada. Los importes son estimaciones
por usage reportado, no una factura del proveedor.

- 55/55 suites offline PASS: `artifacts-local/rc4/offline/2026-09-22T05-09-01-552Z`.
- Prisma PASS; TypeScript PASS; app build PASS; worker build PASS.
- Persistencia/reinicio, create único, retrieval repetible, intentos invariantes y uso
  desconocido conservado: PASS.
- Dos advertencias de tracing de `artifacts-local` permanecen conocidas y ajenas a G1.2.
- Prompts, modelos, schema Prisma, G2, G3, auth, pagos y RC3 no cambiaron.

NEXT_ACTION: implementar y validar G3 `latam-compact-v1` consumiendo la decisión
científica aprobada, sin repetir los cuatro casos G1.
