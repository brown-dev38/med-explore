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

test("real check-in and checkout calculate minutes, award one approved star, and reject duplicate scans", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, actor, participation, write, awarded }) => {
    const checkIn = await write("CHECK_IN", 0);
    assert.equal(checkIn.evaluation.attendedMinutes, null);
    assert.equal(checkIn.evaluation.yellowStarPoints, 0);
    const checkOut = await write("CHECK_OUT", 90);
    assert.equal(checkOut.evaluation.attendedMinutes, 90);
    assert.equal(checkOut.evaluation.yellowStarPoints, 1);
    const stored = await tx.participation.findUniqueOrThrow({ where: { id: participation.id } });
    assert.equal(stored.status, "ATTENDED");
    assert.equal(stored.eligibilityStatus, "APPROVED");
    assert.equal((await awarded())._sum.points, 1);
    await assert.rejects(write("CHECK_OUT", 90), (error) => error.status === 409);
    await assert.rejects(write("CHECK_IN", 120), (error) => error.status === 409);
    await write("CHECK_OUT", 90, true);
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id } }), 1);
    assert.equal(await tx.auditLog.count({ where: { action: "star.auto_award", actorId: actor.id } }), 1);
  });
});

test("89 minutes 59 seconds does not qualify, and correcting attendance revokes/restores the same star", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, participation, write, awarded }) => {
    await write("CHECK_IN", 0);
    const short = await write("CHECK_OUT", 89 + 59 / 60);
    assert.equal(short.evaluation.attendedMinutes, 89);
    assert.equal(short.evaluation.yellowStarPoints, 0);
    assert.equal(short.evaluation.status, "INCOMPLETE");
    await write("CHECK_OUT", 100, true);
    assert.equal((await awarded())._sum.points, 1);
    await write("CHECK_OUT", 40, true);
    assert.equal((await awarded())._sum.points, null);
    await write("CHECK_OUT", 90, true);
    assert.equal((await awarded())._sum.points, 1);
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id } }), 1);
  });
});

