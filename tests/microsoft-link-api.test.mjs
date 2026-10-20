import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const config = loadTypeScript("../lib/microsoft-config.ts");
const apiResponses = loadTypeScript("../lib/api.ts");
const permissions = loadTypeScript("../lib/permissions.ts");
function endpoint({ user = { id: "7", roles: ["STUDENT"] }, enabled = true, passwordError = false } = {}) {
  const calls = [];
  class MicrosoftAccountError extends Error { constructor() { super("password"); this.code = "password"; this.status = 403; } }
  const route = loadTypeScript("../app/api/auth/microsoft-link/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: { microsoftAccount: { findUnique: async (query) => { calls.push(query); return { label: "member@university.test", linkedAt: new Date("2026-10-20T00:00:00Z") }; } } } },
    "@/lib/api": apiResponses, "@/lib/permissions": permissions,
    "@/lib/request-origin": loadTypeScript("../lib/request-origin.ts"),
    "@/lib/microsoft-config": { ...config, getMicrosoftConfig: () => enabled ? {} : null },
    "@/lib/microsoft-accounts": { MicrosoftAccountError,
      prepareMicrosoftLink: async (...args) => { calls.push(args); if (passwordError) throw new MicrosoftAccountError(); return "random-one-time-token"; },
      unlinkMicrosoftAccount: async (...args) => calls.push(args),
    },
  });
  return { ...route, calls };
}
function request(method, body = {}, origin = "https://portal.test") {
  return new Request("https://portal.test/api/auth/microsoft-link", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function canonical(t) {
  const old = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "https://portal.test";
  t.after(() => { if (old === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = old; });
}

test("link status requires authentication, reads only the caller, and returns no tokens or identity keys", async (t) => {
  canonical(t);
  assert.equal((await endpoint({ user: null }).GET()).status, 401);
  const api = endpoint();
  const response = await api.GET();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(api.calls[0], { where: { userId: 7n }, select: { label: true, linkedAt: true } });
  assert.deepEqual((await response.json()).data, { enabled: true, account: { label: "member@university.test", linkedAt: "2026-10-20T00:00:00.000Z" } });
  const disabled = endpoint({ enabled: false });
  assert.deepEqual((await (await disabled.GET()).json()).data, { enabled: false, account: null });
  assert.equal(disabled.calls.length, 0);
});

test("link and unlink reject cross-origin, anonymous, and missing-password requests before mutation", async (t) => {
  canonical(t);
  const api = endpoint();
  for (const method of ["POST", "DELETE"]) {
    assert.equal((await api[method](request(method, { password: "pass" }, "https://attacker.test"))).status, 403);
    assert.equal((await api[method](request(method))).status, 400);
    assert.equal((await endpoint({ user: null })[method](request(method, { password: "pass" }))).status, 401);
  }
  assert.equal(api.calls.length, 0);
  assert.equal((await endpoint({ enabled: false }).POST(request("POST", { password: "pass" }))).status, 503);
  process.env.NEXTAUTH_URL = "https://canonical.test";
  assert.equal((await api.POST(request("POST", { password: "pass" }))).status, 409);
});

test("link uses the session user, requires correct password, and sets a short-lived HttpOnly cookie", async (t) => {
  canonical(t);
  const api = endpoint();
  const response = await api.POST(request("POST", { password: "pass", userId: "999" }));
  assert.equal(response.status, 200);
  assert.deepEqual(api.calls, [["7", "pass"]]);
  const cookie = response.cookies.get(config.MICROSOFT_LINK_COOKIE);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/api/auth");
  assert.equal(cookie.maxAge, 600);
  const result = await response.json();
  assert.equal(result.data.callbackUrl, "/dashboard/profile?microsoft=linked");
  assert.equal(JSON.stringify(result).includes("random-one-time-token"), false);
  const wrong = await endpoint({ passwordError: true }).POST(request("POST", { password: "wrong" }));
  assert.equal(wrong.status, 403);
  assert.equal(wrong.headers.get("set-cookie"), null);
});

test("ordinary Microsoft login clears abandoned link cookies; unlink also clears them", async (t) => {
  canonical(t);
  const api = endpoint({ user: null });
  const response = await api.POST(request("POST", { action: "login" }));
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get(config.MICROSOFT_LINK_COOKIE).maxAge, 0);
  assert.equal(api.calls.length, 0);
  const own = endpoint();
  const unlinked = await own.DELETE(request("DELETE", { password: "pass", userId: "999" }));
  assert.equal(unlinked.cookies.get(config.MICROSOFT_LINK_COOKIE).maxAge, 0);
  assert.deepEqual(own.calls, [["7", "pass"]]);
});

test("Microsoft link requests accept a canonical HTTPS origin behind a reverse proxy", async (t) => {
  canonical(t);
  const api = endpoint();
  const response = await api.POST(new Request("http://internal:3000/api/auth/microsoft-link", {
    method: "POST", headers: { Origin: "https://portal.test", Host: "internal:3000", "X-Forwarded-Host": "portal.test", "X-Forwarded-Proto": "https", "Content-Type": "application/json" },
    body: JSON.stringify({ password: "pass" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(api.calls, [["7", "pass"]]);
});

test("OAuth callback always clears the link cookie, including failed and cancelled callbacks", async () => {
  const route = loadTypeScript("../app/api/auth/[...nextauth]/route.ts", {
    "next-auth": () => async () => new Response(null, { status: 302, headers: { Location: "/login?error=OAuthCallback", "Set-Cookie": "next-auth.state=; Max-Age=0" } }),
    "@/lib/auth": { authOptions: {} }, "@/lib/microsoft-config": config,
  });
  const response = await route.GET({}, { params: Promise.resolve({ nextauth: ["callback", "azure-ad"] }) });
  assert.match(response.headers.get("set-cookie"), /medexplore\.microsoft-link=; Path=\/api\/auth; HttpOnly; SameSite=Lax; Max-Age=0/);
  assert.match(response.headers.get("set-cookie"), /next-auth.state/);
});

test("client starts OAuth through CSRF-protected POST, sanitizes callback, and preserves linking cookies only for linking", async (t) => {
  const old = globalThis.window;
  globalThis.window = { location: { origin: "https://portal.test" } };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith("csrf") ? { csrfToken: "csrf-token" } : { url: "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize" });
  });
  const client = loadTypeScript("../lib/auth-client.ts");
  await client.getMicrosoftSignInUrl("//attacker.test");
  assert.deepEqual(calls.map((call) => call.url), ["/api/auth/microsoft-link", "/api/auth/csrf", "/api/auth/signin/azure-ad"]);
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.body.get("csrfToken"), "csrf-token");
  assert.equal(calls[2].options.body.get("callbackUrl"), "/");
  calls.length = 0;
  await client.getMicrosoftSignInUrl("/dashboard/profile", true);
  assert.deepEqual(calls.map((call) => call.url), ["/api/auth/csrf", "/api/auth/signin/azure-ad"]);
});
