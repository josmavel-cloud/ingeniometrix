# Thread Brief

- Thread: `IMX-AUTH-billing`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: define the smallest viable Release 0.5 payment architecture for Ingeniometrix without coupling billing to the research pipeline.

## What Changed

- Documented a Release 0.5 payment direction centered on one-time project payments, not subscriptions.
- Chose a hosted redirect checkout model with verified webhooks as the default architecture shape.
- Defined the minimum commercial data seam needed now so billing, export delivery, and later revisions can evolve without rewriting core project flow.
- Captured the explicit "do not build yet" list to keep Release 0.5 small.

## Decisions

- Keep Release 0.5 to one-time payments only.
  The product scope already places subscriptions in Release 1. Release 0.5 only needs a single commercial action: charge once for a project delivery.

- Treat payment as a project-scoped commercial event, not as a research workflow state.
  Do not overload `Project.status` with billing concerns. The research pipeline should continue to describe intake, retrieval, blueprint, and export readiness. Billing should live in a separate commercial record and only unlock delivery.

- Default to hosted redirect checkout, not embedded card capture.
  The smallest reliable flow is:
  1. user starts checkout from Ingeniometrix
  2. backend creates a provider-side checkout object
  3. user completes payment on the provider-hosted page
  4. provider webhook confirms the payment
  5. Ingeniometrix marks the project as paid and triggers delivery

- Prefer Mercado Pago Checkout Pro as the default Release 0.5 provider for a Peru-first launch.
  Reasoning:
  - Mercado Pago's Peru developer docs currently document Checkout Pro, payment preference creation, and payment notifications for the `.pe` market.
  - Stripe Checkout is technically simple, but Stripe's global availability page did not list Peru on 2026-04-20. That makes Stripe a poor default assumption for a Peru-based Release 0.5 merchant.
  - This is an inference from official provider documentation, not a product requirement. If the operating entity later uses a supported non-Peru Stripe business location, the provider choice can be revisited behind the same local interface.

- Place the paywall at delivery, not at project creation.
  The simplest path is to let the Release 0 workspace generate value first, then charge when a project has a deliverable export package or a delivery-ready blueprint artifact. Charging earlier creates extra order-recovery and support cases before the user has seen value.

- Keep delivery email downstream of verified payment.
  The system should not send the export package from the success redirect alone. The authoritative state change must happen only after a verified provider webhook confirms approval.

- Resolve price server-side from a local catalog.
  The client should never send the authoritative amount to charge. For Release 0.5, use one fixed product or one fixed price per deliverable type, resolved on the server from local config.

- Keep billing traceable.
  Payment creation, payment approval, webhook receipts, and delivery attempts should each produce durable local records or audit events so the team can explain what happened for any paid project.

## Minimal Architecture

- `server/billing/payment-service.ts`
  Owns checkout creation, payment status transitions, and delivery triggering. This is the local orchestration layer.

- `server/billing/payment-provider.ts`
  Small local provider interface with methods like:
  - `createCheckout`
  - `parseWebhook`
  - `getPaymentReference`

- `server/billing/providers/mercado-pago-checkout.ts`
  First concrete implementation. Keep provider-specific request and response mapping here.

- `server/billing/pricing.ts`
  Server-owned fixed pricing catalog for Release 0.5.

- `server/delivery/email-service.ts`
  Small boundary for sending the delivery email. Keep email concerns out of payment-provider code.

- `app/api/billing/checkout/route.ts`
  Creates a local payment order and the provider checkout session or preference.

- `app/api/billing/webhook/route.ts`
  Receives provider webhooks, verifies them, updates local status, and triggers delivery.

- `app/api/billing/return/route.ts`
  Optional thin return endpoint for user-facing status only. Never trust it as proof of payment.

## Minimal Data Shape

Add a dedicated payment record instead of pushing payment fields into `Project`.

Suggested core model for Release 0.5:

- `PaymentOrder`
  - `id`
  - `projectId`
  - `userId`
  - `provider`
  - `providerCheckoutId`
  - `providerPaymentId`
  - `providerExternalReference`
  - `amountMinor`
  - `currency`
  - `status`
  - `payerEmail`
  - `deliveredBlueprintVersionId` nullable
  - `deliveryStatus`
  - `paidAt` nullable
  - `deliverySentAt` nullable
  - `createdAt`
  - `updatedAt`

- `PaymentWebhookReceipt`
  - `id`
  - `provider`
  - `providerEventId`
  - `payloadJson`
  - `processedAt`

Notes:

