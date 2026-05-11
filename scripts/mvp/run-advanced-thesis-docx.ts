import { prisma } from "@/lib/prisma";
import { runAdvancedThesisDocxPipeline } from "@/server/mvp/advanced-thesis-docx-service";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const projectId = readArg("project") ?? readArg("projectId");
  const email = readArg("email") ?? "mvp-human-selection@ingeniometrix.local";
  if (!projectId) {
    throw new Error("Uso: tsx scripts/mvp/run-advanced-thesis-docx.ts --project=<projectId> [--email=<email>]");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const result = await runAdvancedThesisDocxPipeline({ userId: user.id, projectId });
  console.log(JSON.stringify({
    ok: result.ok,
    projectId: result.projectId,
    blueprintVersionId: result.blueprintVersionId,
    outputPath: result.outputPath,
    coverPath: result.coverPath,
    qaPath: result.qaPath,
    qa: {
      passed: result.qa.passed,
      score_100: result.qa.score_100,
      failures: result.qa.failures,
      warnings: result.qa.warnings,
      metrics: result.qa.metrics,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
