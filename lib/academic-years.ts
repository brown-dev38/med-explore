import "server-only";
import type { AcademicYear, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AcademicYearDto } from "@/types/academic-year";

export type { AcademicYearDto } from "@/types/academic-year";

export const YEAR_END_STAR_REASON = "ล้างยอดดาวเมื่อปิดปีการศึกษา";

export class AcademicYearError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function toAcademicYearDto(year: AcademicYear): AcademicYearDto {
  return {
    id: String(year.id),
    code: year.code,
    startsOn: year.startsOn.toISOString().slice(0, 10),
    endsOn: year.endsOn.toISOString().slice(0, 10),
    status: year.status,
    createdAt: year.createdAt.toISOString(),
  };
}

async function closeAcademicYear(tx: Prisma.TransactionClient, year: AcademicYear, actorId: bigint) {
  const closedRewards = await tx.rewardTier.updateMany({
    where: { academicYearId: year.id, isActive: true }, data: { isActive: false },
  });
  if (year.status === "CLOSED") return;
  const now = new Date();
  const pending = await tx.rewardRedemption.findMany({
    where: { academicYearId: year.id, status: "PENDING" },
    include: { ledgerTransaction: true }, orderBy: { id: "asc" },
  });

  for (const redemption of pending) {
    const ledger = redemption.ledgerTransaction;
    if (!ledger || ledger.status !== "PENDING" || ledger.points !== -redemption.costPoints
      || ledger.userId !== redemption.userId || ledger.academicYearId !== year.id) {
      throw new AcademicYearError("พบคำขอแลกรางวัลที่ข้อมูลการจองดาวไม่ตรงกัน กรุณาตรวจสอบก่อนปิดปีการศึกษา", 409);
    }
    await tx.rewardRedemption.update({
      where: { id: redemption.id, status: "PENDING" },
      data: { status: "CANCELLED", reviewedBy: actorId, reviewedAt: now, note: "ยกเลิกอัตโนมัติเนื่องจากปิดปีการศึกษา" },
    });
    await tx.starTransaction.update({
      where: { id: ledger.id, status: "PENDING" },
      data: { status: "REJECTED", approvedBy: actorId, approvedAt: now },
    });
    await tx.rewardTier.updateMany({
      where: { id: redemption.rewardTierId, stockQuantity: { not: null } },
      data: { stockQuantity: { increment: 1 } },
    });
    await tx.auditLog.create({ data: {
      actorId, action: "reward.cancelled_year_close", entityType: "RewardRedemption", entityId: redemption.id,
      details: { academicYearId: String(year.id), userId: String(redemption.userId), costPoints: redemption.costPoints },
    } });
  }

  // Preserve awards and redemptions; offset each remaining balance with a separate ledger entry.
  const balances = await tx.starTransaction.groupBy({
    by: ["userId"], where: { academicYearId: year.id, status: "APPROVED" }, _sum: { points: true },
  });
  const adjustments = balances.filter((row) => (row._sum.points ?? 0) !== 0).map((row) => ({
    userId: row.userId, academicYearId: year.id, starType: "ADJUSTMENT" as const,
    points: -(row._sum.points ?? 0), status: "APPROVED" as const,
    reason: YEAR_END_STAR_REASON, approvedBy: actorId, approvedAt: now,
  }));
  if (adjustments.length > 0) await tx.starTransaction.createMany({ data: adjustments });
  await tx.academicYear.update({ where: { id: year.id }, data: { status: "CLOSED" } });
  await tx.auditLog.create({ data: {
    actorId, action: "academic_year.close", entityType: "AcademicYear", entityId: year.id,
    details: { code: year.code, closedRewards: closedRewards.count, cancelledRequests: pending.length, clearedUsers: adjustments.length,
      expiredStars: adjustments.reduce((sum, row) => sum + Math.max(0, -row.points), 0) },
  } });
}

export async function updateAcademicYear(id: bigint, data: Prisma.AcademicYearUpdateInput, actorId: bigint): Promise<AcademicYear> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize year switches and repeated close requests before reading balances.
        await tx.$queryRaw`SELECT id FROM academic_years ORDER BY id FOR UPDATE`;
        const current = await tx.academicYear.findUnique({ where: { id } });
        if (!current) throw new AcademicYearError("ไม่พบปีการศึกษา", 404);
        const status = typeof data.status === "string" ? data.status : undefined;
        const editsDetails = data.code !== undefined || data.startsOn !== undefined || data.endsOn !== undefined;
        if (current.status === "CLOSED" && editsDetails && status !== "DRAFT" && status !== "ACTIVE") {
          throw new AcademicYearError("ปีการศึกษาที่ปิดแล้วไม่สามารถแก้ไขได้", 409);
        }
        const start = data.startsOn instanceof Date ? data.startsOn : current.startsOn;
        const end = data.endsOn instanceof Date ? data.endsOn : current.endsOn;
        if (start >= end) throw new AcademicYearError("วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด", 400);
        if (status === "ACTIVE") {
          const previous = await tx.academicYear.findMany({ where: { status: "ACTIVE", id: { not: id } }, orderBy: { id: "asc" } });
          for (const year of previous) await closeAcademicYear(tx, year, actorId);
        }
        if (status === "CLOSED") await closeAcademicYear(tx, current, actorId);
        const updated = await tx.academicYear.update({ where: { id }, data });
        await tx.auditLog.create({ data: {
          actorId, action: "academic_year.update", entityType: "AcademicYear", entityId: id,
          details: { code: updated.code, status: updated.status },
        } });
        return updated;
      }, { isolationLevel: "Serializable", timeout: 60000 });
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string | number; driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } } };
      const cause = failure.meta?.driverAdapterError?.cause;
      const conflict = failure.code === "P2034" || failure.code === "P2025" || (failure.code === "P2010" && (
        cause?.kind === "TransactionWriteConflict" || ["1213", "1205"].includes(String(failure.meta?.code ?? cause?.originalCode))
      ));
      if (conflict && attempt < 3) continue;
      if (conflict) throw new AcademicYearError("มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองใหม่", 409);
      throw error;
    }
  }
}

export async function setActiveAcademicYear(id: bigint, actorId: bigint): Promise<AcademicYear> {
  return updateAcademicYear(id, { status: "ACTIVE" }, actorId);
}
