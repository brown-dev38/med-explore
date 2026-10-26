import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { loadTypeScript } from "./load-typescript.mjs";

const validation = loadTypeScript("../lib/validation.ts");
const input = { username: "new-student", email: "NEW@example.test", password: "Test@1234", studentCode: " 69001234 ", firstname: " สมชาย ", lastname: " ใจดี " };

function route({ duplicateField, missingRole = false, createError } = {}) {
  const state = { users: [], transactions: 0, roleQueries: [] };
  const tx = {
    user: {
      findFirst: async ({ where }) => where.OR.some((condition) => duplicateField in condition) ? { id: 2n } : null,
      create: async ({ data }) => {
        state.users.push(data);
        if (createError) throw { code: createError };
        return { id: 3n };
      },
    },
    role: { findUnique: async ({ where }) => {
      state.roleQueries.push(where);
      return missingRole ? null : { id: 4n, name: "STUDENT" };
    } },
  };
  const api = loadTypeScript("../app/api/register/route.ts", {
    "@/lib/validation": validation,
    "@/lib/prisma": { prisma: { $transaction: async (fn) => {
      state.transactions++;
      try { return await fn(tx); } catch (error) { state.users.length = 0; throw error; }
    } } },
  });
  return {
    state,
    post: (body) => api.POST(new Request("http://localhost/api/register", { method: "POST", body: JSON.stringify(body) })),
    postRaw: (body) => api.POST(new Request("http://localhost/api/register", { method: "POST", body })),
  };
}

test("public registration requires a nonblank student code of at most 50 characters", async () => {
  for (const studentCode of [undefined, null, "", "  ", 69001234, {}, "1".repeat(51)]) {
    const api = route();
    assert.equal((await api.post({ ...input, studentCode })).status, 400);
    assert.equal(api.state.transactions, 0);
    assert.equal(api.state.users.length, 0);
  }
});

test("public registration requires nonblank first and last names of at most 191 characters", async () => {
  for (const field of ["firstname", "lastname"]) {
    for (const value of [undefined, null, "", "  ", 123, {}, "ก".repeat(192)]) {
      const api = route();
      const response = await api.post({ ...input, [field]: value });
      assert.equal(response.status, 400);
      if (value === undefined || value === null || value === "" || value === "  ") {
        assert.equal((await response.json()).message, field === "firstname" ? "กรุณาระบุชื่อจริง" : "กรุณาระบุนามสกุล");
      }
      assert.equal(api.state.transactions, 0);
      assert.equal(api.state.users.length, 0);
    }
  }
});

test("malformed registration bodies are rejected without writes", async () => {
  for (const body of ["{", "null", "[]"]) {
    const api = route();
    assert.equal((await api.postRaw(body)).status, 400);
    assert.equal(api.state.transactions, 0);
  }
});

test("public registration always assigns only STUDENT and hashes passwords", async () => {
  const api = route();
  const response = await api.post({ ...input, roles: ["ADMIN", "ORGANIZER"], role: "ADMIN", isActive: false });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { success: true, message: "ลงทะเบียนสำเร็จเรียบร้อย", userId: "3" });
  assert.deepEqual(api.state.roleQueries, [{ name: "STUDENT" }]);
  const created = api.state.users[0];
  assert.equal(created.studentCode, "69001234");
  assert.equal(created.firstname, "สมชาย");
  assert.equal(created.lastname, "ใจดี");
  assert.equal(created.email, "new@example.test");
  assert.equal(created.isActive, true);
  assert.deepEqual(created.userRoles, { create: [{ roleId: 4n }] });
  assert.equal(created.roles, undefined);
  assert.ok(await bcrypt.compare(input.password, created.passwordHash));
});

test("duplicate usernames, emails, and student codes return 409 without creating accounts", async () => {
  for (const duplicateField of ["username", "email", "studentCode"]) {
    const api = route({ duplicateField });
    assert.equal((await api.post(input)).status, 409);
    assert.equal(api.state.users.length, 0);
  }
});

test("a missing STUDENT role prevents account creation", async () => {
  const api = route({ missingRole: true });
  assert.equal((await api.post(input)).status, 500);
  assert.equal(api.state.users.length, 0);
});

test("write conflicts roll back account and role creation and return 409", async () => {
  for (const createError of ["P2002", "P2034"]) {
    const api = route({ createError });
    assert.equal((await api.post(input)).status, 409);
    assert.equal(api.state.users.length, 0);
  }
});

test("ADMIN can still create staff accounts without student codes", () => {
  const { studentCode, ...staffInput } = input;
  assert.equal(typeof studentCode, "string");
  assert.equal(validation.userCreateSchema.safeParse({ ...staffInput, roles: ["ORGANIZER"] }).success, true);
  assert.equal(validation.studentRegisterSchema.safeParse(staffInput).success, false);
});
