import "server-only";
import { prisma } from "@/lib/prisma";
import { AnnualReportError } from "@/lib/annual-report-options";

const person = { id: true, username: true, firstname: true, lastname: true, studentCode: true } as const;
const LIMIT = 50000;

export async function loadAnnualReportData(academicYearId: string) {
  const id = BigInt(academicYearId);
  return prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id }, select: { id: true, code: true, status: true, startsOn: true, endsOn: true } });
    if (!year) throw new AnnualReportError("ไม่พบปีการศึกษา", 404);
    const generatedAt = new Date();
    const [activities, participations, helpers, stars, redemptions] = await Promise.all([
      tx.activity.findMany({
        where: { academicYearId: id }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
        select: { id: true, title: true, location: true, startsAt: true, endsAt: true, minMinutes: true, status: true, organizer: { select: person } },
      }),
      tx.participation.findMany({
        where: { activity: { academicYearId: id } }, orderBy: { id: "asc" }, take: LIMIT + 1,
        select: { id: true, activityId: true, status: true, eligibilityStatus: true, attendedMinutes: true, reviewNote: true,
          user: { select: person }, attendanceRecords: { select: { eventType: true, occurredAt: true, method: true } } },
      }),
      tx.helperAssignment.findMany({
        where: { activity: { academicYearId: id } }, orderBy: { id: "asc" }, take: LIMIT + 1,
        select: { id: true, activityId: true, status: true, description: true, student: { select: person } },
      }),
      tx.starTransaction.findMany({
        where: { academicYearId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
        select: { id: true, starType: true, points: true, status: true, reason: true, createdAt: true, approvedAt: true,
          participationId: true, helperAssignmentId: true, redemptionId: true, user: { select: person }, approver: { select: person } },
      }),
      tx.rewardRedemption.findMany({
        where: { academicYearId: id }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
        select: { id: true, costPoints: true, status: true, requestedAt: true, reviewedAt: true, redeemedAt: true, completedAt: true, reviewedBy: true,
          note: true, user: { select: person }, rewardTier: { select: { id: true, name: true } } },
      }),
    ]);
    if ([activities, participations, helpers, stars, redemptions].some((rows) => rows.length > LIMIT)) {
      throw new AnnualReportError("ข้อมูลปีนี้เกินขนาดที่รองรับ กรุณาติดต่อผู้ดูแลเพื่อแบ่งรายงาน", 413);
    }
    return { year, generatedAt, activities, participations, helpers, stars, redemptions };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}

export type AnnualReportData = Awaited<ReturnType<typeof loadAnnualReportData>>;
