# Secure Pilot Release Assembly

Fecha: 2026-09-19

## Estado

- `SECURITY_STATUS = PASS`
- `INTEGRATION_STATUS = PASS`
- `RECOVERABILITY_STATUS = PASS`
- `DEPLOYMENT_STATUS = NOT_DEPLOYED_EXTERNAL_PREREQUISITE`

El paquete de release fue construido y validado en contenedores Linux locales. No se publico una URL: el entorno solo expone el Docker local y no hay un host Linux remoto autorizado con almacenamiento persistente, TLS y secretos de piloto. Esto impide declarar un despliegue externo probado, no impide entregar el candidato reproducible.

## Composicion verificada

- Branch: `release/secure-pilot`.
- Baseline requerido y ancestro: `341a524bac2e1e370316ceff5ca57ad073d216ab`.
- Motor cientifico y cierre visual: `be9c72bf849496721741c987aa90d1a914d82315`.
- Frontend aprobado, obtenido de `origin/codex/stable-release0-blueprint-flow`: `7f6b615ea8b57c661f5d55cdf94f12152d195aa4`.
- El commit final es el commit de merge de esta rama que contiene este informe; consultarlo con `git rev-parse HEAD`.
- El worktree fuente `ingeniometrix-wt-mvp-backend-core` permanecio sin modificaciones.

No se cambiaron prompts cientificos. Deep Research queda desactivado en el piloto mediante `IMX_ENABLE_DEEP_RESEARCH=0`.

## Forma desplegable

Se preserva una sola aplicacion Next.js con cuatro roles de ejecucion:

1. `app`: Next.js HTTP;
2. `worker`: consumidor persistente de jobs del motor canonico Step 5/Step 6;
3. `migrate`: tarea Prisma de una sola ejecucion;
4. `db`: PostgreSQL 16.

La imagen incluye Node.js 20.20.2, LibreOffice Writer 7.4.7.2, Poppler 22.12.0, Python 3 y PyMuPDF 1.26.4. El runtime no incluye el repositorio Git, documentos internos, fuentes del servidor, dumps privados ni `artifacts-local` del desarrollador.

## Controles de seguridad implementados

