import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadTypeScript } from "./load-typescript.mjs";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });
const service = (prisma) => loadTypeScript("../lib/academic-years.ts", { "server-only": {}, "@/lib/prisma": { prisma } });

async function fixture(run) {
  const token = randomUUID();
  const users = [];
  const years = [];
  try {
    for (const roleName of ["ADMIN", "STUDENT", "STUDENT", "STUDENT"]) {
      const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
      users.push(await db.user.create({ data: {
        username: `year-close-${token}-${users.length}`, email: `year-close-${token}-${users.length}@example.test`,
        userRoles: { create: { roleId: role.id } },
      } }));
    }
    for (const status of ["ACTIVE", "DRAFT"]) years.push(await db.academicYear.create({ data: {
      code: `yc-${token.slice(0, 12)}-${years.length}`, status,
      startsOn: new Date("2026-01-01"), endsOn: new Date("2026-12-31"),
    } }));
    const [admin, student, otherStudent, zeroStudent] = users;
    const [year, nextYear] = years;
    await db.starTransaction.createMany({ data: [
      { userId: student.id, academicYearId: year.id, starType: "GREEN", status: "APPROVED", points: 12 },
      { userId: otherStudent.id, academicYearId: year.id, starType: "YELLOW", status: "APPROVED", points: 5 },
      { userId: student.id, academicYearId: nextYear.id, starType: "GREEN", status: "APPROVED", points: 4 },
    ] });
    const rewards = loadTypeScript("../lib/rewards.ts", { "server-only": {}, "@/lib/prisma": { prisma: db } });
    const createReward = async (stockQuantity) => db.rewardTier.create({ data: {
      academicYearId: year.id, name: `Fixture ${String(stockQuantity)}`, costPoints: 3, stockQuantity,
    } });
    const limited = await createReward(10);
    const unlimited = await createReward(null);
    const nextReward = await db.rewardTier.create({ data: {
      academicYearId: nextYear.id, name: "Next year fixture", costPoints: 1, isActive: true,
    } });
    const request = async (reward) => BigInt((await rewards.requestRedemption({
      rewardTierId: String(reward.id), expectedCostPoints: 3, requestId: randomUUID(),
    }, student.id)).id);
    const approved = await request(limited);
    await rewards.reviewRedemption(approved, { status: "APPROVED", note: "Approved before closing" }, admin.id);
    const pendingLimited = await request(limited);
    const pendingUnlimited = await request(unlimited);
    const ledgerBalance = async (userId, academicYearId = year.id) => (await db.starTransaction.aggregate({
      where: { userId, academicYearId, status: "APPROVED" }, _sum: { points: true },
    }))._sum.points ?? 0;
    await run({ admin, student, otherStudent, zeroStudent, year, nextYear, limited, unlimited, nextReward,
      approved, pendingLimited, pendingUnlimited, rewards, ledgerBalance, ids: years.map((item) => item.id) });
  } finally {
    const yearIds = years.map((year) => year.id);
    const userIds = users.map((user) => user.id);
    // Cleanup is restricted to records owned by this test's fixture IDs.
    await db.starTransaction.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await db.rewardRedemption.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await db.rewardTier.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await db.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

test("closing expires only that year's balances, cancels pending requests and restores limited stock exactly once", { skip: !db }, async () => fixture(async (f) => {
  const api = service(db);
  await Promise.all([
    api.updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id),
    api.updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id),
  ]);
  for (const student of [f.student, f.otherStudent, f.zeroStudent]) {
    assert.equal(await f.ledgerBalance(student.id), 0);
    assert.deepEqual(await f.rewards.rewardBalance(student.id, f.year.id), { balance: 0, reserved: 0, available: 0 });
  }
  assert.equal(await f.ledgerBalance(f.student.id, f.nextYear.id), 4);
  const requests = await db.rewardRedemption.findMany({ where: { id: { in: [f.pendingLimited, f.pendingUnlimited] } }, include: { ledgerTransaction: true } });
  assert.ok(requests.every((row) => row.status === "CANCELLED" && row.ledgerTransaction.status === "REJECTED"));
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).stockQuantity, 9);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.unlimited.id } })).stockQuantity, null);
  assert.equal(await db.rewardTier.count({ where: { academicYearId: f.year.id, isActive: true } }), 0);
  assert.ok((await f.rewards.rewardCatalog(f.year.id)).every((reward) => !reward.isActive));
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.nextReward.id } })).isActive, true);
  await assert.rejects(f.rewards.requestRedemption({ rewardTierId: String(f.limited.id), expectedCostPoints: 3, requestId: randomUUID() }, f.student.id), (error) => error.status === 409);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: f.year.id, reason: api.YEAR_END_STAR_REASON } }), 2);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: f.year.id, starType: { in: ["YELLOW", "GREEN"] }, status: "APPROVED" } }), 2);
  assert.equal(await db.auditLog.count({ where: { entityId: f.year.id, entityType: "AcademicYear", action: "academic_year.close" } }), 1);
  await f.rewards.reviewRedemption(f.approved, { status: "COMPLETED", note: "" }, f.admin.id);
  assert.equal((await db.rewardRedemption.findUniqueOrThrow({ where: { id: f.approved } })).status, "COMPLETED");
  await api.updateAcademicYear(f.year.id, { status: "DRAFT" }, f.admin.id);
  assert.equal(await db.rewardTier.count({ where: { academicYearId: f.year.id, isActive: true } }), 0);
  assert.deepEqual(await f.rewards.rewardBalance(f.student.id, f.year.id), { balance: 0, reserved: 0, available: 0 });
  await api.updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: f.year.id, reason: api.YEAR_END_STAR_REASON } }), 2);
}));

