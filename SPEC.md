# Ingeniometrix MVP Spec

Version: 1.0
Date: 2026-04-18
Status: Ready for Code Mode

## 1. Product Definition

Ingeniometrix ships one product in this phase:

`Ingeniometrix`

It transforms:

`tema + restricciones academicas + fuentes seleccionadas`

into:

`un plan o proyecto de tesis de maestria o posgrado, revisable, trazable y exportable`

## 2. Locked Product Scope

### Target User

- country: Peru
- language: Spanish only
- user: estudiante o profesional de maestria o posgrado
- use case: plan o proyecto de tesis listo para revision del asesor

### Core Flow

1. cuenta
2. proyecto
3. intake estructurado
4. busqueda bibliografica
5. seleccion de fuentes
6. blueprint validado
7. export

### Initial Templates

- `UPC_POSGRADO`
- `UCV_POSGRADO`
- `USMP_POSGRADO`
- `GENERIC_POSGRADO_PE`

### Release 0 Sources

- OpenAlex
- Crossref

### Release 0 Exports

- DOCX
- BibTeX
- RIS
- evidence_log.json

## 3. Non-Negotiables

- no inventar citas
- no inventar datos
- no inventar resultados
- trazabilidad total a fuentes recuperadas
- assumptions explicitas cuando falte informacion
- nada de fraude academico
- no prometer tesis completa

## 4. Release Plan

### Release 0

Technical MVP that demonstrates:

- auth minima
- dashboard basico
- project workspace
- structured intake
- search with OpenAlex
- metadata enrichment with Crossref
- deduplication
- manual source selection
- blueprint generation with strict schema
- coherence report
- assumptions
- version history
- export package
- audit trail

### Release 0.5

Minimal monetization layer:

- simple landing page
- one-time payment flow
- payment webhook
- delivery email
- commercial project state

### Release 1

Post-validation expansion:

- subscriptions
- revisions
- PDF export
- more providers
- stronger commercial flows
- hosted managed services if justified

## 5. Explicitly Out of Scope for Release 0

- copiloto del asesor
- white-label
- institucional
- PDF parsing
- OCR
- plagiarism checking
- bajar similitud
- Semantic Scholar
- CORE
- multilenguaje
- in-app payments
- section-level regeneration

## 6. Architecture Decisions Locked Now

- app: Next.js + TypeScript
- backend runtime: Node.js
- database: PostgreSQL
- ORM: Prisma
- local service orchestration: Docker Compose
- automation: Python + shell
- local development reference machine: Ubuntu 24.04
- compatibility target: Ubuntu + WSL

### Local Infrastructure Rule

Release 0 starts with:

- Postgres in Docker Compose
- app and scripts on host

Not used yet:

- local Supabase stack
- Redis
- Kubernetes
- Nginx
- Caddy

## 7. Provider Abstraction Rule

The MVP must not hard-couple business logic to a single LLM vendor.

The codebase should include a minimal provider abstraction from the start:

- `generateStructuredObject`
- `generateText`

Release 0 only needs one concrete provider implementation.

## 8. Required Artifacts for Traceability

The system must persist or generate enough data to reconstruct how an output was produced:

- intake snapshot
- candidate references
- selected references
- blueprint JSON
- coherence report
- evidence log
- provider and model metadata
- audit events

## 9. Project States

- `draft`
- `intake_ready`
- `searching`
- `sources_review`
- `sources_selected`
- `blueprint_generating`
- `blueprint_ready`
- `export_ready`
- `archived`

## 10. Repo Requirements

The repo must include:

- `bootstrap.sh`
- `setup-dev.sh`
- `compose.yml`
- `.env.example`
- `README.md`
- `AGENTS.md`

The repo must remain:

- simple
- reproducible
- Linux-first
- portable to a dedicated server later
- safe for a solo founder

## 11. Definition of Done for Release 0

Release 0 is complete when:

1. the repo boots cleanly on Ubuntu and WSL
2. Postgres runs via Docker Compose
3. the app can be developed on host against local Postgres
4. all product decisions are documented
5. scope boundaries are explicit
6. the implementation path is clear and low-rework
