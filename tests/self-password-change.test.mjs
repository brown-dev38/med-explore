import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { loadTypeScript } from "./load-typescript.mjs";

const validation = loadTypeScript("../lib/password-validation.ts");
const responses = loadTypeScript("../lib/api.ts");
const oldHash = await bcrypt.hash("old-password", 10);
const valid = { currentPassword: "old-password", password: "new-password", confirmPassword: "new-password" };

function route({ actor = { id: "7", roles: ["STUDENT"], permissions: [] }, active = true, missing = false, passwordHash = oldHash, auditFails = false, conflict = false } = {}) {
  const state = { passwordHash, writes: 0, hashes: 0, queries: 0, intents: 1, audits: [] };
  const tx = {
    user: {
      findUnique: async ({ where }) => { state.queries++; assert.deepEqual(where, { id: 7n }); return missing ? null : { isActive: active, passwordHash: state.passwordHash }; },
      update: async ({ where, data }) => {
        assert.deepEqual(where, { id: 7n });
        assert.deepEqual(Object.keys(data), ["passwordHash"]);
        state.passwordHash = data.passwordHash; state.writes++;
      },
    },
    microsoftLinkIntent: { deleteMany: async ({ where }) => { assert.deepEqual(where, { userId: 7n }); state.intents = 0; } },
    auditLog: { create: async ({ data }) => { if (auditFails) throw new Error("Audit unavailable"); state.audits.push(data); } },
  };
  const { PATCH } = loadTypeScript("../app/api/users/me/password/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => actor }, "@/lib/password-validation": validation, "@/lib/api": responses,
    "@/lib/request-origin": loadTypeScript("../lib/request-origin.ts"),
    bcrypt: { compare: bcrypt.compare, hash: async (...args) => { state.hashes++; return bcrypt.hash(...args); } },
    "@/lib/prisma": { prisma: { $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      if (conflict) throw Object.assign(new Error("Conflict"), { code: "P2034" });
      const snapshot = structuredClone(state);
      try { return await fn(tx); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    } } },
  });
  return { state, patch: (body = valid, { origin = "http://localhost", raw, headers = {} } = {}) => PATCH(new Request("http://localhost/api/users/me/password", {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...headers }, body: raw ?? JSON.stringify(body),
  })) };
}

test("every role can change only their own password without user.manage permission", async () => {
  for (const role of ["ADMIN", "ORGANIZER", "STUDENT"]) {
    const api = route({ actor: { id: "7", roles: [role], permissions: [] } });
    const response = await api.patch();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { success: true, data: { changed: true } });
    assert.equal(await bcrypt.compare("new-password", api.state.passwordHash), true);
    assert.equal(await bcrypt.compare("old-password", api.state.passwordHash), false);
    assert.equal(api.state.writes, 1);
    assert.equal(api.state.intents, 0);
    assert.deepEqual(api.state.audits, [{ actorId: 7n, action: "user.password.change", entityType: "User", entityId: 7n }]);
  }
});

test("self-service password changes accept the browser's LAN host and public HTTPS proxy origin", async () => {
  for (const options of [
    { origin: "http://192.168.1.49:3000", headers: { Host: "192.168.1.49:3000" } },
    { origin: "https://10.51.209.8:3000", headers: { Host: "10.51.209.8:3000", "X-Forwarded-Host": "10.51.209.8:3000", "X-Forwarded-Proto": "https" } },
    { origin: "https://portal.example.test", headers: { Host: "internal:3000", "X-Forwarded-Host": "portal.example.test", "X-Forwarded-Proto": "https" } },
  ]) {
    const api = route();
    assert.equal((await api.patch(valid, options)).status, 200);
    assert.equal(api.state.writes, 1);
    const crossSite = route();
    assert.equal((await crossSite.patch(valid, { ...options, origin: "https://attacker.test" })).status, 403);
    assert.equal(crossSite.state.queries, 0);
  }
});

test("wrong current password, disabled or deleted users, and accounts without a local password never change data", async () => {
  for (const [options, body, status] of [
    [{}, { ...valid, currentPassword: "incorrect-password" }, 403],
    [{ active: false }, valid, 401], [{ missing: true }, valid, 401], [{ passwordHash: null }, valid, 400],
  ]) {
    const api = route(options);
    const before = api.state.passwordHash;
    assert.equal((await api.patch(body)).status, status);
    assert.equal(api.state.passwordHash, before);
    assert.equal(api.state.hashes, 0);
    assert.equal(api.state.writes, 0);
    assert.equal(api.state.intents, 1);
    assert.equal(api.state.audits.length, 0);
  }
});

test("anonymous and cross-origin requests fail before querying any account", async () => {
  const anonymous = route({ actor: null });
  assert.equal((await anonymous.patch()).status, 401);
  assert.equal(anonymous.state.queries, 0);
  for (const origin of ["https://attacker.test", "", "null"]) {
    const api = route();
    assert.equal((await api.patch(valid, { origin })).status, 403);
    assert.equal(api.state.queries, 0);
  }
});

test("invalid confirmation, weak or overlong new passwords, and client-supplied user IDs or roles are rejected", async () => {
  for (const body of [null, [], {},
    { ...valid, currentPassword: "" }, { ...valid, currentPassword: "x".repeat(1025) },
    { ...valid, password: "short", confirmPassword: "short" }, { ...valid, confirmPassword: "mismatch" },
    { ...valid, password: "x".repeat(73), confirmPassword: "x".repeat(73) },
    { ...valid, password: "ก".repeat(25), confirmPassword: "ก".repeat(25) },
    { ...valid, password: "old-password", confirmPassword: "old-password" },
    { ...valid, userId: "999" }, { ...valid, roles: ["ADMIN"] },
  ]) {
    const api = route();
    assert.equal((await api.patch(body)).status, 400);
    assert.equal(api.state.queries, 0);
    assert.equal(api.state.hashes, 0);
  }
  assert.equal((await route().patch(undefined, { raw: "{" })).status, 400);
});

test("password change accepts a 72-byte UTF-8 password and preserves spaces exactly", async () => {
  for (const password of ["ก".repeat(24), "  new-password  "]) {
    const api = route();
    assert.equal((await api.patch({ ...valid, password, confirmPassword: password })).status, 200);
    assert.equal(await bcrypt.compare(password, api.state.passwordHash), true);
    if (password.startsWith(" ")) assert.equal(await bcrypt.compare(password.trim(), api.state.passwordHash), false);
  }
});

test("a legacy password truncated by bcrypt cannot be reused as a supposedly different new password", async () => {
  const password = "x".repeat(72);
  const api = route({ passwordHash: await bcrypt.hash(password, 10) });
  assert.equal((await api.patch({ currentPassword: password+"legacy-suffix", password, confirmPassword: password })).status, 400);
  assert.equal(api.state.writes, 0);
});

test("audit failure rolls back the password and pending link intents; concurrent changes return 409", async () => {
  const api = route({ auditFails: true });
  assert.equal((await api.patch()).status, 500);
  assert.equal(api.state.passwordHash, oldHash);
  assert.equal(api.state.writes, 0);
  assert.equal(api.state.intents, 1);
  assert.equal(api.state.audits.length, 0);
  assert.equal((await route({ conflict: true }).patch()).status, 409);
});
