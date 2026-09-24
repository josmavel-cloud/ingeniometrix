# RC4 G5 hybrid boundary

STATUS: IMPLEMENTED LOCALLY; external staging/cutover NOT ACCEPTED.
Baseline: `b6f0cf8a1917f39eb34650805a5f63f52782539a`. G1-G4 algorithms and payment policy unchanged.

```text
Browser -- HTTPS --> Vercel Next frontend (host-only session cookie)
                       | SSR typed /api/ui reads + same-origin /api rewrites
                       v
                   api-staging HTTPS (named Cloudflare Tunnel)
                       v
                   Caddy :8080 <-- host loopback :3310
                       v
                   Ubuntu Next API -- PostgreSQL (internal network)
                       |             -- private artifacts volume
                   worker (no listener; same persistent jobs/checkpoints)
Browser -- short-lived opaque capability --> Caddy --> upload/download
```

The generated frontend package contains real existing UI, not a second application
implementation. `lib/backend-http.ts` replaces direct server imports in seven page
entrypoints. `lib/hybrid-contracts.ts` is the compile-checked wire contract;
`server/hybrid/page-data.ts` calls the existing owner-scoped services.
No Prisma types cross the frontend source graph. ORM/native tools remain in Ubuntu.
HTTP responses use ISO timestamps, not serialized Date objects.

Origins are centralized in `lib/hybrid-origins.ts`: PUBLIC_APP_ORIGIN, APP_ORIGIN
(must agree), BACKEND_API_ORIGIN, AUTH_ORIGIN (must equal public), UPLOAD_ORIGIN.
Frontend has only origins and IMX_RUNTIME_ROLE=frontend, never DB/provider/storage
credentials. Backend SSR fallback uses its own loopback API, preserving combined
deployment. G5 is opt-in via separate Compose and IMX_HYBRID_TRANSFERS.

Ubuntu is the sole authority for sessions, projects/drafts/versions, artifacts,
jobs, purchases, ledgers and provider verification. Frontend does not authorize by
user-supplied IDs. Every aggregate read establishes session + project ownership.

## Storage and transport producers/consumers

| State | Producer | Consumer | Privacy/lifecycle |
| --- | --- | --- | --- |
| TransferGrant hash, scope, expiry, session, byte limit | authorize endpoint | atomic redemption | private; one use; revoke with session; expired rows cleanup candidate |
| UploadedPdf metadata, draftRevision, storageKey, SHA-256, consent | authorization + upload | documents UI; future inspection | private; no automatic source inclusion; consent false default |
| private-storage/UUID.pdf | streaming ArtifactStore | future inspection + backup | quarantined; no public serving or third-party rights inferred |
| GeneratedArtifact content | existing publication | direct capability download | DB binary remains source of truth for final documents |
| worker heartbeat file | worker wrapper | operator health tool | operational, not job authority |

ArtifactStore currently provides private filesystem PDF writes/existence; swapping
for an object-storage adapter must preserve immutable keys, bounded streaming and
validation. No historical artifact migration. Source ingestion/relevance approval
is NOT implemented by upload transport: UI explicitly says pending review.
Interrupted uploads can leave UPLOADING metadata/`.part` files for operator review;
do not automatically delete audit evidence. Automatic cleanup/retry UI is pending.

## Home server limitations

No HA claim. Power/ISP/router/disk loss stops API/auth/generation despite Vercel
remaining available. Restart policies cannot repair failed hardware. Before cutover:
off-machine encrypted backup, independently monitored ingress/backup/heartbeat and
restore rehearsal are mandatory. Future migration is configuration-driven: PostgreSQL
connection URLs, ArtifactStore object adapter, worker/backend images to dedicated VM.
No Kubernetes or extra queue required.
