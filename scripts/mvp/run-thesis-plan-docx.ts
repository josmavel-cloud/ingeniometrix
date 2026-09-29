import { prisma } from "@/lib/prisma";
import { runMvpThesisPlanDocx } from "@/server/mvp/thesis-plan-docx-service";

const DEFAULT_PROJECT_ID = "76a48983-0d2c-404e-b3da-0d7f3f4cc866";
const DEFAULT_EMAIL = "mvp-normalized-discovery@ingeniometrix.local";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const projectId = argValue("project") ?? DEFAULT_PROJECT_ID;
  const email = argValue("email") ?? DEFAULT_EMAIL;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error(`Usuario no encontrado: ${email}`);
  }

  const result = await runMvpThesisPlanDocx({ userId: user.id, projectId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
