# B4: operacion segura y recuperacion

Ver [invariantes y politica](../architecture/COST_AND_RECOVERY_B4.md).
Este candidato no esta instalado en el stack manual RC2.

## Incidente preservado

Worker `imx-rc2-manual-worker-1`: ya detenido al iniciar B4; finalizo
2026-09-21T14:01:58.017103582Z. No se paro ningun otro servicio ni se reinicio
el worker. App/DB del stack manual siguen intactos. No reanudar el job
`b711099f-7a75-4097-9a0f-f3acfc0b9bf4`. El projectId correcto comienza
`20d20b7b`, no `20d20b7`.

Si se detecta una nueva fuga, identificar primero el stack/job propietario;
detener SOLO su worker local y conservar DB, app y volumen. No ejecutar
`down -v`, borrar reservas, poner `attempts=0` ni pulsar generar repetidamente.

## Leer antes de autorizar recuperacion

1. Leer `BlueprintJob`: propietario, status, intentos/max, lease y errorJson.
2. Leer `BlueprintJobStage` del mismo job: `control:cost`, checkpoints y hashes.
3. Separar fallo cientifico, proveedor, coste, presentacion e infraestructura.
4. Verificar que el fingerprint corresponde al intake/seleccion vigentes.
5. Conciliar las llamadas sin usage; su reserva sigue comprometida.
6. Una recuperacion autorizada debe conservar libro, intentos y checkpoints.

`/resume` no ejecuta generacion ni revive terminales salvo un fallo
`PRESENTATION` con el conjunto completo de checkpoints B4. En ese caso agenda
una recuperacion `PRESENTATION_ONLY`: conserva intentos/coste y el contexto
rechaza cualquier reserva pagada; solo recompone/publica DOCX/PDF. No existe todavia una
interfaz administrativa para ampliar presupuesto: ese estado requiere una
intervencion explicitamente autorizada, auditada y revisada. No se proporciona
un SQL generico que borre los limites. Jobs anteriores a B4 requieren conciliar
su telemetria historica antes de cualquier adopcion; nunca empezar de cero.

## Validacion aislada

La tarea creo `imx-b4-validation-20260921`, PostgreSQL 16, DB
`imx_b4_validation`, puerto loopback 55437. Solo fixtures, sin datos del incidente.
Auth trust es exclusivamente local de pruebas; no es configuracion de piloto.
Se aplicaron las dos migraciones existentes a esa base nueva, no a la manual.
Al terminar se detuvo SOLO ese contenedor de pruebas B4, sin eliminarlo ni
borrar su volumen. Para repetir pruebas: `docker start imx-b4-validation-20260921`.

Con DATABASE_URL y DATABASE_URL_UNPOOLED apuntando a ESA base y sin claves API:

```bash
npm run test:b4-resilience
npm run test:secure-pilot
npm run prisma:validate
npm run typecheck
npm run build
npm run build:release-worker
```

La prueba B4 exige por nombre una DB dedicada. Los tests borran sus usuarios
y proyectos sinteticos, no bases/volumenes. Los artefactos de regresion quedan
en `/tmp/imx-b4-*` y `artifacts-local/b3-offline/`, fuera de Git.

Antes de promover: una aceptacion real NUEVA con gasto total maximo USD 2.50,
sin reanudar el incidente, debe comprobar calidad cientifica, coste real,
presentacion y terminacion. Aun no realizada; no declarar B4 desplegado ni
equivalencia cientifica de sus nuevos limites basandose solo en mocks.
