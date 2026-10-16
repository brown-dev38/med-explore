import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const standaloneGreenStarWhere = {
  starType: "GREEN", helperAssignmentId: null, participationId: null, redemptionId: null,
} satisfies Prisma.StarTransactionWhereInput;

export class GreenStarWorkError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function getStandaloneGreenStarRecords(yearId: string, query: string, requestedPage: number) {
  const where: Prisma.StarTransactionWhereInput = {
    ...standaloneGreenStarWhere, academicYearId: BigInt(yearId),
    ...(query ? { OR: [
      { reason: { contains: query } }, { user: { studentCode: { contains: query } } },
      { user: { firstname: { contains: query } } }, { user: { lastname: { contains: query } } },
      { user: { username: { contains: query } } },
    ] } : {}),
  };
  const total = await prisma.starTransaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const records = await prisma.starTransaction.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
    select: { id: true, reason: true, points: true, status: true, createdAt: true,
      user: { select: { firstname: true, lastname: true, username: true, studentCode: true } },
      approver: { select: { firstname: true, lastname: true, username: true } },
    },
  });
  return { records, total, page, totalPages };
}

export async function awardStandaloneGreenStar(input: { userId: string; academicYearId: string; description: string; requestId: string }, actorId: bigint) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize retries for this actor. The award and its request receipt commit together.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`;
        const actor = await tx.user.findFirst({ where: { id: actorId, isActive: true, userRoles: { some: { role: { name: { in: ["ADMIN", "ORGANIZER"] } } } } }, select: { id: true } });
        if (!actor) throw new GreenStarWorkError("ไม่มีสิทธิ์ให้ดาวสีเขียว", 403);
        const receipt = await tx.auditLog.findFirst({
          where: { actorId, action: "star.award_green_work", details: { path: "$.requestId", equals: input.requestId } },
          select: { entityId: true },
        });
        if (receipt) {
          const previous = receipt.entityId ? await tx.starTransaction.findUnique({ where: { id: receipt.entityId } }) : null;
          if (!previous || String(previous.userId) !== input.userId || String(previous.academicYearId) !== input.academicYearId || previous.reason !== input.description) {
            throw new GreenStarWorkError("คำขอนี้ถูกบันทึกแล้วด้วยข้อมูลอื่น กรุณารีเฟรชและตรวจสอบประวัติ", 409);
          }
          return { id: String(previous.id), points: previous.points, replayed: true };
        }
        const student = await tx.user.findFirst({ where: { id: BigInt(input.userId), isActive: true, userRoles: { some: { role: { name: "STUDENT" } } } }, select: { id: true } });
        if (!student) throw new GreenStarWorkError("เลือกได้เฉพาะนิสิตที่เปิดใช้งานเท่านั้น", 400);
        const year = await tx.academicYear.findUnique({ where: { id: BigInt(input.academicYearId) }, select: { id: true, status: true } });
        if (!year) throw new GreenStarWorkError("ไม่พบปีการศึกษา", 404);
        if (year.status === "CLOSED") throw new GreenStarWorkError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถเพิ่มดาวได้", 409);
        const star = await tx.starTransaction.create({ data: {
          userId: student.id, academicYearId: year.id, starType: "GREEN", points: 1,
          status: "APPROVED", approvedBy: actorId, approvedAt: new Date(), reason: input.description,
        } });
        await tx.auditLog.create({ data: {
          actorId, action: "star.award_green_work", entityType: "StarTransaction", entityId: star.id,
          details: { requestId: input.requestId, studentId: input.userId, academicYearId: input.academicYearId, description: input.description, points: 1 },
        } });
        return { id: String(star.id), points: 1, replayed: false };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
}
