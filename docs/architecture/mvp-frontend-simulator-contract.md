# MVP frontend simulator contract

Este documento captura el patrón observado en el Lab original y cómo se simula sin implementar frontend.

## Decisión

Para el MVP backend-only, el frontend se simula con programas CLI/harness que ejecutan el mismo orden de acciones que haría la UI, pero llamando servicios backend directamente. Esto permite validar contratos, estados y puntos de intervención humana antes de construir pantallas.

## Patrón observado en Lab original

El flujo de proyecto original funcionaba como una página única con paneles por etapa:

1. Render inicial de proyecto y estado.
2. Guardar intake con `PUT /api/projects/:id/intake`.
3. Buscar fuentes con `POST /api/projects/:id/search`.
4. Refrescar candidatos con `GET /api/projects/:id/references`.
5. Selección humana de fuentes en UI.
6. Persistir selección con `PUT /api/projects/:id/references`.
7. Generar blueprint con `POST /api/projects/:id/blueprints`.
8. Consultar progreso con `GET /api/projects/:id/blueprints/progress`.
9. Descargar exportables desde rutas de blueprint.

## Simulador actual

Programa:

```bash
npm run mvp:simulate:frontend
```

Modo automático para CI/local smoke test:

```bash
npm run mvp:simulate:frontend:auto
```

Secuencia simulada:

```text
GET status inicial
PUT intake
GET status
POST search/discovery
GET references
mostrar primeras 5 fuentes
[gate humano] seleccionar fuentes o pedir siguientes 5
mostrar siguientes 5 fuentes si el usuario lo pide
PUT references
GET status final
```

El simulador genera artefactos en:

```text
artifacts-local/mvp-frontend-sim/<run_id>/
```

Archivos:

- `frontend-sim-events.json`: eventos tipo endpoint con request/response conceptual.
- `frontend-sim-summary.json`: resumen final y próximo gate humano.

## Fixture activo de prueba

El simulador ahora usa por defecto el fixture aprobado por Pepe para ingeniería estructural:

```text
structural-warren-bridge-peru
```

Tema: puente vehicular esencial de armadura metálica tipo Warren en zona sísmica del Perú.

La validación automática puede confirmar wiring y persistencia, pero no reemplaza el gate humano de selección: si discovery trae fuentes metodológicas demasiado generales o alejadas del sistema estructural, no se debe avanzar a inspección/blueprint hasta ajustar query, scoring o selección manual.

## Gate humano

Cuando se ejecuta sin `--auto`, el simulador muestra primero solo 5 fuentes candidatas y pide una selección por índice:

```text
Selección de fuentes/lote 1: 1,2,4
```

Si el usuario no está conforme con las primeras 5, puede pedir el segundo lote:

```text
Selección de fuentes/lote 1: más
Selección de fuentes/lotes 1-2: 1,4,7
```

Enter acepta las sugeridas visibles por el backend. Esta es la primera intervención del usuario/product owner antes de inspección.

## Regla Deep Research

El simulador mantiene la regla corregida:

```text
Discovery normal → selección humana → inspección/source health → gaps post-inspección → Deep Research Light opcional.
```

Deep Research no se ejecuta por discovery débil ni antes de inspeccionar fuentes seleccionadas.

## Siguiente simulador esperado

Pass 3 debe agregar un segundo gate:

```text
fuentes seleccionadas → source health / inspección mínima → aceptar evidencia suficiente o pedir reparación
```

Ese gate debe producir un `EvidencePackage` mínimo antes del blueprint.


## Estrategia de keywords desde Lab original

El discovery MVP usa `server/retrieval/reference-search-v2.ts`, portado del Lab original. El archivo actual se verificó idéntico al Lab original.

La estrategia vigente usa LLM con fallback para producir:

- `keyword_groups.necessary`
- `keyword_groups.complementary`
- `keyword_groups.optional`
- `query_pack.necessary_only`
- `query_pack.complementary_boosted`
- `query_pack.optional_backups`

El simulador imprime esta metadata para revisar si el planner generó keywords útiles antes de aceptar fuentes.
