# RC4 production cutover guard

STATUS: BLOCKED. A frontend build is not a deployed/accepted service.

- [ ] Owner confirms exact staging DNS targets; preserve apex/api/existing mappings.
- [ ] Vercel staging deployed, no backend bundle/DB/provider/storage credentials.
- [ ] Persistent named tunnel + Caddy HTTPS path and tunnel restart verified.
- [ ] Real staging Google login/reload/logout/relogin.
- [ ] Two-user isolation on deployed boundary, direct 30 MiB upload + downloads.
- [ ] Quarantined PDF relevance/security release policy reviewed before source use.
- [ ] One bounded scientific staging plan, DOCX/PDF, storage and in-flight recovery.
- [ ] Sandbox payment webhook delivery accepted at new ingress, exactly-once grant.
- [ ] App/worker/host/Docker restart and named tunnel reconnect verified.
- [ ] Encrypted off-machine backup + isolated restore on replacement hardware.
- [ ] External monitoring/alerts, backup freshness and disk thresholds active.
- [ ] Cloudflare/Vercel log policies redact transfer capability query strings.
- [ ] Host firewall and older broad container port bindings resolved.
- [ ] Admin MFA/access controls implemented/accepted; privileged actions remain disabled.
- [ ] Terms/privacy/retention reviewed; no assumption public PDFs permit training.

Production payments stay OFF even after web cutover. Independent blockers:
merchant legal/commercial approval, production credentials, external production
webhook acceptance, refund/chargeback acceptance, approved price/terms/privacy,
admin MFA. G5 has no authority to turn these on.
