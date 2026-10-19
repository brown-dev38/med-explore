import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RedemptionCreateInput, RedemptionReviewInput, RewardCreateInput, RewardUpdateInput } from "@/lib/reward-validation";
import type { RedemptionDto, RedemptionStatus, RewardBalance, RewardDto } from "@/types/reward";
import type { RewardImageChange } from "@/lib/reward-images";

export class RewardError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function transact<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string | number; driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } } };
      const adapterCause = failure.meta?.driverAdapterError?.cause;
      const conflict = failure.code === "P2034" || (failure.code === "P2010" && (
        adapterCause?.kind === "TransactionWriteConflict" || ["1213", "1205"].includes(String(failure.meta?.code ?? adapterCause?.originalCode))
      ));
      if (conflict && attempt < 3) continue;
      if (conflict) throw new RewardError("มีคำขอพร้อมกันหลายรายการ กรุณาลองใหม่", 409);
      throw error;
    }
  }
}

async function requireLiveRole(tx: Prisma.TransactionClient, actorId: bigint, roles: string[]) {
  const actor = await tx.user.findFirst({
    where: { id: actorId, isActive: true, userRoles: { some: { role: { name: { in: roles } } } } },
    select: { id: true },
  });
  if (!actor) throw new RewardError("ไม่มีสิทธิ์ดำเนินการหรือบัญชีถูกระงับ", 403);
}

async function lockReward(tx: Prisma.TransactionClient, id: bigint) {
  await tx.$queryRaw`SELECT id FROM reward_tiers WHERE id = ${id} FOR UPDATE`;
  const reward = await tx.rewardTier.findUnique({ where: { id }, omit: { imageData: true } });
  if (!reward) throw new RewardError("ไม่พบของรางวัล", 404);
  return reward;
}

export async function rewardBalance(
  userId: bigint, academicYearId: bigint, tx: Pick<Prisma.TransactionClient, "starTransaction"> = prisma,
): Promise<RewardBalance> {
  const [approved, pending] = await Promise.all([
    tx.starTransaction.aggregate({ where: { userId, academicYearId, academicYear: { status: { not: "CLOSED" } }, status: "APPROVED" }, _sum: { points: true } }),
    tx.starTransaction.aggregate({ where: { userId, academicYearId, academicYear: { status: { not: "CLOSED" } }, status: "PENDING", redemptionId: { not: null }, points: { lt: 0 } }, _sum: { points: true } }),
  ]);
  const balance = approved._sum.points ?? 0;
  const reserved = Math.max(0, -(pending._sum.points ?? 0));
  return { balance, reserved, available: Math.max(0, balance - reserved) };
}

export async function rewardCatalog(academicYearId: bigint): Promise<RewardDto[]> {
  const rewards = await prisma.rewardTier.findMany({
    where: { academicYearId, deletedAt: null },
    orderBy: [{ costPoints: "asc" }, { id: "asc" }],
    include: { academicYear: { select: { status: true } }, _count: { select: { redemptions: { where: { status: "PENDING" } } } } },
    omit: { imageData: true },
  });
  return rewards.map((reward) => ({
    id: String(reward.id), academicYearId: String(reward.academicYearId), name: reward.name,
    description: reward.description, imageUrl: reward.imageUpdatedAt ? `/api/rewards/${reward.id}/image?v=${reward.imageUpdatedAt.getTime()}` : null,
    costPoints: reward.costPoints, stockQuantity: reward.stockQuantity,
    isActive: reward.isActive && reward.academicYear.status !== "CLOSED", pendingQuantity: reward._count.redemptions,
  }));
}

export async function createReward(input: RewardCreateInput, actorId: bigint, image?: RewardImageChange) {
  return transact(async (tx) => {
    await requireLiveRole(tx, actorId, ["ADMIN", "ORGANIZER"]);
    const year = await tx.academicYear.findUnique({ where: { id: BigInt(input.academicYearId) } });
    if (!year) throw new RewardError("ไม่พบปีการศึกษา", 404);
    if (year.status === "CLOSED" && input.isActive) throw new RewardError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถเปิดแลกรางวัลได้", 409);
    const reward = await tx.rewardTier.create({ data: { ...input, ...image, academicYearId: BigInt(input.academicYearId) }, select: { id: true } });
    await tx.auditLog.create({ data: { actorId, action: "reward.create", entityType: "RewardTier", entityId: reward.id, details: input } });
    return { id: String(reward.id) };
  });
}

