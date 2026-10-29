import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const cookies = loadTypeScript("../lib/auth-cookies.ts");

test("production credentials cookies use a dedicated namespace with valid __Host options; development defaults stay intact", () => {
  const config = cookies.getAuthCookies("production");
  assert.equal(config.sessionToken.name, "__Host-medexplore.session-token");
  assert.equal(config.csrfToken.name, "__Host-medexplore.csrf-token");
  assert.equal(config.callbackUrl.name, "__Host-medexplore.callback-url");
  for (const cookie of Object.values(config)) {
    assert.deepEqual(cookie.options, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
    assert.equal(cookie.options.domain, undefined);
  }
  assert.equal(cookies.getAuthCookies("development"), undefined);
  assert.equal(cookies.getAuthCookies("test"), undefined);
  assert.equal(cookies.isAuthSessionCookie("next-auth.session-token.0", "development"), true);
  assert.equal(cookies.isAuthSessionCookie("__Host-medexplore.session-token.0", "production"), true);
  assert.equal(cookies.isAuthSessionCookie("__Host-medexplore.session-token.other", "production"), false);
  assert.equal(cookies.isAuthSessionCookie("__Secure-next-auth.session-token", "production"), false);
});

test("production auth and proxy share the session name and account rejection clears only this application's secure cookie chunks", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => previous === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = previous);
  const { authOptions } = loadTypeScript("../lib/auth.ts", {
    "@/lib/auth-cookies": cookies, "@/lib/prisma": {}, "@/lib/account-status": {}, "@/lib/auth-user": {},
    "next-auth": { getServerSession: async () => null }, "next-auth/providers/credentials": (options) => options,
  });
  const tokenOptions = [];
  const { proxy } = loadTypeScript("../proxy.ts", {
    "@/lib/auth-cookies": cookies,
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/lib/account-status": { isActiveAccount: async () => false },
    "next-auth/jwt": { getToken: async (options) => { tokenOptions.push(options); return { uid: "2", roles: ["STUDENT"] }; } },
  });
  const request = {
    nextUrl: { pathname: "/login" }, url: "https://example.test:8443/login",
    cookies: { getAll: () => [
      authOptions.cookies.sessionToken.name, `${authOptions.cookies.sessionToken.name}.0`,
      `${authOptions.cookies.sessionToken.name}.1`, "__Secure-next-auth.session-token",
      "__Host-medexplore.csrf-token", "other-project.session-token",
    ].map((name) => ({ name })) },
  };
  const response = await proxy(request);
  assert.equal(tokenOptions[0].cookieName, authOptions.cookies.sessionToken.name);
  assert.equal(response.cookies.getAll().length, 3);
  for (const cleared of response.cookies.getAll()) {
    assert.ok(cleared.name.startsWith(authOptions.cookies.sessionToken.name));
    assert.equal(cleared.expires.getTime(), 0);
    assert.equal(cleared.secure, true);
    assert.equal(cleared.path, "/");
  }
});
