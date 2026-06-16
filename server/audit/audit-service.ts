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

function stripNullBytes(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripNullBytes(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, stripNullBytes(nestedValue)]),
    );
  }

  return value;
}

export async function logAuditEvent(input: LogEventInput) {
  await prisma.auditLog.create({
    data: {
      eventType: input.eventType,
      actorType: input.actorType,
      provider: input.provider,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: stripNullBytes(input.payloadJson) as Prisma.InputJsonValue,
    },
  });
}
