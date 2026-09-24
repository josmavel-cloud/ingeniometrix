# G5 observability

- `/api/health/live`: process liveness only.
- `/api/health/ready`: DB SELECT 1 + private volume read/write access; no provider calls.
- Caddy exposes only these two sanitized endpoints at the staging API origin;
  Vercel denies them. They reveal no configuration/dependency details. Docker also
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

Monitoring installation is PENDING: route these signals to an independent external
monitor. Alert on readiness failure, heartbeat >120s, backup age >26h or UNKNOWN,
disk <15%, queue/job failures and webhook/OIDC error growth. Operator health command
does not by itself deliver alerts. Installed backup-host.sh publishes a success timestamp
only after backup/check completes; missing timestamp is UNKNOWN, not fresh. No new
paid metrics sampling. No public metrics endpoint.

Test reboot/Docker restart on an agreed maintenance window; restarting isolated app
and idle worker is not proof of full host reboot or in-flight scientific recovery.

G5.3 recheck (2026-09-24): no external monitor/alert destination is configured.
The GitHub CLI and a supported workflow/secrets write channel are unavailable here,
so no scheduled GitHub Actions monitor was installed or claimed. Current point probes:
staging homepage 200, staging `/workspace` 500, backend Funnel liveness/readiness 200.
The backend `/api/health/operational` path returns 404. These point probes do not
monitor worker heartbeat, remote-backup age or disk threshold and do not provide
alerting. A protected operational-health endpoint/token and external secret setup
remain prerequisites before those signals can be monitored off-host.
