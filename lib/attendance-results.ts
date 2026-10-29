import "server-only";
import type { Prisma } from "@prisma/client";
import { calculateAttendedMinutes, YELLOW_STAR_YEAR_LIMIT } from "@/lib/attendance-calculation";

export async function lockAttendanceUser(tx: Prisma.TransactionClient, participationId: bigint) {
  const participation = await tx.participation.findUnique({ where: { id: participationId }, select: { userId: true } });
  if (!participation) return false;
  // Serialize awards for one user across different activities, not just one attendance pair.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${participation.userId} FOR UPDATE`;
  return true;
}

export async function evaluateAttendance(tx: Prisma.TransactionClient, participationId: bigint, actorId: bigint | null, now = new Date()) {
  const participation = await tx.participation.findUniqueOrThrow({
    where: { id: participationId },
    include: { activity: true, attendanceRecords: true, user: { include: { userRoles: { include: { role: true } } } } },
  });
  const manuallyRejected = participation.eligibilityStatus === "REJECTED" && participation.reviewedBy != null;
  const checkIn = participation.attendanceRecords.find((record) => record.eventType === "CHECK_IN");
  const checkOut = participation.attendanceRecords.find((record) => record.eventType === "CHECK_OUT");
  const invalidOrder = Boolean(checkIn && checkOut && checkOut.occurredAt < checkIn.occurredAt);
  const attendedMinutes = invalidOrder ? 0 : calculateAttendedMinutes(checkIn?.occurredAt ?? null, checkOut?.occurredAt ?? null);
  let reviewDueAt = participation.reviewDueAt;
  if (checkIn && !reviewDueAt && !manuallyRejected) {
    const session = await tx.qrSession.findFirst({
      where: { activityId: participation.activityId, purpose: "CHECK_IN", createdAt: { lte: checkIn.occurredAt }, expiresAt: { gt: checkIn.occurredAt },
        OR: [{ revokedAt: null }, { revokedAt: { gt: checkIn.occurredAt } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { expiresAt: true },
    });
    reviewDueAt = session?.expiresAt ?? participation.activity.endsAt;
  }
  const checkedIn = Boolean(checkIn && checkIn.occurredAt <= now);
  const due = checkedIn && Boolean(reviewDueAt && reviewDueAt <= now);
  const student = participation.user.userRoles.some((assignment) => assignment.role.name === "STUDENT");
  const openActivity = participation.activity.status === "PUBLISHED" || participation.activity.status === "COMPLETED";
  const eligible = !manuallyRejected && due && student && openActivity;
  const status = checkedIn ? "ATTENDED" : "REGISTERED";
  const eligibilityStatus = manuallyRejected ? "REJECTED" : !checkedIn || !due ? "PENDING" : eligible ? "APPROVED" : "REJECTED";
  let message = manuallyRejected ? participation.reviewNote ?? "ผู้จัดยกเลิกการให้ดาวสีเหลือง"
    : !checkedIn ? "รอเช็คอินกิจกรรม"
    : !due ? "เช็คอินแล้ว รอ QR Code หมดอายุเพื่อรับดาวสีเหลืองอัตโนมัติ"
    : !student ? "ดาวสีเหลืองสำหรับผู้เข้าร่วมที่มีบทบาท STUDENT เท่านั้น"
    : !openActivity ? "กิจกรรมฉบับร่างหรือถูกยกเลิกไม่ให้ดาวสีเหลือง"
    : "ได้รับดาวสีเหลืองอัตโนมัติ 1 ดาว";

  const existing = await tx.starTransaction.findUnique({
    where: { participationId_starType: { participationId, starType: "YELLOW" } },
  });
  let awarded = eligible;
  if (eligible) {
    const used = await tx.starTransaction.aggregate({
      where: { userId: participation.userId, academicYearId: participation.activity.academicYearId,
        starType: "YELLOW", status: "APPROVED", ...(existing ? { id: { not: existing.id } } : {}) },
      _sum: { points: true },
    });
    awarded = (used._sum.points ?? 0) < YELLOW_STAR_YEAR_LIMIT;
    if (!awarded) message = `เช็คอินแล้ว แต่ได้รับดาวสีเหลืองครบ ${YELLOW_STAR_YEAR_LIMIT} ดาวในปีการศึกษานี้แล้ว`;
  }

  if (existing || eligible) {
    const starStatus = awarded ? "APPROVED" : "REJECTED";
    if (!existing || existing.status !== starStatus || existing.points !== 1 || existing.reason !== message) {
      const star = await tx.starTransaction.upsert({
        where: { participationId_starType: { participationId, starType: "YELLOW" } },
        create: {
          userId: participation.userId, academicYearId: participation.activity.academicYearId,
          participationId, starType: "YELLOW", points: 1, status: starStatus,
          reason: message, approvedAt: awarded ? now : null,
        },
        update: { points: 1, status: starStatus, reason: message, approvedBy: null, approvedAt: awarded ? existing?.approvedAt ?? now : null },
      });
      await tx.auditLog.create({ data: {
        actorId, action: awarded ? "star.auto_award" : existing?.status === "APPROVED" ? "star.auto_revoke" : "star.auto_evaluate",
        entityType: "StarTransaction", entityId: star.id,
        details: { participationId: String(participationId), academicYearId: String(participation.activity.academicYearId), reviewDueAt: reviewDueAt?.toISOString() ?? null, status: starStatus, points: 1, reason: message },
      } });
    }
  }

  await tx.participation.update({ where: { id: participationId }, data: {
    attendedMinutes, status, eligibilityStatus, reviewNote: message, reviewDueAt: manuallyRejected ? null : reviewDueAt,
    reviewedAt: manuallyRejected ? participation.reviewedAt : due ? now : null, reviewedBy: manuallyRejected ? participation.reviewedBy : null,
  } });
  return { attendedMinutes, status, eligibilityStatus, yellowStarPoints: awarded ? 1 : 0, message };
}
