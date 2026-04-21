# AGENTS.md

## Mission

Build Ingeniometrix as a focused, ethical MVP for academic research assistance in Peru.

The product name to use in the app, prompts, and user-facing materials is:

`Ingeniometrix`

The current goal is:

`ship Release 0 fast, with minimal rework, full traceability, and no scope creep`

## Canonical Workflow Sources

Use these files in this order when working inside Codex:

1. `AGENTS.md`
2. `docs/architecture/codex-workflow-blueprint.md`
3. `docs/runbooks/debugging.md`
4. `docs/runbooks/worktrees.md`
5. `docs/thread-briefs/`
6. `docs/adr/`

If guidance conflicts, this file wins.

## Locked Product Decisions

- single product: Ingeniometrix
- initial user: maestria or posgrado student or professional in Peru
- initial templates: UPC, UCV, USMP
- language: Spanish only
- intake: structured text only
- initial providers: OpenAlex + Crossref
- initial exports: DOCX + BibTeX + RIS + evidence_log.json

## Non-Negotiables

- never invent citations
- never invent data
- never invent results
- every meaningful output must be traceable to recovered sources
- missing information must be declared in assumptions
- do not build features that enable academic fraud
- do not reposition the product as a thesis generator

## Preferred Stack

- frontend: Next.js + React + TypeScript
- backend: Node.js
- database: PostgreSQL
- ORM: Prisma
- local orchestration: Docker Compose
- automation: Python + shell
- local development target: Ubuntu 24.04 and WSL

## Coding Rules

- prefer ASCII in source and docs unless there is a strong reason not to
- keep modules small and obvious
- favor explicitness over indirection
- avoid premature abstractions
- do not introduce services that are not needed for Release 0
- keep business logic out of framework glue when possible
- every external provider integration should sit behind a small local interface

## Deployment Convention

- Ubuntu laptop is the reference execution machine
- Windows is control; WSL is compatibility and local Linux fallback
- app runs on host
- Postgres runs in Docker Compose
- long-running operations run in tmux
- repeatable scheduled tasks should later move into systemd timers

## Secret Handling

- never commit secrets
- keep secrets in local `.env`
- keep placeholders only in `.env.example`
- production or shared secrets must be injected outside the repo

## Automation Limits

- do not automate thesis completion
- do not automate plagiarism evasion
- do not add OCR, PDF ingestion, or unsupported providers in Release 0
- do not add subscriptions, upsells, or advanced monetization in Release 0

## Scope Guardrails

If a change does not directly improve one of these, defer it:

- reproducibility
- Release 0 delivery speed
- source traceability
- schema validity
- export reliability

Move to later releases anything that mainly improves:

- polish
- marketing sophistication
- enterprise readiness
- advanced infra
- speculative growth features

## Release Boundaries

### Release 0

- auth minima
- project workspace
- structured intake
- OpenAlex search
- Crossref enrichment
- source selection
- blueprint generation
- coherence report
- exports
- audit trail

### Release 0.5

- simple landing
- payment flow
- delivery email

### Release 1

- subscriptions
- revisions
- more providers
- PDF
- bigger commercial and institutional features

## Codex Thread Rules

Permanent thread families:

- `IMX-ARCH-*`: architecture, repo structure, ADRs, operating rules
- `IMX-WEB-*`: workspace UI, forms, navigation, UX polish
- `IMX-PIPELINE-*`: retrieval, providers, deduplication, source selection
- `IMX-AI-*`: prompts, schemas, blueprint generation, validation
- `IMX-REPORT-*`: LaTeX, DOCX, RIS, BibTeX, evidence log, export packaging
- `IMX-AUTH-*`: auth, access control, sessions, billing hooks
- `IMX-GTM-*`: landing, copy, marketing assets

Temporary thread prefixes:

- `IMX-BUG-*`
- `IMX-FEAT-*`
- `IMX-EXP-*`

Thread hygiene:

- each thread should have one dominant subsystem
- debugging does not belong in architecture threads
- marketing does not belong in retrieval or AI threads
- research spikes do not belong in implementation threads once the answer is known
- when a thread is complete, summarize the result into `docs/thread-briefs/`

## Worktree Rules

When Git is available, use separate worktrees for:

- web workspace
- retrieval pipeline
- blueprint and schema work
- reporting and export work
- auth and billing
- marketing
- bug isolation

Do not mix unrelated feature work inside the same worktree.

## Debugging Rules

- every non-trivial bug gets its own `IMX-BUG-*` thread
- reproduce first, then inspect, then patch, then verify
- do not debug from the same thread used for product planning
- keep large logs out of chat; store them in `artifacts-local/`
- convert stable reproductions into tests or minimal fixtures as soon as possible

## Artifact Policy

- write temporary debug outputs to `artifacts-local/`
- keep committed `artifacts/` minimal and intentional
- do not rely on old debug dumps as long-term product documentation

## Documentation Policy

- durable technical decisions go into `docs/adr/`
- run procedures go into `docs/runbooks/`
- thread summaries go into `docs/thread-briefs/`
- day-to-day operating checklists go into `docs/checklists/`

## Current Architecture Direction

Keep one repo for Release 0.

Target internal separation:

- app shell and routes in `app/`
- UI components in `components/`
- durable domain helpers and data catalogs in `lib/`
- backend orchestration in `server/`
- provider abstraction in `llm/`
- schemas in `ai/schemas/`
- local scripts in `scripts/`

Do not force a monorepo split before the current MVP boundaries are stable.
