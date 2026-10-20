import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

dotenv.config({ quiet: true });
// Opt in against a running local server; never use existing user credentials.
const origin = process.env.PASSWORD_HTTP_TEST_ORIGIN;
const db = origin && process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });

function client(base) {
  const jar = new Map();
  return async (pathname, method = "GET", body) => new Promise((resolve, reject) => {
    const url = new URL(pathname, base);
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(url, {
      method,
      // The development HTTPS certificate is self-signed. Only loopback is allowed below.
      rejectUnauthorized: false,
      headers: {
        Origin: base.origin, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        ...(body ? { "Content-Type": body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json" } : {}),
      },
    }, (response) => {
      for (const cookie of response.headers["set-cookie"] ?? []) {
        const first = cookie.split(";")[0], split = first.indexOf("=");
        jar.set(first.slice(0, split), first.slice(split + 1));
      }
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        let json;
        try { json = JSON.parse(raw); } catch { /* HTML errors must fail status/JSON assertions. */ }
        resolve({ status: response.statusCode, json, location: response.headers.location });
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error("Local password HTTP test timed out")));
    req.on("error", reject);
    if (body) req.write(body instanceof URLSearchParams ? body.toString() : JSON.stringify(body));
    req.end();
  });
}

test("live HTTP: all roles change passwords and sign out, and ADMIN resets other accounts", { skip: !db, timeout: 90000 }, async () => {
  const base = new URL(origin);
  assert.ok(["http:", "https:"].includes(base.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Only a local development server may be tested");
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname), "Only a local test database may be used");
  const fixtures = [];
  async function login(user, password) {
    const request = client(base);
    const csrf = await request("/api/auth/csrf");
    assert.equal(csrf.status, 200);
    assert.equal(typeof csrf.json?.csrfToken, "string");
    await request("/api/auth/callback/credentials", "POST", new URLSearchParams({
      csrfToken: csrf.json.csrfToken, username: user.username, password, callbackUrl: "/", json: "true",
    }));
    const session = await request("/api/auth/session");
    assert.equal(session.status, 200);
    return { request, userId: session.json?.user?.id };
  }
  try {
    for (const roleName of ["ADMIN", "ORGANIZER", "STUDENT"]) {
      const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
      const marker = `password-http-${randomUUID()}`;
      const oldPassword = `old-${randomUUID()}`, newPassword = `new-${randomUUID()}`;
      const user = await db.user.create({ data: {
        username: marker, email: `${marker}@example.test`, passwordHash: await bcrypt.hash(oldPassword, 10),
        userRoles: { create: { roleId: role.id } },
      } });
      fixtures.push({ user, roleName, newPassword });
      const authenticated = await login(user, oldPassword);
      assert.equal(authenticated.userId, String(user.id));
      const response = await authenticated.request("/api/users/me/password", "PATCH", { currentPassword: oldPassword, password: newPassword, confirmPassword: newPassword });
      assert.equal(response.status, 200, `${roleName}: self password change failed`);
      assert.deepEqual(response.json?.data, { changed: true });
      assert.equal(await bcrypt.compare(newPassword, (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash), true);
      assert.notEqual((await login(user, oldPassword)).userId, String(user.id));
      const newSession = await login(user, newPassword);
      assert.equal(newSession.userId, String(user.id));
      assert.equal(await db.auditLog.count({ where: { actorId: user.id, action: "user.password.change" } }), 1);
      const csrf = await newSession.request("/api/auth/csrf");
      const signedOut = await newSession.request("/api/auth/signout", "POST", new URLSearchParams({ csrfToken: csrf.json.csrfToken, callbackUrl: "/", json: "true" }));
      assert.equal(signedOut.status, 200);
      assert.equal(typeof signedOut.json?.url, "string");
      assert.equal((await newSession.request("/api/auth/session")).json?.user?.id, undefined);
      const workspace = roleName === "ADMIN" ? "/admin/profile" : roleName === "ORGANIZER" ? "/organizer/profile" : "/dashboard/profile";
      const protectedPage = await newSession.request(workspace);
      assert.ok([302, 303, 307, 308].includes(protectedPage.status));
      assert.equal(new URL(protectedPage.location, base).pathname, "/login");
    }
    const admin = fixtures.find((item) => item.roleName === "ADMIN");
    const adminSession = await login(admin.user, admin.newPassword);
    for (const target of fixtures.filter((item) => item.roleName !== "ADMIN")) {
      const resetPassword = `reset-${randomUUID()}`;
      const response = await adminSession.request(`/api/users/${target.user.id}/password`, "PATCH", { password: resetPassword, confirmPassword: resetPassword });
      assert.equal(response.status, 200, `${target.roleName}: admin password reset failed`);
      assert.equal((await login(target.user, resetPassword)).userId, String(target.user.id));
      assert.notEqual((await login(target.user, target.newPassword)).userId, String(target.user.id));
    }
  } finally {
    const ids = fixtures.map((item) => item.user.id);
    if (ids.length) await db.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { actorId: { in: ids } } });
      await tx.microsoftLinkIntent.deleteMany({ where: { userId: { in: ids } } });
      await tx.userRole.deleteMany({ where: { userId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
  }
});
