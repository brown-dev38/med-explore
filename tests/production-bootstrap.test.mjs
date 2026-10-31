import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { bootstrapProduction, productionBootstrapInput, PRODUCTION_PERMISSIONS, PRODUCTION_ROLES } from "../prisma/bootstrap-production.mjs";

const environment = {
  NODE_ENV: "production", DATABASE_URL: "mysql://fixture:fixture@localhost:3306/fixture",
  BOOTSTRAP_ADMIN_USERNAME: "production-admin", BOOTSTRAP_ADMIN_EMAIL: "ADMIN@EXAMPLE.TEST",
  BOOTSTRAP_ADMIN_PASSWORD: "long-unique-fixture-password",
};

function fixture({ users = [], auditFails = false, hashFails = false, createFails = false } = {}) {
  const state = { users, permissions: [], roles: [], assignments: [], audits: [], hashes: [] };
  const tx = {
    user: {
      findMany: async ({ where }) => state.users.filter((user) => user.username === where.OR[0].username || user.email.toLowerCase() === where.OR[1].email),
      create: async ({ data }) => {
        if (createFails) throw new Error("account creation failed");
        const stored = { id: 10n, ...data, userRoles: [{ roleId: data.userRoles.create.roleId, role: { name: "ADMIN" } }] };
        state.users.push(stored); return stored;
      },
    },
    permission: { upsert: async ({ where, create }) => {
      let stored = state.permissions.find((permission) => permission.code === where.code);
      if (!stored) { stored = { id: BigInt(state.permissions.length + 1), ...create }; state.permissions.push(stored); }
      return stored;
    } },
    role: { upsert: async ({ where, create }) => {
      let stored = state.roles.find((role) => role.name === where.name);
      if (!stored) { stored = { id: BigInt(state.roles.length + 1), ...create }; state.roles.push(stored); }
      return stored;
    } },
    rolePermission: { upsert: async ({ create }) => {
      if (!state.assignments.some((assignment) => assignment.roleId === create.roleId && assignment.permissionId === create.permissionId)) state.assignments.push(create);
    } },
    auditLog: { create: async ({ data }) => { if (auditFails) throw new Error("audit unavailable"); state.audits.push(data); } },
  };
  const prisma = { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    const snapshot = structuredClone(state);
    try { return await callback(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
  } };
  const hashPassword = async (password, rounds) => {
    if (hashFails) throw new Error("password hashing failed");
    state.hashes.push({ password, rounds }); return "hashed-bootstrap-password";
  };
  return { state, run: (input = productionBootstrapInput(environment)) => bootstrapProduction(prisma, input, hashPassword) };
}

test("production bootstrap rejects missing/default credentials without including secrets in errors", () => {
  for (const changes of [
    { NODE_ENV: "development" }, { DATABASE_URL: "" }, { BOOTSTRAP_ADMIN_USERNAME: "" },
    { BOOTSTRAP_ADMIN_EMAIL: "not-an-email" }, { BOOTSTRAP_ADMIN_PASSWORD: undefined },
    { BOOTSTRAP_ADMIN_PASSWORD: "short-password" }, { BOOTSTRAP_ADMIN_PASSWORD: "CHANGE_ME_TO_A_LONG_SECRET" },
    { BOOTSTRAP_ADMIN_PASSWORD: "REPLACE_ADMIN_PASSWORD" }, { BOOTSTRAP_ADMIN_USERNAME: "REPLACE_ADMIN_USERNAME" },
    { BOOTSTRAP_ADMIN_EMAIL: "REPLACE_ADMIN_EMAIL@example.test" },
    { BOOTSTRAP_ADMIN_PASSWORD: "ท".repeat(25) },
  ]) assert.throws(() => productionBootstrapInput({ ...environment, ...changes }), (error) => !error.message.includes(environment.DATABASE_URL) && !error.message.includes(environment.BOOTSTRAP_ADMIN_PASSWORD));
  const input = productionBootstrapInput(environment);
  assert.equal(input.email, "admin@example.test");
});

test("bootstrap normalizes identifiers while preserving the exact password including spaces", () => {
  const password = "  a-unique-production-password  ";
  const input = productionBootstrapInput({ ...environment,
    BOOTSTRAP_ADMIN_USERNAME: "  production-admin  ",
    BOOTSTRAP_ADMIN_EMAIL: "  ADMIN@EXAMPLE.TEST  ", BOOTSTRAP_ADMIN_PASSWORD: password,
  });
  assert.deepEqual(input, { username: "production-admin", email: "admin@example.test", password });
});

test("bootstrap enforces bcrypt's 72-byte limit for ASCII and Thai passwords and bounds identifiers", () => {
  for (const password of ["a".repeat(16), "a".repeat(72), "ท".repeat(24)]) {
    assert.equal(productionBootstrapInput({ ...environment, BOOTSTRAP_ADMIN_PASSWORD: password }).password, password);
  }
  for (const password of ["a".repeat(15), "a".repeat(73), "ท".repeat(25), " ".repeat(20)]) {
    assert.throws(() => productionBootstrapInput({ ...environment, BOOTSTRAP_ADMIN_PASSWORD: password }), /BOOTSTRAP_ADMIN_PASSWORD/);
  }
  assert.equal(productionBootstrapInput({ ...environment, BOOTSTRAP_ADMIN_USERNAME: "a".repeat(191) }).username.length, 191);
  assert.throws(() => productionBootstrapInput({ ...environment, BOOTSTRAP_ADMIN_USERNAME: "a".repeat(192) }), /BOOTSTRAP_ADMIN_USERNAME/);
  assert.throws(() => productionBootstrapInput({ ...environment, BOOTSTRAP_ADMIN_EMAIL: `${"a".repeat(180)}@example.test` }), /BOOTSTRAP_ADMIN_EMAIL/);
});

test("bootstrap grants each role only its intended permissions and links the new administrator to ADMIN", async () => {
  const api = fixture();
  await api.run();
  const assignedCodes = (name) => {
    const role = api.state.roles.find((entry) => entry.name === name);
    return api.state.assignments.filter((entry) => entry.roleId === role.id)
      .map((entry) => api.state.permissions.find((permission) => permission.id === entry.permissionId).code).sort();
  };
  assert.deepEqual(assignedCodes("ADMIN"), api.state.permissions.map((entry) => entry.code).sort());
  assert.deepEqual(assignedCodes("ORGANIZER"), ["academic_year.manage", "activity.manage", "attendance.record", "participation.review", "reward.manage", "star.approve", "survey.manage"]);
  assert.deepEqual(assignedCodes("STUDENT"), ["reward.redeem"]);
  const admin = api.state.roles.find((entry) => entry.name === "ADMIN");
  assert.equal(api.state.users[0].userRoles[0].roleId, admin.id);
  assert.equal(api.state.audits[0].actorId, api.state.users[0].id);
  assert.equal(api.state.audits[0].entityId, api.state.users[0].id);
});

test("bootstrap creates only permissions, roles and one ADMIN with a hashed password and no demo content", async () => {
  const api = fixture();
  assert.deepEqual(await api.run(), { created: true });
  assert.equal(api.state.permissions.length, PRODUCTION_PERMISSIONS.length);
  assert.equal(api.state.roles.length, PRODUCTION_ROLES.length);
  assert.equal(api.state.users.length, 1);
  assert.equal(api.state.users[0].username, environment.BOOTSTRAP_ADMIN_USERNAME);
  assert.equal(api.state.users[0].passwordHash, "hashed-bootstrap-password");
  assert.deepEqual(api.state.hashes, [{ password: environment.BOOTSTRAP_ADMIN_PASSWORD, rounds: 12 }]);
  assert.equal(api.state.audits[0].action, "user.bootstrap");
  assert.ok(!JSON.stringify(api.state.audits[0].details).includes(environment.BOOTSTRAP_ADMIN_PASSWORD));
});

test("repeat bootstrap preserves the existing ADMIN's credentials and does not duplicate users or assignments", async () => {
  const api = fixture();
  await api.run();
  const assignments = api.state.assignments.length;
  const changedPassword = { ...productionBootstrapInput(environment), password: "a-new-password-that-must-not-reset" };
  assert.deepEqual(await api.run(changedPassword), { created: false });
  assert.equal(api.state.users.length, 1);
  assert.equal(api.state.users[0].passwordHash, "hashed-bootstrap-password");
  assert.equal(api.state.hashes.length, 1);
  assert.equal(api.state.assignments.length, assignments);
  assert.equal(api.state.audits.length, 1);
});

test("bootstrap refuses conflicting identifiers, role escalation and reactivation without changing any data", async () => {
  const base = { id: 3n, username: "production-admin", email: "admin@example.test", isActive: true, passwordHash: "existing-hash", userRoles: [{ role: { name: "ADMIN" } }] };
  for (const users of [
    [{ ...base, username: "another-admin" }], [{ ...base, email: "another@example.test" }],
    [{ ...base, userRoles: [{ role: { name: "STUDENT" } }] }], [{ ...base, isActive: false }],
    [{ ...base, passwordHash: null }], [base, { ...base, id: 4n }],
    [{ ...base, userRoles: [] }],
    [{ ...base, userRoles: [{ role: { name: "ADMIN" } }, { role: { name: "STUDENT" } }] }],
  ]) {
    const api = fixture({ users });
    const before = structuredClone(api.state);
    await assert.rejects(api.run(), /conflicts|never changes/);
    assert.deepEqual(api.state, before);
  }
});

test("audit failure rolls back all bootstrap writes", async () => {
  const api = fixture({ auditFails: true });
  const before = structuredClone(api.state);
  await assert.rejects(api.run(), /audit unavailable/);
  assert.deepEqual(api.state, before);
});

test("password hashing and user creation failures leave no partially initialized production data", async () => {
  for (const options of [{ hashFails: true }, { createFails: true }]) {
    const api = fixture(options);
    const before = structuredClone(api.state);
    await assert.rejects(api.run(), /password hashing failed|account creation failed/);
    assert.deepEqual(api.state, before);
  }
});

test("development demo seed refuses production before connecting to the database", () => {
  const result = spawnSync(process.execPath, ["prisma/seed.ts"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:1/unused" },
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Demo seed is disabled in production/);
  assert.doesNotMatch(result.stdout, /Demo credentials/);
});
