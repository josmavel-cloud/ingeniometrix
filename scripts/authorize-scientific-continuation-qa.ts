/** Trusted operational command. Grants one continuation; never starts a job or a provider call. */
import { prisma } from "@/lib/prisma";
import { authorizeScientificContinuationQa, inspectScientificContinuationReadiness } from "@/server/mvp/scientific-continuation";

function argument(name: string) {
  const position = process.argv.indexOf(`--${name}`);
  const value = position >= 0 ? process.argv[position + 1] : undefined;
  if (!value?.trim() || value.startsWith("--")) throw new Error(`Required argument: --${name}`);
  return value;
}
async function main() {
  const input = { userId: argument("user-id"), projectId: argument("project-id"), parentJobId: argument("parent-job-id"),
    issuedBy: argument("authority"), reason: argument("reason"), extendCampaign48Hours: process.argv.includes("--extend-48-hours") };
  const preflight = await inspectScientificContinuationReadiness(input.userId, input.projectId, input.parentJobId);
  const grant = await authorizeScientificContinuationQa(input);
  console.log(JSON.stringify({ grantAuditId: grant.id, grantedAt: grant.createdAt, preflight,
    jobCreated: false, providerCalls: 0, previousAttemptsUnchanged: true, previousUsageUnchanged: true }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Continuation authorization failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
