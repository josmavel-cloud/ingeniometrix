# Thread Brief

- Thread: `IMX-OPS-git-and-vercel-20260420`
- Date: `2026-04-20`
- Worktree: `none`
- Goal: define the shortest clean first baseline push and the exact staging deployment path for Ingeniometrix

## What Changed

- expanded the deployment runbook with a concrete first-push sequence
- documented the minimal branch workflow: `main`, `staging`, and short-lived task branches
- documented exact Vercel staging steps, including the managed Postgres requirement
- upgraded the smoke script to persist cookies and verify an authenticated workspace request
- removed stale pre-Git wording from the worktrees runbook

## Decisions

- use Vercel defaults for the current Next.js app and avoid `vercel.json` for now
- add a persistent `staging` branch after the first `main` push
- require a managed Postgres database for meaningful staging validation
- keep Linux server deployment out of the critical path until Vercel staging is stable

## Files Touched

- `docs/runbooks/deployment.md`
- `docs/runbooks/worktrees.md`
- `scripts/smoke-deployment.mjs`
- `docs/thread-briefs/git-and-vercel-baseline-20260420.md`

## Verification

- `git status --short --branch`
- `npm run typecheck`
- `npm run prisma:validate`
- `npm run build`
- `npm run smoke:deployment:workspace`

## Follow-ups

- create the remote repository and perform the first baseline push
- provision the staging Postgres instance
- connect the repo to Vercel and run preview smoke against the deployed URL
