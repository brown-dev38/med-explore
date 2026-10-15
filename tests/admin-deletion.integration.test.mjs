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

// Every fixture, deletion, and audit is inside one transaction that ALWAYS rolls
// back. These tests never commit changes or delete pre-existing project data.
async function rollbackTest(fn) {
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const user = await tx.user.create({ data: { username: `test-${token}`, email: `${token}@example.test` } });
    const year = await tx.academicYear.create({ data: { code: `test-${token.slice(0, 12)}`, startsOn: new Date("2026-01-01"), endsOn: new Date("2027-01-01"), status: "CLOSED" } });
    const activity = await tx.activity.create({ data: { academicYearId: year.id, organizerId: user.id, title: "Deletion test fixture", startsAt: new Date("2026-01-01T09:00:00Z"), endsAt: new Date("2026-01-01T11:00:00Z"), status: "COMPLETED" } });
    const participation = await tx.participation.create({ data: { activityId: activity.id, userId: user.id } });
    await tx.attendanceRecord.create({ data: { participationId: participation.id, eventType: "CHECK_IN", method: "ORGANIZER", occurredAt: new Date(), recordedBy: user.id } });
    const helper = await tx.helperAssignment.create({ data: { activityId: activity.id, userId: user.id, assignedBy: user.id } });
    await tx.qrSession.create({ data: { activityId: activity.id, createdBy: user.id, purpose: "CHECK_IN", tokenHash: token, expiresAt: new Date() } });
    await tx.surveyResponse.create({ data: { activityId: activity.id, userId: user.id, answers: {} } });
    await tx.starTransaction.create({ data: { userId: user.id, academicYearId: year.id, participationId: participation.id, starType: "YELLOW", points: 1 } });
    await tx.starTransaction.create({ data: { userId: user.id, academicYearId: year.id, helperAssignmentId: helper.id, starType: "GREEN", points: 1 } });
    const reward = await tx.rewardTier.create({ data: { academicYearId: year.id, name: "Test reward", costPoints: 1 } });
    const redemption = await tx.rewardRedemption.create({ data: { academicYearId: year.id, userId: user.id, rewardTierId: reward.id, costPoints: 1 } });
    await tx.starTransaction.create({ data: { userId: user.id, academicYearId: year.id, redemptionId: redemption.id, starType: "ADJUSTMENT", points: -1 } });
    const deletion = loadTypeScript("../lib/admin-deletion.ts", {
      "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (callback) => callback(tx) } },
    });
    await fn({ tx, user, year, activity, participation, helper, reward, redemption, deletion });
    throw rollback;
  }, { timeout: 20000 }), (error) => error === rollback);
}

test("ADMIN deletes a completed activity and all dependent history while retaining unrelated rewards and audits", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, user, year, activity, reward, deletion }) => {
    const result = await deletion.deleteActivity(activity.id, user.id, true);
    assert.equal(result.deleted.activities, 1);
    assert.equal(result.deleted.participations, 1);
    assert.equal(result.deleted.attendance, 1);
    assert.equal(result.deleted.stars, 2);
    assert.equal(result.deleted.qrSessions, 1);
    assert.equal(result.deleted.helpers, 1);
    assert.equal(result.deleted.surveys, 1);
    assert.ok(await tx.academicYear.findUnique({ where: { id: year.id } }));
    assert.ok(await tx.rewardTier.findUnique({ where: { id: reward.id } }));
    assert.equal(await tx.auditLog.count({ where: { entityId: activity.id, action: "activity.delete" } }), 1);
  });
});

test("ADMIN deletes an academic year with activity, star and redemption foreign keys in the correct order", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, user, year, activity, reward, redemption, deletion }) => {
    const result = await deletion.deleteAcademicYear(year.id, user.id);
    assert.equal(result.deleted.activities, 1);
    assert.equal(result.deleted.stars, 3);
    assert.equal(result.deleted.redemptions, 1);
    assert.equal(result.deleted.rewards, 1);
    for (const [model, id] of [["academicYear", year.id], ["activity", activity.id], ["rewardTier", reward.id], ["rewardRedemption", redemption.id]]) assert.equal(await tx[model].findUnique({ where: { id } }), null);
    assert.equal(await tx.auditLog.count({ where: { entityId: year.id, action: "academic_year.delete" } }), 1);
    assert.ok(await tx.user.findUnique({ where: { id: user.id } }));
  });
});

test("organizer deletion cannot remove published, completed or registered draft activities", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, user, activity, deletion }) => {
    for (const status of ["COMPLETED", "PUBLISHED", "CANCELLED", "DRAFT"]) {
      await tx.activity.update({ where: { id: activity.id }, data: { status } });
      await assert.rejects(deletion.deleteActivity(activity.id, user.id, false), (error) => error instanceof deletion.DeletionError && error.status === 409);
      assert.ok(await tx.activity.findUnique({ where: { id: activity.id } }));
    }
  });
});
