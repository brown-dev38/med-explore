import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const historyRelations = ["organizedActivities", "participations", "recordedAttendance", "receivedStars", "approvedStars", "helperAssignments", "createdAssignments", "redemptions", "surveys", "auditLogs", "createdQrSessions"];

function route({ principal = { id: "1", roles: ["ADMIN"] }, history, reviewed = 0, targetRole = "STUDENT", remainingAdmins = 1, missingUser = false, validActor = true, failure } = {}) {
  const state = { userDeleted: false, rolesDeleted: false, audits: [], transactions: 0 };
  const tx = {
    user: {
      findFirst: async ({ where }) => {
        assert.equal(where.isActive, true);
        assert.equal(where.userRoles.some.role.name, "ADMIN");
        return validActor ? { id: 1n } : null;
      },
      findUnique: async () => missingUser ? null : {
        username: "target", email: "target@example.test", studentCode: "69001234",
        userRoles: [{ role: { name: targetRole } }],
        _count: Object.fromEntries(historyRelations.map((name) => [name, name === history ? 1 : 0])),
      },
      count: async () => remainingAdmins,
      delete: async () => { state.userDeleted = true; if (failure && failure !== "audit") throw { code: failure }; },
    },
    participation: { count: async () => reviewed },
    userRole: { deleteMany: async () => { state.rolesDeleted = true; } },
    auditLog: { create: async ({ data }) => { if (failure === "audit") throw new Error("Audit unavailable"); state.audits.push(data); } },
  };
  const prisma = { $transaction: async (fn, options) => {
    state.transactions++;
    assert.equal(options.isolationLevel, "Serializable");
    const snapshot = structuredClone(state);
    try { return await fn(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
  } };
  const deletion = loadTypeScript("../lib/admin-deletion.ts", { "server-only": {}, "@/lib/prisma": { prisma } });
  const api = loadTypeScript("../app/api/users/[id]/route.ts", {
    "@/lib/prisma": { prisma }, "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions, "@/lib/validation": {}, "@/lib/users": {},
    "@/lib/admin-deletion": deletion,
    "@/lib/api": {
      parseId: (value) => /^\d+$/.test(value) ? BigInt(value) : null,
      successResponse: (data) => Response.json({ success: true, data }),
      errorResponse: (message, status) => Response.json({ message }, { status }),
    },
  });
  return { state, remove: (id = "2") => api.DELETE(new Request(`http://localhost/api/users/${id}?isAdmin=true`, { method: "DELETE" }), { params: Promise.resolve({ id }) }) };
}

test("only ADMIN can delete users, even if another role has user.manage", async () => {
  for (const principal of [null, { id: "3", roles: ["STUDENT"] }, { id: "3", roles: ["ORGANIZER"], permissions: ["user.manage"] }]) {
    const api = route({ principal });
    assert.equal((await api.remove()).status, principal ? 403 : 401);
    assert.equal(api.state.transactions, 0);
  }
});

test("deleting an unused account removes its roles and records an audit", async () => {
  const api = route();
  const response = await api.remove();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { id: "2" });
  assert.equal(api.state.userDeleted, true);
  assert.equal(api.state.rolesDeleted, true);
  assert.equal(api.state.audits[0].action, "user.delete");
  assert.equal(api.state.audits[0].actorId, 1n);
  assert.deepEqual(api.state.audits[0].details.roles, ["STUDENT"]);
});

test("accounts with any activity, attendance, star, reward, QR, survey or audit history cannot be deleted", async () => {
  for (const history of historyRelations) {
    const api = route({ history });
    const response = await api.remove();
    assert.equal(response.status, 409, history);
    assert.match((await response.json()).message, /ปิดใช้งานบัญชีแทน/);
    assert.equal(api.state.userDeleted, false);
    assert.equal(api.state.rolesDeleted, false);
    assert.equal(api.state.audits.length, 0);
  }
});

test("review references without foreign keys also prevent deletion", async () => {
  const api = route({ reviewed: 1 });
  assert.equal((await api.remove()).status, 409);
  assert.equal(api.state.userDeleted, false);
});

test("an ADMIN cannot delete their own account", async () => {
  const api = route();
  assert.equal((await api.remove("1")).status, 409);
  assert.equal(api.state.transactions, 0);
});

test("the last active ADMIN cannot be deleted", async () => {
  const api = route({ targetRole: "ADMIN", remainingAdmins: 0 });
  assert.equal((await api.remove()).status, 409);
  assert.equal(api.state.userDeleted, false);
});

test("a stale ADMIN session cannot bypass the current database role or status", async () => {
  const api = route({ validActor: false });
  assert.equal((await api.remove()).status, 403);
  assert.equal(api.state.userDeleted, false);
});

test("invalid IDs and missing users return 404", async () => {
  const api = route();
  assert.equal((await api.remove("invalid")).status, 404);
  assert.equal(api.state.transactions, 0);
  assert.equal((await route({ missingUser: true }).remove()).status, 404);
});

test("audit failures, new foreign keys, and concurrent changes roll deletion back", async () => {
  for (const [failure, status] of [["audit", 500], ["P2003", 409], ["P2034", 409], ["P2025", 404]]) {
    const api = route({ failure });
    assert.equal((await api.remove()).status, status);
    assert.equal(api.state.userDeleted, false);
    assert.equal(api.state.rolesDeleted, false);
    assert.equal(api.state.audits.length, 0);
  }
});