export async function updateReward(id: bigint, input: RewardUpdateInput, actorId: bigint, image?: RewardImageChange) {
  return transact(async (tx) => {
    await requireLiveRole(tx, actorId, ["ADMIN", "ORGANIZER"]);
    const reward = await lockReward(tx, id);
    if (reward.deletedAt) throw new RewardError("รางวัลนี้ถูกลบแล้ว", 404);
    const year = await tx.academicYear.findUnique({ where: { id: reward.academicYearId } });
    if (year?.status === "CLOSED" && input.isActive) throw new RewardError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถเปิดแลกรางวัลได้", 409);
    if (reward.stockQuantity !== input.expectedStockQuantity) throw new RewardError("จำนวนคงเหลือเปลี่ยนไปแล้ว กรุณารีเฟรชก่อนแก้ไข", 409);
    if ((reward.stockQuantity === null) !== (input.stockQuantity === null)) {
      const pending = await tx.rewardRedemption.count({ where: { rewardTierId: id, status: "PENDING" } });
      if (pending) throw new RewardError("มีคำขอรออนุมัติอยู่ จึงยังสลับโหมดจำกัด/ไม่จำกัดจำนวนไม่ได้", 409);
    }
    const { expectedStockQuantity, ...data } = input;
    await tx.rewardTier.update({ where: { id }, data: { ...data, ...image }, select: { id: true } });
    await tx.auditLog.create({ data: { actorId, action: "reward.update", entityType: "RewardTier", entityId: id,
      details: { ...data, previousStockQuantity: expectedStockQuantity, previousCostPoints: reward.costPoints } } });
    return { id: String(id) };
  });
}

export async function deleteReward(id: bigint, actorId: bigint) {
  return transact(async (tx) => {
    await requireLiveRole(tx, actorId, ["ADMIN", "ORGANIZER"]);
    const reward = await lockReward(tx, id);
    if (reward.deletedAt) return { id: String(id), archived: true };
    if (await tx.rewardRedemption.count({ where: { rewardTierId: id, status: "PENDING" } })) {
      throw new RewardError("มีคำขอรออนุมัติ กรุณาพิจารณาคำขอให้ครบก่อนลบ", 409);
    }
    const archived = await tx.rewardRedemption.count({ where: { rewardTierId: id } }) > 0;
    if (archived) await tx.rewardTier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    else await tx.rewardTier.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId, action: "reward.delete", entityType: "RewardTier", entityId: id,
      details: { name: reward.name, archived } } });
    return { id: String(id), archived };
  });
}

export async function requestRedemption(input: RedemptionCreateInput, userId: bigint) {
  return transact(async (tx) => {
    // Lock each student's wallet before the reward so concurrent requests cannot spend the same stars.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    await requireLiveRole(tx, userId, ["STUDENT"]);
    const receipt = await tx.rewardRedemption.findUnique({ where: { requestId: input.requestId } });
    if (receipt) {
      if (receipt.userId !== userId || String(receipt.rewardTierId) !== input.rewardTierId || receipt.costPoints !== input.expectedCostPoints) throw new RewardError("คำขอนี้ถูกใช้แล้ว กรุณารีเฟรช", 409);
      return { id: String(receipt.id), replayed: true };
    }
    const reward = await lockReward(tx, BigInt(input.rewardTierId));
    if (reward.deletedAt || !reward.isActive) throw new RewardError("รางวัลนี้ไม่เปิดให้แลกแล้ว", 409);
    if (reward.costPoints !== input.expectedCostPoints) throw new RewardError("จำนวนดาวที่ใช้แลกเปลี่ยนไปแล้ว กรุณารีเฟรชและยืนยันราคาใหม่", 409);
    const year = await tx.academicYear.findUnique({ where: { id: reward.academicYearId } });
    if (!year || year.status !== "ACTIVE") throw new RewardError("แลกได้เฉพาะปีการศึกษาที่เปิดใช้งาน", 409);
    if (reward.stockQuantity !== null && reward.stockQuantity <= 0) throw new RewardError("ของรางวัลหมดแล้ว", 409);
    const balance = await rewardBalance(userId, reward.academicYearId, tx);
    if (balance.available < reward.costPoints) throw new RewardError("ดาวที่ใช้แลกได้ไม่เพียงพอ", 409);
    const redemption = await tx.rewardRedemption.create({ data: {
      userId, academicYearId: reward.academicYearId, rewardTierId: reward.id,
      costPoints: reward.costPoints, requestId: input.requestId,
    } });
    await tx.starTransaction.create({ data: {
      userId, academicYearId: reward.academicYearId, redemptionId: redemption.id,
      starType: "ADJUSTMENT", points: -reward.costPoints, status: "PENDING", reason: `จองดาวแลก ${reward.name}`,
    } });
    if (reward.stockQuantity !== null) await tx.rewardTier.update({ where: { id: reward.id }, data: { stockQuantity: { decrement: 1 } } });
    await tx.auditLog.create({ data: { actorId: userId, action: "reward.request", entityType: "RewardRedemption", entityId: redemption.id,
      details: { requestId: input.requestId, rewardTierId: String(reward.id), costPoints: reward.costPoints } } });
    return { id: String(redemption.id), replayed: false };
  });
}

