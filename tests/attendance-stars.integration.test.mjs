import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadTypeScript } from "./load-typescript.mjs";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });
const start = new Date("2026-10-14T16:30:00Z");
const atMinute = (minutes) => new Date(start.getTime() + minutes * 60000);

async function rollbackTest(fn) {
  const rollback = new Error("ROLLBACK_ATTENDANCE_STAR_FIXTURES");
  // Only private fixtures are used; every attendance, star and audit is rolled back.
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const studentRole = await tx.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const actor = await tx.user.create({ data: { username: `actor-${token}`, email: `actor-${token}@example.test` } });
    const user = await tx.user.create({ data: { username: `student-${token}`, email: `${token}@example.test`, userRoles: { create: [{ roleId: studentRole.id }] } } });
    const year = await tx.academicYear.create({ data: { code: token.slice(0, 20), startsOn: new Date("2026-01-01"), endsOn: new Date("2027-01-01"), status: "ACTIVE" } });
    const createActivity = (academicYearId = year.id) => tx.activity.create({ data: {
      academicYearId, organizerId: actor.id, title: "Attendance fixture", status: "PUBLISHED", minMinutes: 90,
      // Deliberately outside the recorded interval: the user's rule counts actual elapsed time.
      startsAt: new Date("2026-10-14T06:30:00Z"), endsAt: new Date("2026-10-14T08:30:00Z"),
    } });
    const activity = await createActivity();
    const participation = await tx.participation.create({ data: { activityId: activity.id, userId: user.id } });
    const results = loadTypeScript("../lib/attendance-results.ts", { "server-only": {}, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts") });
    const attendance = loadTypeScript("../lib/attendance.ts", {
      "server-only": {}, "@/lib/attendance-results": results,
      "@/lib/prisma": { prisma: { $transaction: (callback) => callback(tx) } },
    });
    const write = (eventType, minute, replaceExisting = false, participationId = participation.id) => attendance.recordAttendance({
      participationId, eventType, occurredAt: atMinute(minute), method: replaceExisting ? "ORGANIZER" : "QR", recordedBy: actor.id, replaceExisting,
    });
    const awarded = () => tx.starTransaction.aggregate({ where: { userId: user.id, academicYearId: year.id, starType: "YELLOW", status: "APPROVED" }, _sum: { points: true } });
    await fn({ tx, attendance, actor, user, year, activity, participation, write, awarded, createActivity, studentRole, token });
    throw rollback;
  }, { timeout: 30000 }), (error) => error === rollback);
}

test("real QR check-in waits for expiry, awards without checkout, and retries do not duplicate stars", { skip: !db }, async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  await rollbackTest(async ({ tx, attendance, actor, activity, participation, awarded }) => {
    const session = await tx.qrSession.create({ data: {
      activityId: activity.id, createdBy: actor.id, purpose: "CHECK_IN", tokenHash: randomUUID(), expiresAt: atMinute(15), createdAt: start,
    } });
    const record = () => attendance.recordAttendance({ participationId: participation.id, eventType: "CHECK_IN", method: "QR", occurredAt: start, recordedBy: actor.id, qrSessionId: session.id });
    assert.equal((await record()).evaluation.yellowStarPoints, 0);
    assert.equal((await awarded())._sum.points, null);
    const pending = await tx.participation.findUniqueOrThrow({ where: { id: participation.id } });
    assert.equal(pending.reviewDueAt.getTime(), session.expiresAt.getTime());
    assert.equal(pending.eligibilityStatus, "PENDING");
    await assert.rejects(record(), (error) => error.status === 409);
    t.mock.timers.setTime(atMinute(15).getTime());
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 1, approvedYellowStars: 1 });
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 0, approvedYellowStars: 0 });
    assert.equal((await awarded())._sum.points, 1);
    assert.equal(await tx.attendanceRecord.count({ where: { participationId: participation.id, eventType: "CHECK_OUT" } }), 0);
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id } }), 1);
    const star = await tx.starTransaction.findUniqueOrThrow({ where: { participationId_starType: { participationId: participation.id, starType: "YELLOW" } } });
    assert.equal(await tx.auditLog.count({ where: { action: "star.auto_award", entityId: star.id } }), 1);
  });
});

