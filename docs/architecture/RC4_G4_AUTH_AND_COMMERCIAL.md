# RC4 G4: autenticación y comercio

Estado: implementación local; aceptación externa pendiente. No autoriza venta real.
Base científica: `1ada2d036244fc7a7df79e79a46aa79a688ca1cf` (G3).
No modifica prompts, ScientificDecision, ResearchDesign ni latam-compact-v1.

## AUTH_ARCHITECTURE / SESSION_AUTHORITY

Un solo User y UserSession. Google identifica por `(provider, sub)`, nunca por email.
`server/auth/google-oidc.ts` usa openid-client 6.8.8 con discovery/JWKS y
`enableNonRepudiationChecks`: verificación criptográfica explícita del ID token,
issuer, audience, expiración, nonce y PKCE S256. Sólo scopes openid/email/profile.
No almacena access/refresh/ID tokens; no los entrega a JavaScript.

POST `/api/auth/google/start` valida origen y limita abuso. Guarda OidcTransaction
de 10 minutos: hashes de state/cookie, nonce y verifier privados, redirect exacto,
identidad/sesión de vinculación si procede. Cookie transitoria HttpOnly/Lax,
Secure en producción. El callback consume atómicamente una sola vez, verifica el
browser binding y borra nonce/verifier. Un callback incompleto exige empezar otra
autenticación, no reutiliza el código. Errores públicos genéricos.

Email verificado coincidente con cuenta local NO vincula automáticamente. El usuario
inicia sesión y usa «Vincular mi cuenta con Google» en /account. Requiere sesión
válida creada hace menos de 15 minutos. Identidad de otro usuario se rechaza.
No hay unlink público todavía; no se inventan eventos de desvinculación.

La sesión opaca se rota al login; se conserva únicamente SHA-256 en PostgreSQL.
La sesión pre-OIDC se identifica desde el POST inicial y revoca después del callback
válido, incluso cuando SameSite=Strict impide que viaje su cookie al regresar de Google.
Cookies HttpOnly, SameSite=Strict, Secure en producción; duración 15 minutos–7 días,
12 horas por defecto. Logout revoca en BD. Contraseña de piloto permanece secundaria.

## COMMERCIAL_ENTITLEMENTS / PRODUCT_CATALOG

Catálogo versionado ProductOffer, semilla única en `server/commercial/catalog.ts`.
`starter_5_plans:v1`: PEN 9900 **candidato no aprobado**, cinco publicaciones,
10000 créditos, 1000 micro-USD por crédito, reserva máxima 2000 por plan.
Compra única, sin renovación ni vencimiento. $2 × 5 = $10 de capacidad máxima
de cómputo; no confundirlo con precio de venta, margen ni factura del proveedor.
No se ha validado rentabilidad, impuestos, comisiones ni conversión PEN/USD.

Purchase congela producto/precio/política/términos/privacidad. Entitlement congela
la política del paquete, Reservation la del job. Nuevas ofertas requieren otra
versión; no cambian compras anteriores. El catálogo no se altera desde el cliente.

## CREDIT_LEDGER

Cuatro autoridades distintas:

| Concepto | Autoridad | Productor → consumidor |
| --- | --- | --- |
| Pago | Purchase + PaymentEvent verificados | Adaptador MP → concesión/reversión |
| Cupos | CommercialEntitlement + ledger PLAN_SLOT | Pago verificado → enqueue/publicación/UI |
| Créditos | mismo account + ledger COMPUTE_CREDIT | Reserva → settlement/reconciliación |
| Costo plataforma | B4 BlueprintJobStage control:cost | proveedor/usage → circuito B4 + settlement |

No se cobra al cliente una factura supuesta. Los créditos se liquidan usando la
estimación B4 basada en usage reportado; importe efectivamente facturado permanece
desconocido. Se excluyen entradas de reintentos. Ausencia/indeterminación de usage
conserva créditos/cupo reservados en COST_PENDING, nunca se convierte en cero.

`enqueueBlueprintJobForUser` crea job, snapshot y reserva en UNA transacción.
Bloqueos de fila de User/entitlement serializan el último cupo entre proyectos;
unique jobId y operationKey evitan reservas/cargos duplicados. CHECKs impiden
saldos negativos y consumo por encima de lo concedido. Reintentar el mismo job
usa la misma reserva. Publicar una versión nueva necesita otro cupo.

Liquidación terminal comparte transacción con el estado del job. Éxito exige
BlueprintVersion y DOCX/PDF del mismo job/usuario: consume un cupo, redondea créditos
al entero superior y devuelve excedente reservado. Fallo de plataforma devuelve
reserva/cupo y cobra cero; mantiene íntegro costo B4. Recuperación de presentación
reutiliza reservation, con operación distinta por ciclo comercial (incluso si el
worker todavía no arrancó). Nunca resetea B4 ni permite reintentos ilimitados.
Cada nueva llamada comprueba entitlement activo y techo comercial congelado además
del techo B4. Jobs históricos pre-G4 conservan autorización histórica: no reciben
cupos gratuitos. No hay bypass HTTP para crear nuevos jobs sin reserva.

Ledger rechaza UPDATE y DELETE con triggers. Ajustes usan asientos nuevos; no existe
endpoint de ajuste administrativo. Pruebas limpian sólo sus usuarios mediante rol
DBA en BD aislada. El rol runtime de producción no debe tener superuser, DDL,
TRUNCATE ni permiso de desactivar triggers; separar del rol migrador antes de G5.

## PAYMENT_PROVIDER / MERCADO_PAGO_SANDBOX

