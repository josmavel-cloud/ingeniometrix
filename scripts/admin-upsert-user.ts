import { prisma } from "@/lib/prisma";
import { hashPassword, validatePassword } from "@/server/auth/password";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function shouldAssignAllProjects() {
  return process.env.ADMIN_ASSIGN_ALL_PROJECTS === "1";
}

async function main() {
  const email = getRequiredEnv("ADMIN_USER_EMAIL").toLowerCase();
  const password = getRequiredEnv("ADMIN_USER_PASSWORD");
  const name = getOptionalEnv("ADMIN_USER_NAME");
  const locale = getOptionalEnv("ADMIN_USER_LOCALE") ?? "es-PE";

  if (!validatePassword(password)) {
    throw new Error("ADMIN_USER_PASSWORD must have at least 12 characters.");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      locale,
      passwordHash,
    },
    create: {
      email,
      name,
      locale,
      passwordHash,
    },
  });

  let reassignedProjects = 0;
  let reassignedAuditLogs = 0;

  if (shouldAssignAllProjects()) {
    const projectUpdate = await prisma.project.updateMany({
      where: {
        userId: {
          not: user.id,
        },
      },
      data: {
        userId: user.id,
      },
    });
    const auditUpdate = await prisma.auditLog.updateMany({
      where: {
        userId: {
          not: user.id,
        },
      },
      data: {
        userId: user.id,
      },
    });
    reassignedProjects = projectUpdate.count;
    reassignedAuditLogs = auditUpdate.count;
  }

  console.log(JSON.stringify({
    userId: user.id,
    email: user.email,
    reassignedProjects,
    reassignedAuditLogs,
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
