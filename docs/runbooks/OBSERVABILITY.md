# G5 observability

- `/api/health/live`: process liveness only.
- `/api/health/ready`: DB SELECT 1 + private volume read/write access; no provider calls.
- `/api/health/operational`: read-only, bearer-token protected aggregate for the
  external monitor. It returns only `healthy`/`degraded`, worker heartbeat
  `healthy`/`stale`/`unknown`, backup age `healthy`/`stale`/`unknown`, and storage
  `healthy`/`low`/`unknown`. It does not return paths, byte counts, queue/user
  data, dependency diagnostics, or secret/configuration details. Worker freshness
  is 120 seconds, backup freshness is 26 hours, and storage is low below 15% free.
- Caddy exposes only these three sanitized endpoints at the staging API origin;
  Vercel denies them. The operational endpoint additionally requires its scoped
  token. They reveal no configuration/dependency details. Docker also
  checks readiness internally.
- `scripts/g5-health.ts`: local operator-only queue status counts, failed-job counts,
  disk available bytes, worker heartbeat age, backup age, auth failures, payment event
  states, job duration and cumulative B4 known estimates/unknown commitments.
  Rejected webhook signatures exist only in structured logs, not PaymentEvent rows;
  the command reports UNKNOWN until a log sink supplies that counter.
  Duration is persisted completedAt minus startedAt, not a sum of all historical
  attempts; inspect existing stage/cost telemetry for cumulative retry attribution.
- Existing G4 auth/payment structured diagnostics and B4 cost/stage telemetry remain
  canonical. Do not infer zero cost from missing usage.
- Worker writes an operational heartbeat, separate from DB job leases/checkpoints;
  no retry, cost or scientific-stage changes.
- Caddy logs request outcomes/durations without URI, query, headers or credentials.

Commands: `docker compose --env-file .env.g5-staging -f docker-compose.g5.yml logs --tail 100 app worker proxy`;
`docker compose --env-file .env.g5-staging -f docker-compose.g5.yml ps`.
Never dump Compose resolved configuration or full container environment into logs.

External monitor: `.github/workflows/g5-staging-monitor.yml` is scheduled every
15 minutes and can also be dispatched manually. It probes the staging web origin,
backend readiness and protected operational aggregate. Configure the same random,
high-entropy value as `IMX_MONITORING_TOKEN` in the isolated staging app runtime
and GitHub Actions secret `STAGING_MONITOR_TOKEN`. Never put either value in
repository files or logs. The worker does not receive the token. GitHub scheduled
workflows run from the repository's default branch; this feature-branch workflow
will not schedule until promoted there. Until the secret is set, the app is rebuilt
with the runtime variable, and the workflow is available on the default branch,
external alerting is NOT ACTIVE. Operator health command does not by itself deliver
alerts. `backup-host.sh` publishes success only after its backup/check completes;
missing timestamp is UNKNOWN, not fresh. No new paid metrics sampling. No public
metrics endpoint.

The workflow checks public web availability, backend readiness, worker heartbeat
freshness, backup age and free-storage threshold. A non-2xx response or any
non-healthy aggregate fails the job. GitHub Actions notifications follow the
repository notification policy; verify delivery to an on-call owner before treating
it as alerting.

Test reboot/Docker restart on an agreed maintenance window; restarting isolated app
and idle worker is not proof of full host reboot or in-flight scientific recovery.

G5.3 implementation (2026-09-24): added the protected operational-health route,
aggregate evaluator, staging monitor workflow and offline stale/healthy/outage/
recovery tests. External activation remains pending: no GitHub CLI or Actions-secret
write capability is available in this session. Required Actions secret:
`STAGING_MONITOR_TOKEN`. After injecting the matching value into the isolated app
runtime and that secret, rebuild only the G5 app, verify authorized and unauthorized
route behavior, then dispatch the workflow and confirm healthy/failure/recovery runs.
