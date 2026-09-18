import { ProjectStatus, type User } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { saveIntakeForProject } from "@/server/projects/project-service";

import { seismicEngineeringFixture } from "../fixtures/seismic-engineering-intake";

export async function ensureStep1FixtureUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    create: { email, name, locale: "es-PE" },
    update: { name, locale: "es-PE" },
  });
}

export async function createStep1FixtureProject(input: {
  user: User;
  label: string;
  withIntake?: boolean;
  intakeOverride?: Partial<typeof seismicEngineeringFixture.intake>;
}) {
  const project = await prisma.project.create({
    data: {
      userId: input.user.id,
      status: ProjectStatus.DRAFT,
      ...seismicEngineeringFixture.project,
      title: `${seismicEngineeringFixture.project.title} (${input.label})`,
    },
  });

  if (input.withIntake !== false) {
    await saveIntakeForProject(input.user.id, project.id, {
      ...seismicEngineeringFixture.intake,
      ...(input.intakeOverride ?? {}),
    });
  }

  return project;
}