test("an audit failure rolls back cancellation, stock restoration, expiry and year status together", { skip: !db }, async () => fixture(async (f) => {
  const prisma = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
    if (key === "auditLog") return { create: async (args) => {
      if (args.data.action === "academic_year.close") throw new Error("CLOSE_AUDIT_FAILED");
      return target.auditLog.create(args);
    } };
    return target[key];
  } })), options) };
  await assert.rejects(service(prisma).updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id), /CLOSE_AUDIT_FAILED/);
  assert.equal((await db.academicYear.findUniqueOrThrow({ where: { id: f.year.id } })).status, "ACTIVE");
  assert.equal(await f.ledgerBalance(f.student.id), 9);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).stockQuantity, 8);
  assert.equal(await db.rewardTier.count({ where: { academicYearId: f.year.id, isActive: true } }), 2);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: f.year.id, status: "PENDING" } }), 2);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: f.year.id, reason: service(prisma).YEAR_END_STAR_REASON } }), 0);
}));

test("closing races safely with approval and a new redemption without leaving reservations or restoring stock twice", { skip: !db }, async () => fixture(async (f) => {
  const results = await Promise.allSettled([
    service(db).updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id),
    f.rewards.reviewRedemption(f.pendingLimited, { status: "APPROVED", note: "" }, f.admin.id),
    f.rewards.requestRedemption({ rewardTierId: String(f.unlimited.id), expectedCostPoints: 3, requestId: randomUUID() }, f.student.id),
  ]);
  assert.equal(results[0].status, "fulfilled");
  for (const result of results.slice(1)) {
    if (result.status === "rejected") assert.equal(result.reason.status, 409, String(result.reason));
  }
  assert.equal(await f.ledgerBalance(f.student.id), 0);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: f.year.id, status: "PENDING" } }), 0);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: f.year.id, redemptionId: { not: null }, status: "PENDING" } }), 0);
  const reviewed = await db.rewardRedemption.findUniqueOrThrow({ where: { id: f.pendingLimited } });
  assert.ok(["APPROVED", "CANCELLED"].includes(reviewed.status));
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).stockQuantity, reviewed.status === "APPROVED" ? 8 : 9);
}));

test("activating the next year closes the previous year with the same expiry and cancellation policy", { skip: !db }, async () => fixture(async (f) => {
  // Restrict discovery to fixture years so this test never closes a real academic year.
  const prisma = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
    if (key === "academicYear") return new Proxy(target.academicYear, { get(model, operation) {
      if (operation === "findMany") return (args) => model.findMany({ ...args, where: { ...args.where, id: { ...args.where?.id, in: f.ids } } });
      return model[operation];
    } });
    return target[key];
  } })), options) };
  await service(prisma).setActiveAcademicYear(f.nextYear.id, f.admin.id);
  assert.equal((await db.academicYear.findUniqueOrThrow({ where: { id: f.year.id } })).status, "CLOSED");
  assert.equal((await db.academicYear.findUniqueOrThrow({ where: { id: f.nextYear.id } })).status, "ACTIVE");
  assert.equal(await f.ledgerBalance(f.student.id), 0);
  assert.equal(await f.ledgerBalance(f.student.id, f.nextYear.id), 4);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: f.year.id, status: "PENDING" } }), 0);
  assert.equal(await db.rewardTier.count({ where: { academicYearId: f.year.id, isActive: true } }), 0);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.nextReward.id } })).isActive, true);
}));

test("closed years block enabling and creating active rewards, allow inactive edits, and mask legacy active flags", { skip: !db }, async () => fixture(async (f) => {
  const api = service(db);
  await api.updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id);
  const input = { name: "Updated closed-year reward", description: null, costPoints: 3, stockQuantity: 9, isActive: true };
  await assert.rejects(f.rewards.createReward({ ...input, academicYearId: String(f.year.id) }, f.admin.id), (error) => error.status === 409);
  await assert.rejects(f.rewards.updateReward(f.limited.id, { ...input, expectedStockQuantity: 9 }, f.admin.id), (error) => error.status === 409);
  await f.rewards.updateReward(f.limited.id, { ...input, expectedStockQuantity: 9, isActive: false }, f.admin.id);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).name, input.name);
  await db.rewardTier.update({ where: { id: f.limited.id }, data: { isActive: true } });
  assert.ok((await f.rewards.rewardCatalog(f.year.id)).every((reward) => !reward.isActive));
  await api.updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).isActive, false);
  assert.equal((await db.rewardTier.findUniqueOrThrow({ where: { id: f.limited.id } })).stockQuantity, 9);
}));

