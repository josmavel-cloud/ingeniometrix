# Fiabilidad de búsqueda, acceso interno y evidencia

Fecha de diagnóstico: 2026-09-30. La autoridad de cada fila es su prueba y su
aceptación desplegada. El diagnóstico privado permanece fuera de Git en
`/tmp/imx-reliability-diagnosis-20260930`.

La producción observada al iniciar esta reparación tenía `origin/main`
`096f7d1c`, Vercel `dpl_7y1DvgoTE2sPPtszJ9rxynskbakX`, y app/worker con
revisión OCI `21fbe4f1`. La diferencia entre main y runtime era documentación
de release. Había 16 migraciones aplicadas. El proyecto fallido detuvo la
búsqueda en `QUERY_PLAN_INVALID`, antes de OpenAlex/Crossref. Un segundo proyecto
alcanzó Sources mediante un plan semántico válido y Crossref; son operaciones
distintas de la misma cuenta.

| ID | Requisito decidido | Prueba de regresión | Aceptación en producción |
| --- | --- | --- | --- |
| R01 | Una definición válida no pierde su objeto en el fallback | Objeto compuesto, seis disciplinas, input congelado sanitizado antes/después | El mismo SearchIntent alcanza un proveedor sin aclaración falsa |
| R02 | Recuperar FAILED sin doble gasto ni borrar historial | Dos llamadas concurrentes, coste conocido, UNKNOWN, checkpoint y antiguo FAILED | Reintento normal crea un solo intento recuperable; uso histórico intacto |
| R03 | Cuenta interna autorizada genera sin paquete | Usuario normal con/sin paquete, grant activo/revocado, intento de forja | Job interno completo sin compra o saldo ficticio |
| R04 | Presupuesto, ownership y auditoría permanecen | Reservar llamada, revocar, publicar, liquidar, descarga ajena | Ningún bypass de coste, acceso o trazabilidad |
| R05 | Título original principal, traducción española secundaria | Español/inglés, tarjeta ya montada | Títulos legibles y traducción real sin duplicar español |
| R06 | Abstract real y explicaciones en español | Abstract presente/ausente, motivo con procedencia | Nunca se presenta relevancia como abstract |
| R07 | HTML/JATS limpio; originales conservados | Entidades, JATS, malformed, XSS y texto científico | Lectura limpia sin cambiar título/abstract canónico |
| R08 | Un CTA; preparación científica interna | UI y EvidenceSet inmutable con NOT_PREPARED | Sin filas internas; progreso y evidencia verificables |
| R09 | Selección y contadores consistentes | 0–10, traducción entrante, guardado pendiente y dos pestañas | Tarjeta/sidebar/CTA concuerdan tras guardar y recargar |
| R10 | CORE/EXPLORATORY, mínimo y Astra acotado | 2 CORE activa Astra, convergencia, dedupe, presupuesto y segundo clic | Flags efectivos ON, una operación como máximo, sin relleno |
| R11 | FORD, tres ideas y chat conservados | Contratos y navegación Define/Evidencia/Plan | Flujos existentes operativos |
| R12 | PDF exacto y checkbox sin cambios | Diagnóstico seguro y reproducción exacta cuando esté disponible | Reparación solo si se prueba causa del archivo; checkbox idéntico |

Estado al crear este documento: implementación local en curso; **ninguna fila
se declara verificada en producción**. El PDF exacto carece de una copia
privada disponible para reproducción y mantiene una dependencia separada.

## Resultados locales antes del despliegue

- R01/R02: el replay privado de solo lectura del input congelado pasó de
  `QUERY_PLAN_INVALID` a un paquete válido; la regresión versionada usa un
  caso sintético de objeto compuesto y seis disciplinas. En base aislada, la
  operación FAILED se conserva, un intento determinista reanuda una sola vez,
  no repite la llamada completada y rechaza el uso incierto.
- R03/R04: la migración aditiva introduce una capacidad interna revocable y
  autorización por job, separadas de entitlements de cliente. La prueba
  aislada cubre grant, reserva y revocación; el ciclo de inferencia real y
  liquidación final requieren aceptación autenticada.
- R05–R09: lectura derivada de entidades/JATS, cola de traducción de worker,
  refresco de tarjetas y CTA único tienen pruebas locales. Ninguna prueba
  offline equivale todavía a una traducción real observada en la UI.
- R10: la prueba aislada comienza con 2 CORE, ejecuta una operación Astra
  simulada con observación web, converge por el pool común, exige revisión
  antes de clasificar el nuevo candidato como CORE y confirma que la recarga
  no crea una segunda operación. Los flags de producción deben verificarse
  de nuevo tras publicar la nueva imagen.
- R12: el archivo exacto no estaba disponible. Se agregan categorías de
  proceso seguras para futuros intentos; no se declara reparado el PDF.

La publicación exige backup cifrado verificado, migración aditiva ensayada,
app/worker compatibles, PR y checks normales, main, Vercel Production y smoke
HTTP/autenticado. Guardar aquí commits, imágenes, deployment, resultados y
límites al cerrar la entrega. No modificar datos científicos del propietario.

