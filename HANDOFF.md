# Ingeniometrix MVP Handoff

## Qué hace el producto

Ingeniometrix es un asistente académico ético para estudiantes de maestría o posgrado en Perú. Ayuda a convertir un intake estructurado en una propuesta académica trazable: busca fuentes, permite selección humana, prepara evidencia verificable, genera insumos de blueprint y produce salidas DOCX diagnósticas con reportes de calidad.

El producto no debe inventar citas, datos ni resultados. Toda afirmación relevante debe poder rastrearse a fuentes recuperadas y procesadas.

## Estado actual

El branch actual es:

`codex/lab-a-b-diagnostic-pipeline`

El estado es experimental/diagnóstico, no producción. Lab A y Lab B tienen un flujo local bastante avanzado:

- búsqueda de candidatos por intake;
- UI temporal de selección de fuentes;
- runner de fuentes seleccionadas para Lab A Steps 2-6;
- importación de PDFs proporcionados por usuario;
- clasificación de salud de fuentes;
- limpieza semántica de citas;
- presupuesto de evidencia reducido;
- telemetry/costos/runtime;
- compuertas de producción;
- Method Selection Layer read-only;
- Lab B diagnostic DOCX runner;
- controles de contaminación/stale content;
- fallback rápido de Deep Research como discovery-only, no citable;
- plan accionable de brechas de evidencia.

## Qué funciona

- `npx tsc --noEmit --pretty false` pasa.
- La búsqueda de candidatos funciona con OpenAlex/Crossref y planner LLM cuando hay API key.
- El UI lab de selección puede cargar candidate runs y guardar `source-selection.json`.
- Lab A puede correr hasta Step 4C y bloquear correctamente si la evidencia es insuficiente.
- Los runs generan reportes como `run-summary.json`, `quality-dashboard.json`, `production-readiness-report.md`, `evidence-gap-action-plan.json` y `.md`.
- El fallback de Deep Research queda separado: solo propone candidatos, exige selección humana y Evidence Engine antes de citar.
- Lab B puede generar outputs diagnósticos y DOCX cuando recibe un handoff compatible.

## Qué falta

- Mejorar filtrado semántico de referencias secundarias antes de enviarlas al UI.
- Fortalecer búsqueda de fuentes nucleares/directas para nuevos intakes.
- Integrar flujo de PDFs proporcionados por usuario en una UI real.
- Consolidar scripts diagnósticos antes de producción.
- Decidir qué artefactos locales se preservan como fixtures y cuáles se ignoran siempre.
- Terminar limpieza de código y organización de scripts.
- Conectar Neon/Vercel/cloud worker solo después de estabilizar el pipeline local.

## Cómo correr localmente

Instalar dependencias:

```bash
npm install
```

Verificar TypeScript:

```bash
npx tsc --noEmit --pretty false
```

Levantar app local:

```bash
npm run dev
```

Abrir selección de fuentes:

```text
http://localhost:3000/lab/evidence-source-selection
```

Si el puerto 3000 está ocupado, Next puede usar otro puerto, por ejemplo:

```text
http://localhost:3001/lab/evidence-source-selection
```

Ejecutar búsqueda de candidatos:

```bash
npx tsx scripts/run-evidence-candidate-search.ts --case case-003-medicine-public-health --expand --max-candidates 15
```

Ejecutar Lab A con fuentes seleccionadas:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case case-003-medicine-public-health
```

## Variables de entorno necesarias

Mínimo para búsqueda determinística/parcial:

```text
OPENAI_API_KEY=
```

Recomendadas para flujos LLM:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_DEEP_RESEARCH_MODEL=o4-mini-deep-research
OPENAI_IMAGE_MODEL=gpt-image-2
```

No commitear `.env`. Usar `.env.example` solo con placeholders.

## Bugs conocidos

- Algunas fuentes con PDF público fallan por 403, Cloudflare, CAPTCHA o bloqueo editorial.
- La cola de referencias secundarias puede traer candidatos demasiado generales.
- Hay riesgo de candidatos "background only" si solo comparten vocabulario amplio de salud pública.
- Los artifacts locales no viajan con Git; otro agente debe regenerarlos o pedirlos aparte si son necesarios.
- Existe un cambio local sin commitear en `backups/pre-integration-2026-05-03-1415/...`; no debe considerarse runtime.
- El producto aún no es producción-eligible con handoffs degradados o evidencia insuficiente.

## Prioridad para lanzar el MVP

1. Cerrar filtrado de fuentes nucleares/directas y referencias secundarias.
2. Asegurar que el usuario pueda subir/asociar PDFs manualmente sin tocar DB todavía.
3. Mantener compuertas de producción estrictas.
4. Reducir y organizar scripts diagnósticos sin romper trazabilidad.
5. Probar un intake nuevo de punta a punta con fuentes suficientes.
6. Solo después, preparar integración frontend estable, persistencia y despliegue.
