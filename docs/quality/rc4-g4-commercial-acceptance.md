# RC4 G4 — aceptación local de autenticación y comercio

Fecha: 2026-09-23. Base limpia `1ada2d036244fc7a7df79e79a46aa79a688ca1cf`.
Rama `feat/rc4-scientific-commercial`, worktree `ingeniometrix-wt-rc4`.
G4_STATUS: PASS_WITH_LIMITATIONS para implementación/aceptación offline.
GOOGLE_EXTERNAL_ACCEPTANCE: NOT_RUN. PAYMENT_EXTERNAL_ACCEPTANCE: NOT_RUN.
Venta real y despliegue público: BLOCKED. No se afirma aceptación externa.

## Matriz de requisitos

| Requisito | Implementación | Persistencia | Invariante / prueba | Estado |
| --- | --- | --- | --- | --- |
| G4.0 baseline/no regresión | Git + suites RC4 | reportes privados | G1/G2/G3/B4 no rediseñados | PASS |
| G4.1–3 separar pago/cupo/crédito/costo | catalog/ledger/purchases | 7 modelos aditivos + AuditLog existente | snapshots + balances independientes | PASS |
| G4.4–6 identidad OIDC/linking | google-oidc/openid-client | AuthIdentity/OidcTransaction | JWT/state/nonce/PKCE/sub/collision/replay | PASS offline |
| G4.7–8 sesión/UI Google | session/google-button/workspace/account | UserSession existente | rotate/revoke/expiry/CSRF | PASS offline; UX interactiva NOT_RUN |
| G4.9–15 reserva/liquidación/cap | ledger + enqueue + B4 call gate | Entitlement/Reservation/entries | último cupo concurrente, recuperación, release, usage desconocido | PASS |
| G4.16–17 saldo/compra necesaria | AccountPanel + blueprints POST | saldo persistente | 402 sin job ni reserva; preparación disponible | PASS HTTP |
| G4.18–20 proveedor/checkout | interfaz + MP Orders | Purchase snapshot/idempotency | clave estable servidor; sin grant al redirigir | PASS offline; externo NOT_RUN |
| G4.21–24 webhook/estado | signature + retrieve + processPaymentEvent | PaymentEvent/Purchase | firma, importe, moneda, merchant/app, duplicate/out-of-order | PASS offline |
| G4.25 refund/chargeback | revokeEntitlement + estados normalizados | asientos + freeze | revisión si usado/reservado; conserva documentos | PASS offline; entrega real NOT_VERIFIED |
| G4.26–28 append-only/auditoría | triggers/constraints/securityAudit | ledger + AuditLog | UPDATE/DELETE prohibidos, saldo no negativo | PASS |
| G4.29–30 abuso/IDOR/CSRF | DB rate locks/proxy/owner filters | AuthThrottle | concurrencia, dos usuarios, origen malicioso | PASS offline/HTTP |
| G4.31 admin/MFA | no admin comercial web | guard fail-closed | MFA no implementado; sensible deshabilitado | BLOCKED producción |
| G4.32 términos/consent | compra acepta versiones; preference API | snapshot/AuditLog/trainingConsent | no opt-in automático; revocable; sin entrenamiento | PASS técnico; legal NOT_APPROVED |
| G4.33 secretos | env.example/app env exclusivamente | archivos locales ignorados | sin tokens persistidos/committed | PASS |
| G4.34–35 aceptación externa | runbook/config checks | no credenciales encontradas | no simular éxito proveedor | NOT_RUN |
| G4.36 seed desarrollo | helper scripts/fixtures/commercial | grant audit etiquetado | puerto/nombre DB aislados; sin endpoint de regalo | PASS |
| G4.37–39 históricos/UI/precio | migración aditiva/catálogo candidato | usuarios/sesiones conservados | sin derechos gratuitos automáticos; venta real bloqueada | PASS local |
| G4.40–41 integración/reconciliación | atomic enqueue/terminal + CLI | mismo job/snapshot/reserva | rollback, worker restart, publication crash | PASS offline |
| G4.42 migraciones | tres migraciones G4 aditivas | schemas frescos/RC3/G3 | Prisma migrate deploy; nunca db push | PASS |
| G4.43–45 seguridad/crashes | tests G4 + secure-pilot/B4 | DB aislada | asserts + fallos inyectados transaccionales | PASS |
| G4.46–47 regresiones/builds | suite offline/build app/worker | logs privados | sin paid APIs | PASS |
| G4.48–49 docs/commits | arquitectura/runbook/handoff | Git local | no push/deploy | COMPLETE |

