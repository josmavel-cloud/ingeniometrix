import { prisma } from "@/lib/prisma";
import { runMvpFinalDocxPipeline } from "@/server/mvp/final-docx-service";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const projectId = readArg("project") ?? readArg("projectId");
  const email = readArg("email") ?? "mvp-human-selection@ingeniometrix.local";

  if (!projectId) {
    throw new Error("Uso: tsx scripts/mvp/run-final-docx.ts --project=<projectId> [--email=<userEmail>]");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const result = await runMvpFinalDocxPipeline({
    userId: user.id,
    projectId,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
