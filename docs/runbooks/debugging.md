# Debugging Runbook

## Purpose

Keep bug investigation isolated from planning and feature work.

## Process

1. Open a dedicated thread named `IMX-BUG-<area>-<symptom>-YYYYMMDD`.
2. If Git is available, create `wt-debug-<bugid>`.
3. Capture a minimal reproduction.
4. Store raw evidence in `artifacts-local/debug/<bugid>/`.
5. Identify the dominant layer:
   - `ui`
   - `api`
   - `domain`
   - `provider`
   - `db`
6. Patch only the smallest responsible surface.
7. Verify with the narrowest possible check first.
8. Convert the reproduction into a fixture or test when stable.
9. Write a short summary into `docs/thread-briefs/`.

## Rules

- do not debug inside architecture threads
- do not paste long logs into chat
- do not fix multiple unrelated bugs in the same thread
- do not keep "current" or "fresh" debug directories as long-term operating practice

## Naming

- bug id example: `retrieval-null-title`
- thread example: `IMX-BUG-pipeline-retrieval-null-title-20260419`
- local artifact path example:
  `artifacts-local/debug/retrieval-null-title/`

## When To Fork

Fork the thread only when:

- the root cause is known and implementation needs a clean context
- a verification pass should happen separately from the fix

Do not fork while the bug is still undefined.
