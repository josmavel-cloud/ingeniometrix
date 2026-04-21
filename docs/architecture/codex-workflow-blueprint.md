# Codex Workflow Blueprint

## Goal

Use Codex with less context bloat, lower token spend, and cleaner parallel execution while building Ingeniometrix.

## Stable Thread Families

- `IMX-ARCH-*`: architecture, repo structure, ADRs, operating rules
- `IMX-WEB-*`: workspace UI and product flows
- `IMX-PIPELINE-*`: OpenAlex, Crossref, deduplication, source selection
- `IMX-AI-*`: prompts, schemas, blueprint generation, coherence validation
- `IMX-REPORT-*`: LaTeX and export pipeline
- `IMX-AUTH-*`: auth, billing, access control
- `IMX-GTM-*`: landing page, copy, assets, acquisition surfaces

## Temporary Thread Types

- `IMX-BUG-<area>-<symptom>-YYYYMMDD`
- `IMX-FEAT-<area>-<scope>-YYYYMMDD`
- `IMX-EXP-<question>-YYYYMMDD`

## What Belongs In Each Thread

Architecture threads:

- ADRs
- repo boundaries
- folder structure
- workflow rules

Never include:

- bug triage
- UI copy tweaks
- long raw logs

Bug threads:

- one reproducible issue
- one suspected subsystem
- one exit criterion

Never include:

- product roadmap discussion
- unrelated refactors
- marketing tasks

Feature threads:

- one feature or one vertical slice
- code changes
- verification

Never include:

- broad design exploration after implementation starts
- separate bug hunts

## Worktree Plan

When Git is available, use:

- `wt-web-workspace`
- `wt-retrieval`
- `wt-blueprint`
- `wt-reporting-latex`
- `wt-auth-billing`
- `wt-marketing`
- `wt-data-catalogs`
- `wt-debug-<bugid>`

## Artifact Policy

- temporary logs and workflow dumps go to `artifacts-local/`
- durable design documents go to `docs/`
- do not treat debug dumps as architecture documentation

## High-Value Context Files

Use these as reusable anchors instead of re-pasting context into prompts:

- `AGENTS.md`
- `SPEC.md`
- `docs/runbooks/debugging.md`
- `docs/runbooks/worktrees.md`
- `docs/thread-briefs/_template.md`

## Repo Direction

Keep one repo for Release 0, but operate it as if it had clean internal boundaries:

- routes in `app/`
- UI in `components/`
- backend orchestration in `server/`
- catalogs and durable helpers in `lib/`
- providers in `llm/`
- schemas in `ai/schemas/`
- scripts in `scripts/`