- One `PaymentOrder` per checkout attempt keeps retries and support cases explainable.
- `deliveredBlueprintVersionId` is the main "avoid rework later" seam. Even if Release 0.5 allows only one paid delivery per project, this field keeps later revisions or repurchases possible without redesigning the payment table.
- If the team wants the absolute minimum schema, `PaymentWebhookReceipt` can be replaced by audit entries at first, but a dedicated receipt table is safer for webhook idempotency.

## Recommended Status Model

- `PaymentOrder.status`
  - `CREATED`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
  - `CANCELLED`
  - `REFUNDED`

- `PaymentOrder.deliveryStatus`
  - `NOT_REQUIRED`
  - `PENDING`
  - `SENT`
  - `FAILED`

This keeps commercial state independent from `Project.status`.

## Release 0.5 User Flow

1. user signs in and completes the normal workspace flow
2. project reaches a delivery-ready point
3. user clicks a single CTA to purchase delivery
4. backend creates `PaymentOrder` and provider checkout
5. provider hosts the payment experience
6. provider webhook marks the order `APPROVED`
7. delivery email is sent for the exact paid artifact
8. workspace shows paid and delivery status from local state

## What Not To Build Yet

- subscriptions or recurring billing
- multiple pricing tiers
- coupon codes, promotions, or referral discounts
- saved cards or in-app card entry
- invoices, tax engine automation, or fiscal document generation
- team billing, institution billing, or seat management
- self-serve refund UI
- dunning, failed-payment recovery campaigns, or revenue analytics
- multi-provider routing
- guest checkout with anonymous project recovery
- a broad entitlements framework beyond "paid delivery unlocked"

## Integration Seams Needed Now

- Separate `server/billing/` from `server/projects/`, `server/blueprint/`, and `server/retrieval/`.
  This is the main boundary that keeps commercial logic isolated from academic workflow logic.

- Include provider-neutral identifiers in local records.
  Store both the local order id and the provider external reference so webhook reconciliation does not depend on UI redirects.

- Attach delivery to a specific artifact version.
  Even with one-time payment only, persist which blueprint or export version was delivered.

- Make webhook handling idempotent.
  Provider retries are normal. The webhook path must tolerate duplicate notifications without double-sending emails or double-marking orders.

- Keep pricing in one local module.
  Even a single fixed price should not be hardcoded into routes or UI components.

- Reuse `AuditLog` for business traceability.
  Record checkout creation, payment approval, payment rejection, and delivery send or failure events.

- Keep email behind its own small interface.
  Release 0.5 only needs delivery email, but isolating it now avoids coupling payment code to a future provider SDK.

## Risks

- Premature subscription design.
  Adding recurring billing objects now will enlarge schema and UI surface without helping Release 0.5.

- Trusting the return URL.
  Redirect success pages are not authoritative and can create false paid states if the webhook path is not the source of truth.

- Mixing billing into `Project.status`.
  This would blur whether a project is academically ready, commercially paid, or merely waiting for delivery.

- Charging before a deliverable exists.
  Doing so introduces manual support work and ambiguous promises if export generation is delayed or fails.

- Provider lock-in through route code.
  If provider-specific request shapes leak into API handlers, later switching or adding a provider becomes more expensive than it needs to be.

## Files Touched

- `docs/thread-briefs/20260420-IMX-AUTH-billing-release-0-5-payment-architecture.md`

## Verification

- Reviewed workflow and scope rules in:
  - `AGENTS.md`
  - `docs/architecture/codex-workflow-blueprint.md`
  - `docs/runbooks/debugging.md`
  - `docs/runbooks/worktrees.md`
- Reviewed current product scope and Release 0.5 expectations in:
  - `SPEC.md`
  - `README.md`
  - `docs/architecture/mvp-delivery-plan.md`
  - `docs/prompts/chats/IMX-AUTH-payments.md`
- Reviewed current implementation seams in:
  - `prisma/schema.prisma`
  - `server/auth/session.ts`
  - `server/projects/project-service.ts`
  - `app/api/auth/session/route.ts`
  - `app/api/projects/route.ts`
  - `app/api/projects/[id]/route.ts`
  - `app/projects/[id]/page.tsx`
  - `components/marketing/home-hero.tsx`
  - `.env.example`
- Verified on 2026-04-20 that:
  - Stripe's official global availability page did not list Peru
  - Mercado Pago's Peru developer documentation documents Checkout Pro payment preference creation and payment notifications

## Follow-ups

- Add a small ADR when implementation starts and the Prisma schema names are fixed.
- Decide whether the first commercial artifact is the export package, the latest approved blueprint version, or another delivery bundle before wiring the CTA.
- When payment implementation begins, add the narrowest possible UI surface: one purchase CTA, one pending state, one paid state, and one delivery state.
