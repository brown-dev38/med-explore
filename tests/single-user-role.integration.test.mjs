import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });

test("the database rejects a second role and permits replacing the existing role", { skip: !db }, async () => {
  const rollback = new Error("ROLLBACK_ROLE_TEST_FIXTURES");
  // All fixtures and role changes are rolled back; existing users are untouched.
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const first = await tx.role.create({ data: { name: `test-a-${token}` } });
    const second = await tx.role.create({ data: { name: `test-b-${token}` } });
    const user = await tx.user.create({ data: {
      username: `test-${token}`, email: `${token}@example.test`,
      userRoles: { create: [{ roleId: first.id }] },
    } });
    await assert.rejects(tx.userRole.create({ data: { userId: user.id, roleId: second.id } }), (error) => error.code === "P2002");
    assert.equal(await tx.userRole.count({ where: { userId: user.id } }), 1);
    await tx.userRole.upsert({ where: { userId: user.id }, update: { roleId: second.id }, create: { userId: user.id, roleId: second.id } });
    const assignments = await tx.userRole.findMany({ where: { userId: user.id } });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].roleId, second.id);
    throw rollback;
  }, { timeout: 15000 }), (error) => error === rollback);
});
