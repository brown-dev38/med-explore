import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadTypeScript } from "./load-typescript.mjs";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => db?.$disconnect());

async function fixture(run) {
  const rollback = new Error("ROLLBACK_PARTICIPANT_FIXTURE");
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const roles = await tx.role.findMany({ where: { name: { in: ["ADMIN", "STUDENT", "ORGANIZER"] } } });
    const roleId = (name) => roles.find((role) => role.name === name).id;
    let count = 0;
    const user = (names, isActive = true) => tx.user.create({ data: { username: `${token}-${++count}`, email: `${token}-${count}@example.test`, studentCode: `${token.slice(0, 24)}-${count}`, isActive, userRoles: { create: names.map((name) => ({ roleId: roleId(name) })) } } });
    const actor = await user(["ADMIN"]);
    const first = await user(["STUDENT"]);
    const second = await user(["STUDENT"]);
    const mixed = await user(["ORGANIZER"]);
    const inactive = await user(["STUDENT"], false);
    const year = await tx.academicYear.create({ data: { code: token.slice(0, 20), status: "ACTIVE", startsOn: new Date("2026-01-01Z"), endsOn: new Date("2027-01-01Z") } });
    const makeActivity = () => tx.activity.create({ data: { academicYearId: year.id, organizerId: actor.id, title: "Participant fixture", status: "PUBLISHED", startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) } });
    const activity = await makeActivity();
    await tx.qrSession.create({ data: { activityId: activity.id, createdBy: actor.id, purpose: "CHECK_IN", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 900000) } });
    const results = loadTypeScript("../lib/attendance-results.ts", { "server-only": {}, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts") });
    const prisma = { $transaction: (fn) => fn(tx) };
    const attendance = loadTypeScript("../lib/attendance.ts", { "server-only": {}, "@/lib/prisma": { prisma }, "@/lib/attendance-results": results });
    const service = loadTypeScript("../lib/activity-participants.ts", { "server-only": {}, "@/lib/prisma": { prisma }, "@/lib/attendance": attendance, "@/lib/attendance-results": results });
    await run({ tx, actor, first, second, mixed, inactive, year, activity, makeActivity, service, attendance });
    throw rollback;
  }, { timeout: 60000 }), (error) => error === rollback);
}

test("staff additions immediately check in students and award stars despite an unexpired QR, with safe retries", { skip: !db }, async () => {
  await fixture(async ({ tx, actor, first, second, activity, service }) => {
    const input = { userIds: [String(first.id), String(second.id)], requestId: randomUUID() };
    const added = await service.addParticipantsAndAward(activity.id, actor.id, input);
    assert.equal(added.added, 2);
    assert.equal(added.awarded, 2);
    const records = await tx.participation.findMany({ where: { activityId: activity.id }, include: { attendanceRecords: true, starTransactions: true } });
    for (const row of records) {
      assert.equal(row.status, "ATTENDED");
      assert.equal(row.eligibilityStatus, "APPROVED");
      assert.equal(row.attendanceRecords.length, 1);
      assert.equal(row.attendanceRecords[0].method, "ORGANIZER");
      assert.equal(row.starTransactions[0].points, 1);
      assert.equal(row.starTransactions[0].status, "APPROVED");
    }
    assert.deepEqual(await service.addParticipantsAndAward(activity.id, actor.id, input), { ...added, replayed: true });
    assert.equal((await service.addParticipantsAndAward(activity.id, actor.id, { ...input, requestId: randomUUID() })).added, 0);
    assert.equal(await tx.starTransaction.count({ where: { userId: { in: [first.id, second.id] } } }), 2);
    await assert.rejects(service.addParticipantsAndAward(activity.id, actor.id, { ...input, userIds: [String(first.id)] }), (error) => error.status === 409);
  });
});

test("Excel previews exclude admin/organizer and inactive accounts, and existing participants are skipped", { skip: !db }, async () => {
  await fixture(async ({ tx, actor, first, mixed, inactive, activity, service }) => {
    await tx.participation.create({ data: { activityId: activity.id, userId: first.id } });
    const rows = [first, mixed, actor, inactive].map((user, index) => ({ row: index + 1, studentCode: user.studentCode, status: "ready", message: "" }));
    const preview = await service.previewParticipantImport(activity.id, rows);
    assert.deepEqual(preview.map((row) => row.status), ["assigned", "not-found", "not-found", "not-found"]);
    for (const invalid of [mixed, inactive, actor]) {
      await assert.rejects(service.addParticipantsAndAward(activity.id, actor.id, { userIds: [String(first.id), String(invalid.id)] }), (error) => error.status === 409);
    }
    assert.equal(await tx.starTransaction.count({ where: { userId: first.id } }), 0);
    assert.equal(await tx.participation.count({ where: { activityId: activity.id } }), 1);
  });
});