test("the yearly cap is 12 yellow stars and is independent of green stars or another academic year", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, user, year, token, write, awarded, attendance, actor, createActivity }) => {
    await tx.starTransaction.createMany({ data: [
      ...Array.from({ length: 11 }, () => ({ userId: user.id, academicYearId: year.id, starType: "YELLOW", points: 1, status: "APPROVED" })),
      { userId: user.id, academicYearId: year.id, starType: "GREEN", points: 20, status: "APPROVED" },
    ] });
    await write("CHECK_IN", 0);
    await write("CHECK_OUT", 90);
    await write("CHECK_OUT", 90, true);
    assert.equal((await awarded())._sum.points, 12);
    const secondActivity = await createActivity();
    const second = await tx.participation.create({ data: { activityId: secondActivity.id, userId: user.id } });
    await write("CHECK_IN", 0, false, second.id);
    const capped = await write("CHECK_OUT", 90, false, second.id);
    assert.equal(capped.evaluation.yellowStarPoints, 0);
    assert.equal(capped.evaluation.eligibilityStatus, "APPROVED");
    assert.match(capped.evaluation.message, /12/);
    assert.equal((await awarded())._sum.points, 12);
    await write("CHECK_OUT", 20, true);
    await attendance.attendanceTransaction((transaction) => attendance.recalculateActivityAttendance(transaction, secondActivity.id, actor.id));
    assert.equal((await awarded())._sum.points, 12);
    const otherYear = await tx.academicYear.create({ data: { code: `next-${token.slice(0, 12)}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2028-01-01") } });
    const otherActivity = await createActivity(otherYear.id);
    const other = await tx.participation.create({ data: { activityId: otherActivity.id, userId: user.id } });
    await write("CHECK_IN", 0, false, other.id);
    assert.equal((await write("CHECK_OUT", 90, false, other.id)).evaluation.yellowStarPoints, 1);
  });
});

test("bulk attendance skips missing check-ins and gives each student exactly one star", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, attendance, activity, actor, studentRole, token, write, user }) => {
    const secondUser = await tx.user.create({ data: { username: `second-${token}`, email: `second-${token}@example.test`, userRoles: { create: [{ roleId: studentRole.id }] } } });
    const second = await tx.participation.create({ data: { activityId: activity.id, userId: secondUser.id } });
    await write("CHECK_IN", 0);
    const first = await attendance.bulkRecordAttendance(activity.id, actor.id, null, atMinute(90));
    assert.equal(first.updated, 1);
    assert.equal(first.skippedCheckOut, 1);
    assert.equal(await tx.attendanceRecord.count({ where: { participationId: second.id } }), 0);
    await attendance.bulkRecordAttendance(activity.id, actor.id, start, atMinute(90));
    for (const userId of [user.id, secondUser.id]) {
      assert.equal(await tx.starTransaction.count({ where: { userId, starType: "YELLOW", status: "APPROVED" } }), 1);
    }
  });
});

test("invalid time edits are rejected and legacy negative intervals are flagged without stars", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, participation, attendance, actor, activity, write, awarded }) => {
    await assert.rejects(write("CHECK_OUT", 90), (error) => error.status === 400);
    await write("CHECK_IN", 0);
    await assert.rejects(write("CHECK_OUT", -1), (error) => error.status === 400);
    await write("CHECK_OUT", 90);
    await assert.rejects(write("CHECK_IN", 100, true), (error) => error.status === 400);
    assert.equal((await awarded())._sum.points, 1);
    await tx.attendanceRecord.updateMany({ where: { participationId: participation.id, eventType: "CHECK_OUT" }, data: { occurredAt: atMinute(-5) } });
    await attendance.attendanceTransaction((transaction) => attendance.recalculateActivityAttendance(transaction, activity.id, actor.id));
    assert.equal((await awarded())._sum.points, null);
    const stored = await tx.participation.findUniqueOrThrow({ where: { id: participation.id } });
    assert.equal(stored.attendedMinutes, 0);
    assert.match(stored.reviewNote, /ก่อนเช็คอิน/);
  });
});

test("recalculation applies cancellation and changed minute thresholds without duplicate stars", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, attendance, actor, activity, write, awarded }) => {
    await write("CHECK_IN", 0);
    await write("CHECK_OUT", 120);
    for (const [data, points] of [[{ status: "CANCELLED" }, null], [{ status: "PUBLISHED", minMinutes: 121 }, null], [{ minMinutes: 90 }, 1]]) {
      await tx.activity.update({ where: { id: activity.id }, data });
      await attendance.attendanceTransaction((transaction) => attendance.recalculateActivityAttendance(transaction, activity.id, actor.id));
      assert.equal((await awarded())._sum.points, points);
    }
  });
});

test("legacy attendance is backfilled by the system once without manual ADMIN approval", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, attendance, actor, participation, awarded }) => {
    await tx.attendanceRecord.createMany({ data: [
      { participationId: participation.id, eventType: "CHECK_IN", method: "QR", occurredAt: start, recordedBy: actor.id },
      { participationId: participation.id, eventType: "CHECK_OUT", method: "QR", occurredAt: atMinute(90), recordedBy: actor.id },
    ] });
    assert.equal((await tx.participation.findUniqueOrThrow({ where: { id: participation.id } })).attendedMinutes, null);
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 1, approvedYellowStars: 1 });
    assert.equal((await tx.participation.findUniqueOrThrow({ where: { id: participation.id } })).attendedMinutes, 90);
    assert.equal((await awarded())._sum.points, 1);
    const audit = await tx.auditLog.findFirst({ where: { action: "attendance.backfill", details: { path: "$.participationIds", array_contains: String(participation.id) } } });
    assert.equal(audit.actorId, null);
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 0, approvedYellowStars: 0 });
    assert.equal(await tx.starTransaction.count({ where: { participationId: participation.id, starType: "YELLOW" } }), 1);
  });
});
