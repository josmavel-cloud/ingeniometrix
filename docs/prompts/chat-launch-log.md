# Chat Launch Log

This file records the first kickoff result for each recommended Ingeniometrix chat.

Note:

- the chats were launched in two batches because the current app allows up to 6 active agents at the same time
- these are short starting notes, not final decisions

## IMX-WEB-landing-and-product-ux

- landing CTA is too far from the real first action
- `/projects/new` feels too much like a catalog explainer
- `/projects/[id]` shows too many competing modules at once
- first improvement sequence: clarify CTA, simplify new project flow, refocus workspace around one next action

## IMX-AI-blueprint-research

- the enforced Release 0 blueprint core is smaller than the current wide schema
- the stable minimum should center on research problem, objectives, methodology, analysis, consistency matrix, assumptions, and references used
- next move: align schema, prompt, and validator to the same traceable core contract

## IMX-REPORT-latex-research

- LaTeX work should start as a minimal thesis-plan template architecture
- the highest export risks are citations, figures/tables, annex numbering, and equation formatting
- keep Release 0 reporting narrow and avoid brittle template logic

## IMX-OPS-linux-delegation

- Linux is justified for repeatable long-running jobs, validation runs, exports, and tmux-based execution
- do not move UI work or one-off local debugging there
- first safe delegation path: small repeatable command set, tmux execution, explicit env vars, reproducible artifact capture

## IMX-GTM-assets

- current visual language is already defined enough to avoid a rebrand
- Release 0 assets should prioritize hero artwork, a small coherent icon set, reusable section backgrounds, and trust badges
- campaign-heavy assets should wait

## IMX-AUTH-auth-hardening

- current session flow is simple but fragile because the cookie is not signed or tokenized
- the minimum hardening path is to verify session payloads, reject invalid or expired payloads, and normalize auth failure handling
- keep the UX unchanged while hardening internals

## IMX-DATA-db-and-storage-strategy

- local Postgres plus local artifact handling is still the right choice for Release 0
- managed Postgres is justified later, likely near deployment testing or Release 0.5
- managed file storage should wait unless remote serving becomes necessary

## IMX-OPS-git-and-vercel

- the repo is now initialized with Git but still has no commit and no remote
- the shortest path is: confirm file set, create one clean root commit, add remote, push `main`
- only after that should staging on Vercel begin

## IMX-AUTH-payments

- payments should stay Release 0.5
- the right architecture is a thin payment boundary with checkout, webhook handling, and a local payment state record
- avoid subscriptions and advanced billing concerns for now

## IMX-PIPELINE-retrieval-and-sources

- the weakest precision point is the broad search layer and fragile title-plus-year dedup fallback
- the next bounded improvement is a scored candidate funnel before persistence
- rank candidates by title overlap, DOI presence, recency, and provenance quality

## IMX-BUG-debug-playbook

- debugging should stay one bug per thread
- future bug threads should start with layer classification, reproduction path, minimum evidence, and a fixed naming rule
- raw logs belong in `artifacts-local/`, while the chat should hold only the smallest reproducible evidence
