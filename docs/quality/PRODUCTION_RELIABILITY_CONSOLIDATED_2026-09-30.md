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
