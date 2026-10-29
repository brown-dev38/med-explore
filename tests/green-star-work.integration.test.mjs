import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadTypeScript } from "./load-typescript.mjs";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });

test("standalone green work persists with its audit receipt, replays once and is visible to student summaries", { skip: !db }, async () => {
  const rollback = new Error("ROLLBACK_GREEN_WORK_FIXTURES");
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const studentRole = await tx.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const adminRole = await tx.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const actor = await tx.user.create({ data: { username: `green-actor-${token}`, email: `green-actor-${token}@example.test`, userRoles: { create: [{ roleId: adminRole.id }] } } });
    const student = await tx.user.create({ data: { username: `green-student-${token}`, email: `green-student-${token}@example.test`, userRoles: { create: [{ roleId: studentRole.id }] } } });
    const year = await tx.academicYear.create({ data: { code: token.slice(0, 20), startsOn: new Date("2099-01-01"), endsOn: new Date("2099-12-31"), status: "ACTIVE" } });
    const service = loadTypeScript("../lib/green-star-work.ts", { "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (fn) => fn(tx) } } });
    const input = { userId: String(student.id), academicYearId: String(year.id), description: "Help faculty documents", requestId: randomUUID() };
    const first = await service.awardStandaloneGreenStar(input, actor.id);
    const retry = await service.awardStandaloneGreenStar(input, actor.id);
    assert.equal(first.id, retry.id);
    assert.equal(retry.replayed, true);
    assert.equal(await tx.starTransaction.count({ where: { userId: student.id, academicYearId: year.id } }), 1);
    assert.equal(await tx.auditLog.count({ where: { actorId: actor.id, action: "star.award_green_work" } }), 1);
    const helpers = loadTypeScript("../lib/helpers.ts", { "server-only": {}, "@/lib/audit": {}, "@/lib/prisma": { prisma: tx } });
    const summary = await helpers.getStudentStarSummary(student.id);
    assert.equal(summary.greenStars, 1);
    assert.equal(summary.helpersCount, 1);
    assert.equal(summary.totalStars, 1);
    const secondStudent = await tx.user.create({ data: { username: `green-student2-${token}`, email: `green-student2-${token}@example.test`, userRoles: { create: [{ roleId: studentRole.id }] } } });
    const bulkInput = { userIds: [String(student.id), String(secondStudent.id)], academicYearId: String(year.id), description: "Help prepare room together", requestId: randomUUID() };
    const bulk = await service.awardStandaloneGreenStars(bulkInput, actor.id);
    assert.deepEqual(bulk, { awarded: 2, replayed: false });
    assert.deepEqual(await service.awardStandaloneGreenStars({ ...bulkInput, userIds: [...bulkInput.userIds].reverse() }, actor.id), { awarded: 2, replayed: true });
    assert.equal(await tx.starTransaction.count({ where: { userId: student.id, academicYearId: year.id } }), 2);
    assert.equal(await tx.starTransaction.count({ where: { userId: secondStudent.id, academicYearId: year.id } }), 1);
    assert.equal(await tx.auditLog.count({ where: { actorId: actor.id, action: "star.award_green_work_bulk" } }), 1);
    await tx.academicYear.update({ where: { id: year.id }, data: { status: "CLOSED" } });
    await assert.rejects(service.awardStandaloneGreenStar({ ...input, requestId: randomUUID() }, actor.id), (error) => error.status === 409);
    await assert.rejects(service.awardStandaloneGreenStars({ ...bulkInput, requestId: randomUUID() }, actor.id), (error) => error.status === 409);
    assert.equal(await tx.starTransaction.count({ where: { userId: student.id } }), 2);
    throw rollback;
  }, { timeout: 20000 }), (error) => error === rollback);
});
