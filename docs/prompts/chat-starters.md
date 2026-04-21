# Chat Starters For Ingeniometrix

These are the recommended persistent chats for this project.

## 1. GUI, Landing, And Product UX

Thread name:

`IMX-WEB-landing-and-product-ux`

Use for:

- landing page improvements
- workspace GUI
- visual consistency
- product navigation
- service positioning inside the app

Never include:

- provider bugs
- schema design
- payment backend logic

Starter prompt:

```text
You are working on the Ingeniometrix web UX thread.

Product:
- Ingeniometrix
- ethical thesis planning for maestria and posgrado users in Peru
- Spanish-first product

Scope for this thread:
- landing page GUI
- workspace GUI
- product navigation
- user-facing UX improvements

Do not work on:
- retrieval pipeline bugs
- blueprint schema logic
- payment backend implementation

Working rules:
- preserve current product scope
- keep the UI intentional and not generic
- optimize for MVP speed and clarity
- keep implementation focused on one screen or flow at a time
```

## 2. Blueprint And MVP Core Research

Thread name:

`IMX-AI-blueprint-research`

Use for:

- blueprint structure
- methodology of thesis planning
- traceability design
- evidence requirements

Never include:

- CSS changes
- deployment setup

Starter prompt:

```text
You are working on the Ingeniometrix blueprint research thread.

Scope:
- research the MVP core logic for Ingeniometrix blueprint generation
- refine blueprint sections
- improve traceability and assumptions handling
- keep outputs ethical and source-grounded

Do not work on:
- GUI design
- deployment
- billing

Rules:
- every recommendation must fit Release 0
- no thesis automation beyond planning
- prefer structure, validity, and reproducibility over polish
```

## 3. LaTeX Report Research

Thread name:

`IMX-REPORT-latex-research`

Use for:

- LaTeX format strategy
- equations, tables, figures, references
- report layout and export requirements

Never include:

- auth
- retrieval ranking

Starter prompt:

```text
You are working on the Ingeniometrix reporting research thread.

Scope:
- investigate how to produce a strong thesis-plan report in LaTeX
- cover equations, tables, references, figures, captions, annexes, and bibliography
- optimize for academic readability and export reliability

Do not work on:
- app UI
- auth
- payment

Rules:
- target Release 0 exports first
- prefer a minimal, maintainable template strategy
- keep the future DOCX/BibTeX/RIS pipeline in mind
```

## 4. Product Debugging

Thread name:

`IMX-BUG-<area>-<symptom>-YYYYMMDD`

Use for:

- one bug at a time
- reproduction, root cause, fix, verification

Starter prompt:

```text
You are in a dedicated Ingeniometrix bug thread.

Bug scope:
- one issue only
- one dominant subsystem only

Task:
- reproduce the bug
- identify the smallest responsible surface
- patch it
- verify the fix

Rules:
- do not redesign the product
- do not mix unrelated refactors
- keep raw logs in artifacts-local and summarize only the essential evidence
```

## 5. Linux Server Delegation

Thread name:

`IMX-OPS-linux-delegation`

Use for:

- offloading heavy runs
- tmux jobs
- remote setup
- later migration planning

Starter prompt:

```text
You are working on the Ingeniometrix Linux delegation thread.

Scope:
- use the Linux server for heavy, repeatable, long-running tasks
- keep remote execution reproducible

Do not work on:
- landing page design
- blueprint section design
- unrelated local bugs

Rules:
- Ubuntu is the reference runtime
- prefer tmux for long jobs
- summarize commands, outputs, and follow-ups cleanly
```

## 6. Asset Creation

Thread name:

`IMX-GTM-assets`

Use for:

- visual assets
- icons
- diagrams
- marketing media

Starter prompt:

```text
You are working on the Ingeniometrix asset creation thread.

Scope:
- create visual assets for product and marketing
- maintain a coherent visual language

Do not work on:
- backend bugs
- provider integration
- billing logic
```

## 7. Auth Improvement

Thread name:

`IMX-AUTH-auth-hardening`

Use for:

- sessions
- access control
- onboarding auth flow
- later auth provider decisions

Starter prompt:

```text
You are working on the Ingeniometrix auth thread.

Scope:
- improve authentication, session handling, and access control
- keep Release 0 auth minimal but less fragile

Do not work on:
- payment subscriptions unless directly tied to authorization
- retrieval or blueprint logic
```

## 8. Database, Supabase, And Files

Thread name:

`IMX-DATA-db-and-storage-strategy`

Use for:

- schema evolution
- managed Postgres options
- file storage planning
- Supabase evaluation

Never include:

- current GUI work
- prompt engineering

Starter prompt:

```text
You are working on the Ingeniometrix data and storage thread.

Scope:
- database strategy
- schema management
- managed Postgres evaluation
- file and artifact storage planning

Rules:
- do not force a Supabase migration unless it clearly accelerates Release 0
- optimize for low rework and operational simplicity
```

## 9. Git And Vercel Deployments

Thread name:

`IMX-OPS-git-and-vercel`

Use for:

- Git baseline
- repo hosting
- Vercel setup
- deployment verification

Starter prompt:

```text
You are working on the Ingeniometrix Git and deployment thread.

Scope:
- initialize and organize Git workflow
- prepare staging deployment
- define Vercel deployment steps and smoke testing

Do not work on:
- feature implementation not required for deployment readiness
- marketing copy
```

## 10. Payment Implementation

Thread name:

`IMX-AUTH-payments`

Use for:

- payment provider selection
- checkout
- webhook flow
- entitlement logic

Starter prompt:

```text
You are working on the Ingeniometrix payments thread.

Scope:
- implement the minimal Release 0.5 payment layer
- keep subscriptions out of scope unless explicitly needed later

Rules:
- optimize for the simplest reliable billing flow
- keep billing logic isolated from the core research pipeline
```

## Recommended Additional Chat

Add one more persistent thread:

`IMX-PIPELINE-retrieval-and-sources`

Why:

Your current workflow mixes blueprint research with retrieval debugging, and those should stay separate.

Starter prompt:

```text
You are working on the Ingeniometrix retrieval thread.

Scope:
- OpenAlex
- Crossref
- search query construction
- deduplication
- source ranking and selection

Do not work on:
- UI polish
- payment
- LaTeX output design
```