test("Excel confirmations award immediately, preserve the twelve-star cap and reject closed or cancelled targets", { skip: !db }, async () => {
  await fixture(async ({ tx, actor, first, second, year, activity, makeActivity, service }) => {
    await tx.starTransaction.createMany({ data: Array.from({ length: 11 }, () => ({ userId: first.id, academicYearId: year.id, starType: "YELLOW", status: "APPROVED", points: 1 })) });
    const input = { studentCodes: [first.studentCode], academicYearId: String(year.id), requestId: randomUUID() };
    assert.equal((await service.addParticipantsAndAward(activity.id, actor.id, input)).awarded, 1);
    const next = await makeActivity();
    assert.equal((await service.addParticipantsAndAward(next.id, actor.id, { ...input, requestId: randomUUID() })).awarded, 0);
    const sum = await tx.starTransaction.aggregate({ where: { userId: first.id, starType: "YELLOW", status: "APPROVED" }, _sum: { points: true } });
    assert.equal(sum._sum.points, 12);
    await tx.activity.update({ where: { id: next.id }, data: { status: "CANCELLED" } });
    await assert.rejects(service.addParticipantsAndAward(next.id, actor.id, { userIds: [String(second.id)] }), (error) => error.status === 409);
    await tx.academicYear.update({ where: { id: year.id }, data: { status: "CLOSED" } });
    await assert.rejects(service.addParticipantsAndAward(activity.id, actor.id, { userIds: [String(second.id)] }), (error) => error.status === 409);
    assert.equal(await tx.participation.count({ where: { userId: second.id } }), 0);
  });
});

test("cancelling a student's yellow star preserves check-in and cannot be undone by background processing or recalculation", { skip: !db }, async () => {
  await fixture(async ({ tx, actor, first, year, activity, makeActivity, service, attendance }) => {
    await service.addParticipantsAndAward(activity.id, actor.id, { userIds: [String(first.id)] });
    const participation = await tx.participation.findUniqueOrThrow({ where: { activityId_userId: { activityId: activity.id, userId: first.id } } });
    const other = await makeActivity();
    await service.addParticipantsAndAward(other.id, actor.id, { userIds: [String(first.id)] });
    await tx.starTransaction.create({ data: { userId: first.id, academicYearId: year.id, starType: "GREEN", status: "APPROVED", points: 2 } });
    assert.deepEqual(await service.cancelParticipantYellowStar(activity.id, participation.id, actor.id), { cancelled: true });
    assert.deepEqual(await service.cancelParticipantYellowStar(activity.id, participation.id, actor.id), { cancelled: true });
    assert.deepEqual(await attendance.backfillAttendanceResults([participation.id]), { processed: 0, approvedYellowStars: 0 });
    await attendance.recalculateActivityAttendance(tx, activity.id, actor.id);
    await attendance.bulkRecordAttendance(activity.id, actor.id, new Date(), null);
    const stored = await tx.participation.findUniqueOrThrow({ where: { id: participation.id }, include: { attendanceRecords: true, starTransactions: true } });
    assert.equal(stored.eligibilityStatus, "REJECTED");
    assert.equal(stored.reviewedBy, actor.id);
    assert.equal(stored.attendanceRecords.length, 1);
    assert.equal(stored.starTransactions[0].status, "REJECTED");
    assert.equal(stored.status, "ATTENDED");
    assert.equal(await tx.auditLog.count({ where: { action: "star.cancel_yellow", entityId: participation.id } }), 1);
    const total = await tx.starTransaction.aggregate({ where: { userId: first.id, starType: "YELLOW", status: "APPROVED" }, _sum: { points: true } });
    assert.equal(total._sum.points, 1, "the other activity's star stays approved");
    assert.equal(await tx.starTransaction.count({ where: { userId: first.id, starType: "GREEN", status: "APPROVED" } }), 1);
  });
});

test("pending awards can be cancelled, while foreign-activity IDs and closed years are rejected", { skip: !db }, async () => {
  await fixture(async ({ tx, actor, first, year, activity, makeActivity, service, attendance }) => {
    const row = await tx.participation.create({ data: { activityId: activity.id, userId: first.id, reviewDueAt: new Date(Date.now() + 900000) } });
    await tx.attendanceRecord.create({ data: { participationId: row.id, eventType: "CHECK_IN", method: "QR", occurredAt: new Date(), recordedBy: first.id } });
    const other = await makeActivity();
    await assert.rejects(service.cancelParticipantYellowStar(other.id, row.id, actor.id), (error) => error.status === 404);
    await service.cancelParticipantYellowStar(activity.id, row.id, actor.id);
    await attendance.recalculateActivityAttendance(tx, activity.id, actor.id);
    assert.equal(await tx.starTransaction.count({ where: { participationId: row.id, status: "APPROVED" } }), 0);
    await tx.academicYear.update({ where: { id: year.id }, data: { status: "CLOSED" } });
    await assert.rejects(service.cancelParticipantYellowStar(activity.id, row.id, actor.id), (error) => error.status === 409);
  });
});