## Pruebas ejecutadas

- Suite completa: 58/58 scripts PASS (56 existentes + 2 G4), sin red en tests G4.
- G4 auth: 28 comprobaciones agrupadas; usa token firmado ficticio con clave RSA
  efímera y **verificador real openid-client**, no validación JWT simulada.
- G4 commercial: 52 comprobaciones agrupadas; transacciones PostgreSQL reales,
  proveedor simulado. Último cupo, reserva misma generación, rollback enqueue,
  rollback settlement, rollback pago/grant, reconciliación, freeze/revoke,
  duplicados, uso desconocido no cero, importe/moneda/merchant/app incorrectos.
- G4 HTTP: 23 comprobaciones con Next production build en loopback aislado,
  dos usuarios, consentimiento reversible, CSRF/IDOR, 402 sin entitlement,
  202 con reserva atómica y retry mismo job. Sin worker ni llamadas externas.
- Migraciones: 11 aplicadas desde fresh, RC3 (primeras 2), G3 (primeras 8).
  Usuarios/sesiones históricos ficticios conservados, cero grants al migrar.
  También actualizada sólo BD local RC4 autorizada, nunca RC3/producción.
- Prisma validate, TypeScript, app production build y worker build: PASS.
- git diff --check: PASS. No cambios en prompts/perfiles/selector/critic.

Evidencia privada: `artifacts-local/rc4/g4/` (build-validation.log,
commercial-test.log, http-server.log, migration-{fresh,rc3,g3}.log,
npm-audit.json). Suite global bajo `artifacts-local/rc4/offline/` por timestamp.
Los schemas de migración de prueba se conservan; no reset/drop de bases previas.

## Hallazgos corregidos durante validación

El trigger compartido inicial referenciaba campos inexistentes de otra tabla;
una migración aditiva corrigió la selección por tabla. El ledger ahora rechaza
tanto modificación como eliminación. Eventos concurrentes revelaron que upsert
vacío Prisma podía competir: se reemplazó por INSERT con skipDuplicates.
Los ciclos comerciales no usan el número de intento del worker: un fallo anterior
a adquirir el job recuperado ya no colisiona con la liquidación anterior.
Un callback OIDC cross-site no trae cookie Strict: la sesión anterior se captura
desde start y revoca al autenticarse correctamente.

## Límites y bloqueos de producción

No configurados: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MP_TEST_ACCESS_TOKEN,
MP_WEBHOOK_SECRET, MP_TEST_MERCHANT_ID, MP_APPLICATION_ID. No login Google real,
checkout real de sandbox, webhook del proveedor ni evaluación visual interactiva.
Contrato Orders verificado documentalmente; los campos/modo/url deben comprobarse
contra cuenta de prueba. Contracargos normalizados están cubiertos offline, no se
afirma aceptación del feed real separado de contracargos.

MFA administrativo pendiente; no ajustes comerciales públicos. Precio S/99,
merchant/país, términos y privacidad necesitan aprobación. Condiciones actuales
son sandbox, no asesoramiento legal ni texto listo para venta. Runtime DB debe
separarse de rol migrador/DBA antes de exposición. G5 debe validar origen único,
conectividad Vercel–Ubuntu, TLS, backup y no exposición PostgreSQL.

Build conserva dos warnings de tracing de artefactos de G3; no introducidos por G4.
Auditoría npm: 3 high en cadena Prisma/deepmerge-ts (herramienta de migración),
1 low esbuild (servidor dev Windows). Paquetes OIDC añadidos sin advisory reportado.
Dockerfile existente excluye esas herramientas del runtime; no se reconstruyó
container ni se reaceptó el riesgo para venta pública. Sin upgrade forzado.

Uso: PAID_LLM_CALLS=0; REAL_PAYMENTS=0. No se inició entrenamiento.
No se desplegó, empujó ni tocó RC3. Único siguiente paso: aceptación externa
controlada Google + Mercado Pago sandbox con credenciales autorizadas, antes de G5.
