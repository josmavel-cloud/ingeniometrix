# Vercel frontend package

Do NOT deploy the repository root. Generate `node scripts/package-vercel.mjs`.
It prints a new ignored `dist/vercel-TIMESTAMP` directory; never overwrites a prior
package. It traverses the UI module graph (including type imports), rejects backend,
Prisma, provider and Node filesystem dependencies, and copies only tracked public
assets. API implementations/private artifacts/env files are not copied. Dependencies
are filtered from the existing pinned lockfile; no provider SDK/Prisma installs.

In that package run `npm ci --ignore-scripts` then `npm run build` with:
IMX_RUNTIME_ROLE=frontend, PUBLIC_APP_ORIGIN, APP_ORIGIN, AUTH_ORIGIN,
BACKEND_API_ORIGIN and UPLOAD_ORIGIN. Origins affect build-time rewrites/CSP and must
also exist at runtime. No DATABASE_URL or migration secrets in Vercel.
Validate from repo: `node scripts/check-vercel-bundle.mjs dist/vercel-TIMESTAMP`.
It rejects production trace escapes and backend/private dependencies.

Owner-selected project: `https://vercel.com/josmavel-clouds-projects/ingeniometrix`.
It must be linked to the generated package and environment explicitly configured
before an authorized preview deployment. CLI 59.26.0 reported Logged out; owner must
authorize locally with `npx vercel login`. Do not paste tokens into chat. Do not change
the project's production settings, Git integration or production alias. A successful
local Next build is not a Vercel deployment.

| Surface | Route | Authority/path |
| --- | --- | --- |
| SSR session/project/topic/purchase data | GET /api/ui/{session,projects,detail/:id,topic/:id,purchase/:id} | frontend server forwards only session cookie; Ubuntu checks ownership |
| Browser mutations/queries | existing /api/auth, /api/projects, /api/commercial, /api/topic-areas | Vercel external rewrite; business logic only Ubuntu |
| Worker internal | /api/internal/blueprint-jobs/:id/run-stage | blocked at Vercel and public Caddy; worker bearer on internal network |
| Provider machine callback | /api/payments/mercado-pago/webhook | direct Ubuntu ingress; G4 signature + authoritative verification |
| PDF authorization | POST /api/transfers/authorize | same-origin session + CSRF; returns single-use capability |
| Large PDF upload | PUT /api/transfers/upload | direct UPLOAD_ORIGIN, bearer token, exact Origin/CORS; 30 MiB |
| Final DOCX/PDF | existing version export routes -> 302 capability URL | owner session mint -> direct Ubuntu binary; no Vercel binary response |
| Liveness/readiness | /api/health/live, /api/health/ready | container-local only; public ingress denies |

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