`PaymentProvider`: createCheckout, retrieveOrder, verifyNotification. Implementación
`mercado-pago.ts`: Checkout Pro vía Orders, no mezcla Preferences con Orders.
POST /v1/orders usa X-Idempotency-Key = Purchase.id persistido; GET /users/me
confirma `test_user` y merchant configurado ANTES de crear checkout. Token prefix
no demuestra sandbox. `ORDTST` se conserva sólo como señal positiva opcional, no
como frontera de seguridad. El país del proveedor se normaliza mediante un mapa
explícito (`PE`/`PER` → `PE`); moneda PEN y `live_mode=true` se validan de forma
estricta. `checkout_url` debe usar HTTPS, host/path de allowlist exacta y el mismo
`order_id`.

`recoverMercadoPagoOrderForPurchase` cubre la respuesta perdida después de crear:
busca sólo por `external_reference` y una ventana de ±10 minutos, exige exactamente
una coincidencia, recupera esa Order por GET y valida merchant, application, importe,
moneda, país, estado, referencia y checkout. La persistencia `CHECKOUT_READY` y el
evento de auditoría son atómicos; cero o varias coincidencias no mutan nada. Una
Purchase con Order ya persistida se reutiliza sin otra operación de proveedor.

Webhook exacto `/api/payments/mercado-pago/webhook`: cuerpo acotado, tipo `order`,
HMAC-SHA256 con x-signature/x-request-id/data.id y ventana 10 minutos. Firma no
convierte el body en autoridad: GET /v1/orders/{id} valida merchant, application,
modo, moneda, total, total pagado y external_reference contra Purchase. Dedupe
del evento y concesión única por purchase. El GET del navegador sólo observa.

Estados creados/pendientes no conceden cupos; processed/accredited concede.
Refund/chargeback congela o revoca lo restante sin destruir auditoría ni documentos.
Uso/reserva previa → REVIEW_REQUIRED; reembolso parcial → revisión conservadora.
Un evento atrasado no degrada PAID a PENDING ni reabre una reversión terminal.
El manejo normalizado de chargeback está probado offline; la entrega real de eventos
de contracargo en Orders requiere aceptación específica de cuenta/proveedor.
No se emiten reembolsos ni cancelaciones monetarias desde la aplicación en G4.

## SECURITY_MODEL / COMMERCIAL_LAUNCH_GUARD

Solamente sandbox + cuenta de prueba + secretos completos + origen HTTPS habilitan
checkout. `productionApproved=false` y modo distinto de sandbox bloquean siempre;
no existe un switch suficiente para habilitar cobros reales en este gate.
Precio candidato se muestra como prueba. No hay tarjetas ni secretos en el cliente.
IDOR: cada consulta compra/proyecto/versión/artefacto filtra por usuario de sesión.
CSRF: mutaciones same-origin; sólo webhook exacto exento, con firma independiente.
Rate limits persistentes bajo bloqueo DB en login/OIDC/checkout/generación/webhook.
IP forwarded no confiable por defecto; sólo activar IMX_TRUST_PROXY_IP tras asegurar
que el proxy sustituye headers, no los añade a valores arbitrarios del cliente.

Inventario administrativo: CLI `admin:user` existente (operador local);
`/api/internal/blueprint-jobs/[jobId]/run-stage` exige bearer worker secret;
lab/legacy bloqueadas por proxy en producción. No nuevos roles ni admin web.
**ADMIN_MFA_PRODUCTION_BLOCKER=true**. Ajustes comerciales públicos deshabilitados.

Terms/privacy snapshot `pilot-sandbox-v1`: textos provisionales para prueba, no
condiciones comerciales/legalmente aprobadas. Consentimiento entrenamiento separado,
opcional, false por defecto y revocable; AuditLog conserva versión/cambio.
No concede derechos sobre PDFs de terceros. Training pipeline no implementado.

## Persistencia, privacidad y retención

| Entidad/campo | Productor | Consumidor | Retención |
| --- | --- | --- | --- |
| AuthIdentity | callback OIDC | login/link | Privada; mientras identidad vinculada |
| OidcTransaction | start | callback único | Privada; secretos borrados al consumir; expirada pendiente limpieza operativa |
| Purchase snapshot | checkout servidor | verificación/ledger/UI saneada | Auditoría privada; no borrar automáticamente |
| PaymentEvent | webhook/reconciliación | worker de reconciliación manual | Privada; ID/recurso/estado sin body ni tokens |
| CommercialReservation inputSnapshotId | enqueue | auditoría generación | Referencia estable, no duplica documentos |
| policy/operationKey/availableAfter | ledger | saldo/reconciliación/auditoría | Inmutables; private; no exponer costo al UI |
| User.trainingConsent | preferencia explícita | UI + futura autorización (no entrenamiento) | Mutable con historial AuditLog |
| AuditLog | auth/comercio | operación/seguridad | Sin tokens/códigos/nonce/secretos |

OidcTransaction expiradas y AuthThrottle antiguos: CLEANUP_CANDIDATE/MONITOR,
no eliminar auditoría financiera. Planes/artefactos previos no cambian.

## Fuentes oficiales consultadas

- [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect)
- [openid-client](https://github.com/panva/openid-client)
- [Crear order Checkout Pro](https://www.mercadopago.com.pe/developers/es/reference/online-payments/checkout-pro/create-order/post)
- [Notificaciones Orders](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro-orders/notifications?scope=prod)
- [Estados](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/payment-management/status/order-status)

Consultadas 2026-09-23. Validación de contrato documental y mocks no equivale a
aceptación Google/MP real. Véase [runbook](../runbooks/rc4-g4-commercial.md).
