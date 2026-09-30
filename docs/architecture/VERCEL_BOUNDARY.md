# Vercel frontend package

Do NOT deploy the repository root. Generate `node scripts/package-vercel.mjs`.
It prints a new ignored `dist/vercel-TIMESTAMP` directory; never overwrites a prior
package. It traverses the UI module graph (including type imports), rejects backend,
Prisma, provider and Node filesystem dependencies, and copies only tracked public
assets. API implementations/private artifacts/env files are not copied. Dependencies
are filtered from the existing pinned lockfile; no provider SDK/Prisma installs.
Boundary manifest records Git HEAD, dirty status and copied module-graph hash;
a build from a dirty worktree must not be attributed to HEAD alone.

In that package run `npm ci --ignore-scripts` then `npm run build` with:
IMX_RUNTIME_ROLE=frontend, PUBLIC_APP_ORIGIN, APP_ORIGIN, AUTH_ORIGIN,
BACKEND_API_ORIGIN and UPLOAD_ORIGIN. Origins affect build-time rewrites/CSP and must
also exist at runtime. No DATABASE_URL or migration secrets in Vercel.
Validate from repo: `node scripts/check-vercel-bundle.mjs dist/vercel-TIMESTAMP`.
It rejects production trace escapes and backend/private dependencies.

Owner-selected project: `https://vercel.com/josmavel-clouds-projects/ingeniometrix`.
The RC4 package has been linked and deployed as a Preview for
`feat/rc4-scientific-commercial`. Preview-only variables are documented in
`docs/runbooks/STAGING_RUNBOOK.md`; Production variables and aliases were not changed.
The deployment URL is available before custom-domain DNS, and Vercel Deployment
Protection remains enabled. `staging.ingeniometrix.com` is not yet a verified browser
origin because Wix is still authoritative and its staging record is absent. Do not
disable protection globally or change Production/Git integration to work around this.
Never paste Vercel tokens into chat. A successful local Next build alone is not a
Vercel deployment; verify both the deployment state and the backend boundary.

| Surface | Route | Authority/path |
| --- | --- | --- |
| SSR session/project/topic/purchase data | GET /api/ui/{session,projects,detail/:id,topic/:id,purchase/:id} | frontend server forwards only session cookie; Ubuntu checks ownership |
| Browser mutations/queries | existing /api/auth, /api/projects, /api/commercial, /api/topic-areas | Vercel external rewrite; business logic only Ubuntu |
| Worker internal | /api/internal/blueprint-jobs/:id/run-stage | blocked at Vercel and public Caddy; worker bearer on internal network |
| Provider machine callback | /api/payments/mercado-pago/webhook | direct Ubuntu ingress; G4 signature + authoritative verification |
| PDF authorization | POST /api/transfers/authorize | same-origin session + CSRF; returns single-use capability |
| Large PDF upload | PUT /api/transfers/upload | direct UPLOAD_ORIGIN, bearer token, exact Origin/CORS; 30 MiB |
| Final DOCX/PDF | existing version export routes -> 302 capability URL | owner session mint -> direct Ubuntu binary; no Vercel binary response |
| Liveness/readiness | /api/health/live, /api/health/ready | sanitized endpoints allowed through the staging Caddy ingress; no internal detail |

Staging note: direct Funnel health/readiness endpoints return 200. During the
branch Preview acceptance, `/api/health/ready` on the Vercel origin returned 404,
although authenticated `/api/ui/*` rewrites reached Caddy. A 2026-09-24 public probe
received 200 for the custom Vercel staging homepage and workspace shell. Keep using
the direct backend readiness URL for monitoring until the Vercel route discrepancy
is explained; do not expose dependency details to make the proxy test pass. A signed
webhook reached Ubuntu, but retained logs do not prove that request traversed Vercel.

Downloads use a 60-second single-use query capability with no-referrer/no-store;
never log query strings. A lost response requires a new authorized link, not reuse.
Upload capability lasts 10 minutes, binds project/draft/session/size/MIME. MIME and
PDF parser validation do not constitute antivirus or scientific relevance approval.
The upload route alone bypasses Next.js proxy middleware to avoid its 10 MB body
cloning/truncation limit; route-level exact Origin and session-bound capability checks
remain mandatory. Caddy bounds the streamed body independently.

Official references: [Vercel external rewrites](https://vercel.com/docs/routing/rewrites),
[function payload limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
Large files bypass Vercel rather than relying on changing its limits.
