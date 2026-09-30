# Named tunnel staging plan (not activated)

Cloudflared is installed but no local named-tunnel identity/management credentials
were available. Do not replace G4 Quick Tunnel, Tailscale root or :8448 mappings.
Template: `ops/g5/cloudflared.example.yml`; service: `ops/g5/ingeniometrix-tunnel.service`.
Owner configures a dedicated unprivileged cloudflared account, protected credential
JSON and config in /etc/cloudflared. No credentials in Git. Automatic restart is
specified, but actual tunnel restart/reconnect must be tested after provisioning.

Ingress: exact api-staging.ingeniometrix.com + /api/* -> http://127.0.0.1:3310;
catch-all 404. Caddy further denies internal/health/legacy paths. No Funnel/router
port forwarding. Run `cloudflared tunnel --config /etc/cloudflared/ingeniometrix-staging.yml ingress validate`
and ingress rule checks before service enablement.

## DNS change request - explicit approval required

Owner approved ONLY the two staging records during G5, conditional on verifying
their exact destinations. Destinations and credentials are still missing; no DNS
write performed. This approval does not include replacement of existing records.

| Action | Record | Destination |
| --- | --- | --- |
| ADD after approval | api-staging.ingeniometrix.com CNAME | verified named tunnel UUID.cfargotunnel.com (UUID not yet available) |
| ADD after approval | staging.ingeniometrix.com | exact target supplied by linked Vercel project (not yet available) |
| REPLACE | none | do not overwrite an existing record without another review |
| PRESERVE | ingeniometrix.com, www, api.ingeniometrix.com, MX/TXT and other records | unchanged |

Do not run `tunnel route dns` before approval; it mutates DNS. No production cutover
or TLS/DNS account changes have occurred. Verify existing zone records before adding.

References: [configuration](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/),
[Linux service](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/linux/).
