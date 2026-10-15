import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

test("account checks reject missing, inactive, and malformed account IDs", async () => {
  let active = true;
  let calls = 0;
  const status = loadTypeScript("../lib/account-status.ts", {
    "@/lib/prisma": { prisma: { user: { findUnique: async () => { calls++; return active === null ? null : { isActive: active }; } } } },
  });
  for (const id of [undefined, null, "", "invalid", "-1", 1]) assert.equal(await status.isActiveAccount(id), false);
  assert.equal(calls, 0);
  assert.equal(await status.isActiveAccount("1"), true);
  assert.equal(await status.getAccountStatus("1"), "ACTIVE");
  active = false;
  assert.equal(await status.isActiveAccount("1"), false);
  assert.equal(await status.getAccountStatus("1"), "SUSPENDED");
  active = null;
  assert.equal(await status.isActiveAccount("1"), false);
  assert.equal(await status.getAccountStatus("1"), "DELETED");
  assert.equal(await status.getAccountStatus(undefined), "UNAUTHENTICATED");
});

function authCallbacks(active) {
  return loadTypeScript("../lib/auth.ts", {
    "@/lib/prisma": {},
    "@/lib/account-status": { getAccountStatus: async () => active === true ? "ACTIVE" : active === false ? "SUSPENDED" : "DELETED" },
    "next-auth": { getServerSession: async () => null },
    "next-auth/providers/credentials": (options) => options,
  }).authOptions.callbacks;
}

test("deleted or inactive accounts lose their user ID and permissions in existing sessions", async () => {
  const callbacks = authCallbacks(false);
  const token = await callbacks.jwt({ token: { uid: "2", role: "ADMIN", roles: ["ADMIN"], permissions: ["user.manage"] } });
  const session = await callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.id, "");
  assert.equal(session.user.role, null);
  assert.deepEqual(session.user.roles, []);
  assert.deepEqual(session.user.permissions, []);
  assert.equal(session.accountStatus, "SUSPENDED");
  const nextToken = await callbacks.jwt({ token });
  assert.equal(nextToken.accountStatus, "SUSPENDED");
});

test("active accounts keep their session", async () => {
  const token = { uid: "2", role: "STUDENT", roles: ["STUDENT"], permissions: [], accountStatus: "ACTIVE" };
  assert.deepEqual(await authCallbacks(true).jwt({ token: { ...token } }), token);
});

test("deleted accounts retain a distinct reason after permissions are removed", async () => {
  const callbacks = authCallbacks(null);
  const token = await callbacks.jwt({ token: { uid: "2", roles: ["STUDENT"] } });
  const session = await callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.id, "");
  assert.equal(session.accountStatus, "DELETED");
});

test("stale session cookies cannot trap deleted users in login redirects", async () => {
  const permissions = loadTypeScript("../lib/permissions.ts");
  const { proxy } = loadTypeScript("../proxy.ts", {
    "next-auth/jwt": { getToken: async () => ({ uid: "2", roles: ["STUDENT"] }) },
    "@/lib/permissions": permissions,
    "@/lib/account-status": { isActiveAccount: async () => false },
  });
  for (const pathname of ["/login", "/register", "/"]) {
    const response = await proxy({
      nextUrl: { pathname }, url: `http://localhost${pathname}`,
      cookies: { getAll: () => ["next-auth.session-token.0", "next-auth.session-token.1", "__Secure-next-auth.session-token", "next-auth.csrf-token"].map((name) => ({ name })) },
    });
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.cookies.getAll().length, 3);
    assert.ok(response.cookies.getAll().every((cookie) => cookie.expires.getTime() === 0));
  }
});