export async function reviewRedemption(id: bigint, input: RedemptionReviewInput, actorId: bigint) {
  return transact(async (tx) => {
    const initial = await tx.rewardRedemption.findUnique({ where: { id } });
    if (!initial) throw new RewardError("ไม่พบคำขอแลกรางวัล", 404);
    const cancelling = input.status === "CANCELLED";
    await requireLiveRole(tx, actorId, cancelling ? ["STUDENT"] : ["ADMIN", "ORGANIZER"]);
    if (cancelling && initial.userId !== actorId) throw new RewardError("ยกเลิกได้เฉพาะคำขอของตนเอง", 403);
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.userId} FOR UPDATE`;
    const reward = await lockReward(tx, initial.rewardTierId);
    await tx.$queryRaw`SELECT id FROM reward_redemptions WHERE id = ${id} FOR UPDATE`;
    const redemption = await tx.rewardRedemption.findUniqueOrThrow({ where: { id }, include: { ledgerTransaction: true } });
    if (redemption.status === input.status) return { id: String(id), replayed: true };
    const expected = input.status === "COMPLETED" ? "APPROVED" : "PENDING";
    if (redemption.status !== expected) throw new RewardError("สถานะคำขอเปลี่ยนไปแล้ว กรุณารีเฟรช", 409);
    const ledger = redemption.ledgerTransaction;
    if (!ledger || ledger.points !== -redemption.costPoints || ledger.userId !== redemption.userId || ledger.academicYearId !== redemption.academicYearId || ledger.status !== expected) {
      throw new RewardError("ข้อมูลการจองดาวไม่ตรงกับคำขอ กรุณาติดต่อผู้ดูแล", 409);
    }
    const now = new Date();
    if (input.status === "APPROVED") {
      await requireLiveRole(tx, redemption.userId, ["STUDENT"]);
      const wallet = await rewardBalance(redemption.userId, redemption.academicYearId, tx);
      if (wallet.balance < wallet.reserved) throw new RewardError("ดาวสะสมเปลี่ยนไปและไม่พอสำหรับคำขอที่จองไว้ กรุณาไม่อนุมัติคำขอเพื่อคืนส่วนจอง", 409);
      await tx.starTransaction.update({ where: { id: ledger.id }, data: { status: "APPROVED", approvedBy: actorId, approvedAt: now, reason: `แลกรางวัล ${reward.name}` } });
    } else if (input.status !== "COMPLETED") {
      await tx.starTransaction.update({ where: { id: ledger.id }, data: { status: "REJECTED", approvedBy: actorId, approvedAt: now } });
      if (reward.stockQuantity !== null) await tx.rewardTier.update({ where: { id: reward.id }, data: { stockQuantity: { increment: 1 } } });
    }
    await tx.rewardRedemption.update({ where: { id }, data: {
      status: input.status, note: input.note || (input.status === "COMPLETED" ? redemption.note : null),
      ...(input.status === "COMPLETED" ? { completedAt: now } : { reviewedBy: actorId, reviewedAt: now }),
      ...(input.status === "APPROVED" ? { redeemedAt: now } : {}),
    } });
    await tx.auditLog.create({ data: { actorId, action: `reward.${input.status.toLowerCase()}`, entityType: "RewardRedemption", entityId: id,
      details: { previousStatus: redemption.status, costPoints: redemption.costPoints, note: input.note } } });
    return { id: String(id), replayed: false };
  });
}

export async function redemptionHistory(academicYearId: bigint, options: { userId?: bigint; status?: RedemptionStatus; page?: number } = {}) {
  const where = { academicYearId, ...(options.userId ? { userId: options.userId } : {}), ...(options.status ? { status: options.status } : {}) };
  const total = await prisma.rewardRedemption.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const rows = await prisma.rewardRedemption.findMany({
    where, orderBy: [{ requestedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
    include: { rewardTier: { select: { name: true } }, user: { select: { firstname: true, lastname: true, username: true, studentCode: true } } },
  });
  const records: RedemptionDto[] = rows.map((row) => ({
    id: String(row.id), rewardName: row.rewardTier.name, studentName: [row.user.firstname, row.user.lastname].filter(Boolean).join(" ") || row.user.username,
    studentCode: row.user.studentCode, costPoints: row.costPoints, status: row.status, requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null, note: row.note,
  }));
  return { records, total, page, totalPages };
}
