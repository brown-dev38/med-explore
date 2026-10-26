import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { loadTypeScript } from "./load-typescript.mjs";

const validation = loadTypeScript("../lib/password-validation.ts");
const permissions = loadTypeScript("../lib/permissions.ts");
const apiResponses = loadTypeScript("../lib/api.ts");
function route({ actor = { id: "1", roles: ["ADMIN"] }, currentAdmin = true, roles = ["STUDENT"], missing = false, auditFails = false, conflict = false } = {}) {
  const state = { passwordHash: "old-hash", writes: 0, hashes: 0, audits: [] };
  const target = () => ({ id: 2n, userRoles: roles.map((name) => ({ role: { name } })) });
  const tx = {
    user: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: 1n, isActive: true, userRoles: { some: { role: { name: "ADMIN" } } } });
        return currentAdmin ? { id: 1n } : null;
      },
      findUnique: async ({ where }) => { assert.equal(where.id, 2n); return missing ? null : target(); },
      update: async ({ where, data }) => {
        assert.equal(where.id, 2n);
        assert.deepEqual(Object.keys(data), ["passwordHash"]);
        state.passwordHash = data.passwordHash; state.writes++;
      },
    },
    auditLog: { create: async ({ data }) => { if (auditFails) throw new Error("Audit failed"); state.audits.push(data); } },
  };
  const api = loadTypeScript("../app/api/users/[id]/password/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => actor }, "@/lib/permissions": permissions,
    "@/lib/password-validation": validation, "@/lib/api": apiResponses,
    "@/lib/request-origin": loadTypeScript("../lib/request-origin.ts"),
    bcrypt: { hash: async (value, rounds) => { state.hashes++; return bcrypt.hash(value, rounds); } },
    "@/lib/prisma": { prisma: { $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      if (conflict) throw Object.assign(new Error("Conflict"), { code: "P2034" });
      const snapshot = structuredClone(state);
      try { return await fn(tx); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    } } },
  });
  return { state, patch: (body = { password: "new-password", confirmPassword: "new-password" }, { id = "2", origin = "http://localhost", raw, headers = {} } = {}) => api.PATCH(new Request("http://localhost/api/users/"+id+"/password", {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...headers }, body: raw ?? JSON.stringify(body),
  }), { params: Promise.resolve({ id }) }) };
}

test("only authenticated ADMIN can reset passwords, including callers with user.manage", async () => {
  for (const actor of [null, { id: "1", roles: ["STUDENT"], permissions: ["user.manage"] }, { id: "1", roles: ["ORGANIZER"], permissions: ["user.manage"] }]) {
    const api = route({ actor });
    assert.equal((await api.patch()).status, actor ? 403 : 401);
    assert.equal(api.state.hashes, 0);
    assert.equal(api.state.writes, 0);
  }
  const stale = route({ currentAdmin: false });
  assert.equal((await stale.patch()).status, 403);
  assert.equal(stale.state.hashes, 0);
});

test("ADMIN password resets accept LAN and HTTPS reverse proxy requests without trusting a different origin", async () => {
  for (const options of [
    { origin: "http://192.168.1.49:3000", headers: { Host: "192.168.1.49:3000" } },
    { origin: "https://portal.example.test", headers: { Host: "internal:3000", "X-Forwarded-Host": "portal.example.test", "X-Forwarded-Proto": "https" } },
  ]) {
    const api = route();
    assert.equal((await api.patch(undefined, options)).status, 200);
    const crossSite = route();
    assert.equal((await crossSite.patch(undefined, { ...options, origin: "https://attacker.test" })).status, 403);
    assert.equal(crossSite.state.hashes, 0);
  }
});

test("password resets hash a new local password for STUDENT and ORGANIZER without returning or auditing secrets", async () => {
  for (const role of ["STUDENT", "ORGANIZER"]) {
    const api = route({ roles: [role] });
    const response = await api.patch();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { success: true, data: { id: "2" } });
    assert.notEqual(api.state.passwordHash, "new-password");
    assert.equal(await bcrypt.compare("new-password", api.state.passwordHash), true);
    assert.equal(await bcrypt.compare("old-password", api.state.passwordHash), false);
    assert.equal(api.state.writes, 1);
    assert.deepEqual(api.state.audits, [{ actorId: 1n, action: "user.password.reset", entityType: "User", entityId: 2n, details: { role } }]);
  }
});

test("ADMIN, unknown, roleless, and mixed-role targets cannot use this reset endpoint", async () => {
  for (const roles of [["ADMIN"], [], ["UNKNOWN"], ["ADMIN", "STUDENT"], ["ORGANIZER", "STUDENT"]]) {
    const api = route({ roles });
    assert.equal((await api.patch()).status, 403);
    assert.equal(api.state.hashes, 0);
    assert.equal(api.state.writes, 0);
  }
});

test("invalid passwords, mismatched confirmation, malformed payloads and unexpected fields never write", async () => {
  for (const body of [null, [], {}, { password: "short", confirmPassword: "short" }, { password: "new-password", confirmPassword: "other" }, { password: "new-password" }, { password: "x".repeat(73), confirmPassword: "x".repeat(73) }, { password: "ก".repeat(25), confirmPassword: "ก".repeat(25) }, { password: "new-password", confirmPassword: "new-password", roles: ["ADMIN"] }]) {
    const api = route();
    assert.equal((await api.patch(body)).status, 400);
    assert.equal(api.state.hashes, 0);
    assert.equal(api.state.writes, 0);
  }
  assert.equal((await route().patch(undefined, { raw: "{" })).status, 400);
  const api = route();
  const password = "ก".repeat(24);
  assert.equal((await api.patch({ password, confirmPassword: password })).status, 200);
  assert.equal(await bcrypt.compare(password, api.state.passwordHash), true);
});

test("requests must be same-origin and targets must be valid database IDs", async () => {
  for (const origin of ["https://attacker.test", "", "null"]) {
    const api = route();
    assert.equal((await api.patch(undefined, { origin })).status, 403);
    assert.equal(api.state.hashes, 0);
  }
  for (const id of ["0", "-1", "abc", "01", "9223372036854775808", "9".repeat(100)]) {
    const api = route();
    assert.equal((await api.patch(undefined, { id })).status, 404);
    assert.equal(api.state.hashes, 0);
  }
  assert.equal((await route({ missing: true }).patch()).status, 404);
});

test("audit failure rolls the password back; concurrent edits return a retry response", async () => {
  const api = route({ auditFails: true });
  assert.equal((await api.patch()).status, 500);
  assert.equal(api.state.passwordHash, "old-hash");
  assert.equal(api.state.writes, 0);
  assert.equal(api.state.audits.length, 0);
  assert.equal((await route({ conflict: true }).patch()).status, 409);
});

test("user DTO never exposes stored passwords or hashes to the admin UI", () => {
  const { toUserDto } = loadTypeScript("../lib/users.ts", { "server-only": {} });
  const dto = toUserDto({ id: 2n, username: "student", password: "not-a-real-password", passwordHash: "private-hash", email: "student@example.test", createdAt: new Date(), userRoles: [] });
  assert.equal("password" in dto, false);
  assert.equal("passwordHash" in dto, false);
});