test("the scheduled QR expiry writes a real yellow star without an admin request or recalculation", { skip: !db }, async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  for (const key of ["attendanceWorker", "attendanceWorkerRunning", "attendanceWorkerRerun", "attendanceReviewDeadlines", "attendanceReviewTimer", "attendanceNextReview"]) {
    const previous = globalThis[key]; delete globalThis[key];
    t.after(() => previous === undefined ? delete globalThis[key] : globalThis[key] = previous);
  }
  let expire;
  let batch;
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }));
  const realTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    if (delay !== 15 * 60000) return realTimeout(callback, delay, ...args);
    expire = callback; return { unref() {} };
  });
  await rollbackTest(async ({ tx, attendance, actor, activity, participation, awarded }) => {
    const session = await tx.qrSession.create({ data: {
      activityId: activity.id, createdBy: actor.id, purpose: "CHECK_IN", tokenHash: randomUUID(), expiresAt: atMinute(15), createdAt: start,
    } });
    await attendance.recordAttendance({ participationId: participation.id, eventType: "CHECK_IN", method: "QR", occurredAt: start, recordedBy: actor.id, qrSessionId: session.id });
    const { scheduleAttendanceReview } = loadTypeScript("../lib/attendance-worker.ts", {
      "server-only": {}, "@/lib/attendance": { backfillAttendanceResults: () => {
        batch = attendance.backfillAttendanceResults([participation.id]); return batch;
      } },
    });
    scheduleAttendanceReview(session.expiresAt);
    await batch; await setImmediate();
    assert.equal((await awarded())._sum.points, null);
    t.mock.timers.setTime(session.expiresAt.getTime());
    expire(); await batch; await setImmediate();
    assert.equal((await awarded())._sum.points, 1);
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id } }), 1);
    assert.equal(await tx.attendanceRecord.count({ where: { participationId: participation.id, eventType: "CHECK_OUT" } }), 0);
  });
});

test("real manual check-in ignores minimum minutes; cancellation revokes and restoring does not duplicate", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, attendance, actor, activity, write, awarded, participation }) => {
    await tx.activity.update({ where: { id: activity.id }, data: { minMinutes: 1440 } });
    assert.equal((await write("CHECK_IN", 0)).evaluation.yellowStarPoints, 1);
    for (const [status, points] of [["CANCELLED", null], ["PUBLISHED", 1]]) {
      await tx.activity.update({ where: { id: activity.id }, data: { status } });
      await attendance.attendanceTransaction((transaction) => attendance.recalculateActivityAttendance(transaction, activity.id, actor.id));
      assert.equal((await awarded())._sum.points, points);
    }
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id } }), 1);
    await assert.rejects(write("CHECK_OUT", 15), (error) => error.status === 400);
  });
});

test("the real yearly limit stays at twelve yellow stars, independently of green stars", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, user, year, write, awarded, attendance, actor, createActivity }) => {
    await tx.starTransaction.createMany({ data: [
      ...Array.from({ length: 11 }, () => ({ userId: user.id, academicYearId: year.id, starType: "YELLOW", points: 1, status: "APPROVED" })),
      { userId: user.id, academicYearId: year.id, starType: "GREEN", points: 20, status: "APPROVED" },
    ] });
    await write("CHECK_IN", 0);
    assert.equal((await awarded())._sum.points, 12);
    const secondActivity = await createActivity();
    const second = await tx.participation.create({ data: { activityId: secondActivity.id, userId: user.id } });
    assert.equal((await attendance.recordAttendance({ participationId: second.id, eventType: "CHECK_IN", method: "ORGANIZER", occurredAt: start, recordedBy: actor.id })).evaluation.yellowStarPoints, 0);
    assert.equal((await awarded())._sum.points, 12);
  });
});

test("real legacy check-in without checkout is processed automatically once", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, attendance, actor, participation, awarded }) => {
    await tx.attendanceRecord.create({ data: { participationId: participation.id, eventType: "CHECK_IN", method: "QR", occurredAt: start, recordedBy: actor.id } });
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 1, approvedYellowStars: 1 });
    assert.equal((await awarded())._sum.points, 1);
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 0, approvedYellowStars: 0 });
  });
});
