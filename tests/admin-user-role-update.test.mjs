import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const validation = loadTypeScript("../lib/validation.ts");
const permissions = loadTypeScript("../lib/permissions.ts");
const users = loadTypeScript("../lib/users.ts", { "server-only": {} });

function route({ principal = { id: "1", roles: ["ADMIN"], permissions: ["user.manage"] }, currentRole = "STUDENT", remainingActiveAdmins = 0, currentActive = true, missingRole = false, missingUser = false, auditFails = false } = {}) {
  const state = { role: currentRole, firstname: "Original", isActive: currentActive, roleWrites: 0, writes: 0, transactions: 0, audits: [] };
  const dto = () => ({ id: 2n, username: "test-user", email: "test@example.test", isActive: state.isActive, firstname: state.firstname, createdAt: new Date(), userRoles: state.role ? [{ role: { name: state.role } }] : [] });
  const tx = {
    user: {
      findUnique: async () => missingUser ? null : dto(),
      count: async ({ where }) => {
        assert.deepEqual(where, { id: { not: 2n }, isActive: true, userRoles: { some: { role: { name: "ADMIN" } } } });
        return remainingActiveAdmins;
      },
      update: async ({ data }) => {
        state.writes++;
        if (data.firstname !== undefined) state.firstname = data.firstname;
        if (data.isActive !== undefined) state.isActive = data.isActive;
        return dto();
      },
    },
    role: { findUnique: async ({ where }) => missingRole ? null : { id: where.name === "ADMIN" ? 1n : 3n, name: where.name } },
    userRole: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.userId, 2n);
        if (!state.role) return { count: 0 };
        state.role = data.roleId === 1n ? "ADMIN" : "ORGANIZER";
        state.roleWrites++;
        state.writes++;
        return { count: 1 };
      },
      create: async ({ data }) => {
        assert.equal(data.userId, 2n);
        state.role = data.roleId === 1n ? "ADMIN" : "ORGANIZER";
        state.roleWrites++;
        state.writes++;
      },
    },
    auditLog: { create: async ({ data }) => { if (auditFails) throw new Error("Audit unavailable"); state.audits.push(data); } },
  };
  const api = loadTypeScript("../app/api/users/[id]/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/validation": validation,
    "@/lib/permissions": permissions,
    "@/lib/users": users,
    "@/lib/admin-deletion": {},
    "@/lib/api": {
      parseId: (id) => /^\d+$/.test(id) ? BigInt(id) : null,
      successResponse: (data) => Response.json({ success: true, data }),
      errorResponse: (message, status) => Response.json({ message }, { status }),
    },
    "@/lib/prisma": { prisma: { $transaction: async (fn, options) => {
      state.transactions++;
      assert.equal(options.isolationLevel, "Serializable");
      const snapshot = structuredClone(state);
      try { return await fn(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
    } } },
  });
  return { state, patch: (body) => api.PATCH(new Request("http://localhost/api/users/2", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "2" }) }) };
}

test("editing roles requires authentication and user.manage permission", async () => {
  for (const principal of [null, { id: "3", roles: ["STUDENT"], permissions: [] }]) {
    const api = route({ principal });
    assert.equal((await api.patch({ roles: ["ADMIN"] })).status, principal ? 403 : 401);
    assert.equal(api.state.transactions, 0);
  }
});

test("editing rejects empty, multiple, repeated, and unknown roles before writing", async () => {
  for (const roles of [[], ["ADMIN", "STUDENT"], ["ADMIN", "ADMIN"], ["UNKNOWN"], null, "ADMIN"]) {
    const api = route();
    assert.equal((await api.patch({ roles })).status, 400);
    assert.equal(api.state.transactions, 0);
  }
});

test("changing role replaces the existing assignment and records the resulting role", async () => {
  const api = route();
  const response = await api.patch({ roles: ["ORGANIZER"] });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.roles, ["ORGANIZER"]);
  assert.equal(api.state.role, "ORGANIZER");
  assert.deepEqual(api.state.audits[0].details.roles, ["ORGANIZER"]);
});

test("editing profile fields without roles preserves the current role", async () => {
  const api = route();
  const response = await api.patch({ firstname: "Updated" });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.roles, ["STUDENT"]);
  assert.equal(api.state.firstname, "Updated");
  assert.equal(api.state.writes, 1);
});

test("the last ADMIN cannot be changed to another role", async () => {
  const api = route({ currentRole: "ADMIN" });
  assert.equal((await api.patch({ roles: ["ORGANIZER"] })).status, 409);
  assert.equal(api.state.role, "ADMIN");
  assert.equal(api.state.writes, 0);
});

