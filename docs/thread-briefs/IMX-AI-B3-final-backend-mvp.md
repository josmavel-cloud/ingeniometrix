# IMX-AI-B3 — Cierre backend cientifico

Baseline `96e6a513f648acc4f1375a995d9cc76991240886`, branch `mvp/backend-core-clean`.

Resultado: PASS_WITH_LIMITATIONS del backend; publicacion BLOCKED. Se agregaron generacion secuencial/ResearchDesign, matriz LLM estructurada editable, cobertura y expansion limitada, controles de assets, infografia/fallback y PDF canonico desde DOCX. B2 preservado; sin frontend/auth/migraciones/deployment.

Aceptacion nueva: ingenieria 11 evidencias utiles/113 anclas/16 paginas cuerpo; cualitativo 9/94/15 paginas, sin hipotesis forzadas; negativo sin generacion ni coste. Imagen de ingenieria rechazada por IDs internos y reemplazada por grafico determinista; cualitativo conserva imagen real. Assets inseguros excluidos, no retocados para aparentar calidad.

45 suites TypeScript + 3 tests Python; Prisma/typecheck/build PASS. Coste de todos los intentos US$2.4625946. Deep Research implementado/offline, NOT_RUN live. Revision cientifica realizada por Codex, no humana; decisiones del investigador pendientes.

Informe: `docs/quality/release0-backend-mvp-b3.md`. Evidencia/prompts/exports fuera de Git: `artifacts-local/release0-scientific-validation/b3/`. Finales: engineering-export y qualitative-delivery. No volver a evaluar outputs antiguos como nuevos runs ni confundir checkpoints con llamadas pagadas.

Siguiente fase unica: production hardening + integracion frontend/backend + E2E + deployment. Bloqueos principales: identidad insegura, artifacts privados en tracing, almacenamiento local/jobs no recuperables, rutas legacy, runtime productivo y adopcion de DB.
