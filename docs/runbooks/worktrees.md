# Worktrees Runbook

## Status

Create worktrees only after the first baseline commit exists and the primary branch has been pushed.

## Standard Worktrees

- `wt-web-workspace`
- `wt-retrieval`
- `wt-blueprint`
- `wt-reporting-latex`
- `wt-auth-billing`
- `wt-marketing`
- `wt-data-catalogs`
- `wt-debug-<bugid>`

## Create A Worktree When

- the task will run longer than half a day
- the task touches a high-risk subsystem
- two threads need to move in parallel
- a bug needs isolated reproduction
- prompt/schema work should not be mixed with UI or DB changes

## Close A Worktree When

- the feature or bug is merged
- verification is complete
- the thread summary was written into `docs/thread-briefs/`

## Example Commands

```bash
git init
git checkout -b main
git worktree add ../wt-blueprint -b feat/blueprint-reset
git worktree add ../wt-debug-retrieval-null-title -b bug/retrieval-null-title
```

## Boundary Rules

`wt-blueprint`:

- prompts
- schemas
- blueprint generation
- coherence validation

Never include:

- landing page changes
- billing
- provider credential debugging unless the issue is blueprint-specific

`wt-retrieval`:

- OpenAlex
- Crossref
- deduplication
- selection logic

Never include:

- prompt wording
- CSS changes

`wt-reporting-latex`:

- LaTeX renderer
- export assembly
- evidence log packaging

Never include:

- auth
- landing page copy
