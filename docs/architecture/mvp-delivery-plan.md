# MVP Delivery Plan

## Objective

Ship Release 0 of Ingeniometrix quickly without activating infrastructure that would slow down core product validation.

## What To Build First

1. Stable local MVP flow
   - auth minima
   - project creation
   - intake
   - retrieval
   - source selection
   - blueprint generation
   - traceability validation
2. Export layer
   - evidence log
   - BibTeX
   - RIS
   - DOCX
3. Deployment baseline
   - Git
   - staging deployment
   - deployment smoke test
4. Release 0.5 layer
   - payments
   - delivery email

## What Should Wait

Do not prioritize these yet:

- Supabase migration
- production file storage design
- dedicated server migration
- Vercel production hardening
- subscription architecture
- full LaTeX pipeline in production

Reason:

The current codebase still needs maturity in export, testing, and boundary stabilization. Introducing cloud hosting and server migration too early would increase moving parts before the MVP path is stable.

## Readiness Gate Before Vercel Or Cloud DB

Only move to staging deployment when all of these are true:

- `npm run build` passes consistently
- local full workflow is stable
- debug workflow can run repeatedly without structural failures
- environment variables are documented
- at least one smoke script exists for deployment verification
- export scope is defined, even if partial

## Readiness Gate Before Dedicated Linux Server

- Git repo initialized
- repeatable deploy command documented
- environment file inventory documented
- staging target already validated
- deployment smoke test passes against staging

## Current Recommendation

As of now:

- Git init: yes, soon
- first local commit: yes, after one more small hygiene pass
- push to remote: not yet mandatory, but should happen before any real deployment work
- host on Vercel: not yet
- move DB to Supabase: not yet
- connect product runtime to Linux server: not yet
- use Linux server only for delegated heavy jobs and controlled experiments: later, after Git and staging baseline
