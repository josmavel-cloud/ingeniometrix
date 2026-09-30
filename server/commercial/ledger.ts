import { Prisma, type CommercialEntitlement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jobCostPolicy } from "@/server/mvp/execution-policy";
import { securityAudit } from "@/server/auth/security-events";
import { offerSchema, type Offer } from "./catalog";

type Tx = Prisma.TransactionClient;
const available = (a: CommercialEntitlement, unit: "PLAN_SLOT" | "COMPUTE_CREDIT") => unit === "PLAN_SLOT"
  ? a.grantedSlots - a.reservedSlots - a.consumedSlots : a.grantedCredits - a.reservedCredits - a.consumedCredits;
async function entry(tx: Tx, a: CommercialEntitlement, key: string, kind: string, unit: "PLAN_SLOT" | "COMPUTE_CREDIT", amount: number, reason: string, jobId?: string) {
  await tx.commercialLedgerEntry.create({ data: { entitlementId: a.id, userId: a.userId, purchaseId: a.purchaseId, jobId,
    operationKey: `${key}:${unit}`, kind, unit, amount, availableAfter: available(a, unit), reason,
    policyVersion: offerSchema.parse(a.policy).policyVersion, actor: "SYSTEM" } });
}
export async function grantEntitlement(tx: Tx, input: { userId: string; purchaseId?: string; grantKey: string; policy: Offer; reason: string }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.grantKey}))`;
  const old = await tx.commercialEntitlement.findUnique({ where: { grantKey: input.grantKey } });
  if (old) return old;
  const p = offerSchema.parse(input.policy);
  const a = await tx.commercialEntitlement.create({ data: { userId: input.userId, purchaseId: input.purchaseId, grantKey: input.grantKey, policy: p, grantedSlots: p.planSlots, grantedCredits: p.computeCredits } });
  await entry(tx, a, `grant:${a.id}`, "GRANT", "PLAN_SLOT", p.planSlots, input.reason);
  await entry(tx, a, `grant:${a.id}`, "GRANT", "COMPUTE_CREDIT", p.computeCredits, input.reason);
  await securityAudit("ENTITLEMENT_GRANTED", input.userId, { entitlementId: a.id, reason: input.reason }, tx);
  return a;
}
export async function reserveCommercialJob(tx: Tx, jobId: string) {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
  // Serializes reservations for different projects owned by the same customer.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${job.userId} FOR UPDATE`;
  const prior = await tx.commercialReservation.findUnique({ where: { jobId } });
  if (prior && prior.status !== "RELEASED") return prior;
  const accounts = await tx.commercialEntitlement.findMany({ where: { userId: job.userId, status: "ACTIVE", ...(prior ? { id: prior.entitlementId } : {}) }, orderBy: { createdAt: "asc" } });
  for (const candidate of accounts) {
    await tx.$queryRaw`SELECT id FROM "CommercialEntitlement" WHERE id = ${candidate.id} FOR UPDATE`;
    const a = await tx.commercialEntitlement.findUniqueOrThrow({ where: { id: candidate.id } });
    const policy = offerSchema.parse(a.policy);
    if (jobCostPolicy().hard * 1e6 > policy.hardCapUsdMicros) throw new Error("COMMERCIAL_COST_POLICY_MISMATCH");
    const credits = Math.ceil(policy.hardCapUsdMicros / policy.creditUsdMicros);
    if (credits > policy.maxCreditsPerPlan) throw new Error("COMMERCIAL_COST_POLICY_MISMATCH");
    if (a.status !== "ACTIVE" || available(a, "PLAN_SLOT") < 1 || available(a, "COMPUTE_CREDIT") < credits) continue;
    const snapshot = await tx.generationInputSnapshot.findFirst({ where: { jobId }, orderBy: { revision: "desc" } });
    const reservation = prior ? await tx.commercialReservation.update({ where: { jobId }, data: { status: "RESERVED", settledAt: null } })
      : await tx.commercialReservation.create({ data: { jobId, userId: job.userId, projectId: job.projectId, inputSnapshotId: snapshot?.id, entitlementId: a.id, policy, credits } });
    const updated = await tx.commercialEntitlement.update({ where: { id: a.id }, data: { reservedSlots: { increment: 1 }, reservedCredits: { increment: credits } } });
    const cycle = await tx.commercialLedgerEntry.count({ where: { jobId, kind: "RESERVE", unit: "PLAN_SLOT" } }) + 1;
    const key = `reserve:${reservation.id}:${cycle}`;
    await entry(tx, updated, key, "RESERVE", "PLAN_SLOT", -1, "GENERATION_AUTHORIZED", jobId);
    await entry(tx, updated, key, "RESERVE", "COMPUTE_CREDIT", -credits, "GENERATION_AUTHORIZED", jobId);
    await securityAudit("GENERATION_RESERVED", job.userId, { jobId }, tx);
    return reservation;
  }
  throw new Error("ENTITLEMENT_REQUIRED");
}
export async function assertCommercialPaidAuthorization(tx: Tx, jobId: string) {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
  // Only pre-G4 persisted jobs retain their historical platform-funded authorization.
  if ((job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy !== "commercial-v1") return null;
  const r = await tx.commercialReservation.findUnique({ where: { jobId }, include: { entitlement: true } });
  if (!r || r.status !== "RESERVED" || r.entitlement.status !== "ACTIVE") throw new Error("COMMERCIAL_RESERVATION_REQUIRED");
  return offerSchema.parse(r.policy).hardCapUsdMicros / 1e6;
}
export async function settleCommercialJob(tx: Tx, jobId: string, outcome: "COMPLETED" | "FAILED") {
  await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
  const r = await tx.commercialReservation.findUnique({ where: { jobId } });
  if (!r || r.status === "SETTLED" || r.status === "RELEASED") return;
  await tx.$queryRaw`SELECT id FROM "CommercialEntitlement" WHERE id = ${r.entitlementId} FOR UPDATE`;
  const a = await tx.commercialEntitlement.findUniqueOrThrow({ where: { id: r.entitlementId } });
  const policy = offerSchema.parse(r.policy);
  const cost = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
  const entries = (cost?.outputJson as { entries?: Array<{ estimate: number | null; retry: boolean; status: string }> } | null)?.entries ?? [];
  if (outcome === "COMPLETED" && (!cost || entries.some((e) => e.estimate === null || !Number.isFinite(e.estimate) || e.estimate < 0))) {
    await tx.commercialReservation.update({ where: { jobId }, data: { status: "COST_PENDING" } });
    return; // Unknown provider usage stays reserved; reconciliation can settle later.
  }
  let versionId: string | null = null;
  if (outcome === "COMPLETED") {
    const version = await tx.blueprintVersion.findFirst({ where: { OR: [{ generationJobId: jobId }, { generatedArtifacts: { some: { jobId } } }] } });
    if (!version || version.projectId !== r.projectId) throw new Error("COMMERCIAL_PUBLICATION_MISSING");
    const artifacts = await tx.generatedArtifact.findMany({ where: { jobId, blueprintVersionId: version.id, userId: r.userId }, select: { kind: true } });
    if (!["BLUEPRINT_DOCX", "BLUEPRINT_PDF"].every((kind) => artifacts.some((artifact) => artifact.kind === kind))) throw new Error("COMMERCIAL_PUBLICATION_MISSING");
    versionId = version.id;
  }
  // Retry/failed platform cost remains in B4; it is not charged to the customer.
  const costMicros = Math.ceil(entries.filter((e) => !e.retry && e.status === "completed").reduce((sum, e) => sum + (e.estimate ?? 0), 0) * 1e6);
  const charge = outcome === "COMPLETED" ? Math.min(r.credits, Math.ceil(costMicros / policy.creditUsdMicros)) : 0;
  const updated = await tx.commercialEntitlement.update({ where: { id: a.id }, data: { reservedSlots: { decrement: 1 }, reservedCredits: { decrement: r.credits }, consumedSlots: { increment: outcome === "COMPLETED" ? 1 : 0 }, consumedCredits: { increment: charge } } });
  await tx.commercialReservation.update({ where: { jobId }, data: { status: outcome === "COMPLETED" ? "SETTLED" : "RELEASED", chargedCredits: charge, blueprintVersionId: versionId, settledAt: new Date() } });
  const reason = outcome === "COMPLETED" ? "PUBLICATION_SUCCESS" : "PLATFORM_FAILURE";
  // Commercial cycles are not worker attempts: cancellation can happen before
  // the worker acquires a re-reserved job and increments its attempt counter.
  const cycle = await tx.commercialLedgerEntry.count({ where: { jobId, kind: "RESERVE", unit: "PLAN_SLOT" } });
  const key = `${outcome.toLowerCase()}:${r.id}:${cycle}`;
  await entry(tx, updated, key, outcome === "COMPLETED" ? "SETTLE" : "RELEASE", "PLAN_SLOT", outcome === "COMPLETED" ? 0 : 1, reason, jobId);
  await entry(tx, updated, key, outcome === "COMPLETED" ? "SETTLE" : "RELEASE", "COMPUTE_CREDIT", r.credits - charge, reason, jobId);
  await securityAudit("GENERATION_SETTLED", r.userId, { jobId, outcome, chargedCredits: charge }, tx);
}
export async function revokeEntitlement(tx: Tx, purchaseId: string, reason: string) {
  const found = await tx.commercialEntitlement.findUnique({ where: { purchaseId } });
  if (!found) return;
  await tx.$queryRaw`SELECT id FROM "CommercialEntitlement" WHERE id = ${found.id} FOR UPDATE`;
  const a = await tx.commercialEntitlement.findUniqueOrThrow({ where: { id: found.id } });
  if (a.status !== "ACTIVE") return;
  const status = a.consumedSlots || a.reservedSlots ? "REVIEW_REQUIRED" : "REVOKED";
  const updated = await tx.commercialEntitlement.update({ where: { id: a.id }, data: { status } });
  await entry(tx, updated, `reversal:${a.id}`, "REFUND_REVERSAL", "PLAN_SLOT", -available(a, "PLAN_SLOT"), reason);
  await entry(tx, updated, `reversal:${a.id}`, "REFUND_REVERSAL", "COMPUTE_CREDIT", -available(a, "COMPUTE_CREDIT"), reason);
  await securityAudit("ENTITLEMENT_REVERSED", a.userId, { purchaseId, reason, status }, tx);
}
export async function customerBalance(userId: string) {
  const accounts = await prisma.commercialEntitlement.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return { available: accounts.filter((a) => a.status === "ACTIVE").reduce((n, a) => n + available(a, "PLAN_SLOT"), 0),
    total: accounts.reduce((n, a) => n + a.grantedSlots, 0), reserved: accounts.reduce((n, a) => n + a.reservedSlots, 0), consumed: accounts.reduce((n, a) => n + a.consumedSlots, 0) };
}
export async function reconcileCommercialJobs() {
  const rows = await prisma.commercialReservation.findMany({ where: { status: { in: ["RESERVED", "COST_PENDING"] }, job: { status: { in: ["FAILED", "CANCELLED", "COMPLETED"] } } }, take: 100, orderBy: { createdAt: "asc" }, include: { job: { select: { status: true } } } });
  for (const row of rows) await prisma.$transaction((tx) => settleCommercialJob(tx, row.jobId, row.job.status === "COMPLETED" ? "COMPLETED" : "FAILED"));
  return rows.length;
}
