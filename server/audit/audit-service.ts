import { Prisma, type ActorType, type Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type LogEventInput = {
  eventType: string;
  actorType: ActorType;
  provider?: Provider;
  userId?: string;
  projectId?: string;
  payloadJson: Prisma.InputJsonValue;
};

export async function logAuditEvent(input: LogEventInput) {
  await prisma.auditLog.create({
    data: {
      eventType: input.eventType,
      actorType: input.actorType,
      provider: input.provider,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: input.payloadJson,
    },
  });
}
