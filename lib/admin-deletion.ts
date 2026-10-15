import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class DeletionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "DeletionError";
  }
}

export async function deleteUser(id: bigint, actorId: bigint) {
  if (id === actorId) throw new DeletionError("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้", 409);

  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findFirst({
      where: { id: actorId, isActive: true, userRoles: { some: { role: { name: "ADMIN" } } } },
      select: { id: true },
    });
    if (!actor) throw new DeletionError("เฉพาะ ADMIN เท่านั้นที่ลบผู้ใช้งานได้", 403);

    const current = await tx.user.findUnique({
      where: { id },
      select: {
        username: true, email: true, studentCode: true,
        userRoles: { select: { role: { select: { name: true } } } },
        _count: { select: {
          organizedActivities: true, participations: true, recordedAttendance: true,
          receivedStars: true, approvedStars: true, helperAssignments: true,
          createdAssignments: true, redemptions: true, surveys: true,
          auditLogs: true, createdQrSessions: true,
        } },
      },
    });
    if (!current) throw new DeletionError("ไม่พบผู้ใช้งาน", 404);

    if (current.userRoles.some((assignment) => assignment.role.name === "ADMIN")) {
      const remainingAdmins = await tx.user.count({ where: {
        id: { not: id }, isActive: true, userRoles: { some: { role: { name: "ADMIN" } } },
      } });
      if (!remainingAdmins) throw new DeletionError("ไม่สามารถลบ ADMIN คนสุดท้ายที่เปิดใช้งานได้", 409);
    }

    // reviewedBy is a scalar audit reference without a Prisma relation/FK.
    const reviewedParticipations = await tx.participation.count({ where: { reviewedBy: id } });
    if (Object.values(current._count).some((count) => count > 0) || reviewedParticipations > 0) {
      throw new DeletionError("ผู้ใช้นี้มีประวัติกิจกรรมหรือการทำรายการ ไม่สามารถลบได้ กรุณาปิดใช้งานบัญชีแทนเพื่อเก็บประวัติ", 409);
    }

    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
    await tx.auditLog.create({ data: {
      actorId, action: "user.delete", entityType: "User", entityId: id,
      details: {
        username: current.username, email: current.email, studentCode: current.studentCode,
        roles: current.userRoles.map((assignment) => assignment.role.name),
      },
    } });
    return { id: String(id) };
  }, { isolationLevel: "Serializable" });
}

async function deleteActivityData(tx: Prisma.TransactionClient, where: Prisma.ActivityWhereInput) {
  const stars = await tx.starTransaction.deleteMany({
    where: { OR: [{ participation: { activity: where } }, { helperAssignment: { activity: where } }] },
  });
  const attendance = await tx.attendanceRecord.deleteMany({ where: { participation: { activity: where } } });
  const qrSessions = await tx.qrSession.deleteMany({ where: { activity: where } });
  const surveys = await tx.surveyResponse.deleteMany({ where: { activity: where } });
  const participations = await tx.participation.deleteMany({ where: { activity: where } });
  const helpers = await tx.helperAssignment.deleteMany({ where: { activity: where } });
  const activities = await tx.activity.deleteMany({ where });
  return {
    stars: stars.count, attendance: attendance.count, qrSessions: qrSessions.count,
    surveys: surveys.count, participations: participations.count,
    helpers: helpers.count, activities: activities.count,
  };
}

export async function deleteActivity(id: bigint, actorId: bigint, allowHistory: boolean) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.activity.findUnique({ where: { id } });
    if (!current) throw new DeletionError("ไม่พบกิจกรรม", 404);
    if (!allowHistory) {
      if (current.status !== "DRAFT") throw new DeletionError("ลบได้เฉพาะกิจกรรมที่เป็นฉบับร่างเท่านั้น", 409);
      const participants = await tx.participation.count({ where: { activityId: id } });
      const helpers = await tx.helperAssignment.count({ where: { activityId: id } });
      if (participants > 0 || helpers > 0) throw new DeletionError("เฉพาะ ADMIN เท่านั้นที่ลบกิจกรรมที่มีผู้เข้าร่วมหรือผู้ช่วยงานได้", 409);
    }
    const deleted = await deleteActivityData(tx, { id });
    await tx.auditLog.create({
      data: {
        actorId, action: "activity.delete", entityType: "Activity", entityId: id,
        details: { title: current.title, status: current.status, academicYearId: String(current.academicYearId), deleted },
      },
    });
    return { id: String(id), deleted };
  });
}

export async function deleteAcademicYear(id: bigint, actorId: bigint) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.academicYear.findUnique({ where: { id } });
    if (!current) throw new DeletionError("ไม่พบปีการศึกษา", 404);
    const activityWhere = { academicYearId: id };
    // Delete ledger rows before their participation, helper, or redemption FKs.
    const stars = await tx.starTransaction.deleteMany({
      where: { OR: [
        { academicYearId: id },
        { participation: { activity: activityWhere } },
        { helperAssignment: { activity: activityWhere } },
        { redemption: { OR: [{ academicYearId: id }, { rewardTier: { academicYearId: id } }] } },
      ] },
    });
    const deletedActivities = await deleteActivityData(tx, activityWhere);
    const redemptions = await tx.rewardRedemption.deleteMany({
      where: { OR: [{ academicYearId: id }, { rewardTier: { academicYearId: id } }] },
    });
    const rewards = await tx.rewardTier.deleteMany({ where: { academicYearId: id } });
    await tx.academicYear.delete({ where: { id } });
    const deleted = { ...deletedActivities, stars: stars.count + deletedActivities.stars, redemptions: redemptions.count, rewards: rewards.count };
    await tx.auditLog.create({
      data: {
        actorId, action: "academic_year.delete", entityType: "AcademicYear", entityId: id,
        details: { code: current.code, status: current.status, deleted },
      },
    });
    return { id: String(id), deleted };
  });
}
