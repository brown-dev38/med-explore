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

test("the full edit payload suspends an account and still permits role changes against MySQL", { skip: !db }, async () => {
  const rollback = new Error("ROLLBACK_ACCOUNT_STATUS_FIXTURES");
  // Always roll back; no existing project account is suspended or changed.
  await assert.rejects(db.$transaction(async (tx) => {
    const token = randomUUID();
    const student = await tx.role.findUniqueOrThrow({ where: { name: "STUDENT" } });
    const actor = await tx.user.create({ data: { username: `actor-${token}`, email: `actor-${token}@example.test` } });
    const user = await tx.user.create({ data: {
      username: `target-${token}`, email: `target-${token}@example.test`,
      userRoles: { create: [{ roleId: student.id }] },
    } });
    const api = loadTypeScript("../app/api/users/[id]/route.ts", {
      "@/lib/prisma": { prisma: { $transaction: (fn) => fn(tx) } },
      "@/lib/dal": { getCurrentUser: async () => ({ id: String(actor.id), roles: ["ADMIN"], permissions: ["user.manage"] }) },
      "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
      "@/lib/validation": loadTypeScript("../lib/validation.ts"),
      "@/lib/users": loadTypeScript("../lib/users.ts", { "server-only": {} }),
      "@/lib/admin-deletion": {},
      "@/lib/api": loadTypeScript("../lib/api.ts"),
    });
    const patch = (body) => api.PATCH(new Request(`http://localhost/api/users/${user.id}`, {
      method: "PATCH", body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: String(user.id) }) });
    const response = await patch({ firstname: "Test", lastname: "Student", studentCode: "", isActive: false, roles: ["STUDENT"] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.isActive, false);
    assert.equal((await tx.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, false);
    assert.equal((await tx.userRole.findUniqueOrThrow({ where: { userId: user.id }, include: { role: true } })).role.name, "STUDENT");
    assert.equal((await patch({ isActive: true, roles: ["ORGANIZER"] })).status, 200);
    assert.equal(await tx.userRole.count({ where: { userId: user.id } }), 1);
    assert.equal((await tx.userRole.findUniqueOrThrow({ where: { userId: user.id }, include: { role: true } })).role.name, "ORGANIZER");
    assert.equal(await tx.auditLog.count({ where: { entityId: user.id, action: "user.update" } }), 2);
    throw rollback;
  }, { timeout: 20000 }), (error) => error === rollback);
});
