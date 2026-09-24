# G5 network and auth controls

Only `docker-compose.g5.yml` is the hybrid staging stack. Database is on the internal
`data` network with NO published port. Worker has no listener/published port.
App is not published. Caddy binds host 127.0.0.1:3310; named tunnel reaches only it.
Caddy denies internal/legacy/health/filesystem/page routes, caps ordinary bodies at
1 MB and PDF streams at 31,457,280 bytes, with read/write/idle timeouts.
Logs delete request URI/headers and response headers (no capability/signature leaks).
Caddy image carries bind capability; NET_BIND_SERVICE is the sole retained cap.

Cookie stays host-only on public app domain: HttpOnly, Secure, SameSite=Strict,
Path=/; OIDC transaction cookie Lax on /api/auth/google. Never set Domain=.ingeniometrix.com.
Same-origin rewrites preserve cookies. APP_ORIGIN is public frontend, NOT API origin.
Callback reconstruction already uses canonical APP_ORIGIN, not forwarded Host.
Browser POST requires exact Origin; missing/foreign Origin fails. Machine webhook
exception still authenticates G4 signature. Direct uploads require exact Origin
plus opaque grant; CORS never uses wildcard or credential sharing. Download tokens
are bearer capabilities: protect URLs; redemption also checks session revocation.
IMX_TRUST_PROXY_IP remains 0: arbitrary forwarded IP headers are not trusted.

## PostgreSQL

Bootstrap postgres superuser belongs only to DB initialization/operator recovery.
`imx_migrate`: schema ownership + database CREATE, no superuser/CREATEDB/CREATEROLE.
`imx_app`, `imx_worker`: schema USAGE, table DML, sequence usage; no DDL/TRUNCATE,
no `_prisma_migrations` access, no ledger UPDATE/DELETE or disabling triggers.
`imx_backup`: SELECT only for pg_dump. Roles initially created by init-roles.sh;
runtime-grants.sql runs after migrations. No credentials in frontend package.

## Host audit / unresolved production controls

Read `ss -ltn`, `docker ps`, and firewall policy before cutover. Existing unrelated
acceptance containers were discovered binding 0.0.0.0:3308 and 0.0.0.0:55438.
They were NOT stopped/modified by G5. Resolve under an explicit maintenance task;
do not claim the whole Ubuntu machine hardened from G5 network isolation alone.
SSH/firewall changes need an operator access/recovery plan; none applied blindly.
Read-only UFW check: active; permits Tailscale UDP and tailscale0 traffic. G5 listeners
3310/3311 verified loopback-only. Docker forwarding/iptables bypass and an external
network scan are NOT certified by that UFW output and remain pending.

ADMIN_MFA_PRODUCTION_BLOCKER=true. No admin MFA implementation in G5; privileged
web commercial/admin mutation surfaces remain absent/disabled. Local operator access
must be protected; production cannot launch until MFA/admin policy is resolved.
