import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { provisionQaOverage, revokeQaOverage, type QaOverageRequest } from "@/server/mvp/qa-overage-provisioning";

// No default apply. Review the exact private JSON forecast before --apply.
async function main() {
  const args = process.argv.slice(2);
  if (args.some(value => !["--file", "--apply", "--revoke"].includes(value) && args[args.indexOf(value) - 1] !== "--file"))
    throw new Error("Usage: provision-qa-overage --file /private/request.json [--apply] [--revoke]");
  const file = args[args.indexOf("--file") + 1];
  if (!args.includes("--file") || !file) throw new Error("QA_OVERAGE_REQUEST_FILE_REQUIRED");
  const input = JSON.parse(await readFile(file, "utf8"));
  if (args.includes("--revoke")) {
    if (!args.includes("--apply")) { console.log(JSON.stringify({ dryRun: true, revoke: input.grantId })); return; }
    const result = await revokeQaOverage(input); console.log(JSON.stringify({ revoked: true, auditId: result.id })); return;
  }
  console.log(JSON.stringify(await provisionQaOverage(input as QaOverageRequest, args.includes("--apply")), null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "QA_OVERAGE_PROVISIONING_FAILED"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
