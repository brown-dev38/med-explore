import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recordAudit(params: {
  actorId?: bigint | null;
  action: string;
  entityType: string;
  entityId?: bigint | null;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      details: params.details,
    },
  });
}