test("closing races with reward activation and creation without leaving an active reward in the closed year", { skip: !db }, async () => fixture(async (f) => {
  const input = { name: "Concurrent reward", description: null, costPoints: 3, stockQuantity: null, isActive: true };
  const results = await Promise.allSettled([
    service(db).updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id),
    f.rewards.updateReward(f.unlimited.id, { ...input, expectedStockQuantity: null }, f.admin.id),
    f.rewards.createReward({ ...input, name: "Concurrent new reward", academicYearId: String(f.year.id) }, f.admin.id),
  ]);
  assert.equal(results[0].status, "fulfilled");
  for (const result of results.slice(1)) {
    if (result.status === "rejected") assert.equal(result.reason.status, 409, String(result.reason));
  }
  assert.equal(await db.rewardTier.count({ where: { academicYearId: f.year.id, isActive: true } }), 0);
}));

test("closed years reject later attendance and helper awards so expired balances cannot grow again", { skip: !db }, async () => fixture(async (f) => {
  const activity = await db.activity.create({ data: {
    academicYearId: f.year.id, organizerId: f.admin.id, title: "Closure fixture activity", status: "PUBLISHED",
    startsAt: new Date("2026-10-19T02:00:00Z"), endsAt: new Date("2026-10-19T05:00:00Z"),
  } });
  const participation = await db.participation.create({ data: { activityId: activity.id, userId: f.student.id } });
  const helper = await db.helperAssignment.create({ data: { activityId: activity.id, userId: f.student.id, assignedBy: f.admin.id } });
  try {
    const results = loadTypeScript("../lib/attendance-results.ts", { "server-only": {}, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts") });
    const attendance = loadTypeScript("../lib/attendance.ts", { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/attendance-results": results });
    const qr = loadTypeScript("../lib/qr.ts", { "server-only": {} });
    const token = qr.generateQrToken();
    await db.qrSession.create({ data: { activityId: activity.id, createdBy: f.admin.id, purpose: "CHECK_IN", tokenHash: qr.hashQrToken(token), expiresAt: new Date(Date.now() + 60000) } });
    const scan = loadTypeScript("../app/api/attendance/scan/route.ts", {
      "@/lib/prisma": { prisma: db }, "@/lib/dal": { getCurrentUser: async () => ({ id: String(f.student.id) }) },
      "@/lib/validation": loadTypeScript("../lib/validation.ts"), "@/lib/api": loadTypeScript("../lib/api.ts"),
      "@/lib/qr": qr, "@/lib/attendance": attendance,
      "@/lib/attendance-worker": { scheduleAttendanceReview: () => {} },
      "@/lib/participations": loadTypeScript("../lib/participations.ts", { "server-only": {} }),
    });
    assert.equal((await scan.GET(new Request(`https://example.test/api/attendance/scan?token=${token}&academicYearId=${f.year.id}`))).status, 200);
    await service(db).updateAcademicYear(f.year.id, { status: "CLOSED" }, f.admin.id);
    // A still-valid QR and a page opened before closure must no longer preview or record attendance.
    for (const academicYearId of [undefined, String(f.year.id), String(f.nextYear.id)]) {
      const suffix = academicYearId ? `&academicYearId=${academicYearId}` : "";
      assert.equal((await scan.GET(new Request(`https://example.test/api/attendance/scan?token=${token}${suffix}`))).status, 409);
      assert.equal((await scan.POST(new Request("https://example.test/api/attendance/scan", { method: "POST", body: JSON.stringify({ token, academicYearId }) }))).status, 409);
    }
    await assert.rejects(attendance.recordAttendance({ participationId: participation.id, eventType: "CHECK_IN", method: "ORGANIZER", occurredAt: new Date(), recordedBy: f.admin.id }), (error) => error.status === 409);
    await assert.rejects(attendance.attendanceTransaction((tx) => attendance.recalculateActivityAttendance(tx, activity.id, f.admin.id)), (error) => error.status === 409);
    const helpers = loadTypeScript("../lib/helpers.ts", { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/audit": {}, "@/lib/helper-awards": loadTypeScript("../lib/helper-awards.ts") });
    await assert.rejects(helpers.updateHelperStatusAndStar(helper.id, "COMPLETED", f.admin.id), /ACADEMIC_YEAR_CLOSED/);
    assert.equal(await f.ledgerBalance(f.student.id), 0);
    assert.equal(await db.attendanceRecord.count({ where: { participationId: participation.id } }), 0);
  } finally {
    await db.qrSession.deleteMany({ where: { activityId: activity.id } });
    await db.attendanceRecord.deleteMany({ where: { participationId: participation.id } });
    await db.helperAssignment.delete({ where: { id: helper.id } });
    await db.participation.delete({ where: { id: participation.id } });
    await db.activity.delete({ where: { id: activity.id } });
  }
}));
