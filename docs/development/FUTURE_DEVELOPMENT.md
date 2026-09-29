# Future Development

STATUS: CURRENT - Release 0 handoff.

## Immediate After Deployment

- Run a protected staging E2E on the authorized host using real pilot configuration.
- Run one bounded paid production smoke and record provider usage, cost and artifacts.
- Verify backups and a restore drill for PostgreSQL plus the private artifact volume.
- Add operational observability for job failures, provider failures, token/cost usage and download errors.
- Run the first assisted pilot review with human scientific/advisor feedback.

## Next Product Iterations

- Validate Deep Research live with strict budget and candidate-only handling before enabling it.
- Harden university template support for UPC, UCV and USMP only where it improves Release 0 delivery.
- Improve asset extraction only after reviewing real pilot documents and failure cases.
- Add analytics that measure operational progress without exposing private evidence or prompts.
- Prepare Release 0.5 billing/delivery email only after the secure pilot is stable.

## Technical Debt

- Some legacy/lab/reporting code remains in the repository for compatibility and history.
- Several planning docs are superseded and should not guide implementation without checking current docs.
- Prompt governance is strong in `server/mvp/prompts/`, but some older services still contain service-local prompt text.
- Retention policy for audit logs, old jobs, rejected assets and validation sidecars is not finalized.
- Serverless deployment is not validated for document generation dependencies.

## Do Not Do Yet

- Do not redesign the research engine.
- Do not split into microservices.
- Do not enable Deep Research by default.
- Do not add subscriptions, billing or marketing expansion before the pilot is deployed and reviewed.
- Do not delete legacy branches/worktrees without a separate review.
- Do not automate thesis completion or academic fraud workflows.
