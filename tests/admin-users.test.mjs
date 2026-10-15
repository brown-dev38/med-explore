import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const users = loadTypeScript("../lib/users.ts", { "server-only": {} });
const input = { username: "new-student", email: "NEW@example.test", password: "Test@1234", roles: ["STUDENT"] };

function route({ principal = { id: "1", roles: ["ADMIN"] }, duplicate = false, roleMissing = false, auditFails = false } = {}) {
  const state = { users: [], audits: [], transactions: 0 };
  const tx = {
    user: {
      findFirst: async () => duplicate ? { id: 2n } : null,
      create: async ({ data }) => {
        const result = { id: 3n, ...data, createdAt: new Date(), userRoles: data.userRoles.create.map(({ roleId }) => ({ role: { name: roleId === 1n ? "ADMIN" : "STUDENT" } })) };
        state.users.push(result);
        return result;
      },
    },
    role: { findMany: async ({ where }) => roleMissing ? [] : where.name.in.map((name) => ({ id: name === "ADMIN" ? 1n : 2n, name })) },
    auditLog: { create: async ({ data }) => { if (auditFails) throw new Error("audit unavailable"); state.audits.push(data); } },
  };
  const api = loadTypeScript("../app/api/users/route.ts", {
    "@/lib/prisma": { prisma: { $transaction: async (fn) => {
      state.transactions++;
      try { return await fn(tx); } catch (error) { state.users.length = 0; state.audits.length = 0; throw error; }
    } } },
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions,
    "@/lib/validation": validation,
    "@/lib/users": users,
    "@/lib/api": {
      successResponse: (data, status = 200) => Response.json({ success: true, data }, { status }),
      errorResponse: (message, status) => Response.json({ message }, { status }),
    },
  });
  return { state, post: (body) => api.POST(new Request("http://localhost/api/users", { method: "POST", body: JSON.stringify(body) })) };
}

test("creating users requires ADMIN even when another role has user.manage permission", async () => {
  for (const principal of [null, { id: "2", roles: ["STUDENT"] }, { id: "2", roles: ["ORGANIZER"], permissions: ["user.manage"] }]) {
    const api = route({ principal });
    assert.equal((await api.post(input)).status, principal ? 403 : 401);
    assert.equal(api.state.transactions, 0);
  }
});

test("admin user validation rejects invalid roles, email, and passwords", async () => {
  for (const change of [{ roles: [] }, { roles: ["ADMIN", "STUDENT"] }, { roles: ["STUDENT", "STUDENT"] }, { roles: ["UNKNOWN"] }, { email: "invalid" }, { password: "123" }, { username: " " }]) {
    const api = route();
    assert.equal((await api.post({ ...input, ...change })).status, 400);
    assert.equal(api.state.transactions, 0);
  }
});

test("admin creation hashes the password, creates roles and audit together, and returns a safe DTO", async () => {
  const api = route();
  const response = await api.post({ ...input, roles: ["ADMIN"] });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.email, "new@example.test");
  assert.deepEqual(data.roles, ["ADMIN"]);
  assert.equal(data.passwordHash, undefined);
  assert.equal(data.password, undefined);
  assert.ok(await bcrypt.compare(input.password, api.state.users[0].passwordHash));
  assert.equal(api.state.audits[0].action, "user.create");
  assert.ok(!JSON.stringify(api.state.audits[0].details).includes(input.password));
});

test("duplicates and missing roles do not create partial users", async () => {
  for (const [options, status] of [[{ duplicate: true }, 409], [{ roleMissing: true }, 400]]) {
    const api = route(options);
    assert.equal((await api.post(input)).status, status);
    assert.equal(api.state.users.length, 0);
    assert.equal(api.state.audits.length, 0);
  }
});

test("an audit failure returns an error and rolls user creation back", async () => {
  const api = route({ auditFails: true });
  assert.equal((await api.post(input)).status, 500);
  assert.equal(api.state.users.length, 0);
});

test("active ADMIN count is global even when the user list is filtered and paginated", async () => {
  const api = loadTypeScript("../app/api/users/route.ts", {
    "@/lib/prisma": { prisma: { user: {
      count: async ({ where }) => {
        if (where.isActive === true) {
          assert.deepEqual(where, { isActive: true, userRoles: { some: { role: { name: "ADMIN" } } } });
          return 1;
        }
        assert.equal(where.userRoles.some.role.name, "STUDENT");
        assert.ok(where.OR.length > 0);
        return 0;
      },
      findMany: async () => [],
    } } },
    "@/lib/dal": { getCurrentUser: async () => ({ id: "1", roles: ["ADMIN"], permissions: ["user.manage"] }) },
    "@/lib/permissions": permissions,
    "@/lib/validation": validation,
    "@/lib/users": users,
    "@/lib/api": { successResponse: (data) => Response.json({ success: true, data }) },
  });
  const response = await api.GET(new Request("http://localhost/api/users?q=student&role=STUDENT&page=2&pageSize=1"));
  const { data } = await response.json();
  assert.equal(data.activeAdminCount, 1);
  assert.equal(data.total, 0);
  assert.equal(data.page, 2);
});