## Publicación del 2026-10-01

- Fuente probada: `6e063284eff907c7912c7b38096714dbf5ffe75e`.
  PR #12 se fusionó normalmente a `main` en
  `b4bd607a98eddc56ab503f5cce6faebe22f65cd0`; Vercel Preview pasó.
- Imagen de app y worker desplegada: `sha256:0cccc9857a09ecb5a8592d8027a4406fd386da611b33670497dfa6ba822d6e24`.
  Ambos contenedores están saludables en staging y producción. La migración
  aditiva `20260930200000_internal_generation_capability` dejó 17 migraciones
  terminadas en cada entorno.
- Antes de migrar producción, se guardó el snapshot Restic `b458155c` en el
  repositorio cifrado canónico de producción. `restic check --read-data` pasó el
  `2026-10-01T00:44:24Z`; app y worker se reanudaron tras el backup.
- Deployment de Vercel Production asociado a `main`: GitHub deployment
  `6773414502`, terminado correctamente. `https://ingeniometrix.com/` y un
  asset Next respondieron 200; backend público readiness 200 con TLS válido.
  El login Google inició con HTTP 200 usando el `Origin` real del navegador;
  una petición sin `Origin` fue rechazada por la protección CSRF prevista.
- En los contenedores **activos** de producción, los flags
  `IMX_ASTRA_WEB_MINIMUM_SOURCE_FALLBACK`, `IMX_ENABLE_ASTRA_WEB_DISCOVERY` y
  `IMX_ENABLE_ASTRA_WEB_CONVERGENCE` son `1`; `IMX_ENABLE_DEEP_RESEARCH` e
  `IMX_AUTHLESS_WORKSPACE` son `0`. La prueba offline con 2 CORE demuestra una
  única operación Astra simulada, convergencia y admisión común, y ausencia de
  una segunda operación al reintentar. No se realizó una llamada Astra real sin
  sesión técnica legítima disponible.
- La capacidad interna se otorgó a la única cuenta que coincidió con los
  registros autenticados y la titularidad de los proyectos diagnosticados;
  estado final `ACTIVE`, con grant y evento de auditoría. No se concedió
  entitlement ni saldo ficticio. La prueba en DB aislada creó un BlueprintJob
  bajo esta política sin paquete; la generación real, liquidación y DOCX aún
  requieren aceptación autenticada.
- El monitor operativo informó `healthy` para worker heartbeat, backup y
  almacenamiento. Staging y producción respondieron 200 en readiness. Los
  logs recientes de app/worker no mostraron líneas de error ni marcadores de
  secreto en el examen automatizado.

| ID | Implementado | Ejecutado | Verificado en UI | Pendiente |
| --- | --- | --- | --- | --- |
| R01 | Sí | Replay sanitizado y suite offline | No | Reintento normal del proyecto histórico por su propietario |
| R02 | Sí | Suite de idempotencia y coste aislada | No | Reintento autenticado con historial fallido equivalente |
| R03 | Sí | Enqueue aislado y grant auditado en producción | No | Generación interna real y DOCX por sesión normal |
| R04 | Sí | Ownership, presupuesto y ledger en pruebas aisladas | No | Liquidación real de un job autorizado |
| R05 | Sí | Pruebas de título/idioma y worker | No | Traducción real visible en tarjeta existente |
| R06 | Sí | Abstract presente/ausente en suite offline | No | Revisión visual autenticada |
| R07 | Sí | HTML/JATS y texto derivado en suite offline | No | Comparación visual con referencia real |
| R08 | Sí | Componentes y EvidenceSet probados offline | No | Recorrido autenticado de un CTA |
| R09 | Sí | Persistencia y refresco de tarjeta probados offline | No | Comparación de contador y selección en navegador |
| R10 | Sí | Fixture 2 CORE/Astra una vez; flags activos comprobados | No | Astra real solo con presupuesto y sesión legítima |
| R11 | Conservado | Suites de contratos y staging HTTP | No | Recorrido autenticado de ideas/chat |
| R12 | Solo instrumentación | PDF sintético y categorías seguras | No | Archivo exacto autorizado y reproducción causal |

El PDF exacto del incidente no estaba disponible de forma autorizada: no se
declara reparado. El checkbox opcional no cambió. Los proyectos científicos
existentes del propietario no se usaron para generar, buscar ni modificar
evidencia durante esta publicación. Una aceptación UI auténtica y una llamada
pagada no se sustituyen por fixtures ni por health 200.

Rollback: conservar el snapshot cifrado `b458155c`; si fuese necesario,
retirar tráfico y volver a la imagen runtime anterior
`imx-rc4-source-sufficiency:20260930` (la migración es aditiva y compatible).
Si se precisara restaurar datos, hacerlo únicamente desde la copia canónica
verificada y bajo un procedimiento explícito que preserve el ledger y los
datos creados después del snapshot. No borrar volúmenes ni reescribir historial.
