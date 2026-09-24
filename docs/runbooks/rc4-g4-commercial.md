# RC4 G4: configuración y recuperación

No desplegar ni habilitar venta real con esta guía. Código local G4 sobre G3;
Google y Mercado Pago externos NOT_RUN por ausencia de credenciales autorizadas.

## Entorno

Mantener IMX_AUTHLESS_WORKSPACE=0, IMX_ENABLE_DEEP_RESEARCH=0.
Variables: DATABASE_URL, DATABASE_URL_UNPOOLED, APP_ORIGIN, BLUEPRINT_WORKER_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, IMX_PAYMENT_MODE,
IMX_PAYMENT_ACCOUNT_CONTEXT, MP_TEST_ACCESS_TOKEN, MP_WEBHOOK_SECRET,
MP_TEST_MERCHANT_ID, MP_APPLICATION_ID. No copiar secretos al repo.
APP_ORIGIN debe ser un origen exacto HTTPS, no una URL Markdown ni incluir path.
Google redirect: APP_ORIGIN + /api/auth/google/callback. Scopes mínimos OIDC.
Compose pasa credenciales Google/MP sólo al app, no al worker. La CLI de conciliación
se ejecuta desde checkout de operador autorizado con dependencias instaladas;
no está disponible en la imagen runtime reducida.

En el portal de Mercado Pago usar vendedor/comprador de prueba, aplicación ligada
al vendedor de prueba y webhook Orders. El adapter confirma cuenta test_user;
no usar un token comercial porque su prefijo se parezca al de prueba. Registrar
endpoint HTTPS /api/payments/mercado-pago/webhook y custodiar secreto de firma.
No provisionar recursos ni publicar endpoint desde G4.

## Migración y catálogo

Respaldar primero. `npm run db:migrate:deploy` con rol migrador y BD aislada al
validar. Nunca db push/reset. Migraciones G4 son aditivas y no conceden paquetes
a usuarios anteriores. Semilla explícita, idempotente y sandbox:

```bash
node --env-file=.env.rc4-test --import tsx scripts/commercial-admin.ts seed
```

El env utilizado debe declarar IMX_PAYMENT_MODE=sandbox. No sustituir secretos de
archivos existentes automáticamente. Para desarrollo offline las pruebas usan
`scripts/fixtures/commercial.ts`: grants etiquetados OFFLINE_FIXTURE_NOT_A_PAYMENT,
con DB loopback/puerto/nombre verificados. No hay endpoint público de grants gratis.

Rollback: detener nuevas compras/generaciones, conservar tablas/ledger y revertir
sólo app a candidato compatible. Una app anterior a G4 no debe ejecutar nuevos
jobs comerciales sin gate; no es un rollback comercial seguro. Restauración DB
sólo desde backup ensayado con reconciliación del proveedor; preferir forward-fix.
No borrar columnas/ledger para revertir. Rol app no propietario de esquema.

## RECOVERY_AND_RECONCILIATION

```bash
node --env-file=.env.rc4-sandbox --import tsx scripts/commercial-admin.ts reconcile
```

Ese archivo se configura localmente, no se crea por esta tarea. Requiere sandbox
autorizado; hace GET de Orders, nunca generación LLM ni cargos. Procesa máximo
100 eventos pendientes y 100 compras pendientes/pagadas con order ID por pasada, más
100 jobs terminales. Es idempotente; repetir es una acción operativa explícita.

| Interrupción | Resultado / recuperación |
| --- | --- |
| Antes de commit enqueue | Job/reserva/snapshot se revierten juntos |
| Después de enqueue | Worker existente toma mismo job/reserva |
| Llamada API con usage desconocido | B4 retiene máximo; nunca facturar cero supuesto |
| Plataforma falla antes de publicación | Release comercial; costos B4 intactos |
| Publicación antes de settlement | Reconciliar mismo job; DOCX/PDF exigidos |
| Settlement interrumpido | Transacción revierte; operationKey evita doble cargo |
| Provider create responde pero app pierde respuesta | Recuperar por GET y referencia exacta antes de cualquier nuevo POST |
| Pago verificado antes de grant | Purchase/grant/evento en una transacción |
| Grant antes de ACK | Repetición verifica y no vuelve a conceder |
| Webhook perdido | Reconciliar compras pendientes con GET provider |
| Reembolso con plan usado | Congelar resto + revisión, nunca borrar historial |

COST_PENDING no se libera sin usage acreditable. La reconciliación no inventa ni
reescribe usage. Pendientes antiguos/checkout sin order ID se investigan antes de
autorizar otra compra. Contracargos reales requieren validar topic/mapeo en sandbox;
no hay integración activa con un feed separado de contracargos.

Ante una respuesta perdida, usar `recoverMercadoPagoOrderForPurchase(purchaseId)`.
La operación busca por `external_reference` en una ventana de ±10 minutos, exige
exactamente una coincidencia y recupera el detalle por GET. Valida merchant,
application, importe, moneda, país, estado y checkout antes de persistir. `PE` y
`PER` se normalizan a `PE`; `ORDTST` es señal auxiliar y no frontera única. Cero o
varias coincidencias detienen la recuperación sin mutaciones ni un nuevo POST.

## Validación reproducible sin proveedores

```bash
node --env-file=.env.rc4-test --import tsx scripts/rc4-offline-suite.ts
node --env-file=.env.rc4-test --import tsx scripts/test-rc4-g4-migrations.ts
npm run prisma:validate
npm run typecheck
npm run build
npm run build:release-worker
node --env-file=.env.rc4-test --import tsx scripts/test-rc4-g4-http.ts
```

Suite requiere PostgreSQL de pruebas `127.0.0.1:55440/imx_b4_validation_rc4`.
Migraciones crean schemas únicos fresh/rc3/g3 y los conservan para inspección.
HTTP levanta y detiene sólo su app loopback 33249; no inicia worker. No constituye
prueba interactiva visual ni login Google/checkout externo.

## Prerrequisitos antes de G5/público

Aceptar Google real (callback, vinculación y logout), checkout de comprador de
prueba + webhook real + devolución/contracargo y eventual consistencia; revisar
legal/precio/merchant país; MFA administrativo; rol DB runtime mínimo; backups;
definir origen único/CSRF en arquitectura híbrida y conectividad privada Ubuntu.
Compose heredado publica DB port: G5 debe cerrarlo a loopback/interfaz privada antes
de exposición. No se cambió ni arrancó ese stack en G4.