test("an ADMIN can change roles when another ADMIN remains", async () => {
  const api = route({ currentRole: "ADMIN", remainingActiveAdmins: 1 });
  assert.equal((await api.patch({ roles: ["ORGANIZER"] })).status, 200);
  assert.equal(api.state.role, "ORGANIZER");
});

test("missing users and missing role configuration do not change assignments", async () => {
  for (const [options, status] of [[{ missingUser: true }, 404], [{ missingRole: true }, 400]]) {
    const api = route(options);
    assert.equal((await api.patch({ roles: ["ORGANIZER"] })).status, status);
    assert.equal(api.state.writes, 0);
  }
});

test("a failed audit rolls back the role change and profile update", async () => {
  const api = route({ auditFails: true });
  assert.equal((await api.patch({ roles: ["ORGANIZER"], firstname: "Changed" })).status, 500);
  assert.equal(api.state.role, "STUDENT");
  assert.equal(api.state.firstname, "Original");
  assert.equal(api.state.writes, 0);
});

test("users cannot deactivate their own account even when other active ADMINs exist", async () => {
  const api = route({ principal: { id: "2", roles: ["ADMIN"], permissions: ["user.manage"] }, currentRole: "ADMIN", remainingActiveAdmins: 2 });
  assert.equal((await api.patch({ isActive: false, firstname: "Changed" })).status, 409);
  assert.equal(api.state.isActive, true);
  assert.equal(api.state.firstname, "Original");
  assert.equal(api.state.transactions, 0);
});

test("the last active ADMIN cannot be deactivated with or without a roles payload", async () => {
  for (const change of [{ isActive: false }, { isActive: false, roles: ["ADMIN"] }, { isActive: false, roles: ["ORGANIZER"] }]) {
    const api = route({ currentRole: "ADMIN" });
    assert.equal((await api.patch(change)).status, 409);
    assert.equal(api.state.isActive, true);
    assert.equal(api.state.role, "ADMIN");
    assert.equal(api.state.writes, 0);
    assert.equal(api.state.audits.length, 0);
  }
});

test("another ADMIN can be deactivated when an active ADMIN remains", async () => {
  const api = route({ currentRole: "ADMIN", remainingActiveAdmins: 1 });
  const response = await api.patch({ isActive: false });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.isActive, false);
  assert.equal(api.state.audits[0].details.isActive, false);
});

test("ordinary user accounts can still be deactivated", async () => {
  const api = route();
  assert.equal((await api.patch({ isActive: false })).status, 200);
  assert.equal(api.state.isActive, false);
});

test("the last active ADMIN can still update their profile without disabling their account", async () => {
  const api = route({ principal: { id: "2", roles: ["ADMIN"], permissions: ["user.manage"] }, currentRole: "ADMIN" });
  assert.equal((await api.patch({ firstname: "Updated", isActive: true, roles: ["ADMIN"] })).status, 200);
  assert.equal(api.state.firstname, "Updated");
  assert.equal(api.state.isActive, true);
});

test("inactive accounts can be reactivated", async () => {
  const api = route({ currentActive: false });
  assert.equal((await api.patch({ isActive: true })).status, 200);
  assert.equal(api.state.isActive, true);
});

test("an audit failure rolls account deactivation back", async () => {
  const api = route({ auditFails: true });
  assert.equal((await api.patch({ isActive: false })).status, 500);
  assert.equal(api.state.isActive, true);
  assert.equal(api.state.writes, 0);
});

test("the full edit form can deactivate a user without rewriting the unchanged STUDENT role", async () => {
  const api = route({ missingRole: true });
  const response = await api.patch({ firstname: "Updated", lastname: "Student", studentCode: "", isActive: false, roles: ["STUDENT"] });
  assert.equal(response.status, 200);
  assert.equal(api.state.isActive, false);
  assert.equal(api.state.firstname, "Updated");
  assert.equal(api.state.roleWrites, 0);
  assert.equal(api.state.writes, 1);
  assert.equal(api.state.audits.length, 1);
});

test("a roleless account can be assigned one role without an upsert unique selector", async () => {
  const api = route({ currentRole: null });
  assert.equal((await api.patch({ roles: ["ORGANIZER"] })).status, 200);
  assert.equal(api.state.role, "ORGANIZER");
  assert.equal(api.state.roleWrites, 1);
});
