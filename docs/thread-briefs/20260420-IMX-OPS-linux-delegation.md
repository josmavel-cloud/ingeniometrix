# Thread Brief

- Thread: `IMX-OPS-linux-delegation`
- Date: 2026-04-20
- Worktree: none
- Goal: define which tasks should move to Linux now, later, or not at all, and establish a safe first delegation workflow for the local-network Ubuntu server

## What Changed

- expanded the Linux delegation runbook with explicit task triage
- documented a worker-style first delegation workflow for the local-network server
- added a readiness gate that keeps dedicated server migration as a later phase

## Decisions

- use Linux now only for heavy, repeatable, bounded jobs with known local commands
- prefer `npm run debug:workflow`, `npm run debug:providers`, repeated `npm run typecheck`, repeated `npm run build`, and export experiments as first delegated jobs
- do not use Linux first for primary deployment, feature editing, landing work, blueprint design work, or undefined bug hunts
- treat the Ubuntu server as a pull-only worker in tmux, not as the source of truth
- keep dedicated server migration behind Git baseline, remote push, environment inventory, staging validation, and smoke checks

## Files Touched

- `docs/runbooks/linux-server-delegation.md`

## Verification

- reviewed `AGENTS.md`, workflow blueprint, deployment runbook, MVP delivery plan, and prompt history for consistency
- confirmed the repo is Git-initialized but still has no first commit, which reinforces the worker-only recommendation

## Follow-ups

- create the first clean Git commit and remote baseline
- document the exact env inventory needed for remote worker jobs
- run one bounded tmux-based Linux job after the branch can be pushed cleanly
