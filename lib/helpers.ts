import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import type {
  HelperAssignmentDto,
  StudentStarSummaryDto,
} from "@/types/activity";

export type HelperWithRelations = Prisma.HelperAssignmentGetPayload<{
  include: {
    student: true;
    activity: true;
    starTransactions: true;
  };
}>;

export function toHelperAssignmentDto(
  helper: HelperWithRelations,
): HelperAssignmentDto {
  const name =
    [helper.student.firstname, helper.student.lastname]
      .filter(Boolean)
      .join(" ") || helper.student.username;

  const greenStar = helper.starTransactions.find(
    (star) => star.starType === "GREEN" && star.status === "APPROVED",
  );

  return {
    id: String(helper.id),
    activityId: String(helper.activityId),
    userId: String(helper.userId),
    userName: name,
    studentCode: helper.student.studentCode,
    email: helper.student.email,
    assignedBy: String(helper.assignedBy),
    status: helper.status,
    description: helper.description,
    completedAt: helper.completedAt ? helper.completedAt.toISOString() : null,
    greenStarAwarded: Boolean(greenStar),
    greenStarPoints: greenStar ? greenStar.points : 0,
    createdAt: helper.createdAt.toISOString(),
  };
}

export async function getHelpersForActivity(
  activityId: bigint,
): Promise<HelperAssignmentDto[]> {
  const helpers = await prisma.helperAssignment.findMany({
    where: { activityId },
    include: {
      student: true,
      activity: true,
      starTransactions: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return helpers.map(toHelperAssignmentDto);
}

export async function getHelperCandidates(
  activityId: bigint,
  query?: string,
) {
  const assigned = await prisma.helperAssignment.findMany({
    where: { activityId },
    select: { userId: true },
  });
  const excludedIds = assigned.map((h) => h.userId);

  const q = query?.trim();
  const where: Prisma.UserWhereInput = {
    id: { notIn: excludedIds },
    isActive: true,
    userRoles: { some: { role: { name: "STUDENT" } } },
  };

  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      { studentCode: { contains: q } },
      { firstname: { contains: q } },
      { lastname: { contains: q } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return users.map((u) => ({
    id: String(u.id),
    name: [u.firstname, u.lastname].filter(Boolean).join(" ") || u.username,
    studentCode: u.studentCode,
    email: u.email,
  }));
}

export async function assignHelper(
  activityId: bigint,
  userId: bigint,
  assignedBy: bigint,
  description?: string | null,
): Promise<HelperAssignmentDto> {
  const helper = await prisma.helperAssignment.create({
    data: {
      activityId,
      userId,
      assignedBy,
      status: "ASSIGNED",
      description: description?.trim() || null,
    },
    include: {
      student: true,
      activity: true,
      starTransactions: true,
    },
  });

  await recordAudit({
    actorId: assignedBy,
    action: "helper.assign",
    entityType: "helper_assignment",
    entityId: helper.id,
    details: {
      activityId: String(activityId),
      studentId: String(userId),
      description: description ?? null,
    },
  });

  return toHelperAssignmentDto(helper);
}

export async function bulkAssignHelpers(
  activityId: bigint,
  userIds: bigint[],
  assignedBy: bigint,
  description?: string | null,
): Promise<{ added: number }> {
  // ดึงคนที่มอบหมายไปแล้ว
  const existing = await prisma.helperAssignment.findMany({
    where: {
      activityId,
      userId: { in: userIds },
    },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((h) => String(h.userId)));
  const toAdd = userIds.filter((id) => !existingSet.has(String(id)));

  if (toAdd.length === 0) {
    return { added: 0 };
  }

  await prisma.$transaction(
    toAdd.map((userId) =>
      prisma.helperAssignment.create({
        data: {
          activityId,
          userId,
          assignedBy,
          status: "ASSIGNED",
          description: description?.trim() || null,
        },
      }),
    ),
  );

  await recordAudit({
    actorId: assignedBy,
    action: "helper.bulk_assign",
    entityType: "helper_assignment",
    entityId: activityId,
    details: {
      activityId: String(activityId),
      addedCount: toAdd.length,
      userIds: toAdd.map(String),
    },
  });

  return { added: toAdd.length };
}

export async function updateHelperStatusAndStar(
  helperId: bigint,
  status: "ASSIGNED" | "COMPLETED" | "CANCELLED",
  actorId: bigint,
  description?: string | null,
): Promise<HelperAssignmentDto> {
  const current = await prisma.helperAssignment.findUnique({
    where: { id: helperId },
    include: { activity: true },
  });

  if (!current) {
    throw new Error("NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();

    if (status === "COMPLETED") {
      // อัปเดตสถานะเป็นเสร็จสิ้น
      await tx.helperAssignment.update({
        where: { id: helperId },
        data: {
          status: "COMPLETED",
          completedAt: now,
          reviewedAt: now,
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
        },
      });

      // มอบดาวเขียว (1 ดาว)
      await tx.starTransaction.upsert({
        where: {
          helperAssignmentId_starType: {
            helperAssignmentId: helperId,
            starType: "GREEN",
          },
        },
        create: {
          userId: current.userId,
          academicYearId: current.activity.academicYearId,
          helperAssignmentId: helperId,
          starType: "GREEN",
          points: 1,
          status: "APPROVED",
          approvedBy: actorId,
          approvedAt: now,
          reason: `ช่วยเหลือกิจกรรม: ${current.activity.title}`,
        },
        update: {
          status: "APPROVED",
          approvedBy: actorId,
          approvedAt: now,
          points: 1,
        },
      });

      await recordAudit({
        actorId,
        action: "star.award_green",
        entityType: "helper_assignment",
        entityId: helperId,
        details: {
          activityId: String(current.activityId),
          studentId: String(current.userId),
          points: 1,
        },
      });

      // ดึงข้อมูลพร้อม star transactions ล่าสุด
      return tx.helperAssignment.findUniqueOrThrow({
        where: { id: helperId },
        include: {
          student: true,
          activity: true,
          starTransactions: true,
        },
      });
    }

    if (status === "CANCELLED") {
      // ยกเลิกการช่วยงาน และยกเลิก/ลบดาวเขียว
      await tx.starTransaction.deleteMany({
        where: {
          helperAssignmentId: helperId,
          starType: "GREEN",
        },
      });

      const updated = await tx.helperAssignment.update({
        where: { id: helperId },
        data: {
          status: "CANCELLED",
          completedAt: null,
          reviewedAt: null,
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
        },
        include: {
          student: true,
          activity: true,
          starTransactions: true,
        },
      });

      await recordAudit({
        actorId,
        action: "helper.cancel",
        entityType: "helper_assignment",
        entityId: helperId,
        details: {
          activityId: String(current.activityId),
          studentId: String(current.userId),
        },
      });

      return updated;
    }

    // กรณีเปลี่ยนกลับเป็น ASSIGNED
    await tx.starTransaction.deleteMany({
      where: {
        helperAssignmentId: helperId,
        starType: "GREEN",
      },
    });

    return tx.helperAssignment.update({
      where: { id: helperId },
      data: {
        status: "ASSIGNED",
        completedAt: null,
        reviewedAt: null,
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
      include: {
        student: true,
        activity: true,
        starTransactions: true,
      },
    });
  });

  return toHelperAssignmentDto(result);
}

export async function removeHelper(
  helperId: bigint,
  actorId: bigint,
): Promise<void> {
  const current = await prisma.helperAssignment.findUnique({
    where: { id: helperId },
    include: { starTransactions: true },
  });

  if (!current) {
    throw new Error("NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    // ลบ star transactions ที่ผูกกันถ้ามี
    await tx.starTransaction.deleteMany({
      where: { helperAssignmentId: helperId },
    });

    await tx.helperAssignment.delete({
      where: { id: helperId },
    });
  });

  await recordAudit({
    actorId,
    action: "helper.remove",
    entityType: "helper_assignment",
    entityId: helperId,
    details: {
      activityId: String(current.activityId),
      studentId: String(current.userId),
    },
  });
}

const REWARD_TIERS = [
  { targetStars: 3, name: "สมุดหรือชุดเครื่องเขียน" },
  { targetStars: 6, name: "ชุดอุปกรณ์การเรียน" },
  { targetStars: 9, name: "กระเป๋าผ้าหรือแก้วน้ำ" },
  { targetStars: 12, name: "ชุดของรางวัลโครงการ" },
];

export async function getStudentStarSummary(
  userId: bigint,
): Promise<StudentStarSummaryDto> {
  // หาปีการศึกษาที่ ACTIVE (หรือปีล่าสุด)
  const activeYear = await prisma.academicYear.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startsOn: "desc" },
  });

  const yearFilter = activeYear ? { academicYearId: activeYear.id } : {};

  const [stars, activitiesCount, helpersCount] = await Promise.all([
    prisma.starTransaction.findMany({
      where: {
        userId,
        status: "APPROVED",
        ...yearFilter,
      },
    }),
    prisma.participation.count({
      where: {
        userId,
        ...(activeYear ? { activity: { academicYearId: activeYear.id } } : {}),
      },
    }),
    prisma.helperAssignment.count({
      where: {
        userId,
        status: "COMPLETED",
        ...(activeYear ? { activity: { academicYearId: activeYear.id } } : {}),
      },
    }),
  ]);

  const yellowStars = stars
    .filter((s) => s.starType === "YELLOW")
    .reduce((sum, s) => sum + s.points, 0);

  const greenStars = stars
    .filter((s) => s.starType === "GREEN")
    .reduce((sum, s) => sum + s.points, 0);

  const totalStars = yellowStars + greenStars;

  // คำนวณระดับรางวัลถัดไป
  const nextTarget = REWARD_TIERS.find((tier) => tier.targetStars > totalStars);
  const targetTier = nextTarget
    ? {
        name: nextTarget.name,
        targetStars: nextTarget.targetStars,
        remaining: Math.max(0, nextTarget.targetStars - totalStars),
      }
    : {
        name: REWARD_TIERS[REWARD_TIERS.length - 1].name,
        targetStars: 12,
        remaining: 0,
      };

  return {
    yellowStars,
    greenStars,
    totalStars,
    academicYearCode: activeYear ? activeYear.code : null,
    targetTier,
    activitiesCount,
    helpersCount: helpersCount + stars.filter((star) => star.starType === "GREEN" && star.points > 0 && star.helperAssignmentId === null && star.participationId === null && star.redemptionId === null).length,
  };
}