- Login solo con credencial verificada: scrypt con salt aleatorio y comparacion de tiempo constante.
- Sesion opaca aleatoria de 256 bits; solo el SHA-256 se persiste.
- Cookie `HttpOnly`, `SameSite=Strict`, `Secure` en produccion y expiracion por defecto de 12 horas.
- Logout con revocacion persistente; una cookie copiada deja de funcionar.
- Limite persistente de cinco fallos por correo/IP en 15 minutos, con bloqueo de 15 minutos.
- Proteccion de mutaciones por `Origin` exacto contra `APP_ORIGIN` y comprobacion de `Sec-Fetch-Site`.
- API interna del worker protegida por bearer secret y comparacion de tiempo constante.
- Toda lectura, mutacion, generacion y descarga resuelve `userId + projectId`; los artefactos incluyen propietario y version.
- Rutas `/lab`, `/preview`, `/blueprint-launch` y sus APIs responden 404 en produccion.
- CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options` y politica de referente.
- No se despacha el worker hacia un host derivado de la peticion; se elimina el riesgo de enviar el secreto interno a un `Host` controlado.

## Jobs, reinicios y almacenamiento

`POST /api/projects/:id/blueprints` solo encola. Un proceso independiente reclama el job en PostgreSQL. Las etapas persistidas son:

1. `materializing_evidence`;
2. `generating_plan`;
3. `persisting_artifacts`;
4. `completed`.

Se conservan propietario, progreso, etapa, intentos, proxima ejecucion, lock, heartbeat, error y referencias de salida. Los locks vencidos se recuperan; hay tres intentos por defecto con backoff acotado. El heartbeat evita que dos workers reclamen una etapa larga. Las salidas completadas se recuperan por `projectId + runId + step`, y los cinco artefactos finales se escriben con upsert idempotente.

DOCX, PDF, BibTeX, RIS y evidence log quedan en `GeneratedArtifact.content` dentro de PostgreSQL, con SHA-256, tamano, MIME, propietario, proyecto, version y job. El volumen privado compartido conserva archivos intermedios. Una descarga completada no depende del navegador ni del path local original.

## Migraciones

Historia real validada:

1. `20260918000000_baseline`;
2. `20260919000000_secure_pilot` (aditiva).

La migracion nueva agrega password hash, sesiones, control de abuso, jobs, etapas y artefactos. No elimina ni reescribe datos existentes.

Pruebas realizadas:

- base PostgreSQL vacia: ambas migraciones aplicadas;
- adopcion de una copia aislada que ya coincidia con baseline: `migrate resolve` solo para el baseline verificado, seguida por la migracion aditiva;
- arranque Compose desde volumen nuevo: ambas migraciones y servicios completaron correctamente.

No se uso `db push` ni se toco una base compartida o de produccion.

## Validacion ejecutada

- 47/47 scripts `test:*`: PASS.
- Prisma validate: PASS.
- TypeScript: PASS.
- Next.js production build: PASS; 19 paginas estaticas y rutas dinamicas construidas.
- Suite cientifica B2: PASS.
- Contratos y export B3: PASS.
- Entregables visuales, incluida matriz visual antes de tabla editable: PASS.
- Build de la imagen final: PASS.
- Arranque exacto de `docker-compose.release.yml`: PASS (`db`, `migrate`, `app`, `worker`).
- Runtime de app y worker dentro de la imagen reducida: PASS.
- Provision de usuario usando la imagen `migration`: PASS.

E2E autenticado en imagen final:

`login -> project -> intake -> evidence fixture -> human selection -> generation job -> result -> authorized DOCX/PDF download -> logout`: PASS.

Pruebas negativas:

- usuario B no puede leer, mutar, generar ni descargar datos de usuario A: PASS;
- mutacion cross-origin: 403;
- rutas legacy/lab en produccion: 404;
- sesion usada despues de logout: rechazada;
- lock abandonado por reinicio: recuperado;
- reintento sobre salida completada: no duplica generacion ni artefactos;
- eliminacion del archivo local: artefacto final aun descargable desde PostgreSQL;
- proveedor no disponible: exactamente tres intentos y estado terminal `FAILED`;
- desconexion del navegador: el job persiste y el worker es independiente.

El E2E usa evidencia sintetica no privada y un ejecutor offline para comprobar seguridad, contratos y persistencia sin gasto de API. No se presenta como una nueva aceptacion cientifica pagada; esa garantia proviene de las suites B2/B3 conservadas.

## Dependencias y exposicion

`npm audit` del checkout informa tres avisos altos por `deepmerge-ts` transitivo del CLI de Prisma (GHSA-ggr8-5vv4-36mx) y uno bajo de esbuild para servidor de desarrollo en Windows. Los modulos `prisma`, `@prisma/config`, `@prisma/engines`, `deepmerge-ts`, `esbuild`, `tsx` y `typescript` fueron eliminados de la imagen runtime y se verifico su ausencia. El CLI Prisma permanece solo en la imagen controlada y efimera de migracion, con repositorio/configuracion de confianza; no recibe objetos de merge suministrados por usuarios. Una actualizacion incompatible o downgrade forzado no se incluyo en este ensamblaje.

## Operacion

Variables obligatorias, comandos exactos, adopcion de bases existentes, backup, recuperacion y rollback estan en [deployment.md](../runbooks/deployment.md).

Inicio:

```bash
docker compose --env-file .env.release -f docker-compose.release.yml build
docker compose --env-file .env.release -f docker-compose.release.yml up -d db
docker compose --env-file .env.release -f docker-compose.release.yml run --rm migrate
docker compose --env-file .env.release -f docker-compose.release.yml up -d app worker
docker compose --env-file .env.release -f docker-compose.release.yml ps
```

Variables obligatorias: `POSTGRES_PASSWORD`, `BLUEPRINT_WORKER_SECRET`, `APP_ORIGIN`, `OPENAI_API_KEY`, `CROSSREF_MAILTO`. Para el piloto deben permanecer `IMX_AUTHLESS_WORKSPACE=0` e `IMX_ENABLE_DEEP_RESEARCH=0`.

## Prerrequisito externo pendiente

Asignar un host Linux/Docker autorizado y privado, un dominio/TLS, valores secretos inyectados fuera de Git y almacenamiento persistente con destino de backups. En ese host se debe ejecutar el runbook, restaurar o adoptar una copia de la base siguiendo la comprobacion de schema, hacer el E2E de staging y solo entonces entregar una URL protegida. Vercel por si solo no cubre LibreOffice, Poppler, el worker persistente ni el volumen requerido por este release.
