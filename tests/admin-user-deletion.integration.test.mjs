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

async function rollbackTest(fn) {
  const rollback = new Error("ROLLBACK_USER_DELETION_FIXTURES");
  // Never commit fixture users or delete any existing project users.
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const role = await tx.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const actor = await tx.user.create({ data: { username: `actor-${token}`, email: `actor-${token}@example.test`, userRoles: { create: [{ roleId: role.id }] } } });
    const user = await tx.user.create({ data: { username: `target-${token}`, email: `target-${token}@example.test`, userRoles: { create: [{ roleId: role.id }] } } });
    const deletion = loadTypeScript("../lib/admin-deletion.ts", {
      "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (callback) => callback(tx) } },
    });
    await fn({ tx, actor, user, deletion, token });
    throw rollback;
  }, { timeout: 20000 }), (error) => error === rollback);
}

test("ADMIN removes an unused user with their role and preserves the deletion audit", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, actor, user, deletion }) => {
    assert.deepEqual(await deletion.deleteUser(user.id, actor.id), { id: String(user.id) });
    assert.equal(await tx.user.findUnique({ where: { id: user.id } }), null);
    assert.equal(await tx.userRole.count({ where: { userId: user.id } }), 0);
    assert.ok(await tx.user.findUnique({ where: { id: actor.id } }));
    assert.equal(await tx.auditLog.count({ where: { actorId: actor.id, action: "user.delete", entityId: user.id } }), 1);
  });
});

test("real participation history blocks account deletion without changing attendance or other users", { skip: !db }, async () => {
  await rollbackTest(async ({ tx, actor, user, deletion, token }) => {
    const year = await tx.academicYear.create({ data: { code: `test-${token.slice(0, 12)}`, startsOn: new Date("2026-01-01"), endsOn: new Date("2027-01-01") } });
    const activity = await tx.activity.create({ data: { academicYearId: year.id, organizerId: actor.id, title: "Test history", startsAt: new Date(), endsAt: new Date() } });
    const participation = await tx.participation.create({ data: { activityId: activity.id, userId: user.id } });
    const attendance = await tx.attendanceRecord.create({ data: { participationId: participation.id, eventType: "CHECK_IN", method: "ORGANIZER", occurredAt: new Date(), recordedBy: actor.id } });
    await assert.rejects(deletion.deleteUser(user.id, actor.id), (error) => error.status === 409);
    assert.ok(await tx.user.findUnique({ where: { id: user.id } }));
    assert.equal(await tx.userRole.count({ where: { userId: user.id } }), 1);
    assert.ok(await tx.attendanceRecord.findUnique({ where: { id: attendance.id } }));
    assert.ok(await tx.activity.findUnique({ where: { id: activity.id } }));
    assert.equal(await tx.auditLog.count({ where: { action: "user.delete", entityId: user.id } }), 0);
  });
});
