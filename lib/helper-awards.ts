import type { Prisma } from "@prisma/client";

// Call inside a serializable transaction so only newly added helpers receive stars.
export async function createCompletedHelpers(
  tx: Prisma.TransactionClient,
  activity: { id: bigint; academicYearId: bigint; title: string },
  userIds: bigint[],
  actorId: bigint,
  description?: string | null,
) {
  const existing = await tx.helperAssignment.findMany({
    where: { activityId: activity.id, userId: { in: userIds } }, select: { userId: true },
  });
  const existingIds = new Set(existing.map((helper) => String(helper.userId)));
  const newIds = [...new Set(userIds)].filter((id) => !existingIds.has(String(id)));
  if (!newIds.length) return { count: 0 };
  const now = new Date();
  const result = await tx.helperAssignment.createMany({ data: newIds.map((userId) => ({
    activityId: activity.id, userId, assignedBy: actorId,
    status: "COMPLETED", completedAt: now, reviewedAt: now, description: description?.trim() || null,
  })) });
  const helpers = await tx.helperAssignment.findMany({
    where: { activityId: activity.id, userId: { in: newIds } }, select: { id: true, userId: true },
  });
  await tx.starTransaction.createMany({ data: helpers.map((helper) => ({
    userId: helper.userId, academicYearId: activity.academicYearId, helperAssignmentId: helper.id,
    starType: "GREEN", points: 1, status: "APPROVED", approvedBy: actorId, approvedAt: now,
    reason: `ช่วยเหลือกิจกรรม: ${activity.title}`,
  })) });
  return result;
}
