# AGENTS.md

STATUS: CURRENT - Release 0 secure pilot handoff.

This file is for future Codex/agent sessions. Keep it operational and short.
For the current state, read [CURRENT_STATE.md](CURRENT_STATE.md) first.

## Source Of Truth

- Canonical release branch: `release/secure-pilot`
- Canonical release commit: `5442a9ba29abed0aabaa4b882e4ca5a0ca057760`
- Release worktree: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-release0`
- Active backend development lineage: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core` on `mvp/backend-core-clean`
- Historical reference only: `/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint`

Do not resume MVP development from the historical `master-blueprint` workspace.

## Before Any Work

1. Read `CURRENT_STATE.md`.
2. Read the relevant architecture document in `docs/architecture/`.
3. Confirm path, branch and HEAD.
4. Inspect `git status --short --branch`.
5. Plan before modifying code.

## Non-Negotiable Rules

- Product name: `Ingeniometrix`.
- Spanish is the Release 0 user-facing language.
- Do not add intake-specific production logic.
- Do not hardcode important prompts into services; use versioned prompt files.
- Scientific claims require inspectable evidence.
- A DOI or metadata record alone is not substantive evidence.
- Deep Research remains disabled in Release 0 until separately validated.
- Prefer deterministic logic when facts can be checked without an LLM.
- Frontend terminology must not expose backend internals, run IDs, prompt names, model names or artifact paths.
- Private artifacts must remain private and owner-scoped.
- User/project ownership must be enforced for reads, writes, generation and downloads.
- Database fields and artifacts should have known producers and consumers.
- Avoid resurrecting legacy/lab pipelines accidentally.
- Never invent citations, data, findings, ethics approvals, instruments or access to participants/data.

## Canonical Docs

- Current state: `CURRENT_STATE.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Evidence engine: `docs/architecture/EVIDENCE_ENGINE.md`
- Data/artifacts: `docs/architecture/DATA_MODEL_AND_ARTIFACTS.md`
- LLM/prompts: `docs/architecture/LLM_AND_PROMPT_REGISTRY.md`
- Repo/release map: `docs/architecture/REPOSITORY_AND_RELEASE_MAP.md`
- Future work: `docs/development/FUTURE_DEVELOPMENT.md`
- Deployment: `docs/runbooks/deployment.md`

## Test Requirements

For documentation-only changes, run lightweight checks proportional to the change.

For release/runtime changes, the secure pilot baseline used:

```bash
npm run prisma:validate
npm run typecheck
npm run build
npm run test:secure-pilot
```

The secure pilot report records the broader validation: all `test:*` scripts, B2/B3 scientific and visual suites, container build, Compose startup and isolated E2E.

## Deployment

Use `docs/runbooks/deployment.md`. Keep `IMX_AUTHLESS_WORKSPACE=0` and `IMX_ENABLE_DEEP_RESEARCH=0` for the pilot. Do not push, deploy or mutate production data unless the user explicitly authorizes that task.
